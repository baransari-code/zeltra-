import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  fetchReal1YearData,
  fetchRealHourlyHistory,
  fetchReal15mHistory,
  fetchRealFinancialNews,
  generate24HourPredictions,
  extractNewsSentimentForAsset,
  fetchLiveUsdTryRate,
} from './marketService';
import {
  computeMultiHorizonForecast,
  computeProChartSeries,
} from './quantForecastEngine';
import {
  loadTestState,
  executeValidationCycle,
} from './forecastValidator';
import {
  loadOrInitAutonomousLedger,
  executeAutonomousTradingTick,
  toggleAutonomousBot,
  resetAutonomousBot,
  resetAutonomousBotCleanZero,
} from './autonomousTrader';
import {
  executeManualTradingTick,
  handleManualTestHttpRequest,
} from './manualTrader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

const PORT = process.env.PORT || 3000;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // 0. API: Sistem Sağlık Kontrolü (/api/health)
  if (pathname === '/api/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        status: 'OK',
        service: 'ZELTRA-QUANT-ENGINE',
        uptimeSec: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // 1. API: Gerçek Borsa Verisi
  if (pathname === '/api/real-data') {
    try {
      const symbol = urlObj.searchParams.get('symbol') || 'EUR/USD';
      const data = await fetchReal1YearData(symbol);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'Bilinmeyen hata' }));
    }
    return;
  }

  // 1b. API: Gerçek 24 Saatlik Haber Akışı
  if (pathname === '/api/real-news') {
    try {
      const news = await fetchRealFinancialNews();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(news));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'Haber akışı alınamadı' }));
    }
    return;
  }

  // 1c. API: Canlı USD/TRY Kur Uç Noktası
  if (pathname === '/api/live-fx-rate') {
    try {
      const usdTry = await fetchLiveUsdTryRate();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ usdTry }));
    } catch {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ usdTry: 38.55 }));
    }
    return;
  }

  // 2. API: 24 Saatlik Kantitatif Rota & Haber Adaptasyonu
  if (pathname === '/api/hourly-forecast') {
    try {
      const symbol = urlObj.searchParams.get('symbol') || 'EUR/USD';
      const hours = parseInt(urlObj.searchParams.get('hours') || '24', 10);
      const digitsParam = urlObj.searchParams.get('digits');

      const [marketData, newsList, hourlyBars, bars15m] = await Promise.all([
        fetchReal1YearData(symbol),
        fetchRealFinancialNews(),
        fetchRealHourlyHistory(symbol).catch(() => []),
        fetchReal15mHistory(symbol).catch(() => []),
      ]);

      const newsContext = extractNewsSentimentForAsset(symbol, newsList);

      let digits = 4;
      if (digitsParam !== null && !isNaN(parseInt(digitsParam, 10))) {
        digits = parseInt(digitsParam, 10);
      } else if (
        marketData.price > 20 ||
        symbol.includes('JPY') ||
        symbol.includes('TRY') ||
        symbol.includes('XAU') ||
        symbol.includes('XAG') ||
        symbol.includes('XPT') ||
        symbol.includes('XPD') ||
        symbol.includes('BRENT') ||
        symbol.includes('WTI')
      ) {
        digits = 2;
      }

      const predictions = generate24HourPredictions(
        marketData.price,
        marketData.candles,
        digits,
        hours,
        newsContext,
        hourlyBars,
        bars15m
      );

      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          symbol: marketData.symbol,
          currentPrice: marketData.price,
          change24h: marketData.change24h,
          digits,
          baselineTime: new Date().toISOString(),
          newsContext,
          predictions,
        })
      );
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'Tahmin üretilemedi' }));
    }
    return;
  }

  // 2b. API: Profesyonel Mum Grafik, Çok-Katmanlı İndikatörler & Tahmin Konisi (/api/pro-chart)
  if (pathname === '/api/pro-chart') {
    try {
      const symbol = urlObj.searchParams.get('symbol') || 'BTC/USD';
      const tfParam = urlObj.searchParams.get('tf') || '1h';
      const tf = tfParam === '15m' || tfParam === '1d' ? tfParam : '1h';
      const digitsParam = urlObj.searchParams.get('digits');

      const [marketData, newsList, hourlyBars, bars15m, ledgerState] = await Promise.all([
        fetchReal1YearData(symbol),
        fetchRealFinancialNews().catch(() => []),
        fetchRealHourlyHistory(symbol).catch(() => []),
        fetchReal15mHistory(symbol).catch(() => []),
        loadOrInitAutonomousLedger().catch(() => null),
      ]);

      const newsContext = extractNewsSentimentForAsset(symbol, newsList);
      const price = marketData.price;

      let digits = 4;
      if (digitsParam !== null && !isNaN(parseInt(digitsParam, 10))) {
        digits = parseInt(digitsParam, 10);
      } else if (
        price < 0.2
      ) {
        digits = 5;
      } else if (price < 5 && (symbol.includes('XRP') || symbol.includes('ADA') || symbol.includes('DOGE'))) {
        digits = 4;
      } else if (
        price >= 20 ||
        symbol.includes('JPY') ||
        symbol.includes('TRY') ||
        symbol.includes('XAU') ||
        symbol.includes('XAG') ||
        symbol.includes('NAS') ||
        symbol.includes('SPX') ||
        symbol.includes('WTI') ||
        symbol.includes('BRENT')
      ) {
        digits = 2;
      }

      const rawDaily = (marketData.candles || []).map((c: any) => ({
        timestamp: c.timestamp || Date.now(),
        open: c.open ?? c.close,
        high: c.high ?? c.close,
        low: c.low ?? c.close,
        close: c.close,
        volume: c.volume ?? 0,
      }));

      const chartSource =
        tf === '15m' && bars15m.length >= 25
          ? bars15m
          : tf === '1d'
          ? rawDaily
          : hourlyBars.length >= 25
          ? hourlyBars
          : rawDaily;

      const candles = computeProChartSeries(chartSource, digits, 80, tf !== '1d');
      const forecast = computeMultiHorizonForecast(
        hourlyBars.length >= 25 ? hourlyBars : rawDaily,
        bars15m.length >= 25 ? bars15m : null,
        price,
        digits,
        newsContext,
        1.0,
        24
      );

      const activeTrade = ledgerState?.openPositions?.find((p) => p.symbol === symbol);
      const scannerRow = ledgerState?.marketScanner?.find((s) => s.symbol === symbol);

      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          symbol,
          tf,
          digits,
          currentPrice: price,
          change24h: marketData.change24h,
          changePercent24h: marketData.changePercent24h,
          candles,
          forecast,
          newsContext,
          activeTrade: activeTrade
            ? {
                direction: activeTrade.direction,
                entryPrice: activeTrade.entryPrice,
                stopLoss: activeTrade.stopLoss,
                takeProfit1: activeTrade.takeProfit1,
                takeProfit2: activeTrade.takeProfit2,
                totalPnL_TRY: activeTrade.totalPnL_TRY,
                entryTimeframe: activeTrade.entryTimeframe || '1H',
              }
            : null,
          scannerRow: scannerRow || null,
          generatedAt: new Date().toISOString(),
        })
      );
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'Pro grafik verisi üretilemedi' }));
    }
    return;
  }

  // 3. API: 4 Günlük Doğrulama Testi
  if (pathname === '/api/forecast-validation') {
    try {
      const triggerTick = urlObj.searchParams.get('tick') === 'true';
      const state = triggerTick ? await executeValidationCycle() : loadTestState();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(state));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'Doğrulama verisi okunamadı' }));
    }
    return;
  }

  // 3b. API: 250.000 TL Otonom Canlı İşlem Motoru (/test sayfası API'si)
  if (pathname === '/api/autonomous-test') {
    try {
      const action = urlObj.searchParams.get('action') || 'status';
      let state;
      if (action === 'tick' || action === 'scan') {
        state = await executeAutonomousTradingTick(true);
      } else if (action === 'toggle') {
        const running = urlObj.searchParams.get('running') === 'true' || urlObj.searchParams.get('state') === 'start';
        state = await toggleAutonomousBot(running);
      } else if (action === 'reset') {
        state = await resetAutonomousBot(250000);
      } else if (action === 'reset-zero') {
        state = await resetAutonomousBotCleanZero(250000);
      } else {
        state = await executeAutonomousTradingTick(false);
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(state));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'Otonom işlem motoru hatası' }));
    }
    return;
  }

  // 3c. API: 250.000 TL Manuel IBKR Arena & Sen vs Bot Yarışı (/test2 & /ttest2 API'si)
  if (pathname === '/api/manual-test') {
    await handleManualTestHttpRequest(req, res);
    return;
  }

  // 4. STATİK DOSYA SUNUMU (SPA - React Frontend; /test dahil tüm rotaları index.html'e yönlendir + Path Traversal Koruması)
  const safeRelPath = pathname.replace(/^\/+/, '');
  let filePath = path.resolve(DIST_DIR, safeRelPath);
  if (!filePath.startsWith(DIST_DIR) || pathname === '/' || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    if (ext === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

// Sunucuyu başlat
server.listen(PORT, () => {
  console.log(`[ZELTRA 7/24 Sunucu] Port ${PORT} üzerinde aktif.`);
  console.log(`[ZELTRA 7/24 Sunucu] 4 Günlük Doğrulama Testi ve 250.000 TL Otonom İşlem Motoru arka plan döngüsü başlatıldı.`);

  // İlk tetikleme ve periyodik otomatik kontrol
  setTimeout(() => {
    executeValidationCycle().catch(console.error);
    loadOrInitAutonomousLedger().then(() => executeAutonomousTradingTick(false)).catch(console.error);
  }, 2000);
  setInterval(() => {
    executeValidationCycle().catch(console.error);
  }, 30 * 60 * 1000);
  setInterval(() => {
    executeAutonomousTradingTick(false).catch(console.error);
    executeManualTradingTick(false).catch(console.error);
  }, 10 * 1000);
});

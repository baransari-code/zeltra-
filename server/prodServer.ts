import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  fetchReal1YearData,
  fetchRealFinancialNews,
  generate24HourPredictions,
  extractNewsSentimentForAsset,
} from './marketService';
import {
  loadTestState,
  executeValidationCycle,
} from './forecastValidator';

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

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
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

  // 2. API: 24 Saatlik Kantitatif Rota & Haber Adaptasyonu
  if (pathname === '/api/hourly-forecast') {
    try {
      const symbol = urlObj.searchParams.get('symbol') || 'EUR/USD';
      const hours = parseInt(urlObj.searchParams.get('hours') || '24', 10);
      const digitsParam = urlObj.searchParams.get('digits');

      const [marketData, newsList] = await Promise.all([
        fetchReal1YearData(symbol),
        fetchRealFinancialNews(),
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

      const predictions = generate24HourPredictions(marketData.price, marketData.candles, digits, hours, newsContext);

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

  // 4. STATİK DOSYA SUNUMU (SPA - React Frontend)
  let filePath = path.join(DIST_DIR, pathname);
  if (pathname === '/' || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

// Sunucuyu başlat
server.listen(PORT, () => {
  console.log(`[ZELTRA 7/24 Sunucu] Port ${PORT} üzerinde aktif.`);
  console.log(`[ZELTRA 7/24 Sunucu] 4 Günlük Doğrulama Testi arka plan döngüsü başlatıldı.`);

  // İlk tetikleme ve her 30 dakikada bir otomatik kontrol
  setTimeout(() => {
    executeValidationCycle().catch(console.error);
  }, 2000);
  setInterval(() => {
    executeValidationCycle().catch(console.error);
  }, 30 * 60 * 1000);
});

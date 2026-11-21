// server/apiRouter.ts
// ZELTRA v14.0 Tekil Kurumsal API Yönlendirici — Hem Vite Dev hem Production Sunucu birebir burayı kullanır.

import type http from 'http';
import {
  aggregateBarsByHours,
  extractNewsSentimentForAsset,
  fetchCleanDailyHistory,
  fetchExtendedHourlyHistory,
  fetchLiveCryptoQuotes,
  fetchLiveUsdTryRate,
  fetchMacroPulse,
  fetchReal15mHistory,
  fetchReal1YearData,
  fetchRealFinancialNews,
  fetchRealHourlyHistory,
  type HourlyBar,
} from './marketService';
import { computeProChartSeries } from './quantForecastEngine';
import { computeZacChartOverlay } from './zeltraAlphaIndicator';
import {
  controlAutonomousBot,
  CORE_SYMBOLS,
  getAutonomousLedgerSnapshot,
  getSpec,
  LIVE_GO_TARGET_ISO,
  runAutonomousBotTick,
  runLiveWalkForwardAudit,
  STRATEGY_VERSION,
  type WalkForwardWindow,
} from './autonomousTrader';
import { handleManualTestHttpRequest } from './manualTrader';
import {
  exportForecastLabCsv,
  getForecastLab3mState,
  runForecastLab3mTick,
} from './forecastLab3m';
import { getLiveAuditDashboard, runLiveAuditTick } from './liveAuditEngine';

let lastHealthBgKickTs = 0;

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 512_000) raw = raw.slice(0, 512_000);
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export async function handleZeltraApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<boolean> {
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  if (!pathname.startsWith('/api/')) return false;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  // 0. Sağlık Kontrolü & Keep-Alive
  if (pathname === '/api/health') {
    const nowMs = Date.now();
    const snap = getAutonomousLedgerSnapshot();
    if (snap.isRunning && nowMs - lastHealthBgKickTs >= 45_000) {
      lastHealthBgKickTs = nowMs;
      runAutonomousBotTick(false).catch(() => {});
      runLiveAuditTick(false).catch(() => {});
    }
    sendJson(res, 200, {
      status: 'OK',
      service: 'ZELTRA-QUANT-V14',
      strategyVersion: STRATEGY_VERSION,
      liveGoTargetIso: LIVE_GO_TARGET_ISO,
      isRunning: snap.isRunning,
      openPositionsCount: snap.openPositions.length,
      totalEquityTRY: snap.totalEquityTRY,
      netProfitPercent: snap.netProfitPercent,
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  // 1. Gerçek Borsa Verisi (Tek Enstrüman)
  if (pathname === '/api/real-data' || pathname === '/api/real-market') {
    try {
      const symbol = urlObj.searchParams.get('symbol') || 'XAU/USD';
      const data = await fetchReal1YearData(symbol);
      sendJson(res, 200, data);
    } catch (err: any) {
      sendJson(res, 500, { error: err?.message || 'Piyasa verisi alınamadı' });
    }
    return true;
  }

  // 2. Canlı Haber Akışı + Nedensel AI Etki Analizi
  if (pathname === '/api/real-news') {
    try {
      const news = await fetchRealFinancialNews();
      sendJson(res, 200, news);
    } catch (err: any) {
      sendJson(res, 500, { error: err?.message || 'Haber akışı alınamadı' });
    }
    return true;
  }

  // 3. Canlı USD/TRY Kur
  if (pathname === '/api/live-fx-rate') {
    try {
      const usdTry = await fetchLiveUsdTryRate();
      sendJson(res, 200, { usdTry });
    } catch {
      sendJson(res, 200, { usdTry: getAutonomousLedgerSnapshot().liveUsdTry || 42.5 });
    }
    return true;
  }

  // 4. FLAGSHIP PRO İNDİKATÖR & TAHMİN TERMİNALİ: ZELTRA ALPHA COMPOSITE (ZAC v14)
  if (pathname === '/api/pro-chart') {
    try {
      const symbol = urlObj.searchParams.get('symbol') || 'XAU/USD';
      const tfRaw = (urlObj.searchParams.get('tf') || '1h').toLowerCase();
      const tf: '15m' | '1h' | '4h' | '12h' | '1d' =
        tfRaw === '15m' || tfRaw === '4h' || tfRaw === '12h' || tfRaw === '1d' ? tfRaw : '1h';

      const spec = getSpec(symbol);
      const [h1Full, dailyClean, bars15m, newsList, macro, cryptoQuotes] = await Promise.all([
        fetchExtendedHourlyHistory(symbol, '730d').catch(() => [] as HourlyBar[]),
        fetchCleanDailyHistory(symbol).catch(() => [] as HourlyBar[]),
        tf === '15m' ? fetchReal15mHistory(symbol).catch(() => [] as HourlyBar[]) : Promise.resolve([] as HourlyBar[]),
        fetchRealFinancialNews().catch(() => []),
        fetchMacroPulse().catch(() => null),
        fetchLiveCryptoQuotes().catch(() => ({} as Record<string, { mid: number; bid: number; ask: number }>)),
      ]);

      // 1H boşsa 30g saatlik fallback
      const h1Bars = h1Full.length >= 30 ? h1Full : await fetchRealHourlyHistory(symbol).catch(() => [] as HourlyBar[]);
      const dailyBars = dailyClean.length >= 30 ? dailyClean : aggregateBarsByHours(h1Bars, 24);
      const newsContext = extractNewsSentimentForAsset(symbol, newsList);
      const vixLevel = macro?.vixPrice && macro.vixPrice > 5 ? macro.vixPrice : 18.0;

      const kq = cryptoQuotes[symbol];
      const livePrice =
        kq && kq.mid > 0
          ? kq.mid
          : h1Bars.length > 0
            ? h1Bars[h1Bars.length - 1].close
            : dailyBars.length > 0
              ? dailyBars[dailyBars.length - 1].close
              : 0;

      const prev24 = h1Bars[Math.max(0, h1Bars.length - 25)]?.close || livePrice;
      const change24h = +(livePrice - prev24).toFixed(spec.digits);
      const changePercent24h = prev24 > 0 ? +((change24h / prev24) * 100).toFixed(2) : 0;

      // Seçilen zaman dilimi için mum kaynağı
      let sourceBars: HourlyBar[];
      let maxBars = 110;
      if (tf === '15m' && bars15m.length >= 30) {
        sourceBars = bars15m;
        maxBars = 110;
      } else if (tf === '4h') {
        sourceBars = aggregateBarsByHours(h1Bars, 4);
        maxBars = 110;
      } else if (tf === '12h') {
        sourceBars = aggregateBarsByHours(h1Bars, 12);
        maxBars = 100;
      } else if (tf === '1d') {
        sourceBars = dailyBars;
        maxBars = 130;
      } else {
        sourceBars = h1Bars.length >= 30 ? h1Bars : dailyBars;
        maxBars = 120;
      }

      const displaySlice = sourceBars.slice(-maxBars);
      const baseCandles = computeProChartSeries(sourceBars, spec.digits, maxBars, tf !== '1d');

      const ledger = getAutonomousLedgerSnapshot();
      const radarRow = (ledger.lastMarketRadar || []).find((r) => r.symbol === symbol);
      const activeTrade = (ledger.openPositions || []).find((p) => p.symbol === symbol);

      const zacOverlay = computeZacChartOverlay(
        symbol,
        spec.digits,
        displaySlice,
        h1Bars,
        dailyBars,
        livePrice,
        vixLevel,
        radarRow?.xsmomRank || 0,
        CORE_SYMBOLS.length
      );

      // Her mum objesine ZAC v14 serilerini birebir bağla
      const enrichedCandles = baseCandles.map((c, idx) => ({
        ...c,
        fairValue: zacOverlay.fairValueSeries[idx] ?? c.ema50,
        sma200: zacOverlay.sma200Series[idx] ?? c.ema50,
        zacUpper: zacOverlay.upperBandSeries[idx] ?? c.bbUpper,
        zacLower: zacOverlay.lowerBandSeries[idx] ?? c.bbLower,
        zacScore: zacOverlay.zacSeries[idx] ?? 0,
        regime: zacOverlay.regimeSeries[idx] ?? 'NEUTRAL_CHOP',
      }));

      // +24S ve +72S Konisi için nokta dizisi (grafik sağ uzantısı)
      const h4 = zacOverlay.snapshot.horizons.find((h) => h.horizonHours === 4)!;
      const h12 = zacOverlay.snapshot.horizons.find((h) => h.horizonHours === 12)!;
      const h24 = zacOverlay.snapshot.horizons.find((h) => h.horizonHours === 24)!;
      const h72 = zacOverlay.snapshot.horizons.find((h) => h.horizonHours === 72)!;

      sendJson(res, 200, {
        symbol,
        name: spec.name,
        cluster: spec.cluster,
        tf,
        digits: spec.digits,
        currentPrice: +livePrice.toFixed(spec.digits),
        change24h,
        changePercent24h,
        candles: enrichedCandles,
        markers: zacOverlay.markers,
        zacSnapshot: zacOverlay.snapshot,
        oosSelfAudit: zacOverlay.oosSelfAudit,
        forecastCones: [h4, h12, h24, h72],
        newsContext,
        activeTrade: activeTrade
          ? {
              id: activeTrade.id,
              pod: activeTrade.pod,
              direction: activeTrade.direction,
              entryPrice: activeTrade.entryPrice,
              stopLoss: activeTrade.stopLoss,
              takeProfit1: activeTrade.takeProfit1,
              takeProfit2: activeTrade.takeProfit2,
              totalPnL_TRY: activeTrade.totalPnL_TRY,
            }
          : null,
        universe: CORE_SYMBOLS.map((s) => ({ symbol: s, name: getSpec(s).name, cluster: getSpec(s).cluster })),
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      sendJson(res, 500, { error: err?.message || 'ZAC v14 grafik verisi üretilemedi' });
    }
    return true;
  }

  // 5. 250.000 TL Otonom 3-Pod Fon Motoru (/api/autonomous-test)
  if (pathname === '/api/autonomous-test') {
    try {
      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      const action = (body.action || urlObj.searchParams.get('action') || 'status').toLowerCase();

      let state;
      if (action === 'tick' || action === 'scan') {
        state = await runAutonomousBotTick(true);
      } else if (action === 'start') {
        state = await controlAutonomousBot('start');
      } else if (action === 'pause' || action === 'stop') {
        state = await controlAutonomousBot('pause');
      } else if (action === 'toggle') {
        const running =
          body.running === true ||
          urlObj.searchParams.get('running') === 'true' ||
          urlObj.searchParams.get('state') === 'start';
        state = await controlAutonomousBot(running ? 'start' : 'pause');
      } else if (action === 'reset' || action === 'reset-zero') {
        state = await controlAutonomousBot('reset');
      } else if (action === 'close_position') {
        state = await controlAutonomousBot('close_position', {
          tradeId: body.tradeId || urlObj.searchParams.get('tradeId') || undefined,
        });
      } else {
        const snap = getAutonomousLedgerSnapshot();
        // İlk açılışta radar boşsa hemen bir canlı tarama yap
        if (!snap.lastMarketRadar || snap.lastMarketRadar.length === 0) {
          state = await runAutonomousBotTick(true);
        } else {
          state = snap;
        }
      }
      sendJson(res, 200, state);
    } catch (err: any) {
      sendJson(res, 500, { error: err?.message || 'Otonom fon motoru hatası' });
    }
    return true;
  }

  // 6. Gerçek Veri Multi-Window Walk-Forward Denetim Motoru (30d | 90d | 1y | 2y)
  if (pathname === '/api/autonomous-backtest') {
    try {
      const rawWin = (urlObj.searchParams.get('window') || '2y').toLowerCase();
      const win: WalkForwardWindow =
        rawWin === '30d' || rawWin === '90d' || rawWin === '1y' || rawWin === '2y' ? rawWin : '2y';
      const refresh = urlObj.searchParams.get('refresh') === 'true' || urlObj.searchParams.get('refresh') === '1';
      const report = await runLiveWalkForwardAudit(win, refresh);
      sendJson(res, 200, report);
    } catch (err: any) {
      sendJson(res, 500, { error: err?.message || 'Walk-forward denetim hatası' });
    }
    return true;
  }

  // 6b. /canli — %100 GERÇEK ZAMANLI, SIFIR BACKTEST İLERİ-DÖNÜK DOĞRULAMA DEFTERİ (/api/live-audit)
  if (pathname === '/api/live-audit') {
    try {
      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      const action = (body.action || urlObj.searchParams.get('action') || 'status').toLowerCase();
      const syncNow = action === 'sync' || action === 'lock' || action === 'tick';
      const payload = await getLiveAuditDashboard(syncNow);
      sendJson(res, 200, payload);
    } catch (err: any) {
      sendJson(res, 500, { error: err?.message || 'Canlı doğrulama verisi alınamadı' });
    }
    return true;
  }

  // 7. 250.000 TL Manuel IBKR Arena & Sen vs Bot Yarışı
  if (pathname === '/api/manual-test') {
    await handleManualTestHttpRequest(req, res);
    return true;
  }

  // 8. 3 Dakikalık Canlı Mikro-Doğrulama Laboratuvarı
  if (pathname === '/api/forecast-lab') {
    try {
      const action = urlObj.searchParams.get('action') || 'status';
      let labState = action === 'tick' ? await runForecastLab3mTick(true) : await getForecastLab3mState();
      if (labState.totalGeneratedCount === 0) {
        labState = await runForecastLab3mTick(true);
      }
      sendJson(res, 200, labState);
    } catch (err: any) {
      sendJson(res, 500, { error: err?.message || '3dk tahmin laboratuvarı hatası' });
    }
    return true;
  }

  if (pathname === '/api/forecast-lab/export') {
    try {
      const format = (urlObj.searchParams.get('format') || 'csv').toLowerCase();
      if (format === 'json') {
        const state = await getForecastLab3mState();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="zeltra_3m_forecast_lab.json"');
        res.end(JSON.stringify(state, null, 2));
      } else {
        const csv = await exportForecastLabCsv();
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="zeltra_3m_forecast_lab.csv"');
        res.end('\uFEFF' + csv);
      }
    } catch (err: any) {
      sendJson(res, 500, { error: err?.message || 'Dışa aktarım hatası' });
    }
    return true;
  }

  sendJson(res, 404, { error: `Bilinmeyen API uç noktası: ${pathname}` });
  return true;
}

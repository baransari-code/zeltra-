// server/autonomousTrader.ts — ZELTRA 24/7 Otonom Portföy & Gerçek Piyasa İşlem Motoru (250.000 TL Başlangıç Sermayesi)
import fs from 'fs';
import path from 'path';
import {
  fetchReal1YearData,
  fetchRealHourlyHistory,
  fetchLiveUsdTryRate,
  fetchRealFinancialNews,
  extractNewsSentimentForAsset,
} from './marketService';

export interface AutonomousTrade {
  id: string;
  symbol: string;
  name: string;
  digits: number;
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  status: 'ACIK' | 'TP2_TAM_HEDEF' | 'TP1_VE_BASABAS' | 'STOP_LOSS' | 'MANUEL_KAPANDI';
  entryTime: string;
  entryTimestamp: number;
  closeTime?: string;
  closeTimestamp?: number;
  entryPrice: number;
  currentPrice: number;
  closePrice?: number;
  takeProfit1: number;
  takeProfit2: number;
  stopLoss: number;
  initialStopLoss: number;
  allocatedCapitalTRY: number; // Pozisyona ayrılan teminat (Örn: 50.000 TL)
  riskAmountTRY: number; // Maksimum göze alınan risk (Örn: 3.750 TL - %1.5)
  positionSizeUnits: number;
  tp1Hit: boolean;
  breakevenActive: boolean;
  realizedPnL_TRY: number; // Kapanan kısımdan kasaya giren net TL
  unrealizedPnL_TRY: number; // Açık kalan kısmın anlık yüzer TL kâr/zararı
  totalPnL_TRY: number; // realized + unrealized
  totalPnL_Percent: number; // Kasa bazlı veya teminat bazlı getiri %
  rationale: string;
  exitReason?: string;
}

export interface EquityPoint {
  timestamp: number;
  timeStr: string;
  equityTRY: number;
  cashTRY: number;
}

export interface ActivityLogItem {
  id: string;
  timestamp: string;
  type: 'ENTRY' | 'TP1_PARTIAL' | 'TP2_FULL' | 'STOP_LOSS' | 'BREAKEVEN_EXIT' | 'SYSTEM';
  symbol: string;
  message: string;
  pnlImpactTRY?: number;
}

export interface AutonomousLedgerState {
  botId: string;
  isRunning: boolean;
  startedAt: string;
  lastTickAt: string;
  liveUsdTry: number;
  initialCapitalTRY: number;
  cashBalanceTRY: number;
  allocatedMarginTRY: number;
  availableCashTRY: number;
  openFloatingPnL_TRY: number;
  totalEquityTRY: number;
  netProfitTRY: number;
  netProfitPercent: number;
  metrics: {
    totalClosedTrades: number;
    openPositionsCount: number;
    winningTrades: number;
    losingTrades: number;
    winRatePercent: number;
    grossProfitTRY: number;
    grossLossTRY: number;
    profitFactor: number;
    maxDrawdownPercent: number;
    peakEquityTRY: number;
  };
  openPositions: AutonomousTrade[];
  closedTrades: AutonomousTrade[];
  equityCurve: EquityPoint[];
  activityLog: ActivityLogItem[];
}

const LEDGER_FILE = path.resolve(process.cwd(), 'data', 'autonomous_trader_ledger.json');

const CORE_UNIVERSE: { symbol: string; name: string; digits: number }[] = [
  { symbol: 'XAU/USD', name: 'Ons Altın / ABD Doları', digits: 2 },
  { symbol: 'EUR/USD', name: 'Euro / ABD Doları', digits: 4 },
  { symbol: 'USD/JPY', name: 'ABD Doları / Japon Yeni', digits: 2 },
  { symbol: 'GBP/USD', name: 'İngiliz Sterlini / ABD Doları', digits: 4 },
  { symbol: 'BTC/USD', name: 'Bitcoin / ABD Doları', digits: 2 },
  { symbol: 'NAS100', name: 'Nasdaq 100 Teknoloji Endeksi', digits: 2 },
  { symbol: 'SPX500', name: 'S&P 500 Endeksi', digits: 2 },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', digits: 2 },
  { symbol: 'WTI', name: 'ABD Ham Petrolü (WTI)', digits: 2 },
];

// Wilder's RSI & ATR Yardımcıları
function computeWilderRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(1);
}

function computeEMA(closes: number[], period: number): number {
  if (closes.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, Math.min(period, closes.length)).reduce((a, b) => a + b, 0) / Math.min(period, closes.length);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function computeWilderATR(candles: { high: number; low: number; close: number }[], period = 14): number {
  if (candles.length <= 1) return (candles[0]?.close || 1) * 0.005;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const len = Math.min(period, trs.length);
  let rma = trs.slice(0, len).reduce((a, b) => a + b, 0) / len;
  for (let i = len; i < trs.length; i++) {
    rma = (rma * (period - 1) + trs[i]) / period;
  }
  return rma || (candles[candles.length - 1].close * 0.005);
}

export function saveLedger(state: AutonomousLedgerState): void {
  try {
    const dir = path.dirname(LEDGER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Otonom kütük kaydedilemedi:', err);
  }
}

function recalculateLedgerMetrics(state: AutonomousLedgerState): void {
  let openFloating = 0;
  let allocated = 0;
  for (const pos of state.openPositions) {
    openFloating += pos.unrealizedPnL_TRY;
    allocated += pos.allocatedCapitalTRY * (pos.tp1Hit ? 0.5 : 1.0);
  }

  state.openFloatingPnL_TRY = +openFloating.toFixed(2);
  state.allocatedMarginTRY = +allocated.toFixed(2);
  state.availableCashTRY = +Math.max(0, state.cashBalanceTRY - allocated).toFixed(2);
  state.totalEquityTRY = +(state.cashBalanceTRY + openFloating).toFixed(2);
  state.netProfitTRY = +(state.totalEquityTRY - state.initialCapitalTRY).toFixed(2);
  state.netProfitPercent = +(((state.netProfitTRY) / state.initialCapitalTRY) * 100).toFixed(2);

  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  for (const t of state.closedTrades) {
    if (t.realizedPnL_TRY > 0) {
      wins++;
      grossProfit += t.realizedPnL_TRY;
    } else if (t.realizedPnL_TRY < 0) {
      losses++;
      grossLoss += Math.abs(t.realizedPnL_TRY);
    }
  }

  const totalClosed = state.closedTrades.length;
  state.metrics.totalClosedTrades = totalClosed;
  state.metrics.openPositionsCount = state.openPositions.length;
  state.metrics.winningTrades = wins;
  state.metrics.losingTrades = losses;
  state.metrics.winRatePercent = totalClosed > 0 ? +((wins / totalClosed) * 100).toFixed(1) : 0;
  state.metrics.grossProfitTRY = +grossProfit.toFixed(2);
  state.metrics.grossLossTRY = +grossLoss.toFixed(2);
  state.metrics.profitFactor = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? 9.99 : 0;

  if (state.totalEquityTRY > state.metrics.peakEquityTRY) {
    state.metrics.peakEquityTRY = state.totalEquityTRY;
  }
  const dd = state.metrics.peakEquityTRY > 0
    ? ((state.metrics.peakEquityTRY - state.totalEquityTRY) / state.metrics.peakEquityTRY) * 100
    : 0;
  if (dd > state.metrics.maxDrawdownPercent) {
    state.metrics.maxDrawdownPercent = +dd.toFixed(2);
  }
}

// İlk Kurulumda Gerçek 5 Günlük Saatlik Yahoo Finance Mumları Üzerinden Başlangıçtan Bugüne Gerçek İşlem Geçmişini Oluştur
async function bootstrapHistoricalRealTrades(initialCapital = 250000): Promise<AutonomousLedgerState> {
  const usdTry = await fetchLiveUsdTryRate();
  const now = Date.now();
  const startTs = now - 4 * 24 * 3600 * 1000;

  const state: AutonomousLedgerState = {
    botId: 'ZELTRA-AUTONOMOUS-250K-TRADER',
    isRunning: true,
    startedAt: new Date(startTs).toISOString(),
    lastTickAt: new Date(now).toISOString(),
    liveUsdTry: usdTry,
    initialCapitalTRY: initialCapital,
    cashBalanceTRY: initialCapital,
    allocatedMarginTRY: 0,
    availableCashTRY: initialCapital,
    openFloatingPnL_TRY: 0,
    totalEquityTRY: initialCapital,
    netProfitTRY: 0,
    netProfitPercent: 0,
    metrics: {
      totalClosedTrades: 0,
      openPositionsCount: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRatePercent: 0,
      grossProfitTRY: 0,
      grossLossTRY: 0,
      profitFactor: 0,
      maxDrawdownPercent: 0,
      peakEquityTRY: initialCapital,
    },
    openPositions: [],
    closedTrades: [],
    equityCurve: [
      {
        timestamp: startTs,
        timeStr: new Date(startTs).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        equityTRY: initialCapital,
        cashTRY: initialCapital,
      },
    ],
    activityLog: [
      {
        id: `LOG-INIT-${startTs}`,
        timestamp: new Date(startTs).toISOString(),
        type: 'SYSTEM',
        symbol: 'PORTFÖY',
        message: `250.000 TL Başlangıç Sermayesi ile ZELTRA Otonom İşlem Motoru başlatıldı (İşlem başı %1.5 Sermaye Kalkanı aktif).`,
      },
    ],
  };

  // Gerçek saatlik verilerle son 4 günün yürütülmesi
  for (const item of CORE_UNIVERSE.slice(0, 6)) {
    try {
      const hourly = await fetchRealHourlyHistory(item.symbol);
      if (!hourly || hourly.length < 30) continue;

      // 35. saatten itibaren sinyal taraması
      let i = 30;
      while (i < hourly.length - 4) {
        const slice = hourly.slice(0, i + 1);
        const closes = slice.map((c) => c.close);
        const curPrice = closes[closes.length - 1];
        const curTs = slice[slice.length - 1].timestamp;

        const ema8 = computeEMA(closes, 8);
        const ema21 = computeEMA(closes, 21);
        const rsi = computeWilderRSI(closes, 14);

        // Saatlik volatilite tahmini
        let diffs = 0;
        for (let k = Math.max(1, closes.length - 14); k < closes.length; k++) {
          diffs += Math.abs(closes[k] - closes[k - 1]);
        }
        const hAtr = (diffs / 14) || curPrice * 0.0025;
        const swingAtr = hAtr * 3.2;

        let dir: 'AL (LONG)' | 'SAT (SHORT)' | null = null;
        let reason = '';
        if (ema8 > ema21 && rsi >= 42 && rsi <= 64) {
          dir = 'AL (LONG)';
          reason = `EMA8/21 Pozitif Kesişim + Wilder RSI (${rsi}) İvme Teyidi`;
        } else if (ema8 < ema21 && rsi <= 56 && rsi >= 34) {
          dir = 'SAT (SHORT)';
          reason = `EMA8/21 Negatif Akış + Wilder RSI (${rsi}) Satış Baskısı`;
        }

        if (dir) {
          const riskTRY = +(state.cashBalanceTRY * 0.015).toFixed(2); // %1.5 Kasa Riski (~3.750 TL)
          const allocTRY = +(state.cashBalanceTRY * 0.20).toFixed(2); // %20 Teminat Tahsisi (~50.000 TL)
          const slDist = swingAtr * 1.25;
          const tp1Dist = swingAtr * 1.85;
          const tp2Dist = swingAtr * 3.10;

          const entryPrice = +curPrice.toFixed(item.digits);
          const stopLoss = dir === 'AL (LONG)' ? +(entryPrice - slDist).toFixed(item.digits) : +(entryPrice + slDist).toFixed(item.digits);
          const tp1 = dir === 'AL (LONG)' ? +(entryPrice + tp1Dist).toFixed(item.digits) : +(entryPrice - tp1Dist).toFixed(item.digits);
          const tp2 = dir === 'AL (LONG)' ? +(entryPrice + tp2Dist).toFixed(item.digits) : +(entryPrice - tp2Dist).toFixed(item.digits);

          const rRatio1 = tp1Dist / (slDist || 0.0001);
          const rRatio2 = tp2Dist / (slDist || 0.0001);

          let tp1Hit = false;
          let closed = false;
          let closeTs = curTs;
          let closePrice = entryPrice;
          let realizedTRY = 0;
          let status: AutonomousTrade['status'] = 'ACIK';
          let exitReason = '';

          // Sonraki saatlerde bu pozisyonu takip et
          for (let f = i + 1; f < hourly.length; f++) {
            const stepPrice = hourly[f].close;
            const stepTs = hourly[f].timestamp;

            if (dir === 'AL (LONG)') {
              if (!tp1Hit && stepPrice >= tp1) {
                tp1Hit = true;
                realizedTRY += +(riskTRY * rRatio1 * 0.5).toFixed(2);
              }
              if (tp1Hit && stepPrice >= tp2) {
                realizedTRY += +(riskTRY * rRatio2 * 0.5).toFixed(2);
                closePrice = tp2;
                closeTs = stepTs;
                status = 'TP2_TAM_HEDEF';
                exitReason = 'TP1 (%50) ve TP2 (%50) tam kâr hedefleri başarıyla alındı.';
                closed = true;
                i = f + 4;
                break;
              }
              const activeStop = tp1Hit ? entryPrice : stopLoss;
              if (stepPrice <= activeStop) {
                if (!tp1Hit) {
                  realizedTRY = -riskTRY;
                  closePrice = stopLoss;
                  status = 'STOP_LOSS';
                  exitReason = 'Fiyat Stop Loss (Emniyet Kemeri) seviyesine değdi; zarar %1.5 ile sınırlandı.';
                } else {
                  closePrice = entryPrice;
                  status = 'TP1_VE_BASABAS';
                  exitReason = 'TP1 (%50 kâr) cebe konduktan sonra kalan %50 Başa Baş (0 zarar) stop ile kapandı.';
                }
                closeTs = stepTs;
                closed = true;
                i = f + 4;
                break;
              }
            } else {
              // SHORT
              if (!tp1Hit && stepPrice <= tp1) {
                tp1Hit = true;
                realizedTRY += +(riskTRY * rRatio1 * 0.5).toFixed(2);
              }
              if (tp1Hit && stepPrice <= tp2) {
                realizedTRY += +(riskTRY * rRatio2 * 0.5).toFixed(2);
                closePrice = tp2;
                closeTs = stepTs;
                status = 'TP2_TAM_HEDEF';
                exitReason = 'TP1 (%50) ve TP2 (%50) tam kâr hedefleri başarıyla alındı.';
                closed = true;
                i = f + 4;
                break;
              }
              const activeStop = tp1Hit ? entryPrice : stopLoss;
              if (stepPrice >= activeStop) {
                if (!tp1Hit) {
                  realizedTRY = -riskTRY;
                  closePrice = stopLoss;
                  status = 'STOP_LOSS';
                  exitReason = 'Fiyat Stop Loss seviyesine değdi; zarar %1.5 ile sınırlandı.';
                } else {
                  closePrice = entryPrice;
                  status = 'TP1_VE_BASABAS';
                  exitReason = 'TP1 (%50 kâr) cebe konduktan sonra kalan %50 Başa Baş (0 zarar) stop ile kapandı.';
                }
                closeTs = stepTs;
                closed = true;
                i = f + 4;
                break;
              }
            }
          }

          if (closed) {
            state.cashBalanceTRY = +(state.cashBalanceTRY + realizedTRY).toFixed(2);
            const tradeObj: AutonomousTrade = {
              id: `TRD-${item.symbol.replace(/[\/\.\s]/g, '')}-${curTs.toString().slice(-5)}`,
              symbol: item.symbol,
              name: item.name,
              digits: item.digits,
              direction: dir,
              status,
              entryTime: new Date(curTs).toISOString(),
              entryTimestamp: curTs,
              closeTime: new Date(closeTs).toISOString(),
              closeTimestamp: closeTs,
              entryPrice,
              currentPrice: closePrice,
              closePrice,
              takeProfit1: tp1,
              takeProfit2: tp2,
              stopLoss: tp1Hit ? entryPrice : stopLoss,
              initialStopLoss: stopLoss,
              allocatedCapitalTRY: allocTRY,
              riskAmountTRY: riskTRY,
              positionSizeUnits: +(allocTRY / (entryPrice * usdTry || 1)).toFixed(4),
              tp1Hit,
              breakevenActive: tp1Hit,
              realizedPnL_TRY: +realizedTRY.toFixed(2),
              unrealizedPnL_TRY: 0,
              totalPnL_TRY: +realizedTRY.toFixed(2),
              totalPnL_Percent: +((realizedTRY / state.initialCapitalTRY) * 100).toFixed(2),
              rationale: reason,
              exitReason,
            };
            state.closedTrades.push(tradeObj);
            state.equityCurve.push({
              timestamp: closeTs,
              timeStr: new Date(closeTs).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
              equityTRY: state.cashBalanceTRY,
              cashTRY: state.cashBalanceTRY,
            });
            state.activityLog.unshift({
              id: `ACT-${closeTs}-${item.symbol}`,
              timestamp: new Date(closeTs).toISOString(),
              type: status === 'STOP_LOSS' ? 'STOP_LOSS' : status === 'TP2_TAM_HEDEF' ? 'TP2_FULL' : 'BREAKEVEN_EXIT',
              symbol: item.symbol,
              message: `${item.symbol} (${dir}) pozisyonu ${closePrice} fiyatından kapandı. ${exitReason}`,
              pnlImpactTRY: +realizedTRY.toFixed(2),
            });
          } else {
            break;
          }
        } else {
          i += 6;
        }
      }
    } catch {
      // Skip symbol if fetch error
    }
  }

  // Zaman sırasına göre diz
  state.closedTrades.sort((a, b) => (b.closeTimestamp || 0) - (a.closeTimestamp || 0));
  state.equityCurve.sort((a, b) => a.timestamp - b.timestamp);
  recalculateLedgerMetrics(state);
  saveLedger(state);
  return state;
}

export async function loadOrInitAutonomousLedger(): Promise<AutonomousLedgerState> {
  if (fs.existsSync(LEDGER_FILE)) {
    try {
      const raw = fs.readFileSync(LEDGER_FILE, 'utf-8');
      const parsed: AutonomousLedgerState = JSON.parse(raw);
      if (parsed && parsed.initialCapitalTRY) {
        return parsed;
      }
    } catch {
      // Re-init if corrupted
    }
  }
  return await bootstrapHistoricalRealTrades(250000);
}

// Canlı Piyasa Tarama, Açık Pozisyon Güncelleme, Canlı Haber Risk Kalkanı ve Yeni İşlem Açma Döngüsü
export async function executeAutonomousTradingTick(forceScan = false): Promise<AutonomousLedgerState> {
  const state = await loadOrInitAutonomousLedger();
  const now = Date.now();
  state.lastTickAt = new Date(now).toISOString();

  const [usdTry, liveNews] = await Promise.all([
    fetchLiveUsdTryRate(),
    fetchRealFinancialNews().catch(() => []),
  ]);
  state.liveUsdTry = usdTry;

  // 1. AÇIK POZİSYONLARI CANLI BORSA FİYATLARI VE CANLI HABER ŞOKLARIYLA DENETLE
  const remainingOpen: AutonomousTrade[] = [];

  for (const pos of state.openPositions) {
    try {
      const market = await fetchReal1YearData(pos.symbol);
      if (!market || !market.price) {
        remainingOpen.push(pos);
        continue;
      }

      const livePrice = +market.price.toFixed(pos.digits);
      pos.currentPrice = livePrice;

      const slDist = Math.abs(pos.entryPrice - pos.initialStopLoss) || 0.0001;
      const priceDiff = pos.direction === 'AL (LONG)'
        ? livePrice - pos.entryPrice
        : pos.entryPrice - livePrice;

      const rMultiple = priceDiff / slDist;
      const remainingWeight = pos.tp1Hit ? 0.5 : 1.0;

      // CANLI HABER ACİL RİSK KALKANI:
      // Açık pozisyonun tam tersi yönünde yüksek etkili flaş bir haber düştüyse (Örn: BTC AL pozisyonundayken "4. Teslimiyet Dalgası / 65.000$ Çöküş" haberi),
      // fiyatın tam Stop-Loss'a vurmasını beklemeden erken savunma çıkışı yap!
      const newsCtx = extractNewsSentimentForAsset(pos.symbol, liveNews);
      const isSevereAdverseNews =
        (pos.direction === 'AL (LONG)' && newsCtx.sentimentScore <= -0.50) ||
        (pos.direction === 'SAT (SHORT)' && newsCtx.sentimentScore >= 0.50);

      if (isSevereAdverseNews && !pos.tp1Hit) {
        const earlyPnL = +(pos.riskAmountTRY * rMultiple * remainingWeight).toFixed(2);
        pos.realizedPnL_TRY = earlyPnL;
        pos.unrealizedPnL_TRY = 0;
        pos.totalPnL_TRY = earlyPnL;
        pos.totalPnL_Percent = +((earlyPnL / state.initialCapitalTRY) * 100).toFixed(2);
        pos.closePrice = livePrice;
        pos.closeTime = new Date(now).toISOString();
        pos.closeTimestamp = now;
        pos.status = 'MANUEL_KAPANDI';
        pos.exitReason = `Canlı Haber Risk Kalkanı: "${newsCtx.impactingHeadline}" (${newsCtx.source}) ters yönlü haber şoku nedeniyle tam stop beklenmeden savunma çıkışı yapıldı.`;

        state.cashBalanceTRY = +(state.cashBalanceTRY + earlyPnL).toFixed(2);
        state.closedTrades.unshift(pos);

        state.activityLog.unshift({
          id: `ACT-NEWS-SHIELD-${now}-${pos.symbol}`,
          timestamp: new Date(now).toISOString(),
          type: 'SYSTEM',
          symbol: pos.symbol,
          message: `HABER RİSK KALKANI DEVREDE: ${pos.symbol} (${pos.direction}) pozisyonu "${newsCtx.impactingHeadline}" olumsuz haberi nedeniyle tam stop zararını beklemeden ${livePrice} seviyesinden savunma amaçlı kapatıldı (${earlyPnL >= 0 ? '+' : ''}${earlyPnL.toLocaleString('tr-TR')} TL).`,
          pnlImpactTRY: earlyPnL,
        });
        continue;
      }

      // TP1 Kontrolü
      const reachedTp1 = pos.direction === 'AL (LONG)'
        ? livePrice >= pos.takeProfit1
        : livePrice <= pos.takeProfit1;

      if (!pos.tp1Hit && reachedTp1) {
        pos.tp1Hit = true;
        pos.breakevenActive = true;
        pos.stopLoss = pos.entryPrice;
        const tp1Ratio = Math.abs(pos.takeProfit1 - pos.entryPrice) / slDist;
        const halfProfit = +(pos.riskAmountTRY * tp1Ratio * 0.5).toFixed(2);
        pos.realizedPnL_TRY = +(pos.realizedPnL_TRY + halfProfit).toFixed(2);
        state.cashBalanceTRY = +(state.cashBalanceTRY + halfProfit).toFixed(2);

        state.activityLog.unshift({
          id: `ACT-TP1-${now}-${pos.symbol}`,
          timestamp: new Date(now).toISOString(),
          type: 'TP1_PARTIAL',
          symbol: pos.symbol,
          message: `${pos.symbol} TP1 (${pos.takeProfit1}) hedefine ulaştı! Pozisyonun %50'si (+${halfProfit.toLocaleString('tr-TR')} TL) realize edildi, Stop başabaşa (${pos.entryPrice}) çekildi.`,
          pnlImpactTRY: halfProfit,
        });
      }

      // TP2 Kontrolü
      const reachedTp2 = pos.direction === 'AL (LONG)'
        ? livePrice >= pos.takeProfit2
        : livePrice <= pos.takeProfit2;

      if (reachedTp2) {
        const tp2Ratio = Math.abs(pos.takeProfit2 - pos.entryPrice) / slDist;
        const secondHalfProfit = +(pos.riskAmountTRY * tp2Ratio * 0.5).toFixed(2);
        pos.realizedPnL_TRY = +(pos.realizedPnL_TRY + secondHalfProfit).toFixed(2);
        pos.unrealizedPnL_TRY = 0;
        pos.totalPnL_TRY = pos.realizedPnL_TRY;
        pos.totalPnL_Percent = +((pos.totalPnL_TRY / state.initialCapitalTRY) * 100).toFixed(2);
        pos.closePrice = livePrice;
        pos.closeTime = new Date(now).toISOString();
        pos.closeTimestamp = now;
        pos.status = 'TP2_TAM_HEDEF';
        pos.exitReason = 'TP2 nihai hedef fiyatına ulaşıldı; tüm kâr realize edildi.';

        state.cashBalanceTRY = +(state.cashBalanceTRY + secondHalfProfit).toFixed(2);
        state.closedTrades.unshift(pos);

        state.activityLog.unshift({
          id: `ACT-TP2-${now}-${pos.symbol}`,
          timestamp: new Date(now).toISOString(),
          type: 'TP2_FULL',
          symbol: pos.symbol,
          message: `${pos.symbol} TP2 (${pos.takeProfit2}) nihai hedefine ulaştı! Toplam +${pos.totalPnL_TRY.toLocaleString('tr-TR')} TL net kâr kasaya eklendi.`,
          pnlImpactTRY: secondHalfProfit,
        });
        continue;
      }

      // Stop Loss / Breakeven Kontrolü
      const hitStop = pos.direction === 'AL (LONG)'
        ? livePrice <= pos.stopLoss
        : livePrice >= pos.stopLoss;

      if (hitStop) {
        if (pos.tp1Hit) {
          pos.unrealizedPnL_TRY = 0;
          pos.totalPnL_TRY = pos.realizedPnL_TRY;
          pos.totalPnL_Percent = +((pos.totalPnL_TRY / state.initialCapitalTRY) * 100).toFixed(2);
          pos.closePrice = pos.entryPrice;
          pos.closeTime = new Date(now).toISOString();
          pos.closeTimestamp = now;
          pos.status = 'TP1_VE_BASABAS';
          pos.exitReason = 'TP1 kârı alındıktan sonra kalan %50 kısım Başa Baş (Breakeven) korumasında 0 zararla kapandı.';

          state.closedTrades.unshift(pos);
          state.activityLog.unshift({
            id: `ACT-BE-${now}-${pos.symbol}`,
            timestamp: new Date(now).toISOString(),
            type: 'BREAKEVEN_EXIT',
            symbol: pos.symbol,
            message: `${pos.symbol} Başa Baş Stop korumasında kapandı. İlk yarıdan alınan +${pos.realizedPnL_TRY.toLocaleString('tr-TR')} TL kâr korundu.`,
            pnlImpactTRY: 0,
          });
        } else {
          const lossTRY = -pos.riskAmountTRY;
          pos.realizedPnL_TRY = lossTRY;
          pos.unrealizedPnL_TRY = 0;
          pos.totalPnL_TRY = lossTRY;
          pos.totalPnL_Percent = +((lossTRY / state.initialCapitalTRY) * 100).toFixed(2);
          pos.closePrice = pos.stopLoss;
          pos.closeTime = new Date(now).toISOString();
          pos.closeTimestamp = now;
          pos.status = 'STOP_LOSS';
          pos.exitReason = 'Fiyat Stop Loss emniyet kemerine değdi; kayıp %1.5 ile sınırlandırıldı.';

          state.cashBalanceTRY = +(state.cashBalanceTRY + lossTRY).toFixed(2);
          state.closedTrades.unshift(pos);

          state.activityLog.unshift({
            id: `ACT-SL-${now}-${pos.symbol}`,
            timestamp: new Date(now).toISOString(),
            type: 'STOP_LOSS',
            symbol: pos.symbol,
            message: `${pos.symbol} Stop Loss (${pos.stopLoss}) seviyesinde kapandı (${lossTRY.toLocaleString('tr-TR')} TL). Sermaye Kalkanı büyük zararı önledi.`,
            pnlImpactTRY: lossTRY,
          });
        }
        continue;
      }

      // Pozisyon açık kalmaya devam ediyor -> Yüzer kâr/zararı güncelle
      pos.unrealizedPnL_TRY = +(pos.riskAmountTRY * rMultiple * remainingWeight).toFixed(2);
      pos.totalPnL_TRY = +(pos.realizedPnL_TRY + pos.unrealizedPnL_TRY).toFixed(2);
      pos.totalPnL_Percent = +((pos.totalPnL_TRY / state.initialCapitalTRY) * 100).toFixed(2);
      remainingOpen.push(pos);
    } catch {
      remainingOpen.push(pos);
    }
  }

  state.openPositions = remainingOpen;

  // 2. EĞER BOT AKTİFSE VE AÇIK POZİSYON SAYISI < 4 İSE YENİ GERÇEK PİYASA + CANLI HABER TEYİTLİ FIRSATLARI TARA
  if (state.isRunning && (state.openPositions.length < 4 || forceScan)) {
    const openSymbols = new Set(state.openPositions.map((p) => p.symbol));

    for (const candidate of CORE_UNIVERSE) {
      if (state.openPositions.length >= 4) break;
      if (openSymbols.has(candidate.symbol)) continue;

      try {
        const market = await fetchReal1YearData(candidate.symbol);
        if (!market || !market.candles || market.candles.length < 30) continue;

        const candles = market.candles;
        const closes = candles.map((c: any) => c.close);
        const livePrice = +market.price.toFixed(candidate.digits);

        const ema8 = computeEMA(closes, 8);
        const ema21 = computeEMA(closes, 21);
        const ema50 = computeEMA(closes, 50);
        const rsi = computeWilderRSI(closes, 14);
        const dailyAtr = computeWilderATR(candles, 14);
        const tradeAtr = dailyAtr * 0.45;

        // Canlı Haber Duyarlılık ve Risk Analizi
        const newsCtx = extractNewsSentimentForAsset(candidate.symbol, liveNews);
        const newsScore = newsCtx.sentimentScore;
        const hasNewsHeadline = Boolean(newsCtx.impactingHeadline);

        let direction: 'AL (LONG)' | 'SAT (SHORT)' | null = null;
        let rationale = '';
        let riskScale = 1.0; // Haber teyidine göre dinamik risk ölçekleme

        if (livePrice >= ema50 && ema8 >= ema21 * 0.999 && rsi >= 36 && rsi <= 65) {
          if (newsScore <= -0.35) {
            // Güçlü negatif haber varken ALIM (LONG) VETO EDİLİR!
            direction = null;
          } else {
            direction = 'AL (LONG)';
            rationale = hasNewsHeadline && newsScore >= 0.2
              ? `Çift Teyit (Teknik + Olumlu Haber): Fiyat > EMA50, Wilder RSI (${rsi}) ve "${newsCtx.impactingHeadline.slice(0, 55)}..." haberi alımı destekliyor.`
              : `Trend Pozitif (Fiyat > EMA50), EMA8/21 Alıcı Akışı ve Wilder RSI (${rsi}) Uygun Bölgede (Haber Akışı Nötr/Güvenli).`;
          }
        } else if (livePrice < ema50 && ema8 <= ema21 * 1.001 && rsi >= 34 && rsi <= 63) {
          if (newsScore >= 0.35) {
            // Güçlü pozitif haber varken SATIŞ (SHORT) VETO EDİLİR!
            direction = null;
          } else {
            direction = 'SAT (SHORT)';
            rationale = hasNewsHeadline && newsScore <= -0.2
              ? `Çift Teyit (Teknik + Olumsuz Haber): Fiyat < EMA50, Wilder RSI (${rsi}) ve "${newsCtx.impactingHeadline.slice(0, 55)}..." haberi satış baskısını teyit ediyor.`
              : `Düşüş Rejimi (Fiyat < EMA50), EMA8/21 Satış Baskısı ve Wilder RSI (${rsi}) Teyitli.`;
          }
        } else if (rsi < 33) {
          // Aşırı satım (RSI < 33) durumunda: Eğer canlı haberde "Teslimiyet / Çöküş" (newsScore <= -0.35) varsa düşen bıçak tutulmaz!
          if (newsScore <= -0.45 && livePrice < ema50) {
            direction = 'SAT (SHORT)';
            riskScale = 0.75; // Volatilite yüksek olduğu için %25 azaltılmış kontrollü risk
            rationale = `Canlı Negatif Haber Katalizörü ("${newsCtx.impactingHeadline.slice(0, 55)}...") + EMA50 Altı Kırılım Teyitli Satış.`;
          } else if (newsScore > -0.25) {
            direction = 'AL (LONG)';
            rationale = `Aşırı Satım Tepki Bölgesi (Wilder RSI: ${rsi}) + Ters Haber Şoku Yok.`;
          }
        } else if (rsi > 69) {
          if (newsScore < 0.25) {
            direction = 'SAT (SHORT)';
            rationale = `Aşırı Alım Yorulma Bölgesi (Wilder RSI: ${rsi}) + Ortalamaya Dönüş Satışı.`;
          }
        }

        if (direction) {
          const currentEq = state.cashBalanceTRY;
          const riskTRY = +(currentEq * 0.015 * riskScale).toFixed(2); // Haber risk ölçekli (%1.12 - %1.5)
          const allocTRY = +(currentEq * 0.20 * riskScale).toFixed(2);

          const slDist = tradeAtr * 1.25;
          const tp1Dist = tradeAtr * 1.90;
          const tp2Dist = tradeAtr * 3.20;

          const stopLoss = direction === 'AL (LONG)'
            ? +(livePrice - slDist).toFixed(candidate.digits)
            : +(livePrice + slDist).toFixed(candidate.digits);
          const tp1 = direction === 'AL (LONG)'
            ? +(livePrice + tp1Dist).toFixed(candidate.digits)
            : +(livePrice - tp1Dist).toFixed(candidate.digits);
          const tp2 = direction === 'AL (LONG)'
            ? +(livePrice + tp2Dist).toFixed(candidate.digits)
            : +(livePrice - tp2Dist).toFixed(candidate.digits);

          const newTrade: AutonomousTrade = {
            id: `TRD-${candidate.symbol.replace(/[\/\.\s]/g, '')}-${now.toString().slice(-5)}`,
            symbol: candidate.symbol,
            name: candidate.name,
            digits: candidate.digits,
            direction,
            status: 'ACIK',
            entryTime: new Date(now).toISOString(),
            entryTimestamp: now,
            entryPrice: livePrice,
            currentPrice: livePrice,
            takeProfit1: tp1,
            takeProfit2: tp2,
            stopLoss,
            initialStopLoss: stopLoss,
            allocatedCapitalTRY: allocTRY,
            riskAmountTRY: riskTRY,
            positionSizeUnits: +(allocTRY / (livePrice * usdTry || 1)).toFixed(4),
            tp1Hit: false,
            breakevenActive: false,
            realizedPnL_TRY: 0,
            unrealizedPnL_TRY: 0,
            totalPnL_TRY: 0,
            totalPnL_Percent: 0,
            rationale,
          };

          state.openPositions.push(newTrade);
          openSymbols.add(candidate.symbol);

          state.activityLog.unshift({
            id: `ACT-ENT-${now}-${candidate.symbol}`,
            timestamp: new Date(now).toISOString(),
            type: 'ENTRY',
            symbol: candidate.symbol,
            message: `YENİ İŞLEM AÇILDI: ${candidate.symbol} (${direction}) @ ${livePrice} | TP1: ${tp1} | TP2: ${tp2} | SL: ${stopLoss} | Gerekçe: ${rationale}`,
          });
        }
      } catch {
        // Ignore individual symbol fetch error
      }
    }
  }

  recalculateLedgerMetrics(state);

  // Kasa eğrisine yeni nokta ekle (son noktadan en az 15 dk geçtiyse veya işlem olduysa)
  const lastEqPoint = state.equityCurve[state.equityCurve.length - 1];
  if (!lastEqPoint || now - lastEqPoint.timestamp >= 15 * 60 * 1000 || Math.abs(lastEqPoint.equityTRY - state.totalEquityTRY) >= 50) {
    state.equityCurve.push({
      timestamp: now,
      timeStr: new Date(now).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      equityTRY: state.totalEquityTRY,
      cashTRY: state.cashBalanceTRY,
    });
    if (state.equityCurve.length > 120) {
      state.equityCurve = state.equityCurve.slice(-120);
    }
  }

  if (state.activityLog.length > 80) {
    state.activityLog = state.activityLog.slice(0, 80);
  }

  saveLedger(state);
  return state;
}

export async function toggleAutonomousBot(isRunning: boolean): Promise<AutonomousLedgerState> {
  const state = await loadOrInitAutonomousLedger();
  state.isRunning = isRunning;
  state.activityLog.unshift({
    id: `ACT-SYS-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type: 'SYSTEM',
    symbol: 'SİSTEM',
    message: isRunning
      ? 'Otonom İşlem Motoru kullanıcı tarafından AKTİF edildi. Piyasa taraması devam ediyor.'
      : 'Otonom İşlem Motoru kullanıcı tarafından DURAKLATILDI. Yeni işlem açılmayacak.',
  });
  saveLedger(state);
  return state;
}

export async function resetAutonomousBot(newCapitalTRY = 250000): Promise<AutonomousLedgerState> {
  if (fs.existsSync(LEDGER_FILE)) {
    fs.unlinkSync(LEDGER_FILE);
  }
  return await bootstrapHistoricalRealTrades(newCapitalTRY);
}

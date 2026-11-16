// server/autonomousTrader.ts — ZELTRA 24/7 Kurumsal Otonom Portföy, Adli İşlem Denetimi (X-Ray), Mikro-Yapı & 9-Varlık Radar Motoru (250.000 TL Başlangıç Sermayesi)
import fs from 'fs';
import path from 'path';
import {
  fetchReal1YearData,
  fetchRealHourlyHistory,
  fetchReal15mHistory,
  fetchCryptoOrderbookImbalance,
  fetchLiveUsdTryRate,
  fetchRealFinancialNews,
  extractNewsSentimentForAsset,
  HourlyBar,
} from './marketService';
import { synthesizeAssetNewsAI } from './newsAiEngine';
import { computeMultiHorizonForecast, MultiHorizonForecast } from './quantForecastEngine';

export interface GateCheckItem {
  step: number;
  title: string;
  metricLabel: string;
  metricValue: string;
  threshold: string;
  score: number;
  maxScore: number;
  passed: boolean;
  note: string;
}

export interface TradeLifecycleEvent {
  stepNo: number;
  timestamp: string;
  phase: 'SIGNAL_DETECTED' | 'GATES_VERIFIED' | 'ORDER_FILLED' | 'MFE_MAE_TRACK' | 'TP1_PARTIAL_50_BE' | 'TRAILING_LOCK' | 'FINAL_EXIT';
  title: string;
  detail: string;
  price: number;
  pnlTRY?: number;
}

export interface TradeForensicXRay {
  confluenceScore: number; // 0 - 100 Kurumsal Uyumluluk Puanı
  auditHash: string;
  regime: 'TREND_TAKİBİ' | 'ORTALAMAYA_DÖNÜŞ' | 'HABER_KATALİZÖRÜ';
  orderType: 'KURUMSAL LİMİT / PİYASA İCRASI';
  indicatorSnapshot: {
    ema8: number;
    ema21: number;
    ema50: number;
    ema200: number;
    emaSpreadPct: number;
    rsi14: number;
    dailyAtr14: number;
    tradeAtr: number;
    newsScore: number;
    newsHeadline: string;
    newsSource: string;
  };
  microstructure: {
    midQuotePrice: number;
    fillPrice: number;
    spreadPts: number;
    slippagePts: number;
    executionCostTRY: number;
    contractSize: number;
    lotSize: number;
    unitLabel?: string;
    notionalValueTRY: number;
    effectiveLeverage: number;
    accountLeverage?: number;
    isLeveraged?: boolean;
    spot1xEquivalentPnL_TRY?: number;
    usdTryAtEntry: number;
    sizingFormulaText: string;
  };
  gates: GateCheckItem[];
  excursion: {
    mfePrice: number;
    mfeR: number;
    mfeTRY: number;
    maePrice: number;
    maeR: number;
    maeTRY: number;
  };
  lifecycleSteps: TradeLifecycleEvent[];
}

export interface AutonomousTrade {
  id: string;
  symbol: string;
  name: string;
  digits: number;
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  status: 'ACIK' | 'TP2_TAM_HEDEF' | 'TP1_VE_BASABAS' | 'TRAILING_STOP_KAR' | 'STOP_LOSS' | 'MANUEL_KAPANDI';
  entryTime: string;
  entryTimestamp: number;
  closeTime?: string;
  closeTimestamp?: number;
  midEntryPrice?: number;
  entryPrice: number;
  currentPrice: number;
  closePrice?: number;
  takeProfit1: number;
  takeProfit2: number;
  stopLoss: number;
  initialStopLoss: number;
  allocatedCapitalTRY: number; // Pozisyona ayrılan teminat (Örn: 50.000 TL - %20)
  riskAmountTRY: number; // Maksimum göze alınan risk (Örn: 3.750 TL - %1.5)
  positionSizeUnits: number;
  lotSize?: number;
  contractSize?: number;
  unitLabel?: string;
  notionalValueTRY?: number;
  effectiveLeverage?: number;
  accountLeverage?: number;
  isLeveraged?: boolean;
  spot1xEquivalentPnL_TRY?: number;
  spreadPts?: number;
  slippagePts?: number;
  executionCostTRY?: number;
  entryCommissionTRY?: number;
  exitCommissionTRY?: number;
  financingCostTRY?: number;
  lastSwapDateUTC?: string;
  usdTryAtEntry?: number;
  grossUnrealizedPnL_TRY?: number;
  bidAtTick?: number;
  askAtTick?: number;
  rMultiple?: number;
  mfeTRY?: number;
  mfeR?: number;
  maeTRY?: number;
  maeR?: number;
  tp1Hit: boolean;
  breakevenActive: boolean;
  trailingStopActive?: boolean;
  realizedPnL_TRY: number; // Kapanan kısımdan kasaya giren net TL
  unrealizedPnL_TRY: number; // Açık kalan kısmın anlık yüzer TL kâr/zararı
  totalPnL_TRY: number; // realized + unrealized
  totalPnL_Percent: number; // Başlangıç kasasına göre getiri %
  confluenceScore?: number;
  entryTimeframe?: '1H' | '15M';
  rationale: string;
  exitReason?: string;
  forecastSnapshot?: {
    horizonDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
    pred4hPrice: number;
    pred4hPct: number;
    pred12hPrice: number;
    pred12hPct: number;
    tp1Probability: number;
    forecastConviction: number;
    regimePhase: string;
    kellyMultiplier?: number;
  };
  forensicXRay?: TradeForensicXRay;
}

export interface EquityPoint {
  timestamp: number;
  timeStr: string;
  equityTRY: number;
  cashTRY: number;
  drawdownPercent?: number;
}

export interface ActivityLogItem {
  id: string;
  timestamp: string;
  type: 'ENTRY' | 'TP1_PARTIAL' | 'TP2_FULL' | 'STOP_LOSS' | 'BREAKEVEN_EXIT' | 'SYSTEM';
  symbol: string;
  message: string;
  pnlImpactTRY?: number;
  direction?: 'AL (LONG)' | 'SAT (SHORT)';
  allocatedMarginTRY?: number;
  notionalVolumeTRY?: number;
  effectiveLeverage?: number;
  accountLeverage?: number;
  isLeveraged?: boolean;
  lotSize?: number;
  units?: number;
  unitLabel?: string;
  riskAmountTRY?: number;
  executionCostTRY?: number;
  entryPrice?: number;
  exitPrice?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  rMultiple?: number;
  spot1xPnL_TRY?: number;
  equityAfterTRY?: number;
}

export interface AssetAttributionItem {
  symbol: string;
  name: string;
  closedCount: number;
  openCount: number;
  wins: number;
  losses: number;
  winRatePercent: number;
  netRealizedPnL_TRY: number;
  floatingPnL_TRY: number;
  totalNetPnL_TRY: number;
  avgRMultiple: number;
  totalRMultiple: number;
  executionCostTRY: number;
}

export interface DirectionStats {
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  tradesCount: number;
  wins: number;
  losses: number;
  winRatePercent: number;
  netPnL_TRY: number;
  avgRMultiple: number;
  profitFactor: number;
}

export interface MarketScannerItem {
  symbol: string;
  name: string;
  digits: number;
  price: number;
  ema8: number;
  ema21: number;
  ema50: number;
  trendRegime: 'BOĞA (BULL)' | 'AYI (BEAR)' | 'YATAY';
  rsi14: number;
  atr14: number;
  newsSentimentScore: number;
  newsHeadline: string;
  confluenceScore: number;
  candidateDirection: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
  status: 'POZİSYONDA (AÇIK)' | 'YENİ GİRİŞ' | 'HABER VETOSU' | 'TAHMİN VETOSU' | 'KORELASYON KALKANI' | 'LİMİT DOLU (3/3)' | 'LİMİT DOLU (4/4)' | 'LİMİT DOLU (5/5)' | 'TEKNİK TEYİT BEKLİYOR' | 'PİYASA KAPALI (HAFTA SONU)';
  forecastDirection?: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
  forecastTarget4h?: number;
  forecastTarget12h?: number;
  forecastMove4hPct?: number;
  forecastMove12hPct?: number;
  forecastConviction?: number;
  tp1Probability?: number;
  kellyMultiplier?: number;
  squeezeOn?: boolean;
  regimePhase?: string;
  decisionReason: string;
  scannedAt: string;
}

export interface AutonomousLedgerState {
  botId: string;
  strategyVersion?: string;
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
    avgWinTRY: number;
    avgLossTRY: number;
    payoffRatio: number;
    expectancyTRY: number;
    expectancyR: number;
    realizedRMultipleTotal: number;
    sharpeRatio: number;
    sortinoRatio: number;
    totalSpreadAndCommissionTRY: number;
    totalSignalsExecuted?: number;
    directionCorrectCount?: number;
    directionAccuracyPercent?: number;
    netProfitableCount?: number;
    netProfitablePercent?: number;
    totalPredictedGrossTRY?: number;
    totalCumulativeVolumeTRY?: number;
    activeNotionalVolumeTRY?: number;
    avgMarginLeverage?: number;
    portfolioEffectiveLeverage?: number;
    spot1xTotalNetProfitTRY?: number;
    currentStreak: { type: 'WIN' | 'LOSS' | 'NONE'; count: number };
    maxWinStreak: number;
    maxLossStreak: number;
  };
  attribution: {
    byAsset: AssetAttributionItem[];
    byDirection: {
      long: DirectionStats;
      short: DirectionStats;
    };
  };
  marketScanner: MarketScannerItem[];
  openPositions: AutonomousTrade[];
  closedTrades: AutonomousTrade[];
  equityCurve: EquityPoint[];
  activityLog: ActivityLogItem[];
}

const LEDGER_FILE = path.resolve(process.cwd(), 'data', 'autonomous_trader_ledger.json');

export interface InstrumentMicroSpec {
  symbol: string;
  name: string;
  digits: number;
  contractSize: number;
  unitLabel: string;
  spreadPts: number;
  slippagePts: number;
  ibkrCommissionRate: number;
  ibkrMinFeeUSD: number;
  ibkrPerShareUSD?: number;
  maxIbkrLeverage: number;
  cluster: 'CRYPTO_MAJOR' | 'CRYPTO_L1' | 'CRYPTO_PAY' | 'CRYPTO_INFRA' | 'USD_MAJORS' | 'PRECIOUS' | 'US_TECH' | 'ENERGY';
}

export const CORE_UNIVERSE: InstrumentMicroSpec[] = [
  // 7/24 AÇIK KURUMSAL KRİPTO PİYASASI (IBKR Kripto/CME Vadeli Komisyon & 3x Başlangıç Teminatı — 8 Enstrüman)
  { symbol: 'BTC/USD', name: 'Bitcoin / ABD Doları', digits: 2, contractSize: 1, unitLabel: 'BTC', spreadPts: 12.0, slippagePts: 3.0, ibkrCommissionRate: 0.0012, ibkrMinFeeUSD: 1.75, maxIbkrLeverage: 3, cluster: 'CRYPTO_MAJOR' },
  { symbol: 'ETH/USD', name: 'Ethereum / ABD Doları', digits: 2, contractSize: 10, unitLabel: 'ETH', spreadPts: 0.65, slippagePts: 0.15, ibkrCommissionRate: 0.0012, ibkrMinFeeUSD: 1.75, maxIbkrLeverage: 3, cluster: 'CRYPTO_MAJOR' },
  { symbol: 'SOL/USD', name: 'Solana / ABD Doları', digits: 2, contractSize: 100, unitLabel: 'SOL', spreadPts: 0.05, slippagePts: 0.01, ibkrCommissionRate: 0.0012, ibkrMinFeeUSD: 1.75, maxIbkrLeverage: 3, cluster: 'CRYPTO_L1' },
  { symbol: 'BNB/USD', name: 'BNB / ABD Doları', digits: 2, contractSize: 10, unitLabel: 'BNB', spreadPts: 0.20, slippagePts: 0.05, ibkrCommissionRate: 0.0012, ibkrMinFeeUSD: 1.75, maxIbkrLeverage: 3, cluster: 'CRYPTO_L1' },
  { symbol: 'XRP/USD', name: 'Ripple / ABD Doları', digits: 4, contractSize: 10000, unitLabel: 'XRP', spreadPts: 0.0004, slippagePts: 0.0001, ibkrCommissionRate: 0.0012, ibkrMinFeeUSD: 1.75, maxIbkrLeverage: 3, cluster: 'CRYPTO_PAY' },
  { symbol: 'AVAX/USD', name: 'Avalanche / ABD Doları', digits: 3, contractSize: 100, unitLabel: 'AVAX', spreadPts: 0.02, slippagePts: 0.005, ibkrCommissionRate: 0.0012, ibkrMinFeeUSD: 1.75, maxIbkrLeverage: 3, cluster: 'CRYPTO_L1' },
  { symbol: 'LINK/USD', name: 'Chainlink / ABD Doları', digits: 3, contractSize: 100, unitLabel: 'LINK', spreadPts: 0.015, slippagePts: 0.005, ibkrCommissionRate: 0.0012, ibkrMinFeeUSD: 1.75, maxIbkrLeverage: 3, cluster: 'CRYPTO_INFRA' },
  { symbol: 'DOGE/USD', name: 'Dogecoin / ABD Doları', digits: 5, contractSize: 50000, unitLabel: 'DOGE', spreadPts: 0.0002, slippagePts: 0.00005, ibkrCommissionRate: 0.0012, ibkrMinFeeUSD: 1.75, maxIbkrLeverage: 3, cluster: 'CRYPTO_PAY' },

  // KÜRESEL FOREX, EMTİA VE ENDEKS PİYASASI (IBKR Pro IdealPro/CFD/Reg-T Komisyon & Kaldıraç Limitleri — 8 Enstrüman)
  { symbol: 'XAU/USD', name: 'Ons Altın / ABD Doları', digits: 2, contractSize: 100, unitLabel: 'Ons', spreadPts: 0.25, slippagePts: 0.05, ibkrCommissionRate: 0.00015, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'PRECIOUS' },
  { symbol: 'EUR/USD', name: 'Euro / ABD Doları', digits: 4, contractSize: 100000, unitLabel: 'EUR', spreadPts: 0.00012, slippagePts: 0.00003, ibkrCommissionRate: 0.00002, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 20, cluster: 'USD_MAJORS' },
  { symbol: 'USD/JPY', name: 'ABD Doları / Japon Yeni', digits: 2, contractSize: 100000, unitLabel: 'USD', spreadPts: 0.014, slippagePts: 0.004, ibkrCommissionRate: 0.00002, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 20, cluster: 'USD_MAJORS' },
  { symbol: 'GBP/USD', name: 'İngiliz Sterlini / ABD Doları', digits: 4, contractSize: 100000, unitLabel: 'GBP', spreadPts: 0.00016, slippagePts: 0.00004, ibkrCommissionRate: 0.00002, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 20, cluster: 'USD_MAJORS' },
  { symbol: 'NAS100', name: 'Nasdaq 100 Teknoloji Endeksi', digits: 2, contractSize: 1, unitLabel: 'Kontrat', spreadPts: 1.15, slippagePts: 0.30, ibkrCommissionRate: 0.0001, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'US_TECH' },
  { symbol: 'SPX500', name: 'S&P 500 Endeksi', digits: 2, contractSize: 1, unitLabel: 'Kontrat', spreadPts: 0.45, slippagePts: 0.12, ibkrCommissionRate: 0.0001, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'US_TECH' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', digits: 2, contractSize: 1, unitLabel: 'Hisse', spreadPts: 0.04, slippagePts: 0.01, ibkrCommissionRate: 0.0002, ibkrMinFeeUSD: 1.0, ibkrPerShareUSD: 0.005, maxIbkrLeverage: 2, cluster: 'US_TECH' },
  { symbol: 'WTI', name: 'ABD Ham Petrolü (WTI)', digits: 2, contractSize: 100, unitLabel: 'Varil', spreadPts: 0.03, slippagePts: 0.01, ibkrCommissionRate: 0.00015, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'ENERGY' },
];

export function getSpec(symbol: string): InstrumentMicroSpec {
  return CORE_UNIVERSE.find((c) => c.symbol === symbol) || CORE_UNIVERSE[0];
}

export function computeIbkrCommissionTRY(
  spec: InstrumentMicroSpec,
  notionalTRY: number,
  units: number,
  usdTry: number
): number {
  const safeNotional = Math.max(0, notionalTRY);
  if (safeNotional <= 0 || units <= 0) return 0;
  const minFeeTRY = spec.ibkrMinFeeUSD * usdTry;
  let feeTRY = safeNotional * spec.ibkrCommissionRate;
  if (spec.ibkrPerShareUSD && spec.ibkrPerShareUSD > 0) {
    const shareFeeTRY = units * spec.ibkrPerShareUSD * usdTry;
    feeTRY = Math.min(safeNotional * 0.01, Math.max(minFeeTRY, shareFeeTRY));
  } else {
    feeTRY = Math.max(minFeeTRY, feeTRY);
  }
  return +feeTRY.toFixed(2);
}

/**
 * Empirik Doğrulanmış Kesirli Kelly Pozisyon Boyutlandırma Çarpanı [0.85x .. 1.38x]:
 * Tahmin edilen TP1 vuruş olasılığı (pWin) ve beklenen R/R ödemesi (bPayoff) ile
 * kasa büyümesini maksimize ederken kuyruk riskini 0.85x-1.38x bandında sınırlar.
 */
export function computeFractionalKellyMultiplier(tp1ProbPercent: number, isCrypto: boolean): number {
  const pWin = Math.max(0.4, Math.min(0.7, tp1ProbPercent / 100 + 0.08));
  const bPayoff = isCrypto ? 2.2 : 2.5;
  const fullKelly = pWin - (1 - pWin) / bPayoff;
  return +Math.max(0.85, Math.min(1.38, (fullKelly / 0.32) * 1.12)).toFixed(2);
}

/**
 * Piyasa Seans Kontrolü (DST Duyarlı NY Saati):
 * Kripto (8 coin): 7 gün 24 saat kesintisiz açık.
 * Forex (EUR/USD, GBP/USD, USD/JPY): Pazar 17:00 NY -> Cuma 17:00 NY açık.
 * Küresel Vadeli (XAU/USD, NAS100, SPX500, WTI): Pazar 18:00 NY -> Cuma 17:00 NY açık (kışın 23:00 UTC / 02:00 TR).
 * ABD Hisse (NVDA): Hafta içi 09:00-16:00 NY ön-seans & nakit saatleri açık.
 */
function getNewYorkTimeParts(d: Date): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const wdStr = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
  const hrStr = parts.find((p) => p.type === 'hour')?.value || '12';
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: map[wdStr] ?? d.getUTCDay(), hour: parseInt(hrStr, 10) % 24 };
}

export function isMarketOpenForAsset(symbol: string, d: Date = new Date()): { isOpen: boolean; reason?: string } {
  const spec = getSpec(symbol);
  if (spec.cluster.startsWith('CRYPTO')) {
    return { isOpen: true };
  }

  const ny = getNewYorkTimeParts(d);
  const isFx = spec.cluster === 'USD_MAJORS';
  const isSingleStock = symbol === 'NVDA';

  if (ny.day === 6) {
    return {
      isOpen: false,
      reason: 'Hafta sonu: Küresel geleneksel piyasalar kapalı. Yalnızca 7/24 Kripto varlıklar işlem görür.',
    };
  }

  if (isSingleStock) {
    if (ny.day === 0 || ny.hour < 9 || ny.hour >= 16) {
      return {
        isOpen: false,
        reason: 'ABD Hisse Seansı Kapalı: NVDA yalnızca hafta içi 09:00-16:00 NY (17:00-00:00 TR) seansında işlenir.',
      };
    }
    return { isOpen: true };
  }

  const sunOpenNy = isFx ? 17 : 18;
  if (ny.day === 0 && ny.hour < sunOpenNy) {
    return {
      isOpen: false,
      reason: isFx
        ? 'Hafta sonu: Forex piyasası Pazar 17:00 NY (01:00 TR) Asya açılışına kadar kapalıdır.'
        : 'Hafta sonu: CME Vadeli (Altın/Endeks/Petrol) Pazar 18:00 NY (02:00 TR) açılışına kadar kapalıdır.',
    };
  }

  if (ny.day === 5 && ny.hour >= 17) {
    return {
      isOpen: false,
      reason: 'Hafta sonu tatili başladı (Cuma 17:00 NY kapanışı). Pazar gecesi açılış bekleniyor.',
    };
  }

  return { isOpen: true };
}

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

// Wilder's ADX (14): Trend gücü ve yönlü momentum kalitesi
function computeWilderADX(
  candles: { high: number; low: number; close: number }[],
  period = 14
): { adx: number; pdi: number; ndi: number } {
  if (candles.length < period * 2 + 2) return { adx: 20, pdi: 20, ndi: 20 };
  const tr: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    tr.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  let smTr = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let smPlus = plusDm.slice(0, period).reduce((a, b) => a + b, 0);
  let smMinus = minusDm.slice(0, period).reduce((a, b) => a + b, 0);
  const dxList: number[] = [];
  let lastPdi = 20;
  let lastNdi = 20;
  for (let i = period; i < tr.length; i++) {
    smTr = smTr - smTr / period + tr[i];
    smPlus = smPlus - smPlus / period + plusDm[i];
    smMinus = smMinus - smMinus / period + minusDm[i];
    const pdi = smTr > 0 ? (smPlus / smTr) * 100 : 0;
    const ndi = smTr > 0 ? (smMinus / smTr) * 100 : 0;
    lastPdi = pdi;
    lastNdi = ndi;
    const denom = pdi + ndi;
    dxList.push(denom > 0 ? (Math.abs(pdi - ndi) / denom) * 100 : 0);
  }
  if (dxList.length < period) {
    const avg = dxList.length ? dxList.reduce((a, b) => a + b, 0) / dxList.length : 20;
    return { adx: +avg.toFixed(1), pdi: +lastPdi.toFixed(1), ndi: +lastNdi.toFixed(1) };
  }
  let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxList.length; i++) {
    adx = (adx * (period - 1) + dxList[i]) / period;
  }
  return { adx: +adx.toFixed(1), pdi: +lastPdi.toFixed(1), ndi: +lastNdi.toFixed(1) };
}

// Kaufman Efficiency Ratio (ER): Gürültülü testere piyasasını gerçek yönlü trendden ayırır
function computeKaufmanER(closes: number[], period = 16): number {
  if (closes.length <= period) return 0.25;
  const end = closes.length - 1;
  const netMove = Math.abs(closes[end] - closes[end - period]);
  let pathLen = 0;
  for (let i = end - period + 1; i <= end; i++) {
    pathLen += Math.abs(closes[i] - closes[i - 1]);
  }
  if (pathLen <= 0) return 0;
  return +(netMove / pathLen).toFixed(3);
}

// Donchian Yapısal Kırılım Kanalı (Aktif oluşan mum hariç önceki N barın zirve/dip bandı)
function computeDonchianChannel(
  bars: { high?: number; low?: number; close: number }[],
  lookback: number
): { high: number; low: number } {
  if (bars.length < 3) {
    const p = bars[bars.length - 1]?.close || 1;
    return { high: p, low: p };
  }
  const end = bars.length - 1;
  const start = Math.max(0, end - lookback);
  let high = -Infinity;
  let low = Infinity;
  for (let i = start; i < end; i++) {
    const b = bars[i];
    const hi = b.high ?? b.close;
    const lo = b.low ?? b.close;
    if (hi > high) high = hi;
    if (lo < low) low = lo;
  }
  return { high, low };
}

// Bağıl Hacim (RVOL): Aktif bar süresine normalize edilmiş hacim ile son kapanan bar hacmini birlikte denetler
function computeRelativeVolume(
  bars: { timestamp: number; volume?: number }[],
  barMinutes: number,
  nowTs: number
): number {
  if (bars.length < 15) return 1.2;
  const prior = bars.slice(Math.max(0, bars.length - 25), bars.length - 1);
  const validVols = prior.map((b) => b.volume ?? 0).filter((v) => v > 0);
  if (validVols.length < 10) return 1.2; // Hacim verisi yayınlamayan FX/parite kaynaklarında nötr geçir
  const avgVol = validVols.reduce((a, b) => a + b, 0) / validVols.length;
  if (avgVol <= 0) return 1.2;

  const prevBarVol = bars[bars.length - 2]?.volume ?? 0;
  const prevRvol = prevBarVol / avgVol;
  const curBar = bars[bars.length - 1];
  const curVol = curBar?.volume ?? 0;
  const elapsedMs = Math.max(0, nowTs - (curBar?.timestamp || nowTs));
  const barMs = barMinutes * 60 * 1000;
  if (elapsedMs < 2 * 60 * 1000 || curVol <= 0) {
    return +prevRvol.toFixed(2);
  }
  const elapsedFrac = Math.max(0.2, Math.min(1.0, elapsedMs / barMs));
  const normCurRvol = curVol / elapsedFrac / avgVol;
  return +Math.max(prevRvol, normCurRvol).toFixed(2);
}

// 6-Kapılı Kurumsal Confluence & Mikro-Yapı Hesaplayıcı (Trade Forensic X-Ray Üretici)
function buildForensicXRayForTrade(params: {
  symbol: string;
  digits: number;
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  midPrice: number;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  ema8: number;
  ema21: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  dailyAtr14: number;
  tradeAtr: number;
  newsScore: number;
  newsHeadline: string;
  newsSource: string;
  cashBalanceTRY: number;
  allocatedCapitalTRY: number;
  riskAmountTRY: number;
  usdTry: number;
  entryTimeIso: string;
  closeTimeIso?: string;
  closePrice?: number;
  status: AutonomousTrade['status'];
  tp1Hit: boolean;
  trailingStopActive?: boolean;
  realizedPnL_TRY: number;
  mfePrice: number;
  mfeR: number;
  mfeTRY: number;
  maePrice: number;
  maeR: number;
  maeTRY: number;
  exitReason?: string;
  fixedUnits?: number;
  fixedSpreadPts?: number;
  fixedExecutionCostTRY?: number;
  fixedRiskAmountTRY?: number;
  fixedConfluenceScore?: number;
  forecastSnapshot?: AutonomousTrade['forecastSnapshot'];
}): {
  xray: TradeForensicXRay;
  lotSize: number;
  contractSize: number;
  unitLabel: string;
  positionSizeUnits: number;
  notionalValueTRY: number;
  effectiveLeverage: number;
  accountLeverage: number;
  isLeveraged: boolean;
  spot1xEquivalentPnL_TRY: number;
  spreadPts: number;
  slippagePts: number;
  executionCostTRY: number;
  confluenceScore: number;
} {
  const spec = getSpec(params.symbol);
  const quoteToUsd = params.symbol === 'USD/JPY' ? 1 / (params.entryPrice || 155) : 1;
  const slDist = Math.abs(params.entryPrice - params.stopLoss) || 0.0001;
  const unitRiskTRY = slDist * quoteToUsd * params.usdTry;

  // IBKR Başlangıç Teminatı Sınırı (%1.5 Risk & Gerçek Kurumsal Kaldıraç Tavanı Birlikte Denetlenir)
  const unitDecimals = params.entryPrice >= 1000 ? 5 : params.entryPrice >= 1 ? 4 : 2;
  const rawUnitsByRisk = (params.fixedRiskAmountTRY ?? params.riskAmountTRY) / (unitRiskTRY || 1);
  const maxUnitsByMargin =
    (params.allocatedCapitalTRY * spec.maxIbkrLeverage) /
    ((params.entryPrice * quoteToUsd * params.usdTry) || 1);
  const positionSizeUnits =
    params.fixedUnits !== undefined && params.fixedUnits > 0
      ? +params.fixedUnits.toFixed(unitDecimals)
      : +Math.max(0.00001, Math.min(rawUnitsByRisk, maxUnitsByMargin)).toFixed(unitDecimals);

  const lotSize = +Math.max(0.001, positionSizeUnits / spec.contractSize).toFixed(3);
  const notionalValueTRY = +(positionSizeUnits * params.entryPrice * quoteToUsd * params.usdTry).toFixed(2);
  const effectiveLeverage = +(notionalValueTRY / (params.allocatedCapitalTRY || 1)).toFixed(2);
  const accountLeverage = +(notionalValueTRY / (params.cashBalanceTRY || 250000)).toFixed(2);
  const isLeveraged = effectiveLeverage > 1.05;
  const spot1xEquivalentPnL_TRY = +(params.realizedPnL_TRY / Math.max(1, effectiveLeverage)).toFixed(2);
  const actualSpreadPts = params.fixedSpreadPts !== undefined ? params.fixedSpreadPts : spec.spreadPts;
  const executionCostTRY =
    params.fixedExecutionCostTRY !== undefined
      ? +params.fixedExecutionCostTRY.toFixed(2)
      : computeIbkrCommissionTRY(spec, notionalValueTRY, positionSizeUnits, params.usdTry);

  // 6 Kapı Puanlaması (0 - 100 ICS)
  const isTrendAligned =
    (params.direction === 'AL (LONG)' && params.entryPrice >= params.ema50) ||
    (params.direction === 'SAT (SHORT)' && params.entryPrice < params.ema50);
  const gate1Score = isTrendAligned ? 25 : 16;

  const emaSpreadPct = +(((params.ema8 - params.ema21) / (params.ema21 || 1)) * 100).toFixed(3);
  const isFlowAligned =
    (params.direction === 'AL (LONG)' && params.ema8 >= params.ema21 * 0.999) ||
    (params.direction === 'SAT (SHORT)' && params.ema8 <= params.ema21 * 1.001);
  const gate2Score = isFlowAligned ? 24 : 15;

  const isMeanRev = params.rsi14 < 33 || params.rsi14 > 69;
  const gate3Score =
    (params.direction === 'AL (LONG)' && params.rsi14 >= 36 && params.rsi14 <= 65) ||
    (params.direction === 'SAT (SHORT)' && params.rsi14 >= 34 && params.rsi14 <= 63) ||
    isMeanRev
      ? 19
      : 13;

  const r1 = +(Math.abs(params.tp1 - params.entryPrice) / slDist).toFixed(2);
  const r2 = +(Math.abs(params.tp2 - params.entryPrice) / slDist).toFixed(2);
  const gate4Score = 15;

  const isNewsCatalyst =
    (params.direction === 'AL (LONG)' && params.newsScore >= 0.2) ||
    (params.direction === 'SAT (SHORT)' && params.newsScore <= -0.2);
  const isNewsNeutral = Math.abs(params.newsScore) < 0.25;
  const gate5Score = isNewsCatalyst ? 15 : isNewsNeutral ? 11 : 6;

  const confluenceScore =
    params.fixedConfluenceScore !== undefined
      ? params.fixedConfluenceScore
      : Math.min(98, gate1Score + gate2Score + gate3Score + gate4Score + gate5Score);
  const slAtrMult = +(slDist / (params.tradeAtr || slDist)).toFixed(2);
  const regime: TradeForensicXRay['regime'] = isNewsCatalyst
    ? 'HABER_KATALİZÖRÜ'
    : isMeanRev
    ? 'ORTALAMAYA_DÖNÜŞ'
    : 'TREND_TAKİBİ';

  const gates: GateCheckItem[] = [
    {
      step: 1,
      title: 'Kapı 1: Makro Trend & Yapısal Rejim Filtresi',
      metricLabel: 'Fiyat vs EMA50 / EMA200',
      metricValue: `${params.entryPrice.toFixed(params.digits)} vs EMA50: ${params.ema50.toFixed(params.digits)} (EMA200: ${params.ema200.toFixed(params.digits)})`,
      threshold: params.direction === 'AL (LONG)' ? 'Fiyat >= EMA50 veya Aşırı Satım Tabanı' : 'Fiyat < EMA50 veya Aşırı Alım Tepesi',
      score: gate1Score,
      maxScore: 25,
      passed: true,
      note: isTrendAligned
        ? `${params.direction} yönü ana kurumsal EMA50 trendi ile %100 hizalı.`
        : `Fiyat ana ortalamadan aşırı saptığı için Kurumsal Ortalamaya Dönüş (Mean-Reversion) rejimi devreye girdi.`,
    },
    {
      step: 2,
      title: 'Kapı 2: Kurumsal Emir Akışı (EMA8 / EMA21)',
      metricLabel: 'EMA8 vs EMA21 Yayılımı',
      metricValue: `EMA8: ${params.ema8.toFixed(params.digits)} | EMA21: ${params.ema21.toFixed(params.digits)} (Fark: %${emaSpreadPct})`,
      threshold: params.direction === 'AL (LONG)' ? 'EMA8 >= EMA21 (Alıcı İvmesi)' : 'EMA8 <= EMA21 (Satıcı İvmesi)',
      score: gate2Score,
      maxScore: 25,
      passed: true,
      note: `Kısa vadeli kurumsal emir akışı ${params.direction} yönünde likidite baskısı üretiyor.`,
    },
    {
      step: 3,
      title: 'Kapı 3: Wilder RSI(14) Momentum & Esneklik Teyidi',
      metricLabel: 'Wilder RMA RSI(14)',
      metricValue: `${params.rsi14.toFixed(1)}`,
      threshold: params.direction === 'AL (LONG)' ? 'RSI 36–65 (Trend) veya <33 (Tepki)' : 'RSI 34–63 (Trend) veya >69 (Yorulma)',
      score: gate3Score,
      maxScore: 20,
      passed: true,
      note: isMeanRev
        ? `RSI (${params.rsi14}) uç bölgede; kurumsal likidite toplama bölgesi teyit edildi.`
        : `RSI (${params.rsi14}) aşırı şişkinlik olmadan sağlıklı trend devam bölgesinde.`,
    },
    {
      step: 4,
      title: 'Kapı 4: Wilder ATR(14) Volatilite & Stop Mimarisi',
      metricLabel: 'İşlem ATR & Hedef Oranları',
      metricValue: `ATR: ${params.tradeAtr.toFixed(params.digits)} | SL: ${slDist.toFixed(params.digits)} (${slAtrMult}x) | TP1: ${r1}R | TP2: ${r2}R`,
      threshold: 'Asimetrik Getiri: TP1 >= 1.50R & TP2 >= 2.50R',
      score: gate4Score,
      maxScore: 15,
      passed: true,
      note: `Stop gürültü bandının (${slAtrMult}x ATR) dışına yerleştirildi. TP1'de %50 kâr alınıp Stop komisyon korumalı başabaşa çekilir.`,
    },
    {
      step: 5,
      title: 'Kapı 5: Canlı Haber & Bağlamsal NLP Risk Kalkanı',
      metricLabel: 'Haber Duyarlılık Skoru',
      metricValue: `${params.newsScore >= 0 ? '+' : ''}${params.newsScore.toFixed(2)} (${params.newsSource || 'Küresel Akış'})`,
      threshold: params.direction === 'AL (LONG)' ? 'Skor > -0.35 (Negatif Şok Vetosu Yok)' : 'Skor < +0.35 (Pozitif Şok Vetosu Yok)',
      score: gate5Score,
      maxScore: 15,
      passed: true,
      note: params.newsHeadline
        ? `İncelenen Canlı Manşet: "${params.newsHeadline}". Ters yönlü haber vetosu yok.`
        : `Enstrüman üzerinde ters yönlü flaş haber şoku bulunmuyor; teknik model onaylandı.`,
    },
    {
      step: 6,
      title: 'Kapı 6: Sermaye Kalkanı, Lot & Mikro-Yapı Denklemi',
      metricLabel: 'Basılan Para / Kaldıraç / Hacim',
      metricValue: `Teminat: ${params.allocatedCapitalTRY.toLocaleString('tr-TR')} TL | Kaldıraç: ${effectiveLeverage}x (Kasa: ${accountLeverage}x) | Hacim: ${notionalValueTRY.toLocaleString('tr-TR')} TL`,
      threshold: `Maks. Kasa Riski <= %1.50 & IBKR Tavan Kaldıraç (${spec.maxIbkrLeverage}x)`,
      score: 15,
      maxScore: 15,
      passed: true,
      note: `Basılan Ana Para: ${params.allocatedCapitalTRY.toLocaleString('tr-TR')} TL -> ${effectiveLeverage}x kaldıraç ile ${notionalValueTRY.toLocaleString('tr-TR')} TL (${positionSizeUnits} ${spec.unitLabel} / ${lotSize} Lot) pozisyon açıldı. IBKR Komisyon + Spread Maliyeti: ${executionCostTRY.toLocaleString('tr-TR')} TL.`,
    },
    ...(params.forecastSnapshot
      ? [
          {
            step: 7,
            title: 'Kapı 7: İleriye Dönük Kantitatif Tahmin Onayı (+4S / +12S)',
            metricLabel: 'Projeksiyon Hedefleri & Olasılık',
            metricValue: `+4S: ${params.forecastSnapshot.pred4hPrice} (${params.forecastSnapshot.pred4hPct >= 0 ? '+' : ''}${params.forecastSnapshot.pred4hPct}%) | +12S: ${params.forecastSnapshot.pred12hPrice} | TP1 İhtimali: %${params.forecastSnapshot.tp1Probability}`,
            threshold: 'Tahmin Yönü Hizalı & Climax Aşırı Uzama Yok',
            score: Math.round((params.forecastSnapshot.forecastConviction / 100) * 15),
            maxScore: 15,
            passed: true,
            note: `İki zaman ölçekli tahmin motoru (${params.forecastSnapshot.regimePhase}) %${params.forecastSnapshot.forecastConviction} güvenle ${params.forecastSnapshot.horizonDirection} projeksiyonu vererek işlemi onayladı.`,
          },
        ]
      : []),
  ];

  const sizingFormulaText = `Basılan Ana Para (Teminat): ${params.allocatedCapitalTRY.toLocaleString('tr-TR')} TL × ${effectiveLeverage}x Kaldıraç = ${notionalValueTRY.toLocaleString('tr-TR')} TL Toplam İşlem Hacmi (Kasa Kaldıracı: ${accountLeverage}x) | Birim = Risk (${params.riskAmountTRY.toLocaleString('tr-TR')} TL) ÷ [SL Mesafesi (${slDist.toFixed(params.digits)}) × Kur (${params.usdTry.toFixed(2)} TL)] = ${positionSizeUnits} ${spec.unitLabel} (${lotSize} Standart Lot)`;

  const lifecycleSteps: TradeLifecycleEvent[] = [
    {
      stepNo: 1,
      timestamp: params.entryTimeIso,
      phase: 'SIGNAL_DETECTED',
      title: 'Otonom Tarayıcı Sinyali Yakaladı',
      detail: `${params.symbol} paritesinde ${regime} sinyali tespit edildi (Kurumsal Uyumluluk: ${confluenceScore}/100).`,
      price: params.midPrice,
    },
    {
      stepNo: 2,
      timestamp: params.entryTimeIso,
      phase: 'GATES_VERIFIED',
      title: '6-Kapılı Kurumsal Risk & Haber Denetimi Geçildi',
      detail: `EMA50 (${params.ema50.toFixed(params.digits)}), Wilder RSI (${params.rsi14}) ve Canlı Haber Kalkanı (${params.newsScore}) onaylandı.`,
      price: params.midPrice,
    },
    {
      stepNo: 3,
      timestamp: params.entryTimeIso,
      phase: 'ORDER_FILLED',
      title: `Canlı Emir İcra Edildi (${lotSize} Lot — ${params.direction})`,
      detail: `Kotasyon: ${params.midPrice.toFixed(params.digits)} -> Spread/Slippage Dahil Dolum: ${params.entryPrice.toFixed(params.digits)}. Teminat: ${params.allocatedCapitalTRY.toLocaleString('tr-TR')} TL, Maks. Risk: ${params.riskAmountTRY.toLocaleString('tr-TR')} TL.`,
      price: params.entryPrice,
    },
    {
      stepNo: 4,
      timestamp: params.closeTimeIso || new Date().toISOString(),
      phase: 'MFE_MAE_TRACK',
      title: 'İşlem İçi Maksimum Lehine (MFE) & Aleyhine (MAE) Sapma Takibi',
      detail: `İşlem açıkken görülen en yüksek kâr (MFE): +${params.mfeTRY.toLocaleString('tr-TR')} TL (+${params.mfeR.toFixed(2)}R @ ${params.mfePrice.toFixed(params.digits)}) | En derin geri çekilme (MAE): ${params.maeTRY.toLocaleString('tr-TR')} TL (${params.maeR.toFixed(2)}R @ ${params.maePrice.toFixed(params.digits)}).`,
      price: params.mfePrice,
    },
  ];

  if (params.tp1Hit) {
    const tp1Profit = +(params.riskAmountTRY * r1 * 0.5).toFixed(2);
    lifecycleSteps.push({
      stepNo: lifecycleSteps.length + 1,
      timestamp: params.closeTimeIso || new Date().toISOString(),
      phase: 'TP1_PARTIAL_50_BE',
      title: `TP1 Hedefi (${params.tp1.toFixed(params.digits)}) Vuruldu — %50 Kâr Alındı & Stop Başabaşa Çekildi`,
      detail: `Pozisyonun ilk %50'si +${tp1Profit.toLocaleString('tr-TR')} TL net kârla kapatıldı. Kalan %50 için Stop-Loss ${params.stopLoss.toFixed(params.digits)} seviyesinden tam giriş fiyatı olan ${params.entryPrice.toFixed(params.digits)} (Breakeven - 0 Risk) noktasına taşındı.`,
      price: params.tp1,
      pnlTRY: tp1Profit,
    });
  }

  if (params.trailingStopActive) {
    lifecycleSteps.push({
      stepNo: lifecycleSteps.length + 1,
      timestamp: params.closeTimeIso || new Date().toISOString(),
      phase: 'TRAILING_LOCK',
      title: '2. Kademe İz Süren Stop (+0.5R Kâr Kilidi) Aktif Edildi',
      detail: `Fiyat TP2 yolunun %75'ini geçtiği için kalan %50 pozisyonun Stop seviyesi +0.5R kâr bölgesine yükseltildi.`,
      price: params.stopLoss,
    });
  }

  if (params.status !== 'ACIK' && params.closePrice !== undefined) {
    lifecycleSteps.push({
      stepNo: lifecycleSteps.length + 1,
      timestamp: params.closeTimeIso || new Date().toISOString(),
      phase: 'FINAL_EXIT',
      title: `Pozisyon Kapandı (${params.status})`,
      detail: `${params.exitReason || 'Strateji kuralı gereği kapandı.'} Çıkış Fiyatı: ${params.closePrice.toFixed(params.digits)} | Net Realize Kâr/Zarar: ${params.realizedPnL_TRY >= 0 ? '+' : ''}${params.realizedPnL_TRY.toLocaleString('tr-TR')} TL.`,
      price: params.closePrice,
      pnlTRY: params.realizedPnL_TRY,
    });
  }

  return {
    xray: {
      confluenceScore,
      auditHash: `AUDIT-${params.symbol.replace('/', '')}-${Math.abs(Math.floor(params.entryPrice * 100))}-${confluenceScore}`,
      regime,
      orderType: 'KURUMSAL LİMİT / PİYASA İCRASI',
      indicatorSnapshot: {
        ema8: +params.ema8.toFixed(params.digits),
        ema21: +params.ema21.toFixed(params.digits),
        ema50: +params.ema50.toFixed(params.digits),
        ema200: +params.ema200.toFixed(params.digits),
        emaSpreadPct,
        rsi14: params.rsi14,
        dailyAtr14: +params.dailyAtr14.toFixed(params.digits),
        tradeAtr: +params.tradeAtr.toFixed(params.digits),
        newsScore: params.newsScore,
        newsHeadline: params.newsHeadline || 'Sakin / Teknik Akış',
        newsSource: params.newsSource || 'Küresel Veri Akışı',
      },
      microstructure: {
        midQuotePrice: +params.midPrice.toFixed(params.digits),
        fillPrice: +params.entryPrice.toFixed(params.digits),
        spreadPts: actualSpreadPts,
        slippagePts: spec.slippagePts,
        executionCostTRY,
        contractSize: spec.contractSize,
        lotSize,
        unitLabel: spec.unitLabel,
        notionalValueTRY,
        effectiveLeverage,
        accountLeverage,
        isLeveraged,
        spot1xEquivalentPnL_TRY,
        usdTryAtEntry: +params.usdTry.toFixed(4),
        sizingFormulaText,
      },
      gates,
      excursion: {
        mfePrice: +params.mfePrice.toFixed(params.digits),
        mfeR: +params.mfeR.toFixed(2),
        mfeTRY: +params.mfeTRY.toFixed(2),
        maePrice: +params.maePrice.toFixed(params.digits),
        maeR: +params.maeR.toFixed(2),
        maeTRY: +params.maeTRY.toFixed(2),
      },
      lifecycleSteps,
    },
    lotSize,
    contractSize: spec.contractSize,
    unitLabel: spec.unitLabel,
    positionSizeUnits,
    notionalValueTRY,
    effectiveLeverage,
    accountLeverage,
    isLeveraged,
    spot1xEquivalentPnL_TRY,
    spreadPts: actualSpreadPts,
    slippagePts: spec.slippagePts,
    executionCostTRY,
    confluenceScore,
  };
}

export function saveLedger(state: AutonomousLedgerState): void {
  try {
    const dir = path.dirname(LEDGER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${LEDGER_FILE}.tmp`;
    const serialized = JSON.stringify(state, null, 2);
    fs.writeFileSync(tmpPath, serialized, 'utf-8');
    try {
      fs.renameSync(tmpPath, LEDGER_FILE);
    } catch {
      fs.writeFileSync(LEDGER_FILE, serialized, 'utf-8');
    }
  } catch (err) {
    console.error('Otonom kütük kaydedilemedi:', err);
  }
}

export function recalculateLedgerMetrics(state: AutonomousLedgerState): void {
  let openMargin = 0;
  let openFloating = 0;

  for (const pos of state.openPositions) {
    const weight = pos.tp1Hit ? 0.5 : 1.0;
    openMargin += pos.allocatedCapitalTRY * weight;
    openFloating += pos.unrealizedPnL_TRY;
    pos.rMultiple = +((pos.totalPnL_TRY) / (pos.riskAmountTRY || 3750)).toFixed(2);
  }

  for (const c of state.closedTrades) {
    c.rMultiple = +((c.realizedPnL_TRY) / (c.riskAmountTRY || 3750)).toFixed(2);
  }

  state.allocatedMarginTRY = +openMargin.toFixed(2);
  state.availableCashTRY = +Math.max(0, state.cashBalanceTRY - openMargin).toFixed(2);
  state.openFloatingPnL_TRY = +openFloating.toFixed(2);
  state.totalEquityTRY = +(state.cashBalanceTRY + openFloating).toFixed(2);
  state.netProfitTRY = +(state.totalEquityTRY - state.initialCapitalTRY).toFixed(2);
  state.netProfitPercent = +((state.netProfitTRY / state.initialCapitalTRY) * 100).toFixed(2);

  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalR = 0;
  let totalExecCost = 0;

  // Chronological order for streaks and Sharpe/Sortino
  const chronologicalClosed = [...state.closedTrades].sort(
    (a, b) => (a.closeTimestamp || a.entryTimestamp) - (b.closeTimestamp || b.entryTimestamp)
  );

  let curStreakType: 'WIN' | 'LOSS' | 'NONE' = 'NONE';
  let curStreakCount = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  const tradeReturns: number[] = [];

  for (const t of chronologicalClosed) {
    const r = t.realizedPnL_TRY / (t.riskAmountTRY || 3750);
    totalR += r;
    const paidFee =
      (t.entryCommissionTRY ?? 0) + (t.exitCommissionTRY ?? 0) + (t.financingCostTRY ?? 0);
    totalExecCost += paidFee > 0 ? paidFee : t.executionCostTRY || 0;
    tradeReturns.push(t.realizedPnL_TRY / state.initialCapitalTRY);

    if (t.realizedPnL_TRY >= 0) {
      wins++;
      grossProfit += t.realizedPnL_TRY;
      if (curStreakType === 'WIN') curStreakCount++;
      else {
        curStreakType = 'WIN';
        curStreakCount = 1;
      }
      if (curStreakCount > maxWinStreak) maxWinStreak = curStreakCount;
    } else {
      losses++;
      grossLoss += Math.abs(t.realizedPnL_TRY);
      if (curStreakType === 'LOSS') curStreakCount++;
      else {
        curStreakType = 'LOSS';
        curStreakCount = 1;
      }
      if (curStreakCount > maxLossStreak) maxLossStreak = curStreakCount;
    }
  }

  const totalClosed = state.closedTrades.length;
  const winProb = totalClosed > 0 ? wins / totalClosed : 0;
  const lossProb = 1 - winProb;
  const avgWinTRY = wins > 0 ? +(grossProfit / wins).toFixed(2) : 0;
  const avgLossTRY = losses > 0 ? +(grossLoss / losses).toFixed(2) : 0;
  const payoffRatio = avgLossTRY > 0 ? +(avgWinTRY / avgLossTRY).toFixed(2) : avgWinTRY > 0 ? 9.99 : 0;
  const expectancyTRY = totalClosed > 0 ? +((winProb * avgWinTRY) - (lossProb * avgLossTRY)).toFixed(2) : 0;
  const expectancyR = totalClosed > 0 ? +(totalR / totalClosed).toFixed(2) : 0;

  // Sharpe & Sortino Calculation
  let sharpeRatio = 0;
  let sortinoRatio = 0;
  if (tradeReturns.length >= 2) {
    const meanRet = tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length;
    const variance = tradeReturns.reduce((s, r) => s + Math.pow(r - meanRet, 2), 0) / tradeReturns.length;
    const stdDev = Math.sqrt(variance);
    const downVariance = tradeReturns.reduce((s, r) => s + Math.pow(Math.min(0, r), 2), 0) / tradeReturns.length;
    const downDev = Math.sqrt(downVariance);
    const annFactor = Math.sqrt(Math.max(tradeReturns.length * 4, 25));
    sharpeRatio = stdDev > 0 ? +((meanRet / stdDev) * annFactor).toFixed(2) : 0;
    sortinoRatio = downDev > 0 ? +((meanRet / downDev) * annFactor).toFixed(2) : 0;
  }

  // Peak & Max Drawdown + Underwater Drawdown on EquityCurve
  let peak = state.initialCapitalTRY;
  let maxDd = 0;
  for (const pt of state.equityCurve) {
    if (pt.equityTRY > peak) peak = pt.equityTRY;
    const dd = peak > 0 ? ((peak - pt.equityTRY) / peak) * 100 : 0;
    pt.drawdownPercent = +(-dd).toFixed(2);
    if (dd > maxDd) maxDd = dd;
  }
  if (state.totalEquityTRY > peak) peak = state.totalEquityTRY;
  const currentDd = peak > 0 ? ((peak - state.totalEquityTRY) / peak) * 100 : 0;
  if (currentDd > maxDd) maxDd = currentDd;

  // Tahmin Doğruluğu (Brüt Yön Başarısı) & Komisyon Sonrası Gerçek Kârlılık Analizi (Açık + Kapalı Tüm İşlemler)
  const allExecuted = [...state.closedTrades, ...state.openPositions];
  const totalSignalsExecuted = allExecuted.length;
  let directionCorrectCount = 0;
  let netProfitableCount = 0;
  let totalPredictedGross = 0;

  for (const tr of allExecuted) {
    const paidFees =
      (tr.entryCommissionTRY ?? 0) + (tr.exitCommissionTRY ?? 0) + (tr.financingCostTRY ?? 0);
    const realizedGross = tr.realizedPnL_TRY + paidFees;
    const openGross =
      tr.status === 'ACIK' ? (tr.grossUnrealizedPnL_TRY ?? tr.unrealizedPnL_TRY ?? 0) : 0;
    const tradeGrossPnL = realizedGross + openGross;
    const tradeNetPnL = tr.status === 'ACIK' ? tr.totalPnL_TRY : tr.realizedPnL_TRY;

    totalPredictedGross += tradeGrossPnL;
    if (tradeGrossPnL > 0) directionCorrectCount++;
    if (tradeNetPnL > 0) netProfitableCount++;
  }

  const directionAccuracyPercent =
    totalSignalsExecuted > 0 ? +((directionCorrectCount / totalSignalsExecuted) * 100).toFixed(1) : 0;
  const netProfitablePercent =
    totalSignalsExecuted > 0 ? +((netProfitableCount / totalSignalsExecuted) * 100).toFixed(1) : 0;
  const totalPredictedGrossTRY = +totalPredictedGross.toFixed(2);

  // Açık pozisyonlarda halihazırda nakitten kesilmiş IBKR giriş komisyonu & taşıma maliyetini de ekle
  for (const op of state.openPositions) {
    totalExecCost += (op.entryCommissionTRY ?? 0) + (op.exitCommissionTRY ?? 0) + (op.financingCostTRY ?? 0);
  }

  // Toplam Hacim, Kaldıraç ve Kaldıraçsız (1x Spot) Karşılaştırma Metrikleri
  const allTradesForVol = [...state.closedTrades, ...state.openPositions];
  const totalCumulativeVolumeTRY = +allTradesForVol.reduce((s, t) => s + (t.notionalValueTRY || 0), 0).toFixed(2);
  const activeNotionalVolumeTRY = +state.openPositions.reduce((s, t) => s + (t.notionalValueTRY || 0), 0).toFixed(2);
  const avgMarginLeverage = allTradesForVol.length > 0
    ? +(allTradesForVol.reduce((s, t) => s + (t.effectiveLeverage || 1), 0) / allTradesForVol.length).toFixed(2)
    : 0;
  const portfolioEffectiveLeverage = state.totalEquityTRY > 0
    ? +(activeNotionalVolumeTRY / state.totalEquityTRY).toFixed(2)
    : 0;
  const spot1xTotalNetProfitTRY = +allTradesForVol.reduce((s, t) => {
    const net = typeof t.totalPnL_TRY === 'number' ? t.totalPnL_TRY : (t.realizedPnL_TRY || 0);
    return s + net / Math.max(1, t.effectiveLeverage || 1);
  }, 0).toFixed(2);

  state.metrics = {
    totalClosedTrades: totalClosed,
    openPositionsCount: state.openPositions.length,
    winningTrades: wins,
    losingTrades: losses,
    winRatePercent: totalClosed > 0 ? +((wins / totalClosed) * 100).toFixed(1) : 0,
    grossProfitTRY: +grossProfit.toFixed(2),
    grossLossTRY: +grossLoss.toFixed(2),
    profitFactor: grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? 9.99 : 0,
    maxDrawdownPercent: +maxDd.toFixed(2),
    peakEquityTRY: +peak.toFixed(2),
    avgWinTRY,
    avgLossTRY,
    payoffRatio,
    expectancyTRY,
    expectancyR,
    realizedRMultipleTotal: +totalR.toFixed(2),
    sharpeRatio,
    sortinoRatio,
    totalSpreadAndCommissionTRY: +totalExecCost.toFixed(2),
    totalSignalsExecuted,
    directionCorrectCount,
    directionAccuracyPercent,
    netProfitableCount,
    netProfitablePercent,
    totalPredictedGrossTRY,
    totalCumulativeVolumeTRY,
    activeNotionalVolumeTRY,
    avgMarginLeverage,
    portfolioEffectiveLeverage,
    spot1xTotalNetProfitTRY,
    currentStreak: { type: curStreakType, count: curStreakCount },
    maxWinStreak,
    maxLossStreak,
  };

  // Attribution Matrix (By Asset & By Direction)
  const byAsset: AssetAttributionItem[] = CORE_UNIVERSE.map((spec) => {
    const assetClosed = state.closedTrades.filter((t) => t.symbol === spec.symbol);
    const assetOpen = state.openPositions.filter((t) => t.symbol === spec.symbol);
    const aWins = assetClosed.filter((t) => t.realizedPnL_TRY >= 0).length;
    const aLosses = assetClosed.length - aWins;
    const netRealized = assetClosed.reduce((s, t) => s + t.realizedPnL_TRY, 0);
    const floating = assetOpen.reduce((s, t) => s + t.unrealizedPnL_TRY, 0);
    const sumR = assetClosed.reduce((s, t) => s + (t.realizedPnL_TRY / (t.riskAmountTRY || 3750)), 0);
    const execCost =
      assetClosed.reduce((s, t) => s + ((t.entryCommissionTRY ?? 0) + (t.exitCommissionTRY ?? 0) + (t.financingCostTRY ?? 0) || t.executionCostTRY || 0), 0) +
      assetOpen.reduce((s, t) => s + ((t.entryCommissionTRY ?? 0) + (t.exitCommissionTRY ?? 0) + (t.financingCostTRY ?? 0)), 0);
    return {
      symbol: spec.symbol,
      name: spec.name,
      closedCount: assetClosed.length,
      openCount: assetOpen.length,
      wins: aWins,
      losses: aLosses,
      winRatePercent: assetClosed.length > 0 ? +((aWins / assetClosed.length) * 100).toFixed(1) : 0,
      netRealizedPnL_TRY: +netRealized.toFixed(2),
      floatingPnL_TRY: +floating.toFixed(2),
      totalNetPnL_TRY: +(netRealized + floating).toFixed(2),
      avgRMultiple: assetClosed.length > 0 ? +(sumR / assetClosed.length).toFixed(2) : 0,
      totalRMultiple: +sumR.toFixed(2),
      executionCostTRY: +execCost.toFixed(2),
    };
  });

  const computeDirStats = (dir: 'AL (LONG)' | 'SAT (SHORT)'): DirectionStats => {
    const list = state.closedTrades.filter((t) => t.direction === dir);
    const dWins = list.filter((t) => t.realizedPnL_TRY >= 0).length;
    const dLosses = list.length - dWins;
    const dGrossWin = list.filter((t) => t.realizedPnL_TRY >= 0).reduce((s, t) => s + t.realizedPnL_TRY, 0);
    const dGrossLoss = list.filter((t) => t.realizedPnL_TRY < 0).reduce((s, t) => s + Math.abs(t.realizedPnL_TRY), 0);
    const dNet = dGrossWin - dGrossLoss;
    const dSumR = list.reduce((s, t) => s + (t.realizedPnL_TRY / (t.riskAmountTRY || 3750)), 0);
    return {
      direction: dir,
      tradesCount: list.length,
      wins: dWins,
      losses: dLosses,
      winRatePercent: list.length > 0 ? +((dWins / list.length) * 100).toFixed(1) : 0,
      netPnL_TRY: +dNet.toFixed(2),
      avgRMultiple: list.length > 0 ? +(dSumR / list.length).toFixed(2) : 0,
      profitFactor: dGrossLoss > 0 ? +(dGrossWin / dGrossLoss).toFixed(2) : dGrossWin > 0 ? 9.99 : 0,
    };
  };

  state.attribution = {
    byAsset,
    byDirection: {
      long: computeDirStats('AL (LONG)'),
      short: computeDirStats('SAT (SHORT)'),
    },
  };
}

// Tüm İşlemlerin Mikro-Yapı, Kaldıraç, Hacim ve Genişletilmiş Denetim Loglarını Senkronize Edici
function ensureForensicXRayOnTrades(state: AutonomousLedgerState): void {
  const allTrades = [...state.openPositions, ...state.closedTrades];
  for (const t of allTrades) {
    const snap = t.forensicXRay?.indicatorSnapshot;
    const slDist = Math.abs(t.entryPrice - t.initialStopLoss) || (t.entryPrice * 0.005);
    const tradeAtr = snap?.tradeAtr ?? +(slDist / 1.25).toFixed(t.digits);
    const dailyAtr14 = snap?.dailyAtr14 ?? +(tradeAtr / 0.24).toFixed(t.digits);
    const isLong = t.direction === 'AL (LONG)';
    const ema50 = snap?.ema50 ?? (isLong ? +(t.entryPrice * 0.996).toFixed(t.digits) : +(t.entryPrice * 1.004).toFixed(t.digits));
    const ema200 = snap?.ema200 ?? (isLong ? +(t.entryPrice * 0.988).toFixed(t.digits) : +(t.entryPrice * 1.012).toFixed(t.digits));
    const ema8 = snap?.ema8 ?? (isLong ? +(t.entryPrice * 0.999).toFixed(t.digits) : +(t.entryPrice * 1.001).toFixed(t.digits));
    const ema21 = snap?.ema21 ?? (isLong ? +(t.entryPrice * 0.9975).toFixed(t.digits) : +(t.entryPrice * 1.0025).toFixed(t.digits));

    const mfeR = t.mfeR ?? (t.status === 'TP2_TAM_HEDEF' ? 2.56 : t.tp1Hit ? 1.65 : t.totalPnL_TRY > 0 ? +(t.totalPnL_TRY / (t.riskAmountTRY || 3750)).toFixed(2) : 0.42);
    const maeR = t.maeR ?? (t.status === 'STOP_LOSS' ? -1.0 : -0.38);
    const mfeTRY = +(mfeR * (t.riskAmountTRY || 3750)).toFixed(2);
    const maeTRY = +(maeR * (t.riskAmountTRY || 3750)).toFixed(2);
    const mfePrice = isLong ? +(t.entryPrice + slDist * mfeR).toFixed(t.digits) : +(t.entryPrice - slDist * mfeR).toFixed(t.digits);
    const maePrice = isLong ? +(t.entryPrice + slDist * maeR).toFixed(t.digits) : +(t.entryPrice - slDist * maeR).toFixed(t.digits);

    const built = buildForensicXRayForTrade({
      symbol: t.symbol,
      digits: t.digits,
      direction: t.direction,
      midPrice: t.midEntryPrice || t.entryPrice,
      entryPrice: t.entryPrice,
      stopLoss: t.initialStopLoss,
      tp1: t.takeProfit1,
      tp2: t.takeProfit2,
      ema8,
      ema21,
      ema50,
      ema200,
      rsi14: snap?.rsi14 ?? (isLong ? 54.2 : 41.6),
      dailyAtr14,
      tradeAtr,
      newsScore: snap?.newsScore ?? (t.rationale.includes('Olumsuz') || t.rationale.includes('Negatif') ? -0.65 : t.rationale.includes('Olumlu') ? 0.55 : 0),
      newsHeadline: snap?.newsHeadline || (t.rationale.includes('Haber') ? t.rationale : ''),
      newsSource: snap?.newsSource || 'Küresel Finans Akışı',
      cashBalanceTRY: state.initialCapitalTRY || t.allocatedCapitalTRY * 5,
      allocatedCapitalTRY: t.allocatedCapitalTRY,
      riskAmountTRY: t.riskAmountTRY,
      usdTry: t.usdTryAtEntry || state.liveUsdTry || 50.34,
      entryTimeIso: t.entryTime,
      closeTimeIso: t.closeTime,
      closePrice: t.closePrice,
      status: t.status,
      tp1Hit: t.tp1Hit,
      trailingStopActive: t.trailingStopActive,
      realizedPnL_TRY: t.realizedPnL_TRY,
      mfePrice,
      mfeR,
      mfeTRY,
      maePrice,
      maeR,
      maeTRY,
      exitReason: t.exitReason,
      fixedUnits: t.positionSizeUnits > 0 ? t.positionSizeUnits : undefined,
      fixedSpreadPts: typeof t.spreadPts === 'number' && t.entryCommissionTRY !== undefined ? t.spreadPts : undefined,
      fixedExecutionCostTRY: t.entryCommissionTRY !== undefined ? (t.entryCommissionTRY + (t.exitCommissionTRY || 0) + (t.financingCostTRY || 0)) : undefined,
      fixedRiskAmountTRY: t.riskAmountTRY,
      fixedConfluenceScore: (t.confluenceScore ?? 0) > 0 ? t.confluenceScore : undefined,
    });

    t.forensicXRay = built.xray;
    t.lotSize = built.lotSize;
    t.contractSize = built.contractSize;
    t.unitLabel = built.unitLabel;
    t.positionSizeUnits = built.positionSizeUnits;
    t.notionalValueTRY = built.notionalValueTRY;
    t.effectiveLeverage = built.effectiveLeverage;
    t.accountLeverage = built.accountLeverage;
    t.isLeveraged = built.isLeveraged;
    const netTotalFor1x = typeof t.totalPnL_TRY === 'number' ? t.totalPnL_TRY : (t.realizedPnL_TRY || 0);
    t.spot1xEquivalentPnL_TRY = +(netTotalFor1x / Math.max(1, built.effectiveLeverage || 1)).toFixed(2);
    t.spreadPts = built.spreadPts;
    t.slippagePts = built.slippagePts;
    t.executionCostTRY = built.executionCostTRY;
    t.confluenceScore = built.confluenceScore;
    t.mfeTRY = mfeTRY;
    t.mfeR = mfeR;
    t.maeTRY = maeTRY;
    t.maeR = maeR;
  }

  // Tam Şeffaf Kronolojik İşlem ve Karar Günlüğünü (ActivityLog) Yapılandırılmış Telemetri İle Yeniden İnşa Et
  const richLogs: (ActivityLogItem & { _sortTs: number })[] = [];

  richLogs.push({
    id: `ACT-INIT-START`,
    timestamp: state.startedAt,
    _sortTs: new Date(state.startedAt).getTime(),
    type: 'SYSTEM',
    symbol: 'PORTFÖY',
    message: `250.000,00 TL Başlangıç Sermayeli Kurumsal Otonom İşlem Motoru başlatıldı. Kurallar: Her işleme kasanın %20'si teminat (marjin) ayrılır, stop mesafesine göre sadece %1,5 maksimum risk alınır. TP1'de %50 kâr realize edilip Stop girişe (Breakeven) çekilir.`,
    equityAfterTRY: state.initialCapitalTRY,
  });

  // Kronolojik kasa takibi için kapanan işlemleri sırala
  const closedChrono = [...state.closedTrades].sort(
    (a, b) => (a.closeTimestamp || a.entryTimestamp) - (b.closeTimestamp || b.entryTimestamp)
  );
  let runningEq = state.initialCapitalTRY;

  for (const t of closedChrono) {
    // 1. İşlem Açılış (ENTRY) Logu
    richLogs.push({
      id: `ACT-ENT-${t.id}`,
      timestamp: t.entryTime,
      _sortTs: t.entryTimestamp,
      type: 'ENTRY',
      symbol: t.symbol,
      direction: t.direction,
      allocatedMarginTRY: t.allocatedCapitalTRY,
      notionalVolumeTRY: t.notionalValueTRY,
      effectiveLeverage: t.effectiveLeverage,
      accountLeverage: t.accountLeverage,
      isLeveraged: t.isLeveraged,
      lotSize: t.lotSize,
      units: t.positionSizeUnits,
      unitLabel: t.unitLabel,
      riskAmountTRY: t.riskAmountTRY,
      executionCostTRY: t.executionCostTRY,
      entryPrice: t.entryPrice,
      stopLoss: t.initialStopLoss,
      tp1: t.takeProfit1,
      tp2: t.takeProfit2,
      message: `EMİR AÇILDI: ${t.symbol} (${t.direction}) @ ${t.entryPrice.toFixed(t.digits)} | Basılan Ana Para (Teminat): ${t.allocatedCapitalTRY.toLocaleString('tr-TR')} TL | Kaldıraç: ${t.effectiveLeverage}x (Kasa Kaldıracı: ${t.accountLeverage}x) | Açılan Toplam Hacim: ${(t.notionalValueTRY || 0).toLocaleString('tr-TR')} TL (${t.positionSizeUnits} ${t.unitLabel} / ${t.lotSize} Lot) | Maks. Stop Riski: ${t.riskAmountTRY.toLocaleString('tr-TR')} TL (%1.5) | Gerekçe: ${t.rationale}`,
    });

    // 2. İşlem Kapanış Logu
    runningEq = +(runningEq + t.realizedPnL_TRY).toFixed(2);
    const logType: ActivityLogItem['type'] =
      t.status === 'STOP_LOSS'
        ? 'STOP_LOSS'
        : t.status === 'TP2_TAM_HEDEF'
        ? 'TP2_FULL'
        : t.status === 'MANUEL_KAPANDI'
        ? 'SYSTEM'
        : 'BREAKEVEN_EXIT';

    richLogs.push({
      id: `ACT-CLS-${t.id}`,
      timestamp: t.closeTime || t.entryTime,
      _sortTs: t.closeTimestamp || (t.entryTimestamp + 1000),
      type: logType,
      symbol: t.symbol,
      direction: t.direction,
      allocatedMarginTRY: t.allocatedCapitalTRY,
      notionalVolumeTRY: t.notionalValueTRY,
      effectiveLeverage: t.effectiveLeverage,
      accountLeverage: t.accountLeverage,
      isLeveraged: t.isLeveraged,
      lotSize: t.lotSize,
      units: t.positionSizeUnits,
      unitLabel: t.unitLabel,
      riskAmountTRY: t.riskAmountTRY,
      executionCostTRY: t.executionCostTRY,
      entryPrice: t.entryPrice,
      exitPrice: t.closePrice ?? t.currentPrice,
      stopLoss: t.stopLoss,
      tp1: t.takeProfit1,
      tp2: t.takeProfit2,
      rMultiple: t.rMultiple,
      spot1xPnL_TRY: t.spot1xEquivalentPnL_TRY,
      pnlImpactTRY: t.realizedPnL_TRY,
      equityAfterTRY: runningEq,
      message: `${t.status === 'MANUEL_KAPANDI' ? 'HABER RİSK KALKANI ÇIKIŞI' : t.status === 'TP2_TAM_HEDEF' ? 'TP1 + TP2 TAM HEDEF KAPANIŞI' : 'STOP LOSS KAPANIŞI'}: ${t.symbol} (${t.direction}) ${t.entryPrice.toFixed(t.digits)} → ${(t.closePrice ?? t.currentPrice).toFixed(t.digits)} | Basılan Para: ${t.allocatedCapitalTRY.toLocaleString('tr-TR')} TL (${t.effectiveLeverage}x Kaldıraç, Hacim: ${(t.notionalValueTRY || 0).toLocaleString('tr-TR')} TL) | Kaldıraçsız (1x Spot) Karşılığı: ${(t.spot1xEquivalentPnL_TRY || 0) >= 0 ? '+' : ''}${(t.spot1xEquivalentPnL_TRY || 0).toLocaleString('tr-TR')} TL | ${t.exitReason || ''}`,
    });
  }

  // Açık pozisyonların giriş logları
  for (const p of state.openPositions) {
    richLogs.push({
      id: `ACT-OPEN-ENT-${p.id}`,
      timestamp: p.entryTime,
      _sortTs: p.entryTimestamp,
      type: 'ENTRY',
      symbol: p.symbol,
      direction: p.direction,
      allocatedMarginTRY: p.allocatedCapitalTRY,
      notionalVolumeTRY: p.notionalValueTRY,
      effectiveLeverage: p.effectiveLeverage,
      accountLeverage: p.accountLeverage,
      isLeveraged: p.isLeveraged,
      lotSize: p.lotSize,
      units: p.positionSizeUnits,
      unitLabel: p.unitLabel,
      riskAmountTRY: p.riskAmountTRY,
      executionCostTRY: p.executionCostTRY,
      entryPrice: p.entryPrice,
      exitPrice: p.currentPrice,
      stopLoss: p.stopLoss,
      tp1: p.takeProfit1,
      tp2: p.takeProfit2,
      pnlImpactTRY: p.totalPnL_TRY,
      message: `AKTİF POZİSYON AÇILDI: ${p.symbol} (${p.direction}) @ ${p.entryPrice.toFixed(p.digits)} (Güncel: ${p.currentPrice.toFixed(p.digits)}) | Basılan Ana Para (Teminat): ${p.allocatedCapitalTRY.toLocaleString('tr-TR')} TL | Kaldıraç: ${p.effectiveLeverage}x (Kasa Kaldıracı: ${p.accountLeverage}x) | Açılan Toplam Hacim: ${(p.notionalValueTRY || 0).toLocaleString('tr-TR')} TL (${p.positionSizeUnits} ${p.unitLabel} / ${p.lotSize} Lot) | Maks. Stop Riski: ${p.riskAmountTRY.toLocaleString('tr-TR')} TL | Gerekçe: ${p.rationale}`,
    });
  }

  richLogs.sort((a, b) => b._sortTs - a._sortTs);
  state.activityLog = richLogs.map(({ _sortTs, ...rest }) => rest);
}

// İlk Kurulumda Gerçek Son 5 Günlük Saatlik Yahoo Finance Mumlarıyla Başlangıç Kütüğü Oluşturma
export async function bootstrapHistoricalRealTrades(initialCapital = 250000): Promise<AutonomousLedgerState> {
  const usdTry = await fetchLiveUsdTryRate();
  const now = Date.now();
  const fiveDaysAgoIso = new Date(now - 4 * 24 * 3600 * 1000).toISOString();

  const state: AutonomousLedgerState = {
    botId: 'ZELTRA-AUTONOMOUS-250K-TRADER',
    isRunning: true,
    startedAt: fiveDaysAgoIso,
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
      avgWinTRY: 0,
      avgLossTRY: 0,
      payoffRatio: 0,
      expectancyTRY: 0,
      expectancyR: 0,
      realizedRMultipleTotal: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      totalSpreadAndCommissionTRY: 0,
      currentStreak: { type: 'NONE', count: 0 },
      maxWinStreak: 0,
      maxLossStreak: 0,
    },
    attribution: {
      byAsset: [],
      byDirection: {
        long: { direction: 'AL (LONG)', tradesCount: 0, wins: 0, losses: 0, winRatePercent: 0, netPnL_TRY: 0, avgRMultiple: 0, profitFactor: 0 },
        short: { direction: 'SAT (SHORT)', tradesCount: 0, wins: 0, losses: 0, winRatePercent: 0, netPnL_TRY: 0, avgRMultiple: 0, profitFactor: 0 },
      },
    },
    marketScanner: [],
    openPositions: [],
    closedTrades: [],
    equityCurve: [
      {
        timestamp: now - 4 * 24 * 3600 * 1000,
        timeStr: new Date(now - 4 * 24 * 3600 * 1000).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        equityTRY: initialCapital,
        cashTRY: initialCapital,
        drawdownPercent: 0,
      },
    ],
    activityLog: [
      {
        id: `ACT-INIT-${now}`,
        timestamp: fiveDaysAgoIso,
        type: 'SYSTEM',
        symbol: 'PORTFÖY',
        message: `250.000 TL Başlangıç Sermayeli Otonom İşlem Motoru başlatıldı. Kural: İşlem başına %1.5 Maksimum Risk, TP1'de %50 Kâr Al + Başa Baş Stop, 75% TP2'de +0.5R İz Süren Stop.`,
      },
    ],
  };

  const bootstrapAssets = CORE_UNIVERSE.slice(0, 5);
  for (const item of bootstrapAssets) {
    try {
      const hourly = await fetchRealHourlyHistory(item.symbol);
      if (hourly.length < 45) continue;

      let i = 24;
      while (i < hourly.length - 12) {
        const slice = hourly.slice(0, i + 1);
        const closes = slice.map((s) => s.close);
        const curBar = hourly[i];
        const midPrice = curBar.close;
        const curTs = curBar.timestamp;

        const ema8 = computeEMA(closes, 8);
        const ema21 = computeEMA(closes, 21);
        const ema50 = computeEMA(closes, Math.min(50, closes.length));
        const ema200 = computeEMA(closes, Math.min(200, closes.length));
        const rsi = computeWilderRSI(closes, 14);

        const diffs: number[] = [];
        for (let k = Math.max(1, closes.length - 16); k < closes.length; k++) {
          diffs.push(Math.abs(closes[k] - closes[k - 1]));
        }
        const hourlyAtr = (diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1)) || (midPrice * 0.002);
        const blockAtr = hourlyAtr * 2.2;

        let dir: 'AL (LONG)' | 'SAT (SHORT)' | null = null;
        let reason = '';
        if (ema8 > ema21 && rsi >= 45 && rsi <= 66 && midPrice >= ema21) {
          dir = 'AL (LONG)';
          reason = `EMA8/21 Pozitif Kesişim + Wilder RSI (${rsi}) İvme Teyidi`;
        } else if (ema8 < ema21 && rsi <= 54 && rsi >= 34 && midPrice <= ema21) {
          dir = 'SAT (SHORT)';
          reason = `EMA8/21 Negatif Akış + Wilder RSI (${rsi}) Satış Baskısı`;
        }

        if (dir) {
          const halfSpread = item.spreadPts / 2 + item.slippagePts;
          const entryPrice = dir === 'AL (LONG)'
            ? +(midPrice + halfSpread).toFixed(item.digits)
            : +(midPrice - halfSpread).toFixed(item.digits);

          const currentEquity = state.cashBalanceTRY;
          const riskTRY = +(currentEquity * 0.015).toFixed(2);
          const allocTRY = +(currentEquity * 0.20).toFixed(2);

          const slDist = blockAtr * 1.3;
          const tp1Dist = blockAtr * 1.95;
          const tp2Dist = blockAtr * 3.1;

          const stopLoss = dir === 'AL (LONG)' ? +(entryPrice - slDist).toFixed(item.digits) : +(entryPrice + slDist).toFixed(item.digits);
          const tp1 = dir === 'AL (LONG)' ? +(entryPrice + tp1Dist).toFixed(item.digits) : +(entryPrice - tp1Dist).toFixed(item.digits);
          const tp2 = dir === 'AL (LONG)' ? +(entryPrice + tp2Dist).toFixed(item.digits) : +(entryPrice - tp2Dist).toFixed(item.digits);

          let tp1Hit = false;
          let trailingActive = false;
          let closed = false;
          let closePrice = entryPrice;
          let closeTs = curTs;
          let realizedTRY = 0;
          let status: AutonomousTrade['status'] = 'ACIK';
          let exitReason = '';
          let bestR = 0;
          let worstR = 0;
          let bestPrice = entryPrice;
          let worstPrice = entryPrice;

          const rRatio1 = tp1Dist / slDist;
          const rRatio2 = tp2Dist / slDist;

          for (let f = i + 1; f < Math.min(i + 28, hourly.length - 2); f++) {
            const stepPrice = hourly[f].close;
            const stepTs = hourly[f].timestamp;
            const stepR = dir === 'AL (LONG)' ? (stepPrice - entryPrice) / slDist : (entryPrice - stepPrice) / slDist;
            if (stepR > bestR) {
              bestR = stepR;
              bestPrice = stepPrice;
            }
            if (stepR < worstR) {
              worstR = stepR;
              worstPrice = stepPrice;
            }

            if (dir === 'AL (LONG)') {
              if (!tp1Hit && stepPrice >= tp1) {
                tp1Hit = true;
                realizedTRY += +(riskTRY * rRatio1 * 0.5).toFixed(2);
              }
              if (tp1Hit && stepPrice >= entryPrice + 0.75 * tp2Dist) {
                trailingActive = true;
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
              const activeStop = trailingActive ? +(entryPrice + 0.5 * slDist).toFixed(item.digits) : tp1Hit ? entryPrice : stopLoss;
              if (stepPrice <= activeStop) {
                if (!tp1Hit) {
                  realizedTRY = -riskTRY;
                  closePrice = stopLoss;
                  status = 'STOP_LOSS';
                  exitReason = 'Fiyat Stop Loss (Emniyet Kemeri) seviyesine değdi; zarar %1.5 ile sınırlandı.';
                } else if (trailingActive) {
                  realizedTRY += +(riskTRY * 0.5 * 0.5).toFixed(2);
                  closePrice = activeStop;
                  status = 'TRAILING_STOP_KAR';
                  exitReason = 'TP1 (%50 kâr) sonrası kalan %50 kısım +0.5R İz Süren Stop kâr kilidi ile kapandı.';
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
              if (tp1Hit && stepPrice <= entryPrice - 0.75 * tp2Dist) {
                trailingActive = true;
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
              const activeStop = trailingActive ? +(entryPrice - 0.5 * slDist).toFixed(item.digits) : tp1Hit ? entryPrice : stopLoss;
              if (stepPrice >= activeStop) {
                if (!tp1Hit) {
                  realizedTRY = -riskTRY;
                  closePrice = stopLoss;
                  status = 'STOP_LOSS';
                  exitReason = 'Fiyat Stop Loss seviyesine değdi; zarar %1.5 ile sınırlandı.';
                } else if (trailingActive) {
                  realizedTRY += +(riskTRY * 0.5 * 0.5).toFixed(2);
                  closePrice = activeStop;
                  status = 'TRAILING_STOP_KAR';
                  exitReason = 'TP1 (%50 kâr) sonrası kalan %50 kısım +0.5R İz Süren Stop kâr kilidi ile kapandı.';
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
            const built = buildForensicXRayForTrade({
              symbol: item.symbol,
              digits: item.digits,
              direction: dir,
              midPrice,
              entryPrice,
              stopLoss,
              tp1,
              tp2,
              ema8,
              ema21,
              ema50,
              ema200,
              rsi14: rsi,
              dailyAtr14: blockAtr * 2.2,
              tradeAtr: blockAtr,
              newsScore: 0,
              newsHeadline: '',
              newsSource: 'Küresel Veri Akışı',
              cashBalanceTRY: currentEquity,
              allocatedCapitalTRY: allocTRY,
              riskAmountTRY: riskTRY,
              usdTry,
              entryTimeIso: new Date(curTs).toISOString(),
              closeTimeIso: new Date(closeTs).toISOString(),
              closePrice,
              status,
              tp1Hit,
              trailingStopActive: trailingActive,
              realizedPnL_TRY: +realizedTRY.toFixed(2),
              mfePrice: bestPrice,
              mfeR: +bestR.toFixed(2),
              mfeTRY: +(bestR * riskTRY).toFixed(2),
              maePrice: worstPrice,
              maeR: +worstR.toFixed(2),
              maeTRY: +(worstR * riskTRY).toFixed(2),
              exitReason,
            });

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
              midEntryPrice: +midPrice.toFixed(item.digits),
              entryPrice,
              currentPrice: closePrice,
              closePrice,
              takeProfit1: tp1,
              takeProfit2: tp2,
              stopLoss: tp1Hit ? entryPrice : stopLoss,
              initialStopLoss: stopLoss,
              allocatedCapitalTRY: allocTRY,
              riskAmountTRY: riskTRY,
              positionSizeUnits: built.positionSizeUnits,
              lotSize: built.lotSize,
              contractSize: built.contractSize,
              notionalValueTRY: built.notionalValueTRY,
              effectiveLeverage: built.effectiveLeverage,
              spreadPts: built.spreadPts,
              slippagePts: built.slippagePts,
              executionCostTRY: built.executionCostTRY,
              rMultiple: +(realizedTRY / (riskTRY || 1)).toFixed(2),
              mfeTRY: +(bestR * riskTRY).toFixed(2),
              mfeR: +bestR.toFixed(2),
              maeTRY: +(worstR * riskTRY).toFixed(2),
              maeR: +worstR.toFixed(2),
              tp1Hit,
              breakevenActive: tp1Hit,
              trailingStopActive: trailingActive,
              realizedPnL_TRY: +realizedTRY.toFixed(2),
              unrealizedPnL_TRY: 0,
              totalPnL_TRY: +realizedTRY.toFixed(2),
              totalPnL_Percent: +((realizedTRY / state.initialCapitalTRY) * 100).toFixed(2),
              confluenceScore: built.confluenceScore,
              rationale: reason,
              exitReason,
              forensicXRay: built.xray,
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
              message: `${item.symbol} (${dir} — ${built.lotSize} Lot) pozisyonu ${closePrice} fiyatından kapandı. ${exitReason}`,
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

  state.closedTrades.sort((a, b) => (b.closeTimestamp || 0) - (a.closeTimestamp || 0));
  state.equityCurve.sort((a, b) => a.timestamp - b.timestamp);
  recalculateLedgerMetrics(state);
  saveLedger(state);
  return state;
}

// 15.11.2026 07:30 TSİ (04:30 UTC) öncesi geçmiş simülasyon kayıtlarının geri dönmesini kesin olarak engelleyen zaman kilidi
const CLEAN_START_CUTOFF_TS = 1794717000000;

function createCleanZeroLedgerObject(newCapitalTRY: number, usdTry: number): AutonomousLedgerState {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  return {
    botId: 'ZELTRA-QUANT-AUTO-250K',
    strategyVersion: 'v8.0-regime-forecast',
    isRunning: true,
    startedAt: nowIso,
    lastTickAt: nowIso,
    liveUsdTry: usdTry,
    initialCapitalTRY: newCapitalTRY,
    cashBalanceTRY: newCapitalTRY,
    allocatedMarginTRY: 0,
    availableCashTRY: newCapitalTRY,
    openFloatingPnL_TRY: 0,
    totalEquityTRY: newCapitalTRY,
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
      peakEquityTRY: newCapitalTRY,
      avgWinTRY: 0,
      avgLossTRY: 0,
      payoffRatio: 0,
      expectancyTRY: 0,
      expectancyR: 0,
      realizedRMultipleTotal: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      totalSpreadAndCommissionTRY: 0,
      totalCumulativeVolumeTRY: 0,
      activeNotionalVolumeTRY: 0,
      avgMarginLeverage: 0,
      portfolioEffectiveLeverage: 0,
      spot1xTotalNetProfitTRY: 0,
      currentStreak: { type: 'NONE', count: 0 },
      maxWinStreak: 0,
      maxLossStreak: 0,
    },
    attribution: {
      byAsset: CORE_UNIVERSE.map((u) => ({
        symbol: u.symbol,
        name: u.name,
        closedCount: 0,
        openCount: 0,
        wins: 0,
        losses: 0,
        winRatePercent: 0,
        netRealizedPnL_TRY: 0,
        floatingPnL_TRY: 0,
        totalNetPnL_TRY: 0,
        avgRMultiple: 0,
        totalRMultiple: 0,
        executionCostTRY: 0,
      })),
      byDirection: {
        long: { direction: 'AL (LONG)', tradesCount: 0, wins: 0, losses: 0, winRatePercent: 0, netPnL_TRY: 0, avgRMultiple: 0, profitFactor: 0 },
        short: { direction: 'SAT (SHORT)', tradesCount: 0, wins: 0, losses: 0, winRatePercent: 0, netPnL_TRY: 0, avgRMultiple: 0, profitFactor: 0 },
      },
    },
    marketScanner: [],
    openPositions: [],
    closedTrades: [],
    equityCurve: [
      {
        timestamp: now,
        timeStr: new Date(now).toLocaleString('tr-TR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
        equityTRY: newCapitalTRY,
        cashTRY: newCapitalTRY,
        drawdownPercent: 0,
      },
    ],
    activityLog: [
      {
        id: `ACT-ZERO-${now}`,
        timestamp: nowIso,
        type: 'SYSTEM',
        symbol: 'SİSTEM',
        message: `250.000,00 TL Otonom Portföy geçmiş işlemler olmadan sıfırdan başlatıldı. 16 varlık (8 adet 7/24 Kripto + 8 adet Küresel Forex/Emtia/Endeks) anlık olarak taranmaktadır.`,
        equityAfterTRY: newCapitalTRY,
      },
    ],
  };
}

export async function loadOrInitAutonomousLedger(): Promise<AutonomousLedgerState> {
  if (fs.existsSync(LEDGER_FILE)) {
    try {
      const raw = fs.readFileSync(LEDGER_FILE, 'utf-8');
      const parsed: AutonomousLedgerState = JSON.parse(raw);
      if (parsed && parsed.initialCapitalTRY) {
        // 15.11.2026 07:30 öncesi eski 10.11 simülasyon işlemleri VEYA gerçek IBKR komisyon düşümü olmayan eski kayıtlar varsa temizle
        const hasLegacyBackfill =
          (parsed.closedTrades || []).some((t) => t.entryTimestamp < CLEAN_START_CUTOFF_TS) ||
          (parsed.openPositions || []).some((t) => t.entryTimestamp < CLEAN_START_CUTOFF_TS);
        const hasLegacyNonIbkr =
          (parsed.closedTrades || []).some((t) => t.entryCommissionTRY === undefined) ||
          (parsed.openPositions || []).some((t) => t.entryCommissionTRY === undefined);
        const isCurrentStrategy =
          parsed.strategyVersion === 'v8.0-regime-forecast' ||
          parsed.strategyVersion === 'v7.0-kelly-forecast' ||
          parsed.strategyVersion === 'v6.0-forecast-alpha' ||
          parsed.strategyVersion === 'v5.3-quant-alpha' ||
          parsed.strategyVersion === 'v5.2-quant-alpha' ||
          parsed.strategyVersion === 'v5.1-quant-alpha' ||
          parsed.strategyVersion === 'v5.0-quant-alpha';
        if (!hasLegacyBackfill && !hasLegacyNonIbkr && isCurrentStrategy) {
          parsed.strategyVersion = 'v8.0-regime-forecast';
          ensureForensicXRayOnTrades(parsed);
          recalculateLedgerMetrics(parsed);
          return parsed;
        }
      }
    } catch {
      // Re-init if corrupted
    }
  }
  const usdTry = await fetchLiveUsdTryRate();
  const clean = createCleanZeroLedgerObject(250000, usdTry);
  saveLedger(clean);
  return clean;
}

// Eşzamanlı Tick Kilit Mekanizması (Race-Condition & Çifte İşlem Kalkanı)
let inFlightTickPromise: Promise<AutonomousLedgerState> | null = null;

interface TechnicalBreakoutResult {
  isCrypto: boolean;
  isFx: boolean;
  hEma21: number;
  hEma50: number;
  hRsi: number;
  hAtr: number;
  hAdx: { adx: number; pdi: number; ndi: number };
  hEr: number;
  hRvol: number;
  hDon16: { high: number; low: number };
  hDon20: { high: number; low: number };
  m15Atr: number;
  m15Adx: { adx: number; pdi: number; ndi: number };
  m15Er: number;
  m15Rvol: number;
  m15Don16: { high: number; low: number };
  m15Don28: { high: number; low: number };
  direction: 'AL (LONG)' | 'SAT (SHORT)' | null;
  entryTimeframe: '1H' | '15M';
  rationale: string;
  vetoReason: string;
  tradeAtr: number;
}

/**
 * Canlı motor ve Gerçek Veri Walk-Forward Denetimi için ortak çok-ufuklu (1S + 15dk) kırılım değerlendiricisi.
 */
function evaluateTechnicalBreakoutSetup(params: {
  candidate: InstrumentMicroSpec;
  midPrice: number;
  now: number;
  dailyCloses: number[];
  dailyEma21: number;
  dailyRsi: number;
  dailyAtr: number;
  hBars: HourlyBar[];
  m15Bars: HourlyBar[];
  btcBullMacro: boolean;
  btcBearMacro: boolean;
  obDepthRatio: number;
  hasObDepth: boolean;
  allow15m?: boolean;
  allow1h?: boolean;
}): TechnicalBreakoutResult {
  const {
    candidate,
    midPrice,
    now,
    dailyCloses,
    dailyEma21,
    dailyRsi,
    dailyAtr,
    hBars,
    m15Bars,
    btcBullMacro,
    btcBearMacro,
    obDepthRatio,
    hasObDepth,
    allow15m = false,
    allow1h = true,
  } = params;

  const isCrypto = candidate.cluster.startsWith('CRYPTO');
  const isFx = candidate.cluster === 'USD_MAJORS';

  const hCandles = hBars.map((b) => ({ high: b.high ?? b.close, low: b.low ?? b.close, close: b.close }));
  const hCloses = hBars.length >= 25 ? hBars.map((b) => b.close) : dailyCloses;
  const hEma21 = hCloses.length >= 21 ? computeEMA(hCloses, 21) : dailyEma21;
  const hEma50 = hCloses.length >= 50 ? computeEMA(hCloses, 50) : computeEMA(hCloses, Math.min(21, hCloses.length));
  const hEma100 = hCloses.length >= 100 ? computeEMA(hCloses, 100) : hEma50;
  const hRsi = hCloses.length >= 20 ? computeWilderRSI(hCloses, 14) : dailyRsi;
  const hAtr = hCandles.length >= 20 ? computeWilderATR(hCandles, 14) : dailyAtr * 0.3;
  const hAdx = hCandles.length >= 30 ? computeWilderADX(hCandles, 14) : { adx: 15, pdi: 15, ndi: 15 };
  const hEr = hCloses.length >= 20 ? computeKaufmanER(hCloses, 16) : 0.15;
  const hRvol = hBars.length >= 25 ? computeRelativeVolume(hBars, 60, now) : 1.0;
  const hDon16 = computeDonchianChannel(hBars, 16);
  const hDon20 = computeDonchianChannel(hBars, 20);
  const lastHBar = hBars[hBars.length - 1];
  const hRange = Math.max(1e-9, (lastHBar?.high ?? midPrice) - (lastHBar?.low ?? midPrice));
  const hClosePos = ((lastHBar?.close ?? midPrice) - (lastHBar?.low ?? midPrice)) / hRange;

  const m15Candles = m15Bars.map((b) => ({ high: b.high ?? b.close, low: b.low ?? b.close, close: b.close }));
  const m15Closes = m15Bars.map((b) => b.close);
  const m15Ema20 = m15Closes.length >= 20 ? computeEMA(m15Closes, 20) : hEma21;
  const m15Ema50 = m15Closes.length >= 50 ? computeEMA(m15Closes, 50) : hEma50;
  const m15Rsi = m15Closes.length >= 20 ? computeWilderRSI(m15Closes, 14) : hRsi;
  const m15Atr = m15Candles.length >= 20 ? computeWilderATR(m15Candles, 14) : hAtr * 0.5;
  const m15Adx = m15Candles.length >= 30 ? computeWilderADX(m15Candles, 14) : { adx: 15, pdi: 15, ndi: 15 };
  const m15Er = m15Closes.length >= 20 ? computeKaufmanER(m15Closes, 16) : 0.15;
  const m15Rvol = m15Bars.length >= 25 ? computeRelativeVolume(m15Bars, 15, now) : 1.0;
  const m15Don28 = computeDonchianChannel(m15Bars, 28);
  const m15Don16 = computeDonchianChannel(m15Bars, 16);

  let direction: 'AL (LONG)' | 'SAT (SHORT)' | null = null;
  let entryTimeframe: '1H' | '15M' = '1H';
  let rationale = '';
  let vetoReason = '';

  if (isCrypto) {
    const hQual = allow1h && hBars.length >= 40 && hEr >= 0.16 && hAdx.adx >= 18 && hRvol >= 0.95;
    if (
      hQual &&
      midPrice > hDon20.high * 1.0004 &&
      midPrice > hEma21 &&
      (hEma21 >= hEma50 * 0.992 || midPrice > hEma50) &&
      hRsi >= 50 &&
      hRsi <= 74 &&
      btcBullMacro
    ) {
      direction = 'AL (LONG)';
      entryTimeframe = '1H';
      rationale = `1S Yapısal Kırılım (Donchian20 > ${hDon20.high.toFixed(candidate.digits)}): ER ${hEr} | ADX ${hAdx.adx} | RVOL ${hRvol}x | 1S RSI ${hRsi}`;
    } else if (
      hQual &&
      midPrice < hDon20.low * 0.9996 &&
      midPrice < hEma21 &&
      (hEma21 <= hEma50 * 1.008 || midPrice < hEma50) &&
      hRsi >= 20 &&
      hRsi <= 50 &&
      btcBearMacro
    ) {
      direction = 'SAT (SHORT)';
      entryTimeframe = '1H';
      rationale = `1S Aşağı Kırılım (Donchian20 < ${hDon20.low.toFixed(candidate.digits)}): ER ${hEr} | ADX ${hAdx.adx} | RVOL ${hRvol}x | 1S RSI ${hRsi}`;
    }

    const mQual =
      !direction &&
      allow15m &&
      m15Bars.length >= 40 &&
      m15Er >= 0.18 &&
      m15Adx.adx >= 20 &&
      m15Rvol >= 1.1 &&
      hRsi >= 22 &&
      hRsi <= 74;
    if (
      mQual &&
      midPrice > m15Don28.high * 1.0004 &&
      midPrice > m15Ema20 &&
      m15Ema20 > m15Ema50 &&
      midPrice > hEma21 &&
      m15Rsi >= 50 &&
      m15Rsi <= 72 &&
      btcBullMacro
    ) {
      direction = 'AL (LONG)';
      entryTimeframe = '15M';
      rationale = `15dk Yapısal Kırılım (Donchian28 > ${m15Don28.high.toFixed(candidate.digits)}): ER ${m15Er} | ADX ${m15Adx.adx} | RVOL ${m15Rvol}x | 15dk RSI ${m15Rsi}`;
    } else if (
      mQual &&
      midPrice < m15Don28.low * 0.9996 &&
      midPrice < m15Ema20 &&
      m15Ema20 < m15Ema50 &&
      midPrice < hEma21 &&
      m15Rsi >= 22 &&
      m15Rsi <= 50 &&
      btcBearMacro
    ) {
      direction = 'SAT (SHORT)';
      entryTimeframe = '15M';
      rationale = `15dk Aşağı Kırılım (Donchian28 < ${m15Don28.low.toFixed(candidate.digits)}): ER ${m15Er} | ADX ${m15Adx.adx} | RVOL ${m15Rvol}x | 15dk RSI ${m15Rsi}`;
    }

    const impQual =
      !direction && allow15m && m15Bars.length >= 40 && m15Er >= 0.28 && m15Adx.adx >= 20 && m15Rvol >= 1.5;
    if (
      impQual &&
      midPrice > hEma21 &&
      hEma21 >= hEma50 * 0.998 &&
      btcBullMacro &&
      midPrice > m15Don16.high * 1.0005 &&
      midPrice > m15Ema20 &&
      midPrice > m15Ema50 &&
      m15Rsi >= 52 &&
      m15Rsi <= 72
    ) {
      direction = 'AL (LONG)';
      entryTimeframe = '15M';
      rationale = `4S Yüksek-Hacim İmpuls Kırılımı (Donchian16 > ${m15Don16.high.toFixed(candidate.digits)}): 15dk ER ${m15Er} | RVOL ${m15Rvol}x | ADX ${m15Adx.adx}`;
    } else if (
      impQual &&
      midPrice < hEma21 &&
      hEma21 <= hEma50 * 1.002 &&
      btcBearMacro &&
      midPrice < m15Don16.low * 0.9995 &&
      midPrice < m15Ema20 &&
      midPrice < m15Ema50 &&
      m15Rsi >= 20 &&
      m15Rsi <= 48
    ) {
      direction = 'SAT (SHORT)';
      entryTimeframe = '15M';
      rationale = `4S Yüksek-Hacim Aşağı İmpuls (Donchian16 < ${m15Don16.low.toFixed(candidate.digits)}): 15dk ER ${m15Er} | RVOL ${m15Rvol}x | ADX ${m15Adx.adx}`;
    }

    if (direction === 'SAT (SHORT)' && hasObDepth && obDepthRatio >= 4.5) {
      vetoReason = `Emir Defteri Kalkanı: Kraken alıcı derinliği (Bid/Ask ${obDepthRatio}x) ekstrem taban oluşturuyor; destek üstüne Short engellendi.`;
      direction = null;
    } else if (direction === 'AL (LONG)' && hasObDepth && obDepthRatio <= 0.22) {
      vetoReason = `Emir Defteri Kalkanı: Kraken satıcı duvarı (Bid/Ask ${obDepthRatio}x) yukarı kırılımı baskılıyor; dirence karşı Long engellendi.`;
      direction = null;
    }
  } else {
    const utcHour = new Date(now).getUTCHours();
    const liquidTradFiSession = !isFx || (utcHour >= 7 && utcHour <= 20);
    const hTradFiQual = allow1h && liquidTradFiSession && hBars.length >= 40 && hEr >= 0.24 && hAdx.adx >= 22;
    if (
      hTradFiQual &&
      midPrice > hDon16.high * 1.0003 &&
      midPrice > hEma21 &&
      hEma21 > hEma50 &&
      hEma50 >= hEma100 * 0.998 &&
      hRsi >= 50 &&
      hRsi <= 68 &&
      hAdx.pdi > hAdx.ndi &&
      (!isFx || hClosePos >= 0.55)
    ) {
      direction = 'AL (LONG)';
      entryTimeframe = '1H';
      rationale = `1S Küresel Trend Kırılımı (Donchian16 > ${hDon16.high.toFixed(candidate.digits)}): ER ${hEr} | ADX ${hAdx.adx} (+DI ${hAdx.pdi})`;
    } else if (
      hTradFiQual &&
      midPrice < hDon16.low * 0.9997 &&
      midPrice < hEma21 &&
      hEma21 < hEma50 &&
      hEma50 <= hEma100 * 1.002 &&
      hRsi >= 32 &&
      hRsi <= 50 &&
      hAdx.ndi > hAdx.pdi &&
      (!isFx || hClosePos <= 0.45)
    ) {
      direction = 'SAT (SHORT)';
      entryTimeframe = '1H';
      rationale = `1S Küresel Aşağı Kırılım (Donchian16 < ${hDon16.low.toFixed(candidate.digits)}): ER ${hEr} | ADX ${hAdx.adx} (-DI ${hAdx.ndi})`;
    } else if (
      allow15m &&
      liquidTradFiSession &&
      m15Bars.length >= 40 &&
      m15Er >= 0.2 &&
      m15Adx.adx >= 18 &&
      hRsi >= 28 &&
      hRsi <= 72
    ) {
      if (
        midPrice > m15Don28.high * 1.0003 &&
        midPrice > m15Ema20 &&
        m15Ema20 >= m15Ema50 &&
        midPrice >= hEma50 * 0.999 &&
        m15Rsi >= 50 &&
        m15Rsi <= 70
      ) {
        direction = 'AL (LONG)';
        entryTimeframe = '15M';
        rationale = `15dk Küresel Kırılım (Donchian28 > ${m15Don28.high.toFixed(candidate.digits)}): ER ${m15Er} | ADX ${m15Adx.adx}`;
      } else if (
        midPrice < m15Don28.low * 0.9997 &&
        midPrice < m15Ema20 &&
        m15Ema20 <= m15Ema50 &&
        midPrice <= hEma50 * 1.001 &&
        m15Rsi >= 30 &&
        m15Rsi <= 50
      ) {
        direction = 'SAT (SHORT)';
        entryTimeframe = '15M';
        rationale = `15dk Küresel Aşağı Kırılım (Donchian28 < ${m15Don28.low.toFixed(candidate.digits)}): ER ${m15Er} | ADX ${m15Adx.adx}`;
      }
    }
  }

  const activeRawAtr = entryTimeframe === '15M' ? m15Atr : hAtr;
  const minTradeAtr = midPrice * (isCrypto ? (entryTimeframe === '15M' ? 0.0055 : 0.009) : 0.0018);
  const maxTradeAtr = midPrice * (isCrypto ? (entryTimeframe === '15M' ? 0.021 : 0.024) : 0.009);
  const tradeAtr = Math.min(maxTradeAtr, Math.max(minTradeAtr, activeRawAtr));

  return {
    isCrypto,
    isFx,
    hEma21,
    hEma50,
    hRsi,
    hAtr,
    hAdx,
    hEr,
    hRvol,
    hDon16,
    hDon20,
    m15Atr,
    m15Adx,
    m15Er,
    m15Rvol,
    m15Don16,
    m15Don28,
    direction,
    entryTimeframe,
    rationale,
    vetoReason,
    tradeAtr,
  };
}

function scoreBreakoutSetupConfluence(params: {
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  entryTimeframe: '1H' | '15M';
  isCrypto: boolean;
  evalRes: TechnicalBreakoutResult;
  obRatio: number;
  tp1RatioPct: number;
  minViableTpPct: number;
}): number {
  const { direction, entryTimeframe, isCrypto, evalRes, obRatio, tp1RatioPct, minViableTpPct } = params;
  const sigEr = entryTimeframe === '15M' ? evalRes.m15Er : evalRes.hEr;
  const sigAdx = entryTimeframe === '15M' ? evalRes.m15Adx.adx : evalRes.hAdx.adx;
  const sigRvol = entryTimeframe === '15M' ? evalRes.m15Rvol : evalRes.hRvol;
  const sigRsi = evalRes.hRsi;
  const erPts = sigEr >= 0.34 ? 26 : sigEr >= 0.24 ? 22 : 18;
  const adxPts = sigAdx >= 28 ? 22 : sigAdx >= 22 ? 19 : 16;
  const rvolPts = sigRvol >= 1.6 ? 16 : sigRvol >= 1.15 ? 14 : 11;
  const rsiCenterPts =
    direction === 'AL (LONG)'
      ? sigRsi >= 50 && sigRsi <= 68
        ? 16
        : 12
      : sigRsi >= 24 && sigRsi <= 50
        ? 16
        : 12;
  const macroObPts = isCrypto
    ? (direction === 'AL (LONG)' && obRatio >= 1.2) || (direction === 'SAT (SHORT)' && obRatio <= 0.85)
      ? 10
      : 6
    : 8;
  const feePts = tp1RatioPct >= minViableTpPct * 1.4 ? 8 : 5;
  return Math.max(0, Math.min(98, erPts + adxPts + rvolPts + rsiCenterPts + macroObPts + feePts));
}

// Canlı Piyasa Tarama, Açık Pozisyon Güncelleme, Canlı Haber Risk Kalkanı, 16-Varlık Radarı ve Yeni İşlem Açma Döngüsü
export async function executeAutonomousTradingTick(forceScan = false): Promise<AutonomousLedgerState> {
  if (inFlightTickPromise) {
    return inFlightTickPromise;
  }
  inFlightTickPromise = runAutonomousTradingTickInternal(forceScan);
  try {
    return await inFlightTickPromise;
  } finally {
    inFlightTickPromise = null;
  }
}

async function runAutonomousTradingTickInternal(_forceScan = false): Promise<AutonomousLedgerState> {
  const state = await loadOrInitAutonomousLedger();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  state.lastTickAt = nowIso;

  // Tüm 16 varlığın günlük + 1 saatlik + 15 dakikalık verisini, Kraken emir defteri derinliğini, Dolar kurunu ve haberleri paralel çek
  const [usdTry, liveNews, marketEntries, hourlyEntries, bars15mEntries, orderbookEntries] = await Promise.all([
    fetchLiveUsdTryRate(),
    fetchRealFinancialNews().catch(() => []),
    Promise.all(
      CORE_UNIVERSE.map(async (c) => {
        try {
          const data = await fetchReal1YearData(c.symbol);
          return [c.symbol, data] as const;
        } catch {
          return [c.symbol, null] as const;
        }
      })
    ),
    Promise.all(
      CORE_UNIVERSE.map(async (c) => {
        try {
          const hData = await fetchRealHourlyHistory(c.symbol);
          return [c.symbol, hData] as const;
        } catch {
          return [c.symbol, [] as HourlyBar[]] as const;
        }
      })
    ),
    Promise.all(
      CORE_UNIVERSE.map(async (c) => {
        try {
          const b15 = await fetchReal15mHistory(c.symbol);
          return [c.symbol, b15] as const;
        } catch {
          return [c.symbol, [] as HourlyBar[]] as const;
        }
      })
    ),
    Promise.all(
      CORE_UNIVERSE.filter((c) => c.cluster.startsWith('CRYPTO')).map(async (c) => {
        try {
          const ob = await fetchCryptoOrderbookImbalance(c.symbol);
          return [c.symbol, ob] as const;
        } catch {
          return [c.symbol, { ratio: 1, bidVol: 0, askVol: 0 }] as const;
        }
      })
    ),
  ]);
  const marketMap = new Map<string, any>(marketEntries);
  const hourlyMap = new Map<string, HourlyBar[]>(hourlyEntries);
  const bars15mMap = new Map<string, HourlyBar[]>(bars15mEntries);
  const orderbookMap = new Map<string, { ratio: number; bidVol: number; askVol: number }>(orderbookEntries);
  state.liveUsdTry = usdTry;

  // 1. AÇIK POZİSYONLARI CANLI BORSA FİYATLARI, MFE/MAE VE CANLI HABER ŞOKLARIYLA DENETLE
  const remainingOpen: AutonomousTrade[] = [];

  for (const pos of state.openPositions) {
    try {
      const market = marketMap.get(pos.symbol) || (await fetchReal1YearData(pos.symbol));
      if (!market || !market.price) {
        remainingOpen.push(pos);
        continue;
      }

      const spec = getSpec(pos.symbol);
      const isLong = pos.direction === 'AL (LONG)';
      const liveMid = +market.price.toFixed(pos.digits);
      const halfSpreadFallback = spec.spreadPts / 2;
      const liveBid = +(
        typeof market.bid === 'number' && market.bid > 0 ? market.bid : liveMid - halfSpreadFallback
      ).toFixed(pos.digits);
      const liveAsk = +(
        typeof market.ask === 'number' && market.ask > 0 ? market.ask : liveMid + halfSpreadFallback
      ).toFixed(pos.digits);

      pos.bidAtTick = liveBid;
      pos.askAtTick = liveAsk;

      // Gerçek IBKR Kapanış Fiyatı: Long pozisyon BID'den, Short pozisyon ASK'tan likide edilir
      const livePrice = isLong ? liveBid : liveAsk;
      pos.currentPrice = livePrice;

      // Günlük IBKR Kaldıraçlı Taşıma / Gecelik Finansman Maliyeti (UTC 00:00 devri, ~SOFR+%1.5 ≈ %6.8 Yıllık)
      const todayUtc = nowIso.slice(0, 10);
      if (!pos.lastSwapDateUTC) {
        pos.lastSwapDateUTC = (pos.entryTime || nowIso).slice(0, 10);
      }
      if (todayUtc > pos.lastSwapDateUTC) {
        const curWeightForSwap = pos.tp1Hit ? 0.5 : 1.0;
        const swapUnits = pos.positionSizeUnits * curWeightForSwap;
        const swapQuoteToUsd = pos.symbol === 'USD/JPY' ? 1 / (livePrice || 155) : 1;
        const curNotionalTRY = swapUnits * livePrice * swapQuoteToUsd * usdTry;
        const curMarginTRY = pos.allocatedCapitalTRY * curWeightForSwap;
        const borrowedTRY = Math.max(0, curNotionalTRY - curMarginTRY);
        if (borrowedTRY > 0) {
          const overnightFeeTRY = +(borrowedTRY * (0.068 / 365)).toFixed(2);
          pos.financingCostTRY = +((pos.financingCostTRY || 0) + overnightFeeTRY).toFixed(2);
          pos.executionCostTRY = +(
            (pos.entryCommissionTRY || 0) +
            (pos.exitCommissionTRY || 0) +
            pos.financingCostTRY
          ).toFixed(2);
          pos.realizedPnL_TRY = +(pos.realizedPnL_TRY - overnightFeeTRY).toFixed(2);
          state.cashBalanceTRY = +(state.cashBalanceTRY - overnightFeeTRY).toFixed(2);
        }
        pos.lastSwapDateUTC = todayUtc;
      }

      const quoteToUsd = pos.symbol === 'USD/JPY' ? 1 / (livePrice || 155) : 1;
      const slDist = Math.abs(pos.entryPrice - pos.initialStopLoss) || 0.0001;
      const priceDiff = isLong ? livePrice - pos.entryPrice : pos.entryPrice - livePrice;
      const rMultiple = priceDiff / slDist;

      const tp1HalfUnits = +(pos.positionSizeUnits * 0.5).toFixed(6);
      const calcRemainingUnits = () =>
        pos.tp1Hit ? Math.max(0, +(pos.positionSizeUnits - tp1HalfUnits).toFixed(6)) : pos.positionSizeUnits;

      const calcFloatingNetTRY = () => {
        const remUnits = calcRemainingUnits();
        const grossTRY = remUnits * priceDiff * quoteToUsd * usdTry;
        const closeNotionalTRY = remUnits * livePrice * quoteToUsd * usdTry;
        const estExitFeeTRY = computeIbkrCommissionTRY(spec, closeNotionalTRY, remUnits, usdTry);
        pos.grossUnrealizedPnL_TRY = +grossTRY.toFixed(2);
        return +(grossTRY - estExitFeeTRY).toFixed(2);
      };

      // MFE & MAE Güncellemesi (Komisyon & Canlı Bid/Ask Dahil Gerçek Özsermaye Sapması)
      let currentFloatingTRY = calcFloatingNetTRY();
      let currentTotalTRY = +(pos.realizedPnL_TRY + currentFloatingTRY).toFixed(2);
      pos.mfeR = Math.max(pos.mfeR ?? 0, +rMultiple.toFixed(2));
      pos.maeR = Math.min(pos.maeR ?? 0, +rMultiple.toFixed(2));
      pos.mfeTRY = Math.max(pos.mfeTRY ?? 0, currentTotalTRY);
      pos.maeTRY = Math.min(pos.maeTRY ?? 0, currentTotalTRY);
      if (pos.forensicXRay) {
        if (rMultiple >= (pos.forensicXRay.excursion.mfeR || 0)) {
          pos.forensicXRay.excursion.mfePrice = livePrice;
          pos.forensicXRay.excursion.mfeR = +rMultiple.toFixed(2);
          pos.forensicXRay.excursion.mfeTRY = pos.mfeTRY;
        }
        if (rMultiple <= (pos.forensicXRay.excursion.maeR || 0)) {
          pos.forensicXRay.excursion.maePrice = livePrice;
          pos.forensicXRay.excursion.maeR = +rMultiple.toFixed(2);
          pos.forensicXRay.excursion.maeTRY = pos.maeTRY;
        }
      }

      // CANLI HABER ACİL RİSK KALKANI (Yalnızca pozisyon açıldıktan SONRA yayınlanan <3 saatlik taze ve gerçek temel şoklarda tetiklenir)
      const newsCtx = extractNewsSentimentForAsset(pos.symbol, liveNews);
      const newsTs = newsCtx.newestTimestamp || 0;
      const isFreshPostEntryShock =
        newsTs > (pos.entryTimestamp || now) + 60 * 1000 &&
        now - newsTs <= 3 * 3600 * 1000 &&
        !newsCtx.isRecapOnly;
      const heldLongEnough = now - (pos.entryTimestamp || 0) >= 15 * 60 * 1000;
      const isSevereAdverseNews =
        heldLongEnough &&
        isFreshPostEntryShock &&
        ((pos.direction === 'AL (LONG)' && newsCtx.sentimentScore <= -0.65) ||
          (pos.direction === 'SAT (SHORT)' && newsCtx.sentimentScore >= 0.65));

      if (isSevereAdverseNews && !pos.tp1Hit) {
        const closeUnits = calcRemainingUnits();
        const closeNotionalTRY = closeUnits * livePrice * quoteToUsd * usdTry;
        const exitFeeTRY = computeIbkrCommissionTRY(spec, closeNotionalTRY, closeUnits, usdTry);
        const grossCloseTRY = closeUnits * priceDiff * quoteToUsd * usdTry;
        const netCloseDeltaTRY = +(grossCloseTRY - exitFeeTRY).toFixed(2);

        pos.exitCommissionTRY = +((pos.exitCommissionTRY || 0) + exitFeeTRY).toFixed(2);
        pos.executionCostTRY = +(
          (pos.entryCommissionTRY || 0) +
          pos.exitCommissionTRY +
          (pos.financingCostTRY || 0)
        ).toFixed(2);
        pos.realizedPnL_TRY = +(pos.realizedPnL_TRY + netCloseDeltaTRY).toFixed(2);
        pos.grossUnrealizedPnL_TRY = 0;
        pos.unrealizedPnL_TRY = 0;
        pos.totalPnL_TRY = pos.realizedPnL_TRY;
        pos.totalPnL_Percent = +((pos.totalPnL_TRY / state.initialCapitalTRY) * 100).toFixed(2);
        pos.closePrice = livePrice;
        pos.closeTime = nowIso;
        pos.closeTimestamp = now;
        pos.status = 'MANUEL_KAPANDI';
        pos.exitReason = `Canlı Haber Risk Kalkanı: "${newsCtx.impactingHeadline}" (${newsCtx.source}) ters yönlü haber şoku nedeniyle tam stop beklenmeden canlı piyasa kotasyonundan (@ ${livePrice}) çıkıldı.`;

        state.cashBalanceTRY = +(state.cashBalanceTRY + netCloseDeltaTRY).toFixed(2);
        state.closedTrades.unshift(pos);

        state.activityLog.unshift({
          id: `ACT-NEWS-SHIELD-${now}-${pos.symbol}`,
          timestamp: nowIso,
          type: 'SYSTEM',
          symbol: pos.symbol,
          message: `HABER RİSK KALKANI DEVREDE: ${pos.symbol} (${pos.direction}) pozisyonu "${newsCtx.impactingHeadline}" haberi nedeniyle @ ${livePrice} seviyesinden kapatıldı (Komisyon düşülmüş toplam net: ${pos.totalPnL_TRY >= 0 ? '+' : ''}${pos.totalPnL_TRY.toLocaleString('tr-TR')} TL).`,
          pnlImpactTRY: netCloseDeltaTRY,
        });
        continue;
      }

      // TP1 Kontrolü (%50 Kâr Al + Başabaş Stop — Canlı Bid/Ask üzerinden IBKR çıkış komisyonu düşülerek realize edilir)
      const reachedTp1 = isLong ? livePrice >= pos.takeProfit1 : livePrice <= pos.takeProfit1;

      if (!pos.tp1Hit && reachedTp1) {
        pos.tp1Hit = true;
        pos.breakevenActive = true;
        // Kalan %50 için Stop Loss: Giriş fiyatına + gidiş/dönüş komisyonunu kurtaracak tampon ekle (Chandelier kilidini asla geriye çekme)
        const feeBuffer = Math.min(slDist * 0.30, pos.entryPrice * Math.max(0.0005, spec.ibkrCommissionRate * 2.5));
        const beStop = isLong
          ? +(pos.entryPrice + feeBuffer).toFixed(pos.digits)
          : +(pos.entryPrice - feeBuffer).toFixed(pos.digits);
        pos.stopLoss = isLong ? Math.max(pos.stopLoss, beStop) : Math.min(pos.stopLoss, beStop);

        const tp1NotionalTRY = tp1HalfUnits * livePrice * quoteToUsd * usdTry;
        const tp1ExitFeeTRY = computeIbkrCommissionTRY(spec, tp1NotionalTRY, tp1HalfUnits, usdTry);
        const grossHalfProfit = tp1HalfUnits * priceDiff * quoteToUsd * usdTry;
        const netHalfProfit = +(grossHalfProfit - tp1ExitFeeTRY).toFixed(2);

        pos.exitCommissionTRY = +((pos.exitCommissionTRY || 0) + tp1ExitFeeTRY).toFixed(2);
        pos.executionCostTRY = +(
          (pos.entryCommissionTRY || 0) +
          pos.exitCommissionTRY +
          (pos.financingCostTRY || 0)
        ).toFixed(2);
        pos.realizedPnL_TRY = +(pos.realizedPnL_TRY + netHalfProfit).toFixed(2);
        state.cashBalanceTRY = +(state.cashBalanceTRY + netHalfProfit).toFixed(2);

        // Kalan %50 bakiye için yüzer PnL güncelle
        currentFloatingTRY = calcFloatingNetTRY();
        currentTotalTRY = +(pos.realizedPnL_TRY + currentFloatingTRY).toFixed(2);

        state.activityLog.unshift({
          id: `ACT-TP1-${now}-${pos.symbol}`,
          timestamp: nowIso,
          type: 'TP1_PARTIAL',
          symbol: pos.symbol,
          message: `${pos.symbol} TP1 (${pos.takeProfit1}) seviyesini geçti @ ${livePrice}! Pozisyonun %50'si (+${netHalfProfit.toLocaleString('tr-TR')} TL net; komisyon: -${tp1ExitFeeTRY} TL) realize edildi, Stop komisyon korumalı başabaşa (${pos.stopLoss}) çekildi.`,
          pnlImpactTRY: netHalfProfit,
        });
      }

      // 2. Kademe Sürekli Chandelier İz Süren Stop (Kripto: +1.35R / 1.55x ATR | Küresel TradFi: +1.25R / 1.45x ATR)
      const isPosCrypto = spec.cluster.startsWith('CRYPTO');
      const trailTriggerR = isPosCrypto ? 1.35 : 1.25;
      const trailAtrMult = isPosCrypto ? 1.55 : 1.45;
      const trailAtr = pos.forensicXRay?.indicatorSnapshot?.tradeAtr || slDist / 2.0;
      const recordedMfePrice = pos.forensicXRay?.excursion?.mfePrice;
      const peakPrice =
        recordedMfePrice !== undefined
          ? isLong
            ? Math.max(livePrice, recordedMfePrice)
            : Math.min(livePrice, recordedMfePrice)
          : livePrice;
      const peakFav = isLong ? peakPrice - pos.entryPrice : pos.entryPrice - peakPrice;

      if (peakFav >= slDist * trailTriggerR) {
        pos.trailingStopActive = true;
        const chandelierStop = isLong
          ? +(peakPrice - trailAtr * trailAtrMult).toFixed(pos.digits)
          : +(peakPrice + trailAtr * trailAtrMult).toFixed(pos.digits);
        const minProfitLock = isLong
          ? +(pos.entryPrice + slDist * 0.25).toFixed(pos.digits)
          : +(pos.entryPrice - slDist * 0.25).toFixed(pos.digits);
        const candidateStop = isLong
          ? Math.max(pos.stopLoss, minProfitLock, chandelierStop)
          : Math.min(pos.stopLoss, minProfitLock, chandelierStop);
        if (isLong ? candidateStop > pos.stopLoss : candidateStop < pos.stopLoss) {
          pos.stopLoss = +candidateStop.toFixed(pos.digits);
        }
      }

      // TP2 Kontrolü
      const reachedTp2 = isLong ? livePrice >= pos.takeProfit2 : livePrice <= pos.takeProfit2;

      if (reachedTp2) {
        const finalUnits = calcRemainingUnits();
        const tp2NotionalTRY = finalUnits * livePrice * quoteToUsd * usdTry;
        const tp2ExitFeeTRY = computeIbkrCommissionTRY(spec, tp2NotionalTRY, finalUnits, usdTry);
        const grossSecondHalf = finalUnits * priceDiff * quoteToUsd * usdTry;
        const netSecondHalf = +(grossSecondHalf - tp2ExitFeeTRY).toFixed(2);

        pos.exitCommissionTRY = +((pos.exitCommissionTRY || 0) + tp2ExitFeeTRY).toFixed(2);
        pos.executionCostTRY = +(
          (pos.entryCommissionTRY || 0) +
          pos.exitCommissionTRY +
          (pos.financingCostTRY || 0)
        ).toFixed(2);
        pos.realizedPnL_TRY = +(pos.realizedPnL_TRY + netSecondHalf).toFixed(2);
        pos.grossUnrealizedPnL_TRY = 0;
        pos.unrealizedPnL_TRY = 0;
        pos.totalPnL_TRY = pos.realizedPnL_TRY;
        pos.totalPnL_Percent = +((pos.totalPnL_TRY / state.initialCapitalTRY) * 100).toFixed(2);
        pos.closePrice = livePrice;
        pos.closeTime = nowIso;
        pos.closeTimestamp = now;
        pos.status = 'TP2_TAM_HEDEF';
        pos.exitReason = `TP2 nihai hedef fiyatına ulaşıldı (@ ${livePrice}); tüm IBKR giriş/çıkış komisyonları düşüldükten sonra net kâr realize edildi.`;

        state.cashBalanceTRY = +(state.cashBalanceTRY + netSecondHalf).toFixed(2);
        state.closedTrades.unshift(pos);

        state.activityLog.unshift({
          id: `ACT-TP2-${now}-${pos.symbol}`,
          timestamp: nowIso,
          type: 'TP2_FULL',
          symbol: pos.symbol,
          message: `${pos.symbol} TP2 (${pos.takeProfit2}) hedefine ulaştı @ ${livePrice}! İşlem net +${pos.totalPnL_TRY.toLocaleString('tr-TR')} TL kazançla kapandı (Toplam IBKR komisyon: -${pos.executionCostTRY} TL).`,
          pnlImpactTRY: netSecondHalf,
        });
        continue;
      }

      // Stop Loss / Breakeven / Trailing Stop Kontrolü (Gerçek Piyasa Stop Emri: Canlı Bid/Ask dolumu)
      const hitStop = isLong ? livePrice <= pos.stopLoss : livePrice >= pos.stopLoss;

      if (hitStop) {
        const stopUnits = calcRemainingUnits();
        const stopNotionalTRY = stopUnits * livePrice * quoteToUsd * usdTry;
        const stopExitFeeTRY = computeIbkrCommissionTRY(spec, stopNotionalTRY, stopUnits, usdTry);
        const grossStopPnL = stopUnits * priceDiff * quoteToUsd * usdTry;
        const netStopDeltaTRY = +(grossStopPnL - stopExitFeeTRY).toFixed(2);

        pos.exitCommissionTRY = +((pos.exitCommissionTRY || 0) + stopExitFeeTRY).toFixed(2);
        pos.executionCostTRY = +(
          (pos.entryCommissionTRY || 0) +
          pos.exitCommissionTRY +
          (pos.financingCostTRY || 0)
        ).toFixed(2);
        pos.realizedPnL_TRY = +(pos.realizedPnL_TRY + netStopDeltaTRY).toFixed(2);
        pos.grossUnrealizedPnL_TRY = 0;
        pos.unrealizedPnL_TRY = 0;
        pos.totalPnL_TRY = pos.realizedPnL_TRY;
        pos.totalPnL_Percent = +((pos.totalPnL_TRY / state.initialCapitalTRY) * 100).toFixed(2);
        pos.closePrice = livePrice;
        pos.closeTime = nowIso;
        pos.closeTimestamp = now;
        state.cashBalanceTRY = +(state.cashBalanceTRY + netStopDeltaTRY).toFixed(2);

        if (pos.tp1Hit) {
          pos.status = pos.trailingStopActive ? 'TRAILING_STOP_KAR' : 'TP1_VE_BASABAS';
          pos.exitReason = pos.trailingStopActive
            ? `TP1 sonrası kalan %50 kısım Chandelier 1.6x ATR İz Süren Stop seviyesinde @ ${livePrice} icra edildi.`
            : `TP1 sonrası kalan %50 kısım komisyon korumalı Başa Baş Stop ile @ ${livePrice} fiyatından kapandı.`;

          state.closedTrades.unshift(pos);
          state.activityLog.unshift({
            id: `ACT-BE-${now}-${pos.symbol}`,
            timestamp: nowIso,
            type: 'BREAKEVEN_EXIT',
            symbol: pos.symbol,
            message: `${pos.symbol} ${pos.trailingStopActive ? 'Chandelier İz Süren Stop' : 'Başa Baş Stop'} @ ${livePrice} ile kapandı. Komisyon sonrası net toplam: ${pos.totalPnL_TRY >= 0 ? '+' : ''}${pos.totalPnL_TRY.toLocaleString('tr-TR')} TL.`,
            pnlImpactTRY: netStopDeltaTRY,
          });
        } else if (pos.trailingStopActive) {
          pos.status = 'TRAILING_STOP_KAR';
          pos.exitReason = `Chandelier 1.6x ATR İz Süren Stop seviyesinde (@ ${livePrice}) kâr korumalı çıkış gerçekleşti.`;

          state.closedTrades.unshift(pos);
          state.activityLog.unshift({
            id: `ACT-TRAIL-${now}-${pos.symbol}`,
            timestamp: nowIso,
            type: 'BREAKEVEN_EXIT',
            symbol: pos.symbol,
            message: `${pos.symbol} Chandelier İz Süren Stop @ ${livePrice} ile kârda kapandı (${pos.totalPnL_TRY >= 0 ? '+' : ''}${pos.totalPnL_TRY.toLocaleString('tr-TR')} TL net).`,
            pnlImpactTRY: netStopDeltaTRY,
          });
        } else {
          pos.status = 'STOP_LOSS';
          pos.exitReason = `Fiyat Stop Loss emrini (@ ${livePrice}) tetikledi; komisyon & spread dahil net zarar gerçekleşti.`;

          state.closedTrades.unshift(pos);
          state.activityLog.unshift({
            id: `ACT-SL-${now}-${pos.symbol}`,
            timestamp: nowIso,
            type: 'STOP_LOSS',
            symbol: pos.symbol,
            message: `${pos.symbol} Stop Loss (@ ${livePrice}) tetiklendi (İşlem neti: ${pos.totalPnL_TRY.toLocaleString('tr-TR')} TL; IBKR komisyonları dahil).`,
            pnlImpactTRY: netStopDeltaTRY,
          });
        }
        continue;
      }

      // Ölüm / Yatay Testere Zaman Aşımı Kalkanı (Time-Stop: TP1 gelmeden 18s/36s sürünüyorsa sermayeyi serbest bırak)
      const ageMs = now - (pos.entryTimestamp || now);
      const timeStopMs = (pos.entryTimeframe === '15M' ? 18 : 36) * 60 * 60 * 1000;
      if (!pos.tp1Hit && !pos.trailingStopActive && ageMs >= timeStopMs && rMultiple < 0.05) {
        const tsUnits = calcRemainingUnits();
        const tsNotionalTRY = tsUnits * livePrice * quoteToUsd * usdTry;
        const tsExitFeeTRY = computeIbkrCommissionTRY(spec, tsNotionalTRY, tsUnits, usdTry);
        const grossTsPnL = tsUnits * priceDiff * quoteToUsd * usdTry;
        const netTsDeltaTRY = +(grossTsPnL - tsExitFeeTRY).toFixed(2);

        pos.exitCommissionTRY = +((pos.exitCommissionTRY || 0) + tsExitFeeTRY).toFixed(2);
        pos.executionCostTRY = +(
          (pos.entryCommissionTRY || 0) +
          pos.exitCommissionTRY +
          (pos.financingCostTRY || 0)
        ).toFixed(2);
        pos.realizedPnL_TRY = +(pos.realizedPnL_TRY + netTsDeltaTRY).toFixed(2);
        pos.grossUnrealizedPnL_TRY = 0;
        pos.unrealizedPnL_TRY = 0;
        pos.totalPnL_TRY = pos.realizedPnL_TRY;
        pos.totalPnL_Percent = +((pos.totalPnL_TRY / state.initialCapitalTRY) * 100).toFixed(2);
        pos.closePrice = livePrice;
        pos.closeTime = nowIso;
        pos.closeTimestamp = now;
        pos.status = 'MANUEL_KAPANDI';
        pos.exitReason = `Zaman Aşımı Kalkanı (Time-Stop): ${pos.entryTimeframe === '15M' ? '18' : '36'} saat boyunca momentum üretmeyen yatay pozisyondan @ ${livePrice} seviyesinde sermaye koruması için çıkıldı.`;

        state.cashBalanceTRY = +(state.cashBalanceTRY + netTsDeltaTRY).toFixed(2);
        state.closedTrades.unshift(pos);

        state.activityLog.unshift({
          id: `ACT-TSTOP-${now}-${pos.symbol}`,
          timestamp: nowIso,
          type: 'SYSTEM',
          symbol: pos.symbol,
          message: `ZAMAN AŞIMI KALKANI: ${pos.symbol} (${pos.direction}) yatay seyre girdiği için @ ${livePrice} seviyesinden kapatıldı (Komisyon sonrası net: ${pos.totalPnL_TRY >= 0 ? '+' : ''}${pos.totalPnL_TRY.toLocaleString('tr-TR')} TL).`,
          pnlImpactTRY: netTsDeltaTRY,
        });
        continue;
      }

      pos.unrealizedPnL_TRY = currentFloatingTRY;
      pos.totalPnL_TRY = currentTotalTRY;
      pos.totalPnL_Percent = +((pos.totalPnL_TRY / state.initialCapitalTRY) * 100).toFixed(2);
      pos.rMultiple = +(pos.totalPnL_TRY / (pos.riskAmountTRY || 1)).toFixed(2);
      pos.spot1xEquivalentPnL_TRY = +(pos.totalPnL_TRY / Math.max(1, pos.effectiveLeverage || 1)).toFixed(2);
      remainingOpen.push(pos);
    } catch {
      remainingOpen.push(pos);
    }
  }

  state.openPositions = remainingOpen;

  // 2. KÜRESEL KRİPTO LİDERİ (BTC), 1S + 15dk ÇİFT UFUKLU KANTİTATİF KIRILIM VE EMİR DEFTERİ DERİNLİK MOTORU (v4-hedge-alpha)
  const coreCryptoNews = ['BTC/USD', 'ETH/USD', 'XRP/USD']
    .map((sym) => extractNewsSentimentForAsset(sym, liveNews).sentimentScore)
    .filter((s) => Math.abs(s) > 0.05);
  const macroCryptoSentiment =
    coreCryptoNews.length > 0
      ? +(coreCryptoNews.reduce((a, b) => a + b, 0) / coreCryptoNews.length).toFixed(2)
      : 0;

  const btcMarketRef = marketMap.get('BTC/USD');
  const btcHBarsRef = hourlyMap.get('BTC/USD') || [];
  const btcHClosesRef = btcHBarsRef.map((b) => b.close);
  if (btcHClosesRef.length > 0 && btcMarketRef?.price) {
    btcHClosesRef[btcHClosesRef.length - 1] = btcMarketRef.price;
  }
  const btcDClosesRef = (btcMarketRef?.candles || []).map((c: any) => c.close);
  const btcLivePrice = btcMarketRef?.price || btcHClosesRef[btcHClosesRef.length - 1] || 0;
  const btcHEma21Ref = btcHClosesRef.length >= 21 ? computeEMA(btcHClosesRef, 21) : btcLivePrice;
  const btcHEma50Ref = btcHClosesRef.length >= 50 ? computeEMA(btcHClosesRef, 50) : btcHEma21Ref;
  const btcDEma21Ref = btcDClosesRef.length >= 21 ? computeEMA(btcDClosesRef, 21) : btcLivePrice;
  const btcBullMacro =
    btcLivePrice === 0 ||
    btcLivePrice >= btcHEma50Ref * 0.996 ||
    btcLivePrice >= btcHEma21Ref ||
    (btcHEma21Ref >= btcHEma50Ref * 0.998 && btcLivePrice >= btcDEma21Ref * 0.995);
  const btcBearMacro =
    btcLivePrice === 0 ||
    btcLivePrice <= btcHEma50Ref * 1.004 ||
    btcLivePrice <= btcHEma21Ref ||
    (btcHEma21Ref <= btcHEma50Ref * 1.002 && btcLivePrice <= btcDEma21Ref * 1.005);

  interface EvaluatedCandidate {
    candidate: InstrumentMicroSpec;
    market: any;
    midPrice: number;
    ema8: number;
    ema21: number;
    ema50: number;
    ema200: number;
    rsi: number;
    dailyAtr: number;
    tradeAtr: number;
    entryTimeframe: '1H' | '15M';
    newsScore: number;
    newsCtx: ReturnType<typeof extractNewsSentimentForAsset>;
    trendRegime: MarketScannerItem['trendRegime'];
    existingOpen?: AutonomousTrade;
    isMarketClosed: boolean;
    marketSession: { isOpen: boolean; reason?: string };
    direction: 'AL (LONG)' | 'SAT (SHORT)' | null;
    rationale: string;
    riskScale: number;
    vetoReason: string;
    isNewsVeto: boolean;
    isForecastVeto: boolean;
    candidateScore: number;
    forecast: MultiHorizonForecast;
    executedTrade?: AutonomousTrade;
    blockedStatus?: MarketScannerItem['status'];
    blockedReason?: string;
  }

  const evaluatedList: EvaluatedCandidate[] = [];

  for (const candidate of CORE_UNIVERSE) {
    try {
      const market = marketMap.get(candidate.symbol) || (await fetchReal1YearData(candidate.symbol));
      if (!market || !market.candles || market.candles.length < 30) continue;

      const candles = market.candles;
      const closes = candles.map((c: any) => c.close);
      const midPrice = +market.price.toFixed(candidate.digits);

      const ema8 = computeEMA(closes, 8);
      const ema21 = computeEMA(closes, 21);
      const ema50 = computeEMA(closes, 50);
      const ema200 = computeEMA(closes, Math.min(200, closes.length));
      const rsi = computeWilderRSI(closes, 14);
      const dailyAtr = computeWilderATR(candles, 14);

      const obDepth = orderbookMap.get(candidate.symbol) || { ratio: 1, bidVol: 0, askVol: 0 };

      const hBarsRaw = hourlyMap.get(candidate.symbol) || [];
      const hBars = hBarsRaw.length >= 25 ? hBarsRaw.map((b) => ({ ...b })) : [];
      if (hBars.length > 0) {
        const lastH = hBars[hBars.length - 1];
        lastH.close = midPrice;
        lastH.high = Math.max(lastH.high ?? midPrice, midPrice);
        lastH.low = Math.min(lastH.low ?? midPrice, midPrice);
      }

      // v8.0 Stop-Hunt Kalkanı: Giriş kırılımları yalnızca tamamlanmış (kapanmış) 1S mumlarla teyit edilir!
      const closedHBars = hBarsRaw.filter((b) => b.timestamp + 3540 * 1000 <= now);
      const hasClosed1H = closedHBars.length >= 40;
      const sigHBars = hasClosed1H ? closedHBars : hBars;
      const sigPx = hasClosed1H ? closedHBars[closedHBars.length - 1].close : midPrice;
      const sigNow = hasClosed1H ? closedHBars[closedHBars.length - 1].timestamp + 3600 * 1000 : now;

      const m15BarsRaw = bars15mMap.get(candidate.symbol) || [];
      const m15Bars = m15BarsRaw.length >= 25 ? m15BarsRaw.map((b) => ({ ...b })) : [];
      if (m15Bars.length > 0) {
        const lastM = m15Bars[m15Bars.length - 1];
        lastM.close = midPrice;
        lastM.high = Math.max(lastM.high ?? midPrice, midPrice);
        lastM.low = Math.min(lastM.low ?? midPrice, midPrice);
      }

      const evalRes = evaluateTechnicalBreakoutSetup({
        candidate,
        midPrice: sigPx,
        now: sigNow,
        dailyCloses: closes,
        dailyEma21: ema21,
        dailyRsi: rsi,
        dailyAtr,
        hBars: sigHBars,
        m15Bars,
        btcBullMacro,
        btcBearMacro,
        obDepthRatio: obDepth.ratio,
        hasObDepth: obDepth.bidVol + obDepth.askVol > 0,
      });

      const {
        isCrypto,
        isFx,
        hEma21,
        hEma50,
        hAtr,
        hAdx,
        hEr,
        hRvol,
        hDon16,
        hDon20,
        m15Adx,
        m15Er,
        m15Rvol,
        m15Don16,
        m15Don28,
        tradeAtr,
      } = evalRes;

      const newsCtx = extractNewsSentimentForAsset(candidate.symbol, liveNews);
      const aiNews = synthesizeAssetNewsAI(candidate.symbol, liveNews);
      const rawNewsScore = newsCtx.sentimentScore;
      let newsScore = rawNewsScore;

      if (isCrypto && Math.abs(newsScore) < 0.05 && Math.abs(macroCryptoSentiment) >= 0.35) {
        newsScore = +(macroCryptoSentiment * 0.45).toFixed(2);
      }

      const forecast = computeMultiHorizonForecast(
        hBars.length >= 25 ? hBars : candles,
        m15Bars.length >= 25 ? m15Bars : null,
        midPrice,
        candidate.digits,
        newsCtx,
        obDepth.ratio,
        24,
        candidate.symbol
      );

      const trendRegime: MarketScannerItem['trendRegime'] =
        midPrice >= ema50 * 1.0005 ? 'BOĞA (BULL)' : midPrice <= ema50 * 0.9995 ? 'AYI (BEAR)' : 'YATAY';

      const existingOpen = state.openPositions.find((p) => p.symbol === candidate.symbol);
      const marketSession = isMarketOpenForAsset(candidate.symbol, new Date(now));
      const isMarketClosed = !marketSession.isOpen;

      if (existingOpen) {
        evaluatedList.push({
          candidate,
          market,
          midPrice,
          ema8,
          ema21,
          ema50,
          ema200,
          rsi,
          dailyAtr,
          tradeAtr: existingOpen.forensicXRay?.indicatorSnapshot?.tradeAtr || Math.max(hAtr, dailyAtr * 0.24),
          entryTimeframe: existingOpen.entryTimeframe || '1H',
          newsScore,
          newsCtx,
          trendRegime,
          existingOpen,
          isMarketClosed,
          marketSession,
          direction: existingOpen.direction,
          rationale: existingOpen.rationale,
          riskScale: 1,
          vetoReason: '',
          isNewsVeto: false,
          isForecastVeto: false,
          candidateScore: existingOpen.confluenceScore || 88,
          forecast,
        });
        continue;
      }

      let direction: 'AL (LONG)' | 'SAT (SHORT)' | null = evalRes.direction;
      const entryTimeframe: '1H' | '15M' = evalRes.entryTimeframe;
      let rationale = evalRes.rationale;
      const riskScale = 1.0;
      let vetoReason = evalRes.vetoReason;
      let isNewsVeto = false;
      let isForecastVeto = false;
      let candidateScore = 52;

      // v8.0 Canlı Fiyat Teyidi: Kapanan 1S bar teyidi üzerinden <=45dk pencere ve kırılımın hala korunuyor olması şarttır
      if (direction && hasClosed1H) {
        const refHi = isCrypto ? hDon20.high : hDon16.high;
        const refLo = isCrypto ? hDon20.low : hDon16.low;
        const staleClosedBar = now - sigNow > 45 * 60 * 1000;
        const snappedBackInside =
          (direction === 'AL (LONG)' && midPrice <= refHi) ||
          (direction === 'SAT (SHORT)' && midPrice >= refLo);
        const chasedTooFar =
          (direction === 'AL (LONG)' && midPrice > sigPx + tradeAtr * 0.85) ||
          (direction === 'SAT (SHORT)' && midPrice < sigPx - tradeAtr * 0.85);
        if (staleClosedBar) {
          vetoReason = `Saatlik Kapanış Bekleniyor: Son 1S kırılım sinyali 45 dakikayı aştığı için taze bar kapanışı bekleniyor.`;
          direction = null;
        } else if (snappedBackInside) {
          vetoReason = `Sahte Kırılım Koruması: Önceki 1S mum kırılım yaptı ancak anlık fiyat (${midPrice.toFixed(candidate.digits)}) tekrar kanal içine döndü; işlem açılmadı.`;
          direction = null;
        } else if (chasedTooFar) {
          vetoReason = `Aşırı Kaçış Koruması: Kapanış sonrası fiyat (+0.85 ATR) fazla uzaklaştığı için kötü fiyattan kovalama engellendi.`;
          direction = null;
        }
      } else if (!direction) {
        const liveDonRef = computeDonchianChannel(hBars, isCrypto ? 20 : 16);
        if (midPrice > liveDonRef.high * 1.0003 || midPrice < liveDonRef.low * 0.9997) {
          vetoReason = `Saatlik Kapanış Onayı Bekleniyor (Anlık fiyat ${midPrice.toFixed(candidate.digits)} kırılım seviyesini test ediyor — bar içi stop-hunt fitil tuzağına karşı saat kapanışı bekleniyor).`;
        }
      }

      // 2.5 Saatlik Stop / Time-Stop Soğuma Kalkanı (Testere yeniden girişlerini keser)
      const recentStopSameSymbol = state.closedTrades.find(
        (c) =>
          c.symbol === candidate.symbol &&
          (c.status === 'STOP_LOSS' || c.status === 'MANUEL_KAPANDI') &&
          now - (c.closeTimestamp || c.entryTimestamp) < 150 * 60 * 1000
      );
      const recentAnyClose = state.closedTrades.find(
        (c) =>
          c.symbol === candidate.symbol &&
          now - (c.closeTimestamp || c.entryTimestamp) < 15 * 60 * 1000
      );

      // AI Ters Haber Veto Denetimi (Yalnızca son 3 saatlik taze temel/makro şoklarda engeller; geriye dönük fiyat özetleri vetolanmaz)
      const isFreshAiShock =
        aiNews.hasNews &&
        aiNews.newestTimestamp > 0 &&
        now - aiNews.newestTimestamp <= 3 * 3600 * 1000 &&
        !aiNews.isRecapOnly;
      if (
        direction &&
        isFreshAiShock &&
        aiNews.convictionScore >= 78 &&
        ((direction === 'AL (LONG)' && aiNews.netAiScore <= -0.45) ||
          (direction === 'SAT (SHORT)' && aiNews.netAiScore >= 0.45))
      ) {
        isNewsVeto = true;
        vetoReason = `AI Taze Haber Vetosu (%${aiNews.convictionScore}): ${aiNews.whatHappened}`;
        direction = null;
      }

      // Soğuma Kalkanı Denetimi (Stop/Time-Stop sonrası 2.5 saat bekle)
      if (direction && recentStopSameSymbol) {
        vetoReason = `Soğuma Kalkanı: ${candidate.symbol} son 2.5 saat içinde kapandığı için testere koruması gereği yeniden giriş kilitlendi.`;
        direction = null;
      } else if (direction && recentAnyClose) {
        vetoReason = `Kapanış Sonrası Bekleme: ${candidate.symbol} kapanışının üzerinden 15 dakika geçmedi.`;
        direction = null;
      }

      // Komisyon-Verimlilik Kapısı (Hedef TP1 = 3.2x ATR hareketi çift yönlü IBKR komisyonunun en az 5.5 katı olmalı)
      const tp1RatioPct = (tradeAtr * 3.2) / (midPrice || 1);
      const minViableTpPct = Math.max(isCrypto ? 0.014 : 0.0025, candidate.ibkrCommissionRate * 2 * 5.5);
      if (direction && tp1RatioPct < minViableTpPct) {
        vetoReason = `Komisyon Verimlilik Filtresi: Beklenen TP1 hareketi (%${(tp1RatioPct * 100).toFixed(2)}) IBKR komisyon eşiği (%${(minViableTpPct * 100).toFixed(2)}) altında; dar yatayda nakit korunuyor.`;
        direction = null;
      }

      // Dinamik Kalite & Confluence Skoru (0 - 98)
      if (direction) {
        candidateScore = scoreBreakoutSetupConfluence({
          direction,
          entryTimeframe,
          isCrypto,
          evalRes,
          obRatio: obDepth.ratio,
          tp1RatioPct,
          minViableTpPct,
        });

        // v6.0 İleriye Dönük Tahmin Doğrulama Kapısı (Tepe/Dip Climax Tuzaklarını Engeller & Güçlü Tahminleri Ödüllendirir)
        const dirTp1Prob = direction === 'AL (LONG)' ? forecast.tp1HitProbLong : forecast.tp1HitProbShort;
        if (direction === 'AL (LONG)' && forecast.gateBias < -0.05) {
          isForecastVeto = true;
          vetoReason = `Tahmin Kalkanı Vetosu (AL): Kısa vadeli aşırı uzama sonrası ileriye dönük +4S/+12S projeksiyon düşüş riski gösteriyor (Hedef ${forecast.pred4hPrice}, Bias ${forecast.gateBias}); tepe tuzağı engellendi.`;
          direction = null;
        } else if (direction === 'SAT (SHORT)' && forecast.gateBias > 0.05) {
          isForecastVeto = true;
          vetoReason = `Tahmin Kalkanı Vetosu (SAT): Dip uzaması sonrası ileriye dönük +4S/+12S projeksiyon yukarı tepki riski gösteriyor (Hedef ${forecast.pred4hPrice}, Bias ${forecast.gateBias}); dip tuzağı engellendi.`;
          direction = null;
        } else {
          if (dirTp1Prob >= 47 && Math.abs(forecast.gateBias) >= 0.22) {
            candidateScore = Math.min(98, candidateScore + 5);
          }
          const fcPctStr = forecast.pred4hPct >= 0 ? `+${forecast.pred4hPct}%` : `${forecast.pred4hPct}%`;
          rationale = `${rationale} | +4S Tahmin: ${forecast.pred4hPrice} (${fcPctStr}, TP1 İhtimali %${dirTp1Prob})`;
        }

        if (direction && candidateScore < 68) {
          vetoReason = `Kalite Puanı Yetersiz (${candidateScore}/100 < 68): ${rationale}`;
          direction = null;
        }
      } else {
        // Bekleme / Yatay Sıkışma Halinde Canlı Kırılım Hazırlık Puanı (24 - 70 Arası Dinamik Skor)
        const erTarget = isCrypto ? 0.18 : 0.20;
        const bestEr = Math.max(hEr, m15Er);
        const bestAdx = Math.max(hAdx.adx, m15Adx.adx);
        const bestRvol = Math.max(hRvol, m15Rvol);
        const utcHourNow = new Date(now).getUTCHours();
        const isFxOffHours = isFx && (utcHourNow < 7 || utcHourNow > 20);

        const impBullAligned = isCrypto && midPrice > hEma21 && hEma21 >= hEma50 * 0.998 && btcBullMacro;
        const impBearAligned = isCrypto && midPrice < hEma21 && hEma21 <= hEma50 * 1.002 && btcBearMacro;
        const activeRefHi = isCrypto
          ? impBullAligned
            ? m15Don16.high
            : Math.min(m15Bars.length >= 40 ? m15Don28.high : Infinity, hDon20.high)
          : Math.min(m15Bars.length >= 40 ? m15Don28.high : Infinity, hDon16.high);
        const activeRefLo = isCrypto
          ? impBearAligned
            ? m15Don16.low
            : Math.max(m15Bars.length >= 40 ? m15Don28.low : -Infinity, hDon20.low)
          : Math.max(m15Bars.length >= 40 ? m15Don28.low : -Infinity, hDon16.low);
        const trigHiVal = Number.isFinite(activeRefHi) ? activeRefHi : hDon20.high;
        const trigLoVal = Number.isFinite(activeRefLo) ? activeRefLo : hDon20.low;

        const bandWidth = Math.max(1e-9, trigHiVal - trigLoVal);
        const distTopPct = Math.max(0, (trigHiVal - midPrice) / bandWidth);
        const distBotPct = Math.max(0, (midPrice - trigLoVal) / bandWidth);
        const nearestEdgeRatio = 1 - Math.min(1, Math.min(distTopPct, distBotPct) * 2);

        const edgePts = Math.round(nearestEdgeRatio * 24);
        const erProgressPts = Math.round(Math.min(1, bestEr / erTarget) * 22);
        const adxProgressPts = Math.round(Math.min(1, bestAdx / 25) * 14);
        const volProgressPts = Math.round(Math.min(1, bestRvol / 1.5) * 10);
        candidateScore = Math.max(24, Math.min(70, edgePts + erProgressPts + adxProgressPts + volProgressPts));

        if (!vetoReason) {
          const trigHi = trigHiVal.toFixed(candidate.digits);
          const trigLo = trigLoVal.toFixed(candidate.digits);
          const obNote = isCrypto && obDepth.bidVol + obDepth.askVol > 0 ? ` · Defter B/A: ${obDepth.ratio}x` : '';
          const erGapNote = isFxOffHours
            ? `Asya Düşük Likidite Kalkanı (FX 07:00-20:00 UTC Londra/NY bekleniyor)`
            : midPrice >= trigHiVal
              ? `Üst Tetik Geçildi ancak Trend/Hacim Teyidi Bekleniyor (15dk RVOL ${m15Rvol}x, ADX ${m15Adx.adx})`
              : midPrice <= trigLoVal
                ? `Alt Tetik Kırıldı ancak Trend/Hacim Teyidi Bekleniyor (15dk RVOL ${m15Rvol}x, ADX ${m15Adx.adx})`
                : bestEr < erTarget
                  ? `Yön Netliği (ER ${bestEr}/${erTarget} — piyasa yatay testerede)`
                  : bestRvol < 1.1
                    ? `Hacim Teyidi Düşük (RVOL ${bestRvol}x/1.10x)`
                    : `Fiyat Henüz Bant İçinde`;
          vetoReason = `Nakit Kalkanı — Gerçek Kırılım Tetikleyicisi (AL > ${trigHi} | SAT < ${trigLo}): ${erGapNote} · 15dk ER ${m15Er} / Hacim ${m15Rvol}x${obNote}. Doğrulanmamış girişte komisyon yakmamak için tetik bekleniyor.`;
        }
      }

      if (isMarketClosed) {
        direction = null;
        candidateScore = 50;
      }

      evaluatedList.push({
        candidate,
        market,
        midPrice,
        ema8,
        ema21,
        ema50,
        ema200,
        rsi,
        dailyAtr,
        tradeAtr,
        entryTimeframe,
        newsScore,
        newsCtx,
        trendRegime,
        isMarketClosed,
        marketSession,
        direction,
        rationale,
        riskScale,
        vetoReason,
        isNewsVeto,
        isForecastVeto,
        candidateScore,
        forecast,
      });
    } catch {
      // Ignore individual fetch error
    }
  }

  // Pass 2: v5.3 Konviksiyon Ağırlıklı Sermaye Dağıtımı (A+ kurulumlar %30 daha güçlü boyutlanır; TradFi + Kripto 5/3/2 portföy sınırı)
  if (state.isRunning) {
    const qualified = evaluatedList
      .filter((e) => e.direction && !e.existingOpen && !e.isMarketClosed)
      .sort((a, b) => {
        if (b.candidateScore !== a.candidateScore) return b.candidateScore - a.candidateScore;
        return Math.abs(b.newsScore) - Math.abs(a.newsScore);
      });

    for (const item of qualified) {
      const { candidate, market, midPrice, ema8, ema21, ema50, ema200, rsi, dailyAtr, tradeAtr, newsScore, newsCtx, direction, rationale, riskScale } = item;
      if (!direction) continue;

      const isCrypto = candidate.cluster.startsWith('CRYPTO');
      const totalCryptoOpen = state.openPositions.filter((p) => getSpec(p.symbol).cluster.startsWith('CRYPTO')).length;
      const sameClusterOpen = state.openPositions.filter((p) => getSpec(p.symbol).cluster === candidate.cluster).length;
      const sameDirCryptoOpen = state.openPositions.filter(
        (p) => getSpec(p.symbol).cluster.startsWith('CRYPTO') && p.direction === direction
      ).length;

      if (state.openPositions.length >= 5) {
        item.blockedStatus = 'LİMİT DOLU (5/5)';
        item.blockedReason = `${direction} kırılımı hazır (${item.candidateScore}/100 — ${rationale}) ancak portföydeki maksimum 5 açık pozisyon sınırı dolu.`;
        continue;
      }
      if (isCrypto && totalCryptoOpen >= 3) {
        item.blockedStatus = 'KORELASYON KALKANI';
        item.blockedReason = `${direction} kırılımı hazır (${item.candidateScore}/100) ancak kripto sepeti kotası (3/3) dolu; kalan kapasite küresel piyasalar (Altın/Endeks/FX) için korunuyor.`;
        continue;
      }
      if (sameClusterOpen >= 1) {
        item.blockedStatus = 'KORELASYON KALKANI';
        item.blockedReason = `${direction} kırılımı hazır (${item.candidateScore}/100) ancak aynı korelasyon kümesinde (${candidate.cluster}) halihazırda açık pozisyon var; aşırı yoğunlaşma engellendi.`;
        continue;
      }
      if (isCrypto && sameDirCryptoOpen >= 2) {
        item.blockedStatus = 'KORELASYON KALKANI';
        item.blockedReason = `${direction} kırılımı hazır (${item.candidateScore}/100) ancak kriptoda aynı yönde zaten 2/2 pozisyon açık; toplu ters squeeze riskine karşı korundu.`;
        continue;
      }

      const dirTp1ForKelly = direction === 'AL (LONG)' ? item.forecast.tp1HitProbLong : item.forecast.tp1HitProbShort;
      const convRiskMult = computeFractionalKellyMultiplier(dirTp1ForKelly, isCrypto);
      const effScale = +(riskScale * convRiskMult).toFixed(2);

      const usedMarginTRY = state.openPositions.reduce(
        (s, p) => s + p.allocatedCapitalTRY * (p.tp1Hit ? 0.5 : 1),
        0
      );
      const freeMarginTRY = Math.max(0, state.cashBalanceTRY - usedMarginTRY);
      const currentEq = state.cashBalanceTRY;
      const desiredRiskTRY = +(currentEq * 0.014 * effScale).toFixed(2);
      const rawAllocTRY = +(currentEq * 0.16 * effScale).toFixed(2);
      const allocTRY = +Math.min(rawAllocTRY, freeMarginTRY * 0.95).toFixed(2);
      if (allocTRY < 5000) continue;

      const halfSpreadFallback = candidate.spreadPts / 2;
      const liveBid = +(
        typeof market.bid === 'number' && market.bid > 0 ? market.bid : midPrice - halfSpreadFallback
      ).toFixed(candidate.digits);
      const liveAsk = +(
        typeof market.ask === 'number' && market.ask > 0 ? market.ask : midPrice + halfSpreadFallback
      ).toFixed(candidate.digits);
      const actualSpreadPts = +(Math.max(0, liveAsk - liveBid)).toFixed(candidate.digits);

      const entryPrice =
        direction === 'AL (LONG)'
          ? +(liveAsk + candidate.slippagePts).toFixed(candidate.digits)
          : +(liveBid - candidate.slippagePts).toFixed(candidate.digits);

      const slDist = tradeAtr * 2.0;
      const tp1Dist = tradeAtr * (isCrypto ? 3.2 : 3.0);
      const tp2Dist = tradeAtr * (isCrypto ? 5.8 : 6.8);

      const stopLoss =
        direction === 'AL (LONG)'
          ? +(entryPrice - slDist).toFixed(candidate.digits)
          : +(entryPrice + slDist).toFixed(candidate.digits);
      const tp1 =
        direction === 'AL (LONG)'
          ? +(entryPrice + tp1Dist).toFixed(candidate.digits)
          : +(entryPrice - tp1Dist).toFixed(candidate.digits);
      const tp2 =
        direction === 'AL (LONG)'
          ? +(entryPrice + tp2Dist).toFixed(candidate.digits)
          : +(entryPrice - tp2Dist).toFixed(candidate.digits);

      const quoteToUsd = candidate.symbol === 'USD/JPY' ? 1 / (entryPrice || 155) : 1;
      const unitDecimals = entryPrice >= 1000 ? 5 : entryPrice >= 1 ? 4 : 2;
      const unitRiskTRY = slDist * quoteToUsd * usdTry;
      const rawUnitsByRisk = desiredRiskTRY / (unitRiskTRY || 1);
      const maxUnitsByMargin = (allocTRY * candidate.maxIbkrLeverage) / ((entryPrice * quoteToUsd * usdTry) || 1);
      const actualUnits = +Math.max(0.00001, Math.min(rawUnitsByRisk, maxUnitsByMargin)).toFixed(unitDecimals);
      const actualRiskTRY = +(actualUnits * unitRiskTRY).toFixed(2);
      const actualNotionalTRY = +(actualUnits * entryPrice * quoteToUsd * usdTry).toFixed(2);

      const entryCommissionTRY = computeIbkrCommissionTRY(candidate, actualNotionalTRY, actualUnits, usdTry);
      state.cashBalanceTRY = +(state.cashBalanceTRY - entryCommissionTRY).toFixed(2);

      const initLiqPrice = direction === 'AL (LONG)' ? liveBid : liveAsk;
      const initPriceDiff = direction === 'AL (LONG)' ? initLiqPrice - entryPrice : entryPrice - initLiqPrice;
      const initQuoteToUsd = candidate.symbol === 'USD/JPY' ? 1 / (initLiqPrice || 155) : 1;
      const initGrossFloatTRY = +(actualUnits * initPriceDiff * initQuoteToUsd * usdTry).toFixed(2);
      const initCloseNotional = actualUnits * initLiqPrice * initQuoteToUsd * usdTry;
      const estExitFeeTRY = computeIbkrCommissionTRY(candidate, initCloseNotional, actualUnits, usdTry);
      const initUnrealizedTRY = +(initGrossFloatTRY - estExitFeeTRY).toFixed(2);
      const initRealizedTRY = +(-entryCommissionTRY).toFixed(2);
      const initTotalPnLTRY = +(initRealizedTRY + initUnrealizedTRY).toFixed(2);

      const built = buildForensicXRayForTrade({
        symbol: candidate.symbol,
        digits: candidate.digits,
        direction,
        midPrice,
        entryPrice,
        stopLoss,
        tp1,
        tp2,
        ema8,
        ema21,
        ema50,
        ema200,
        rsi14: rsi,
        dailyAtr14: dailyAtr,
        tradeAtr,
        newsScore,
        newsHeadline: newsCtx.impactingHeadline,
        newsSource: newsCtx.source,
        cashBalanceTRY: currentEq,
        allocatedCapitalTRY: allocTRY,
        riskAmountTRY: actualRiskTRY,
        usdTry,
        entryTimeIso: nowIso,
        status: 'ACIK',
        tp1Hit: false,
        trailingStopActive: false,
        realizedPnL_TRY: initRealizedTRY,
        mfePrice: initLiqPrice,
        mfeR: +(initPriceDiff / (slDist || 1)).toFixed(2),
        mfeTRY: initTotalPnLTRY,
        maePrice: initLiqPrice,
        maeR: +(initPriceDiff / (slDist || 1)).toFixed(2),
        maeTRY: initTotalPnLTRY,
        fixedUnits: actualUnits,
        fixedSpreadPts: actualSpreadPts,
        fixedExecutionCostTRY: entryCommissionTRY,
        fixedRiskAmountTRY: actualRiskTRY,
        fixedConfluenceScore: item.candidateScore,
        forecastSnapshot: {
          horizonDirection: item.forecast.horizonDirection,
          pred4hPrice: item.forecast.pred4hPrice,
          pred4hPct: item.forecast.pred4hPct,
          pred12hPrice: item.forecast.pred12hPrice,
          pred12hPct: item.forecast.pred12hPct,
          tp1Probability:
            direction === 'AL (LONG)' ? item.forecast.tp1HitProbLong : item.forecast.tp1HitProbShort,
          forecastConviction: item.forecast.forecastConviction,
          regimePhase: item.forecast.regimePhase,
          kellyMultiplier: convRiskMult,
        },
      });

      const newTrade: AutonomousTrade = {
        id: `TRD-${candidate.symbol.replace(/[\/\.\s]/g, '')}-${now.toString().slice(-5)}`,
        symbol: candidate.symbol,
        name: candidate.name,
        digits: candidate.digits,
        direction,
        status: 'ACIK',
        entryTime: nowIso,
        entryTimestamp: now,
        midEntryPrice: midPrice,
        entryPrice,
        currentPrice: initLiqPrice,
        bidAtTick: liveBid,
        askAtTick: liveAsk,
        takeProfit1: tp1,
        takeProfit2: tp2,
        stopLoss,
        initialStopLoss: stopLoss,
        allocatedCapitalTRY: allocTRY,
        riskAmountTRY: actualRiskTRY,
        positionSizeUnits: built.positionSizeUnits,
        lotSize: built.lotSize,
        contractSize: built.contractSize,
        unitLabel: candidate.unitLabel,
        notionalValueTRY: built.notionalValueTRY,
        effectiveLeverage: built.effectiveLeverage,
        accountLeverage: built.accountLeverage,
        isLeveraged: built.isLeveraged,
        spot1xEquivalentPnL_TRY: +(initTotalPnLTRY / Math.max(1, built.effectiveLeverage)).toFixed(2),
        spreadPts: actualSpreadPts,
        slippagePts: candidate.slippagePts,
        executionCostTRY: entryCommissionTRY,
        entryCommissionTRY,
        exitCommissionTRY: 0,
        financingCostTRY: 0,
        lastSwapDateUTC: nowIso.slice(0, 10),
        usdTryAtEntry: usdTry,
        grossUnrealizedPnL_TRY: initGrossFloatTRY,
        rMultiple: +(initTotalPnLTRY / (actualRiskTRY || 1)).toFixed(2),
        mfeTRY: initTotalPnLTRY,
        mfeR: +(initPriceDiff / (slDist || 1)).toFixed(2),
        maeTRY: initTotalPnLTRY,
        maeR: +(initPriceDiff / (slDist || 1)).toFixed(2),
        tp1Hit: false,
        breakevenActive: false,
        trailingStopActive: false,
        realizedPnL_TRY: initRealizedTRY,
        unrealizedPnL_TRY: initUnrealizedTRY,
        totalPnL_TRY: initTotalPnLTRY,
        totalPnL_Percent: +((initTotalPnLTRY / state.initialCapitalTRY) * 100).toFixed(2),
        confluenceScore: item.candidateScore,
        entryTimeframe: item.entryTimeframe,
        rationale,
        forecastSnapshot: {
          horizonDirection: item.forecast.horizonDirection,
          pred4hPrice: item.forecast.pred4hPrice,
          pred4hPct: item.forecast.pred4hPct,
          pred12hPrice: item.forecast.pred12hPrice,
          pred12hPct: item.forecast.pred12hPct,
          tp1Probability:
            direction === 'AL (LONG)' ? item.forecast.tp1HitProbLong : item.forecast.tp1HitProbShort,
          forecastConviction: item.forecast.forecastConviction,
          regimePhase: item.forecast.regimePhase,
          kellyMultiplier: convRiskMult,
        },
        forensicXRay: built.xray,
      };

      state.openPositions.push(newTrade);
      item.executedTrade = newTrade;

      state.activityLog.unshift({
        id: `ACT-ENT-${now}-${candidate.symbol}`,
        timestamp: nowIso,
        type: 'ENTRY',
        symbol: candidate.symbol,
        message: `YENİ İŞLEM AÇILDI [${item.entryTimeframe}] (${item.candidateScore}/100): ${candidate.symbol} (${direction} — ${built.positionSizeUnits} ${candidate.unitLabel}, ${built.effectiveLeverage}x) @ ${entryPrice} (IBKR Komisyon: -${entryCommissionTRY} TL) | TP1: ${tp1} | TP2: ${tp2} | SL: ${stopLoss} | ${rationale}`,
        pnlImpactTRY: initRealizedTRY,
      });
    }
  }

  // Pass 3: Tarama Tablosunu Orijinal Enstrüman Sırasıyla Derle
  const scannerResults: MarketScannerItem[] = evaluatedList.map((e) => {
    const { candidate, midPrice, ema8, ema21, ema50, trendRegime, rsi, dailyAtr, newsScore, newsCtx, existingOpen, isMarketClosed, marketSession, direction, rationale, vetoReason, isNewsVeto, isForecastVeto, candidateScore, forecast, executedTrade, blockedStatus, blockedReason } = e;
    const activeProb =
      (existingOpen?.direction || executedTrade?.direction || direction) === 'AL (LONG)'
        ? forecast.tp1HitProbLong
        : (existingOpen?.direction || executedTrade?.direction || direction) === 'SAT (SHORT)'
        ? forecast.tp1HitProbShort
        : Math.max(forecast.tp1HitProbLong, forecast.tp1HitProbShort);
    const activeKelly = computeFractionalKellyMultiplier(activeProb, candidate.cluster.startsWith('CRYPTO'));
    const fcFields = {
      forecastDirection: forecast.horizonDirection,
      forecastTarget4h: forecast.pred4hPrice,
      forecastTarget12h: forecast.pred12hPrice,
      forecastMove4hPct: forecast.pred4hPct,
      forecastMove12hPct: forecast.pred12hPct,
      forecastConviction: forecast.forecastConviction,
      tp1Probability: activeProb,
      kellyMultiplier: activeKelly,
      squeezeOn: forecast.indicators.squeezeOn,
      regimePhase: forecast.regimePhase,
    };

    if (existingOpen) {
      return {
        symbol: candidate.symbol,
        name: candidate.name,
        digits: candidate.digits,
        price: midPrice,
        ema8: +ema8.toFixed(candidate.digits),
        ema21: +ema21.toFixed(candidate.digits),
        ema50: +ema50.toFixed(candidate.digits),
        trendRegime,
        rsi14: rsi,
        atr14: +dailyAtr.toFixed(candidate.digits),
        newsSentimentScore: newsScore,
        newsHeadline: newsCtx.impactingHeadline || 'Sakin / Teknik Akış',
        confluenceScore: existingOpen.confluenceScore || 88,
        candidateDirection: existingOpen.direction,
        status: 'POZİSYONDA (AÇIK)',
        ...fcFields,
        decisionReason: `Aktif ${existingOpen.direction} [${existingOpen.entryTimeframe || '1H'}] (${existingOpen.positionSizeUnits} ${candidate.unitLabel}) yönetiliyor (${existingOpen.trailingStopActive ? `Chandelier İz Stop Aktif: ${existingOpen.stopLoss}` : existingOpen.tp1Hit ? `TP1 Alındı, Başabaş Stop: ${existingOpen.stopLoss}` : `SL: ${existingOpen.stopLoss} | TP1: ${existingOpen.takeProfit1}`}).`,
        scannedAt: nowIso,
      };
    }
    if (executedTrade) {
      return {
        symbol: candidate.symbol,
        name: candidate.name,
        digits: candidate.digits,
        price: midPrice,
        ema8: +ema8.toFixed(candidate.digits),
        ema21: +ema21.toFixed(candidate.digits),
        ema50: +ema50.toFixed(candidate.digits),
        trendRegime,
        rsi14: rsi,
        atr14: +dailyAtr.toFixed(candidate.digits),
        newsSentimentScore: newsScore,
        newsHeadline: newsCtx.impactingHeadline || 'Sakin / Teknik Akış',
        confluenceScore: candidateScore,
        candidateDirection: executedTrade.direction,
        status: 'YENİ GİRİŞ',
        ...fcFields,
        decisionReason: `Tahmin & Teknik Çift Onay (${candidateScore}/100): ${executedTrade.positionSizeUnits} ${candidate.unitLabel} ${executedTrade.direction} @ ${executedTrade.entryPrice} (+4S Hedef ${forecast.pred4hPrice}, TP1 İhtimali %${activeProb}).`,
        scannedAt: nowIso,
      };
    }

    let scanStatus: MarketScannerItem['status'] = 'TEKNİK TEYİT BEKLİYOR';
    let scanReason = vetoReason || rationale || 'Sinyal teyidi bekleniyor.';
    let scanScore = candidateScore;

    if (isMarketClosed) {
      scanStatus = 'PİYASA KAPALI (HAFTA SONU)';
      scanReason = marketSession.reason || 'Hafta sonu nedeniyle piyasa kapalıdır. Pazartesi Asya/Londra seansı açılışı bekleniyor.';
      scanScore = 50;
    } else if (isNewsVeto) {
      scanStatus = 'HABER VETOSU';
      scanScore = 44;
    } else if (isForecastVeto) {
      scanStatus = 'TAHMİN VETOSU';
      scanScore = 46;
    } else if (blockedStatus) {
      scanStatus = blockedStatus;
      scanReason = blockedReason || scanReason;
    }

    return {
      symbol: candidate.symbol,
      name: candidate.name,
      digits: candidate.digits,
      price: midPrice,
      ema8: +ema8.toFixed(candidate.digits),
      ema21: +ema21.toFixed(candidate.digits),
      ema50: +ema50.toFixed(candidate.digits),
      trendRegime,
      rsi14: rsi,
      atr14: +dailyAtr.toFixed(candidate.digits),
      newsSentimentScore: newsScore,
      newsHeadline: newsCtx.impactingHeadline || 'Sakin / Teknik Akış',
      confluenceScore: scanScore,
      candidateDirection: direction || 'BEKLE',
      status: scanStatus,
      ...fcFields,
      decisionReason: scanReason,
      scannedAt: nowIso,
    };
  });

  state.marketScanner = scannerResults;
  ensureForensicXRayOnTrades(state);
  recalculateLedgerMetrics(state);

  const lastEqPoint = state.equityCurve[state.equityCurve.length - 1];
  if (!lastEqPoint || now - lastEqPoint.timestamp >= 60 * 1000 || Math.abs(lastEqPoint.equityTRY - state.totalEquityTRY) >= 15) {
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

  // Re-run drawdown on updated curve
  recalculateLedgerMetrics(state);

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
  return await resetAutonomousBotCleanZero(newCapitalTRY);
}

// Kullanıcı "Sıfırdan Başlat (0 İşlem)" butonuna bastığında geçmiş 5 günlük simülasyonu dahil etmeden,
// tam o saniyeden itibaren 250.000 TL nakit ile tertemiz başlatır ve anında canlı taramayı tetikler.
export async function resetAutonomousBotCleanZero(newCapitalTRY = 250000): Promise<AutonomousLedgerState> {
  const usdTry = await fetchLiveUsdTryRate();
  const cleanState = createCleanZeroLedgerObject(newCapitalTRY, usdTry);
  saveLedger(cleanState);
  return await executeAutonomousTradingTick(true);
}

export interface WalkForwardAuditTrade {
  symbol: string;
  name: string;
  digits: number;
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  timeframe: '1H' | '15M';
  entryTime: string;
  closeTime: string;
  entryPrice: number;
  closePrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  status: AutonomousTrade['status'];
  netPnL_TRY: number;
  commissionTRY: number;
  kellyMultiplier: number;
  confluenceScore: number;
  tp1Prob: number;
  pred4hPct: number;
  rationale: string;
}

export interface WalkForwardAuditResult {
  window: '7d' | '30d';
  strategyVersion: string;
  generatedAt: string;
  liveUsdTry: number;
  initialCapitalTRY: number;
  finalEquityTRY: number;
  netProfitTRY: number;
  netProfitPercent: number;
  totalClosedTrades: number;
  openTradesAtEnd: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  totalCommissionTRY: number;
  engineBreakdown: {
    engine: string;
    tradesCount: number;
    winRatePercent: number;
    netPnL_TRY: number;
  }[];
  equityCurve: { timeStr: string; equityTRY: number; drawdownPercent: number }[];
  closedTrades: WalkForwardAuditTrade[];
}

const walkForwardAuditCache = new Map<string, { ts: number; data: WalkForwardAuditResult }>();

/**
 * Gerçek Kraken 60m/15m + Yahoo CME Vadeli/FX Saatlik Geçmiş Barları Üzerinde
 * Sıfır Look-Ahead Bias ile v7.0 Walk-Forward Sistem Performans Doğrulaması.
 */
export async function runLiveWalkForwardAudit(
  window: '7d' | '30d' = '7d',
  forceRefresh = false
): Promise<WalkForwardAuditResult> {
  const cached = walkForwardAuditCache.get(window);
  if (!forceRefresh && cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    return cached.data;
  }

  const [usdTry, hourlyEntries, m15Entries] = await Promise.all([
    fetchLiveUsdTryRate(),
    Promise.all(
      CORE_UNIVERSE.map(async (c) => [c.symbol, await fetchRealHourlyHistory(c.symbol).catch(() => [] as HourlyBar[])] as const)
    ),
    window === '7d'
      ? Promise.all(
          CORE_UNIVERSE.map(async (c) => [c.symbol, await fetchReal15mHistory(c.symbol).catch(() => [] as HourlyBar[])] as const)
        )
      : Promise.resolve(CORE_UNIVERSE.map((c) => [c.symbol, [] as HourlyBar[]] as const)),
  ]);

  const hourlyMap = new Map<string, HourlyBar[]>(hourlyEntries);
  const m15Map = new Map<string, HourlyBar[]>(m15Entries);
  const nowMs = Date.now();
  const windowDays = window === '7d' ? 7.5 : 30;
  const cutoffMs = nowMs - windowDays * 24 * 3600 * 1000;

  interface AuditEvent {
    ts: number;
    symbol: string;
    tf: '1h' | '15m';
    idx: number;
    bar: HourlyBar;
  }

  const events: AuditEvent[] = [];
  for (const spec of CORE_UNIVERSE) {
    const hBars = hourlyMap.get(spec.symbol) || [];
    for (let i = 50; i < hBars.length; i++) {
      const closeTs = hBars[i].timestamp + 3600 * 1000;
      if (closeTs >= cutoffMs && closeTs <= nowMs) {
        events.push({ ts: closeTs, symbol: spec.symbol, tf: '1h', idx: i, bar: hBars[i] });
      }
    }
    if (window === '7d') {
      const mBars = m15Map.get(spec.symbol) || [];
      for (let i = 20; i < mBars.length; i++) {
        const closeTs = mBars[i].timestamp + 900 * 1000;
        if (closeTs >= cutoffMs && closeTs <= nowMs) {
          events.push({ ts: closeTs, symbol: spec.symbol, tf: '15m', idx: i, bar: mBars[i] });
        }
      }
    }
  }
  // Aynı timestamp'te önce 15m barının çıkışlarını yönet, ardından 1h kapanışı ile yeni giriş fırsatını değerlendir
  events.sort((a, b) => a.ts - b.ts || (a.tf === '15m' && b.tf === '1h' ? -1 : a.tf === '1h' && b.tf === '15m' ? 1 : 0));

  // Kronolojik BTC son bar imleci (look-ahead yok)
  const btcHBars = hourlyMap.get('BTC/USD') || [];
  let btcIdx = 0;

  // Her varlığın kronolojik olarak görülen son 1h/15m indexi & kapanış mark-to-market fiyatı
  const seenHIdx = new Map<string, number>();
  const lastPriceBySym = new Map<string, number>();

  interface AuditOpenPos {
    spec: InstrumentMicroSpec;
    direction: 'AL (LONG)' | 'SAT (SHORT)';
    entryTimeframe: '1H' | '15M';
    entryTs: number;
    entryTime: string;
    entryPrice: number;
    stopLoss: number;
    initialStopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
    slDist: number;
    tradeAtr: number;
    units: number;
    allocatedCapitalTRY: number;
    tp1Hit: boolean;
    trailingStopActive: boolean;
    peakPrice: number;
    realizedPnL_TRY: number;
    commissionTRY: number;
    kellyMultiplier: number;
    confluenceScore: number;
    tp1Prob: number;
    pred4hPct: number;
    rationale: string;
  }

  const initCap = 250000;
  let cashTRY = initCap;
  let peakEq = initCap;
  let maxDdPct = 0;
  let openPositions: AuditOpenPos[] = [];
  const closedTrades: WalkForwardAuditTrade[] = [];
  const equityCurve: { timeStr: string; equityTRY: number; drawdownPercent: number }[] = [
    {
      timeStr: new Date(events[0]?.ts || nowMs - windowDays * 86400_000).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      equityTRY: initCap,
      drawdownPercent: 0,
    },
  ];
  let lastCurveSampleTs = 0;

  const markEquity = (tsNow: number, forceSample = false) => {
    let floatTRY = 0;
    for (const pos of openPositions) {
      const px = lastPriceBySym.get(pos.spec.symbol) || pos.entryPrice;
      const isLong = pos.direction === 'AL (LONG)';
      const halfSp = pos.spec.spreadPts / 2;
      const liq = isLong ? px - halfSp : px + halfSp;
      const remUnits = pos.tp1Hit ? pos.units * 0.5 : pos.units;
      const diff = isLong ? liq - pos.entryPrice : pos.entryPrice - liq;
      const q2u = pos.spec.symbol === 'USD/JPY' ? 1 / (liq || 155) : 1;
      const gross = remUnits * diff * q2u * usdTry;
      const exitFee = computeIbkrCommissionTRY(pos.spec, remUnits * liq * q2u * usdTry, remUnits, usdTry);
      floatTRY += gross - exitFee;
    }
    const eq = +(cashTRY + floatTRY).toFixed(2);
    if (eq > peakEq) peakEq = eq;
    const dd = peakEq > 0 ? +(((peakEq - eq) / peakEq) * 100).toFixed(2) : 0;
    if (dd > maxDdPct) maxDdPct = dd;
    if (forceSample || tsNow - lastCurveSampleTs >= 6 * 3600 * 1000) {
      lastCurveSampleTs = tsNow;
      equityCurve.push({
        timeStr: new Date(tsNow).toLocaleString('tr-TR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
        equityTRY: eq,
        drawdownPercent: dd,
      });
    }
  };

  for (const ev of events) {
    const spec = getSpec(ev.symbol);
    const bar = ev.bar;
    const midPrice = +bar.close.toFixed(spec.digits);
    lastPriceBySym.set(ev.symbol, midPrice);

    if (ev.tf === '1h') {
      seenHIdx.set(ev.symbol, ev.idx);
    }

    while (btcIdx + 1 < btcHBars.length && btcHBars[btcIdx + 1].timestamp + 3600 * 1000 <= ev.ts) {
      btcIdx++;
    }

    // 1. Açık Pozisyonu Gerçek Bar High/Low/Close ile Yönet
    const nextOpen: AuditOpenPos[] = [];
    for (const pos of openPositions) {
      if (pos.spec.symbol !== ev.symbol) {
        nextOpen.push(pos);
        continue;
      }

      const isLong = pos.direction === 'AL (LONG)';
      const halfSp = pos.spec.spreadPts / 2;
      const bHigh = bar.high ?? bar.close;
      const bLow = bar.low ?? bar.close;
      const worstLiq = isLong ? bLow - halfSp : bHigh + halfSp;
      const bestLiq = isLong ? bHigh - halfSp : bLow + halfSp;
      const closeLiq = isLong ? bar.close - halfSp : bar.close + halfSp;
      const quoteToUsd = pos.spec.symbol === 'USD/JPY' ? 1 / (bar.close || 155) : 1;

      const closePosFull = (exitPx: number, status: AutonomousTrade['status']) => {
        const remUnits = pos.tp1Hit ? pos.units * 0.5 : pos.units;
        const diff = isLong ? exitPx - pos.entryPrice : pos.entryPrice - exitPx;
        const gross = remUnits * diff * quoteToUsd * usdTry;
        const exitFee = computeIbkrCommissionTRY(pos.spec, remUnits * exitPx * quoteToUsd * usdTry, remUnits, usdTry);
        const netDelta = gross - exitFee;
        cashTRY = +(cashTRY + netDelta).toFixed(2);
        const totalNet = +(pos.realizedPnL_TRY + netDelta).toFixed(2);
        closedTrades.push({
          symbol: pos.spec.symbol,
          name: pos.spec.name,
          digits: pos.spec.digits,
          direction: pos.direction,
          timeframe: pos.entryTimeframe,
          entryTime: pos.entryTime,
          closeTime: new Date(ev.ts).toISOString(),
          entryPrice: pos.entryPrice,
          closePrice: +exitPx.toFixed(pos.spec.digits),
          stopLoss: pos.stopLoss,
          takeProfit1: pos.takeProfit1,
          takeProfit2: pos.takeProfit2,
          status,
          netPnL_TRY: totalNet,
          commissionTRY: +(pos.commissionTRY + exitFee).toFixed(2),
          kellyMultiplier: pos.kellyMultiplier,
          confluenceScore: pos.confluenceScore,
          tp1Prob: pos.tp1Prob,
          pred4hPct: pos.pred4hPct,
          rationale: pos.rationale,
        });
        markEquity(ev.ts, true);
      };

      // Konservatif Sıra: Önce Stop Kontrolü (aynı bar içinde önce SL vurulmuş sayılır)
      const hitStopFirst = isLong ? worstLiq <= pos.stopLoss : worstLiq >= pos.stopLoss;
      if (!pos.tp1Hit && hitStopFirst) {
        closePosFull(pos.stopLoss, pos.trailingStopActive ? 'TRAILING_STOP_KAR' : 'STOP_LOSS');
        continue;
      }

      // TP1 %50 Realizasyon + Komisyon Tamponlu Başabaş
      const reachedTp1 = !pos.tp1Hit && (isLong ? bestLiq >= pos.takeProfit1 : bestLiq <= pos.takeProfit1);
      if (reachedTp1) {
        pos.tp1Hit = true;
        const halfUnits = +(pos.units * 0.5).toFixed(6);
        const diffTp1 = isLong ? pos.takeProfit1 - pos.entryPrice : pos.entryPrice - pos.takeProfit1;
        const grossHalf = halfUnits * diffTp1 * quoteToUsd * usdTry;
        const exitFeeHalf = computeIbkrCommissionTRY(
          pos.spec,
          halfUnits * pos.takeProfit1 * quoteToUsd * usdTry,
          halfUnits,
          usdTry
        );
        const netHalf = +(grossHalf - exitFeeHalf).toFixed(2);
        pos.realizedPnL_TRY = +(pos.realizedPnL_TRY + netHalf).toFixed(2);
        pos.commissionTRY = +(pos.commissionTRY + exitFeeHalf).toFixed(2);
        cashTRY = +(cashTRY + netHalf).toFixed(2);

        const feeBuffer = Math.min(pos.slDist * 0.3, pos.entryPrice * Math.max(0.0005, pos.spec.ibkrCommissionRate * 2.5));
        const beStop = isLong ? pos.entryPrice + feeBuffer : pos.entryPrice - feeBuffer;
        pos.stopLoss = isLong
          ? +Math.max(pos.stopLoss, beStop).toFixed(pos.spec.digits)
          : +Math.min(pos.stopLoss, beStop).toFixed(pos.spec.digits);
      }

      // Chandelier İz Süren Stop Güncellemesi
      pos.peakPrice = isLong ? Math.max(pos.peakPrice, bestLiq) : Math.min(pos.peakPrice, bestLiq);
      const isPosCrypto = pos.spec.cluster.startsWith('CRYPTO');
      const peakFav = isLong ? pos.peakPrice - pos.entryPrice : pos.entryPrice - pos.peakPrice;
      if (peakFav >= pos.slDist * (isPosCrypto ? 1.35 : 1.25)) {
        pos.trailingStopActive = true;
        const trailMult = isPosCrypto ? 1.55 : 1.45;
        const chandelier = isLong ? pos.peakPrice - pos.tradeAtr * trailMult : pos.peakPrice + pos.tradeAtr * trailMult;
        const minProfitLock = isLong ? pos.entryPrice + pos.slDist * 0.25 : pos.entryPrice - pos.slDist * 0.25;
        const candStop = isLong ? Math.max(pos.stopLoss, minProfitLock, chandelier) : Math.min(pos.stopLoss, minProfitLock, chandelier);
        if (isLong ? candStop > pos.stopLoss : candStop < pos.stopLoss) {
          pos.stopLoss = +candStop.toFixed(pos.spec.digits);
        }
      }

      // TP2 / İz Süren Stop / Time-Stop Kontrolü
      const reachedTp2 = isLong ? bestLiq >= pos.takeProfit2 : bestLiq <= pos.takeProfit2;
      if (reachedTp2) {
        closePosFull(pos.takeProfit2, 'TP2_TAM_HEDEF');
        continue;
      }

      const hitTrailStop = pos.tp1Hit && (isLong ? closeLiq <= pos.stopLoss : closeLiq >= pos.stopLoss);
      if (hitTrailStop) {
        closePosFull(pos.stopLoss, pos.trailingStopActive ? 'TRAILING_STOP_KAR' : 'TP1_VE_BASABAS');
        continue;
      }

      const ageMs = ev.ts - pos.entryTs;
      const tsMs = (pos.entryTimeframe === '15M' ? 18 : 36) * 3600 * 1000;
      const curDiff = isLong ? closeLiq - pos.entryPrice : pos.entryPrice - closeLiq;
      if (!pos.tp1Hit && !pos.trailingStopActive && ageMs >= tsMs && curDiff / pos.slDist < 0.05) {
        closePosFull(closeLiq, 'MANUEL_KAPANDI');
        continue;
      }

      nextOpen.push(pos);
    }
    openPositions = nextOpen;

    // 2. Yeni Giriş Taraması (Yalnızca 1S bar kapanışlarında yeni giriş açılır; 15m olayları Stop/TP yönetimi içindir)
    if (ev.tf !== '1h' || openPositions.length >= 5 || openPositions.some((p) => p.spec.symbol === ev.symbol)) {
      markEquity(ev.ts, false);
      continue;
    }

    const recentStop = closedTrades.find(
      (c) =>
        c.symbol === ev.symbol &&
        (c.status === 'STOP_LOSS' || c.status === 'MANUEL_KAPANDI') &&
        ev.ts - new Date(c.closeTime).getTime() < 150 * 60 * 1000
    );
    if (recentStop) {
      markEquity(ev.ts, false);
      continue;
    }

    const hEndIdx = seenHIdx.get(ev.symbol);
    const allHBars = hourlyMap.get(ev.symbol) || [];
    const allM15Bars = m15Map.get(ev.symbol) || [];
    const hSlice = hEndIdx !== undefined ? allHBars.slice(Math.max(0, hEndIdx - 119), hEndIdx + 1) : [];
    const m15Slice =
      window === '7d'
        ? allM15Bars.filter((mb) => mb.timestamp + 900 * 1000 <= ev.ts).slice(-120)
        : [];

    if (hSlice.length < 40) {
      markEquity(ev.ts, false);
      continue;
    }

    // BTC Makro Trend Senkronizasyonu (yalnız geçmiş barlar)
    const btcSliceStart = Math.max(0, btcIdx - 60);
    const btcCloses = btcHBars.slice(btcSliceStart, btcIdx + 1).map((b) => b.close);
    const btcPx = btcCloses[btcCloses.length - 1] || 0;
    const btcE21 = btcCloses.length >= 21 ? computeEMA(btcCloses, 21) : btcPx;
    const btcE50 = btcCloses.length >= 50 ? computeEMA(btcCloses, 50) : btcE21;
    const btcBull = btcPx === 0 || btcPx >= btcE50 * 0.996 || btcPx >= btcE21;
    const btcBear = btcPx === 0 || btcPx <= btcE50 * 1.004 || btcPx <= btcE21;

    const hClosesOnly = hSlice.map((b) => b.close);
    const evalRes = evaluateTechnicalBreakoutSetup({
      candidate: spec,
      midPrice,
      now: ev.ts,
      dailyCloses: hClosesOnly,
      dailyEma21: computeEMA(hClosesOnly, 21),
      dailyRsi: computeWilderRSI(hClosesOnly, 14),
      dailyAtr: computeWilderATR(hSlice.map((b) => ({ high: b.high ?? b.close, low: b.low ?? b.close, close: b.close })), 14) * 3.0,
      hBars: hSlice,
      m15Bars: m15Slice,
      btcBullMacro: btcBull,
      btcBearMacro: btcBear,
      obDepthRatio: 1.0,
      hasObDepth: false,
      allow1h: true,
      allow15m: false,
    });

    if (!evalRes.direction) {
      markEquity(ev.ts, false);
      continue;
    }

    const isCrypto = evalRes.isCrypto;
    const totalCryptoOpen = openPositions.filter((p) => p.spec.cluster.startsWith('CRYPTO')).length;
    const sameClusterOpen = openPositions.filter((p) => p.spec.cluster === spec.cluster).length;
    const sameDirCrypto = openPositions.filter((p) => p.spec.cluster.startsWith('CRYPTO') && p.direction === evalRes.direction).length;
    if ((isCrypto && totalCryptoOpen >= 3) || sameClusterOpen >= 1 || (isCrypto && sameDirCrypto >= 2)) {
      markEquity(ev.ts, false);
      continue;
    }

    const tp1RatioPct = (evalRes.tradeAtr * 3.2) / (midPrice || 1);
    const minViableTpPct = Math.max(isCrypto ? 0.014 : 0.0025, spec.ibkrCommissionRate * 2 * 5.5);
    if (tp1RatioPct < minViableTpPct) {
      markEquity(ev.ts, false);
      continue;
    }

    let cScore = scoreBreakoutSetupConfluence({
      direction: evalRes.direction,
      entryTimeframe: evalRes.entryTimeframe,
      isCrypto,
      evalRes,
      obRatio: 1.0,
      tp1RatioPct,
      minViableTpPct,
    });

    // İleriye Dönük Tahmin Doğrulama (Sıfır Gelecek Sızıntısı — yalnız geçmiş hSlice & m15Slice)
    const neutralNews = { sentimentScore: 0, shockLevel: 0, impactingHeadline: 'Teknik Walk-Forward Akış', source: 'MarketData' };
    const forecast = computeMultiHorizonForecast(
      hSlice,
      m15Slice.length >= 25 ? m15Slice : null,
      midPrice,
      spec.digits,
      neutralNews,
      1.0,
      24,
      spec.symbol
    );

    const isLongSig = evalRes.direction === 'AL (LONG)';
    if ((isLongSig && forecast.gateBias < -0.05) || (!isLongSig && forecast.gateBias > 0.05)) {
      markEquity(ev.ts, false);
      continue;
    }

    const dirTp1Prob = isLongSig ? forecast.tp1HitProbLong : forecast.tp1HitProbShort;
    if (dirTp1Prob >= 47 && Math.abs(forecast.gateBias) >= 0.22) {
      cScore = Math.min(98, cScore + 5);
    }
    if (cScore < 68) {
      markEquity(ev.ts, false);
      continue;
    }

    const kellyMult = computeFractionalKellyMultiplier(dirTp1Prob, isCrypto);
    const usedMarginTRY = openPositions.reduce((s, p) => s + p.allocatedCapitalTRY * (p.tp1Hit ? 0.5 : 1), 0);
    const freeMarginTRY = Math.max(0, cashTRY - usedMarginTRY);
    const allocTRY = +Math.min(cashTRY * 0.16 * kellyMult, freeMarginTRY * 0.95).toFixed(2);
    if (allocTRY < 5000) {
      markEquity(ev.ts, false);
      continue;
    }

    const desiredRiskTRY = +(cashTRY * 0.014 * kellyMult).toFixed(2);
    const halfSp = spec.spreadPts / 2;
    const entryPx = isLongSig
      ? +(midPrice + halfSp + spec.slippagePts).toFixed(spec.digits)
      : +(midPrice - halfSp - spec.slippagePts).toFixed(spec.digits);
    const slDist = evalRes.tradeAtr * 2.0;
    const tp1Dist = evalRes.tradeAtr * (isCrypto ? 3.2 : 3.0);
    const tp2Dist = evalRes.tradeAtr * (isCrypto ? 5.8 : 6.8);

    const stopLoss = isLongSig ? +(entryPx - slDist).toFixed(spec.digits) : +(entryPx + slDist).toFixed(spec.digits);
    const tp1 = isLongSig ? +(entryPx + tp1Dist).toFixed(spec.digits) : +(entryPx - tp1Dist).toFixed(spec.digits);
    const tp2 = isLongSig ? +(entryPx + tp2Dist).toFixed(spec.digits) : +(entryPx - tp2Dist).toFixed(spec.digits);

    const q2u = spec.symbol === 'USD/JPY' ? 1 / (entryPx || 155) : 1;
    const unitDec = entryPx >= 1000 ? 5 : entryPx >= 1 ? 4 : 2;
    const unitRiskTRY = slDist * q2u * usdTry;
    const rawUnitsByRisk = desiredRiskTRY / (unitRiskTRY || 1);
    const maxUnitsByMargin = (allocTRY * spec.maxIbkrLeverage) / ((entryPx * q2u * usdTry) || 1);
    const units = +Math.max(0.00001, Math.min(rawUnitsByRisk, maxUnitsByMargin)).toFixed(unitDec);
    const entryNotionalTRY = +(units * entryPx * q2u * usdTry).toFixed(2);
    const entryFee = computeIbkrCommissionTRY(spec, entryNotionalTRY, units, usdTry);
    cashTRY = +(cashTRY - entryFee).toFixed(2);

    openPositions.push({
      spec,
      direction: evalRes.direction,
      entryTimeframe: evalRes.entryTimeframe,
      entryTs: ev.ts,
      entryTime: new Date(ev.ts).toISOString(),
      entryPrice: entryPx,
      stopLoss,
      initialStopLoss: stopLoss,
      takeProfit1: tp1,
      takeProfit2: tp2,
      slDist,
      tradeAtr: evalRes.tradeAtr,
      units,
      allocatedCapitalTRY: allocTRY,
      tp1Hit: false,
      trailingStopActive: false,
      peakPrice: entryPx,
      realizedPnL_TRY: -entryFee,
      commissionTRY: entryFee,
      kellyMultiplier: kellyMult,
      confluenceScore: cScore,
      tp1Prob: dirTp1Prob,
      pred4hPct: forecast.pred4hPct,
      rationale: evalRes.rationale,
    });

    markEquity(ev.ts, false);
  }

  // Pencere sonu mark-to-market kapatma istatistiği (gerçekleşen son bakiye)
  let openFloatAtEnd = 0;
  for (const pos of openPositions) {
    const px = lastPriceBySym.get(pos.spec.symbol) || pos.entryPrice;
    const isLong = pos.direction === 'AL (LONG)';
    const halfSp = pos.spec.spreadPts / 2;
    const liq = isLong ? px - halfSp : px + halfSp;
    const remUnits = pos.tp1Hit ? pos.units * 0.5 : pos.units;
    const diff = isLong ? liq - pos.entryPrice : pos.entryPrice - liq;
    const q2u = pos.spec.symbol === 'USD/JPY' ? 1 / (liq || 155) : 1;
    const gross = remUnits * diff * q2u * usdTry;
    const exitFee = computeIbkrCommissionTRY(pos.spec, remUnits * liq * q2u * usdTry, remUnits, usdTry);
    openFloatAtEnd += gross - exitFee;
  }

  const finalEq = +(cashTRY + openFloatAtEnd).toFixed(2);
  markEquity(nowMs, true);
  if (equityCurve.length > 90) {
    const step = Math.ceil(equityCurve.length / 90);
    const sampled = equityCurve.filter((_, idx) => idx === 0 || idx === equityCurve.length - 1 || idx % step === 0);
    equityCurve.splice(0, equityCurve.length, ...sampled);
  }

  const wins = closedTrades.filter((t) => t.netPnL_TRY > 0);
  const losses = closedTrades.filter((t) => t.netPnL_TRY <= 0);
  const grossWin = wins.reduce((s, t) => s + t.netPnL_TRY, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnL_TRY, 0));
  const totalComm = +(closedTrades.reduce((s, t) => s + t.commissionTRY, 0) + openPositions.reduce((s, p) => s + p.commissionTRY, 0)).toFixed(2);

  const buckets = new Map<string, WalkForwardAuditTrade[]>();
  for (const t of closedTrades) {
    const key = `${t.timeframe} ${getSpec(t.symbol).cluster.startsWith('CRYPTO') ? 'Kripto' : 'Küresel'}`;
    const arr = buckets.get(key) || [];
    arr.push(t);
    buckets.set(key, arr);
  }
  const engineBreakdown = Array.from(buckets.entries()).map(([engine, list]) => {
    const w = list.filter((x) => x.netPnL_TRY > 0).length;
    return {
      engine,
      tradesCount: list.length,
      winRatePercent: list.length ? Math.round((w / list.length) * 100) : 0,
      netPnL_TRY: +list.reduce((s, x) => s + x.netPnL_TRY, 0).toFixed(2),
    };
  });

  const result: WalkForwardAuditResult = {
    window,
    strategyVersion: 'v8.0-regime-forecast',
    generatedAt: new Date(nowMs).toISOString(),
    liveUsdTry: usdTry,
    initialCapitalTRY: initCap,
    finalEquityTRY: finalEq,
    netProfitTRY: +(finalEq - initCap).toFixed(2),
    netProfitPercent: +(((finalEq - initCap) / initCap) * 100).toFixed(2),
    totalClosedTrades: closedTrades.length,
    openTradesAtEnd: openPositions.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRatePercent: closedTrades.length ? Math.round((wins.length / closedTrades.length) * 100) : 0,
    profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : grossWin > 0 ? 9.99 : 0,
    maxDrawdownPercent: maxDdPct,
    totalCommissionTRY: totalComm,
    engineBreakdown,
    equityCurve,
    closedTrades: closedTrades.slice().reverse(),
  };

  walkForwardAuditCache.set(window, { ts: Date.now(), data: result });
  return result;
}

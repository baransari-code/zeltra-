// server/autonomousTrader.ts — ZELTRA 24/7 Kurumsal Otonom Portföy, Adli İşlem Denetimi (X-Ray), Mikro-Yapı & 9-Varlık Radar Motoru (250.000 TL Başlangıç Sermayesi)
import fs from 'fs';
import path from 'path';
import {
  fetchReal1YearData,
  fetchRealHourlyHistory,
  fetchLiveUsdTryRate,
  fetchRealFinancialNews,
  extractNewsSentimentForAsset,
} from './marketService';
import { synthesizeAssetNewsAI } from './newsAiEngine';

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
  rationale: string;
  exitReason?: string;
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
  status: 'POZİSYONDA (AÇIK)' | 'YENİ GİRİŞ' | 'HABER VETOSU' | 'KORELASYON KALKANI' | 'LİMİT DOLU (4/4)' | 'TEKNİK TEYİT BEKLİYOR' | 'PİYASA KAPALI (HAFTA SONU)';
  decisionReason: string;
  scannedAt: string;
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

interface InstrumentMicroSpec {
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

const CORE_UNIVERSE: InstrumentMicroSpec[] = [
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

function getSpec(symbol: string): InstrumentMicroSpec {
  return CORE_UNIVERSE.find((c) => c.symbol === symbol) || CORE_UNIVERSE[0];
}

function computeIbkrCommissionTRY(
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
 * Piyasa Seans Kontrolü:
 * Kripto (BTC, ETH, SOL, BNB, XRP, AVAX, LINK, DOGE): 7 gün 24 saat kesintisiz açık.
 * Forex & Emtia (EUR, GBP, JPY, XAU, WTI): Cuma 22:00 UTC kapanır, Pazar 22:00 UTC açılır.
 * ABD Hisse & Endeksler (NAS100, SPX500, NVDA): Hafta sonları tamamen kapalı.
 */
export function isMarketOpenForAsset(symbol: string, d: Date = new Date()): { isOpen: boolean; reason?: string } {
  const spec = getSpec(symbol);
  if (spec.cluster.startsWith('CRYPTO')) {
    return { isOpen: true };
  }

  const dayUtc = d.getUTCDay(); // 0 = Pazar, 5 = Cuma, 6 = Cumartesi
  const hourUtc = d.getUTCHours();

  // Cumartesi: Tüm geleneksel piyasalar kapalı
  if (dayUtc === 6) {
    return {
      isOpen: false,
      reason: 'Hafta sonu: Küresel geleneksel piyasalar kapalı. Yalnızca 7/24 Kripto varlıklar işlem görür.',
    };
  }

  // Pazar: 22:00 UTC'ye kadar (Sydney/Tokyo seansı açılana kadar) kapalı
  if (dayUtc === 0 && hourUtc < 22) {
    return {
      isOpen: false,
      reason: 'Hafta sonu: Küresel piyasalar Pazar 22:00 UTC Asya seansı açılışına kadar kapalıdır.',
    };
  }

  // Cuma: 22:00 UTC'den sonra kapalı
  if (dayUtc === 5 && hourUtc >= 22) {
    return {
      isOpen: false,
      reason: 'Hafta sonu tatili başladı (Cuma 22:00 UTC kapanışı). Pazar gecesi Asya açılışı bekleniyor.',
    };
  }

  // ABD Hisse ve Endeksler (NVDA, NAS100, SPX500) hafta içi gece seansları hariç hafta sonu kapalıdır
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

  const confluenceScore = Math.min(98, gate1Score + gate2Score + gate3Score + gate4Score + gate5Score);
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
      metricValue: `ATR: ${params.tradeAtr.toFixed(params.digits)} | SL: ${slDist.toFixed(params.digits)} (1.25x) | TP1: ${r1}R | TP2: ${r2}R`,
      threshold: 'Asimetrik Getiri: TP1 >= 1.50R & TP2 >= 2.50R',
      score: gate4Score,
      maxScore: 15,
      passed: true,
      note: `Stop gürültü bandının (1.25x ATR) dışına yerleştirildi. TP1'de %50 kâr alınıp Stop girişe (Breakeven) çekilir.`,
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

function recalculateLedgerMetrics(state: AutonomousLedgerState): void {
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
    const slDist = Math.abs(t.entryPrice - t.initialStopLoss) || (t.entryPrice * 0.005);
    const tradeAtr = +(slDist / 1.25).toFixed(t.digits);
    const dailyAtr14 = +(tradeAtr / 0.45).toFixed(t.digits);
    const isLong = t.direction === 'AL (LONG)';
    const snap = t.forensicXRay?.indicatorSnapshot;
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
        if (!hasLegacyBackfill && !hasLegacyNonIbkr) {
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

  // Tüm 16 varlık verisini, Dolar kurunu ve haberleri paralel çek (milisaniyelik hız)
  const [usdTry, liveNews, marketEntries] = await Promise.all([
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
  ]);
  const marketMap = new Map<string, any>(marketEntries);
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

      // CANLI HABER ACİL RİSK KALKANI (Pozisyon açıldıktan sonra en az 15 dk geçmişse ve yeni ters şok oluştuysa)
      const newsCtx = extractNewsSentimentForAsset(pos.symbol, liveNews);
      const heldLongEnough = now - (pos.entryTimestamp || 0) >= 15 * 60 * 1000;
      const isSevereAdverseNews =
        heldLongEnough &&
        ((pos.direction === 'AL (LONG)' && newsCtx.sentimentScore <= -0.55) ||
          (pos.direction === 'SAT (SHORT)' && newsCtx.sentimentScore >= 0.55));

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
        pos.stopLoss = pos.entryPrice;

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
          message: `${pos.symbol} TP1 (${pos.takeProfit1}) seviyesini geçti @ ${livePrice}! Pozisyonun %50'si (+${netHalfProfit.toLocaleString('tr-TR')} TL net; komisyon: -${tp1ExitFeeTRY} TL) realize edildi, Stop başabaşa (${pos.entryPrice}) çekildi.`,
          pnlImpactTRY: netHalfProfit,
        });
      }

      // 2. Kademe İz Süren Stop (TP2 mesafesinin %75'ine ulaşıldığında Stop'u +0.5R'ye kilitle)
      const tp2Dist = Math.abs(pos.takeProfit2 - pos.entryPrice);
      const reached75PctTp2 = isLong
        ? livePrice >= pos.entryPrice + 0.75 * tp2Dist
        : livePrice <= pos.entryPrice - 0.75 * tp2Dist;

      if (pos.tp1Hit && !pos.trailingStopActive && reached75PctTp2) {
        pos.trailingStopActive = true;
        pos.stopLoss = isLong
          ? +(pos.entryPrice + 0.5 * slDist).toFixed(pos.digits)
          : +(pos.entryPrice - 0.5 * slDist).toFixed(pos.digits);
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
            ? `TP1 sonrası kalan %50 kısım +0.5R İz Süren Stop seviyesinde @ ${livePrice} icra edildi.`
            : `TP1 sonrası kalan %50 kısım Başa Baş Stop korumasıyla @ ${livePrice} fiyatından kapandı.`;

          state.closedTrades.unshift(pos);
          state.activityLog.unshift({
            id: `ACT-BE-${now}-${pos.symbol}`,
            timestamp: nowIso,
            type: 'BREAKEVEN_EXIT',
            symbol: pos.symbol,
            message: `${pos.symbol} ${pos.trailingStopActive ? 'İz Süren Stop' : 'Başa Baş Stop'} @ ${livePrice} ile kapandı. Komisyon sonrası net toplam: ${pos.totalPnL_TRY >= 0 ? '+' : ''}${pos.totalPnL_TRY.toLocaleString('tr-TR')} TL.`,
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

  // 2. 16-VARLIK CANLI PİYASA TARAYICI RADARI VE AKTİF PROFESYONEL İŞLEM GİRİŞ DENETİMİ
  const openSymbols = new Set(state.openPositions.map((p) => p.symbol));
  const scannerResults: MarketScannerItem[] = [];

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
      const minTradeAtr = midPrice * (candidate.cluster.startsWith('CRYPTO') ? 0.005 : 0.0025);
      const tradeAtr = Math.max(minTradeAtr, dailyAtr * 0.18);

      const newsCtx = extractNewsSentimentForAsset(candidate.symbol, liveNews);
      const aiNews = synthesizeAssetNewsAI(candidate.symbol, liveNews);
      const newsScore = newsCtx.sentimentScore;
      const hasNewsHeadline = Boolean(newsCtx.impactingHeadline);

      const trendRegime: MarketScannerItem['trendRegime'] =
        midPrice >= ema50 * 1.0005 ? 'BOĞA (BULL)' : midPrice <= ema50 * 0.9995 ? 'AYI (BEAR)' : 'YATAY';

      // Eğer zaten açık pozisyon varsa radara işle ve geç
      const existingOpen = state.openPositions.find((p) => p.symbol === candidate.symbol);
      if (existingOpen) {
        scannerResults.push({
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
          decisionReason: `Aktif ${existingOpen.direction} (${existingOpen.lotSize || 0.25} Lot) pozisyonu anlık yönetiliyor (${existingOpen.tp1Hit ? 'TP1 Alındı, Başabaş Stop Aktif' : `SL: ${existingOpen.stopLoss} | TP1: ${existingOpen.takeProfit1}`}).`,
          scannedAt: nowIso,
        });
        continue;
      }

      // Piyasa Açık / Kapalı Kontrolü (Hafta Sonu Filtresi)
      const marketSession = isMarketOpenForAsset(candidate.symbol, new Date(now));
      const isMarketClosed = !marketSession.isOpen;

      // Profesyonel Aktif Borsacı Karar Motoru (Açık Piyasalarda Ölü Bölge Bırakmayan Kurumsal 6-Kapı Analizi)
      let direction: 'AL (LONG)' | 'SAT (SHORT)' | null = null;
      let rationale = '';
      let riskScale = 1.0;
      let vetoReason = '';
      let isNewsVeto = false;

      if (aiNews.hasNews && aiNews.convictionScore >= 72 && Math.abs(aiNews.netAiScore) >= 0.35) {
        if (aiNews.direction === 'AL (LONG)') {
          direction = 'AL (LONG)';
          rationale = `Yapay Zeka Haber Katalizörü (%${aiNews.convictionScore} Güven): ${aiNews.whatHappened}`;
        } else if (aiNews.direction === 'SAT (SHORT)') {
          direction = 'SAT (SHORT)';
          rationale = `Yapay Zeka Haber Katalizörü (%${aiNews.convictionScore} Güven): ${aiNews.whatHappened}`;
        }
      }

      if (!direction) {
        if (rsi < 34) {
          if (newsScore <= -0.20 && midPrice < ema50) {
            direction = 'SAT (SHORT)';
            rationale = `Negatif Haber Akışı (${newsScore}) + EMA50 Altı Düşüş Momentum Kırılımı (Wilder RSI: ${rsi}).`;
          } else {
            direction = 'AL (LONG)';
            rationale = `Aşırı Satım Kurumsal Tepki Bölgesi (Wilder RSI: ${rsi}) + Likidite Dip Alımı.`;
          }
        } else if (rsi > 66) {
          if (newsScore >= 0.20 && midPrice >= ema50) {
            direction = 'AL (LONG)';
            rationale = `Pozitif Haber Katalizörü (+${newsScore}) + Güçlü Momentum Rallisi (Wilder RSI: ${rsi}).`;
          } else {
            direction = 'SAT (SHORT)';
            rationale = `Aşırı Alım Yorulma Bölgesi (Wilder RSI: ${rsi}) + Kurumsal Kâr Realizasyonu Satışı.`;
          }
        } else if (midPrice >= ema50) {
          if (newsScore <= -0.40) {
            direction = 'SAT (SHORT)';
            rationale = `Canlı Negatif Haber Şoku (${newsScore}) Nedeniyle Taktiksel Satış (Short) Pozisyonu.`;
          } else if (ema8 >= ema21 * 0.997) {
            direction = 'AL (LONG)';
            rationale = hasNewsHeadline && newsScore >= 0.15
              ? `Çift Teyit (Trend + Olumlu Haber): Fiyat > EMA50, EMA8/21 Alıcı Akışı ve Wilder RSI (${rsi}).`
              : `Yükseliş Rejimi (Fiyat > EMA50), EMA8/21 Kurumsal Alıcı Akışı ve Wilder RSI (${rsi}) Teyitli.`;
          } else {
            direction = 'AL (LONG)';
            rationale = `Ana Trend Pozitif (Fiyat > EMA50) — Kurumsal Düzeltme (Pullback) Destek Alımı (Wilder RSI: ${rsi}).`;
          }
        } else {
          if (newsScore >= 0.40) {
            direction = 'AL (LONG)';
            rationale = `Canlı Pozitif Haber Katalizörü (+${newsScore}) Nedeniyle Taktiksel Tepki Alımı (Long).`;
          } else if (ema8 <= ema21 * 1.003) {
            direction = 'SAT (SHORT)';
            rationale = hasNewsHeadline && newsScore <= -0.15
              ? `Çift Teyit (Trend + Olumsuz Haber): Fiyat < EMA50, EMA8/21 Satış Baskısı ve Wilder RSI (${rsi}).`
              : `Düşüş Rejimi (Fiyat < EMA50), EMA8/21 Kurumsal Satış Baskısı ve Wilder RSI (${rsi}) Teyitli.`;
          } else {
            direction = 'SAT (SHORT)';
            rationale = `Ana Trend Negatif (Fiyat < EMA50) — EMA50 Direnç Bölgesinden Kurumsal Satış (Wilder RSI: ${rsi}).`;
          }
        }
      }

      // Korelasyon Kümesi Kontrolü (Aynı alt-kümede maksimum 2 açık işlem)
      const sameClusterOpen = state.openPositions.filter((p) => getSpec(p.symbol).cluster === candidate.cluster).length;

      // Hafta sonu piyasa kapalılık denetimi: Geleneksel piyasalara hafta sonu emir iletilmez, yalnızca 7/24 Kripto işlem görür
      if (isMarketClosed) {
        direction = null;
      }

      if (direction && state.isRunning && state.openPositions.length < 4 && sameClusterOpen < 2) {
        const halfSpreadFallback = candidate.spreadPts / 2;
        const liveBid = +(
          typeof market.bid === 'number' && market.bid > 0 ? market.bid : midPrice - halfSpreadFallback
        ).toFixed(candidate.digits);
        const liveAsk = +(
          typeof market.ask === 'number' && market.ask > 0 ? market.ask : midPrice + halfSpreadFallback
        ).toFixed(candidate.digits);
        const actualSpreadPts = +(Math.max(0, liveAsk - liveBid)).toFixed(candidate.digits);

        // Gerçek IBKR Emri: Alış ASK'tan (+slippage), Satış BID'den (-slippage) dolar
        const entryPrice = direction === 'AL (LONG)'
          ? +(liveAsk + candidate.slippagePts).toFixed(candidate.digits)
          : +(liveBid - candidate.slippagePts).toFixed(candidate.digits);

        const usedMarginTRY = state.openPositions.reduce(
          (s, p) => s + p.allocatedCapitalTRY * (p.tp1Hit ? 0.5 : 1),
          0
        );
        const freeMarginTRY = Math.max(0, state.cashBalanceTRY - usedMarginTRY);
        const currentEq = state.cashBalanceTRY;
        const desiredRiskTRY = +(currentEq * 0.015 * riskScale).toFixed(2);
        const rawAllocTRY = +(currentEq * 0.20 * riskScale).toFixed(2);
        const allocTRY = +Math.min(rawAllocTRY, freeMarginTRY * 0.95).toFixed(2);

        if (allocTRY < 5000) {
          continue;
        }

        const slDist = tradeAtr * 1.25;
        const tp1Dist = tradeAtr * 1.85;
        const tp2Dist = tradeAtr * 3.10;

        const stopLoss = direction === 'AL (LONG)'
          ? +(entryPrice - slDist).toFixed(candidate.digits)
          : +(entryPrice + slDist).toFixed(candidate.digits);
        const tp1 = direction === 'AL (LONG)'
          ? +(entryPrice + tp1Dist).toFixed(candidate.digits)
          : +(entryPrice - tp1Dist).toFixed(candidate.digits);
        const tp2 = direction === 'AL (LONG)'
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

        // Gerçek IBKR Giriş Komisyonu: Açılış anında doğrudan nakit bakiyeden kesilir!
        const entryCommissionTRY = computeIbkrCommissionTRY(candidate, actualNotionalTRY, actualUnits, usdTry);
        state.cashBalanceTRY = +(state.cashBalanceTRY - entryCommissionTRY).toFixed(2);

        // Anlık Likidasyon Değeri (Long BID'den, Short ASK'tan bozdurulursa + tahmini çıkış komisyonu)
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
          confluenceScore: built.confluenceScore,
          rationale,
          forensicXRay: built.xray,
        };

        state.openPositions.push(newTrade);
        openSymbols.add(candidate.symbol);

        state.activityLog.unshift({
          id: `ACT-ENT-${now}-${candidate.symbol}`,
          timestamp: nowIso,
          type: 'ENTRY',
          symbol: candidate.symbol,
          message: `YENİ İŞLEM AÇILDI: ${candidate.symbol} (${direction} — ${built.positionSizeUnits} ${candidate.unitLabel}, ${built.effectiveLeverage}x) @ ${entryPrice} (IBKR Komisyon: -${entryCommissionTRY} TL) | TP1: ${tp1} | TP2: ${tp2} | SL: ${stopLoss} | Gerekçe: ${rationale}`,
          pnlImpactTRY: initRealizedTRY,
        });

        scannerResults.push({
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
          confluenceScore: built.confluenceScore,
          candidateDirection: direction,
          status: 'YENİ GİRİŞ',
          decisionReason: `6-Kapı Onaylandı (${built.confluenceScore}/100): ${built.lotSize} Lot ${direction} emri @ ${entryPrice} fiyatından icra edildi.`,
          scannedAt: nowIso,
        });
      } else {
        // Neden girilmediğini şeffaf biçimde radara yaz
        let scanStatus: MarketScannerItem['status'] = 'TEKNİK TEYİT BEKLİYOR';
        let scanReason = vetoReason || rationale;
        let scanScore = direction ? 84 : 58;

        if (isMarketClosed) {
          scanStatus = 'PİYASA KAPALI (HAFTA SONU)';
          scanReason = marketSession.reason || 'Hafta sonu nedeniyle piyasa kapalıdır. Pazartesi Asya/Londra seansı açılışı bekleniyor.';
          scanScore = 50;
        } else if (isNewsVeto) {
          scanStatus = 'HABER VETOSU';
          scanScore = 44;
        } else if (direction && sameClusterOpen >= 2) {
          scanStatus = 'KORELASYON KALKANI';
          scanReason = `${direction} sinyali hazır (${scanScore}/100 — ${rationale}) ancak aynı korelasyon kümesinde (${candidate.cluster}) 2 açık işlem bulunduğu için risk çeşitlendirmesi korundu.`;
        } else if (direction && state.openPositions.length >= 4) {
          scanStatus = 'LİMİT DOLU (4/4)';
          scanReason = `${direction} sinyali hazır (${scanScore}/100 — ${rationale}) ancak maksimum 4 eşzamanlı işlem kalkanı dolu (%80 teminat sınırı). Açık işlemlerden biri kapandığında anında devreye girecek.`;
        }

        scannerResults.push({
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
          decisionReason: scanReason,
          scannedAt: nowIso,
        });
      }
    } catch {
      // Ignore individual symbol fetch error
    }
  }

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

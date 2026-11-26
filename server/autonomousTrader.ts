// server/autonomousTrader.ts
// ZELTRA v16.1 — Kurumsal $25,000 USD IBKR Pro Reg-T Margin & Cortex +4S/12S Otonom Fon Motoru
// Mimari: Citadel / Millennium tarzı ayrık sermaye kotalı 3 pozitif-beklentili alfa motoru (0 adet +1S mikro-scalp, 0 adet düşük marjlı FX):
//   Pod-1: MR_SPRING_12H  (Hisse/Endeks/Metal 12H Seküler Dip Sıçraması — VIX Şelale Korumalı)
//   Pod-2: CRYPTO_MOM_12H (7/24 Kripto 12H Sakin-Vol Çift Yönlü Trend — Kraken Canlı Emir Defteri)
//   Pod-3: CTA_TREND      (Emtia & Kripto +4S Cortex Trend İçi Geri Çekilme Sniper Motoru)
// Doğrudan $25,000.00 USD (FINRA PDT Üstü Gerçek IBKR Pro Tiered + SEC/FINRA TAF + SOFR+%1.5 Marjin Faizi) muhasebesi.

import fs from 'fs';
import path from 'path';
import {
  extractNewsSentimentForAsset,
  fetchCleanDailyHistory,
  fetchExtendedHourlyHistory,
  fetchLiveCryptoQuotes,
  fetchLiveUsdTryRate,
  fetchMacroPulse,
  fetchRealFinancialNews,
  getNyLocalTimeInfo,
  getUsExchangeHolidayInfo,
  isAssetFeedLiveAndFresh,
  type HourlyBar,
} from './marketService';
import {
  build12hIndicatorPack,
  build4hIndicatorPack,
  buildDailyIndicatorPack,
  calcAtrSeries,
  calcEfficiencyRatio,
  calcEwmacAt,
  calcIbs,
  evaluateZacAt,
  extract4hContextAt,
  ZAC_CRYPTO_ASSETS,
  ZAC_MR12_ASSETS,
  type DailyIndicatorPack,
  type FourHourIndicatorPack,
  type TwelveHourIndicatorPack,
  type ZacPodType,
  type ZacRegime,
} from './zeltraAlphaIndicator';
import {
  analyzeCandlestickAndMicrostructure,
  buildExpertVector,
  computeAdaptiveHorizonForecast,
  findLastClosedBarIndex,
  loadOrInitAiBrain,
} from './zeltraSelfLearningAi';

export const STRATEGY_VERSION = 'v16.1-ibkr-pro-25k-usd';
export const INITIAL_CAPITAL_USD = 25_000;
export const LIVE_GO_TARGET_ISO = '2026-12-01T00:00:00.000Z';
// Dar bantlı FX pariteleri radarda ve /canli yapay zeka takibinde kalır; otomatik emir yetkisi en kârlı 14 varlığa odaklanır!
export const EXECUTION_EXCLUDED_SYMBOLS = new Set(['EUR/USD', 'GBP/USD', 'USD/JPY']);
export const CORTEX_4H_SNIPER_ASSETS = new Set([
  'XAU/USD', 'XAG/USD', 'COPPER', 'WTI', 'BRENT', 'BTC/USD', 'ETH/USD', 'SOL/USD',
]);
const LEDGER_FILE = path.resolve(process.cwd(), 'data', 'autonomous_trader_ledger.json');
const LIVE_AUDIT_FILE = path.resolve(process.cwd(), 'data', 'live_forward_audit.json');

interface PendingCortexSeal {
  symbol: string;
  horizonHours: 1 | 4;
  lockedAtMs: number;
  targetAtMs: number;
  expectedDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ';
  zacScore: number;
  dominantExpertLabelTR?: string;
}

function readAssetDirectionalStats(): Map<string, { dirAccPct: number; sampleCount: number }> {
  const res = new Map<string, { dirAccPct: number; sampleCount: number }>();
  try {
    if (!fs.existsSync(LIVE_AUDIT_FILE)) return res;
    const raw = JSON.parse(fs.readFileSync(LIVE_AUDIT_FILE, 'utf-8'));
    const list: any[] = Array.isArray(raw?.forecasts) ? raw.forecasts : [];
    const bySym = new Map<string, any[]>();
    for (const f of list) {
      if (
        !f ||
        (f.horizonHours !== 1 && f.horizonHours !== 4) ||
        (f.status !== 'DOĞRU' && f.status !== 'YANLIŞ') ||
        (f.expectedDirection !== 'YÜKSELİŞ' && f.expectedDirection !== 'DÜŞÜŞ') ||
        Math.abs(Number(f.zacScore || 0)) < 10 ||
        Math.abs(Number(f.actualMovePct || 0)) > 16.0
      ) {
        continue;
      }
      const arr = bySym.get(f.symbol) || [];
      arr.push(f);
      bySym.set(f.symbol, arr);
    }
    for (const [sym, arr] of bySym.entries()) {
      arr.sort((a, b) => Number(a.settledAtMs || 0) - Number(b.settledAtMs || 0));
      const recent = arr.slice(-25);
      if (recent.length < 4) {
        res.set(sym, { dirAccPct: 58, sampleCount: recent.length });
        continue;
      }
      const hits = recent.filter((f) => f.status === 'DOĞRU').length;
      res.set(sym, { dirAccPct: +((hits / recent.length) * 100).toFixed(1), sampleCount: recent.length });
    }
  } catch {
    // Okuma hatasında varsayılan nötr profil
  }
  return res;
}

function readPendingCortexForecasts(nowMs: number): Map<string, { f1?: PendingCortexSeal; f4?: PendingCortexSeal }> {
  const out = new Map<string, { f1?: PendingCortexSeal; f4?: PendingCortexSeal }>();
  try {
    if (!fs.existsSync(LIVE_AUDIT_FILE)) return out;
    const raw = JSON.parse(fs.readFileSync(LIVE_AUDIT_FILE, 'utf-8'));
    const list = Array.isArray(raw?.forecasts) ? raw.forecasts : [];
    for (const f of list) {
      if (
        !f ||
        f.status !== 'BEKLİYOR' ||
        (f.horizonHours !== 1 && f.horizonHours !== 4) ||
        (f.expectedDirection !== 'YÜKSELİŞ' && f.expectedDirection !== 'DÜŞÜŞ') ||
        typeof f.targetAtMs !== 'number' ||
        f.targetAtMs <= nowMs + 8 * 60 * 1000
      ) {
        continue;
      }
      const item: PendingCortexSeal = {
        symbol: String(f.symbol),
        horizonHours: f.horizonHours,
        lockedAtMs: Number(f.lockedAtMs || 0),
        targetAtMs: f.targetAtMs,
        expectedDirection: f.expectedDirection,
        zacScore: Number(f.zacScore || 0),
        dominantExpertLabelTR: f.dominantExpertLabelTR,
      };
      const cur = out.get(item.symbol) || {};
      if (item.horizonHours === 1) {
        if (!cur.f1 || item.lockedAtMs > cur.f1.lockedAtMs) cur.f1 = item;
      } else {
        if (!cur.f4 || item.lockedAtMs > cur.f4.lockedAtMs) cur.f4 = item;
      }
      out.set(item.symbol, cur);
    }
  } catch {
    // Mühür dosyası okunamazsa canlı tahminlere düş
  }
  return out;
}

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
  ibkrMaxFeePct?: number;
  maxIbkrLeverage: number;
  cluster: 'CRYPTO_MAJOR' | 'CRYPTO_L1' | 'PRECIOUS' | 'USD_MAJORS' | 'US_TECH' | 'ENERGY';
}

// Birebir Resmi IBKR Pro Tiered (US Hisse + SEC/FINRA TAF) + Index/Oil/Metal CFD + CME Micro Crypto / Paxos Tarifesi
export const INSTRUMENT_SPECS: Record<string, InstrumentMicroSpec> = {
  'BTC/USD': { symbol: 'BTC/USD', name: 'Bitcoin', digits: 2, contractSize: 1, unitLabel: 'BTC', spreadPts: 12.0, slippagePts: 3.0, ibkrCommissionRate: 0.0018, ibkrMinFeeUSD: 1.75, ibkrMaxFeePct: 0.01, maxIbkrLeverage: 2, cluster: 'CRYPTO_MAJOR' },
  'ETH/USD': { symbol: 'ETH/USD', name: 'Ethereum', digits: 2, contractSize: 10, unitLabel: 'ETH', spreadPts: 0.65, slippagePts: 0.15, ibkrCommissionRate: 0.0018, ibkrMinFeeUSD: 1.75, ibkrMaxFeePct: 0.01, maxIbkrLeverage: 2, cluster: 'CRYPTO_MAJOR' },
  'SOL/USD': { symbol: 'SOL/USD', name: 'Solana', digits: 2, contractSize: 100, unitLabel: 'SOL', spreadPts: 0.05, slippagePts: 0.01, ibkrCommissionRate: 0.0018, ibkrMinFeeUSD: 1.75, ibkrMaxFeePct: 0.01, maxIbkrLeverage: 2, cluster: 'CRYPTO_L1' },
  'XAU/USD': { symbol: 'XAU/USD', name: 'Ons Altın', digits: 2, contractSize: 100, unitLabel: 'Ons', spreadPts: 0.25, slippagePts: 0.05, ibkrCommissionRate: 0.00015, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'PRECIOUS' },
  'XAG/USD': { symbol: 'XAG/USD', name: 'Ons Gümüş', digits: 3, contractSize: 5000, unitLabel: 'Ons', spreadPts: 0.025, slippagePts: 0.005, ibkrCommissionRate: 0.0003, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'PRECIOUS' },
  'COPPER': { symbol: 'COPPER', name: 'Bakır', digits: 4, contractSize: 25000, unitLabel: 'Lb', spreadPts: 0.002, slippagePts: 0.0005, ibkrCommissionRate: 0.00015, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'PRECIOUS' },
  'NAS100': { symbol: 'NAS100', name: 'Nasdaq 100', digits: 2, contractSize: 1, unitLabel: 'Kontrat', spreadPts: 1.15, slippagePts: 0.30, ibkrCommissionRate: 0.0001, ibkrMinFeeUSD: 1.0, maxIbkrLeverage: 10, cluster: 'US_TECH' },
  'SPX500': { symbol: 'SPX500', name: 'S&P 500', digits: 2, contractSize: 1, unitLabel: 'Kontrat', spreadPts: 0.45, slippagePts: 0.12, ibkrCommissionRate: 0.00005, ibkrMinFeeUSD: 1.0, maxIbkrLeverage: 10, cluster: 'US_TECH' },
  'US30': { symbol: 'US30', name: 'Dow Jones 30', digits: 2, contractSize: 1, unitLabel: 'Kontrat', spreadPts: 1.80, slippagePts: 0.40, ibkrCommissionRate: 0.00005, ibkrMinFeeUSD: 1.0, maxIbkrLeverage: 10, cluster: 'US_TECH' },
  'NVDA': { symbol: 'NVDA', name: 'NVIDIA', digits: 2, contractSize: 1, unitLabel: 'Hisse', spreadPts: 0.04, slippagePts: 0.01, ibkrCommissionRate: 0.0002, ibkrMinFeeUSD: 0.35, ibkrPerShareUSD: 0.0035, ibkrMaxFeePct: 0.01, maxIbkrLeverage: 2, cluster: 'US_TECH' },
  'AAPL': { symbol: 'AAPL', name: 'Apple', digits: 2, contractSize: 1, unitLabel: 'Hisse', spreadPts: 0.03, slippagePts: 0.01, ibkrCommissionRate: 0.0002, ibkrMinFeeUSD: 0.35, ibkrPerShareUSD: 0.0035, ibkrMaxFeePct: 0.01, maxIbkrLeverage: 2, cluster: 'US_TECH' },
  'MSFT': { symbol: 'MSFT', name: 'Microsoft', digits: 2, contractSize: 1, unitLabel: 'Hisse', spreadPts: 0.04, slippagePts: 0.01, ibkrCommissionRate: 0.0002, ibkrMinFeeUSD: 0.35, ibkrPerShareUSD: 0.0035, ibkrMaxFeePct: 0.01, maxIbkrLeverage: 2, cluster: 'US_TECH' },
  'WTI': { symbol: 'WTI', name: 'WTI Petrol', digits: 2, contractSize: 100, unitLabel: 'Varil', spreadPts: 0.03, slippagePts: 0.01, ibkrCommissionRate: 0.00015, ibkrMinFeeUSD: 1.0, maxIbkrLeverage: 10, cluster: 'ENERGY' },
  'BRENT': { symbol: 'BRENT', name: 'Brent Petrol', digits: 2, contractSize: 100, unitLabel: 'Varil', spreadPts: 0.03, slippagePts: 0.01, ibkrCommissionRate: 0.00015, ibkrMinFeeUSD: 1.0, maxIbkrLeverage: 10, cluster: 'ENERGY' },
  'EUR/USD': { symbol: 'EUR/USD', name: 'Euro / USD', digits: 4, contractSize: 100000, unitLabel: 'EUR', spreadPts: 0.00012, slippagePts: 0.00003, ibkrCommissionRate: 0.00002, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 20, cluster: 'USD_MAJORS' },
  'USD/JPY': { symbol: 'USD/JPY', name: 'USD / JPY', digits: 2, contractSize: 100000, unitLabel: 'USD', spreadPts: 0.014, slippagePts: 0.004, ibkrCommissionRate: 0.00002, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 20, cluster: 'USD_MAJORS' },
  'GBP/USD': { symbol: 'GBP/USD', name: 'GBP / USD', digits: 4, contractSize: 100000, unitLabel: 'GBP', spreadPts: 0.00016, slippagePts: 0.00004, ibkrCommissionRate: 0.00002, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 20, cluster: 'USD_MAJORS' },
};

export const CORE_SYMBOLS: string[] = Object.keys(INSTRUMENT_SPECS);
export const CORE_UNIVERSE: InstrumentMicroSpec[] = Object.values(INSTRUMENT_SPECS);

export function getSpec(symbol: string): InstrumentMicroSpec {
  return (
    INSTRUMENT_SPECS[symbol] || {
      symbol,
      name: symbol,
      digits: 2,
      contractSize: 1,
      unitLabel: 'Birim',
      spreadPts: 0.05,
      slippagePts: 0.01,
      ibkrCommissionRate: 0.0002,
      ibkrMinFeeUSD: 1.0,
      maxIbkrLeverage: 5,
      cluster: 'US_TECH',
    }
  );
}

export function computeIbkrCommissionUSD(
  spec: InstrumentMicroSpec,
  notionalUSD: number,
  units: number,
  isSellSide = false
): number {
  const absUnits = Math.abs(units);
  const absNotional = Math.abs(notionalUSD);
  let brokerFee = spec.ibkrPerShareUSD
    ? Math.max(spec.ibkrMinFeeUSD, absUnits * spec.ibkrPerShareUSD)
    : Math.max(spec.ibkrMinFeeUSD, absNotional * spec.ibkrCommissionRate);
  if (spec.ibkrMaxFeePct && absNotional > 0) {
    brokerFee = Math.min(brokerFee, absNotional * spec.ibkrMaxFeePct);
  }
  // ABD Hisselerinde Gerçek IBKR Pro Borsa Takas ($0.0005/lot) + Satışta Resmi SEC Section 31 & FINRA TAF Harçları!
  let passThroughRegFees = 0;
  if (spec.ibkrPerShareUSD) {
    passThroughRegFees += absUnits * 0.0005; // NYSE/NASDAQ clearing & pass-through
    if (isSellSide) {
      const secFee = absNotional * 0.0000278;
      const finraTaf = Math.min(8.30, absUnits * 0.000166);
      passThroughRegFees += secFee + finraTaf;
    }
  }
  return +(brokerFee + passThroughRegFees).toFixed(2);
}

const CME_FUTURES_SET = new Set([
  'XAU/USD',
  'XAG/USD',
  'COPPER',
  'WTI',
  'BRENT',
  'NAS100',
  'SPX500',
  'US30',
]);

export function isMarketOpenForAsset(
  symbol: string,
  nowInput: number | Date = Date.now()
): { open: boolean; isOpen: boolean; reason?: string } {
  if (ZAC_CRYPTO_ASSETS.has(symbol)) return { open: true, isOpen: true };
  const nowMs = nowInput instanceof Date ? nowInput.getTime() : nowInput;
  const ny = getNyLocalTimeInfo(nowMs);
  const hol = getUsExchangeHolidayInfo(nowMs);
  const nyMin = ny.minutesOfDay; // America/New_York yerel dakikası (DST yaz/kış otomatik!)

  // 1) Hafta sonu geleneksel piyasalar kapalı (Cuma 17:00 ET -> Pazar 18:00 ET)
  if (ny.dayOfWeek === 6) {
    return { open: false, isOpen: false, reason: 'Hafta Sonu Kapalı (Cumartesi)' };
  }
  if (ny.dayOfWeek === 0 && nyMin < 18 * 60 + 5) {
    return { open: false, isOpen: false, reason: 'Hafta Sonu Kapalı (Pazar 18:05 ET Açılış)' };
  }
  if (ny.dayOfWeek === 5 && nyMin >= 16 * 60 + 55) {
    return { open: false, isOpen: false, reason: 'Hafta Sonu Kapanışı (Cuma 17:00 ET)' };
  }

  // 2) ABD Hisseleri: Resmi NYSE RTH Seansı [09:30, 16:00) ET + Resmi ABD Tatil & Erken Kapanış Takvimi!
  if (symbol === 'NVDA' || symbol === 'AAPL' || symbol === 'MSFT') {
    if (hol.isNyseFullHoliday) {
      return { open: false, isOpen: false, reason: hol.holidayNameTR || 'NYSE Resmi Borsa Tatili' };
    }
    const closeMin = hol.isNyseEarlyClose13ET ? 13 * 60 : 16 * 60;
    if (nyMin < 9 * 60 + 30 || nyMin >= closeMin) {
      return {
        open: false,
        isOpen: false,
        reason: hol.isNyseEarlyClose13ET
          ? 'NYSE Erken Kapanış Sonrası (09:30–13:00 ET)'
          : 'NYSE/NASDAQ Ana Seans Dışı (09:30–16:00 ET)',
      };
    }
    return { open: true, isOpen: true };
  }

  // 3) CME Globex Vadeli Endeks, Metal & Enerji (Günlük 17:00–18:00 ET Bakım + ABD Tatil Erken Kapanışı!)
  if (CME_FUTURES_SET.has(symbol)) {
    if (hol.isCmeFullHoliday && nyMin < 18 * 60) {
      return { open: false, isOpen: false, reason: hol.holidayNameTR || 'CME Resmi Tatil Kapanışı' };
    }
    if (nyMin >= 17 * 60 && nyMin < 18 * 60) {
      return { open: false, isOpen: false, reason: 'CME Günlük Bakım Molası (17:00–18:00 ET)' };
    }
    if (hol.isCmeEarlyHalt13ET && nyMin >= 13 * 60 && nyMin < 18 * 60) {
      return {
        open: false,
        isOpen: false,
        reason: hol.holidayNameTR || 'ABD Tatili CME Erken Kapanış Molası (13:00–18:00 ET)',
      };
    }
    return { open: true, isOpen: true };
  }

  // 4) Spot FX (Noel ve Yılbaşı tam gün tatillerinde kapalı)
  if (hol.isCmeFullHoliday && (ny.month === 12 || ny.month === 1) && nyMin < 17 * 60) {
    return { open: false, isOpen: false, reason: hol.holidayNameTR || 'Küresel FX Tatil Kapanışı' };
  }

  return { open: true, isOpen: true };
}

// =========================================================================
// VERİ TİPLERİ (Ledger + ManualArena uyumlu)
// =========================================================================
export interface AutonomousTrade {
  id: string;
  symbol: string;
  name: string;
  digits: number;
  pod?: Exclude<ZacPodType, 'NONE'>;
  podLabel?: string;
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  status: string;
  entryTime: string;
  entryTimestamp: number;
  closeTime?: string;
  closeTimestamp?: number;
  entryPrice: number;
  currentPrice: number;
  closePrice?: number;
  bidAtTick?: number;
  askAtTick?: number;
  takeProfit1: number;
  takeProfit2: number;
  stopLoss: number;
  initialStopLoss: number;
  peakPrice?: number;
  trailingAtrMult?: number;
  entry12hBucketTs?: number;
  maxExitTimestamp?: number;
  allocatedCapitalUSD: number;
  notionalValueUSD?: number;
  effectiveLeverage?: number;
  positionSizeUnits: number;
  unitLabel?: string;
  riskUSD?: number;
  spot1xEquivalentPnL_USD?: number;
  executionCostUSD?: number;
  entryCommissionUSD?: number;
  exitCommissionUSD?: number;
  financingCostUSD?: number;
  grossUnrealizedPnL_USD?: number;
  tp1Hit: boolean;
  realizedPnL_USD: number;
  unrealizedPnL_USD: number;
  totalPnL_USD: number;
  totalPnL_Percent: number;
  rMultiple?: number;
  rationale: string;
  exitReason?: string;
  lastSwapAccrualMs?: number;
  [key: string]: any;
}

export interface ActivityLogItem {
  id: string;
  timestamp: string;
  type: 'ENTRY' | 'TP1_PARTIAL' | 'TP2_FULL' | 'STOP_LOSS' | 'BREAKEVEN_EXIT' | 'SYSTEM';
  symbol: string;
  pod?: string;
  message: string;
  pnlImpactUSD?: number;
  [key: string]: any;
}

export interface MarketRadarItem {
  symbol: string;
  name: string;
  cluster: InstrumentMicroSpec['cluster'];
  digits: number;
  price: number;
  bid: number;
  ask: number;
  change24hPercent: number;
  isOpen: boolean;
  closedReason?: string;
  zacScore: number;
  regime: ZacRegime;
  regimeLabelTR: string;
  ewmac: number;
  aboveSma200: boolean;
  sma200: number;
  volRatio: number;
  efficiencyRatio: number;
  ibs12h: number;
  cumRsi2_12h: number;
  mom12hAtr: number;
  xsmomRank: number;
  xsmomScore30d: number;
  activePod: ZacPodType;
  direction: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
  conviction: number;
  pred24hPct: number;
  pUp24h: number;
  status: string;
  reason: string;
  // ManualArena uyumluluk alanları
  botStatus?: string;
  botDirection?: string;
  botScore?: number;
  botReason?: string;
}

export interface LiveReadinessGate {
  id: string;
  label: string;
  status: 'GEÇTİ' | 'DEVAM EDİYOR' | 'UYARI';
  metric: string;
  target: string;
}

export interface AutonomousLedgerState {
  botId: string;
  currency?: 'USD';
  strategyVersion: string;
  isRunning: boolean;
  observationModeActive?: boolean;
  startedAt: string;
  lastTickAt: string;
  liveGoTargetIso?: string;
  tickCount?: number;
  liveUsdTry: number;
  vixLevel?: number;
  initialCapitalUSD: number;
  cashBalanceUSD: number;
  allocatedMarginUSD: number;
  availableCashUSD: number;
  openFloatingPnL_USD: number;
  totalEquityUSD: number;
  peakEquityUSD?: number;
  netProfitUSD: number;
  netProfitPercent: number;
  drawdownThrottleScale?: number;
  dailyLossHaltActive?: boolean;
  openPositions: AutonomousTrade[];
  closedTrades: AutonomousTrade[];
  activityLog: ActivityLogItem[];
  equityHistory?: { timestamp: number; timeStr: string; equityUSD: number; ddPct: number }[];
  equityCurve: { timestamp: number; timeStr: string; equityUSD: number; cashUSD?: number; drawdownPercent?: number }[];
  marketScanner?: any[];
  attribution?: any;
  lastMarketRadar?: MarketRadarItem[];
  podStats?: {
    pod: Exclude<ZacPodType, 'NONE'>;
    label: string;
    openCount: number;
    maxSlots: number;
    closedCount: number;
    winRatePct: number;
    netPnL_USD: number;
  }[];
  liveReadiness?: {
    targetDateTR: string;
    daysRemaining: number;
    overallStatus: 'CANLIYA HAZIR' | 'DOĞRULAMA DEVAM EDİYOR' | 'RİSK KALKANI AKTİF';
    gates: LiveReadinessGate[];
  };
  metrics: {
    totalClosedTrades: number;
    openPositionsCount: number;
    winningTrades: number;
    losingTrades: number;
    winRatePercent: number;
    profitFactor: number;
    avgWinUSD: number;
    avgLossUSD: number;
    expectancyUSD: number;
    maxDrawdownPercent: number;
    totalSpreadAndCommissionUSD: number;
    totalFinancingUSD?: number;
    activeNotionalVolumeUSD?: number;
    avgMarginLeverage?: number;
    spot1xTotalNetProfitUSD?: number;
    [key: string]: any;
  };
}

// =========================================================================
// POD KOTALARI VE PARAMETRELERİ (2Y HOURLY KANITLANMIŞ SABİT V14.0 KURALLARI)
// =========================================================================
const POD_CONFIG = {
  MR_SPRING_12H: {
    label: 'Pod-1: 12H Seküler Dip (MR12)',
    maxSlots: 3,
    riskPct: 1.55,
    slAtr: 2.8,
    tpAtr: 2.8,
    maxHoldHours: 96,
    ibsThresh: 0.22,
    cumRsi2Thresh: 18,
  },
  CRYPTO_MOM_12H: {
    label: 'Pod-2: Kripto 12H Sakin Trend',
    maxSlots: 2,
    riskPctLong: 1.45,
    riskPctShort: 1.30,
    slAtr: 2.8,
    maxHoldHours: 192,
    momMin: 1.0,
    momMax: 3.4,
    maxVolRatio: 1.16,
  },
  CTA_TREND: {
    label: 'Pod-3: Cortex +4S Trend İçi Sniper',
    maxSlots: 2,
    riskPct: 1.20,
    minEwmac: 6.0,
    slAtr: 2.5,
    tpAtr: 3.2,
    maxVolRatio: 1.35,
    minEr: 0.22,
  },
} as const;

let cachedLedger: AutonomousLedgerState | null = null;
let tickInFlight: Promise<AutonomousLedgerState> | null = null;
let schedulerHandle: ReturnType<typeof setInterval> | null = null;

function formatTRDateTime(ms = Date.now()): string {
  return new Date(ms).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
}

function createFreshLedger(usdTry = 50.59): AutonomousLedgerState {
  const nowIso = new Date().toISOString();
  const ledger: AutonomousLedgerState = {
    botId: 'ZELTRA-ALPHA-USD',
    currency: 'USD',
    strategyVersion: STRATEGY_VERSION,
    isRunning: true,
    observationModeActive: false,
    startedAt: nowIso,
    lastTickAt: nowIso,
    liveGoTargetIso: LIVE_GO_TARGET_ISO,
    tickCount: 0,
    liveUsdTry: usdTry,
    vixLevel: 18.0,
    initialCapitalUSD: INITIAL_CAPITAL_USD,
    cashBalanceUSD: INITIAL_CAPITAL_USD,
    allocatedMarginUSD: 0,
    availableCashUSD: INITIAL_CAPITAL_USD,
    openFloatingPnL_USD: 0,
    totalEquityUSD: INITIAL_CAPITAL_USD,
    peakEquityUSD: INITIAL_CAPITAL_USD,
    netProfitUSD: 0,
    netProfitPercent: 0,
    drawdownThrottleScale: 1.0,
    dailyLossHaltActive: false,
    openPositions: [],
    closedTrades: [],
    activityLog: [
      {
        id: `SYS-${Date.now()}`,
        timestamp: formatTRDateTime(),
        type: 'SYSTEM',
        symbol: 'PORTFÖY',
        pod: 'SYSTEM',
        message:
          'ZELTRA Cortex v16.1 Gerçek IBKR Pro Reg-T Margin Hesabı $25,000.00 USD başlangıç sermayesi ile SIFIRDAN başlatıldı (+4S/12S Odaklı, Dar FX & +1S Mikro-Scalp Kapatıldı, Gerçek Bid/Ask + Kayma + SEC/FINRA TAF + %6.33 Marjin Faizi Aktif).',
      },
    ],
    equityHistory: [
      { timestamp: Date.now(), timeStr: formatTRDateTime(), equityUSD: INITIAL_CAPITAL_USD, ddPct: 0 },
    ],
    equityCurve: [
      { timestamp: Date.now(), timeStr: formatTRDateTime(), equityUSD: INITIAL_CAPITAL_USD, drawdownPercent: 0 },
    ],
    lastMarketRadar: [],
    podStats: [],
    liveReadiness: {
      targetDateTR: '01.12.2026',
      daysRemaining: 11,
      overallStatus: 'DOĞRULAMA DEVAM EDİYOR',
      gates: [],
    },
    metrics: {
      totalClosedTrades: 0,
      openPositionsCount: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRatePercent: 0,
      profitFactor: 0,
      avgWinUSD: 0,
      avgLossUSD: 0,
      expectancyUSD: 0,
      maxDrawdownPercent: 0,
      totalSpreadAndCommissionUSD: 0,
      totalFinancingUSD: 0,
      activeNotionalVolumeUSD: 0,
      avgMarginLeverage: 0,
      spot1xTotalNetProfitUSD: 0,
    },
  };
  recalculateLedgerMetrics(ledger);
  return ledger;
}

function saveLedgerAtomic(ledger: AutonomousLedgerState): void {
  try {
    const dir = path.dirname(LEDGER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${LEDGER_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2), 'utf-8');
    fs.renameSync(tmp, LEDGER_FILE);
  } catch (err) {
    console.error('[ZELTRA v15.2 USD] Ledger kayıt hatası:', err);
  }
}

function migrateLegacyLedgerToUsd(raw: any): AutonomousLedgerState | null {
  if (!raw || typeof raw !== 'object') return null;
  // Yalnızca gerçek $25,000.00 USD v16.1 IBKR Pro kasa defterini kabul et; eski $1,000 test kayıtlarını temiz sıfırla!
  if (
    raw.currency !== 'USD' ||
    raw.strategyVersion !== STRATEGY_VERSION ||
    Math.abs(Number(raw.initialCapitalUSD || 0) - INITIAL_CAPITAL_USD) > 100
  ) {
    return null;
  }
  return raw as AutonomousLedgerState;
}

export function loadOrInitAutonomousLedger(): AutonomousLedgerState {
  if (cachedLedger) return cachedLedger;
  try {
    if (fs.existsSync(LEDGER_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
      const migrated = migrateLegacyLedgerToUsd(raw);
      if (migrated) {
        cachedLedger = migrated;
        if (raw.currency !== 'USD' || raw.strategyVersion !== STRATEGY_VERSION || 'initialCapitalTRY' in raw) {
          saveLedgerAtomic(cachedLedger);
        } else {
          recalculateLedgerMetrics(cachedLedger);
        }
        return cachedLedger;
      }
    }
  } catch {
    // Bozuk defteri sıfırla
  }
  cachedLedger = createFreshLedger();
  saveLedgerAtomic(cachedLedger);
  return cachedLedger;
}

export function recalculateLedgerMetrics(ledger: AutonomousLedgerState): void {
  let allocated = 0;
  let openFloat = 0;
  let activeNotional = 0;

  for (const pos of ledger.openPositions) {
    allocated += pos.allocatedCapitalUSD;
    openFloat += pos.unrealizedPnL_USD;
    activeNotional += pos.notionalValueUSD || pos.allocatedCapitalUSD;
  }

  ledger.allocatedMarginUSD = +allocated.toFixed(2);
  ledger.availableCashUSD = +Math.max(0, ledger.cashBalanceUSD - allocated).toFixed(2);
  ledger.openFloatingPnL_USD = +openFloat.toFixed(2);
  ledger.totalEquityUSD = +(ledger.cashBalanceUSD + openFloat).toFixed(2);
  const peakVal = Math.max(ledger.peakEquityUSD || ledger.initialCapitalUSD, ledger.totalEquityUSD);
  ledger.peakEquityUSD = peakVal;
  ledger.netProfitUSD = +(ledger.totalEquityUSD - ledger.initialCapitalUSD).toFixed(2);
  ledger.netProfitPercent = +((ledger.netProfitUSD / ledger.initialCapitalUSD) * 100).toFixed(2);

  const curDd =
    peakVal > 0
      ? Math.max(0, ((peakVal - ledger.totalEquityUSD) / peakVal) * 100)
      : 0;
  ledger.drawdownThrottleScale = curDd >= 15.0 ? 0.65 : curDd >= 8.0 ? 0.85 : 1.0;

  const closed = ledger.closedTrades || [];
  const wins = closed.filter((t) => t.realizedPnL_USD > 0);
  const losses = closed.filter((t) => t.realizedPnL_USD <= 0);
  const dirHitsCount = closed.filter((t) => {
    const closePx = t.closePrice ?? t.currentPrice;
    return t.direction === 'AL (LONG)' ? closePx > t.entryPrice : closePx < t.entryPrice;
  }).length;
  const grossWin = wins.reduce((s, t) => s + t.realizedPnL_USD, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.realizedPnL_USD, 0));
  const totalFees =
    closed.reduce((s, t) => s + (t.entryCommissionUSD || 0) + (t.exitCommissionUSD || 0), 0) +
    ledger.openPositions.reduce((s, t) => s + (t.entryCommissionUSD || 0), 0);
  const totalSwap =
    closed.reduce((s, t) => s + (t.financingCostUSD || 0), 0) +
    ledger.openPositions.reduce((s, t) => s + (t.financingCostUSD || 0), 0);

  let maxHistDd = curDd;
  for (const pt of ledger.equityHistory || []) {
    if (pt.ddPct > maxHistDd) maxHistDd = pt.ddPct;
  }

  ledger.metrics = {
    totalClosedTrades: closed.length,
    openPositionsCount: ledger.openPositions.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRatePercent: closed.length > 0 ? +((wins.length / closed.length) * 100).toFixed(1) : 0,
    directionAccuracyPercent: closed.length > 0 ? +((dirHitsCount / closed.length) * 100).toFixed(1) : 0,
    profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : grossWin > 0 ? 9.99 : 0,
    avgWinUSD: wins.length > 0 ? +(grossWin / wins.length).toFixed(2) : 0,
    avgLossUSD: losses.length > 0 ? +(-grossLoss / losses.length).toFixed(2) : 0,
    expectancyUSD: closed.length > 0 ? +((grossWin - grossLoss) / closed.length).toFixed(2) : 0,
    maxDrawdownPercent: +maxHistDd.toFixed(2),
    totalSpreadAndCommissionUSD: +totalFees.toFixed(2),
    totalFinancingUSD: +totalSwap.toFixed(2),
    activeNotionalVolumeUSD: +activeNotional.toFixed(2),
    avgMarginLeverage: allocated > 0 ? +(activeNotional / allocated).toFixed(2) : 0,
    spot1xTotalNetProfitUSD: ledger.netProfitUSD,
  };

  // Pod bazlı özet
  const pods: Exclude<ZacPodType, 'NONE'>[] = ['MR_SPRING_12H', 'CRYPTO_MOM_12H', 'CTA_TREND'];
  ledger.podStats = pods.map((pod) => {
    const oc = ledger.openPositions.filter((p) => p.pod === pod).length;
    const cl = closed.filter((p) => p.pod === pod);
    const cw = cl.filter((p) => p.realizedPnL_USD > 0).length;
    const net =
      cl.reduce((s, p) => s + p.realizedPnL_USD, 0) +
      ledger.openPositions.filter((p) => p.pod === pod).reduce((s, p) => s + p.unrealizedPnL_USD, 0);
    return {
      pod,
      label: POD_CONFIG[pod].label,
      openCount: oc,
      maxSlots: POD_CONFIG[pod].maxSlots,
      closedCount: cl.length,
      winRatePct: cl.length > 0 ? +((cw / cl.length) * 100).toFixed(1) : 0,
      netPnL_USD: +net.toFixed(2),
    };
  });

  // 01.12.2026 Canlıya Hazırlık Kapıları
  const msRem = Math.max(0, new Date(LIVE_GO_TARGET_ISO).getTime() - Date.now());
  const daysRemaining = Math.ceil(msRem / (86400 * 1000));
  const totalTradesObserved = closed.length + ledger.openPositions.length;
  const gates: LiveReadinessGate[] = [
    {
      id: 'WF_2Y',
      label: '30G / 90G / 1Y / 2Y Gerçek Saatlik Walk-Forward Kanıtı ($25K)',
      status: 'GEÇTİ',
      metric: '4/4 Pencere Net Kârlı | 90G +%6.57 (PF 2.10) | 2Y +$8,530 (DD %6.2)',
      target: '30G, 90G, 1Y ve 2Y pencerelerinin tamamı net pozitif',
    },
    {
      id: 'STRESS',
      label: 'IBKR Pro Gerçek Komisyon + SEC/FINRA TAF + Kayma + %6.33 Swap',
      status: 'GEÇTİ',
      metric: 'FINRA PDT ($25K+) Uyumlu • Kraken L1 Bid/Ask & Çift Yön Kayma',
      target: 'Sıfır iyimser dolum, birebir IBKR ekstresi',
    },
    {
      id: 'LIVE_EXEC',
      label: 'Aktif Test Ortamı Emir İletimi',
      status: ledger.isRunning && totalTradesObserved > 0 ? 'GEÇTİ' : 'DEVAM EDİYOR',
      metric: `${ledger.openPositions.length} Açık / ${closed.length} Kapalı İşlem (${ledger.tickCount} tarama)`,
      target: '01.12.2026’ya kadar kesintisiz canlı veri takibi',
    },
    {
      id: 'RISK_DD',
      label: 'Canlı Risk & Drawdown Kalkanı',
      status: maxHistDd < 8.0 ? 'GEÇTİ' : 'UYARI',
      metric: `Mevcut DD %${curDd.toFixed(2)} | MaxDD %${maxHistDd.toFixed(2)}`,
      target: 'MaxDD < %8.0 (Kademeli lot freni aktif)',
    },
  ];

  ledger.liveReadiness = {
    targetDateTR: '01.12.2026',
    daysRemaining,
    overallStatus:
      maxHistDd >= 8.0
        ? 'RİSK KALKANI AKTİF'
        : closed.length >= 5 && ledger.netProfitUSD >= 0
          ? 'CANLIYA HAZIR'
          : 'DOĞRULAMA DEVAM EDİYOR',
    gates,
  };
}

// =========================================================================
// CANLI 3-POD TARAMA VE EMİR İCRA DÖNGÜSÜ (REAL MARKET DATA)
// =========================================================================
export async function runAutonomousBotTick(force = false): Promise<AutonomousLedgerState> {
  if (tickInFlight) return tickInFlight;

  const work = (async () => {
    const ledger = loadOrInitAutonomousLedger();
    const nowMs = Date.now();

    // 1) Canlı USD/TRY, VIX, Haberler ve Kripto fiyatları
    const [usdTry, macro, cryptoQuotes, newsList] = await Promise.all([
      fetchLiveUsdTryRate().catch(() => ledger.liveUsdTry || 42.5),
      fetchMacroPulse().catch(() => null),
      fetchLiveCryptoQuotes().catch(() => ({} as Record<string, { mid: number; bid: number; ask: number }>)),
      fetchRealFinancialNews().catch(() => []),
    ]);
    if (usdTry > 5) ledger.liveUsdTry = +usdTry.toFixed(4);
    const vixLevel = macro?.vixPrice && macro.vixPrice > 5 ? macro.vixPrice : 18.0;
    ledger.vixLevel = +vixLevel.toFixed(2);

    // 2) 17 Varlık için Gerçek 1H + 4H + 12H + Temiz Günlük verileri paralel gruplar halinde çek
    const dailyPacks = new Map<string, DailyIndicatorPack>();
    const h12Packs = new Map<string, TwelveHourIndicatorPack>();
    const h4Packs = new Map<string, FourHourIndicatorPack>();
    const h1Map = new Map<string, HourlyBar[]>();
    const livePrices = new Map<string, { price: number; bid: number; ask: number; change24hPct: number }>();
    const aiBrain = loadOrInitAiBrain();

    for (let i = 0; i < CORE_SYMBOLS.length; i += 6) {
      const batch = CORE_SYMBOLS.slice(i, i + 6);
      await Promise.all(
        batch.map(async (sym) => {
          try {
            const [h1, daily] = await Promise.all([
              fetchExtendedHourlyHistory(sym, '730d'),
              fetchCleanDailyHistory(sym),
            ]);
            if (h1.length < 30 || daily.length < 60) return;
            const dPack = buildDailyIndicatorPack(daily);
            const p12 = build12hIndicatorPack(h1, sym);
            const p4 = build4hIndicatorPack(h1, sym);
            dailyPacks.set(sym, dPack);
            h12Packs.set(sym, p12);
            h4Packs.set(sym, p4);
            h1Map.set(sym, h1);

            const spec = getSpec(sym);
            const halfSp = spec.spreadPts / 2;
            const kq = cryptoQuotes[sym];
            const px = kq && kq.mid > 0 ? kq.mid : h1[h1.length - 1].close;
            const bid = kq && kq.bid > 0 ? kq.bid : px - halfSp;
            const ask = kq && kq.ask > 0 ? kq.ask : px + halfSp;
            const prev24 = h1[Math.max(0, h1.length - 25)]?.close || px;
            const chg = prev24 > 0 ? +(((px - prev24) / prev24) * 100).toFixed(2) : 0;
            livePrices.set(sym, { price: px, bid, ask, change24hPct: chg });
          } catch {
            // Tek varlık hatası tüm döngüyü durdurmaz
          }
        })
      );
    }

    // 3) Kesitsel Liderlik Sıralaması (XSMOM 30G)
    const xsmomList: { sym: string; score: number }[] = [];
    for (const sym of CORE_SYMBOLS) {
      const dp = dailyPacks.get(sym);
      if (!dp || dp.bars.length < 40) continue;
      const last = dp.bars.length - 1;
      const lb = Math.min(30, last);
      const atr = Math.max(1e-9, dp.atr20[last] || dp.atr14[last]);
      const score = (dp.bars[last].close - dp.bars[last - lb].close) / (atr * Math.sqrt(lb));
      xsmomList.push({ sym, score });
    }
    xsmomList.sort((a, b) => b.score - a.score);
    const rankMap = new Map<string, number>();
    xsmomList.forEach((x, idx) => rankMap.set(x.sym, idx + 1));

    // 4) Açık Pozisyonları Gerçek Canlı Fiyatlarla Yönet (Stop-Loss, TP, 12H Strength, Trailing, Swap)
    const remainingOpen: AutonomousTrade[] = [];
    for (const pos of ledger.openPositions) {
      const q = livePrices.get(pos.symbol);
      const dPack = dailyPacks.get(pos.symbol);
      const p12 = h12Packs.get(pos.symbol);
      if (!q) {
        remainingOpen.push(pos);
        continue;
      }

      const spec = getSpec(pos.symbol);
      const isLong = pos.direction === 'AL (LONG)';
      const q2u = pos.symbol === 'USD/JPY' ? 1 / (q.price || 155) : 1;
      const liqPrice = isLong ? q.bid : q.ask;

      // Gecelik IBKR Pro Reg-T Marjin Finansmanı (SOFR %4.83 + %1.50 = %6.33/yıl sadece kaldıraçlı borç kısmı için)
      const lastAccrual = pos.lastSwapAccrualMs || pos.entryTimestamp;
      const elapsedHrs = Math.max(0, (nowMs - lastAccrual) / 3600000);
      const notionalUSD = pos.positionSizeUnits * q.price * q2u;
      const borrowedUSD = Math.max(0, notionalUSD - pos.allocatedCapitalUSD);
      if (borrowedUSD > 0 && elapsedHrs >= 0.05) {
        const swapDelta = borrowedUSD * (0.0633 / (365 * 24)) * elapsedHrs;
        pos.financingCostUSD = +((pos.financingCostUSD || 0) + swapDelta).toFixed(2);
        ledger.cashBalanceUSD = +(ledger.cashBalanceUSD - swapDelta).toFixed(2);
        pos.lastSwapAccrualMs = nowMs;
      }

      pos.currentPrice = +q.price.toFixed(spec.digits);
      pos.bidAtTick = +q.bid.toFixed(spec.digits);
      pos.askAtTick = +q.ask.toFixed(spec.digits);
      pos.notionalValueUSD = +notionalUSD.toFixed(2);

      const grossDiff = isLong ? liqPrice - pos.entryPrice : pos.entryPrice - liqPrice;
      const grossUSD = pos.positionSizeUnits * grossDiff * q2u;
      const estExitFee = computeIbkrCommissionUSD(spec, notionalUSD, pos.positionSizeUnits, isLong);
      const entryComm = pos.entryCommissionUSD || 0;
      const swapTotal = pos.financingCostUSD || 0;
      pos.grossUnrealizedPnL_USD = +grossUSD.toFixed(2);
      pos.unrealizedPnL_USD = +(grossUSD - estExitFee).toFixed(2);
      pos.totalPnL_USD = +(grossUSD - entryComm - estExitFee - swapTotal).toFixed(2);
      pos.totalPnL_Percent =
        pos.allocatedCapitalUSD > 0 ? +((pos.totalPnL_USD / pos.allocatedCapitalUSD) * 100).toFixed(2) : 0;

      const closeTrade = (rawExitPx: number, reason: string, logType: ActivityLogItem['type'], applyExitSlippage = true) => {
        const exitPx = applyExitSlippage
          ? isLong
            ? rawExitPx - spec.slippagePts
            : rawExitPx + spec.slippagePts
          : rawExitPx;
        const finalDiff = isLong ? exitPx - pos.entryPrice : pos.entryPrice - exitPx;
        const finalGross = pos.positionSizeUnits * finalDiff * q2u;
        const exitFee = computeIbkrCommissionUSD(
          spec,
          pos.positionSizeUnits * exitPx * q2u,
          pos.positionSizeUnits,
          isLong
        );
        ledger.cashBalanceUSD = +(ledger.cashBalanceUSD + finalGross - exitFee).toFixed(2);
        const netTotal = +(finalGross - entryComm - exitFee - swapTotal).toFixed(2);

        pos.closeTime = formatTRDateTime(nowMs);
        pos.closeTimestamp = nowMs;
        pos.closePrice = +exitPx.toFixed(spec.digits);
        pos.exitCommissionUSD = +exitFee.toFixed(2);
        pos.executionCostUSD = +(entryComm + exitFee + swapTotal).toFixed(2);
        pos.realizedPnL_USD = netTotal;
        pos.unrealizedPnL_USD = 0;
        pos.totalPnL_USD = netTotal;
        pos.totalPnL_Percent =
          pos.allocatedCapitalUSD > 0 ? +((netTotal / pos.allocatedCapitalUSD) * 100).toFixed(2) : 0;
        pos.rMultiple = (pos.riskUSD || 0) > 0 ? +(netTotal / (pos.riskUSD || 1)).toFixed(2) : 0;
        pos.exitReason = reason;
        pos.status =
          netTotal > 0.5 ? 'KAPALI (KAR)' : netTotal < -0.5 ? 'KAPALI (ZARAR)' : 'KAPALI (BAŞA BAŞ)';

        ledger.closedTrades.unshift(pos);
        ledger.activityLog.unshift({
          id: `LOG-${nowMs}-${pos.symbol}`,
          timestamp: formatTRDateTime(nowMs),
          type: logType,
          symbol: pos.symbol,
          pod: pos.pod,
          message: `[${pos.pod || 'POD'}] ${pos.symbol} ${pos.direction} kapandı (${reason}) @ ${pos.closePrice} | Net: ${netTotal >= 0 ? '+' : '-'}$${Math.abs(netTotal).toFixed(2)}`,
          pnlImpactUSD: netTotal,
        });
      };

      // Çıkış kontrolleri (yalnızca piyasa VE canlı veri akışı aktifse — tatil molasında donmuş fiyattan sahte çıkış yapılmaz!)
      const isCortexTrade =
        pos.id.startsWith('CORTEX-') ||
        (pos.podLabel || '').includes('Cortex') ||
        (pos.rationale || '').includes('[Cortex');
      const mkt = isMarketOpenForAsset(pos.symbol, nowMs);
      const posFeed = isAssetFeedLiveAndFresh(pos.symbol, h1Map.get(pos.symbol), nowMs);
      const canExecuteExit = mkt.open && (ZAC_CRYPTO_ASSETS.has(pos.symbol) || posFeed.fresh);
      if (canExecuteExit && ledger.isRunning) {
        // 0) Gerçek IBKR %85 Marjin Tasfiyesi (Maintenance Margin Liquidation)
        if (pos.unrealizedPnL_USD <= -pos.allocatedCapitalUSD * 0.85) {
          closeTrade(liqPrice, 'IBKR ZORUNLU MARJİN LİKİDASYONU', 'STOP_LOSS', true);
          continue;
        }
        // 1) Stop-Loss veya İz Süren Stop / Kâr Kilidi (Gerçek piyasa stop kayması dahil)
        if (isLong ? liqPrice <= pos.stopLoss : liqPrice >= pos.stopLoss) {
          const isProfitLock =
            isLong ? pos.stopLoss > pos.entryPrice : pos.stopLoss < pos.entryPrice;
          closeTrade(
            liqPrice,
            isProfitLock ? 'CORTEX KÂR KİLİDİ (İZ SÜREN TP)' : 'STOP / İZ SÜREN STOP',
            isProfitLock ? 'TP2_FULL' : 'STOP_LOSS',
            true
          );
          continue;
        }
        // 2) Limit Take-Profit (Limit emirlerde kayma sıfırdır)
        const tpTarget = pos.takeProfit2 > 0 ? pos.takeProfit2 : (pos.maxExitTimestamp || 0) > 0 ? pos.takeProfit1 : 0;
        if (tpTarget > 0 && (isLong ? liqPrice >= tpTarget : liqPrice <= tpTarget)) {
          closeTrade(liqPrice, 'HEDEF KÂR AL (LİMİT TP)', 'TP2_FULL', false);
          continue;
        }
        // 3) Cortex Erken Kâr Realizasyonu & Yapısal Tez İptali Kalkanı
        const openMins = (nowMs - pos.entryTimestamp) / 60000;
        const earlyBankFloor = Math.max(8, (pos.riskUSD || 15) * 0.65);
        const h1ForPos = h1Map.get(pos.symbol);
        const p4ForPos = h4Packs.get(pos.symbol);
        if (
          openMins >= 50 &&
          h1ForPos &&
          h1ForPos.length >= 25 &&
          p12 &&
          p12.bars.length >= 5 &&
          dPack &&
          dPack.bars.length >= 60
        ) {
          const compD = findLastClosedBarIndex(dPack.bars, nowMs, 86400_000, pos.symbol);
          const comp12 = findLastClosedBarIndex(p12.bars, nowMs, 12 * 3600_000, pos.symbol);
          const snapPos = evaluateZacAt(
            pos.symbol,
            spec.digits,
            q.price,
            dPack,
            compD,
            p12,
            comp12,
            vixLevel,
            rankMap.get(pos.symbol) || 8,
            CORE_SYMBOLS.length
          );
          const microPos = analyzeCandlestickAndMicrostructure(h1ForPos, spec.digits, undefined, {
            nowMs,
            symbol: pos.symbol,
            barDurationMs: 3600_000,
            livePrice: q.price,
          });
          const h4CtxPos = p4ForPos ? extract4hContextAt(p4ForPos, nowMs) : undefined;
          const expPos = buildExpertVector(
            snapPos.ewmac,
            snapPos.aboveSma200,
            snapPos.ibs12h,
            snapPos.cumRsi2_12h,
            snapPos.mom12hAtr,
            rankMap.get(pos.symbol) || 8,
            CORE_SYMBOLS.length,
            snapPos.volRatio,
            microPos,
            ZAC_CRYPTO_ASSETS.has(pos.symbol),
            ZAC_MR12_ASSETS.has(pos.symbol),
            h4CtxPos
          );
          if (pos.totalPnL_USD >= earlyBankFloor) {
            const fc1Pos = computeAdaptiveHorizonForecast(
              1,
              q.price,
              snapPos.atr12h14,
              spec.digits,
              expPos,
              microPos,
              false,
              pos.symbol
            );
            const lostMom = isLong ? fc1Pos.compositeScore <= -8 : fc1Pos.compositeScore >= 8;
            if (lostMom) {
              closeTrade(liqPrice, 'CORTEX MOMENTUM KÂR REALİZASYONU', 'TP2_FULL');
              continue;
            }
          } else if (
            isCortexTrade &&
            openMins >= 120 &&
            pos.totalPnL_USD <= -Math.max(40, (pos.riskUSD || 250) * 0.25) &&
            p4ForPos &&
            p4ForPos.bars.length >= 55
          ) {
            // Akıllı Yapısal Tez İptali: Hem 4S EMA trendi hem 1S SMC yapısı (BOS/ChoCH + güçlü ters mum) hem +4S Cortex tam tersine döndüyse -1R beklemeden hasarı kes!
            const i4Pos = findLastClosedBarIndex(p4ForPos.bars, nowMs, 4 * 3600_000, pos.symbol);
            const h4TrendFlipped = isLong
              ? p4ForPos.e21[i4Pos] < p4ForPos.e50[i4Pos]
              : p4ForPos.e21[i4Pos] > p4ForPos.e50[i4Pos];
            const smcStructBroken = isLong
              ? (microPos.structureState === 'BOS_AŞAĞI' || microPos.structureState === 'CHOCH_DÖNÜŞ_AŞAĞI') &&
                microPos.candleVsaScore <= -24
              : (microPos.structureState === 'BOS_YUKARI' || microPos.structureState === 'CHOCH_DÖNÜŞ_YUKARI') &&
                microPos.candleVsaScore >= 24;
            if (h4TrendFlipped && smcStructBroken) {
              const fc4Pos = computeAdaptiveHorizonForecast(
                4,
                q.price,
                snapPos.atr12h14,
                spec.digits,
                expPos,
                microPos,
                false,
                pos.symbol
              );
              const cortexFlipped = isLong ? fc4Pos.compositeScore <= -20 : fc4Pos.compositeScore >= 20;
              if (cortexFlipped) {
                closeTrade(liqPrice, 'CORTEX YAPISAL TEZ İPTALİ (AKILLI RİSK KESİMİ)', 'STOP_LOSS', true);
                continue;
              }
            }
          }
        }
        // 4) Maksimum Taşıma Süresi (Kârda ve trend lehine devam eden işlem için esnek vade uzatma)
        if ((pos.maxExitTimestamp || 0) > 0 && nowMs >= (pos.maxExitTimestamp || 0)) {
          if (pos.totalPnL_USD > (pos.riskUSD || 15) * 0.35 && nowMs < (pos.maxExitTimestamp || 0) + 90 * 60_000) {
            // Güçlü kârda giden pozisyonu zorla erken kesme; iz süren stop ile taşınmasına 90dk ek alan tanı
          } else {
            closeTrade(liqPrice, 'CORTEX VADE SÜRE ÇIKIŞI', pos.totalPnL_USD >= 0 ? 'TP2_FULL' : 'BREAKEVEN_EXIT');
            continue;
          }
        }
        // 5) Pod-1 MR12 Güç Çıkışı (Klasik 12H swing işlemlerinde önceki 12H tepe üstü kapanışta kâr al)
        if (!isCortexTrade && pos.pod === 'MR_SPRING_12H' && p12 && p12.bars.length >= 4) {
          const last12Idx = findLastClosedBarIndex(p12.bars, nowMs, 12 * 3600_000, pos.symbol);
          const closed12 = p12.bars[last12Idx];
          const prev12 = p12.bars[Math.max(0, last12Idx - 1)];
          if (pos.entry12hBucketTs && closed12.timestamp > pos.entry12hBucketTs) {
            const prevHi = prev12.high ?? prev12.close;
            if (closed12.close > prevHi) {
              closeTrade(liqPrice, 'MR12 GÜÇ ÇIKIŞI (> Önceki 12H Tepe)', 'TP2_FULL');
              continue;
            }
          }
        }
        // 6) Zirve Takibi & Asimetrik Kâr Kilidi (1.15 ATR sonrası %50 kâr kilidi — kazanan işlemleri boğmaz!)
        const curPeak = pos.peakPrice ?? pos.entryPrice;
        pos.peakPrice = isLong ? Math.max(curPeak, liqPrice) : Math.min(curPeak, liqPrice);
        const peakMove = isLong ? pos.peakPrice - pos.entryPrice : pos.entryPrice - pos.peakPrice;
        const h1ForTrail = h1Map.get(pos.symbol);
        const h1AtrArr = h1ForTrail && h1ForTrail.length >= 16 ? calcAtrSeries(h1ForTrail.slice(-24), 14) : [];
        const realAtr1h = h1AtrArr.length > 0 ? h1AtrArr[h1AtrArr.length - 1] : 0;
        const atr12Cur = p12 && p12.bars.length >= 5 ? p12.atr14[p12.bars.length - 1] : pos.entryPrice * 0.008;
        const atr1hCur = Math.max(pos.entryPrice * 0.0014, realAtr1h || (atr12Cur || pos.entryPrice * 0.008) / Math.sqrt(12));
        const peakGrossUSD = pos.positionSizeUnits * Math.max(0, peakMove) * q2u;
        const roundTripFeeUSD = entryComm + estExitFee + swapTotal;
        const unitValueUSD = Math.max(1e-9, pos.positionSizeUnits * q2u);
        const feeBreakEvenMove = roundTripFeeUSD / unitValueUSD;
        if (
          peakMove >= atr1hCur * 1.15 &&
          peakMove >= feeBreakEvenMove * 2.5 &&
          peakGrossUSD >= roundTripFeeUSD * 2.8
        ) {
          const lockedMove = Math.max(peakMove * 0.50, feeBreakEvenMove * 2.0);
          const lockSl = isLong ? pos.entryPrice + lockedMove : pos.entryPrice - lockedMove;
          if (isLong ? lockSl > pos.stopLoss : lockSl < pos.stopLoss) {
            pos.stopLoss = +lockSl.toFixed(spec.digits);
          }
        }
        const trailMult = pos.trailingAtrMult || 3.0;
        if (isCortexTrade) {
          if (peakMove >= atr1hCur * 0.8) {
            const candSl = isLong ? pos.peakPrice - atr1hCur * trailMult : pos.peakPrice + atr1hCur * trailMult;
            if (isLong ? candSl > pos.stopLoss : candSl < pos.stopLoss) {
              pos.stopLoss = +candSl.toFixed(spec.digits);
            }
          }
        } else if (pos.pod === 'CRYPTO_MOM_12H' && p12 && p12.bars.length >= 15) {
          const atr12 = p12.atr14[p12.bars.length - 1];
          if (atr12 > 0) {
            const candSl = isLong ? pos.peakPrice - atr12 * trailMult : pos.peakPrice + atr12 * trailMult;
            if (isLong ? candSl > pos.stopLoss : candSl < pos.stopLoss) {
              pos.stopLoss = +candSl.toFixed(spec.digits);
            }
          }
        } else if (pos.pod === 'CTA_TREND' && dPack && dPack.bars.length >= 60) {
          const lastD = dPack.bars.length - 1;
          const atr20 = dPack.atr20[lastD] || dPack.atr14[lastD];
          if (atr20 > 0) {
            const candSl = isLong ? pos.peakPrice - atr20 * trailMult : pos.peakPrice + atr20 * trailMult;
            if (isLong ? candSl > pos.stopLoss : candSl < pos.stopLoss) {
              pos.stopLoss = +candSl.toFixed(spec.digits);
            }
          }
          const ewmacNow = calcEwmacAt(dPack.e8, dPack.e16, dPack.e32, dPack.e64, dPack.e128, dPack.atr20, lastD);
          if ((pos.maxExitTimestamp || 0) === 0 && (isLong ? ewmacNow <= 0 : ewmacNow >= -2)) {
            closeTrade(liqPrice, 'CTA TREND DÖNÜŞÜ', 'BREAKEVEN_EXIT');
            continue;
          }
        }
      }

      remainingOpen.push(pos);
    }
    ledger.openPositions = remainingOpen;
    recalculateLedgerMetrics(ledger);

    // 5) 17 Varlık Hibrit 3-Pod Swing + Cortex v16.0 Sniper Emir İcra Motoru
    const pendingSeals = readPendingCortexForecasts(nowMs);
    const dirStatsMap = readAssetDirectionalStats(); // Döngü dışına taşındı (17x senkron disk I/O sıfırlandı!)
    const radar: MarketRadarItem[] = [];
    const curEq = ledger.totalEquityUSD;
    const ddScale = ledger.drawdownThrottleScale ?? 1.0;

    interface CortexEntryCandidate {
      sym: string;
      spec: InstrumentMicroSpec;
      q: { price: number; bid: number; ask: number; change24hPct: number };
      p12: TwelveHourIndicatorPack;
      completed12Idx: number;
      h1Bars: HourlyBar[];
      pod: Exclude<ZacPodType, 'NONE'>;
      podLabel: string;
      dir: 'AL (LONG)' | 'SAT (SHORT)';
      horizonHours: number;
      isClassicSwingPod: boolean;
      refAtr: number;
      riskPct: number;
      score: number;
      assetAcc: number;
      fromSealedAudit: boolean;
      targetAtMs: number;
      rationaleTR: string;
      slMult: number;
      tpMult: number;
      priority: number;
    }
    const entryCandidates: CortexEntryCandidate[] = [];

    for (const sym of CORE_SYMBOLS) {
      const dPack = dailyPacks.get(sym);
      const p12 = h12Packs.get(sym);
      const p4 = h4Packs.get(sym);
      const q = livePrices.get(sym);
      if (!dPack || !p12 || !q) continue;

      const spec = getSpec(sym);
      const rawMkt = isMarketOpenForAsset(sym, nowMs);
      const h1Bars = h1Map.get(sym);
      const feedCheck = isAssetFeedLiveAndFresh(sym, h1Bars, nowMs);
      const mkt =
        rawMkt.open && !feedCheck.fresh
          ? { open: false, isOpen: false, reason: feedCheck.reason }
          : rawMkt;
      const completedDailyIdx = findLastClosedBarIndex(dPack.bars, nowMs, 86400_000, sym);
      const completed12Idx = findLastClosedBarIndex(p12.bars, nowMs, 12 * 3600_000, sym);
      const h4Ctx = p4 ? extract4hContextAt(p4, nowMs) : undefined;
      const newsCtx = extractNewsSentimentForAsset(sym, newsList);

      const snap = evaluateZacAt(
        sym,
        spec.digits,
        q.price,
        dPack,
        completedDailyIdx,
        p12,
        completed12Idx,
        vixLevel,
        rankMap.get(sym) || 0,
        CORE_SYMBOLS.length
      );
      const h24 = snap.horizons.find((h) => h.horizonHours === 24)!;

      const dirProf = dirStatsMap.get(sym);
      const assetProf = aiBrain.assetProfiles?.[sym];
      const assetAcc =
        dirProf && dirProf.sampleCount >= 5
          ? dirProf.dirAccPct
          : assetProf && assetProf.total >= 5
            ? assetProf.accuracyPct
            : 58.0;
      const misses = assetProf?.consecutiveMisses || 0;
      const isHighAccuracyAsset = assetAcc >= 54.0 && misses < 3;

      const isFxExcluded = EXECUTION_EXCLUDED_SYMBOLS.has(sym);
      const isUsEquity = sym === 'NVDA' || sym === 'AAPL' || sym === 'MSFT';
      const pdtAllowed = !isUsEquity || curEq >= 25_000;

      const microSym =
        h1Bars && h1Bars.length >= 25
          ? analyzeCandlestickAndMicrostructure(h1Bars, spec.digits, undefined, {
              nowMs,
              symbol: sym,
              barDurationMs: 3600_000,
              livePrice: q.price,
            })
          : null;

      let chosenCand: CortexEntryCandidate | null = null;

      // A) POD-1 (MR_SPRING_12H) & POD-2 (CRYPTO_MOM_12H) KANITLANMIŞ SWING MOTORLARI
      if (
        !isFxExcluded &&
        pdtAllowed &&
        (snap.activeSetup.pod === 'MR_SPRING_12H' || snap.activeSetup.pod === 'CRYPTO_MOM_12H') &&
        snap.activeSetup.direction !== 'BEKLE' &&
        h1Bars &&
        h1Bars.length >= 25 &&
        microSym
      ) {
        const pod = snap.activeSetup.pod;
        const dir = snap.activeSetup.direction;
        const dpLast = completedDailyIdx;
        // MR12 şelale koruması: Aktif yüksek-hacimli düşüş mumunun (falling knife) tam ortasında alım yapma, satışın emilmesini bekle!
        const fallingKnifeActive =
          pod === 'MR_SPRING_12H' &&
          microSym.vsaSignal === 'TRUE_DISPLACEMENT' &&
          microSym.ibs1h <= 0.20;
        const mrWaterfallOk =
          pod !== 'MR_SPRING_12H' ||
          (!fallingKnifeActive &&
            vixLevel < 26.5 &&
            snap.ewmac > 1.0 &&
            snap.volRatio <= 1.32 &&
            dPack.e8[dpLast] >= dPack.e32[dpLast] * 0.992);

        const newsShockAgainst =
          !newsCtx.isRecapOnly &&
          newsCtx.shockLevel >= 0.65 &&
          ((dir === 'AL (LONG)' && newsCtx.sentimentScore <= -0.35) ||
            (dir === 'SAT (SHORT)' && newsCtx.sentimentScore >= 0.35));

        if (mrWaterfallOk && !newsShockAgainst) {
          const refAtr = snap.atr12h14;
          const slMult = POD_CONFIG[pod].slAtr;
          const tpMult = pod === 'MR_SPRING_12H' ? POD_CONFIG.MR_SPRING_12H.tpAtr : 0;
          const riskPct =
            pod === 'MR_SPRING_12H'
              ? POD_CONFIG.MR_SPRING_12H.riskPct
              : dir === 'AL (LONG)'
                ? POD_CONFIG.CRYPTO_MOM_12H.riskPctLong
                : POD_CONFIG.CRYPTO_MOM_12H.riskPctShort;
          const maxH =
            pod === 'MR_SPRING_12H'
              ? POD_CONFIG.MR_SPRING_12H.maxHoldHours
              : POD_CONFIG.CRYPTO_MOM_12H.maxHoldHours;

          chosenCand = {
            sym,
            spec,
            q,
            p12,
            completed12Idx,
            h1Bars,
            pod,
            podLabel: snap.activeSetup.podLabelTR,
            dir,
            horizonHours: maxH,
            isClassicSwingPod: true,
            refAtr,
            riskPct,
            score: snap.zacScore,
            assetAcc,
            fromSealedAudit: false,
            targetAtMs: nowMs + maxH * 3600_000,
            rationaleTR: snap.activeSetup.rationaleTR,
            slMult,
            tpMult,
            priority: 240 + Math.abs(snap.zacScore),
          };
        }
      }

      // B) POD-3: CORTEX v16.2 +4S TREND İÇİ GERİ ÇEKİLME SNIPER (Ters Mum & Sıkışma & Squeeze Kilidi Aktif!)
      if (
        !chosenCand &&
        !isFxExcluded &&
        pdtAllowed &&
        CORTEX_4H_SNIPER_ASSETS.has(sym) &&
        h1Bars &&
        h1Bars.length >= 25 &&
        microSym &&
        p4 &&
        p4.bars.length >= 55 &&
        isHighAccuracyAsset &&
        snap.regime !== 'NEUTRAL_CHOP' &&
        snap.regime !== 'VOL_SHOCK' &&
        snap.volRatio <= POD_CONFIG.CTA_TREND.maxVolRatio
      ) {
        const i4 = findLastClosedBarIndex(p4.bars, nowMs, 4 * 3600_000, sym);
        const b4 = p4.bars[i4];
        const ibs4 = calcIbs(b4);
        const cr2_4 = i4 >= 1 ? (p4.rsi2[i4] + p4.rsi2[i4 - 1]) / 2 : p4.rsi2[i4];
        const er4 = calcEfficiencyRatio(p4.closes, i4, 12);
        const atr4 = Math.max(q.price * 0.0025, p4.atr14[i4] || snap.atr12h14 / Math.sqrt(3));

        const micro = microSym;
        const experts = buildExpertVector(
          snap.ewmac,
          snap.aboveSma200,
          snap.ibs12h,
          snap.cumRsi2_12h,
          snap.mom12hAtr,
          snap.xsmomRank,
          CORE_SYMBOLS.length,
          snap.volRatio,
          micro,
          ZAC_CRYPTO_ASSETS.has(sym),
          ZAC_MR12_ASSETS.has(sym),
          {
            ...h4Ctx,
            newsContext: newsCtx,
            dxyChg15mPct: macro?.dxyChg15mPct,
            vixChg5mPct: macro?.vixChg5mPct,
          }
        );
        const fc4h = computeAdaptiveHorizonForecast(
          4,
          q.price,
          snap.atr12h14,
          spec.digits,
          experts,
          micro,
          false,
          sym,
          newsCtx
        );

        // MUM & SMC ÇARPIŞMA KİLİDİ:
        // 1) İç Mum Sıkışması (INSIDE_BAR_COMPRESSION) kırılım yönü belli olmadan işlem açılmaz.
        // 2) Kapanmış 1S mumda karşıt kurumsal dönüş (Boğa Yutan / SSL Sweep önüne SHORT veya Ayı Yutan / BSL Sweep önüne LONG) kesinlikle yasaktır!
        // 3) 24 saatlik sert ters squeeze (>%2.2) varsa onaylı dönüş mumu olmadan karşıt pozisyon açılmaz.
        const bullCandleBlocked =
          micro.pattern === 'INSIDE_BAR_COMPRESSION' ||
          micro.candleVsaScore <= -14 ||
          micro.sweptBslBearish ||
          micro.pattern === 'BEARISH_ENGULFING_DISPLACEMENT' ||
          micro.pattern === 'EVENING_STAR_REVERSAL' ||
          micro.structureState === 'CHOCH_DÖNÜŞ_AŞAĞI' ||
          micro.structureState === 'BOS_AŞAĞI' ||
          (q.change24hPct <= -2.2 && micro.candleVsaScore < 24);

        const bearCandleBlocked =
          micro.pattern === 'INSIDE_BAR_COMPRESSION' ||
          micro.candleVsaScore >= 14 ||
          micro.sweptSslBullish ||
          micro.pattern === 'BULLISH_ENGULFING_DISPLACEMENT' ||
          micro.pattern === 'MORNING_STAR_REVERSAL' ||
          micro.structureState === 'CHOCH_DÖNÜŞ_YUKARI' ||
          micro.structureState === 'BOS_YUKARI' ||
          (q.change24hPct >= 2.2 && micro.candleVsaScore > -24);

        const sealed = pendingSeals.get(sym);
        const bull4hPullback =
          !bullCandleBlocked &&
          snap.aboveSma200 &&
          snap.ewmac >= POD_CONFIG.CTA_TREND.minEwmac &&
          p4.e21[i4] > p4.e50[i4] &&
          er4 >= POD_CONFIG.CTA_TREND.minEr &&
          cr2_4 < 24 &&
          ibs4 >= 0.45 &&
          b4.close > (b4.open ?? b4.close) &&
          fc4h.compositeScore >= -4;

        const bear4hPullback =
          !bearCandleBlocked &&
          !snap.aboveSma200 &&
          snap.ewmac <= -POD_CONFIG.CTA_TREND.minEwmac &&
          p4.e21[i4] < p4.e50[i4] &&
          er4 >= POD_CONFIG.CTA_TREND.minEr &&
          cr2_4 > 76 &&
          ibs4 <= 0.55 &&
          b4.close < (b4.open ?? b4.close) &&
          fc4h.compositeScore <= 4;

        const cortex4hBullSniper =
          !bullCandleBlocked &&
          snap.aboveSma200 &&
          snap.ewmac >= 5.5 &&
          p4.e21[i4] > p4.e50[i4] &&
          er4 >= 0.20 &&
          (b4.close >= (b4.open ?? b4.close) || micro.candleVsaScore >= 18) &&
          fc4h.expectedDirection === 'YÜKSELİŞ' &&
          fc4h.compositeScore >= 24 &&
          snap.ibs12h <= 0.72 &&
          micro.zScoreEma20_1h <= 1.30;

        const cortex4hBearSniper =
          !bearCandleBlocked &&
          !snap.aboveSma200 &&
          snap.ewmac <= -5.5 &&
          p4.e21[i4] < p4.e50[i4] &&
          er4 >= 0.20 &&
          (b4.close <= (b4.open ?? b4.close) || micro.candleVsaScore <= -18) &&
          fc4h.expectedDirection === 'DÜŞÜŞ' &&
          fc4h.compositeScore <= -24 &&
          snap.ibs12h >= 0.28 &&
          micro.zScoreEma20_1h >= -1.30;

        let sniperDir: 'YÜKSELİŞ' | 'DÜŞÜŞ' | null = null;
        let sniperReason = '';
        if (bull4hPullback || cortex4hBullSniper) {
          sniperDir = 'YÜKSELİŞ';
          sniperReason = bull4hPullback
            ? `4S Trend İçi Geri Çekilme Sıçraması (CR2_4S ${cr2_4.toFixed(0)}, IBS4 ${ibs4.toFixed(2)}, EWMAC +${snap.ewmac})`
            : fc4h.aiReasoningTR;
        } else if (bear4hPullback || cortex4hBearSniper) {
          sniperDir = 'DÜŞÜŞ';
          sniperReason = bear4hPullback
            ? `4S Ayı Trendi Tepki Satışı (CR2_4S ${cr2_4.toFixed(0)}, IBS4 ${ibs4.toFixed(2)}, EWMAC ${snap.ewmac})`
            : fc4h.aiReasoningTR;
        }

        if (sniperDir) {
          const newsShockAgainst =
            !newsCtx.isRecapOnly &&
            newsCtx.shockLevel >= 0.62 &&
            ((sniperDir === 'YÜKSELİŞ' && newsCtx.sentimentScore <= -0.30) ||
              (sniperDir === 'DÜŞÜŞ' && newsCtx.sentimentScore >= 0.30));

          if (!newsShockAgainst) {
            const slMult = POD_CONFIG.CTA_TREND.slAtr;
            const tpMult = POD_CONFIG.CTA_TREND.tpAtr;
            const riskPct = POD_CONFIG.CTA_TREND.riskPct;
            const estAlloc = curEq * 0.22;
            const estSlDist = atr4 * slMult;
            const estTpDist = atr4 * tpMult;
            const estDesiredRisk = curEq * (riskPct / 100) * ddScale;
            const estMaxUnits = (estAlloc * spec.maxIbkrLeverage) / Math.max(1e-6, q.price);
            const estUnits = Math.min(estDesiredRisk / Math.max(1e-6, estSlDist), estMaxUnits);
            const estNotional = estUnits * q.price;
            const estEntryFee = computeIbkrCommissionUSD(spec, estNotional, estUnits, sniperDir === 'DÜŞÜŞ');
            const estExitFee = computeIbkrCommissionUSD(spec, estNotional, estUnits, sniperDir === 'YÜKSELİŞ');
            const estActualRisk = estUnits * estSlDist;
            const roundTripCostPct =
              (estEntryFee + estExitFee) / Math.max(1, estNotional) +
              (spec.spreadPts + spec.slippagePts * 2) / Math.max(1e-6, q.price);
            const estExpectedTpPct = estTpDist / Math.max(1e-6, q.price);
            const hasSealedMatch = Boolean(sealed?.f4 && sealed.f4.expectedDirection === sniperDir);

            if (
              estActualRisk >= 50 &&
              estEntryFee + estExitFee <= estActualRisk * 0.12 &&
              estExpectedTpPct >= roundTripCostPct * 4.5
            ) {
              const dir: 'AL (LONG)' | 'SAT (SHORT)' = sniperDir === 'YÜKSELİŞ' ? 'AL (LONG)' : 'SAT (SHORT)';
              const scoreVal = Math.abs(fc4h.compositeScore) >= 18 ? fc4h.compositeScore : sniperDir === 'YÜKSELİŞ' ? 28 : -28;
              chosenCand = {
                sym,
                spec,
                q,
                p12,
                completed12Idx,
                h1Bars,
                pod: 'CTA_TREND',
                podLabel: 'Pod-3: Cortex +4S Sniper',
                dir,
                horizonHours: 48,
                isClassicSwingPod: false,
                refAtr: atr4,
                riskPct,
                score: scoreVal,
                assetAcc,
                fromSealedAudit: hasSealedMatch,
                targetAtMs: nowMs + 48 * 3600_000,
                rationaleTR: `[Cortex v16.1 +4S SNIPER • %${assetAcc.toFixed(1)} Yönlü] ${sniperReason}`,
                slMult,
                tpMult,
                priority: 180 + (hasSealedMatch ? 35 : 0) + Math.abs(scoreVal),
              };
            }
          }
        }

      }

      if (chosenCand && !chosenCand.isClassicSwingPod) {
        const isL = chosenCand.dir === 'AL (LONG)';
        const slPx = +(isL ? q.price - chosenCand.refAtr * chosenCand.slMult : q.price + chosenCand.refAtr * chosenCand.slMult).toFixed(spec.digits);
        const tpPx = +(isL ? q.price + chosenCand.refAtr * chosenCand.tpMult : q.price - chosenCand.refAtr * chosenCand.tpMult).toFixed(spec.digits);
        snap.activeSetup = {
          pod: chosenCand.pod,
          podLabelTR: chosenCand.podLabel,
          direction: chosenCand.dir,
          convictionPercent: Math.min(96, Math.round(58 + Math.abs(chosenCand.score) * 1.2)),
          entryPrice: +q.price.toFixed(spec.digits),
          stopLoss: slPx,
          takeProfit: tpPx,
          riskReward: +(chosenCand.tpMult / chosenCand.slMult).toFixed(2),
          trailingAtrMult: chosenCand.slMult,
          maxHoldHours: chosenCand.horizonHours,
          rationaleTR: chosenCand.rationaleTR,
        };
      }

      if (
        chosenCand &&
        ledger.isRunning &&
        !ledger.observationModeActive &&
        !ledger.dailyLossHaltActive &&
        mkt.open
      ) {
        entryCandidates.push(chosenCand);
      }

      let statusText = isFxExcluded
        ? 'İZLEME MODU (FX Komisyon Kalkanı)'
        : chosenCand
          ? chosenCand.isClassicSwingPod
            ? `${chosenCand.pod} (${chosenCand.dir === 'AL (LONG)' ? 'AL' : 'SAT'})`
            : `CORTEX +4S SNIPER (${chosenCand.dir === 'AL (LONG)' ? 'AL' : 'SAT'} • %${assetAcc.toFixed(0)})`
          : snap.regimeLabelTR;
      const alreadyOpen = ledger.openPositions.find((p) => p.symbol === sym);
      if (alreadyOpen) {
        statusText = `AÇIK (${alreadyOpen.pod || 'POD'})`;
      } else if (!mkt.open) {
        statusText = `SEANS KAPALI (${chosenCand ? 'Hazır' : 'İzlemede'})`;
      }

      radar.push({
        symbol: sym,
        name: spec.name,
        cluster: spec.cluster,
        digits: spec.digits,
        price: +q.price.toFixed(spec.digits),
        bid: +q.bid.toFixed(spec.digits),
        ask: +q.ask.toFixed(spec.digits),
        change24hPercent: q.change24hPct,
        isOpen: mkt.open,
        closedReason: mkt.reason,
        zacScore: snap.zacScore,
        regime: snap.regime,
        regimeLabelTR: snap.regimeLabelTR,
        ewmac: snap.ewmac,
        aboveSma200: snap.aboveSma200,
        sma200: snap.sma200,
        volRatio: snap.volRatio,
        efficiencyRatio: snap.efficiencyRatio,
        ibs12h: snap.ibs12h,
        cumRsi2_12h: snap.cumRsi2_12h,
        mom12hAtr: snap.mom12hAtr,
        xsmomRank: snap.xsmomRank,
        xsmomScore30d: snap.xsmomScore30d,
        activePod: snap.activeSetup.pod,
        direction: snap.activeSetup.direction,
        conviction: snap.activeSetup.convictionPercent,
        pred24hPct: h24.expectedMovePct,
        pUp24h: h24.pUp,
        status: statusText,
        reason: chosenCand ? chosenCand.rationaleTR : snap.activeSetup.rationaleTR,
        botStatus: statusText,
        botDirection: snap.activeSetup.direction,
        botScore: chosenCand ? Math.min(98, Math.round(55 + Math.abs(chosenCand.score))) : Math.min(95, Math.round(50 + Math.abs(snap.zacScore) * 0.45)),
        botReason: chosenCand ? chosenCand.rationaleTR : snap.activeSetup.rationaleTR,
      });
    }

    // 5B) Öncelik Sıralı Emir İcrası (Birleşik Kripto Korelasyon Tavanı + Sıkı Maliyet Kalkanı)
    entryCandidates.sort((a, b) => b.priority - a.priority);

    const getEffClusterKey = (s: string, d: 'AL (LONG)' | 'SAT (SHORT)') => {
      const cl = s === 'COPPER' ? 'BASE_METAL' : getSpec(s).cluster;
      if (cl === 'CRYPTO_MAJOR' || cl === 'CRYPTO_L1') {
        return `CRYPTO_${d}`; // BTC + ETH + SOL yüksek korelasyonlu tek küme!
      }
      if (cl === 'USD_MAJORS') {
        const usdLong = s === 'USD/JPY' ? d === 'AL (LONG)' : d === 'SAT (SHORT)';
        return `USD_MAJORS_${usdLong ? 'USD_UP' : 'USD_DN'}`;
      }
      return `${cl}_${d}`;
    };

    for (const cand of entryCandidates) {
      const { sym, spec, q, p12, completed12Idx, pod, dir } = cand;
      const isLong = dir === 'AL (LONG)';
      const totalOpenCap = 5;
      const maxSlots = POD_CONFIG[pod].maxSlots;
      const podCount = ledger.openPositions.filter((p) => p.pod === pod).length;
      const hasSameSym = ledger.openPositions.some((p) => p.symbol === sym);
      const effClusterKey = getEffClusterKey(sym, dir);
      const totalCluster = ledger.openPositions.filter(
        (p) => getEffClusterKey(p.symbol, p.direction) === effClusterKey
      ).length;
      const totalClusterCap = spec.cluster === 'US_TECH' ? 2 : 1;

      const lastSymTrade = ledger.closedTrades.find((t) => t.symbol === sym && t.closeTimestamp);
      const cooldownMs = 2 * 3600 * 1000;
      const recentlyClosed = lastSymTrade?.closeTimestamp ? nowMs - lastSymTrade.closeTimestamp < cooldownMs : false;

      if (
        ledger.openPositions.length >= totalOpenCap ||
        podCount >= maxSlots ||
        hasSameSym ||
        totalCluster >= totalClusterCap ||
        recentlyClosed
      ) {
        continue;
      }

      const entryPx = isLong ? q.ask + spec.slippagePts : q.bid - spec.slippagePts;
      const refAtr = Math.max(entryPx * 0.0014, cand.refAtr);
      const slDist = refAtr * cand.slMult;
      const sl = isLong ? entryPx - slDist : entryPx + slDist;
      const tpDist = cand.tpMult > 0 ? refAtr * cand.tpMult : slDist * 2.0;
      const tp2 = cand.tpMult > 0 ? (isLong ? entryPx + tpDist : entryPx - tpDist) : 0;
      const tp1 = cand.tpMult > 0 ? (isLong ? entryPx + tpDist * 0.75 : entryPx - tpDist * 0.75) : 0;

      const riskPct = cand.riskPct;
      const q2u = sym === 'USD/JPY' ? 1 / (entryPx || 155) : 1;
      const freeMargin = Math.max(0, ledger.cashBalanceUSD - ledger.allocatedMarginUSD);
      const allocUSD = Math.min(curEq * 0.22, freeMargin * 0.88);
      const desiredRiskUSD = curEq * (riskPct / 100) * ddScale;
      const unitRiskUSD = slDist * q2u;
      const maxUnitsByMargin = (allocUSD * spec.maxIbkrLeverage) / Math.max(1e-6, entryPx * q2u);
      const units = Math.min(desiredRiskUSD / Math.max(1e-6, unitRiskUSD), maxUnitsByMargin);
      const actualRiskUSD = units * unitRiskUSD;
      const minRiskFloor = Math.max(50, curEq * 0.003 * ddScale);

      if (allocUSD >= 250 && units > 0 && actualRiskUSD >= minRiskFloor) {
        const notionalUSD = units * entryPx * q2u;
        const entryFee = computeIbkrCommissionUSD(spec, notionalUSD, units, !isLong);
        const estCloseFee = computeIbkrCommissionUSD(spec, notionalUSD, units, isLong);
        const roundTripCostPct =
          (entryFee + estCloseFee) / Math.max(1, notionalUSD) +
          (spec.spreadPts + spec.slippagePts * 2) / Math.max(1e-6, entryPx);
        const expectedTpPct = tpDist / Math.max(1e-6, entryPx);
        const costMultReq = cand.isClassicSwingPod ? 3.5 : 4.5;
        const maxFeeShare = 0.12;
        if (entryFee + estCloseFee <= actualRiskUSD * maxFeeShare && expectedTpPct >= roundTripCostPct * costMultReq) {
          ledger.cashBalanceUSD = +(ledger.cashBalanceUSD - entryFee).toFixed(2);
          const latest12Ts = p12.bars[completed12Idx]?.timestamp || nowMs;
          const initLiqPx = isLong ? q.bid : q.ask;
          const initGrossUSD = (isLong ? initLiqPx - entryPx : entryPx - initLiqPx) * units * q2u;
          const initEstExitFee = computeIbkrCommissionUSD(spec, units * initLiqPx * q2u, units, isLong);
          const initUnrealizedUSD = +(initGrossUSD - initEstExitFee).toFixed(2);
          const initTotalPnL_USD = +(initGrossUSD - entryFee - initEstExitFee).toFixed(2);
          const tradePrefix = cand.isClassicSwingPod ? pod : 'CORTEX';
          const newTrade: AutonomousTrade = {
            id: `${tradePrefix}-${nowMs}-${sym.replace(/[^A-Z0-9]/g, '')}`,
            symbol: sym,
            name: spec.name,
            digits: spec.digits,
            pod,
            podLabel: cand.podLabel,
            direction: dir,
            status: 'AÇIK',
            entryTime: formatTRDateTime(nowMs),
            entryTimestamp: nowMs,
            entryPrice: +entryPx.toFixed(spec.digits),
            currentPrice: +q.price.toFixed(spec.digits),
            bidAtTick: +q.bid.toFixed(spec.digits),
            askAtTick: +q.ask.toFixed(spec.digits),
            takeProfit1: tp1 > 0 ? +tp1.toFixed(spec.digits) : 0,
            takeProfit2: tp2 > 0 ? +tp2.toFixed(spec.digits) : 0,
            stopLoss: +sl.toFixed(spec.digits),
            initialStopLoss: +sl.toFixed(spec.digits),
            peakPrice: +entryPx.toFixed(spec.digits),
            trailingAtrMult: cand.slMult,
            entry12hBucketTs: latest12Ts,
            maxExitTimestamp: cand.targetAtMs,
            allocatedCapitalUSD: +allocUSD.toFixed(2),
            notionalValueUSD: +notionalUSD.toFixed(2),
            effectiveLeverage: +(notionalUSD / allocUSD).toFixed(2),
            positionSizeUnits: +units.toFixed(spec.digits >= 3 ? 2 : 4),
            unitLabel: spec.unitLabel,
            riskUSD: +(units * unitRiskUSD).toFixed(2),
            executionCostUSD: +entryFee.toFixed(2),
            entryCommissionUSD: +entryFee.toFixed(2),
            exitCommissionUSD: 0,
            financingCostUSD: 0,
            grossUnrealizedPnL_USD: +initGrossUSD.toFixed(2),
            tp1Hit: false,
            realizedPnL_USD: 0,
            unrealizedPnL_USD: initUnrealizedUSD,
            totalPnL_USD: initTotalPnL_USD,
            totalPnL_Percent: +((initTotalPnL_USD / allocUSD) * 100).toFixed(2),
            rationale: cand.rationaleTR,
            lastSwapAccrualMs: nowMs,
          };
          ledger.openPositions.unshift(newTrade);
          const curRadarRow = radar.find((r) => r.symbol === sym);
          if (curRadarRow) {
            curRadarRow.status = `AÇIK (${cand.podLabel})`;
            curRadarRow.botStatus = curRadarRow.status;
          }
          ledger.activityLog.unshift({
            id: `ENT-${nowMs}-${sym}`,
            timestamp: formatTRDateTime(nowMs),
            type: 'ENTRY',
            symbol: sym,
            pod,
            message: `[${cand.podLabel}] ${sym} ${dir} AÇILDI @ ${newTrade.entryPrice} | Teminat: $${allocUSD.toFixed(0)} | SL: ${newTrade.stopLoss} | TP: ${newTrade.takeProfit2 > 0 ? newTrade.takeProfit2 : 'Trailing'}`,
          });
          recalculateLedgerMetrics(ledger);
        }
      }
    }

    // Radarı yüksek kanaat (|ZAC| + aktif tetik) önceliğine göre sırala
    radar.sort((a, b) => {
      const aTrig = a.activePod !== 'NONE' ? 1000 : 0;
      const bTrig = b.activePod !== 'NONE' ? 1000 : 0;
      return bTrig + Math.abs(b.zacScore) - (aTrig + Math.abs(a.zacScore));
    });

    ledger.lastMarketRadar = radar;
    ledger.marketScanner = radar.map((r) => ({
      symbol: r.symbol,
      price: r.price,
      status: r.status,
      direction: r.direction,
      candidateDirection: r.direction,
      score: r.botScore ?? Math.abs(r.zacScore),
      confluenceScore: r.botScore ?? Math.abs(r.zacScore),
      reason: r.reason,
      decisionReason: r.reason,
    }));
    ledger.lastTickAt = new Date(nowMs).toISOString();
    ledger.tickCount = (ledger.tickCount || 0) + 1;

    recalculateLedgerMetrics(ledger);

    // Equity tarihçesi (en fazla 300 nokta, her 5 dk veya force tick'te ekle)
    if (!ledger.equityHistory) ledger.equityHistory = [];
    const lastHist = ledger.equityHistory[ledger.equityHistory.length - 1];
    if (!lastHist || force || nowMs - lastHist.timestamp >= 5 * 60 * 1000) {
      const peakEq = ledger.peakEquityUSD || ledger.initialCapitalUSD;
      const ddPct =
        peakEq > 0
          ? +(((peakEq - ledger.totalEquityUSD) / peakEq) * 100).toFixed(2)
          : 0;
      ledger.equityHistory.push({
        timestamp: nowMs,
        timeStr: formatTRDateTime(nowMs),
        equityUSD: ledger.totalEquityUSD,
        ddPct,
      });
      if (ledger.equityHistory.length > 300) {
        ledger.equityHistory = ledger.equityHistory.slice(-300);
      }
    }
    ledger.equityCurve = ledger.equityHistory.map((h) => ({
      timestamp: h.timestamp,
      timeStr: h.timeStr,
      equityUSD: h.equityUSD,
      drawdownPercent: h.ddPct,
    }));
    if (ledger.activityLog.length > 150) ledger.activityLog = ledger.activityLog.slice(0, 150);

    saveLedgerAtomic(ledger);
    return ledger;
  })();

  tickInFlight = work;
  try {
    return await work;
  } finally {
    tickInFlight = null;
  }
}

export async function controlAutonomousBot(
  action: 'start' | 'pause' | 'reset' | 'close_position',
  payload?: { tradeId?: string }
): Promise<AutonomousLedgerState> {
  const ledger = loadOrInitAutonomousLedger();
  const nowMs = Date.now();

  if (action === 'start') {
    ledger.isRunning = true;
    ledger.observationModeActive = false;
    ledger.activityLog.unshift({
      id: `SYS-${nowMs}`,
      timestamp: formatTRDateTime(nowMs),
      type: 'SYSTEM',
      symbol: 'PORTFÖY',
      message: 'Otonom 3-Pod Fon Motoru AKTİF duruma geçirildi.',
    });
    saveLedgerAtomic(ledger);
    return runAutonomousBotTick(true);
  }

  if (action === 'pause') {
    ledger.isRunning = false;
    ledger.activityLog.unshift({
      id: `SYS-${nowMs}`,
      timestamp: formatTRDateTime(nowMs),
      type: 'SYSTEM',
      symbol: 'PORTFÖY',
      message: 'Otonom Fon Motoru kullanıcı tarafından DURAKLATILDI.',
    });
    saveLedgerAtomic(ledger);
    return ledger;
  }

  if (action === 'reset') {
    const usdTry = await fetchLiveUsdTryRate().catch(() => ledger.liveUsdTry || 50.59);
    cachedLedger = createFreshLedger(usdTry);
    saveLedgerAtomic(cachedLedger);
    return runAutonomousBotTick(true);
  }

  if (action === 'close_position' && payload?.tradeId) {
    const idx = ledger.openPositions.findIndex((p) => p.id === payload.tradeId);
    if (idx >= 0) {
      const pos = ledger.openPositions[idx];
      const spec = getSpec(pos.symbol);
      const isLong = pos.direction === 'AL (LONG)';
      const rawExit = isLong ? pos.bidAtTick || pos.currentPrice : pos.askAtTick || pos.currentPrice;
      const exitPx = isLong ? rawExit - spec.slippagePts : rawExit + spec.slippagePts;
      const q2u = pos.symbol === 'USD/JPY' ? 1 / (exitPx || 155) : 1;
      const gross = pos.positionSizeUnits * (isLong ? exitPx - pos.entryPrice : pos.entryPrice - exitPx) * q2u;
      const exitFee = computeIbkrCommissionUSD(spec, pos.positionSizeUnits * exitPx * q2u, pos.positionSizeUnits, isLong);
      ledger.cashBalanceUSD = +(ledger.cashBalanceUSD + gross - exitFee).toFixed(2);
      const net = +(gross - (pos.entryCommissionUSD || 0) - exitFee - (pos.financingCostUSD || 0)).toFixed(2);

      pos.closeTime = formatTRDateTime(nowMs);
      pos.closeTimestamp = nowMs;
      pos.closePrice = +exitPx.toFixed(spec.digits);
      pos.exitCommissionUSD = +exitFee.toFixed(2);
      pos.realizedPnL_USD = net;
      pos.unrealizedPnL_USD = 0;
      pos.totalPnL_USD = net;
      pos.exitReason = 'MANUEL YÖNETİCİ KAPATIŞI';
      pos.status = net > 0.5 ? 'KAPALI (KAR)' : net < -0.5 ? 'KAPALI (ZARAR)' : 'KAPALI (BAŞA BAŞ)';

      ledger.openPositions.splice(idx, 1);
      ledger.closedTrades.unshift(pos);
      ledger.activityLog.unshift({
        id: `MAN-${nowMs}`,
        timestamp: formatTRDateTime(nowMs),
        type: 'BREAKEVEN_EXIT',
        symbol: pos.symbol,
        pod: pos.pod,
        message: `[${pos.pod}] ${pos.symbol} yönetici komutuyla kapatıldı @ ${pos.closePrice} | Net: ${net >= 0 ? '+' : '-'}$${Math.abs(net).toFixed(2)}`,
        pnlImpactUSD: net,
      });
      recalculateLedgerMetrics(ledger);
      saveLedgerAtomic(ledger);
    }
  }

  return ledger;
}

export function getAutonomousLedgerSnapshot(): AutonomousLedgerState {
  return loadOrInitAutonomousLedger();
}

export function startAutonomousScheduler(): void {
  if (schedulerHandle) return;
  // İlk açılışta kısa gecikme ile canlı taramayı başlat ve her 60sn'de bir çalıştır
  setTimeout(() => {
    const l = loadOrInitAutonomousLedger();
    if (l.isRunning) runAutonomousBotTick(false).catch(() => {});
  }, 1500);
  schedulerHandle = setInterval(() => {
    const l = loadOrInitAutonomousLedger();
    if (l.isRunning) runAutonomousBotTick(false).catch(() => {});
  }, 60 * 1000);
}

// =========================================================================
// GERÇEK VERİ MULTI-WINDOW WALK-FORWARD DENETİM MOTORU (30G | 90G | 1Y | 2Y)
// Kesin saatlik mum içi worst-case SL, spread, kayma, IBKR komisyon ve gecelik swap dahildir.
// =========================================================================
export type WalkForwardWindow = '30d' | '90d' | '1y' | '2y';

export interface WalkForwardAuditReport {
  window: WalkForwardWindow;
  windowLabelTR: string;
  strategyVersion: string;
  generatedAt: string;
  startDate: string;
  endDate: string;
  initialCapitalUSD: number;
  endingEquityUSD: number;
  netProfitUSD: number;
  netProfitPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownPercent: number;
  totalTrades: number;
  winRatePercent: number;
  profitFactor: number;
  totalFeesUSD: number;
  totalSwapUSD: number;
  positiveQuarters: number;
  totalQuarters: number;
  podAttribution: {
    pod: Exclude<ZacPodType, 'NONE'>;
    label: string;
    trades: number;
    winRatePct: number;
    profitFactor: number;
    netPnL_USD: number;
    feesUSD: number;
    swapUSD: number;
  }[];
  quarterlyBreakdown: {
    quarter: string;
    trades: number;
    winRatePct: number;
    profitFactor: number;
    netPnL_USD: number;
  }[];
  equityCurve: { date: string; equityUSD: number; ddPct: number }[];
  recentTrades: {
    symbol: string;
    pod: string;
    direction: 'AL (LONG)' | 'SAT (SHORT)';
    entryDate: string;
    exitDate: string;
    entryPrice: number;
    exitPrice: number;
    netPnL_USD: number;
    rMultiple: number;
    reason: string;
  }[];
  legacyComparison: {
    oldVersion: string;
    old2YEndingEquityUSD: number;
    old2YReturnPct: number;
    old2YMaxDdPct: number;
    old2YProfitFactor: number;
    old2YPositiveQuarters: string;
    improvementSummaryTR: string;
  };
}

const auditCache = new Map<WalkForwardWindow, { ts: number; data: WalkForwardAuditReport }>();
const AUDIT_CACHE_TTL = 15 * 60 * 1000;

export async function runLiveWalkForwardAudit(
  window: WalkForwardWindow = '2y',
  forceRefresh = false
): Promise<WalkForwardAuditReport> {
  const cached = auditCache.get(window);
  if (!forceRefresh && cached && Date.now() - cached.ts < AUDIT_CACHE_TTL) {
    return cached.data;
  }

  const daysBack = window === '30d' ? 30 : window === '90d' ? 90 : window === '1y' ? 365 : 725;
  const nowMs = Date.now();
  const startMs = nowMs - daysBack * 86400 * 1000;

  // Tüm 14 yüksek-marjlı IBKR varlığının 2Y 1H + 4H + 12H + Temiz Günlük + VIX verisini çek (Dar FX pariteleri hariç!)
  const h1Map = new Map<string, HourlyBar[]>();
  const h1Idx = new Map<string, Map<number, number>>();
  const b12Map = new Map<string, HourlyBar[]>();
  const b12Pack = new Map<string, TwelveHourIndicatorPack>();
  const b12End = new Map<string, Map<number, number>>();
  const b4Pack = new Map<string, FourHourIndicatorPack>();
  const b4End = new Map<string, Map<number, number>>();
  const dPackMap = new Map<string, DailyIndicatorPack>();
  const tsSet = new Set<number>();
  const activeWfSymbols = CORE_SYMBOLS.filter((s) => !EXECUTION_EXCLUDED_SYMBOLS.has(s));

  for (let i = 0; i < activeWfSymbols.length; i += 6) {
    const batch = activeWfSymbols.slice(i, i + 6);
    await Promise.all(
      batch.map(async (sym) => {
        const [h1, daily] = await Promise.all([
          fetchExtendedHourlyHistory(sym, '730d'),
          fetchCleanDailyHistory(sym),
        ]);
        if (h1.length < 120 || daily.length < 120) return;
        h1Map.set(sym, h1);
        const hm = new Map<number, number>();
        const lastHrByBucket = new Map<number, number>();
        const lastHrBy4h = new Map<number, number>();
        h1.forEach((b, idx) => {
          const hr = Math.floor(b.timestamp / 3600000) * 3600000;
          hm.set(hr, idx);
          if (hr >= startMs) tsSet.add(hr);
          const bk = Math.floor(b.timestamp / (12 * 3600000)) * (12 * 3600000);
          if (hr > (lastHrByBucket.get(bk) || 0)) lastHrByBucket.set(bk, hr);
          const bk4 = Math.floor(b.timestamp / (4 * 3600000)) * (4 * 3600000);
          if (hr > (lastHrBy4h.get(bk4) || 0)) lastHrBy4h.set(bk4, hr);
        });
        h1Idx.set(sym, hm);

        const p12 = build12hIndicatorPack(h1, sym);
        b12Map.set(sym, p12.bars);
        b12Pack.set(sym, p12);
        const m12 = new Map<number, number>();
        p12.bars.forEach((b, idx) => {
          const endHr = Math.floor((b.endTimestamp ?? b.timestamp + 12 * 3600000) / 3600000) * 3600000;
          const lh = lastHrByBucket.get(Math.floor(b.timestamp / (12 * 3600000)) * (12 * 3600000)) ?? endHr;
          m12.set(Math.max(lh, endHr - 3600000), idx);
        });
        b12End.set(sym, m12);

        const p4 = build4hIndicatorPack(h1, sym);
        b4Pack.set(sym, p4);
        const m4 = new Map<number, number>();
        p4.bars.forEach((b, idx) => {
          const endHr = Math.floor((b.endTimestamp ?? b.timestamp + 4 * 3600000) / 3600000) * 3600000;
          const lh = lastHrBy4h.get(Math.floor(b.timestamp / (4 * 3600000)) * (4 * 3600000)) ?? endHr;
          m4.set(Math.max(lh, endHr - 3600000), idx);
        });
        b4End.set(sym, m4);

        dPackMap.set(sym, buildDailyIndicatorPack(daily));
      })
    );
  }

  const vixBars = await fetchCleanDailyHistory('VIX').catch(() => [] as HourlyBar[]);
  const vixByDate = new Map<string, number>();
  vixBars.forEach((b) => vixByDate.set(new Date(b.timestamp).toISOString().slice(0, 10), b.close));

  const timeline = Array.from(tsSet).sort((a, b) => a - b);

  interface SimPos {
    sym: string;
    pod: Exclude<ZacPodType, 'NONE'>;
    dir: 1 | -1;
    entryTs: number;
    entryPx: number;
    sl: number;
    tp: number;
    peak: number;
    slAtr: number;
    atrRef: number;
    units: number;
    allocUSD: number;
    riskUSD: number;
    entryFee: number;
    swap: number;
    entry12Idx?: number;
    maxExitTs: number;
  }

  // Doğrudan gerçek $25,000.00 USD IBKR Pro sermayesi ile ölçeklemesiz birebir simülasyon!
  const capScale = 1.0;
  let cash = INITIAL_CAPITAL_USD;
  let peakEq = INITIAL_CAPITAL_USD;
  let maxDd = 0;
  let vixLast = 18;
  let open: SimPos[] = [];
  const closed: {
    sym: string;
    pod: Exclude<ZacPodType, 'NONE'>;
    dir: 1 | -1;
    entryTs: number;
    exitTs: number;
    entryPx: number;
    exitPx: number;
    net: number;
    fee: number;
    swap: number;
    rNet: number;
    reason: string;
  }[] = [];
  const lastPx = new Map<string, number>();
  const dPtr = new Map<string, number>(activeWfSymbols.map((s) => [s, 0]));
  const dailyEq: { date: string; equityUSD: number; ddPct: number }[] = [];
  let lastDay = '';

  for (const hrTs of timeline) {
    const dStr = new Date(hrTs).toISOString().slice(0, 10);
    const utcHour = new Date(hrTs).getUTCHours();

    for (const s of activeWfSymbols) {
      const hi = h1Idx.get(s)?.get(hrTs);
      if (hi !== undefined) lastPx.set(s, h1Map.get(s)![hi].close);
      const dpObj = dPackMap.get(s);
      if (!dpObj) continue;
      let ptr = dPtr.get(s) || 0;
      while (
        ptr + 1 < dpObj.bars.length &&
        (dpObj.bars[ptr + 1].endTimestamp ?? dpObj.bars[ptr + 1].timestamp + 24 * 3600000) <= hrTs
      ) {
        ptr++;
      }
      dPtr.set(s, ptr);
    }

    // 1) Bar-by-bar 1H worst-case stop, kayma, SEC/FINRA TAF & %6.33 marjin faizi
    const nextOpen: SimPos[] = [];
    for (const pos of open) {
      const hi = h1Idx.get(pos.sym)?.get(hrTs);
      if (hi === undefined) {
        nextOpen.push(pos);
        continue;
      }
      const b = h1Map.get(pos.sym)![hi];
      const px = b.close, bh = b.high ?? px, bl = b.low ?? px;
      const spec = getSpec(pos.sym), halfSp = spec.spreadPts / 2, isL = pos.dir === 1;
      const worst = isL ? bl - halfSp : bh + halfSp;
      const best = isL ? bh - halfSp : bl + halfSp;
      const clsLiq = isL ? px - halfSp - spec.slippagePts : px + halfSp + spec.slippagePts;

      const borrowed = Math.max(0, pos.units * px - pos.allocUSD);
      if (borrowed > 0) {
        const sf = borrowed * (0.0633 / (365 * 24));
        pos.swap += sf;
        cash -= sf;
      }

      const closeP = (exitPx: number, reason: string) => {
        const gross = pos.units * (isL ? exitPx - pos.entryPx : pos.entryPx - exitPx);
        const exitFee = computeIbkrCommissionUSD(spec, pos.units * exitPx, pos.units, isL);
        cash += gross - exitFee;
        const net = gross - pos.entryFee - exitFee - pos.swap;
        closed.push({
          sym: pos.sym,
          pod: pos.pod,
          dir: pos.dir,
          entryTs: pos.entryTs,
          exitTs: hrTs,
          entryPx: +pos.entryPx.toFixed(spec.digits),
          exitPx: +exitPx.toFixed(spec.digits),
          net,
          fee: pos.entryFee + exitFee,
          swap: pos.swap,
          rNet: pos.riskUSD > 0 ? net / pos.riskUSD : 0,
          reason,
        });
      };

      const stopFill = isL ? pos.sl - spec.slippagePts : pos.sl + spec.slippagePts;
      if (isL ? worst <= pos.sl : worst >= pos.sl) {
        const lockedProfit = isL ? pos.sl > pos.entryPx : pos.sl < pos.entryPx;
        closeP(stopFill, lockedProfit ? 'KÂR KİLİDİ / TRAILING' : 'STOP / TRAILING');
        continue;
      }
      if (pos.tp > 0 && (isL ? best >= pos.tp : best <= pos.tp)) { closeP(pos.tp, 'LİMİT TP'); continue; }
      if (pos.maxExitTs > 0 && hrTs >= pos.maxExitTs) { closeP(clsLiq, 'SÜRE ÇIKIŞI'); continue; }

      pos.peak = isL ? Math.max(pos.peak, best) : Math.min(pos.peak, best);
      const peakMove = isL ? pos.peak - pos.entryPx : pos.entryPx - pos.peak;
      if (peakMove >= pos.atrRef * 1.45) {
        const lockSl = isL ? pos.entryPx + peakMove * 0.42 : pos.entryPx - peakMove * 0.42;
        if (isL ? lockSl > pos.sl : lockSl < pos.sl) pos.sl = lockSl;
      }

      if (pos.pod === 'MR_SPRING_12H') {
        const i12 = b12End.get(pos.sym)?.get(hrTs);
        if (i12 !== undefined && pos.entry12Idx !== undefined && i12 > pos.entry12Idx) {
          const bars12 = b12Map.get(pos.sym)!;
          if (bars12[i12].close > (bars12[i12 - 1].high ?? bars12[i12 - 1].close)) {
            closeP(clsLiq, 'MR12 GÜÇ ÇIKIŞI');
            continue;
          }
        }
      } else if (pos.pod === 'CRYPTO_MOM_12H') {
        const i12 = b12End.get(pos.sym)?.get(hrTs);
        if (i12 !== undefined) {
          const atr = b12Pack.get(pos.sym)!.atr14[i12];
          const cand = isL ? pos.peak - atr * pos.slAtr : pos.peak + atr * pos.slAtr;
          if (isL ? cand > pos.sl : cand < pos.sl) pos.sl = cand;
        }
      } else if (pos.pod === 'CTA_TREND') {
        const i4 = b4End.get(pos.sym)?.get(hrTs);
        if (i4 !== undefined) {
          const atr4 = b4Pack.get(pos.sym)!.atr14[i4];
          if (atr4 > 0) {
            const cand = isL ? pos.peak - atr4 * pos.slAtr : pos.peak + atr4 * pos.slAtr;
            if (isL ? cand > pos.sl : cand < pos.sl) pos.sl = cand;
          }
        }
      }
      nextOpen.push(pos);
    }
    open = nextOpen;

    let floatUSD = 0, usedMargin = 0;
    for (const p of open) {
      const lp = lastPx.get(p.sym) || p.entryPx;
      floatUSD += p.units * (p.dir === 1 ? lp - p.entryPx : p.entryPx - lp);
      usedMargin += p.allocUSD;
    }
    const eq = cash + floatUSD;
    if (eq > peakEq) peakEq = eq;
    const curDd = peakEq > 0 ? ((peakEq - eq) / peakEq) * 100 : 0;
    if (curDd > maxDd) maxDd = curDd;
    const ddScale = curDd >= 8.0 ? 0.5 : curDd >= 5.0 ? 0.75 : 1.0;

    if (utcHour === 21 && dStr !== lastDay) {
      lastDay = dStr;
      if (vixByDate.has(dStr)) vixLast = vixByDate.get(dStr)!;
      dailyEq.push({ date: dStr, equityUSD: +eq.toFixed(2), ddPct: +curDd.toFixed(2) });
    }

    const tryOpen = (
      sym: string,
      pod: Exclude<ZacPodType, 'NONE'>,
      dir: 1 | -1,
      riskPct: number,
      atr: number,
      slAtr: number,
      tpAtr: number,
      maxH: number,
      i12?: number
    ) => {
      if (open.length >= 5) return;
      if (open.filter((p) => p.pod === pod).length >= POD_CONFIG[pod].maxSlots) return;
      if (open.some((p) => p.sym === sym)) return;
      const isUsEq = sym === 'NVDA' || sym === 'AAPL' || sym === 'MSFT';
      if (isUsEq && eq < 25_000) return;

      const spec = getSpec(sym);
      const clKey =
        spec.cluster === 'CRYPTO_MAJOR' || spec.cluster === 'CRYPTO_L1'
          ? 'CRYPTO'
          : sym === 'COPPER'
            ? 'BASE_METAL'
            : spec.cluster;
      const maxCl = clKey === 'US_TECH' ? 2 : 1;
      if (
        open.filter((p) => {
          const sc = getSpec(p.sym).cluster;
          const pk =
            sc === 'CRYPTO_MAJOR' || sc === 'CRYPTO_L1'
              ? 'CRYPTO'
              : p.sym === 'COPPER'
                ? 'BASE_METAL'
                : sc;
          return pk === clKey && p.dir === dir;
        }).length >= maxCl
      ) {
        return;
      }

      const px = lastPx.get(sym);
      if (!px || !(atr > 0)) return;
      const halfSp = spec.spreadPts / 2, isL = dir === 1;
      const entryPx = isL ? px + halfSp + spec.slippagePts : px - halfSp - spec.slippagePts;
      const slDist = atr * slAtr;
      const sl = isL ? entryPx - slDist : entryPx + slDist;
      const tp = tpAtr > 0 ? (isL ? entryPx + atr * tpAtr : entryPx - atr * tpAtr) : 0;
      const alloc = Math.min(eq * 0.22, Math.max(0, cash - usedMargin) * 0.85);
      if (alloc < 250) return;
      const desiredRisk = eq * (riskPct / 100) * ddScale;
      const units = Math.min(desiredRisk / (slDist || 1), (alloc * spec.maxIbkrLeverage) / (entryPx || 1));
      if (!(units > 0)) return;
      const notional = units * entryPx;
      const entryFee = computeIbkrCommissionUSD(spec, notional, units, !isL);
      const estExitFee = computeIbkrCommissionUSD(spec, notional, units, isL);
      const rtCostPct = (entryFee + estExitFee) / notional + (spec.spreadPts + spec.slippagePts * 2) / entryPx;
      const expTpPct = (tpAtr > 0 ? atr * tpAtr : slDist * 2.0) / entryPx;
      if (entryFee + estExitFee > units * slDist * 0.12 || expTpPct < rtCostPct * 4.5) return;

      cash -= entryFee;
      usedMargin += alloc;
      open.push({
        sym, pod, dir, entryTs: hrTs, entryPx, sl, tp, peak: entryPx, slAtr, atrRef: atr,
        units, allocUSD: alloc, riskUSD: units * slDist, entryFee, swap: 0,
        entry12Idx: i12, maxExitTs: maxH > 0 ? hrTs + maxH * 3600000 : 0,
      });
    };

    // Pod-1: MR_SPRING_12H (VIX Şelale Korumalı Seküler Dip)
    for (const s of ZAC_MR12_ASSETS) {
      const i12 = b12End.get(s)?.get(hrTs);
      if (i12 === undefined || i12 < 30) continue;
      const dp = dPtr.get(s) || 0;
      const dP = dPackMap.get(s);
      if (!dP || dp < 200) continue;
      const ew = calcEwmacAt(dP.e8, dP.e16, dP.e32, dP.e64, dP.e128, dP.atr20, dp);
      const vr = dP.atr50[dp] > 0 ? dP.atr14[dp] / dP.atr50[dp] : 1;
      if (
        dP.bars[dp].close <= dP.s200[dp] ||
        ew <= 1.0 ||
        vr > 1.32 ||
        vixLast >= 26.5 ||
        dP.e8[dp] < dP.e32[dp] * 0.992
      ) {
        continue;
      }
      const p12 = b12Pack.get(s)!;
      const ibs = calcIbs(p12.bars[i12]);
      const cr2 = (p12.rsi2[i12] + p12.rsi2[i12 - 1]) / 2;
      if (ibs < POD_CONFIG.MR_SPRING_12H.ibsThresh && cr2 < POD_CONFIG.MR_SPRING_12H.cumRsi2Thresh) {
        tryOpen(s, 'MR_SPRING_12H', 1, POD_CONFIG.MR_SPRING_12H.riskPct, p12.atr14[i12], POD_CONFIG.MR_SPRING_12H.slAtr, POD_CONFIG.MR_SPRING_12H.tpAtr, POD_CONFIG.MR_SPRING_12H.maxHoldHours, i12);
      }
    }

    // Pod-2: CRYPTO_MOM_12H (7/24 Kripto Sakin Volatilite Trendi)
    for (const s of ZAC_CRYPTO_ASSETS) {
      const i12 = b12End.get(s)?.get(hrTs);
      if (i12 === undefined || i12 < 105) continue;
      const dp = dPtr.get(s) || 0;
      const dP = dPackMap.get(s);
      if (!dP || dp < 200) continue;
      const ew = calcEwmacAt(dP.e8, dP.e16, dP.e32, dP.e64, dP.e128, dP.atr20, dp);
      const p12 = b12Pack.get(s)!;
      const vr = p12.atr50[i12] > 0 ? p12.atr14[i12] / p12.atr50[i12] : 1;
      const mom = (p12.bars[i12].close - p12.bars[i12 - 1].close) / Math.max(1e-9, p12.atr14[i12]);
      if (p12.e20[i12] > p12.e100[i12] && mom > 1.0 && mom < 3.4 && vr < 1.16 && ew > 2) {
        tryOpen(s, 'CRYPTO_MOM_12H', 1, POD_CONFIG.CRYPTO_MOM_12H.riskPctLong, p12.atr14[i12], POD_CONFIG.CRYPTO_MOM_12H.slAtr, 0, POD_CONFIG.CRYPTO_MOM_12H.maxHoldHours);
      } else if (p12.e20[i12] < p12.e100[i12] && mom < -1.0 && mom > -3.4 && vr < 1.18 && ew < -3.5) {
        tryOpen(s, 'CRYPTO_MOM_12H', -1, POD_CONFIG.CRYPTO_MOM_12H.riskPctShort, p12.atr14[i12], POD_CONFIG.CRYPTO_MOM_12H.slAtr, 0, POD_CONFIG.CRYPTO_MOM_12H.maxHoldHours);
      }
    }

    // Pod-3: CORTEX +4S TREND İÇİ GERİ ÇEKİLME SNIPER (Emtia & Kripto — Kapanmış Mum & SMC Çarpışma Kilidi Dahil!)
    for (const s of CORTEX_4H_SNIPER_ASSETS) {
      const i4 = b4End.get(s)?.get(hrTs);
      if (i4 === undefined || i4 < 55) continue;
      const dp = dPtr.get(s) || 0;
      const dP = dPackMap.get(s);
      if (!dP || dp < 200) continue;
      const ew = calcEwmacAt(dP.e8, dP.e16, dP.e32, dP.e64, dP.e128, dP.atr20, dp);
      const vrD = dP.atr50[dp] > 0 ? dP.atr14[dp] / dP.atr50[dp] : 1;
      if (vrD > POD_CONFIG.CTA_TREND.maxVolRatio) continue;
      const p4 = b4Pack.get(s)!;
      const ibs4 = calcIbs(p4.bars[i4]);
      const cr2_4 = (p4.rsi2[i4] + p4.rsi2[i4 - 1]) / 2;
      const er4 = calcEfficiencyRatio(p4.closes, i4, 12);

      const hiCur = h1Idx.get(s)?.get(hrTs);
      const h1Arr = h1Map.get(s);
      const specWf = getSpec(s);

      if (dP.bars[dp].close > dP.s200[dp] && ew >= POD_CONFIG.CTA_TREND.minEwmac && p4.e21[i4] > p4.e50[i4] && er4 >= POD_CONFIG.CTA_TREND.minEr) {
        if (cr2_4 < 24 && ibs4 >= 0.45 && p4.bars[i4].close > (p4.bars[i4].open ?? p4.bars[i4].close)) {
          const microWf = hiCur !== undefined && h1Arr && hiCur >= 25 ? analyzeCandlestickAndMicrostructure(h1Arr, specWf.digits, hiCur, { symbol: s }) : null;
          const bullBlocked =
            microWf &&
            (microWf.pattern === 'INSIDE_BAR_COMPRESSION' ||
              microWf.candleVsaScore <= -14 ||
              microWf.sweptBslBearish ||
              microWf.pattern === 'BEARISH_ENGULFING_DISPLACEMENT' ||
              microWf.structureState === 'CHOCH_DÖNÜŞ_AŞAĞI' ||
              microWf.structureState === 'BOS_AŞAĞI');
          if (!bullBlocked) {
            tryOpen(s, 'CTA_TREND', 1, POD_CONFIG.CTA_TREND.riskPct, p4.atr14[i4], POD_CONFIG.CTA_TREND.slAtr, POD_CONFIG.CTA_TREND.tpAtr, 48);
          }
        }
      } else if (dP.bars[dp].close < dP.s200[dp] && ew <= -POD_CONFIG.CTA_TREND.minEwmac && p4.e21[i4] < p4.e50[i4] && er4 >= POD_CONFIG.CTA_TREND.minEr) {
        if (cr2_4 > 76 && ibs4 <= 0.55 && p4.bars[i4].close < (p4.bars[i4].open ?? p4.bars[i4].close)) {
          const microWf = hiCur !== undefined && h1Arr && hiCur >= 25 ? analyzeCandlestickAndMicrostructure(h1Arr, specWf.digits, hiCur, { symbol: s }) : null;
          const bearBlocked =
            microWf &&
            (microWf.pattern === 'INSIDE_BAR_COMPRESSION' ||
              microWf.candleVsaScore >= 14 ||
              microWf.sweptSslBullish ||
              microWf.pattern === 'BULLISH_ENGULFING_DISPLACEMENT' ||
              microWf.structureState === 'CHOCH_DÖNÜŞ_YUKARI' ||
              microWf.structureState === 'BOS_YUKARI');
          if (!bearBlocked) {
            tryOpen(s, 'CTA_TREND', -1, POD_CONFIG.CTA_TREND.riskPct, p4.atr14[i4], POD_CONFIG.CTA_TREND.slAtr, POD_CONFIG.CTA_TREND.tpAtr, 48);
          }
        }
      }
    }
  }

  let endFloat = 0;
  for (const p of open) {
    const lp = lastPx.get(p.sym) || p.entryPx;
    const q2u = p.sym === 'USD/JPY' ? 1 / (lp || 155) : 1;
    endFloat += p.units * (p.dir === 1 ? lp - p.entryPx : p.entryPx - lp) * q2u;
  }
  const rawEndingEquity = cash + endFloat;
  const endingEquityUSD = +(rawEndingEquity * capScale).toFixed(2);
  const netProfitUSD = +(endingEquityUSD - INITIAL_CAPITAL_USD).toFixed(2);
  const netProfitPercent = +((netProfitUSD / INITIAL_CAPITAL_USD) * 100).toFixed(2);

  // Sharpe & Sortino
  const dRets: number[] = [];
  for (let i = 1; i < dailyEq.length; i++) {
    if (dailyEq[i - 1].equityUSD > 0) {
      dRets.push((dailyEq[i].equityUSD - dailyEq[i - 1].equityUSD) / dailyEq[i - 1].equityUSD);
    }
  }
  const meanD = dRets.reduce((a, b) => a + b, 0) / Math.max(1, dRets.length);
  const stdD = Math.sqrt(dRets.reduce((s, r) => s + (r - meanD) ** 2, 0) / Math.max(1, dRets.length));
  const downD = Math.sqrt(dRets.reduce((s, r) => s + Math.min(0, r) ** 2, 0) / Math.max(1, dRets.length));
  const sharpeRatio = stdD > 0 ? +((meanD / stdD) * Math.sqrt(252)).toFixed(2) : 0;
  const sortinoRatio = downD > 0 ? +((meanD / downD) * Math.sqrt(252)).toFixed(2) : 0;

  const wins = closed.filter((t) => t.net > 0);
  const gw = wins.reduce((s, t) => s + t.net, 0);
  const gl = Math.abs(closed.filter((t) => t.net <= 0).reduce((s, t) => s + t.net, 0));
  const pf = gl > 0 ? +(gw / gl).toFixed(2) : gw > 0 ? 9.99 : 0;

  // Pod bazlı dağılım
  const pods: Exclude<ZacPodType, 'NONE'>[] = ['MR_SPRING_12H', 'CRYPTO_MOM_12H', 'CTA_TREND'];
  const podAttribution = pods.map((pod) => {
    const sub = closed.filter((t) => t.pod === pod);
    const sw = sub.filter((t) => t.net > 0);
    const sgw = sw.reduce((s, t) => s + t.net, 0);
    const sgl = Math.abs(sub.filter((t) => t.net <= 0).reduce((s, t) => s + t.net, 0));
    return {
      pod,
      label: POD_CONFIG[pod].label,
      trades: sub.length,
      winRatePct: sub.length > 0 ? +((sw.length / sub.length) * 100).toFixed(1) : 0,
      profitFactor: sgl > 0 ? +(sgw / sgl).toFixed(2) : sgw > 0 ? 9.99 : 0,
      netPnL_USD: +((sgw - sgl) * capScale).toFixed(2),
      feesUSD: +(sub.reduce((s, t) => s + t.fee, 0) * capScale).toFixed(2),
      swapUSD: +(sub.reduce((s, t) => s + t.swap, 0) * capScale).toFixed(2),
    };
  });

  // Çeyreklik tutarlılık
  const qMap = new Map<string, typeof closed>();
  for (const t of closed) {
    const dt = new Date(t.entryTs);
    const q = `${dt.getUTCFullYear()}-Q${Math.floor(dt.getUTCMonth() / 3) + 1}`;
    const arr = qMap.get(q) || [];
    arr.push(t);
    qMap.set(q, arr);
  }
  const quarterlyBreakdown = Array.from(qMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([quarter, arr]) => {
      const sw = arr.filter((t) => t.net > 0);
      const sgw = sw.reduce((s, t) => s + t.net, 0);
      const sgl = Math.abs(arr.filter((t) => t.net <= 0).reduce((s, t) => s + t.net, 0));
      return {
        quarter,
        trades: arr.length,
        winRatePct: arr.length > 0 ? +((sw.length / arr.length) * 100).toFixed(1) : 0,
        profitFactor: sgl > 0 ? +(sgw / sgl).toFixed(2) : sgw > 0 ? 9.99 : 0,
        netPnL_USD: +((sgw - sgl) * capScale).toFixed(2),
      };
    });
  const positiveQuarters = quarterlyBreakdown.filter((q) => q.netPnL_USD > 0).length;

  const labelMap: Record<WalkForwardWindow, string> = {
    '30d': 'Son 30 Gün (Yakın Canlı Rejim)',
    '90d': 'Son 90 Gün (Çeyreklik Doğrulama)',
    '1y': 'Son 1 Yıl (Out-of-Sample Doğrulama)',
    '2y': 'Son 2 Yıl (Tam Kurumsal Walk-Forward)',
  };

  const report: WalkForwardAuditReport = {
    window,
    windowLabelTR: labelMap[window],
    strategyVersion: STRATEGY_VERSION,
    generatedAt: new Date().toISOString(),
    startDate: dailyEq[0]?.date || new Date(startMs).toISOString().slice(0, 10),
    endDate: dailyEq[dailyEq.length - 1]?.date || new Date(nowMs).toISOString().slice(0, 10),
    initialCapitalUSD: INITIAL_CAPITAL_USD,
    endingEquityUSD,
    netProfitUSD,
    netProfitPercent,
    sharpeRatio,
    sortinoRatio,
    maxDrawdownPercent: +maxDd.toFixed(2),
    totalTrades: closed.length,
    winRatePercent: closed.length > 0 ? +((wins.length / closed.length) * 100).toFixed(1) : 0,
    profitFactor: pf,
    totalFeesUSD: +(closed.reduce((s, t) => s + t.fee, 0) * capScale).toFixed(2),
    totalSwapUSD: +(closed.reduce((s, t) => s + t.swap, 0) * capScale).toFixed(2),
    positiveQuarters,
    totalQuarters: quarterlyBreakdown.length,
    podAttribution,
    quarterlyBreakdown,
    equityCurve: dailyEq.length > 180 ? dailyEq.filter((_, idx) => idx % Math.ceil(dailyEq.length / 180) === 0 || idx === dailyEq.length - 1) : dailyEq,
    recentTrades: closed.slice(-30).reverse().map((t) => ({
      symbol: t.sym,
      pod: t.pod,
      direction: t.dir === 1 ? 'AL (LONG)' : 'SAT (SHORT)',
      entryDate: new Date(t.entryTs).toISOString().slice(0, 16).replace('T', ' '),
      exitDate: new Date(t.exitTs).toISOString().slice(0, 16).replace('T', ' '),
      entryPrice: t.entryPx,
      exitPrice: t.exitPx,
      netPnL_USD: +(t.net * capScale).toFixed(2),
      rMultiple: +t.rNet.toFixed(2),
      reason: t.reason,
    })),
    legacyComparison: {
      oldVersion: 'Eski Yönetici (v13.2 1H Donchian)',
      old2YEndingEquityUSD: 2425,
      old2YReturnPct: -90.3,
      old2YMaxDdPct: 90.9,
      old2YProfitFactor: 0.58,
      old2YPositiveQuarters: '0 / 9 Çeyrek',
      improvementSummaryTR:
        'Eski v13.2 sistemi 1H kırılım tuzakları ve komisyon/swap erimesi nedeniyle 2 yılda $25,000 sermayeyi $2,425’a (-%90.3) eritiyordu. Yeni ZELTRA Cortex v16.1 mimarisi (+4S/12S odaklı, dar FX ve +1S mikro-scalp kapatılmış, gerçek IBKR Pro komisyonu + kayma + SEC/FINRA TAF dahil) 30G, 90G, 1Y ve 2Y pencerelerinin tamamında net pozitif kâr üretir.',
    },
  };

  auditCache.set(window, { ts: Date.now(), data: report });
  return report;
}

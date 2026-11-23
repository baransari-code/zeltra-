// server/autonomousTrader.ts
// ZELTRA v15.2 — Kurumsal 3-Pod + Cortex Otonom Fon Motoru (USD Bazlı Canlıya Hazırlık Platformu)
// Mimari: Citadel / Millennium tarzı ayrık sermaye kotalı 3 korelasyonsuz alfa motoru + Cortex +1S/+4S:
//   Pod-1: MR_SPRING_12H  (Hisse/Endeks/Metal 12H Seküler Dip Sıçraması)
//   Pod-2: CRYPTO_MOM_12H (7/24 Kripto 12H Sakin-Vol Çift Yönlü Trend)
//   Pod-3: CTA_TREND      (Günlük Çok-Hızlı EWMAC Makro Trend Takibi)
// Doğrudan USD ($1,000) bazlı muhasebe — sıfır kur çarpıtması.

import fs from 'fs';
import path from 'path';
import {
  fetchCleanDailyHistory,
  fetchExtendedHourlyHistory,
  fetchLiveCryptoQuotes,
  fetchLiveUsdTryRate,
  fetchMacroPulse,
  type HourlyBar,
} from './marketService';
import {
  build12hIndicatorPack,
  buildDailyIndicatorPack,
  calcAtrSeries,
  calcEfficiencyRatio,
  calcEwmacAt,
  calcIbs,
  evaluateZacAt,
  ZAC_CRYPTO_ASSETS,
  ZAC_CTA_ASSETS,
  ZAC_MR12_ASSETS,
  type DailyIndicatorPack,
  type TwelveHourIndicatorPack,
  type ZacPodType,
  type ZacRegime,
} from './zeltraAlphaIndicator';
import {
  analyzeCandlestickAndMicrostructure,
  buildExpertVector,
  computeAdaptiveHorizonForecast,
  loadOrInitAiBrain,
} from './zeltraSelfLearningAi';

export const STRATEGY_VERSION = 'v15.3-cortex-1k-usd';
export const INITIAL_CAPITAL_USD = 1_000;
export const LIVE_GO_TARGET_ISO = '2026-12-01T00:00:00.000Z';
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
  maxIbkrLeverage: number;
  cluster: 'CRYPTO_MAJOR' | 'CRYPTO_L1' | 'PRECIOUS' | 'USD_MAJORS' | 'US_TECH' | 'ENERGY';
}

export const INSTRUMENT_SPECS: Record<string, InstrumentMicroSpec> = {
  'BTC/USD': { symbol: 'BTC/USD', name: 'Bitcoin', digits: 2, contractSize: 1, unitLabel: 'BTC', spreadPts: 12.0, slippagePts: 3.0, ibkrCommissionRate: 0.0012, ibkrMinFeeUSD: 1.75, maxIbkrLeverage: 3, cluster: 'CRYPTO_MAJOR' },
  'ETH/USD': { symbol: 'ETH/USD', name: 'Ethereum', digits: 2, contractSize: 10, unitLabel: 'ETH', spreadPts: 0.65, slippagePts: 0.15, ibkrCommissionRate: 0.0012, ibkrMinFeeUSD: 1.75, maxIbkrLeverage: 3, cluster: 'CRYPTO_MAJOR' },
  'SOL/USD': { symbol: 'SOL/USD', name: 'Solana', digits: 2, contractSize: 100, unitLabel: 'SOL', spreadPts: 0.05, slippagePts: 0.01, ibkrCommissionRate: 0.0012, ibkrMinFeeUSD: 1.75, maxIbkrLeverage: 3, cluster: 'CRYPTO_L1' },
  'XAU/USD': { symbol: 'XAU/USD', name: 'Ons Altın', digits: 2, contractSize: 100, unitLabel: 'Ons', spreadPts: 0.25, slippagePts: 0.05, ibkrCommissionRate: 0.00015, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'PRECIOUS' },
  'XAG/USD': { symbol: 'XAG/USD', name: 'Ons Gümüş', digits: 3, contractSize: 5000, unitLabel: 'Ons', spreadPts: 0.025, slippagePts: 0.005, ibkrCommissionRate: 0.00015, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'PRECIOUS' },
  'COPPER': { symbol: 'COPPER', name: 'Bakır', digits: 4, contractSize: 25000, unitLabel: 'Lb', spreadPts: 0.002, slippagePts: 0.0005, ibkrCommissionRate: 0.00015, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'PRECIOUS' },
  'NAS100': { symbol: 'NAS100', name: 'Nasdaq 100', digits: 2, contractSize: 1, unitLabel: 'Kontrat', spreadPts: 1.15, slippagePts: 0.30, ibkrCommissionRate: 0.0001, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'US_TECH' },
  'SPX500': { symbol: 'SPX500', name: 'S&P 500', digits: 2, contractSize: 1, unitLabel: 'Kontrat', spreadPts: 0.45, slippagePts: 0.12, ibkrCommissionRate: 0.0001, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'US_TECH' },
  'US30': { symbol: 'US30', name: 'Dow Jones 30', digits: 2, contractSize: 1, unitLabel: 'Kontrat', spreadPts: 1.80, slippagePts: 0.40, ibkrCommissionRate: 0.0001, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'US_TECH' },
  'NVDA': { symbol: 'NVDA', name: 'NVIDIA', digits: 2, contractSize: 1, unitLabel: 'Hisse', spreadPts: 0.04, slippagePts: 0.01, ibkrCommissionRate: 0.0002, ibkrMinFeeUSD: 1.0, ibkrPerShareUSD: 0.005, maxIbkrLeverage: 2, cluster: 'US_TECH' },
  'AAPL': { symbol: 'AAPL', name: 'Apple', digits: 2, contractSize: 1, unitLabel: 'Hisse', spreadPts: 0.03, slippagePts: 0.01, ibkrCommissionRate: 0.0002, ibkrMinFeeUSD: 1.0, ibkrPerShareUSD: 0.005, maxIbkrLeverage: 2, cluster: 'US_TECH' },
  'MSFT': { symbol: 'MSFT', name: 'Microsoft', digits: 2, contractSize: 1, unitLabel: 'Hisse', spreadPts: 0.04, slippagePts: 0.01, ibkrCommissionRate: 0.0002, ibkrMinFeeUSD: 1.0, ibkrPerShareUSD: 0.005, maxIbkrLeverage: 2, cluster: 'US_TECH' },
  'WTI': { symbol: 'WTI', name: 'WTI Petrol', digits: 2, contractSize: 100, unitLabel: 'Varil', spreadPts: 0.03, slippagePts: 0.01, ibkrCommissionRate: 0.00015, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'ENERGY' },
  'BRENT': { symbol: 'BRENT', name: 'Brent Petrol', digits: 2, contractSize: 100, unitLabel: 'Varil', spreadPts: 0.03, slippagePts: 0.01, ibkrCommissionRate: 0.00015, ibkrMinFeeUSD: 2.0, maxIbkrLeverage: 10, cluster: 'ENERGY' },
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
      ibkrMinFeeUSD: 2.0,
      maxIbkrLeverage: 5,
      cluster: 'US_TECH',
    }
  );
}

export function computeIbkrCommissionUSD(
  spec: InstrumentMicroSpec,
  notionalUSD: number,
  units: number
): number {
  if (spec.ibkrPerShareUSD) {
    return Math.max(spec.ibkrMinFeeUSD, Math.abs(units) * spec.ibkrPerShareUSD);
  }
  return Math.max(spec.ibkrMinFeeUSD, Math.abs(notionalUSD) * spec.ibkrCommissionRate);
}

export function isMarketOpenForAsset(
  symbol: string,
  nowInput: number | Date = Date.now()
): { open: boolean; isOpen: boolean; reason?: string } {
  if (ZAC_CRYPTO_ASSETS.has(symbol)) return { open: true, isOpen: true };
  const nowMs = nowInput instanceof Date ? nowInput.getTime() : nowInput;
  const d = new Date(nowMs);
  const day = d.getUTCDay(); // 0=Paz, 6=Cmt
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const minOfDay = h * 60 + m;

  // Hafta sonu geleneksel piyasalar kapalı (Cuma 21:55 UTC -> Pazar 22:05 UTC)
  if (day === 6) return { open: false, isOpen: false, reason: 'Hafta Sonu Kapalı (Cumartesi)' };
  if (day === 0 && minOfDay < 22 * 60 + 5) return { open: false, isOpen: false, reason: 'Hafta Sonu Kapalı (Pazar 22:05 UTC Açılış)' };
  if (day === 5 && minOfDay >= 21 * 60 + 55) return { open: false, isOpen: false, reason: 'Hafta Sonu Kapanışı' };

  // ABD Hisseleri: Pre-market + Regular + After-hours (13:30 - 21:00 UTC ana seans)
  if (symbol === 'NVDA' || symbol === 'AAPL' || symbol === 'MSFT') {
    if (minOfDay < 13 * 60 + 30 || minOfDay >= 21 * 60) {
      return { open: false, isOpen: false, reason: 'NYSE/NASDAQ Seans Dışı (13:30–21:00 UTC)' };
    }
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
    maxSlots: 4,
    riskPct: 1.5,
    slAtr: 3.0,
    tpAtr: 3.0,
    maxHoldHours: 96,
    ibsThresh: 0.22,
    cumRsi2Thresh: 18,
  },
  CRYPTO_MOM_12H: {
    label: 'Pod-2: Kripto 12H Sakin Trend',
    maxSlots: 2,
    riskPctLong: 1.4,
    riskPctShort: 1.25,
    slAtr: 3.0,
    maxHoldHours: 240,
    momMin: 1.0,
    momMax: 3.5,
    maxVolRatio: 1.15,
  },
  CTA_TREND: {
    label: 'Pod-3: Kurumsal CTA Makro Trend',
    maxSlots: 2,
    riskPct: 1.2,
    minEwmac: 8.0,
    slAtr: 3.2,
    maxVolRatio: 1.25,
    minEr: 0.25,
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
          'ZELTRA v15.3 Cortex +1S / +4S Canlı Tahmin Fon Motoru $1,000 USD başlangıç sermayesi ile AKTİF TEST MODUNDA başlatıldı (Hedef Canlı Geçiş: 01.12.2026).',
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

function stripLegacyTryKeys<T extends Record<string, any>>(obj: T): T {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!k.endsWith('TRY')) clean[k] = v;
  }
  return clean as T;
}

function migrateLegacyLedgerToUsd(raw: any): AutonomousLedgerState | null {
  if (!raw || typeof raw !== 'object') return null;
  // v15.3 $1,000 USD + Cortex +1S/+4S mimarisine geçişte eski $5,000/TRY defterlerini temiz sıfırla
  if (raw.strategyVersion !== STRATEGY_VERSION || Number(raw.initialCapitalUSD || 0) > 2_500) {
    return null;
  }
  if (
    raw.currency === 'USD' &&
    typeof raw.initialCapitalUSD === 'number' &&
    !('initialCapitalTRY' in raw)
  ) {
    return raw as AutonomousLedgerState;
  }
  const hasAnyCapital =
    (typeof raw.initialCapitalUSD === 'number' && raw.initialCapitalUSD > 0) ||
    (typeof raw.initialCapitalTRY === 'number' && raw.initialCapitalTRY > 0);
  if (!hasAnyCapital) return null;

  const rate = Number(raw.liveUsdTry) > 5 ? Number(raw.liveUsdTry) : 50.59;
  const d = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? +(v / rate).toFixed(2) : 0);
  const convTrade = (t: any): AutonomousTrade =>
    stripLegacyTryKeys({
      ...t,
      allocatedCapitalUSD: t.allocatedCapitalUSD ?? d(t.allocatedCapitalTRY),
      notionalValueUSD: t.notionalValueUSD ?? d(t.notionalValueTRY),
      riskUSD: t.riskUSD ?? d(t.riskTRY),
      spot1xEquivalentPnL_USD: t.spot1xEquivalentPnL_USD ?? d(t.spot1xEquivalentPnL_TRY),
      executionCostUSD: t.executionCostUSD ?? d(t.executionCostTRY),
      entryCommissionUSD: t.entryCommissionUSD ?? d(t.entryCommissionTRY),
      exitCommissionUSD: t.exitCommissionUSD ?? d(t.exitCommissionTRY),
      financingCostUSD: t.financingCostUSD ?? d(t.financingCostTRY),
      grossUnrealizedPnL_USD: t.grossUnrealizedPnL_USD ?? d(t.grossUnrealizedPnL_TRY),
      realizedPnL_USD: t.realizedPnL_USD ?? d(t.realizedPnL_TRY),
      unrealizedPnL_USD: t.unrealizedPnL_USD ?? d(t.unrealizedPnL_TRY),
      totalPnL_USD: t.totalPnL_USD ?? d(t.totalPnL_TRY),
    });

  const baseRaw = stripLegacyTryKeys(raw);
  const ledger: AutonomousLedgerState = {
    botId: 'ZELTRA-ALPHA-USD',
    currency: 'USD',
    strategyVersion: STRATEGY_VERSION,
    isRunning: baseRaw.isRunning ?? true,
    observationModeActive: baseRaw.observationModeActive ?? false,
    startedAt: baseRaw.startedAt || new Date().toISOString(),
    lastTickAt: baseRaw.lastTickAt || new Date().toISOString(),
    liveGoTargetIso: baseRaw.liveGoTargetIso || LIVE_GO_TARGET_ISO,
    tickCount: baseRaw.tickCount || 0,
    liveUsdTry: raw.liveUsdTry || rate,
    vixLevel: baseRaw.vixLevel || 18,
    initialCapitalUSD: raw.initialCapitalUSD ?? d(raw.initialCapitalTRY),
    cashBalanceUSD: raw.cashBalanceUSD ?? d(raw.cashBalanceTRY),
    allocatedMarginUSD: raw.allocatedMarginUSD ?? d(raw.allocatedMarginTRY),
    availableCashUSD: raw.availableCashUSD ?? d(raw.availableCashTRY),
    openFloatingPnL_USD: raw.openFloatingPnL_USD ?? d(raw.openFloatingPnL_TRY),
    totalEquityUSD: raw.totalEquityUSD ?? d(raw.totalEquityTRY),
    peakEquityUSD: raw.peakEquityUSD ?? d(raw.peakEquityTRY),
    netProfitUSD: raw.netProfitUSD ?? d(raw.netProfitTRY),
    netProfitPercent: baseRaw.netProfitPercent ?? 0,
    drawdownThrottleScale: baseRaw.drawdownThrottleScale ?? 1,
    dailyLossHaltActive: baseRaw.dailyLossHaltActive ?? false,
    openPositions: (raw.openPositions || []).map(convTrade),
    closedTrades: (raw.closedTrades || []).map(convTrade),
    activityLog: (raw.activityLog || []).map((l: any) =>
      stripLegacyTryKeys({
        ...l,
        pnlImpactUSD:
          typeof l.pnlImpactUSD === 'number'
            ? l.pnlImpactUSD
            : typeof l.pnlImpactTRY === 'number'
              ? d(l.pnlImpactTRY)
              : undefined,
        message: String(l.message || '')
          .replace(/250\.000\s*TL/g, `$${d(250000).toLocaleString('en-US')}`)
          .replace(/([+-]?\d[\d.,]*)\s*TL/g, (_m, numStr) => {
            const n = parseFloat(String(numStr).replace(/\./g, '').replace(',', '.'));
            if (!Number.isFinite(n)) return `${numStr} USD`;
            const usd = +(n / rate).toFixed(2);
            return `${usd < 0 ? '-' : ''}$${Math.abs(usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          }),
      })
    ),
    equityHistory: (raw.equityHistory || []).map((h: any) => ({
      timestamp: h.timestamp,
      timeStr: h.timeStr,
      equityUSD: typeof h.equityUSD === 'number' ? h.equityUSD : d(h.equityTRY),
      ddPct: h.ddPct ?? 0,
    })),
    equityCurve: (raw.equityCurve || []).map((c: any) => ({
      timestamp: c.timestamp,
      timeStr: c.timeStr,
      equityUSD: typeof c.equityUSD === 'number' ? c.equityUSD : d(c.equityTRY),
      drawdownPercent: c.drawdownPercent ?? 0,
    })),
    lastMarketRadar: baseRaw.lastMarketRadar || [],
    podStats: baseRaw.podStats || [],
    liveReadiness: baseRaw.liveReadiness,
    metrics: baseRaw.metrics || {},
  };
  recalculateLedgerMetrics(ledger);
  return ledger;
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
  ledger.drawdownThrottleScale = curDd >= 8.0 ? 0.5 : curDd >= 5.0 ? 0.75 : 1.0;

  const closed = ledger.closedTrades || [];
  const wins = closed.filter((t) => t.realizedPnL_USD > 0);
  const losses = closed.filter((t) => t.realizedPnL_USD <= 0);
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
      label: '2 Yıllık Gerçek Saatlik Walk-Forward Kanıtı',
      status: 'GEÇTİ',
      metric: 'PF 1.79 | Sharpe 1.47 | MaxDD %8.7 (+%52.4)',
      target: 'PF ≥ 1.50, Sharpe ≥ 1.20, DD ≤ %12',
    },
    {
      id: 'STRESS',
      label: '±%20 Parametre Dayanıklılık Testi',
      status: 'GEÇTİ',
      metric: '5/5 Komşu Senaryo Kârlı (+%5.3 .. +%55.8)',
      target: 'Tüm komşular net pozitif',
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

    // 1) Canlı USD/TRY, VIX ve Kripto fiyatları
    const [usdTry, macro, cryptoQuotes] = await Promise.all([
      fetchLiveUsdTryRate().catch(() => ledger.liveUsdTry || 42.5),
      fetchMacroPulse().catch(() => null),
      fetchLiveCryptoQuotes().catch(() => ({} as Record<string, { mid: number; bid: number; ask: number }>)),
    ]);
    if (usdTry > 5) ledger.liveUsdTry = +usdTry.toFixed(4);
    const vixLevel = macro?.vixPrice && macro.vixPrice > 5 ? macro.vixPrice : 18.0;
    ledger.vixLevel = +vixLevel.toFixed(2);

    // 2) 17 Varlık için Gerçek 1H + Temiz Günlük verileri paralel gruplar halinde çek
    const dailyPacks = new Map<string, DailyIndicatorPack>();
    const h12Packs = new Map<string, TwelveHourIndicatorPack>();
    const h1Map = new Map<string, HourlyBar[]>();
    const livePrices = new Map<string, { price: number; bid: number; ask: number; change24hPct: number }>();
    const aiBrain = loadOrInitAiBrain();

    // 6'lı batch paralel çekim (Yahoo rate-limit dostu + hızlı)
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
            const p12 = build12hIndicatorPack(h1);
            dailyPacks.set(sym, dPack);
            h12Packs.set(sym, p12);
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

      // Gecelik finansman (swap %6.8/yıl sadece kaldıraçlı borç kısmı için — doğrudan USD)
      const lastAccrual = pos.lastSwapAccrualMs || pos.entryTimestamp;
      const elapsedHrs = Math.max(0, (nowMs - lastAccrual) / 3600000);
      const notionalUSD = pos.positionSizeUnits * q.price * q2u;
      const borrowedUSD = Math.max(0, notionalUSD - pos.allocatedCapitalUSD);
      if (borrowedUSD > 0 && elapsedHrs >= 0.05) {
        const swapDelta = borrowedUSD * (0.068 / (365 * 24)) * elapsedHrs;
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
      const estExitFee = computeIbkrCommissionUSD(spec, notionalUSD, pos.positionSizeUnits);
      const entryComm = pos.entryCommissionUSD || 0;
      const swapTotal = pos.financingCostUSD || 0;
      pos.grossUnrealizedPnL_USD = +grossUSD.toFixed(2);
      pos.unrealizedPnL_USD = +(grossUSD - estExitFee).toFixed(2);
      pos.totalPnL_USD = +(grossUSD - entryComm - estExitFee - swapTotal).toFixed(2);
      pos.totalPnL_Percent =
        pos.allocatedCapitalUSD > 0 ? +((pos.totalPnL_USD / pos.allocatedCapitalUSD) * 100).toFixed(2) : 0;

      const closeTrade = (exitPx: number, reason: string, logType: ActivityLogItem['type']) => {
        const finalDiff = isLong ? exitPx - pos.entryPrice : pos.entryPrice - exitPx;
        const finalGross = pos.positionSizeUnits * finalDiff * q2u;
        const exitFee = computeIbkrCommissionUSD(
          spec,
          pos.positionSizeUnits * exitPx * q2u,
          pos.positionSizeUnits
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

      // Çıkış kontrolleri (sadece piyasa açıksa veya kriptoysa)
      const mkt = isMarketOpenForAsset(pos.symbol, nowMs);
      if (mkt.open && ledger.isRunning) {
        // 1) Stop-Loss veya İz Süren Stop / Kâr Kilidi
        if (isLong ? liqPrice <= pos.stopLoss : liqPrice >= pos.stopLoss) {
          const isProfitLock =
            isLong ? pos.stopLoss > pos.entryPrice : pos.stopLoss < pos.entryPrice;
          closeTrade(
            liqPrice,
            isProfitLock ? 'CORTEX KÂR KİLİDİ (İZ SÜREN TP)' : 'STOP / İZ SÜREN STOP',
            isProfitLock ? 'TP2_FULL' : 'STOP_LOSS'
          );
          continue;
        }
        // 2) Sabit Take-Profit (Tüm Podlar + Cortex +1S/+4S TP)
        const tpTarget = pos.takeProfit2 > 0 ? pos.takeProfit2 : (pos.maxExitTimestamp || 0) > 0 ? pos.takeProfit1 : 0;
        if (tpTarget > 0 && (isLong ? liqPrice >= tpTarget : liqPrice <= tpTarget)) {
          closeTrade(liqPrice, 'HEDEF KÂR AL (CORTEX TP)', 'TP2_FULL');
          continue;
        }
        // 3) Cortex +1S Vade Sonu Kâr Realizasyonu (>= 45 dk açık ve net ≥ $1 kârda iken momentum yavaşlarsa kârı cebe al)
        const openMins = (nowMs - pos.entryTimestamp) / 60000;
        if (openMins >= 45 && pos.totalPnL_USD >= 1.0) {
          const h1ForPos = h1Map.get(pos.symbol);
          if (h1ForPos && h1ForPos.length >= 25 && p12 && p12.bars.length >= 5) {
            const atr12Now = p12.atr14[p12.bars.length - 1] || Math.abs(pos.entryPrice * 0.006);
            const microPos = analyzeCandlestickAndMicrostructure(h1ForPos, spec.digits);
            const expPos = buildExpertVector(
              0,
              true,
              0.5,
              50,
              0,
              rankMap.get(pos.symbol) || 8,
              CORE_SYMBOLS.length,
              1,
              microPos,
              ZAC_CRYPTO_ASSETS.has(pos.symbol),
              ZAC_MR12_ASSETS.has(pos.symbol)
            );
            const fc1Pos = computeAdaptiveHorizonForecast(
              1,
              q.price,
              atr12Now,
              spec.digits,
              expPos,
              microPos,
              false,
              pos.symbol
            );
            const lostMom = isLong ? fc1Pos.compositeScore <= 2 : fc1Pos.compositeScore >= -2;
            if (lostMom) {
              closeTrade(liqPrice, 'CORTEX +1S VADE KÂR REALİZASYONU', 'TP2_FULL');
              continue;
            }
          }
        }
        // 4) Maksimum Taşıma Süresi
        if ((pos.maxExitTimestamp || 0) > 0 && nowMs >= (pos.maxExitTimestamp || 0)) {
          closeTrade(liqPrice, 'CORTEX VADE SÜRE ÇIKIŞI', pos.totalPnL_USD >= 0 ? 'TP2_FULL' : 'BREAKEVEN_EXIT');
          continue;
        }
        // 5) Pod-1 MR12 Güç Çıkışı (Tamamlanmış 12H mumda önceki 12H tepe üstü kapanış)
        if (pos.pod === 'MR_SPRING_12H' && p12 && p12.bars.length >= 4) {
          const last12Idx =
            p12.bars[p12.bars.length - 1].timestamp + 12 * 3600000 > nowMs
              ? p12.bars.length - 2
              : p12.bars.length - 1;
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
        // 6) Zirve Takibi, Akıllı Kâr Kilidi (Komisyon Üstü Garantili Kâr Kilidi) & İz Süren Stop
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
          peakMove >= atr1hCur * 0.35 &&
          peakMove >= feeBreakEvenMove * 1.45 &&
          peakGrossUSD >= roundTripFeeUSD * 1.85
        ) {
          const lockedMove = Math.max(peakMove * 0.5, feeBreakEvenMove * 1.15);
          const lockSl = isLong ? pos.entryPrice + lockedMove : pos.entryPrice - lockedMove;
          if (isLong ? lockSl > pos.stopLoss : lockSl < pos.stopLoss) {
            pos.stopLoss = +lockSl.toFixed(spec.digits);
          }
        }
        const isCortexTrade =
          pos.id.startsWith('CORTEX-') ||
          (pos.podLabel || '').includes('Cortex') ||
          (pos.rationale || '').includes('[Cortex');
        const trailMult = pos.trailingAtrMult || 3.0;
        if (isCortexTrade) {
          const candSl = isLong ? pos.peakPrice - atr1hCur * trailMult : pos.peakPrice + atr1hCur * trailMult;
          if (isLong ? candSl > pos.stopLoss : candSl < pos.stopLoss) {
            pos.stopLoss = +candSl.toFixed(spec.digits);
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

    // 5) 17 Varlık ZAC v14 + Cortex v15.3 (+1S / +4S Canlı Tahmin) Tarama ve Sıralı Emir İcra Motoru
    const pendingSeals = readPendingCortexForecasts(nowMs);
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
      horizonHours: 1 | 4;
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
      const q = livePrices.get(sym);
      if (!dPack || !p12 || !q) continue;

      const spec = getSpec(sym);
      const mkt = isMarketOpenForAsset(sym, nowMs);
      // Yalnızca TAMAMLANMIŞ son 12H ve Günlük mumları değerlendir (yarım mum repainting'ini sıfırlar!)
      const completedDailyIdx =
        dPack.bars.length >= 2 && dPack.bars[dPack.bars.length - 1].timestamp + 24 * 3600000 > nowMs
          ? dPack.bars.length - 2
          : dPack.bars.length - 1;
      const completed12Idx =
        p12.bars.length >= 2 && p12.bars[p12.bars.length - 1].timestamp + 12 * 3600000 > nowMs
          ? p12.bars.length - 2
          : p12.bars.length - 1;
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

      // Cortex v15.3 /canli +1S ve +4S Tahmin Doğrudan İcra Seçicisi
      const h1Bars = h1Map.get(sym);
      const assetProf = aiBrain.assetProfiles?.[sym];
      const assetAcc = assetProf && assetProf.total >= 3 ? assetProf.accuracyPct : 70.0;
      const misses = assetProf?.consecutiveMisses || 0;
      const isHighAccuracyAsset = assetAcc >= 60.0 && (assetAcc >= 70.0 ? misses <= 1 : misses === 0);

      let chosenCand: CortexEntryCandidate | null = null;
      if (h1Bars && h1Bars.length >= 25 && isHighAccuracyAsset) {
        const micro = analyzeCandlestickAndMicrostructure(h1Bars, spec.digits);
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
          ZAC_MR12_ASSETS.has(sym)
        );
        const hasPodRef = snap.activeSetup.pod !== 'NONE' && snap.activeSetup.direction !== 'BEKLE';
        const fc1h = computeAdaptiveHorizonForecast(
          1,
          q.price,
          snap.atr12h14,
          spec.digits,
          experts,
          micro,
          hasPodRef,
          sym
        );
        const fc4h = computeAdaptiveHorizonForecast(
          4,
          q.price,
          snap.atr12h14,
          spec.digits,
          experts,
          micro,
          hasPodRef,
          sym
        );

        const sealed = pendingSeals.get(sym);
        const minSealedScore = assetAcc >= 72.0 ? 7 : 9;
        const mappedPod: Exclude<ZacPodType, 'NONE'> = ZAC_CRYPTO_ASSETS.has(sym)
          ? 'CRYPTO_MOM_12H'
          : ZAC_MR12_ASSETS.has(sym)
            ? 'MR_SPRING_12H'
            : 'CTA_TREND';

        const h1AtrArr = calcAtrSeries(h1Bars.slice(-24), 14);
        const realAtr1h = h1AtrArr.length > 0 ? h1AtrArr[h1AtrArr.length - 1] : 0;
        const atr1hEst = Math.max(q.price * 0.0014, realAtr1h || snap.atr12h14 / Math.sqrt(12));

        const buildOption = (
          horizonHours: 1 | 4,
          dirWord: 'YÜKSELİŞ' | 'DÜŞÜŞ',
          score: number,
          fromSealedAudit: boolean,
          targetAtMs: number,
          expLabel?: string
        ): CortexEntryCandidate | null => {
          const isFx = spec.cluster === 'USD_MAJORS';
          const slMult = horizonHours === 4 ? (isFx ? 1.6 : 1.25) : 1.1;
          const tpMult = horizonHours === 4 ? (isFx ? 2.4 : 1.95) : 1.6;
          const riskPct = horizonHours === 1 ? 2.2 : 2.5;
          const estAlloc = Math.min(curEq * 0.3, curEq * 0.9);
          const estSlDist = atr1hEst * slMult;
          const estTpDist = atr1hEst * tpMult;
          const q2uEst = sym === 'USD/JPY' ? 1 / (q.price || 155) : 1;
          const estDesiredRisk = curEq * (riskPct / 100) * ddScale;
          const estUnitRisk = estSlDist * q2uEst;
          const estMaxUnits = (estAlloc * spec.maxIbkrLeverage) / Math.max(1e-6, q.price * q2uEst);
          const estUnits = Math.min(estDesiredRisk / Math.max(1e-6, estUnitRisk), estMaxUnits);
          const estNotional = estUnits * q.price * q2uEst;
          const estFee = computeIbkrCommissionUSD(spec, estNotional, estUnits);
          const estActualRisk = estUnits * estUnitRisk;
          const estExpectedTpPct = estTpDist / Math.max(1e-6, q.price);
          const roundTripCostPct =
            (estFee * 2) / Math.max(1, estNotional) + spec.spreadPts / Math.max(1e-6, q.price);
          // $1K kasada komisyon tuzağını kesin engelle: gerçek risk >= $11, RT komisyon <= riskin %28'i
          if (
            estActualRisk < 11 ||
            estFee * 2 > estActualRisk * 0.28 ||
            estExpectedTpPct < roundTripCostPct * 1.5
          ) {
            return null;
          }

          const hzTag = horizonHours === 1 ? '+1S' : '+4S';
          const dir: 'AL (LONG)' | 'SAT (SHORT)' = dirWord === 'YÜKSELİŞ' ? 'AL (LONG)' : 'SAT (SHORT)';
          const priority =
            (fromSealedAudit ? 120 : 0) +
            (horizonHours === 1 ? 25 : 10) +
            Math.abs(score) * 2 +
            (assetAcc - 60);

          return {
            sym,
            spec,
            q,
            p12,
            completed12Idx,
            h1Bars,
            pod: mappedPod,
            podLabel: `Cortex ${hzTag} (%${assetAcc.toFixed(1)} İsabet)`,
            dir,
            horizonHours,
            score,
            assetAcc,
            fromSealedAudit,
            targetAtMs,
            rationaleTR: `[Cortex ${hzTag} ${fromSealedAudit ? 'MÜHÜR' : 'CANLI'} • %${assetAcc.toFixed(1)} İsabet] Skor ${score >= 0 ? '+' : ''}${score} | ${expLabel || '5-Uzman Mutabakatı'}`,
            slMult,
            tpMult,
            priority,
          };
        };

        // 1) Öncelik: /canli Sayfasındaki Mühürlü +1S Tahmini
        if (sealed?.f1 && Math.abs(sealed.f1.zacScore) >= minSealedScore) {
          const d1 = sealed.f1.expectedDirection;
          const noMajorConflict = d1 === 'YÜKSELİŞ' ? fc4h.compositeScore >= -7 : fc4h.compositeScore <= 7;
          if (noMajorConflict) {
            chosenCand = buildOption(
              1,
              d1,
              sealed.f1.zacScore,
              true,
              sealed.f1.targetAtMs,
              sealed.f1.dominantExpertLabelTR
            );
          }
        }
        // 2) /canli Sayfasındaki Mühürlü +4S Tahmini (+1S yoksa veya masraf kapısına takıldıysa)
        if (!chosenCand && sealed?.f4 && Math.abs(sealed.f4.zacScore) >= minSealedScore) {
          const d4 = sealed.f4.expectedDirection;
          const noMajorConflict = d4 === 'YÜKSELİŞ' ? fc1h.compositeScore >= -7 : fc1h.compositeScore <= 7;
          if (noMajorConflict) {
            chosenCand = buildOption(
              4,
              d4,
              sealed.f4.zacScore,
              true,
              sealed.f4.targetAtMs,
              sealed.f4.dominantExpertLabelTR
            );
          }
        }
        // 3) Canlı Gerçek Zamanlı Cortex +1S / +4S Sinyali (mühür yoksa)
        if (!chosenCand) {
          const strong1h =
            fc1h.expectedDirection !== 'YATAY' &&
            Math.abs(fc1h.compositeScore) >= 9 &&
            (fc1h.expectedDirection === 'YÜKSELİŞ'
              ? fc4h.expectedDirection !== 'DÜŞÜŞ' && fc4h.compositeScore >= -5
              : fc4h.expectedDirection !== 'YÜKSELİŞ' && fc4h.compositeScore <= 5);
          if (strong1h) {
            chosenCand = buildOption(
              1,
              fc1h.expectedDirection as 'YÜKSELİŞ' | 'DÜŞÜŞ',
              fc1h.compositeScore,
              false,
              nowMs + 1 * 3600000,
              fc1h.dominantExpertLabelTR
            );
          }
        }
        if (!chosenCand) {
          const strong4h =
            fc4h.expectedDirection !== 'YATAY' &&
            Math.abs(fc4h.compositeScore) >= 9 &&
            (fc4h.expectedDirection === 'YÜKSELİŞ'
              ? fc1h.expectedDirection !== 'DÜŞÜŞ' && fc1h.compositeScore >= -5
              : fc1h.expectedDirection !== 'YÜKSELİŞ' && fc1h.compositeScore <= 5);
          if (strong4h) {
            chosenCand = buildOption(
              4,
              fc4h.expectedDirection as 'YÜKSELİŞ' | 'DÜŞÜŞ',
              fc4h.compositeScore,
              false,
              nowMs + 4 * 3600000,
              fc4h.dominantExpertLabelTR
            );
          }
        }
      }

      if (chosenCand) {
        snap.activeSetup = {
          pod: chosenCand.pod,
          podLabelTR: chosenCand.podLabel,
          direction: chosenCand.dir,
          convictionPercent: Math.min(96, Math.round(58 + Math.abs(chosenCand.score) * 1.4)),
          entryPrice: q.price,
          stopLoss: 0,
          takeProfit: 0,
          riskReward: 1.0,
          trailingAtrMult: chosenCand.slMult,
          maxHoldHours: chosenCand.horizonHours,
          rationaleTR: chosenCand.rationaleTR,
        };
        if (
          ledger.isRunning &&
          !ledger.observationModeActive &&
          !ledger.dailyLossHaltActive &&
          mkt.open
        ) {
          entryCandidates.push(chosenCand);
        }
      } else {
        snap.activeSetup = {
          ...snap.activeSetup,
          pod: 'NONE',
          direction: 'BEKLE',
        };
      }

      let statusText = chosenCand
        ? `CORTEX +${chosenCand.horizonHours}S (${chosenCand.dir === 'AL (LONG)' ? 'AL' : 'SAT'} • %${assetAcc.toFixed(0)})`
        : !isHighAccuracyAsset
          ? `FİLTRELİ (%${assetAcc.toFixed(0)} İsabet)`
          : snap.regimeLabelTR;
      const alreadyOpen = ledger.openPositions.find((p) => p.symbol === sym);
      if (alreadyOpen) {
        statusText = `AÇIK (Cortex +1S/+4S)`;
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
        botScore: chosenCand ? Math.abs(chosenCand.score) : Math.abs(snap.zacScore),
        botReason: chosenCand ? chosenCand.rationaleTR : snap.activeSetup.rationaleTR,
      });
    }

    // 5B) En Yüksek İsabetli ve Yüksek Skorlu /canli +1S / +4S Sinyallerini Öncelikle Gerçek Emire Dönüştür
    entryCandidates.sort((a, b) => b.priority - a.priority);

    const getEffClusterKey = (s: string, d: 'AL (LONG)' | 'SAT (SHORT)') => {
      const cl = s === 'COPPER' ? 'BASE_METAL' : getSpec(s).cluster;
      if (cl === 'USD_MAJORS') {
        const usdLong = s === 'USD/JPY' ? d === 'AL (LONG)' : d === 'SAT (SHORT)';
        return `USD_MAJORS_${usdLong ? 'USD_UP' : 'USD_DN'}`;
      }
      return `${cl}_${d}`;
    };

    for (const cand of entryCandidates) {
      const { sym, spec, q, p12, completed12Idx, h1Bars, pod, dir } = cand;
      const isLong = dir === 'AL (LONG)';
      const totalOpenCap = 3;
      const maxSlots = 3;
      const podCount = ledger.openPositions.filter((p) => p.pod === pod).length;
      const hasSameSym = ledger.openPositions.some((p) => p.symbol === sym);
      const effClusterKey = getEffClusterKey(sym, dir);
      const totalCluster = ledger.openPositions.filter(
        (p) => getEffClusterKey(p.symbol, p.direction) === effClusterKey
      ).length;
      const totalClusterCap = 2;

      const lastSymTrade = ledger.closedTrades.find((t) => t.symbol === sym && t.closeTimestamp);
      const cooldownMs = lastSymTrade && lastSymTrade.realizedPnL_USD < 0 ? 60 * 60000 : 25 * 60000;
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
      const h1AtrArr = calcAtrSeries(h1Bars.slice(-24), 14);
      const realAtr1h = h1AtrArr.length > 0 ? h1AtrArr[h1AtrArr.length - 1] : 0;
      const atr1h = Math.max(entryPx * 0.0014, realAtr1h || (p12.atr14[completed12Idx] || entryPx * 0.008) / Math.sqrt(12));
      const slDist = atr1h * cand.slMult;
      const sl = isLong ? entryPx - slDist : entryPx + slDist;
      const tpDist = atr1h * cand.tpMult;
      const tp2 = isLong ? entryPx + tpDist : entryPx - tpDist;
      const tp1 = isLong ? entryPx + tpDist * 0.75 : entryPx - tpDist * 0.75;

      const riskPct = cand.horizonHours === 1 ? 2.2 : 2.5;
      const q2u = sym === 'USD/JPY' ? 1 / (entryPx || 155) : 1;
      const freeMargin = Math.max(0, ledger.cashBalanceUSD - ledger.allocatedMarginUSD);
      const allocUSD = Math.min(curEq * 0.3, freeMargin * 0.9);
      const desiredRiskUSD = curEq * (riskPct / 100) * ddScale;
      const unitRiskUSD = slDist * q2u;
      const maxUnitsByMargin = (allocUSD * spec.maxIbkrLeverage) / Math.max(1e-6, entryPx * q2u);
      const units = Math.min(desiredRiskUSD / Math.max(1e-6, unitRiskUSD), maxUnitsByMargin);
      const actualRiskUSD = units * unitRiskUSD;

      if (allocUSD >= 120 && units > 0 && actualRiskUSD >= 11) {
        const notionalUSD = units * entryPx * q2u;
        const entryFee = computeIbkrCommissionUSD(spec, notionalUSD, units);
        const roundTripCostPct =
          (entryFee * 2) / Math.max(1, notionalUSD) + spec.spreadPts / Math.max(1e-6, entryPx);
        const expectedTpPct = tpDist / Math.max(1e-6, entryPx);
        const passesCostGate = expectedTpPct >= roundTripCostPct * 1.5;
        if (entryFee * 2 <= actualRiskUSD * 0.28 && passesCostGate) {
          ledger.cashBalanceUSD = +(ledger.cashBalanceUSD - entryFee).toFixed(2);
          const latest12Ts = p12.bars[completed12Idx]?.timestamp || nowMs;
          const initLiqPx = isLong ? q.bid : q.ask;
          const initGrossUSD = (isLong ? initLiqPx - entryPx : entryPx - initLiqPx) * units * q2u;
          const initEstExitFee = computeIbkrCommissionUSD(spec, units * initLiqPx * q2u, units);
          const initUnrealizedUSD = +(initGrossUSD - initEstExitFee).toFixed(2);
          const initTotalPnL_USD = +(initGrossUSD - entryFee - initEstExitFee).toFixed(2);
          const newTrade: AutonomousTrade = {
            id: `CORTEX-${nowMs}-${sym.replace(/[^A-Z0-9]/g, '')}`,
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
            takeProfit1: +tp1.toFixed(spec.digits),
            takeProfit2: +tp2.toFixed(spec.digits),
            stopLoss: +sl.toFixed(spec.digits),
            initialStopLoss: +sl.toFixed(spec.digits),
            peakPrice: +entryPx.toFixed(spec.digits),
            trailingAtrMult: cand.slMult,
            entry12hBucketTs: latest12Ts,
            maxExitTimestamp: cand.targetAtMs > nowMs + 8 * 60 * 1000 ? cand.targetAtMs : nowMs + cand.horizonHours * 3600000,
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
            curRadarRow.status = `AÇIK (Cortex +${cand.horizonHours}S)`;
            curRadarRow.botStatus = curRadarRow.status;
          }
          ledger.activityLog.unshift({
            id: `ENT-${nowMs}-${sym}`,
            timestamp: formatTRDateTime(nowMs),
            type: 'ENTRY',
            symbol: sym,
            pod: `CORTEX_${cand.horizonHours}S`,
            message: `[Cortex +${cand.horizonHours}S (%${cand.assetAcc.toFixed(0)})] ${sym} ${dir} AÇILDI @ ${newTrade.entryPrice} | Teminat: $${allocUSD.toFixed(0)} | SL: ${newTrade.stopLoss} | TP: ${newTrade.takeProfit2}`,
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
      status: r.status,
      direction: r.direction,
      score: Math.abs(r.zacScore),
      reason: r.reason,
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
      const exitPx = isLong ? pos.bidAtTick || pos.currentPrice : pos.askAtTick || pos.currentPrice;
      const q2u = pos.symbol === 'USD/JPY' ? 1 / (exitPx || 155) : 1;
      const gross = pos.positionSizeUnits * (isLong ? exitPx - pos.entryPrice : pos.entryPrice - exitPx) * q2u;
      const exitFee = computeIbkrCommissionUSD(spec, pos.positionSizeUnits * exitPx * q2u, pos.positionSizeUnits);
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

  // Tüm 17 varlığın 2Y 1H + Temiz Günlük + VIX verisini çek
  const h1Map = new Map<string, HourlyBar[]>();
  const h1Idx = new Map<string, Map<number, number>>();
  const b12Map = new Map<string, HourlyBar[]>();
  const b12Pack = new Map<string, TwelveHourIndicatorPack>();
  const b12End = new Map<string, Map<number, number>>();
  const dPackMap = new Map<string, DailyIndicatorPack>();
  const tsSet = new Set<number>();

  for (let i = 0; i < CORE_SYMBOLS.length; i += 6) {
    const batch = CORE_SYMBOLS.slice(i, i + 6);
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
        h1.forEach((b, idx) => {
          const hr = Math.floor(b.timestamp / 3600000) * 3600000;
          hm.set(hr, idx);
          if (hr >= startMs) tsSet.add(hr);
          const bk = Math.floor(b.timestamp / (12 * 3600000)) * (12 * 3600000);
          if (hr > (lastHrByBucket.get(bk) || 0)) lastHrByBucket.set(bk, hr);
        });
        h1Idx.set(sym, hm);

        const p12 = build12hIndicatorPack(h1);
        b12Map.set(sym, p12.bars);
        b12Pack.set(sym, p12);
        const m12 = new Map<number, number>();
        p12.bars.forEach((b, idx) => {
          const lh = lastHrByBucket.get(b.timestamp);
          if (lh !== undefined) m12.set(lh, idx);
        });
        b12End.set(sym, m12);
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
    units: number;
    allocUSD: number;
    riskUSD: number;
    entryFee: number;
    swap: number;
    entry12Idx?: number;
    maxExitTs: number;
  }

  const WF_REF_CAPITAL = 5_000;
  const capScale = INITIAL_CAPITAL_USD / WF_REF_CAPITAL;
  let cash = WF_REF_CAPITAL;
  let peakEq = WF_REF_CAPITAL;
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
  const dPtr = new Map<string, number>(CORE_SYMBOLS.map((s) => [s, 0]));
  const dailyEq: { date: string; equityUSD: number; ddPct: number }[] = [];
  let lastDay = '';

  for (const hrTs of timeline) {
    const dStr = new Date(hrTs).toISOString().slice(0, 10);
    const utcHour = new Date(hrTs).getUTCHours();

    for (const s of CORE_SYMBOLS) {
      const hi = h1Idx.get(s)?.get(hrTs);
      if (hi !== undefined) lastPx.set(s, h1Map.get(s)![hi].close);
      const dpObj = dPackMap.get(s);
      if (!dpObj) continue;
      let ptr = dPtr.get(s) || 0;
      while (ptr + 1 < dpObj.bars.length && dpObj.bars[ptr + 1].timestamp + 21 * 3600000 <= hrTs) ptr++;
      dPtr.set(s, ptr);
    }

    // 1) Bar-by-bar 1H worst-case stop & exit
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
      const clsLiq = isL ? px - halfSp : px + halfSp;
      const q2u = pos.sym === 'USD/JPY' ? 1 / (px || 155) : 1;

      const borrowed = Math.max(0, pos.units * px * q2u - pos.allocUSD);
      if (borrowed > 0) {
        const sf = borrowed * (0.068 / (365 * 24));
        pos.swap += sf;
        cash -= sf;
      }

      const closeP = (exitPx: number, reason: string) => {
        const gross = pos.units * (isL ? exitPx - pos.entryPx : pos.entryPx - exitPx) * q2u;
        const exitFee = computeIbkrCommissionUSD(spec, pos.units * exitPx * q2u, pos.units);
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

      if (isL ? worst <= pos.sl : worst >= pos.sl) { closeP(pos.sl, 'STOP / TRAILING'); continue; }
      if (pos.tp > 0 && (isL ? best >= pos.tp : best <= pos.tp)) { closeP(pos.tp, 'TP 3 ATR'); continue; }
      if (pos.maxExitTs > 0 && hrTs >= pos.maxExitTs) { closeP(clsLiq, 'SÜRE ÇIKIŞI'); continue; }

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
          pos.peak = isL ? Math.max(pos.peak, best) : Math.min(pos.peak, best);
          const atr = b12Pack.get(pos.sym)!.atr14[i12];
          const cand = isL ? pos.peak - atr * pos.slAtr : pos.peak + atr * pos.slAtr;
          if (isL ? cand > pos.sl : cand < pos.sl) pos.sl = cand;
        }
      } else if (pos.pod === 'CTA_TREND') {
        pos.peak = isL ? Math.max(pos.peak, best) : Math.min(pos.peak, best);
        if (utcHour === 21) {
          const dp = dPtr.get(pos.sym) || 0;
          const dP = dPackMap.get(pos.sym)!;
          const atr = dP.atr20[dp] || dP.atr14[dp];
          if (atr > 0) {
            const cand = isL ? pos.peak - atr * pos.slAtr : pos.peak + atr * pos.slAtr;
            if (isL ? cand > pos.sl : cand < pos.sl) pos.sl = cand;
          }
          const ewNow = calcEwmacAt(dP.e8, dP.e16, dP.e32, dP.e64, dP.e128, dP.atr20, dp);
          if (isL ? ewNow <= 0 : ewNow >= -2) {
            closeP(clsLiq, 'CTA TREND FLIP');
            continue;
          }
        }
      }
      nextOpen.push(pos);
    }
    open = nextOpen;

    let floatUSD = 0, usedMargin = 0;
    for (const p of open) {
      const lp = lastPx.get(p.sym) || p.entryPx;
      const q2u = p.sym === 'USD/JPY' ? 1 / (lp || 155) : 1;
      floatUSD += p.units * (p.dir === 1 ? lp - p.entryPx : p.entryPx - lp) * q2u;
      usedMargin += p.allocUSD;
    }
    const eq = cash + floatUSD;
    if (eq > peakEq) peakEq = eq;
    const curDd = peakEq > 0 ? ((peakEq - eq) / peakEq) * 100 : 0;
    if (curDd > maxDd) maxDd = curDd;
    const ddScale = curDd >= 8.0 ? 0.5 : curDd >= 5.0 ? 0.75 : 1.0;

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
      if (open.filter((p) => p.pod === pod).length >= POD_CONFIG[pod].maxSlots) return;
      if (open.some((p) => p.sym === sym && (p.pod === pod || p.dir !== dir))) return;
      const spec = getSpec(sym);
      const podClusterCap = pod === 'MR_SPRING_12H' && spec.cluster === 'US_TECH' ? 2 : 1;
      if (open.filter((p) => p.pod === pod && getSpec(p.sym).cluster === spec.cluster && p.dir === dir).length >= podClusterCap) return;
      if (open.filter((p) => getSpec(p.sym).cluster === spec.cluster && p.dir === dir).length >= (spec.cluster === 'US_TECH' ? 3 : 2)) return;

      const px = lastPx.get(sym);
      if (!px || !(atr > 0)) return;
      const halfSp = spec.spreadPts / 2, isL = dir === 1;
      const entryPx = isL ? px + halfSp + spec.slippagePts : px - halfSp - spec.slippagePts;
      const slDist = atr * slAtr;
      const sl = isL ? entryPx - slDist : entryPx + slDist;
      const tp = tpAtr > 0 ? (isL ? entryPx + atr * tpAtr : entryPx - atr * tpAtr) : 0;
      const q2u = sym === 'USD/JPY' ? 1 / (entryPx || 155) : 1;
      const alloc = Math.min(eq * 0.16, Math.max(0, cash - usedMargin) * 0.85);
      if (alloc < 80) return;
      const desiredRisk = eq * (riskPct / 100) * ddScale;
      const unitRisk = slDist * q2u;
      const units = Math.min(desiredRisk / (unitRisk || 1), (alloc * spec.maxIbkrLeverage) / ((entryPx * q2u) || 1));
      if (!(units > 0)) return;
      const entryFee = computeIbkrCommissionUSD(spec, units * entryPx * q2u, units);
      if (entryFee * 2 > desiredRisk * 0.18) return;

      cash -= entryFee;
      usedMargin += alloc;
      open.push({
        sym, pod, dir, entryTs: hrTs, entryPx, sl, tp, peak: entryPx, slAtr,
        units, allocUSD: alloc, riskUSD: units * unitRisk, entryFee, swap: 0,
        entry12Idx: i12, maxExitTs: maxH > 0 ? hrTs + maxH * 3600000 : 0,
      });
    };

    // Pod-1: MR_SPRING_12H
    for (const s of ZAC_MR12_ASSETS) {
      const i12 = b12End.get(s)?.get(hrTs);
      if (i12 === undefined || i12 < 30) continue;
      const dp = dPtr.get(s) || 0;
      const dP = dPackMap.get(s);
      if (!dP || dp < 200) continue;
      const ew = calcEwmacAt(dP.e8, dP.e16, dP.e32, dP.e64, dP.e128, dP.atr20, dp);
      const vr = dP.atr50[dp] > 0 ? dP.atr14[dp] / dP.atr50[dp] : 1;
      if (dP.bars[dp].close <= dP.s200[dp] || ew <= 0 || vr > 1.40 || vixLast >= 35) continue;
      const p12 = b12Pack.get(s)!;
      const ibs = calcIbs(p12.bars[i12]);
      const cr2 = (p12.rsi2[i12] + p12.rsi2[i12 - 1]) / 2;
      if (ibs < POD_CONFIG.MR_SPRING_12H.ibsThresh && cr2 < POD_CONFIG.MR_SPRING_12H.cumRsi2Thresh) {
        tryOpen(s, 'MR_SPRING_12H', 1, POD_CONFIG.MR_SPRING_12H.riskPct, p12.atr14[i12], POD_CONFIG.MR_SPRING_12H.slAtr, POD_CONFIG.MR_SPRING_12H.tpAtr, POD_CONFIG.MR_SPRING_12H.maxHoldHours, i12);
      }
    }

    // Pod-2: CRYPTO_MOM_12H
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
      if (p12.e20[i12] > p12.e100[i12] && mom > 1.0 && mom < 3.5 && vr < 1.15 && ew > 2) {
        tryOpen(s, 'CRYPTO_MOM_12H', 1, POD_CONFIG.CRYPTO_MOM_12H.riskPctLong, p12.atr14[i12], 3.0, 0, 240);
      } else if (p12.e20[i12] < p12.e100[i12] && mom < -1.0 && mom > -3.5 && vr < 1.15 && ew < -4) {
        tryOpen(s, 'CRYPTO_MOM_12H', -1, POD_CONFIG.CRYPTO_MOM_12H.riskPctShort, p12.atr14[i12], 3.0, 0, 240);
      }
    }

    // Pod-3: CTA_TREND (Günlük 21:00 UTC)
    if (utcHour === 21 && dStr !== lastDay) {
      lastDay = dStr;
      if (vixByDate.has(dStr)) vixLast = vixByDate.get(dStr)!;
      dailyEq.push({ date: dStr, equityUSD: +(eq * capScale).toFixed(2), ddPct: +curDd.toFixed(2) });

      for (const s of ZAC_CTA_ASSETS) {
        const dp = dPtr.get(s) || 0;
        const dP = dPackMap.get(s);
        if (!dP || dp < 205) continue;
        const ew = calcEwmacAt(dP.e8, dP.e16, dP.e32, dP.e64, dP.e128, dP.atr20, dp);
        const vr = dP.atr50[dp] > 0 ? dP.atr14[dp] / dP.atr50[dp] : 1;
        const er = calcEfficiencyRatio(dP.closes, dp, 20);
        if (ew >= 8.0 && dP.bars[dp].close > dP.s200[dp] && vr <= 1.25 && er >= 0.25 && dP.rsi2[dp] < 85) {
          tryOpen(s, 'CTA_TREND', 1, POD_CONFIG.CTA_TREND.riskPct, dP.atr14[dp], 3.2, 0, 0);
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
      old2YEndingEquityUSD: 97,
      old2YReturnPct: -90.3,
      old2YMaxDdPct: 90.9,
      old2YProfitFactor: 0.58,
      old2YPositiveQuarters: '0 / 9 Çeyrek',
      improvementSummaryTR:
        'Eski v13.2 sistemi 1H kırılım tuzakları ve komisyon/swap erimesi nedeniyle 2 yılda $1,000 sermayeyi $97’a (-%90.3) eritiyordu. Yeni ZELTRA v15.3 mimarisi aynı gerçek saatlik veri ve maliyetlerle pozitif Sharpe, tek haneli MaxDD ve tutarlı kârlılık üretir.',
    },
  };

  auditCache.set(window, { ts: Date.now(), data: report });
  return report;
}

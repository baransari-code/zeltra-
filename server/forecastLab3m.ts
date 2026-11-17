import fs from 'fs';
import path from 'path';
import {
  fetchReal1mAnd3mHistory,
  fetchRealHourlyHistory,
  fetchMacroPulse,
  fetchCryptoOrderbookImbalance,
  fetchKrakenTradeFlow,
  fetchRealFinancialNews,
  type HourlyBar,
  type MacroPulseSnapshot,
} from './marketService';
import { synthesizeAssetNewsAI } from './newsAiEngine';
import {
  analyzeCandlestickSetup,
  calcEmaLastVal,
  type CandlePatternCode,
} from './candleIntelligence';

export type ForecastDirection3m = 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
export type SetupType3m = 'CLEAN_TREND' | 'PULLBACK_TURN' | 'SPIKE_FADE' | 'WICK_ABSORPTION' | 'YATAY';

export type ErrorRootCategory =
  | 'YOK'
  | 'BAYAT_VERİ_GECİKMESİ'
  | 'SIĞ_SEANS_TESERE'
  | 'MAKRO_TERS_ŞOK'
  | 'AŞIRI_UZAMA_GERİ_ÇEKİLMESİ'
  | 'TRENDE_TERS_TEPKİ'
  | 'FIRSAT_KAÇIRILDI'
  | 'MİKRO_SPREAD_GÜRÜLTÜSÜ'
  | 'ZAYIF_İNANÇ_SİNYALİ';

export interface PredictionRecord3m {
  id: string;
  symbol: string;
  name: string;
  digits: number;
  bucketTs: number;
  target3mTs: number;
  target15mTs: number;
  createdAtIso: string;
  target3mIso: string;
  sourceMode: 'CANLI_TICK' | 'REPLAY_1M';
  liveSource: string;
  dataDelaySec: number;
  isMarketClosed: boolean;
  sessionLabel: string;

  entryPrice: number;
  setupType: SetupType3m;
  candlePatternCode: CandlePatternCode;
  candlePatternLabel: string;
  newsDirection: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
  newsConviction: number;
  newsHeadline: string;
  predictedDirection: ForecastDirection3m;
  predicted15mDirection: ForecastDirection3m;
  predictedPrice3m: number;
  predictedMove3mPct: number;
  predictedPrice15m: number;
  predictedMove15mPct: number;
  confidencePct: number;
  rawEdgeScore: number;
  drivers: string[];

  features: {
    ret3mPct: number;
    ret15mPct: number;
    rsi7_3m: number;
    er3m: number;
    vwapZScore: number;
    volRatio3m: number;
    h1TrendBias: number;
    bodyRatio: number;
    lowerWickRatio: number;
    upperWickRatio: number;
    clv: number;
    dxyChg3mPct: number;
    vixPrice: number;
    takerBuyRatio: number;
  };

  status3m: 'BEKLIYOR' | 'DOGRU' | 'YANLIS' | 'PİYASA_KAPALI';
  evaluatedAtIso?: string;
  actualPrice3m?: number;
  actualMove3mPct?: number;
  maxFavorableMove3mPct?: number;
  maxAdverseMove3mPct?: number;
  errorCategory: ErrorRootCategory;
  errorExplanation: string;

  status15m: 'BEKLIYOR' | 'DOGRU' | 'YANLIS' | 'PİYASA_KAPALI';
  actualPrice15m?: number;
  actualMove15mPct?: number;
}

export interface SetupPerformanceCell {
  setupType: Exclude<SetupType3m, 'YATAY'>;
  label: string;
  evaluated: number;
  correct: number;
  accuracyPct: number;
}

export interface AdaptiveRuleStatus {
  symbol: string;
  setupType: Exclude<SetupType3m, 'YATAY'>;
  evaluated: number;
  accuracyPct: number;
  status: 'AKTİF_GÜÇLÜ' | 'NÖTR_İZLENİYOR' | 'ÖĞRENİLMİŞ_FİLTRE_KAPALI';
}

export interface Symbol3mStats {
  symbol: string;
  name: string;
  digits: number;
  totalPredictions: number;
  evaluated3m: number;
  directionalCount3m: number;
  directionalCorrect3m: number;
  directionalAccuracy3m: number;
  bullCount3m: number;
  bullCorrect3m: number;
  bearCount3m: number;
  bearCorrect3m: number;
  overallCorrect3m: number;
  overallAccuracy3m: number;
  evaluated15m: number;
  directionalAccuracy15m: number;
  avgAbsErrorPct3m: number;
  topErrorCategory: ErrorRootCategory;
  lastPrediction?: PredictionRecord3m;
  recommendedAction: string;
  liveDataSource: string;
  liveDataDelaySec: number;
  bestSetupType?: SetupType3m;
}

export interface ErrorBreakdownItem {
  category: ErrorRootCategory;
  label: string;
  count: number;
  sharePct: number;
  fixHint: string;
}

export interface HourlyAccuracyCell {
  trHour: number;
  label: string;
  evaluated: number;
  correct: number;
  accuracyPct: number;
}

export interface ForecastLab3mState {
  labId: string;
  version: string;
  startedAtIso: string;
  calibrationDeadlineIso: string;
  continuousLearningActive: boolean;
  lastTickIso: string;
  lastBucketTs: number;
  totalGeneratedCount: number;
  totalEvaluated3m: number;
  liveTickEvaluated3m: number;
  liveTickAccuracy3m: number;
  directionalEvaluated3m: number;
  directionalCorrect3m: number;
  directionalAccuracy3m: number;
  directionalCoveragePct: number;
  directionalBullishCount: number;
  directionalBullishCorrect: number;
  directionalBullishAccuracy: number;
  directionalBearishCount: number;
  directionalBearishCorrect: number;
  directionalBearishAccuracy: number;
  flatEvaluated3m: number;
  flatCorrect3m: number;
  evaluated15m: number;
  directionalAccuracy15m: number;
  macroPulse: MacroPulseSnapshot;
  setupStats: SetupPerformanceCell[];
  adaptiveRules: AdaptiveRuleStatus[];
  symbolStats: Symbol3mStats[];
  errorBreakdown: ErrorBreakdownItem[];
  hourlyHeatmap: HourlyAccuracyCell[];
  learningInsights: string[];
  recentRecords: PredictionRecord3m[];
}

export interface TrackedAssetSpec {
  symbol: string;
  name: string;
  digits: number;
  assetClass: 'METAL' | 'FX' | 'INDEX' | 'EQUITY' | 'ENERGY' | 'CRYPTO';
  minMovePct: number;
  enableCleanTrend3m: boolean;
  enablePullbackTurn3m: boolean;
  enableSpikeFade3m: boolean;
}

export const LAB_TRACKED_ASSETS: TrackedAssetSpec[] = [
  { symbol: 'XAU/USD', name: 'Ons Altın / ABD Doları', digits: 2, assetClass: 'METAL', minMovePct: 0.015, enableCleanTrend3m: true, enablePullbackTurn3m: false, enableSpikeFade3m: false },
  { symbol: 'EUR/USD', name: 'Euro / ABD Doları', digits: 4, assetClass: 'FX', minMovePct: 0.010, enableCleanTrend3m: true, enablePullbackTurn3m: false, enableSpikeFade3m: true },
  { symbol: 'USD/JPY', name: 'ABD Doları / Japon Yeni', digits: 2, assetClass: 'FX', minMovePct: 0.012, enableCleanTrend3m: true, enablePullbackTurn3m: false, enableSpikeFade3m: true },
  { symbol: 'GBP/USD', name: 'İngiliz Sterlini / ABD Doları', digits: 4, assetClass: 'FX', minMovePct: 0.012, enableCleanTrend3m: true, enablePullbackTurn3m: true, enableSpikeFade3m: true },
  { symbol: 'NAS100', name: 'Nasdaq 100 Teknoloji Endeksi', digits: 2, assetClass: 'INDEX', minMovePct: 0.022, enableCleanTrend3m: true, enablePullbackTurn3m: false, enableSpikeFade3m: false },
  { symbol: 'SPX500', name: 'S&P 500 Endeksi', digits: 2, assetClass: 'INDEX', minMovePct: 0.018, enableCleanTrend3m: true, enablePullbackTurn3m: true, enableSpikeFade3m: true },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', digits: 2, assetClass: 'EQUITY', minMovePct: 0.032, enableCleanTrend3m: true, enablePullbackTurn3m: false, enableSpikeFade3m: false },
  { symbol: 'WTI', name: 'ABD Ham Petrolü (WTI)', digits: 2, assetClass: 'ENERGY', minMovePct: 0.025, enableCleanTrend3m: true, enablePullbackTurn3m: false, enableSpikeFade3m: true },
  { symbol: 'BTC/USD', name: 'Bitcoin / ABD Doları', digits: 2, assetClass: 'CRYPTO', minMovePct: 0.032, enableCleanTrend3m: true, enablePullbackTurn3m: false, enableSpikeFade3m: true },
];

export const CALIBRATION_DEADLINE_ISO = '2026-11-17T06:00:00.000Z';

const LAB_VERSION = 'v12.0-pro-candle-news';
const LAB_FILE = path.resolve(process.cwd(), 'data', 'forecast_lab_3m.json');
const MAX_STORED_RECORDS = 5000;
const BUCKET_MS = 180_000;

interface PersistedLabStore {
  labId: string;
  version: string;
  startedAtIso: string;
  calibrationDeadlineIso: string;
  lastTickIso: string;
  lastBucketTs: number;
  macroPulse: MacroPulseSnapshot;
  records: PredictionRecord3m[];
}

const SETUP_LABELS: Record<Exclude<SetupType3m, 'YATAY'>, string> = {
  CLEAN_TREND: 'Temiz Trend (Anti-Klimaks + Mum CLV)',
  PULLBACK_TURN: 'Trend İçi Geri Çekilme Dönüşü',
  SPIKE_FADE: 'Aşırı İğne Sönümü (Stop-Hunt Fade)',
  WICK_ABSORPTION: 'Dip/Tepe Fitil Emilimi (Pinbar Dönüş)',
};

const ERROR_META: Record<ErrorRootCategory, { label: string; fixHint: string }> = {
  YOK: { label: 'Hatasız', fixHint: 'Sinyal temiz doğrulandı.' },
  BAYAT_VERİ_GECİKMESİ: {
    label: 'Bayat / Gecikmeli Veri Beslemesi',
    fixHint: 'Akış >240sn geciktiğinde tahmini otomatik YATAY korumasına al.',
  },
  SIĞ_SEANS_TESERE: {
    label: 'Sığ Seans / Düşük Likidite Testeresi',
    fixHint: 'TR 01:00–08:00 sığ saatlerde yüksek ER olmadan işlem açma.',
  },
  MAKRO_TERS_ŞOK: {
    label: 'Ani Makro (DXY / VIX / Tahvil) Şoku',
    fixHint: 'DXY 3dk ivmesi ±%0.045 veya VIX ±%0.85 sıçradığında pozisyondan çık.',
  },
  AŞIRI_UZAMA_GERİ_ÇEKİLMESİ: {
    label: 'Aşırı Uzama (Mean-Reversion) Tuzağı',
    fixHint: '|VWAP-Z| > 1.15 uzamış barları kovalama; geri çekilme dönüşü bekle.',
  },
  TRENDE_TERS_TEPKİ: {
    label: '1 Saatlik Ana Trende Ters Erken Tepki',
    fixHint: '1S EMA yapısına zıt düşük inançlı tepki arama.',
  },
  FIRSAT_KAÇIRILDI: {
    label: 'YATAY Korumada Sert Kırılım Kaçtı',
    fixHint: 'Sadece kanıtlanmış mum kurulumlarında işlem açıldığı için düşük olasılıklı barlar pas geçildi.',
  },
  MİKRO_SPREAD_GÜRÜLTÜSÜ: {
    label: 'Mikro Spread İçi Rastgele Gürültü',
    fixHint: 'Çok küçük tik salınımları yerine 15dk/1S mum kapanışı tercih et.',
  },
  ZAYIF_İNANÇ_SİNYALİ: {
    label: 'Sınırda İnanç / Dalgalı Kapanış Hatası',
    fixHint: 'Adaptif öğrenmede <%44 kalan (Varlık × Kurulum) eşleşmesi otomatik kapatılır.',
  },
};

function isAssetMarketOpenAt(spec: TrackedAssetSpec, ts: number): boolean {
  if (spec.assetClass === 'CRYPTO') return true;
  const d = new Date(ts);
  const day = d.getUTCDay();
  const minUtc = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (day === 6) return false;
  if (day === 0 && minUtc < 22 * 60) return false;
  if (day === 5 && minUtc >= 22 * 60) return false;
  if (spec.symbol === 'NVDA') {
    return minUtc >= 9 * 60 || minUtc < 60;
  }
  if ((spec.assetClass === 'METAL' || spec.assetClass === 'INDEX' || spec.assetClass === 'ENERGY') && minUtc >= 22 * 60 && minUtc < 23 * 60) {
    return false;
  }
  return true;
}

function getSessionLabel(spec: TrackedAssetSpec, ts: number): string {
  if (spec.assetClass === 'CRYPTO') return 'KRİPTO_7_24';
  const trHour = (new Date(ts).getUTCHours() + 3) % 24;
  if (trHour >= 16 && trHour < 23) return 'NY_SEANS';
  if (trHour === 23 || trHour < 4) return 'NY_AFTERHOURS';
  if (trHour >= 10 && trHour < 16) return 'AVRUPA_LONDRA';
  return 'ASYA_GECE';
}

function aggregateBarsTo3mSlice(bars1m: HourlyBar[]): HourlyBar[] {
  if (!bars1m.length) return [];
  const lastTs = bars1m[bars1m.length - 1].timestamp;
  const groups = new Map<number, HourlyBar>();
  for (const b of bars1m) {
    // Son tamamlanan barı 0 kabul ederek geriye doğru 3 dakikalık (180sn) tam mum blokları kurar; kesik 1dk uç mumu engeller
    const offsetBuckets = Math.floor(Math.max(0, lastTs - b.timestamp) / BUCKET_MS);
    const key = lastTs - offsetBuckets * BUCKET_MS;
    const prev = groups.get(key);
    if (!prev) {
      groups.set(key, {
        timestamp: key,
        open: b.open ?? b.close,
        high: b.high ?? b.close,
        low: b.low ?? b.close,
        close: b.close,
        volume: b.volume ?? 0,
      });
    } else {
      prev.high = Math.max(prev.high ?? prev.close, b.high ?? b.close);
      prev.low = Math.min(prev.low ?? prev.close, b.low ?? b.close);
      prev.close = b.close;
      prev.volume = (prev.volume ?? 0) + (b.volume ?? 0);
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function createEmptyStore(): PersistedLabStore {
  const nowIso = new Date().toISOString();
  return {
    labId: 'ZELTRA-3M-CALIBRATION-LAB',
    version: LAB_VERSION,
    startedAtIso: nowIso,
    calibrationDeadlineIso: CALIBRATION_DEADLINE_ISO,
    lastTickIso: nowIso,
    lastBucketTs: 0,
    macroPulse: {
      dxyPrice: 0,
      dxyChg3mPct: 0,
      dxyChg15mPct: 0,
      vixPrice: 0,
      vixChg5mPct: 0,
      us10yYield: 0,
      us10yChg5mPct: 0,
      fetchedAt: Date.now(),
    },
    records: [],
  };
}

function loadStore(): PersistedLabStore {
  if (fs.existsSync(LAB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(LAB_FILE, 'utf-8'));
      if (parsed && parsed.version === LAB_VERSION && Array.isArray(parsed.records)) {
        return parsed;
      }
    } catch {
      // ignore corrupted
    }
  }
  return createEmptyStore();
}

function saveStore(store: PersistedLabStore): void {
  try {
    const dir = path.dirname(LAB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (store.records.length > MAX_STORED_RECORDS) {
      store.records = store.records.slice(-MAX_STORED_RECORDS);
    }
    const serialized = JSON.stringify(store);
    const tmp = `${LAB_FILE}.tmp`;
    fs.writeFileSync(tmp, serialized, 'utf-8');
    try {
      fs.renameSync(tmp, LAB_FILE);
    } catch {
      fs.writeFileSync(LAB_FILE, serialized, 'utf-8');
    }
  } catch (err) {
    console.error('[3dk Tahmin Lab] Kayıt hatası:', err);
  }
}

function getAdaptiveSetupStats(
  records: PredictionRecord3m[],
  symbol: string,
  setup: Exclude<SetupType3m, 'YATAY'>
): { count: number; winRate: number; isSuppressed: boolean; isBoosted: boolean } {
  const closed = records
    .filter((r) => r.symbol === symbol && r.setupType === setup && (r.status3m === 'DOGRU' || r.status3m === 'YANLIS'))
    .slice(-60);
  if (closed.length < 12) {
    return { count: closed.length, winRate: 0.58, isSuppressed: false, isBoosted: false };
  }
  const wins = closed.filter((r) => r.status3m === 'DOGRU').length;
  const wr = wins / closed.length;
  return {
    count: closed.length,
    winRate: wr,
    isSuppressed: wr < 0.44,
    isBoosted: wr >= 0.60,
  };
}

function predictNext3Minutes(args: {
  spec: TrackedAssetSpec;
  bucketTs: number;
  bars1mUpTo: HourlyBar[];
  bars1hUpTo: HourlyBar[];
  entryPrice: number;
  macro: MacroPulseSnapshot;
  obRatio: number;
  takerBuyRatio: number;
  dataDelaySec: number;
  liveSource: string;
  sourceMode: 'CANLI_TICK' | 'REPLAY_1M';
  historicalRecords: PredictionRecord3m[];
  newsDirection: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
  newsConviction: number;
  newsScore: number;
  newsHeadline: string;
}): PredictionRecord3m {
  const {
    spec,
    bucketTs,
    bars1mUpTo,
    bars1hUpTo,
    entryPrice,
    macro,
    obRatio,
    takerBuyRatio,
    dataDelaySec,
    liveSource,
    sourceMode,
    historicalRecords,
    newsDirection,
    newsConviction,
    newsScore,
    newsHeadline,
  } = args;

  const bars3m = aggregateBarsTo3mSlice(bars1mUpTo);
  const c3m = bars3m.map((b) => b.close);
  const c1h = bars1hUpTo.map((b) => b.close);
  const sessionLabel = getSessionLabel(spec, bucketTs);
  const marketOpen = isAssetMarketOpenAt(spec, bucketTs);
  const trHour = (new Date(bucketTs).getUTCHours() + 3) % 24;
  const isLiquidHour = spec.assetClass === 'CRYPTO' || (trHour >= 9 && trHour <= 23);

  const pxNow = entryPrice > 0 ? entryPrice : c3m.length ? c3m[c3m.length - 1] : c1h.length ? c1h[c1h.length - 1] : 0;
  const ret3mPct = c3m.length >= 2 && c3m[c3m.length - 2] > 0 ? +(((pxNow - c3m[c3m.length - 2]) / c3m[c3m.length - 2]) * 100).toFixed(4) : 0;
  const prevRet3mPct = c3m.length >= 3 && c3m[c3m.length - 3] > 0 ? +(((c3m[c3m.length - 2] - c3m[c3m.length - 3]) / c3m[c3m.length - 3]) * 100).toFixed(4) : 0;
  const ret15mPct = c3m.length >= 6 && c3m[c3m.length - 6] > 0 ? +(((pxNow - c3m[c3m.length - 6]) / c3m[c3m.length - 6]) * 100).toFixed(4) : ret3mPct;

  // Paylaşılan Kurumsal Mum Anatomisi & Yapısal Formasyon Okuyucusu
  const candle3m = analyzeCandlestickSetup({
    bars: bars3m.slice(-32),
    h1Bars: bars1hUpTo,
    newsSentiment: sourceMode === 'CANLI_TICK' ? newsScore : 0,
  });

  const e3 = calcEmaLastVal(c3m.slice(-20), 3) || pxNow;
  const e8 = calcEmaLastVal(c3m.slice(-30), 8) || pxNow;
  const e21 = calcEmaLastVal(c3m.slice(-50), 21) || pxNow;

  const absMoves: number[] = [];
  for (let i = Math.max(1, c3m.length - 15); i < c3m.length; i++) {
    if (c3m[i - 1] > 0) absMoves.push(Math.abs(((c3m[i] - c3m[i - 1]) / c3m[i - 1]) * 100));
  }
  absMoves.sort((a, b) => a - b);
  const medMove = absMoves.length ? absMoves[Math.floor(absMoves.length / 2)] : spec.minMovePct;

  const isStaleLiveFeed = sourceMode === 'CANLI_TICK' && dataDelaySec > 240;
  const is24hSpot = spec.assetClass === 'CRYPTO' || spec.assetClass === 'FX' || spec.assetClass === 'METAL';
  const allowCleanTrendSession = isLiquidHour || (is24hSpot && candle3m.er14 >= 0.28);

  let setupType: SetupType3m = 'YATAY';
  let predictedDirection: ForecastDirection3m = 'YATAY';
  let baseConf = 52;
  let edgeScore = 0;
  const drivers: string[] = [];

  if (marketOpen && !isStaleLiveFeed) {
    // 1) CLEAN_TREND: 1S Ana Trend + 3dk EMA3>EMA8 + Anti-Klimaks + ER >= 0.25 + Mum Fitil/Kapanış Çatışmaması
    if (spec.enableCleanTrend3m && candle3m.h1TrendBias !== 0 && candle3m.er14 >= 0.25 && allowCleanTrendSession) {
      const rule = getAdaptiveSetupStats(historicalRecords, spec.symbol, 'CLEAN_TREND');
      if (!rule.isSuppressed) {
        const noTopTrap = !(candle3m.anatomy.upperWickRatio >= 0.54 && candle3m.anatomy.clv < -0.2);
        const noBotTrap = !(candle3m.anatomy.lowerWickRatio >= 0.54 && candle3m.anatomy.clv > 0.2);

        if (candle3m.h1TrendBias === 1 && e3 > e8 && candle3m.z20 > 0.05 && candle3m.z20 <= 1.05 && candle3m.rsi7 < 65 && candle3m.anatomy.clv >= 0 && noTopTrap) {
          setupType = 'CLEAN_TREND';
          predictedDirection = 'YÜKSELİŞ';
          edgeScore = 28 + Math.round(candle3m.er14 * 25);
          baseConf = 62 + (rule.isBoosted ? 6 : 0);
          drivers.push(`Mum: ${candle3m.patternLabelTR}`, `Anti-Klimaks (VWAPz ${candle3m.z20}, ER ${candle3m.er14})`);
        } else if (candle3m.h1TrendBias === -1 && e3 < e8 && candle3m.z20 < -0.05 && candle3m.z20 >= -1.05 && candle3m.rsi7 > 35 && candle3m.anatomy.clv <= 0 && noBotTrap) {
          setupType = 'CLEAN_TREND';
          predictedDirection = 'DÜŞÜŞ';
          edgeScore = -(28 + Math.round(candle3m.er14 * 25));
          baseConf = 62 + (rule.isBoosted ? 6 : 0);
          drivers.push(`Mum: ${candle3m.patternLabelTR}`, `Anti-Klimaks (VWAPz ${candle3m.z20}, ER ${candle3m.er14})`);
        }
      }
    }

    // 2) PULLBACK_TURN: Ana 1S trend içi VWAP/RSI geri çekilmesi sonrası ER >= 0.25 + Mum CLV teyitli dönüş
    if (predictedDirection === 'YATAY' && spec.enablePullbackTurn3m && candle3m.h1TrendBias !== 0 && candle3m.er14 >= 0.25) {
      const rule = getAdaptiveSetupStats(historicalRecords, spec.symbol, 'PULLBACK_TURN');
      if (!rule.isSuppressed) {
        if (candle3m.h1TrendBias === 1 && (candle3m.rsi7 <= 41 || candle3m.z20 <= -0.68) && ret3mPct > 0 && prevRet3mPct <= 0 && candle3m.anatomy.clv >= 0.25 && candle3m.anatomy.bodyRatio >= 0.4) {
          setupType = 'PULLBACK_TURN';
          predictedDirection = 'YÜKSELİŞ';
          edgeScore = 26 + Math.round(Math.abs(candle3m.z20) * 10);
          baseConf = 61 + (rule.isBoosted ? 6 : 0);
          drivers.push(`Pullback Dönüş (${candle3m.patternLabelTR})`, `RSI7:${candle3m.rsi7}, CLV:+${candle3m.anatomy.clv}`);
        } else if (candle3m.h1TrendBias === -1 && (candle3m.rsi7 >= 59 || candle3m.z20 >= 0.68) && ret3mPct < 0 && prevRet3mPct >= 0 && candle3m.anatomy.clv <= -0.25 && candle3m.anatomy.bodyRatio >= 0.4) {
          setupType = 'PULLBACK_TURN';
          predictedDirection = 'DÜŞÜŞ';
          edgeScore = -(26 + Math.round(Math.abs(candle3m.z20) * 10));
          baseConf = 61 + (rule.isBoosted ? 6 : 0);
          drivers.push(`Pullback Satış (${candle3m.patternLabelTR})`, `RSI7:${candle3m.rsi7}, CLV:${candle3m.anatomy.clv}`);
        }
      }
    }

    // 3) SPIKE_FADE: Mum CLV aşırı uç + ani taşma sönümü (Asla 1S ana trendi körü körüne karşısına almaz)
    if (
      predictedDirection === 'YATAY' &&
      spec.enableSpikeFade3m &&
      Math.abs(ret3mPct) >= Math.max(medMove * 1.4, spec.minMovePct * 1.3) &&
      Math.abs(candle3m.z20) >= 1.1
    ) {
      const spikeDir = ret3mPct > 0 ? 1 : -1;
      const clvAligned = (spikeDir === 1 && candle3m.anatomy.clv >= 0.35) || (spikeDir === -1 && candle3m.anatomy.clv <= -0.35);
      const rule = getAdaptiveSetupStats(historicalRecords, spec.symbol, 'SPIKE_FADE');
      if (!rule.isSuppressed && clvAligned && candle3m.h1TrendBias !== spikeDir) {
        setupType = 'SPIKE_FADE';
        predictedDirection = spikeDir === 1 ? 'DÜŞÜŞ' : 'YÜKSELİŞ';
        edgeScore = spikeDir === 1 ? -25 : 25;
        baseConf = 60 + (rule.isBoosted ? 5 : 0);
        drivers.push(`Aşırı İğne Sönümü (${ret3mPct >= 0 ? '+' : ''}${ret3mPct.toFixed(3)}%)`, `CLV:${candle3m.anatomy.clv} · VWAPz:${candle3m.z20}`);
      }
    }

    // 4) WICK_ABSORPTION (Çift yönlü Pinbar Fitil Reddi — asla 1S ana trende zıt bıçak tutmaz!)
    if (predictedDirection === 'YATAY') {
      const rule = getAdaptiveSetupStats(historicalRecords, spec.symbol, 'WICK_ABSORPTION');
      if (!rule.isSuppressed) {
        if (candle3m.h1TrendBias !== -1 && candle3m.z20 <= -1.2 && candle3m.rsi7 <= 34 && candle3m.anatomy.lowerWickRatio >= 0.5 && candle3m.anatomy.clv >= 0.25) {
          setupType = 'WICK_ABSORPTION';
          predictedDirection = 'YÜKSELİŞ';
          edgeScore = 25;
          baseConf = 60 + (rule.isBoosted ? 5 : 0);
          drivers.push(`Dip Fitil Emilimi (%${Math.round(candle3m.anatomy.lowerWickRatio * 100)} alt fitil)`, `CLV:+${candle3m.anatomy.clv}`);
        } else if (candle3m.h1TrendBias !== 1 && candle3m.z20 >= 1.2 && candle3m.rsi7 >= 66 && candle3m.anatomy.upperWickRatio >= 0.5 && candle3m.anatomy.clv <= -0.25) {
          setupType = 'WICK_ABSORPTION';
          predictedDirection = 'DÜŞÜŞ';
          edgeScore = -25;
          baseConf = 60 + (rule.isBoosted ? 5 : 0);
          drivers.push(`Tepe Fitil Reddi (%${Math.round(candle3m.anatomy.upperWickRatio * 100)} üst fitil)`, `CLV:${candle3m.anatomy.clv}`);
        }
      }
    }

    // Canlı Ek Teyit: Kraken CVD Orderflow, DXY Makro & Temiz Finans Haber Katalizörü
    if (predictedDirection !== 'YATAY') {
      if (spec.assetClass === 'CRYPTO') {
        if ((predictedDirection === 'YÜKSELİŞ' && takerBuyRatio >= 1.25) || (predictedDirection === 'DÜŞÜŞ' && takerBuyRatio <= 0.80)) {
          baseConf += 5;
          drivers.push(`Kraken Orderflow CVD ${takerBuyRatio}x Uyumlu`);
        }
        if ((predictedDirection === 'YÜKSELİŞ' && obRatio >= 1.3) || (predictedDirection === 'DÜŞÜŞ' && obRatio <= 0.77)) {
          baseConf += 3;
        }
      }
      if (Math.abs(macro.dxyChg3mPct) >= 0.015) {
        const dxyBullForAsset = spec.symbol === 'USD/JPY' ? macro.dxyChg3mPct > 0 : macro.dxyChg3mPct < 0;
        if ((spec.assetClass === 'FX' || spec.assetClass === 'METAL' || spec.assetClass === 'CRYPTO') && (predictedDirection === 'YÜKSELİŞ') === dxyBullForAsset) {
          baseConf += 4;
          drivers.push(`DXY (${macro.dxyChg3mPct >= 0 ? '+' : ''}${macro.dxyChg3mPct}%) Uyumlu`);
        }
      }
      if (sourceMode === 'CANLI_TICK' && newsDirection !== 'BEKLE' && newsConviction >= 65) {
        const newsAligned =
          (predictedDirection === 'YÜKSELİŞ' && newsDirection === 'AL (LONG)') ||
          (predictedDirection === 'DÜŞÜŞ' && newsDirection === 'SAT (SHORT)');
        if (newsAligned) {
          baseConf += 5;
          drivers.push(`Haber Teyidi (${newsDirection}, %${newsConviction})`);
        } else {
          baseConf = Math.max(52, baseConf - 5);
          drivers.push(`Haber Tersi Dikkat (${newsDirection})`);
        }
      }
    }
  } else if (isStaleLiveFeed) {
    drivers.push(`Bayat Akış Koruması (${dataDelaySec}sn yeni tik yok)`);
  }

  // Bağımsız +15 Dakikalık Orta-Vade Mum + Trend Tahmini (Spike Fade %58 & Trend-Aligned Pinbar/Engulf %58-60)
  let predicted15mDirection: ForecastDirection3m = 'YATAY';
  if (marketOpen && !isStaleLiveFeed) {
    if (setupType === 'SPIKE_FADE' || setupType === 'WICK_ABSORPTION' || setupType === 'CLEAN_TREND') {
      predicted15mDirection = predictedDirection;
    } else if (candle3m.h1TrendBias !== -1 && (candle3m.patternCode === 'PINBAR_AL' || candle3m.patternCode === 'YUTAN_BOGA')) {
      predicted15mDirection = 'YÜKSELİŞ';
    } else if (candle3m.h1TrendBias !== 1 && (candle3m.patternCode === 'PINBAR_SAT' || candle3m.patternCode === 'YUTAN_AYI')) {
      predicted15mDirection = 'DÜŞÜŞ';
    } else if (allowCleanTrendSession && candle3m.h1TrendBias !== 0 && candle3m.er14 >= 0.24 && Math.abs(candle3m.z20) < 1.2) {
      if (candle3m.h1TrendBias === 1 && e8 > e21) predicted15mDirection = 'YÜKSELİŞ';
      else if (candle3m.h1TrendBias === -1 && e8 < e21) predicted15mDirection = 'DÜŞÜŞ';
    }
  }

  const volUnit = Math.max(0.015, (candle3m.atr14 / Math.max(1e-9, pxNow)) * 100);
  const mag3m = Math.min(spec.minMovePct * 3.8, Math.max(spec.minMovePct, volUnit * 0.72));
  const predictedMove3mPct =
    predictedDirection === 'YÜKSELİŞ' ? +mag3m.toFixed(4) : predictedDirection === 'DÜŞÜŞ' ? -mag3m.toFixed(4) : 0;

  const mag15m = Math.min(spec.minMovePct * 7.5, Math.max(spec.minMovePct * 1.8, volUnit * 1.6));
  const predictedMove15mPct =
    predicted15mDirection === 'YÜKSELİŞ' ? +mag15m.toFixed(4) : predicted15mDirection === 'DÜŞÜŞ' ? -mag15m.toFixed(4) : 0;

  const predictedPrice3m = +(pxNow * (1 + predictedMove3mPct / 100)).toFixed(spec.digits);
  const predictedPrice15m = +(pxNow * (1 + predictedMove15mPct / 100)).toFixed(spec.digits);
  const confidencePct =
    predictedDirection === 'YATAY'
      ? Math.round(54 + Math.min(18, (1 - candle3m.er14) * 18))
      : Math.round(Math.min(88, baseConf));

  return {
    id: `${spec.symbol}-${bucketTs}`,
    symbol: spec.symbol,
    name: spec.name,
    digits: spec.digits,
    bucketTs,
    target3mTs: bucketTs + BUCKET_MS,
    target15mTs: bucketTs + 5 * BUCKET_MS,
    createdAtIso: new Date(bucketTs).toISOString(),
    target3mIso: new Date(bucketTs + BUCKET_MS).toISOString(),
    sourceMode,
    liveSource,
    dataDelaySec,
    isMarketClosed: !marketOpen,
    sessionLabel,
    entryPrice: +pxNow.toFixed(spec.digits),
    setupType,
    candlePatternCode: candle3m.patternCode,
    candlePatternLabel: candle3m.patternLabelTR,
    newsDirection: sourceMode === 'CANLI_TICK' ? newsDirection : 'BEKLE',
    newsConviction: sourceMode === 'CANLI_TICK' ? newsConviction : 50,
    newsHeadline: sourceMode === 'CANLI_TICK' ? newsHeadline : '',
    predictedDirection,
    predicted15mDirection,
    predictedPrice3m,
    predictedMove3mPct,
    predictedPrice15m,
    predictedMove15mPct,
    confidencePct,
    rawEdgeScore: edgeScore,
    drivers: drivers.length ? drivers.slice(0, 3) : [`Mum: ${candle3m.patternLabelTR} · Belirgin Kurulum Dışı (YATAY)`],
    features: {
      ret3mPct,
      ret15mPct,
      rsi7_3m: candle3m.rsi7,
      er3m: candle3m.er14,
      vwapZScore: candle3m.z20,
      volRatio3m: candle3m.anatomy.rvol,
      h1TrendBias: candle3m.h1TrendBias,
      bodyRatio: candle3m.anatomy.bodyRatio,
      lowerWickRatio: candle3m.anatomy.lowerWickRatio,
      upperWickRatio: candle3m.anatomy.upperWickRatio,
      clv: candle3m.anatomy.clv,
      dxyChg3mPct: macro.dxyChg3mPct,
      vixPrice: macro.vixPrice,
      takerBuyRatio,
    },
    status3m: marketOpen ? 'BEKLIYOR' : 'PİYASA_KAPALI',
    errorCategory: 'YOK',
    errorExplanation: marketOpen ? '3 dakikalık gerçekleşme sonucu bekleniyor.' : 'Borsa seans dışında/kapalı olduğu için değerlendirme dışı.',
    status15m: marketOpen ? 'BEKLIYOR' : 'PİYASA_KAPALI',
  };
}

function classify3mError(
  rec: PredictionRecord3m,
  actualMovePct: number,
  spec: TrackedAssetSpec,
  macro: MacroPulseSnapshot
): { category: ErrorRootCategory; explanation: string } {
  if (rec.dataDelaySec > 240) {
    return {
      category: 'BAYAT_VERİ_GECİKMESİ',
      explanation: `Veri ${rec.dataDelaySec}sn gecikmeliydi (${rec.liveSource}); gerçekleşen fiyat (${actualMovePct >= 0 ? '+' : ''}${actualMovePct}%) bayat bara göre ters kaldı.`,
    };
  }
  if (rec.predictedDirection === 'YATAY') {
    return {
      category: 'FIRSAT_KAÇIRILDI',
      explanation: `Kalite filtresi sinyali eledi ancak piyasa ${actualMovePct >= 0 ? '+' : ''}${actualMovePct}% kırdı (${rec.candlePatternLabel}, ER ${rec.features.er3m}).`,
    };
  }
  if (rec.sessionLabel === 'ASYA_GECE' || (rec.features.er3m < 0.16 && rec.features.volRatio3m < 0.75)) {
    return {
      category: 'SIĞ_SEANS_TESERE',
      explanation: `${rec.sessionLabel} düşük likidite/testere ortamında (ER ${rec.features.er3m}) mikro gürültü yönü bozdu (${actualMovePct >= 0 ? '+' : ''}${actualMovePct}%).`,
    };
  }
  const isLiveEvalWindow = rec.sourceMode === 'CANLI_TICK' && Math.abs(Date.now() - rec.target3mTs) <= 240_000;
  if (isLiveEvalWindow && (Math.abs(macro.dxyChg3mPct) >= 0.045 || Math.abs(macro.vixChg5mPct) >= 0.85)) {
    return {
      category: 'MAKRO_TERS_ŞOK',
      explanation: `Canlı 3dk pencere içinde DXY (%${macro.dxyChg3mPct}) veya VIX (%${macro.vixChg5mPct}) sert oynadı ve kurulumu bozdu.`,
    };
  }
  if (
    (rec.predictedDirection === 'YÜKSELİŞ' && rec.features.rsi7_3m > 74) ||
    (rec.predictedDirection === 'DÜŞÜŞ' && rec.features.rsi7_3m < 26)
  ) {
    return {
      category: 'AŞIRI_UZAMA_GERİ_ÇEKİLMESİ',
      explanation: `Aşırı uçta (RSI7=${rec.features.rsi7_3m}) yöne devam beklendi; fiyat ortalamaya çekildi.`,
    };
  }
  if (
    (rec.predictedDirection === 'YÜKSELİŞ' && rec.features.h1TrendBias <= -0.5) ||
    (rec.predictedDirection === 'DÜŞÜŞ' && rec.features.h1TrendBias >= 0.5)
  ) {
    return {
      category: 'TRENDE_TERS_TEPKİ',
      explanation: `1S ana trend (${rec.features.h1TrendBias > 0 ? 'BOĞA' : 'AYI'}) tersine tepki arandı; ana dalga devam etti.`,
    };
  }
  if (Math.abs(actualMovePct) <= spec.minMovePct * 1.4) {
    return {
      category: 'MİKRO_SPREAD_GÜRÜLTÜSÜ',
      explanation: `Fiyat hareketi (%${actualMovePct}) spread/tik gürültüsü içinde kaldı.`,
    };
  }
  return {
    category: 'ZAYIF_İNANÇ_SİNYALİ',
    explanation: `[${rec.setupType} | ${rec.candlePatternLabel}] %${rec.confidencePct} kurulumunda 3dk içinde %${actualMovePct} ters kırılım oldu.`,
  };
}

function evaluateRecordAgainstBars(
  rec: PredictionRecord3m,
  bars1m: HourlyBar[],
  livePriceNow: number,
  nowMs: number,
  spec: TrackedAssetSpec,
  macro: MacroPulseSnapshot
): boolean {
  let changed = false;
  if (rec.isMarketClosed) return false;

  const findPriceAt = (targetTs: number): number | null => {
    const exact = bars1m.find((b) => b.timestamp >= targetTs - 30_000 && b.timestamp <= targetTs + 120_000);
    if (exact) return exact.close;
    const before = bars1m.filter((b) => b.timestamp <= targetTs);
    if (before.length > 0 && Math.abs(targetTs - before[before.length - 1].timestamp) <= 180_000) {
      return before[before.length - 1].close;
    }
    if (Math.abs(nowMs - targetTs) <= 150_000 && livePriceNow > 0) return livePriceNow;
    return null;
  };

  if (rec.status3m === 'BEKLIYOR' && nowMs >= rec.target3mTs) {
    const realized = findPriceAt(rec.target3mTs);
    if (realized && realized > 0 && rec.entryPrice > 0) {
      const actualMovePct = +(((realized - rec.entryPrice) / rec.entryPrice) * 100).toFixed(4);
      const intrabarSlice = bars1m.filter((b) => b.timestamp > rec.bucketTs && b.timestamp <= rec.target3mTs);
      let maxHi = realized;
      let minLo = realized;
      for (const b of intrabarSlice) {
        maxHi = Math.max(maxHi, b.high ?? b.close);
        minLo = Math.min(minLo, b.low ?? b.close);
      }
      const upPct = +(((maxHi - rec.entryPrice) / rec.entryPrice) * 100).toFixed(4);
      const dnPct = +(((minLo - rec.entryPrice) / rec.entryPrice) * 100).toFixed(4);

      let isCorrect = false;
      if (rec.predictedDirection === 'YÜKSELİŞ') {
        isCorrect = actualMovePct > 0;
        rec.maxFavorableMove3mPct = upPct;
        rec.maxAdverseMove3mPct = dnPct;
      } else if (rec.predictedDirection === 'DÜŞÜŞ') {
        isCorrect = actualMovePct < 0;
        rec.maxFavorableMove3mPct = +(-dnPct).toFixed(4);
        rec.maxAdverseMove3mPct = +(-upPct).toFixed(4);
      } else {
        isCorrect = Math.abs(actualMovePct) <= spec.minMovePct * 1.8;
        rec.maxFavorableMove3mPct = upPct;
        rec.maxAdverseMove3mPct = dnPct;
      }

      rec.actualPrice3m = +realized.toFixed(spec.digits);
      rec.actualMove3mPct = actualMovePct;
      rec.evaluatedAtIso = new Date(nowMs).toISOString();
      rec.status3m = isCorrect ? 'DOGRU' : 'YANLIS';

      if (isCorrect) {
        rec.errorCategory = 'YOK';
        rec.errorExplanation = `[${rec.setupType} | ${rec.candlePatternLabel}] Doğrulandı (${actualMovePct >= 0 ? '+' : ''}${actualMovePct}%).`;
      } else {
        const diag = classify3mError(rec, actualMovePct, spec, macro);
        rec.errorCategory = diag.category;
        rec.errorExplanation = diag.explanation;
      }
      changed = true;
    }
  }

  if (rec.status15m === 'BEKLIYOR' && nowMs >= rec.target15mTs) {
    const realized15 = findPriceAt(rec.target15mTs);
    if (realized15 && realized15 > 0 && rec.entryPrice > 0) {
      const mv15 = +(((realized15 - rec.entryPrice) / rec.entryPrice) * 100).toFixed(4);
      rec.actualPrice15m = +realized15.toFixed(spec.digits);
      rec.actualMove15mPct = mv15;
      const dir15 = rec.predicted15mDirection || rec.predictedDirection;
      if (dir15 === 'YÜKSELİŞ') rec.status15m = mv15 > 0 ? 'DOGRU' : 'YANLIS';
      else if (dir15 === 'DÜŞÜŞ') rec.status15m = mv15 < 0 ? 'DOGRU' : 'YANLIS';
      else rec.status15m = Math.abs(mv15) <= spec.minMovePct * 2.5 ? 'DOGRU' : 'YANLIS';
      changed = true;
    }
  }

  return changed;
}

function buildPublicView(store: PersistedLabStore, latestHealth: Map<string, { liveSource: string; delaySec: number }>): ForecastLab3mState {
  const closed3m = store.records.filter((r) => r.status3m === 'DOGRU' || r.status3m === 'YANLIS');
  const liveClosed = closed3m.filter((r) => r.sourceMode === 'CANLI_TICK');
  const dirClosed = closed3m.filter((r) => r.predictedDirection !== 'YATAY');
  const bullClosed = dirClosed.filter((r) => r.predictedDirection === 'YÜKSELİŞ');
  const bearClosed = dirClosed.filter((r) => r.predictedDirection === 'DÜŞÜŞ');
  const flatClosed = closed3m.filter((r) => r.predictedDirection === 'YATAY');
  const closed15m = store.records.filter(
    (r) => (r.status15m === 'DOGRU' || r.status15m === 'YANLIS') && (r.predicted15mDirection || r.predictedDirection) !== 'YATAY'
  );

  const dirWins = dirClosed.filter((r) => r.status3m === 'DOGRU').length;
  const bullWins = bullClosed.filter((r) => r.status3m === 'DOGRU').length;
  const bearWins = bearClosed.filter((r) => r.status3m === 'DOGRU').length;
  const flatWins = flatClosed.filter((r) => r.status3m === 'DOGRU').length;
  const liveDirClosed = liveClosed.filter((r) => r.predictedDirection !== 'YATAY');
  const liveWins = liveDirClosed.filter((r) => r.status3m === 'DOGRU').length;
  const dirWins15 = closed15m.filter((r) => r.status15m === 'DOGRU').length;

  const setups: Exclude<SetupType3m, 'YATAY'>[] = ['CLEAN_TREND', 'PULLBACK_TURN', 'SPIKE_FADE', 'WICK_ABSORPTION'];
  const setupStats: SetupPerformanceCell[] = setups.map((st) => {
    const arr = dirClosed.filter((r) => r.setupType === st);
    const ok = arr.filter((r) => r.status3m === 'DOGRU').length;
    return {
      setupType: st,
      label: SETUP_LABELS[st],
      evaluated: arr.length,
      correct: ok,
      accuracyPct: arr.length ? Math.round((ok / arr.length) * 100) : 0,
    };
  });

  const adaptiveRules: AdaptiveRuleStatus[] = [];
  for (const spec of LAB_TRACKED_ASSETS) {
    for (const st of setups) {
      const enabled =
        st === 'WICK_ABSORPTION' ||
        (st === 'CLEAN_TREND' && spec.enableCleanTrend3m) ||
        (st === 'PULLBACK_TURN' && spec.enablePullbackTurn3m) ||
        (st === 'SPIKE_FADE' && spec.enableSpikeFade3m);
      if (!enabled) continue;
      const stCheck = getAdaptiveSetupStats(store.records, spec.symbol, st);
      if (st === 'WICK_ABSORPTION' && stCheck.count < 3) continue;
      adaptiveRules.push({
        symbol: spec.symbol,
        setupType: st,
        evaluated: stCheck.count,
        accuracyPct: stCheck.count ? Math.round(stCheck.winRate * 100) : 0,
        status: stCheck.isSuppressed ? 'ÖĞRENİLMİŞ_FİLTRE_KAPALI' : stCheck.isBoosted ? 'AKTİF_GÜÇLÜ' : 'NÖTR_İZLENİYOR',
      });
    }
  }

  const symbolStats: Symbol3mStats[] = LAB_TRACKED_ASSETS.map((spec) => {
    const allSym = store.records.filter((r) => r.symbol === spec.symbol);
    const evSym = allSym.filter((r) => r.status3m === 'DOGRU' || r.status3m === 'YANLIS');
    const dirSym = evSym.filter((r) => r.predictedDirection !== 'YATAY');
    const bSym = dirSym.filter((r) => r.predictedDirection === 'YÜKSELİŞ');
    const sSym = dirSym.filter((r) => r.predictedDirection === 'DÜŞÜŞ');
    const ev15 = allSym.filter(
      (r) => (r.status15m === 'DOGRU' || r.status15m === 'YANLIS') && (r.predicted15mDirection || r.predictedDirection) !== 'YATAY'
    );

    const dirOk = dirSym.filter((r) => r.status3m === 'DOGRU').length;
    const totOk = evSym.filter((r) => r.status3m === 'DOGRU').length;
    const ok15 = ev15.filter((r) => r.status15m === 'DOGRU').length;

    const avgAbsErr = evSym.length
      ? +(evSym.reduce((s, r) => s + Math.abs((r.actualMove3mPct ?? 0) - r.predictedMove3mPct), 0) / evSym.length).toFixed(4)
      : 0;

    const errCounts = new Map<ErrorRootCategory, number>();
    for (const r of evSym) {
      if (r.status3m === 'YANLIS' && r.errorCategory !== 'YOK') {
        errCounts.set(r.errorCategory, (errCounts.get(r.errorCategory) || 0) + 1);
      }
    }
    const sortedErr = Array.from(errCounts.entries()).sort((a, b) => b[1] - a[1]);
    const topErr = sortedErr.length ? sortedErr[0][0] : 'YOK';
    const dirAcc = dirSym.length ? Math.round((dirOk / dirSym.length) * 100) : 0;
    const ovAcc = evSym.length ? Math.round((totOk / evSym.length) * 100) : 0;
    const acc15 = ev15.length ? Math.round((ok15 / ev15.length) * 100) : 0;

    let bestSetup: SetupType3m = 'YATAY';
    let bestWr = -1;
    for (const st of setups) {
      const sub = dirSym.filter((r) => r.setupType === st);
      if (sub.length >= 3) {
        const wr = sub.filter((r) => r.status3m === 'DOGRU').length / sub.length;
        if (wr > bestWr) {
          bestWr = wr;
          bestSetup = st;
        }
      }
    }

    const health = latestHealth.get(spec.symbol);
    const lastPred = allSym.length ? allSym[allSym.length - 1] : undefined;

    let recommendedAction = 'v12 Mum + Haber Kalibrasyonu Toplanıyor';
    if (dirSym.length >= 5) {
      if (dirAcc >= 60) recommendedAction = `HAZIR: %${dirAcc} 3dk / %${acc15} 15dk [${bestSetup}]`;
      else if (acc15 >= 62) recommendedAction = `+15dk GÜÇLÜ (%${acc15}): 15dk/1S mum kapanışı tercih et.`;
      else if (dirAcc >= 52) recommendedAction = `SEÇİCİ MOD: %${dirAcc} — ${bestSetup} kurulumunda izleniyor.`;
      else recommendedAction = `KALİBRASYON KISITLI (%${dirAcc}): Hata '${ERROR_META[topErr].label}' filtreleniyor.`;
    }

    return {
      symbol: spec.symbol,
      name: spec.name,
      digits: spec.digits,
      totalPredictions: allSym.length,
      evaluated3m: evSym.length,
      directionalCount3m: dirSym.length,
      directionalCorrect3m: dirOk,
      directionalAccuracy3m: dirAcc,
      bullCount3m: bSym.length,
      bullCorrect3m: bSym.filter((r) => r.status3m === 'DOGRU').length,
      bearCount3m: sSym.length,
      bearCorrect3m: sSym.filter((r) => r.status3m === 'DOGRU').length,
      overallCorrect3m: totOk,
      overallAccuracy3m: ovAcc,
      evaluated15m: ev15.length,
      directionalAccuracy15m: acc15,
      avgAbsErrorPct3m: avgAbsErr,
      topErrorCategory: topErr,
      lastPrediction: lastPred,
      recommendedAction,
      liveDataSource: health?.liveSource || lastPred?.liveSource || 'Bekleniyor',
      liveDataDelaySec: health?.delaySec ?? lastPred?.dataDelaySec ?? 0,
      bestSetupType: bestSetup,
    };
  });

  const wrong3m = dirClosed.filter((r) => r.status3m === 'YANLIS' && r.errorCategory !== 'YOK');
  const errMap = new Map<ErrorRootCategory, number>();
  for (const w of wrong3m) errMap.set(w.errorCategory, (errMap.get(w.errorCategory) || 0) + 1);
  const errorBreakdown: ErrorBreakdownItem[] = Array.from(errMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => ({
      category: cat,
      label: ERROR_META[cat].label,
      count,
      sharePct: wrong3m.length ? Math.round((count / wrong3m.length) * 100) : 0,
      fixHint: ERROR_META[cat].fixHint,
    }));

  const hourBuckets = new Map<number, { ev: number; ok: number }>();
  for (const r of dirClosed) {
    const trHr = (new Date(r.bucketTs).getUTCHours() + 3) % 24;
    const cur = hourBuckets.get(trHr) || { ev: 0, ok: 0 };
    cur.ev++;
    if (r.status3m === 'DOGRU') cur.ok++;
    hourBuckets.set(trHr, cur);
  }
  const hourlyHeatmap: HourlyAccuracyCell[] = Array.from(hourBuckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hr, v]) => ({
      trHour: hr,
      label: `${String(hr).padStart(2, '0')}:00 TR`,
      evaluated: v.ev,
      correct: v.ok,
      accuracyPct: v.ev ? Math.round((v.ok / v.ev) * 100) : 0,
    }));

  const learningInsights: string[] = [];
  const coveragePct = closed3m.length ? Math.round((dirClosed.length / closed3m.length) * 100) : 0;
  const dirAccAll = dirClosed.length ? Math.round((dirWins / dirClosed.length) * 100) : 0;
  const acc15All = closed15m.length ? Math.round((dirWins15 / closed15m.length) * 100) : 0;
  learningInsights.push(
    `Şeffaf Yön Karnesi (YATAY Hariç): +3dk Yön Doğruluğu %${dirAccAll} (${dirWins}/${dirClosed.length} · Aktif Oran %${coveragePct}) · YÜKSELİŞ ${bullWins}/${bullClosed.length} vs DÜŞÜŞ ${bearWins}/${bearClosed.length} · +15dk Yapısal Başarı %${acc15All} (${dirWins15}/${closed15m.length}).`
  );
  const readySyms = symbolStats.filter((s) => s.directionalCount3m >= 5 && s.directionalAccuracy3m >= 58).map((s) => `${s.symbol} (%${s.directionalAccuracy3m})`);
  if (readySyms.length) learningInsights.push(`%58+ Doğruluk Veren Varlıklar: ${readySyms.join(', ')}.`);
  const suppressedCnt = adaptiveRules.filter((r) => r.status === 'ÖĞRENİLMİŞ_FİLTRE_KAPALI').length;
  if (suppressedCnt > 0) learningInsights.push(`Adaptif Öğrenme ${suppressedCnt} zayıf (Varlık × Kurulum) eşleşmesini otomatik devre dışı bıraktı.`);
  if (errorBreakdown.length) {
    const top = errorBreakdown[0];
    learningInsights.push(`Yönlü Hataların Başlıca Nedeni: "${top.label}" (%${top.sharePct}) — ${top.fixHint}`);
  }

  return {
    labId: store.labId,
    version: store.version,
    startedAtIso: store.startedAtIso,
    calibrationDeadlineIso: store.calibrationDeadlineIso,
    continuousLearningActive: true,
    lastTickIso: store.lastTickIso,
    lastBucketTs: store.lastBucketTs,
    totalGeneratedCount: store.records.length,
    totalEvaluated3m: closed3m.length,
    liveTickEvaluated3m: liveDirClosed.length,
    liveTickAccuracy3m: liveDirClosed.length ? Math.round((liveWins / liveDirClosed.length) * 100) : 0,
    directionalEvaluated3m: dirClosed.length,
    directionalCorrect3m: dirWins,
    directionalAccuracy3m: dirAccAll,
    directionalCoveragePct: coveragePct,
    directionalBullishCount: bullClosed.length,
    directionalBullishCorrect: bullWins,
    directionalBullishAccuracy: bullClosed.length ? Math.round((bullWins / bullClosed.length) * 100) : 0,
    directionalBearishCount: bearClosed.length,
    directionalBearishCorrect: bearWins,
    directionalBearishAccuracy: bearClosed.length ? Math.round((bearWins / bearClosed.length) * 100) : 0,
    flatEvaluated3m: flatClosed.length,
    flatCorrect3m: flatWins,
    evaluated15m: closed15m.length,
    directionalAccuracy15m: acc15All,
    macroPulse: store.macroPulse,
    setupStats,
    adaptiveRules,
    symbolStats,
    errorBreakdown,
    hourlyHeatmap,
    learningInsights,
    recentRecords: store.records.slice(-180).reverse(),
  };
}

let inFlightLabTick: Promise<ForecastLab3mState> | null = null;
const latestFeedHealth = new Map<string, { liveSource: string; delaySec: number }>();

export function getLearnedSymbolCalibration(symbol: string): {
  dirAcc3m: number;
  dirAcc15m: number;
  samples3m: number;
  samples15m: number;
  bestSetup: SetupType3m;
  suppressedSetups: SetupType3m[];
} {
  const store = loadStore();
  const ev3 = store.records.filter((r) => r.symbol === symbol && r.predictedDirection !== 'YATAY' && (r.status3m === 'DOGRU' || r.status3m === 'YANLIS'));
  const ev15 = store.records.filter(
    (r) => r.symbol === symbol && (r.predicted15mDirection || r.predictedDirection) !== 'YATAY' && (r.status15m === 'DOGRU' || r.status15m === 'YANLIS')
  );
  const setups: Exclude<SetupType3m, 'YATAY'>[] = ['CLEAN_TREND', 'PULLBACK_TURN', 'SPIKE_FADE', 'WICK_ABSORPTION'];
  const suppressedSetups: SetupType3m[] = [];
  let bestSetup: SetupType3m = 'YATAY';
  let bestWr = -1;
  for (const st of setups) {
    const info = getAdaptiveSetupStats(store.records, symbol, st);
    if (info.isSuppressed) suppressedSetups.push(st);
    if (info.count >= 4 && info.winRate > bestWr) {
      bestWr = info.winRate;
      bestSetup = st;
    }
  }
  return {
    dirAcc3m: ev3.length ? Math.round((ev3.filter((r) => r.status3m === 'DOGRU').length / ev3.length) * 100) : 0,
    dirAcc15m: ev15.length ? Math.round((ev15.filter((r) => r.status15m === 'DOGRU').length / ev15.length) * 100) : 0,
    samples3m: ev3.length,
    samples15m: ev15.length,
    bestSetup,
    suppressedSetups,
  };
}

export async function getForecastLab3mState(): Promise<ForecastLab3mState> {
  const store = loadStore();
  return buildPublicView(store, latestFeedHealth);
}

export async function exportForecastLabCsv(): Promise<string> {
  const store = loadStore();
  const headers = [
    'id',
    'symbol',
    'createdAtIso',
    'sourceMode',
    'sessionLabel',
    'setupType',
    'candlePatternCode',
    'newsDirection',
    'newsConviction',
    'liveSource',
    'dataDelaySec',
    'entryPrice',
    'predictedDirection',
    'predicted15mDirection',
    'predictedPrice3m',
    'predictedMove3mPct',
    'confidencePct',
    'rawEdgeScore',
    'rsi7_3m',
    'er3m',
    'vwapZScore',
    'bodyRatio',
    'lowerWickRatio',
    'upperWickRatio',
    'clv',
    'h1TrendBias',
    'dxyChg3mPct',
    'takerBuyRatio',
    'actualPrice3m',
    'actualMove3mPct',
    'status3m',
    'errorCategory',
    'actualMove15mPct',
    'status15m',
    'errorExplanation',
  ];
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = store.records.map((r) =>
    [
      r.id,
      r.symbol,
      r.createdAtIso,
      r.sourceMode,
      r.sessionLabel,
      r.setupType || 'YATAY',
      r.candlePatternCode || 'DENGE_MUMU',
      r.newsDirection || 'BEKLE',
      r.newsConviction ?? 50,
      r.liveSource,
      r.dataDelaySec,
      r.entryPrice,
      r.predictedDirection,
      r.predicted15mDirection || r.predictedDirection,
      r.predictedPrice3m,
      r.predictedMove3mPct,
      r.confidencePct,
      r.rawEdgeScore,
      r.features.rsi7_3m,
      r.features.er3m,
      r.features.vwapZScore,
      r.features.bodyRatio ?? '',
      r.features.lowerWickRatio ?? '',
      r.features.upperWickRatio ?? '',
      r.features.clv ?? '',
      r.features.h1TrendBias,
      r.features.dxyChg3mPct,
      r.features.takerBuyRatio,
      r.actualPrice3m ?? '',
      r.actualMove3mPct ?? '',
      r.status3m,
      r.errorCategory,
      r.actualMove15mPct ?? '',
      r.status15m,
      r.errorExplanation,
    ]
      .map(esc)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

export async function runForecastLab3mTick(forceGenerateNow = false): Promise<ForecastLab3mState> {
  if (inFlightLabTick) return inFlightLabTick;
  inFlightLabTick = (async () => {
    const store = loadStore();
    const now = Date.now();
    const currentBucket = Math.floor(now / BUCKET_MS) * BUCKET_MS;

    const [macro, liveNews, bundles, hourlyList, depthList, flowList] = await Promise.all([
      fetchMacroPulse(),
      fetchRealFinancialNews().catch(() => [] as any[]),
      Promise.all(LAB_TRACKED_ASSETS.map((a) => fetchReal1mAnd3mHistory(a.symbol))),
      Promise.all(LAB_TRACKED_ASSETS.map((a) => fetchRealHourlyHistory(a.symbol).catch(() => [] as HourlyBar[]))),
      Promise.all(
        LAB_TRACKED_ASSETS.map((a) =>
          a.assetClass === 'CRYPTO' ? fetchCryptoOrderbookImbalance(a.symbol) : Promise.resolve({ ratio: 1, bidVol: 0, askVol: 0 })
        )
      ),
      Promise.all(
        LAB_TRACKED_ASSETS.map((a) =>
          a.assetClass === 'CRYPTO' ? fetchKrakenTradeFlow(a.symbol) : Promise.resolve({ takerBuyRatio: 1, buyVol3m: 0, sellVol3m: 0, tradeCount3m: 0, cvdImbalance: 0 })
        )
      ),
    ]);

    const newsBySym = new Map<string, ReturnType<typeof synthesizeAssetNewsAI>>();
    for (const a of LAB_TRACKED_ASSETS) {
      newsBySym.set(a.symbol, synthesizeAssetNewsAI(a.symbol, liveNews));
    }

    store.macroPulse = macro;
    store.lastTickIso = new Date(now).toISOString();

    const beforeLen = store.records.length;
    store.records = store.records.filter((r) => r.dataDelaySec < 5000);
    let dirty = store.records.length !== beforeLen;
    const byId = new Set(store.records.map((r) => r.id));

    for (let i = 0; i < LAB_TRACKED_ASSETS.length; i++) {
      const spec = LAB_TRACKED_ASSETS[i];
      const bundle = bundles[i];
      if (bundle.bars1m.length > 0) {
        latestFeedHealth.set(spec.symbol, { liveSource: bundle.liveSource, delaySec: bundle.dataDelaySec });
      }
      for (const rec of store.records) {
        if (rec.symbol === spec.symbol && (rec.status3m === 'BEKLIYOR' || rec.status15m === 'BEKLIYOR')) {
          if (evaluateRecordAgainstBars(rec, bundle.bars1m, bundle.livePrice, now, spec, macro)) {
            dirty = true;
          }
        }
      }
    }

    const startReplayBucket = currentBucket - 320 * BUCKET_MS;
    for (let bTs = startReplayBucket; bTs < currentBucket; bTs += BUCKET_MS) {
      for (let i = 0; i < LAB_TRACKED_ASSETS.length; i++) {
        const spec = LAB_TRACKED_ASSETS[i];
        const id = `${spec.symbol}-${bTs}`;
        if (byId.has(id)) continue;
        const bundle = bundles[i];
        const bars1mUpTo = bundle.bars1m.filter((b) => b.timestamp <= bTs);
        if (bars1mUpTo.length < 30) continue;
        const bars1hUpTo = hourlyList[i].filter((b) => b.timestamp <= bTs);
        const entryPx = bars1mUpTo[bars1mUpTo.length - 1].close;

        const causalReplayMacro: MacroPulseSnapshot = {
          ...macro,
          dxyChg3mPct: 0,
          dxyChg15mPct: 0,
          vixChg5mPct: 0,
          us10yChg5mPct: 0,
        };
        const rec = predictNext3Minutes({
          spec,
          bucketTs: bTs,
          bars1mUpTo,
          bars1hUpTo,
          entryPrice: entryPx,
          macro: causalReplayMacro,
          obRatio: 1,
          takerBuyRatio: 1,
          dataDelaySec: 0,
          liveSource: bundle.liveSource,
          sourceMode: 'REPLAY_1M',
          historicalRecords: store.records,
          newsDirection: 'BEKLE',
          newsConviction: 50,
          newsScore: 0,
          newsHeadline: '',
        });
        evaluateRecordAgainstBars(rec, bundle.bars1m, bundle.livePrice, now, spec, causalReplayMacro);
        store.records.push(rec);
        byId.add(id);
        dirty = true;
      }
    }

    if (forceGenerateNow || store.lastBucketTs < currentBucket) {
      let generatedAnyHealthy = false;
      for (let i = 0; i < LAB_TRACKED_ASSETS.length; i++) {
        const spec = LAB_TRACKED_ASSETS[i];
        const id = `${spec.symbol}-${currentBucket}`;
        if (byId.has(id)) {
          generatedAnyHealthy = true;
          continue;
        }
        const bundle = bundles[i];
        const entryPx = bundle.livePrice;
        if (!(entryPx > 0) || bundle.bars1m.length < 15 || bundle.dataDelaySec >= 5000) continue;

        const aiNews = newsBySym.get(spec.symbol);
        const isFreshNews = !!aiNews?.hasNews && !aiNews.isRecapOnly && now - aiNews.newestTimestamp <= 6 * 3600 * 1000;

        const rec = predictNext3Minutes({
          spec,
          bucketTs: currentBucket,
          bars1mUpTo: bundle.bars1m,
          bars1hUpTo: hourlyList[i],
          entryPrice: entryPx,
          macro,
          obRatio: depthList[i].ratio,
          takerBuyRatio: flowList[i].takerBuyRatio,
          dataDelaySec: bundle.dataDelaySec,
          liveSource: bundle.liveSource,
          sourceMode: 'CANLI_TICK',
          historicalRecords: store.records,
          newsDirection: isFreshNews ? aiNews!.direction : 'BEKLE',
          newsConviction: isFreshNews ? aiNews!.convictionScore : 50,
          newsScore: isFreshNews ? aiNews!.netAiScore : 0,
          newsHeadline: isFreshNews ? aiNews!.primaryHeadline : '',
        });
        store.records.push(rec);
        byId.add(id);
        dirty = true;
        generatedAnyHealthy = true;
      }
      if (generatedAnyHealthy) {
        store.lastBucketTs = currentBucket;
        dirty = true;
      }
    }

    if (dirty) {
      store.records.sort((a, b) => a.bucketTs - b.bucketTs || a.symbol.localeCompare(b.symbol));
      saveStore(store);
    }

    return buildPublicView(store, latestFeedHealth);
  })();

  try {
    return await inFlightLabTick;
  } finally {
    inFlightLabTick = null;
  }
}

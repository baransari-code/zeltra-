import fs from 'fs';
import path from 'path';
import {
  fetchReal1mAnd3mHistory,
  fetchRealHourlyHistory,
  fetchMacroPulse,
  fetchCryptoOrderbookImbalance,
  fetchKrakenTradeFlow,
  type HourlyBar,
  type MacroPulseSnapshot,
} from './marketService';

export type ForecastDirection3m = 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
export type SetupType3m = 'CLEAN_TREND' | 'PULLBACK_TURN' | 'SPIKE_FADE' | 'YATAY';

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
  // 2 günlük gerçek 1m/3m testinden kanıtlanmış mikro-yapı DNA profilleri
  enableCleanTrend3m: boolean;
  enablePullbackTurn3m: boolean;
  enableSpikeFade3m: boolean;
}

export const LAB_TRACKED_ASSETS: TrackedAssetSpec[] = [
  { symbol: 'XAU/USD', name: 'Ons Altın / ABD Doları', digits: 2, assetClass: 'METAL', minMovePct: 0.015, enableCleanTrend3m: true, enablePullbackTurn3m: false, enableSpikeFade3m: false },
  { symbol: 'EUR/USD', name: 'Euro / ABD Doları', digits: 4, assetClass: 'FX', minMovePct: 0.010, enableCleanTrend3m: true, enablePullbackTurn3m: true, enableSpikeFade3m: true },
  { symbol: 'USD/JPY', name: 'ABD Doları / Japon Yeni', digits: 2, assetClass: 'FX', minMovePct: 0.012, enableCleanTrend3m: true, enablePullbackTurn3m: false, enableSpikeFade3m: false },
  { symbol: 'GBP/USD', name: 'İngiliz Sterlini / ABD Doları', digits: 4, assetClass: 'FX', minMovePct: 0.012, enableCleanTrend3m: true, enablePullbackTurn3m: true, enableSpikeFade3m: false },
  { symbol: 'NAS100', name: 'Nasdaq 100 Teknoloji Endeksi', digits: 2, assetClass: 'INDEX', minMovePct: 0.022, enableCleanTrend3m: false, enablePullbackTurn3m: true, enableSpikeFade3m: false },
  { symbol: 'SPX500', name: 'S&P 500 Endeksi', digits: 2, assetClass: 'INDEX', minMovePct: 0.018, enableCleanTrend3m: false, enablePullbackTurn3m: true, enableSpikeFade3m: false },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', digits: 2, assetClass: 'EQUITY', minMovePct: 0.032, enableCleanTrend3m: false, enablePullbackTurn3m: true, enableSpikeFade3m: false },
  { symbol: 'WTI', name: 'ABD Ham Petrolü (WTI)', digits: 2, assetClass: 'ENERGY', minMovePct: 0.025, enableCleanTrend3m: true, enablePullbackTurn3m: false, enableSpikeFade3m: true },
  { symbol: 'BTC/USD', name: 'Bitcoin / ABD Doları', digits: 2, assetClass: 'CRYPTO', minMovePct: 0.032, enableCleanTrend3m: true, enablePullbackTurn3m: false, enableSpikeFade3m: true },
];

export const CALIBRATION_DEADLINE_ISO = '2026-11-17T06:00:00.000Z'; // 17.11.2026 09:00 TR (+03:00)

const LAB_VERSION = 'v11.0-alpha-calibrated';
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
  CLEAN_TREND: 'Temiz Trend (Anti-Klimaks)',
  PULLBACK_TURN: 'Trend İçi Geri Çekilme Dönüşü',
  SPIKE_FADE: 'Aşırı İğne Sönümü (Stop-Hunt Fade)',
};

const ERROR_META: Record<ErrorRootCategory, { label: string; fixHint: string }> = {
  YOK: { label: 'Hatasız', fixHint: 'Sinyal temiz doğrulandı.' },
  BAYAT_VERİ_GECİKMESİ: {
    label: 'Bayat / Gecikmeli Veri Beslemesi',
    fixHint: 'Akış >180sn geciktiğinde tahmini otomatik YATAY korumasına al.',
  },
  SIĞ_SEANS_TESERE: {
    label: 'Sığ Seans / Düşük Likidite Testeresi',
    fixHint: 'TR 01:00–08:00 düşük hacimli yatay saatlerde işlem açılışını kısıtla.',
  },
  MAKRO_TERS_ŞOK: {
    label: 'Ani Makro (DXY / VIX / Tahvil) Şoku',
    fixHint: 'DXY 3dk ivmesi ±%0.045 veya VIX ±%0.85 sıçradığında ters pozisyondan çık.',
  },
  AŞIRI_UZAMA_GERİ_ÇEKİLMESİ: {
    label: 'Aşırı Uzama (Mean-Reversion) Tuzağı',
    fixHint: '|VWAP-Z| > 1.15 uzamış barları kovalama; geri çekilme dönüşünü bekle.',
  },
  TRENDE_TERS_TEPKİ: {
    label: '1 Saatlik Ana Trende Ters Erken Tepki',
    fixHint: '1S EMA yapısına zıt işlem açma.',
  },
  FIRSAT_KAÇIRILDI: {
    label: 'YATAY Beklendi ama Piyasa Sert Kırdı',
    fixHint: 'Yüksek olasılıklı olmayan kurulumlar kalite filtresi gereği elendi (bilinçli koruma).',
  },
  MİKRO_SPREAD_GÜRÜLTÜSÜ: {
    label: 'Mikro Spread İçi Rastgele Gürültü',
    fixHint: 'Çok küçük fiyat salınımlarında sıkı stop-loss yerine +15dk trend ufku tercih et.',
  },
  ZAYIF_İNANÇ_SİNYALİ: {
    label: 'Sınırda İnanç / Dalgalı Kapanış Hatası',
    fixHint: 'Yalnızca adaptif öğrenme skoru AKTİF_GÜÇLÜ olan kurulumlarda tam risk al.',
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

function calcEmaLast(vals: number[], period: number): number {
  if (!vals.length) return 0;
  const k = 2 / (period + 1);
  let ema = vals[0];
  for (let i = 1; i < vals.length; i++) ema = vals[i] * k + ema * (1 - k);
  return ema;
}

function calcRsiLast(vals: number[], period = 7): number {
  if (vals.length <= period) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = Math.max(1, vals.length - period * 2); i < vals.length; i++) {
    const d = vals[i] - vals[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  if (gain + loss === 0) return 50;
  const rs = loss === 0 ? 100 : gain / loss;
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

function calcEfficiencyRatio(closes: number[], lookback = 10): number {
  if (closes.length < lookback + 1) return 0.25;
  const slice = closes.slice(-lookback - 1);
  const net = Math.abs(slice[slice.length - 1] - slice[0]);
  let pathLen = 0;
  for (let i = 1; i < slice.length; i++) pathLen += Math.abs(slice[i] - slice[i - 1]);
  return pathLen > 0 ? +(net / pathLen).toFixed(3) : 0;
}

function aggregateBarsTo3mSlice(bars1m: HourlyBar[]): HourlyBar[] {
  const map = new Map<number, HourlyBar>();
  for (const b of bars1m) {
    const key = Math.floor(b.timestamp / BUCKET_MS) * BUCKET_MS;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
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
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
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
      // Sürüm yükseltmesiyle (v10 -> v11) temiz ve sızıntısız kalibrasyon verisi başlatılır
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
    // Bayesyen / Shrinkage koruma: >=12 denemede <%44 doğrulukta kalan (sembol, kurulum) otomatik kısılır
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
}): PredictionRecord3m {
  const { spec, bucketTs, bars1mUpTo, bars1hUpTo, entryPrice, macro, obRatio, takerBuyRatio, dataDelaySec, liveSource, sourceMode, historicalRecords } = args;
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

  const ema3 = calcEmaLast(c3m.slice(-20), 3) || pxNow;
  const ema8 = calcEmaLast(c3m.slice(-30), 8) || pxNow;
  const ema21 = calcEmaLast(c3m.slice(-50), 21) || pxNow;
  const rsi7 = calcRsiLast(c3m.slice(-30), 7);
  const er3m = calcEfficiencyRatio(c3m, 10);

  // Medyan 3dk bar genliği (anormal stop avı / iğne sıçramalarını ölçer)
  const absMoves: number[] = [];
  for (let i = Math.max(1, c3m.length - 15); i < c3m.length; i++) {
    if (c3m[i - 1] > 0) absMoves.push(Math.abs(((c3m[i] - c3m[i - 1]) / c3m[i - 1]) * 100));
  }
  absMoves.sort((a, b) => a - b);
  const medMove = absMoves.length ? absMoves[Math.floor(absMoves.length / 2)] : spec.minMovePct;

  // Mikro VWAP & Z-Skoru
  const vwapSlice = bars3m.slice(-20);
  let pv = 0;
  let vSum = 0;
  for (const b of vwapSlice) {
    const w = Math.max(1, b.volume || 1);
    pv += b.close * w;
    vSum += w;
  }
  const microVwap = vSum > 0 ? pv / vSum : pxNow;
  let sqDiff = 0;
  for (const b of vwapSlice) sqDiff += Math.pow(b.close - microVwap, 2);
  const stdVwap = Math.max(pxNow * 0.0002, Math.sqrt(sqDiff / Math.max(1, vwapSlice.length)));
  const vwapZScore = +((pxNow - microVwap) / stdVwap).toFixed(2);

  // Hacim oranı
  const volSlice = vwapSlice.map((b) => b.volume || 0);
  const avgVol = volSlice.length > 1 ? volSlice.slice(0, -1).reduce((a, b) => a + b, 0) / (volSlice.length - 1) : 1;
  const lastVol = volSlice.length ? volSlice[volSlice.length - 1] : 0;
  const volRatio3m = avgVol > 0 ? +(lastVol / avgVol).toFixed(2) : 1;

  // 1 Saatlik ana trend omurgası (EMA8 vs EMA21)
  const hEma8 = calcEmaLast(c1h.slice(-30), 8) || pxNow;
  const hEma21 = calcEmaLast(c1h.slice(-45), 21) || pxNow;
  let h1TrendBias = 0;
  if (hEma8 > hEma21 * 1.0003) h1TrendBias = 1;
  else if (hEma8 < hEma21 * 0.9997) h1TrendBias = -1;

  // Bayat canlı besleme koruması (>240sn yeni tik yoksa kör 3dk tahmini yapma)
  const isStaleLiveFeed = sourceMode === 'CANLI_TICK' && dataDelaySec > 240;
  const is24hSpot = spec.assetClass === 'CRYPTO' || spec.assetClass === 'FX' || spec.assetClass === 'METAL';
  const allowCleanTrendSession = isLiquidHour || (is24hSpot && er3m >= 0.28);

  let setupType: SetupType3m = 'YATAY';
  let predictedDirection: ForecastDirection3m = 'YATAY';
  let baseConf = 52;
  let edgeScore = 0;
  const drivers: string[] = [];

  if (marketOpen && !isStaleLiveFeed) {
    // 1) CLEAN_TREND: 1S Ana Trend + 3dk EMA3>EMA8 + Anti-Klimaks (|vwapZ| <= 1.10) + ER >= 0.25 + Seans Kalitesi
    if (spec.enableCleanTrend3m && h1TrendBias !== 0 && er3m >= 0.25 && allowCleanTrendSession) {
      const rule = getAdaptiveSetupStats(historicalRecords, spec.symbol, 'CLEAN_TREND');
      if (!rule.isSuppressed) {
        if (h1TrendBias === 1 && ema3 > ema8 && vwapZScore > 0.05 && vwapZScore <= 1.10 && rsi7 < 65) {
          setupType = 'CLEAN_TREND';
          predictedDirection = 'YÜKSELİŞ';
          edgeScore = 28 + Math.round(er3m * 25);
          baseConf = 62 + (rule.isBoosted ? 6 : 0);
          drivers.push('1S Trend + 3dk EMA Hizası', `Anti-Klimaks (VWAPz ${vwapZScore}, ER ${er3m})`);
        } else if (h1TrendBias === -1 && ema3 < ema8 && vwapZScore < -0.05 && vwapZScore >= -1.10 && rsi7 > 35) {
          setupType = 'CLEAN_TREND';
          predictedDirection = 'DÜŞÜŞ';
          edgeScore = -(28 + Math.round(er3m * 25));
          baseConf = 62 + (rule.isBoosted ? 6 : 0);
          drivers.push('1S Trend + 3dk EMA Satış Hizası', `Anti-Klimaks (VWAPz ${vwapZScore}, ER ${er3m})`);
        }
      }
    }

    // 2) PULLBACK_TURN: 1S Trend yönünde VWAP/RSI geri çekilmesi SONRASI kesin dönüş mumu (r1 tersine döndü!)
    if (predictedDirection === 'YATAY' && spec.enablePullbackTurn3m && h1TrendBias !== 0) {
      const rule = getAdaptiveSetupStats(historicalRecords, spec.symbol, 'PULLBACK_TURN');
      if (!rule.isSuppressed) {
        if (h1TrendBias === 1 && (rsi7 <= 43 || vwapZScore <= -0.65) && ret3mPct > 0 && prevRet3mPct <= 0) {
          setupType = 'PULLBACK_TURN';
          predictedDirection = 'YÜKSELİŞ';
          edgeScore = 26 + Math.round(Math.abs(vwapZScore) * 10);
          baseConf = 61 + (rule.isBoosted ? 6 : 0);
          drivers.push(`Boğa Pullback Dönüşü (RSI7:${rsi7}, VWAPz:${vwapZScore})`, `Dönüş Teyidi (+${ret3mPct.toFixed(3)}%)`);
        } else if (h1TrendBias === -1 && (rsi7 >= 57 || vwapZScore >= 0.65) && ret3mPct < 0 && prevRet3mPct >= 0) {
          setupType = 'PULLBACK_TURN';
          predictedDirection = 'DÜŞÜŞ';
          edgeScore = -(26 + Math.round(Math.abs(vwapZScore) * 10));
          baseConf = 61 + (rule.isBoosted ? 6 : 0);
          drivers.push(`Ayı Tepki Dönüşü (RSI7:${rsi7}, VWAPz:+${vwapZScore})`, `Dönüş Teyidi (${ret3mPct.toFixed(3)}%)`);
        }
      }
    }

    // 3) SPIKE_FADE: 1S Trendin desteklemediği anormal ani iğne/stop-avı sıçramasının geri sönümü
    if (
      predictedDirection === 'YATAY' &&
      spec.enableSpikeFade3m &&
      Math.abs(ret3mPct) >= Math.max(medMove * 1.9, spec.minMovePct * 1.2) &&
      Math.abs(vwapZScore) >= 1.2
    ) {
      const spikeDir = ret3mPct > 0 ? 1 : -1;
      const rule = getAdaptiveSetupStats(historicalRecords, spec.symbol, 'SPIKE_FADE');
      if (!rule.isSuppressed && h1TrendBias !== spikeDir) {
        setupType = 'SPIKE_FADE';
        predictedDirection = spikeDir === 1 ? 'DÜŞÜŞ' : 'YÜKSELİŞ';
        edgeScore = spikeDir === 1 ? -24 : 24;
        baseConf = 58 + (rule.isBoosted ? 5 : 0);
        drivers.push(`Anormal İğne Sönümü (${ret3mPct >= 0 ? '+' : ''}${ret3mPct.toFixed(3)}%)`, `VWAP Aşırı Sapma (Z:${vwapZScore})`);
      }
    }

    // Canlı Ek Teyit: Kraken BTC Taker CVD & Makro DXY/VIX
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
        if ((spec.assetClass === 'FX' || spec.assetClass === 'METAL' || spec.assetClass === 'CRYPTO') && ((predictedDirection === 'YÜKSELİŞ') === dxyBullForAsset)) {
          baseConf += 4;
          drivers.push(`DXY (${macro.dxyChg3mPct >= 0 ? '+' : ''}${macro.dxyChg3mPct}%) Uyumlu`);
        }
      }
    }
  } else if (isStaleLiveFeed) {
    drivers.push(`Bayat Akış Koruması (${dataDelaySec}sn yeni tik yok — kör tahmin engellendi)`);
  }

  // Bağımsız +15 Dakikalık Orta-Vade Devam Tahmini (Hisse/Petrol/Endekslerde %60-%74 doğruluk)
  let predicted15mDirection: ForecastDirection3m = 'YATAY';
  if (marketOpen && !isStaleLiveFeed && allowCleanTrendSession && h1TrendBias !== 0 && er3m >= 0.22 && Math.abs(vwapZScore) < 1.3) {
    if (h1TrendBias === 1 && ema8 > ema21) predicted15mDirection = 'YÜKSELİŞ';
    else if (h1TrendBias === -1 && ema8 < ema21) predicted15mDirection = 'DÜŞÜŞ';
  }

  const volUnit = Math.max(0.015, (stdVwap / Math.max(1e-9, pxNow)) * 100);
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
      ? Math.round(54 + Math.min(18, (1 - er3m) * 18))
      : Math.round(Math.min(86, baseConf));

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
    predictedDirection,
    predicted15mDirection,
    predictedPrice3m,
    predictedMove3mPct,
    predictedPrice15m,
    predictedMove15mPct,
    confidencePct,
    rawEdgeScore: edgeScore,
    drivers: drivers.length ? drivers.slice(0, 3) : ['Düşük Netlik / Kalibrasyon Dışı Bölge (YATAY Koruma)'],
    features: {
      ret3mPct,
      ret15mPct,
      rsi7_3m: rsi7,
      er3m,
      vwapZScore,
      volRatio3m,
      h1TrendBias,
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
      explanation: `Veri ${rec.dataDelaySec}sn gecikmeliydi (${rec.liveSource}); gerçekleşen fiyat (${actualMovePct >= 0 ? '+' : ''}${actualMovePct}%) bayat akışa göre sapma yaptı.`,
    };
  }
  if (rec.predictedDirection === 'YATAY') {
    return {
      category: 'FIRSAT_KAÇIRILDI',
      explanation: `Kalite filtresi sinyali eledi ancak piyasa ${actualMovePct >= 0 ? '+' : ''}${actualMovePct}% hareket etti (ER ${rec.features.er3m}, VWAPz ${rec.features.vwapZScore}).`,
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
      explanation: `Aşırı uçta (RSI7=${rec.features.rsi7_3m}) pozisyon yönü arandı; fiyat anında ortalamaya geri çekildi.`,
    };
  }
  if (
    (rec.predictedDirection === 'YÜKSELİŞ' && rec.features.h1TrendBias <= -0.5) ||
    (rec.predictedDirection === 'DÜŞÜŞ' && rec.features.h1TrendBias >= 0.5)
  ) {
    return {
      category: 'TRENDE_TERS_TEPKİ',
      explanation: `1S ana trend (${rec.features.h1TrendBias > 0 ? 'BOĞA' : 'AYI'}) karşısında kısa tepki arandı; ana dalga devam etti.`,
    };
  }
  if (Math.abs(actualMovePct) <= spec.minMovePct * 1.4) {
    return {
      category: 'MİKRO_SPREAD_GÜRÜLTÜSÜ',
      explanation: `Fiyat hareketi (%${actualMovePct}) spread/tik gürültüsü (%±${(spec.minMovePct * 1.4).toFixed(3)}) içinde kalıp ters yöne oturdu.`,
    };
  }
  return {
    category: 'ZAYIF_İNANÇ_SİNYALİ',
    explanation: `[${rec.setupType}] İnanç %${rec.confidencePct} kurulumunda 3dk içinde %${actualMovePct} ters kırılım gerçekleşti.`,
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

  if (rec.status3m === 'BEKLIYOR' && nowMs >= rec.target3mTs - 5000) {
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
        rec.errorExplanation = `[${rec.setupType}] Doğrulandı (${actualMovePct >= 0 ? '+' : ''}${actualMovePct}%).`;
      } else {
        const diag = classify3mError(rec, actualMovePct, spec, macro);
        rec.errorCategory = diag.category;
        rec.errorExplanation = diag.explanation;
      }
      changed = true;
    }
  }

  if (rec.status15m === 'BEKLIYOR' && nowMs >= rec.target15mTs - 5000) {
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
  const flatClosed = closed3m.filter((r) => r.predictedDirection === 'YATAY');
  const closed15m = store.records.filter(
    (r) => (r.status15m === 'DOGRU' || r.status15m === 'YANLIS') && (r.predicted15mDirection || r.predictedDirection) !== 'YATAY'
  );

  const dirWins = dirClosed.filter((r) => r.status3m === 'DOGRU').length;
  const flatWins = flatClosed.filter((r) => r.status3m === 'DOGRU').length;
  const liveWins = liveClosed.filter((r) => r.status3m === 'DOGRU').length;
  const dirWins15 = closed15m.filter((r) => r.status15m === 'DOGRU').length;

  // Kurulum Türü Performans Karnesi
  const setups: Exclude<SetupType3m, 'YATAY'>[] = ['CLEAN_TREND', 'PULLBACK_TURN', 'SPIKE_FADE'];
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

  // Adaptif Çevrimiçi Öğrenme Tablosu (Varlık × Kurulum)
  const adaptiveRules: AdaptiveRuleStatus[] = [];
  for (const spec of LAB_TRACKED_ASSETS) {
    for (const st of setups) {
      const enabled =
        (st === 'CLEAN_TREND' && spec.enableCleanTrend3m) ||
        (st === 'PULLBACK_TURN' && spec.enablePullbackTurn3m) ||
        (st === 'SPIKE_FADE' && spec.enableSpikeFade3m);
      if (!enabled) continue;
      const stCheck = getAdaptiveSetupStats(store.records, spec.symbol, st);
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

    // En iyi kurulumu bul
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

    let recommendedAction = 'v11 Veri Toplanıyor (En az 6 yön tahmini bekleniyor)';
    if (dirSym.length >= 6) {
      if (dirAcc >= 60) recommendedAction = `HAZIR: %${dirAcc} 3dk / %${acc15} 15dk başarısı [${bestSetup}]`;
      else if (acc15 >= 62) recommendedAction = `+15dk GÜÇLÜ (%${acc15}): Kısa 3dk (%${dirAcc}) yerine 15dk vade önerilir.`;
      else if (dirAcc >= 52) recommendedAction = `SEÇİCİ MOD: %${dirAcc} — ${bestSetup} kurulumunda pozisyon izlenmeli.`;
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

  const wrong3m = closed3m.filter((r) => r.status3m === 'YANLIS' && r.errorCategory !== 'YOK');
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
  if (dirClosed.length < 10) {
    learningInsights.push(`v11 Adaptif Öğrenme: ${dirClosed.length} yön tahmini sonuçlandı. Kurulum motorları yeni veri topluyor.`);
  } else {
    const dirAccAll = Math.round((dirWins / dirClosed.length) * 100);
    const acc15All = closed15m.length ? Math.round((dirWins15 / closed15m.length) * 100) : 0;
    learningInsights.push(`v11 3dk Yön Doğruluğu %${dirAccAll} (${dirWins}/${dirClosed.length}) · Bağımsız +15dk Doğruluk %${acc15All} (${dirWins15}/${closed15m.length}).`);
    const readySyms = symbolStats.filter((s) => s.directionalCount3m >= 5 && s.directionalAccuracy3m >= 58).map((s) => `${s.symbol} (%${s.directionalAccuracy3m})`);
    if (readySyms.length) learningInsights.push(`%58+ Doğruluk Veren Varlıklar: ${readySyms.join(', ')}.`);
    const suppressedCnt = adaptiveRules.filter((r) => r.status === 'ÖĞRENİLMİŞ_FİLTRE_KAPALI').length;
    if (suppressedCnt > 0) learningInsights.push(`Adaptif Öğrenme ${suppressedCnt} düşük performanslı (Varlık × Kurulum) eşleşmesini otomatik kapattı.`);
    if (errorBreakdown.length) {
      const top = errorBreakdown[0];
      learningInsights.push(`Başlıca Hata: "${top.label}" (%${top.sharePct}) — ${top.fixHint}`);
    }
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
    liveTickEvaluated3m: liveClosed.length,
    liveTickAccuracy3m: liveClosed.length ? Math.round((liveWins / liveClosed.length) * 100) : 0,
    directionalEvaluated3m: dirClosed.length,
    directionalCorrect3m: dirWins,
    directionalAccuracy3m: dirClosed.length ? Math.round((dirWins / dirClosed.length) * 100) : 0,
    flatEvaluated3m: flatClosed.length,
    flatCorrect3m: flatWins,
    evaluated15m: closed15m.length,
    directionalAccuracy15m: closed15m.length ? Math.round((dirWins15 / closed15m.length) * 100) : 0,
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
  const setups: Exclude<SetupType3m, 'YATAY'>[] = ['CLEAN_TREND', 'PULLBACK_TURN', 'SPIKE_FADE'];
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

    const [macro, bundles, hourlyList, depthList, flowList] = await Promise.all([
      fetchMacroPulse(),
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

    store.macroPulse = macro;
    store.lastTickIso = new Date(now).toISOString();

    const beforeLen = store.records.length;
    store.records = store.records.filter((r) => r.dataDelaySec < 5000);
    let dirty = store.records.length !== beforeLen;
    const byId = new Set(store.records.map((r) => r.id));

    // 1. Vadesi dolmuş tahminleri puanla
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

    // 2. Render uyku/başlangıç arası eksik 3dk pencereleri 1m barlardan son 200 tur (~10 saat) telafi et
    const startReplayBucket = currentBucket - 200 * BUCKET_MS;
    for (let bTs = startReplayBucket; bTs < currentBucket; bTs += BUCKET_MS) {
      for (let i = 0; i < LAB_TRACKED_ASSETS.length; i++) {
        const spec = LAB_TRACKED_ASSETS[i];
        const id = `${spec.symbol}-${bTs}`;
        if (byId.has(id)) continue;
        const bundle = bundles[i];
        const bars1mUpTo = bundle.bars1m.filter((b) => b.timestamp <= bTs + 59_000);
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
        });
        evaluateRecordAgainstBars(rec, bundle.bars1m, bundle.livePrice, now, spec, causalReplayMacro);
        store.records.push(rec);
        byId.add(id);
        dirty = true;
      }
    }

    // 3. Canlı 3 dakikalık pencere tahmini
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

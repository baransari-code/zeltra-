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

  // Tahmin anındaki piyasa & indikatör görüntüsü (Hata analizi için eksiksiz kanıt)
  entryPrice: number;
  predictedDirection: ForecastDirection3m;
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

  // +3 Dakika Gerçekleşen Sonuç
  status3m: 'BEKLIYOR' | 'DOGRU' | 'YANLIS' | 'PİYASA_KAPALI';
  evaluatedAtIso?: string;
  actualPrice3m?: number;
  actualMove3mPct?: number;
  maxFavorableMove3mPct?: number;
  maxAdverseMove3mPct?: number;
  errorCategory: ErrorRootCategory;
  errorExplanation: string;

  // +15 Dakika Gerçekleşen Takip
  status15m: 'BEKLIYOR' | 'DOGRU' | 'YANLIS' | 'PİYASA_KAPALI';
  actualPrice15m?: number;
  actualMove15mPct?: number;
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
}

export const LAB_TRACKED_ASSETS: TrackedAssetSpec[] = [
  { symbol: 'XAU/USD', name: 'Ons Altın / ABD Doları', digits: 2, assetClass: 'METAL', minMovePct: 0.015 },
  { symbol: 'EUR/USD', name: 'Euro / ABD Doları', digits: 4, assetClass: 'FX', minMovePct: 0.010 },
  { symbol: 'USD/JPY', name: 'ABD Doları / Japon Yeni', digits: 2, assetClass: 'FX', minMovePct: 0.012 },
  { symbol: 'GBP/USD', name: 'İngiliz Sterlini / ABD Doları', digits: 4, assetClass: 'FX', minMovePct: 0.012 },
  { symbol: 'NAS100', name: 'Nasdaq 100 Teknoloji Endeksi', digits: 2, assetClass: 'INDEX', minMovePct: 0.022 },
  { symbol: 'SPX500', name: 'S&P 500 Endeksi', digits: 2, assetClass: 'INDEX', minMovePct: 0.018 },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', digits: 2, assetClass: 'EQUITY', minMovePct: 0.032 },
  { symbol: 'WTI', name: 'ABD Ham Petrolü (WTI)', digits: 2, assetClass: 'ENERGY', minMovePct: 0.025 },
  { symbol: 'BTC/USD', name: 'Bitcoin / ABD Doları', digits: 2, assetClass: 'CRYPTO', minMovePct: 0.032 },
];

export const CALIBRATION_DEADLINE_ISO = '2026-11-17T06:00:00.000Z'; // 17.11.2026 09:00 TR (+03:00)

const LAB_FILE = path.resolve(process.cwd(), 'data', 'forecast_lab_3m.json');
const MAX_STORED_RECORDS = 4500; // ~25 saatlik 9 varlık x 3dk tam kayıt
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

const ERROR_META: Record<ErrorRootCategory, { label: string; fixHint: string }> = {
  YOK: { label: 'Hatasız', fixHint: 'Sinyal temiz doğrulandı.' },
  BAYAT_VERİ_GECİKMESİ: {
    label: 'Bayat / Gecikmeli Veri Beslemesi',
    fixHint: 'Akış >180sn geciktiğinde tahmini otomatik dondur veya spot/ETF proxy kullan.',
  },
  SIĞ_SEANS_TESERE: {
    label: 'Sığ Seans / Düşük Likidite Testeresi',
    fixHint: 'TR 01:00–08:00 düşük hacimli yatay saatlerde işlem/tahmin eşiğini yükselt.',
  },
  MAKRO_TERS_ŞOK: {
    label: 'Ani Makro (DXY / VIX / Tahvil) Şoku',
    fixHint: 'DXY 3dk ivmesi ±%0.04 veya VIX ±%0.8 sıçradığında ters pozisyon açma.',
  },
  AŞIRI_UZAMA_GERİ_ÇEKİLMESİ: {
    label: 'Aşırı Uzama (Mean-Reversion) Tuzağı',
    fixHint: '3dk RSI7 > 76 iken AL veya < 24 iken SAT kovalamak yerine geri çekilme bekle.',
  },
  TRENDE_TERS_TEPKİ: {
    label: '1 Saatlik Ana Trende Ters Erken Tepki',
    fixHint: '1S EMA yapısı güçlü trenddeyken kısa vadeli tepki aramak yerine sadece trend yönünü al.',
  },
  FIRSAT_KAÇIRILDI: {
    label: 'YATAY Dedik ama Piyasa Sert Kırdı',
    fixHint: 'Mikro kırılım / hacim patlaması eşiklerini biraz gevşeterek fırsat hacmini artır.',
  },
  MİKRO_SPREAD_GÜRÜLTÜSÜ: {
    label: 'Mikro Spread İçi Rastgele Gürültü',
    fixHint: 'Hedef getirisi spread maliyetinden düşük mikro kıpırdanmalarda sinyal üretme.',
  },
  ZAYIF_İNANÇ_SİNYALİ: {
    label: 'Düşük İnanç / Sınırda Sinyal Hatası',
    fixHint: 'Doğruluğu artırmak için yalnızca güven >= %58 olan sinyallerde işlem aç.',
  },
};

function isAssetMarketOpenAt(spec: TrackedAssetSpec, ts: number): boolean {
  if (spec.assetClass === 'CRYPTO') return true;
  const d = new Date(ts);
  const day = d.getUTCDay();
  const minUtc = d.getUTCHours() * 60 + d.getUTCMinutes();
  // Hafta sonu (Cumartesi / Pazar 22:00 UTC öncesi) küresel TradFi kapalı
  if (day === 6) return false;
  if (day === 0 && minUtc < 22 * 60) return false;
  if (day === 5 && minUtc >= 22 * 60) return false;
  // NVDA: Pre-market (09:00 UTC) + Regular + After-hours (01:00 UTC ertesi gün) dışında kapalı
  if (spec.symbol === 'NVDA') {
    const isExtendedHours = minUtc >= 9 * 60 || minUtc < 60;
    return isExtendedHours;
  }
  // CME Günlük 1 saatlik bakım arası (22:00 - 23:00 UTC)
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

function loadStore(): PersistedLabStore {
  if (fs.existsSync(LAB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(LAB_FILE, 'utf-8'));
      if (parsed && Array.isArray(parsed.records)) return parsed;
    } catch {
      // ignore corrupted
    }
  }
  const nowIso = new Date().toISOString();
  return {
    labId: 'ZELTRA-3M-CALIBRATION-LAB',
    version: 'v10.0-3m-lab',
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

function computeHistoricalBiasAdjustment(records: PredictionRecord3m[], symbol: string): { longWinRate: number; shortWinRate: number; sampleCount: number } {
  const closed = records.filter(
    (r) => r.symbol === symbol && r.status3m !== 'BEKLIYOR' && r.status3m !== 'PİYASA_KAPALI' && r.predictedDirection !== 'YATAY'
  );
  const recent = closed.slice(-40);
  const longs = recent.filter((r) => r.predictedDirection === 'YÜKSELİŞ');
  const shorts = recent.filter((r) => r.predictedDirection === 'DÜŞÜŞ');
  return {
    longWinRate: longs.length >= 4 ? longs.filter((r) => r.status3m === 'DOGRU').length / longs.length : 0.55,
    shortWinRate: shorts.length >= 4 ? shorts.filter((r) => r.status3m === 'DOGRU').length / shorts.length : 0.55,
    sampleCount: recent.length,
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

  const pxNow = entryPrice > 0 ? entryPrice : c3m.length ? c3m[c3m.length - 1] : c1h.length ? c1h[c1h.length - 1] : 0;
  const ret3mPct = c3m.length >= 2 && c3m[c3m.length - 2] > 0 ? +(((pxNow - c3m[c3m.length - 2]) / c3m[c3m.length - 2]) * 100).toFixed(4) : 0;
  const ret6mPct = c3m.length >= 3 && c3m[c3m.length - 3] > 0 ? +(((pxNow - c3m[c3m.length - 3]) / c3m[c3m.length - 3]) * 100).toFixed(4) : ret3mPct;
  const ret15mPct = c3m.length >= 6 && c3m[c3m.length - 6] > 0 ? +(((pxNow - c3m[c3m.length - 6]) / c3m[c3m.length - 6]) * 100).toFixed(4) : ret6mPct;

  const ema3 = calcEmaLast(c3m.slice(-20), 3) || pxNow;
  const ema8 = calcEmaLast(c3m.slice(-30), 8) || pxNow;
  const ema21 = calcEmaLast(c3m.slice(-50), 21) || pxNow;
  const rsi7 = calcRsiLast(c3m.slice(-30), 7);
  const er3m = calcEfficiencyRatio(c3m, 10);

  // Mikro VWAP & 3dk volatilite (son 20 x 3m bar = 1 saat)
  const vwapSlice = bars3m.slice(-20);
  let pv = 0;
  let vSum = 0;
  let sqDiff = 0;
  for (const b of vwapSlice) {
    const w = Math.max(1, b.volume || 1);
    pv += b.close * w;
    vSum += w;
  }
  const microVwap = vSum > 0 ? pv / vSum : pxNow;
  for (const b of vwapSlice) sqDiff += Math.pow(b.close - microVwap, 2);
  const stdVwap = Math.max(pxNow * 0.00025, Math.sqrt(sqDiff / Math.max(1, vwapSlice.length)));
  const vwapZScore = +((pxNow - microVwap) / stdVwap).toFixed(2);

  // Hacim oranı
  const volSlice = vwapSlice.map((b) => b.volume || 0);
  const avgVol = volSlice.length > 1 ? volSlice.slice(0, -1).reduce((a, b) => a + b, 0) / (volSlice.length - 1) : 1;
  const lastVol = volSlice.length ? volSlice[volSlice.length - 1] : 0;
  const volRatio3m = avgVol > 0 ? +(lastVol / avgVol).toFixed(2) : 1;

  // 1 Saatlik ana trend eğilimi
  const hEma8 = calcEmaLast(c1h.slice(-40), 8) || pxNow;
  const hEma21 = calcEmaLast(c1h.slice(-60), 21) || pxNow;
  const hEma50 = calcEmaLast(c1h.slice(-100), 50) || pxNow;
  let h1TrendBias = 0;
  if (hEma8 > hEma21 && hEma21 >= hEma50 * 0.999) h1TrendBias = 1;
  else if (hEma8 < hEma21 && hEma21 <= hEma50 * 1.001) h1TrendBias = -1;
  else if (pxNow > hEma21 * 1.0008) h1TrendBias = 0.5;
  else if (pxNow < hEma21 * 0.9992) h1TrendBias = -0.5;

  // Çok-faktörlü Mikroyapı Skorlaması (-100 .. +100 arası saf yön puanı)
  let edgeScore = 0;
  const drivers: string[] = [];

  // 1) Ana 1S Trend Omurgası (±12: Tek başına kör sinyal üretmez, 3dk teyitle birleşir)
  edgeScore += h1TrendBias * 12;
  if (Math.abs(h1TrendBias) >= 0.5) {
    drivers.push(`1S Trend ${h1TrendBias > 0 ? 'Yukarı' : 'Aşağı'}`);
  }

  // 2) 3dk EMA Dizilimi & İvme (±24)
  if (ema3 > ema8 && ema8 > ema21) {
    edgeScore += 22;
    drivers.push('3dk EMA(3>8>21) Alış Hizası');
  } else if (ema3 < ema8 && ema8 < ema21) {
    edgeScore -= 22;
    drivers.push('3dk EMA(3<8<21) Satış Hizası');
  } else if (ema3 > ema8) {
    edgeScore += 10;
  } else if (ema3 < ema8) {
    edgeScore -= 10;
  }

  // 3) Kısa Vade Momentum vs Aşırı Uzama Dengesi (±18)
  const momRaw = ret3mPct * 0.45 + ret6mPct * 0.35 + ret15mPct * 0.2;
  const volUnit = Math.max(0.015, (stdVwap / Math.max(1e-9, pxNow)) * 100);
  const momZ = Math.max(-2.5, Math.min(2.5, momRaw / volUnit));
  const isMeanRevAsset = spec.assetClass === 'FX' || spec.assetClass === 'CRYPTO';
  const hiRsiLim = isMeanRevAsset ? 71 : 77;
  const loRsiLim = isMeanRevAsset ? 29 : 23;
  const zLim = isMeanRevAsset ? 1.45 : 1.8;

  if (rsi7 > hiRsiLim && vwapZScore > zLim) {
    // Aşırı alım geri çekilme uyarısı: momentumu kovalamayı kes, tepki düzeltmesi öngör
    edgeScore -= isMeanRevAsset ? 20 : 16;
    drivers.push(`RSI7(${rsi7}) Aşırı Şişme Düzeltme Riski`);
  } else if (rsi7 < loRsiLim && vwapZScore < -zLim) {
    edgeScore += isMeanRevAsset ? 20 : 16;
    drivers.push(`RSI7(${rsi7}) Aşırı Satım Tepki Potansiyeli`);
  } else {
    edgeScore += momZ * 8;
    if (Math.abs(momZ) >= 0.8) drivers.push(`3dk İvme (${ret3mPct >= 0 ? '+' : ''}${ret3mPct.toFixed(3)}%)`);
  }

  // 4) BTC Emir Defteri & Kraken Taker Flow (Orderflow)
  if (spec.assetClass === 'CRYPTO') {
    if (takerBuyRatio >= 1.28) {
      edgeScore += 15;
      drivers.push(`Agresif Alış CVD ${takerBuyRatio}x`);
    } else if (takerBuyRatio <= 0.78) {
      edgeScore -= 15;
      drivers.push(`Agresif Satış CVD ${takerBuyRatio}x`);
    }
    if (obRatio >= 1.35) edgeScore += 7;
    else if (obRatio <= 0.72) edgeScore -= 7;
  }

  // 5) Makro Öncü Sürücüler (DXY & VIX)
  if (Math.abs(macro.dxyChg3mPct) >= 0.015) {
    const dxySign = macro.dxyChg3mPct > 0 ? 1 : -1;
    if (spec.symbol === 'EUR/USD' || spec.symbol === 'GBP/USD' || spec.symbol === 'XAU/USD' || spec.symbol === 'BTC/USD') {
      edgeScore -= dxySign * 12;
      drivers.push(`DXY Ters Baskı (${macro.dxyChg3mPct >= 0 ? '+' : ''}${macro.dxyChg3mPct}%)`);
    } else if (spec.symbol === 'USD/JPY') {
      edgeScore += dxySign * 12;
      drivers.push(`DXY Destek (${macro.dxyChg3mPct >= 0 ? '+' : ''}${macro.dxyChg3mPct}%)`);
    }
  }
  if ((spec.symbol === 'NAS100' || spec.symbol === 'SPX500' || spec.symbol === 'NVDA') && Math.abs(macro.vixChg5mPct) >= 0.35) {
    const vixDir = macro.vixChg5mPct > 0 ? -1 : 1;
    edgeScore += vixDir * 10;
    drivers.push(`VIX Risk Baskısı (${macro.vixChg5mPct >= 0 ? '+' : ''}${macro.vixChg5mPct}%)`);
  }

  // 6) Kendi Öğrenen Kalibrasyon Düzeltmesi (Zayıf yönü otomatik baskılar)
  const histBias = computeHistoricalBiasAdjustment(historicalRecords, spec.symbol);
  if (histBias.sampleCount >= 6) {
    if (edgeScore > 0 && histBias.longWinRate < 0.42) edgeScore *= 0.78;
    if (edgeScore < 0 && histBias.shortWinRate < 0.42) edgeScore *= 0.78;
  }

  // Verimlilik & Seans Eşiklemesi: Testere piyasalarda (özellikle FX/Kripto ER<0.20) yüksek baraj uygula
  const baseThresh = isMeanRevAsset ? 23 : 18;
  const dirThreshold = sessionLabel === 'ASYA_GECE' ? 28 : er3m >= 0.24 ? baseThresh - 2 : baseThresh + 6;
  let predictedDirection: ForecastDirection3m = 'YATAY';
  if (marketOpen) {
    if (edgeScore >= dirThreshold) predictedDirection = 'YÜKSELİŞ';
    else if (edgeScore <= -dirThreshold) predictedDirection = 'DÜŞÜŞ';
  }

  const rawMagPct = Math.min(spec.minMovePct * 4.5, (Math.abs(edgeScore) / 55) * (volUnit * 0.85 + spec.minMovePct));
  const predictedMove3mPct =
    predictedDirection === 'YÜKSELİŞ'
      ? +Math.max(spec.minMovePct, rawMagPct).toFixed(4)
      : predictedDirection === 'DÜŞÜŞ'
      ? -Math.max(spec.minMovePct, rawMagPct).toFixed(4)
      : 0;

  const predictedMove15mPct = +(predictedMove3mPct * 2.15).toFixed(4);
  const predictedPrice3m = +(pxNow * (1 + predictedMove3mPct / 100)).toFixed(spec.digits);
  const predictedPrice15m = +(pxNow * (1 + predictedMove15mPct / 100)).toFixed(spec.digits);
  const confidencePct =
    predictedDirection === 'YATAY'
      ? Math.round(52 + Math.min(20, (1 - er3m) * 20))
      : Math.round(Math.min(86, 51 + Math.abs(edgeScore) * 0.45 + (er3m >= 0.25 ? 5 : 0)));

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
    predictedDirection,
    predictedPrice3m,
    predictedMove3mPct,
    predictedPrice15m,
    predictedMove15mPct,
    confidencePct,
    rawEdgeScore: +edgeScore.toFixed(1),
    drivers: drivers.length ? drivers.slice(0, 3) : ['Düşük Mikro İvme / Kanal İçi Konsolidasyon'],
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
  if (rec.dataDelaySec > 180) {
    return {
      category: 'BAYAT_VERİ_GECİKMESİ',
      explanation: `Tahmin anında veri ${rec.dataDelaySec} saniye gecikmeliydi (${rec.liveSource}); gerçekleşen fiyat (${actualMovePct >= 0 ? '+' : ''}${actualMovePct}%) gecikmiş bara göre ters kaldı.`,
    };
  }
  if (rec.predictedDirection === 'YATAY') {
    return {
      category: 'FIRSAT_KAÇIRILDI',
      explanation: `Model YATAY öngördü ancak fiyat ${actualMovePct >= 0 ? '+' : ''}${actualMovePct}% kırılım yaptı (ER ${rec.features.er3m}, Skor ${rec.rawEdgeScore}). Eşik biraz sıkı kalmış olabilir.`,
    };
  }
  if (rec.sessionLabel === 'ASYA_GECE' || (rec.features.er3m < 0.16 && rec.features.volRatio3m < 0.75)) {
    return {
      category: 'SIĞ_SEANS_TESERE',
      explanation: `${rec.sessionLabel} düşük likidite/testere ortamında (ER ${rec.features.er3m}, Hacim ${rec.features.volRatio3m}x) mikro gürültü yönü bozdu (${actualMovePct >= 0 ? '+' : ''}${actualMovePct}%).`,
    };
  }
  // Makro şoku yalnızca canlı pencereyle birebir eşleşiyorsa (gelecekten sızıntısız) etiketle
  const isLiveEvalWindow = rec.sourceMode === 'CANLI_TICK' && Math.abs(Date.now() - rec.target3mTs) <= 240_000;
  if (isLiveEvalWindow && (Math.abs(macro.dxyChg3mPct) >= 0.045 || Math.abs(macro.vixChg5mPct) >= 0.85)) {
    return {
      category: 'MAKRO_TERS_ŞOK',
      explanation: `Canlı 3dk pencere içinde DXY (%${macro.dxyChg3mPct}) veya VIX (%${macro.vixChg5mPct}) sert oynadı ve teknik momentumu bozdu.`,
    };
  }
  if (
    (rec.predictedDirection === 'YÜKSELİŞ' && rec.features.rsi7_3m > 74) ||
    (rec.predictedDirection === 'DÜŞÜŞ' && rec.features.rsi7_3m < 26)
  ) {
    return {
      category: 'AŞIRI_UZAMA_GERİ_ÇEKİLMESİ',
      explanation: `Aşırı uçta (RSI7=${rec.features.rsi7_3m}) yöne devam beklendi ancak fiyat anında ortalamaya geri döndü.`,
    };
  }
  if (
    (rec.predictedDirection === 'YÜKSELİŞ' && rec.features.h1TrendBias <= -0.5) ||
    (rec.predictedDirection === 'DÜŞÜŞ' && rec.features.h1TrendBias >= 0.5)
  ) {
    return {
      category: 'TRENDE_TERS_TEPKİ',
      explanation: `1S ana trend (${rec.features.h1TrendBias > 0 ? 'BOĞA' : 'AYI'}) tersine kısa tepki arandı; ana dalga devam edip tahmini ezdi.`,
    };
  }
  if (Math.abs(actualMovePct) <= spec.minMovePct * 1.4) {
    return {
      category: 'MİKRO_SPREAD_GÜRÜLTÜSÜ',
      explanation: `Fiyat hareketi (%${actualMovePct}) spread/tik gürültüsü (%±${(spec.minMovePct * 1.4).toFixed(3)}) içinde salınıp çok ufak farkla ters kapattı.`,
    };
  }
  return {
    category: 'ZAYIF_İNANÇ_SİNYALİ',
    explanation: `İnanç %${rec.confidencePct} (Skor ${rec.rawEdgeScore}) sınırda kaldı; fiyat 3dk içinde %${actualMovePct} ters yöne kırdı.`,
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
    // targetTs veya +90sn toleransla ilk 1m barını bul; çok yakınsa canlı fiyatı kullan
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
        // YATAY tahmini: fiyat patlama yapmayıp dar bantta kaldıysa DOĞRU
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
        rec.errorExplanation = `Doğrulandı: Hedef yön (${rec.predictedDirection}) gerçekleşen hareket (%${actualMovePct >= 0 ? '+' : ''}${actualMovePct}) ile uyuştu.`;
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
      if (rec.predictedDirection === 'YÜKSELİŞ') rec.status15m = mv15 > 0 ? 'DOGRU' : 'YANLIS';
      else if (rec.predictedDirection === 'DÜŞÜŞ') rec.status15m = mv15 < 0 ? 'DOGRU' : 'YANLIS';
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
  const closed15m = store.records.filter((r) => (r.status15m === 'DOGRU' || r.status15m === 'YANLIS') && r.predictedDirection !== 'YATAY');

  const dirWins = dirClosed.filter((r) => r.status3m === 'DOGRU').length;
  const flatWins = flatClosed.filter((r) => r.status3m === 'DOGRU').length;
  const liveWins = liveClosed.filter((r) => r.status3m === 'DOGRU').length;
  const dirWins15 = closed15m.filter((r) => r.status15m === 'DOGRU').length;

  const symbolStats: Symbol3mStats[] = LAB_TRACKED_ASSETS.map((spec) => {
    const allSym = store.records.filter((r) => r.symbol === spec.symbol);
    const evSym = allSym.filter((r) => r.status3m === 'DOGRU' || r.status3m === 'YANLIS');
    const dirSym = evSym.filter((r) => r.predictedDirection !== 'YATAY');
    const ev15 = allSym.filter((r) => (r.status15m === 'DOGRU' || r.status15m === 'YANLIS') && r.predictedDirection !== 'YATAY');

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

    const health = latestHealth.get(spec.symbol);
    const lastPred = allSym.length ? allSym[allSym.length - 1] : undefined;

    let recommendedAction = 'Veri Toplanıyor (En az 10 yön tahmini bekleniyor)';
    if (dirSym.length >= 8) {
      if (dirAcc >= 60) recommendedAction = `HAZIR: %${dirAcc} 3dk yön başarısı — Mikroyapı ek işlem hacmi için uygun.`;
      else if (dirAcc >= 52) recommendedAction = `SEÇİCİ MOD: %${dirAcc} — Yalnızca 1S trend uyumlu sinyallerde işlem açılmalı.`;
      else recommendedAction = `DÜŞÜK DOĞRULUK (%${dirAcc}): Baskın hata '${ERROR_META[topErr].label}' filtrelenmeli.`;
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
      directionalAccuracy15m: ev15.length ? Math.round((ok15 / ev15.length) * 100) : 0,
      avgAbsErrorPct3m: avgAbsErr,
      topErrorCategory: topErr,
      lastPrediction: lastPred,
      recommendedAction,
      liveDataSource: health?.liveSource || lastPred?.liveSource || 'Bekleniyor',
      liveDataDelaySec: health?.delaySec ?? lastPred?.dataDelaySec ?? 0,
    };
  });

  // Hata kök-neden dağılımı
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

  // TR Saatlik doğruluk ısı haritası (0..23)
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

  // Otomatik Öğrenme & Kalibrasyon Önerileri
  const learningInsights: string[] = [];
  if (dirClosed.length < 15) {
    learningInsights.push(`Şu ana kadar ${dirClosed.length} yön tahmini sonuçlandı (${closed3m.length} toplam kayıt). Gece boyunca her 3 dakikada yeni örnek birikmeye devam edecektir.`);
  } else {
    const dirAccAll = Math.round((dirWins / dirClosed.length) * 100);
    learningInsights.push(`Genel 3 dakikalık yön doğruluğu %${dirAccAll} (${dirWins}/${dirClosed.length}), 15 dakikalık devam doğruluğu ise %${closed15m.length ? Math.round((dirWins15 / closed15m.length) * 100) : 0} seviyesinde.`);
    const readySyms = symbolStats.filter((s) => s.directionalCount3m >= 6 && s.directionalAccuracy3m >= 58).map((s) => `${s.symbol} (%${s.directionalAccuracy3m})`);
    if (readySyms.length) {
      learningInsights.push(`Yüksek Doğruluk Adayları: ${readySyms.join(', ')} şu an %58+ barajını aşıyor.`);
    }
    if (errorBreakdown.length) {
      const top = errorBreakdown[0];
      learningInsights.push(`Birincil Hata Kaynağı: "${top.label}" tüm yanlışların %${top.sharePct}'ini oluşturuyor (${top.count} adet). Çözüm: ${top.fixHint}`);
    }
    const bestHour = hourlyHeatmap.filter((h) => h.evaluated >= 5).sort((a, b) => b.accuracyPct - a.accuracyPct)[0];
    const worstHour = hourlyHeatmap.filter((h) => h.evaluated >= 5).sort((a, b) => a.accuracyPct - b.accuracyPct)[0];
    if (bestHour && worstHour && bestHour.trHour !== worstHour.trHour) {
      learningInsights.push(`En verimli saat ${bestHour.label} (%${bestHour.accuracyPct}), en gürültülü saat ${worstHour.label} (%${worstHour.accuracyPct}).`);
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
    symbolStats,
    errorBreakdown,
    hourlyHeatmap,
    learningInsights,
    recentRecords: store.records.slice(-180).reverse(),
  };
}

let inFlightLabTick: Promise<ForecastLab3mState> | null = null;
const latestFeedHealth = new Map<string, { liveSource: string; delaySec: number }>();

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
    'liveSource',
    'dataDelaySec',
    'entryPrice',
    'predictedDirection',
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
      r.liveSource,
      r.dataDelaySec,
      r.entryPrice,
      r.predictedDirection,
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

    // Ağ hatasından kaynaklanan geçersiz 9999sn boş-bar başlangıç kayıtlarını temizle
    const beforeLen = store.records.length;
    store.records = store.records.filter((r) => r.dataDelaySec < 5000);
    let dirty = store.records.length !== beforeLen;
    const byId = new Set(store.records.map((r) => r.id));

    // 1. Öncelikle bekleyen (vadesi dolmuş) tüm tahminleri gerçekleşen 1m verisiyle puanla
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

    // 2. Render uyku / başlangıç zaman aşımı kaynaklı eksik 3dk pencereleri sembol bazında son 25 tur (~75dk) 1m barlardan sıfır-sızıntılı telafi et
    const startReplayBucket = currentBucket - 25 * BUCKET_MS;
    const replayBuckets: number[] = [];
    for (let bTs = startReplayBucket; bTs < currentBucket; bTs += BUCKET_MS) {
      replayBuckets.push(bTs);
    }

    for (const bTs of replayBuckets) {
      for (let i = 0; i < LAB_TRACKED_ASSETS.length; i++) {
        const spec = LAB_TRACKED_ASSETS[i];
        const id = `${spec.symbol}-${bTs}`;
        if (byId.has(id)) continue;
        const bundle = bundles[i];
        const bars1mUpTo = bundle.bars1m.filter((b) => b.timestamp <= bTs + 59_000);
        if (bars1mUpTo.length < 15) continue;
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

    // 3. Şu anki canlı 3 dakikalık pencere için geçerli 1m barı olan tüm varlıklara ileri tahmin üret
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

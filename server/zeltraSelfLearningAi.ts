// server/zeltraSelfLearningAi.ts
// ZELTRA CORTEX v16.0 — Kapanmış-Mum Kurumsal Mikroyapı Motoru (SMC, Pivot BSL/SSL, FVG/OB Retest, Diurnal VSA)
// + 4S/12S/1G Çok-Ölçekli Trend-Uyumlu Yay & Nedensel Haber Entegreli Öz-Öğrenen 5-Uzmanlı Yapay Zeka.

import fs from 'fs';
import path from 'path';
import { getNyLocalTimeInfo, type HourlyBar, type NewsContext } from './marketService';
import {
  calcAtrSeries,
  calcEfficiencyRatio,
  calcEmaSeries,
  calcIbs,
  calcRsiSeries,
} from './zeltraAlphaIndicator';

const AI_BRAIN_FILE = path.resolve(process.cwd(), 'data', 'zeltra_ai_brain.json');
export const CORTEX_AI_VERSION = 'cortex-v16.0-institutional-smc';

export type ExpertId =
  | 'E1_MACRO_TREND'
  | 'E2_MICRO_DISPLACEMENT'
  | 'E3_MEAN_REV_SPRING'
  | 'E4_CANDLE_VSA_SWEEP'
  | 'E5_XSMOM_REGIME';

export const EXPERT_LABELS_TR: Record<ExpertId, string> = {
  E1_MACRO_TREND: 'Uzman-1: Makro Trend (Günlük EWMAC & SMA200)',
  E2_MICRO_DISPLACEMENT: 'Uzman-2: 4S/12S Yapısal İvme & FVG/OB Dengesizliği',
  E3_MEAN_REV_SPRING: 'Uzman-3: Çok-Ölçekli Trend İçi Yay (1S/4S/12S RSI2 & IBS)',
  E4_CANDLE_VSA_SWEEP: 'Uzman-4: Kapanmış Mum Anatomisi, VSA & Likidite Süpürmesi',
  E5_XSMOM_REGIME: 'Uzman-5: Kesitsel Liderlik, Rejim & Haber Katalizörü',
};

export type InstitutionalCandlePattern =
  | 'SSL_SWEEP_BULL_PINBAR'
  | 'BSL_SWEEP_BEAR_REJECTION'
  | 'BULL_PINBAR_HAMMER'
  | 'BEAR_SHOOTING_STAR'
  | 'MORNING_STAR_REVERSAL'
  | 'EVENING_STAR_REVERSAL'
  | 'TWEEZER_BOTTOM_BULL'
  | 'TWEEZER_TOP_BEAR'
  | 'VSA_STOPPING_VOLUME_BULL'
  | 'VSA_ABSORPTION_SUPPLY_BEAR'
  | 'BULLISH_FVG_RETEST'
  | 'BEARISH_FVG_RETEST'
  | 'ORDER_BLOCK_MITIGATION_BULL'
  | 'ORDER_BLOCK_MITIGATION_BEAR'
  | 'BULLISH_ENGULFING_DISPLACEMENT'
  | 'BEARISH_ENGULFING_DISPLACEMENT'
  | 'BULLISH_FVG_IMBALANCE'
  | 'BEARISH_FVG_IMBALANCE'
  | 'SELLING_CLIMAX_EXHAUSTION_BULL'
  | 'BUYING_CLIMAX_EXHAUSTION_BEAR'
  | 'CLIMAX_EXHAUSTION_REVERSAL'
  | 'INSIDE_BAR_COMPRESSION'
  | 'STANDARD_FLOW';

export type MarketStructureState =
  | 'BOS_YUKARI'
  | 'BOS_AŞAĞI'
  | 'CHOCH_DÖNÜŞ_YUKARI'
  | 'CHOCH_DÖNÜŞ_AŞAĞI'
  | 'LİKİDİTE_DENGESİ';

export interface FvgZoneOverlay {
  type: 'BULL' | 'BEAR';
  bottom: number;
  top: number;
  ce: number;
  startIndex: number;
  timestamp: number;
  mitigated: boolean;
}

export interface OrderBlockOverlay {
  type: 'BULL' | 'BEAR';
  low: number;
  high: number;
  startIndex: number;
  timestamp: number;
}

export interface CandleChartAnnotation {
  index: number;
  timestamp: number;
  price: number;
  direction: 'BULL' | 'BEAR';
  shortTag: string;
  pattern: InstitutionalCandlePattern;
  detailTR: string;
}

export interface ChartSmcOverlay {
  bslPoolPrice: number;
  sslPoolPrice: number;
  equalHighsActive: boolean;
  equalLowsActive: boolean;
  fvgZones: FvgZoneOverlay[];
  orderBlocks: OrderBlockOverlay[];
  annotations: CandleChartAnnotation[];
}

export interface MicrostructureAnalysis {
  pattern: InstitutionalCandlePattern;
  patternLabelTR: string;
  structureState: MarketStructureState;
  structureLabelTR: string;
  evaluatedBarTimestamp: number;
  isClosedBarConfirmed: boolean;
  bslPoolPrice: number;
  sslPoolPrice: number;
  equalHighsActive?: boolean;
  equalLowsActive?: boolean;
  sweptSslBullish: boolean;
  sweptBslBearish: boolean;
  bullishFvgActive: boolean;
  bearishFvgActive: boolean;
  bullishFvgRetest?: boolean;
  bearishFvgRetest?: boolean;
  bullishObMitigation?: boolean;
  bearishObMitigation?: boolean;
  activeFvgZone?: { type: 'BULL' | 'BEAR'; bottom: number; top: number; ce: number } | null;
  activeOrderBlock?: { type: 'BULL' | 'BEAR'; low: number; high: number } | null;
  vsaSignal: 'STOPPING_VOL_BULL' | 'ABSORPTION_BEAR' | 'TRUE_DISPLACEMENT' | 'LOW_VOL_DRIFT' | 'NEUTRAL';
  vsaDetailTR: string;
  hasReliableVolume?: boolean;
  orderBlockZoneTR: string;
  upperWickRatio: number;
  lowerWickRatio: number;
  bodyRatio: number;
  rvol1h: number;
  rsi2_1h: number;
  cumRsi2_1h: number;
  ibs1h: number;
  zScoreEma20_1h: number;
  er1h: number;
  candleVsaScore: number;     // -100 .. +100
  meanRev1hScore: number;     // -100 .. +100
  microMom1hScore: number;    // -100 .. +100
}

export interface ExpertSignalVector {
  E1_MACRO_TREND: number;        // -100 .. +100
  E2_MICRO_DISPLACEMENT: number; // -100 .. +100
  E3_MEAN_REV_SPRING: number;    // -100 .. +100
  E4_CANDLE_VSA_SWEEP: number;   // -100 .. +100
  E5_XSMOM_REGIME: number;       // -100 .. +100
}

export type RootCauseCategory =
  | 'MAKRO_MİKRO_ÇATIŞMASI_TEPKİ'
  | 'LİKİDİTE_AVLANMASI_SSL_BSL_SWEEP'
  | 'VSA_KURUMSAL_EMİLİM_DÖNÜŞÜ'
  | 'FVG_İVME_KIRILIMI'
  | 'SIĞ_SEANS_TESERE_GÜRÜLTÜSÜ'
  | 'VOLATİLİTE_ŞOKU_TERS_BAR'
  | 'TAM_KURUMSAL_KONFLUENS_İSABETİ'
  | 'KISA_VADE_ORTALAMA_DÖNÜŞ_İSABETİ';

export interface AiPostMortemReflection {
  id: string;
  forecastId: string;
  symbol: string;
  horizonHours: 1 | 4 | 24;
  timestampMs: number;
  timestampTR: string;
  outcome: 'DOĞRU' | 'YANLIŞ' | 'YATAY_NÖTR';
  predictedDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
  actualMovePct: number;
  predictedMovePct: number;
  rootCauseCategory: RootCauseCategory;
  rootCauseTitleTR: string;
  whyItHappenedTR: string;
  nextTimeActionTR: string;
  winningExpert: ExpertId;
  winningExpertLabelTR: string;
  misleadingExpert?: ExpertId;
  misleadingExpertLabelTR?: string;
  weightDeltaSummaryTR: string;
  patternAtEntryTR: string;
}

export interface HorizonAdaptiveProfile {
  horizonHours: 1 | 4 | 24;
  weights: Record<ExpertId, number>;
  priorWeights: Record<ExpertId, number>;
  biasCorrectionScore: number;  // Sıkı sınırlandırılmış kalibrasyon düzeltmesi (-5..+5)
  convictionDeadzone: number;   // Yönsüz gürültü koridoru (14..18)
  bandScaleMultiplier: number;  // %90 güven bandı kalibratörü (0.88..1.38)
  totalLearnedSamples: number;
  correctCount: number;
  directionalSamples?: number;
  directionalHits?: number;
  band90HitCount: number;
  expertHitCounts: Record<ExpertId, { right: number; total: number; accuracyPct: number }>;
}

export interface AssetAdaptiveProfile {
  hits: number;                 // Yalnızca gerçek yönlü (YÜKSELİŞ/DÜŞÜŞ) isabet sayısı!
  total: number;                // Yalnızca gerçek yönlü (YÜKSELİŞ/DÜŞÜŞ) toplam tahmin!
  accuracyPct: number;          // Saf yönlü başarı yüzdesi (YATAY_NÖTR şişirmesi sıfırlandı)
  allSettledHits?: number;
  allSettledTotal?: number;
  assetBiasScore: number;       // Varlığa özgü sınırlı yön düzeltmesi (-6..+6)
  consecutiveMisses: number;
  lastOutcome?: 'DOĞRU' | 'YANLIŞ' | 'YATAY_NÖTR';
}

export interface ZeltraAiBrainState {
  version: string;
  updatedAtMs: number;
  updatedAtTR: string;
  totalPostMortems: number;
  horizons: Record<'1' | '4' | '24', HorizonAdaptiveProfile>;
  assetProfiles?: Record<string, AssetAdaptiveProfile>;
  rootCauseStats: Record<RootCauseCategory, number>;
  recentLessons: AiPostMortemReflection[];
}

export interface HigherTimeframeMicroContext {
  ibs4h?: number;
  cumRsi2_4h?: number;
  trend4hScore?: number; // -100..+100
  er4h?: number;
  zScoreEma20_4h?: number;
  newsContext?: NewsContext | null;
  dxyChg15mPct?: number;
  vixChg5mPct?: number;
}

const US_EQUITY_SET = new Set(['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'AMD', 'TSLA']);

// Kapanmamış yarım mumları kesin olarak ayıklar; NYSE 15:30–16:00 ET (30dk) son mumunu doğru tanır!
export function findLastClosedBarIndex(
  bars: HourlyBar[],
  nowMs = Date.now(),
  defaultDurationMs = 3600 * 1000,
  symbol = ''
): number {
  if (!bars || bars.length === 0) return 0;
  const isUsEq = US_EQUITY_SET.has(symbol);
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i];
    let endMs = b.endTimestamp;
    if (!endMs) {
      let dur = defaultDurationMs;
      if (isUsEq && defaultDurationMs === 3600 * 1000) {
        const ny = getNyLocalTimeInfo(b.timestamp);
        if (ny.hour === 15 && ny.minute === 30) dur = 1800 * 1000;
      }
      endMs = b.timestamp + dur;
    }
    if (endMs <= nowMs) return i;
  }
  return Math.max(0, bars.length - 2);
}

function medianOf(vals: number[]): number {
  if (vals.length === 0) return 0;
  const sorted = vals.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Onaylı Swing Pivot (L=2, R=2) Likidite Havuzları ve Equal Highs/Lows (EQH/EQL) Tespiti
function computeConfirmedLiquidityPools(
  slice: HourlyBar[],
  idx: number,
  atr: number
): {
  bslPool: number;
  sslPool: number;
  equalHighs: boolean;
  equalLows: boolean;
  lastSwingHighs: number[];
  lastSwingLows: number[];
} {
  const swingHighs: { idx: number; price: number }[] = [];
  const swingLows: { idx: number; price: number }[] = [];
  const start = Math.max(2, idx - 32);
  const end = idx - 2; // En az 2 sağ onay mumu (R=2) zorunlu!

  for (let k = start; k <= end; k++) {
    const kh = Math.max(slice[k].high ?? slice[k].close, slice[k].open ?? slice[k].close, slice[k].close);
    const kl = Math.min(slice[k].low ?? slice[k].close, slice[k].open ?? slice[k].close, slice[k].close);
    const hPrev1 = slice[k - 1].high ?? slice[k - 1].close;
    const hPrev2 = slice[k - 2].high ?? slice[k - 2].close;
    const hNext1 = slice[k + 1].high ?? slice[k + 1].close;
    const hNext2 = slice[k + 2].high ?? slice[k + 2].close;

    if (kh >= hPrev1 && kh >= hPrev2 && kh >= hNext1 && kh >= hNext2) {
      swingHighs.push({ idx: k, price: kh });
    }

    const lPrev1 = slice[k - 1].low ?? slice[k - 1].close;
    const lPrev2 = slice[k - 2].low ?? slice[k - 2].close;
    const lNext1 = slice[k + 1].low ?? slice[k + 1].close;
    const lNext2 = slice[k + 2].low ?? slice[k + 2].close;

    if (kl <= lPrev1 && kl <= lPrev2 && kl <= lNext1 && kl <= lNext2) {
      swingLows.push({ idx: k, price: kl });
    }
  }

  // Kırılmamış en yakın kurumsal likidite havuzlarını bul (idx-1 ve idx-2 hariç 22 bar fallback)
  let bslPool = -Infinity;
  let sslPool = Infinity;
  const recentWindowStart = Math.max(0, idx - 24);

  const unbreachedHighs = swingHighs.filter((sh) => {
    if (sh.idx < recentWindowStart) return false;
    for (let m = sh.idx + 1; m <= idx - 1; m++) {
      if (slice[m].close > sh.price + 0.05 * atr) return false;
    }
    return true;
  });
  const unbreachedLows = swingLows.filter((sl) => {
    if (sl.idx < recentWindowStart) return false;
    for (let m = sl.idx + 1; m <= idx - 1; m++) {
      if (slice[m].close < sl.price - 0.05 * atr) return false;
    }
    return true;
  });

  if (unbreachedHighs.length > 0) {
    bslPool = Math.max(...unbreachedHighs.map((x) => x.price));
  } else {
    for (let j = Math.max(0, idx - 20); j <= Math.max(0, idx - 3); j++) {
      const jh = Math.max(slice[j].high ?? slice[j].close, slice[j].close);
      if (jh > bslPool) bslPool = jh;
    }
  }

  if (unbreachedLows.length > 0) {
    sslPool = Math.min(...unbreachedLows.map((x) => x.price));
  } else {
    for (let j = Math.max(0, idx - 20); j <= Math.max(0, idx - 3); j++) {
      const jl = Math.min(slice[j].low ?? slice[j].close, slice[j].close);
      if (jl < sslPool) sslPool = jl;
    }
  }

  if (!Number.isFinite(bslPool)) bslPool = slice[idx].high ?? slice[idx].close;
  if (!Number.isFinite(sslPool)) sslPool = slice[idx].low ?? slice[idx].close;

  // Equal Highs / Equal Lows (Çift Tepe/Çift Dip Likidite Mıknatısı: <= 0.22 ATR tolerans)
  const equalHighs =
    swingHighs.length >= 2 &&
    swingHighs.some((a, i) =>
      swingHighs.slice(i + 1).some((b) => Math.abs(a.price - b.price) <= 0.22 * atr && Math.abs(a.price - bslPool) <= 0.25 * atr)
    );
  const equalLows =
    swingLows.length >= 2 &&
    swingLows.some((a, i) =>
      swingLows.slice(i + 1).some((b) => Math.abs(a.price - b.price) <= 0.22 * atr && Math.abs(a.price - sslPool) <= 0.25 * atr)
    );

  return {
    bslPool,
    sslPool,
    equalHighs,
    equalLows,
    lastSwingHighs: swingHighs.slice(-2).map((x) => x.price),
    lastSwingLows: swingLows.slice(-2).map((x) => x.price),
  };
}

// =========================================================================
// 1. KAPANMIŞ MUM ANATOMİSİ, DIURNAL VSA, PIVOT SWEEP, FVG & ORDER BLOCK MOTORU
// =========================================================================
export function analyzeCandlestickAndMicrostructure(
  h1Bars: HourlyBar[],
  digits = 2,
  evalIdx?: number,
  options?: { nowMs?: number; symbol?: string; barDurationMs?: number; livePrice?: number }
): MicrostructureAnalysis {
  const n = h1Bars.length;
  const nowMs = options?.nowMs ?? Date.now();
  const durMs = options?.barDurationMs ?? 3600 * 1000;
  const symbol = options?.symbol ?? '';

  // KRİTİK DÜZELTME: evalIdx verilmediğinde yarım/oluşmakta olan mumu DEĞİL, son TAMAMLANMIŞ mumu oku!
  const closedIdx =
    evalIdx !== undefined
      ? Math.max(0, Math.min(evalIdx, n - 1))
      : findLastClosedBarIndex(h1Bars, nowMs, durMs, symbol);

  if (n < 25 || closedIdx < 20) {
    const px = h1Bars[Math.max(0, closedIdx)]?.close || 0;
    return {
      pattern: 'STANDARD_FLOW',
      patternLabelTR: 'Standart Fiyat Akışı',
      structureState: 'LİKİDİTE_DENGESİ',
      structureLabelTR: 'Likidite Dengesi',
      evaluatedBarTimestamp: h1Bars[Math.max(0, closedIdx)]?.timestamp || nowMs,
      isClosedBarConfirmed: true,
      bslPoolPrice: px,
      sslPoolPrice: px,
      sweptSslBullish: false,
      sweptBslBearish: false,
      bullishFvgActive: false,
      bearishFvgActive: false,
      vsaSignal: 'NEUTRAL',
      vsaDetailTR: 'Normal hacim/yayılım dengesi',
      orderBlockZoneTR: '-',
      upperWickRatio: 0.2,
      lowerWickRatio: 0.2,
      bodyRatio: 0.6,
      rvol1h: 1,
      rsi2_1h: 50,
      cumRsi2_1h: 50,
      ibs1h: 0.5,
      zScoreEma20_1h: 0,
      er1h: 0.25,
      candleVsaScore: 0,
      meanRev1hScore: 0,
      microMom1hScore: 0,
    };
  }

  const idx = closedIdx;
  const slice = h1Bars.slice(0, idx + 1);
  const closes = slice.map((b) => b.close);
  const atr14Arr = calcAtrSeries(slice, 14);
  const ema8Arr = calcEmaSeries(closes, 8);
  const ema20Arr = calcEmaSeries(closes, 20);
  const ema50Arr = calcEmaSeries(closes, 50);
  const rsi2Arr = calcRsiSeries(closes, 2);

  const cur = slice[idx];
  const prev = slice[idx - 1];
  const prev2 = slice[idx - 2];

  const o = Number.isFinite(cur.open) && (cur.open ?? 0) > 0 ? cur.open! : cur.close;
  const c = cur.close;
  const h = Math.max(cur.high ?? c, o, c);
  const l = Math.min(cur.low ?? c, o, c);
  const range = Math.max(1e-9, h - l);
  const body = Math.abs(c - o);
  const upperWick = Math.max(0, h - Math.max(o, c));
  const lowerWick = Math.max(0, Math.min(o, c) - l);

  const upperWickRatio = +(upperWick / range).toFixed(2);
  const lowerWickRatio = +(lowerWick / range).toFixed(2);
  const bodyRatio = +(body / range).toFixed(2);
  const ibs1h = +calcIbs({ ...cur, open: o, high: h, low: l }).toFixed(3);
  const atr1h = Math.max(1e-9, atr14Arr[idx]);
  const spreadAtr = range / atr1h;

  const rsi2_1h = +rsi2Arr[idx].toFixed(1);
  const cumRsi2_1h = +((rsi2Arr[idx] + rsi2Arr[idx - 1]) / 2).toFixed(1);
  // Canlı fiyat varsa EMA20 uzanımını (zScore) anlık fiyata göre güncelle ki aşırı uzama kalkanı saniyesi saniyesine çalışsın
  const formingBar = evalIdx === undefined && idx + 1 < n ? h1Bars[idx + 1] : undefined;
  const refLivePrice =
    options?.livePrice && options.livePrice > 0
      ? options.livePrice
      : formingBar && formingBar.close > 0
        ? formingBar.close
        : c;
  const zScoreClosed = (c - ema20Arr[idx]) / atr1h;
  const zScoreEma20_1h = +((refLivePrice - ema20Arr[idx]) / atr1h).toFixed(2);
  const er1h = +calcEfficiencyRatio(closes, idx, 12).toFixed(2);

  // Seans-Duyarlı (Diurnal) RVOL + Sıfır-Hacimli FX İçin True-Range Aktivite Vekili
  const validPrevVols: number[] = [];
  for (let j = Math.max(0, idx - 20); j < idx; j++) {
    const v = slice[j].volume || 0;
    if (v > 0) validPrevVols.push(v);
  }
  const hasReliableVolume = validPrevVols.length >= 12;
  const curVol = cur.volume || 0;
  let rvol1h = 1.0;

  if (hasReliableVolume && curVol > 0) {
    // Aynı saat diliminin son 8 gündeki medyan hacmi ile son 20 bar medyanını %50-%50 harmanla
    const sameHourVols: number[] = [];
    for (let k = 1; k <= 8; k++) {
      const backIdx = idx - k * 24;
      if (backIdx >= 0 && (slice[backIdx].volume || 0) > 0) {
        sameHourVols.push(slice[backIdx].volume!);
      }
    }
    const trimMean20 = validPrevVols.reduce((a, b) => a + b, 0) / validPrevVols.length;
    const todMed = sameHourVols.length >= 3 ? medianOf(sameHourVols) : trimMean20;
    const baseVol = Math.max(1e-9, 0.5 * todMed + 0.5 * trimMean20);
    rvol1h = +(curVol / baseVol).toFixed(2);
  } else {
    // Spot FX (=X) gibi hacimsiz enstrümanlarda 20-bar medyan yayılıma (range) göre aktivite vekili
    const prevRanges: number[] = [];
    for (let j = Math.max(0, idx - 20); j < idx; j++) {
      const jh = Math.max(slice[j].high ?? slice[j].close, slice[j].close);
      const jl = Math.min(slice[j].low ?? slice[j].close, slice[j].close);
      if (jh > jl) prevRanges.push(jh - jl);
    }
    const medRng = Math.max(1e-9, medianOf(prevRanges) || atr1h);
    rvol1h = +(range / medRng).toFixed(2);
  }

  // Onaylı Pivot BSL & SSL Likidite Havuzları
  const liq = computeConfirmedLiquidityPools(slice, idx, atr1h);
  const bslPool = liq.bslPool;
  const sslPool = liq.sslPool;

  // ATR-Ölçekli Gerçek Likidite Süpürmesi (Mutually Exclusive: IBS >= 0.55 vs IBS <= 0.45)
  const sslPenetration = sslPool - l;
  const bslPenetration = h - bslPool;

  let sweptSslBullish =
    sslPenetration >= 0.02 * atr1h &&
    sslPenetration <= 1.65 * atr1h &&
    c > sslPool &&
    ibs1h >= 0.55 &&
    lowerWickRatio >= 0.36;

  let sweptBslBearish =
    bslPenetration >= 0.02 * atr1h &&
    bslPenetration <= 1.65 * atr1h &&
    c < bslPool &&
    ibs1h <= 0.45 &&
    upperWickRatio >= 0.36;

  // Canlı İntra-Bar Yapı İptali: Kapanmış mumda sweep oluştuysa fakat canlı fiyat sweep iğnesini aşağı/yukarı kırdıysa iptal et!
  if (sweptSslBullish && refLivePrice < l - 0.03 * atr1h) sweptSslBullish = false;
  if (sweptBslBearish && refLivePrice > h + 0.03 * atr1h) sweptBslBearish = false;

  // Bağımsız Kurumsal Pinbar (Çekiç / Kayan Yıldız)
  const bullPinbar =
    !sweptSslBullish &&
    spreadAtr >= 0.58 &&
    lowerWickRatio >= 0.58 &&
    bodyRatio <= 0.35 &&
    upperWickRatio <= 0.16 &&
    ibs1h >= 0.68 &&
    zScoreClosed <= -0.5;
  const bearShootingStar =
    !sweptBslBearish &&
    spreadAtr >= 0.58 &&
    upperWickRatio >= 0.58 &&
    bodyRatio <= 0.35 &&
    lowerWickRatio <= 0.16 &&
    ibs1h <= 0.32 &&
    zScoreClosed >= 0.5;

  // 2-Bar Cımbız Dip / Tepe (Tweezer Bottom / Top)
  const prevO = prev.open ?? prev.close;
  const prevC = prev.close;
  const prevH = Math.max(prev.high ?? prevC, prevO, prevC);
  const prevL = Math.min(prev.low ?? prevC, prevO, prevC);
  const prevBody = Math.abs(prevC - prevO);

  const tweezerBottom =
    Math.abs(l - prevL) <= 0.08 * atr1h &&
    prevC < prevO &&
    c > o &&
    ibs1h >= 0.62 &&
    zScoreClosed <= -0.6 &&
    spreadAtr >= 0.45;
  const tweezerTop =
    Math.abs(h - prevH) <= 0.08 * atr1h &&
    prevC > prevO &&
    c < o &&
    ibs1h <= 0.38 &&
    zScoreClosed >= 0.6 &&
    spreadAtr >= 0.45;

  // 3-Bar Sabah Yıldızı / Akşam Yıldızı (Morning Star / Evening Star)
  const p2O = prev2.open ?? prev2.close;
  const p2C = prev2.close;
  const p2H = Math.max(prev2.high ?? p2C, p2O, p2C);
  const p2L = Math.min(prev2.low ?? p2C, p2O, p2C);
  const p2Body = Math.abs(p2C - p2O);
  const p2Mid = (p2O + p2C) / 2;

  const morningStar =
    p2C < p2O &&
    p2Body >= 0.60 * atr1h &&
    prevBody <= 0.38 * atr1h &&
    c > o &&
    body >= 0.50 * atr1h &&
    c >= p2Mid &&
    ibs1h >= 0.64 &&
    zScoreClosed <= -0.35;
  const eveningStar =
    p2C > p2O &&
    p2Body >= 0.60 * atr1h &&
    prevBody <= 0.38 * atr1h &&
    c < o &&
    body >= 0.50 * atr1h &&
    c <= p2Mid &&
    ibs1h <= 0.36 &&
    zScoreClosed >= 0.35;

  // Kurumsal Yutan Mum (Engulfing Displacement — 24s piyasa 0.08 ATR açılış toleranslı & IBS teyitli)
  const gapTol = 0.08 * atr1h;
  const bullishEngulfing =
    c > o &&
    prevC < prevO &&
    o <= prevC + gapTol &&
    c >= prevO &&
    body >= Math.max(0.55 * atr1h, 1.08 * prevBody) &&
    bodyRatio >= 0.55 &&
    ibs1h >= 0.68;
  const bearishEngulfing =
    c < o &&
    prevC > prevO &&
    o >= prevC - gapTol &&
    c <= prevO &&
    body >= Math.max(0.55 * atr1h, 1.08 * prevBody) &&
    bodyRatio >= 0.55 &&
    ibs1h <= 0.32;

  // 24-Bar Fair Value Gap (FVG) Durum Makinesi: Yeni Oluşum vs Doldurulmamış (Unmitigated) FVG Testi!
  const bullishFvgCreated =
    l - p2H >= 0.12 * atr1h && prevC - prevO >= 0.48 * atr1h && c >= o && ibs1h >= 0.50;
  const bearishFvgCreated =
    p2L - h >= 0.12 * atr1h && prevO - prevC >= 0.48 * atr1h && c <= o && ibs1h <= 0.50;

  let bullishFvgRetest = false;
  let bearishFvgRetest = false;
  let activeFvgZone: MicrostructureAnalysis['activeFvgZone'] = null;

  if (bullishFvgCreated) {
    activeFvgZone = { type: 'BULL', bottom: p2H, top: l, ce: (p2H + l) / 2 };
  } else if (bearishFvgCreated) {
    activeFvgZone = { type: 'BEAR', bottom: h, top: p2L, ce: (h + p2L) / 2 };
  }

  for (let k = Math.max(2, idx - 22); k <= idx - 1; k++) {
    const k2h = Math.max(slice[k - 2].high ?? slice[k - 2].close, slice[k - 2].close);
    const k2l = Math.min(slice[k - 2].low ?? slice[k - 2].close, slice[k - 2].close);
    const kl = Math.min(slice[k].low ?? slice[k].close, slice[k].close);
    const kh = Math.max(slice[k].high ?? slice[k].close, slice[k].close);
    const km1Disp = slice[k - 1].close - (slice[k - 1].open ?? slice[k - 1].close);

    if (kl - k2h >= 0.12 * atr1h && km1Disp >= 0.50 * atr1h) {
      const ce = (k2h + kl) / 2;
      let unviolated = true;
      for (let m = k + 1; m <= idx - 1; m++) {
        const ml = Math.min(slice[m].low ?? slice[m].close, slice[m].close);
        if (slice[m].close < k2h || ml < ce) {
          unviolated = false;
          break;
        }
      }
      if (unviolated) {
        activeFvgZone = { type: 'BULL', bottom: k2h, top: kl, ce };
        if (l <= kl && c >= ce && ibs1h >= 0.54) {
          bullishFvgRetest = true;
        }
      }
    }

    if (k2l - kh >= 0.12 * atr1h && -km1Disp >= 0.50 * atr1h) {
      const ce = (kh + k2l) / 2;
      let unviolated = true;
      for (let m = k + 1; m <= idx - 1; m++) {
        const mh = Math.max(slice[m].high ?? slice[m].close, slice[m].close);
        if (slice[m].close > k2l || mh > ce) {
          unviolated = false;
          break;
        }
      }
      if (unviolated) {
        activeFvgZone = { type: 'BEAR', bottom: kh, top: k2l, ce };
        if (h >= kh && c <= ce && ibs1h <= 0.46) {
          bearishFvgRetest = true;
        }
      }
    }
  }

  const bullishFvgActive = bullishFvgCreated || bullishFvgRetest;
  const bearishFvgActive = bearishFvgCreated || bearishFvgRetest;

  // Gerçek Kurumsal Order Block (OB) Tespiti & Mitigasyon Testi
  let bullishObMitigation = false;
  let bearishObMitigation = false;
  let activeOrderBlock: MicrostructureAnalysis['activeOrderBlock'] = null;

  for (let k = Math.max(1, idx - 28); k <= idx - 3; k++) {
    const ko = slice[k].open ?? slice[k].close;
    const kc = slice[k].close;
    const kh = Math.max(slice[k].high ?? kc, ko, kc);
    const kl = Math.min(slice[k].low ?? kc, ko, kc);
    const k1o = slice[k + 1].open ?? slice[k + 1].close;

    // Boğa OB: Güçlü yukarı ivme (>=1.05 ATR) öncesi son satıcılı mum
    if (kc < ko && Math.max(slice[k + 1].close, slice[k + 2].close) - k1o >= 1.05 * atr1h) {
      const obLow = kl;
      const obHigh = Math.min(kh, Math.max(ko, kl + 0.30 * atr1h));
      let intact = true;
      for (let m = k + 2; m <= idx - 1; m++) {
        if (slice[m].close < obLow) {
          intact = false;
          break;
        }
      }
      if (intact) {
        activeOrderBlock = { type: 'BULL', low: obLow, high: obHigh };
        if (l <= obHigh && c > obLow && ibs1h >= 0.55) {
          bullishObMitigation = true;
        }
      }
    }

    // Ayı OB: Güçlü aşağı ivme (>=1.05 ATR) öncesi son alıcılı mum
    if (kc > ko && k1o - Math.min(slice[k + 1].close, slice[k + 2].close) >= 1.05 * atr1h) {
      const obHigh = kh;
      const obLow = Math.max(kl, Math.min(ko, kh - 0.30 * atr1h));
      let intact = true;
      for (let m = k + 2; m <= idx - 1; m++) {
        if (slice[m].close > obHigh) {
          intact = false;
          break;
        }
      }
      if (intact) {
        activeOrderBlock = { type: 'BEAR', low: obLow, high: obHigh };
        if (h >= obLow && c < obHigh && ibs1h <= 0.45) {
          bearishObMitigation = true;
        }
      }
    }
  }

  // Volume Spread Analysis (VSA — Wyckoff Çaba vs Sonuç)
  let vsaSignal: MicrostructureAnalysis['vsaSignal'] = 'NEUTRAL';
  let vsaDetailTR = hasReliableVolume
    ? 'Standart kapanmış mum hacim ve yayılım dengesi.'
    : 'Spot FX yayılım-aktivite dengesi normal.';

  if (
    rvol1h >= 1.35 &&
    zScoreClosed <= -0.55 &&
    ((spreadAtr <= 0.80 && ibs1h >= 0.50) || (lowerWickRatio >= 0.40 && upperWickRatio <= 0.26 && ibs1h >= 0.56))
  ) {
    vsaSignal = 'STOPPING_VOL_BULL';
    vsaDetailTR = hasReliableVolume
      ? `VSA Durdurucu Hacim (RVOL ${rvol1h}x): Düşüşte kurumsal pasif alım duvarı satışı emdi (IBS ${ibs1h}).`
      : `Kurumsal Dip Emilimi (Aktivite ${rvol1h}x): Alt fitil reddi ile satış baskısı emildi.`;
  } else if (
    rvol1h >= 1.35 &&
    zScoreClosed >= 0.55 &&
    ((spreadAtr <= 0.80 && ibs1h <= 0.50) || (upperWickRatio >= 0.40 && lowerWickRatio <= 0.26 && ibs1h <= 0.44))
  ) {
    vsaSignal = 'ABSORPTION_BEAR';
    vsaDetailTR = hasReliableVolume
      ? `VSA Arz Emilimi (RVOL ${rvol1h}x): Yükselişte kurumsal limit satış duvarı alıcıları durdurdu (üst fitil %${Math.round(upperWickRatio * 100)}).`
      : `Kurumsal Arz Reddi (Aktivite ${rvol1h}x): Üst fitil reddi ile alıcılar emildi.`;
  } else if (
    hasReliableVolume &&
    rvol1h >= 1.35 &&
    spreadAtr >= 1.15 &&
    bodyRatio >= 0.60 &&
    (ibs1h >= 0.78 || ibs1h <= 0.22) &&
    Math.abs(zScoreClosed) < 2.1
  ) {
    vsaSignal = 'TRUE_DISPLACEMENT';
    vsaDetailTR = `VSA Gerçek Kurumsal İvme (RVOL ${rvol1h}x, Yayılım ${spreadAtr.toFixed(2)} ATR).`;
  } else if (rvol1h <= 0.72 && spreadAtr <= 0.72) {
    vsaSignal = 'LOW_VOL_DRIFT';
    vsaDetailTR = `Düşük hacimli sığ seans salınımı (RVOL ${rvol1h}x) — kırılım tuzaklarına dikkat.`;
  }

  // Satış / Alış Tükeniş Mumu (Selling / Buying Climax Exhaustion — Yönlü İşaretli!)
  const sellingClimaxBull =
    spreadAtr >= 1.85 && zScoreClosed <= -1.85 && cumRsi2_1h <= 12 && (lowerWickRatio >= 0.28 || rvol1h >= 1.7);
  const buyingClimaxBear =
    spreadAtr >= 1.85 && zScoreClosed >= 1.85 && cumRsi2_1h >= 88 && (upperWickRatio >= 0.28 || rvol1h >= 1.7);

  // Market Structure Shift (BOS / ChoCH — Onaylı Swing Pivotlara Göre!)
  const shList = liq.lastSwingHighs;
  const slList = liq.lastSwingLows;
  const lastSH = shList.length > 0 ? shList[shList.length - 1] : bslPool;
  const lastSL = slList.length > 0 ? slList[slList.length - 1] : sslPool;
  const priorBearStruct =
    (shList.length >= 2 && slList.length >= 2 && shList[1] < shList[0] && slList[1] < slList[0]) ||
    ema20Arr[idx - 1] < ema50Arr[idx - 1];
  const priorBullStruct =
    (shList.length >= 2 && slList.length >= 2 && shList[1] > shList[0] && slList[1] > slList[0]) ||
    ema20Arr[idx - 1] > ema50Arr[idx - 1];

  let structureState: MarketStructureState = 'LİKİDİTE_DENGESİ';
  let structureLabelTR = 'Likidite Dengesi (Yatay Akış)';
  if (sweptSslBullish || (priorBearStruct && c > lastSH && ibs1h >= 0.58)) {
    structureState = 'CHOCH_DÖNÜŞ_YUKARI';
    structureLabelTR = 'ChoCH Yukarı Karakter Değişimi (Tepki / Dönüş)';
  } else if (sweptBslBearish || (priorBullStruct && c < lastSL && ibs1h <= 0.42)) {
    structureState = 'CHOCH_DÖNÜŞ_AŞAĞI';
    structureLabelTR = 'ChoCH Aşağı Karakter Değişimi (Zirve Kırılımı)';
  } else if (priorBullStruct && c > lastSH && ibs1h >= 0.60) {
    structureState = 'BOS_YUKARI';
    structureLabelTR = 'BOS Yukarı Trend Devam Kırılımı';
  } else if (priorBearStruct && c < lastSL && ibs1h <= 0.40) {
    structureState = 'BOS_AŞAĞI';
    structureLabelTR = 'BOS Aşağı Trend Devam Kırılımı';
  }

  // Ana Kurumsal Mum Formasyonu Seçimi
  let pattern: InstitutionalCandlePattern = 'STANDARD_FLOW';
  let patternLabelTR = 'Standart Kapanmış Mum Akışı';
  if (sweptSslBullish) {
    pattern = 'SSL_SWEEP_BULL_PINBAR';
    patternLabelTR = `SSL Likidite Süpürmesi & Boğa Reddi${liq.equalLows ? ' (Çift Dip EQL)' : ''}`;
  } else if (sweptBslBearish) {
    pattern = 'BSL_SWEEP_BEAR_REJECTION';
    patternLabelTR = `BSL Likidite Süpürmesi & Ayı Reddi${liq.equalHighs ? ' (Çift Tepe EQH)' : ''}`;
  } else if (morningStar) {
    pattern = 'MORNING_STAR_REVERSAL';
    patternLabelTR = '3-Mum Sabah Yıldızı Dönüşü (Morning Star)';
  } else if (eveningStar) {
    pattern = 'EVENING_STAR_REVERSAL';
    patternLabelTR = '3-Mum Akşam Yıldızı Dönüşü (Evening Star)';
  } else if (vsaSignal === 'STOPPING_VOL_BULL') {
    pattern = 'VSA_STOPPING_VOLUME_BULL';
    patternLabelTR = 'VSA Durdurucu Hacim (Kurumsal Dip Emilimi)';
  } else if (vsaSignal === 'ABSORPTION_BEAR') {
    pattern = 'VSA_ABSORPTION_SUPPLY_BEAR';
    patternLabelTR = 'VSA Arz Emilimi (Kurumsal Tepe Duvarı)';
  } else if (bullishObMitigation) {
    pattern = 'ORDER_BLOCK_MITIGATION_BULL';
    patternLabelTR = 'Boğa Order Block Testi & Tepkisi';
  } else if (bearishObMitigation) {
    pattern = 'ORDER_BLOCK_MITIGATION_BEAR';
    patternLabelTR = 'Ayı Order Block Testi & Reddi';
  } else if (bullishFvgRetest) {
    pattern = 'BULLISH_FVG_RETEST';
    patternLabelTR = 'Boğa FVG Denge Bölgesi (CE) Onaylı Tepki';
  } else if (bearishFvgRetest) {
    pattern = 'BEARISH_FVG_RETEST';
    patternLabelTR = 'Ayı FVG Denge Bölgesi (CE) Onaylı Ret';
  } else if (bullPinbar) {
    pattern = 'BULL_PINBAR_HAMMER';
    patternLabelTR = 'Boğa Pinbar / Çekiç (Alt Fitil Reddi)';
  } else if (bearShootingStar) {
    pattern = 'BEAR_SHOOTING_STAR';
    patternLabelTR = 'Ayı Kayan Yıldız / Pinbar (Üst Fitil Reddi)';
  } else if (tweezerBottom) {
    pattern = 'TWEEZER_BOTTOM_BULL';
    patternLabelTR = 'Cımbız Dip (Tweezer Çift Fitil Savunması)';
  } else if (tweezerTop) {
    pattern = 'TWEEZER_TOP_BEAR';
    patternLabelTR = 'Cımbız Tepe (Tweezer Çift Fitil Reddi)';
  } else if (bullishEngulfing) {
    pattern = 'BULLISH_ENGULFING_DISPLACEMENT';
    patternLabelTR = 'Boğa Yutan Mum (Kurumsal Alım İvmesi)';
  } else if (bearishEngulfing) {
    pattern = 'BEARISH_ENGULFING_DISPLACEMENT';
    patternLabelTR = 'Ayı Yutan Mum (Kurumsal Satış İvmesi)';
  } else if (sellingClimaxBull) {
    pattern = 'SELLING_CLIMAX_EXHAUSTION_BULL';
    patternLabelTR = 'Satış Tükeniş Mumu (Selling Climax — Tepki Adayı)';
  } else if (buyingClimaxBear) {
    pattern = 'BUYING_CLIMAX_EXHAUSTION_BEAR';
    patternLabelTR = 'Alış Tükeniş Mumu (Buying Climax — Düzeltme Adayı)';
  } else if (bullishFvgCreated) {
    pattern = 'BULLISH_FVG_IMBALANCE';
    patternLabelTR = 'Yeni Boğa FVG (Fair Value Gap Dengesizliği)';
  } else if (bearishFvgCreated) {
    pattern = 'BEARISH_FVG_IMBALANCE';
    patternLabelTR = 'Yeni Ayı FVG (Fair Value Gap Dengesizliği)';
  } else if (h <= prevH && l >= prevL) {
    pattern = 'INSIDE_BAR_COMPRESSION';
    patternLabelTR = 'İç Mum Sıkışması (Kapanmış Volatilite Daralması)';
  }

  const f = Math.pow(10, Math.min(6, Math.max(0, digits)));
  const round = (v: number) => Math.round(v * f) / f;

  const orderBlockZoneTR = activeOrderBlock
    ? `${activeOrderBlock.type === 'BULL' ? 'Boğa OB Destek' : 'Ayı OB Direnç'}: ${round(activeOrderBlock.low)} – ${round(activeOrderBlock.high)}`
    : c >= ema20Arr[idx]
      ? `Yapısal SSL Destek: ${round(sslPool)} – ${round(sslPool + atr1h * 0.45)}`
      : `Yapısal BSL Direnç: ${round(bslPool - atr1h * 0.45)} – ${round(bslPool)}`;

  // ---- UZMAN ALT SKORLARI (-100 .. +100) ----
  // A) Uzman-4: Kapanmış Mum Anatomisi, VSA, Likidite Süpürmesi & OB/FVG Retest Skoru
  // (Eski ters IBS devamlılık hatası kaldırıldı; mikro-doji fitilleri yayılım katsayısıyla sönümlendi!)
  let candleVsaScore = 0;
  if (sweptSslBullish) candleVsaScore += liq.equalLows ? 62 : 52;
  if (sweptBslBearish) candleVsaScore -= liq.equalHighs ? 62 : 52;
  if (morningStar) candleVsaScore += 42;
  if (eveningStar) candleVsaScore -= 42;
  if (vsaSignal === 'STOPPING_VOL_BULL') candleVsaScore += 36;
  if (vsaSignal === 'ABSORPTION_BEAR') candleVsaScore -= 36;
  if (bullishObMitigation) candleVsaScore += 30;
  if (bearishObMitigation) candleVsaScore -= 30;
  if (bullishFvgRetest) candleVsaScore += 28;
  if (bearishFvgRetest) candleVsaScore -= 28;
  if (bullPinbar) candleVsaScore += 32;
  if (bearShootingStar) candleVsaScore -= 32;
  if (tweezerBottom) candleVsaScore += 26;
  if (tweezerTop) candleVsaScore -= 26;
  if (sellingClimaxBull) candleVsaScore += 30;
  if (buyingClimaxBear) candleVsaScore -= 30;
  if (bullishEngulfing && cumRsi2_1h < 78) candleVsaScore += 26;
  if (bearishEngulfing && cumRsi2_1h > 22) candleVsaScore -= 26;
  if (structureState === 'CHOCH_DÖNÜŞ_YUKARI') candleVsaScore += 18;
  else if (structureState === 'CHOCH_DÖNÜŞ_AŞAĞI') candleVsaScore -= 18;

  // Yalnızca anlamlı yayılıma sahip mumlarda fitil reddi puanı ver (1-pip doji gürültüsünü engeller)
  const wickRangeWeight = Math.max(0, Math.min(1, (spreadAtr - 0.22) / 0.52));
  candleVsaScore += wickRangeWeight * (lowerWickRatio - upperWickRatio) * 30;
  candleVsaScore = Math.round(Math.max(-100, Math.min(100, candleVsaScore)));

  // B) Uzman-3: 1H Kısa Vadeli Ortalama Dönüş / Yay Skoru (Gerçek hacim kırılımında sönümlenir)
  let meanRev1hScore = 0;
  if (cumRsi2_1h < 26) {
    meanRev1hScore += ((26 - cumRsi2_1h) / 26) * 62;
  } else if (cumRsi2_1h > 74) {
    meanRev1hScore -= ((cumRsi2_1h - 74) / 26) * 62;
  }
  if (zScoreEma20_1h < -0.85) {
    meanRev1hScore += Math.min(34, Math.abs(zScoreEma20_1h + 0.85) * 22);
  } else if (zScoreEma20_1h > 0.85) {
    meanRev1hScore -= Math.min(34, (zScoreEma20_1h - 0.85) * 22);
  }
  if (ibs1h <= 0.24) meanRev1hScore += 20;
  else if (ibs1h >= 0.76) meanRev1hScore -= 20;

  if (vsaSignal === 'TRUE_DISPLACEMENT') {
    meanRev1hScore *= 0.40;
  }
  meanRev1hScore = Math.round(Math.max(-100, Math.min(100, meanRev1hScore)));

  // C) Uzman-2: Verimlilik-Kapılı 1H Yapısal İvme (Tükenmiş 3S tepe/dip kovalama hatası giderildi!)
  const emaSlope = (ema8Arr[idx] - ema20Arr[idx]) / atr1h;
  let microMom1hScore = emaSlope * 24;
  if (vsaSignal === 'TRUE_DISPLACEMENT') {
    microMom1hScore += ibs1h >= 0.78 ? 34 : -34;
  }
  if (structureState === 'BOS_YUKARI') microMom1hScore += 20;
  else if (structureState === 'BOS_AŞAĞI') microMom1hScore -= 20;
  if (bullishFvgRetest || bullishObMitigation) microMom1hScore += 24;
  if (bearishFvgRetest || bearishObMitigation) microMom1hScore -= 24;
  if (bullishFvgCreated && zScoreClosed < 1.6) microMom1hScore += 14;
  if (bearishFvgCreated && zScoreClosed > -1.6) microMom1hScore -= 14;
  // Verimsiz testerede (er1h < 0.22) ivmeyi sönümle
  if (er1h < 0.22) microMom1hScore *= 0.45;
  microMom1hScore = Math.round(Math.max(-100, Math.min(100, microMom1hScore)));

  return {
    pattern,
    patternLabelTR,
    structureState,
    structureLabelTR,
    evaluatedBarTimestamp: cur.timestamp,
    isClosedBarConfirmed: true,
    bslPoolPrice: round(bslPool),
    sslPoolPrice: round(sslPool),
    equalHighsActive: liq.equalHighs,
    equalLowsActive: liq.equalLows,
    sweptSslBullish,
    sweptBslBearish,
    bullishFvgActive,
    bearishFvgActive,
    bullishFvgRetest,
    bearishFvgRetest,
    bullishObMitigation,
    bearishObMitigation,
    activeFvgZone: activeFvgZone
      ? {
          type: activeFvgZone.type,
          bottom: round(activeFvgZone.bottom),
          top: round(activeFvgZone.top),
          ce: round(activeFvgZone.ce),
        }
      : null,
    activeOrderBlock: activeOrderBlock
      ? {
          type: activeOrderBlock.type,
          low: round(activeOrderBlock.low),
          high: round(activeOrderBlock.high),
        }
      : null,
    vsaSignal,
    vsaDetailTR,
    hasReliableVolume,
    orderBlockZoneTR,
    upperWickRatio,
    lowerWickRatio,
    bodyRatio,
    rvol1h,
    rsi2_1h,
    cumRsi2_1h,
    ibs1h,
    zScoreEma20_1h,
    er1h,
    candleVsaScore,
    meanRev1hScore,
    microMom1hScore,
  };
}

// ProIndicatorTerminal SVG Grafiği İçin Çoklu-Mum SMC (FVG Kutuları, Order Block, BSL/SSL ve Mum Rozetleri) Tarayıcısı
export function scanRecentChartMicrostructure(
  displayBars: HourlyBar[],
  digits = 2
): ChartSmcOverlay {
  const n = displayBars.length;
  const f = Math.pow(10, Math.min(6, Math.max(0, digits)));
  const round = (v: number) => Math.round(v * f) / f;

  if (n < 15) {
    const px = displayBars[n - 1]?.close || 0;
    return {
      bslPoolPrice: round(px),
      sslPoolPrice: round(px),
      equalHighsActive: false,
      equalLowsActive: false,
      fvgZones: [],
      orderBlocks: [],
      annotations: [],
    };
  }

  const atrArr = calcAtrSeries(displayBars, 14);
  const lastClosed = Math.max(10, n - 2);
  const liq = computeConfirmedLiquidityPools(displayBars, lastClosed, Math.max(1e-9, atrArr[lastClosed]));

  const fvgZones: FvgZoneOverlay[] = [];
  const orderBlocks: OrderBlockOverlay[] = [];
  const annotations: CandleChartAnnotation[] = [];

  // Son 45 bar içindeki doldurulmamış (unmitigated) FVG bölgeleri
  for (let k = Math.max(2, n - 45); k <= n - 2; k++) {
    const atr = Math.max(1e-9, atrArr[k] || atrArr[lastClosed]);
    const k2h = Math.max(displayBars[k - 2].high ?? displayBars[k - 2].close, displayBars[k - 2].close);
    const k2l = Math.min(displayBars[k - 2].low ?? displayBars[k - 2].close, displayBars[k - 2].close);
    const kl = Math.min(displayBars[k].low ?? displayBars[k].close, displayBars[k].close);
    const kh = Math.max(displayBars[k].high ?? displayBars[k].close, displayBars[k].close);
    const disp = displayBars[k - 1].close - (displayBars[k - 1].open ?? displayBars[k - 1].close);

    if (kl - k2h >= 0.14 * atr && disp >= 0.50 * atr) {
      let violated = false;
      for (let m = k + 1; m < n; m++) {
        if (displayBars[m].close < k2h) {
          violated = true;
          break;
        }
      }
      if (!violated) {
        fvgZones.push({
          type: 'BULL',
          bottom: round(k2h),
          top: round(kl),
          ce: round((k2h + kl) / 2),
          startIndex: k - 1,
          timestamp: displayBars[k - 1].timestamp,
          mitigated: false,
        });
      }
    }

    if (k2l - kh >= 0.14 * atr && -disp >= 0.50 * atr) {
      let violated = false;
      for (let m = k + 1; m < n; m++) {
        if (displayBars[m].close > k2l) {
          violated = true;
          break;
        }
      }
      if (!violated) {
        fvgZones.push({
          type: 'BEAR',
          bottom: round(kh),
          top: round(k2l),
          ce: round((kh + k2l) / 2),
          startIndex: k - 1,
          timestamp: displayBars[k - 1].timestamp,
          mitigated: false,
        });
      }
    }
  }

  // Son 50 bar içindeki kırılmamış Order Block bölgeleri
  for (let k = Math.max(1, n - 50); k <= n - 4; k++) {
    const atr = Math.max(1e-9, atrArr[k] || atrArr[lastClosed]);
    const ko = displayBars[k].open ?? displayBars[k].close;
    const kc = displayBars[k].close;
    const kh = Math.max(displayBars[k].high ?? kc, ko, kc);
    const kl = Math.min(displayBars[k].low ?? kc, ko, kc);
    const k1o = displayBars[k + 1].open ?? displayBars[k + 1].close;

    if (kc < ko && Math.max(displayBars[k + 1].close, displayBars[k + 2].close) - k1o >= 1.10 * atr) {
      let intact = true;
      for (let m = k + 2; m < n; m++) {
        if (displayBars[m].close < kl) {
          intact = false;
          break;
        }
      }
      if (intact) {
        orderBlocks.push({
          type: 'BULL',
          low: round(kl),
          high: round(Math.min(kh, Math.max(ko, kl + 0.30 * atr))),
          startIndex: k,
          timestamp: displayBars[k].timestamp,
        });
      }
    }

    if (kc > ko && k1o - Math.min(displayBars[k + 1].close, displayBars[k + 2].close) >= 1.10 * atr) {
      let intact = true;
      for (let m = k + 2; m < n; m++) {
        if (displayBars[m].close > kh) {
          intact = false;
          break;
        }
      }
      if (intact) {
        orderBlocks.push({
          type: 'BEAR',
          low: round(Math.max(kl, Math.min(ko, kh - 0.30 * atr))),
          high: round(kh),
          startIndex: k,
          timestamp: displayBars[k].timestamp,
        });
      }
    }
  }

  // Önemli kapanmış mum formasyonu rozetleri (son 60 bar, en az 5 bar aralıklı ki grafik temiz kalsın)
  let lastAnnIdx = -10;
  for (let i = Math.max(22, n - 65); i <= n - 2; i++) {
    if (i - lastAnnIdx < 5) continue;
    const m = analyzeCandlestickAndMicrostructure(displayBars, digits, i);
    if (
      m.pattern === 'SSL_SWEEP_BULL_PINBAR' ||
      m.pattern === 'MORNING_STAR_REVERSAL' ||
      m.pattern === 'VSA_STOPPING_VOLUME_BULL' ||
      m.pattern === 'ORDER_BLOCK_MITIGATION_BULL' ||
      m.pattern === 'BULL_PINBAR_HAMMER'
    ) {
      const shortTag =
        m.pattern === 'SSL_SWEEP_BULL_PINBAR'
          ? 'SSL SWEEP'
          : m.pattern === 'MORNING_STAR_REVERSAL'
            ? 'SABAH YILDIZI'
            : m.pattern === 'VSA_STOPPING_VOLUME_BULL'
              ? 'VSA EMİLİM'
              : m.pattern === 'ORDER_BLOCK_MITIGATION_BULL'
                ? 'OB TEST'
                : 'PINBAR';
      annotations.push({
        index: i,
        timestamp: displayBars[i].timestamp,
        price: round(displayBars[i].low ?? displayBars[i].close),
        direction: 'BULL',
        shortTag,
        pattern: m.pattern,
        detailTR: m.patternLabelTR,
      });
      lastAnnIdx = i;
    } else if (
      m.pattern === 'BSL_SWEEP_BEAR_REJECTION' ||
      m.pattern === 'EVENING_STAR_REVERSAL' ||
      m.pattern === 'VSA_ABSORPTION_SUPPLY_BEAR' ||
      m.pattern === 'ORDER_BLOCK_MITIGATION_BEAR' ||
      m.pattern === 'BEAR_SHOOTING_STAR'
    ) {
      const shortTag =
        m.pattern === 'BSL_SWEEP_BEAR_REJECTION'
          ? 'BSL SWEEP'
          : m.pattern === 'EVENING_STAR_REVERSAL'
            ? 'AKŞAM YILDIZI'
            : m.pattern === 'VSA_ABSORPTION_SUPPLY_BEAR'
              ? 'VSA ARZ'
              : m.pattern === 'ORDER_BLOCK_MITIGATION_BEAR'
                ? 'OB RET'
                : 'SHOOTING';
      annotations.push({
        index: i,
        timestamp: displayBars[i].timestamp,
        price: round(displayBars[i].high ?? displayBars[i].close),
        direction: 'BEAR',
        shortTag,
        pattern: m.pattern,
        detailTR: m.patternLabelTR,
      });
      lastAnnIdx = i;
    }
  }

  return {
    bslPoolPrice: round(liq.bslPool),
    sslPoolPrice: round(liq.sslPool),
    equalHighsActive: liq.equalHighs,
    equalLowsActive: liq.equalLows,
    fvgZones: fvgZones.slice(-3),
    orderBlocks: orderBlocks.slice(-2),
    annotations: annotations.slice(-8),
  };
}

// =========================================================================
// 2. ÖZ-ÖĞRENEN YAPAY ZEKA HAFIZASI (AKTİF-UZMAN MULTIPLICATIVE WEIGHTS)
// =========================================================================
// 2 Yıllık OOS Deneyleriyle Doğrulanmış Başlangıç Öncülleri:
// E1 (Makro Rejim) + E3 (Trend-Uyumlu Çok-Ölçekli Yay) + E4 (Kapanmış SMC Mum) + E5 (XSMOM/Haber)
const DEFAULT_PRIORS: Record<'1' | '4' | '24', Record<ExpertId, number>> = {
  '1': {
    E1_MACRO_TREND: 0.24,
    E2_MICRO_DISPLACEMENT: 0.12,
    E3_MEAN_REV_SPRING: 0.30,
    E4_CANDLE_VSA_SWEEP: 0.20,
    E5_XSMOM_REGIME: 0.14,
  },
  '4': {
    E1_MACRO_TREND: 0.28,
    E2_MICRO_DISPLACEMENT: 0.16,
    E3_MEAN_REV_SPRING: 0.26,
    E4_CANDLE_VSA_SWEEP: 0.15,
    E5_XSMOM_REGIME: 0.15,
  },
  '24': {
    E1_MACRO_TREND: 0.38,
    E2_MICRO_DISPLACEMENT: 0.18,
    E3_MEAN_REV_SPRING: 0.18,
    E4_CANDLE_VSA_SWEEP: 0.08,
    E5_XSMOM_REGIME: 0.18,
  },
};

let cachedBrain: ZeltraAiBrainState | null = null;

function formatTR(ms = Date.now()): string {
  return new Date(ms).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
}

function createEmptyExpertStats(): Record<ExpertId, { right: number; total: number; accuracyPct: number }> {
  return {
    E1_MACRO_TREND: { right: 0, total: 0, accuracyPct: 50 },
    E2_MICRO_DISPLACEMENT: { right: 0, total: 0, accuracyPct: 50 },
    E3_MEAN_REV_SPRING: { right: 0, total: 0, accuracyPct: 50 },
    E4_CANDLE_VSA_SWEEP: { right: 0, total: 0, accuracyPct: 50 },
    E5_XSMOM_REGIME: { right: 0, total: 0, accuracyPct: 50 },
  };
}

function createFreshBrain(nowMs = Date.now()): ZeltraAiBrainState {
  const mkProfile = (h: 1 | 4 | 24): HorizonAdaptiveProfile => {
    const k = String(h) as '1' | '4' | '24';
    return {
      horizonHours: h,
      weights: { ...DEFAULT_PRIORS[k] },
      priorWeights: { ...DEFAULT_PRIORS[k] },
      biasCorrectionScore: 0,
      convictionDeadzone: h === 1 ? 14 : h === 4 ? 15 : 16,
      bandScaleMultiplier: h === 1 ? 1.06 : h === 4 ? 1.12 : 1.05,
      totalLearnedSamples: 0,
      correctCount: 0,
      directionalSamples: 0,
      directionalHits: 0,
      band90HitCount: 0,
      expertHitCounts: createEmptyExpertStats(),
    };
  };

  return {
    version: CORTEX_AI_VERSION,
    updatedAtMs: nowMs,
    updatedAtTR: formatTR(nowMs),
    totalPostMortems: 0,
    horizons: {
      '1': mkProfile(1),
      '4': mkProfile(4),
      '24': mkProfile(24),
    },
    assetProfiles: {},
    rootCauseStats: {
      MAKRO_MİKRO_ÇATIŞMASI_TEPKİ: 0,
      LİKİDİTE_AVLANMASI_SSL_BSL_SWEEP: 0,
      VSA_KURUMSAL_EMİLİM_DÖNÜŞÜ: 0,
      FVG_İVME_KIRILIMI: 0,
      SIĞ_SEANS_TESERE_GÜRÜLTÜSÜ: 0,
      VOLATİLİTE_ŞOKU_TERS_BAR: 0,
      TAM_KURUMSAL_KONFLUENS_İSABETİ: 0,
      KISA_VADE_ORTALAMA_DÖNÜŞ_İSABETİ: 0,
    },
    recentLessons: [],
  };
}

function saveBrainAtomic(brain: ZeltraAiBrainState): void {
  try {
    const dir = path.dirname(AI_BRAIN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${AI_BRAIN_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(brain, null, 2), 'utf-8');
    fs.renameSync(tmp, AI_BRAIN_FILE);
  } catch (err) {
    console.error('[ZELTRA CORTEX v16] AI Brain kayıt hatası:', err);
  }
}

export function loadOrInitAiBrain(): ZeltraAiBrainState {
  if (cachedBrain) return cachedBrain;
  try {
    if (fs.existsSync(AI_BRAIN_FILE)) {
      const raw = JSON.parse(fs.readFileSync(AI_BRAIN_FILE, 'utf-8').replace(/^\uFEFF/, ''));
      if (raw && raw.version === CORTEX_AI_VERSION && raw.horizons?.['1']) {
        cachedBrain = raw as ZeltraAiBrainState;
        return cachedBrain;
      }
    }
  } catch {
    // Bozuk veya eski versiyon hafızayı v16 temiz mimariyle yenile
  }
  cachedBrain = createFreshBrain();
  saveBrainAtomic(cachedBrain);
  return cachedBrain;
}

export function resetAiBrain(): ZeltraAiBrainState {
  cachedBrain = createFreshBrain();
  saveBrainAtomic(cachedBrain);
  return cachedBrain;
}

// =========================================================================
// 3. 5-UZMANLI ÇOK-ÖLÇEKLİ & REJİM-UYUMLU TAHMİN SENTEZLEYİCİ (CORTEX v16.0)
// =========================================================================
export function buildExpertVector(
  ewmacDaily: number,
  aboveSma200: boolean,
  ibs12h: number,
  cumRsi2_12h: number,
  mom12hAtr: number,
  xsmomRank: number,
  xsmomTotal: number,
  volRatioDaily: number,
  micro: MicrostructureAnalysis,
  isCrypto: boolean,
  isMrEligible: boolean,
  htf?: HigherTimeframeMicroContext
): ExpertSignalVector {
  const bullMacro = aboveSma200 && ewmacDaily > 0.5;
  const bearMacro = !aboveSma200 && ewmacDaily < -1.5;

  // E1: Makro Trend & Seküler Rejim (-100..+100)
  const e1 = Math.round(
    Math.max(-100, Math.min(100, (ewmacDaily / 19) * 78 + (aboveSma200 ? 22 : -22)))
  );

  // E2: 4H + 12H + 1H Verimlilik-Kapılı Yapısal İvme (-100..+100)
  const calmMult = volRatioDaily <= 1.25 ? (isCrypto ? 1.15 : 1.0) : volRatioDaily <= 1.45 ? 0.50 : 0.20;
  const t4Score = htf?.trend4hScore ?? mom12hAtr * 20;
  const er4Mult = htf?.er4h !== undefined ? (htf.er4h >= 0.24 ? 1.05 : 0.55) : 1.0;
  const e2 = Math.round(
    Math.max(
      -100,
      Math.min(100, (micro.microMom1hScore * 0.35 + t4Score * 0.40 * er4Mult + mom12hAtr * 22 * 0.25) * calmMult)
    )
  );

  // E3: Trend-Koşullu Çok-Ölçekli (1H + 4H + 12H) Yay / Geri Çekilme (Düşen Bıçak Korumalı!)
  const ibs4 = htf?.ibs4h ?? ibs12h;
  const cr2_4 = htf?.cumRsi2_4h ?? cumRsi2_12h;

  let mr4Score = 0;
  if (ibs4 < 0.28 && cr2_4 < 25) {
    const raw4 = (0.28 - ibs4) * 130 + (25 - cr2_4) * 1.7;
    mr4Score = bullMacro ? raw4 * 1.25 : bearMacro && ewmacDaily < -6 ? raw4 * 0.20 : raw4 * 0.65;
  } else if (ibs4 > 0.72 && cr2_4 > 75) {
    const raw4 = (ibs4 - 0.72) * 130 + (cr2_4 - 75) * 1.7;
    mr4Score = bearMacro ? -raw4 * 1.25 : bullMacro && ewmacDaily > 6 ? -raw4 * 0.25 : -raw4 * 0.65;
  }

  let mr12Score = 0;
  if (ibs12h < 0.26 && cumRsi2_12h < 25) {
    const raw12 = (0.26 - ibs12h) * 155 + (25 - cumRsi2_12h) * 1.85;
    mr12Score = bullMacro || isMrEligible && aboveSma200 ? raw12 * 1.30 : bearMacro && ewmacDaily < -6 ? raw12 * 0.20 : raw12 * 0.65;
  } else if (ibs12h > 0.75 && cumRsi2_12h > 75) {
    const raw12 = (ibs12h - 0.75) * 155 + (cumRsi2_12h - 75) * 1.85;
    mr12Score = bearMacro ? -raw12 * 1.30 : bullMacro && ewmacDaily > 6 ? -raw12 * 0.20 : -raw12 * 0.65;
  }

  // 1H yay sinyalini de makro trend yönüyle uyumluysa güçlendir, güçlü ters trendde frenle!
  let mr1Adj = micro.meanRev1hScore;
  if (mr1Adj > 0 && bearMacro && ewmacDaily < -6) mr1Adj *= 0.30;
  else if (mr1Adj < 0 && bullMacro && ewmacDaily > 6) mr1Adj *= 0.30;
  else if ((mr1Adj > 0 && bullMacro) || (mr1Adj < 0 && bearMacro)) mr1Adj *= 1.20;

  const e3 = Math.round(
    Math.max(-100, Math.min(100, mr1Adj * 0.42 + mr4Score * 0.33 + mr12Score * 0.25))
  );

  // E4: Kapanmış Mum Anatomisi, VSA & Likidite Süpürmesi (Rejim Filtreli!)
  let cAdj = micro.candleVsaScore;
  if (cAdj > 0 && bearMacro && ewmacDaily < -6 && !micro.sweptSslBullish) cAdj *= 0.35;
  if (cAdj < 0 && bullMacro && ewmacDaily > 6 && !micro.sweptBslBearish) cAdj *= 0.35;
  const e4 = Math.round(Math.max(-100, Math.min(100, cAdj)));

  // E5: Kesitsel Liderlik (XSMOM) + Volatilite Rejimi + Nedensel Haber Katalizörü (-100..+100)
  const rankPct = xsmomRank > 0 && xsmomTotal > 1 ? 1 - (xsmomRank - 1) / (xsmomTotal - 1) : 0.5;
  const rankScore = (rankPct - 0.5) * 120;
  const volAdj = volRatioDaily > 1.38 ? -18 : 8;
  let newsScore = 0;
  if (htf?.newsContext && !htf.newsContext.isRecapOnly && Math.abs(htf.newsContext.sentimentScore) >= 0.22) {
    newsScore = htf.newsContext.sentimentScore * 32;
  }
  const e5 = Math.round(
    Math.max(-100, Math.min(100, rankScore + (aboveSma200 ? 16 : -16) + volAdj * 0.4 + newsScore))
  );

  return {
    E1_MACRO_TREND: e1,
    E2_MICRO_DISPLACEMENT: e2,
    E3_MEAN_REV_SPRING: e3,
    E4_CANDLE_VSA_SWEEP: e4,
    E5_XSMOM_REGIME: e5,
  };
}

export interface CortexAdaptiveForecastResult {
  horizonHours: 1 | 4 | 24;
  compositeScore: number;      // -100 .. +100
  rawUnbiasedScore: number;
  confluenceTier: 'SNIPER' | 'HIGH' | 'STANDARD' | 'CHOP';
  expectedDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
  pUp: number;
  pDown: number;
  expectedPrice: number;
  expectedMovePct: number;
  lower90: number;
  upper90: number;
  dominantExpert: ExpertId;
  dominantExpertLabelTR: string;
  aiReasoningTR: string;
}

const FX_MAJORS_SET = new Set(['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'USD/CAD', 'AUD/USD']);
const ENERGY_SET = new Set(['WTI', 'BRENT', 'NATGAS']);
const SECULAR_MR_SET = new Set([
  'NAS100', 'SPX500', 'US30', 'NVDA', 'AAPL', 'MSFT', 'XAU/USD', 'XAG/USD', 'COPPER',
]);

export function computeAdaptiveHorizonForecast(
  horizonHours: 1 | 4 | 24,
  livePrice: number,
  atr12h14: number,
  digits: number,
  experts: ExpertSignalVector,
  micro: MicrostructureAnalysis,
  hasActivePodTrigger: boolean,
  symbol?: string,
  newsContext?: NewsContext | null
): CortexAdaptiveForecastResult {
  const brain = loadOrInitAiBrain();
  const hKey = String(horizonHours) as '1' | '4' | '24';
  const prof = brain.horizons[hKey];
  const w = prof.weights;

  const isFx = symbol ? FX_MAJORS_SET.has(symbol) : false;
  const isEnergy = symbol ? ENERGY_SET.has(symbol) : false;
  const isSecularMr = symbol ? SECULAR_MR_SET.has(symbol) : false;

  const e1Eff = experts.E1_MACRO_TREND;
  const e2Eff = experts.E2_MICRO_DISPLACEMENT;
  const e3Eff = experts.E3_MEAN_REV_SPRING;
  const e4Eff = experts.E4_CANDLE_VSA_SWEEP;
  const e5Eff = experts.E5_XSMOM_REGIME;

  let rawScore =
    w.E1_MACRO_TREND * e1Eff +
    w.E2_MICRO_DISPLACEMENT * e2Eff +
    w.E3_MEAN_REV_SPRING * e3Eff +
    w.E4_CANDLE_VSA_SWEEP * e4Eff +
    w.E5_XSMOM_REGIME * e5Eff;

  // 1) Trend + Geri Çekilme / SMC Mum Sinerji Bonusu (2Y OOS Testte En Yüksek İsabet Üreten Kurulum!)
  let synergyNote = '';
  if (e1Eff * e3Eff > 0 && Math.abs(e1Eff) >= 24 && Math.abs(e3Eff) >= 18) {
    rawScore += Math.sign(e1Eff) * Math.min(14, Math.sqrt(Math.abs(e1Eff * e3Eff)) * 0.26);
    synergyNote = ' • Trend+Yay Konfluensi';
  }
  if (e1Eff * e4Eff > 0 && Math.abs(e1Eff) >= 20 && Math.abs(e4Eff) >= 26) {
    rawScore += Math.sign(e1Eff) * 8;
    synergyNote = synergyNote || ' • Trend+SMC Mum Teyidi';
  }

  // 2) Seküler Boğa Varlıklarında (Endeks/Teknoloji/Altın) Zayıf Makro Ayı Olmadan Kısa Vade Short Freni
  if (isSecularMr && rawScore < 0 && e1Eff > -28) {
    rawScore *= 0.52;
  }

  // 3) +24S Ufkunda FX & Enerji Düşük Trend Sönümlemesi (2Y OOS: FX/Enerji sığ yatayda +24S gürültülüdür)
  if (horizonHours === 24 && (isFx || isEnergy) && Math.abs(e1Eff) < 38) {
    rawScore *= 0.55;
  }
  if (isFx && Math.abs(e1Eff) < 22 && Math.abs(e3Eff) < 28) {
    rawScore *= 0.60;
  }

  // 4) Dipten Geç Satış / Tepeden Geç Alım (Anti-Chasing) Kalkanı
  let exhaustionGuardNote = '';
  if (micro.vsaSignal !== 'TRUE_DISPLACEMENT') {
    const oversoldExhausted =
      micro.zScoreEma20_1h <= -1.15 ||
      micro.cumRsi2_1h <= 16 ||
      (micro.ibs1h <= 0.18 && e3Eff >= 15);
    const overboughtExhausted =
      micro.zScoreEma20_1h >= 1.15 ||
      micro.cumRsi2_1h >= 84 ||
      (micro.ibs1h >= 0.82 && e3Eff <= -15);

    if (rawScore < 0 && oversoldExhausted && horizonHours <= 4) {
      rawScore = rawScore * 0.32 + Math.max(0, e3Eff) * 0.25;
      exhaustionGuardNote = ' • Dipten Geç Satış Kalkanı';
    } else if (rawScore > 0 && overboughtExhausted && horizonHours <= 4) {
      rawScore = rawScore * 0.32 + Math.min(0, e3Eff) * 0.25;
      exhaustionGuardNote = ' • Tepeden Geç Alım Kalkanı';
    } else if (horizonHours === 24 && rawScore < 0 && e3Eff >= 35) {
      rawScore *= 0.45;
      exhaustionGuardNote = ' • +24S Derin Yay Freni';
    }
  }

  // 5) Nedensel Haber Şok Kalkanı: Flaş makro haber teknik yönün tam tersindeyse sinyali frenle!
  if (newsContext && !newsContext.isRecapOnly && newsContext.shockLevel >= 0.65) {
    const newsSign = Math.sign(newsContext.sentimentScore);
    if (newsSign !== 0 && newsSign * rawScore < 0) {
      rawScore *= 0.48;
      exhaustionGuardNote += ' • Ters Haber Şok Freni';
    } else if (newsSign !== 0 && newsSign * rawScore > 0) {
      rawScore += newsSign * 6;
    }
  }

  // Sıkı sınırlandırılmış kalibrasyon düzeltmesi (Deadzone'u asla tek başına aşamaz!)
  const assetProf = symbol && brain.assetProfiles ? brain.assetProfiles[symbol] : undefined;
  const assetBias = assetProf && assetProf.total >= 6 ? Math.max(-4, Math.min(4, assetProf.assetBiasScore * 0.4)) : 0;
  const totalBias = Math.max(-5, Math.min(5, prof.biasCorrectionScore * 0.5 + assetBias));

  // Sığ/verimsiz seansta (ER < 0.18) ve güçlü SMC/Yay tetiği yokken yönsüz gürültü sönümlemesi
  const chopDampener =
    micro.er1h < 0.18 && Math.abs(e3Eff) < 30 && Math.abs(e4Eff) < 35
      ? 0.62
      : 1.0;

  const compositeScore = Math.round(
    Math.max(-100, Math.min(100, (rawScore + totalBias) * chopDampener))
  );

  // Tahmin yönüyle AYNI İŞARETLİ en yüksek katkılı uzmanı bul (ters işaretli uzmanı baskın gösterme hatasını önler!)
  const scoreSign = Math.sign(compositeScore || rawScore || e1Eff || 1);
  const effectiveMap: Record<ExpertId, number> = {
    E1_MACRO_TREND: e1Eff,
    E2_MICRO_DISPLACEMENT: e2Eff,
    E3_MEAN_REV_SPRING: e3Eff,
    E4_CANDLE_VSA_SWEEP: e4Eff,
    E5_XSMOM_REGIME: e5Eff,
  };
  const expertEntries = (Object.keys(w) as ExpertId[]).map((k) => ({
    id: k,
    signed: w[k] * effectiveMap[k],
    contrib: Math.abs(w[k] * effectiveMap[k]),
  }));
  const alignedEntries = expertEntries.filter((e) => e.signed * scoreSign > 0);
  const sortedPool = (alignedEntries.length > 0 ? alignedEntries : expertEntries).sort(
    (a, b) => b.contrib - a.contrib
  );
  const dominantExpert = sortedPool[0].id;

  // Varlık üst üste yanıldıysa (testere kilidi) yönlü eşiği otomatik sıkılaştır
  const missPenalty =
    assetProf && assetProf.consecutiveMisses >= 2
      ? Math.min(6, (assetProf.consecutiveMisses - 1) * 2)
      : 0;
  const lowAccPenalty =
    assetProf && assetProf.total >= 8 && assetProf.accuracyPct < 50 ? 4 : 0;
  const deadzone = prof.convictionDeadzone + missPenalty + lowAccPenalty;

  let expectedDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY' = 'YATAY';
  if (compositeScore >= deadzone) expectedDirection = 'YÜKSELİŞ';
  else if (compositeScore <= -deadzone) expectedDirection = 'DÜŞÜŞ';

  const absComp = Math.abs(compositeScore);
  const confluenceTier: CortexAdaptiveForecastResult['confluenceTier'] =
    expectedDirection === 'YATAY'
      ? 'CHOP'
      : absComp >= deadzone + 12 || (hasActivePodTrigger && absComp >= deadzone + 4)
        ? 'SNIPER'
        : absComp >= deadzone + 5
          ? 'HIGH'
          : 'STANDARD';

  // Kalibre %90 volatilite konisi (ampirik %89–92 kapsama hedefi)
  const steps12 = horizonHours / 12;
  const baseSigma = Math.max(1e-9, atr12h14 * Math.sqrt(Math.max(1 / 10, steps12)) * 0.86);
  const sigma = baseSigma * prof.bandScaleMultiplier;
  const driftFactor = hasActivePodTrigger ? 0.38 : 0.28;
  const delta = (compositeScore / 100) * baseSigma * driftFactor;

  const f = Math.pow(10, Math.min(6, Math.max(0, digits)));
  const round = (v: number) => Math.round(v * f) / f;

  const expectedPrice = round(livePrice + delta);
  const expectedMovePct =
    livePrice > 0 ? +((delta / livePrice) * 100).toFixed(horizonHours === 1 ? 3 : 2) : 0;
  const bandHalf = 1.68 * sigma;
  const lower90 = round(Math.max(livePrice * 0.5, expectedPrice - bandHalf));
  const upper90 = round(expectedPrice + bandHalf);

  const maxShift = hasActivePodTrigger ? 19 : 14;
  const pUp = Math.round(Math.max(26, Math.min(74, 50 + (compositeScore / 100) * maxShift)));
  const pDown = 100 - pUp;

  const aiReasoningTR = `${EXPERT_LABELS_TR[dominantExpert]} (%${Math.round(w[dominantExpert] * 100)}) • Mum: ${micro.patternLabelTR}${synergyNote}${exhaustionGuardNote}`;

  return {
    horizonHours,
    compositeScore,
    rawUnbiasedScore: Math.round(rawScore),
    confluenceTier,
    expectedDirection,
    pUp,
    pDown,
    expectedPrice,
    expectedMovePct,
    lower90,
    upper90,
    dominantExpert,
    dominantExpertLabelTR: EXPERT_LABELS_TR[dominantExpert],
    aiReasoningTR,
  };
}

// =========================================================================
// 4. GERÇEKLEŞEN SONUÇTAN ÖZ-ÖĞRENME & KÖK-NEDEN POST-MORTEM (CORTEX v16.0)
// =========================================================================
export function learnFromSettledForecast(params: {
  forecastId: string;
  symbol: string;
  horizonHours: 1 | 4 | 24;
  predictedDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
  predictedMovePct: number;
  actualMovePct: number;
  inside90Band: boolean;
  directionHit: boolean;
  expertsAtEntry: ExpertSignalVector;
  patternAtEntry: InstitutionalCandlePattern;
  patternLabelAtEntryTR: string;
  er1hAtEntry: number;
  volRatioAtEntry: number;
  settledAtMs?: number;
  skipSave?: boolean;
}): AiPostMortemReflection {
  const brain = loadOrInitAiBrain();
  const nowMs = params.settledAtMs || Date.now();
  const hKey = String(params.horizonHours) as '1' | '4' | '24';
  const prof = brain.horizons[hKey];

  // Bozuk veri sağlayıcı sıçraması (>%16 tekil sapma) varsa ağırlıkları ve biası bozmadan güvenli post-mortem dön!
  const isFeedOutlier = Math.abs(params.actualMovePct) > 16.0;
  const actualDir = params.actualMovePct > 0.01 ? 1 : params.actualMovePct < -0.01 ? -1 : 0;
  const isDirectionalCall =
    params.predictedDirection === 'YÜKSELİŞ' || params.predictedDirection === 'DÜŞÜŞ';

  const oldWeights = { ...prof.weights };
  let bestExpert: ExpertId = 'E1_MACRO_TREND';
  let bestAlignment = -Infinity;
  let worstExpert: ExpertId = 'E2_MICRO_DISPLACEMENT';
  let worstAlignment = Infinity;

  if (!isFeedOutlier) {
    prof.totalLearnedSamples += 1;
    if (params.directionHit) prof.correctCount += 1;
    if (params.inside90Band) prof.band90HitCount += 1;
    if (isDirectionalCall) {
      prof.directionalSamples = (prof.directionalSamples || 0) + 1;
      if (params.directionHit) prof.directionalHits = (prof.directionalHits || 0) + 1;
    }

    // 1) YALNIZCA AKTİF OY VEREN UZMANLARIN (|expScore| >= 8) AĞIRLIĞINI GÜNCELLE!
    // Pasif (0 puan üreten) uzmanların düşüşlerde yapay ağırlık çalmasını %100 engeller.
    const eta = params.horizonHours === 1 ? 0.035 : params.horizonHours === 4 ? 0.045 : 0.055;
    const l2Shrink = 0.008; // ~86 örnek yarı-ömür (8 örnek unutkanlığı giderildi!)
    const newRawWeights: Record<ExpertId, number> = { ...prof.weights };

    for (const expId of Object.keys(prof.weights) as ExpertId[]) {
      const expScore = params.expertsAtEntry[expId] || 0;
      const expSign = expScore >= 8 ? 1 : expScore <= -8 ? -1 : 0;
      const stat = prof.expertHitCounts[expId];

      if (expSign !== 0 && actualDir !== 0) {
        stat.total += 1;
        if (expSign === actualDir) stat.right += 1;
        stat.accuracyPct = +((stat.right / stat.total) * 100).toFixed(1);
      }

      const normExp = Math.max(-1, Math.min(1, expScore / 60));
      const reward = actualDir !== 0 ? normExp * actualDir : 0;

      if (reward > bestAlignment) {
        bestAlignment = reward;
        bestExpert = expId;
      }
      if (reward < worstAlignment) {
        worstAlignment = reward;
        worstExpert = expId;
      }

      // Yalnızca uzman gerçekten anlamlı bir sinyal ürettiyse (|expScore| >= 8) ve piyasa hareket ettiyse güncelle
      if (expSign !== 0 && actualDir !== 0) {
        const multUpdated = prof.weights[expId] * Math.exp(eta * reward);
        const regularized = (1 - l2Shrink) * multUpdated + l2Shrink * prof.priorWeights[expId];
        newRawWeights[expId] = Math.max(0.08, Math.min(0.45, regularized));
      } else {
        newRawWeights[expId] =
          (1 - l2Shrink * 0.5) * prof.weights[expId] + l2Shrink * 0.5 * prof.priorWeights[expId];
      }
    }

    const wSum = Object.values(newRawWeights).reduce((a, b) => a + b, 0) || 1;
    for (const expId of Object.keys(newRawWeights) as ExpertId[]) {
      prof.weights[expId] = +(newRawWeights[expId] / wSum).toFixed(4);
    }

    // 2) Sınırlı Sınıflandırma Kalibrasyon Biası (Açık-döngü salınımı sıfırlar, [-5, +5] bandını aşamaz!)
    if (actualDir !== 0) {
      const predSign =
        params.predictedDirection === 'YÜKSELİŞ'
          ? 0.65
          : params.predictedDirection === 'DÜŞÜŞ'
            ? -0.65
            : 0;
      const calibErr = actualDir - predSign; // [-1.65 .. +1.65]
      prof.biasCorrectionScore = +(
        Math.max(-5, Math.min(5, prof.biasCorrectionScore * 0.96 + calibErr * 0.18))
      ).toFixed(2);

      if (!brain.assetProfiles) brain.assetProfiles = {};
      const curAssetProf: AssetAdaptiveProfile = brain.assetProfiles[params.symbol] || {
        hits: 0,
        total: 0,
        accuracyPct: 58,
        allSettledHits: 0,
        allSettledTotal: 0,
        assetBiasScore: 0,
        consecutiveMisses: 0,
      };

      curAssetProf.allSettledTotal = (curAssetProf.allSettledTotal || 0) + 1;
      if (params.directionHit) {
        curAssetProf.allSettledHits = (curAssetProf.allSettledHits || 0) + 1;
      }

      // KRİTİK DÜZELTME: YATAY_NÖTR sonuçlar yönlü varlık başarısını (hits/total) şişiremez!
      if (isDirectionalCall) {
        curAssetProf.total += 1;
        if (params.directionHit) {
          curAssetProf.hits += 1;
          curAssetProf.consecutiveMisses = 0;
        } else {
          curAssetProf.consecutiveMisses = (curAssetProf.consecutiveMisses || 0) + 1;
        }
        curAssetProf.accuracyPct = +((curAssetProf.hits / curAssetProf.total) * 100).toFixed(1);
      }

      curAssetProf.assetBiasScore = +(
        Math.max(-6, Math.min(6, (curAssetProf.assetBiasScore || 0) * 0.92 + calibErr * 0.35))
      ).toFixed(2);
      curAssetProf.lastOutcome = !params.directionHit
        ? 'YANLIŞ'
        : params.predictedDirection === 'YATAY'
          ? 'YATAY_NÖTR'
          : 'DOĞRU';
      brain.assetProfiles[params.symbol] = curAssetProf;
    }

    // 3) %90 Güven Bandı Genişlik Kalibrasyonu (Hedef %90 kapsama)
    const targetCov = 0.90;
    const curHit = params.inside90Band ? 1 : 0;
    prof.bandScaleMultiplier = +(
      Math.max(0.88, Math.min(1.38, prof.bandScaleMultiplier + 0.018 * (targetCov - curHit)))
    ).toFixed(3);
  }

  // 4) KÖK-NEDEN DURUM ANALİZİ VE ÖZ-ELEŞTİRİ
  let rootCauseCategory: RootCauseCategory = 'TAM_KURUMSAL_KONFLUENS_İSABETİ';
  let rootCauseTitleTR = 'Çoklu-Uzman Kurumsal Uyum İsabeti';
  let whyItHappenedTR = '';
  let nextTimeActionTR = '';

  const e1 = params.expertsAtEntry.E1_MACRO_TREND;
  const e2 = params.expertsAtEntry.E2_MICRO_DISPLACEMENT;
  const e3 = params.expertsAtEntry.E3_MEAN_REV_SPRING;
  const e4 = params.expertsAtEntry.E4_CANDLE_VSA_SWEEP;
  const curAssetBias = brain.assetProfiles?.[params.symbol]?.assetBiasScore ?? 0;

  if (!params.directionHit) {
    if (
      params.patternAtEntry === 'SSL_SWEEP_BULL_PINBAR' ||
      params.patternAtEntry === 'BSL_SWEEP_BEAR_REJECTION' ||
      Math.abs(e4) >= 35
    ) {
      rootCauseCategory = 'LİKİDİTE_AVLANMASI_SSL_BSL_SWEEP';
      rootCauseTitleTR = 'Kurumsal Likidite Süpürmesi (Stop-Hunt Tuzağı)';
      whyItHappenedTR = `Yanlış tahmin yaptım çünkü: Likidite havuzu bölgesinde (${params.patternLabelAtEntryTR}) fiyat ${params.actualMovePct >= 0 ? '+' : ''}${params.actualMovePct}% ters yöne savruldu.`;
      nextTimeActionTR = `Bir sonraki tahminimde: BSL/SSL süpürmelerini yalnızca üst zaman dilimi makro trendiyle uyumlu olduğunda (%${Math.round(prof.weights.E4_CANDLE_VSA_SWEEP * 100)} ağırlık) yönlü sinyale dönüştüreceğim.`;
    } else if (
      params.patternAtEntry === 'VSA_STOPPING_VOLUME_BULL' ||
      params.patternAtEntry === 'VSA_ABSORPTION_SUPPLY_BEAR' ||
      params.patternAtEntry === 'SELLING_CLIMAX_EXHAUSTION_BULL' ||
      params.patternAtEntry === 'BUYING_CLIMAX_EXHAUSTION_BEAR' ||
      params.patternAtEntry === 'CLIMAX_EXHAUSTION_REVERSAL'
    ) {
      rootCauseCategory = 'VSA_KURUMSAL_EMİLİM_DÖNÜŞÜ';
      rootCauseTitleTR = 'VSA Hacim-Yayılım Emilimi (Pasif Limit Duvarı)';
      whyItHappenedTR = `Yanlış tahmin yaptım çünkü: Yüksek aktiviteli mumda (${params.patternLabelAtEntryTR}) kurumsal pasif emirler hareketi ${params.actualMovePct >= 0 ? '+' : ''}${params.actualMovePct}% çevirdi.`;
      nextTimeActionTR = `Bir sonraki tahminimde: Seans-normalize RVOL ≥ 1.35 emilim mumlarında geç kırılım kovalamayıp dönüş uzmanına öncelik vereceğim.`;
    } else if (
      params.predictedDirection === 'YATAY' ||
      params.patternAtEntry === 'BULLISH_FVG_IMBALANCE' ||
      params.patternAtEntry === 'BEARISH_FVG_IMBALANCE' ||
      params.patternAtEntry === 'BULLISH_FVG_RETEST' ||
      params.patternAtEntry === 'BEARISH_FVG_RETEST' ||
      Math.abs(e2) >= 28
    ) {
      rootCauseCategory = 'FVG_İVME_KIRILIMI';
      rootCauseTitleTR =
        params.predictedDirection === 'YATAY'
          ? 'Sıkışma Bandı Kırılımı & Yapısal İvme'
          : '4S/12S Yapısal İvme & FVG Kayması';
      whyItHappenedTR = `Yanlış tahmin yaptım çünkü: ${params.predictedDirection} beklerken yapısal ivme (U2=${e2 >= 0 ? '+' : ''}${e2}) fiyatı ${params.actualMovePct >= 0 ? '+' : ''}${params.actualMovePct}% taşıdı.`;
      nextTimeActionTR = `Bir sonraki +${params.horizonHours}S tahminimde: ${params.symbol} kalibrasyonunu (${curAssetBias >= 0 ? '+' : ''}${curAssetBias}) güncelledim ve doğru yönü bilen ${EXPERT_LABELS_TR[bestExpert]} ağırlığını %${Math.round(prof.weights[bestExpert] * 100)} seviyesine taşıdım.`;
    } else if (params.volRatioAtEntry >= 1.28 || Math.abs(params.actualMovePct) >= 0.85) {
      rootCauseCategory = 'VOLATİLİTE_ŞOKU_TERS_BAR';
      rootCauseTitleTR = 'Yüksek Volatilite Şoku & Ani Haber/Kaldıraç Tasfiyesi';
      whyItHappenedTR = `Yanlış tahmin yaptım çünkü: Volatilite oranı yüksekken (${params.volRatioAtEntry}x) ani haber/likidasyon akışı fiyatı ${params.actualMovePct >= 0 ? '+' : ''}${params.actualMovePct}% savurdu.`;
      nextTimeActionTR = `Bir sonraki tahminimde: %90 bant çarpanını (${prof.bandScaleMultiplier}x) genişletip haber ve aşırı uzama kalkanlarını devrede tutacağım.`;
    } else if (Math.abs(params.actualMovePct) < 0.20 || params.er1hAtEntry < 0.20) {
      rootCauseCategory = 'SIĞ_SEANS_TESERE_GÜRÜLTÜSÜ';
      rootCauseTitleTR = 'Sığ Seans & Düşük Verimlilik Testeresi';
      whyItHappenedTR = `Yanlış tahmin yaptım çünkü: Trend verimliliği düşükken (ER=${params.er1hAtEntry}) fiyat yalnızca ${params.actualMovePct >= 0 ? '+' : ''}${params.actualMovePct}% mikro-gürültü bandında salındı.`;
      nextTimeActionTR = `Bir sonraki tahminimde: ${params.symbol} için yönlü kanaat eşiğini sıkılaştırıp sığ seansta YATAY koruma koridorunda kalacağım.`;
    } else {
      rootCauseCategory = 'MAKRO_MİKRO_ÇATIŞMASI_TEPKİ';
      rootCauseTitleTR = 'Makro Trend vs Kısa Vadeli Yay Çatışması';
      whyItHappenedTR = `Yanlış tahmin yaptım çünkü: Günlük Makro Trend (${e1 >= 0 ? '+' : ''}${e1}) ile çok-ölçekli yay/mum (${e3 >= 0 ? '+' : ''}${e3} / ${e4 >= 0 ? '+' : ''}${e4}) çatışırken ${params.actualMovePct >= 0 ? '+' : ''}${params.actualMovePct}% ters tepki gelişti.`;
      nextTimeActionTR = `Bir sonraki +${params.horizonHours}S tahminimde: Yalnızca Trend ve Geri Çekilme (Yay/SMC) aynı yönde birleştiğinde yüksek kanaat üreteceğim.`;
    }
  } else {
    if (Math.abs(e3) >= 22 || Math.abs(e4) >= 25) {
      rootCauseCategory = 'KISA_VADE_ORTALAMA_DÖNÜŞ_İSABETİ';
      rootCauseTitleTR = 'Trend-Uyumlu Yay & Kapanmış SMC Mum İsabeti';
    } else {
      rootCauseCategory = 'TAM_KURUMSAL_KONFLUENS_İSABETİ';
      rootCauseTitleTR = 'Kurumsal Çoklu-Uzman Konfluens İsabeti';
    }
    whyItHappenedTR = `Doğru tahmin yaptım çünkü: ${EXPERT_LABELS_TR[bestExpert]} ve kapanmış mum mikroyapısı (${params.patternLabelAtEntryTR}) gerçek piyasa akışıyla (${params.actualMovePct >= 0 ? '+' : ''}${params.actualMovePct}%) tam uyum sağladı.`;
    nextTimeActionTR = `Bu başarılı kurulumu hafızada pekiştirdim: +${params.horizonHours}S ufkunda ${EXPERT_LABELS_TR[bestExpert]} ağırlığı %${Math.round(prof.weights[bestExpert] * 100)} olarak korundu.`;
  }

  const wDeltaParts = (Object.keys(prof.weights) as ExpertId[]).map((k) => {
    const diff = (prof.weights[k] - oldWeights[k]) * 100;
    const shortName = k.replace(/^E\d_/, '');
    return `${shortName}: %${Math.round(prof.weights[k] * 100)} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%)`;
  });

  if (!isFeedOutlier) {
    brain.totalPostMortems += 1;
    brain.rootCauseStats[rootCauseCategory] = (brain.rootCauseStats[rootCauseCategory] || 0) + 1;
  }
  brain.updatedAtMs = nowMs;
  brain.updatedAtTR = formatTR(nowMs);

  const reflection: AiPostMortemReflection = {
    id: `PM-${nowMs}-${params.symbol.replace(/[^A-Z0-9]/g, '')}-${params.horizonHours}H`,
    forecastId: params.forecastId,
    symbol: params.symbol,
    horizonHours: params.horizonHours,
    timestampMs: nowMs,
    timestampTR: formatTR(nowMs),
    outcome: !params.directionHit ? 'YANLIŞ' : params.predictedDirection === 'YATAY' ? 'YATAY_NÖTR' : 'DOĞRU',
    predictedDirection: params.predictedDirection,
    actualMovePct: params.actualMovePct,
    predictedMovePct: params.predictedMovePct,
    rootCauseCategory,
    rootCauseTitleTR,
    whyItHappenedTR,
    nextTimeActionTR,
    winningExpert: bestExpert,
    winningExpertLabelTR: EXPERT_LABELS_TR[bestExpert],
    misleadingExpert: !params.directionHit ? worstExpert : undefined,
    misleadingExpertLabelTR: !params.directionHit ? EXPERT_LABELS_TR[worstExpert] : undefined,
    weightDeltaSummaryTR: wDeltaParts.join(' | '),
    patternAtEntryTR: params.patternLabelAtEntryTR,
  };

  if (!isFeedOutlier) {
    brain.recentLessons.unshift(reflection);
    if (brain.recentLessons.length > 120) {
      brain.recentLessons = brain.recentLessons.slice(0, 120);
    }
  }

  if (!params.skipSave) {
    saveBrainAtomic(brain);
  }
  return reflection;
}

export function finalizePretrainedBrain(): ZeltraAiBrainState {
  const brain = loadOrInitAiBrain();
  for (const hk of ['1', '4', '24'] as const) {
    const p = brain.horizons[hk];
    p.biasCorrectionScore = +(p.biasCorrectionScore * 0.25).toFixed(2);
    // Ön-eğitim sayaçlarını sıfırla ki canlı performans karnesi %100 saf ileri-dönük kalsın!
    p.totalLearnedSamples = 0;
    p.correctCount = 0;
    p.directionalSamples = 0;
    p.directionalHits = 0;
    p.band90HitCount = 0;
    p.expertHitCounts = createEmptyExpertStats();
  }
  brain.assetProfiles = {};
  brain.totalPostMortems = 0;
  brain.recentLessons = [];
  for (const k of Object.keys(brain.rootCauseStats) as RootCauseCategory[]) {
    brain.rootCauseStats[k] = 0;
  }
  brain.updatedAtMs = Date.now();
  brain.updatedAtTR = formatTR(brain.updatedAtMs);
  saveBrainAtomic(brain);
  return brain;
}

// server/zeltraSelfLearningAi.ts
// ZELTRA CORTEX v15.0 — Kurumsal Mum/Mikroyapı Zekâsı (VSA, Likidite Süpürmesi, Order Block, FVG)
// ve Öz-Öğrenen 5-Uzmanlı Yapay Zeka & Kök-Neden Öz-Eleştiri (Post-Mortem) Mimarisi.
//
// Her tahmin kilitlenirken 5 bağımsız uzman (Makro Trend, Mikro İvme/FVG, Ortalama Dönüş/Yay,
// Mum/VSA Likidite Süpürmesi, Kesitsel Rejim) kendi alt tahminini üretir.
// Vade dolup gerçek fiyat ortaya çıktığında Cortex v15.0:
//   1. Hangi uzmanın haklı çıktığını ve hangi uzmanın yanıldığını matematiksel olarak ölçer.
//   2. L2-düzenlileştirilmiş Multiplicative Weights (Çarpımsal Ağırlık Güncellemesi) + Bias Düzeltmesi ile
//      ilgili ufuk (+1S, +4S, +24S) ağırlıklarını kalıcı olarak günceller.
//   3. "Yanlış tahmin yaptım çünkü... Bir sonraki tahminimde şuna dikkat edeceğim..." formatında
//      kök-neden durum analizini üretip öğrenme hafızasına (data/zeltra_ai_brain.json) yazar.

import fs from 'fs';
import path from 'path';
import type { HourlyBar } from './marketService';
import {
  calcAtrSeries,
  calcEfficiencyRatio,
  calcEmaSeries,
  calcIbs,
  calcRsiSeries,
} from './zeltraAlphaIndicator';

const AI_BRAIN_FILE = path.resolve(process.cwd(), 'data', 'zeltra_ai_brain.json');
export const CORTEX_AI_VERSION = 'cortex-v15.0-adaptive-5expert';

export type ExpertId =
  | 'E1_MACRO_TREND'
  | 'E2_MICRO_DISPLACEMENT'
  | 'E3_MEAN_REV_SPRING'
  | 'E4_CANDLE_VSA_SWEEP'
  | 'E5_XSMOM_REGIME';

export const EXPERT_LABELS_TR: Record<ExpertId, string> = {
  E1_MACRO_TREND: 'Uzman-1: Makro Trend (Günlük EWMAC & SMA200)',
  E2_MICRO_DISPLACEMENT: 'Uzman-2: Mikro İvme & FVG Dengesizliği',
  E3_MEAN_REV_SPRING: 'Uzman-3: Kısa Vadeli Yay & Ortalama Dönüş (RSI2/IBS)',
  E4_CANDLE_VSA_SWEEP: 'Uzman-4: Mum Anatomisi, VSA Emilim & Likidite Süpürmesi',
  E5_XSMOM_REGIME: 'Uzman-5: Kesitsel Liderlik & Volatilite Rejimi',
};

export type InstitutionalCandlePattern =
  | 'SSL_SWEEP_BULL_PINBAR'
  | 'BSL_SWEEP_BEAR_REJECTION'
  | 'VSA_STOPPING_VOLUME_BULL'
  | 'VSA_ABSORPTION_SUPPLY_BEAR'
  | 'BULLISH_ENGULFING_DISPLACEMENT'
  | 'BEARISH_ENGULFING_DISPLACEMENT'
  | 'BULLISH_FVG_IMBALANCE'
  | 'BEARISH_FVG_IMBALANCE'
  | 'CLIMAX_EXHAUSTION_REVERSAL'
  | 'INSIDE_BAR_COMPRESSION'
  | 'STANDARD_FLOW';

export type MarketStructureState =
  | 'BOS_YUKARI'
  | 'BOS_AŞAĞI'
  | 'CHOCH_DÖNÜŞ_YUKARI'
  | 'CHOCH_DÖNÜŞ_AŞAĞI'
  | 'LİKİDİTE_DENGESİ';

export interface MicrostructureAnalysis {
  pattern: InstitutionalCandlePattern;
  patternLabelTR: string;
  structureState: MarketStructureState;
  structureLabelTR: string;
  bslPoolPrice: number;       // Üstteki Alım Tarafı Likidite Havuzu (Equal/Swing Highs)
  sslPoolPrice: number;       // Alttaki Satım Tarafı Likidite Havuzu (Equal/Swing Lows)
  sweptSslBullish: boolean;   // Alt stopları patlatıp yukarı kapattı mı? (Smart Money Alımı)
  sweptBslBearish: boolean;   // Üst stopları patlatıp aşağı kapattı mı? (Smart Money Satışı)
  bullishFvgActive: boolean;  // 3-mum yukarı Fair Value Gap boşluğu
  bearishFvgActive: boolean;  // 3-mum aşağı Fair Value Gap boşluğu
  vsaSignal: 'STOPPING_VOL_BULL' | 'ABSORPTION_BEAR' | 'TRUE_DISPLACEMENT' | 'LOW_VOL_DRIFT' | 'NEUTRAL';
  vsaDetailTR: string;
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
  whyItHappenedTR: string;      // "Yanlış/Doğru tahmin yaptım çünkü..."
  nextTimeActionTR: string;     // "Bir sonraki tahminimde şuna dikkat edeceğim..."
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
  biasCorrectionScore: number;  // Sistemik aşırı boğa/ayı kaymasını sıfırlayan dinamik düzeltme (-25..+25)
  convictionDeadzone: number;   // Bu eşiğin altındaki zayıf sinyalleri YATAY sayar (8..22)
  bandScaleMultiplier: number;  // %90 güven bandı genişlik kalibratörü (0.75..1.35)
  totalLearnedSamples: number;
  correctCount: number;
  band90HitCount: number;
  expertHitCounts: Record<ExpertId, { right: number; total: number; accuracyPct: number }>;
}

export interface AssetAdaptiveProfile {
  hits: number;
  total: number;
  accuracyPct: number;
  assetBiasScore: number;     // Varlığa özgü yön kayması düzeltmesi (-15..+15)
  consecutiveMisses: number;  // Ardışık yanılma sayacı (testere koruma kilidi için)
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

// =========================================================================
// 1. KURUMSAL MUM ANATOMİSİ, VSA, LİKİDİTE SÜPÜRMESİ & ORDER BLOCK MOTORU
// =========================================================================
export function analyzeCandlestickAndMicrostructure(
  h1Bars: HourlyBar[],
  digits = 2,
  evalIdx?: number
): MicrostructureAnalysis {
  const n = h1Bars.length;
  const idx = evalIdx !== undefined ? Math.min(evalIdx, n - 1) : n - 1;
  if (n < 25 || idx < 20) {
    return {
      pattern: 'STANDARD_FLOW',
      patternLabelTR: 'Standart Fiyat Akışı',
      structureState: 'LİKİDİTE_DENGESİ',
      structureLabelTR: 'Likidite Dengesi',
      bslPoolPrice: h1Bars[Math.max(0, idx)]?.close || 0,
      sslPoolPrice: h1Bars[Math.max(0, idx)]?.close || 0,
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

  const o = cur.open ?? cur.close;
  const h = cur.high ?? Math.max(o, cur.close);
  const l = cur.low ?? Math.min(o, cur.close);
  const c = cur.close;
  const range = Math.max(1e-9, h - l);
  const body = Math.abs(c - o);
  const upperWick = Math.max(0, h - Math.max(o, c));
  const lowerWick = Math.max(0, Math.min(o, c) - l);

  const upperWickRatio = +(upperWick / range).toFixed(2);
  const lowerWickRatio = +(lowerWick / range).toFixed(2);
  const bodyRatio = +(body / range).toFixed(2);
  const ibs1h = +calcIbs(cur).toFixed(3);
  const atr1h = Math.max(1e-9, atr14Arr[idx]);
  const spreadAtr = range / atr1h;

  const rsi2_1h = +rsi2Arr[idx].toFixed(1);
  const cumRsi2_1h = +((rsi2Arr[idx] + rsi2Arr[idx - 1]) / 2).toFixed(1);
  const zScoreEma20_1h = +((c - ema20Arr[idx]) / atr1h).toFixed(2);
  const er1h = +calcEfficiencyRatio(closes, idx, 12).toFixed(2);

  // Relative Volume (RVOL 20-bar)
  let volSum = 0;
  let volCnt = 0;
  for (let j = Math.max(0, idx - 20); j < idx; j++) {
    const v = slice[j].volume || 0;
    if (v > 0) {
      volSum += v;
      volCnt++;
    }
  }
  const avgVol = volCnt > 0 ? volSum / volCnt : 0;
  const curVol = cur.volume || 0;
  const rvol1h = avgVol > 0 && curVol > 0 ? +(curVol / avgVol).toFixed(2) : 1.0;

  // Buy-Side Liquidity (BSL) & Sell-Side Liquidity (SSL) Pools (Önceki 16 mumun en yüksek / en düşüğü)
  let bslPool = -Infinity;
  let sslPool = Infinity;
  for (let j = Math.max(0, idx - 16); j < idx; j++) {
    const jh = slice[j].high ?? slice[j].close;
    const jl = slice[j].low ?? slice[j].close;
    if (jh > bslPool) bslPool = jh;
    if (jl < sslPool) sslPool = jl;
  }

  // Liquidity Sweep Tespiti (Stop-Hunt & Rejection)
  // SSL Sweep (Bullish): Fiyat önceki 16-bar dibinin (sslPool) altına sarkıp stopları patlatır, ama mum sslPool üstünde/güçlü alt fitille kapanır
  const sweptSslBullish =
    (l < sslPool && c > sslPool && ibs1h >= 0.48) ||
    (l <= sslPool * 1.001 && lowerWickRatio >= 0.45 && ibs1h >= 0.55);

  // BSL Sweep (Bearish): Fiyat önceki 16-bar tepesinin (bslPool) üstüne çıkıp stopları patlatır, ama mum bslPool altında/güçlü üst fitille kapanır
  const sweptBslBearish =
    (h > bslPool && c < bslPool && ibs1h <= 0.52) ||
    (h >= bslPool * 0.999 && upperWickRatio >= 0.45 && ibs1h <= 0.45);

  // Fair Value Gap (FVG / 3-Bar Kurumsal Dengesizlik)
  const p2High = prev2.high ?? prev2.close;
  const p2Low = prev2.low ?? prev2.close;
  const bullishFvgActive = l > p2High && (prev.close - (prev.open ?? prev.close)) > atr1h * 0.45;
  const bearishFvgActive = h < p2Low && ((prev.open ?? prev.close) - prev.close) > atr1h * 0.45;

  // Engulfing (Yutan Mum)
  const prevO = prev.open ?? prev.close;
  const prevC = prev.close;
  const bullishEngulfing =
    c > o && prevC < prevO && c >= prevO && o <= prevC && body >= atr1h * 0.55;
  const bearishEngulfing =
    c < o && prevC > prevO && c <= prevO && o >= prevC && body >= atr1h * 0.55;

  // Volume Spread Analysis (VSA — Wyckoff Çaba vs Sonuç)
  let vsaSignal: MicrostructureAnalysis['vsaSignal'] = 'NEUTRAL';
  let vsaDetailTR = 'Standart hacim ve mum yayılımı.';
  if (rvol1h >= 1.35 && (c < prevC || zScoreEma20_1h < -0.6) && (ibs1h >= 0.54 || lowerWickRatio >= 0.42)) {
    vsaSignal = 'STOPPING_VOL_BULL';
    vsaDetailTR = `VSA Durdurucu Hacim (RVOL ${rvol1h}x): Satış baskısı kurumsal pasif alım emirleriyle emildi (IBS ${ibs1h}).`;
  } else if (rvol1h >= 1.35 && (c > prevC || zScoreEma20_1h > 0.6) && (ibs1h <= 0.46 || upperWickRatio >= 0.42)) {
    vsaSignal = 'ABSORPTION_BEAR';
    vsaDetailTR = `VSA Arz Emilimi (RVOL ${rvol1h}x): Alıcılar kurumsal limit satış duvarına çarptı (üst fitil %${Math.round(upperWickRatio * 100)}).`;
  } else if (rvol1h >= 1.30 && spreadAtr >= 1.15 && (ibs1h >= 0.78 || ibs1h <= 0.22)) {
    vsaSignal = 'TRUE_DISPLACEMENT';
    vsaDetailTR = `VSA Gerçek Kurumsal İvme (RVOL ${rvol1h}x, Yayılım ${spreadAtr.toFixed(2)} ATR).`;
  } else if (rvol1h <= 0.75 && spreadAtr <= 0.75) {
    vsaSignal = 'LOW_VOL_DRIFT';
    vsaDetailTR = `Düşük hacimli sığ seans salınımı (RVOL ${rvol1h}x) — kırılım tuzaklarına dikkat.`;
  }

  // Market Structure Shift (BOS / ChoCH)
  let structureState: MarketStructureState = 'LİKİDİTE_DENGESİ';
  let structureLabelTR = 'Likidite Dengesi (Yatay Kanal)';
  if (sweptSslBullish || (ema8Arr[idx] > ema20Arr[idx] && ema20Arr[idx] < ema50Arr[idx] && c > prev.high!)) {
    structureState = 'CHOCH_DÖNÜŞ_YUKARI';
    structureLabelTR = 'ChoCH Yukarı Karakter Değişimi (Tepki Başlangıcı)';
  } else if (sweptBslBearish || (ema8Arr[idx] < ema20Arr[idx] && ema20Arr[idx] > ema50Arr[idx] && c < prev.low!)) {
    structureState = 'CHOCH_DÖNÜŞ_AŞAĞI';
    structureLabelTR = 'ChoCH Aşağı Karakter Değişimi (Zirve Yorgunluğu)';
  } else if (c > bslPool && ibs1h > 0.65) {
    structureState = 'BOS_YUKARI';
    structureLabelTR = 'BOS Yukarı Yapı Kırılımı';
  } else if (c < sslPool && ibs1h < 0.35) {
    structureState = 'BOS_AŞAĞI';
    structureLabelTR = 'BOS Aşağı Yapı Kırılımı';
  }

  // Ana Kurumsal Mum Formasyonu Seçimi
  let pattern: InstitutionalCandlePattern = 'STANDARD_FLOW';
  let patternLabelTR = 'Standart Mum Akışı';
  if (sweptSslBullish) {
    pattern = 'SSL_SWEEP_BULL_PINBAR';
    patternLabelTR = 'SSL Likidite Süpürmesi & Boğa Pinbar (Stop-Hunt Dönüşü)';
  } else if (sweptBslBearish) {
    pattern = 'BSL_SWEEP_BEAR_REJECTION';
    patternLabelTR = 'BSL Likidite Süpürmesi & Ayı Reddi (Stop-Hunt Tuzağı)';
  } else if (vsaSignal === 'STOPPING_VOL_BULL') {
    pattern = 'VSA_STOPPING_VOLUME_BULL';
    patternLabelTR = 'VSA Durdurucu Hacim (Kurumsal Dip Emilimi)';
  } else if (vsaSignal === 'ABSORPTION_BEAR') {
    pattern = 'VSA_ABSORPTION_SUPPLY_BEAR';
    patternLabelTR = 'VSA Arz Emilimi (Kurumsal Tepe Satışı)';
  } else if (bullishEngulfing) {
    pattern = 'BULLISH_ENGULFING_DISPLACEMENT';
    patternLabelTR = 'Boğa Yutan Mum (Kurumsal Alım İvmesi)';
  } else if (bearishEngulfing) {
    pattern = 'BEARISH_ENGULFING_DISPLACEMENT';
    patternLabelTR = 'Ayı Yutan Mum (Kurumsal Satış İvmesi)';
  } else if (bullishFvgActive) {
    pattern = 'BULLISH_FVG_IMBALANCE';
    patternLabelTR = 'Boğa FVG (Fair Value Gap Dengesizliği)';
  } else if (bearishFvgActive) {
    pattern = 'BEARISH_FVG_IMBALANCE';
    patternLabelTR = 'Ayı FVG (Fair Value Gap Dengesizliği)';
  } else if (spreadAtr >= 1.85 && (cumRsi2_1h <= 10 || cumRsi2_1h >= 90)) {
    pattern = 'CLIMAX_EXHAUSTION_REVERSAL';
    patternLabelTR = 'Tükeniş Mumu (Climax Exhaustion — Ortalama Dönüş Adayı)';
  } else if (h <= (prev.high ?? prev.close) && l >= (prev.low ?? prev.close)) {
    pattern = 'INSIDE_BAR_COMPRESSION';
    patternLabelTR = 'İç Mum Sıkışması (Volatilite Daralması)';
  }

  const f = Math.pow(10, digits);
  const round = (v: number) => Math.round(v * f) / f;
  const orderBlockZoneTR =
    c >= ema20Arr[idx]
      ? `Boğa OB Destek: ${round(sslPool)} – ${round(sslPool + atr1h * 0.6)}`
      : `Ayı OB Direnç: ${round(bslPool - atr1h * 0.6)} – ${round(bslPool)}`;

  // ---- UZMAN ALT SKORLARI (-100 .. +100) ----
  // A) Uzman-4: Mum / VSA / Likidite Süpürmesi Skoru
  let candleVsaScore = 0;
  if (sweptSslBullish) candleVsaScore += 55;
  if (sweptBslBearish) candleVsaScore -= 55;
  if (vsaSignal === 'STOPPING_VOL_BULL') candleVsaScore += 35;
  if (vsaSignal === 'ABSORPTION_BEAR') candleVsaScore -= 35;
  if (bullishEngulfing) candleVsaScore += 38;
  if (bearishEngulfing) candleVsaScore -= 38;
  // Fitil baskısı
  candleVsaScore += (lowerWickRatio - upperWickRatio) * 42;
  // Mum kapanış konumu (IBS)
  if (spreadAtr >= 0.45) {
    candleVsaScore += (ibs1h - 0.5) * 32;
  }
  candleVsaScore = Math.round(Math.max(-100, Math.min(100, candleVsaScore)));

  // B) Uzman-3: 1H Kısa Vadeli Ortalama Dönüş (Mean-Reversion Spring) Skoru
  // Aşırı satımda (+), aşırı alımda (-) üretir — özellikle +1S ve +4S ufuklarında tepkileri yakalar!
  let meanRev1hScore = 0;
  if (cumRsi2_1h < 30) {
    meanRev1hScore += ((30 - cumRsi2_1h) / 30) * 65;
  } else if (cumRsi2_1h > 70) {
    meanRev1hScore -= ((cumRsi2_1h - 70) / 30) * 65;
  }
  if (zScoreEma20_1h < -0.8) {
    meanRev1hScore += Math.min(35, Math.abs(zScoreEma20_1h + 0.8) * 22);
  } else if (zScoreEma20_1h > 0.8) {
    meanRev1hScore -= Math.min(35, (zScoreEma20_1h - 0.8) * 22);
  }
  if (ibs1h < 0.22) meanRev1hScore += 18;
  else if (ibs1h > 0.78) meanRev1hScore -= 18;
  meanRev1hScore = Math.round(Math.max(-100, Math.min(100, meanRev1hScore)));

  // C) Uzman-2: 1H Mikro İvme & FVG Displacement Skoru
  const mom3h = idx >= 3 ? (c - slice[idx - 3].close) / (atr1h * Math.sqrt(3)) : 0;
  const emaDiff = (ema8Arr[idx] - ema20Arr[idx]) / atr1h;
  let microMom1hScore = mom3h * 26 + emaDiff * 28;
  if (bullishFvgActive) microMom1hScore += 28;
  if (bearishFvgActive) microMom1hScore -= 28;
  microMom1hScore = Math.round(Math.max(-100, Math.min(100, microMom1hScore)));

  return {
    pattern,
    patternLabelTR,
    structureState,
    structureLabelTR,
    bslPoolPrice: round(bslPool),
    sslPoolPrice: round(sslPool),
    sweptSslBullish,
    sweptBslBearish,
    bullishFvgActive,
    bearishFvgActive,
    vsaSignal,
    vsaDetailTR,
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

// =========================================================================
// 2. ÖZ-ÖĞRENEN YAPAY ZEKA HAFIZASI (MULTIPLICATIVE WEIGHTS + BIAS LEARNER)
// =========================================================================
const DEFAULT_PRIORS: Record<'1' | '4' | '24', Record<ExpertId, number>> = {
  // +1 Saat: Kısa vadede Mum/VSA Likidite Süpürmesi + 1H Ortalama Dönüş + 1H Mikro İvme baskındır;
  // Günlük EWMAC sadece %9 ağırlık alır (böylece günlük ayı trendinde saatlik tepki yükselişlerini kaçırmaz!)
  '1': {
    E1_MACRO_TREND: 0.09,
    E2_MICRO_DISPLACEMENT: 0.23,
    E3_MEAN_REV_SPRING: 0.31,
    E4_CANDLE_VSA_SWEEP: 0.29,
    E5_XSMOM_REGIME: 0.08,
  },
  // +4 Saat: Mikro yapı, ortalama dönüş ve orta vadeli trend dengesi
  '4': {
    E1_MACRO_TREND: 0.18,
    E2_MICRO_DISPLACEMENT: 0.24,
    E3_MEAN_REV_SPRING: 0.25,
    E4_CANDLE_VSA_SWEEP: 0.23,
    E5_XSMOM_REGIME: 0.10,
  },
  // +24 Saat: Kurumsal Makro Trend (EWMAC), 12H Yay ve Kesitsel Liderlik ana sürücüdür
  '24': {
    E1_MACRO_TREND: 0.34,
    E2_MICRO_DISPLACEMENT: 0.22,
    E3_MEAN_REV_SPRING: 0.18,
    E4_CANDLE_VSA_SWEEP: 0.12,
    E5_XSMOM_REGIME: 0.14,
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
      convictionDeadzone: h === 1 ? 10 : h === 4 ? 11 : 12,
      bandScaleMultiplier: 1.0,
      totalLearnedSamples: 0,
      correctCount: 0,
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
    console.error('[ZELTRA CORTEX v15] AI Brain kayıt hatası:', err);
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
    // Re-init on corrupt file
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
// 3. 5-UZMANLI ADAPTİF TAHMİN SENTEZLEYİCİ
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
  isMrEligible: boolean
): ExpertSignalVector {
  // E1: Makro Trend (-100..+100)
  const e1 = Math.round(
    Math.max(-100, Math.min(100, (ewmacDaily / 20) * 82 + (aboveSma200 ? 18 : -18)))
  );

  // E2: Mikro İvme & FVG Displacement (-100..+100)
  const calmMult = volRatioDaily < 1.25 ? (isCrypto ? 1.12 : 1.0) : 0.55;
  const e2 = Math.round(
    Math.max(-100, Math.min(100, (micro.microMom1hScore * 0.65 + mom12hAtr * 20) * calmMult))
  );

  // E3: Ortalama Dönüş & Yay (1H + 12H Mean-Reversion Spring) (-100..+100)
  let mr12Score = 0;
  if (ibs12h < 0.25 && cumRsi2_12h < 25) {
    mr12Score = ((0.25 - ibs12h) * 160 + (25 - cumRsi2_12h) * 1.8) * (aboveSma200 || isMrEligible ? 1.1 : 0.75);
  } else if (ibs12h > 0.78 && cumRsi2_12h > 75) {
    mr12Score = -((ibs12h - 0.78) * 160 + (cumRsi2_12h - 75) * 1.8);
  }
  const e3 = Math.round(Math.max(-100, Math.min(100, micro.meanRev1hScore * 0.62 + mr12Score * 0.38)));

  // E4: Mum Anatomisi, VSA Emilim & Likidite Süpürmesi (-100..+100)
  const e4 = micro.candleVsaScore;

  // E5: Kesitsel Liderlik (XSMOM) & Rejim (-100..+100)
  const rankPct = xsmomRank > 0 && xsmomTotal > 1 ? 1 - (xsmomRank - 1) / (xsmomTotal - 1) : 0.5;
  const rankScore = (rankPct - 0.5) * 130;
  const volPenalty = volRatioDaily > 1.35 ? -20 : 10;
  const e5 = Math.round(Math.max(-100, Math.min(100, rankScore + (aboveSma200 ? 15 : -15) + volPenalty * 0.4)));

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
  compositeScore: number;      // -100 .. +100 (adaptif ağırlıklı + bias düzeltmeli)
  rawUnbiasedScore: number;
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

export function computeAdaptiveHorizonForecast(
  horizonHours: 1 | 4 | 24,
  livePrice: number,
  atr12h14: number,
  digits: number,
  experts: ExpertSignalVector,
  micro: MicrostructureAnalysis,
  hasActivePodTrigger: boolean,
  symbol?: string
): CortexAdaptiveForecastResult {
  const brain = loadOrInitAiBrain();
  const hKey = String(horizonHours) as '1' | '4' | '24';
  const prof = brain.horizons[hKey];
  const w = prof.weights;

  let e1Eff = experts.E1_MACRO_TREND;
  let e3Eff = experts.E3_MEAN_REV_SPRING;

  // +24S Derin Yay / Aşırı Satım Koruma Kalkanı:
  // Günlük trend ayıdayken (E1 < -25) 12H/1H yay aşırı gerilmişse (E3 >= +28), +24S ufkunda dipten geç short açmayı frenle
  if (
    horizonHours === 24 &&
    e1Eff * e3Eff < 0 &&
    Math.abs(e3Eff) >= 28
  ) {
    e1Eff *= 0.62;
    e3Eff *= 1.45;
  }

  let rawScore =
    w.E1_MACRO_TREND * e1Eff +
    w.E2_MICRO_DISPLACEMENT * experts.E2_MICRO_DISPLACEMENT +
    w.E3_MEAN_REV_SPRING * e3Eff +
    w.E4_CANDLE_VSA_SWEEP * experts.E4_CANDLE_VSA_SWEEP +
    w.E5_XSMOM_REGIME * experts.E5_XSMOM_REGIME;

  // +1S & +4S Yorulma / Geç Peşinden Koşma (Anti-Chasing) Kalkanı:
  // Sert düşüş mumundan hemen sonra (zScore <= -1.10 veya RSI2 <= 18 veya IBS <= 0.18) hacim patlaması yoksa dipten tekrar DÜŞÜŞ kovalamayı kes!
  let exhaustionGuardNote = '';
  if (horizonHours <= 4 && micro.rvol1h < 1.55) {
    const oversoldExhausted =
      micro.zScoreEma20_1h <= -1.10 ||
      micro.rsi2_1h <= 18 ||
      (micro.ibs1h <= 0.18 && experts.E3_MEAN_REV_SPRING >= 18);
    const overboughtExhausted =
      micro.zScoreEma20_1h >= 1.15 ||
      micro.rsi2_1h >= 84 ||
      (micro.ibs1h >= 0.84 && experts.E3_MEAN_REV_SPRING <= -18);

    if (rawScore < 0 && oversoldExhausted) {
      rawScore = rawScore * 0.42 + Math.max(0, experts.E3_MEAN_REV_SPRING) * 0.28;
      exhaustionGuardNote = ' • Dipten Geç Satış Kalkanı Aktif';
    } else if (rawScore > 0 && overboughtExhausted) {
      rawScore = rawScore * 0.42 + Math.min(0, experts.E3_MEAN_REV_SPRING) * 0.28;
      exhaustionGuardNote = ' • Tepeden Geç Alım Kalkanı Aktif';
    }
  }

  const assetProf = symbol && brain.assetProfiles ? brain.assetProfiles[symbol] : undefined;
  const assetBias = assetProf ? assetProf.assetBiasScore * (horizonHours === 1 ? 0.55 : 0.40) : 0;
  const totalBias = prof.biasCorrectionScore * 0.75 + assetBias;

  // Sığ/verimsiz seansta (ER < 0.16) yönsüz gürültü sönümlemesi
  const chopDampener = horizonHours <= 4 && micro.er1h < 0.16 && micro.vsaSignal === 'LOW_VOL_DRIFT' ? 0.65 : 1.0;
  const compositeScore = Math.round(
    Math.max(-100, Math.min(100, (rawScore + totalBias) * chopDampener))
  );

  // En yüksek katkıyı veren uzmanı bul
  const expertEntries = (Object.keys(w) as ExpertId[]).map((k) => ({
    id: k,
    contrib: Math.abs(w[k] * experts[k]),
    signed: w[k] * experts[k],
  }));
  expertEntries.sort((a, b) => b.contrib - a.contrib);
  const dominantExpert = expertEntries[0].id;

  // Varlık üst üste yanıldıysa (testere piyasası) yönlü eşiği otomatik sıkılaştır (+2..+5 puan)
  const missPenalty = assetProf && assetProf.consecutiveMisses >= 2 ? Math.min(5, (assetProf.consecutiveMisses - 1) * 2) : 0;
  const deadzone = prof.convictionDeadzone + missPenalty;
  let expectedDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY' = 'YATAY';
  if (compositeScore >= deadzone) expectedDirection = 'YÜKSELİŞ';
  else if (compositeScore <= -deadzone) expectedDirection = 'DÜŞÜŞ';

  // Kalibre volatilite konisi
  const steps12 = horizonHours / 12;
  const baseSigma = Math.max(1e-9, atr12h14 * Math.sqrt(Math.max(1 / 12, steps12)) * 0.78);
  const sigma = baseSigma * prof.bandScaleMultiplier;
  const driftFactor = hasActivePodTrigger ? 0.36 : 0.25;
  const delta = (compositeScore / 100) * baseSigma * driftFactor;

  const f = Math.pow(10, Math.min(6, Math.max(0, digits)));
  const round = (v: number) => Math.round(v * f) / f;

  const expectedPrice = round(livePrice + delta);
  const expectedMovePct =
    livePrice > 0 ? +((delta / livePrice) * 100).toFixed(horizonHours === 1 ? 3 : 2) : 0;
  const bandHalf = 1.65 * sigma;
  const lower90 = round(Math.max(livePrice * 0.5, expectedPrice - bandHalf));
  const upper90 = round(expectedPrice + bandHalf);

  const maxShift = hasActivePodTrigger ? 17 : 11;
  const pUp = Math.round(Math.max(28, Math.min(72, 50 + (compositeScore / 100) * maxShift)));
  const pDown = 100 - pUp;

  const aiReasoningTR = `${EXPERT_LABELS_TR[dominantExpert]} baskın (Ağırlık %${Math.round(w[dominantExpert] * 100)}) • Mum: ${micro.patternLabelTR} • Bias: ${totalBias >= 0 ? '+' : ''}${totalBias.toFixed(1)}${exhaustionGuardNote}`;

  return {
    horizonHours,
    compositeScore,
    rawUnbiasedScore: Math.round(rawScore),
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
// 4. GERÇEKLEŞEN SONUÇTAN ÖZ-ÖĞRENME & KÖK-NEDEN POST-MORTEM TEŞHİSİ
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

  const actualDir = params.actualMovePct > 0.015 ? 1 : params.actualMovePct < -0.015 ? -1 : 0;

  prof.totalLearnedSamples += 1;
  if (params.directionHit) prof.correctCount += 1;
  if (params.inside90Band) prof.band90HitCount += 1;

  // 1) Her bir uzmanın bu tahmindeki gerçek başarısını ölç ve Multiplicative Weights ile güncelle
  const eta = params.horizonHours === 1 ? 0.08 : params.horizonHours === 4 ? 0.09 : 0.10; // Öğrenme hızı
  const l2Shrink = 0.08; // Prior'a çekim (overfitting kalkanı!)

  let bestExpert: ExpertId = 'E3_MEAN_REV_SPRING';
  let bestAlignment = -Infinity;
  let worstExpert: ExpertId = 'E1_MACRO_TREND';
  let worstAlignment = Infinity;

  const oldWeights = { ...prof.weights };
  const newRawWeights: Record<ExpertId, number> = { ...prof.weights };

  for (const expId of Object.keys(prof.weights) as ExpertId[]) {
    const expScore = params.expertsAtEntry[expId] || 0;
    const expSign = expScore > 6 ? 1 : expScore < -6 ? -1 : 0;
    // Uzman gerçek hareket yönünü bildi mi?
    const stat = prof.expertHitCounts[expId];
    if (expSign !== 0 && actualDir !== 0) {
      stat.total += 1;
      if (expSign === actualDir) stat.right += 1;
      stat.accuracyPct = +((stat.right / stat.total) * 100).toFixed(1);
    }

    // Uzman ödülü: [-1 .. +1]
    const normExp = Math.max(-1, Math.min(1, expScore / 65));
    const reward = actualDir !== 0 ? normExp * actualDir : (1 - Math.abs(normExp)) * 0.3;

    if (reward > bestAlignment) {
      bestAlignment = reward;
      bestExpert = expId;
    }
    if (reward < worstAlignment) {
      worstAlignment = reward;
      worstExpert = expId;
    }

    const multUpdated = prof.weights[expId] * Math.exp(eta * reward);
    const regularized = (1 - l2Shrink) * multUpdated + l2Shrink * prof.priorWeights[expId];
    newRawWeights[expId] = Math.max(0.06, Math.min(0.48, regularized));
  }

  // Normalize weights to sum = 1.0
  const wSum = Object.values(newRawWeights).reduce((a, b) => a + b, 0) || 1;
  for (const expId of Object.keys(newRawWeights) as ExpertId[]) {
    prof.weights[expId] = +(newRawWeights[expId] / wSum).toFixed(4);
  }

  // 2) Sistemik + Varlığa Özgü Bias (Yön Kayması) ve %90 Bant Genişliği Adaptasyonu
  const moveResidual = params.actualMovePct - params.predictedMovePct;
  const biasSignal = Math.max(-18, Math.min(18, moveResidual * (params.horizonHours === 1 ? 14 : 7)));
  prof.biasCorrectionScore = +(
    Math.max(-24, Math.min(24, prof.biasCorrectionScore * 0.84 + biasSignal * 0.16))
  ).toFixed(2);

  if (!brain.assetProfiles) brain.assetProfiles = {};
  const curAssetProf = brain.assetProfiles[params.symbol] || {
    hits: 0,
    total: 0,
    accuracyPct: 50,
    assetBiasScore: 0,
    consecutiveMisses: 0,
  };
  curAssetProf.total += 1;
  if (params.directionHit) {
    curAssetProf.hits += 1;
    curAssetProf.consecutiveMisses = 0;
  } else {
    curAssetProf.consecutiveMisses = (curAssetProf.consecutiveMisses || 0) + 1;
  }
  curAssetProf.accuracyPct = +((curAssetProf.hits / curAssetProf.total) * 100).toFixed(1);
  curAssetProf.assetBiasScore = +(
    Math.max(-15, Math.min(15, (curAssetProf.assetBiasScore || 0) * 0.78 + biasSignal * 0.22))
  ).toFixed(2);
  curAssetProf.lastOutcome = !params.directionHit
    ? 'YANLIŞ'
    : params.predictedDirection === 'YATAY'
      ? 'YATAY_NÖTR'
      : 'DOĞRU';
  brain.assetProfiles[params.symbol] = curAssetProf;

  // %90 bant kalibrasyonu: hedef %90 kapsama
  const targetCov = 0.90;
  const curHit = params.inside90Band ? 1 : 0;
  prof.bandScaleMultiplier = +(
    Math.max(0.78, Math.min(1.32, prof.bandScaleMultiplier + 0.025 * (targetCov - curHit)))
  ).toFixed(3);

  // 3) KÖK-NEDEN DURUM ANALİZİ VE ÖZ-ELEŞTİRİ ("Neden yanıldım / bildim? Bir dahaki sefere ne yapacağım?")
  let rootCauseCategory: RootCauseCategory = 'TAM_KURUMSAL_KONFLUENS_İSABETİ';
  let rootCauseTitleTR = 'Çoklu-Uzman Kurumsal Uyum İsabeti';
  let whyItHappenedTR = '';
  let nextTimeActionTR = '';

  const e1 = params.expertsAtEntry.E1_MACRO_TREND;
  const e2 = params.expertsAtEntry.E2_MICRO_DISPLACEMENT;
  const e3 = params.expertsAtEntry.E3_MEAN_REV_SPRING;
  const e4 = params.expertsAtEntry.E4_CANDLE_VSA_SWEEP;

  if (!params.directionHit) {
    // YANLIŞ TAHMİN KÖK-NEDEN TEŞHİSİ (Önce en spesifik mum/mikroyapı nedenleri kontrol edilir!)
    if (
      params.patternAtEntry === 'SSL_SWEEP_BULL_PINBAR' ||
      params.patternAtEntry === 'BSL_SWEEP_BEAR_REJECTION' ||
      Math.abs(e4) >= 35
    ) {
      rootCauseCategory = 'LİKİDİTE_AVLANMASI_SSL_BSL_SWEEP';
      rootCauseTitleTR = 'Kurumsal Likidite Süpürmesi (Stop-Hunt Tuzağı)';
      whyItHappenedTR = `Yanlış tahmin yaptım çünkü: Fiyat kırılım yönünde devam edecek görünürken kurumsal algoritmalar likidite havuzundaki stopları süpürüp (${params.patternLabelAtEntryTR}) fiyatı ${params.actualMovePct >= 0 ? '+' : ''}${params.actualMovePct}% ters yöne çevirdi.`;
      nextTimeActionTR = `Bir sonraki tahminimde: Önceki 16-bar tepe/dip (BSL/SSL) bölgelerinde uzun fitilli ret mumu oluştuğunda kırılım yönüne girmek yerine Uzman-4 (Mum & Likidite Süpürmesi) dönüş sinyalini (%${Math.round(prof.weights.E4_CANDLE_VSA_SWEEP * 100)} ağırlık) dinleyeceğim.`;
    } else if (
      params.patternAtEntry === 'VSA_STOPPING_VOLUME_BULL' ||
      params.patternAtEntry === 'VSA_ABSORPTION_SUPPLY_BEAR' ||
      params.patternAtEntry === 'CLIMAX_EXHAUSTION_REVERSAL'
    ) {
      rootCauseCategory = 'VSA_KURUMSAL_EMİLİM_DÖNÜŞÜ';
      rootCauseTitleTR = 'VSA Hacim-Yayılım Emilimi (Pasif Limit Duvarı)';
      whyItHappenedTR = `Yanlış tahmin yaptım çünkü: Yüksek hacimli harekette kurumsal pasif limit emirleri karşı tarafı emdi (${params.patternLabelAtEntryTR}) ve hareket ${params.actualMovePct >= 0 ? '+' : ''}${params.actualMovePct}% tersine döndü.`;
      nextTimeActionTR = `Bir sonraki tahminimde: RVOL ≥ 1.35 iken mum yayılımı dar kalıyor veya ters yarıda kapanıyorsa VSA Emilim dönüş uzmanına öncelik vereceğim.`;
    } else if (
      params.predictedDirection === 'YATAY' ||
      params.patternAtEntry === 'BULLISH_FVG_IMBALANCE' ||
      params.patternAtEntry === 'BEARISH_FVG_IMBALANCE' ||
      params.patternAtEntry === 'BULLISH_ENGULFING_DISPLACEMENT' ||
      params.patternAtEntry === 'BEARISH_ENGULFING_DISPLACEMENT' ||
      Math.abs(e2) >= 28
    ) {
      rootCauseCategory = 'FVG_İVME_KIRILIMI';
      rootCauseTitleTR =
        params.predictedDirection === 'YATAY'
          ? 'Sıkışma Bandı Kırılımı & Mikro İvme Patlaması'
          : 'Mikro İvme & FVG Dengesizlik Kayması';
      whyItHappenedTR = `Yanlış tahmin yaptım çünkü: ${params.predictedDirection} beklerken mikro ivme ve FVG dengesizliği (U2=${e2 >= 0 ? '+' : ''}${e2}) fiyatı ${params.actualMovePct >= 0 ? '+' : ''}${params.actualMovePct}% hızlandırdı.`;
      nextTimeActionTR = `Bir sonraki +${params.horizonHours}S tahminimde: ${params.symbol} için varlık biasını (${curAssetProf.assetBiasScore >= 0 ? '+' : ''}${curAssetProf.assetBiasScore}) güncelledim ve doğru yönü bilen ${EXPERT_LABELS_TR[bestExpert]} ağırlığını %${Math.round(prof.weights[bestExpert] * 100)} seviyesine yükselttim.`;
    } else if (params.volRatioAtEntry >= 1.28 || Math.abs(params.actualMovePct) >= 0.85) {
      rootCauseCategory = 'VOLATİLİTE_ŞOKU_TERS_BAR';
      rootCauseTitleTR = 'Yüksek Volatilite Şoku & Ani Haber/Kaldıraç Tasfiyesi';
      whyItHappenedTR = `Yanlış tahmin yaptım çünkü: Volatilite oranı yüksekken (${params.volRatioAtEntry}x) ani kaldıraç tasfiyesi fiyatı ${params.actualMovePct >= 0 ? '+' : ''}${params.actualMovePct}% savurdu.`;
      nextTimeActionTR = `Bir sonraki tahminimde: Volatilite genişlemesinde (%90 bant çarpanı ${prof.bandScaleMultiplier}x) aşırı uzamış mumların peşinden gitmeyip Dipten/Tepeden Geç Giriş Kalkanını devreye sokacağım.`;
    } else if (Math.abs(params.actualMovePct) < 0.20 || params.er1hAtEntry < 0.20) {
      rootCauseCategory = 'SIĞ_SEANS_TESERE_GÜRÜLTÜSÜ';
      rootCauseTitleTR = 'Sığ Seans & Düşük Verimlilik Testeresi';
      whyItHappenedTR = `Yanlış tahmin yaptım çünkü: Trend verimliliği düşükken (ER=${params.er1hAtEntry}) fiyat yalnızca ${params.actualMovePct >= 0 ? '+' : ''}${params.actualMovePct}% mikro-gürültü bandında rastgele salındı.`;
      nextTimeActionTR = `Bir sonraki tahminimde: ${params.symbol} için yönlü kanaat eşiğini (${prof.convictionDeadzone + Math.min(5, Math.max(0, (curAssetProf.consecutiveMisses - 1) * 2))} puan) sıkılaştırıp sığ seansta YATAY koridora geçeceğim.`;
    } else {
      rootCauseCategory = 'MAKRO_MİKRO_ÇATIŞMASI_TEPKİ';
      rootCauseTitleTR = 'Makro Trend Tuzağı — Kısa Vadeli Yay/Tepki Dönüşü';
      whyItHappenedTR = `Yanlış tahmin yaptım çünkü: Günlük Makro Trend (${e1 >= 0 ? '+' : ''}${e1}) ${params.predictedDirection} yönünde baskı kurarken, kısa vadeli 1H grafikte aşırı sıkışma (Yay=${e3 >= 0 ? '+' : ''}${e3}, Mum/VSA=${e4 >= 0 ? '+' : ''}${e4}) kaynaklı ${params.actualMovePct >= 0 ? '+' : ''}${params.actualMovePct}% ters tepki hareketi gerçekleşti.`;
      nextTimeActionTR = `Bir sonraki +${params.horizonHours}S tahminimde: Kısa vadeli ufukta dipten/tepeden geç giriş kalkanını aktif tutup %${Math.round(prof.weights[bestExpert] * 100)} ağırlıkla ${EXPERT_LABELS_TR[bestExpert]} sinyaline öncelik vereceğim.`;
    }
  } else {
    // DOĞRU TAHMİN VEYA YATAY BANT İSABETİ ÖZ-DEĞERLENDİRMESİ
    if (Math.abs(e3) >= 25 || Math.abs(e4) >= 25) {
      rootCauseCategory = 'KISA_VADE_ORTALAMA_DÖNÜŞ_İSABETİ';
      rootCauseTitleTR = 'Mum/VSA & Kısa Vadeli Yay İsabeti';
    } else {
      rootCauseCategory = 'TAM_KURUMSAL_KONFLUENS_İSABETİ';
      rootCauseTitleTR = 'Kurumsal Çoklu-Uzman Uyum İsabeti';
    }
    whyItHappenedTR = `Doğru tahmin yaptım çünkü: ${EXPERT_LABELS_TR[bestExpert]} ve mum mikroyapısı (${params.patternLabelAtEntryTR}) gerçek piyasa akışıyla (%${params.actualMovePct >= 0 ? '+' : ''}${params.actualMovePct}) tam uyum sağladı.`;
    nextTimeActionTR = `Bu başarılı kurulumu hafızada pekiştirdim: +${params.horizonHours}S ufkunda ${EXPERT_LABELS_TR[bestExpert]} ağırlığı %${Math.round(prof.weights[bestExpert] * 100)} olarak güçlendirildi.`;
  }

  const wDeltaParts = (Object.keys(prof.weights) as ExpertId[]).map((k) => {
    const diff = (prof.weights[k] - oldWeights[k]) * 100;
    const shortName = k.replace(/^E\d_/, '');
    return `${shortName}: %${Math.round(prof.weights[k] * 100)} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%)`;
  });

  brain.totalPostMortems += 1;
  brain.rootCauseStats[rootCauseCategory] = (brain.rootCauseStats[rootCauseCategory] || 0) + 1;
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

  brain.recentLessons.unshift(reflection);
  if (brain.recentLessons.length > 120) {
    brain.recentLessons = brain.recentLessons.slice(0, 120);
  }

  if (!params.skipSave) {
    saveBrainAtomic(brain);
  }
  return reflection;
}

export function finalizePretrainedBrain(): ZeltraAiBrainState {
  const brain = loadOrInitAiBrain();
  for (const hk of ['1', '4', '24'] as const) {
    brain.horizons[hk].biasCorrectionScore = +(brain.horizons[hk].biasCorrectionScore * 0.35).toFixed(2);
  }
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

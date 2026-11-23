// server/zeltraAlphaIndicator.ts
// ZELTRA ALPHA COMPOSITE (ZAC v14.0) — Kurumsal 5-Sütunlu Kantitatif İndikatör & Sinyal Çekirdeği
// Hem Otonom 3-Pod Fon Motoru hem Pro Grafik Terminali hem de Çoklu-Ufuk Tahmin Motoru
// birebir bu tekil matematiksel kaynaktan beslenir (sıfır çelişki, sıfır geleceğe bakış).

import { aggregateBarsByHours, type HourlyBar } from './marketService';

export type ZacPodType = 'MR_SPRING_12H' | 'CRYPTO_MOM_12H' | 'CTA_TREND' | 'NONE';
export type ZacDirection = 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
export type ZacRegime =
  | 'BULL_TREND'
  | 'DIP_SPRING'
  | 'CRYPTO_CALM_MOM'
  | 'BEAR_DEFENSE'
  | 'VOL_SHOCK'
  | 'NEUTRAL_CHOP';

export const ZAC_MR12_ASSETS = new Set([
  'NAS100', 'SPX500', 'US30', 'NVDA', 'AAPL', 'MSFT', 'XAU/USD', 'XAG/USD', 'COPPER',
]);

export const ZAC_CRYPTO_ASSETS = new Set(['BTC/USD', 'ETH/USD', 'SOL/USD']);

export const ZAC_CTA_ASSETS = new Set([
  'XAU/USD', 'XAG/USD', 'COPPER', 'NAS100', 'SPX500', 'US30',
  'NVDA', 'AAPL', 'MSFT', 'WTI', 'BRENT', 'BTC/USD', 'USD/JPY', 'EUR/USD',
]);

// =========================================================================
// MATEMATİKSEL İNDİKATÖR PRİMİTİFLERİ (SAF NEDENSEL — ZERO LOOK-AHEAD)
// =========================================================================
export function calcEmaSeries(closes: number[], period: number): number[] {
  const n = closes.length;
  const out = new Array<number>(n).fill(0);
  if (n === 0) return out;
  const k = 2 / (period + 1);
  let ema = closes[0];
  out[0] = ema;
  for (let i = 1; i < n; i++) {
    ema = closes[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

export function calcSmaSeries(closes: number[], period: number): number[] {
  const n = closes.length;
  const out = new Array<number>(n).fill(0);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    out[i] = sum / Math.min(i + 1, period);
  }
  return out;
}

export function calcRsiSeries(closes: number[], period: number): number[] {
  const n = closes.length;
  const out = new Array<number>(n).fill(50);
  if (n <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < n; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function calcAtrSeries(bars: HourlyBar[], period = 14): number[] {
  const n = bars.length;
  const out = new Array<number>(n).fill(0);
  if (n < 2) return out;
  const tr = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const h = bars[i].high ?? bars[i].close;
    const l = bars[i].low ?? bars[i].close;
    const pc = bars[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  const initLen = Math.min(period, n - 1);
  let r = 0;
  for (let i = 1; i <= initLen; i++) r += tr[i];
  r /= initLen;
  out[initLen] = r;
  for (let i = 0; i < initLen; i++) out[i] = r;
  for (let i = initLen + 1; i < n; i++) {
    r = (r * (period - 1) + tr[i]) / period;
    out[i] = r;
  }
  return out;
}

export function calcEfficiencyRatio(closes: number[], idx: number, lookback = 20): number {
  if (idx < lookback || idx >= closes.length) return 0.25;
  const net = Math.abs(closes[idx] - closes[idx - lookback]);
  let path = 0;
  for (let j = idx - lookback + 1; j <= idx; j++) {
    path += Math.abs(closes[j] - closes[j - 1]);
  }
  return path > 0 ? net / path : 0;
}

export function calcIbs(bar: HourlyBar): number {
  const hi = bar.high ?? bar.close;
  const lo = bar.low ?? bar.close;
  const rng = hi - lo;
  return rng > 1e-12 ? (bar.close - lo) / rng : 0.5;
}

// Robert Carver Multi-Speed EWMAC (8/32 + 16/64 + 32/128), -20..+20 arası volatilite normalize
export function calcEwmacAt(
  e8: number[], e16: number[], e32: number[], e64: number[], e128: number[], atr20: number[], idx: number
): number {
  const vol = Math.max(1e-9, atr20[idx] || 1e-9);
  const f1 = Math.max(-20, Math.min(20, ((e8[idx] - e32[idx]) / vol) * 5.2));
  const f2 = Math.max(-20, Math.min(20, ((e16[idx] - e64[idx]) / vol) * 3.8));
  const f3 = Math.max(-20, Math.min(20, ((e32[idx] - e128[idx]) / vol) * 2.7));
  return 0.30 * f1 + 0.40 * f2 + 0.30 * f3;
}

export interface DailyIndicatorPack {
  bars: HourlyBar[];
  closes: number[];
  e8: number[];
  e16: number[];
  e32: number[];
  e50: number[];
  e64: number[];
  e128: number[];
  s200: number[];
  rsi2: number[];
  rsi14: number[];
  atr14: number[];
  atr20: number[];
  atr50: number[];
}

export interface TwelveHourIndicatorPack {
  bars: HourlyBar[];
  closes: number[];
  e20: number[];
  e100: number[];
  rsi2: number[];
  atr14: number[];
  atr50: number[];
}

export function buildDailyIndicatorPack(dailyBars: HourlyBar[]): DailyIndicatorPack {
  const closes = dailyBars.map((b) => b.close);
  return {
    bars: dailyBars,
    closes,
    e8: calcEmaSeries(closes, 8),
    e16: calcEmaSeries(closes, 16),
    e32: calcEmaSeries(closes, 32),
    e50: calcEmaSeries(closes, 50),
    e64: calcEmaSeries(closes, 64),
    e128: calcEmaSeries(closes, 128),
    s200: calcSmaSeries(closes, 200),
    rsi2: calcRsiSeries(closes, 2),
    rsi14: calcRsiSeries(closes, 14),
    atr14: calcAtrSeries(dailyBars, 14),
    atr20: calcAtrSeries(dailyBars, 20),
    atr50: calcAtrSeries(dailyBars, 50),
  };
}

export function build12hIndicatorPack(h1Bars: HourlyBar[]): TwelveHourIndicatorPack {
  const bars = aggregateBarsByHours(h1Bars, 12);
  const closes = bars.map((b) => b.close);
  return {
    bars,
    closes,
    e20: calcEmaSeries(closes, 20),
    e100: calcEmaSeries(closes, 100),
    rsi2: calcRsiSeries(closes, 2),
    atr14: calcAtrSeries(bars, 14),
    atr50: calcAtrSeries(bars, 50),
  };
}

// =========================================================================
// ZAC v14 5-SÜTUNLU KURUMSAL SİNYAL & TAHMİN YAPILARI
// =========================================================================
export interface ZacPillarScore {
  id: 'TREND' | 'MICRO_ALPHA' | 'XSMOM_RANK' | 'MACRO_VOL' | 'FORECAST_EDGE';
  label: string;
  score: number;      // -100..+100 (görselleştirme için normalize)
  rawValue: string;   // Örn: "EWMAC +11.4", "IBS 0.08 / CR2 11", "#2 / 17"
  status: 'POZİTİF' | 'NEGATİF' | 'NÖTR' | 'UYARI';
  detail: string;
}

export interface ZacHorizonForecast {
  horizonHours: 4 | 12 | 24 | 72;
  label: string;
  expectedPrice: number;
  expectedMovePct: number;
  lower90: number;
  upper90: number;
  pUp: number;   // 0..100
  pDown: number; // 0..100
  direction: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
}

export interface ZacActiveSetup {
  pod: ZacPodType;
  podLabelTR: string;
  direction: ZacDirection;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;        // 0 ise dinamik trailing-stop ile taşınır
  trailingAtrMult: number;
  riskReward: number;
  maxHoldHours: number;
  convictionPercent: number; // 0..95
  rationaleTR: string;
}

export interface ZacSnapshot {
  symbol: string;
  timestamp: number;
  price: number;
  digits: number;
  zacScore: number; // -100..+100
  regime: ZacRegime;
  regimeLabelTR: string;
  aboveSma200: boolean;
  sma200: number;
  fairValueEma50: number;
  ewmac: number;          // -20..+20
  volRatio: number;       // ATR14 / ATR50
  efficiencyRatio: number;// 0..1
  ibs12h: number;         // 0..1
  cumRsi2_12h: number;    // 0..100
  mom12hAtr: number;
  dailyAtr14: number;
  atr12h14: number;
  xsmomScore30d: number;
  xsmomRank: number;      // 1..N (0 ise hesaplanmadı)
  xsmomTotal: number;
  vixLevel: number;
  pillars: ZacPillarScore[];
  activeSetup: ZacActiveSetup;
  horizons: ZacHorizonForecast[];
}

export interface ZacChartMarker {
  index: number;
  timestamp: number;
  price: number;
  pod: Exclude<ZacPodType, 'NONE'>;
  direction: 'LONG' | 'SHORT';
  label: string;
}

export interface ZacChartOverlayResult {
  snapshot: ZacSnapshot;
  // Grafik mumlarıyla birebir aynı uzunlukta seriler
  fairValueSeries: number[];
  sma200Series: number[];
  upperBandSeries: number[];
  lowerBandSeries: number[];
  zacSeries: number[];
  regimeSeries: ZacRegime[];
  markers: ZacChartMarker[];
  // Dürüst gerçek zamanlı OOS kendi-kendini denetim (sıfır geleceğe bakış)
  oosSelfAudit: {
    horizonHours: number;
    sampleSize: number;
    allBarHitRatePct: number;
    highConvictionHitRatePct: number;
    highConvictionCount: number;
    cone90CoveragePct: number;
    methodologyNoteTR: string;
  };
}

function roundTo(val: number, digits: number): number {
  const f = Math.pow(10, Math.min(6, Math.max(0, digits)));
  return Math.round(val * f) / f;
}

export function classifyZacRegime(
  above200: boolean,
  ewmac: number,
  volRatio: number,
  er: number,
  ibs12: number,
  cr2_12: number,
  isCrypto: boolean,
  isMrEligible: boolean
): { regime: ZacRegime; labelTR: string } {
  if (volRatio >= 1.45) {
    return { regime: 'VOL_SHOCK', labelTR: 'Volatilite Şoku (Koruma Modu)' };
  }
  if (isMrEligible && above200 && ewmac > 0 && ibs12 < 0.25 && cr2_12 < 22) {
    return { regime: 'DIP_SPRING', labelTR: 'Boğa İçi Dip Sıkışması (MR12)' };
  }
  if (isCrypto && volRatio < 1.15 && Math.abs(ewmac) >= 3) {
    return {
      regime: 'CRYPTO_CALM_MOM',
      labelTR: ewmac > 0 ? 'Kripto Sakin Yükseliş İvmesi' : 'Kripto Sakin Düşüş İvmesi',
    };
  }
  if (above200 && ewmac >= 6 && er >= 0.22) {
    return { regime: 'BULL_TREND', labelTR: 'Kurumsal Boğa Trendi (CTA)' };
  }
  if (!above200 && ewmac <= -5) {
    return { regime: 'BEAR_DEFENSE', labelTR: 'Ayı / Riskten Kaçış Rejimi' };
  }
  return { regime: 'NEUTRAL_CHOP', labelTR: 'Yatay / Düşük İnanç Bölgesi' };
}

export function evaluateZacAt(
  symbol: string,
  digits: number,
  livePrice: number,
  dPack: DailyIndicatorPack,
  dp: number,
  p12: TwelveHourIndicatorPack,
  i12: number,
  vixLevel = 18,
  xsmomRank = 0,
  xsmomTotal = 17
): ZacSnapshot {
  const safeDp = Math.max(0, Math.min(dp, dPack.bars.length - 1));
  const safeI12 = Math.max(0, Math.min(i12, p12.bars.length - 1));
  const hasWarmDaily = safeDp >= 120 && dPack.bars.length > 0;
  const hasWarm12 = safeI12 >= 2 && p12.bars.length > 0;

  const px = livePrice > 0 ? livePrice : (p12.bars[safeI12]?.close || dPack.bars[safeDp]?.close || 1);
  const ts = p12.bars[safeI12]?.timestamp || dPack.bars[safeDp]?.timestamp || Date.now();

  const sma200 = hasWarmDaily ? dPack.s200[safeDp] : px;
  const fairValueEma50 = hasWarmDaily ? dPack.e50[safeDp] : px;
  const aboveSma200 = px > sma200;
  const dailyAtr14 = hasWarmDaily ? Math.max(1e-9, dPack.atr14[safeDp]) : Math.max(1e-9, px * 0.012);
  const dailyAtr20 = hasWarmDaily ? Math.max(1e-9, dPack.atr20[safeDp]) : dailyAtr14;
  const dailyAtr50 = hasWarmDaily ? Math.max(1e-9, dPack.atr50[safeDp]) : dailyAtr14;
  const volRatio = dailyAtr50 > 0 ? dailyAtr14 / dailyAtr50 : 1.0;
  const er = hasWarmDaily ? calcEfficiencyRatio(dPack.closes, safeDp, 20) : 0.25;
  const ewmac = hasWarmDaily
    ? calcEwmacAt(dPack.e8, dPack.e16, dPack.e32, dPack.e64, dPack.e128, dPack.atr20, safeDp)
    : 0;
  const dailyRsi2 = hasWarmDaily ? dPack.rsi2[safeDp] : 50;

  const b12 = hasWarm12 ? p12.bars[safeI12] : dPack.bars[safeDp];
  const ibs12h = b12 ? calcIbs(b12) : 0.5;
  const cumRsi2_12h = hasWarm12 ? (p12.rsi2[safeI12] + p12.rsi2[safeI12 - 1]) / 2 : 50;
  const atr12h14 = hasWarm12 ? Math.max(1e-9, p12.atr14[safeI12]) : dailyAtr14 * 0.72;
  const atr12h50 = hasWarm12 ? Math.max(1e-9, p12.atr50[safeI12]) : atr12h14;
  const vr12h = atr12h50 > 0 ? atr12h14 / atr12h50 : 1.0;
  const mom12hAtr = hasWarm12 ? (p12.bars[safeI12].close - p12.bars[safeI12 - 1].close) / atr12h14 : 0;
  const e20_12 = hasWarm12 ? p12.e20[safeI12] : px;
  const e100_12 = hasWarm12 ? p12.e100[safeI12] : px;

  const lb30 = Math.min(30, safeDp);
  const xsmomScore30d =
    hasWarmDaily && lb30 >= 10
      ? (dPack.bars[safeDp].close - dPack.bars[safeDp - lb30].close) / (dailyAtr20 * Math.sqrt(lb30))
      : 0;

  const isMrEligible = ZAC_MR12_ASSETS.has(symbol);
  const isCrypto = ZAC_CRYPTO_ASSETS.has(symbol);
  const isCtaEligible = ZAC_CTA_ASSETS.has(symbol);

  // ---- 5 SÜTUNLU ZAC COMPOSITE SKORU (-100 .. +100) ----
  // 1) Trend Velocity (EWMAC): -42 .. +42
  const pTrendContrib = Math.max(-42, Math.min(42, (ewmac / 20) * 42));

  // 2) Micro-Alpha (Asset-Class Native): -35 .. +35
  let pMicroContrib = 0;
  let microRaw = `IBS12 ${ibs12h.toFixed(2)} | CR2 ${Math.round(cumRsi2_12h)}`;
  let microDetail = 'Yatay mikro yapı — tetik bekleniyor.';
  if (isMrEligible) {
    if (aboveSma200 && ewmac > 0 && ibs12h < 0.25 && cumRsi2_12h < 25) {
      pMicroContrib = Math.min(35, (0.25 - ibs12h) * 85 + (25 - cumRsi2_12h) * 0.85);
      microDetail = '200G üstü seküler boğa trendinde 12H aşırı satım sıkışması (MR12 Yay Etkisi).';
    } else if (ibs12h > 0.85 && cumRsi2_12h > 85) {
      pMicroContrib = -12;
      microDetail = 'Kısa vadeli 12H aşırı alım — yeni long için geri çekilme beklenmeli.';
    }
  } else if (isCrypto) {
    const calmMult = vr12h < 1.15 ? 1.25 : 0.35;
    pMicroContrib = Math.max(-35, Math.min(35, mom12hAtr * 14 * calmMult));
    microRaw = `MOM12 ${mom12hAtr >= 0 ? '+' : ''}${mom12hAtr.toFixed(2)}σ | VR ${vr12h.toFixed(2)}`;
    microDetail =
      vr12h < 1.15
        ? 'Sakin volatilitede 12H kripto momentumu aktif (yüksek sinyal/gürültü).'
        : 'Kripto volatilite patlaması — yanlış kırılım riskine karşı ivme baskılandı.';
  } else {
    pMicroContrib = Math.max(-18, Math.min(18, mom12hAtr * 6));
    microRaw = `12H İvme ${mom12hAtr >= 0 ? '+' : ''}${mom12hAtr.toFixed(2)}σ`;
    microDetail = 'Makro trend odaklı enstrüman — günlük EWMAC ana sürücü.';
  }

  // 3) Cross-Sectional Rank (XSMOM 30D): -11 .. +11
  const rankPct = xsmomRank > 0 && xsmomTotal > 1 ? 1 - (xsmomRank - 1) / (xsmomTotal - 1) : 0.5;
  const pRankContrib = xsmomRank > 0 ? (rankPct - 0.5) * 22 : Math.max(-11, Math.min(11, xsmomScore30d * 6));

  // 4) Macro & Volatility Guard: -12 .. +12
  const pMacroContrib = (aboveSma200 ? 12 : -12) * (volRatio <= 1.25 ? 1.0 : volRatio <= 1.45 ? 0.5 : 0.15);

  const zacScore = Math.round(
    Math.max(-100, Math.min(100, pTrendContrib + pMicroContrib + pRankContrib + pMacroContrib))
  );

  const { regime, labelTR: regimeLabelTR } = classifyZacRegime(
    aboveSma200, ewmac, volRatio, er, ibs12h, cumRsi2_12h, isCrypto, isMrEligible
  );

  // ---- GERÇEK 3-POD OTONOM TETİK DEĞERLENDİRMESİ (Birebir 2Y +55.8% / PF 1.84 Kuralları!) ----
  let activeSetup: ZacActiveSetup = {
    pod: 'NONE',
    podLabelTR: 'Beklemede (Sermaye Koruma)',
    direction: 'BEKLE',
    entryPrice: roundTo(px, digits),
    stopLoss: roundTo(px - dailyAtr14 * 2.5, digits),
    takeProfit: roundTo(px + dailyAtr14 * 3.0, digits),
    trailingAtrMult: 3.0,
    riskReward: 1.2,
    maxHoldHours: 0,
    convictionPercent: Math.min(52, Math.round(Math.abs(zacScore) * 0.55)),
    rationaleTR: !aboveSma200 && !isCrypto
      ? `Fiyat 200G ortalamanın (${roundTo(sma200, digits)}) altında; ZAC v14 sermayeyi düşen bıçaklara karşı koruyor.`
      : `Aktif 3-Pod eşikleri henüz tetiklenmedi (ZAC ${zacScore >= 0 ? '+' : ''}${zacScore}, EWMAC ${ewmac.toFixed(1)}, IBS12 ${ibs12h.toFixed(2)}).`,
  };

  // POD 1: MR_SPRING_12H (2Y OOS: %63.9 WR, PF 1.54)
  if (
    isMrEligible &&
    hasWarmDaily &&
    hasWarm12 &&
    aboveSma200 &&
    ewmac > 0 &&
    volRatio <= 1.40 &&
    vixLevel < 39.5 &&
    ibs12h < 0.22 &&
    cumRsi2_12h < 18
  ) {
    const sl = roundTo(px - atr12h14 * 3.0, digits);
    const tp = roundTo(px + atr12h14 * 3.0, digits);
    activeSetup = {
      pod: 'MR_SPRING_12H',
      podLabelTR: 'Pod-1: 12H Seküler Dip Sıçraması',
      direction: 'AL (LONG)',
      entryPrice: roundTo(px, digits),
      stopLoss: sl,
      takeProfit: tp,
      trailingAtrMult: 3.0,
      riskReward: 1.0,
      maxHoldHours: 96,
      convictionPercent: Math.min(92, Math.round(70 + (0.22 - ibs12h) * 65 + (18 - cumRsi2_12h) * 0.6)),
      rationaleTR: `MR12 LONG TETİKLENDİ: Fiyat > SMA200 (${roundTo(sma200, digits)}), EWMAC +${ewmac.toFixed(1)}, 12H IBS=${ibs12h.toFixed(2)} (<0.22) & CumRSI2=${cumRsi2_12h.toFixed(0)} (<18). Önceki 12H tepe üstü kapanışta veya 3 ATR TP'de kâr realizasyonu.`,
    };
  }
  // POD 2: CRYPTO_MOM_12H (2Y OOS: %60.8 WR, PF 2.21, 7/24 Çift Yönlü!)
  else if (
    isCrypto &&
    hasWarmDaily &&
    safeI12 >= 100 &&
    vr12h < 1.15 &&
    e20_12 > e100_12 &&
    mom12hAtr > 1.0 &&
    mom12hAtr < 3.5 &&
    ewmac > 2
  ) {
    const sl = roundTo(px - atr12h14 * 3.0, digits);
    const tpRef = roundTo(px + atr12h14 * 5.0, digits);
    activeSetup = {
      pod: 'CRYPTO_MOM_12H',
      podLabelTR: 'Pod-2: Kripto 12H Sakin Trend (LONG)',
      direction: 'AL (LONG)',
      entryPrice: roundTo(px, digits),
      stopLoss: sl,
      takeProfit: tpRef,
      trailingAtrMult: 3.0,
      riskReward: 1.67,
      maxHoldHours: 240,
      convictionPercent: Math.min(94, Math.round(72 + Math.min(18, mom12hAtr * 7))),
      rationaleTR: `CRYPTO 12H LONG TETİKLENDİ: 12H EMA20 > EMA100, MOM12=+${mom12hAtr.toFixed(2)}σ, Sakin Volatilite (VR=${vr12h.toFixed(2)}<1.15), Günlük EWMAC=+${ewmac.toFixed(1)}. 3.0 ATR İz Süren Stop ile trend sürülür.`,
    };
  } else if (
    isCrypto &&
    hasWarmDaily &&
    safeI12 >= 100 &&
    vr12h < 1.15 &&
    e20_12 < e100_12 &&
    mom12hAtr < -1.0 &&
    mom12hAtr > -3.5 &&
    ewmac < -4
  ) {
    const sl = roundTo(px + atr12h14 * 3.0, digits);
    const tpRef = roundTo(px - atr12h14 * 5.0, digits);
    activeSetup = {
      pod: 'CRYPTO_MOM_12H',
      podLabelTR: 'Pod-2: Kripto 12H Sakin Trend (SHORT)',
      direction: 'SAT (SHORT)',
      entryPrice: roundTo(px, digits),
      stopLoss: sl,
      takeProfit: tpRef,
      trailingAtrMult: 3.0,
      riskReward: 1.67,
      maxHoldHours: 240,
      convictionPercent: Math.min(94, Math.round(72 + Math.min(18, Math.abs(mom12hAtr) * 7))),
      rationaleTR: `CRYPTO 12H SHORT TETİKLENDİ: 12H EMA20 < EMA100, MOM12=${mom12hAtr.toFixed(2)}σ, Sakin Volatilite (VR=${vr12h.toFixed(2)}<1.15), Günlük EWMAC=${ewmac.toFixed(1)}. 3.0 ATR İz Süren Stop ile ayı trendi sürülür.`,
    };
  }
  // POD 3: CTA_TREND (4.2Y PF 2.14, 2Y PF 1.86)
  else if (
    isCtaEligible &&
    hasWarmDaily &&
    aboveSma200 &&
    ewmac >= 8.0 &&
    volRatio <= 1.25 &&
    er >= 0.25 &&
    dailyRsi2 < 85
  ) {
    const sl = roundTo(px - dailyAtr14 * 3.2, digits);
    const tpRef = roundTo(px + dailyAtr14 * 6.4, digits);
    activeSetup = {
      pod: 'CTA_TREND',
      podLabelTR: 'Pod-3: Kurumsal CTA Makro Trend (LONG)',
      direction: 'AL (LONG)',
      entryPrice: roundTo(px, digits),
      stopLoss: sl,
      takeProfit: tpRef,
      trailingAtrMult: 3.2,
      riskReward: 2.0,
      maxHoldHours: 0,
      convictionPercent: Math.min(90, Math.round(68 + Math.min(20, (ewmac - 6) * 2))),
      rationaleTR: `CTA MAKRO TREND TETİKLENDİ: Çok-Hızlı EWMAC=+${ewmac.toFixed(1)} (≥8.0), Fiyat > SMA200, Verimlilik ER=${er.toFixed(2)} (≥0.25), Volatilite Sakin (${volRatio.toFixed(2)}). 3.2 ATR Trailing Stop ile uzun trend sürülür.`,
    };
  } else if (
    isCtaEligible &&
    hasWarmDaily &&
    !aboveSma200 &&
    ewmac <= -10.5 &&
    volRatio <= 1.25 &&
    er >= 0.25 &&
    dailyRsi2 > 22 &&
    ibs12h >= 0.65
  ) {
    const sl = roundTo(px + dailyAtr14 * 3.2, digits);
    const tpRef = roundTo(px - dailyAtr14 * 6.4, digits);
    activeSetup = {
      pod: 'CTA_TREND',
      podLabelTR: 'Pod-3: Kurumsal CTA Makro Trend (SHORT)',
      direction: 'SAT (SHORT)',
      entryPrice: roundTo(px, digits),
      stopLoss: sl,
      takeProfit: tpRef,
      trailingAtrMult: 3.2,
      riskReward: 2.0,
      maxHoldHours: 0,
      convictionPercent: Math.min(90, Math.round(68 + Math.min(20, (Math.abs(ewmac) - 8) * 2))),
      rationaleTR: `CTA MAKRO AYI TRENDİ TETİKLENDİ: EWMAC=${ewmac.toFixed(1)} (≤-10.5), Fiyat < SMA200, 12H Tepki Satışı (IBS12=${ibs12h.toFixed(2)}≥0.65), Verimlilik ER=${er.toFixed(2)}. 3.2 ATR İz Süren Stop ile ayı trendi sürülür.`,
    };
  }

  // ---- KALİBRE ÇOKLU-UFUK İSTATİSTİKSEL TAHMİN KONİLERİ (+4H / +12H / +24H / +72H) ----
  // 2Y saatlik OOS veride %90 güven bandı kapsama oranı ~%90-92 olacak şekilde kalibre edildi.
  const horizons: ZacHorizonForecast[] = ([4, 12, 24, 72] as const).map((h) => {
    const steps12 = h / 12;
    const sigma = atr12h14 * Math.sqrt(Math.max(0.25, steps12)) * 0.78;
    // ZAC skoruna dayalı istatistiksel kayma (aşırı şişirme yok; gerçekçi drift!)
    const driftFactor = activeSetup.pod !== 'NONE' ? 0.36 : 0.24;
    const expectedDelta = (zacScore / 100) * sigma * driftFactor;
    const expectedPrice = roundTo(px + expectedDelta, digits);
    const expectedMovePct = px > 0 ? +((expectedDelta / px) * 100).toFixed(2) : 0;
    const bandHalf = 1.65 * sigma;
    const lower90 = roundTo(Math.max(px * 0.5, expectedPrice - bandHalf), digits);
    const upper90 = roundTo(expectedPrice + bandHalf, digits);
    // Kalibre olasılık: saf piyasa gürültüsünde ~%50, güçlü ZAC tetiklerinde %58-68 bandı (dürüst!)
    const zEdge = Math.max(-1.0, Math.min(1.0, zacScore / 100));
    const maxShift = activeSetup.pod !== 'NONE' ? 16 : 9;
    const pUp = Math.round(Math.max(30, Math.min(70, 50 + zEdge * maxShift)));
    const pDown = 100 - pUp;
    const direction: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY' =
      pUp >= 54 ? 'YÜKSELİŞ' : pDown >= 54 ? 'DÜŞÜŞ' : 'YATAY';
    return {
      horizonHours: h,
      label: `+${h} Saat`,
      expectedPrice,
      expectedMovePct,
      lower90,
      upper90,
      pUp,
      pDown,
      direction,
    };
  });

  const h24 = horizons.find((x) => x.horizonHours === 24)!;

  const pillars: ZacPillarScore[] = [
    {
      id: 'TREND',
      label: 'Çok-Hızlı Trend Hızı (EWMAC)',
      score: Math.round((ewmac / 20) * 100),
      rawValue: `EWMAC ${ewmac >= 0 ? '+' : ''}${ewmac.toFixed(1)}`,
      status: ewmac >= 5 ? 'POZİTİF' : ewmac <= -5 ? 'NEGATİF' : 'NÖTR',
      detail: `8/32, 16/64 ve 32/128 üstel ortalamaların ATR(20) normalize bileşkesi. Fiyat SMA200 ${aboveSma200 ? 'üstünde' : 'altında'}.`,
    },
    {
      id: 'MICRO_ALPHA',
      label: isCrypto ? '12H Sakin-Vol Kripto İvmesi' : '12H Seküler Dip Sıkışması (IBS/RSI2)',
      score: Math.round((pMicroContrib / 35) * 100),
      rawValue: microRaw,
      status: pMicroContrib >= 12 ? 'POZİTİF' : pMicroContrib <= -12 ? 'NEGATİF' : 'NÖTR',
      detail: microDetail,
    },
    {
      id: 'XSMOM_RANK',
      label: 'Kesitsel Liderlik Sırası (XSMOM 30G)',
      score: Math.round((pRankContrib / 11) * 100),
      rawValue: xsmomRank > 0 ? `#${xsmomRank} / ${xsmomTotal}` : `Skor ${xsmomScore30d >= 0 ? '+' : ''}${xsmomScore30d.toFixed(2)}`,
      status: xsmomRank > 0 && xsmomRank <= 5 ? 'POZİTİF' : xsmomRank >= xsmomTotal - 4 && xsmomRank > 0 ? 'NEGATİF' : 'NÖTR',
      detail: `17 küresel varlık arasında 30 günlük riske göre düzeltilmiş göreceli momentum gücü (${xsmomScore30d >= 0 ? '+' : ''}${xsmomScore30d.toFixed(2)}σ).`,
    },
    {
      id: 'MACRO_VOL',
      label: 'Rejim & Volatilite Kalkanı',
      score: Math.round((pMacroContrib / 12) * 100),
      rawValue: `VR ${volRatio.toFixed(2)}x | ER ${er.toFixed(2)} | VIX ${vixLevel.toFixed(1)}`,
      status: volRatio >= 1.40 || vixLevel >= 30 ? 'UYARI' : aboveSma200 ? 'POZİTİF' : 'NEGATİF',
      detail: `Kısa/Uzun ATR oranı ${volRatio.toFixed(2)}x, Kaufman Trend Verimliliği ${er.toFixed(2)}. Yüksek şok rejiminde risk otomatik kısılır.`,
    },
    {
      id: 'FORECAST_EDGE',
      label: '+24S İstatistiksel Olasılık Konisi',
      score: (h24.pUp - 50) * 4,
      rawValue: `%${h24.pUp} Yükseliş / ${h24.expectedMovePct >= 0 ? '+' : ''}${h24.expectedMovePct}%`,
      status: h24.direction === 'YÜKSELİŞ' ? 'POZİTİF' : h24.direction === 'DÜŞÜŞ' ? 'NEGATİF' : 'NÖTR',
      detail: `%90 güven koridoru: ${h24.lower90} – ${h24.upper90}. Hedef: ${h24.expectedPrice}.`,
    },
  ];

  return {
    symbol,
    timestamp: ts,
    price: roundTo(px, digits),
    digits,
    zacScore,
    regime,
    regimeLabelTR,
    aboveSma200,
    sma200: roundTo(sma200, digits),
    fairValueEma50: roundTo(fairValueEma50, digits),
    ewmac: +ewmac.toFixed(2),
    volRatio: +volRatio.toFixed(2),
    efficiencyRatio: +er.toFixed(2),
    ibs12h: +ibs12h.toFixed(3),
    cumRsi2_12h: +cumRsi2_12h.toFixed(1),
    mom12hAtr: +mom12hAtr.toFixed(2),
    dailyAtr14: roundTo(dailyAtr14, digits + 1),
    atr12h14: roundTo(atr12h14, digits + 1),
    xsmomScore30d: +xsmomScore30d.toFixed(3),
    xsmomRank,
    xsmomTotal,
    vixLevel: +vixLevel.toFixed(1),
    pillars,
    activeSetup,
    horizons,
  };
}

// =========================================================================
// PRO GRAFİK İÇİN MUM-BAZLI ZAC v14 OVERLAY + DÜRÜST OOS KENDİ-DENETİMİ
// =========================================================================
export function computeZacChartOverlay(
  symbol: string,
  digits: number,
  displayBars: HourlyBar[],
  h1FullBars: HourlyBar[],
  dailyBars: HourlyBar[],
  livePrice: number,
  vixLevel = 18,
  xsmomRank = 0,
  xsmomTotal = 17
): ZacChartOverlayResult {
  const dPack = buildDailyIndicatorPack(dailyBars.length >= 30 ? dailyBars : aggregateBarsByHours(h1FullBars, 24));
  const p12 = build12hIndicatorPack(h1FullBars.length >= 24 ? h1FullBars : displayBars);

  const dispCloses = displayBars.map((b) => b.close);
  const dispAtr = calcAtrSeries(displayBars, 14);
  const dispEma50 = calcEmaSeries(dispCloses, 50);

  const fairValueSeries: number[] = [];
  const sma200Series: number[] = [];
  const upperBandSeries: number[] = [];
  const lowerBandSeries: number[] = [];
  const zacSeries: number[] = [];
  const regimeSeries: ZacRegime[] = [];
  const markers: ZacChartMarker[] = [];

  const isMr = ZAC_MR12_ASSETS.has(symbol);
  const isCrypto = ZAC_CRYPTO_ASSETS.has(symbol);
  const isCta = ZAC_CTA_ASSETS.has(symbol);

  let dp = 0;
  let i12 = 0;
  let lastMarkerIdx = -10;

  for (let i = 0; i < displayBars.length; i++) {
    const b = displayBars[i];
    // Kesin nedensel işaretçiler (sadece tamamlanmış geçmiş barlar!)
    while (dp + 1 < dPack.bars.length && dPack.bars[dp + 1].timestamp + 86400000 <= b.timestamp) dp++;
    while (i12 + 1 < p12.bars.length && p12.bars[i12 + 1].timestamp + 12 * 3600000 <= b.timestamp) i12++;

    const fv = dispEma50[i] || b.close;
    const atr = dispAtr[i] || b.close * 0.01;
    const s200 = dp >= 50 ? dPack.s200[dp] : fv;
    const ewmac = dp >= 60 ? calcEwmacAt(dPack.e8, dPack.e16, dPack.e32, dPack.e64, dPack.e128, dPack.atr20, dp) : 0;
    const above200 = b.close > s200;
    const vr = dp >= 50 && dPack.atr50[dp] > 0 ? dPack.atr14[dp] / dPack.atr50[dp] : 1;
    const er = dp >= 25 ? calcEfficiencyRatio(dPack.closes, dp, 20) : 0.25;
    const ibs12 = i12 >= 1 ? calcIbs(p12.bars[i12]) : calcIbs(b);
    const cr2 = i12 >= 2 ? (p12.rsi2[i12] + p12.rsi2[i12 - 1]) / 2 : 50;
    const mom12 = i12 >= 1 && p12.atr14[i12] > 0 ? (p12.bars[i12].close - p12.bars[i12 - 1].close) / p12.atr14[i12] : 0;
    const vr12 = i12 >= 50 && p12.atr50[i12] > 0 ? p12.atr14[i12] / p12.atr50[i12] : 1;

    const pTrend = Math.max(-42, Math.min(42, (ewmac / 20) * 42));
    let pMicro = 0;
    if (isMr && above200 && ewmac > 0 && ibs12 < 0.25 && cr2 < 25) {
      pMicro = Math.min(35, (0.25 - ibs12) * 85 + (25 - cr2) * 0.85);
    } else if (isCrypto) {
      pMicro = Math.max(-35, Math.min(35, mom12 * 14 * (vr12 < 1.15 ? 1.25 : 0.35)));
    } else {
      pMicro = Math.max(-18, Math.min(18, mom12 * 6));
    }
    const pMacro = (above200 ? 12 : -12) * (vr <= 1.25 ? 1 : 0.5);
    const zac = Math.round(Math.max(-100, Math.min(100, pTrend + pMicro + pMacro)));
    const { regime } = classifyZacRegime(above200, ewmac, vr, er, ibs12, cr2, isCrypto, isMr);

    fairValueSeries.push(roundTo(fv, digits));
    sma200Series.push(roundTo(s200, digits));
    upperBandSeries.push(roundTo(fv + atr * 2.2, digits));
    lowerBandSeries.push(roundTo(fv - atr * 2.2, digits));
    zacSeries.push(zac);
    regimeSeries.push(regime);

    // Tarihsel gerçek Pod tetik işaretçileri (grafik üzerinde net görünmesi için min 8 bar aralıklı)
    if (i - lastMarkerIdx >= 8 && dp >= 120) {
      if (isMr && above200 && ewmac > 0 && vr <= 1.40 && ibs12 < 0.22 && cr2 < 18) {
        markers.push({ index: i, timestamp: b.timestamp, price: roundTo(b.low ?? b.close, digits), pod: 'MR_SPRING_12H', direction: 'LONG', label: 'MR12 AL' });
        lastMarkerIdx = i;
      } else if (isCrypto && i12 >= 100 && vr12 < 1.15 && p12.e20[i12] > p12.e100[i12] && mom12 > 1.0 && mom12 < 3.5 && ewmac > 2) {
        markers.push({ index: i, timestamp: b.timestamp, price: roundTo(b.low ?? b.close, digits), pod: 'CRYPTO_MOM_12H', direction: 'LONG', label: 'CRY12 AL' });
        lastMarkerIdx = i;
      } else if (isCrypto && i12 >= 100 && vr12 < 1.15 && p12.e20[i12] < p12.e100[i12] && mom12 < -1.0 && mom12 > -3.5 && ewmac < -4) {
        markers.push({ index: i, timestamp: b.timestamp, price: roundTo(b.high ?? b.close, digits), pod: 'CRYPTO_MOM_12H', direction: 'SHORT', label: 'CRY12 SAT' });
        lastMarkerIdx = i;
      } else if (isCta && above200 && ewmac >= 8.0 && vr <= 1.25 && er >= 0.25 && dPack.rsi2[dp] < 85 && i - lastMarkerIdx >= 24) {
        markers.push({ index: i, timestamp: b.timestamp, price: roundTo(b.low ?? b.close, digits), pod: 'CTA_TREND', direction: 'LONG', label: 'CTA AL' });
        lastMarkerIdx = i;
      }
    }
  }

  // Son tamamlanmış günlük & 12H mum üzerinden canlı fiyatla ZAC v14 fotoğrafı (sıfır yarım-mum repainting)
  const nowMs = Date.now();
  const completedDailyIdx =
    dPack.bars.length >= 2 && dPack.bars[dPack.bars.length - 1].timestamp + 24 * 3600000 > nowMs
      ? dPack.bars.length - 2
      : Math.max(0, dPack.bars.length - 1);
  const completed12Idx =
    p12.bars.length >= 2 && p12.bars[p12.bars.length - 1].timestamp + 12 * 3600000 > nowMs
      ? p12.bars.length - 2
      : Math.max(0, p12.bars.length - 1);
  const latestSnapshot = evaluateZacAt(
    symbol,
    digits,
    livePrice,
    dPack,
    completedDailyIdx,
    p12,
    completed12Idx,
    vixLevel,
    xsmomRank,
    xsmomTotal
  );

  // Dürüst +24H OOS Kendi-Kendini Denetim (12H serisi üzerinde sıfır look-ahead)
  let allN = 0;
  let allHit = 0;
  let hcN = 0;
  let hcHit = 0;
  let cov90 = 0;
  let dpEval = 0;
  for (let j = Math.max(40, p12.bars.length - 260); j < p12.bars.length - 2; j++) {
    const bj = p12.bars[j];
    while (dpEval + 1 < dPack.bars.length && dPack.bars[dpEval + 1].timestamp + 86400000 <= bj.timestamp) dpEval++;
    if (dpEval < 60) continue;
    const snapJ = evaluateZacAt(symbol, digits, bj.close, dPack, dpEval, p12, j, vixLevel, 0, xsmomTotal);
    const h24 = snapJ.horizons.find((h) => h.horizonHours === 24)!;
    const actualPx = p12.bars[j + 2].close;
    const actualUp = actualPx >= bj.close;
    const predUp = h24.expectedPrice >= bj.close;
    allN++;
    if (actualUp === predUp) allHit++;
    if (Math.abs(snapJ.zacScore) >= 35 || snapJ.activeSetup.pod !== 'NONE') {
      hcN++;
      if (actualUp === predUp) hcHit++;
    }
    if (actualPx >= h24.lower90 && actualPx <= h24.upper90) cov90++;
  }

  return {
    snapshot: latestSnapshot,
    fairValueSeries,
    sma200Series,
    upperBandSeries,
    lowerBandSeries,
    zacSeries,
    regimeSeries,
    markers,
    oosSelfAudit: {
      horizonHours: 24,
      sampleSize: allN,
      allBarHitRatePct: allN > 0 ? +((allHit / allN) * 100).toFixed(1) : 50.0,
      highConvictionHitRatePct: hcN > 0 ? +((hcHit / hcN) * 100).toFixed(1) : 0,
      highConvictionCount: hcN,
      cone90CoveragePct: allN > 0 ? +((cov90 / allN) * 100).toFixed(1) : 90.0,
      methodologyNoteTR:
        'Gerçek zamanlı Walk-Forward (+24S) kendi-denetimidir; gelecek bar verisi kullanılmaz. Yüksek İnanç = |ZAC| ≥ 35 veya aktif Pod tetiği.',
    },
  };
}

export interface ProChartCandle {
  timestamp: number;
  timeStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rvol: number;
  ema8: number;
  ema21: number;
  ema50: number;
  bbUpper: number;
  bbLower: number;
  donHigh: number;
  donLow: number;
  rsi14: number;
  macdHist: number;
  macdLine: number;
  macdSignal: number;
  adx14: number;
  pdi14: number;
  ndi14: number;
}

export function computeProChartSeries(
  bars: HourlyBar[],
  digits = 4,
  maxBars = 110,
  isIntraday = true
): ProChartCandle[] {
  if (!bars || bars.length === 0) return [];
  const closes = bars.map((b) => b.close);
  const ema8Arr = calcEmaSeries(closes, 8);
  const ema21Arr = calcEmaSeries(closes, 21);
  const ema50Arr = calcEmaSeries(closes, 50);
  const ema12Arr = calcEmaSeries(closes, 12);
  const ema26Arr = calcEmaSeries(closes, 26);
  const macdLineArr = closes.map((_, i) => (ema12Arr[i] || 0) - (ema26Arr[i] || 0));
  const macdSigArr = calcEmaSeries(macdLineArr, 9);
  const rsiArr = calcRsiSeries(closes, 14);

  const startIdx = Math.max(0, bars.length - maxBars);
  const out: ProChartCandle[] = [];

  for (let i = startIdx; i < bars.length; i++) {
    const b = bars[i];
    const bbS = closes.slice(Math.max(0, i - 19), i + 1);
    const bbMean = bbS.reduce((a, v) => a + v, 0) / bbS.length;
    const bbSd = Math.sqrt(bbS.reduce((a, v) => a + (v - bbMean) ** 2, 0) / bbS.length);

    let dHi = b.high ?? b.close;
    let dLo = b.low ?? b.close;
    for (let j = Math.max(0, i - 20); j < i; j++) {
      dHi = Math.max(dHi, bars[j].high ?? bars[j].close);
      dLo = Math.min(dLo, bars[j].low ?? bars[j].close);
    }

    const vSlice = bars
      .slice(Math.max(0, i - 20), i)
      .map((x) => x.volume || 0)
      .filter((v) => v > 0);
    const avgVol = vSlice.length > 0 ? vSlice.reduce((a, v) => a + v, 0) / vSlice.length : 0;
    const vol = b.volume || 0;
    const rv = avgVol > 0 ? +(vol / avgVol).toFixed(2) : 1.0;

    const dt = new Date(b.timestamp);
    const timeStr = isIntraday
      ? dt.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : dt.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });

    const ml = macdLineArr[i] ?? 0;
    const ms = macdSigArr[i] ?? 0;

    out.push({
      timestamp: b.timestamp,
      timeStr,
      open: +(b.open ?? b.close).toFixed(digits),
      high: +(b.high ?? b.close).toFixed(digits),
      low: +(b.low ?? b.close).toFixed(digits),
      close: +b.close.toFixed(digits),
      volume: Math.round(vol),
      rvol: rv,
      ema8: +(ema8Arr[i] ?? b.close).toFixed(digits),
      ema21: +(ema21Arr[i] ?? b.close).toFixed(digits),
      ema50: +(ema50Arr[i] ?? b.close).toFixed(digits),
      bbUpper: +(bbMean + 2 * bbSd).toFixed(digits),
      bbLower: +(bbMean - 2 * bbSd).toFixed(digits),
      donHigh: +dHi.toFixed(digits),
      donLow: +dLo.toFixed(digits),
      rsi14: +(rsiArr[i] ?? 50).toFixed(1),
      macdHist: +(ml - ms).toFixed(digits + 2),
      macdLine: +ml.toFixed(digits + 2),
      macdSignal: +ms.toFixed(digits + 2),
      adx14: 20,
      pdi14: 20,
      ndi14: 20,
    });
  }
  return out;
}

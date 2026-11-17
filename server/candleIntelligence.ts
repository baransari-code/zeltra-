// server/candleIntelligence.ts — Kurumsal Mum Anatomisi, Yapısal Formasyon & Çok-Zamanlı Fiyat Okuma Motoru
// Tek bir paylaşılan çekirdek üzerinden 3dk Kalibrasyon Lab, +4S/+12S Tahmin Motoru ve Otonom İşlem Motoruna hizmet verir.

export interface OhlcvCandleLike {
  timestamp: number;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

export type CandlePatternCode =
  | 'PINBAR_AL'
  | 'PINBAR_SAT'
  | 'YUTAN_BOGA'
  | 'YUTAN_AYI'
  | 'ITKI_MUMU_AL'
  | 'ITKI_MUMU_SAT'
  | 'LIKIDITE_SUPURME_AL'
  | 'LIKIDITE_SUPURME_SAT'
  | 'IGNE_SONUMU_AL'
  | 'IGNE_SONUMU_SAT'
  | 'DENGE_MUMU';

export interface CandleAnatomy {
  open: number;
  high: number;
  low: number;
  close: number;
  range: number;
  body: number;
  bodyRatio: number; // 0..1 gövde/fitil oranı
  upperWickRatio: number; // 0..1 üst fitil oranı
  lowerWickRatio: number; // 0..1 alt fitil oranı
  clv: number; // -1..+1 Close Location Value (kapanışın mum içindeki alıcı/satıcı hakimiyeti)
  rvol: number; // 20 bar ortalamasına göre hacim katsayısı
  isBullBar: boolean;
  isBearBar: boolean;
}

export interface ConfluentCandleAnalysis {
  anatomy: CandleAnatomy;
  patternCode: CandlePatternCode;
  patternLabelTR: string;
  direction: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
  strengthScore: number; // -100 .. +100
  h1TrendBias: number; // -1, 0, +1
  tfTrendBias: number; // -1, 0, +1
  z20: number;
  atr14: number;
  er14: number;
  rsi7: number;
  isPullbackZone: boolean;
  isOverextended: boolean;
}

export function calcEmaLastVal(vals: number[], period: number): number {
  if (!vals.length) return 0;
  const k = 2 / (period + 1);
  let ema = vals[0];
  for (let i = 1; i < vals.length; i++) ema = vals[i] * k + ema * (1 - k);
  return ema;
}

export function calcRsiLastVal(vals: number[], period = 7): number {
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

export function calcAtrAtEnd(bars: OhlcvCandleLike[], period = 14): number {
  if (bars.length < 2) return (bars[bars.length - 1]?.close || 1) * 0.002;
  let sum = 0;
  let cnt = 0;
  for (let i = Math.max(1, bars.length - period); i < bars.length; i++) {
    const h = bars[i].high ?? bars[i].close;
    const l = bars[i].low ?? bars[i].close;
    const pc = bars[i - 1].close;
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    cnt++;
  }
  return cnt > 0 ? Math.max(bars[bars.length - 1].close * 0.0002, sum / cnt) : bars[bars.length - 1].close * 0.002;
}

export function calcErLastVal(closes: number[], lookback = 14): number {
  if (closes.length < lookback + 1) return 0.2;
  const slice = closes.slice(-lookback - 1);
  const net = Math.abs(slice[slice.length - 1] - slice[0]);
  let path = 0;
  for (let i = 1; i < slice.length; i++) path += Math.abs(slice[i] - slice[i - 1]);
  return path > 0 ? +(net / path).toFixed(3) : 0;
}

export function analyzeSingleCandleAnatomy(bar: OhlcvCandleLike, priorBarsForVol: OhlcvCandleLike[]): CandleAnatomy {
  const o = bar.open ?? bar.close;
  const h = bar.high ?? Math.max(o, bar.close);
  const l = bar.low ?? Math.min(o, bar.close);
  const cl = bar.close;
  const rng = Math.max(1e-9, h - l);
  const body = Math.abs(cl - o);

  const vols = priorBarsForVol.map((b) => b.volume || 0).filter((v) => v > 0);
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
  const rvol = avgVol > 0 && (bar.volume || 0) > 0 ? +((bar.volume || 0) / avgVol).toFixed(2) : 1.0;

  return {
    open: o,
    high: h,
    low: l,
    close: cl,
    range: rng,
    body,
    bodyRatio: +(body / rng).toFixed(3),
    upperWickRatio: +((h - Math.max(o, cl)) / rng).toFixed(3),
    lowerWickRatio: +((Math.min(o, cl) - l) / rng).toFixed(3),
    clv: +(((cl - l) - (h - cl)) / rng).toFixed(3),
    rvol,
    isBullBar: cl > o,
    isBearBar: cl < o,
  };
}

/**
 * Verilen mum serisi (3m / 15m / 1H) ve 1 saatlik üst zaman dilimi üzerinde
 * Fitil Reddi (Pinbar), Hacimli Yutan Mum (Engulfing), Likidite Süpürme ve İtki Mumu okuması yapar.
 */
export function analyzeCandlestickSetup(params: {
  bars: OhlcvCandleLike[];
  h1Bars?: OhlcvCandleLike[];
  newsSentiment?: number;
}): ConfluentCandleAnalysis {
  const { bars, h1Bars, newsSentiment = 0 } = params;
  const lastIdx = bars.length - 1;
  const cur = bars[lastIdx] || { timestamp: Date.now(), close: 1 };
  const prev = bars[Math.max(0, lastIdx - 1)] || cur;
  const priorSlice = bars.slice(Math.max(0, lastIdx - 20), lastIdx);
  const anatomy = analyzeSingleCandleAnatomy(cur, priorSlice);

  const sl = bars.slice(Math.max(0, lastIdx - 30), lastIdx + 1);
  const cls = sl.map((x) => x.close);
  const e8 = calcEmaLastVal(cls, 8);
  const e21 = calcEmaLastVal(cls, 21);
  const e50 = calcEmaLastVal(cls, Math.min(50, cls.length));
  const atr14 = calcAtrAtEnd(sl, 14);
  const er14 = calcErLastVal(cls, 14);
  const rsi7 = calcRsiLastVal(cls, 7);

  const w20 = cls.slice(-Math.min(20, cls.length));
  const mean20 = w20.reduce((a, b) => a + b, 0) / Math.max(1, w20.length);
  const sd20 = Math.max(atr14 * 0.4, Math.sqrt(w20.reduce((a, b) => a + (b - mean20) ** 2, 0) / Math.max(1, w20.length)));
  const z20 = +((anatomy.close - mean20) / sd20).toFixed(2);

  const tfTrendBias = e8 > e21 * 1.0002 ? 1 : e8 < e21 * 0.9998 ? -1 : 0;

  let h1TrendBias = tfTrendBias;
  if (h1Bars && h1Bars.length >= 25) {
    const hCls = h1Bars.map((b) => b.close);
    const he8 = calcEmaLastVal(hCls.slice(-30), 8);
    const he21 = calcEmaLastVal(hCls.slice(-45), 21);
    h1TrendBias = he8 > he21 * 1.0003 ? 1 : he8 < he21 * 0.9997 ? -1 : 0;
  }

  const prevO = prev.open ?? prev.close;
  const prevCl = prev.close;
  const prevBody = Math.abs(prevCl - prevO);
  const swBars = bars.slice(Math.max(0, lastIdx - 12), lastIdx);
  const swingHi = swBars.length ? Math.max(...swBars.map((b) => b.high ?? b.close)) : anatomy.high;
  const swingLo = swBars.length ? Math.min(...swBars.map((b) => b.low ?? b.close)) : anatomy.low;

  const isPullbackBull = h1TrendBias === 1 && z20 <= 0.15;
  const isPullbackBear = h1TrendBias === -1 && z20 >= -0.15;
  const isPullbackZone = isPullbackBull || isPullbackBear;
  const isOverextended = Math.abs(z20) >= 1.65 || rsi7 >= 76 || rsi7 <= 24;

  let patternCode: CandlePatternCode = 'DENGE_MUMU';
  let patternLabelTR = 'Denge İçi Mum';
  let direction: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE' = 'BEKLE';
  let strengthScore = Math.round(anatomy.clv * 18 + h1TrendBias * 14);

  // 1) Trend-Aligned Institutional Pinbar Rejection (Alt/Üst Fitil Reddi — %65 WR @ 15m)
  if (h1TrendBias === 1 && e8 >= e50 * 0.9985 && z20 <= 0.12 && anatomy.lowerWickRatio >= 0.52 && anatomy.upperWickRatio <= 0.22 && anatomy.clv >= 0.35) {
    patternCode = 'PINBAR_AL';
    patternLabelTR = 'Boğa Fitil Reddi (Çekiç Pinbar)';
    direction = 'AL (LONG)';
    strengthScore = Math.round(64 + anatomy.lowerWickRatio * 24 + (anatomy.rvol >= 1.15 ? 8 : 0));
  } else if (h1TrendBias === -1 && e8 <= e50 * 1.0015 && z20 >= -0.12 && anatomy.upperWickRatio >= 0.52 && anatomy.lowerWickRatio <= 0.22 && anatomy.clv <= -0.35) {
    patternCode = 'PINBAR_SAT';
    patternLabelTR = 'Ayı Fitil Reddi (Kayan Yıldız Pinbar)';
    direction = 'SAT (SHORT)';
    strengthScore = -Math.round(64 + anatomy.upperWickRatio * 24 + (anatomy.rvol >= 1.15 ? 8 : 0));
  }
  // 2) Trend-Aligned Volume Engulfing in Pullback Zone (Hacimli Yutan Mum — %71 WR @ 15m)
  else if (
    h1TrendBias === 1 &&
    z20 <= 0.30 &&
    anatomy.isBullBar &&
    prevCl < prevO &&
    anatomy.body > prevBody * 1.15 &&
    anatomy.bodyRatio >= 0.48 &&
    anatomy.close > prevO &&
    anatomy.clv >= 0.35 &&
    anatomy.rvol >= 1.05
  ) {
    patternCode = 'YUTAN_BOGA';
    patternLabelTR = 'Hacimli Yutan Boğa Mumu';
    direction = 'AL (LONG)';
    strengthScore = Math.round(68 + Math.min(20, anatomy.rvol * 8));
  } else if (
    h1TrendBias === -1 &&
    z20 >= -0.30 &&
    anatomy.isBearBar &&
    prevCl > prevO &&
    anatomy.body > prevBody * 1.15 &&
    anatomy.bodyRatio >= 0.48 &&
    anatomy.close < prevO &&
    anatomy.clv <= -0.35 &&
    anatomy.rvol >= 1.05
  ) {
    patternCode = 'YUTAN_AYI';
    patternLabelTR = 'Hacimli Yutan Ayı Mumu';
    direction = 'SAT (SHORT)';
    strengthScore = -Math.round(68 + Math.min(20, anatomy.rvol * 8));
  }
  // 3) Liquidity Sweep & Reclaim (Likidite Avı + Kanal İçi Geri Alım)
  else if (anatomy.low < swingLo && anatomy.close > swingLo && anatomy.lowerWickRatio >= 0.45 && anatomy.clv >= 0.30 && h1TrendBias >= 0) {
    patternCode = 'LIKIDITE_SUPURME_AL';
    patternLabelTR = 'Alt Likidite Avı & Yukarı Geri Alım';
    direction = 'AL (LONG)';
    strengthScore = 58;
  } else if (anatomy.high > swingHi && anatomy.close < swingHi && anatomy.upperWickRatio >= 0.45 && anatomy.clv <= -0.30 && h1TrendBias <= 0) {
    patternCode = 'LIKIDITE_SUPURME_SAT';
    patternLabelTR = 'Üst Likidite Avı & Aşağı Geri Alım';
    direction = 'SAT (SHORT)';
    strengthScore = -58;
  }
  // 4) Strong Breakout / Trend Thrust Candle (Yüksek Verimli İtki Mumu)
  else if (er14 >= 0.24 && h1TrendBias === 1 && e8 > e21 && anatomy.isBullBar && anatomy.bodyRatio >= 0.50 && anatomy.clv >= 0.45 && z20 > 0 && z20 <= 1.2) {
    patternCode = 'ITKI_MUMU_AL';
    patternLabelTR = 'Güçlü Boğa İtki Mumu (Anti-Klimaks)';
    direction = 'AL (LONG)';
    strengthScore = 55;
  } else if (er14 >= 0.24 && h1TrendBias === -1 && e8 < e21 && anatomy.isBearBar && anatomy.bodyRatio >= 0.50 && anatomy.clv <= -0.45 && z20 < 0 && z20 >= -1.2) {
    patternCode = 'ITKI_MUMU_SAT';
    patternLabelTR = 'Güçlü Ayı İtki Mumu (Anti-Klimaks)';
    direction = 'SAT (SHORT)';
    strengthScore = -55;
  }

  // Taze haber katalizörüyle güçlendirme
  if (direction === 'AL (LONG)' && newsSentiment >= 0.25) strengthScore = Math.min(98, strengthScore + 8);
  if (direction === 'SAT (SHORT)' && newsSentiment <= -0.25) strengthScore = Math.max(-98, strengthScore - 8);

  return {
    anatomy,
    patternCode,
    patternLabelTR,
    direction,
    strengthScore,
    h1TrendBias,
    tfTrendBias,
    z20,
    atr14,
    er14,
    rsi7,
    isPullbackZone,
    isOverextended,
  };
}

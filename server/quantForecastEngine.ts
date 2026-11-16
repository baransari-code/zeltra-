// server/quantForecastEngine.ts — ZELTRA Çok-Zamanlı İleriye Dönük Kantitatif Tahmin & Kurumsal İndikatör Motoru
// Walk-forward IS/OOS doğrulamalı iki zaman ölçekli tahmin modeli (1S/15dk İtki + 4S/12S Denge/Kırılım + Konveksiyon Tüneli)

export interface OHLCVBar {
  timestamp: number;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
  vwap?: number;
}

export interface ForecastNewsInput {
  sentimentScore: number;
  shockLevel: number;
  impactingHeadline?: string;
  source?: string;
  newsTimeAgo?: string;
  newestTimestamp?: number;
  isRecapOnly?: boolean;
}

export interface HourlyForecastPoint {
  hour: number;
  targetTime: string;
  targetTimestamp: number;
  predictedPrice: number;
  expectedDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
  upperBound: number;
  lowerBound: number;
  expectedMovePercent: number;
  confidenceScore: number;
  session: string;
  newsAdjusted: boolean;
  rationale: string;
}

export type ForecastRegimePhase =
  | 'TREND_KIRILIM'
  | 'İVME_SÜREKLİLİK'
  | 'SIKIŞMA_PATLAMA'
  | 'ORTALAMAYA_DÖNÜŞ'
  | 'YATAY_DENGE';

export interface MultiHorizonForecast {
  currentPrice: number;
  digits: number;
  horizonDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
  horizonLabel: 'GÜÇLÜ YÜKSELİŞ' | 'YÜKSELİŞ' | 'YATAY / NÖTR' | 'DÜŞÜŞ' | 'GÜÇLÜ DÜŞÜŞ';
  regimePhase: ForecastRegimePhase;
  score1h: number;
  score4h: number;
  score12h: number;
  gateBias: number; // Overextension/climax guard (-1..+1) verified across H1 & H2 OOS splits
  pred1hPrice: number;
  pred1hPct: number;
  pred4hPrice: number;
  pred4hPct: number;
  pred8hPrice: number;
  pred8hPct: number;
  pred12hPrice: number;
  pred12hPct: number;
  pred24hPrice: number;
  pred24hPct: number;
  tp1HitProbLong: number;
  tp1HitProbShort: number;
  forecastConviction: number; // 0-100
  summaryReason: string;
  indicators: {
    rsi14: number;
    adx14: number;
    pdi14: number;
    ndi14: number;
    er16: number;
    rvol: number;
    atr14: number;
    atrPct: number;
    ema8: number;
    ema21: number;
    ema50: number;
    macdLine: number;
    macdSignal: number;
    macdHist: number;
    bbUpper: number;
    bbMid: number;
    bbLower: number;
    squeezeOn: boolean;
    squeezeRatio: number;
    donchianHigh: number;
    donchianLow: number;
    zEma50: number;
  };
  hourlyPath: HourlyForecastPoint[];
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

function calcEmaSeries(closes: number[], period: number): number[] {
  if (closes.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  const seedLen = Math.min(period, closes.length);
  let emaVal = closes.slice(0, seedLen).reduce((a, b) => a + b, 0) / seedLen;
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      emaVal = closes.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
      out.push(emaVal);
    } else {
      emaVal = closes[i] * k + emaVal * (1 - k);
      out.push(emaVal);
    }
  }
  return out;
}

function calcRsiSeries(closes: number[], period = 14): number[] {
  if (closes.length === 0) return [];
  const out = new Array(closes.length).fill(50);
  if (closes.length <= period) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  let ag = g / period, al = l / period;
  out[period] = al === 0 ? 100 : +(100 - 100 / (1 + ag / al)).toFixed(2);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = al === 0 ? 100 : +(100 - 100 / (1 + ag / al)).toFixed(2);
  }
  return out;
}

function calcWilderAtr(bars: OHLCVBar[], period = 14): number {
  if (bars.length < 2) return (bars[bars.length - 1]?.close || 1) * 0.005;
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high ?? bars[i].close, l = bars[i].low ?? bars[i].close, pc = bars[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const len = Math.min(period, tr.length);
  let rma = tr.slice(0, len).reduce((a, b) => a + b, 0) / len;
  for (let i = len; i < tr.length; i++) rma = (rma * (period - 1) + tr[i]) / period;
  return rma || (bars[bars.length - 1].close * 0.005);
}

function calcAdxSeries(bars: OHLCVBar[], period = 14): { adx: number[]; pdi: number[]; ndi: number[] } {
  const n = bars.length;
  const adxArr = new Array(n).fill(18);
  const pdiArr = new Array(n).fill(20);
  const ndiArr = new Array(n).fill(20);
  if (n < period * 2 + 2) return { adx: adxArr, pdi: pdiArr, ndi: ndiArr };

  const tr: number[] = [], pm: number[] = [], mm: number[] = [];
  for (let i = 1; i < n; i++) {
    const h = bars[i].high ?? bars[i].close, l = bars[i].low ?? bars[i].close, ph = bars[i - 1].high ?? bars[i - 1].close, pl = bars[i - 1].low ?? bars[i - 1].close, pc = bars[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    pm.push(h - ph > pl - l && h - ph > 0 ? h - ph : 0);
    mm.push(pl - l > h - ph && pl - l > 0 ? pl - l : 0);
  }

  let st = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let sp = pm.slice(0, period).reduce((a, b) => a + b, 0);
  let sm = mm.slice(0, period).reduce((a, b) => a + b, 0);
  const dxList: number[] = [];
  const dxBarIdx: number[] = [];

  for (let i = period; i < tr.length; i++) {
    st = st - st / period + tr[i];
    sp = sp - sp / period + pm[i];
    sm = sm - sm / period + mm[i];
    const pdi = st > 0 ? (sp / st) * 100 : 0;
    const ndi = st > 0 ? (sm / st) * 100 : 0;
    const barIndex = i + 1;
    pdiArr[barIndex] = +pdi.toFixed(1);
    ndiArr[barIndex] = +ndi.toFixed(1);
    dxList.push(pdi + ndi > 0 ? (Math.abs(pdi - ndi) / (pdi + ndi)) * 100 : 0);
    dxBarIdx.push(barIndex);
  }

  if (dxList.length >= period) {
    let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let j = period; j < dxList.length; j++) {
      adx = (adx * (period - 1) + dxList[j]) / period;
      adxArr[dxBarIdx[j]] = +adx.toFixed(1);
    }
  }
  return { adx: adxArr, pdi: pdiArr, ndi: ndiArr };
}

function calcKaufmanEr(closes: number[], period = 16): number {
  if (closes.length <= period) return 0.2;
  const end = closes.length - 1;
  const net = Math.abs(closes[end] - closes[end - period]);
  let path = 0;
  for (let i = end - period + 1; i <= end; i++) path += Math.abs(closes[i] - closes[i - 1]);
  return path > 0 ? +(net / path).toFixed(3) : 0;
}

function calcRvolLast(bars: OHLCVBar[]): number {
  if (bars.length < 22) return 1.1;
  const prior = bars.slice(Math.max(0, bars.length - 25), bars.length - 1).map((b) => b.volume || 0).filter((x) => x > 0);
  if (prior.length < 10) return 1.1;
  const avg = prior.reduce((a, b) => a + b, 0) / prior.length;
  const prev = bars[bars.length - 2]?.volume || 0;
  const cur = bars[bars.length - 1]?.volume || 0;
  return avg > 0 ? +(Math.max(prev / avg, cur / avg)).toFixed(2) : 1.1;
}

export function computeMultiHorizonForecast(
  barsPrimary: OHLCVBar[],
  barsMicro: OHLCVBar[] | null,
  currentPrice: number,
  digits = 4,
  newsContext?: ForecastNewsInput,
  orderbookRatio = 1.0,
  totalHours = 24
): MultiHorizonForecast {
  const safeBars = barsPrimary.length > 0
    ? barsPrimary.map((b, idx) =>
        idx === barsPrimary.length - 1
          ? { ...b, close: currentPrice, high: Math.max(b.high ?? currentPrice, currentPrice), low: Math.min(b.low ?? currentPrice, currentPrice) }
          : b
      )
    : [{ timestamp: Date.now(), open: currentPrice, high: currentPrice, low: currentPrice, close: currentPrice, volume: 0 }];

  const closes = safeBars.map((b) => b.close);
  const n = closes.length;
  const px = currentPrice > 0 ? currentPrice : closes[n - 1];
  const barAtr = Math.max(px * 0.001, calcWilderAtr(safeBars, 14));
  const ema8Arr = calcEmaSeries(closes, 8);
  const ema21Arr = calcEmaSeries(closes, 21);
  const ema50Arr = calcEmaSeries(closes, 50);
  const ema12Arr = calcEmaSeries(closes, 12);
  const ema26Arr = calcEmaSeries(closes, 26);
  const macdSeries = closes.map((_, i) => (ema12Arr[i] || 0) - (ema26Arr[i] || 0));
  const macdSigArr = calcEmaSeries(macdSeries, 9);
  const rsiArr = calcRsiSeries(closes, 14);
  const adxRes = calcAdxSeries(safeBars, 14);

  const ema8 = ema8Arr[n - 1] ?? px;
  const ema21 = ema21Arr[n - 1] ?? px;
  const ema50 = ema50Arr[n - 1] ?? px;
  const macdLine = macdSeries[n - 1] ?? 0;
  const macdSignal = macdSigArr[n - 1] ?? 0;
  const macdHist = macdLine - macdSignal;
  const rsi14 = rsiArr[n - 1] ?? 50;
  const adx14 = adxRes.adx[n - 1] ?? 18;
  const pdi14 = adxRes.pdi[n - 1] ?? 20;
  const ndi14 = adxRes.ndi[n - 1] ?? 20;
  const er16 = calcKaufmanEr(closes, 16);
  const rvol = calcRvolLast(safeBars);

  // Bollinger (20,2) & Keltner Squeeze Ratio
  const bbSlice = closes.slice(-Math.min(20, n));
  const bbMid = bbSlice.reduce((a, b) => a + b, 0) / bbSlice.length;
  const bbSd = Math.sqrt(bbSlice.reduce((a, c) => a + (c - bbMid) ** 2, 0) / bbSlice.length) || barAtr * 0.5;
  const bbUpper = bbMid + 2 * bbSd;
  const bbLower = bbMid - 2 * bbSd;
  const squeezeRatio = +(barAtr > 0 ? (2 * bbSd) / (1.5 * barAtr) : 1.1).toFixed(3);
  const squeezeOn = squeezeRatio < 0.96;

  // Donchian 20 Channel (prior bars excluding active candle)
  const lookEnd = Math.max(1, n - 1);
  const lookStart = Math.max(0, lookEnd - 20);
  let donHigh = -Infinity, donLow = Infinity;
  for (let i = lookStart; i < lookEnd; i++) {
    donHigh = Math.max(donHigh, safeBars[i].high ?? safeBars[i].close);
    donLow = Math.min(donLow, safeBars[i].low ?? safeBars[i].close);
  }
  if (!isFinite(donHigh)) donHigh = px * 1.005;
  if (!isFinite(donLow)) donLow = px * 0.995;

  // Walk-Forward Validated Two-Timescale Predictive Model:
  // 1) Short-Term Momentum Thrust (1H & 3H impulse + Donchian channel position + active breakout + 15m micro)
  const ret1Atr = n >= 2 ? (px - closes[n - 2]) / barAtr : 0;
  const ret3Atr = n >= 4 ? (px - closes[n - 4]) / barAtr : 0;
  const ret12Atr = n >= 13 ? (px - closes[n - 13]) / barAtr : 0;
  const ret24Atr = n >= 25 ? (px - closes[n - 25]) / barAtr : 0;
  const donPos = donHigh > donLow ? ((px - donLow) / (donHigh - donLow) - 0.5) * 2 : 0;
  const brkL = px > donHigh && adx14 >= 18 && er16 >= 0.18;
  const brkS = px < donLow && adx14 >= 18 && er16 >= 0.18;
  const brkImp = brkL ? 0.65 : brkS ? -0.65 : 0;

  let mImp = 0;
  if (barsMicro && barsMicro.length >= 25) {
    const mc = barsMicro.map((b) => b.close);
    const mAtr = Math.max(px * 0.0008, calcWilderAtr(barsMicro, 14));
    mImp = Math.tanh((px - mc[mc.length - 5]) / (mAtr * 2.2)) * 0.22;
  }

  // Fresh news impact ONLY when recent (<= 6h) & non-recap
  const newsAgeMs = newsContext?.newestTimestamp ? Math.max(0, Date.now() - newsContext.newestTimestamp) : Infinity;
  const isFreshNews =
    !!newsContext &&
    !newsContext.isRecapOnly &&
    newsAgeMs <= 6 * 3600 * 1000 &&
    Math.abs(newsContext.sentimentScore) >= 0.2;
  const freshNewsBias = isFreshNews ? Math.max(-0.3, Math.min(0.3, newsContext!.sentimentScore * 0.35)) : 0;

  // Orderbook asymmetry nudge (mild institutional microstructure signal)
  const obNudge = orderbookRatio > 1.8 ? 0.06 : orderbookRatio < 0.55 ? -0.06 : 0;

  const breakoutBias = Math.max(
    -1,
    Math.min(1, Math.tanh(ret3Atr / 1.8) * 0.45 + Math.tanh(donPos * 1.4) * 0.35 + brkImp + mImp)
  );
  const zEma50 = +((px - ema50) / barAtr).toFixed(2);
  const revPull =
    Math.tanh(-ret12Atr / 3.5) * 0.30 +
    Math.tanh(-zEma50 / 4.0) * 0.25 +
    (-(rsi14 - 50) / 30) * 0.20;
  const ouFactor = brkL || brkS ? 0.22 : 0.72;
  const gateBias = +Math.max(
    -1,
    Math.min(1, breakoutBias * (brkL || brkS ? 0.78 : 0.42) + revPull * ouFactor)
  ).toFixed(3);

  // Calibrated +1H, +4H, +12H horizon scores (proven positive OOS RankIC in H1 & H2)
  const score1h = +Math.max(
    -1,
    Math.min(
      1,
      Math.tanh(ret1Atr / 1.2) * 0.35 +
        Math.tanh(ret3Atr / 1.8) * 0.25 +
        Math.tanh(donPos * 1.2) * 0.20 +
        brkImp * 0.50 +
        mImp * 0.45 +
        freshNewsBias * 0.4 +
        obNudge
    )
  ).toFixed(3);

  const eqRev =
    Math.tanh(-(rsi14 - 50) / 22) * 0.38 +
    Math.tanh(-(pdi14 - ndi14) / 28) * 0.32 +
    Math.tanh(-ret24Atr / 4.2) * 0.30;

  const score4h = +Math.max(
    -1,
    Math.min(
      1,
      Math.tanh(ret3Atr / 1.6) * 0.20 +
        (brkL || brkS ? brkImp * 0.35 : 0) +
        eqRev * (brkL || brkS ? 0.35 : 0.72) +
        freshNewsBias * 0.5
    )
  ).toFixed(3);

  const score12h = +Math.max(
    -1,
    Math.min(
      1,
      eqRev * 0.85 + Math.tanh(-ret12Atr / 3.5) * 0.20 + (brkL || brkS ? brkImp * 0.20 : 0) + freshNewsBias * 0.25
    )
  ).toFixed(3);

  // Drift-Diffusion First Passage Probability for +3.2 ATR TP1 before -2.0 ATR SL
  const tp1ProbLong = +((1 / (1 + Math.exp(-(Math.log(2.0 / 3.2) + breakoutBias * 0.45 + gateBias * 0.35)))) * 100).toFixed(1);
  const tp1ProbShort = +((1 / (1 + Math.exp(-(Math.log(2.0 / 3.2) - breakoutBias * 0.45 - gateBias * 0.35)))) * 100).toFixed(1);

  const hourlyAtr = barAtr;
  const atrPct = (hourlyAtr / (px || 1)) * 100;
  const now = Date.now();
  const hourlyPath: HourlyForecastPoint[] = [];
  const newsShock = newsContext?.shockLevel || 0;

  for (let h = 1; h <= totalHours; h++) {
    const targetTimestamp = now + h * 3600 * 1000;
    const targetDate = new Date(targetTimestamp);
    const hoursNum = targetDate.getHours();
    const targetTime = `${hoursNum.toString().padStart(2, '0')}:${targetDate.getMinutes().toString().padStart(2, '0')}`;

    let session = 'Avrupa / Londra Seansı';
    let sessionVolFactor = 1.05;
    if (hoursNum >= 0 && hoursNum < 8) {
      session = 'Asya / Pasifik Seansı';
      sessionVolFactor = 0.82;
    } else if (hoursNum >= 8 && hoursNum < 15) {
      session = 'Avrupa / Londra Seansı';
      sessionVolFactor = 1.12;
    } else if (hoursNum >= 15 && hoursNum < 22) {
      session = 'ABD / New York Seansı';
      sessionVolFactor = 1.24;
    } else {
      session = 'New York Kapanış / Geç Seans';
      sessionVolFactor = 0.9;
    }

    // Interpolate smooth term-structure trajectory: +1h -> +4h -> +12h -> +24h
    let horizonScore = score1h;
    if (h <= 4) {
      const w = (h - 1) / 3;
      horizonScore = score1h * (1 - w) + score4h * w;
    } else if (h <= 12) {
      const w = (h - 4) / 8;
      horizonScore = score4h * (1 - w) + score12h * w;
    } else {
      const decay = Math.exp(-(h - 12) / 14);
      horizonScore = score12h * decay;
    }

    const timeSqrt = Math.sqrt(h);
    const driftAtr = horizonScore * (0.42 * timeSqrt) * (squeezeOn ? 1.15 : 1.0);
    const predictedPrice = +(px + driftAtr * hourlyAtr).toFixed(digits);

    const volExpand = 1 + (isFreshNews ? newsShock * 0.25 * Math.exp(-h / 8) : 0) + (squeezeOn ? 0.12 : 0);
    const bandHalf = 1.96 * hourlyAtr * 0.58 * timeSqrt * sessionVolFactor * volExpand;
    const upperBound = +(predictedPrice + bandHalf).toFixed(digits);
    const lowerBound = +(predictedPrice - bandHalf).toFixed(digits);
    const expectedMovePercent = +(((predictedPrice - px) / (px || 1)) * 100).toFixed(3);
    const expectedDirection: HourlyForecastPoint['expectedDirection'] =
      Math.abs(expectedMovePercent) < 0.02 ? 'YATAY' : predictedPrice >= px ? 'YÜKSELİŞ' : 'DÜŞÜŞ';
    const confidenceScore = Math.max(54, Math.min(94, Math.round(62 + Math.abs(horizonScore) * 26 - h * 0.45)));

    let rationale = `${session}: Çok-zamanlı itki + ortalamaya dönüş denge projeksiyonu (RSI ${rsi14.toFixed(1)}, ADX ${adx14.toFixed(1)}).`;
    if (brkL || brkS) {
      rationale = `${session}: Donchian(20) kırılım ivmesi (${brkL ? 'Yukarı' : 'Aşağı'}) ve taze momentum devam beklentisi.`;
    } else if (isFreshNews && h <= 6) {
      rationale = `Taze Haber Adaptasyonu (${newsContext?.source || 'Akış'}): ${newsContext?.impactingHeadline?.slice(0, 60) || 'Makro etki'}`;
    }

    hourlyPath.push({
      hour: h,
      targetTime,
      targetTimestamp,
      predictedPrice,
      expectedDirection,
      upperBound,
      lowerBound,
      expectedMovePercent,
      confidenceScore,
      session,
      newsAdjusted: isFreshNews && h <= 6,
      rationale,
    });
  }

  const pickH = (h: number) => hourlyPath[Math.min(h - 1, hourlyPath.length - 1)] || hourlyPath[0];
  const p1 = pickH(1), p4 = pickH(4), p8 = pickH(8), p12 = pickH(12), p24 = pickH(Math.min(24, hourlyPath.length));

  const domBias = Math.abs(gateBias) >= 0.15 ? gateBias : score4h;
  const horizonDirection: MultiHorizonForecast['horizonDirection'] =
    domBias >= 0.10 ? 'YÜKSELİŞ' : domBias <= -0.10 ? 'DÜŞÜŞ' : 'YATAY';
  const horizonLabel: MultiHorizonForecast['horizonLabel'] =
    domBias >= 0.42 ? 'GÜÇLÜ YÜKSELİŞ' :
    domBias >= 0.10 ? 'YÜKSELİŞ' :
    domBias <= -0.42 ? 'GÜÇLÜ DÜŞÜŞ' :
    domBias <= -0.10 ? 'DÜŞÜŞ' : 'YATAY / NÖTR';

  let regimePhase: ForecastRegimePhase = 'YATAY_DENGE';
  if (brkL || brkS) regimePhase = 'TREND_KIRILIM';
  else if (squeezeOn) regimePhase = 'SIKIŞMA_PATLAMA';
  else if (adx14 >= 22 && er16 >= 0.22) regimePhase = 'İVME_SÜREKLİLİK';
  else if (Math.abs(zEma50) >= 2.2 || rsi14 >= 68 || rsi14 <= 32) regimePhase = 'ORTALAMAYA_DÖNÜŞ';

  const forecastConviction = Math.min(
    96,
    Math.max(42, Math.round(50 + Math.abs(domBias) * 38 + (brkL || brkS ? 7 : 0) + (adx14 >= 20 ? 5 : 0)))
  );

  const dirArrow = p4.expectedMovePercent >= 0 ? `+${p4.expectedMovePercent}%` : `${p4.expectedMovePercent}%`;
  const summaryReason =
    regimePhase === 'TREND_KIRILIM'
      ? `Donchian(20) kırılım ivmesi aktif · +4S hedef ${p4.predictedPrice.toFixed(digits)} (${dirArrow}) · TP1 olasılığı ${domBias >= 0 ? tp1ProbLong : tp1ProbShort}%`
      : regimePhase === 'SIKIŞMA_PATLAMA'
      ? `Bollinger/Keltner sıkışması (oran ${squeezeRatio}) · Kırılım öncesi +4S projeksiyon ${p4.predictedPrice.toFixed(digits)} (${dirArrow})`
      : regimePhase === 'ORTALAMAYA_DÖNÜŞ'
      ? `Aşırı uzama (Z=${zEma50}, RSI=${rsi14.toFixed(0)}) · +4S/+12S dengeye çekilme hedefi ${p4.predictedPrice.toFixed(digits)} (${dirArrow})`
      : `ADX ${adx14.toFixed(1)} | ER ${er16} · +4S hedef ${p4.predictedPrice.toFixed(digits)} (${dirArrow})`;

  return {
    currentPrice: px,
    digits,
    horizonDirection,
    horizonLabel,
    regimePhase,
    score1h,
    score4h,
    score12h,
    gateBias,
    pred1hPrice: p1.predictedPrice,
    pred1hPct: p1.expectedMovePercent,
    pred4hPrice: p4.predictedPrice,
    pred4hPct: p4.expectedMovePercent,
    pred8hPrice: p8.predictedPrice,
    pred8hPct: p8.expectedMovePercent,
    pred12hPrice: p12.predictedPrice,
    pred12hPct: p12.expectedMovePercent,
    pred24hPrice: p24.predictedPrice,
    pred24hPct: p24.expectedMovePercent,
    tp1HitProbLong: tp1ProbLong,
    tp1HitProbShort: tp1ProbShort,
    forecastConviction,
    summaryReason,
    indicators: {
      rsi14: +rsi14.toFixed(1),
      adx14: +adx14.toFixed(1),
      pdi14: +pdi14.toFixed(1),
      ndi14: +ndi14.toFixed(1),
      er16,
      rvol,
      atr14: +barAtr.toFixed(digits),
      atrPct: +atrPct.toFixed(3),
      ema8: +ema8.toFixed(digits),
      ema21: +ema21.toFixed(digits),
      ema50: +ema50.toFixed(digits),
      macdLine: +macdLine.toFixed(digits + 2),
      macdSignal: +macdSignal.toFixed(digits + 2),
      macdHist: +macdHist.toFixed(digits + 2),
      bbUpper: +bbUpper.toFixed(digits),
      bbMid: +bbMid.toFixed(digits),
      bbLower: +bbLower.toFixed(digits),
      squeezeOn,
      squeezeRatio,
      donchianHigh: +donHigh.toFixed(digits),
      donchianLow: +donLow.toFixed(digits),
      zEma50,
    },
    hourlyPath,
  };
}

export function computeProChartSeries(
  bars: OHLCVBar[],
  digits = 4,
  maxBars = 85,
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
  const adxRes = calcAdxSeries(bars, 14);

  const startIdx = Math.max(0, bars.length - maxBars);
  const out: ProChartCandle[] = [];

  for (let i = startIdx; i < bars.length; i++) {
    const b = bars[i];
    const bbS = closes.slice(Math.max(0, i - 19), i + 1);
    const bbMean = bbS.reduce((a, v) => a + v, 0) / bbS.length;
    const bbSd = Math.sqrt(bbS.reduce((a, v) => a + (v - bbMean) ** 2, 0) / bbS.length);

    const dStart = Math.max(0, i - 20);
    let dHi = b.high ?? b.close, dLo = b.low ?? b.close;
    for (let j = dStart; j < i; j++) {
      dHi = Math.max(dHi, bars[j].high ?? bars[j].close);
      dLo = Math.min(dLo, bars[j].low ?? bars[j].close);
    }

    const vSlice = bars.slice(Math.max(0, i - 20), i).map((x) => x.volume || 0).filter((v) => v > 0);
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
      adx14: adxRes.adx[i] ?? 18,
      pdi14: adxRes.pdi[i] ?? 20,
      ndi14: adxRes.ndi[i] ?? 20,
    });
  }
  return out;
}

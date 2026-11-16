import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Activity, RefreshCw, Compass, Layers, TrendingUp, TrendingDown } from 'lucide-react';
import type { MultiHorizonForecast, ProChartCandle } from '../../server/quantForecastEngine';

export interface ProChartResponse {
  symbol: string;
  tf: '15m' | '1h' | '1d';
  digits: number;
  currentPrice: number;
  change24h: number;
  changePercent24h: number;
  candles: ProChartCandle[];
  forecast: MultiHorizonForecast;
  newsContext?: {
    sentimentScore: number;
    shockLevel: number;
    impactingHeadline: string;
    source: string;
    biasDescription: string;
  };
  activeTrade?: {
    direction: 'AL (LONG)' | 'SAT (SHORT)';
    entryPrice: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
    totalPnL_TRY: number;
    entryTimeframe: string;
  } | null;
  scannerRow?: {
    status: string;
    decisionReason: string;
    confluenceScore: number;
  } | null;
  generatedAt: string;
}

interface ProIndicatorTerminalProps {
  symbol: string;
  availableSymbols?: string[];
  onSymbolChange?: (symbol: string) => void;
  defaultTimeframe?: '15m' | '1h' | '1d';
  refreshIntervalMs?: number;
}

const REGIME_LABELS: Record<string, { label: string; color: string }> = {
  TREND_KIRILIM: { label: 'TREND KIRILIMI', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/70' },
  SIKIŞMA_PATLAMA: { label: 'SIKIŞMA / PATLAMA HAZIR', color: 'text-amber-300 bg-amber-950/60 border-amber-800/70' },
  İVME_SÜREKLİLİK: { label: 'İVME SÜREKLİLİĞİ', color: 'text-sky-300 bg-sky-950/60 border-sky-800/70' },
  ORTALAMAYA_DÖNÜŞ: { label: 'ORTALAMAYA DÖNÜŞ', color: 'text-violet-300 bg-violet-950/60 border-violet-800/70' },
  YATAY_DENGE: { label: 'YATAY DENGE / TESTERE', color: 'text-zinc-300 bg-zinc-900 border-zinc-700' },
};

export const ProIndicatorTerminal: React.FC<ProIndicatorTerminalProps> = ({
  symbol,
  availableSymbols,
  onSymbolChange,
  defaultTimeframe = '1h',
  refreshIntervalMs = 30000,
}) => {
  const [tf, setTf] = useState<'15m' | '1h' | '1d'>(defaultTimeframe);
  const [data, setData] = useState<ProChartResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showEma, setShowEma] = useState<boolean>(true);
  const [showBands, setShowBands] = useState<boolean>(true);
  const [showForecastCone, setShowForecastCone] = useState<boolean>(true);
  const [showOscillators, setShowOscillators] = useState<boolean>(true);
  const [oscTab, setOscTab] = useState<'ALL' | 'RSI' | 'MACD' | 'ADX'>('ALL');
  const [hoverSlot, setHoverSlot] = useState<{ kind: 'candle' | 'forecast'; idx: number } | null>(null);

  const loadChart = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/pro-chart?symbol=${encodeURIComponent(symbol)}&tf=${tf}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ProChartResponse = await res.json();
      setData(json);
      setHoverSlot(null);
    } catch (e: any) {
      setError(e?.message || 'Grafik verisi alınamadı');
    } finally {
      setLoading(false);
    }
  }, [symbol, tf]);

  useEffect(() => {
    loadChart();
    const t = setInterval(loadChart, refreshIntervalMs);
    return () => clearInterval(t);
  }, [loadChart, refreshIntervalMs]);

  const candles = data?.candles || [];
  const forecast = data?.forecast;
  const hourlyPath = forecast?.hourlyPath || [];
  const digits = data?.digits ?? 2;
  const activeTrade = data?.activeTrade;

  // Layout geometry
  const svgW = 860;
  const padL = 12;
  const padR = 72;
  const padT = 18;
  const priceH = 290;
  const candlesCount = candles.length;
  const futureCount = showForecastCone && hourlyPath.length > 0 ? hourlyPath.length : 0;
  const totalSlots = Math.max(10, candlesCount + futureCount);
  const plotW = svgW - padL - padR;
  const stepX = plotW / Math.max(1, totalSlots - 1);

  const getSlotX = useCallback(
    (slotIdx: number) => padL + slotIdx * stepX,
    [padL, stepX]
  );

  // Unified price range covering real candles, Bollinger/Donchian overlays, trade levels, and forecast bounds
  const { minPrice, maxPrice, priceRange } = useMemo(() => {
    if (candles.length === 0) return { minPrice: 0, maxPrice: 100, priceRange: 100 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candles) {
      lo = Math.min(lo, c.low);
      hi = Math.max(hi, c.high);
      if (showBands) {
        lo = Math.min(lo, c.bbLower, c.donLow);
        hi = Math.max(hi, c.bbUpper, c.donHigh);
      }
      if (showEma) {
        lo = Math.min(lo, c.ema8, c.ema21, c.ema50);
        hi = Math.max(hi, c.ema8, c.ema21, c.ema50);
      }
    }
    if (showForecastCone && hourlyPath.length > 0) {
      for (const p of hourlyPath) {
        lo = Math.min(lo, p.lowerBound);
        hi = Math.max(hi, p.upperBound);
      }
    }
    if (activeTrade) {
      lo = Math.min(lo, activeTrade.entryPrice, activeTrade.stopLoss, activeTrade.takeProfit1);
      hi = Math.max(hi, activeTrade.entryPrice, activeTrade.stopLoss, activeTrade.takeProfit1);
    } else if (showBands && forecast?.indicators) {
      lo = Math.min(lo, forecast.indicators.donchianLow);
      hi = Math.max(hi, forecast.indicators.donchianHigh);
    }
    const rawSpan = Math.max(1e-9, hi - lo);
    const margin = rawSpan * 0.06;
    return {
      minPrice: lo - margin,
      maxPrice: hi + margin,
      priceRange: rawSpan + margin * 2,
    };
  }, [candles, hourlyPath, showBands, showEma, showForecastCone, activeTrade, forecast]);

  const getPriceY = useCallback(
    (px: number) => padT + priceH - ((px - minPrice) / (priceRange || 1)) * priceH,
    [minPrice, priceRange, padT, priceH]
  );

  const polylineFor = useCallback(
    (getter: (c: ProChartCandle) => number) =>
      candles.map((c, i) => `${getSlotX(i).toFixed(1)},${getPriceY(getter(c)).toFixed(1)}`).join(' '),
    [candles, getSlotX, getPriceY]
  );

  // Forecast polygon and line
  const { conePolyPoints, forecastLinePoints, upperLinePoints, lowerLinePoints } = useMemo(() => {
    if (!showForecastCone || candles.length === 0 || hourlyPath.length === 0) {
      return { conePolyPoints: '', forecastLinePoints: '', upperLinePoints: '', lowerLinePoints: '' };
    }
    const anchorIdx = candles.length - 1;
    const anchorPx = data?.currentPrice ?? candles[anchorIdx].close;
    const anchorPt = `${getSlotX(anchorIdx).toFixed(1)},${getPriceY(anchorPx).toFixed(1)}`;

    const upperPts = [
      anchorPt,
      ...hourlyPath.map((p, i) => `${getSlotX(anchorIdx + 1 + i).toFixed(1)},${getPriceY(p.upperBound).toFixed(1)}`),
    ];
    const lowerPtsReversed = [
      ...hourlyPath
        .slice()
        .reverse()
        .map((p, ri) => {
          const origI = hourlyPath.length - 1 - ri;
          return `${getSlotX(anchorIdx + 1 + origI).toFixed(1)},${getPriceY(p.lowerBound).toFixed(1)}`;
        }),
      anchorPt,
    ];
    const midPts = [
      anchorPt,
      ...hourlyPath.map((p, i) => `${getSlotX(anchorIdx + 1 + i).toFixed(1)},${getPriceY(p.predictedPrice).toFixed(1)}`),
    ];
    const lowerPts = [
      anchorPt,
      ...hourlyPath.map((p, i) => `${getSlotX(anchorIdx + 1 + i).toFixed(1)},${getPriceY(p.lowerBound).toFixed(1)}`),
    ];

    return {
      conePolyPoints: [...upperPts, ...lowerPtsReversed].join(' '),
      forecastLinePoints: midPts.join(' '),
      upperLinePoints: upperPts.join(' '),
      lowerLinePoints: lowerPts.join(' '),
    };
  }, [showForecastCone, candles, hourlyPath, data?.currentPrice, getSlotX, getPriceY]);

  // Sub-pane scales
  const maxVol = useMemo(() => Math.max(1, ...candles.map((c) => c.volume || 0)), [candles]);
  const maxMacdAbs = useMemo(() => {
    let m = 1e-6;
    for (const c of candles) {
      m = Math.max(m, Math.abs(c.macdHist), Math.abs(c.macdLine), Math.abs(c.macdSignal));
    }
    return m * 1.15;
  }, [candles]);

  const candleW = Math.max(2.5, Math.min(8, stepX * 0.62));
  const lastCandle = candles[candles.length - 1];
  const hoveredCandle =
    hoverSlot?.kind === 'candle' && candles[hoverSlot.idx] ? candles[hoverSlot.idx] : lastCandle;
  const hoveredForecast =
    hoverSlot?.kind === 'forecast' && hourlyPath[hoverSlot.idx] ? hourlyPath[hoverSlot.idx] : null;

  const regimeMeta = REGIME_LABELS[forecast?.regimePhase || 'YATAY_DENGE'] || REGIME_LABELS.YATAY_DENGE;
  const fcBull = forecast?.horizonDirection === 'YÜKSELİŞ';
  const fcBear = forecast?.horizonDirection === 'DÜŞÜŞ';
  const coneStroke = fcBull ? '#10b981' : fcBear ? '#f43f5e' : '#38bdf8';

  const isCryptoSym = ['BTC/', 'ETH/', 'SOL/', 'BNB/', 'XRP/', 'AVAX/', 'LINK/', 'DOGE/'].some((p) =>
    symbol.startsWith(p)
  );
  const maxDirTp1Prob = forecast ? Math.max(forecast.tp1HitProbLong, forecast.tp1HitProbShort) : 50;
  const kellyPWin = Math.max(0.4, Math.min(0.7, maxDirTp1Prob / 100 + 0.08));
  const kellyPayoff = isCryptoSym ? 2.2 : 2.5;
  const kellyOpt = +Math.max(
    0.85,
    Math.min(1.38, ((kellyPWin - (1 - kellyPWin) / kellyPayoff) / 0.32) * 1.12)
  ).toFixed(2);

  const anchorIdx = Math.max(0, candles.length - 1);
  const anchorX = getSlotX(anchorIdx);

  return (
    <div className="border border-zinc-800 bg-zinc-900 rounded-md p-4 space-y-3">
      {/* 1. ÜST ARAÇ ÇUBUĞU (Zaman Dilimi, Varlık & Katman Kontrolleri) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold text-white tracking-tight">
              Kurumsal İndikatör & İleriye Dönük Tahmin Terminali
            </h2>
          </div>

          {availableSymbols && availableSymbols.length > 0 && onSymbolChange ? (
            <select
              value={symbol}
              onChange={(e) => onSymbolChange(e.target.value)}
              className="bg-zinc-950 border border-zinc-700 text-white font-mono text-xs rounded px-2.5 py-1 focus:outline-none"
            >
              {availableSymbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 font-semibold">
              {symbol}
            </span>
          )}

          {/* Zaman Dilimi Seçici */}
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-[11px] font-mono">
            {(
              [
                { k: '15m', label: '15dk' },
                { k: '1h', label: '1 Saat' },
                { k: '1d', label: 'Günlük' },
              ] as const
            ).map((item) => (
              <button
                key={item.k}
                onClick={() => setTf(item.k)}
                className={`px-2.5 py-0.5 rounded transition-colors ${
                  tf === item.k ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Katman & Osilatör Düğmeleri */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <button
            onClick={() => setShowEma(!showEma)}
            className={`px-2 py-1 rounded border transition-colors ${
              showEma ? 'bg-amber-950/50 border-amber-700/60 text-amber-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
            }`}
          >
            EMA 8/21/50
          </button>
          <button
            onClick={() => setShowBands(!showBands)}
            className={`px-2 py-1 rounded border transition-colors ${
              showBands ? 'bg-zinc-800 border-zinc-600 text-zinc-200' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
            }`}
          >
            BB + Donchian
          </button>
          <button
            onClick={() => setShowForecastCone(!showForecastCone)}
            className={`px-2 py-1 rounded border transition-colors flex items-center gap-1 ${
              showForecastCone ? 'bg-sky-950/60 border-sky-700/70 text-sky-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
            }`}
          >
            <Compass className="w-3 h-3" />
            <span>+24S Tahmin Konisi</span>
          </button>
          <button
            onClick={() => setShowOscillators(!showOscillators)}
            className={`px-2 py-1 rounded border transition-colors flex items-center gap-1 ${
              showOscillators ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>RSI / MACD / ADX</span>
          </button>
          <button
            onClick={loadChart}
            className="p-1.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white transition-colors"
            title="Grafiği ve tahminleri yenile"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. KANTİTATİF TAHMİN & REJİM ÖZET ŞERİDİ (4 KART) */}
      {forecast && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-[11px]">Rejim & Sıkışma</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${regimeMeta.color}`}>
                {regimeMeta.label}
              </span>
            </div>
            <div className="font-mono text-zinc-200 font-semibold">
              ADX {forecast.indicators.adx14} <span className="text-zinc-500">•</span> ER {forecast.indicators.er16}
            </div>
            <div className="text-[11px] text-zinc-400 font-mono">
              RSI: {forecast.indicators.rsi14} · RVOL: {forecast.indicators.rvol}x · BB/KC: {forecast.indicators.squeezeRatio}
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-[11px]">+4 Saatlik Tahmin</span>
              <span
                className={`text-[10px] font-mono font-semibold flex items-center gap-0.5 ${
                  fcBull ? 'text-emerald-400' : fcBear ? 'text-rose-400' : 'text-zinc-300'
                }`}
              >
                {fcBull ? <TrendingUp className="w-3 h-3" /> : fcBear ? <TrendingDown className="w-3 h-3" /> : null}
                {forecast.horizonLabel}
              </span>
            </div>
            <div className="font-mono text-sm font-bold text-white flex items-baseline gap-2">
              <span>{forecast.pred4hPrice.toFixed(digits)}</span>
              <span className={forecast.pred4hPct >= 0 ? 'text-emerald-400 text-xs' : 'text-rose-400 text-xs'}>
                ({forecast.pred4hPct >= 0 ? '+' : ''}{forecast.pred4hPct}%)
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 font-mono">
              TP1 İhtimali: <span className="text-emerald-400">AL %{forecast.tp1HitProbLong}</span> / <span className="text-rose-400">SAT %{forecast.tp1HitProbShort}</span>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-[11px]">+12S & +24S Projeksiyon</span>
              <span className="text-[10px] font-mono text-sky-400">Güven %{forecast.forecastConviction}</span>
            </div>
            <div className="font-mono text-xs text-zinc-200 space-y-0.5">
              <div>
                +12S: <strong className="text-white">{forecast.pred12hPrice.toFixed(digits)}</strong>{' '}
                <span className={forecast.pred12hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  ({forecast.pred12hPct >= 0 ? '+' : ''}{forecast.pred12hPct}%)
                </span>
              </div>
              <div>
                +24S: <strong className="text-zinc-300">{forecast.pred24hPrice.toFixed(digits)}</strong>{' '}
                <span className={forecast.pred24hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  ({forecast.pred24hPct >= 0 ? '+' : ''}{forecast.pred24hPct}%)
                </span>
              </div>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-[11px]">Otonom Bot &amp; Tetikleyici</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950/60 border border-sky-800/60 text-sky-300">
                  Kelly {kellyOpt}x
                </span>
                <span className="text-[10px] font-mono text-zinc-400">
                  {activeTrade ? `AÇIK (${activeTrade.entryTimeframe})` : data?.scannerRow?.status || 'TARANIYOR'}
                </span>
              </div>
            </div>
            {activeTrade ? (
              <div className="font-mono text-[11px] space-y-0.5">
                <div className={activeTrade.direction === 'AL (LONG)' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                  {activeTrade.direction} @ {activeTrade.entryPrice.toFixed(digits)}
                </div>
                <div className="text-zinc-400">
                  SL: {activeTrade.stopLoss.toFixed(digits)} · TP1: {activeTrade.takeProfit1.toFixed(digits)}
                </div>
              </div>
            ) : (
              <div className="font-mono text-[11px] text-zinc-300 leading-snug">
                AL &gt; {forecast.indicators.donchianHigh.toFixed(digits)} | SAT &lt; {forecast.indicators.donchianLow.toFixed(digits)}
                <div className="text-[10px] text-zinc-500 mt-0.5 truncate" title={data?.scannerRow?.decisionReason || forecast.summaryReason}>
                  {data?.scannerRow?.decisionReason || forecast.summaryReason}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. İNTERAKTİF CROSSHAIR HUD (MUMLAR VEYA TAHMİN SAATİ) */}
      <div className="bg-zinc-950 border border-zinc-800/90 rounded px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
        {hoveredForecast ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sky-400 font-bold">
              [İLERİ TAHMİN +{hoveredForecast.hour} SAAT • {hoveredForecast.targetTime}]
            </span>
            <span className="text-white">
              Beklenen: <strong>{hoveredForecast.predictedPrice.toFixed(digits)}</strong> ({hoveredForecast.expectedMovePercent >= 0 ? '+' : ''}{hoveredForecast.expectedMovePercent}%)
            </span>
            <span className="text-zinc-400">
              Güven Bandı: {hoveredForecast.lowerBound.toFixed(digits)} — {hoveredForecast.upperBound.toFixed(digits)}
            </span>
            <span className="text-emerald-400">Güven %{hoveredForecast.confidenceScore}</span>
          </div>
        ) : hoveredCandle ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-zinc-400">{hoveredCandle.timeStr}</span>
            <span>A: <strong className="text-zinc-200">{hoveredCandle.open.toFixed(digits)}</strong></span>
            <span>Y: <strong className="text-emerald-400">{hoveredCandle.high.toFixed(digits)}</strong></span>
            <span>D: <strong className="text-rose-400">{hoveredCandle.low.toFixed(digits)}</strong></span>
            <span>K: <strong className="text-white">{hoveredCandle.close.toFixed(digits)}</strong></span>
            <span className="text-cyan-400">EMA8: {hoveredCandle.ema8.toFixed(digits)}</span>
            <span className="text-amber-400">EMA21: {hoveredCandle.ema21.toFixed(digits)}</span>
            <span className="text-violet-400">EMA50: {hoveredCandle.ema50.toFixed(digits)}</span>
            <span className="text-zinc-300">RSI: {hoveredCandle.rsi14}</span>
            <span className="text-zinc-300">ADX: {hoveredCandle.adx14}</span>
          </div>
        ) : (
          <span className="text-zinc-500">Yükleniyor...</span>
        )}
        <span className="text-zinc-500">{data ? `${symbol} (${tf.toUpperCase()})` : ''}</span>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-900 rounded text-xs text-rose-300">
          Grafik alınamadı: {error}
        </div>
      )}

      {/* 4. ANA SVG MUM GRAFİĞİ + TAHMİN KONİSİ */}
      <div className="w-full bg-zinc-950 border border-zinc-800 rounded overflow-hidden select-none">
        {candles.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-xs text-zinc-500 font-mono">
            {loading ? `${symbol} profesyonel indikatör verileri ve tahmin konisi hesaplanıyor...` : 'Mum verisi bekleniyor.'}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${svgW} ${padT + priceH + 24}`}
            className="w-full h-64 sm:h-80 cursor-crosshair touch-none"
            onMouseLeave={() => setHoverSlot(null)}
          >
            {/* Tahmin Bölgesi Arka Plan Ayracı */}
            {showForecastCone && futureCount > 0 && (
              <>
                <rect
                  x={anchorX}
                  y={padT}
                  width={Math.max(0, svgW - padR - anchorX)}
                  height={priceH}
                  fill="#0ea5e9"
                  fillOpacity="0.035"
                />
                <line
                  x1={anchorX}
                  y1={padT}
                  x2={anchorX}
                  y2={padT + priceH}
                  stroke="#38bdf8"
                  strokeOpacity="0.45"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text x={anchorX + 6} y={padT + 11} fill="#38bdf8" fontSize="9" fontFamily="monospace" fontWeight="bold">
                  → İLERİ TAHMİN KONİSİ (+24S)
                </text>
              </>
            )}

            {/* Yatay Fiyat Kılavuzları */}
            {[0.15, 0.38, 0.62, 0.85].map((pct, idx) => {
              const y = padT + pct * priceH;
              const px = maxPrice - pct * priceRange;
              return (
                <g key={idx}>
                  <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#27272a" strokeDasharray="2 3" strokeWidth="1" />
                  <text x={svgW - padR + 5} y={y + 3} fill="#71717a" fontSize="9" fontFamily="monospace">
                    {px.toFixed(digits)}
                  </text>
                </g>
              );
            })}

            {/* Bollinger & Donchian Bantları */}
            {showBands && candles.length > 2 && (
              <>
                <polygon
                  points={[
                    ...candles.map((c, i) => `${getSlotX(i).toFixed(1)},${getPriceY(c.bbUpper).toFixed(1)}`),
                    ...candles.slice().reverse().map((c, ri) => {
                      const origI = candles.length - 1 - ri;
                      return `${getSlotX(origI).toFixed(1)},${getPriceY(c.bbLower).toFixed(1)}`;
                    }),
                  ].join(' ')}
                  fill="#94a3b8"
                  fillOpacity="0.06"
                />
                <polyline fill="none" stroke="#64748b" strokeOpacity="0.45" strokeWidth="1" points={polylineFor((c) => c.bbUpper)} />
                <polyline fill="none" stroke="#64748b" strokeOpacity="0.45" strokeWidth="1" points={polylineFor((c) => c.bbLower)} />
                <polyline fill="none" stroke="#38bdf8" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="3 3" points={polylineFor((c) => c.donHigh)} />
                <polyline fill="none" stroke="#f43f5e" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="3 3" points={polylineFor((c) => c.donLow)} />
              </>
            )}

            {/* Yatay Donchian Kırılım Tetikleyicileri (Aktif İşlem Yoksa Bot Giriş Rayları) */}
            {!activeTrade && showBands && forecast?.indicators && (
              <>
                <line
                  x1={padL}
                  y1={getPriceY(forecast.indicators.donchianHigh)}
                  x2={svgW - padR}
                  y2={getPriceY(forecast.indicators.donchianHigh)}
                  stroke="#10b981"
                  strokeOpacity="0.48"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={padL + 6}
                  y={getPriceY(forecast.indicators.donchianHigh) - 4}
                  fill="#10b981"
                  fontSize="8.5"
                  fontFamily="monospace"
                >
                  AL TETİK &gt; {forecast.indicators.donchianHigh.toFixed(digits)}
                </text>
                <line
                  x1={padL}
                  y1={getPriceY(forecast.indicators.donchianLow)}
                  x2={svgW - padR}
                  y2={getPriceY(forecast.indicators.donchianLow)}
                  stroke="#f43f5e"
                  strokeOpacity="0.48"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={padL + 6}
                  y={getPriceY(forecast.indicators.donchianLow) + 10}
                  fill="#f43f5e"
                  fontSize="8.5"
                  fontFamily="monospace"
                >
                  SAT TETİK &lt; {forecast.indicators.donchianLow.toFixed(digits)}
                </text>
              </>
            )}

            {/* Aktif Açık Pozisyon SL / Entry / TP1 / TP2 Çizgileri */}
            {activeTrade && (
              <>
                <line x1={padL} y1={getPriceY(activeTrade.entryPrice)} x2={svgW - padR} y2={getPriceY(activeTrade.entryPrice)} stroke="#e4e4e7" strokeWidth="1" strokeDasharray="4 2" />
                <line x1={padL} y1={getPriceY(activeTrade.stopLoss)} x2={svgW - padR} y2={getPriceY(activeTrade.stopLoss)} stroke="#f43f5e" strokeWidth="1.3" strokeDasharray="3 2" />
                <text x={padL + 6} y={getPriceY(activeTrade.stopLoss) - 4} fill="#f43f5e" fontSize="9" fontFamily="monospace" fontWeight="bold">
                  SL: {activeTrade.stopLoss.toFixed(digits)}
                </text>
                <line x1={padL} y1={getPriceY(activeTrade.takeProfit1)} x2={svgW - padR} y2={getPriceY(activeTrade.takeProfit1)} stroke="#10b981" strokeWidth="1.3" strokeDasharray="3 2" />
                <text x={padL + 6} y={getPriceY(activeTrade.takeProfit1) - 4} fill="#10b981" fontSize="9" fontFamily="monospace" fontWeight="bold">
                  TP1: {activeTrade.takeProfit1.toFixed(digits)}
                </text>
              </>
            )}

            {/* Japon Mumları (OHLC Candlesticks) */}
            {candles.map((c, i) => {
              const x = getSlotX(i);
              const isUp = c.close >= c.open;
              const col = isUp ? '#10b981' : '#f43f5e';
              const yHi = getPriceY(c.high);
              const yLo = getPriceY(c.low);
              const yO = getPriceY(c.open);
              const yC = getPriceY(c.close);
              const bodyTop = Math.min(yO, yC);
              const bodyH = Math.max(1.5, Math.abs(yO - yC));
              return (
                <g key={c.timestamp}>
                  <line x1={x} y1={yHi} x2={x} y2={yLo} stroke={col} strokeWidth="1" />
                  <rect
                    x={x - candleW / 2}
                    y={bodyTop}
                    width={candleW}
                    height={bodyH}
                    fill={col}
                    fillOpacity={isUp ? 0.85 : 0.9}
                    rx="0.5"
                  />
                </g>
              );
            })}

            {/* EMA 8 / 21 / 50 Şeridi */}
            {showEma && (
              <>
                <polyline fill="none" stroke="#22d3ee" strokeWidth="1.2" points={polylineFor((c) => c.ema8)} />
                <polyline fill="none" stroke="#f59e0b" strokeWidth="1.4" points={polylineFor((c) => c.ema21)} />
                <polyline fill="none" stroke="#a855f7" strokeWidth="1.4" points={polylineFor((c) => c.ema50)} />
              </>
            )}

            {/* +24 Saat İleriye Dönük Güven Tüneli ve Medyan Rota */}
            {showForecastCone && futureCount > 0 && (
              <>
                {conePolyPoints && <polygon points={conePolyPoints} fill={coneStroke} fillOpacity="0.14" />}
                {upperLinePoints && <polyline fill="none" stroke={coneStroke} strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3" points={upperLinePoints} />}
                {lowerLinePoints && <polyline fill="none" stroke={coneStroke} strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3" points={lowerLinePoints} />}
                {forecastLinePoints && <polyline fill="none" stroke={coneStroke} strokeWidth="2.2" points={forecastLinePoints} />}
                {[3, 11, hourlyPath.length - 1]
                  .filter((idx) => idx >= 0 && idx < hourlyPath.length)
                  .map((idx) => {
                    const p = hourlyPath[idx];
                    const cx = getSlotX(anchorIdx + 1 + idx);
                    const cy = getPriceY(p.predictedPrice);
                    return (
                      <g key={p.hour}>
                        <circle cx={cx} cy={cy} r="3.5" fill={coneStroke} stroke="#09090b" strokeWidth="1.5" />
                        <text x={cx} y={cy - 7} textAnchor="middle" fill={coneStroke} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
                          +{p.hour}s
                        </text>
                      </g>
                    );
                  })}
              </>
            )}

            {/* Canlı Fiyat İşaretçisi (Sağ Eksen Kutusu) */}
            {data?.currentPrice && (
              <g>
                <rect
                  x={svgW - padR + 2}
                  y={getPriceY(data.currentPrice) - 8}
                  width={padR - 4}
                  height={16}
                  rx="2"
                  fill={coneStroke}
                />
                <text
                  x={svgW - padR + 6}
                  y={getPriceY(data.currentPrice) + 3}
                  fill="#09090b"
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {data.currentPrice.toFixed(digits)}
                </text>
              </g>
            )}

            {/* Hover Dikey Çizgisi */}
            {hoverSlot && (
              <line
                x1={getSlotX(hoverSlot.kind === 'candle' ? hoverSlot.idx : anchorIdx + 1 + hoverSlot.idx)}
                y1={padT}
                x2={getSlotX(hoverSlot.kind === 'candle' ? hoverSlot.idx : anchorIdx + 1 + hoverSlot.idx)}
                y2={padT + priceH}
                stroke="#e4e4e7"
                strokeOpacity="0.5"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            )}

            {/* Zaman Etiketleri */}
            {candles.map((c, i) => {
              if (i % 16 !== 0) return null;
              return (
                <text key={c.timestamp} x={getSlotX(i)} y={padT + priceH + 14} textAnchor="middle" fill="#71717a" fontSize="8" fontFamily="monospace">
                  {c.timeStr.split(' ')[0]}
                </text>
              );
            })}
            {showForecastCone &&
              hourlyPath.map((p, i) => {
                if ((i + 1) % 6 !== 0) return null;
                return (
                  <text key={p.hour} x={getSlotX(anchorIdx + 1 + i)} y={padT + priceH + 14} textAnchor="middle" fill="#38bdf8" fontSize="8" fontFamily="monospace">
                    +{p.hour}s
                  </text>
                );
              })}

            {/* Hover Trigger Rectangles (Mumlar + Gelecek) */}
            {candles.map((c, i) => (
              <rect
                key={`hc-${c.timestamp}`}
                x={getSlotX(i) - stepX / 2}
                y={0}
                width={Math.max(3, stepX)}
                height={padT + priceH}
                fill="transparent"
                onMouseEnter={() => setHoverSlot({ kind: 'candle', idx: i })}
                onTouchStart={() => setHoverSlot({ kind: 'candle', idx: i })}
              />
            ))}
            {showForecastCone &&
              hourlyPath.map((p, i) => (
                <rect
                  key={`hf-${p.hour}`}
                  x={getSlotX(anchorIdx + 1 + i) - stepX / 2}
                  y={0}
                  width={Math.max(3, stepX)}
                  height={padT + priceH}
                  fill="transparent"
                  onMouseEnter={() => setHoverSlot({ kind: 'forecast', idx: i })}
                  onTouchStart={() => setHoverSlot({ kind: 'forecast', idx: i })}
                />
              ))}
          </svg>
        )}
      </div>

      {/* 5. SENKRONİZE ALT OSİLATÖR PANELLERİ (RVOL + RSI + MACD + ADX) */}
      {showOscillators && candles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-zinc-400">Senkronize Alt İndikatör Panelleri (Sol Bölge: Gerçek Mumlarla Hizalı)</span>
            <div className="flex items-center space-x-1">
              {(['ALL', 'RSI', 'MACD', 'ADX'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setOscTab(t)}
                  className={`px-2 py-0.5 rounded border ${
                    oscTab === t ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  }`}
                >
                  {t === 'ALL' ? 'Tümü' : t}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
            {/* RSI(14) Paneli */}
            {(oscTab === 'ALL' || oscTab === 'RSI') && (
              <div className="border-b border-zinc-800/80 px-2 pt-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span>Wilder RSI (14) — Aşırı Alım 70 / Satım 30</span>
                  <span className="text-white font-semibold">{hoveredCandle?.rsi14 ?? '-'}</span>
                </div>
                <svg viewBox={`0 0 ${svgW} 56`} className="w-full h-14">
                  <line x1={padL} y1={56 - (70 / 100) * 48 - 4} x2={anchorX} y2={56 - (70 / 100) * 48 - 4} stroke="#f43f5e" strokeOpacity="0.35" strokeDasharray="2 2" />
                  <line x1={padL} y1={56 - (50 / 100) * 48 - 4} x2={anchorX} y2={56 - (50 / 100) * 48 - 4} stroke="#52525b" strokeOpacity="0.4" strokeDasharray="2 2" />
                  <line x1={padL} y1={56 - (30 / 100) * 48 - 4} x2={anchorX} y2={56 - (30 / 100) * 48 - 4} stroke="#10b981" strokeOpacity="0.35" strokeDasharray="2 2" />
                  <polyline
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    points={candles.map((c, i) => `${getSlotX(i).toFixed(1)},${(56 - (c.rsi14 / 100) * 48 - 4).toFixed(1)}`).join(' ')}
                  />
                </svg>
              </div>
            )}

            {/* MACD(12,26,9) & Volume Paneli */}
            {(oscTab === 'ALL' || oscTab === 'MACD') && (
              <div className="border-b border-zinc-800/80 px-2 pt-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span>MACD (12,26,9) & Bağıl Hacim (RVOL)</span>
                  <span className="text-zinc-200">
                    Hist: {hoveredCandle?.macdHist ?? 0} · RVOL: {hoveredCandle?.rvol ?? 1}x
                  </span>
                </div>
                <svg viewBox={`0 0 ${svgW} 64`} className="w-full h-16">
                  {/* Volume bars subtle background */}
                  {candles.map((c, i) => {
                    const vh = maxVol > 0 ? ((c.volume || 0) / maxVol) * 20 : 0;
                    return (
                      <rect
                        key={`v-${c.timestamp}`}
                        x={getSlotX(i) - candleW / 2}
                        y={62 - vh}
                        width={candleW}
                        height={vh}
                        fill={c.close >= c.open ? '#10b981' : '#f43f5e'}
                        fillOpacity="0.18"
                      />
                    );
                  })}
                  <line x1={padL} y1={32} x2={anchorX} y2={32} stroke="#3f3f46" strokeWidth="1" />
                  {candles.map((c, i) => {
                    const h = (c.macdHist / maxMacdAbs) * 26;
                    return (
                      <rect
                        key={`m-${c.timestamp}`}
                        x={getSlotX(i) - candleW / 2}
                        y={h >= 0 ? 32 - h : 32}
                        width={candleW}
                        height={Math.max(1, Math.abs(h))}
                        fill={h >= 0 ? '#10b981' : '#f43f5e'}
                        fillOpacity="0.75"
                      />
                    );
                  })}
                  <polyline
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.1"
                    points={candles.map((c, i) => `${getSlotX(i).toFixed(1)},${(32 - (c.macdLine / maxMacdAbs) * 26).toFixed(1)}`).join(' ')}
                  />
                  <polyline
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="1.1"
                    points={candles.map((c, i) => `${getSlotX(i).toFixed(1)},${(32 - (c.macdSignal / maxMacdAbs) * 26).toFixed(1)}`).join(' ')}
                  />
                </svg>
              </div>
            )}

            {/* ADX(14) & +DI/-DI Trend Gücü Paneli */}
            {(oscTab === 'ALL' || oscTab === 'ADX') && (
              <div className="px-2 pt-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span>ADX(14) Trend Gücü (Eşik 20) & +DI / -DI Yön Basıncı</span>
                  <span className="text-zinc-200">
                    ADX: {hoveredCandle?.adx14 ?? 18} · +DI: <span className="text-emerald-400">{hoveredCandle?.pdi14 ?? 20}</span> · -DI: <span className="text-rose-400">{hoveredCandle?.ndi14 ?? 20}</span>
                  </span>
                </div>
                <svg viewBox={`0 0 ${svgW} 56`} className="w-full h-14">
                  <line x1={padL} y1={52 - (20 / 60) * 44} x2={anchorX} y2={52 - (20 / 60) * 44} stroke="#eab308" strokeOpacity="0.45" strokeDasharray="3 2" />
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeOpacity="0.7"
                    strokeWidth="1"
                    points={candles.map((c, i) => `${getSlotX(i).toFixed(1)},${(52 - (Math.min(60, c.pdi14) / 60) * 44).toFixed(1)}`).join(' ')}
                  />
                  <polyline
                    fill="none"
                    stroke="#f43f5e"
                    strokeOpacity="0.7"
                    strokeWidth="1"
                    points={candles.map((c, i) => `${getSlotX(i).toFixed(1)},${(52 - (Math.min(60, c.ndi14) / 60) * 44).toFixed(1)}`).join(' ')}
                  />
                  <polyline
                    fill="none"
                    stroke="#e4e4e7"
                    strokeWidth="1.6"
                    points={candles.map((c, i) => `${getSlotX(i).toFixed(1)},${(52 - (Math.min(60, c.adx14) / 60) * 44).toFixed(1)}`).join(' ')}
                  />
                </svg>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lejant Alt Bilgi */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-800/70">
        <div className="flex flex-wrap items-center gap-3">
          <span><span className="inline-block w-2 h-0.5 bg-cyan-400 mr-1 align-middle" />EMA8</span>
          <span><span className="inline-block w-2 h-0.5 bg-amber-400 mr-1 align-middle" />EMA21</span>
          <span><span className="inline-block w-2 h-0.5 bg-violet-400 mr-1 align-middle" />EMA50</span>
          <span><span className="inline-block w-2 h-0.5 bg-slate-400 mr-1 align-middle" />Bollinger(20,2)</span>
          <span><span className="inline-block w-2 h-0.5 bg-sky-400 mr-1 align-middle" />Donchian / İleri Tahmin Tüneli</span>
        </div>
        <span>Walk-Forward Doğrulamalı İki Zaman Ölçekli Motor (v6.0)</span>
      </div>
    </div>
  );
};

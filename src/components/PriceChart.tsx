import React, { useState, useMemo } from 'react';
import { Candle, TradeSignal, TechnicalIndicators } from '../types';

interface PriceChartProps {
  candles: Candle[];
  signal: TradeSignal;
  technicals: TechnicalIndicators;
  symbol: string;
  digits: number;
}

export const PriceChart: React.FC<PriceChartProps> = ({ candles, signal, technicals, symbol, digits }) => {
  const [timeframe, setTimeframe] = useState<'1Y' | '6M' | '3M' | '1M'>('1Y');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const filteredCandles = useMemo(() => {
    switch (timeframe) {
      case '1M':
        return candles.slice(-30);
      case '3M':
        return candles.slice(-90);
      case '6M':
        return candles.slice(-180);
      case '1Y':
      default:
        return candles;
    }
  }, [candles, timeframe]);

  const minPrice = useMemo(() => {
    const rawMin = Math.min(...filteredCandles.map((c) => c.low));
    let m = Math.min(rawMin, signal.stopLoss * 0.998);
    if (signal.keyLevels?.nextSupport) {
      m = Math.min(m, signal.keyLevels.nextSupport * 0.995);
    }
    return m;
  }, [filteredCandles, signal.stopLoss, signal.keyLevels]);

  const maxPrice = useMemo(() => {
    const rawMax = Math.max(...filteredCandles.map((c) => c.high));
    return Math.max(rawMax, signal.takeProfit2 * 1.002, signal.takeProfit * 1.002);
  }, [filteredCandles, signal.takeProfit2, signal.takeProfit]);

  const priceRange = maxPrice - minPrice || 0.001;
  const svgWidth = 800;
  const svgHeight = 280;
  const paddingBottom = 30;
  const paddingTop = 20;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const getY = (val: number) => {
    const ratio = (val - minPrice) / priceRange;
    return svgHeight - paddingBottom - ratio * chartHeight;
  };

  const getX = (index: number) => {
    return (index / (filteredCandles.length - 1)) * (svgWidth - 60) + 15;
  };

  const linePoints = useMemo(() => {
    return filteredCandles
      .map((c, i) => `${getX(i).toFixed(1)},${getY(c.close).toFixed(1)}`)
      .join(' ');
  }, [filteredCandles, minPrice, maxPrice]);

  const activeCandle = hoverIndex !== null && filteredCandles[hoverIndex] ? filteredCandles[hoverIndex] : filteredCandles[filteredCandles.length - 1];

  const handleTouch = (e: React.TouchEvent<SVGSVGElement>) => {
    if (!e.touches || e.touches.length === 0 || filteredCandles.length === 0) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = touch.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clientX / rect.width));
    const targetIndex = Math.round(ratio * (filteredCandles.length - 1));
    setHoverIndex(targetIndex);
  };

  return (
    <div className="border border-zinc-800 bg-zinc-900 rounded p-3 sm:p-4 space-y-3">
      {/* Title & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-white">Fiyat Grafiği & Hedef Seviyeler</h3>
          <span className="text-xs text-zinc-400 font-mono">
            {symbol} — Son Kapanış: <strong className="text-white">{activeCandle?.close.toFixed(digits)}</strong> ({activeCandle?.dateStr})
          </span>
        </div>

        <div className="flex items-center space-x-1 text-xs">
          {(['1M', '3M', '6M', '1Y'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2 sm:px-2.5 py-1 rounded border transition-colors ${
                timeframe === tf
                  ? 'bg-zinc-800 text-white font-medium border-zinc-700'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              {tf === '1M' ? '1 Ay' : tf === '3M' ? '3 Ay' : tf === '6M' ? '6 Ay' : '1 Yıl'}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="w-full bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-52 sm:h-64 select-none touch-none"
          onMouseLeave={() => setHoverIndex(null)}
          onTouchStart={handleTouch}
          onTouchMove={handleTouch}
          onTouchEnd={() => setHoverIndex(null)}
        >
          {/* Subtle Horizontal grid lines */}
          {[0.25, 0.5, 0.75].map((pct, idx) => {
            const y = paddingTop + chartHeight * pct;
            const price = maxPrice - pct * priceRange;
            return (
              <g key={idx}>
                <line x1="15" y1={y} x2={svgWidth - 45} y2={y} stroke="#27272a" strokeDasharray="2 2" />
                <text x={svgWidth - 40} y={y + 3} fill="#71717a" fontSize="9" fontFamily="monospace">
                  {price.toFixed(digits)}
                </text>
              </g>
            );
          })}

          {/* Destek Seviyesi */}
          {signal.keyLevels && (
            <>
              <line
                x1="15"
                y1={getY(signal.keyLevels.support)}
                x2={svgWidth - 45}
                y2={getY(signal.keyLevels.support)}
                stroke="#94a3b8"
                strokeWidth="1.2"
                strokeDasharray="4 2"
              />
              <text
                x="20"
                y={getY(signal.keyLevels.support) - 5}
                fill="#94a3b8"
                fontSize="9"
                fontFamily="monospace"
              >
                Destek: {signal.keyLevels.support.toFixed(digits)}
              </text>

              {/* Alt Destek (Kırılım Tabanı) */}
              <line
                x1="15"
                y1={getY(signal.keyLevels.nextSupport)}
                x2={svgWidth - 45}
                y2={getY(signal.keyLevels.nextSupport)}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x="20"
                y={getY(signal.keyLevels.nextSupport) - 5}
                fill="#64748b"
                fontSize="9"
                fontFamily="monospace"
              >
                Alt Destek: {signal.keyLevels.nextSupport.toFixed(digits)}
              </text>
            </>
          )}

          {/* Fiyat Çizgisi */}
          <polyline fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinejoin="round" points={linePoints} />

          {/* Giriş Seviyesi */}
          <line
            x1="15"
            y1={getY(signal.entryPrice)}
            x2={svgWidth - 45}
            y2={getY(signal.entryPrice)}
            stroke="#94a3b8"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <text
            x={svgWidth - 95}
            y={getY(signal.entryPrice) - 4}
            fill="#a1a1aa"
            fontSize="9"
            fontFamily="monospace"
          >
            Giriş: {signal.entryPrice.toFixed(digits)}
          </text>

          {/* TP Line & Label */}
          <line
            x1="15"
            y1={getY(signal.takeProfit)}
            x2={svgWidth - 45}
            y2={getY(signal.takeProfit)}
            stroke="#10b981"
            strokeWidth="1.2"
            strokeDasharray="3 3"
          />
          <text
            x={svgWidth - 95}
            y={getY(signal.takeProfit) - 4}
            fill="#10b981"
            fontSize="9"
            fontFamily="monospace"
            fontWeight="bold"
          >
            TP: {signal.takeProfit.toFixed(digits)}
          </text>

          {/* SL Line & Label */}
          <line
            x1="15"
            y1={getY(signal.stopLoss)}
            x2={svgWidth - 45}
            y2={getY(signal.stopLoss)}
            stroke="#f43f5e"
            strokeWidth="1.2"
            strokeDasharray="3 3"
          />
          <text
            x={svgWidth - 95}
            y={getY(signal.stopLoss) - 4}
            fill="#f43f5e"
            fontSize="9"
            fontFamily="monospace"
            fontWeight="bold"
          >
            SL: {signal.stopLoss.toFixed(digits)}
          </text>

          {/* Hover detector columns */}
          {filteredCandles.map((_c, i) => {
            const x = getX(i);
            const w = (svgWidth - 60) / filteredCandles.length;
            return (
              <rect
                key={i}
                x={x - w / 2}
                y={0}
                width={Math.max(w, 2)}
                height={svgHeight}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIndex(i)}
              />
            );
          })}

          {hoverIndex !== null && (
            <circle
              cx={getX(hoverIndex)}
              cy={getY(filteredCandles[hoverIndex].close)}
              r="3.5"
              fill="#38bdf8"
            />
          )}
        </svg>
      </div>

      {/* Footer stats */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-zinc-500 font-mono pt-2 border-t border-zinc-800">
        <div className="flex flex-wrap items-center gap-3">
          {signal.keyLevels && (
            <span className="flex items-center gap-1.5 text-zinc-300">
              <span className="w-2.5 h-0.5 bg-slate-400 inline-block"></span>
              <span>Destek: <strong>{signal.keyLevels.support.toFixed(digits)}</strong></span>
            </span>
          )}
          <span>EMA 20: <strong className="text-zinc-300">{technicals.ema20.toFixed(digits)}</strong></span>
          <span>EMA 50: <strong className="text-zinc-300">{technicals.ema50.toFixed(digits)}</strong></span>
          <span>EMA 200: <strong className="text-zinc-300">{technicals.ema200.toFixed(digits)}</strong></span>
        </div>
        <div>
          Trend: <span className="text-zinc-200 font-medium">{technicals.trend}</span>
        </div>
      </div>
    </div>
  );
};

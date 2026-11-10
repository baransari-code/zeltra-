import React from 'react';
import { TechnicalIndicators, Asset, Candle } from '../types';

interface TechnicalMatrixProps {
  technicals: TechnicalIndicators;
  asset: Asset;
  candles: Candle[];
}

export const TechnicalMatrix: React.FC<TechnicalMatrixProps> = ({ technicals, asset, candles }) => {
  const yearLows = Math.min(...candles.map((c) => c.low));
  const yearHighs = Math.max(...candles.map((c) => c.high));

  return (
    <div className="border border-zinc-800 bg-zinc-900 rounded p-4">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
        <h3 className="text-sm font-bold text-white">Teknik Göstergeler & 1 Yıllık İstatistik</h3>
        <span className="text-xs text-zinc-400 font-mono">{technicals.trend}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {/* RSI */}
        <div className="border border-zinc-800 bg-zinc-950 p-3 rounded">
          <div className="text-zinc-500 mb-1">RSI (14 Periyot)</div>
          <div className="font-mono text-base font-semibold text-white">{technicals.rsi}</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {technicals.rsi < 35 ? 'Aşırı satım' : technicals.rsi > 65 ? 'Aşırı alım' : 'Dengeli bölge'}
          </div>
        </div>

        {/* ATR */}
        <div className="border border-zinc-800 bg-zinc-950 p-3 rounded">
          <div className="text-zinc-500 mb-1">ATR (Volatilite)</div>
          <div className="font-mono text-base font-semibold text-white">{technicals.atr.toFixed(asset.digits)}</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {asset.digits === 4 ? `${(technicals.atr * 10000).toFixed(1)} Pip ortalama` : `${technicals.atr.toFixed(2)} birim`}
          </div>
        </div>

        {/* Bollinger */}
        <div className="border border-zinc-800 bg-zinc-950 p-3 rounded">
          <div className="text-zinc-500 mb-1">Bollinger (20, 2)</div>
          <div className="font-mono text-xs text-zinc-300 space-y-0.5">
            <div>Üst: {technicals.bollinger.upper.toFixed(asset.digits)}</div>
            <div>Orta: {technicals.bollinger.middle.toFixed(asset.digits)}</div>
            <div>Alt: {technicals.bollinger.lower.toFixed(asset.digits)}</div>
          </div>
        </div>

        {/* 1 Year Range */}
        <div className="border border-zinc-800 bg-zinc-950 p-3 rounded">
          <div className="text-zinc-500 mb-1">52 Haftalık Aralık</div>
          <div className="font-mono text-xs text-zinc-300 space-y-0.5">
            <div>En Düşük: <span className="text-rose-400">{yearLows.toFixed(asset.digits)}</span></div>
            <div>En Yüksek: <span className="text-emerald-400">{yearHighs.toFixed(asset.digits)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

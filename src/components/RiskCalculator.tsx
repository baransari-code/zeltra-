import React, { useState } from 'react';
import { TradeSignal, Asset } from '../types';

interface RiskCalculatorProps {
  currentSignal: TradeSignal;
  asset: Asset;
}

export const RiskCalculator: React.FC<RiskCalculatorProps> = ({ currentSignal, asset }) => {
  const [balance, setBalance] = useState<number>(10000);
  const [riskPercent, setRiskPercent] = useState<number>(1.5);
  const [entry, setEntry] = useState<number>(currentSignal.entryPrice);
  const [stopLoss, setStopLoss] = useState<number>(currentSignal.stopLoss);
  const [takeProfit, setTakeProfit] = useState<number>(currentSignal.takeProfit);

  const handleLoadSignal = () => {
    setEntry(currentSignal.entryPrice);
    setStopLoss(currentSignal.stopLoss);
    setTakeProfit(currentSignal.takeProfit);
  };

  const riskAmount = (balance * riskPercent) / 100;
  const priceRiskDiff = Math.abs(entry - stopLoss) || 0.0001;
  const priceRewardDiff = Math.abs(takeProfit - entry);

  let calculatedLots = 0.1;
  const isForex = asset.category === 'MAJOR_FX' || asset.category === 'MINOR_FX' || asset.category === 'EXOTIC_FX';
  if (isForex) {
    const pipDifference = priceRiskDiff * (asset.digits === 4 ? 10000 : 100);
    const pipValuePerLot = 10;
    calculatedLots = +(riskAmount / (pipDifference * pipValuePerLot || 1)).toFixed(2);
  } else {
    const pointDifference = priceRiskDiff;
    calculatedLots = +(riskAmount / (pointDifference * 100 || 1)).toFixed(2);
  }

  const safeLot = Math.max(0.01, calculatedLots);
  const rewardAmount = +(riskAmount * (priceRewardDiff / priceRiskDiff)).toFixed(2);

  return (
    <div className="border border-zinc-800 bg-zinc-900 rounded p-4 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white">Risk & Lot Büyüklüğü Hesaplayıcı</h2>
          <span className="text-xs text-zinc-400">Kasayı korumak için önerilen pozisyon büyüklüğü</span>
        </div>

        <button
          onClick={handleLoadSignal}
          className="text-xs px-2.5 py-1 rounded border border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
        >
          {asset.symbol} Sinyal Değerlerini Yükle
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Inputs */}
        <div className="space-y-3 text-xs">
          <div>
            <label className="text-zinc-400 block mb-1">Hesap Bakiyesi ($ USD)</label>
            <input
              type="number"
              value={balance}
              onChange={(e) => setBalance(Math.max(100, Number(e.target.value)))}
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1.5 text-white font-mono"
            />
          </div>

          <div>
            <label className="text-zinc-400 block mb-1">Risk Oranı (%)</label>
            <input
              type="number"
              step="0.5"
              value={riskPercent}
              onChange={(e) => setRiskPercent(Math.max(0.1, Number(e.target.value)))}
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1.5 text-white font-mono"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-zinc-400 block mb-1">Giriş</label>
              <input
                type="number"
                step="0.0001"
                value={entry}
                onChange={(e) => setEntry(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-rose-400 block mb-1">Stop Loss</label>
              <input
                type="number"
                step="0.0001"
                value={stopLoss}
                onChange={(e) => setStopLoss(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-rose-300 font-mono"
              />
            </div>
            <div>
              <label className="text-emerald-400 block mb-1">Take Profit</label>
              <input
                type="number"
                step="0.0001"
                value={takeProfit}
                onChange={(e) => setTakeProfit(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-emerald-300 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="border border-zinc-800 bg-zinc-950 p-4 rounded flex flex-col justify-between text-xs font-mono">
          <div className="space-y-3">
            <div className="border-b border-zinc-800 pb-2">
              <div className="text-zinc-500 font-sans">Önerilen Güvenli Pozisyon Boyutu</div>
              <div className="text-2xl font-bold text-white mt-1">{safeLot} LOT</div>
              <div className="text-zinc-400 text-[11px] mt-0.5">Enstrüman: {asset.symbol}</div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-zinc-400">
                <span>Maksimum Risk Tutarı:</span>
                <span className="text-rose-400 font-semibold">-${riskAmount.toFixed(2)} (%{riskPercent})</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Hedeflenen Net Kâr:</span>
                <span className="text-emerald-400 font-semibold">+${rewardAmount}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Risk / Kazanç Oranı:</span>
                <span className="text-white font-semibold">1 : {+(priceRewardDiff / priceRiskDiff).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-zinc-500 font-sans pt-3 border-t border-zinc-800">
            Kural: Sermayeyi korumak için tek işlemde bakiye riskini %1-%2 aralığında tutunuz.
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Calculator, RefreshCw } from 'lucide-react';

interface RiskCalculatorProps {
  symbol: string;
  liveUsdTry: number;
  onSelectSymbol?: (sym: string) => void;
}

const SYMBOLS = [
  'XAU/USD', 'XAG/USD', 'COPPER', 'NAS100', 'SPX500', 'US30',
  'NVDA', 'AAPL', 'MSFT', 'WTI', 'BRENT',
  'EUR/USD', 'USD/JPY', 'GBP/USD', 'BTC/USD', 'ETH/USD', 'SOL/USD',
];

export const RiskCalculator: React.FC<RiskCalculatorProps> = ({
  symbol,
  liveUsdTry,
  onSelectSymbol,
}) => {
  const [capitalTRY, setCapitalTRY] = useState<number>(250000);
  const [riskPercent, setRiskPercent] = useState<number>(1.5);
  const [entry, setEntry] = useState<number>(0);
  const [stopLoss, setStopLoss] = useState<number>(0);
  const [takeProfit, setTakeProfit] = useState<number>(0);
  const [digits, setDigits] = useState<number>(2);
  const [podNote, setPodNote] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const loadFromZac = async (sym: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pro-chart?symbol=${encodeURIComponent(sym)}&tf=1h`);
      if (!res.ok) return;
      const json = await res.json();
      const setup = json?.zacSnapshot?.activeSetup;
      if (setup) {
        setDigits(json.digits ?? 2);
        setEntry(setup.entryPrice);
        setStopLoss(setup.stopLoss);
        setTakeProfit(setup.takeProfit > 0 ? setup.takeProfit : +(setup.entryPrice + Math.abs(setup.entryPrice - setup.stopLoss) * 2).toFixed(json.digits ?? 2));
        setPodNote(`${setup.podLabelTR} • ZAC Skor: ${json.zacSnapshot.zacScore}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFromZac(symbol);
  }, [symbol]);

  const usdTry = liveUsdTry > 5 ? liveUsdTry : 42.5;
  const riskTRY = (capitalTRY * riskPercent) / 100;
  const slDist = Math.abs(entry - stopLoss);
  const tpDist = Math.abs(takeProfit - entry);
  const rr = slDist > 0 ? tpDist / slDist : 0;
  const q2u = symbol === 'USD/JPY' ? 1 / (entry || 155) : 1;
  const unitRiskTRY = slDist * q2u * usdTry;
  const recommendedUnits = unitRiskTRY > 0 ? riskTRY / unitRiskTRY : 0;
  const notionalTRY = recommendedUnits * entry * q2u * usdTry;
  const effectiveLev = capitalTRY > 0 ? notionalTRY / capitalTRY : 0;
  const expectedProfitTRY = riskTRY * rr;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Calculator className="w-4 h-4 text-cyan-400" />
            Kurumsal Volatilite-Hedefli Risk & Pozisyon Hesaplayıcı (TL / IBKR)
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            ZELTRA v14.0 canlı ATR & Stop-Loss seviyeleriyle birebir senkron pozisyon boyutlandırması (USD/TRY: {usdTry.toFixed(2)})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={symbol}
            onChange={(e) => onSelectSymbol?.(e.target.value)}
            className="bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1.5 text-xs font-mono text-white"
          >
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={() => loadFromZac(symbol)}
            disabled={loading}
            className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            ZAC Seviyelerini Çek
          </button>
        </div>
      </div>

      {podNote && (
        <div className="text-xs font-mono text-cyan-300 bg-cyan-950/30 border border-cyan-800/40 rounded px-3 py-2 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{symbol} — {podNote}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 font-mono text-xs">
        <div>
          <label className="block text-[11px] text-zinc-400 mb-1">Portföy Sermayesi (TL)</label>
          <input
            type="number"
            value={capitalTRY}
            onChange={(e) => setCapitalTRY(Number(e.target.value) || 0)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-white"
          />
        </div>
        <div>
          <label className="block text-[11px] text-zinc-400 mb-1">İşlem Riski (% — Öneri %1.2–1.5)</label>
          <input
            type="number"
            step="0.1"
            value={riskPercent}
            onChange={(e) => setRiskPercent(Number(e.target.value) || 0)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-white"
          />
        </div>
        <div>
          <label className="block text-[11px] text-zinc-400 mb-1">Giriş Fiyatı</label>
          <input
            type="number"
            step="any"
            value={entry}
            onChange={(e) => setEntry(Number(e.target.value) || 0)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-white"
          />
        </div>
        <div>
          <label className="block text-[11px] text-rose-400 mb-1">Stop-Loss</label>
          <input
            type="number"
            step="any"
            value={stopLoss}
            onChange={(e) => setStopLoss(Number(e.target.value) || 0)}
            className="w-full bg-zinc-950 border border-rose-800/70 rounded px-3 py-2 text-rose-300"
          />
        </div>
        <div>
          <label className="block text-[11px] text-emerald-400 mb-1">Hedef (TP)</label>
          <input
            type="number"
            step="any"
            value={takeProfit}
            onChange={(e) => setTakeProfit(Number(e.target.value) || 0)}
            className="w-full bg-zinc-950 border border-emerald-800/70 rounded px-3 py-2 text-emerald-300"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 font-mono pt-2">
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-[10px] text-zinc-500 uppercase">Önerilen Birim Adedi</div>
          <div className="text-lg font-bold text-white mt-1">
            {recommendedUnits.toFixed(digits >= 3 ? 2 : 4)}
          </div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-[10px] text-zinc-500 uppercase">Pozisyon Büyüklüğü</div>
          <div className="text-lg font-bold text-cyan-300 mt-1">
            {Math.round(notionalTRY).toLocaleString('tr-TR')} TL
          </div>
          <div className="text-[10px] text-zinc-500">Efektif: {effectiveLev.toFixed(2)}x</div>
        </div>
        <div className="bg-zinc-950 border border-rose-900/40 rounded p-3">
          <div className="text-[10px] text-rose-400 uppercase">Maksimum Zarar (1R)</div>
          <div className="text-lg font-bold text-rose-400 mt-1">
            -{Math.round(riskTRY).toLocaleString('tr-TR')} TL
          </div>
        </div>
        <div className="bg-zinc-950 border border-emerald-900/40 rounded p-3">
          <div className="text-[10px] text-emerald-400 uppercase">Beklenen Kâr (TP)</div>
          <div className="text-lg font-bold text-emerald-400 mt-1">
            +{Math.round(expectedProfitTRY).toLocaleString('tr-TR')} TL
          </div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-[10px] text-zinc-500 uppercase">Risk / Ödül (R:R)</div>
          <div className="text-lg font-bold text-white mt-1">1 : {rr.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
};

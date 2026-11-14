// src/components/AutonomousTestView.tsx — /test 250.000 TL Otonom Canlı Piyasa İşlem & Kayıt Terminali
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Play, Pause, RotateCcw } from 'lucide-react';

interface AutonomousTrade {
  id: string;
  symbol: string;
  name: string;
  digits: number;
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  status: 'ACIK' | 'TP2_TAM_HEDEF' | 'TP1_VE_BASABAS' | 'STOP_LOSS' | 'MANUEL_KAPANDI';
  entryTime: string;
  entryTimestamp: number;
  closeTime?: string;
  closeTimestamp?: number;
  entryPrice: number;
  currentPrice: number;
  closePrice?: number;
  takeProfit1: number;
  takeProfit2: number;
  stopLoss: number;
  initialStopLoss: number;
  allocatedCapitalTRY: number;
  riskAmountTRY: number;
  positionSizeUnits: number;
  tp1Hit: boolean;
  breakevenActive: boolean;
  realizedPnL_TRY: number;
  unrealizedPnL_TRY: number;
  totalPnL_TRY: number;
  totalPnL_Percent: number;
  rationale: string;
  exitReason?: string;
}

interface EquityPoint {
  timestamp: number;
  timeStr: string;
  equityTRY: number;
  cashTRY: number;
}

interface ActivityLogItem {
  id: string;
  timestamp: string;
  type: 'ENTRY' | 'TP1_PARTIAL' | 'TP2_FULL' | 'STOP_LOSS' | 'BREAKEVEN_EXIT' | 'SYSTEM';
  symbol: string;
  message: string;
  pnlImpactTRY?: number;
}

interface AutonomousLedgerState {
  botId: string;
  isRunning: boolean;
  startedAt: string;
  lastTickAt: string;
  liveUsdTry: number;
  initialCapitalTRY: number;
  cashBalanceTRY: number;
  allocatedMarginTRY: number;
  availableCashTRY: number;
  openFloatingPnL_TRY: number;
  totalEquityTRY: number;
  netProfitTRY: number;
  netProfitPercent: number;
  metrics: {
    totalClosedTrades: number;
    openPositionsCount: number;
    winningTrades: number;
    losingTrades: number;
    winRatePercent: number;
    grossProfitTRY: number;
    grossLossTRY: number;
    profitFactor: number;
    maxDrawdownPercent: number;
    peakEquityTRY: number;
  };
  openPositions: AutonomousTrade[];
  closedTrades: AutonomousTrade[];
  equityCurve: EquityPoint[];
  activityLog: ActivityLogItem[];
}

export const AutonomousTestView: React.FC = () => {
  const [ledger, setLedger] = useState<AutonomousLedgerState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);

  const fetchLedger = useCallback(async (action: string = 'status') => {
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/autonomous-test?action=${action}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.initialCapitalTRY) {
          setLedger(data);
        }
      }
    } catch (err) {
      console.error('Otonom kütük alınamadı:', err);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchLedger('status');
    const timer = setInterval(() => fetchLedger('status'), 45000);
    return () => clearInterval(timer);
  }, [fetchLedger]);

  const handleToggleRunning = async () => {
    if (!ledger) return;
    setIsSyncing(true);
    try {
      const nextState = !ledger.isRunning;
      const res = await fetch(`/api/autonomous-test?action=toggle&running=${nextState}`);
      if (res.ok) {
        const data = await res.json();
        setLedger(data);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReset = async () => {
    setIsSyncing(true);
    setConfirmReset(false);
    try {
      const res = await fetch('/api/autonomous-test?action=reset');
      if (res.ok) {
        const data = await res.json();
        setLedger(data);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const formatTRY = (val: number) => {
    return val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
  };

  const formatDateTR = (iso?: string) => {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  // Kasa Eğrisi SVG Koordinatları
  const svgW = 800;
  const svgH = 210;
  const padL = 20;
  const padR = 75;
  const padT = 24;
  const padB = 32;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;

  const curvePoints = useMemo(() => {
    if (!ledger || !ledger.equityCurve || ledger.equityCurve.length === 0) return [];
    return ledger.equityCurve;
  }, [ledger]);

  const { minEq, maxEq } = useMemo(() => {
    if (curvePoints.length === 0) return { minEq: 245000, maxEq: 260000 };
    const vals = curvePoints.map((p) => p.equityTRY);
    vals.push(250000);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const margin = Math.max((max - min) * 0.15, 1500);
    return { minEq: min - margin, maxEq: max + margin };
  }, [curvePoints]);

  const eqRange = maxEq - minEq || 1;

  const getX = useCallback(
    (idx: number) => padL + (idx / Math.max(1, curvePoints.length - 1)) * chartW,
    [curvePoints.length, chartW]
  );

  const getY = useCallback(
    (val: number) => svgH - padB - ((val - minEq) / eqRange) * chartH,
    [minEq, eqRange, chartH, svgH]
  );

  const polylineStr = useMemo(() => {
    return curvePoints.map((p, i) => `${getX(i).toFixed(1)},${getY(p.equityTRY).toFixed(1)}`).join(' ');
  }, [curvePoints, getX, getY]);

  const handleTouch = (e: React.TouchEvent<SVGSVGElement>) => {
    if (!e.touches || e.touches.length === 0 || curvePoints.length === 0) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    setHoverIdx(Math.round(ratio * (curvePoints.length - 1)));
  };

  if (isLoading || !ledger) {
    return (
      <div className="border border-zinc-800 bg-zinc-900 rounded p-8 text-center text-xs text-zinc-400 font-mono">
        250.000 TL Otonom Piyasa İşlem Kütüğü ve Canlı Borsa Pozisyonları Yükleniyor...
      </div>
    );
  }

  const activeCurvePoint = hoverIdx !== null && curvePoints[hoverIdx]
    ? curvePoints[hoverIdx]
    : curvePoints[curvePoints.length - 1];

  const isProfitable = ledger.netProfitTRY >= 0;

  return (
    <div className="space-y-4">
      {/* 1. ÜST KOKPİT & KONTROL PANELİ */}
      <div className="border border-zinc-800 bg-zinc-900 rounded p-3 sm:p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                Otonom Portföy & Gerçek Piyasa İşlem Kütüğü (/test)
              </h2>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                  ledger.isRunning
                    ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800'
                    : 'bg-amber-950/50 text-amber-400 border-amber-800'
                }`}
              >
                {ledger.isRunning ? 'OTONOM MOD: AKTİF (7/24)' : 'OTONOM MOD: DURAKLATILDI'}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              250.000 TL başlangıç sermayesi ile canlı Yahoo Finance fiyatları üzerinden sıfır insan müdahalesiyle yürütülen gerçek zamanlı işlem kaydı.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono shrink-0">
            <button
              onClick={() => fetchLedger('tick')}
              disabled={isSyncing}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Şimdi Tara & Güncelle</span>
            </button>

            <button
              onClick={handleToggleRunning}
              disabled={isSyncing}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded border transition-colors ${
                ledger.isRunning
                  ? 'border-zinc-700 bg-zinc-950 text-zinc-300 hover:text-white'
                  : 'border-emerald-800 bg-emerald-950/60 text-emerald-300 hover:text-white'
              }`}
            >
              {ledger.isRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Duraklat</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Devam Ettir</span>
                </>
              )}
            </button>

            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-rose-400 transition-colors"
                title="Kütüğü yeniden oluştur"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Yenile</span>
              </button>
            ) : (
              <div className="flex items-center space-x-1 bg-zinc-950 border border-rose-800 px-2 py-1 rounded">
                <span className="text-[11px] text-rose-300">Baştan hesaplansın mı?</span>
                <button
                  onClick={handleReset}
                  className="px-2 py-0.5 bg-rose-900/60 text-white rounded text-[11px]"
                >
                  Evet
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[11px]"
                >
                  İptal
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 2. ANA SERMAYE VE KAZANÇ ÖZET KARTLARI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Başlangıç Sermayesi */}
          <div className="border border-zinc-800 bg-zinc-950 p-3 rounded space-y-1">
            <div className="text-[11px] text-zinc-400">BAŞLANGIÇ SERMAYESİ</div>
            <div className="text-lg font-bold font-mono text-zinc-200">
              {formatTRY(ledger.initialCapitalTRY)}
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">
              Başlangıç: {formatDateTR(ledger.startedAt)}
            </div>
          </div>

          {/* Güncel Toplam Kasa (Equity) */}
          <div className="border border-zinc-800 bg-zinc-950 p-3 rounded space-y-1">
            <div className="text-[11px] text-zinc-400">GÜNCEL TOPLAM VARLIK</div>
            <div className="text-lg font-bold font-mono text-white">
              {formatTRY(ledger.totalEquityTRY)}
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">
              Nakit: {formatTRY(ledger.cashBalanceTRY)}
            </div>
          </div>

          {/* Net Kâr / Zarar */}
          <div className="border border-zinc-800 bg-zinc-950 p-3 rounded space-y-1">
            <div className="text-[11px] text-zinc-400">TOPLAM NET KÂR / ZARAR</div>
            <div
              className={`text-lg font-bold font-mono ${
                isProfitable ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isProfitable ? '+' : ''}
              {formatTRY(ledger.netProfitTRY)}
            </div>
            <div className="text-[11px] font-mono">
              <span className={isProfitable ? 'text-emerald-400' : 'text-rose-400'}>
                {isProfitable ? '+' : ''}%{ledger.netProfitPercent} Getiri
              </span>{' '}
              <span className="text-zinc-500">• Yüzer: {formatTRY(ledger.openFloatingPnL_TRY)}</span>
            </div>
          </div>

          {/* Başarı Oranı */}
          <div className="border border-zinc-800 bg-zinc-950 p-3 rounded space-y-1">
            <div className="text-[11px] text-zinc-400">KAZANMA ORANI & PERFORMANS</div>
            <div className="text-lg font-bold font-mono text-white">
              %{ledger.metrics.winRatePercent}{' '}
              <span className="text-xs font-normal text-zinc-400">
                ({ledger.metrics.winningTrades}G / {ledger.metrics.losingTrades}K)
              </span>
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">
              Profit Factor: <strong className="text-zinc-300">{ledger.metrics.profitFactor}</strong> • Kapalı: {ledger.metrics.totalClosedTrades}
            </div>
          </div>

          {/* Risk ve Kasa Yönetimi */}
          <div className="border border-zinc-800 bg-zinc-950 p-3 rounded space-y-1">
            <div className="text-[11px] text-zinc-400">SERMAYE KALKANI & KUR</div>
            <div className="text-lg font-bold font-mono text-zinc-200">
              %1.5 Risk / İşlem
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">
              Maks DD: %{ledger.metrics.maxDrawdownPercent} • USD/TRY: {ledger.liveUsdTry.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* 3. KASA BÜYÜME EĞRİSİ (EQUITY CURVE GRAFIĞI) */}
      <div className="border border-zinc-800 bg-zinc-900 rounded p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
          <div>
            <h3 className="text-sm font-bold text-white">250.000 TL Kasa Büyüme Eğrisi (Gerçekleşen & Anlık Varlık)</h3>
            <span className="text-[11px] text-zinc-400 font-mono">
              İncelenen Nokta ({activeCurvePoint?.timeStr || 'Şimdi'}):{' '}
              <strong className="text-white">{formatTRY(activeCurvePoint?.equityTRY || ledger.totalEquityTRY)}</strong>
            </span>
          </div>
          <div className="text-[11px] text-zinc-400 font-mono">
            Zirve Kasa: <strong className="text-emerald-400">{formatTRY(ledger.metrics.peakEquityTRY)}</strong>
          </div>
        </div>

        <div className="w-full bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full h-44 sm:h-52 select-none touch-none cursor-crosshair"
            onMouseLeave={() => setHoverIdx(null)}
            onTouchStart={handleTouch}
            onTouchMove={handleTouch}
            onTouchEnd={() => setHoverIdx(null)}
          >
            {/* Yatay Kılavuzlar */}
            {[0.2, 0.5, 0.8].map((pct, i) => {
              const y = padT + chartH * pct;
              const val = maxEq - pct * eqRange;
              return (
                <g key={i}>
                  <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#27272a" strokeDasharray="2 2" />
                  <text x={svgW - padR + 6} y={y + 3} fill="#71717a" fontSize="9" fontFamily="monospace">
                    {Math.round(val).toLocaleString('tr-TR')} TL
                  </text>
                </g>
              );
            })}

            {/* 250.000 TL Başlangıç Çizgisi */}
            <line
              x1={padL}
              y1={getY(250000)}
              x2={svgW - padR}
              y2={getY(250000)}
              stroke="#52525b"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <text x={padL + 6} y={getY(250000) - 5} fill="#a1a1aa" fontSize="9" fontFamily="monospace">
              Başlangıç: 250.000 TL
            </text>

            {/* Kasa Eğrisi */}
            {curvePoints.length > 1 && (
              <polyline
                fill="none"
                stroke={isProfitable ? '#10b981' : '#f43f5e'}
                strokeWidth="2"
                strokeLinejoin="round"
                points={polylineStr}
              />
            )}

            {/* Noktalar ve Hover */}
            {curvePoints.map((pt, i) => {
              const x = getX(i);
              const w = chartW / Math.max(1, curvePoints.length - 1);
              return (
                <g key={i}>
                  <circle cx={x} cy={getY(pt.equityTRY)} r="2.5" fill={isProfitable ? '#10b981' : '#f43f5e'} />
                  <rect
                    x={x - w / 2}
                    y={0}
                    width={Math.max(w, 6)}
                    height={svgH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(i)}
                  />
                </g>
              );
            })}

            {hoverIdx !== null && curvePoints[hoverIdx] && (
              <g>
                <line
                  x1={getX(hoverIdx)}
                  y1={padT}
                  x2={getX(hoverIdx)}
                  y2={svgH - padB}
                  stroke="#38bdf8"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={getX(hoverIdx)}
                  cy={getY(curvePoints[hoverIdx].equityTRY)}
                  r="4.5"
                  fill="#38bdf8"
                  stroke="#09090b"
                  strokeWidth="1.5"
                />
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* 4. ŞU ANDA AÇIK OLAN CANLI ПОZİSYONLAR */}
      <div className="border border-zinc-800 bg-zinc-900 rounded p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
          <div>
            <h3 className="text-sm font-bold text-white">
              Açık Olan Canlı Piyasa Pozisyonları ({ledger.openPositions.length} Aktif İşlem)
            </h3>
            <span className="text-xs text-zinc-400">
              Anlık borsa fiyatlarıyla yönetilen işlemler • Bağlı Teminat: {formatTRY(ledger.allocatedMarginTRY)}
            </span>
          </div>
          <div className="text-xs font-mono text-zinc-400">
            Serbest Nakit: <strong className="text-zinc-200">{formatTRY(ledger.availableCashTRY)}</strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                <th className="py-2 px-2">Enstrüman</th>
                <th className="py-2 px-2">Yön</th>
                <th className="py-2 px-2 text-right">Giriş Fiyatı</th>
                <th className="py-2 px-2 text-right">Canlı Fiyat</th>
                <th className="py-2 px-2 text-right">TP1 / TP2</th>
                <th className="py-2 px-2 text-right">Stop Loss (SL)</th>
                <th className="py-2 px-2 text-right">Teminat / Risk</th>
                <th className="py-2 px-2">Koruma Durumu</th>
                <th className="py-2 px-2 text-right">Anlık Kâr/Zarar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {ledger.openPositions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-zinc-500 font-sans">
                    Şu anda açık pozisyon yok. Otonom motor uygun risk/getiri fırsatlarını tarıyor.
                  </td>
                </tr>
              ) : (
                ledger.openPositions.map((pos) => {
                  const isPosUp = pos.totalPnL_TRY >= 0;
                  return (
                    <tr key={pos.id} className="hover:bg-zinc-950/60">
                      <td className="py-2.5 px-2">
                        <div className="font-bold text-white">{pos.symbol}</div>
                        <div className="text-[10px] text-zinc-500 font-sans">{formatDateTR(pos.entryTime)}</div>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] border ${
                            pos.direction === 'AL (LONG)'
                              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900'
                              : 'bg-rose-950/40 text-rose-400 border-rose-900'
                          }`}
                        >
                          {pos.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-zinc-200">
                        {pos.entryPrice.toFixed(pos.digits)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-bold text-white">
                        {pos.currentPrice.toFixed(pos.digits)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-emerald-400">
                        <div>TP1: {pos.takeProfit1.toFixed(pos.digits)}</div>
                        <div className="text-[10px] text-emerald-500/80">TP2: {pos.takeProfit2.toFixed(pos.digits)}</div>
                      </td>
                      <td className="py-2.5 px-2 text-right text-rose-400">
                        {pos.stopLoss.toFixed(pos.digits)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-zinc-300">
                        <div>{Math.round(pos.allocatedCapitalTRY).toLocaleString('tr-TR')} TL</div>
                        <div className="text-[10px] text-zinc-500">Risk: {Math.round(pos.riskAmountTRY).toLocaleString('tr-TR')} TL</div>
                      </td>
                      <td className="py-2.5 px-2 font-sans text-[11px]">
                        {pos.tp1Hit ? (
                          <span className="text-emerald-400 font-medium">
                            TP1 Alındı (%50) • Başa Baş Stop Aktif
                          </span>
                        ) : (
                          <span className="text-zinc-400">%1.5 SL Kalkanı Devrede</span>
                        )}
                        <div className="text-[10px] text-zinc-500 truncate max-w-xs" title={pos.rationale}>
                          {pos.rationale}
                        </div>
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-bold ${
                          isPosUp ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        <div>
                          {isPosUp ? '+' : ''}
                          {formatTRY(pos.totalPnL_TRY)}
                        </div>
                        <div className="text-[10px]">
                          ({isPosUp ? '+' : ''}%{pos.totalPnL_Percent})
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. KAPANMIŞ İŞLEMLERİN KALICI KAYIT DEFTERİ */}
      <div className="border border-zinc-800 bg-zinc-900 rounded p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
          <div>
            <h3 className="text-sm font-bold text-white">
              Kapanmış İşlemlerin Kalıcı Kayıt Defteri ({ledger.closedTrades.length} Tamamlanan İşlem)
            </h3>
            <span className="text-xs text-zinc-400">
              Gerçek borsa mumlarında gerçekleşmiş tüm kâr al (TP) ve zarar durdur (SL) kayıtları
            </span>
          </div>
          <div className="flex items-center space-x-3 text-xs font-mono">
            <span className="text-emerald-400">
              Brüt Kâr: +{formatTRY(ledger.metrics.grossProfitTRY)}
            </span>
            <span className="text-rose-400">
              Brüt Kayıp: -{formatTRY(ledger.metrics.grossLossTRY)}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                <th className="py-2 px-2">Enstrüman</th>
                <th className="py-2 px-2">Yön</th>
                <th className="py-2 px-2 text-right">Giriş → Çıkış</th>
                <th className="py-2 px-2">Açılış → Kapanış Zamanı</th>
                <th className="py-2 px-2">Sonuç Durumu</th>
                <th className="py-2 px-2">Kapanış Gerekçesi</th>
                <th className="py-2 px-2 text-right">Net Kâr / Zarar (TL)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {ledger.closedTrades.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-zinc-500 font-sans">
                    Henüz kapanmış işlem bulunmuyor.
                  </td>
                </tr>
              ) : (
                ledger.closedTrades.map((t) => {
                  const isWin = t.realizedPnL_TRY >= 0;
                  return (
                    <tr key={t.id} className="hover:bg-zinc-950/60">
                      <td className="py-2.5 px-2">
                        <div className="font-bold text-white">{t.symbol}</div>
                        <div className="text-[10px] text-zinc-500 font-sans">{t.name}</div>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] border ${
                            t.direction === 'AL (LONG)'
                              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900'
                              : 'bg-rose-950/40 text-rose-400 border-rose-900'
                          }`}
                        >
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-zinc-200">
                        {t.entryPrice.toFixed(t.digits)} →{' '}
                        <strong className="text-white">{(t.closePrice ?? t.currentPrice).toFixed(t.digits)}</strong>
                      </td>
                      <td className="py-2.5 px-2 text-[11px] text-zinc-400">
                        <div>{formatDateTR(t.entryTime)}</div>
                        <div className="text-zinc-500">{formatDateTR(t.closeTime)}</div>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] border ${
                            t.status === 'TP2_TAM_HEDEF'
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : t.status === 'TP1_VE_BASABAS'
                              ? 'bg-sky-950 text-sky-300 border-sky-800'
                              : 'bg-rose-950 text-rose-300 border-rose-800'
                          }`}
                        >
                          {t.status === 'TP2_TAM_HEDEF'
                            ? 'TP1 + TP2 TAM HEDEF'
                            : t.status === 'TP1_VE_BASABAS'
                            ? 'TP1 KÂR + BAŞABAŞ STOP'
                            : 'STOP LOSS (%1.5 KALKAN)'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 font-sans text-[11px] text-zinc-400 max-w-xs">
                        {t.exitReason || t.rationale}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-bold ${
                          isWin ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        <div>
                          {isWin ? '+' : ''}
                          {formatTRY(t.realizedPnL_TRY)}
                        </div>
                        <div className="text-[10px]">
                          ({isWin ? '+' : ''}%{t.totalPnL_Percent})
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. OTONOM EMİR VE KARAR GÜNLÜĞÜ */}
      <div className="border border-zinc-800 bg-zinc-900 rounded p-3 sm:p-4 space-y-2">
        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono border-b border-zinc-800 pb-2">
          Canlı Otonom Karar & Emir Günlüğü (Son Hareketler)
        </h3>
        <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
          {ledger.activityLog.map((log) => (
            <div
              key={log.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 bg-zinc-950 border border-zinc-800/80 px-2.5 py-1.5 rounded"
            >
              <div className="flex items-center space-x-2">
                <span className="text-zinc-500 shrink-0">[{formatDateTR(log.timestamp)}]</span>
                <span className="font-bold text-zinc-200 shrink-0">{log.symbol}:</span>
                <span className="text-zinc-300 font-sans">{log.message}</span>
              </div>
              {log.pnlImpactTRY !== undefined && log.pnlImpactTRY !== 0 && (
                <span
                  className={`shrink-0 font-bold ${
                    log.pnlImpactTRY > 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {log.pnlImpactTRY > 0 ? '+' : ''}
                  {formatTRY(log.pnlImpactTRY)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

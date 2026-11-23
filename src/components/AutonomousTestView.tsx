import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Cpu,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';

interface AutonomousTrade {
  id: string;
  symbol: string;
  name: string;
  digits: number;
  pod?: string;
  podLabel?: string;
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  status: string;
  entryTime: string;
  closeTime?: string;
  entryPrice: number;
  currentPrice: number;
  closePrice?: number;
  takeProfit1: number;
  takeProfit2: number;
  stopLoss: number;
  allocatedCapitalTRY: number;
  notionalValueTRY?: number;
  effectiveLeverage?: number;
  positionSizeUnits: number;
  unitLabel?: string;
  entryCommissionTRY?: number;
  exitCommissionTRY?: number;
  financingCostTRY?: number;
  realizedPnL_TRY: number;
  unrealizedPnL_TRY: number;
  totalPnL_TRY: number;
  totalPnL_Percent: number;
  rMultiple?: number;
  rationale: string;
  exitReason?: string;
}

interface MarketRadarItem {
  symbol: string;
  name: string;
  cluster: string;
  digits: number;
  price: number;
  change24hPercent: number;
  isOpen: boolean;
  closedReason?: string;
  zacScore: number;
  regime: string;
  regimeLabelTR: string;
  ewmac: number;
  aboveSma200: boolean;
  volRatio: number;
  ibs12h: number;
  cumRsi2_12h: number;
  xsmomRank: number;
  activePod: string;
  direction: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
  conviction: number;
  pred24hPct: number;
  pUp24h: number;
  status: string;
  reason: string;
}

interface AutonomousLedger {
  botId: string;
  strategyVersion: string;
  isRunning: boolean;
  startedAt: string;
  lastTickAt: string;
  liveGoTargetIso?: string;
  tickCount?: number;
  liveUsdTry: number;
  vixLevel?: number;
  initialCapitalTRY: number;
  cashBalanceTRY: number;
  allocatedMarginTRY: number;
  availableCashTRY: number;
  openFloatingPnL_TRY: number;
  totalEquityTRY: number;
  netProfitTRY: number;
  netProfitPercent: number;
  drawdownThrottleScale?: number;
  openPositions: AutonomousTrade[];
  closedTrades: AutonomousTrade[];
  activityLog: { id: string; timestamp: string; type: string; symbol: string; pod?: string; message: string; pnlImpactTRY?: number }[];
  lastMarketRadar?: MarketRadarItem[];
  podStats?: { pod: string; label: string; openCount: number; maxSlots: number; closedCount: number; winRatePct: number; netPnL_TRY: number }[];
  liveReadiness?: {
    targetDateTR: string;
    daysRemaining: number;
    overallStatus: string;
    gates: { id: string; label: string; status: string; metric: string; target: string }[];
  };
  metrics: {
    totalClosedTrades: number;
    openPositionsCount: number;
    winningTrades: number;
    losingTrades: number;
    winRatePercent: number;
    profitFactor: number;
    avgWinTRY: number;
    avgLossTRY: number;
    expectancyTRY: number;
    maxDrawdownPercent: number;
    totalSpreadAndCommissionTRY: number;
    totalFinancingTRY?: number;
  };
}

interface WalkForwardReport {
  window: '30d' | '90d' | '1y' | '2y';
  windowLabelTR: string;
  strategyVersion: string;
  startDate: string;
  endDate: string;
  initialCapitalTRY: number;
  endingEquityTRY: number;
  netProfitTRY: number;
  netProfitPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownPercent: number;
  totalTrades: number;
  winRatePercent: number;
  profitFactor: number;
  totalFeesTRY: number;
  totalSwapTRY: number;
  positiveQuarters: number;
  totalQuarters: number;
  podAttribution: { pod: string; label: string; trades: number; winRatePct: number; profitFactor: number; netPnL_TRY: number; feesTRY: number; swapTRY: number }[];
  quarterlyBreakdown: { quarter: string; trades: number; winRatePct: number; profitFactor: number; netPnL_TRY: number }[];
  equityCurve: { date: string; equityTRY: number; ddPct: number }[];
  recentTrades: { symbol: string; pod: string; direction: string; entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; netPnL_TRY: number; rMultiple: number; reason: string }[];
  legacyComparison: {
    oldVersion: string;
    old2YEndingEquityTRY: number;
    old2YReturnPct: number;
    old2YMaxDdPct: number;
    old2YProfitFactor: number;
    old2YPositiveQuarters: string;
    improvementSummaryTR: string;
  };
}

interface AutonomousTestViewProps {
  onInspectSymbol?: (symbol: string) => void;
}

const fmtTL = (n: number) =>
  `${n >= 0 ? '' : '-'}${Math.abs(Math.round(n)).toLocaleString('tr-TR')} TL`;

const fmtSignedTL = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(Math.round(n)).toLocaleString('tr-TR')} TL`;

export const AutonomousTestView: React.FC<AutonomousTestViewProps> = ({ onInspectSymbol }) => {
  const [ledger, setLedger] = useState<AutonomousLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Walk-forward kanıt durumu
  const [wfWindow, setWfWindow] = useState<'30d' | '90d' | '1y' | '2y'>('2y');
  const [wfReport, setWfReport] = useState<WalkForwardReport | null>(null);
  const [wfLoading, setWfLoading] = useState<boolean>(false);

  // Alt görünüm sekmesi
  const [deskTab, setDeskTab] = useState<'positions' | 'proof' | 'radar' | 'architecture' | 'logs'>('proof');
  const [closedPage, setClosedPage] = useState<number>(1);
  const [radarPage, setRadarPage] = useState<number>(1);
  const [logPage, setLogPage] = useState<number>(1);

  const CLOSED_PER_PAGE = 6;
  const RADAR_PER_PAGE = 6;
  const LOGS_PER_PAGE = 8;

  const fetchLedger = useCallback(async (action?: string, tradeId?: string) => {
    try {
      if (action) setBusyAction(action);
      const isPost = Boolean(action && action !== 'status');
      const resp = await fetch(
        '/api/autonomous-test',
        isPost
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action, tradeId }),
            }
          : undefined
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json: AutonomousLedger = await resp.json();
      setLedger(json);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Otonom fon verisi alınamadı');
    } finally {
      setLoading(false);
      setBusyAction(null);
    }
  }, []);

  const fetchWalkForward = useCallback(async (win: '30d' | '90d' | '1y' | '2y', refresh = false) => {
    setWfLoading(true);
    try {
      const resp = await fetch(`/api/autonomous-backtest?window=${win}${refresh ? '&refresh=1' : ''}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json: WalkForwardReport = await resp.json();
      setWfReport(json);
    } catch {
      // Hata durumunda mevcut raporu koru
    } finally {
      setWfLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLedger();
    const timer = setInterval(() => fetchLedger(), 20_000);
    return () => clearInterval(timer);
  }, [fetchLedger]);

  useEffect(() => {
    fetchWalkForward(wfWindow, false);
  }, [wfWindow, fetchWalkForward]);

  // Walk-Forward Equity Curve SVG Geometri
  const wfSvg = useMemo(() => {
    if (!wfReport || !wfReport.equityCurve || wfReport.equityCurve.length < 2) return null;
    const pts = wfReport.equityCurve;
    const W = 900;
    const H = 210;
    const PAD = 24;
    const vals = pts.map((p) => p.equityTRY);
    const minV = Math.min(250_000, ...vals) * 0.985;
    const maxV = Math.max(250_000, ...vals) * 1.015;
    const xOf = (i: number) => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
    const yOf = (v: number) => PAD + ((maxV - v) / Math.max(1, maxV - minV)) * (H - PAD * 2);
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.equityTRY).toFixed(1)}`).join(' ');
    const area = `${line} L${xOf(pts.length - 1).toFixed(1)},${(H - PAD).toFixed(1)} L${xOf(0).toFixed(1)},${(H - PAD).toFixed(1)} Z`;
    const baseLineY = yOf(250_000);
    return { W, H, PAD, line, area, baseLineY, minV, maxV, pts, xOf, yOf };
  }, [wfReport]);

  if (loading && !ledger) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-10 text-center text-xs font-mono text-zinc-400">
        ZELTRA v14.0 Kurumsal 3-Pod Otonom Fon Motoru yükleniyor ve 17 küresel enstrüman taranıyor...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. YÖNETİCİ KONTROL & CANLI DURUM ŞERİDİ */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-lg px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-bold ${
              ledger?.isRunning
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                : 'bg-amber-500/15 text-amber-400 border border-amber-500/40'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${ledger?.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            {ledger?.isRunning ? 'AKTİF' : 'DURAKLATILDI'}
          </span>
          <span className="text-xs font-bold text-white">3-Pod Otonom Fon</span>
          <span className="text-xs font-mono text-zinc-400">
            USD/TRY <strong className="text-zinc-200">{ledger?.liveUsdTry?.toFixed(2)}</strong> • VIX{' '}
            <strong className="text-zinc-200">{ledger?.vixLevel?.toFixed(1) || '18.0'}</strong> • Hedef:{' '}
            {ledger?.liveReadiness?.targetDateTR || '01.12.2026'}
          </span>
        </div>

        {/* Kontrol Butonları */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => fetchLedger('tick')}
            disabled={busyAction !== null}
            className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'tick' ? 'animate-spin' : ''}`} />
            Canlı Tara
          </button>

          {ledger?.isRunning ? (
            <button
              onClick={() => fetchLedger('pause')}
              disabled={busyAction !== null}
              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5"
            >
              <Pause className="w-3.5 h-3.5" /> Duraklat
            </button>
          ) : (
            <button
              onClick={() => fetchLedger('start')}
              disabled={busyAction !== null}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> Aktifleştir
            </button>
          )}

          <button
            onClick={() => {
              if (window.confirm('Test fonu 250.000 TL başlangıç sermayesi ile sıfırlansın mı?')) {
                fetchLedger('reset');
              }
            }}
            disabled={busyAction !== null}
            className="px-3 py-1.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> 250K Sıfırla
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-800 text-rose-300 rounded p-3 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. CANLI 250.000 TL FON KPI ŞERİDİ */}
      {ledger && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5 font-mono">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="text-[10px] text-zinc-500 uppercase">Canlı Toplam Varlık</div>
            <div className="text-base font-bold text-white mt-1">{fmtTL(ledger.totalEquityTRY)}</div>
            <div className={`text-[11px] font-semibold mt-0.5 ${ledger.netProfitTRY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {fmtSignedTL(ledger.netProfitTRY)} ({ledger.netProfitPercent >= 0 ? '+' : ''}
              {ledger.netProfitPercent}%)
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="text-[10px] text-zinc-500 uppercase">Boş Nakit / Teminat</div>
            <div className="text-base font-bold text-zinc-100 mt-1">{fmtTL(ledger.availableCashTRY)}</div>
            <div className="text-[11px] text-zinc-400 mt-0.5">Bağlı: {fmtTL(ledger.allocatedMarginTRY)}</div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="text-[10px] text-zinc-500 uppercase">Açık / Kapalı İşlem</div>
            <div className="text-base font-bold text-cyan-300 mt-1">
              {ledger.openPositions.length} Açık <span className="text-zinc-500 text-xs">/ {ledger.closedTrades.length}</span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Açık K/Z: <span className={ledger.openFloatingPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{fmtSignedTL(ledger.openFloatingPnL_TRY)}</span>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="text-[10px] text-zinc-500 uppercase">Canlı WR / PF</div>
            <div className="text-base font-bold text-white mt-1">
              %{ledger.metrics.winRatePercent} <span className="text-zinc-500 text-xs">PF {ledger.metrics.profitFactor}</span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">MaxDD: %{ledger.metrics.maxDrawdownPercent}</div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="text-[10px] text-zinc-500 uppercase">IBKR Komisyon & Swap</div>
            <div className="text-base font-bold text-amber-300 mt-1">
              {fmtTL(ledger.metrics.totalSpreadAndCommissionTRY)}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Swap: {fmtTL(ledger.metrics.totalFinancingTRY || 0)}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="text-[10px] text-zinc-500 uppercase">Risk Kalkanı</div>
            <div className="text-base font-bold text-emerald-400 mt-1">
              {((ledger.drawdownThrottleScale ?? 1) * 100).toFixed(0)}% Lot Gücü
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
              {ledger.liveReadiness?.overallStatus || 'AKTİF'}
            </div>
          </div>
        </div>
      )}

      {/* 3. ANA ÇALIŞMA SEKMELERİ (SAYFA SAYFA ODAKLI GÖRÜNÜM) */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800 pb-2 text-xs font-semibold">
        {[
          { id: 'proof', label: 'Walk-Forward Testi' },
          { id: 'positions', label: `Pozisyonlar (${ledger?.openPositions.length || 0}) & Defter (${ledger?.closedTrades.length || 0})` },
          { id: 'radar', label: `Piyasa Radarı (17)` },
          { id: 'architecture', label: `3-Pod & Geçiş Kapıları` },
          { id: 'logs', label: `Günlük (${ledger?.activityLog.length || 0})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setDeskTab(t.id as any)}
            className={`px-3.5 py-2 rounded transition-colors ${
              deskTab === t.id
                ? 'bg-white text-zinc-950 font-bold'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* SEKME: 3-POD SERMAYE MİMARİSİ & 01.12.2026 CANLIYA HAZIRLIK KAPILARI */}
      {deskTab === 'architecture' && ledger && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* 3-Pod Canlı Slot Durumu */}
          <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-cyan-400" />
                3-Pod Sermaye Mimarisi
              </h2>
              <span className="text-[11px] font-mono text-zinc-500">Maks 8 Slot</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(ledger.podStats || []).map((ps) => (
                <div key={ps.pod} className="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-1.5 font-mono">
                  <div className="text-[11px] font-bold text-cyan-300 truncate">{ps.pod}</div>
                  <div className="text-[10px] text-zinc-400 leading-tight min-h-[26px]">{ps.label}</div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/80">
                    <span className="text-zinc-400">Slot:</span>
                    <span className="text-white font-bold">
                      {ps.openCount} / {ps.maxSlots}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Canlı K/Z:</span>
                    <span className={ps.netPnL_TRY >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {fmtSignedTL(ps.netPnL_TRY)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 01.12.2026 Canlıya Geçiş Kapıları */}
          <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2.5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                01.12.2026 Canlıya Geçiş Kapıları
              </h2>
              <span className="text-[11px] font-mono text-emerald-400">
                {ledger.liveReadiness?.overallStatus}
              </span>
            </div>
            <div className="space-y-1.5">
              {(ledger.liveReadiness?.gates || []).map((g) => (
                <div
                  key={g.id}
                  className="bg-zinc-950 border border-zinc-800/80 rounded px-3 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      {g.status === 'GEÇTİ' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span className="truncate">{g.label}</span>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400 pl-5">{g.metric}</div>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold shrink-0 ${
                      g.status === 'GEÇTİ'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : g.status === 'UYARI'
                          ? 'bg-rose-500/15 text-rose-400'
                          : 'bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {g.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SEKME A: GERÇEK VERİ WALK-FORWARD KANIT MOTORU */}
      {deskTab === 'proof' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                Walk-Forward Performansı
              </h2>
              <div className="flex items-center gap-1.5 font-mono text-xs">
                {(['30d', '90d', '1y', '2y'] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => setWfWindow(w)}
                    className={`px-3 py-1.5 rounded transition-colors ${
                      wfWindow === w
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                        : 'bg-zinc-950 text-zinc-400 border border-zinc-800 hover:text-white'
                    }`}
                  >
                    {w === '30d' ? '30 GÜN' : w === '90d' ? '90 GÜN' : w === '1y' ? '1 YIL' : '2 YIL'}
                  </button>
                ))}
                <button
                  onClick={() => fetchWalkForward(wfWindow, true)}
                  disabled={wfLoading}
                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                  title="Taze veriyle yeniden hesapla"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${wfLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {wfLoading && !wfReport ? (
              <div className="py-12 text-center text-xs font-mono text-zinc-400">
                17 küresel enstrümanın gerçek 2 yıllık saatlik mum verisi simüle ediliyor...
              </div>
            ) : wfReport ? (
              <div className="space-y-4">
                {/* Özet Metrik Kartları */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 font-mono">
                  <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
                    <div className="text-[10px] text-zinc-500">Bitiş Sermayesi</div>
                    <div className="text-sm font-bold text-white mt-0.5">{fmtTL(wfReport.endingEquityTRY)}</div>
                    <div className={`text-[11px] font-bold ${wfReport.netProfitTRY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {wfReport.netProfitPercent >= 0 ? '+' : ''}
                      {wfReport.netProfitPercent}%
                    </div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
                    <div className="text-[10px] text-zinc-500">Profit Factor</div>
                    <div className="text-sm font-bold text-emerald-400 mt-0.5">{wfReport.profitFactor}</div>
                    <div className="text-[10px] text-zinc-500">{wfReport.totalTrades} işlem</div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
                    <div className="text-[10px] text-zinc-500">Sharpe / Sortino</div>
                    <div className="text-sm font-bold text-cyan-300 mt-0.5">
                      {wfReport.sharpeRatio} / {wfReport.sortinoRatio}
                    </div>
                    <div className="text-[10px] text-zinc-500">Yıllıklandırılmış</div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
                    <div className="text-[10px] text-zinc-500">Max Drawdown</div>
                    <div className="text-sm font-bold text-amber-300 mt-0.5">%{wfReport.maxDrawdownPercent}</div>
                    <div className="text-[10px] text-zinc-500">Tek haneli risk</div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
                    <div className="text-[10px] text-zinc-500">Kazanma Oranı</div>
                    <div className="text-sm font-bold text-white mt-0.5">%{wfReport.winRatePercent}</div>
                    <div className="text-[10px] text-zinc-500">Net kârlı oran</div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
                    <div className="text-[10px] text-zinc-500">Pozitif Çeyrek</div>
                    <div className="text-sm font-bold text-emerald-400 mt-0.5">
                      {wfReport.positiveQuarters} / {wfReport.totalQuarters}
                    </div>
                    <div className="text-[10px] text-zinc-500">Tutarlılık</div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
                    <div className="text-[10px] text-zinc-500">Ödenen Masraf</div>
                    <div className="text-sm font-bold text-zinc-200 mt-0.5">{fmtTL(wfReport.totalFeesTRY)}</div>
                    <div className="text-[10px] text-zinc-500">Swap: {fmtTL(wfReport.totalSwapTRY)}</div>
                  </div>
                </div>

                {/* Sermaye Eğrisi SVG + Eski Yönetici v13.2 Kıyaslama */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-8 bg-zinc-950 border border-zinc-800 rounded p-3 space-y-2">
                    <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                      <span>{wfReport.windowLabelTR} ({wfReport.startDate} → {wfReport.endDate})</span>
                      <span className="text-emerald-400 font-bold">250.000 TL → {fmtTL(wfReport.endingEquityTRY)}</span>
                    </div>
                    {wfSvg && (
                      <svg viewBox={`0 0 ${wfSvg.W} ${wfSvg.H}`} className="w-full h-48 block">
                        <defs>
                          <linearGradient id="wfGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                          </linearGradient>
                        </defs>
                        <line
                          x1={wfSvg.PAD}
                          y1={wfSvg.baseLineY}
                          x2={wfSvg.W - wfSvg.PAD}
                          y2={wfSvg.baseLineY}
                          stroke="#52525b"
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                        <text x={wfSvg.PAD + 4} y={wfSvg.baseLineY - 4} fill="#71717a" fontSize="10" fontFamily="monospace">
                          250.000 TL Başlangıç
                        </text>
                        <path d={wfSvg.area} fill="url(#wfGrad)" />
                        <path d={wfSvg.line} fill="none" stroke="#10b981" strokeWidth="2.2" />
                      </svg>
                    )}
                  </div>

                  {/* Eski Yönetici v13.2 vs Yeni ZELTRA v14.0 Kıyaslama */}
                  <div className="lg:col-span-4 bg-zinc-950 border border-zinc-800 rounded p-3.5 flex flex-col justify-between space-y-3">
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-white border-b border-zinc-800 pb-1.5">
                        Eski Sistem (v13.2) vs Yeni ZELTRA (v14.0)
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="bg-rose-950/30 border border-rose-900/50 rounded p-2.5 space-y-1">
                          <div className="text-[10px] text-rose-300 font-bold">ESKİ (v13.2) — 2Y</div>
                          <div className="text-sm font-black text-rose-400">24.300 TL</div>
                          <div className="text-[11px] text-rose-300">-90.3% | DD %90.9</div>
                          <div className="text-[10px] text-zinc-400">PF 0.58 • 0/9 Çeyrek</div>
                        </div>
                        <div className="bg-emerald-950/30 border border-emerald-800/50 rounded p-2.5 space-y-1">
                          <div className="text-[10px] text-emerald-300 font-bold">YENİ (v14.0) — {wfWindow.toUpperCase()}</div>
                          <div className="text-sm font-black text-emerald-400">{fmtTL(wfReport.endingEquityTRY)}</div>
                          <div className="text-[11px] text-emerald-300">
                            {wfReport.netProfitPercent >= 0 ? '+' : ''}{wfReport.netProfitPercent}% | DD %{wfReport.maxDrawdownPercent}
                          </div>
                          <div className="text-[10px] text-zinc-300">
                            PF {wfReport.profitFactor} • {wfReport.positiveQuarters}/{wfReport.totalQuarters} Çeyrek
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-500">
                      Net komisyon + gecelik swap düşülmüş gerçek saatlik performans.
                    </div>
                  </div>
                </div>

                {/* Pod Katkısı & Çeyreklik İstikrar */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
                    <div className="text-xs font-bold text-white mb-2">Pod Bazlı Gerçek Kâr Katkısı</div>
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-500 text-[10px]">
                          <th className="py-1.5 text-left">Pod</th>
                          <th className="py-1.5 text-right">İşlem</th>
                          <th className="py-1.5 text-right">WR</th>
                          <th className="py-1.5 text-right">PF</th>
                          <th className="py-1.5 text-right">Net K/Z</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {wfReport.podAttribution.map((pa) => (
                          <tr key={pa.pod}>
                            <td className="py-2 text-zinc-200 font-semibold">{pa.pod}</td>
                            <td className="py-2 text-right text-zinc-400">{pa.trades}</td>
                            <td className="py-2 text-right text-zinc-300">%{pa.winRatePct}</td>
                            <td className="py-2 text-right text-cyan-300 font-bold">{pa.profitFactor}</td>
                            <td className={`py-2 text-right font-bold ${pa.netPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {fmtSignedTL(pa.netPnL_TRY)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
                    <div className="text-xs font-bold text-white mb-2">Çeyreklik İstikrar Tablosu</div>
                    <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                      {wfReport.quarterlyBreakdown.map((q) => (
                        <div
                          key={q.quarter}
                          className={`rounded p-2 border ${
                            q.netPnL_TRY >= 0
                              ? 'bg-emerald-950/25 border-emerald-800/40'
                              : 'bg-rose-950/25 border-rose-800/40'
                          }`}
                        >
                          <div className="flex justify-between text-[10px] text-zinc-400">
                            <span className="font-bold text-zinc-200">{q.quarter}</span>
                            <span>n={q.trades}</span>
                          </div>
                          <div className={`text-xs font-bold mt-0.5 ${q.netPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {fmtSignedTL(q.netPnL_TRY)}
                          </div>
                          <div className="text-[10px] text-zinc-400">PF {q.profitFactor} • WR %{q.winRatePct}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* SEKME B: CANLI AÇIK POZİSYONLAR & KAPANAN İŞLEMLER DEFTERİ */}
      {deskTab === 'positions' && ledger && (
        <div className="space-y-4">
          {/* Açık Pozisyonlar */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-bold text-white">
              Canlı Açık Pod Pozisyonları ({ledger.openPositions.length})
            </h2>
            {ledger.openPositions.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-400 bg-zinc-950 rounded border border-zinc-800">
                Şu an aktif açık pozisyon yok. Bot 17 küresel varlıkta 3-Pod eşiklerini 60 saniyede bir canlı tarıyor; koşul oluştuğunda otomatik pozisyon açacaktır.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 text-[11px] text-left">
                      <th className="py-2 pr-2">Varlık / Pod</th>
                      <th className="py-2 px-2">Yön</th>
                      <th className="py-2 px-2 text-right">Giriş</th>
                      <th className="py-2 px-2 text-right">Anlık</th>
                      <th className="py-2 px-2 text-right">Stop-Loss</th>
                      <th className="py-2 px-2 text-right">Hedef</th>
                      <th className="py-2 px-2 text-right">Teminat</th>
                      <th className="py-2 px-2 text-right">Net K/Z</th>
                      <th className="py-2 pl-2 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {ledger.openPositions.map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-800/30">
                        <td className="py-2.5 pr-2">
                          <button
                            onClick={() => onInspectSymbol?.(p.symbol)}
                            className="font-bold text-white hover:text-cyan-300 flex items-center gap-1"
                          >
                            {p.symbol} <ArrowUpRight className="w-3 h-3" />
                          </button>
                          <div className="text-[10px] text-cyan-400">{p.pod || 'POD'}</div>
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              p.direction === 'AL (LONG)'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {p.direction}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right text-zinc-300">{p.entryPrice.toFixed(p.digits)}</td>
                        <td className="py-2.5 px-2 text-right text-white font-bold">{p.currentPrice.toFixed(p.digits)}</td>
                        <td className="py-2.5 px-2 text-right text-rose-400">{p.stopLoss.toFixed(p.digits)}</td>
                        <td className="py-2.5 px-2 text-right text-emerald-400">
                          {p.takeProfit2 > 0 ? p.takeProfit2.toFixed(p.digits) : 'Trailing'}
                        </td>
                        <td className="py-2.5 px-2 text-right text-zinc-300">{fmtTL(p.allocatedCapitalTRY)}</td>
                        <td
                          className={`py-2.5 px-2 text-right font-bold ${
                            p.totalPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {fmtSignedTL(p.totalPnL_TRY)}
                          <div className="text-[10px] font-normal">
                            ({p.totalPnL_Percent >= 0 ? '+' : ''}
                            {p.totalPnL_Percent}%)
                          </div>
                        </td>
                        <td className="py-2.5 pl-2 text-right">
                          <button
                            onClick={() => fetchLedger('close_position', p.id)}
                            disabled={busyAction !== null}
                            className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[10px]"
                          >
                            Kapat
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Kapanan İşlemler (Sayfa Sayfa) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">
                Kapanan İşlemler ({ledger.closedTrades.length})
              </h2>
              {ledger.closedTrades.length > CLOSED_PER_PAGE && (
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <button
                    onClick={() => setClosedPage((p) => Math.max(1, p - 1))}
                    disabled={closedPage <= 1}
                    className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 disabled:opacity-40"
                  >
                    ← Önceki
                  </button>
                  <span className="text-zinc-400">
                    Sayfa {closedPage} / {Math.ceil(ledger.closedTrades.length / CLOSED_PER_PAGE)}
                  </span>
                  <button
                    onClick={() =>
                      setClosedPage((p) =>
                        Math.min(Math.ceil(ledger.closedTrades.length / CLOSED_PER_PAGE), p + 1)
                      )
                    }
                    disabled={closedPage >= Math.ceil(ledger.closedTrades.length / CLOSED_PER_PAGE)}
                    className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 disabled:opacity-40"
                  >
                    Sonraki →
                  </button>
                </div>
              )}
            </div>
            {ledger.closedTrades.length === 0 ? (
              <div className="p-5 text-center text-xs text-zinc-500 bg-zinc-950 rounded border border-zinc-800">
                Henüz kapanan işlem yok.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 text-[11px] text-left">
                      <th className="py-2 pr-2">Varlık / Pod</th>
                      <th className="py-2 px-2">Yön</th>
                      <th className="py-2 px-2 text-right">Giriş → Çıkış</th>
                      <th className="py-2 px-2">Çıkış Nedeni</th>
                      <th className="py-2 pl-2 text-right">Net K/Z</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {ledger.closedTrades
                      .slice((closedPage - 1) * CLOSED_PER_PAGE, closedPage * CLOSED_PER_PAGE)
                      .map((t) => (
                        <tr key={t.id}>
                          <td className="py-2 pr-2">
                            <span className="font-bold text-white">{t.symbol}</span>{' '}
                            <span className="text-[10px] text-cyan-400">{t.pod}</span>
                          </td>
                          <td className="py-2 px-2">{t.direction}</td>
                          <td className="py-2 px-2 text-right text-zinc-300">
                            {t.entryPrice.toFixed(t.digits)} → {(t.closePrice || t.currentPrice).toFixed(t.digits)}
                          </td>
                          <td className="py-2 px-2 text-zinc-400">{t.exitReason || t.status}</td>
                          <td
                            className={`py-2 pl-2 text-right font-bold ${
                              t.realizedPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {fmtSignedTL(t.realizedPnL_TRY)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SEKME C: 17 VARLIK ZAC v14 CANLI PİYASA RADARI (SAYFA SAYFA) */}
      {deskTab === 'radar' && ledger && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Piyasa Radarı ({(ledger.lastMarketRadar || []).length})
            </h2>
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <button
                onClick={() => setRadarPage((p) => Math.max(1, p - 1))}
                disabled={radarPage <= 1}
                className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 disabled:opacity-40"
              >
                ← Önceki
              </button>
              <span className="text-zinc-400">
                Sayfa {radarPage} / {Math.max(1, Math.ceil((ledger.lastMarketRadar || []).length / RADAR_PER_PAGE))}
              </span>
              <button
                onClick={() =>
                  setRadarPage((p) =>
                    Math.min(
                      Math.max(1, Math.ceil((ledger.lastMarketRadar || []).length / RADAR_PER_PAGE)),
                      p + 1
                    )
                  )
                }
                disabled={
                  radarPage >= Math.max(1, Math.ceil((ledger.lastMarketRadar || []).length / RADAR_PER_PAGE))
                }
                className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 disabled:opacity-40"
              >
                Sonraki →
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-[10px] text-left">
                  <th className="py-2 pr-2">Varlık</th>
                  <th className="py-2 px-2 text-right">Fiyat (24S)</th>
                  <th className="py-2 px-2 text-right">ZAC v14</th>
                  <th className="py-2 px-2 text-right">XSMOM</th>
                  <th className="py-2 px-2 text-right">EWMAC</th>
                  <th className="py-2 px-2 text-right">IBS12 / CR2</th>
                  <th className="py-2 px-2 text-right">+24S Olasılık</th>
                  <th className="py-2 px-2">Durum / Pod Tetiği</th>
                  <th className="py-2 pl-2 text-right">Grafik</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {(ledger.lastMarketRadar || [])
                  .slice((radarPage - 1) * RADAR_PER_PAGE, radarPage * RADAR_PER_PAGE)
                  .map((r) => (
                  <tr key={r.symbol} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="py-2.5 pr-2">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        {r.symbol}
                        {!r.isOpen && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-500">KAPALI</span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500">{r.name}</div>
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <div className="text-white font-semibold">{r.price.toFixed(r.digits)}</div>
                      <div className={`text-[10px] ${r.change24hPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {r.change24hPercent >= 0 ? '+' : ''}
                        {r.change24hPercent}%
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          r.zacScore >= 30
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : r.zacScore <= -30
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-zinc-800 text-zinc-300'
                        }`}
                      >
                        {r.zacScore >= 0 ? `+${r.zacScore}` : r.zacScore}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right text-zinc-300">#{r.xsmomRank || '-'}</td>
                    <td className={`py-2.5 px-2 text-right ${r.ewmac >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {r.ewmac >= 0 ? '+' : ''}
                      {r.ewmac}
                    </td>
                    <td className="py-2.5 px-2 text-right text-zinc-300">
                      {r.ibs12h.toFixed(2)} / {Math.round(r.cumRsi2_12h)}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <span className={r.pUp24h >= 54 ? 'text-emerald-400' : r.pUp24h <= 46 ? 'text-rose-400' : 'text-zinc-400'}>
                        %{r.pUp24h} ↑
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`text-[11px] font-sans ${
                          r.activePod !== 'NONE'
                            ? 'text-cyan-300 font-bold'
                            : r.aboveSma200
                              ? 'text-zinc-300'
                              : 'text-zinc-500'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2.5 pl-2 text-right">
                      <button
                        onClick={() => onInspectSymbol?.(r.symbol)}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-cyan-600 text-zinc-200 hover:text-white text-[10px] font-sans font-semibold transition-colors"
                      >
                        ZAC Aç
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SEKME D: SİSTEM AKTİVİTE GÜNLÜĞÜ (SAYFA SAYFA) */}
      {deskTab === 'logs' && ledger && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Emir & Tarama Günlüğü ({ledger.activityLog.length})
            </h2>
            {ledger.activityLog.length > LOGS_PER_PAGE && (
              <div className="flex items-center gap-1.5 font-mono text-xs">
                <button
                  onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                  disabled={logPage <= 1}
                  className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 disabled:opacity-40"
                >
                  ← Önceki
                </button>
                <span className="text-zinc-400">
                  Sayfa {logPage} / {Math.ceil(ledger.activityLog.length / LOGS_PER_PAGE)}
                </span>
                <button
                  onClick={() =>
                    setLogPage((p) =>
                      Math.min(Math.ceil(ledger.activityLog.length / LOGS_PER_PAGE), p + 1)
                    )
                  }
                  disabled={logPage >= Math.ceil(ledger.activityLog.length / LOGS_PER_PAGE)}
                  className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 disabled:opacity-40"
                >
                  Sonraki →
                </button>
              </div>
            )}
          </div>
          <div className="space-y-1.5 font-mono text-xs">
            {ledger.activityLog
              .slice((logPage - 1) * LOGS_PER_PAGE, logPage * LOGS_PER_PAGE)
              .map((log) => (
              <div
                key={log.id}
                className="bg-zinc-950 border border-zinc-800/80 rounded px-3 py-2 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-zinc-500 shrink-0">{log.timestamp}</span>
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-cyan-300 text-[10px] font-bold shrink-0">
                    {log.symbol}
                  </span>
                  <span className="text-zinc-200 font-sans text-xs">{log.message}</span>
                </div>
                {typeof log.pnlImpactTRY === 'number' && (
                  <span className={log.pnlImpactTRY >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {fmtSignedTL(log.pnlImpactTRY)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

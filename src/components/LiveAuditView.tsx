import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  Clock,
  Lock,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';

interface AiPostMortem {
  id: string;
  forecastId: string;
  symbol: string;
  horizonHours: 1 | 4 | 24;
  timestampTR: string;
  outcome: 'DOĞRU' | 'YANLIŞ' | 'YATAY_NÖTR';
  predictedDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
  actualMovePct: number;
  predictedMovePct: number;
  rootCauseCategory: string;
  rootCauseTitleTR: string;
  whyItHappenedTR: string;
  nextTimeActionTR: string;
  winningExpert: string;
  winningExpertLabelTR: string;
  misleadingExpert?: string;
  misleadingExpertLabelTR?: string;
  weightDeltaSummaryTR: string;
  patternAtEntryTR: string;
}

interface LockedForecast {
  id: string;
  symbol: string;
  name: string;
  digits: number;
  horizonHours: 1 | 4 | 24;
  lockedAtMs: number;
  lockedAtTR: string;
  targetAtMs: number;
  targetAtTR: string;
  baselinePrice: number;
  predictedPrice: number;
  predictedMovePct: number;
  expectedDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
  confluenceTier?: 'SNIPER' | 'HIGH' | 'STANDARD' | 'CHOP';
  lower90: number;
  upper90: number;
  zacScore: number;
  pUp: number;
  activePod: string;
  regimeLabelTR: string;
  patternLabelAtEntryTR?: string;
  dominantExpertLabelTR?: string;
  aiReasoningTR?: string;
  status: 'BEKLİYOR' | 'DOĞRU' | 'YANLIŞ' | 'YATAY_NÖTR';
  currentLivePrice: number;
  currentMovePct: number;
  actualPrice?: number;
  actualMovePct?: number;
  priceErrorPct?: number;
  directionHit?: boolean;
  inside90Band?: boolean;
  settledAtMs?: number;
  settledAtTR?: string;
  postMortem?: AiPostMortem;
}

interface HorizonStats {
  horizonHours: 1 | 4 | 24;
  totalLocked: number;
  pending: number;
  settled: number;
  directionHits: number;
  directionHitRatePct: number;
  band90Hits: number;
  band90CoveragePct: number;
  avgPriceErrorPct: number;
}

interface HorizonBrainProfile {
  horizonHours: 1 | 4 | 24;
  weights: Record<string, number>;
  priorWeights: Record<string, number>;
  biasCorrectionScore: number;
  convictionDeadzone: number;
  bandScaleMultiplier: number;
  totalLearnedSamples: number;
  correctCount: number;
  band90HitCount: number;
  expertHitCounts: Record<string, { right: number; total: number; accuracyPct: number }>;
}

interface LiveAuditPayload {
  strategyVersion: string;
  generatedAt: string;
  startedAtTR: string;
  lastUpdatedAtTR: string;
  liveGoTargetTR: string;
  daysRemaining: number;
  zeroBacktestGuaranteeTR: string;
  portfolio: {
    isRunning: boolean;
    liveUsdTry: number;
    vixLevel: number;
    tickCount: number;
    lastTickAt: string;
    initialCapitalUSD: number;
    totalEquityUSD: number;
    cashBalanceUSD: number;
    availableCashUSD: number;
    allocatedMarginUSD: number;
    realizedPnL_USD: number;
    floatingPnL_USD: number;
    netProfitUSD: number;
    netProfitPercent: number;
    totalFeesAndSwapUSD: number;
    maxDrawdownPercent: number;
    openPositionsCount: number;
    closedTradesCount: number;
    winRatePercent: number;
    profitFactor: number;
    openPositions: any[];
    closedTrades: any[];
    equityHistory: { timestamp: number; timeStr: string; equityUSD: number; ddPct: number }[];
  };
  forecastSummary: {
    totalLocked: number;
    pendingCount: number;
    settledCount: number;
    directionHits: number;
    directionHitRatePct: number;
    highConvictionSettled: number;
    highConvictionHitRatePct: number;
    directionalSettledCount?: number;
    directionalWinRatePct?: number;
    directionalProfitFactor?: number;
    simulated1kDirectionalNetUSD?: number;
    band90CoveragePct: number;
    avgPriceErrorPct: number;
    byHorizon: HorizonStats[];
  };
  aiBrain?: {
    version: string;
    updatedAtTR: string;
    totalPostMortems: number;
    horizons: Record<'1' | '4' | '24', HorizonBrainProfile>;
    rootCauseStats: Record<string, number>;
    recentLessons: AiPostMortem[];
  };
  forecasts: LockedForecast[];
}

interface LiveAuditViewProps {
  onInspectSymbol?: (symbol: string) => void;
}

const EXPERT_SHORT_NAMES: Record<string, string> = {
  E1_MACRO_TREND: 'U1: Makro Trend (EWMAC & SMA200)',
  E2_MICRO_DISPLACEMENT: 'U2: 4S/12S İvme & FVG/OB',
  E3_MEAN_REV_SPRING: 'U3: Çok-Ölçekli Trend İçi Yay',
  E4_CANDLE_VSA_SWEEP: 'U4: Kapanmış Mum, VSA & Sweep',
  E5_XSMOM_REGIME: 'U5: Kesitsel Liderlik & Haber',
};

const fmtUSD = (n: number, decimals = 2) => {
  const safe = Number.isFinite(n) ? n : 0;
  return `${safe < 0 ? '-' : ''}$${Math.abs(safe).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

const fmtSignedUSD = (n: number, decimals = 2) => {
  const safe = Number.isFinite(n) ? n : 0;
  return `${safe > 0 ? '+' : safe < 0 ? '-' : ''}$${Math.abs(safe).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

function formatCountdown(targetAtMs: number, nowMs: number): string {
  const diff = Math.max(0, targetAtMs - nowMs);
  if (diff <= 0) return 'Sonuçlanıyor...';
  const mins = Math.ceil(diff / 60000);
  if (mins < 60) return `${mins} dk kaldı`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}s ${rem}dk kaldı`;
}

export const LiveAuditView: React.FC<LiveAuditViewProps> = ({ onInspectSymbol }) => {
  const [data, setData] = useState<LiveAuditPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [activeSection, setActiveSection] = useState<'forecasts' | 'ai' | 'portfolio'>('forecasts');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'SETTLED'>('ALL');
  const [horizonFilter, setHorizonFilter] = useState<0 | 1 | 4 | 24>(0);
  const [brainHorizonTab, setBrainHorizonTab] = useState<'1' | '4' | '24'>('1');
  const [forecastPage, setForecastPage] = useState<number>(1);
  const [lessonPage, setLessonPage] = useState<number>(1);
  const [closedPage, setClosedPage] = useState<number>(1);

  const FORECASTS_PER_PAGE = 8;
  const LESSONS_PER_PAGE = 4;
  const CLOSED_PER_PAGE = 5;

  const loadAudit = useCallback(async (sync = false) => {
    if (sync) setSyncing(true);
    try {
      const resp = await fetch(
        '/api/live-audit',
        sync
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'sync' }),
            }
          : undefined
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json: LiveAuditPayload = await resp.json();
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Canlı denetim verisi alınamadı.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    loadAudit(false);
    const poll = setInterval(() => loadAudit(false), 15_000);
    const clk = setInterval(() => setNowMs(Date.now()), 10_000);
    return () => {
      clearInterval(poll);
      clearInterval(clk);
    };
  }, [loadAudit]);

  const filteredForecasts = useMemo(() => {
    if (!data) return [];
    return data.forecasts.filter((f) => {
      if (statusFilter === 'PENDING' && f.status !== 'BEKLİYOR') return false;
      if (statusFilter === 'SETTLED' && f.status === 'BEKLİYOR') return false;
      if (horizonFilter !== 0 && f.horizonHours !== horizonFilter) return false;
      return true;
    });
  }, [data, statusFilter, horizonFilter]);

  const totalForecastPages = Math.max(1, Math.ceil(filteredForecasts.length / FORECASTS_PER_PAGE));
  const safeForecastPage = Math.min(forecastPage, totalForecastPages);
  const pagedForecasts = useMemo(
    () =>
      filteredForecasts.slice(
        (safeForecastPage - 1) * FORECASTS_PER_PAGE,
        safeForecastPage * FORECASTS_PER_PAGE
      ),
    [filteredForecasts, safeForecastPage]
  );

  const allLessons = data?.aiBrain?.recentLessons || [];
  const lessons = useMemo(() => {
    const byH = allLessons.filter((l) => l.horizonHours === Number(brainHorizonTab));
    return byH.length > 0 ? byH : allLessons;
  }, [allLessons, brainHorizonTab]);
  const totalLessonPages = Math.max(1, Math.ceil(lessons.length / LESSONS_PER_PAGE));
  const safeLessonPage = Math.min(lessonPage, totalLessonPages);
  const pagedLessons = lessons.slice(
    (safeLessonPage - 1) * LESSONS_PER_PAGE,
    safeLessonPage * LESSONS_PER_PAGE
  );

  const closedTrades = data?.portfolio?.closedTrades || [];
  const totalClosedPages = Math.max(1, Math.ceil(closedTrades.length / CLOSED_PER_PAGE));
  const safeClosedPage = Math.min(closedPage, totalClosedPages);
  const pagedClosedTrades = closedTrades.slice(
    (safeClosedPage - 1) * CLOSED_PER_PAGE,
    safeClosedPage * CLOSED_PER_PAGE
  );

  const equitySvg = useMemo(() => {
    const hist = data?.portfolio?.equityHistory || [];
    if (hist.length < 2) return null;
    const baseCap = data?.portfolio?.initialCapitalUSD || 25_000;
    const W = 860;
    const H = 150;
    const PAD = 18;
    const vals = hist.map((h) => h.equityUSD);
    const minV = Math.min(baseCap, ...vals) - 15;
    const maxV = Math.max(baseCap, ...vals) + 15;
    const xOf = (i: number) => PAD + (i / Math.max(1, hist.length - 1)) * (W - PAD * 2);
    const yOf = (v: number) => PAD + ((maxV - v) / Math.max(1, maxV - minV)) * (H - PAD * 2);
    const path = hist.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.equityUSD).toFixed(1)}`).join(' ');
    const baseY = yOf(baseCap);
    const positive = (data?.portfolio.netProfitUSD ?? 0) >= 0;
    return { W, H, PAD, path, baseY, color: positive ? '#10b981' : '#f43f5e' };
  }, [data]);

  if (loading && !data) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-10 text-center text-xs font-mono text-zinc-400">
        /canli — ZELTRA Cortex v16.0 Öz-Öğrenen Yapay Zeka ve Canlı Doğrulama Defteri yükleniyor...
      </div>
    );
  }

  const p = data?.portfolio;
  const fs = data?.forecastSummary;
  const brain = data?.aiBrain;
  const activeBrainProf = brain?.horizons?.[brainHorizonTab];

  return (
    <div className="space-y-4">
      {/* ÜST DURUM & SENKRON ŞERİDİ */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-semibold">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            Canlı Takip
          </span>
          <span className="text-xs font-mono text-zinc-400">
            Cortex v16.1 • $25K IBKR Pro ({brain?.totalPostMortems || 0} analiz)
          </span>
          {p && (
            <span className="text-xs font-mono text-zinc-500 hidden sm:inline">
              Hesap <strong className="text-emerald-300">USD</strong> • VIX{' '}
              <strong className="text-zinc-300">{p.vixLevel.toFixed(1)}</strong> • {data?.lastUpdatedAtTR}
            </span>
          )}
        </div>

        <button
          onClick={() => loadAudit(true)}
          disabled={syncing}
          className="px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Güncelleniyor...' : 'Güncelle'}
        </button>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-800 text-rose-300 rounded p-3 text-xs flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button
            onClick={() => loadAudit(true)}
            className="px-2.5 py-1 rounded bg-rose-900/50 hover:bg-rose-800 text-rose-100 font-mono"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* SAYFA SEKMELERİ (TEK ODAKLI GÖRÜNÜM) */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800/80 pb-2 text-xs font-semibold">
        {[
          {
            id: 'forecasts',
            label: `Tahminler (${fs?.totalLocked || 0})`,
            sub: fs?.settledCount ? `%${fs.directionHitRatePct} İsabet` : '',
          },
          {
            id: 'ai',
            label: `Yapay Zeka & Öz-Eleştiri (${brain?.totalPostMortems || 0})`,
            sub: '5-Uzman Modeli',
          },
          {
            id: 'portfolio',
            label: `IBKR Portföy (${p ? fmtUSD(p.totalEquityUSD) : '$25,000.00'})`,
            sub: p ? `${p.openPositionsCount} Açık` : '',
          },
        ].map((tab) => {
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              className={`px-3.5 py-2 rounded-md transition-colors flex items-center gap-2 ${
                active
                  ? 'bg-white text-zinc-950 font-bold'
                  : 'bg-zinc-900/70 text-zinc-400 hover:text-white border border-zinc-800'
              }`}
            >
              <span>{tab.label}</span>
              {tab.sub && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    active ? 'bg-zinc-900 text-emerald-300' : 'bg-zinc-950 text-zinc-400'
                  }`}
                >
                  {tab.sub}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 1. USD KASA PERFORMANSI */}
      {activeSection === 'portfolio' && p && (
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Portföy (USD Hesabı)
            </h2>
            <div className="text-[11px] font-mono text-zinc-500">
              Hedef: {data?.liveGoTargetTR} ({data?.daysRemaining} gün)
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5 font-mono">
            <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
              <div className="text-[10px] text-zinc-500 uppercase">Canlı Toplam Kasa</div>
              <div className="text-lg font-black text-white mt-1">{fmtUSD(p.totalEquityUSD)}</div>
              <div className="text-[10px] text-zinc-500">Başlangıç: {fmtUSD(p.initialCapitalUSD)}</div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
              <div className="text-[10px] text-zinc-500 uppercase">Gerçek Net Kâr / Zarar</div>
              <div
                className={`text-lg font-black mt-1 ${
                  p.netProfitUSD > 0 ? 'text-emerald-400' : p.netProfitUSD < 0 ? 'text-rose-400' : 'text-zinc-200'
                }`}
              >
                {fmtSignedUSD(p.netProfitUSD)}
              </div>
              <div
                className={`text-[11px] font-bold ${
                  p.netProfitPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {p.netProfitPercent >= 0 ? '+' : ''}
                {p.netProfitPercent}%
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
              <div className="text-[10px] text-zinc-500 uppercase">Kapanan İşlem K/Z</div>
              <div
                className={`text-base font-bold mt-1 ${
                  p.realizedPnL_USD >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {fmtSignedUSD(p.realizedPnL_USD)}
              </div>
              <div className="text-[10px] text-zinc-500">
                {p.closedTradesCount} işlem • WR %{p.winRatePercent}
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
              <div className="text-[10px] text-zinc-500 uppercase">Açık Pozisyon K/Z</div>
              <div
                className={`text-base font-bold mt-1 ${
                  p.floatingPnL_USD >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {fmtSignedUSD(p.floatingPnL_USD)}
              </div>
              <div className="text-[10px] text-zinc-500">
                {p.openPositionsCount} açık • Teminat {fmtUSD(p.allocatedMarginUSD)}
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
              <div className="text-[10px] text-zinc-500 uppercase">IBKR Komisyon + Swap</div>
              <div className="text-base font-bold text-amber-300 mt-1">-{fmtUSD(p.totalFeesAndSwapUSD)}</div>
              <div className="text-[10px] text-zinc-500">Gerçek kesintiler</div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
              <div className="text-[10px] text-zinc-500 uppercase">Gerçek MaxDD</div>
              <div className="text-base font-bold text-cyan-300 mt-1">%{p.maxDrawdownPercent}</div>
              <div className="text-[10px] text-zinc-500">
                {p.isRunning ? '60sn otomatik aktif' : 'Duraklatıldı'}
              </div>
            </div>
          </div>

          {equitySvg && (
            <div className="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>Gerçek Zamanlı Canlı Kasa Eğrisi ({p.equityHistory.length} anlık kayıt — sıfır simülasyon)</span>
                <span>{fmtUSD(p.initialCapitalUSD)} referans çizgisi</span>
              </div>
              <svg viewBox={`0 0 ${equitySvg.W} ${equitySvg.H}`} className="w-full h-32 block">
                <line
                  x1={equitySvg.PAD}
                  y1={equitySvg.baseY}
                  x2={equitySvg.W - equitySvg.PAD}
                  y2={equitySvg.baseY}
                  stroke="#52525b"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <path d={equitySvg.path} fill="none" stroke={equitySvg.color} strokeWidth="2.2" />
              </svg>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-2">
              <div className="text-xs font-bold text-white flex justify-between">
                <span>Şu An Açık Canlı Pozisyonlar ({p.openPositions.length})</span>
                <span className="text-[10px] font-mono text-zinc-500">Anlık piyasa fiyatıyla değerlenir</span>
              </div>
              {p.openPositions.length === 0 ? (
                <div className="text-xs text-zinc-500 py-4 text-center">
                  Aktif açık pozisyon yok. Bot yalnızca yüksek olasılıklı 12H/Günlük 3-Pod sinyallerinde pozisyon açar.
                </div>
              ) : (
                <div className="space-y-2">
                  {p.openPositions.map((pos: any) => (
                    <div
                      key={pos.id}
                      className="bg-zinc-900 border border-zinc-800 rounded p-2.5 text-xs font-mono space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onInspectSymbol?.(pos.symbol)}
                            className="font-bold text-white hover:text-cyan-300 flex items-center gap-0.5"
                          >
                            {pos.symbol} <ArrowUpRight className="w-3 h-3" />
                          </button>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              pos.direction === 'AL (LONG)'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {pos.direction}
                          </span>
                          <span className="text-[10px] text-cyan-400">{pos.pod}</span>
                        </div>
                        <span
                          className={`font-bold ${
                            pos.totalPnL_USD >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {fmtSignedUSD(pos.totalPnL_USD)} ({pos.totalPnL_Percent >= 0 ? '+' : ''}
                          {pos.totalPnL_Percent}%)
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-between text-[11px] text-zinc-400">
                        <span>Açılış: {pos.entryTime}</span>
                        <span>
                          Giriş <strong className="text-zinc-200">{pos.entryPrice}</strong> → Anlık{' '}
                          <strong className="text-white">{pos.currentPrice}</strong>
                        </span>
                        <span>
                          SL <strong className="text-rose-400">{pos.stopLoss}</strong> • TP{' '}
                          <strong className="text-emerald-400">
                            {pos.takeProfit2 > 0 ? pos.takeProfit2 : 'Trailing'}
                          </strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-2">
              <div className="text-xs font-bold text-white flex justify-between">
                <span>Kapanan İşlemler ({p.closedTrades.length})</span>
                {p.closedTrades.length > CLOSED_PER_PAGE && (
                  <span className="text-[10px] font-mono text-zinc-500">
                    Sayfa {safeClosedPage} / {totalClosedPages}
                  </span>
                )}
              </div>
              {p.closedTrades.length === 0 ? (
                <div className="text-xs text-zinc-500 py-4 text-center">
                  Henüz kapanan canlı işlem yok.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {pagedClosedTrades.map((t: any) => (
                    <div
                      key={t.id}
                      className="bg-zinc-900 border border-zinc-800 rounded p-2 text-xs font-mono flex items-center justify-between gap-2"
                    >
                      <div>
                        <span className="font-bold text-white">{t.symbol}</span>{' '}
                        <span className="text-[10px] text-zinc-400">
                          {t.direction} • {t.entryPrice} → {t.closePrice}
                        </span>
                        <div className="text-[10px] text-zinc-500">
                          {t.closeTime} • {t.exitReason}
                        </div>
                      </div>
                      <span
                        className={`font-bold shrink-0 ${
                          t.realizedPnL_USD >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {fmtSignedUSD(t.realizedPnL_USD)}
                      </span>
                    </div>
                  ))}
                  {totalClosedPages > 1 && (
                    <div className="flex items-center justify-between pt-2 text-[11px] font-mono">
                      <button
                        onClick={() => setClosedPage((p) => Math.max(1, p - 1))}
                        disabled={safeClosedPage <= 1}
                        className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-40"
                      >
                        ← Önceki
                      </button>
                      <span className="text-zinc-500">
                        {safeClosedPage} / {totalClosedPages}
                      </span>
                      <button
                        onClick={() => setClosedPage((p) => Math.min(totalClosedPages, p + 1))}
                        disabled={safeClosedPage >= totalClosedPages}
                        className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-40"
                      >
                        Sonraki →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. CORTEX v16.0 MODEL AĞIRLIKLARI & ÖZ-ELEŞTİRİ */}
      {activeSection === 'ai' && brain && activeBrainProf && (
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-cyan-400" />
              Cortex v16.0 Model Ağırlıkları
            </h2>

            <div className="flex items-center gap-1 font-mono text-xs">
              {(['1', '4', '24'] as const).map((hk) => (
                <button
                  key={hk}
                  onClick={() => {
                    setBrainHorizonTab(hk);
                    setLessonPage(1);
                  }}
                  className={`px-3 py-1 rounded border transition-colors ${
                    brainHorizonTab === hk
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                  }`}
                >
                  +{hk}S
                </button>
              ))}
            </div>
          </div>

          {/* 5 Uzman Adaptif Ağırlık & Başarı Kartları */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 font-mono">
            {Object.keys(EXPERT_SHORT_NAMES).map((expKey) => {
              const curW = (activeBrainProf.weights[expKey] ?? 0.2) * 100;
              const priorW = (activeBrainProf.priorWeights[expKey] ?? 0.2) * 100;
              const diffW = curW - priorW;
              const hitStat = activeBrainProf.expertHitCounts?.[expKey] || { right: 0, total: 0, accuracyPct: 50 };
              return (
                <div key={expKey} className="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-1.5">
                  <div className="text-[11px] font-bold text-zinc-200 leading-tight">
                    {EXPERT_SHORT_NAMES[expKey]}
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-black text-cyan-300">%{curW.toFixed(1)}</span>
                    <span
                      className={`text-[10px] font-bold ${
                        diffW > 0.1 ? 'text-emerald-400' : diffW < -0.1 ? 'text-rose-400' : 'text-zinc-500'
                      }`}
                    >
                      ({diffW >= 0 ? '+' : ''}
                      {diffW.toFixed(1)}% evrim)
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 transition-all"
                      style={{ width: `${Math.min(100, curW * 2)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-zinc-400 flex justify-between pt-0.5">
                    <span>Tekil İsabet:</span>
                    <strong className={hitStat.accuracyPct >= 52 ? 'text-emerald-400' : 'text-zinc-300'}>
                      %{hitStat.accuracyPct} ({hitStat.right}/{hitStat.total})
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Adaptif Kalibrasyon Parametreleri */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono text-xs">
            <div className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 flex items-center justify-between">
              <span className="text-zinc-400">Dinamik Bias (Yön Kayması) Düzeltmesi:</span>
              <strong
                className={
                  activeBrainProf.biasCorrectionScore > 0
                    ? 'text-emerald-400'
                    : activeBrainProf.biasCorrectionScore < 0
                      ? 'text-rose-400'
                      : 'text-zinc-200'
                }
              >
                {activeBrainProf.biasCorrectionScore >= 0 ? '+' : ''}
                {activeBrainProf.biasCorrectionScore} puan
              </strong>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 flex items-center justify-between">
              <span className="text-zinc-400">%90 Güven Bandı Adaptif Çarpanı:</span>
              <strong className="text-violet-300">{activeBrainProf.bandScaleMultiplier}x σ</strong>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 flex items-center justify-between">
              <span className="text-zinc-400">Yönsüz Gürültü Filtresi (Deadzone):</span>
              <strong className="text-amber-300">±{activeBrainProf.convictionDeadzone} puan</strong>
            </div>
          </div>

          {/* Yapay Zeka Öz-Eleştiri & Öğrenilen Dersler Akışı (Sayfa Sayfa) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-zinc-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Öz-Eleştiriler ({lessons.length})
              </span>
              {totalLessonPages > 1 && (
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <button
                    onClick={() => setLessonPage((p) => Math.max(1, p - 1))}
                    disabled={safeLessonPage <= 1}
                    className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 disabled:opacity-40"
                  >
                    ← Önceki
                  </button>
                  <span className="text-zinc-400">
                    Sayfa {safeLessonPage} / {totalLessonPages}
                  </span>
                  <button
                    onClick={() => setLessonPage((p) => Math.min(totalLessonPages, p + 1))}
                    disabled={safeLessonPage >= totalLessonPages}
                    className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 disabled:opacity-40"
                  >
                    Sonraki →
                  </button>
                </div>
              )}
            </div>

            {lessons.length === 0 ? (
              <div className="p-4 text-xs text-zinc-500 bg-zinc-950 rounded border border-zinc-800 text-center">
                Henüz sonuçlanan tahmin yok.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {pagedLessons.map((pm) => {
                  const isOk = pm.outcome === 'DOĞRU' || pm.outcome === 'YATAY_NÖTR';
                  return (
                    <div
                      key={pm.id}
                      className={`rounded p-3 border text-xs space-y-1.5 ${
                        isOk
                          ? 'bg-emerald-950/15 border-emerald-800/40'
                          : 'bg-rose-950/15 border-rose-800/40'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white">{pm.symbol}</span>
                          <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-cyan-300 text-[10px]">
                            +{pm.horizonHours}S
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              isOk
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {pm.outcome}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-400">{pm.rootCauseTitleTR}</span>
                      </div>

                      <p className="text-[11px] text-zinc-200 leading-relaxed">{pm.whyItHappenedTR}</p>
                      <p className="text-[11px] text-cyan-300/90 leading-relaxed font-medium">
                        ↳ {pm.nextTimeActionTR}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono text-zinc-400 pt-1 border-t border-zinc-800/70">
                        <span className="text-emerald-400/90 truncate">✓ {pm.winningExpertLabelTR}</span>
                        {pm.misleadingExpertLabelTR && (
                          <span className="text-rose-400/90 truncate">✗ {pm.misleadingExpertLabelTR}</span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 truncate">
                        {pm.weightDeltaSummaryTR}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. TAHMİN PERFORMANSI & KAYITLAR (SAYFA SAYFA) */}
      {activeSection === 'forecasts' && fs && data && (
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-cyan-400" />
              Tahminler (+1S / +4S / +24S)
            </h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5 font-mono">
            <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
              <div className="text-[10px] text-zinc-500">Kilitlenen Tahmin</div>
              <div className="text-base font-bold text-white mt-0.5">{fs.totalLocked}</div>
              <div className="text-[10px] text-amber-400">{fs.pendingCount} bekliyor</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
              <div className="text-[10px] text-zinc-500">Sonuçlanan (Gerçek)</div>
              <div className="text-base font-bold text-cyan-300 mt-0.5">{fs.settledCount}</div>
              <div className="text-[10px] text-zinc-500">{fs.directionHits} yön isabeti</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
              <div className="text-[10px] text-zinc-500">Gerçek Yön İsabeti</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">
                {fs.settledCount > 0 ? `%${fs.directionHitRatePct}` : 'Bekleniyor'}
              </div>
              <div className="text-[10px] text-zinc-500">
                {typeof fs.directionalWinRatePct === 'number' && fs.directionalSettledCount
                  ? `Saf Yönlü: %${fs.directionalWinRatePct} (n=${fs.directionalSettledCount})`
                  : 'Tüm sonuçlananlar'}
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
              <div className="text-[10px] text-zinc-500">Yüksek İnanç (|Cortex|≥12)</div>
              <div className="text-base font-bold text-emerald-300 mt-0.5">
                {fs.highConvictionSettled > 0 ? `%${fs.highConvictionHitRatePct}` : 'Bekleniyor'}
              </div>
              <div className="text-[10px] text-zinc-500">
                n={fs.highConvictionSettled}
                {typeof fs.simulated1kDirectionalNetUSD === 'number' && fs.directionalSettledCount
                  ? ` • ${fmtSignedUSD(fs.simulated1kDirectionalNetUSD)} (PF ${fs.directionalProfitFactor ?? '-'})`
                  : ''}
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
              <div className="text-[10px] text-zinc-500">%90 Bant İsabeti</div>
              <div className="text-base font-bold text-violet-300 mt-0.5">
                {fs.settledCount > 0 ? `%${fs.band90CoveragePct}` : 'Bekleniyor'}
              </div>
              <div className="text-[10px] text-zinc-500">Hedef: ~%90</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
              <div className="text-[10px] text-zinc-500">Ort. Fiyat Sapması</div>
              <div className="text-base font-bold text-zinc-200 mt-0.5">
                {fs.settledCount > 0 ? `%${fs.avgPriceErrorPct}` : '-'}
              </div>
              <div className="text-[10px] text-zinc-500">|Gerçek - Tahmin|</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 font-mono text-xs">
            {fs.byHorizon.map((hs) => (
              <div key={hs.horizonHours} className="bg-zinc-950 border border-zinc-800 rounded p-3 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">+{hs.horizonHours} Saatlik Tahminler</div>
                  <div className="text-[11px] text-zinc-400">
                    {hs.totalLocked} kilitli • {hs.pending} bekliyor • {hs.settled} sonuçlandı
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-emerald-400">
                    {hs.settled > 0 ? `%${hs.directionHitRatePct}` : '⏳'}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {hs.settled > 0 ? `Bant %${hs.band90CoveragePct}` : 'Vade bekleniyor'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-1">
              {([
                ['ALL', `TÜMÜ (${data.forecasts.length})`],
                ['PENDING', `BEKLEYEN (${fs.pendingCount})`],
                ['SETTLED', `SONUÇLANAN (${fs.settledCount})`],
              ] as const).map(([id, lbl]) => (
                <button
                  key={id}
                  onClick={() => {
                    setStatusFilter(id);
                    setForecastPage(1);
                  }}
                  className={`px-2.5 py-1 rounded border transition-colors ${
                    statusFilter === id
                      ? 'bg-white text-zinc-950 font-bold border-white'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              {([0, 1, 4, 24] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => {
                    setHorizonFilter(h);
                    setForecastPage(1);
                  }}
                  className={`px-2.5 py-1 rounded border transition-colors ${
                    horizonFilter === h
                      ? 'bg-cyan-500/20 text-cyan-300 font-bold border-cyan-500/40'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                  }`}
                >
                  {h === 0 ? 'TÜM UFUKLAR' : `+${h} SAAT`}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-[10px] text-left">
                  <th className="py-2 pr-2">Varlık & Ufuk</th>
                  <th className="py-2 px-2">Kilit → Hedef Zamanı</th>
                  <th className="py-2 px-2 text-right">Kilit Fiyatı (T0)</th>
                  <th className="py-2 px-2 text-right">Cortex v16 Tahmini</th>
                  <th className="py-2 px-2 text-right">Canlı / Gerçekleşen</th>
                  <th className="py-2 pl-2 text-right">Sonuç & AI Teşhisi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {pagedForecasts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500">
                      Seçili filtrede kilitli tahmin bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  pagedForecasts.map((f) => {
                    const isPending = f.status === 'BEKLİYOR';
                    const liveOrActual = isPending ? f.currentLivePrice : (f.actualPrice ?? f.currentLivePrice);
                    const movePct = isPending ? f.currentMovePct : (f.actualMovePct ?? f.currentMovePct);
                    const currentlyMatchingDir =
                      f.expectedDirection === 'YÜKSELİŞ'
                        ? liveOrActual >= f.baselinePrice
                        : f.expectedDirection === 'DÜŞÜŞ'
                          ? liveOrActual <= f.baselinePrice
                          : true;

                    return (
                      <tr key={f.id} className="hover:bg-zinc-800/30">
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => onInspectSymbol?.(f.symbol)}
                              className="font-bold text-white hover:text-cyan-300"
                            >
                              {f.symbol}
                            </button>
                            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-cyan-300 text-[10px] font-bold">
                              +{f.horizonHours}S
                            </span>
                            {f.confluenceTier && f.confluenceTier !== 'CHOP' && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[9px] font-bold">
                                {f.confluenceTier}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            Skor {f.zacScore >= 0 ? `+${f.zacScore}` : f.zacScore} • %{f.pUp} ↑
                          </div>
                          {f.patternLabelAtEntryTR && (
                            <div className="text-[10px] text-cyan-400/90 font-sans truncate max-w-[210px]">
                              {f.patternLabelAtEntryTR}
                            </div>
                          )}
                          {f.dominantExpertLabelTR && (
                            <div className="text-[9px] text-zinc-500 font-sans truncate max-w-[210px]">
                              {f.dominantExpertLabelTR}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-2 text-[11px]">
                          <div className="text-zinc-300">{f.lockedAtTR}</div>
                          <div className="text-zinc-500 flex items-center gap-1">
                            <span>→ {f.targetAtTR}</span>
                            {isPending && (
                              <span className="text-amber-300 font-semibold">
                                ({formatCountdown(f.targetAtMs, nowMs)})
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-2 text-right text-zinc-300">
                          {f.baselinePrice.toFixed(f.digits)}
                        </td>

                        <td className="py-2.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-1 font-bold text-white">
                            {f.expectedDirection === 'YÜKSELİŞ' && <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
                            {f.expectedDirection === 'DÜŞÜŞ' && <TrendingDown className="w-3.5 h-3.5 text-rose-400" />}
                            <span>{f.predictedPrice.toFixed(f.digits)}</span>
                            <span
                              className={`text-[10px] ${
                                f.predictedMovePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              ({f.predictedMovePct >= 0 ? '+' : ''}
                              {f.predictedMovePct}%)
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            %90 Bant: {f.lower90.toFixed(f.digits)} – {f.upper90.toFixed(f.digits)}
                          </div>
                        </td>

                        <td className="py-2.5 px-2 text-right">
                          <div className="font-bold text-white">{liveOrActual.toFixed(f.digits)}</div>
                          <div
                            className={`text-[10px] font-semibold ${
                              movePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {movePct >= 0 ? '+' : ''}
                            {movePct}% {isPending ? '(Canlı)' : '(Kesin)'}
                          </div>
                        </td>

                        <td className="py-2.5 pl-2 text-right">
                          {isPending ? (
                            <div className="inline-flex flex-col items-end">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                  currentlyMatchingDir
                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                <Clock className="w-3 h-3" />
                                {currentlyMatchingDir ? 'BEKLİYOR (Yönünde)' : 'BEKLİYOR (Tersinde)'}
                              </span>
                            </div>
                          ) : f.status === 'DOĞRU' ? (
                            <div className="inline-flex flex-col items-end">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                                <CheckCircle2 className="w-3 h-3" /> DOĞRU
                              </span>
                              <span className="text-[10px] text-zinc-400 mt-0.5">
                                Sapma %{f.priceErrorPct} • Bant {f.inside90Band ? '✓' : '✗'}
                              </span>
                              {f.postMortem && (
                                <span className="text-[10px] text-emerald-400/90 font-sans">
                                  {f.postMortem.rootCauseTitleTR}
                                </span>
                              )}
                            </div>
                          ) : f.status === 'YANLIŞ' ? (
                            <div className="inline-flex flex-col items-end">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold">
                                <XCircle className="w-3 h-3" /> YANLIŞ
                              </span>
                              <span className="text-[10px] text-zinc-400 mt-0.5">
                                Sapma %{f.priceErrorPct} • Bant {f.inside90Band ? '✓' : '✗'}
                              </span>
                              {f.postMortem && (
                                <span className="text-[10px] text-rose-300 font-sans">
                                  {f.postMortem.rootCauseTitleTR}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-bold">
                              NÖTR ({f.inside90Band ? 'Bant İçi ✓' : 'Bant Dışı'})
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* TAHMİN TABLOSU SAYFALAMA ÇUBUĞU */}
          {totalForecastPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-zinc-800/80 text-xs font-mono">
              <div className="text-zinc-500">
                Sayfa <strong className="text-zinc-200">{safeForecastPage}</strong> / {totalForecastPages} •{' '}
                Toplam {filteredForecasts.length} kayıt ({(safeForecastPage - 1) * FORECASTS_PER_PAGE + 1}–
                {Math.min(filteredForecasts.length, safeForecastPage * FORECASTS_PER_PAGE)})
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setForecastPage((p) => Math.max(1, p - 1))}
                  disabled={safeForecastPage <= 1}
                  className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40"
                >
                  ← Önceki
                </button>

                {Array.from({ length: totalForecastPages }, (_, i) => i + 1)
                  .filter(
                    (pg) =>
                      pg === 1 ||
                      pg === totalForecastPages ||
                      Math.abs(pg - safeForecastPage) <= 2
                  )
                  .map((pg, idx, arr) => {
                    const prev = arr[idx - 1];
                    const showEllipsis = prev && pg - prev > 1;
                    return (
                      <React.Fragment key={pg}>
                        {showEllipsis && <span className="px-1 text-zinc-600">…</span>}
                        <button
                          onClick={() => setForecastPage(pg)}
                          className={`w-7 h-7 rounded border transition-colors ${
                            pg === safeForecastPage
                              ? 'bg-white text-zinc-950 font-bold border-white'
                              : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                          }`}
                        >
                          {pg}
                        </button>
                      </React.Fragment>
                    );
                  })}

                <button
                  onClick={() => setForecastPage((p) => Math.min(totalForecastPages, p + 1))}
                  disabled={safeForecastPage >= totalForecastPages}
                  className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40"
                >
                  Sonraki →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

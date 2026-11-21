import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Lock,
  Radio,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';

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
  lower90: number;
  upper90: number;
  zacScore: number;
  pUp: number;
  activePod: string;
  regimeLabelTR: string;
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
    initialCapitalTRY: number;
    totalEquityTRY: number;
    cashBalanceTRY: number;
    availableCashTRY: number;
    allocatedMarginTRY: number;
    realizedPnL_TRY: number;
    floatingPnL_TRY: number;
    netProfitTRY: number;
    netProfitPercent: number;
    totalFeesAndSwapTRY: number;
    maxDrawdownPercent: number;
    openPositionsCount: number;
    closedTradesCount: number;
    winRatePercent: number;
    profitFactor: number;
    openPositions: any[];
    closedTrades: any[];
    equityHistory: { timestamp: number; timeStr: string; equityTRY: number; ddPct: number }[];
  };
  forecastSummary: {
    totalLocked: number;
    pendingCount: number;
    settledCount: number;
    directionHits: number;
    directionHitRatePct: number;
    highConvictionSettled: number;
    highConvictionHitRatePct: number;
    band90CoveragePct: number;
    avgPriceErrorPct: number;
    byHorizon: HorizonStats[];
  };
  forecasts: LockedForecast[];
}

interface LiveAuditViewProps {
  onInspectSymbol?: (symbol: string) => void;
}

const fmtTL = (n: number) =>
  `${n < 0 ? '-' : ''}${Math.abs(Math.round(n)).toLocaleString('tr-TR')} TL`;

const fmtSignedTL = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(Math.round(n)).toLocaleString('tr-TR')} TL`;

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
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'SETTLED'>('ALL');
  const [horizonFilter, setHorizonFilter] = useState<0 | 1 | 4 | 24>(0);

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

  const equitySvg = useMemo(() => {
    const hist = data?.portfolio?.equityHistory || [];
    if (hist.length < 2) return null;
    const W = 860;
    const H = 150;
    const PAD = 18;
    const vals = hist.map((h) => h.equityTRY);
    const minV = Math.min(250_000, ...vals) - 500;
    const maxV = Math.max(250_000, ...vals) + 500;
    const xOf = (i: number) => PAD + (i / Math.max(1, hist.length - 1)) * (W - PAD * 2);
    const yOf = (v: number) => PAD + ((maxV - v) / Math.max(1, maxV - minV)) * (H - PAD * 2);
    const path = hist.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.equityTRY).toFixed(1)}`).join(' ');
    const baseY = yOf(250_000);
    const positive = (data?.portfolio.netProfitTRY ?? 0) >= 0;
    return { W, H, PAD, path, baseY, color: positive ? '#10b981' : '#f43f5e' };
  }, [data]);

  if (loading && !data) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-10 text-center text-xs font-mono text-zinc-400">
        /canli — Gerçek zamanlı kilitli tahmin ve canlı kasa defteri yükleniyor...
      </div>
    );
  }

  const p = data?.portfolio;
  const fs = data?.forecastSummary;

  return (
    <div className="space-y-5">
      {/* 1. SIFIR BACKTEST GARANTİ BAŞLIĞI */}
      <div className="bg-gradient-to-r from-emerald-950/50 via-zinc-900 to-zinc-900 border border-emerald-700/40 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-[11px] font-mono font-bold">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              %100 GERÇEK ZAMANLI — SIFIR GEÇMİŞ SİMÜLASYON (/canli)
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 flex items-center gap-1">
              <Lock className="w-3 h-3 text-cyan-400" />
              Kayıt Başlangıcı: {data?.startedAtTR}
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/15 border border-violet-500/30 text-violet-300">
              Canlı Geçiş: {data?.liveGoTargetTR} ({data?.daysRemaining} gün)
            </span>
          </div>
          <h1 className="text-lg font-bold text-white">
            Gerçek Zamanlı Kâr / Zarar & Mühürlü Tahmin Doğrulama Defteri
          </h1>
          <p className="text-xs text-zinc-300 max-w-3xl leading-relaxed">
            {data?.zeroBacktestGuaranteeTR}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => loadAudit(true)}
            disabled={syncing}
            className="px-3.5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Canlı Senkronize Ediliyor...' : 'Anlık Fiyatla Güncelle & Kilitle'}
          </button>
        </div>
      </div>

      {/* 2. BÖLÜM 1 — GERÇEK ZAMANLI PARA KAZANIYOR MUYUZ? (250.000 TL CANLI KASA) */}
      {p && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              1. Gerçek Zamanlı 250.000 TL Kasa Performansı (İleriye Dönük Canlı Emirler)
            </h2>
            <div className="text-[11px] font-mono text-zinc-400">
              USD/TRY: <strong className="text-zinc-200">{p.liveUsdTry.toFixed(2)}</strong> •
              VIX: <strong className="text-zinc-200">{p.vixLevel.toFixed(1)}</strong> •
              Son Güncelleme: <strong className="text-zinc-200">{data?.lastUpdatedAtTR}</strong>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5 font-mono">
            <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
              <div className="text-[10px] text-zinc-500 uppercase">Canlı Toplam Kasa</div>
              <div className="text-lg font-black text-white mt-1">{fmtTL(p.totalEquityTRY)}</div>
              <div className="text-[10px] text-zinc-500">Başlangıç: 250.000 TL</div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
              <div className="text-[10px] text-zinc-500 uppercase">Gerçek Net Kâr / Zarar</div>
              <div
                className={`text-lg font-black mt-1 ${
                  p.netProfitTRY > 0 ? 'text-emerald-400' : p.netProfitTRY < 0 ? 'text-rose-400' : 'text-zinc-200'
                }`}
              >
                {fmtSignedTL(p.netProfitTRY)}
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
                  p.realizedPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {fmtSignedTL(p.realizedPnL_TRY)}
              </div>
              <div className="text-[10px] text-zinc-500">
                {p.closedTradesCount} işlem • WR %{p.winRatePercent}
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
              <div className="text-[10px] text-zinc-500 uppercase">Açık Pozisyon K/Z</div>
              <div
                className={`text-base font-bold mt-1 ${
                  p.floatingPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {fmtSignedTL(p.floatingPnL_TRY)}
              </div>
              <div className="text-[10px] text-zinc-500">
                {p.openPositionsCount} açık • Teminat {fmtTL(p.allocatedMarginTRY)}
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
              <div className="text-[10px] text-zinc-500 uppercase">IBKR Komisyon + Swap</div>
              <div className="text-base font-bold text-amber-300 mt-1">-{fmtTL(p.totalFeesAndSwapTRY)}</div>
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

          {/* Sadece Gerçek Zamanlı Canlı Sermaye Eğrisi */}
          {equitySvg && (
            <div className="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>Gerçek Zamanlı Canlı Kasa Eğrisi ({p.equityHistory.length} anlık kayıt — sıfır simülasyon)</span>
                <span>250.000 TL referans çizgisi</span>
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

          {/* Canlı Açık Pozisyonlar & Gerçekleşmiş Kapanan İşlemler */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Açık Pozisyonlar */}
            <div className="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-2">
              <div className="text-xs font-bold text-white flex justify-between">
                <span>Şu An Açık Canlı Pozisyonlar ({p.openPositions.length})</span>
                <span className="text-[10px] font-mono text-zinc-500">Anlık piyasa fiyatıyla değerlenir</span>
              </div>
              {p.openPositions.length === 0 ? (
                <div className="text-xs text-zinc-500 py-4 text-center">Aktif açık pozisyon yok.</div>
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
                            pos.totalPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {fmtSignedTL(pos.totalPnL_TRY)} ({pos.totalPnL_Percent >= 0 ? '+' : ''}
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

            {/* Gerçekleşmiş Kapanan İşlemler */}
            <div className="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-2">
              <div className="text-xs font-bold text-white flex justify-between">
                <span>Gerçekleşmiş Kapanan Canlı İşlemler ({p.closedTrades.length})</span>
                <span className="text-[10px] font-mono text-zinc-500">Kesinleşmiş net TL sonuçları</span>
              </div>
              {p.closedTrades.length === 0 ? (
                <div className="text-xs text-zinc-500 py-4 text-center leading-relaxed">
                  Henüz kapanan canlı işlem yok. Açılan pozisyonlar hedef (TP) veya iz süren stop ile kapandığında gerçek kâr/zarar kalıcı olarak buraya işlenir.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {p.closedTrades.slice(0, 20).map((t: any) => (
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
                          t.realizedPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {fmtSignedTL(t.realizedPnL_TRY)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. BÖLÜM 2 — MÜHÜRLÜ İLERİ-DÖNÜK TAHMİN vs GERÇEKLEŞEN FİYAT DEFTERİ */}
      {fs && data && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-cyan-400" />
                2. Mühürlü İleri-Dönük Tahminler vs Gerçekleşen Piyasa Fiyatları (+1S / +4S / +24S)
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Her tahmin vadesi gelmeden önce kilitlenir; vade dolduğunda gerçek canlı fiyatla otomatik karşılaştırılır ve değiştirilemez.
              </p>
            </div>
          </div>

          {/* Özet Metrik Şeridi */}
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
              <div className="text-[10px] text-zinc-500">Tüm sonuçlananlar</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
              <div className="text-[10px] text-zinc-500">Yüksek İnanç (|ZAC|≥35)</div>
              <div className="text-base font-bold text-emerald-300 mt-0.5">
                {fs.highConvictionSettled > 0 ? `%${fs.highConvictionHitRatePct}` : 'Bekleniyor'}
              </div>
              <div className="text-[10px] text-zinc-500">n={fs.highConvictionSettled}</div>
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

          {/* Ufuk Bazlı Özet Kartları (+1S, +4S, +24S) */}
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

          {/* Filtreler */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-1">
              {([
                ['ALL', `TÜMÜ (${data.forecasts.length})`],
                ['PENDING', `BEKLEYEN (${fs.pendingCount})`],
                ['SETTLED', `SONUÇLANAN (${fs.settledCount})`],
              ] as const).map(([id, lbl]) => (
                <button
                  key={id}
                  onClick={() => setStatusFilter(id)}
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
                  onClick={() => setHorizonFilter(h)}
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

          {/* Kilitli Tahmin vs Gerçekleşen Tablosu */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-[10px] text-left">
                  <th className="py-2 pr-2">Varlık & Ufuk</th>
                  <th className="py-2 px-2">Kilit → Hedef Zamanı</th>
                  <th className="py-2 px-2 text-right">Kilit Fiyatı (T0)</th>
                  <th className="py-2 px-2 text-right">Botun Tahmini (Kilitli)</th>
                  <th className="py-2 px-2 text-right">Canlı / Gerçekleşen</th>
                  <th className="py-2 pl-2 text-right">Doğrulama Sonucu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredForecasts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500">
                      Seçili filtrede kilitli tahmin bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  filteredForecasts.map((f) => {
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
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            ZAC {f.zacScore >= 0 ? `+${f.zacScore}` : f.zacScore} • %{f.pUp} ↑
                          </div>
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
                            </div>
                          ) : f.status === 'YANLIŞ' ? (
                            <div className="inline-flex flex-col items-end">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold">
                                <XCircle className="w-3 h-3" /> YANLIŞ
                              </span>
                              <span className="text-[10px] text-zinc-400 mt-0.5">
                                Sapma %{f.priceErrorPct} • Bant {f.inside90Band ? '✓' : '✗'}
                              </span>
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
        </div>
      )}
    </div>
  );
};

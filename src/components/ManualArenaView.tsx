import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  Award,
  Bot,
  Edit3,
  Layers,
  RefreshCw,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  User,
  Zap,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface AutonomousTradeItem {
  id: string;
  symbol: string;
  name: string;
  digits: number;
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  status: string;
  entryTime: string;
  entryTimestamp: number;
  closeTime?: string;
  closeTimestamp?: number;
  entryPrice: number;
  currentPrice: number;
  closePrice?: number;
  bidAtTick?: number;
  askAtTick?: number;
  takeProfit1: number;
  takeProfit2: number;
  stopLoss: number;
  allocatedCapitalUSD: number;
  notionalValueUSD?: number;
  effectiveLeverage?: number;
  positionSizeUnits: number;
  unitLabel?: string;
  spot1xEquivalentPnL_USD?: number;
  executionCostUSD?: number;
  entryCommissionUSD?: number;
  exitCommissionUSD?: number;
  financingCostUSD?: number;
  grossUnrealizedPnL_USD?: number;
  tp1Hit: boolean;
  realizedPnL_USD: number;
  unrealizedPnL_USD: number;
  totalPnL_USD: number;
  totalPnL_Percent: number;
  rationale: string;
  exitReason?: string;
}

interface ActivityLogItem {
  id: string;
  timestamp: string;
  type: 'ENTRY' | 'TP1_PARTIAL' | 'TP2_FULL' | 'STOP_LOSS' | 'BREAKEVEN_EXIT' | 'SYSTEM';
  symbol: string;
  message: string;
  pnlImpactUSD?: number;
}

interface AutonomousLedgerState {
  botId: string;
  strategyVersion?: string;
  isRunning: boolean;
  startedAt: string;
  lastTickAt: string;
  liveUsdTry: number;
  initialCapitalUSD: number;
  cashBalanceUSD: number;
  allocatedMarginUSD: number;
  availableCashUSD: number;
  openFloatingPnL_USD: number;
  totalEquityUSD: number;
  netProfitUSD: number;
  netProfitPercent: number;
  openPositions: AutonomousTradeItem[];
  closedTrades: AutonomousTradeItem[];
  activityLog: ActivityLogItem[];
  metrics: {
    totalClosedTrades: number;
    openPositionsCount: number;
    winningTrades: number;
    losingTrades: number;
    winRatePercent: number;
    profitFactor: number;
    avgWinUSD: number;
    avgLossUSD: number;
    expectancyUSD: number;
    maxDrawdownPercent: number;
    totalSpreadAndCommissionUSD: number;
    activeNotionalVolumeUSD?: number;
    avgMarginLeverage?: number;
    spot1xTotalNetProfitUSD?: number;
  };
}

export interface ArenaUniverseItem {
  symbol: string;
  name: string;
  digits: number;
  unitLabel: string;
  cluster: string;
  maxIbkrLeverage: number;
  ibkrCommissionRate: number;
  ibkrMinFeeUSD: number;
  ibkrPerShareUSD?: number;
  ibkrMaxFeePct?: number;
  spreadPts: number;
  slippagePts: number;
  price: number;
  bid: number;
  ask: number;
  change24hPercent: number;
  isOpen: boolean;
  closedReason?: string;
  botStatus?: string;
  botDirection?: string;
  botScore?: number;
  botReason?: string;
}

export interface ArenaComparisonSummary {
  userEquityUSD: number;
  botEquityUSD: number;
  leadUSD: number;
  leader: 'USER' | 'BOT' | 'TIE';
  userNetPct: number;
  botNetPct: number;
  userTradesTotal: number;
  botTradesTotal: number;
  userWinRate: number;
  botWinRate: number;
  userDirAccuracy: number;
  botDirAccuracy: number;
  userPF: number;
  botPF: number;
  userFeesUSD: number;
  botFeesUSD: number;
  userSpot1xUSD: number;
  botSpot1xUSD: number;
  botOpenCount: number;
  botRunning: boolean;
  botLastTickAt: string;
  botStrategyVersion: string;
  userCurve: { timestamp: number; timeStr: string; equityUSD: number }[];
  botCurve: { timestamp: number; timeStr: string; equityUSD: number }[];
}

export interface ManualArenaResponse {
  userLedger: AutonomousLedgerState;
  universe: ArenaUniverseItem[];
  arena: ArenaComparisonSummary;
}

interface ManualArenaViewProps {
  onGoToBotTest?: () => void;
}

function formatUSD(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe < 0 ? '-' : ''}$${Math.abs(safe).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedUSD(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const prefix = safe > 0 ? '+' : '';
  return prefix + formatUSD(safe);
}

function formatPrice(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatTimeTR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const ManualArenaView: React.FC<ManualArenaViewProps> = ({ onGoToBotTest }) => {
  const [data, setData] = useState<ManualArenaResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC/USD');
  const [marginInput, setMarginInput] = useState<string>('1000');
  const [leverageInput, setLeverageInput] = useState<number>(2);
  const [stopLossInput, setStopLossInput] = useState<string>('');
  const [takeProfitInput, setTakeProfitInput] = useState<string>('');
  const [noteInput, setNoteInput] = useState<string>('');

  const [bottomTab, setBottomTab] = useState<'positions' | 'closed' | 'compare' | 'logs'>('positions');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSl, setEditSl] = useState<string>('');
  const [editTp, setEditTp] = useState<string>('');

  const [confirmReset, setConfirmReset] = useState<boolean>(false);

  const fetchStatus = useCallback(async (isManual = false) => {
    try {
      const res = await fetch('/api/manual-test?action=status', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json: ManualArenaResponse = await res.json();
      setData(json);
      setErrorMsg(null);
      if (isManual) {
        setActionMessage({ type: 'ok', text: 'Canlı piyasa fiyatları ve Arena kıyaslaması yenilendi.' });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Sunucuya bağlanılamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus(false);
    const id = setInterval(() => {
      fetchStatus(false);
    }, 3000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const universe = data?.universe ?? [];
  const selectedAsset = useMemo(
    () => universe.find((u) => u.symbol === selectedSymbol) ?? universe[0] ?? null,
    [universe, selectedSymbol]
  );

  useEffect(() => {
    if (selectedAsset && leverageInput > selectedAsset.maxIbkrLeverage) {
      setLeverageInput(selectedAsset.maxIbkrLeverage);
    }
  }, [selectedAsset, leverageInput]);

  const postAction = useCallback(async (payload: Record<string, any>, successMsg?: string) => {
    setSubmitting(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/manual-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionMessage({ type: 'err', text: json?.error || `İşlem başarısız (${res.status})` });
        return false;
      }
      setData(json);
      if (successMsg) {
        setActionMessage({ type: 'ok', text: successMsg });
      }
      return true;
    } catch (err: any) {
      setActionMessage({ type: 'err', text: err?.message || 'Ağ hatası oluştu' });
      return false;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const userLedger = data?.userLedger;
  const arena = data?.arena;

  const parsedMargin = Math.max(0, Number(marginInput) || 0);
  const effectiveLeverage = Math.min(leverageInput, selectedAsset?.maxIbkrLeverage ?? 3);
  const previewNotionalUSD = parsedMargin * effectiveLeverage;

  const estimatedEntryFeeUSD = useMemo(() => {
    if (!selectedAsset || previewNotionalUSD <= 0) return 0;
    const minFeeUSD = selectedAsset.ibkrMinFeeUSD;
    let feeUSD =
      selectedAsset.ibkrPerShareUSD && selectedAsset.price > 0
        ? Math.max(minFeeUSD, (previewNotionalUSD / selectedAsset.price) * selectedAsset.ibkrPerShareUSD)
        : Math.max(minFeeUSD, previewNotionalUSD * selectedAsset.ibkrCommissionRate);
    if (selectedAsset.ibkrMaxFeePct) {
      feeUSD = Math.min(feeUSD, previewNotionalUSD * selectedAsset.ibkrMaxFeePct);
    }
    return Number(feeUSD.toFixed(2));
  }, [selectedAsset, previewNotionalUSD]);

  const handleOpenOrder = async (direction: 'AL (LONG)' | 'SAT (SHORT)') => {
    if (!selectedAsset) return;
    if (parsedMargin < 10) {
      setActionMessage({ type: 'err', text: 'Minimum teminat $10.00 USD olmalıdır.' });
      return;
    }
    const sl = stopLossInput.trim() ? Number(stopLossInput) : undefined;
    const tp = takeProfitInput.trim() ? Number(takeProfitInput) : undefined;
    const ok = await postAction(
      {
        action: 'open',
        symbol: selectedAsset.symbol,
        direction,
        marginUSD: parsedMargin,
        leverage: effectiveLeverage,
        stopLoss: Number.isFinite(sl) && (sl ?? 0) > 0 ? sl : undefined,
        takeProfit: Number.isFinite(tp) && (tp ?? 0) > 0 ? tp : undefined,
        note: noteInput.trim() || undefined,
      },
      `${selectedAsset.symbol} ${direction} pozisyonu canlı piyasada açıldı.`
    );
    if (ok) {
      setNoteInput('');
      setStopLossInput('');
      setTakeProfitInput('');
    }
  };

  const handleAutofillTpSl = (direction: 'AL (LONG)' | 'SAT (SHORT)') => {
    if (!selectedAsset || selectedAsset.price <= 0) return;
    const p = direction === 'AL (LONG)' ? selectedAsset.ask : selectedAsset.bid;
    const slDist = p * 0.025;
    const tpDist = p * 0.05;
    const digits = selectedAsset.digits;
    if (direction === 'AL (LONG)') {
      setStopLossInput((p - slDist).toFixed(digits));
      setTakeProfitInput((p + tpDist).toFixed(digits));
    } else {
      setStopLossInput((p + slDist).toFixed(digits));
      setTakeProfitInput((p - tpDist).toFixed(digits));
    }
  };

  const handleClosePosition = async (tradeId: string, fraction: 0.5 | 1, symbol: string) => {
    await postAction(
      { action: 'close', tradeId, fraction },
      fraction === 0.5
        ? `${symbol} pozisyonunun %50'si canlı fiyattan kapatıldı.`
        : `${symbol} pozisyonunun tamamı canlı fiyattan kapatıldı.`
    );
  };

  const handleSaveTpSl = async (tradeId: string, symbol: string) => {
    const sl = editSl.trim() ? Number(editSl) : undefined;
    const tp = editTp.trim() ? Number(editTp) : undefined;
    const ok = await postAction(
      { action: 'update-tpsl', tradeId, stopLoss: sl, takeProfit: tp },
      `${symbol} SL/TP hedefleri güncellendi.`
    );
    if (ok) {
      setEditingId(null);
    }
  };

  const handleResetArena = async () => {
    const ok = await postAction({ action: 'reset' }, 'Manuel IBKR Pro hesabın $25,000.00 USD olarak sıfırlandı.');
    if (ok) {
      setConfirmReset(false);
    }
  };

  const chartGeom = useMemo(() => {
    const uCurve = arena?.userCurve ?? [];
    const bCurve = arena?.botCurve ?? [];
    const allPts = [...uCurve, ...bCurve];
    if (allPts.length === 0) return null;

    const minTs = Math.min(...allPts.map((p) => p.timestamp));
    const maxTs = Math.max(...allPts.map((p) => p.timestamp));
    const spanTs = Math.max(1, maxTs - minTs);

    const baseCap = userLedger?.initialCapitalUSD ?? 25000;
    const equities = [baseCap, ...allPts.map((p) => p.equityUSD)];
    const minEq = Math.min(...equities);
    const maxEq = Math.max(...equities);
    const pad = Math.max(25, (maxEq - minEq) * 0.18);
    const yMin = minEq - pad;
    const yMax = maxEq + pad;
    const ySpan = Math.max(1, yMax - yMin);

    const W = 760;
    const H = 200;
    const mapX = (ts: number) => 48 + ((ts - minTs) / spanTs) * (W - 68);
    const mapY = (eq: number) => H - 22 - ((eq - yMin) / ySpan) * (H - 36);

    const toPath = (pts: { timestamp: number; equityUSD: number }[]) => {
      if (pts.length === 0) return '';
      if (pts.length === 1) {
        const x = mapX(pts[0].timestamp);
        const y = mapY(pts[0].equityUSD);
        return `M ${Math.max(48, x - 6).toFixed(1)} ${y.toFixed(1)} L ${Math.min(W - 20, x + 6).toFixed(1)} ${y.toFixed(1)}`;
      }
      return pts
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${mapX(p.timestamp).toFixed(1)} ${mapY(p.equityUSD).toFixed(1)}`)
        .join(' ');
    };

    return {
      W,
      H,
      yBase: mapY(baseCap),
      yMin,
      yMax,
      baseCap,
      userPath: toPath(uCurve),
      botPath: toPath(bCurve),
    };
  }, [arena, userLedger]);

  const assetComparisonRows = useMemo(() => {
    const map = new Map<
      string,
      {
        symbol: string;
        userTrades: number;
        userPnL: number;
        userFees: number;
        botStatus: string;
        botScore: number;
      }
    >();
    for (const u of universe) {
      map.set(u.symbol, {
        symbol: u.symbol,
        userTrades: 0,
        userPnL: 0,
        userFees: 0,
        botStatus: u.botStatus || 'BEKLEMEDE',
        botScore: u.botScore ?? 50,
      });
    }
    if (userLedger) {
      for (const p of userLedger.openPositions) {
        const row = map.get(p.symbol);
        if (row) {
          row.userTrades += 1;
          row.userPnL += p.totalPnL_USD ?? p.unrealizedPnL_USD;
          row.userFees += p.executionCostUSD ?? p.entryCommissionUSD ?? 0;
        }
      }
      for (const t of userLedger.closedTrades) {
        const row = map.get(t.symbol);
        if (row) {
          row.userTrades += 1;
          row.userPnL += t.totalPnL_USD ?? t.realizedPnL_USD;
          row.userFees += t.executionCostUSD ?? 0;
        }
      }
    }
    return Array.from(map.values()).filter((r) => r.userTrades > 0 || r.botStatus === 'POZİSYONDA (AÇIK)');
  }, [universe, userLedger]);

  if (loading && !data) {
    return (
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-8 text-center text-zinc-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
        <p className="text-sm">1v1 Canlı Piyasa Arenası (/test2) yükleniyor...</p>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-6 text-red-300 text-sm">
        <p className="font-semibold mb-1">Arena Verisi Yüklenemedi</p>
        <p className="text-xs opacity-80">{errorMsg}</p>
      </div>
    );
  }

  const availCash = userLedger?.availableCashUSD ?? 0;
  const userEquity = arena?.userEquityUSD ?? 25000;
  const botEquity = arena?.botEquityUSD ?? 25000;
  const leadUSD = arena?.leadUSD ?? 0;
  const totalGrossOpenUSD =
    userLedger?.openPositions.reduce((s, p) => s + (p.grossUnrealizedPnL_USD ?? 0), 0) ?? 0;

  return (
    <div className="space-y-4 text-zinc-100">
      {/* Header Banner */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <Award className="w-3.5 h-3.5" />
                1v1 CANLI YARIŞ ARENASI (/test2)
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                %100 Gerçek Kraken Bid/Ask & IBKR USD Komisyon Fiziği
              </span>
              <span className="text-[11px] text-emerald-300 font-mono">
                Birim: <strong>USD ($)</strong>
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-white mt-2">
              Sen vs Otonom Sistem — $25,000 USD Gerçek IBKR Pro Piyasa Düellosu
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Burada kendi $25,000 IBKR Pro Reg-T Margin kasanla canlı piyasa Bid/Ask spread, kayma, SEC/FINRA TAF harçları ve %85 marjin likidasyon kurallarıyla işlem açıp otonom botla birebir yarışabilirsin.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onGoToBotTest && (
              <button
                onClick={onGoToBotTest}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
              >
                <Bot className="w-3.5 h-3.5 text-sky-400" />
                Bot Sayfasına Geç (/test)
              </button>
            )}
            <button
              onClick={() => fetchStatus(true)}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${submitting ? 'animate-spin' : ''}`} />
              Yenile
            </button>
            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-red-950/60 text-zinc-300 hover:text-red-300 border border-zinc-700 hover:border-red-800/60 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Kasamı Sıfırla ($25K)
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 bg-red-950/60 border border-red-700/70 rounded-lg px-2.5 py-1">
                <span className="text-[11px] text-red-200">Emin misin?</span>
                <button
                  onClick={handleResetArena}
                  disabled={submitting}
                  className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold"
                >
                  Evet Sıfırla
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]"
                >
                  İptal
                </button>
              </div>
            )}
          </div>
        </div>

        {actionMessage && (
          <div
            className={`mt-3 px-3 py-2 rounded-lg text-xs flex items-center justify-between border ${
              actionMessage.type === 'ok'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : 'bg-red-950/40 border-red-800/60 text-red-300'
            }`}
          >
            <span className="flex items-center gap-2">
              {actionMessage.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0" />
              )}
              {actionMessage.text}
            </span>
            <button onClick={() => setActionMessage(null)} className="text-[11px] underline opacity-80 hover:opacity-100">
              Kapat
            </button>
          </div>
        )}
      </div>

      {/* 1v1 Live Scoreboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* USER CARD */}
        <div
          className={`rounded-xl p-4 border ${
            arena?.leader === 'USER'
              ? 'bg-emerald-950/20 border-emerald-600/50'
              : 'bg-zinc-900/90 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <User className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">SEN (/test2 Manuel)</div>
                <div className="text-[11px] text-zinc-400">Serbest Emrinle Gerçek IBKR</div>
              </div>
            </div>
            {arena?.leader === 'USER' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                LİDER
              </span>
            )}
          </div>
          <div className="text-2xl font-bold tracking-tight text-white">{formatUSD(userEquity)}</div>
          <div className="flex items-center gap-3 mt-1 text-xs">
            <span className={(arena?.userNetPct ?? 0) >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
              {(arena?.userNetPct ?? 0) >= 0 ? '+' : ''}
              {(arena?.userNetPct ?? 0).toFixed(2)}% ({formatSignedUSD(userLedger?.netProfitUSD ?? 0)})
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-zinc-800/80 text-[11px]">
            <div>
              <div className="text-zinc-500">Yön Başarısı</div>
              <div className="font-semibold text-zinc-200">%{(arena?.userDirAccuracy ?? 0).toFixed(0)}</div>
            </div>
            <div>
              <div className="text-zinc-500">Net Kârlılık</div>
              <div className="font-semibold text-zinc-200">%{(arena?.userWinRate ?? 0).toFixed(0)}</div>
            </div>
            <div>
              <div className="text-zinc-500">Ödenen Komisyon</div>
              <div className="font-semibold text-amber-400">{formatUSD(arena?.userFeesUSD ?? 0)}</div>
            </div>
          </div>
        </div>

        {/* CENTER VS DUEL CARD */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">Canlı Düello Farkı</div>
            <div
              className={`text-xl sm:text-2xl font-bold mt-1 ${
                leadUSD > 0 ? 'text-emerald-400' : leadUSD < 0 ? 'text-sky-400' : 'text-zinc-200'
              }`}
            >
              {leadUSD > 0
                ? `Sen +${formatUSD(leadUSD)} Öndesin`
                : leadUSD < 0
                ? `Bot +${formatUSD(Math.abs(leadUSD))} Önde`
                : 'Tam Başabaş ($0.00)'}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Boşta Nakit: <strong className="text-zinc-200">{formatUSD(availCash)}</strong>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-zinc-800/80 text-[11px]">
            <div className="bg-zinc-950/60 rounded-lg p-2 border border-zinc-800/70">
              <div className="text-zinc-500">Senin İşlemlerin</div>
              <div className="font-semibold text-zinc-200">
                {userLedger?.openPositions.length ?? 0} Açık / {userLedger?.closedTrades.length ?? 0} Kapalı
              </div>
              <div className="text-[10px] text-zinc-400">
                1x Spot: {formatSignedUSD(arena?.userSpot1xUSD ?? 0)}
              </div>
            </div>
            <div className="bg-zinc-950/60 rounded-lg p-2 border border-zinc-800/70">
              <div className="text-zinc-500">Botun İşlemleri</div>
              <div className="font-semibold text-zinc-200">
                {arena?.botOpenCount ?? 0} Açık / {Math.max(0, (arena?.botTradesTotal ?? 0) - (arena?.botOpenCount ?? 0))} Kapalı
              </div>
              <div className="text-[10px] text-zinc-400">
                1x Spot: {formatSignedUSD(arena?.botSpot1xUSD ?? 0)}
              </div>
            </div>
          </div>
        </div>

        {/* BOT CARD */}
        <div
          className={`rounded-xl p-4 border ${
            arena?.leader === 'BOT'
              ? 'bg-sky-950/20 border-sky-600/50'
              : 'bg-zinc-900/90 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
                <Bot className="w-4 h-4 text-sky-400" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">ZELTRA BOT (/test Otonom)</div>
                <div className="text-[11px] text-zinc-400">
                  {arena?.botStrategyVersion || 'v15.2'} • {arena?.botRunning ? 'Aktif' : 'Duraklatıldı'}
                </div>
              </div>
            </div>
            {arena?.leader === 'BOT' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                LİDER
              </span>
            )}
          </div>
          <div className="text-2xl font-bold tracking-tight text-white">{formatUSD(botEquity)}</div>
          <div className="flex items-center gap-3 mt-1 text-xs">
            <span className={(arena?.botNetPct ?? 0) >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
              {(arena?.botNetPct ?? 0) >= 0 ? '+' : ''}
              {(arena?.botNetPct ?? 0).toFixed(2)}%
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-zinc-800/80 text-[11px]">
            <div>
              <div className="text-zinc-500">Yön Başarısı</div>
              <div className="font-semibold text-zinc-200">%{(arena?.botDirAccuracy ?? 0).toFixed(0)}</div>
            </div>
            <div>
              <div className="text-zinc-500">Net Kârlılık</div>
              <div className="font-semibold text-zinc-200">%{(arena?.botWinRate ?? 0).toFixed(0)}</div>
            </div>
            <div>
              <div className="text-zinc-500">Ödenen Komisyon</div>
              <div className="font-semibold text-amber-400">{formatUSD(arena?.botFeesUSD ?? 0)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Split: Trade Execution Ticket + Live Dual Curve & Bot Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT: REAL MARKET EXECUTION TICKET (5 cols) */}
        <div className="lg:col-span-5 bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              Gerçek Piyasa Emir Terminali
            </h2>
            <span className="text-[11px] text-zinc-400">
              Boşta: <strong className="text-emerald-300">{formatUSD(availCash)}</strong>
            </span>
          </div>

          <div>
            <label className="block text-[11px] text-zinc-400 mb-1">Varlık Seçimi (17 IBKR / Kraken Enstrümanı)</label>
            <select
              value={selectedAsset?.symbol ?? 'BTC/USD'}
              onChange={(e) => {
                setSelectedSymbol(e.target.value);
                setStopLossInput('');
                setTakeProfitInput('');
              }}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              {universe.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.symbol} — {item.name} ({item.isOpen ? '7/24 AÇIK' : 'KAPALI'}) • {formatPrice(item.price, item.digits)}
                </option>
              ))}
            </select>
          </div>

          {selectedAsset && (
            <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      selectedAsset.isOpen
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}
                  >
                    {selectedAsset.isOpen ? 'PİYASA AÇIK' : 'PİYASA KAPALI'}
                  </span>
                  <span className="text-zinc-400">{selectedAsset.cluster.toUpperCase()}</span>
                </div>
                <span className={selectedAsset.change24hPercent >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                  24s: {selectedAsset.change24hPercent >= 0 ? '+' : ''}
                  {selectedAsset.change24hPercent.toFixed(2)}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="bg-zinc-900 rounded p-1.5 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500">SAT (Bid)</div>
                  <div className="text-xs font-mono font-bold text-red-300">
                    {formatPrice(selectedAsset.bid, selectedAsset.digits)}
                  </div>
                </div>
                <div className="bg-zinc-900 rounded p-1.5 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500">Piyasa (Mid)</div>
                  <div className="text-xs font-mono font-bold text-white">
                    {formatPrice(selectedAsset.price, selectedAsset.digits)}
                  </div>
                </div>
                <div className="bg-zinc-900 rounded p-1.5 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500">AL (Ask)</div>
                  <div className="text-xs font-mono font-bold text-emerald-300">
                    {formatPrice(selectedAsset.ask, selectedAsset.digits)}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800/80 text-[11px]">
                <div className="flex items-center justify-between text-sky-300 font-medium">
                  <span className="flex items-center gap-1">
                    <Bot className="w-3.5 h-3.5" /> Bot Görüşü: {selectedAsset.botStatus || 'BEKLEMEDE'}
                  </span>
                  <span>Skor: {selectedAsset.botScore ?? 50}/100</span>
                </div>
                {selectedAsset.botReason && (
                  <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2">{selectedAsset.botReason}</p>
                )}
              </div>

              {!selectedAsset.isOpen && selectedAsset.closedReason && (
                <div className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-800/50 rounded p-2">
                  {selectedAsset.closedReason} (Gerçek piyasa kuralı: kapalı borsada emir açılamaz.)
                </div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-zinc-400">Yatırılacak Teminat (USD)</span>
              <span className="text-zinc-500">Max: {formatUSD(availCash)}</span>
            </div>
            <input
              type="number"
              min={10}
              step={10}
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
            />
            <div className="grid grid-cols-5 gap-1.5 mt-1.5">
              {[500, 1000, 2500, 5000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setMarginInput(String(Math.min(amt, Math.floor(availCash))))}
                  className="py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-300 border border-zinc-700"
                >
                  ${amt}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMarginInput(String(Math.floor(availCash * 0.98)))}
                className="py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] text-emerald-300 border border-zinc-700 font-semibold"
              >
                Max
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-zinc-400">
                Kaldıraç (IBKR Tavanı: {selectedAsset?.maxIbkrLeverage ?? 3}x)
              </span>
              <span className="font-bold text-amber-300">{effectiveLeverage}x Kaldıraç</span>
            </div>
            <input
              type="range"
              min={1}
              max={selectedAsset?.maxIbkrLeverage ?? 3}
              step={1}
              value={effectiveLeverage}
              onChange={(e) => setLeverageInput(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>1x (Spot Güvenli)</span>
              <span>IBKR Max ({selectedAsset?.maxIbkrLeverage ?? 3}x)</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-zinc-400">Stop Loss (Opsiyonel)</span>
                <button
                  type="button"
                  onClick={() => handleAutofillTpSl('AL (LONG)')}
                  className="text-[10px] text-emerald-400 hover:underline"
                >
                  Long Otomatik
                </button>
              </div>
              <input
                type="number"
                step="any"
                placeholder="Boş = %85 Marj Stop"
                value={stopLossInput}
                onChange={(e) => setStopLossInput(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-zinc-400">Take Profit (Opsiyonel)</span>
                <button
                  type="button"
                  onClick={() => handleAutofillTpSl('SAT (SHORT)')}
                  className="text-[10px] text-red-400 hover:underline"
                >
                  Short Otomatik
                </button>
              </div>
              <input
                type="number"
                step="any"
                placeholder="Kâr Al Hedefi"
                value={takeProfitInput}
                onChange={(e) => setTakeProfitInput(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
              />
            </div>
          </div>

          <div>
            <input
              type="text"
              placeholder="Strateji notun (ör: Bot düşüş bekliyor ama RSI aşırı satımda...)"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600"
            />
          </div>

          <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-2.5 text-[11px] space-y-1">
            <div className="flex justify-between">
              <span className="text-zinc-400">Kaldıraçlı İşlem Hacmi:</span>
              <span className="font-semibold text-white">{formatUSD(previewNotionalUSD)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Tahmini IBKR Giriş Komisyonu:</span>
              <span className="font-semibold text-amber-300">-{formatUSD(estimatedEntryFeeUSD)}</span>
            </div>
            <div className="text-[10px] text-zinc-500 pt-0.5">
              Emir açıldığı an Ask/Bid spread farkı + IBKR komisyonu gerçek dünyadaki gibi nakitten anında düşülür.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={submitting || !selectedAsset?.isOpen || parsedMargin < 10 || availCash < parsedMargin}
              onClick={() => handleOpenOrder('AL (LONG)')}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs transition-colors"
            >
              <TrendingUp className="w-4 h-4" />
              AL (LONG) AÇ
            </button>
            <button
              type="button"
              disabled={submitting || !selectedAsset?.isOpen || parsedMargin < 10 || availCash < parsedMargin}
              onClick={() => handleOpenOrder('SAT (SHORT)')}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs transition-colors"
            >
              <TrendingDown className="w-4 h-4" />
              SAT (SHORT) AÇ
            </button>
          </div>
        </div>

        {/* RIGHT: DUAL EQUITY CURVE + PORTFOLIO TELEMETRY (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  1v1 Kasa Büyüme Yarışı (USD)
                </h2>
                <p className="text-[11px] text-zinc-400">
                  Yeşil çizgi: Senin Manuel Hesabın (/test2) • Mavi çizgi: Zeltra Otonom Bot (/test)
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                  <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" /> Sen: {formatUSD(userEquity)}
                </span>
                <span className="inline-flex items-center gap-1 text-sky-400 font-semibold">
                  <span className="w-2.5 h-0.5 bg-sky-400 inline-block" /> Bot: {formatUSD(botEquity)}
                </span>
              </div>
            </div>

            {chartGeom ? (
              <div className="w-full overflow-x-auto">
                <svg viewBox={`0 0 ${chartGeom.W} ${chartGeom.H}`} className="w-full h-52 bg-zinc-950/70 rounded-lg border border-zinc-800/80">
                  <line
                    x1="48"
                    y1={chartGeom.yBase}
                    x2={chartGeom.W - 20}
                    y2={chartGeom.yBase}
                    stroke="#52525b"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text x="6" y={chartGeom.yBase + 3} fill="#a1a1aa" fontSize="9">
                    ${Math.round(chartGeom.baseCap)}
                  </text>
                  <text x="6" y="16" fill="#71717a" fontSize="9">
                    ${Math.round(chartGeom.yMax)}
                  </text>
                  <text x="6" y={chartGeom.H - 18} fill="#71717a" fontSize="9">
                    ${Math.round(chartGeom.yMin)}
                  </text>

                  {chartGeom.botPath && (
                    <path d={chartGeom.botPath} fill="none" stroke="#38bdf8" strokeWidth="2.2" opacity="0.9" />
                  )}

                  {chartGeom.userPath && (
                    <path d={chartGeom.userPath} fill="none" stroke="#34d399" strokeWidth="2.5" />
                  )}
                </svg>
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center text-xs text-zinc-500 bg-zinc-950/60 rounded-lg border border-zinc-800">
                Grafik için ilk işlem bekleniyor...
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3">
              <div className="text-[11px] text-zinc-400">Anlık P&L (Açık İşlemler)</div>
              <div className={`text-sm font-bold mt-0.5 ${(userLedger?.openFloatingPnL_USD ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatSignedUSD(userLedger?.openFloatingPnL_USD ?? 0)}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">
                Brüt: {formatSignedUSD(totalGrossOpenUSD)}
              </div>
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3">
              <div className="text-[11px] text-zinc-400">Bağlı Teminat / Boşta</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {formatUSD(userLedger?.allocatedMarginUSD ?? 0)}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Boşta: {formatUSD(availCash)}</div>
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3">
              <div className="text-[11px] text-zinc-400">Toplam Kaldıraç Hacmi</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {formatUSD(userLedger?.metrics?.activeNotionalVolumeUSD ?? 0)}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">
                Ort: {(userLedger?.metrics?.avgMarginLeverage ?? 0).toFixed(2)}x
              </div>
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3">
              <div className="text-[11px] text-zinc-400">Ödenen Komisyon & Swap</div>
              <div className="text-sm font-bold text-amber-400 mt-0.5">
                -{formatUSD(userLedger?.metrics?.totalSpreadAndCommissionUSD ?? 0)}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">
                PF: {(arena?.userPF ?? 0).toFixed(2)}x
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                Şu An Açık Piyasalar — Hızlı Enstrüman Seçimi
              </span>
              <span className="text-[10px] text-zinc-500">Seçtiğin varlık soldaki terminale yüklenir</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {universe
                .filter((u) => u.isOpen)
                .map((item) => {
                  const isSel = item.symbol === selectedAsset?.symbol;
                  return (
                    <button
                      key={item.symbol}
                      type="button"
                      onClick={() => setSelectedSymbol(item.symbol)}
                      className={`text-left p-2 rounded-lg border transition-colors ${
                        isSel
                          ? 'bg-emerald-950/30 border-emerald-500/60'
                          : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-semibold">
                        <span className="text-white">{item.symbol}</span>
                        <span className={item.change24hPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {item.change24hPercent >= 0 ? '+' : ''}
                          {item.change24hPercent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-xs font-mono text-zinc-300 mt-0.5">
                        {item.cluster === 'USD_MAJORS' ? '' : '$'}
                        {formatPrice(item.price, item.digits)}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
                        Bot: {item.botStatus || 'BEKLEMEDE'} ({item.botScore ?? 50})
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Tabs */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4">
        <div className="flex flex-wrap gap-2 pb-3 mb-3 border-b border-zinc-800">
          <button
            onClick={() => setBottomTab('positions')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              bottomTab === 'positions'
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            Açık İşlemlerim ({userLedger?.openPositions.length ?? 0})
          </button>
          <button
            onClick={() => setBottomTab('closed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              bottomTab === 'closed'
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            Kapanan İşlemlerim ({userLedger?.closedTrades.length ?? 0})
          </button>
          <button
            onClick={() => setBottomTab('compare')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              bottomTab === 'compare'
                ? 'bg-sky-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            Sistem vs Sen Analizi (Nerede Hata Yapıyor?)
          </button>
          <button
            onClick={() => setBottomTab('logs')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              bottomTab === 'logs'
                ? 'bg-zinc-700 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            Emir Defteri / Loglar ({userLedger?.activityLog.length ?? 0})
          </button>
        </div>

        {/* OPEN POSITIONS */}
        {bottomTab === 'positions' && (
          <div className="space-y-3">
            {(userLedger?.openPositions.length ?? 0) === 0 ? (
              <div className="text-center py-8 text-xs text-zinc-500">
                Henüz açık pozisyonun yok. Soldaki Emir Terminali'nden 7/24 açık kripto varlıklarında gerçek spread ve IBKR komisyonu ile ilk işlemini açabilirsin.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="py-2 pr-3">Varlık / Yön</th>
                      <th className="py-2 pr-3">Teminat / Kaldıraç</th>
                      <th className="py-2 pr-3">Giriş → Canlı Çıkış</th>
                      <th className="py-2 pr-3">SL / TP</th>
                      <th className="py-2 pr-3">Anlık Net Kâr / Zarar</th>
                      <th className="py-2 text-right">İşlem Yönetimi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {userLedger!.openPositions.map((pos) => {
                      const isLong = pos.direction === 'AL (LONG)';
                      const liveExit = isLong
                        ? pos.bidAtTick ?? pos.currentPrice
                        : pos.askAtTick ?? pos.currentPrice;
                      const isEditing = editingId === pos.id;
                      const specDigits = pos.digits ?? universe.find((u) => u.symbol === pos.symbol)?.digits ?? 2;
                      const lev = pos.effectiveLeverage ?? 1;
                      const notional = pos.notionalValueUSD ?? pos.allocatedCapitalUSD * lev;
                      const netOpenPnL = pos.totalPnL_USD ?? pos.unrealizedPnL_USD;
                      const openPct =
                        pos.allocatedCapitalUSD > 0 ? (netOpenPnL / pos.allocatedCapitalUSD) * 100 : 0;

                      return (
                        <tr key={pos.id} className="hover:bg-zinc-800/30">
                          <td className="py-2.5 pr-3">
                            <div className="font-bold text-white flex items-center gap-1.5">
                              {pos.symbol}
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  isLong
                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-red-500/15 text-red-300 border border-red-500/30'
                                }`}
                              >
                                {pos.direction}
                              </span>
                              {pos.tp1Hit && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300">
                                  %50 KAPALI
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              {formatTimeTR(pos.entryTime)} • Giriş Kom: -{formatUSD(pos.entryCommissionUSD ?? 0)}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="font-semibold text-zinc-200">{formatUSD(pos.allocatedCapitalUSD)}</div>
                            <div className="text-[10px] text-zinc-400">
                              {lev}x ({formatUSD(notional)})
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-[11px]">
                            <div className="text-zinc-300">Giriş: {formatPrice(pos.entryPrice, specDigits)}</div>
                            <div className="text-zinc-100">
                              {isLong ? 'Bid' : 'Ask'}: {formatPrice(liveExit, specDigits)}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-[11px]">
                            {isEditing ? (
                              <div className="space-y-1">
                                <input
                                  type="number"
                                  step="any"
                                  value={editSl}
                                  onChange={(e) => setEditSl(e.target.value)}
                                  placeholder="SL (0=Marj)"
                                  className="w-24 bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-[11px]"
                                />
                                <input
                                  type="number"
                                  step="any"
                                  value={editTp}
                                  onChange={(e) => setEditTp(e.target.value)}
                                  placeholder="TP (0=Yok)"
                                  className="w-24 bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-[11px]"
                                />
                              </div>
                            ) : (
                              <div>
                                <div className="text-red-300">
                                  SL: {pos.stopLoss > 0 ? formatPrice(pos.stopLoss, specDigits) : '%85 Marj'}
                                </div>
                                <div className="text-emerald-300">
                                  TP: {pos.takeProfit2 > 0 ? formatPrice(pos.takeProfit2, specDigits) : 'Serbest'}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className={`font-bold ${netOpenPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatSignedUSD(netOpenPnL)} ({openPct >= 0 ? '+' : ''}
                              {openPct.toFixed(2)}%)
                            </div>
                            <div className="text-[10px] text-zinc-500">
                              1x Spot: {formatSignedUSD(pos.spot1xEquivalentPnL_USD ?? 0)}
                            </div>
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="inline-flex items-center gap-1 flex-wrap justify-end">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => handleSaveTpSl(pos.id, pos.symbol)}
                                    disabled={submitting}
                                    className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold"
                                  >
                                    Kaydet
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="px-2 py-1 rounded bg-zinc-700 text-zinc-200 text-[11px]"
                                  >
                                    İptal
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingId(pos.id);
                                    setEditSl(pos.stopLoss > 0 ? String(pos.stopLoss) : '');
                                    setEditTp(pos.takeProfit2 > 0 ? String(pos.takeProfit2) : '');
                                  }}
                                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                                  title="SL/TP Düzenle"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!pos.tp1Hit && (
                                <button
                                  onClick={() => handleClosePosition(pos.id, 0.5, pos.symbol)}
                                  disabled={submitting}
                                  className="px-2 py-1 rounded bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 border border-amber-600/40 text-[11px]"
                                >
                                  %50 Kapat
                                </button>
                              )}
                              <button
                                onClick={() => handleClosePosition(pos.id, 1, pos.symbol)}
                                disabled={submitting}
                                className="px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-600/40 text-[11px] font-semibold"
                              >
                                Kapat
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* CLOSED TRADES */}
        {bottomTab === 'closed' && (
          <div>
            {(userLedger?.closedTrades.length ?? 0) === 0 ? (
              <div className="text-center py-8 text-xs text-zinc-500">
                Henüz kapanmış işlemin yok. İşlemlerin SL/TP'ye ulaştığında veya manuel kapattığında tüm komisyon/swap detaylarıyla buraya kaydedilir.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="py-2 pr-3">Varlık / Yön</th>
                      <th className="py-2 pr-3">Giriş → Çıkış</th>
                      <th className="py-2 pr-3">Teminat / Kaldıraç</th>
                      <th className="py-2 pr-3">Komisyon & Swap</th>
                      <th className="py-2 pr-3">Net Sonuç</th>
                      <th className="py-2">Kapanış Nedeni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {userLedger!.closedTrades.map((t) => {
                      const digits = t.digits ?? universe.find((u) => u.symbol === t.symbol)?.digits ?? 2;
                      const marginPct =
                        t.allocatedCapitalUSD > 0 ? (t.totalPnL_USD / t.allocatedCapitalUSD) * 100 : t.totalPnL_Percent;
                      return (
                        <tr key={t.id}>
                          <td className="py-2 pr-3">
                            <div className="font-bold text-white">{t.symbol}</div>
                            <div className="text-[10px] text-zinc-400">
                              {t.direction} • {t.closeTime ? formatTimeTR(t.closeTime) : ''}
                            </div>
                          </td>
                          <td className="py-2 pr-3 font-mono text-[11px]">
                            {formatPrice(t.entryPrice, digits)} → {formatPrice(t.closePrice ?? t.currentPrice, digits)}
                          </td>
                          <td className="py-2 pr-3">
                            {formatUSD(t.allocatedCapitalUSD)} ({t.effectiveLeverage ?? 1}x)
                          </td>
                          <td className="py-2 pr-3 text-amber-400">-{formatUSD(t.executionCostUSD ?? 0)}</td>
                          <td className="py-2 pr-3">
                            <div className={`font-bold ${t.totalPnL_USD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatSignedUSD(t.totalPnL_USD)} ({marginPct >= 0 ? '+' : ''}
                              {marginPct.toFixed(2)}%)
                            </div>
                          </td>
                          <td className="py-2 text-[11px] text-zinc-400">{t.exitReason || t.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* COMPARE / DIAGNOSTICS */}
        {bottomTab === 'compare' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3">
                <div className="text-[11px] text-zinc-400">Komisyon Sürtünmesi Kıyaslaması</div>
                <div className="text-sm font-bold text-white mt-1">
                  Sen: -{formatUSD(arena?.userFeesUSD ?? 0)} vs Bot: -{formatUSD(arena?.botFeesUSD ?? 0)}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Aşırı al-sat yapan taraf komisyonda erir. Botun 'Nakit Kalkanı' filtresi tam olarak bu komisyon kaybını azaltmak için bekliyor.
                </p>
              </div>
              <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3">
                <div className="text-[11px] text-zinc-400">Yön Tahmin İsabeti vs Net Kâr</div>
                <div className="text-sm font-bold text-white mt-1">
                  Sen: %{(arena?.userDirAccuracy ?? 0).toFixed(0)} Yön / %{(arena?.userWinRate ?? 0).toFixed(0)} Net
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Yön isabetin yüksek ama net kâr düşükse giriş zamanlaman veya kaldıraç/komisyon oranında sorun vardır.
                </p>
              </div>
              <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3">
                <div className="text-[11px] text-zinc-400">Botun Şu Anki Modu</div>
                <div className="text-sm font-bold text-sky-300 mt-1">
                  {arena?.botStrategyVersion} ({arena?.botOpenCount ?? 0} Aktif İşlem)
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Botun hata yaptığı veya gereksiz pas geçtiği fırsatları soldan sen alıp performans farkını canlı ölçebilirsin.
                </p>
              </div>
            </div>

            {assetComparisonRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="py-2 pr-3">Varlık</th>
                      <th className="py-2 pr-3">Senin İşlem Sayın</th>
                      <th className="py-2 pr-3">Senin Net Kâr/Zararın</th>
                      <th className="py-2 pr-3">Botun Anlık Durumu</th>
                      <th className="py-2">Bot Skoru</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {assetComparisonRows.map((row) => (
                      <tr key={row.symbol}>
                        <td className="py-2 pr-3 font-semibold text-white">{row.symbol}</td>
                        <td className="py-2 pr-3 text-zinc-300">{row.userTrades}</td>
                        <td className={`py-2 pr-3 font-semibold ${row.userPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatSignedUSD(row.userPnL)}
                        </td>
                        <td className="py-2 pr-3 text-zinc-300">{row.botStatus}</td>
                        <td className="py-2 text-sky-300 font-semibold">{row.botScore}/100</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ACTIVITY LOGS */}
        {bottomTab === 'logs' && (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {(userLedger?.activityLog ?? []).map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2.5 text-xs bg-zinc-950/60 border border-zinc-800/70 rounded-lg px-3 py-2"
              >
                <span className="text-[10px] font-mono text-zinc-500 shrink-0 mt-0.5">
                  {formatTimeTR(log.timestamp)}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                    log.type === 'ENTRY'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : log.type === 'TP1_PARTIAL' || log.type === 'TP2_FULL'
                      ? 'bg-sky-500/15 text-sky-300'
                      : log.type === 'STOP_LOSS'
                      ? 'bg-red-500/15 text-red-300'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {log.type}
                </span>
                <span className="text-zinc-200">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

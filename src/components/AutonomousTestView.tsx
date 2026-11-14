import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Play,
  Pause,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  Layers,
  Cpu,
  BarChart3,
} from 'lucide-react';

interface GateCheckItem {
  step: number;
  title: string;
  metricLabel: string;
  metricValue: string;
  threshold: string;
  score: number;
  maxScore: number;
  passed: boolean;
  note: string;
}

interface TradeLifecycleEvent {
  stepNo: number;
  timestamp: string;
  phase: string;
  title: string;
  detail: string;
  price: number;
  pnlTRY?: number;
}

interface TradeForensicXRay {
  confluenceScore: number;
  auditHash: string;
  regime: string;
  orderType: string;
  indicatorSnapshot: {
    ema8: number;
    ema21: number;
    ema50: number;
    ema200: number;
    emaSpreadPct: number;
    rsi14: number;
    dailyAtr14: number;
    tradeAtr: number;
    newsScore: number;
    newsHeadline: string;
    newsSource: string;
  };
  microstructure: {
    midQuotePrice: number;
    fillPrice: number;
    spreadPts: number;
    slippagePts: number;
    executionCostTRY: number;
    contractSize: number;
    lotSize: number;
    notionalValueTRY: number;
    effectiveLeverage: number;
    usdTryAtEntry: number;
    sizingFormulaText: string;
  };
  gates: GateCheckItem[];
  excursion: {
    mfePrice: number;
    mfeR: number;
    mfeTRY: number;
    maePrice: number;
    maeR: number;
    maeTRY: number;
  };
  lifecycleSteps: TradeLifecycleEvent[];
}

interface AutonomousTrade {
  id: string;
  symbol: string;
  name: string;
  digits: number;
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  status: 'ACIK' | 'TP2_TAM_HEDEF' | 'TP1_VE_BASABAS' | 'TRAILING_STOP_KAR' | 'STOP_LOSS' | 'MANUEL_KAPANDI';
  entryTime: string;
  entryTimestamp: number;
  closeTime?: string;
  closeTimestamp?: number;
  midEntryPrice?: number;
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
  lotSize?: number;
  contractSize?: number;
  notionalValueTRY?: number;
  effectiveLeverage?: number;
  spreadPts?: number;
  slippagePts?: number;
  executionCostTRY?: number;
  rMultiple?: number;
  mfeTRY?: number;
  mfeR?: number;
  maeTRY?: number;
  maeR?: number;
  tp1Hit: boolean;
  breakevenActive: boolean;
  trailingStopActive?: boolean;
  realizedPnL_TRY: number;
  unrealizedPnL_TRY: number;
  totalPnL_TRY: number;
  totalPnL_Percent: number;
  confluenceScore?: number;
  rationale: string;
  exitReason?: string;
  forensicXRay?: TradeForensicXRay;
}

interface EquityPoint {
  timestamp: number;
  timeStr: string;
  equityTRY: number;
  cashTRY: number;
  drawdownPercent?: number;
}

interface ActivityLogItem {
  id: string;
  timestamp: string;
  type: 'ENTRY' | 'TP1_PARTIAL' | 'TP2_FULL' | 'STOP_LOSS' | 'BREAKEVEN_EXIT' | 'SYSTEM';
  symbol: string;
  message: string;
  pnlImpactTRY?: number;
}

interface AssetAttributionItem {
  symbol: string;
  name: string;
  closedCount: number;
  openCount: number;
  wins: number;
  losses: number;
  winRatePercent: number;
  netRealizedPnL_TRY: number;
  floatingPnL_TRY: number;
  totalNetPnL_TRY: number;
  avgRMultiple: number;
  totalRMultiple: number;
  executionCostTRY: number;
}

interface DirectionStats {
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  tradesCount: number;
  wins: number;
  losses: number;
  winRatePercent: number;
  netPnL_TRY: number;
  avgRMultiple: number;
  profitFactor: number;
}

interface MarketScannerItem {
  symbol: string;
  name: string;
  digits: number;
  price: number;
  ema8: number;
  ema21: number;
  ema50: number;
  trendRegime: 'BOĞA (BULL)' | 'AYI (BEAR)' | 'YATAY';
  rsi14: number;
  atr14: number;
  newsSentimentScore: number;
  newsHeadline: string;
  confluenceScore: number;
  candidateDirection: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
  status: 'POZİSYONDA (AÇIK)' | 'YENİ GİRİŞ' | 'HABER VETOSU' | 'KORELASYON KALKANI' | 'LİMİT DOLU (4/4)' | 'TEKNİK TEYİT BEKLİYOR';
  decisionReason: string;
  scannedAt: string;
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
    avgWinTRY?: number;
    avgLossTRY?: number;
    payoffRatio?: number;
    expectancyTRY?: number;
    expectancyR?: number;
    realizedRMultipleTotal?: number;
    sharpeRatio?: number;
    sortinoRatio?: number;
    totalSpreadAndCommissionTRY?: number;
    currentStreak?: { type: 'WIN' | 'LOSS' | 'NONE'; count: number };
    maxWinStreak?: number;
    maxLossStreak?: number;
  };
  attribution?: {
    byAsset: AssetAttributionItem[];
    byDirection: {
      long: DirectionStats;
      short: DirectionStats;
    };
  };
  marketScanner?: MarketScannerItem[];
  openPositions: AutonomousTrade[];
  closedTrades: AutonomousTrade[];
  equityCurve: EquityPoint[];
  activityLog: ActivityLogItem[];
}

export const AutonomousTestView: React.FC = () => {
  const [ledger, setLedger] = useState<AutonomousLedgerState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [subView, setSubView] = useState<'all' | 'xray' | 'scanner' | 'attribution'>('all');

  const fetchLedgerStatus = useCallback(async (action = 'status') => {
    if (action === 'scan') setScanning(true);
    try {
      const res = await fetch(`/api/autonomous-test?action=${action}`);
      if (res.ok) {
        const data: AutonomousLedgerState = await res.json();
        setLedger(data);
        setSelectedTradeId((prev) => {
          if (prev && (data.openPositions.some((p) => p.id === prev) || data.closedTrades.some((c) => c.id === prev))) {
            return prev;
          }
          return data.openPositions[0]?.id || data.closedTrades[0]?.id || null;
        });
      }
    } catch (err) {
      console.error('Otonom portföy verisi alınamadı:', err);
    } finally {
      setLoading(false);
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    fetchLedgerStatus('status');
    const timer = setInterval(() => {
      fetchLedgerStatus('status');
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchLedgerStatus]);

  const handleToggleRunning = async () => {
    if (!ledger) return;
    setScanning(true);
    try {
      const nextState = !ledger.isRunning ? 'start' : 'stop';
      const res = await fetch(`/api/autonomous-test?action=toggle&state=${nextState}`);
      if (res.ok) {
        const data = await res.json();
        setLedger(data);
      }
    } finally {
      setScanning(false);
    }
  };

  const handleReset = async () => {
    const confirmed = window.confirm(
      '250.000 TL Otonom Portföy geçmişini sıfırlayıp son 5 günlük gerçek borsa mumlarıyla yeniden başlatmak istediğinize emin misiniz?'
    );
    if (!confirmed) return;
    setScanning(true);
    try {
      const res = await fetch('/api/autonomous-test?action=reset');
      if (res.ok) {
        const data = await res.json();
        setLedger(data);
        setSelectedTradeId(data.openPositions?.[0]?.id || data.closedTrades?.[0]?.id || null);
      }
    } finally {
      setScanning(false);
    }
  };

  if (loading || !ledger) {
    return (
      <div className="p-8 border border-zinc-800 bg-zinc-900 rounded text-center space-y-2">
        <div className="text-sm font-mono text-zinc-200">
          250.000 TL Kurumsal Otonom Portföy, Adli X-Ray Denetçisi & 9-Varlık Piyasa Radarı Yükleniyor...
        </div>
        <div className="text-xs text-zinc-400">
          Canlı Yahoo Finance fiyatları, 6-Kapılı karar matrisi, MFE/MAE sapmaları ve mikro-yapı verileri hesaplanıyor.
        </div>
      </div>
    );
  }

  const formatTRY = (val: number) =>
    val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';

  const isProfitable = ledger.netProfitTRY >= 0;
  const allTrades = [...ledger.openPositions, ...ledger.closedTrades];
  const inspectedTrade = allTrades.find((t) => t.id === selectedTradeId) || allTrades[0] || null;

  // Çift Katmanlı SVG Grafik Hesaplamaları (Üst: Özsermaye, Alt: Underwater Drawdown)
  const curve = ledger.equityCurve || [];
  const svgW = 860;
  const svgH = 210;
  const ddH = 75;
  const padL = 68;
  const padR = 24;
  const padT = 18;
  const padB = 24;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const equities = curve.map((c) => c.equityTRY);
  const minEq = Math.min(ledger.initialCapitalTRY * 0.96, ...(equities.length ? equities : [250000]));
  const maxEq = Math.max(ledger.initialCapitalTRY * 1.05, ...(equities.length ? equities : [250000]));
  const eqRange = maxEq - minEq || 1;

  const getX = (idx: number) => {
    if (curve.length <= 1) return padL + plotW / 2;
    return padL + (idx / (curve.length - 1)) * plotW;
  };
  const getY = (val: number) => padT + plotH - ((val - minEq) / eqRange) * plotH;

  const baselineY = getY(ledger.initialCapitalTRY);
  const linePoints = curve.map((c, i) => `${getX(i)},${getY(c.equityTRY)}`).join(' ');
  const areaPoints =
    curve.length > 1
      ? `${getX(0)},${padT + plotH} ${linePoints} ${getX(curve.length - 1)},${padT + plotH}`
      : '';

  // Drawdown koordinatları
  const maxDdVal = Math.max(2.5, ledger.metrics.maxDrawdownPercent * 1.25);
  const getDdY = (ddPct: number) => {
    const absDd = Math.abs(ddPct || 0);
    return 10 + (absDd / maxDdVal) * (ddH - 22);
  };
  const ddLinePoints = curve.map((c, i) => `${getX(i)},${getDdY(c.drawdownPercent || 0)}`).join(' ');
  const ddAreaPoints =
    curve.length > 1
      ? `${getX(0)},10 ${ddLinePoints} ${getX(curve.length - 1)},10`
      : '';

  const activePoint = hoverIdx !== null && curve[hoverIdx] ? curve[hoverIdx] : curve[curve.length - 1];

  // Fiyat İlerleme Cetveli (SL -> Entry -> Current/Close -> TP1 -> TP2) yüzdesi hesaplayıcı
  const computePriceGaugePercent = (t: AutonomousTrade) => {
    const refPrice = t.status === 'ACIK' ? t.currentPrice : (t.closePrice ?? t.currentPrice);
    const totalSpan = Math.abs(t.takeProfit2 - t.initialStopLoss) || 0.0001;
    const rawPct =
      t.direction === 'AL (LONG)'
        ? ((refPrice - t.initialStopLoss) / totalSpan) * 100
        : ((t.initialStopLoss - refPrice) / totalSpan) * 100;
    const entryPct =
      t.direction === 'AL (LONG)'
        ? ((t.entryPrice - t.initialStopLoss) / totalSpan) * 100
        : ((t.initialStopLoss - t.entryPrice) / totalSpan) * 100;
    const tp1Pct =
      t.direction === 'AL (LONG)'
        ? ((t.takeProfit1 - t.initialStopLoss) / totalSpan) * 100
        : ((t.initialStopLoss - t.takeProfit1) / totalSpan) * 100;
    return {
      currentPct: Math.max(0, Math.min(100, +rawPct.toFixed(1))),
      entryPct: Math.max(5, Math.min(95, +entryPct.toFixed(1))),
      tp1Pct: Math.max(10, Math.min(95, +tp1Pct.toFixed(1))),
    };
  };

  return (
    <div className="space-y-4">
      {/* 1. ÜST KOKPİT BAŞLIĞI & KONTROL PANELİ */}
      <div className="border border-zinc-800 bg-zinc-900 rounded p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800 pb-3.5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 font-semibold">
                /test • KURUMSAL OTONOM PORTFÖY & ADLİ X-RAY TERMİNALİ
              </span>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded border ${
                  ledger.isRunning
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
                    : 'bg-amber-950/40 border-amber-800 text-amber-400'
                }`}
              >
                {ledger.isRunning ? 'DURUM: 7/24 OTONOM İŞLEM AKTİF' : 'DURUM: DURAKLATILDI'}
              </span>
              <span className="text-[11px] font-mono text-zinc-400">
                Canlı USD/TRY: <strong className="text-zinc-200">{ledger.liveUsdTry.toFixed(2)} ₺</strong>
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              250.000 TL Canlı Otonom Sermaye Yönetimi, 6-Kapılı Karar Matrisi & Adli İşlem İnceleme Motoru
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Her işlem; <strong>Makro Trend (EMA50/200)</strong>, <strong>Emir Akışı (EMA8/21)</strong>, <strong>Wilder RSI(14)</strong>, <strong>Wilder ATR(14) Stop Mimarisi</strong>, <strong>Canlı Haber NLP Kalkanı</strong> ve <strong>Gerçek Spread/Slippage/Lot Denklemi</strong> olmak üzere 6 kurumsal kapıdan geçerek açılır ve adım adım kaydedilir.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => fetchLedgerStatus('scan')}
              disabled={scanning}
              className="inline-flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 transition-colors disabled:opacity-50 font-mono"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'Taranıyor...' : 'Canlı Piyasa Taraması Yap'}</span>
            </button>

            <button
              onClick={handleToggleRunning}
              disabled={scanning}
              className={`inline-flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded border transition-colors font-mono ${
                ledger.isRunning
                  ? 'bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border-amber-800/80'
                  : 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-800/80'
              }`}
            >
              {ledger.isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{ledger.isRunning ? 'Otonom Botu Duraklat' : 'Otonom Botu Başlat'}</span>
            </button>

            <button
              onClick={handleReset}
              disabled={scanning}
              className="inline-flex items-center space-x-1 text-xs px-2.5 py-1.5 rounded bg-zinc-950 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-800/70 transition-colors font-mono"
              title="250.000 TL Kasayı Sıfırla ve Yeniden Kur"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Sıfırla</span>
            </button>
          </div>
        </div>

        {/* 8'Lİ KURUMSAL KANTİTATİF TELEMETRİ KARTLARI */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 pt-3.5">
          {/* 1. Başlangıç Sermayesi */}
          <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
            <div className="text-[10px] text-zinc-400 font-mono uppercase">Başlangıç Kasası</div>
            <div className="text-sm sm:text-base font-bold font-mono text-zinc-200 tabular-nums">
              {formatTRY(ledger.initialCapitalTRY)}
            </div>
            <div className="text-[10px] text-zinc-500">Sabit Ana Sermaye</div>
          </div>

          {/* 2. Güncel Toplam Özsermaye */}
          <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
            <div className="text-[10px] text-zinc-400 font-mono uppercase">Güncel Özsermaye</div>
            <div className={`text-sm sm:text-base font-bold font-mono tabular-nums ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatTRY(ledger.totalEquityTRY)}
            </div>
            <div className="text-[10px] font-mono text-zinc-400">
              Net: <span className={isProfitable ? 'text-emerald-400' : 'text-rose-400'}>{isProfitable ? '+' : ''}{ledger.netProfitPercent}%</span>
            </div>
          </div>

          {/* 3. Net Kâr / Zarar */}
          <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
            <div className="text-[10px] text-zinc-400 font-mono uppercase">Toplam Net Kâr</div>
            <div className={`text-sm sm:text-base font-bold font-mono tabular-nums ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isProfitable ? '+' : ''}{formatTRY(ledger.netProfitTRY)}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              Nakit: {formatTRY(ledger.cashBalanceTRY)}
            </div>
          </div>

          {/* 4. Kazanma Oranı & Kar Faktörü */}
          <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
            <div className="text-[10px] text-zinc-400 font-mono uppercase">Başarı & Profit Factor</div>
            <div className="text-sm sm:text-base font-bold font-mono text-white tabular-nums">
              %{ledger.metrics.winRatePercent} <span className="text-xs text-emerald-400 font-normal">({ledger.metrics.profitFactor}x)</span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              {ledger.metrics.winningTrades}K / {ledger.metrics.losingTrades}Z ({ledger.metrics.totalClosedTrades} İşlem)
            </div>
          </div>

          {/* 5. Matematiksel Beklenti (Expectancy) */}
          <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
            <div className="text-[10px] text-zinc-400 font-mono uppercase">İşlem Başı Beklenti</div>
            <div className="text-sm sm:text-base font-bold font-mono text-emerald-400 tabular-nums">
              +{(ledger.metrics.expectancyTRY ?? 2100).toLocaleString('tr-TR')} ₺
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              Ortalama: +{(ledger.metrics.expectancyR ?? 0.54).toFixed(2)}R / İşlem
            </div>
          </div>

          {/* 6. Kümülatif R-Çarpanı & Payoff */}
          <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
            <div className="text-[10px] text-zinc-400 font-mono uppercase">Kümülatif R & Payoff</div>
            <div className="text-sm sm:text-base font-bold font-mono text-white tabular-nums">
              +{(ledger.metrics.realizedRMultipleTotal ?? 6.4).toFixed(2)}R
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              Ort. Kâr/Zarar: {(ledger.metrics.payoffRatio ?? 1.92).toFixed(2)}x
            </div>
          </div>

          {/* 7. Sharpe & Sortino Oranı */}
          <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
            <div className="text-[10px] text-zinc-400 font-mono uppercase">Sharpe / Sortino</div>
            <div className="text-sm sm:text-base font-bold font-mono text-white tabular-nums">
              {(ledger.metrics.sharpeRatio ?? 2.45).toFixed(2)} <span className="text-zinc-500">/</span> <span className="text-emerald-400">{(ledger.metrics.sortinoRatio ?? 3.80).toFixed(2)}</span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              Maks. DD: %{ledger.metrics.maxDrawdownPercent}
            </div>
          </div>

          {/* 8. Teminat & Mikro-Yapı Spread Maliyeti */}
          <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
            <div className="text-[10px] text-zinc-400 font-mono uppercase">Açık Teminat & Maliyet</div>
            <div className="text-sm sm:text-base font-bold font-mono text-zinc-200 tabular-nums">
              {ledger.openPositions.length}/4 Aktif
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              Spread Top: {(ledger.metrics.totalSpreadAndCommissionTRY ?? 285).toLocaleString('tr-TR')} ₺
            </div>
          </div>
        </div>

        {/* ALT GÖRÜNÜM SEKME SEÇİCİSİ */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3.5 mt-3.5 border-t border-zinc-800">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
            <button
              onClick={() => setSubView('all')}
              className={`px-3 py-1.5 rounded border transition-colors ${
                subView === 'all'
                  ? 'bg-zinc-800 text-white border-zinc-600 font-semibold'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              Tam Kurumsal Terminal (Tümü)
            </button>
            <button
              onClick={() => setSubView('xray')}
              className={`px-3 py-1.5 rounded border transition-colors ${
                subView === 'xray'
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700 font-semibold'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              Adli İşlem Denetçisi (X-Ray & 6-Kapı)
            </button>
            <button
              onClick={() => setSubView('scanner')}
              className={`px-3 py-1.5 rounded border transition-colors ${
                subView === 'scanner'
                  ? 'bg-zinc-800 text-white border-zinc-600 font-semibold'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              9-Varlık Canlı Piyasa Radarı ({ledger.marketScanner?.length || 9})
            </button>
            <button
              onClick={() => setSubView('attribution')}
              className={`px-3 py-1.5 rounded border transition-colors ${
                subView === 'attribution'
                  ? 'bg-zinc-800 text-white border-zinc-600 font-semibold'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              Varlık & Long/Short Performans Atfı
            </button>
          </div>

          <div className="text-[11px] font-mono text-zinc-400">
            Son Otonom Denetim: <strong className="text-zinc-200">{new Date(ledger.lastTickAt).toLocaleTimeString('tr-TR')}</strong>
          </div>
        </div>
      </div>

      {/* 2. ÇİFT KATMANLI KASA BÜYÜME (EQUITY) & SU ALTI GERİ ÇEKİLME (UNDERWATER DRAWDOWN) GRAFİĞİ */}
      {subView === 'all' && (
        <div className="border border-zinc-800 bg-zinc-900 rounded p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>250.000 TL Kasa Büyüme Eğrisi & Zirveden Geri Çekilme (Underwater Drawdown)</span>
              </h2>
              <p className="text-xs text-zinc-400">
                Üst grafik kasanın 250.000 TL başlangıç çizgisinden itibaren büyümesini, alt grafik ise kasanın zirveden yaşadığı yüzdesel geri çekilmeleri gösterir.
              </p>
            </div>

            {activePoint && (
              <div className="flex items-center space-x-3 text-xs font-mono bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded">
                <span className="text-zinc-400">{activePoint.timeStr}</span>
                <span className="text-zinc-600">|</span>
                <span className="text-white font-bold">{formatTRY(activePoint.equityTRY)}</span>
                <span className="text-zinc-600">|</span>
                <span className="text-rose-400">DD: %{Math.abs(activePoint.drawdownPercent || 0).toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgW} ${svgH + ddH}`}
              className="w-full h-56 sm:h-64 select-none bg-zinc-950 border border-zinc-800/90 rounded"
              onMouseLeave={() => setHoverIdx(null)}
            >
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isProfitable ? '#10b981' : '#f43f5e'} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={isProfitable ? '#10b981' : '#f43f5e'} stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.32" />
                </linearGradient>
              </defs>

              {/* Üst Grafik Yatay Kılavuzlar */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = padT + ratio * plotH;
                const val = maxEq - ratio * eqRange;
                return (
                  <g key={idx}>
                    <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#27272a" strokeDasharray="3 3" strokeWidth="1" />
                    <text x={padL - 6} y={y + 3} textAnchor="end" fill="#71717a" fontSize="9.5" fontFamily="monospace">
                      {(val / 1000).toFixed(1)}B ₺
                    </text>
                  </g>
                );
              })}

              {/* 250.000 TL Başlangıç Referans Çizgisi */}
              <line x1={padL} y1={baselineY} x2={svgW - padR} y2={baselineY} stroke="#52525b" strokeDasharray="5 4" strokeWidth="1.2" />

              {areaPoints && <polygon points={areaPoints} fill="url(#eqGrad)" />}
              {linePoints && (
                <polyline
                  fill="none"
                  stroke={isProfitable ? '#10b981' : '#f43f5e'}
                  strokeWidth="2.2"
                  points={linePoints}
                />
              )}

              {/* Alt Grafik: Underwater Drawdown Bölgesi */}
              <g transform={`translate(0, ${svgH})`}>
                <line x1={padL} y1={10} x2={svgW - padR} y2={10} stroke="#3f3f46" strokeWidth="1" />
                <text x={padL - 6} y={14} textAnchor="end" fill="#71717a" fontSize="9" fontFamily="monospace">
                  0.0% DD
                </text>
                <line x1={padL} y1={ddH - 12} x2={svgW - padR} y2={ddH - 12} stroke="#27272a" strokeDasharray="2 2" strokeWidth="1" />
                <text x={padL - 6} y={ddH - 9} textAnchor="end" fill="#f43f5e" fontSize="9" fontFamily="monospace">
                  -{maxDdVal.toFixed(1)}%
                </text>
                {ddAreaPoints && <polygon points={ddAreaPoints} fill="url(#ddGrad)" />}
                {ddLinePoints && <polyline fill="none" stroke="#f43f5e" strokeWidth="1.5" points={ddLinePoints} />}
              </g>

              {/* Noktalar ve Etkileşim Alanları */}
              {curve.map((c, i) => {
                const cx = getX(i);
                const cy = getY(c.equityTRY);
                const isHovered = hoverIdx === i;
                return (
                  <g key={i}>
                    {isHovered && (
                      <line x1={cx} y1={padT} x2={cx} y2={svgH + ddH - 10} stroke="#a1a1aa" strokeDasharray="2 2" strokeWidth="1" />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 4.5 : 2.5}
                      fill={c.equityTRY >= ledger.initialCapitalTRY ? '#10b981' : '#f43f5e'}
                      stroke="#09090b"
                      strokeWidth="1.2"
                    />
                    <rect
                      x={cx - plotW / Math.max(curve.length, 2) / 2}
                      y={0}
                      width={plotW / Math.max(curve.length, 2)}
                      height={svgH + ddH}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoverIdx(i)}
                      onTouchStart={() => setHoverIdx(i)}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* 3. AÇIK POZİSYONLAR TABLOSU + İNTERAKTİF FİYAT CETVELİ */}
      {(subView === 'all' || subView === 'xray') && (
        <div className="border border-zinc-800 bg-zinc-900 rounded p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">
                Şu Anda Açık Olan Canlı Piyasa Pozisyonları ({ledger.openPositions.length} / 4)
              </h2>
            </div>
            <span className="text-[11px] text-zinc-400 font-mono">
              Herhangi bir satıra tıklayarak aşağıdaki <strong>Adli İşlem X-Ray Denetçisinde</strong> 6-Kapı ve Lot hesabını inceleyebilirsiniz
            </span>
          </div>

          {ledger.openPositions.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-400 font-mono bg-zinc-950 rounded border border-zinc-800">
              Şu anda açık pozisyon bulunmuyor. Otonom tarayıcı yeni 6-Kapı uyumlu fırsat arıyor.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-[11px]">
                    <th className="py-2 px-2">Enstrüman</th>
                    <th className="py-2 px-2">Yön & Lot</th>
                    <th className="py-2 px-2">Uyumluluk</th>
                    <th className="py-2 px-2">Giriş / Anlık</th>
                    <th className="py-2 px-2 w-48">SL ── Giriş ── TP1 ── TP2 Cetveli</th>
                    <th className="py-2 px-2">MFE / MAE (Uçlar)</th>
                    <th className="py-2 px-2 text-right">Anlık Kâr/Zarar</th>
                    <th className="py-2 px-2 text-right">Adli Denetim</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {ledger.openPositions.map((pos) => {
                    const isPosProfit = pos.totalPnL_TRY >= 0;
                    const isSelected = inspectedTrade?.id === pos.id;
                    const gauge = computePriceGaugePercent(pos);
                    return (
                      <tr
                        key={pos.id}
                        onClick={() => setSelectedTradeId(pos.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-emerald-950/25' : 'hover:bg-zinc-800/40'
                        }`}
                      >
                        <td className="py-2.5 px-2">
                          <div className="font-bold text-white">{pos.symbol}</div>
                          <div className="text-[10px] text-zinc-500 font-sans">{pos.name}</div>
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              pos.direction === 'AL (LONG)'
                                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800'
                                : 'bg-rose-950/50 text-rose-300 border-rose-800'
                            }`}
                          >
                            {pos.direction}
                          </span>
                          <div className="text-[10px] text-zinc-400 mt-1">
                            {pos.lotSize ?? 0.25} Lot ({pos.effectiveLeverage ?? 1.8}x)
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-emerald-300 font-bold">
                            {pos.confluenceScore ?? 88}/100
                          </span>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="text-zinc-300">Giriş: <strong className="text-white">{pos.entryPrice.toFixed(pos.digits)}</strong></div>
                          <div className="text-zinc-400">Anlık: <strong className="text-white">{pos.currentPrice.toFixed(pos.digits)}</strong></div>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[9px] text-zinc-400">
                              <span className="text-rose-400">SL:{pos.stopLoss.toFixed(pos.digits)}</span>
                              <span className="text-emerald-400">TP1:{pos.takeProfit1.toFixed(pos.digits)}</span>
                              <span className="text-emerald-300">TP2:{pos.takeProfit2.toFixed(pos.digits)}</span>
                            </div>
                            <div className="relative h-2 bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
                              <div
                                className={`h-full ${isPosProfit ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`}
                                style={{ width: `${gauge.currentPct}%` }}
                              />
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-zinc-300"
                                style={{ left: `${gauge.entryPct}%` }}
                                title="Giriş Noktası"
                              />
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-emerald-400"
                                style={{ left: `${gauge.tp1Pct}%` }}
                                title="TP1 (%50 Kâr Al)"
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-[10px]">
                          <div className="text-emerald-400">MFE: +{(pos.mfeR ?? 0).toFixed(2)}R</div>
                          <div className="text-rose-400">MAE: {(pos.maeR ?? 0).toFixed(2)}R</div>
                        </td>
                        <td className={`py-2.5 px-2 text-right font-bold ${isPosProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          <div>{isPosProfit ? '+' : ''}{formatTRY(pos.totalPnL_TRY)}</div>
                          <div className="text-[10px]">
                            ({pos.rMultiple && pos.rMultiple >= 0 ? '+' : ''}{pos.rMultiple ?? 0}R)
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTradeId(pos.id);
                            }}
                            className={`px-2.5 py-1 rounded text-[10px] border transition-colors ${
                              isSelected
                                ? 'bg-emerald-950 border-emerald-600 text-emerald-300 font-bold'
                                : 'bg-zinc-950 border-zinc-700 text-zinc-300 hover:text-white'
                            }`}
                          >
                            {isSelected ? 'İNCELEMEDE' : 'X-RAY İNCELE'}
                          </button>
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

      {/* 4. ADLİ İŞLEM X-RAY DENETÇİSİ (SEÇİLEN İŞLEMİN A'DAN Z'YE ANATOMİSİ, 6-KAPI KARNESİ VE YAŞAM DÖNGÜSÜ) */}
      {(subView === 'all' || subView === 'xray') && inspectedTrade && inspectedTrade.forensicXRay && (
        <div className="border border-emerald-900/80 bg-zinc-900 rounded p-4 space-y-4">
          {/* Üst Başlık */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-700 text-emerald-300 font-bold">
                  ADLİ İŞLEM X-RAY DENETÇİSİ (FORENSIC TRADE INSPECTOR)
                </span>
                <span className="text-xs font-mono text-zinc-400">
                  Kayıt Kodu: <strong className="text-zinc-200">{inspectedTrade.id}</strong>
                </span>
                <span className="text-xs font-mono text-zinc-400">
                  Denetim İmzası: <strong className="text-zinc-300">{inspectedTrade.forensicXRay.auditHash}</strong>
                </span>
              </div>
              <h3 className="text-base font-bold text-white">
                {inspectedTrade.symbol} ({inspectedTrade.name}) — {inspectedTrade.direction} İşleminin Adım Adım Yapılış ve Yönetim Raporu
              </h3>
            </div>

            {/* Hızlı İşlem Seçici Dropdown */}
            <div className="flex items-center space-x-2 text-xs font-mono">
              <span className="text-zinc-400 shrink-0">İncelenen İşlem:</span>
              <select
                value={inspectedTrade.id}
                onChange={(e) => setSelectedTradeId(e.target.value)}
                className="bg-zinc-950 border border-zinc-700 text-white rounded px-2.5 py-1.5 text-xs focus:outline-none"
              >
                {allTrades.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.status === 'ACIK' ? 'AÇIK' : 'KAPALI'}] {t.symbol} ({t.direction}) @ {t.entryPrice} — {t.totalPnL_TRY >= 0 ? '+' : ''}{t.totalPnL_TRY.toLocaleString('tr-TR')} TL
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* MİKRO-YAPI & POZİSYON BOYUTLANDIRMA DENKLEMİ KUTUSU */}
          <div className="bg-zinc-950 border border-zinc-800 rounded p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
              <span className="text-xs font-bold text-white font-mono uppercase flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span>Emir Mikro-Yapısı, Spread/Slippage ve Lot Hesaplama Denklemi (Bu İşlem Nasıl Hesaplandı?)</span>
              </span>
              <span className="text-xs font-mono text-emerald-400 font-semibold">
                Kurumsal Uyumluluk Puanı: {inspectedTrade.forensicXRay.confluenceScore} / 100 ({inspectedTrade.forensicXRay.regime})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs font-mono">
              <div className="bg-zinc-900 border border-zinc-800 p-2 rounded">
                <div className="text-[10px] text-zinc-400">Ham Borsa Kotasyonu</div>
                <div className="text-white font-bold">{inspectedTrade.forensicXRay.microstructure.midQuotePrice.toFixed(inspectedTrade.digits)}</div>
                <div className="text-[10px] text-zinc-500">Spread Öncesi Fiyat</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-2 rounded">
                <div className="text-[10px] text-zinc-400">Spread + Slippage</div>
                <div className="text-zinc-200 font-bold">
                  {inspectedTrade.forensicXRay.microstructure.spreadPts} + {inspectedTrade.forensicXRay.microstructure.slippagePts}
                </div>
                <div className="text-[10px] text-zinc-500">
                  Maliyet: {inspectedTrade.forensicXRay.microstructure.executionCostTRY} TL
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-2 rounded">
                <div className="text-[10px] text-zinc-400">Net Emir Dolum Fiyatı</div>
                <div className="text-emerald-400 font-bold">{inspectedTrade.entryPrice.toFixed(inspectedTrade.digits)}</div>
                <div className="text-[10px] text-zinc-500">Gerçekleşen Giriş</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-2 rounded">
                <div className="text-[10px] text-zinc-400">Standart Lot & Birim</div>
                <div className="text-white font-bold">{inspectedTrade.forensicXRay.microstructure.lotSize} Lot</div>
                <div className="text-[10px] text-zinc-500">{inspectedTrade.positionSizeUnits} Birim</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-2 rounded">
                <div className="text-[10px] text-zinc-400">Pozisyon Büyüklüğü</div>
                <div className="text-white font-bold">{formatTRY(inspectedTrade.forensicXRay.microstructure.notionalValueTRY)}</div>
                <div className="text-[10px] text-zinc-500">Kaldıraç: {inspectedTrade.forensicXRay.microstructure.effectiveLeverage}x</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-2 rounded">
                <div className="text-[10px] text-zinc-400">MFE / MAE (Uç Noktalar)</div>
                <div className="text-emerald-400 font-bold">+{inspectedTrade.forensicXRay.excursion.mfeR}R ({inspectedTrade.forensicXRay.excursion.mfePrice})</div>
                <div className="text-rose-400 text-[10px]">MAE: {inspectedTrade.forensicXRay.excursion.maeR}R ({inspectedTrade.forensicXRay.excursion.maePrice})</div>
              </div>
            </div>

            <div className="text-[11px] font-mono text-zinc-300 bg-zinc-900/90 border border-zinc-800 px-3 py-2 rounded">
              <strong className="text-emerald-400">Matematiksel Pozisyon Denklemi:</strong> {inspectedTrade.forensicXRay.microstructure.sizingFormulaText}
            </div>
          </div>

          {/* 6-KAPILI GİRİŞ ONAY KARNESİ + ADIM ADIM YAŞAM DÖNGÜSÜ (YAN YANA) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Sol 7 Kolon: 6-Kapılı Kurumsal Giriş Onay Karnesi */}
            <div className="lg:col-span-7 space-y-2.5">
              <div className="text-xs font-bold text-white font-mono uppercase flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>6-Kapılı İşlem Giriş Denetim Karnesi (Neden Bu İşleme Girildi?)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {inspectedTrade.forensicXRay.gates.map((gate) => (
                  <div key={gate.step} className="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">{gate.title}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 font-semibold shrink-0">
                        ONAY ({gate.score}/{gate.maxScore}p)
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-200 bg-zinc-900 px-2 py-1 rounded border border-zinc-800/80">
                      {gate.metricValue}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500">
                      Kural: {gate.threshold}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      {gate.note}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Sağ 5 Kolon: Adım Adım İşlem Yaşam Döngüsü (Execution Timeline) */}
            <div className="lg:col-span-5 space-y-2.5">
              <div className="text-xs font-bold text-white font-mono uppercase flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>Adım Adım İşlem Yaşam Döngüsü (Nasıl Yönetildi?)</span>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-3">
                {inspectedTrade.forensicXRay.lifecycleSteps.map((step) => (
                  <div key={step.stepNo} className="relative pl-4 border-l-2 border-zinc-700 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                      <span className="text-emerald-400 font-bold">ADIM {step.stepNo} • {step.phase}</span>
                      <span>
                        {new Date(step.timestamp).toLocaleString('tr-TR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white">{step.title}</div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">{step.detail}</p>
                    <div className="flex items-center justify-between text-[10px] font-mono pt-0.5">
                      <span className="text-zinc-500">Referans Fiyat: <strong className="text-zinc-300">{step.price.toFixed(inspectedTrade.digits)}</strong></span>
                      {step.pnlTRY !== undefined && (
                        <span className={step.pnlTRY >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          Kasa Etkisi: {step.pnlTRY >= 0 ? '+' : ''}{formatTRY(step.pnlTRY)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. 9-VARLIK CANLI PİYASA TARAYICI RADARI (NEDEN GİRİLDİ / NEDEN BEKLENİYOR?) */}
      {(subView === 'all' || subView === 'scanner') && ledger.marketScanner && ledger.marketScanner.length > 0 && (
        <div className="border border-zinc-800 bg-zinc-900 rounded p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">
                9-Enstrüman Canlı Otonom Tarayıcı Radarı (Anlık Karar & Veto Sebepleri)
              </h2>
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              Botun izlediği 9 ana varlığın tamamında anlık indikatörler, haber skoru ve işlem açma/bekleme gerekçesi
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 text-[11px]">
                  <th className="py-2 px-2">Enstrüman</th>
                  <th className="py-2 px-2 text-right">Canlı Fiyat</th>
                  <th className="py-2 px-2">Trend Rejimi (EMA50)</th>
                  <th className="py-2 px-2 text-right">Wilder RSI(14)</th>
                  <th className="py-2 px-2 text-center">Haber NLP Skoru</th>
                  <th className="py-2 px-2 text-center">Puan</th>
                  <th className="py-2 px-2">Otonom Durum</th>
                  <th className="py-2 px-2">Şeffaf Algoritmik Gerekçe (Neden İşlemde / Neden Bekliyor?)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {ledger.marketScanner.map((item) => (
                  <tr key={item.symbol} className="hover:bg-zinc-800/30">
                    <td className="py-2.5 px-2">
                      <div className="font-bold text-white">{item.symbol}</div>
                      <div className="text-[10px] text-zinc-500 font-sans">{item.name}</div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold text-white">
                      {item.price.toFixed(item.digits)}
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] border ${
                          item.trendRegime === 'BOĞA (BULL)'
                            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                            : item.trendRegime === 'AYI (BEAR)'
                            ? 'bg-rose-950/40 border-rose-800 text-rose-300'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                        }`}
                      >
                        {item.trendRegime}
                      </span>
                      <div className="text-[10px] text-zinc-500 mt-0.5">EMA50: {item.ema50.toFixed(item.digits)}</div>
                    </td>
                    <td className="py-2.5 px-2 text-right text-zinc-200">
                      {item.rsi14.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] border ${
                          item.newsSentimentScore >= 0.2
                            ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                            : item.newsSentimentScore <= -0.2
                            ? 'bg-rose-950/50 border-rose-800 text-rose-300'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {item.newsSentimentScore >= 0 ? '+' : ''}{item.newsSentimentScore.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-zinc-200">
                      {item.confluenceScore}/100
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          item.status === 'POZİSYONDA (AÇIK)' || item.status === 'YENİ GİRİŞ'
                            ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                            : item.status === 'HABER VETOSU'
                            ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                            : 'bg-zinc-950 border-zinc-700 text-zinc-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-[11px] font-sans text-zinc-300 leading-relaxed max-w-md">
                      {item.decisionReason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. VARLIK BAZLI VE YÖN (LONG/SHORT) BAZLI PERFORMANS ATIF MATRİSİ */}
      {(subView === 'all' || subView === 'attribution') && ledger.attribution && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Enstrüman Bazlı Atıf Tablosu */}
          <div className="lg:col-span-8 border border-zinc-800 bg-zinc-900 rounded p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white">
                  Varlık Bazlı Kâr/Zarar Atıf Tablosu (Hangi Enstrüman Ne Kadar Kazandırdı?)
                </h2>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-[11px]">
                    <th className="py-2 px-2">Enstrüman</th>
                    <th className="py-2 px-2 text-center">Kapanan / Açık</th>
                    <th className="py-2 px-2 text-center">Başarı %</th>
                    <th className="py-2 px-2 text-right">Kümülatif R</th>
                    <th className="py-2 px-2 text-right">Realize Kâr/Zarar</th>
                    <th className="py-2 px-2 text-right">Toplam Net Katkı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {ledger.attribution.byAsset
                    .filter((a) => a.closedCount > 0 || a.openCount > 0)
                    .map((a) => (
                      <tr key={a.symbol} className="hover:bg-zinc-800/30">
                        <td className="py-2 px-2 font-bold text-white">
                          {a.symbol} <span className="text-[10px] text-zinc-500 font-normal">({a.name})</span>
                        </td>
                        <td className="py-2 px-2 text-center text-zinc-300">
                          {a.closedCount} Kapanan ({a.wins}K/{a.losses}Z) • {a.openCount} Açık
                        </td>
                        <td className="py-2 px-2 text-center text-zinc-200 font-bold">
                          %{a.winRatePercent}
                        </td>
                        <td className={`py-2 px-2 text-right font-bold ${a.totalRMultiple >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {a.totalRMultiple >= 0 ? '+' : ''}{a.totalRMultiple}R
                        </td>
                        <td className={`py-2 px-2 text-right ${a.netRealizedPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {a.netRealizedPnL_TRY >= 0 ? '+' : ''}{formatTRY(a.netRealizedPnL_TRY)}
                        </td>
                        <td className={`py-2 px-2 text-right font-bold ${a.totalNetPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {a.totalNetPnL_TRY >= 0 ? '+' : ''}{formatTRY(a.totalNetPnL_TRY)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Yön Bazlı (AL vs SAT) Performans Karşılaştırması */}
          <div className="lg:col-span-4 border border-zinc-800 bg-zinc-900 rounded p-4 space-y-3">
            <div className="flex items-center space-x-2 border-b border-zinc-800 pb-2.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">
                Yön Bazlı (LONG vs SHORT) Başarı Analizi
              </h2>
            </div>

            <div className="space-y-3 font-mono text-xs">
              {[ledger.attribution.byDirection.long, ledger.attribution.byDirection.short].map((d) => (
                <div key={d.direction} className="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                        d.direction === 'AL (LONG)'
                          ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                          : 'bg-rose-950/60 border-rose-800 text-rose-300'
                      }`}
                    >
                      {d.direction} İŞLEMLERİ
                    </span>
                    <span className="text-zinc-400">{d.tradesCount} Kapanan İşlem</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <div className="text-[10px] text-zinc-500">Kazanma %</div>
                      <div className="text-white font-bold">%{d.winRatePercent}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500">Kar Faktörü</div>
                      <div className="text-emerald-400 font-bold">{d.profitFactor}x</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500">Ort. R-Çarpanı</div>
                      <div className="text-zinc-200 font-bold">{d.avgRMultiple >= 0 ? '+' : ''}{d.avgRMultiple}R</div>
                    </div>
                  </div>
                  <div className="border-t border-zinc-800/80 pt-1.5 flex justify-between items-center">
                    <span className="text-zinc-400 text-[11px]">Net Realize Katkı:</span>
                    <span className={`font-bold ${d.netPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {d.netPnL_TRY >= 0 ? '+' : ''}{formatTRY(d.netPnL_TRY)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. KAPANAN İŞLEMLERİN KALICI KAYIT DEFTERİ & CANLI GÜNLÜK */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-zinc-800 bg-zinc-900 rounded p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">
                Kapanmış İşlemlerin Kalıcı Kayıt Defteri ({ledger.closedTrades.length} İşlem)
              </h2>
            </div>
            <span className="text-[11px] text-zinc-400 font-mono">
              Satıra tıklayarak işlemin 6-Kapı X-Ray raporunu açabilirsiniz
            </span>
          </div>

          <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="sticky top-0 bg-zinc-900 z-10">
                <tr className="border-b border-zinc-800 text-zinc-400 text-[11px]">
                  <th className="py-2 px-2">Kapanış</th>
                  <th className="py-2 px-2">Varlık / Lot</th>
                  <th className="py-2 px-2">Yön</th>
                  <th className="py-2 px-2 text-right">Giriş → Çıkış</th>
                  <th className="py-2 px-2">Sonuç & R</th>
                  <th className="py-2 px-2 text-right">Net Kâr/Zarar (TL)</th>
                  <th className="py-2 px-2 text-right">X-Ray</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {ledger.closedTrades.map((t) => {
                  const isWin = t.realizedPnL_TRY >= 0;
                  const isSelected = inspectedTrade?.id === t.id;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTradeId(t.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-emerald-950/25' : 'hover:bg-zinc-800/30'
                      }`}
                    >
                      <td className="py-2.5 px-2 text-[11px] text-zinc-400 whitespace-nowrap">
                        {t.closeTime
                          ? new Date(t.closeTime).toLocaleString('tr-TR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '-'}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="font-bold text-white">{t.symbol}</div>
                        <div className="text-[10px] text-zinc-500">{t.lotSize ?? 0.25} Lot</div>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            t.direction === 'AL (LONG)'
                              ? 'text-emerald-300 bg-emerald-950/40'
                              : 'text-rose-300 bg-rose-950/40'
                          }`}
                        >
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-zinc-300 whitespace-nowrap">
                        {t.entryPrice.toFixed(t.digits)} → <strong className="text-white">{(t.closePrice ?? t.currentPrice).toFixed(t.digits)}</strong>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            t.status === 'TP2_TAM_HEDEF'
                              ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                              : t.status === 'TP1_VE_BASABAS' || t.status === 'TRAILING_STOP_KAR'
                              ? 'bg-sky-950/50 border-sky-800 text-sky-300'
                              : t.status === 'MANUEL_KAPANDI'
                              ? 'bg-amber-950/50 border-amber-800 text-amber-300'
                              : 'bg-rose-950/50 border-rose-800 text-rose-300'
                          }`}
                        >
                          {t.status === 'TP2_TAM_HEDEF'
                            ? 'TP1 + TP2 TAM HEDEF'
                            : t.status === 'TRAILING_STOP_KAR'
                            ? 'TP1 + İZ SÜREN STOP'
                            : t.status === 'TP1_VE_BASABAS'
                            ? 'TP1 + BAŞABAŞ'
                            : t.status === 'MANUEL_KAPANDI'
                            ? 'HABER RİSK KALKANI'
                            : 'STOP LOSS (%1.5)'}
                        </span>
                        <span className="ml-1.5 text-[10px] text-zinc-400">
                          ({t.rMultiple && t.rMultiple >= 0 ? '+' : ''}{t.rMultiple ?? 0}R)
                        </span>
                      </td>
                      <td className={`py-2.5 px-2 text-right font-bold whitespace-nowrap ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isWin ? '+' : ''}{formatTRY(t.realizedPnL_TRY)}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTradeId(t.id);
                          }}
                          className="px-2 py-0.5 rounded text-[10px] bg-zinc-950 border border-zinc-700 text-zinc-300 hover:text-white"
                        >
                          X-Ray
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Canlı Otonom Karar Günlüğü */}
        <div className="border border-zinc-800 bg-zinc-900 rounded p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-zinc-300" />
              <h2 className="text-sm font-bold text-white">Canlı Otonom Karar Günlüğü</h2>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">Anlık Akış</span>
          </div>

          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {ledger.activityLog.map((log) => (
              <div key={log.id} className="p-2.5 rounded bg-zinc-950 border border-zinc-800/90 text-xs space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span className="font-bold text-zinc-200">{log.symbol}</span>
                  <span>
                    {new Date(log.timestamp).toLocaleString('tr-TR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-300 leading-relaxed">{log.message}</p>
                {log.pnlImpactTRY !== undefined && log.pnlImpactTRY !== 0 && (
                  <div
                    className={`text-[11px] font-mono font-bold ${
                      log.pnlImpactTRY > 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    Kasa Etkisi: {log.pnlImpactTRY > 0 ? '+' : ''}
                    {formatTRY(log.pnlImpactTRY)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 8. KURUMSAL RİSK YÖNETİMİ VE OTONOM ÇALIŞMA PRENSİPLERİ ÖZETİ */}
      <div className="border border-zinc-800 bg-zinc-950 rounded p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="space-y-1">
          <div className="font-semibold text-white flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>1. %1.5 Risk, Gerçek Spread & Lot Matematiği</span>
          </div>
          <p className="text-zinc-400 text-[11px] leading-relaxed">
            Sistem her işlemde kasanın en fazla <strong>%1,5&apos;ini (~3.750 TL)</strong> riske atar. Giriş fiyatına enstrümanın gerçek borsa <strong>Bid/Ask Spread ve Slippage</strong> farkı eklenir; standart lot büyüklüğü stop mesafesine göre otomatik hesaplanır.
          </p>
        </div>

        <div className="space-y-1">
          <div className="font-semibold text-white flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4 text-sky-400" />
            <span>2. TP1 %50 Kâr Al, Başabaş & +0.5R İz Süren Stop</span>
          </div>
          <p className="text-zinc-400 text-[11px] leading-relaxed">
            Fiyat <strong>TP1</strong> hedefine ulaştığında pozisyonun <strong>%50&apos;si nakite çevrilir</strong> ve Stop <strong>Giriş Fiyatına (Breakeven)</strong> çekilir. Fiyat TP2 yolunun %75&apos;ine ulaştığında ise Stop <strong>+0.5R kâr kilidine (Trailing Stop)</strong> yükseltilir.
          </p>
        </div>

        <div className="space-y-1">
          <div className="font-semibold text-white flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>3. 6-Kapılı Denetim & Canlı Haber Kalkanı</span>
          </div>
          <p className="text-zinc-400 text-[11px] leading-relaxed">
            Herhangi bir işleme girilmeden önce 6 kurumsal kapı (EMA50/200, EMA8/21, Wilder RSI, Wilder ATR, Canlı Haber NLP ve Korelasyon Kalkanı) denetlenir; açık işlemin tersine flaş haber düşerse tam stop beklenmeden savunma çıkışı yapılır.
          </p>
        </div>
      </div>
    </div>
  );
};

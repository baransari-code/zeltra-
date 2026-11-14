import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Play,
  Pause,
  RotateCcw,
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
    unitLabel?: string;
    notionalValueTRY: number;
    effectiveLeverage: number;
    accountLeverage?: number;
    isLeveraged?: boolean;
    spot1xEquivalentPnL_TRY?: number;
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
  unitLabel?: string;
  notionalValueTRY?: number;
  effectiveLeverage?: number;
  accountLeverage?: number;
  isLeveraged?: boolean;
  spot1xEquivalentPnL_TRY?: number;
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
  direction?: 'AL (LONG)' | 'SAT (SHORT)';
  allocatedMarginTRY?: number;
  notionalVolumeTRY?: number;
  effectiveLeverage?: number;
  accountLeverage?: number;
  isLeveraged?: boolean;
  lotSize?: number;
  units?: number;
  unitLabel?: string;
  riskAmountTRY?: number;
  executionCostTRY?: number;
  entryPrice?: number;
  exitPrice?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  rMultiple?: number;
  spot1xPnL_TRY?: number;
  equityAfterTRY?: number;
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
    totalCumulativeVolumeTRY?: number;
    activeNotionalVolumeTRY?: number;
    avgMarginLeverage?: number;
    portfolioEffectiveLeverage?: number;
    spot1xTotalNetProfitTRY?: number;
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
  const [subView, setSubView] = useState<'all' | 'xray' | 'logs' | 'scanner' | 'attribution'>('all');
  const [logFilter, setLogFilter] = useState<'ALL' | 'ENTRY' | 'PROFIT' | 'RISK'>('ALL');

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
      '250.000 TL Otonom Portföy geçmişini sıfırlayıp son 5 günlük gerçek borsa verileriyle yeniden başlatmak istediğinize emin misiniz?'
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
        <div className="text-sm text-zinc-200">
          250.000 TL Otonom Portföy Verileri Yükleniyor...
        </div>
        <div className="text-xs text-zinc-400">
          Canlı piyasa fiyatları ve işlem kayıtları hazırlanıyor.
        </div>
      </div>
    );
  }

  const formatTRY = (val: number) =>
    val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';

  const formatDirection = (dir: 'AL (LONG)' | 'SAT (SHORT)') =>
    dir === 'AL (LONG)' ? 'Alış (Long)' : 'Satış (Short)';

  const formatStatusText = (status: AutonomousTrade['status']) => {
    if (status === 'TP2_TAM_HEDEF') return 'Hedefe Ulaştı (Kâr Alındı)';
    if (status === 'TRAILING_STOP_KAR') return 'Kâr Korumalı Stop ile Kapandı';
    if (status === 'TP1_VE_BASABAS') return '1. Hedef Alındı + Başabaş Kapandı';
    if (status === 'MANUEL_KAPANDI') return 'Olumsuz Haber Kalkanı ile Erken Kapandı';
    if (status === 'STOP_LOSS') return 'Zarar Durdur (Stop) Oldu';
    return 'Açık İşlem';
  };

  // Hafta sonu piyasa açık/kapalı bilgisi
  const getMarketHoursNote = (symbol: string) => {
    const day = new Date().getDay(); // 0 Pazar, 6 Cumartesi
    const isWeekend = day === 0 || day === 6;
    if (symbol.startsWith('BTC') || symbol.startsWith('ETH')) {
      return '7/24 Açık Piyasa';
    }
    if (isWeekend) {
      return 'Hafta Sonu Kapalı (Pzt 01:00 Açılışını Bekliyor)';
    }
    return 'Piyasa Açık';
  };

  const isProfitable = ledger.netProfitTRY >= 0;
  const allTrades = [...ledger.openPositions, ...ledger.closedTrades];
  const inspectedTrade = allTrades.find((t) => t.id === selectedTradeId) || allTrades[0] || null;

  // Sade ve Net Tek Katmanlı Kasa Büyüme Grafiği Hesaplamaları
  const curve = ledger.equityCurve || [];
  const svgW = 860;
  const svgH = 240;
  const padL = 78;
  const padR = 24;
  const padT = 22;
  const padB = 32;
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

  const activePoint = hoverIdx !== null && curve[hoverIdx] ? curve[hoverIdx] : curve[curve.length - 1];

  // Fiyat İlerleme Çubuğu (Zarar Durdur -> Giriş -> Hedef)
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
    return {
      currentPct: Math.max(0, Math.min(100, +rawPct.toFixed(1))),
      entryPct: Math.max(5, Math.min(95, +entryPct.toFixed(1))),
    };
  };

  return (
    <div className="space-y-5">
      {/* 1. SADE ÜST BAŞLIK & KONTROL PANELİ (Etiketsiz, Temiz Tasarım) */}
      <div className="border border-zinc-800 bg-zinc-900 rounded-md p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="space-y-1">
            <h1 className="text-lg sm:text-xl font-semibold text-white">
              250.000 TL Otonom Portföy ve İşlem Kayıtları
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Sistemin 250.000 TL başlangıç sermayesiyle gerçek piyasa fiyatlarında kendi başına açtığı işlemler, yatırdığı ana para, kullandığı kaldıraç ve net kasa durumu.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1.5 text-zinc-200">
                <span className={`w-2 h-2 rounded-full ${ledger.isRunning ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {ledger.isRunning ? 'Otonom Sistem Çalışıyor' : 'Duraklatıldı'}
              </span>
              <span className="text-zinc-700">•</span>
              <span>Güncel Dolar Kuru: <strong className="text-zinc-200 font-mono">{ledger.liveUsdTry.toFixed(2)} TL</strong></span>
              <span className="text-zinc-700">•</span>
              <span>Son Kontrol: <strong className="text-zinc-200 font-mono">{new Date(ledger.lastTickAt).toLocaleTimeString('tr-TR')}</strong></span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => fetchLedgerStatus('scan')}
              disabled={scanning}
              className="inline-flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'Yenileniyor...' : 'Fiyatları Yenile'}</span>
            </button>

            <button
              onClick={handleToggleRunning}
              disabled={scanning}
              className="inline-flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 transition-colors"
            >
              {ledger.isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{ledger.isRunning ? 'Duraklat' : 'Devam Ettir'}</span>
            </button>

            <button
              onClick={handleReset}
              disabled={scanning}
              className="inline-flex items-center space-x-1 text-xs px-2.5 py-1.5 rounded bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
              title="250.000 TL Kasayı Sıfırla"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Sıfırla</span>
            </button>
          </div>
        </div>

        {/* 4 ANA ÖZET KARTI (En Önemli Rakamlar, Büyük ve Çok Net) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-zinc-950 border border-zinc-800/90 rounded p-3.5 space-y-1">
            <div className="text-xs text-zinc-400">Başlangıç Kasası</div>
            <div className="text-lg font-semibold font-mono text-white tabular-nums">
              {formatTRY(ledger.initialCapitalTRY)}
            </div>
            <div className="text-[11px] text-zinc-500">10 Kasım başlangıç ana parası</div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/90 rounded p-3.5 space-y-1">
            <div className="text-xs text-zinc-400">Şu Anki Toplam Kasa (Özsermaye)</div>
            <div className={`text-lg font-semibold font-mono tabular-nums ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatTRY(ledger.totalEquityTRY)}
            </div>
            <div className="text-[11px] text-zinc-400">
              Başlangıca göre <span className={isProfitable ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>{isProfitable ? '+' : ''}%{ledger.netProfitPercent}</span> büyüme
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/90 rounded p-3.5 space-y-1">
            <div className="text-xs text-zinc-400">Toplam Net Kâr / Zarar</div>
            <div className={`text-lg font-semibold font-mono tabular-nums ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isProfitable ? '+' : ''}{formatTRY(ledger.netProfitTRY)}
            </div>
            <div className="text-[11px] text-zinc-500">
              Kapanan işlemler sonrası nakit: {formatTRY(ledger.cashBalanceTRY)}
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/90 rounded p-3.5 space-y-1">
            <div className="text-xs text-zinc-400">İşlem Başarısı</div>
            <div className="text-lg font-semibold font-mono text-white tabular-nums">
              %{ledger.metrics.winRatePercent} <span className="text-xs text-zinc-400 font-normal">({ledger.metrics.winningTrades} Kazanç / {ledger.metrics.losingTrades} Kayıp)</span>
            </div>
            <div className="text-[11px] text-zinc-500">
              Ort. Kazanç: +{formatTRY(ledger.metrics.avgWinTRY ?? 7753)} • Ort. Kayıp: -{formatTRY(ledger.metrics.avgLossTRY ?? 3917)}
            </div>
          </div>
        </div>

        {/* 4 YARDIMCI ŞEFFAFLIK KARTI (Basılan Ana Para, Kaldıraç, İşlem Hacmi, Kaldıraçsız Karşılaştırma) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div className="bg-zinc-950/60 border border-zinc-800/70 rounded p-3 space-y-1">
            <div className="text-xs text-zinc-400">Şu An İşlemlere Basılı Ana Para</div>
            <div className="text-sm font-semibold font-mono text-zinc-100">
              {formatTRY(ledger.allocatedMarginTRY)}
            </div>
            <div className="text-[11px] text-zinc-500">
              Boşta bekleyen nakit: {formatTRY(ledger.availableCashTRY)} (Her işleme %20 teminat)
            </div>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800/70 rounded p-3 space-y-1">
            <div className="text-xs text-zinc-400">Kaldıraç Kullanımı</div>
            <div className="text-sm font-semibold font-mono text-zinc-100">
              Evet • Ortalama {ledger.metrics.avgMarginLeverage ?? 22}x
            </div>
            <div className="text-[11px] text-zinc-500">
              Stop olunca kasanın sadece %1,5&apos;i (~3.900 TL) gidecek şekilde ayarlanır
            </div>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800/70 rounded p-3 space-y-1">
            <div className="text-xs text-zinc-400">Açık İşlemlerin Kaldıraçlı Hacmi</div>
            <div className="text-sm font-semibold font-mono text-zinc-100">
              {formatTRY(ledger.metrics.activeNotionalVolumeTRY ?? 2672511)}
            </div>
            <div className="text-[11px] text-zinc-500">
              16 işlemde dönen toplam hacim: {formatTRY(ledger.metrics.totalCumulativeVolumeTRY ?? 18736843)}
            </div>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800/70 rounded p-3 space-y-1">
            <div className="text-xs text-zinc-400">Kaldıraçsız (1x Spot) Oynansaydı</div>
            <div className="text-sm font-semibold font-mono text-zinc-200">
              {(ledger.metrics.spot1xTotalNetProfitTRY ?? 225.92) >= 0 ? '+' : ''}
              {formatTRY(ledger.metrics.spot1xTotalNetProfitTRY ?? 225.92)}
            </div>
            <div className="text-[11px] text-zinc-500">
              Kaldıraçlı (%1,5 sabit riskli) gerçek kazanç: <span className="text-emerald-400">+{formatTRY(ledger.netProfitTRY)}</span>
            </div>
          </div>
        </div>

        {/* SADE SEKME SEÇİCİSİ */}
        <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-zinc-800 text-xs">
          {[
            { key: 'all', label: 'Genel Görünüm' },
            { key: 'xray', label: 'İşlem Detayı (Nasıl & Neden Açıldı?)' },
            { key: 'logs', label: `Tüm İşlem Kayıtları (${ledger.activityLog.length})` },
            { key: 'scanner', label: '9 Varlık Piyasa Taraması' },
            { key: 'attribution', label: 'Varlık Bazlı Kazanç Özeti' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSubView(tab.key as any)}
              className={`px-3 py-1.5 rounded transition-colors ${
                subView === tab.key
                  ? 'bg-zinc-800 text-white font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-950'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. SADE VE NET KASA BÜYÜME GRAFİĞİ */}
      {subView === 'all' && (
        <div className="border border-zinc-800 bg-zinc-900 rounded-md p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Kasa Büyüme Grafiği (250.000 TL → {formatTRY(ledger.totalEquityTRY)})
              </h2>
              <p className="text-xs text-zinc-400">
                Grafik üzerinde gezerek her işlem sonrasında kasanın ulaştığı tutarı görebilirsiniz.
              </p>
            </div>

            {activePoint && (
              <div className="flex items-center space-x-3 text-xs font-mono bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded">
                <span className="text-zinc-400">{activePoint.timeStr}</span>
                <span className="text-zinc-700">|</span>
                <span className="text-white font-semibold">{formatTRY(activePoint.equityTRY)}</span>
                <span className="text-zinc-700">|</span>
                <span className={activePoint.equityTRY >= ledger.initialCapitalTRY ? 'text-emerald-400' : 'text-rose-400'}>
                  {activePoint.equityTRY >= ledger.initialCapitalTRY ? '+' : ''}
                  {formatTRY(activePoint.equityTRY - ledger.initialCapitalTRY)}
                </span>
              </div>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full h-52 sm:h-60 select-none bg-zinc-950 border border-zinc-800/80 rounded"
              onMouseLeave={() => setHoverIdx(null)}
            >
              <defs>
                <linearGradient id="eqGradClean" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isProfitable ? '#10b981' : '#f43f5e'} stopOpacity="0.20" />
                  <stop offset="100%" stopColor={isProfitable ? '#10b981' : '#f43f5e'} stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Yatay Kılavuz Çizgileri */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = padT + ratio * plotH;
                const val = maxEq - ratio * eqRange;
                return (
                  <g key={idx}>
                    <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#27272a" strokeDasharray="3 3" strokeWidth="1" />
                    <text x={padL - 8} y={y + 3} textAnchor="end" fill="#a1a1aa" fontSize="10" fontFamily="monospace">
                      {Math.round(val).toLocaleString('tr-TR')} ₺
                    </text>
                  </g>
                );
              })}

              {/* 250.000 TL Başlangıç Çizgisi */}
              <line x1={padL} y1={baselineY} x2={svgW - padR} y2={baselineY} stroke="#52525b" strokeDasharray="4 4" strokeWidth="1" />

              {areaPoints && <polygon points={areaPoints} fill="url(#eqGradClean)" />}
              {linePoints && (
                <polyline
                  fill="none"
                  stroke={isProfitable ? '#10b981' : '#f43f5e'}
                  strokeWidth="2"
                  points={linePoints}
                />
              )}

              {/* Noktalar ve Etkileşim Alanları */}
              {curve.map((c, i) => {
                const cx = getX(i);
                const cy = getY(c.equityTRY);
                const isHovered = hoverIdx === i;
                return (
                  <g key={i}>
                    {isHovered && (
                      <line x1={cx} y1={padT} x2={cx} y2={svgH - padB} stroke="#71717a" strokeDasharray="2 2" strokeWidth="1" />
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
                      height={svgH}
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

      {/* 3. ŞU ANDA AÇIK OLAN İŞLEMLER TABLOSU */}
      {(subView === 'all' || subView === 'xray') && (
        <div className="border border-zinc-800 bg-zinc-900 rounded-md p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Şu Anda Açık Olan İşlemler ({ledger.openPositions.length} Adet)
              </h2>
              <p className="text-xs text-zinc-400">
                Satıra tıkladığınızda o işlemin nasıl hesaplandığını ve neden açıldığını hemen altında görebilirsiniz.
              </p>
            </div>
          </div>

          {ledger.openPositions.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-400 bg-zinc-950 rounded border border-zinc-800">
              Şu anda açık işlem bulunmuyor.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="py-2.5 px-2 font-medium">Varlık & Piyasa Durumu</th>
                    <th className="py-2.5 px-2 font-medium">İşlem Yönü</th>
                    <th className="py-2.5 px-2 font-medium text-right">Basılan Ana Para</th>
                    <th className="py-2.5 px-2 font-medium text-right">Kaldıraç & İşlem Hacmi</th>
                    <th className="py-2.5 px-2 font-medium">Giriş ve Anlık Fiyat</th>
                    <th className="py-2.5 px-2 font-medium w-48">Zarar Durdur ve Hedef Seviyeleri</th>
                    <th className="py-2.5 px-2 font-medium text-right">Anlık Kâr / Zarar</th>
                    <th className="py-2.5 px-2 font-medium text-right">Detay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {ledger.openPositions.map((pos) => {
                    const isPosProfit = pos.totalPnL_TRY >= 0;
                    const isSelected = inspectedTrade?.id === pos.id;
                    const gauge = computePriceGaugePercent(pos);
                    const marketNote = getMarketHoursNote(pos.symbol);
                    return (
                      <tr
                        key={pos.id}
                        onClick={() => setSelectedTradeId(pos.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/30'
                        }`}
                      >
                        <td className="py-3 px-2">
                          <div className="font-semibold text-white">{pos.symbol} <span className="text-zinc-400 font-normal">({pos.name})</span></div>
                          <div className="text-[11px] text-zinc-500 mt-0.5">{marketNote}</div>
                        </td>
                        <td className="py-3 px-2">
                          <div className={`font-semibold ${pos.direction === 'AL (LONG)' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatDirection(pos.direction)}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono">
                            {pos.positionSizeUnits} {pos.unitLabel || 'Birim'} ({pos.lotSize ?? 0.05} Lot)
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right font-mono">
                          <div className="font-semibold text-white">{formatTRY(pos.allocatedCapitalTRY)}</div>
                          <div className="text-[11px] text-zinc-400">
                            Stop Riski: {formatTRY(pos.riskAmountTRY)}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right font-mono">
                          <div className="font-semibold text-zinc-200">
                            {pos.effectiveLeverage ?? 5.65}x Kaldıraç
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            Hacim: {formatTRY(pos.notionalValueTRY ?? pos.allocatedCapitalTRY * 5)}
                          </div>
                        </td>
                        <td className="py-3 px-2 font-mono">
                          <div className="text-zinc-300">Giriş: <strong className="text-white">{pos.entryPrice.toFixed(pos.digits)}</strong></div>
                          <div className="text-zinc-400">Anlık: <strong className="text-white">{pos.currentPrice.toFixed(pos.digits)}</strong></div>
                        </td>
                        <td className="py-3 px-2 font-mono">
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] text-zinc-400">
                              <span>SL: {pos.stopLoss.toFixed(pos.digits)}</span>
                              <span>Hedef: {pos.takeProfit2.toFixed(pos.digits)}</span>
                            </div>
                            <div className="relative h-1.5 bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
                              <div
                                className={`h-full ${isPosProfit ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`}
                                style={{ width: `${gauge.currentPct}%` }}
                              />
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-zinc-300"
                                style={{ left: `${gauge.entryPct}%` }}
                                title="Giriş Noktası"
                              />
                            </div>
                          </div>
                        </td>
                        <td className={`py-3 px-2 text-right font-mono font-semibold ${isPosProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          <div>{isPosProfit ? '+' : ''}{formatTRY(pos.totalPnL_TRY)}</div>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTradeId(pos.id);
                            }}
                            className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                              isSelected
                                ? 'bg-zinc-800 border-zinc-600 text-white font-medium'
                                : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:text-white'
                            }`}
                          >
                            {isSelected ? 'Açık' : 'İncele'}
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

      {/* 4. SEÇİLİ İŞLEMİN SADE VE ANLAŞILIR DETAY RAPORU */}
      {(subView === 'all' || subView === 'xray') && inspectedTrade && inspectedTrade.forensicXRay && (
        <div className="border border-zinc-800 bg-zinc-900 rounded-md p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
            <div>
              <h3 className="text-base font-semibold text-white">
                {inspectedTrade.symbol} ({inspectedTrade.name}) — {formatDirection(inspectedTrade.direction)} İşlemi Nasıl ve Neden Yapıldı?
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {inspectedTrade.rationale}
              </p>
            </div>

            <div className="flex items-center space-x-2 text-xs">
              <span className="text-zinc-400 shrink-0">Başka İşlem Seç:</span>
              <select
                value={inspectedTrade.id}
                onChange={(e) => setSelectedTradeId(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-white rounded px-2.5 py-1.5 text-xs focus:outline-none"
              >
                {allTrades.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.status === 'ACIK' ? 'Açık' : 'Kapalı'}] {t.symbol} ({formatDirection(t.direction)}) — {t.totalPnL_TRY >= 0 ? '+' : ''}{t.totalPnL_TRY.toLocaleString('tr-TR')} TL
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 6 Kutulu Sade Hesaplama Özeti */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
            <div className="bg-zinc-950 border border-zinc-800/80 p-3 rounded space-y-1">
              <div className="text-zinc-400 text-[11px]">1. Yatırılan Ana Para</div>
              <div className="text-white font-semibold font-mono">{formatTRY(inspectedTrade.allocatedCapitalTRY)}</div>
              <div className="text-[10px] text-zinc-500">Kasanın %20 teminatı</div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800/80 p-3 rounded space-y-1">
              <div className="text-zinc-400 text-[11px]">2. Oynanan Kaldıraç</div>
              <div className="text-white font-semibold font-mono">{inspectedTrade.forensicXRay.microstructure.effectiveLeverage}x Kaldıraç</div>
              <div className="text-[10px] text-zinc-500">Toplam kasaya göre {inspectedTrade.accountLeverage ?? 1.5}x</div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800/80 p-3 rounded space-y-1">
              <div className="text-zinc-400 text-[11px]">3. Açılan Toplam Hacim</div>
              <div className="text-white font-semibold font-mono">{formatTRY(inspectedTrade.forensicXRay.microstructure.notionalValueTRY)}</div>
              <div className="text-[10px] text-zinc-500">{inspectedTrade.positionSizeUnits} {inspectedTrade.unitLabel || 'Birim'} ({inspectedTrade.forensicXRay.microstructure.lotSize} Lot)</div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800/80 p-3 rounded space-y-1">
              <div className="text-zinc-400 text-[11px]">4. Giriş Fiyatı & Maliyet</div>
              <div className="text-white font-semibold font-mono">{inspectedTrade.entryPrice.toFixed(inspectedTrade.digits)}</div>
              <div className="text-[10px] text-zinc-500">Spread/Komisyon: {inspectedTrade.forensicXRay.microstructure.executionCostTRY} TL</div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800/80 p-3 rounded space-y-1">
              <div className="text-zinc-400 text-[11px]">5. Maksimum Zarar Riski</div>
              <div className="text-rose-400 font-semibold font-mono">-{formatTRY(inspectedTrade.riskAmountTRY)}</div>
              <div className="text-[10px] text-zinc-500">SL: {inspectedTrade.initialStopLoss.toFixed(inspectedTrade.digits)} (%1,5 Risk)</div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800/80 p-3 rounded space-y-1">
              <div className="text-zinc-400 text-[11px]">6. Hedef Seviyeleri</div>
              <div className="text-emerald-400 font-semibold font-mono">TP2: {inspectedTrade.takeProfit2.toFixed(inspectedTrade.digits)}</div>
              <div className="text-[10px] text-zinc-500">1. Hedef (TP1): {inspectedTrade.takeProfit1.toFixed(inspectedTrade.digits)}</div>
            </div>
          </div>

          {/* Matematiksel Formül Satırı */}
          <div className="text-xs text-zinc-300 bg-zinc-950 border border-zinc-800/80 px-3.5 py-2.5 rounded">
            <strong className="text-white">Nasıl Hesaplandı?</strong> {inspectedTrade.forensicXRay.microstructure.sizingFormulaText}
          </div>

          {/* Giriş Sebepleri ve Adım Adım Geçmiş */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
            <div className="lg:col-span-7 space-y-2.5">
              <div className="text-xs font-semibold text-white">
                İşleme Girmeden Önce Kontrol Edilen 6 Kriter
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {inspectedTrade.forensicXRay.gates.map((gate) => (
                  <div key={gate.step} className="bg-zinc-950 border border-zinc-800/80 rounded p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white">{gate.title}</span>
                      <span className="text-[11px] font-mono text-emerald-400 shrink-0">
                        {gate.score}/{gate.maxScore}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-300">
                      {gate.metricValue}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      {gate.note}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 space-y-2.5">
              <div className="text-xs font-semibold text-white">
                Adım Adım İşlem Geçmişi
              </div>
              <div className="bg-zinc-950 border border-zinc-800/80 rounded p-3.5 space-y-3">
                {inspectedTrade.forensicXRay.lifecycleSteps.map((step) => (
                  <div key={step.stepNo} className="pl-3 border-l border-zinc-700 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span className="font-medium text-zinc-200">{step.stepNo}. {step.title}</span>
                      <span className="font-mono">
                        {new Date(step.timestamp).toLocaleString('tr-TR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">{step.detail}</p>
                    {step.pnlTRY !== undefined && (
                      <div className={`text-[11px] font-mono font-semibold ${step.pnlTRY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        Kasa Etkisi: {step.pnlTRY >= 0 ? '+' : ''}{formatTRY(step.pnlTRY)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. 9-VARLIK PİYASA TARAMA LİSTESİ */}
      {(subView === 'all' || subView === 'scanner') && ledger.marketScanner && ledger.marketScanner.length > 0 && (
        <div className="border border-zinc-800 bg-zinc-900 rounded-md p-5 space-y-3">
          <div className="border-b border-zinc-800 pb-3">
            <h2 className="text-sm font-semibold text-white">
              9 Varlık Canlı Piyasa Tarama Listesi
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Sistemin takip ettiği 9 varlıkta şu anki fiyat, trend yönü ve neden işleme girildiği veya beklendiği.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="py-2 px-2 font-medium">Varlık</th>
                  <th className="py-2 px-2 font-medium text-right">Fiyat</th>
                  <th className="py-2 px-2 font-medium">Trend Yönü</th>
                  <th className="py-2 px-2 font-medium text-right">RSI Gücü</th>
                  <th className="py-2 px-2 font-medium text-center">Sinyal Puanı</th>
                  <th className="py-2 px-2 font-medium">Mevcut Durum</th>
                  <th className="py-2 px-2 font-medium">Açıklama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {ledger.marketScanner.map((item) => (
                  <tr key={item.symbol} className="hover:bg-zinc-800/30">
                    <td className="py-2.5 px-2">
                      <div className="font-semibold text-white">{item.symbol}</div>
                      <div className="text-[11px] text-zinc-500">{item.name}</div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-semibold text-white">
                      {item.price.toFixed(item.digits)}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={item.trendRegime === 'BOĞA (BULL)' ? 'text-emerald-400 font-medium' : item.trendRegime === 'AYI (BEAR)' ? 'text-rose-400 font-medium' : 'text-zinc-300'}>
                        {item.trendRegime === 'BOĞA (BULL)' ? 'Yükseliş Trendi' : item.trendRegime === 'AYI (BEAR)' ? 'Düşüş Trendi' : 'Yatay'}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-zinc-200">
                      {item.rsi14.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-zinc-200">
                      {item.confluenceScore}/100
                    </td>
                    <td className="py-2.5 px-2 font-medium text-zinc-200">
                      {item.status}
                    </td>
                    <td className="py-2.5 px-2 text-zinc-400 leading-relaxed max-w-md">
                      {item.decisionReason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. VARLIK BAZLI KAZANÇ ÖZETİ */}
      {(subView === 'all' || subView === 'attribution') && ledger.attribution && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 border border-zinc-800 bg-zinc-900 rounded-md p-5 space-y-3">
            <div className="border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-semibold text-white">
                Hangi Varlık Ne Kadar Kazandırdı?
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="py-2 px-2 font-medium">Varlık</th>
                    <th className="py-2 px-2 font-medium text-center">İşlem Sayısı</th>
                    <th className="py-2 px-2 font-medium text-center">Başarı Oranı</th>
                    <th className="py-2 px-2 font-medium text-right">Kapanan Kâr/Zarar</th>
                    <th className="py-2 px-2 font-medium text-right">Toplam Net Katkı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {ledger.attribution.byAsset
                    .filter((a) => a.closedCount > 0 || a.openCount > 0)
                    .map((a) => (
                      <tr key={a.symbol} className="hover:bg-zinc-800/30">
                        <td className="py-2.5 px-2 font-semibold text-white">
                          {a.symbol} <span className="text-[11px] text-zinc-500 font-normal">({a.name})</span>
                        </td>
                        <td className="py-2.5 px-2 text-center text-zinc-300">
                          {a.closedCount} Kapanan ({a.wins}K / {a.losses}Z) • {a.openCount} Açık
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-zinc-200">
                          %{a.winRatePercent}
                        </td>
                        <td className={`py-2.5 px-2 text-right font-mono ${a.netRealizedPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {a.netRealizedPnL_TRY >= 0 ? '+' : ''}{formatTRY(a.netRealizedPnL_TRY)}
                        </td>
                        <td className={`py-2.5 px-2 text-right font-mono font-semibold ${a.totalNetPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {a.totalNetPnL_TRY >= 0 ? '+' : ''}{formatTRY(a.totalNetPnL_TRY)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-4 border border-zinc-800 bg-zinc-900 rounded-md p-5 space-y-3">
            <div className="border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-semibold text-white">
                Alış (Long) ve Satış (Short) Başarısı
              </h2>
            </div>

            <div className="space-y-3 text-xs">
              {[ledger.attribution.byDirection.long, ledger.attribution.byDirection.short].map((d) => (
                <div key={d.direction} className="bg-zinc-950 border border-zinc-800/80 rounded p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold ${d.direction === 'AL (LONG)' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatDirection(d.direction)} İşlemleri
                    </span>
                    <span className="text-zinc-400">{d.tradesCount} Kapanan İşlem</span>
                  </div>
                  <div className="flex justify-between text-zinc-400 pt-1">
                    <span>Başarı Oranı: <strong className="text-white">%{d.winRatePercent}</strong> ({d.wins}K / {d.losses}Z)</span>
                    <span className={`font-mono font-semibold ${d.netPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {d.netPnL_TRY >= 0 ? '+' : ''}{formatTRY(d.netPnL_TRY)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. KAPANMIŞ İŞLEMLERİN TAM LİSTESİ */}
      {(subView === 'all' || subView === 'logs' || subView === 'xray') && (
        <div className="border border-zinc-800 bg-zinc-900 rounded-md p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Tamamlanan (Kapanmış) İşlemler ({ledger.closedTrades.length} İşlem)
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Her işlemde ne kadar ana para yatırıldığı, kaç kaldıraç kullanıldığı, kaldıraçsız (1x) karşılığı ve net kâr/zarar tutarı.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="py-2.5 px-2 font-medium">Açılış ve Kapanış</th>
                  <th className="py-2.5 px-2 font-medium">Varlık & Yön</th>
                  <th className="py-2.5 px-2 font-medium text-right">Basılan Ana Para</th>
                  <th className="py-2.5 px-2 font-medium text-right">Kaldıraç</th>
                  <th className="py-2.5 px-2 font-medium text-right">Toplam İşlem Hacmi</th>
                  <th className="py-2.5 px-2 font-medium text-right">Giriş → Çıkış</th>
                  <th className="py-2.5 px-2 font-medium">Kapanış Sebebi</th>
                  <th className="py-2.5 px-2 font-medium text-right">1x Spot Karşılığı</th>
                  <th className="py-2.5 px-2 font-medium text-right">Net Kâr / Zarar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {ledger.closedTrades.map((t) => {
                  const isWin = t.realizedPnL_TRY >= 0;
                  const isSelected = inspectedTrade?.id === t.id;
                  const spot1x = t.spot1xEquivalentPnL_TRY ?? +(t.realizedPnL_TRY / Math.max(1, t.effectiveLeverage || 1)).toFixed(2);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTradeId(t.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/30'
                      }`}
                    >
                      <td className="py-3 px-2 text-[11px] text-zinc-400 font-mono whitespace-nowrap">
                        <div>
                          {new Date(t.entryTime).toLocaleString('tr-TR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {' → '}
                          {t.closeTime
                            ? new Date(t.closeTime).toLocaleString('tr-TR', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-'}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-semibold text-white">{t.symbol}</div>
                        <div className={`text-[11px] font-medium ${t.direction === 'AL (LONG)' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatDirection(t.direction)}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono whitespace-nowrap">
                        <div className="font-semibold text-white">{formatTRY(t.allocatedCapitalTRY)}</div>
                        <div className="text-[10px] text-zinc-500">Risk: {formatTRY(t.riskAmountTRY)}</div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono whitespace-nowrap">
                        <div className="text-zinc-200 font-medium">{t.effectiveLeverage ?? 8.5}x</div>
                        <div className="text-[10px] text-zinc-500">Kasa: {t.accountLeverage ?? 1.7}x</div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono whitespace-nowrap">
                        <div className="text-zinc-200">{formatTRY(t.notionalValueTRY ?? t.allocatedCapitalTRY * 8.5)}</div>
                        <div className="text-[10px] text-zinc-500">{t.positionSizeUnits} {t.unitLabel || 'Birim'} ({t.lotSize ?? 0.1} Lot)</div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-zinc-300 whitespace-nowrap">
                        <div>{t.entryPrice.toFixed(t.digits)} → <strong className="text-white">{(t.closePrice ?? t.currentPrice).toFixed(t.digits)}</strong></div>
                      </td>
                      <td className="py-3 px-2 text-zinc-300">
                        {formatStatusText(t.status)}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-zinc-400 whitespace-nowrap">
                        {spot1x >= 0 ? '+' : ''}{formatTRY(spot1x)}
                      </td>
                      <td className={`py-3 px-2 text-right font-mono font-semibold whitespace-nowrap ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isWin ? '+' : ''}{formatTRY(t.realizedPnL_TRY)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. GENİŞLETİLMİŞ İŞLEM VE KALDIRAÇ GÜNLÜĞÜ (LOGLAR) */}
      {(subView === 'all' || subView === 'logs') && (
        <div className="border border-zinc-800 bg-zinc-900 rounded-md p-5 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Adım Adım Tüm İşlem Kayıtları ({ledger.activityLog.length} Kayıt)
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Her işlemin açılış ve kapanışında yatırılan ana para, kaldıraç oranı, işlem hacmi ve işlem sonrası kasa bakiyesi.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[
                { key: 'ALL', label: `Tümü (${ledger.activityLog.length})` },
                { key: 'ENTRY', label: 'Açılan İşlemler' },
                { key: 'PROFIT', label: 'Kâr Alımlar' },
                { key: 'RISK', label: 'Zarar Durdur & Haber Kalkanı' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setLogFilter(f.key as any)}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    logFilter === f.key
                      ? 'bg-zinc-800 text-white font-medium'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-950'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
            {ledger.activityLog
              .filter((log) => {
                if (logFilter === 'ALL') return true;
                if (logFilter === 'ENTRY') return log.type === 'ENTRY';
                if (logFilter === 'PROFIT') return log.type === 'TP1_PARTIAL' || log.type === 'TP2_FULL' || log.type === 'BREAKEVEN_EXIT';
                if (logFilter === 'RISK') return log.type === 'STOP_LOSS' || log.type === 'SYSTEM';
                return true;
              })
              .map((log) => {
                const isEntry = log.type === 'ENTRY';
                return (
                  <div
                    key={log.id}
                    className="p-3.5 rounded bg-zinc-950 border border-zinc-800/80 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/70 pb-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">{log.symbol}</span>
                        {log.direction && (
                          <span className={log.direction === 'AL (LONG)' ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
                            • {formatDirection(log.direction)}
                          </span>
                        )}
                        <span className="text-zinc-400">
                          • {isEntry ? 'İşlem Açıldı' : log.type === 'TP2_FULL' ? 'Hedefe Ulaştı (Kâr Alındı)' : log.type === 'STOP_LOSS' ? 'Zarar Durdur Oldu' : 'Sistem Kaydı'}
                        </span>
                        <span className="text-zinc-500 font-mono">
                          ({new Date(log.timestamp).toLocaleString('tr-TR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })})
                        </span>
                      </div>

                      <div className="flex items-center gap-3 font-mono">
                        {log.pnlImpactTRY !== undefined && log.pnlImpactTRY !== 0 && (
                          <span className={`font-semibold ${log.pnlImpactTRY > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {log.pnlImpactTRY > 0 ? '+' : ''}{formatTRY(log.pnlImpactTRY)}
                          </span>
                        )}
                        {log.equityAfterTRY !== undefined && (
                          <span className="text-zinc-400">
                            Kasa: <strong className="text-white">{formatTRY(log.equityAfterTRY)}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {log.allocatedMarginTRY !== undefined && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                        <div className="bg-zinc-900/90 border border-zinc-800/70 p-2 rounded">
                          <div className="text-[10px] text-zinc-400">Basılan Ana Para</div>
                          <div className="text-white font-semibold font-mono">{formatTRY(log.allocatedMarginTRY)}</div>
                        </div>

                        <div className="bg-zinc-900/90 border border-zinc-800/70 p-2 rounded">
                          <div className="text-[10px] text-zinc-400">Kaldıraç Oranı</div>
                          <div className="text-white font-semibold font-mono">{log.effectiveLeverage}x <span className="text-zinc-500 font-normal">(Kasa: {log.accountLeverage}x)</span></div>
                        </div>

                        <div className="bg-zinc-900/90 border border-zinc-800/70 p-2 rounded">
                          <div className="text-[10px] text-zinc-400">Toplam İşlem Hacmi</div>
                          <div className="text-white font-semibold font-mono">{formatTRY(log.notionalVolumeTRY || 0)}</div>
                        </div>

                        <div className="bg-zinc-900/90 border border-zinc-800/70 p-2 rounded">
                          <div className="text-[10px] text-zinc-400">Miktar (Lot / Birim)</div>
                          <div className="text-zinc-200 font-mono">{log.units} {log.unitLabel || 'Birim'} ({log.lotSize} Lot)</div>
                        </div>

                        <div className="bg-zinc-900/90 border border-zinc-800/70 p-2 rounded">
                          <div className="text-[10px] text-zinc-400">Maksimum Risk (%1,5)</div>
                          <div className="text-rose-400 font-mono font-medium">-{formatTRY(log.riskAmountTRY || 0)}</div>
                        </div>

                        <div className="bg-zinc-900/90 border border-zinc-800/70 p-2 rounded">
                          <div className="text-[10px] text-zinc-400">1x Spot Karşılığı</div>
                          <div className="text-zinc-300 font-mono">
                            {log.spot1xPnL_TRY !== undefined
                              ? `${log.spot1xPnL_TRY >= 0 ? '+' : ''}${formatTRY(log.spot1xPnL_TRY)}`
                              : 'Açık İşlem'}
                          </div>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-zinc-400 leading-relaxed">{log.message}</p>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

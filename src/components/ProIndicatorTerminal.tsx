import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Compass,
  Crosshair,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

interface ProCandle {
  timestamp: number;
  timeStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rvol: number;
  ema8: number;
  ema21: number;
  ema50: number;
  rsi14: number;
  adx14: number;
  fairValue: number;
  sma200: number;
  zacUpper: number;
  zacLower: number;
  zacScore: number;
  regime: string;
}

interface ZacMarker {
  index: number;
  timestamp: number;
  price: number;
  pod: 'MR_SPRING_12H' | 'CRYPTO_MOM_12H' | 'CTA_TREND';
  direction: 'LONG' | 'SHORT';
  label: string;
}

interface ZacPillar {
  id: string;
  label: string;
  score: number;
  rawValue: string;
  status: 'POZİTİF' | 'NEGATİF' | 'NÖTR' | 'UYARI';
  detail: string;
}

interface ZacHorizon {
  horizonHours: 4 | 12 | 24 | 72;
  label: string;
  expectedPrice: number;
  expectedMovePct: number;
  lower90: number;
  upper90: number;
  pUp: number;
  pDown: number;
  direction: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
}

interface ProChartPayload {
  symbol: string;
  name: string;
  cluster: string;
  tf: '15m' | '1h' | '4h' | '12h' | '1d';
  digits: number;
  currentPrice: number;
  change24h: number;
  changePercent24h: number;
  candles: ProCandle[];
  markers: ZacMarker[];
  zacSnapshot: {
    symbol: string;
    price: number;
    digits: number;
    zacScore: number;
    regime: string;
    regimeLabelTR: string;
    aboveSma200: boolean;
    sma200: number;
    fairValueEma50: number;
    ewmac: number;
    volRatio: number;
    efficiencyRatio: number;
    ibs12h: number;
    cumRsi2_12h: number;
    mom12hAtr: number;
    dailyAtr14: number;
    atr12h14: number;
    xsmomScore30d: number;
    xsmomRank: number;
    xsmomTotal: number;
    vixLevel: number;
    pillars: ZacPillar[];
    activeSetup: {
      pod: string;
      podLabelTR: string;
      direction: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
      entryPrice: number;
      stopLoss: number;
      takeProfit: number;
      trailingAtrMult: number;
      riskReward: number;
      maxHoldHours: number;
      convictionPercent: number;
      rationaleTR: string;
    };
    horizons: ZacHorizon[];
  };
  microstructure?: {
    pattern: string;
    patternLabelTR: string;
    structureState: string;
    structureLabelTR: string;
    bslPoolPrice: number;
    sslPoolPrice: number;
    sweptSslBullish: boolean;
    sweptBslBearish: boolean;
    bullishFvgActive: boolean;
    bearishFvgActive: boolean;
    vsaSignal: string;
    vsaDetailTR: string;
    orderBlockZoneTR: string;
    upperWickRatio: number;
    lowerWickRatio: number;
    bodyRatio: number;
    rvol1h: number;
    cumRsi2_1h: number;
    ibs1h: number;
    candleVsaScore: number;
    meanRev1hScore: number;
  };
  oosSelfAudit: {
    horizonHours: number;
    sampleSize: number;
    allBarHitRatePct: number;
    highConvictionHitRatePct: number;
    highConvictionCount: number;
    cone90CoveragePct: number;
    methodologyNoteTR: string;
  };
  forecastCones: ZacHorizon[];
  newsContext?: {
    sentimentScore: number;
    shockLevel: number;
    impactingHeadline: string;
    source: string;
    biasDescription: string;
    newsTimeAgo: string;
  };
  activeTrade: {
    id: string;
    pod?: string;
    direction: string;
    entryPrice: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
    totalPnL_TRY: number;
  } | null;
  universe?: { symbol: string; name: string; cluster: string }[];
  generatedAt: string;
}

interface ProIndicatorTerminalProps {
  symbol: string;
  onSelectSymbol?: (sym: string) => void;
}

const DEFAULT_UNIVERSE = [
  'XAU/USD', 'XAG/USD', 'COPPER', 'NAS100', 'SPX500', 'US30',
  'NVDA', 'AAPL', 'MSFT', 'WTI', 'BRENT',
  'EUR/USD', 'USD/JPY', 'GBP/USD', 'BTC/USD', 'ETH/USD', 'SOL/USD',
];

const REGIME_COLORS: Record<string, string> = {
  BULL_TREND: '#10b981',
  DIP_SPRING: '#38bdf8',
  CRYPTO_CALM_MOM: '#a855f7',
  BEAR_DEFENSE: '#f43f5e',
  VOL_SHOCK: '#f59e0b',
  NEUTRAL_CHOP: '#52525b',
};

export const ProIndicatorTerminal: React.FC<ProIndicatorTerminalProps> = ({
  symbol,
  onSelectSymbol,
}) => {
  const [tf, setTf] = useState<'15m' | '1h' | '4h' | '12h' | '1d'>('1h');
  const [data, setData] = useState<ProChartPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Katman anahtarları
  const [showCloud, setShowCloud] = useState(true);
  const [showSma200, setShowSma200] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCone, setShowCone] = useState(true);

  const loadChart = useCallback(async (sym: string, timeframe: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/pro-chart?symbol=${encodeURIComponent(sym)}&tf=${encodeURIComponent(timeframe)}`
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json: ProChartPayload = await resp.json();
      setData(json);
    } catch (e: any) {
      setError(e?.message || 'ZAC v14 grafik verisi alınamadı.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChart(symbol, tf);
  }, [symbol, tf, loadChart]);

  // SVG Geometri Hesabı
  const chartGeom = useMemo(() => {
    if (!data || !data.candles || data.candles.length < 5) return null;
    const candles = data.candles;
    const n = candles.length;
    const coneCols = showCone ? 14 : 2;
    const W = 1040;
    const H_MAIN = 360;
    const H_OSC = 115;
    const PAD_L = 14;
    const PAD_R = 76;
    const PAD_T = 22;
    const PAD_B = 18;
    const plotW = W - PAD_L - PAD_R;
    const totalCols = n + coneCols;
    const stepX = plotW / Math.max(1, totalCols);

    let minP = Infinity;
    let maxP = -Infinity;
    for (const c of candles) {
      minP = Math.min(minP, c.low, showCloud ? c.zacLower : c.low);
      maxP = Math.max(maxP, c.high, showCloud ? c.zacUpper : c.high);
      if (showSma200 && c.sma200 > 0) {
        // SMA200 çok uzaktaysa grafiği aşırı sıkıştırma (max %25 dışına esnet)
        if (c.sma200 >= c.low * 0.8 && c.sma200 <= c.high * 1.2) {
          minP = Math.min(minP, c.sma200);
          maxP = Math.max(maxP, c.sma200);
        }
      }
    }

    const h24 = data.forecastCones?.find((h) => h.horizonHours === 24);
    const h72 = data.forecastCones?.find((h) => h.horizonHours === 72);
    if (showCone && h72) {
      minP = Math.min(minP, h72.lower90);
      maxP = Math.max(maxP, h72.upper90);
    }
    if (data.activeTrade) {
      minP = Math.min(minP, data.activeTrade.stopLoss, data.activeTrade.entryPrice);
      maxP = Math.max(maxP, data.activeTrade.stopLoss, data.activeTrade.entryPrice);
      if (data.activeTrade.takeProfit2 > 0) maxP = Math.max(maxP, data.activeTrade.takeProfit2);
    } else if (data.zacSnapshot.activeSetup.pod !== 'NONE') {
      minP = Math.min(minP, data.zacSnapshot.activeSetup.stopLoss);
      maxP = Math.max(maxP, data.zacSnapshot.activeSetup.stopLoss);
      if (data.zacSnapshot.activeSetup.takeProfit > 0) {
        maxP = Math.max(maxP, data.zacSnapshot.activeSetup.takeProfit);
        minP = Math.min(minP, data.zacSnapshot.activeSetup.takeProfit);
      }
    }

    const span = Math.max(1e-6, maxP - minP);
    minP -= span * 0.06;
    maxP += span * 0.06;

    const xOf = (idx: number) => PAD_L + (idx + 0.5) * stepX;
    const yOf = (price: number) =>
      PAD_T + ((maxP - price) / Math.max(1e-9, maxP - minP)) * (H_MAIN - PAD_T - PAD_B);
    const yOsc = (score: number) => {
      const clamped = Math.max(-100, Math.min(100, score));
      return 16 + ((100 - clamped) / 200) * (H_OSC - 28);
    };

    const fvPath = candles.map((c, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(c.fairValue).toFixed(1)}`).join(' ');
    const sma200Path = candles.map((c, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(c.sma200).toFixed(1)}`).join(' ');
    const cloudPath =
      candles.map((c, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(c.zacUpper).toFixed(1)}`).join(' ') +
      ' ' +
      candles
        .slice()
        .reverse()
        .map((c, revI) => `L${xOf(n - 1 - revI).toFixed(1)},${yOf(c.zacLower).toFixed(1)}`)
        .join(' ') +
      ' Z';

    const zacLinePath = candles
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOsc(c.zacScore).toFixed(1)}`)
      .join(' ');

    // Sağ Tahmin Konisi Geometri (+24S ve +72S)
    const lastIdx = n - 1;
    const lastC = candles[lastIdx];
    const x0 = xOf(lastIdx);
    const y0 = yOf(lastC.close);
    const x24 = xOf(lastIdx + 6);
    const x72 = xOf(lastIdx + 13);

    const conePoly =
      showCone && h24 && h72
        ? `${x0.toFixed(1)},${y0.toFixed(1)} ${x24.toFixed(1)},${yOf(h24.upper90).toFixed(1)} ${x72.toFixed(1)},${yOf(h72.upper90).toFixed(1)} ${x72.toFixed(1)},${yOf(h72.lower90).toFixed(1)} ${x24.toFixed(1)},${yOf(h24.lower90).toFixed(1)}`
        : '';
    const coneMidPath =
      showCone && h24 && h72
        ? `M${x0.toFixed(1)},${y0.toFixed(1)} L${x24.toFixed(1)},${yOf(h24.expectedPrice).toFixed(1)} L${x72.toFixed(1)},${yOf(h72.expectedPrice).toFixed(1)}`
        : '';

    const gridPrices = Array.from({ length: 6 }, (_, k) => minP + ((maxP - minP) * k) / 5);

    return {
      W, H_MAIN, H_OSC, PAD_L, PAD_R, stepX, xOf, yOf, yOsc,
      fvPath, sma200Path, cloudPath, zacLinePath,
      conePoly, coneMidPath, x24, x72, h24, h72, gridPrices,
      minP, maxP,
    };
  }, [data, showCloud, showSma200, showCone]);

  const snap = data?.zacSnapshot;
  const setup = snap?.activeSetup;
  const hoveredCandle =
    hoverIdx !== null && data?.candles?.[hoverIdx] ? data.candles[hoverIdx] : null;
  const universeSymbols = data?.universe?.map((u) => u.symbol) || DEFAULT_UNIVERSE;

  return (
    <div className="space-y-4">
      {/* 1. ÜST ENSTRÜMAN ŞERİDİ & ZAMAN DİLİMİ KONTROLÜ */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[11px] font-mono font-bold tracking-wider">
                ZAC v14.0
              </span>
              <h1 className="text-lg font-bold text-white tracking-tight">
                {data?.symbol || symbol}{' '}
                <span className="text-zinc-400 font-normal text-sm">{data?.name || ''}</span>
              </h1>
            </div>
            {data && (
              <div className="flex items-center gap-2 font-mono">
                <span className="text-lg font-bold text-white">
                  {data.currentPrice.toFixed(data.digits)}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5 ${
                    data.changePercent24h >= 0
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-rose-500/15 text-rose-400'
                  }`}
                >
                  {data.changePercent24h >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  {data.changePercent24h >= 0 ? '+' : ''}
                  {data.changePercent24h}%
                </span>
              </div>
            )}
          </div>

          {/* Zaman Dilimi & Katman Anahtarları */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-xs font-mono">
              {(['15m', '1h', '4h', '12h', '1d'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTf(t)}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    tf === t
                      ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowCloud((v) => !v)}
              className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                showCloud
                  ? 'bg-cyan-950/50 border-cyan-700/60 text-cyan-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-500'
              }`}
            >
              Fair-Value Bulutu
            </button>
            <button
              onClick={() => setShowSma200((v) => !v)}
              className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                showSma200
                  ? 'bg-amber-950/50 border-amber-700/60 text-amber-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-500'
              }`}
            >
              SMA200
            </button>
            <button
              onClick={() => setShowMarkers((v) => !v)}
              className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                showMarkers
                  ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-500'
              }`}
            >
              Pod Sinyalleri
            </button>
            <button
              onClick={() => setShowCone((v) => !v)}
              className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                showCone
                  ? 'bg-violet-950/50 border-violet-700/60 text-violet-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-500'
              }`}
            >
              +24S/+72S Konisi
            </button>

            <button
              onClick={() => loadChart(symbol, tf)}
              disabled={loading}
              className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
              title="Canlı Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 17 Varlık Hızlı Seçici */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-zinc-800/80">
          {universeSymbols.map((s) => (
            <button
              key={s}
              onClick={() => onSelectSymbol?.(s)}
              className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                s === symbol
                  ? 'bg-white text-zinc-950 font-bold'
                  : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-800 text-rose-300 rounded p-3 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. HERO ZAC v14 KARAR KOKPİTİ (BOTLA %100 SENKRON TEK GERÇEK KAYNAK) */}
      {snap && setup && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Sol: ZAC Composite Skor + Rejim */}
          <div className="lg:col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                ZELTRA Alpha Composite
              </span>
              {snap.xsmomRank > 0 && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-200">
                  Liderlik #{snap.xsmomRank} / {snap.xsmomTotal}
                </span>
              )}
            </div>

            <div className="flex items-end justify-between">
              <div>
                <div
                  className={`text-4xl font-black font-mono tracking-tight ${
                    snap.zacScore >= 30
                      ? 'text-emerald-400'
                      : snap.zacScore <= -30
                        ? 'text-rose-400'
                        : 'text-zinc-200'
                  }`}
                >
                  {snap.zacScore >= 0 ? `+${snap.zacScore}` : snap.zacScore}
                  <span className="text-sm text-zinc-500 font-normal"> / 100</span>
                </div>
                <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: REGIME_COLORS[snap.regime] || '#71717a' }}
                  />
                  {snap.regimeLabelTR}
                </div>
              </div>

              <div className="text-right text-[11px] font-mono text-zinc-400 space-y-0.5">
                <div>EWMAC: <span className={snap.ewmac >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{snap.ewmac >= 0 ? '+' : ''}{snap.ewmac}</span></div>
                <div>SMA200: <span className={snap.aboveSma200 ? 'text-emerald-400' : 'text-rose-400'}>{snap.aboveSma200 ? 'ÜSTÜNDE' : 'ALTINDA'}</span></div>
                <div>VolOranı: <span className={snap.volRatio > 1.35 ? 'text-amber-400' : 'text-zinc-200'}>{snap.volRatio}x</span></div>
              </div>
            </div>

            {/* ZAC -100..+100 Çubuğu */}
            <div className="space-y-1">
              <div className="h-2 bg-zinc-950 rounded-full overflow-hidden relative border border-zinc-800">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600 z-10" />
                <div
                  className={`h-full transition-all ${
                    snap.zacScore >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                  style={{
                    marginLeft: snap.zacScore >= 0 ? '50%' : `${50 + snap.zacScore / 2}%`,
                    width: `${Math.abs(snap.zacScore) / 2}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                <span>-100 Güçlü Sat</span>
                <span>0 Nötr</span>
                <span>+100 Güçlü Al</span>
              </div>
            </div>
          </div>

          {/* Orta + Sağ: Aktif Kurumsal İşlem Planı (3-Pod Motoru ile %100 Aynı!) */}
          <div className="lg:col-span-8 bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col justify-between space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2.5">
                <span
                  className={`px-3 py-1 rounded text-xs font-black tracking-wide ${
                    setup.direction === 'AL (LONG)'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : setup.direction === 'SAT (SHORT)'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                  }`}
                >
                  {setup.direction}
                </span>
                <div>
                  <div className="text-sm font-bold text-white">{setup.podLabelTR}</div>
                  <div className="text-[11px] text-zinc-400">
                    Otonom 3-Pod Fon Motoru ile Birebir Senkron Karar
                  </div>
                </div>
              </div>

              {data?.activeTrade ? (
                <div className="px-3 py-1 rounded bg-emerald-950/60 border border-emerald-600/50 text-xs font-mono">
                  <span className="text-emerald-300 font-bold">BOTTA AÇIK: {data.activeTrade.direction}</span>{' '}
                  <span className={data.activeTrade.totalPnL_TRY >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    ({data.activeTrade.totalPnL_TRY >= 0 ? '+' : ''}
                    {data.activeTrade.totalPnL_TRY.toLocaleString('tr-TR')} TL)
                  </span>
                </div>
              ) : (
                <div className="text-xs font-mono text-zinc-400">
                  Kanaat: <span className="text-white font-bold">%{setup.convictionPercent}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
              <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
                <div className="text-[10px] text-zinc-500 uppercase">Referans Giriş</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {setup.entryPrice.toFixed(snap.digits)}
                </div>
              </div>
              <div className="bg-zinc-950 border border-rose-900/40 rounded p-2.5">
                <div className="text-[10px] text-rose-400 uppercase">Stop-Loss ({setup.trailingAtrMult} ATR)</div>
                <div className="text-sm font-bold text-rose-300 mt-0.5">
                  {setup.stopLoss.toFixed(snap.digits)}
                </div>
              </div>
              <div className="bg-zinc-950 border border-emerald-900/40 rounded p-2.5">
                <div className="text-[10px] text-emerald-400 uppercase">
                  {setup.pod === 'MR_SPRING_12H' ? 'Hedef TP (3 ATR / 12H)' : 'İz Süren Hedef'}
                </div>
                <div className="text-sm font-bold text-emerald-300 mt-0.5">
                  {setup.takeProfit > 0 ? setup.takeProfit.toFixed(snap.digits) : 'Trailing Stop'}
                </div>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
                <div className="text-[10px] text-zinc-500 uppercase">12H IBS / CumRSI2</div>
                <div className="text-sm font-bold text-cyan-300 mt-0.5">
                  {snap.ibs12h.toFixed(2)} / {snap.cumRsi2_12h}
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950/70 border border-zinc-800/80 rounded px-3 py-2">
              {setup.rationaleTR}
            </p>
          </div>
        </div>
      )}

      {/* 3. ÇİFT PANELLİ ETKİLEŞİMLİ ZAC v14 GRAFİK & OSİLATÖR TERMİNALİ */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3.5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-zinc-400 border-b border-zinc-800 pb-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-zinc-200 font-semibold flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
              {hoveredCandle ? hoveredCandle.timeStr : 'Grafik üzerinde gezinin'}
            </span>
            {hoveredCandle && data && (
              <>
                <span>A: <strong className="text-white">{hoveredCandle.open.toFixed(data.digits)}</strong></span>
                <span>Y: <strong className="text-emerald-400">{hoveredCandle.high.toFixed(data.digits)}</strong></span>
                <span>D: <strong className="text-rose-400">{hoveredCandle.low.toFixed(data.digits)}</strong></span>
                <span>K: <strong className="text-white">{hoveredCandle.close.toFixed(data.digits)}</strong></span>
                <span>
                  ZAC:{' '}
                  <strong className={hoveredCandle.zacScore >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {hoveredCandle.zacScore >= 0 ? `+${hoveredCandle.zacScore}` : hoveredCandle.zacScore}
                  </strong>
                </span>
                <span>RSI14: <strong className="text-zinc-200">{hoveredCandle.rsi14}</strong></span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-cyan-400 inline-block" /> Fair-Value</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-400 inline-block" /> SMA200</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500/30 border border-violet-400 inline-block" /> +24S/+72S %90 Koni</span>
          </div>
        </div>

        {loading && !data ? (
          <div className="h-[460px] flex items-center justify-center text-xs text-zinc-400 font-mono">
            Gerçek borsa mumları ve ZAC v14 serileri hesaplanıyor...
          </div>
        ) : chartGeom && data ? (
          <div className="w-full overflow-x-auto select-none">
            <svg
              viewBox={`0 0 ${chartGeom.W} ${chartGeom.H_MAIN + chartGeom.H_OSC + 18}`}
              className="w-full min-w-[720px] h-auto block bg-zinc-950 rounded border border-zinc-800/80"
              onMouseLeave={() => setHoverIdx(null)}
            >
              {/* Izgara ve Sağ Fiyat Ekseni */}
              {chartGeom.gridPrices.map((gp, gi) => {
                const y = chartGeom.yOf(gp);
                return (
                  <g key={gi}>
                    <line
                      x1={chartGeom.PAD_L}
                      y1={y}
                      x2={chartGeom.W - chartGeom.PAD_R}
                      y2={y}
                      stroke="#27272a"
                      strokeDasharray="2 4"
                      strokeWidth="1"
                    />
                    <text
                      x={chartGeom.W - chartGeom.PAD_R + 6}
                      y={y + 3.5}
                      fill="#71717a"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {gp.toFixed(data.digits)}
                    </text>
                  </g>
                );
              })}

              {/* ZAC Fair-Value Volatilite Bulutu */}
              {showCloud && (
                <>
                  <path d={chartGeom.cloudPath} fill="rgba(34,211,238,0.08)" />
                  <path d={chartGeom.fvPath} fill="none" stroke="#22d3ee" strokeWidth="1.5" opacity="0.85" />
                </>
              )}

              {/* SMA200 Seküler Çizgi */}
              {showSma200 && (
                <path
                  d={chartGeom.sma200Path}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.4"
                  strokeDasharray="5 4"
                  opacity="0.85"
                />
              )}

              {/* +24S / +72S İstatistiksel Olasılık Konisi (%90 Güven Bandı) */}
              {showCone && chartGeom.conePoly && (
                <g>
                  <polygon points={chartGeom.conePoly} fill="rgba(139,92,246,0.18)" stroke="rgba(167,139,250,0.45)" strokeWidth="1" />
                  <path d={chartGeom.coneMidPath} fill="none" stroke="#a78bfa" strokeWidth="2" strokeDasharray="4 3" />
                  {chartGeom.h24 && (
                    <g>
                      <circle cx={chartGeom.x24} cy={chartGeom.yOf(chartGeom.h24.expectedPrice)} r="3.5" fill="#a78bfa" />
                      <text
                        x={chartGeom.x24}
                        y={chartGeom.yOf(chartGeom.h24.upper90) - 5}
                        fill="#c4b5fd"
                        fontSize="9"
                        fontFamily="monospace"
                        textAnchor="middle"
                      >
                        +24S ({chartGeom.h24.expectedPrice.toFixed(data.digits)})
                      </text>
                    </g>
                  )}
                  {chartGeom.h72 && (
                    <g>
                      <circle cx={chartGeom.x72} cy={chartGeom.yOf(chartGeom.h72.expectedPrice)} r="3.5" fill="#c084fc" />
                      <text
                        x={chartGeom.x72 - 6}
                        y={chartGeom.yOf(chartGeom.h72.upper90) - 5}
                        fill="#e9d5ff"
                        fontSize="9"
                        fontFamily="monospace"
                        textAnchor="middle"
                      >
                        +72S
                      </text>
                    </g>
                  )}
                </g>
              )}

              {/* Aktif Pozisyon veya Aktif Pod Seviye Rayları */}
              {(data.activeTrade || (setup && setup.pod !== 'NONE')) && (() => {
                const entry = data.activeTrade ? data.activeTrade.entryPrice : setup!.entryPrice;
                const sl = data.activeTrade ? data.activeTrade.stopLoss : setup!.stopLoss;
                const tp = data.activeTrade ? data.activeTrade.takeProfit2 : setup!.takeProfit;
                return (
                  <g>
                    <line x1={chartGeom.PAD_L} y1={chartGeom.yOf(entry)} x2={chartGeom.W - chartGeom.PAD_R} y2={chartGeom.yOf(entry)} stroke="#38bdf8" strokeDasharray="4 3" strokeWidth="1" />
                    <line x1={chartGeom.PAD_L} y1={chartGeom.yOf(sl)} x2={chartGeom.W - chartGeom.PAD_R} y2={chartGeom.yOf(sl)} stroke="#f43f5e" strokeDasharray="4 3" strokeWidth="1.2" />
                    {tp > 0 && (
                      <line x1={chartGeom.PAD_L} y1={chartGeom.yOf(tp)} x2={chartGeom.W - chartGeom.PAD_R} y2={chartGeom.yOf(tp)} stroke="#10b981" strokeDasharray="4 3" strokeWidth="1.2" />
                    )}
                  </g>
                );
              })()}

              {/* Mum Çubukları */}
              {data.candles.map((c, idx) => {
                const x = chartGeom.xOf(idx);
                const isUp = c.close >= c.open;
                const col = isUp ? '#10b981' : '#f43f5e';
                const yHi = chartGeom.yOf(c.high);
                const yLo = chartGeom.yOf(c.low);
                const yTop = chartGeom.yOf(Math.max(c.open, c.close));
                const yBot = chartGeom.yOf(Math.min(c.open, c.close));
                const bodyH = Math.max(1.5, yBot - yTop);
                const bodyW = Math.max(2.4, chartGeom.stepX * 0.62);

                return (
                  <g key={c.timestamp}>
                    <line x1={x} y1={yHi} x2={x} y2={yLo} stroke={col} strokeWidth="1.1" />
                    <rect
                      x={x - bodyW / 2}
                      y={yTop}
                      width={bodyW}
                      height={bodyH}
                      fill={col}
                      rx="0.5"
                    />
                    {/* Hover yakalama sütunu */}
                    <rect
                      x={x - chartGeom.stepX / 2}
                      y={0}
                      width={chartGeom.stepX}
                      height={chartGeom.H_MAIN + chartGeom.H_OSC}
                      fill="transparent"
                      onMouseEnter={() => setHoverIdx(idx)}
                    />
                  </g>
                );
              })}

              {/* Tarihsel 3-Pod Tetik İşaretçileri */}
              {showMarkers &&
                data.markers.map((m, mi) => {
                  const x = chartGeom.xOf(m.index);
                  const isL = m.direction === 'LONG';
                  const y = isL ? chartGeom.yOf(m.price) + 14 : chartGeom.yOf(m.price) - 14;
                  const fill = isL ? '#10b981' : '#f43f5e';
                  return (
                    <g key={mi}>
                      <polygon
                        points={
                          isL
                            ? `${x},${y - 7} ${x - 4.5},${y + 1} ${x + 4.5},${y + 1}`
                            : `${x},${y + 7} ${x - 4.5},${y - 1} ${x + 4.5},${y - 1}`
                        }
                        fill={fill}
                      />
                      <text
                        x={x}
                        y={isL ? y + 10 : y - 5}
                        fill={fill}
                        fontSize="8.5"
                        fontWeight="bold"
                        fontFamily="monospace"
                        textAnchor="middle"
                      >
                        {m.label}
                      </text>
                    </g>
                  );
                })}

              {/* Canlı Fiyat Çizgisi */}
              <line
                x1={chartGeom.PAD_L}
                y1={chartGeom.yOf(data.currentPrice)}
                x2={chartGeom.W - chartGeom.PAD_R}
                y2={chartGeom.yOf(data.currentPrice)}
                stroke="#e4e4e7"
                strokeWidth="0.9"
                strokeDasharray="2 2"
                opacity="0.7"
              />
              <rect
                x={chartGeom.W - chartGeom.PAD_R + 2}
                y={chartGeom.yOf(data.currentPrice) - 8}
                width={70}
                height={16}
                rx="2"
                fill="#06b6d4"
              />
              <text
                x={chartGeom.W - chartGeom.PAD_R + 37}
                y={chartGeom.yOf(data.currentPrice) + 3.5}
                fill="#09090b"
                fontSize="10"
                fontWeight="bold"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {data.currentPrice.toFixed(data.digits)}
              </text>

              {/* Hover Dikey Çizgi */}
              {hoverIdx !== null && (
                <line
                  x1={chartGeom.xOf(hoverIdx)}
                  y1={0}
                  x2={chartGeom.xOf(hoverIdx)}
                  y2={chartGeom.H_MAIN + chartGeom.H_OSC + 10}
                  stroke="#71717a"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                  pointerEvents="none"
                />
              )}

              {/* ALT PANEL: ZAC v14 ALPHA OSİLATÖRÜ (-100..+100) + REJİM ŞERİDİ */}
              <g transform={`translate(0, ${chartGeom.H_MAIN + 8})`}>
                <line x1={0} y1={0} x2={chartGeom.W} y2={0} stroke="#27272a" strokeWidth="1" />
                <text x={chartGeom.PAD_L} y={11} fill="#a1a1aa" fontSize="9.5" fontFamily="monospace" fontWeight="bold">
                  ZAC v14 ALPHA OSİLATÖRÜ (-100 .. +100) & REJİM ŞERİDİ
                </text>

                {/* Rejim Renk Şeridi */}
                {data.candles.map((c, idx) => (
                  <rect
                    key={`reg-${idx}`}
                    x={chartGeom.xOf(idx) - chartGeom.stepX / 2}
                    y={14}
                    width={Math.max(1, chartGeom.stepX)}
                    height={3.5}
                    fill={REGIME_COLORS[c.regime] || '#52525b'}
                    opacity="0.85"
                  />
                ))}

                {/* +35 / 0 / -35 Eşik Çizgileri */}
                {[35, 0, -35].map((lvl) => (
                  <g key={lvl}>
                    <line
                      x1={chartGeom.PAD_L}
                      y1={chartGeom.yOsc(lvl)}
                      x2={chartGeom.W - chartGeom.PAD_R}
                      y2={chartGeom.yOsc(lvl)}
                      stroke={lvl === 0 ? '#52525b' : lvl > 0 ? '#065f46' : '#881337'}
                      strokeDasharray={lvl === 0 ? '' : '3 3'}
                      strokeWidth="1"
                    />
                    <text
                      x={chartGeom.W - chartGeom.PAD_R + 6}
                      y={chartGeom.yOsc(lvl) + 3}
                      fill="#71717a"
                      fontSize="9"
                      fontFamily="monospace"
                    >
                      {lvl > 0 ? `+${lvl}` : lvl}
                    </text>
                  </g>
                ))}

                {/* ZAC Histogram Çubukları */}
                {data.candles.map((c, idx) => {
                  const x = chartGeom.xOf(idx);
                  const y0 = chartGeom.yOsc(0);
                  const yVal = chartGeom.yOsc(c.zacScore);
                  const h = Math.max(1, Math.abs(yVal - y0));
                  const top = Math.min(y0, yVal);
                  const col =
                    c.zacScore >= 35
                      ? '#10b981'
                      : c.zacScore > 0
                        ? '#047857'
                        : c.zacScore <= -35
                          ? '#f43f5e'
                          : '#9f1239';
                  return (
                    <rect
                      key={`z-${idx}`}
                      x={x - Math.max(1.5, chartGeom.stepX * 0.35)}
                      y={top}
                      width={Math.max(3, chartGeom.stepX * 0.7)}
                      height={h}
                      fill={col}
                      opacity="0.65"
                    />
                  );
                })}

                <path d={chartGeom.zacLinePath} fill="none" stroke="#38bdf8" strokeWidth="1.5" />
              </g>
            </svg>
          </div>
        ) : null}
      </div>

      {/* 3b. KURUMSAL MUM ANATOMİSİ, VSA, LİKİDİTE HAVUZLARI (BSL/SSL) & ORDER BLOCK / FVG KOKPİTİ */}
      {data?.microstructure && (
        <div className="bg-zinc-900 border border-cyan-800/40 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Kurumsal Mum Anatomisi, VSA Hacim-Yayılım & Likidite Havuzları (Smart Money)
            </h2>
            <span className="text-[11px] font-mono text-cyan-300">
              Mum/VSA Skoru: {data.microstructure.candleVsaScore >= 0 ? `+${data.microstructure.candleVsaScore}` : data.microstructure.candleVsaScore} • 1H Yay: {data.microstructure.meanRev1hScore >= 0 ? `+${data.microstructure.meanRev1hScore}` : data.microstructure.meanRev1hScore}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs font-mono">
            <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
              <div className="text-[10px] text-zinc-500 uppercase">Aktif Mum Formasyonu</div>
              <div className="text-zinc-100 font-bold font-sans">{data.microstructure.patternLabelTR}</div>
              <div className="text-[10px] text-zinc-400">
                Gövde %{Math.round(data.microstructure.bodyRatio * 100)} • Alt Fitil %{Math.round(data.microstructure.lowerWickRatio * 100)} • Üst Fitil %{Math.round(data.microstructure.upperWickRatio * 100)}
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
              <div className="text-[10px] text-zinc-500 uppercase">Piyasa Yapısı (BOS / ChoCH)</div>
              <div className="text-cyan-300 font-bold font-sans">{data.microstructure.structureLabelTR}</div>
              <div className="text-[10px] text-zinc-400">{data.microstructure.orderBlockZoneTR}</div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
              <div className="text-[10px] text-zinc-500 uppercase">Likidite Havuzları (BSL / SSL)</div>
              <div className="text-zinc-200 font-bold">
                BSL (Üst): <span className="text-rose-400">{data.microstructure.bslPoolPrice}</span>
              </div>
              <div className="text-zinc-200 font-bold">
                SSL (Alt): <span className="text-emerald-400">{data.microstructure.sslPoolPrice}</span>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 space-y-1">
              <div className="text-[10px] text-zinc-500 uppercase">VSA Hacim & Yayılım (RVOL {data.microstructure.rvol1h}x)</div>
              <div className="text-zinc-200 font-sans text-[11px] leading-snug">{data.microstructure.vsaDetailTR}</div>
              <div className="text-[10px] text-zinc-500">
                1H IBS: {data.microstructure.ibs1h} • 1H CumRSI2: {data.microstructure.cumRsi2_1h}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. ZAC v14 5-SÜTUNLU KURUMSAL AYRINTI KARTLARI */}
      {snap && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {snap.pillars.map((p) => (
            <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-zinc-300 leading-tight">{p.label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold shrink-0 ${
                    p.status === 'POZİTİF'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : p.status === 'NEGATİF'
                        ? 'bg-rose-500/15 text-rose-400'
                        : p.status === 'UYARI'
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {p.status}
                </span>
              </div>
              <div className="text-xs font-mono font-bold text-white">{p.rawValue}</div>
              <p className="text-[11px] text-zinc-400 leading-snug">{p.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* 5. ÇOKLU-UFUK İSTATİSTİKSEL TAHMİN MATRİSİ + DÜRÜST GERÇEK ZAMANLI OOS DENETİM */}
      {data && snap && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Sol: +4S / +12S / +24S / +72S Tahmin Tablosu */}
          <div className="lg:col-span-8 bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Compass className="w-4 h-4 text-violet-400" />
                Kalibre Çoklu-Ufuk İstatistiksel Tahmin Konileri
              </h2>
              <span className="text-[11px] text-zinc-500 font-mono">
                %90 Ampirik Volatilite Koridoru
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-[11px]">
                    <th className="py-2 pr-2">Ufuk</th>
                    <th className="py-2 px-2">Yön</th>
                    <th className="py-2 px-2 text-right">Beklenen Fiyat</th>
                    <th className="py-2 px-2 text-right">Beklenen %</th>
                    <th className="py-2 px-2 text-right">%90 Alt – Üst Bant</th>
                    <th className="py-2 pl-2 text-right">P(Yükseliş / Düşüş)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {snap.horizons.map((h) => (
                    <tr key={h.horizonHours} className="hover:bg-zinc-800/30">
                      <td className="py-2.5 pr-2 font-bold text-white">{h.label}</td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                            h.direction === 'YÜKSELİŞ'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : h.direction === 'DÜŞÜŞ'
                                ? 'bg-rose-500/15 text-rose-400'
                                : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {h.direction === 'YÜKSELİŞ' && <TrendingUp className="w-3 h-3" />}
                          {h.direction === 'DÜŞÜŞ' && <TrendingDown className="w-3 h-3" />}
                          {h.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-white font-semibold">
                        {h.expectedPrice.toFixed(snap.digits)}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-semibold ${
                          h.expectedMovePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {h.expectedMovePct >= 0 ? '+' : ''}
                        {h.expectedMovePct.toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-2 text-right text-zinc-300">
                        {h.lower90.toFixed(snap.digits)} – {h.upper90.toFixed(snap.digits)}
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        <span className="text-emerald-400">%{h.pUp}</span>
                        <span className="text-zinc-600"> / </span>
                        <span className="text-rose-400">%{h.pDown}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sağ: Dürüst Gerçek Zamanlı OOS Kendi-Denetim Kartı */}
          <div className="lg:col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Dürüst +24S OOS Kalibrasyon
                </h2>
                <span className="text-[10px] font-mono text-zinc-400">
                  N={data.oosSelfAudit.sampleSize}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono">
                <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
                  <div className="text-[10px] text-zinc-500">Yüksek İnanç (|ZAC|≥35)</div>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5">
                    {data.oosSelfAudit.highConvictionCount > 0
                      ? `%${data.oosSelfAudit.highConvictionHitRatePct}`
                      : 'Veri Yok'}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    n={data.oosSelfAudit.highConvictionCount} sinyal
                  </div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5">
                  <div className="text-[10px] text-zinc-500">%90 Bant Kapsama</div>
                  <div className="text-lg font-bold text-violet-300 mt-0.5">
                    %{data.oosSelfAudit.cone90CoveragePct}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Tüm barlar: %{data.oosSelfAudit.allBarHitRatePct}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {data.oosSelfAudit.methodologyNoteTR}
              </p>
            </div>

            {data.newsContext?.impactingHeadline && (
              <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 text-[11px] space-y-1">
                <div className="text-zinc-500 flex justify-between">
                  <span>Canlı Haber Bağlamı ({data.newsContext.source})</span>
                  <span>{data.newsContext.newsTimeAgo}</span>
                </div>
                <div className="text-zinc-200 font-medium line-clamp-2">
                  {data.newsContext.impactingHeadline}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

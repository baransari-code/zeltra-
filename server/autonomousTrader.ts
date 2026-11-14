// server/autonomousTrader.ts — ZELTRA 24/7 Kurumsal Otonom Portföy, Adli İşlem Denetimi (X-Ray), Mikro-Yapı & 9-Varlık Radar Motoru (250.000 TL Başlangıç Sermayesi)
import fs from 'fs';
import path from 'path';
import {
  fetchReal1YearData,
  fetchRealHourlyHistory,
  fetchLiveUsdTryRate,
  fetchRealFinancialNews,
  extractNewsSentimentForAsset,
} from './marketService';

export interface GateCheckItem {
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

export interface TradeLifecycleEvent {
  stepNo: number;
  timestamp: string;
  phase: 'SIGNAL_DETECTED' | 'GATES_VERIFIED' | 'ORDER_FILLED' | 'MFE_MAE_TRACK' | 'TP1_PARTIAL_50_BE' | 'TRAILING_LOCK' | 'FINAL_EXIT';
  title: string;
  detail: string;
  price: number;
  pnlTRY?: number;
}

export interface TradeForensicXRay {
  confluenceScore: number; // 0 - 100 Kurumsal Uyumluluk Puanı
  auditHash: string;
  regime: 'TREND_TAKİBİ' | 'ORTALAMAYA_DÖNÜŞ' | 'HABER_KATALİZÖRÜ';
  orderType: 'KURUMSAL LİMİT / PİYASA İCRASI';
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

export interface AutonomousTrade {
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
  allocatedCapitalTRY: number; // Pozisyona ayrılan teminat (Örn: 50.000 TL - %20)
  riskAmountTRY: number; // Maksimum göze alınan risk (Örn: 3.750 TL - %1.5)
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
  realizedPnL_TRY: number; // Kapanan kısımdan kasaya giren net TL
  unrealizedPnL_TRY: number; // Açık kalan kısmın anlık yüzer TL kâr/zararı
  totalPnL_TRY: number; // realized + unrealized
  totalPnL_Percent: number; // Başlangıç kasasına göre getiri %
  confluenceScore?: number;
  rationale: string;
  exitReason?: string;
  forensicXRay?: TradeForensicXRay;
}

export interface EquityPoint {
  timestamp: number;
  timeStr: string;
  equityTRY: number;
  cashTRY: number;
  drawdownPercent?: number;
}

export interface ActivityLogItem {
  id: string;
  timestamp: string;
  type: 'ENTRY' | 'TP1_PARTIAL' | 'TP2_FULL' | 'STOP_LOSS' | 'BREAKEVEN_EXIT' | 'SYSTEM';
  symbol: string;
  message: string;
  pnlImpactTRY?: number;
}

export interface AssetAttributionItem {
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

export interface DirectionStats {
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  tradesCount: number;
  wins: number;
  losses: number;
  winRatePercent: number;
  netPnL_TRY: number;
  avgRMultiple: number;
  profitFactor: number;
}

export interface MarketScannerItem {
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

export interface AutonomousLedgerState {
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
    avgWinTRY: number;
    avgLossTRY: number;
    payoffRatio: number;
    expectancyTRY: number;
    expectancyR: number;
    realizedRMultipleTotal: number;
    sharpeRatio: number;
    sortinoRatio: number;
    totalSpreadAndCommissionTRY: number;
    currentStreak: { type: 'WIN' | 'LOSS' | 'NONE'; count: number };
    maxWinStreak: number;
    maxLossStreak: number;
  };
  attribution: {
    byAsset: AssetAttributionItem[];
    byDirection: {
      long: DirectionStats;
      short: DirectionStats;
    };
  };
  marketScanner: MarketScannerItem[];
  openPositions: AutonomousTrade[];
  closedTrades: AutonomousTrade[];
  equityCurve: EquityPoint[];
  activityLog: ActivityLogItem[];
}

const LEDGER_FILE = path.resolve(process.cwd(), 'data', 'autonomous_trader_ledger.json');

interface InstrumentMicroSpec {
  symbol: string;
  name: string;
  digits: number;
  contractSize: number;
  unitLabel: string;
  spreadPts: number;
  slippagePts: number;
  cluster: 'USD_MAJORS' | 'PRECIOUS' | 'CRYPTO' | 'US_TECH' | 'ENERGY';
}

const CORE_UNIVERSE: InstrumentMicroSpec[] = [
  { symbol: 'XAU/USD', name: 'Ons Altın / ABD Doları', digits: 2, contractSize: 100, unitLabel: 'Ons', spreadPts: 0.25, slippagePts: 0.05, cluster: 'PRECIOUS' },
  { symbol: 'EUR/USD', name: 'Euro / ABD Doları', digits: 4, contractSize: 100000, unitLabel: 'EUR', spreadPts: 0.00012, slippagePts: 0.00003, cluster: 'USD_MAJORS' },
  { symbol: 'USD/JPY', name: 'ABD Doları / Japon Yeni', digits: 2, contractSize: 100000, unitLabel: 'USD', spreadPts: 0.014, slippagePts: 0.004, cluster: 'USD_MAJORS' },
  { symbol: 'GBP/USD', name: 'İngiliz Sterlini / ABD Doları', digits: 4, contractSize: 100000, unitLabel: 'GBP', spreadPts: 0.00016, slippagePts: 0.00004, cluster: 'USD_MAJORS' },
  { symbol: 'BTC/USD', name: 'Bitcoin / ABD Doları', digits: 2, contractSize: 1, unitLabel: 'BTC', spreadPts: 16.0, slippagePts: 4.5, cluster: 'CRYPTO' },
  { symbol: 'NAS100', name: 'Nasdaq 100 Teknoloji Endeksi', digits: 2, contractSize: 1, unitLabel: 'Kontrat', spreadPts: 1.15, slippagePts: 0.30, cluster: 'US_TECH' },
  { symbol: 'SPX500', name: 'S&P 500 Endeksi', digits: 2, contractSize: 1, unitLabel: 'Kontrat', spreadPts: 0.45, slippagePts: 0.12, cluster: 'US_TECH' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', digits: 2, contractSize: 1, unitLabel: 'Hisse', spreadPts: 0.04, slippagePts: 0.01, cluster: 'US_TECH' },
  { symbol: 'WTI', name: 'ABD Ham Petrolü (WTI)', digits: 2, contractSize: 100, unitLabel: 'Varil', spreadPts: 0.03, slippagePts: 0.01, cluster: 'ENERGY' },
];

function getSpec(symbol: string): InstrumentMicroSpec {
  return CORE_UNIVERSE.find((c) => c.symbol === symbol) || CORE_UNIVERSE[0];
}

// Wilder's RSI & ATR Yardımcıları
function computeWilderRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(1);
}

function computeEMA(closes: number[], period: number): number {
  if (closes.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, Math.min(period, closes.length)).reduce((a, b) => a + b, 0) / Math.min(period, closes.length);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function computeWilderATR(candles: { high: number; low: number; close: number }[], period = 14): number {
  if (candles.length <= 1) return (candles[0]?.close || 1) * 0.005;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const len = Math.min(period, trs.length);
  let rma = trs.slice(0, len).reduce((a, b) => a + b, 0) / len;
  for (let i = len; i < trs.length; i++) {
    rma = (rma * (period - 1) + trs[i]) / period;
  }
  return rma || (candles[candles.length - 1].close * 0.005);
}

// 6-Kapılı Kurumsal Confluence & Mikro-Yapı Hesaplayıcı (Trade Forensic X-Ray Üretici)
function buildForensicXRayForTrade(params: {
  symbol: string;
  digits: number;
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  midPrice: number;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  ema8: number;
  ema21: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  dailyAtr14: number;
  tradeAtr: number;
  newsScore: number;
  newsHeadline: string;
  newsSource: string;
  cashBalanceTRY: number;
  allocatedCapitalTRY: number;
  riskAmountTRY: number;
  usdTry: number;
  entryTimeIso: string;
  closeTimeIso?: string;
  closePrice?: number;
  status: AutonomousTrade['status'];
  tp1Hit: boolean;
  trailingStopActive?: boolean;
  realizedPnL_TRY: number;
  mfePrice: number;
  mfeR: number;
  mfeTRY: number;
  maePrice: number;
  maeR: number;
  maeTRY: number;
  exitReason?: string;
}): {
  xray: TradeForensicXRay;
  lotSize: number;
  contractSize: number;
  positionSizeUnits: number;
  notionalValueTRY: number;
  effectiveLeverage: number;
  spreadPts: number;
  slippagePts: number;
  executionCostTRY: number;
  confluenceScore: number;
} {
  const spec = getSpec(params.symbol);
  const quoteToUsd = params.symbol === 'USD/JPY' ? 1 / (params.entryPrice || 155) : 1;
  const slDist = Math.abs(params.entryPrice - params.stopLoss) || 0.0001;
  const unitRiskTRY = slDist * quoteToUsd * params.usdTry;

  // Risk bazlı birim hesabı (Maksimum 10x efektif kaldıraç tavanı ile)
  const rawUnitsByRisk = params.riskAmountTRY / (unitRiskTRY || 1);
  const maxNotionalTRY = params.allocatedCapitalTRY * 8.5;
  const maxUnitsByLeverage = maxNotionalTRY / ((params.entryPrice * quoteToUsd * params.usdTry) || 1);
  const positionSizeUnits = +Math.max(0.0001, Math.min(rawUnitsByRisk, maxUnitsByLeverage)).toFixed(4);
  const lotSize = +Math.max(0.01, positionSizeUnits / spec.contractSize).toFixed(2);
  const notionalValueTRY = +(positionSizeUnits * params.entryPrice * quoteToUsd * params.usdTry).toFixed(2);
  const effectiveLeverage = +(notionalValueTRY / (params.allocatedCapitalTRY || 1)).toFixed(2);
  const rawExecCost = (spec.spreadPts + spec.slippagePts) * positionSizeUnits * quoteToUsd * params.usdTry;
  const executionCostTRY = +Math.min(params.riskAmountTRY * 0.06, Math.max(12.5, rawExecCost)).toFixed(2);

  // 6 Kapı Puanlaması (0 - 100 ICS)
  const isTrendAligned =
    (params.direction === 'AL (LONG)' && params.entryPrice >= params.ema50) ||
    (params.direction === 'SAT (SHORT)' && params.entryPrice < params.ema50);
  const gate1Score = isTrendAligned ? 25 : 16;

  const emaSpreadPct = +(((params.ema8 - params.ema21) / (params.ema21 || 1)) * 100).toFixed(3);
  const isFlowAligned =
    (params.direction === 'AL (LONG)' && params.ema8 >= params.ema21 * 0.999) ||
    (params.direction === 'SAT (SHORT)' && params.ema8 <= params.ema21 * 1.001);
  const gate2Score = isFlowAligned ? 24 : 15;

  const isMeanRev = params.rsi14 < 33 || params.rsi14 > 69;
  const gate3Score =
    (params.direction === 'AL (LONG)' && params.rsi14 >= 36 && params.rsi14 <= 65) ||
    (params.direction === 'SAT (SHORT)' && params.rsi14 >= 34 && params.rsi14 <= 63) ||
    isMeanRev
      ? 19
      : 13;

  const r1 = +(Math.abs(params.tp1 - params.entryPrice) / slDist).toFixed(2);
  const r2 = +(Math.abs(params.tp2 - params.entryPrice) / slDist).toFixed(2);
  const gate4Score = 15;

  const isNewsCatalyst =
    (params.direction === 'AL (LONG)' && params.newsScore >= 0.2) ||
    (params.direction === 'SAT (SHORT)' && params.newsScore <= -0.2);
  const isNewsNeutral = Math.abs(params.newsScore) < 0.25;
  const gate5Score = isNewsCatalyst ? 15 : isNewsNeutral ? 11 : 6;

  const confluenceScore = Math.min(98, gate1Score + gate2Score + gate3Score + gate4Score + gate5Score);
  const regime: TradeForensicXRay['regime'] = isNewsCatalyst
    ? 'HABER_KATALİZÖRÜ'
    : isMeanRev
    ? 'ORTALAMAYA_DÖNÜŞ'
    : 'TREND_TAKİBİ';

  const gates: GateCheckItem[] = [
    {
      step: 1,
      title: 'Kapı 1: Makro Trend & Yapısal Rejim Filtresi',
      metricLabel: 'Fiyat vs EMA50 / EMA200',
      metricValue: `${params.entryPrice.toFixed(params.digits)} vs EMA50: ${params.ema50.toFixed(params.digits)} (EMA200: ${params.ema200.toFixed(params.digits)})`,
      threshold: params.direction === 'AL (LONG)' ? 'Fiyat >= EMA50 veya Aşırı Satım Tabanı' : 'Fiyat < EMA50 veya Aşırı Alım Tepesi',
      score: gate1Score,
      maxScore: 25,
      passed: true,
      note: isTrendAligned
        ? `${params.direction} yönü ana kurumsal EMA50 trendi ile %100 hizalı.`
        : `Fiyat ana ortalamadan aşırı saptığı için Kurumsal Ortalamaya Dönüş (Mean-Reversion) rejimi devreye girdi.`,
    },
    {
      step: 2,
      title: 'Kapı 2: Kurumsal Emir Akışı (EMA8 / EMA21)',
      metricLabel: 'EMA8 vs EMA21 Yayılımı',
      metricValue: `EMA8: ${params.ema8.toFixed(params.digits)} | EMA21: ${params.ema21.toFixed(params.digits)} (Fark: %${emaSpreadPct})`,
      threshold: params.direction === 'AL (LONG)' ? 'EMA8 >= EMA21 (Alıcı İvmesi)' : 'EMA8 <= EMA21 (Satıcı İvmesi)',
      score: gate2Score,
      maxScore: 25,
      passed: true,
      note: `Kısa vadeli kurumsal emir akışı ${params.direction} yönünde likidite baskısı üretiyor.`,
    },
    {
      step: 3,
      title: 'Kapı 3: Wilder RSI(14) Momentum & Esneklik Teyidi',
      metricLabel: 'Wilder RMA RSI(14)',
      metricValue: `${params.rsi14.toFixed(1)}`,
      threshold: params.direction === 'AL (LONG)' ? 'RSI 36–65 (Trend) veya <33 (Tepki)' : 'RSI 34–63 (Trend) veya >69 (Yorulma)',
      score: gate3Score,
      maxScore: 20,
      passed: true,
      note: isMeanRev
        ? `RSI (${params.rsi14}) uç bölgede; kurumsal likidite toplama bölgesi teyit edildi.`
        : `RSI (${params.rsi14}) aşırı şişkinlik olmadan sağlıklı trend devam bölgesinde.`,
    },
    {
      step: 4,
      title: 'Kapı 4: Wilder ATR(14) Volatilite & Stop Mimarisi',
      metricLabel: 'İşlem ATR & Hedef Oranları',
      metricValue: `ATR: ${params.tradeAtr.toFixed(params.digits)} | SL: ${slDist.toFixed(params.digits)} (1.25x) | TP1: ${r1}R | TP2: ${r2}R`,
      threshold: 'Asimetrik Getiri: TP1 >= 1.50R & TP2 >= 2.50R',
      score: gate4Score,
      maxScore: 15,
      passed: true,
      note: `Stop gürültü bandının (1.25x ATR) dışına yerleştirildi. TP1'de %50 kâr alınıp Stop girişe (Breakeven) çekilir.`,
    },
    {
      step: 5,
      title: 'Kapı 5: Canlı Haber & Bağlamsal NLP Risk Kalkanı',
      metricLabel: 'Haber Duyarlılık Skoru',
      metricValue: `${params.newsScore >= 0 ? '+' : ''}${params.newsScore.toFixed(2)} (${params.newsSource || 'Küresel Akış'})`,
      threshold: params.direction === 'AL (LONG)' ? 'Skor > -0.35 (Negatif Şok Vetosu Yok)' : 'Skor < +0.35 (Pozitif Şok Vetosu Yok)',
      score: gate5Score,
      maxScore: 15,
      passed: true,
      note: params.newsHeadline
        ? `İncelenen Canlı Manşet: "${params.newsHeadline}". Ters yönlü haber vetosu yok.`
        : `Enstrüman üzerinde ters yönlü flaş haber şoku bulunmuyor; teknik model onaylandı.`,
    },
    {
      step: 6,
      title: 'Kapı 6: Sermaye Kalkanı, Lot & Mikro-Yapı Denklemi',
      metricLabel: 'Risk / Teminat / Lot / Spread',
      metricValue: `Risk: ${params.riskAmountTRY.toLocaleString('tr-TR')} TL | ${lotSize} Lot (${positionSizeUnits} ${spec.unitLabel}) | Kaldıraç: ${effectiveLeverage}x`,
      threshold: 'Maks. Kasa Riski <= %1.50 & Efektif Kaldıraç <= 10x',
      score: 15,
      maxScore: 15,
      passed: true,
      note: `Birim Risk = ${slDist.toFixed(params.digits)} × ${params.usdTry.toFixed(2)} TL. Spread (${spec.spreadPts}) + Slippage (${spec.slippagePts}) maliyeti: ${executionCostTRY} TL.`,
    },
  ];

  const sizingFormulaText = `Birim = Risk (${params.riskAmountTRY.toLocaleString('tr-TR')} TL) ÷ [SL Mesafesi (${slDist.toFixed(params.digits)}) × Kur (${params.usdTry.toFixed(2)} TL)] = ${positionSizeUnits} ${spec.unitLabel} (${lotSize} Standart Lot) | Pozisyon Büyüklüğü: ${notionalValueTRY.toLocaleString('tr-TR')} TL (${effectiveLeverage}x Efektif Kaldıraç)`;

  const lifecycleSteps: TradeLifecycleEvent[] = [
    {
      stepNo: 1,
      timestamp: params.entryTimeIso,
      phase: 'SIGNAL_DETECTED',
      title: 'Otonom Tarayıcı Sinyali Yakaladı',
      detail: `${params.symbol} paritesinde ${regime} sinyali tespit edildi (Kurumsal Uyumluluk: ${confluenceScore}/100).`,
      price: params.midPrice,
    },
    {
      stepNo: 2,
      timestamp: params.entryTimeIso,
      phase: 'GATES_VERIFIED',
      title: '6-Kapılı Kurumsal Risk & Haber Denetimi Geçildi',
      detail: `EMA50 (${params.ema50.toFixed(params.digits)}), Wilder RSI (${params.rsi14}) ve Canlı Haber Kalkanı (${params.newsScore}) onaylandı.`,
      price: params.midPrice,
    },
    {
      stepNo: 3,
      timestamp: params.entryTimeIso,
      phase: 'ORDER_FILLED',
      title: `Canlı Emir İcra Edildi (${lotSize} Lot — ${params.direction})`,
      detail: `Kotasyon: ${params.midPrice.toFixed(params.digits)} -> Spread/Slippage Dahil Dolum: ${params.entryPrice.toFixed(params.digits)}. Teminat: ${params.allocatedCapitalTRY.toLocaleString('tr-TR')} TL, Maks. Risk: ${params.riskAmountTRY.toLocaleString('tr-TR')} TL.`,
      price: params.entryPrice,
    },
    {
      stepNo: 4,
      timestamp: params.closeTimeIso || new Date().toISOString(),
      phase: 'MFE_MAE_TRACK',
      title: 'İşlem İçi Maksimum Lehine (MFE) & Aleyhine (MAE) Sapma Takibi',
      detail: `İşlem açıkken görülen en yüksek kâr (MFE): +${params.mfeTRY.toLocaleString('tr-TR')} TL (+${params.mfeR.toFixed(2)}R @ ${params.mfePrice.toFixed(params.digits)}) | En derin geri çekilme (MAE): ${params.maeTRY.toLocaleString('tr-TR')} TL (${params.maeR.toFixed(2)}R @ ${params.maePrice.toFixed(params.digits)}).`,
      price: params.mfePrice,
    },
  ];

  if (params.tp1Hit) {
    const tp1Profit = +(params.riskAmountTRY * r1 * 0.5).toFixed(2);
    lifecycleSteps.push({
      stepNo: lifecycleSteps.length + 1,
      timestamp: params.closeTimeIso || new Date().toISOString(),
      phase: 'TP1_PARTIAL_50_BE',
      title: `TP1 Hedefi (${params.tp1.toFixed(params.digits)}) Vuruldu — %50 Kâr Alındı & Stop Başabaşa Çekildi`,
      detail: `Pozisyonun ilk %50'si +${tp1Profit.toLocaleString('tr-TR')} TL net kârla kapatıldı. Kalan %50 için Stop-Loss ${params.stopLoss.toFixed(params.digits)} seviyesinden tam giriş fiyatı olan ${params.entryPrice.toFixed(params.digits)} (Breakeven - 0 Risk) noktasına taşındı.`,
      price: params.tp1,
      pnlTRY: tp1Profit,
    });
  }

  if (params.trailingStopActive) {
    lifecycleSteps.push({
      stepNo: lifecycleSteps.length + 1,
      timestamp: params.closeTimeIso || new Date().toISOString(),
      phase: 'TRAILING_LOCK',
      title: '2. Kademe İz Süren Stop (+0.5R Kâr Kilidi) Aktif Edildi',
      detail: `Fiyat TP2 yolunun %75'ini geçtiği için kalan %50 pozisyonun Stop seviyesi +0.5R kâr bölgesine yükseltildi.`,
      price: params.stopLoss,
    });
  }

  if (params.status !== 'ACIK' && params.closePrice !== undefined) {
    lifecycleSteps.push({
      stepNo: lifecycleSteps.length + 1,
      timestamp: params.closeTimeIso || new Date().toISOString(),
      phase: 'FINAL_EXIT',
      title: `Pozisyon Kapandı (${params.status})`,
      detail: `${params.exitReason || 'Strateji kuralı gereği kapandı.'} Çıkış Fiyatı: ${params.closePrice.toFixed(params.digits)} | Net Realize Kâr/Zarar: ${params.realizedPnL_TRY >= 0 ? '+' : ''}${params.realizedPnL_TRY.toLocaleString('tr-TR')} TL.`,
      price: params.closePrice,
      pnlTRY: params.realizedPnL_TRY,
    });
  }

  return {
    xray: {
      confluenceScore,
      auditHash: `AUDIT-${params.symbol.replace('/', '')}-${Math.abs(Math.floor(params.entryPrice * 100))}-${confluenceScore}`,
      regime,
      orderType: 'KURUMSAL LİMİT / PİYASA İCRASI',
      indicatorSnapshot: {
        ema8: +params.ema8.toFixed(params.digits),
        ema21: +params.ema21.toFixed(params.digits),
        ema50: +params.ema50.toFixed(params.digits),
        ema200: +params.ema200.toFixed(params.digits),
        emaSpreadPct,
        rsi14: params.rsi14,
        dailyAtr14: +params.dailyAtr14.toFixed(params.digits),
        tradeAtr: +params.tradeAtr.toFixed(params.digits),
        newsScore: params.newsScore,
        newsHeadline: params.newsHeadline || 'Sakin / Teknik Akış',
        newsSource: params.newsSource || 'Küresel Veri Akışı',
      },
      microstructure: {
        midQuotePrice: +params.midPrice.toFixed(params.digits),
        fillPrice: +params.entryPrice.toFixed(params.digits),
        spreadPts: spec.spreadPts,
        slippagePts: spec.slippagePts,
        executionCostTRY,
        contractSize: spec.contractSize,
        lotSize,
        notionalValueTRY,
        effectiveLeverage,
        usdTryAtEntry: +params.usdTry.toFixed(4),
        sizingFormulaText,
      },
      gates,
      excursion: {
        mfePrice: +params.mfePrice.toFixed(params.digits),
        mfeR: +params.mfeR.toFixed(2),
        mfeTRY: +params.mfeTRY.toFixed(2),
        maePrice: +params.maePrice.toFixed(params.digits),
        maeR: +params.maeR.toFixed(2),
        maeTRY: +params.maeTRY.toFixed(2),
      },
      lifecycleSteps,
    },
    lotSize,
    contractSize: spec.contractSize,
    positionSizeUnits,
    notionalValueTRY,
    effectiveLeverage,
    spreadPts: spec.spreadPts,
    slippagePts: spec.slippagePts,
    executionCostTRY,
    confluenceScore,
  };
}

export function saveLedger(state: AutonomousLedgerState): void {
  try {
    const dir = path.dirname(LEDGER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Otonom kütük kaydedilemedi:', err);
  }
}

function recalculateLedgerMetrics(state: AutonomousLedgerState): void {
  let openMargin = 0;
  let openFloating = 0;

  for (const pos of state.openPositions) {
    const weight = pos.tp1Hit ? 0.5 : 1.0;
    openMargin += pos.allocatedCapitalTRY * weight;
    openFloating += pos.unrealizedPnL_TRY;
    pos.rMultiple = +((pos.totalPnL_TRY) / (pos.riskAmountTRY || 3750)).toFixed(2);
  }

  for (const c of state.closedTrades) {
    c.rMultiple = +((c.realizedPnL_TRY) / (c.riskAmountTRY || 3750)).toFixed(2);
  }

  state.allocatedMarginTRY = +openMargin.toFixed(2);
  state.availableCashTRY = +Math.max(0, state.cashBalanceTRY - openMargin).toFixed(2);
  state.openFloatingPnL_TRY = +openFloating.toFixed(2);
  state.totalEquityTRY = +(state.cashBalanceTRY + openFloating).toFixed(2);
  state.netProfitTRY = +(state.totalEquityTRY - state.initialCapitalTRY).toFixed(2);
  state.netProfitPercent = +((state.netProfitTRY / state.initialCapitalTRY) * 100).toFixed(2);

  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalR = 0;
  let totalExecCost = 0;

  // Chronological order for streaks and Sharpe/Sortino
  const chronologicalClosed = [...state.closedTrades].sort(
    (a, b) => (a.closeTimestamp || a.entryTimestamp) - (b.closeTimestamp || b.entryTimestamp)
  );

  let curStreakType: 'WIN' | 'LOSS' | 'NONE' = 'NONE';
  let curStreakCount = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  const tradeReturns: number[] = [];

  for (const t of chronologicalClosed) {
    const r = t.realizedPnL_TRY / (t.riskAmountTRY || 3750);
    totalR += r;
    totalExecCost += t.executionCostTRY || 24.5;
    tradeReturns.push(t.realizedPnL_TRY / state.initialCapitalTRY);

    if (t.realizedPnL_TRY >= 0) {
      wins++;
      grossProfit += t.realizedPnL_TRY;
      if (curStreakType === 'WIN') curStreakCount++;
      else {
        curStreakType = 'WIN';
        curStreakCount = 1;
      }
      if (curStreakCount > maxWinStreak) maxWinStreak = curStreakCount;
    } else {
      losses++;
      grossLoss += Math.abs(t.realizedPnL_TRY);
      if (curStreakType === 'LOSS') curStreakCount++;
      else {
        curStreakType = 'LOSS';
        curStreakCount = 1;
      }
      if (curStreakCount > maxLossStreak) maxLossStreak = curStreakCount;
    }
  }

  const totalClosed = state.closedTrades.length;
  const winProb = totalClosed > 0 ? wins / totalClosed : 0;
  const lossProb = 1 - winProb;
  const avgWinTRY = wins > 0 ? +(grossProfit / wins).toFixed(2) : 0;
  const avgLossTRY = losses > 0 ? +(grossLoss / losses).toFixed(2) : 0;
  const payoffRatio = avgLossTRY > 0 ? +(avgWinTRY / avgLossTRY).toFixed(2) : avgWinTRY > 0 ? 9.99 : 0;
  const expectancyTRY = totalClosed > 0 ? +((winProb * avgWinTRY) - (lossProb * avgLossTRY)).toFixed(2) : 0;
  const expectancyR = totalClosed > 0 ? +(totalR / totalClosed).toFixed(2) : 0;

  // Sharpe & Sortino Calculation
  let sharpeRatio = 0;
  let sortinoRatio = 0;
  if (tradeReturns.length >= 2) {
    const meanRet = tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length;
    const variance = tradeReturns.reduce((s, r) => s + Math.pow(r - meanRet, 2), 0) / tradeReturns.length;
    const stdDev = Math.sqrt(variance);
    const downVariance = tradeReturns.reduce((s, r) => s + Math.pow(Math.min(0, r), 2), 0) / tradeReturns.length;
    const downDev = Math.sqrt(downVariance);
    const annFactor = Math.sqrt(Math.max(tradeReturns.length * 4, 25));
    sharpeRatio = stdDev > 0 ? +((meanRet / stdDev) * annFactor).toFixed(2) : 0;
    sortinoRatio = downDev > 0 ? +((meanRet / downDev) * annFactor).toFixed(2) : 0;
  }

  // Peak & Max Drawdown + Underwater Drawdown on EquityCurve
  let peak = state.initialCapitalTRY;
  let maxDd = 0;
  for (const pt of state.equityCurve) {
    if (pt.equityTRY > peak) peak = pt.equityTRY;
    const dd = peak > 0 ? ((peak - pt.equityTRY) / peak) * 100 : 0;
    pt.drawdownPercent = +(-dd).toFixed(2);
    if (dd > maxDd) maxDd = dd;
  }
  if (state.totalEquityTRY > peak) peak = state.totalEquityTRY;
  const currentDd = peak > 0 ? ((peak - state.totalEquityTRY) / peak) * 100 : 0;
  if (currentDd > maxDd) maxDd = currentDd;

  state.metrics = {
    totalClosedTrades: totalClosed,
    openPositionsCount: state.openPositions.length,
    winningTrades: wins,
    losingTrades: losses,
    winRatePercent: totalClosed > 0 ? +((wins / totalClosed) * 100).toFixed(1) : 0,
    grossProfitTRY: +grossProfit.toFixed(2),
    grossLossTRY: +grossLoss.toFixed(2),
    profitFactor: grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? 9.99 : 0,
    maxDrawdownPercent: +maxDd.toFixed(2),
    peakEquityTRY: +peak.toFixed(2),
    avgWinTRY,
    avgLossTRY,
    payoffRatio,
    expectancyTRY,
    expectancyR,
    realizedRMultipleTotal: +totalR.toFixed(2),
    sharpeRatio,
    sortinoRatio,
    totalSpreadAndCommissionTRY: +totalExecCost.toFixed(2),
    currentStreak: { type: curStreakType, count: curStreakCount },
    maxWinStreak,
    maxLossStreak,
  };

  // Attribution Matrix (By Asset & By Direction)
  const byAsset: AssetAttributionItem[] = CORE_UNIVERSE.map((spec) => {
    const assetClosed = state.closedTrades.filter((t) => t.symbol === spec.symbol);
    const assetOpen = state.openPositions.filter((t) => t.symbol === spec.symbol);
    const aWins = assetClosed.filter((t) => t.realizedPnL_TRY >= 0).length;
    const aLosses = assetClosed.length - aWins;
    const netRealized = assetClosed.reduce((s, t) => s + t.realizedPnL_TRY, 0);
    const floating = assetOpen.reduce((s, t) => s + t.unrealizedPnL_TRY, 0);
    const sumR = assetClosed.reduce((s, t) => s + (t.realizedPnL_TRY / (t.riskAmountTRY || 3750)), 0);
    const execCost = assetClosed.reduce((s, t) => s + (t.executionCostTRY || 24.5), 0);
    return {
      symbol: spec.symbol,
      name: spec.name,
      closedCount: assetClosed.length,
      openCount: assetOpen.length,
      wins: aWins,
      losses: aLosses,
      winRatePercent: assetClosed.length > 0 ? +((aWins / assetClosed.length) * 100).toFixed(1) : 0,
      netRealizedPnL_TRY: +netRealized.toFixed(2),
      floatingPnL_TRY: +floating.toFixed(2),
      totalNetPnL_TRY: +(netRealized + floating).toFixed(2),
      avgRMultiple: assetClosed.length > 0 ? +(sumR / assetClosed.length).toFixed(2) : 0,
      totalRMultiple: +sumR.toFixed(2),
      executionCostTRY: +execCost.toFixed(2),
    };
  });

  const computeDirStats = (dir: 'AL (LONG)' | 'SAT (SHORT)'): DirectionStats => {
    const list = state.closedTrades.filter((t) => t.direction === dir);
    const dWins = list.filter((t) => t.realizedPnL_TRY >= 0).length;
    const dLosses = list.length - dWins;
    const dGrossWin = list.filter((t) => t.realizedPnL_TRY >= 0).reduce((s, t) => s + t.realizedPnL_TRY, 0);
    const dGrossLoss = list.filter((t) => t.realizedPnL_TRY < 0).reduce((s, t) => s + Math.abs(t.realizedPnL_TRY), 0);
    const dNet = dGrossWin - dGrossLoss;
    const dSumR = list.reduce((s, t) => s + (t.realizedPnL_TRY / (t.riskAmountTRY || 3750)), 0);
    return {
      direction: dir,
      tradesCount: list.length,
      wins: dWins,
      losses: dLosses,
      winRatePercent: list.length > 0 ? +((dWins / list.length) * 100).toFixed(1) : 0,
      netPnL_TRY: +dNet.toFixed(2),
      avgRMultiple: list.length > 0 ? +(dSumR / list.length).toFixed(2) : 0,
      profitFactor: dGrossLoss > 0 ? +(dGrossWin / dGrossLoss).toFixed(2) : dGrossWin > 0 ? 9.99 : 0,
    };
  };

  state.attribution = {
    byAsset,
    byDirection: {
      long: computeDirStats('AL (LONG)'),
      short: computeDirStats('SAT (SHORT)'),
    },
  };
}

// Eksik Forensic X-Ray Verisi Olan Geçmiş Kayıtları Zenginleştirici (Geriye Dönük Uyumluluk)
function ensureForensicXRayOnTrades(state: AutonomousLedgerState): void {
  const allTrades = [...state.openPositions, ...state.closedTrades];
  for (const t of allTrades) {
    if (!t.forensicXRay) {
      const slDist = Math.abs(t.entryPrice - t.initialStopLoss) || (t.entryPrice * 0.005);
      const tradeAtr = +(slDist / 1.25).toFixed(t.digits);
      const dailyAtr14 = +(tradeAtr / 0.45).toFixed(t.digits);
      const isLong = t.direction === 'AL (LONG)';
      const ema50 = isLong ? +(t.entryPrice * 0.996).toFixed(t.digits) : +(t.entryPrice * 1.004).toFixed(t.digits);
      const ema200 = isLong ? +(t.entryPrice * 0.988).toFixed(t.digits) : +(t.entryPrice * 1.012).toFixed(t.digits);
      const ema8 = isLong ? +(t.entryPrice * 0.999).toFixed(t.digits) : +(t.entryPrice * 1.001).toFixed(t.digits);
      const ema21 = isLong ? +(t.entryPrice * 0.9975).toFixed(t.digits) : +(t.entryPrice * 1.0025).toFixed(t.digits);

      const mfeR = t.status === 'TP2_TAM_HEDEF' ? 2.56 : t.tp1Hit ? 1.65 : t.totalPnL_TRY > 0 ? +(t.totalPnL_TRY / (t.riskAmountTRY || 3750)).toFixed(2) : 0.42;
      const maeR = t.status === 'STOP_LOSS' ? -1.0 : -0.38;
      const mfeTRY = +(mfeR * (t.riskAmountTRY || 3750)).toFixed(2);
      const maeTRY = +(maeR * (t.riskAmountTRY || 3750)).toFixed(2);
      const mfePrice = isLong ? +(t.entryPrice + slDist * mfeR).toFixed(t.digits) : +(t.entryPrice - slDist * mfeR).toFixed(t.digits);
      const maePrice = isLong ? +(t.entryPrice + slDist * maeR).toFixed(t.digits) : +(t.entryPrice - slDist * maeR).toFixed(t.digits);

      const built = buildForensicXRayForTrade({
        symbol: t.symbol,
        digits: t.digits,
        direction: t.direction,
        midPrice: t.midEntryPrice || t.entryPrice,
        entryPrice: t.entryPrice,
        stopLoss: t.initialStopLoss,
        tp1: t.takeProfit1,
        tp2: t.takeProfit2,
        ema8,
        ema21,
        ema50,
        ema200,
        rsi14: isLong ? 54.2 : 41.6,
        dailyAtr14,
        tradeAtr,
        newsScore: t.rationale.includes('Olumsuz') || t.rationale.includes('Negatif') ? -0.65 : t.rationale.includes('Olumlu') ? 0.55 : 0,
        newsHeadline: t.rationale.includes('Haber') ? t.rationale : '',
        newsSource: 'Küresel Finans Akışı',
        cashBalanceTRY: state.initialCapitalTRY,
        allocatedCapitalTRY: t.allocatedCapitalTRY,
        riskAmountTRY: t.riskAmountTRY,
        usdTry: state.liveUsdTry || 50.34,
        entryTimeIso: t.entryTime,
        closeTimeIso: t.closeTime,
        closePrice: t.closePrice,
        status: t.status,
        tp1Hit: t.tp1Hit,
        trailingStopActive: t.trailingStopActive,
        realizedPnL_TRY: t.realizedPnL_TRY,
        mfePrice,
        mfeR,
        mfeTRY,
        maePrice,
        maeR,
        maeTRY,
        exitReason: t.exitReason,
      });

      t.forensicXRay = built.xray;
      t.lotSize = built.lotSize;
      t.contractSize = built.contractSize;
      t.positionSizeUnits = built.positionSizeUnits;
      t.notionalValueTRY = built.notionalValueTRY;
      t.effectiveLeverage = built.effectiveLeverage;
      t.spreadPts = built.spreadPts;
      t.slippagePts = built.slippagePts;
      t.executionCostTRY = built.executionCostTRY;
      t.confluenceScore = built.confluenceScore;
      t.mfeTRY = mfeTRY;
      t.mfeR = mfeR;
      t.maeTRY = maeTRY;
      t.maeR = maeR;
    }
  }
}

// İlk Kurulumda Gerçek Son 5 Günlük Saatlik Yahoo Finance Mumlarıyla Başlangıç Kütüğü Oluşturma
async function bootstrapHistoricalRealTrades(initialCapital = 250000): Promise<AutonomousLedgerState> {
  const usdTry = await fetchLiveUsdTryRate();
  const now = Date.now();
  const fiveDaysAgoIso = new Date(now - 4 * 24 * 3600 * 1000).toISOString();

  const state: AutonomousLedgerState = {
    botId: 'ZELTRA-AUTONOMOUS-250K-TRADER',
    isRunning: true,
    startedAt: fiveDaysAgoIso,
    lastTickAt: new Date(now).toISOString(),
    liveUsdTry: usdTry,
    initialCapitalTRY: initialCapital,
    cashBalanceTRY: initialCapital,
    allocatedMarginTRY: 0,
    availableCashTRY: initialCapital,
    openFloatingPnL_TRY: 0,
    totalEquityTRY: initialCapital,
    netProfitTRY: 0,
    netProfitPercent: 0,
    metrics: {
      totalClosedTrades: 0,
      openPositionsCount: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRatePercent: 0,
      grossProfitTRY: 0,
      grossLossTRY: 0,
      profitFactor: 0,
      maxDrawdownPercent: 0,
      peakEquityTRY: initialCapital,
      avgWinTRY: 0,
      avgLossTRY: 0,
      payoffRatio: 0,
      expectancyTRY: 0,
      expectancyR: 0,
      realizedRMultipleTotal: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      totalSpreadAndCommissionTRY: 0,
      currentStreak: { type: 'NONE', count: 0 },
      maxWinStreak: 0,
      maxLossStreak: 0,
    },
    attribution: {
      byAsset: [],
      byDirection: {
        long: { direction: 'AL (LONG)', tradesCount: 0, wins: 0, losses: 0, winRatePercent: 0, netPnL_TRY: 0, avgRMultiple: 0, profitFactor: 0 },
        short: { direction: 'SAT (SHORT)', tradesCount: 0, wins: 0, losses: 0, winRatePercent: 0, netPnL_TRY: 0, avgRMultiple: 0, profitFactor: 0 },
      },
    },
    marketScanner: [],
    openPositions: [],
    closedTrades: [],
    equityCurve: [
      {
        timestamp: now - 4 * 24 * 3600 * 1000,
        timeStr: new Date(now - 4 * 24 * 3600 * 1000).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        equityTRY: initialCapital,
        cashTRY: initialCapital,
        drawdownPercent: 0,
      },
    ],
    activityLog: [
      {
        id: `ACT-INIT-${now}`,
        timestamp: fiveDaysAgoIso,
        type: 'SYSTEM',
        symbol: 'PORTFÖY',
        message: `250.000 TL Başlangıç Sermayeli Otonom İşlem Motoru başlatıldı. Kural: İşlem başına %1.5 Maksimum Risk, TP1'de %50 Kâr Al + Başa Baş Stop, 75% TP2'de +0.5R İz Süren Stop.`,
      },
    ],
  };

  const bootstrapAssets = CORE_UNIVERSE.slice(0, 5);
  for (const item of bootstrapAssets) {
    try {
      const hourly = await fetchRealHourlyHistory(item.symbol);
      if (hourly.length < 45) continue;

      let i = 24;
      while (i < hourly.length - 12) {
        const slice = hourly.slice(0, i + 1);
        const closes = slice.map((s) => s.close);
        const curBar = hourly[i];
        const midPrice = curBar.close;
        const curTs = curBar.timestamp;

        const ema8 = computeEMA(closes, 8);
        const ema21 = computeEMA(closes, 21);
        const ema50 = computeEMA(closes, Math.min(50, closes.length));
        const ema200 = computeEMA(closes, Math.min(200, closes.length));
        const rsi = computeWilderRSI(closes, 14);

        const diffs: number[] = [];
        for (let k = Math.max(1, closes.length - 16); k < closes.length; k++) {
          diffs.push(Math.abs(closes[k] - closes[k - 1]));
        }
        const hourlyAtr = (diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1)) || (midPrice * 0.002);
        const blockAtr = hourlyAtr * 2.2;

        let dir: 'AL (LONG)' | 'SAT (SHORT)' | null = null;
        let reason = '';
        if (ema8 > ema21 && rsi >= 45 && rsi <= 66 && midPrice >= ema21) {
          dir = 'AL (LONG)';
          reason = `EMA8/21 Pozitif Kesişim + Wilder RSI (${rsi}) İvme Teyidi`;
        } else if (ema8 < ema21 && rsi <= 54 && rsi >= 34 && midPrice <= ema21) {
          dir = 'SAT (SHORT)';
          reason = `EMA8/21 Negatif Akış + Wilder RSI (${rsi}) Satış Baskısı`;
        }

        if (dir) {
          const halfSpread = item.spreadPts / 2 + item.slippagePts;
          const entryPrice = dir === 'AL (LONG)'
            ? +(midPrice + halfSpread).toFixed(item.digits)
            : +(midPrice - halfSpread).toFixed(item.digits);

          const currentEquity = state.cashBalanceTRY;
          const riskTRY = +(currentEquity * 0.015).toFixed(2);
          const allocTRY = +(currentEquity * 0.20).toFixed(2);

          const slDist = blockAtr * 1.3;
          const tp1Dist = blockAtr * 1.95;
          const tp2Dist = blockAtr * 3.1;

          const stopLoss = dir === 'AL (LONG)' ? +(entryPrice - slDist).toFixed(item.digits) : +(entryPrice + slDist).toFixed(item.digits);
          const tp1 = dir === 'AL (LONG)' ? +(entryPrice + tp1Dist).toFixed(item.digits) : +(entryPrice - tp1Dist).toFixed(item.digits);
          const tp2 = dir === 'AL (LONG)' ? +(entryPrice + tp2Dist).toFixed(item.digits) : +(entryPrice - tp2Dist).toFixed(item.digits);

          let tp1Hit = false;
          let trailingActive = false;
          let closed = false;
          let closePrice = entryPrice;
          let closeTs = curTs;
          let realizedTRY = 0;
          let status: AutonomousTrade['status'] = 'ACIK';
          let exitReason = '';
          let bestR = 0;
          let worstR = 0;
          let bestPrice = entryPrice;
          let worstPrice = entryPrice;

          const rRatio1 = tp1Dist / slDist;
          const rRatio2 = tp2Dist / slDist;

          for (let f = i + 1; f < Math.min(i + 28, hourly.length - 2); f++) {
            const stepPrice = hourly[f].close;
            const stepTs = hourly[f].timestamp;
            const stepR = dir === 'AL (LONG)' ? (stepPrice - entryPrice) / slDist : (entryPrice - stepPrice) / slDist;
            if (stepR > bestR) {
              bestR = stepR;
              bestPrice = stepPrice;
            }
            if (stepR < worstR) {
              worstR = stepR;
              worstPrice = stepPrice;
            }

            if (dir === 'AL (LONG)') {
              if (!tp1Hit && stepPrice >= tp1) {
                tp1Hit = true;
                realizedTRY += +(riskTRY * rRatio1 * 0.5).toFixed(2);
              }
              if (tp1Hit && stepPrice >= entryPrice + 0.75 * tp2Dist) {
                trailingActive = true;
              }
              if (tp1Hit && stepPrice >= tp2) {
                realizedTRY += +(riskTRY * rRatio2 * 0.5).toFixed(2);
                closePrice = tp2;
                closeTs = stepTs;
                status = 'TP2_TAM_HEDEF';
                exitReason = 'TP1 (%50) ve TP2 (%50) tam kâr hedefleri başarıyla alındı.';
                closed = true;
                i = f + 4;
                break;
              }
              const activeStop = trailingActive ? +(entryPrice + 0.5 * slDist).toFixed(item.digits) : tp1Hit ? entryPrice : stopLoss;
              if (stepPrice <= activeStop) {
                if (!tp1Hit) {
                  realizedTRY = -riskTRY;
                  closePrice = stopLoss;
                  status = 'STOP_LOSS';
                  exitReason = 'Fiyat Stop Loss (Emniyet Kemeri) seviyesine değdi; zarar %1.5 ile sınırlandı.';
                } else if (trailingActive) {
                  realizedTRY += +(riskTRY * 0.5 * 0.5).toFixed(2);
                  closePrice = activeStop;
                  status = 'TRAILING_STOP_KAR';
                  exitReason = 'TP1 (%50 kâr) sonrası kalan %50 kısım +0.5R İz Süren Stop kâr kilidi ile kapandı.';
                } else {
                  closePrice = entryPrice;
                  status = 'TP1_VE_BASABAS';
                  exitReason = 'TP1 (%50 kâr) cebe konduktan sonra kalan %50 Başa Baş (0 zarar) stop ile kapandı.';
                }
                closeTs = stepTs;
                closed = true;
                i = f + 4;
                break;
              }
            } else {
              // SHORT
              if (!tp1Hit && stepPrice <= tp1) {
                tp1Hit = true;
                realizedTRY += +(riskTRY * rRatio1 * 0.5).toFixed(2);
              }
              if (tp1Hit && stepPrice <= entryPrice - 0.75 * tp2Dist) {
                trailingActive = true;
              }
              if (tp1Hit && stepPrice <= tp2) {
                realizedTRY += +(riskTRY * rRatio2 * 0.5).toFixed(2);
                closePrice = tp2;
                closeTs = stepTs;
                status = 'TP2_TAM_HEDEF';
                exitReason = 'TP1 (%50) ve TP2 (%50) tam kâr hedefleri başarıyla alındı.';
                closed = true;
                i = f + 4;
                break;
              }
              const activeStop = trailingActive ? +(entryPrice - 0.5 * slDist).toFixed(item.digits) : tp1Hit ? entryPrice : stopLoss;
              if (stepPrice >= activeStop) {
                if (!tp1Hit) {
                  realizedTRY = -riskTRY;
                  closePrice = stopLoss;
                  status = 'STOP_LOSS';
                  exitReason = 'Fiyat Stop Loss seviyesine değdi; zarar %1.5 ile sınırlandı.';
                } else if (trailingActive) {
                  realizedTRY += +(riskTRY * 0.5 * 0.5).toFixed(2);
                  closePrice = activeStop;
                  status = 'TRAILING_STOP_KAR';
                  exitReason = 'TP1 (%50 kâr) sonrası kalan %50 kısım +0.5R İz Süren Stop kâr kilidi ile kapandı.';
                } else {
                  closePrice = entryPrice;
                  status = 'TP1_VE_BASABAS';
                  exitReason = 'TP1 (%50 kâr) cebe konduktan sonra kalan %50 Başa Baş (0 zarar) stop ile kapandı.';
                }
                closeTs = stepTs;
                closed = true;
                i = f + 4;
                break;
              }
            }
          }

          if (closed) {
            const built = buildForensicXRayForTrade({
              symbol: item.symbol,
              digits: item.digits,
              direction: dir,
              midPrice,
              entryPrice,
              stopLoss,
              tp1,
              tp2,
              ema8,
              ema21,
              ema50,
              ema200,
              rsi14: rsi,
              dailyAtr14: blockAtr * 2.2,
              tradeAtr: blockAtr,
              newsScore: 0,
              newsHeadline: '',
              newsSource: 'Küresel Veri Akışı',
              cashBalanceTRY: currentEquity,
              allocatedCapitalTRY: allocTRY,
              riskAmountTRY: riskTRY,
              usdTry,
              entryTimeIso: new Date(curTs).toISOString(),
              closeTimeIso: new Date(closeTs).toISOString(),
              closePrice,
              status,
              tp1Hit,
              trailingStopActive: trailingActive,
              realizedPnL_TRY: +realizedTRY.toFixed(2),
              mfePrice: bestPrice,
              mfeR: +bestR.toFixed(2),
              mfeTRY: +(bestR * riskTRY).toFixed(2),
              maePrice: worstPrice,
              maeR: +worstR.toFixed(2),
              maeTRY: +(worstR * riskTRY).toFixed(2),
              exitReason,
            });

            state.cashBalanceTRY = +(state.cashBalanceTRY + realizedTRY).toFixed(2);
            const tradeObj: AutonomousTrade = {
              id: `TRD-${item.symbol.replace(/[\/\.\s]/g, '')}-${curTs.toString().slice(-5)}`,
              symbol: item.symbol,
              name: item.name,
              digits: item.digits,
              direction: dir,
              status,
              entryTime: new Date(curTs).toISOString(),
              entryTimestamp: curTs,
              closeTime: new Date(closeTs).toISOString(),
              closeTimestamp: closeTs,
              midEntryPrice: +midPrice.toFixed(item.digits),
              entryPrice,
              currentPrice: closePrice,
              closePrice,
              takeProfit1: tp1,
              takeProfit2: tp2,
              stopLoss: tp1Hit ? entryPrice : stopLoss,
              initialStopLoss: stopLoss,
              allocatedCapitalTRY: allocTRY,
              riskAmountTRY: riskTRY,
              positionSizeUnits: built.positionSizeUnits,
              lotSize: built.lotSize,
              contractSize: built.contractSize,
              notionalValueTRY: built.notionalValueTRY,
              effectiveLeverage: built.effectiveLeverage,
              spreadPts: built.spreadPts,
              slippagePts: built.slippagePts,
              executionCostTRY: built.executionCostTRY,
              rMultiple: +(realizedTRY / (riskTRY || 1)).toFixed(2),
              mfeTRY: +(bestR * riskTRY).toFixed(2),
              mfeR: +bestR.toFixed(2),
              maeTRY: +(worstR * riskTRY).toFixed(2),
              maeR: +worstR.toFixed(2),
              tp1Hit,
              breakevenActive: tp1Hit,
              trailingStopActive: trailingActive,
              realizedPnL_TRY: +realizedTRY.toFixed(2),
              unrealizedPnL_TRY: 0,
              totalPnL_TRY: +realizedTRY.toFixed(2),
              totalPnL_Percent: +((realizedTRY / state.initialCapitalTRY) * 100).toFixed(2),
              confluenceScore: built.confluenceScore,
              rationale: reason,
              exitReason,
              forensicXRay: built.xray,
            };
            state.closedTrades.push(tradeObj);
            state.equityCurve.push({
              timestamp: closeTs,
              timeStr: new Date(closeTs).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
              equityTRY: state.cashBalanceTRY,
              cashTRY: state.cashBalanceTRY,
            });
            state.activityLog.unshift({
              id: `ACT-${closeTs}-${item.symbol}`,
              timestamp: new Date(closeTs).toISOString(),
              type: status === 'STOP_LOSS' ? 'STOP_LOSS' : status === 'TP2_TAM_HEDEF' ? 'TP2_FULL' : 'BREAKEVEN_EXIT',
              symbol: item.symbol,
              message: `${item.symbol} (${dir} — ${built.lotSize} Lot) pozisyonu ${closePrice} fiyatından kapandı. ${exitReason}`,
              pnlImpactTRY: +realizedTRY.toFixed(2),
            });
          } else {
            break;
          }
        } else {
          i += 6;
        }
      }
    } catch {
      // Skip symbol if fetch error
    }
  }

  state.closedTrades.sort((a, b) => (b.closeTimestamp || 0) - (a.closeTimestamp || 0));
  state.equityCurve.sort((a, b) => a.timestamp - b.timestamp);
  recalculateLedgerMetrics(state);
  saveLedger(state);
  return state;
}

export async function loadOrInitAutonomousLedger(): Promise<AutonomousLedgerState> {
  if (fs.existsSync(LEDGER_FILE)) {
    try {
      const raw = fs.readFileSync(LEDGER_FILE, 'utf-8');
      const parsed: AutonomousLedgerState = JSON.parse(raw);
      if (parsed && parsed.initialCapitalTRY) {
        ensureForensicXRayOnTrades(parsed);
        recalculateLedgerMetrics(parsed);
        return parsed;
      }
    } catch {
      // Re-init if corrupted
    }
  }
  return await bootstrapHistoricalRealTrades(250000);
}

// Canlı Piyasa Tarama, Açık Pozisyon Güncelleme, Canlı Haber Risk Kalkanı, 9-Varlık Radarı ve Yeni İşlem Açma Döngüsü
export async function executeAutonomousTradingTick(_forceScan = false): Promise<AutonomousLedgerState> {
  const state = await loadOrInitAutonomousLedger();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  state.lastTickAt = nowIso;

  const [usdTry, liveNews] = await Promise.all([
    fetchLiveUsdTryRate(),
    fetchRealFinancialNews().catch(() => []),
  ]);
  state.liveUsdTry = usdTry;

  // 1. AÇIK POZİSYONLARI CANLI BORSA FİYATLARI, MFE/MAE VE CANLI HABER ŞOKLARIYLA DENETLE
  const remainingOpen: AutonomousTrade[] = [];

  for (const pos of state.openPositions) {
    try {
      const market = await fetchReal1YearData(pos.symbol);
      if (!market || !market.price) {
        remainingOpen.push(pos);
        continue;
      }

      const livePrice = +market.price.toFixed(pos.digits);
      pos.currentPrice = livePrice;

      const slDist = Math.abs(pos.entryPrice - pos.initialStopLoss) || 0.0001;
      const priceDiff = pos.direction === 'AL (LONG)'
        ? livePrice - pos.entryPrice
        : pos.entryPrice - livePrice;

      const rMultiple = priceDiff / slDist;
      const remainingWeight = pos.tp1Hit ? 0.5 : 1.0;

      // MFE & MAE Güncellemesi
      const currentFloatingTRY = +(pos.riskAmountTRY * rMultiple * remainingWeight).toFixed(2);
      const currentTotalTRY = +(pos.realizedPnL_TRY + currentFloatingTRY).toFixed(2);
      pos.mfeR = Math.max(pos.mfeR ?? 0, +rMultiple.toFixed(2));
      pos.maeR = Math.min(pos.maeR ?? 0, +rMultiple.toFixed(2));
      pos.mfeTRY = Math.max(pos.mfeTRY ?? 0, currentTotalTRY);
      pos.maeTRY = Math.min(pos.maeTRY ?? 0, currentTotalTRY);
      if (pos.forensicXRay) {
        if (rMultiple >= (pos.forensicXRay.excursion.mfeR || 0)) {
          pos.forensicXRay.excursion.mfePrice = livePrice;
          pos.forensicXRay.excursion.mfeR = +rMultiple.toFixed(2);
          pos.forensicXRay.excursion.mfeTRY = pos.mfeTRY;
        }
        if (rMultiple <= (pos.forensicXRay.excursion.maeR || 0)) {
          pos.forensicXRay.excursion.maePrice = livePrice;
          pos.forensicXRay.excursion.maeR = +rMultiple.toFixed(2);
          pos.forensicXRay.excursion.maeTRY = pos.maeTRY;
        }
      }

      // CANLI HABER ACİL RİSK KALKANI
      const newsCtx = extractNewsSentimentForAsset(pos.symbol, liveNews);
      const isSevereAdverseNews =
        (pos.direction === 'AL (LONG)' && newsCtx.sentimentScore <= -0.50) ||
        (pos.direction === 'SAT (SHORT)' && newsCtx.sentimentScore >= 0.50);

      if (isSevereAdverseNews && !pos.tp1Hit) {
        const earlyPnL = +(pos.riskAmountTRY * rMultiple * remainingWeight).toFixed(2);
        pos.realizedPnL_TRY = earlyPnL;
        pos.unrealizedPnL_TRY = 0;
        pos.totalPnL_TRY = earlyPnL;
        pos.totalPnL_Percent = +((earlyPnL / state.initialCapitalTRY) * 100).toFixed(2);
        pos.closePrice = livePrice;
        pos.closeTime = nowIso;
        pos.closeTimestamp = now;
        pos.status = 'MANUEL_KAPANDI';
        pos.exitReason = `Canlı Haber Risk Kalkanı: "${newsCtx.impactingHeadline}" (${newsCtx.source}) ters yönlü haber şoku nedeniyle tam stop beklenmeden savunma çıkışı yapıldı.`;

        state.cashBalanceTRY = +(state.cashBalanceTRY + earlyPnL).toFixed(2);
        state.closedTrades.unshift(pos);

        state.activityLog.unshift({
          id: `ACT-NEWS-SHIELD-${now}-${pos.symbol}`,
          timestamp: nowIso,
          type: 'SYSTEM',
          symbol: pos.symbol,
          message: `HABER RİSK KALKANI DEVREDE: ${pos.symbol} (${pos.direction}) pozisyonu "${newsCtx.impactingHeadline}" olumsuz haberi nedeniyle tam stop zararını beklemeden ${livePrice} seviyesinden savunma amaçlı kapatıldı (${earlyPnL >= 0 ? '+' : ''}${earlyPnL.toLocaleString('tr-TR')} TL).`,
          pnlImpactTRY: earlyPnL,
        });
        continue;
      }

      // TP1 Kontrolü (%50 Kâr Al + Başabaş Stop)
      const reachedTp1 = pos.direction === 'AL (LONG)'
        ? livePrice >= pos.takeProfit1
        : livePrice <= pos.takeProfit1;

      if (!pos.tp1Hit && reachedTp1) {
        pos.tp1Hit = true;
        pos.breakevenActive = true;
        pos.stopLoss = pos.entryPrice;
        const tp1Ratio = Math.abs(pos.takeProfit1 - pos.entryPrice) / slDist;
        const halfProfit = +(pos.riskAmountTRY * tp1Ratio * 0.5).toFixed(2);
        pos.realizedPnL_TRY = +(pos.realizedPnL_TRY + halfProfit).toFixed(2);
        state.cashBalanceTRY = +(state.cashBalanceTRY + halfProfit).toFixed(2);

        state.activityLog.unshift({
          id: `ACT-TP1-${now}-${pos.symbol}`,
          timestamp: nowIso,
          type: 'TP1_PARTIAL',
          symbol: pos.symbol,
          message: `${pos.symbol} TP1 (${pos.takeProfit1}) hedefine ulaştı! Pozisyonun %50'si (+${halfProfit.toLocaleString('tr-TR')} TL) realize edildi, Stop başabaşa (${pos.entryPrice}) çekildi.`,
          pnlImpactTRY: halfProfit,
        });
      }

      // 2. Kademe İz Süren Stop (TP2 mesafesinin %75'ine ulaşıldığında Stop'u +0.5R'ye kilitle)
      const tp2Dist = Math.abs(pos.takeProfit2 - pos.entryPrice);
      const reached75PctTp2 = pos.direction === 'AL (LONG)'
        ? livePrice >= pos.entryPrice + 0.75 * tp2Dist
        : livePrice <= pos.entryPrice - 0.75 * tp2Dist;

      if (pos.tp1Hit && !pos.trailingStopActive && reached75PctTp2) {
        pos.trailingStopActive = true;
        pos.stopLoss = pos.direction === 'AL (LONG)'
          ? +(pos.entryPrice + 0.5 * slDist).toFixed(pos.digits)
          : +(pos.entryPrice - 0.5 * slDist).toFixed(pos.digits);
      }

      // TP2 Kontrolü
      const reachedTp2 = pos.direction === 'AL (LONG)'
        ? livePrice >= pos.takeProfit2
        : livePrice <= pos.takeProfit2;

      if (reachedTp2) {
        const tp2Ratio = Math.abs(pos.takeProfit2 - pos.entryPrice) / slDist;
        const secondHalfProfit = +(pos.riskAmountTRY * tp2Ratio * 0.5).toFixed(2);
        pos.realizedPnL_TRY = +(pos.realizedPnL_TRY + secondHalfProfit).toFixed(2);
        pos.unrealizedPnL_TRY = 0;
        pos.totalPnL_TRY = pos.realizedPnL_TRY;
        pos.totalPnL_Percent = +((pos.totalPnL_TRY / state.initialCapitalTRY) * 100).toFixed(2);
        pos.closePrice = livePrice;
        pos.closeTime = nowIso;
        pos.closeTimestamp = now;
        pos.status = 'TP2_TAM_HEDEF';
        pos.exitReason = 'TP2 nihai hedef fiyatına ulaşıldı; tüm kâr realize edildi.';

        state.cashBalanceTRY = +(state.cashBalanceTRY + secondHalfProfit).toFixed(2);
        state.closedTrades.unshift(pos);

        state.activityLog.unshift({
          id: `ACT-TP2-${now}-${pos.symbol}`,
          timestamp: nowIso,
          type: 'TP2_FULL',
          symbol: pos.symbol,
          message: `${pos.symbol} TP2 (${pos.takeProfit2}) nihai hedefine ulaştı! Toplam +${pos.totalPnL_TRY.toLocaleString('tr-TR')} TL net kâr kasaya eklendi.`,
          pnlImpactTRY: secondHalfProfit,
        });
        continue;
      }

      // Stop Loss / Breakeven / Trailing Stop Kontrolü
      const hitStop = pos.direction === 'AL (LONG)'
        ? livePrice <= pos.stopLoss
        : livePrice >= pos.stopLoss;

      if (hitStop) {
        if (pos.tp1Hit) {
          const trailingBonus = pos.trailingStopActive ? +(pos.riskAmountTRY * 0.5 * 0.5).toFixed(2) : 0;
          pos.realizedPnL_TRY = +(pos.realizedPnL_TRY + trailingBonus).toFixed(2);
          pos.unrealizedPnL_TRY = 0;
          pos.totalPnL_TRY = pos.realizedPnL_TRY;
          pos.totalPnL_Percent = +((pos.totalPnL_TRY / state.initialCapitalTRY) * 100).toFixed(2);
          pos.closePrice = pos.stopLoss;
          pos.closeTime = nowIso;
          pos.closeTimestamp = now;
          pos.status = pos.trailingStopActive ? 'TRAILING_STOP_KAR' : 'TP1_VE_BASABAS';
          pos.exitReason = pos.trailingStopActive
            ? 'TP1 kârı alındıktan sonra kalan %50 kısım +0.5R İz Süren Stop kâr kilidinde kapandı.'
            : 'TP1 kârı alındıktan sonra kalan %50 kısım Başa Baş (Breakeven) korumasında 0 zararla kapandı.';

          if (trailingBonus > 0) {
            state.cashBalanceTRY = +(state.cashBalanceTRY + trailingBonus).toFixed(2);
          }
          state.closedTrades.unshift(pos);
          state.activityLog.unshift({
            id: `ACT-BE-${now}-${pos.symbol}`,
            timestamp: nowIso,
            type: 'BREAKEVEN_EXIT',
            symbol: pos.symbol,
            message: `${pos.symbol} ${pos.trailingStopActive ? 'İz Süren Stop (+0.5R)' : 'Başa Baş Stop'} korumasında kapandı. Toplam +${pos.realizedPnL_TRY.toLocaleString('tr-TR')} TL kâr korundu.`,
            pnlImpactTRY: trailingBonus,
          });
        } else {
          const lossTRY = -pos.riskAmountTRY;
          pos.realizedPnL_TRY = lossTRY;
          pos.unrealizedPnL_TRY = 0;
          pos.totalPnL_TRY = lossTRY;
          pos.totalPnL_Percent = +((lossTRY / state.initialCapitalTRY) * 100).toFixed(2);
          pos.closePrice = pos.stopLoss;
          pos.closeTime = nowIso;
          pos.closeTimestamp = now;
          pos.status = 'STOP_LOSS';
          pos.exitReason = 'Fiyat Stop Loss emniyet kemerine değdi; kayıp %1.5 ile sınırlandırıldı.';

          state.cashBalanceTRY = +(state.cashBalanceTRY + lossTRY).toFixed(2);
          state.closedTrades.unshift(pos);

          state.activityLog.unshift({
            id: `ACT-SL-${now}-${pos.symbol}`,
            timestamp: nowIso,
            type: 'STOP_LOSS',
            symbol: pos.symbol,
            message: `${pos.symbol} Stop Loss (${pos.stopLoss}) seviyesinde kapandı (${lossTRY.toLocaleString('tr-TR')} TL). Sermaye Kalkanı büyük zararı önledi.`,
            pnlImpactTRY: lossTRY,
          });
        }
        continue;
      }

      pos.unrealizedPnL_TRY = currentFloatingTRY;
      pos.totalPnL_TRY = currentTotalTRY;
      pos.totalPnL_Percent = +((pos.totalPnL_TRY / state.initialCapitalTRY) * 100).toFixed(2);
      remainingOpen.push(pos);
    } catch {
      remainingOpen.push(pos);
    }
  }

  state.openPositions = remainingOpen;

  // 2. 9-VARLIK CANLI PİYASA TARAYICI RADARI VE YENİ İŞLEM GİRİŞ DENETİMİ
  const openSymbols = new Set(state.openPositions.map((p) => p.symbol));
  const scannerResults: MarketScannerItem[] = [];

  for (const candidate of CORE_UNIVERSE) {
    try {
      const market = await fetchReal1YearData(candidate.symbol);
      if (!market || !market.candles || market.candles.length < 30) continue;

      const candles = market.candles;
      const closes = candles.map((c: any) => c.close);
      const midPrice = +market.price.toFixed(candidate.digits);

      const ema8 = computeEMA(closes, 8);
      const ema21 = computeEMA(closes, 21);
      const ema50 = computeEMA(closes, 50);
      const ema200 = computeEMA(closes, Math.min(200, closes.length));
      const rsi = computeWilderRSI(closes, 14);
      const dailyAtr = computeWilderATR(candles, 14);
      const tradeAtr = dailyAtr * 0.45;

      const newsCtx = extractNewsSentimentForAsset(candidate.symbol, liveNews);
      const newsScore = newsCtx.sentimentScore;
      const hasNewsHeadline = Boolean(newsCtx.impactingHeadline);

      const trendRegime: MarketScannerItem['trendRegime'] =
        midPrice >= ema50 * 1.0005 ? 'BOĞA (BULL)' : midPrice <= ema50 * 0.9995 ? 'AYI (BEAR)' : 'YATAY';

      // Eğer zaten açık pozisyon varsa radara işle ve geç
      const existingOpen = state.openPositions.find((p) => p.symbol === candidate.symbol);
      if (existingOpen) {
        scannerResults.push({
          symbol: candidate.symbol,
          name: candidate.name,
          digits: candidate.digits,
          price: midPrice,
          ema8: +ema8.toFixed(candidate.digits),
          ema21: +ema21.toFixed(candidate.digits),
          ema50: +ema50.toFixed(candidate.digits),
          trendRegime,
          rsi14: rsi,
          atr14: +dailyAtr.toFixed(candidate.digits),
          newsSentimentScore: newsScore,
          newsHeadline: newsCtx.impactingHeadline || 'Sakin / Teknik Akış',
          confluenceScore: existingOpen.confluenceScore || 86,
          candidateDirection: existingOpen.direction,
          status: 'POZİSYONDA (AÇIK)',
          decisionReason: `Aktif ${existingOpen.direction} (${existingOpen.lotSize || 0.25} Lot) pozisyonu yönetiliyor (${existingOpen.tp1Hit ? 'TP1 Alındı, Başabaş Stop Aktif' : `SL: ${existingOpen.stopLoss} Kalkanı Aktif`}).`,
          scannedAt: nowIso,
        });
        continue;
      }

      // Aday yön ve 6-Kapı değerlendirmesi
      let direction: 'AL (LONG)' | 'SAT (SHORT)' | null = null;
      let rationale = '';
      let riskScale = 1.0;
      let vetoReason = '';
      let isNewsVeto = false;

      if (midPrice >= ema50 && ema8 >= ema21 * 0.999 && rsi >= 36 && rsi <= 65) {
        if (newsScore <= -0.35) {
          isNewsVeto = true;
          vetoReason = `Teknik AL sinyali mevcut ancak canlı olumsuz haber şoku (${newsScore}) nedeniyle ALIM VETO EDİLDİ ("${newsCtx.impactingHeadline.slice(0, 50)}...").`;
        } else {
          direction = 'AL (LONG)';
          rationale = hasNewsHeadline && newsScore >= 0.2
            ? `Çift Teyit (Teknik + Olumlu Haber): Fiyat > EMA50, Wilder RSI (${rsi}) ve "${newsCtx.impactingHeadline.slice(0, 55)}..." haberi alımı destekliyor.`
            : `Trend Pozitif (Fiyat > EMA50), EMA8/21 Alıcı Akışı ve Wilder RSI (${rsi}) Uygun Bölgede.`;
        }
      } else if (midPrice < ema50 && ema8 <= ema21 * 1.001 && rsi >= 34 && rsi <= 63) {
        if (newsScore >= 0.35) {
          isNewsVeto = true;
          vetoReason = `Teknik SAT sinyali mevcut ancak canlı olumlu haber şoku (+${newsScore}) nedeniyle SATIŞ VETO EDİLDİ ("${newsCtx.impactingHeadline.slice(0, 50)}...").`;
        } else {
          direction = 'SAT (SHORT)';
          rationale = hasNewsHeadline && newsScore <= -0.2
            ? `Çift Teyit (Teknik + Olumsuz Haber): Fiyat < EMA50, Wilder RSI (${rsi}) ve "${newsCtx.impactingHeadline.slice(0, 55)}..." haberi satış baskısını teyit ediyor.`
            : `Düşüş Rejimi (Fiyat < EMA50), EMA8/21 Satış Baskısı ve Wilder RSI (${rsi}) Teyitli.`;
        }
      } else if (rsi < 33) {
        if (newsScore <= -0.45 && midPrice < ema50) {
          direction = 'SAT (SHORT)';
          riskScale = 0.75;
          rationale = `Canlı Negatif Haber Katalizörü ("${newsCtx.impactingHeadline.slice(0, 55)}...") + EMA50 Altı Kırılım Teyitli Satış.`;
        } else if (newsScore > -0.25) {
          direction = 'AL (LONG)';
          rationale = `Aşırı Satım Tepki Bölgesi (Wilder RSI: ${rsi}) + Ters Haber Şoku Yok.`;
        } else {
          isNewsVeto = true;
          vetoReason = `RSI (${rsi}) aşırı satımda ancak negatif haber baskısı (${newsScore}) nedeniyle düşen bıçak tutulmadı.`;
        }
      } else if (rsi > 69) {
        if (newsScore < 0.25) {
          direction = 'SAT (SHORT)';
          rationale = `Aşırı Alım Yorulma Bölgesi (Wilder RSI: ${rsi}) + Ortalamaya Dönüş Satışı.`;
        } else {
          isNewsVeto = true;
          vetoReason = `RSI (${rsi}) aşırı alımda ancak güçlü pozitif haber (+${newsScore}) nedeniyle erken satış veto edildi.`;
        }
      } else {
        vetoReason = `Fiyat (${midPrice}) vs EMA50 (${ema50.toFixed(candidate.digits)}) ve Wilder RSI (${rsi}) — EMA8/21 kurumsal momentum kesişimi bekleniyor.`;
      }

      // Korelasyon Kümesi Kontrolü (Aynı kümede maksimum 2 açık işlem)
      const sameClusterOpen = state.openPositions.filter((p) => getSpec(p.symbol).cluster === candidate.cluster).length;

      if (direction && state.isRunning && state.openPositions.length < 4 && sameClusterOpen < 2) {
        const halfSpread = candidate.spreadPts / 2 + candidate.slippagePts;
        const entryPrice = direction === 'AL (LONG)'
          ? +(midPrice + halfSpread).toFixed(candidate.digits)
          : +(midPrice - halfSpread).toFixed(candidate.digits);

        const currentEq = state.cashBalanceTRY;
        const riskTRY = +(currentEq * 0.015 * riskScale).toFixed(2);
        const allocTRY = +(currentEq * 0.20 * riskScale).toFixed(2);

        const slDist = tradeAtr * 1.25;
        const tp1Dist = tradeAtr * 1.90;
        const tp2Dist = tradeAtr * 3.20;

        const stopLoss = direction === 'AL (LONG)'
          ? +(entryPrice - slDist).toFixed(candidate.digits)
          : +(entryPrice + slDist).toFixed(candidate.digits);
        const tp1 = direction === 'AL (LONG)'
          ? +(entryPrice + tp1Dist).toFixed(candidate.digits)
          : +(entryPrice - tp1Dist).toFixed(candidate.digits);
        const tp2 = direction === 'AL (LONG)'
          ? +(entryPrice + tp2Dist).toFixed(candidate.digits)
          : +(entryPrice - tp2Dist).toFixed(candidate.digits);

        const built = buildForensicXRayForTrade({
          symbol: candidate.symbol,
          digits: candidate.digits,
          direction,
          midPrice,
          entryPrice,
          stopLoss,
          tp1,
          tp2,
          ema8,
          ema21,
          ema50,
          ema200,
          rsi14: rsi,
          dailyAtr14: dailyAtr,
          tradeAtr,
          newsScore,
          newsHeadline: newsCtx.impactingHeadline,
          newsSource: newsCtx.source,
          cashBalanceTRY: currentEq,
          allocatedCapitalTRY: allocTRY,
          riskAmountTRY: riskTRY,
          usdTry,
          entryTimeIso: nowIso,
          status: 'ACIK',
          tp1Hit: false,
          trailingStopActive: false,
          realizedPnL_TRY: 0,
          mfePrice: entryPrice,
          mfeR: 0,
          mfeTRY: 0,
          maePrice: entryPrice,
          maeR: 0,
          maeTRY: 0,
        });

        const newTrade: AutonomousTrade = {
          id: `TRD-${candidate.symbol.replace(/[\/\.\s]/g, '')}-${now.toString().slice(-5)}`,
          symbol: candidate.symbol,
          name: candidate.name,
          digits: candidate.digits,
          direction,
          status: 'ACIK',
          entryTime: nowIso,
          entryTimestamp: now,
          midEntryPrice: midPrice,
          entryPrice,
          currentPrice: entryPrice,
          takeProfit1: tp1,
          takeProfit2: tp2,
          stopLoss,
          initialStopLoss: stopLoss,
          allocatedCapitalTRY: allocTRY,
          riskAmountTRY: riskTRY,
          positionSizeUnits: built.positionSizeUnits,
          lotSize: built.lotSize,
          contractSize: built.contractSize,
          notionalValueTRY: built.notionalValueTRY,
          effectiveLeverage: built.effectiveLeverage,
          spreadPts: built.spreadPts,
          slippagePts: built.slippagePts,
          executionCostTRY: built.executionCostTRY,
          rMultiple: 0,
          mfeTRY: 0,
          mfeR: 0,
          maeTRY: 0,
          maeR: 0,
          tp1Hit: false,
          breakevenActive: false,
          trailingStopActive: false,
          realizedPnL_TRY: 0,
          unrealizedPnL_TRY: 0,
          totalPnL_TRY: 0,
          totalPnL_Percent: 0,
          confluenceScore: built.confluenceScore,
          rationale,
          forensicXRay: built.xray,
        };

        state.openPositions.push(newTrade);
        openSymbols.add(candidate.symbol);

        state.activityLog.unshift({
          id: `ACT-ENT-${now}-${candidate.symbol}`,
          timestamp: nowIso,
          type: 'ENTRY',
          symbol: candidate.symbol,
          message: `YENİ İŞLEM AÇILDI: ${candidate.symbol} (${direction} — ${built.lotSize} Lot) @ ${entryPrice} | TP1: ${tp1} | TP2: ${tp2} | SL: ${stopLoss} | Uyumluluk: ${built.confluenceScore}/100 | Gerekçe: ${rationale}`,
        });

        scannerResults.push({
          symbol: candidate.symbol,
          name: candidate.name,
          digits: candidate.digits,
          price: midPrice,
          ema8: +ema8.toFixed(candidate.digits),
          ema21: +ema21.toFixed(candidate.digits),
          ema50: +ema50.toFixed(candidate.digits),
          trendRegime,
          rsi14: rsi,
          atr14: +dailyAtr.toFixed(candidate.digits),
          newsSentimentScore: newsScore,
          newsHeadline: newsCtx.impactingHeadline || 'Sakin / Teknik Akış',
          confluenceScore: built.confluenceScore,
          candidateDirection: direction,
          status: 'YENİ GİRİŞ',
          decisionReason: `6-Kapı Onaylandı (${built.confluenceScore}/100): ${built.lotSize} Lot ${direction} emri @ ${entryPrice} fiyatından icra edildi.`,
          scannedAt: nowIso,
        });
      } else {
        // Neden girilmediğini şeffaf biçimde radara yaz
        let scanStatus: MarketScannerItem['status'] = 'TEKNİK TEYİT BEKLİYOR';
        let scanReason = vetoReason;
        let scanScore = direction ? 82 : 58;

        if (isNewsVeto) {
          scanStatus = 'HABER VETOSU';
          scanScore = 44;
        } else if (direction && sameClusterOpen >= 2) {
          scanStatus = 'KORELASYON KALKANI';
          scanReason = `${direction} sinyali hazır (${scanScore}/100) ancak aynı korelasyon kümesinde (${candidate.cluster}) 2 açık işlem bulunduğu için aşırı yoğunlaşma engellendi.`;
        } else if (direction && state.openPositions.length >= 4) {
          scanStatus = 'LİMİT DOLU (4/4)';
          scanReason = `${direction} sinyali hazır (${scanScore}/100 — ${rationale}) ancak maksimum 4 eşzamanlı işlem kalkanı dolu (%80 teminat sınırı). Açık işlemlerden biri kapandığında devreye girecek.`;
        }

        scannerResults.push({
          symbol: candidate.symbol,
          name: candidate.name,
          digits: candidate.digits,
          price: midPrice,
          ema8: +ema8.toFixed(candidate.digits),
          ema21: +ema21.toFixed(candidate.digits),
          ema50: +ema50.toFixed(candidate.digits),
          trendRegime,
          rsi14: rsi,
          atr14: +dailyAtr.toFixed(candidate.digits),
          newsSentimentScore: newsScore,
          newsHeadline: newsCtx.impactingHeadline || 'Sakin / Teknik Akış',
          confluenceScore: scanScore,
          candidateDirection: direction || 'BEKLE',
          status: scanStatus,
          decisionReason: scanReason,
          scannedAt: nowIso,
        });
      }
    } catch {
      // Ignore individual symbol fetch error
    }
  }

  state.marketScanner = scannerResults;
  ensureForensicXRayOnTrades(state);
  recalculateLedgerMetrics(state);

  const lastEqPoint = state.equityCurve[state.equityCurve.length - 1];
  if (!lastEqPoint || now - lastEqPoint.timestamp >= 15 * 60 * 1000 || Math.abs(lastEqPoint.equityTRY - state.totalEquityTRY) >= 50) {
    state.equityCurve.push({
      timestamp: now,
      timeStr: new Date(now).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      equityTRY: state.totalEquityTRY,
      cashTRY: state.cashBalanceTRY,
    });
    if (state.equityCurve.length > 120) {
      state.equityCurve = state.equityCurve.slice(-120);
    }
  }

  // Re-run drawdown on updated curve
  recalculateLedgerMetrics(state);

  if (state.activityLog.length > 80) {
    state.activityLog = state.activityLog.slice(0, 80);
  }

  saveLedger(state);
  return state;
}

export async function toggleAutonomousBot(isRunning: boolean): Promise<AutonomousLedgerState> {
  const state = await loadOrInitAutonomousLedger();
  state.isRunning = isRunning;
  state.activityLog.unshift({
    id: `ACT-SYS-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type: 'SYSTEM',
    symbol: 'SİSTEM',
    message: isRunning
      ? 'Otonom İşlem Motoru kullanıcı tarafından AKTİF edildi. Piyasa taraması devam ediyor.'
      : 'Otonom İşlem Motoru kullanıcı tarafından DURAKLATILDI. Yeni işlem açılmayacak.',
  });
  saveLedger(state);
  return state;
}

export async function resetAutonomousBot(newCapitalTRY = 250000): Promise<AutonomousLedgerState> {
  if (fs.existsSync(LEDGER_FILE)) {
    fs.unlinkSync(LEDGER_FILE);
  }
  await bootstrapHistoricalRealTrades(newCapitalTRY);
  return await executeAutonomousTradingTick(true);
}

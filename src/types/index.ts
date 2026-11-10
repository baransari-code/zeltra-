export type AssetCategory =
  | 'MAJOR_FX'
  | 'MINOR_FX'
  | 'EXOTIC_FX'
  | 'PRECIOUS_METALS'
  | 'ENERGY'
  | 'INDICES'
  | 'STOCKS'
  | 'CRYPTO'
  | 'AGRICULTURE'
  | 'METALS'
  | 'BONDS'
  | 'DERIVATIVES';

export interface Asset {
  symbol: string;
  name: string;
  category: AssetCategory;
  categoryName: string;
  subCategory?: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  digits: number;
  volume: string;
  contractType: 'Spot Forex' | 'CFD' | 'Futures' | 'Emtia' | 'Spot Kripto' | 'Hisse CFD' | 'Tahvil';
  description?: string;
}

export interface Candle {
  timestamp: number;
  dateStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicators {
  rsi: number;
  ema20: number;
  ema50: number;
  ema200: number;
  atr: number;
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
  };
  macd: {
    line: number;
    signal: number;
    hist: number;
  };
  trend: 'YÜKSELİŞ (BULLISH)' | 'DÜŞÜŞ (BEARISH)' | 'YATAY (NEUTRAL)';
}

export interface KeyLevelInfo {
  support: number;
  supportTests: number;
  nextSupport: number;
  resistance: number;
  nextResistance: number;
  scenarioBounce: string;
  scenarioBreakdown: string;
  bounceCoordinates?: { timestamp: number; price: number }[];
}

export interface ConditionalScenarios {
  scenarioA: {
    name: string;
    condition: string;
    targetPrice: number;
    probability: number;
    actionPlan: string;
  };
  scenarioB: {
    name: string;
    condition: string;
    targetPrice: number;
    probability: number;
    actionPlan: string;
  };
}

export interface IdealEntryRange {
  min: number;
  max: number;
  status: 'ALIM_BÖLGESİNDE' | 'GERİ_ÇEKİLME_BEKLE' | 'DİRENÇTE_DİKKAT';
  note: string;
}

export interface ExecutiveTradePlan {
  actionBadge: 'GÜÇLÜ AL' | 'KADEMELİ AL' | 'BEKLE / İZLE' | 'KÂR SATIŞI YAP' | 'GÜÇLÜ SAT';
  actionBadgeColor: 'emerald' | 'amber' | 'rose' | 'sky';
  oneSentenceSummary: string;
  targetGainPercent: number;
  maxLossPercent: number;
  potentialProfitUSD: number;
  potentialLossUSD: number;
  potentialProfitTRY: number;
  potentialLossTRY: number;
  supportSafetyScore: number;
  distanceToSupportPercent: number;
  breakdownWarning: boolean;
  breakevenRule: string;
  partialTakeProfitRule: string;
}

export interface TradeSignal {
  id: string;
  symbol: string;
  action: 'AL (BUY)' | 'SAT (SELL)' | 'BEKLE (HOLD)';
  decisionBadge: 'GÜÇLÜ AL' | 'KADEMELİ AL' | 'BEKLE / DÜZELTME İZLE' | 'KÂR SATIŞI' | 'SATIŞ YAP';
  entryPrice: number;
  idealEntryRange: IdealEntryRange;
  takeProfit: number;
  takeProfit2: number;
  stopLoss: number;
  riskRewardRatio: number;
  winProbability: number;
  confidenceScore: number;
  timeframe: string;
  analysisSummary: string;
  oneSentenceAdvice: string;
  executivePlan: ExecutiveTradePlan;
  reasons: string[];
  keyLevels?: KeyLevelInfo;
  scenarios: ConditionalScenarios;
  newsSentiment?: {
    bias: 'POZİTİF' | 'NEGATİF' | 'NÖTR';
    headline: string;
    simpleImpact: string;
  };
  createdAt: string;
  status: 'AKTİF İŞLEM' | 'HEDEFE ULAŞTI' | 'STOPLANDI' | 'BEKLEMEDE';
}

export interface NewsNotification {
  id: string;
  title: string;
  originalTitle?: string;
  summary: string;
  originalSummary?: string;
  source: string;
  sourceUrl?: string;
  impact: 'YÜKSEK' | 'ORTA' | 'DÜŞÜK';
  sentiment: 'POZİTİF' | 'NEGATİF' | 'NÖTR' | 'KRİTİK';
  affectedAssets: string[];
  publishedAt: string;
  read: boolean;
}

export interface InstitutionalEntity {
  name: string;
  code: string;
  type: 'MERKEZ BANKASI' | 'KÜRESEL ŞİRKET' | 'EMTİA ÜRETİCİSİ';
  creditScore: string;
  macroTrend: string;
  riskLevel: 'DÜŞÜK' | 'DENGELİ' | 'RİSKLİ';
  lastNews: string;
  lastUpdated: string;
}

export interface TradingConcept {
  term: string;
  turkish: string;
  category: 'Kavram' | 'Emir Tipi' | 'Strateji' | 'İşlem Türü';
  definition: string;
  example: string;
}

export interface TradingMethod {
  name: string;
  description: string;
  riskProfile: 'Düşük' | 'Dengeli' | 'Yüksek' | 'Çok Yüksek';
  instruments: string;
  bestFor: string;
}

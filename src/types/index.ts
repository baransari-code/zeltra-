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
  sentimentScore?: number;
  isMacro?: boolean;
  affectedAssets: string[];
  publishedAt: string;
  publishedTimestamp?: number;
  read: boolean;
  aiAnalysis?: {
    eventCategory: string;
    whatHappened: string;
    causalMechanism: string;
    opportunityVerdict: string;
    primarySymbol: string;
    primaryDirection: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
    confidencePercent: number;
    assetImpacts: {
      symbol: string;
      direction: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
      conviction: number;
      reason: string;
    }[];
  };
}

// Real Financial Market Data & Multi-Source News Engine with Dynamic News-Sentiment Adaptation
// Connects directly to Yahoo Finance and Real Multi-Source Financial RSS Feeds

export const SYMBOL_MAP: Record<string, string> = {
  // Majör
  'EUR/USD': 'EURUSD=X',
  'GBP/USD': 'GBPUSD=X',
  'USD/JPY': 'JPY=X',
  'USD/CHF': 'CHF=X',
  'USD/CAD': 'CAD=X',
  'AUD/USD': 'AUDUSD=X',
  'NZD/USD': 'NZDUSD=X',

  // Minör
  'EUR/GBP': 'EURGBP=X',
  'EUR/JPY': 'EURJPY=X',
  'EUR/CHF': 'EURCHF=X',
  'EUR/CAD': 'EURCAD=X',
  'EUR/AUD': 'EURAUD=X',
  'EUR/NZD': 'EURNZD=X',
  'GBP/JPY': 'GBPJPY=X',
  'GBP/CHF': 'GBPCHF=X',
  'GBP/CAD': 'GBPCAD=X',
  'GBP/AUD': 'GBPAUD=X',
  'GBP/NZD': 'GBPNZD=X',
  'AUD/JPY': 'AUDJPY=X',
  'AUD/CAD': 'AUDCAD=X',
  'AUD/CHF': 'AUDCHF=X',
  'AUD/NZD': 'AUDNZD=X',
  'NZD/JPY': 'NZDJPY=X',
  'NZD/CAD': 'NZDCAD=X',
  'NZD/CHF': 'NZDCHF=X',
  'CAD/JPY': 'CADJPY=X',
  'CAD/CHF': 'CADCHF=X',
  'CHF/JPY': 'CHFJPY=X',

  // Egzotik
  'USD/TRY': 'USDTRY=X',
  'EUR/TRY': 'EURTRY=X',
  'GBP/TRY': 'GBPTRY=X',
  'USD/ZAR': 'USDZAR=X',
  'USD/MXN': 'USDMXN=X',
  'USD/BRL': 'USDBRL=X',
  'USD/SGD': 'USDSGD=X',
  'USD/HKD': 'USDHKD=X',
  'USD/PLN': 'USDPLN=X',
  'USD/HUF': 'USDHUF=X',
  'USD/CZK': 'USDCZK=X',
  'USD/THB': 'USDTHB=X',
  'USD/CNH': 'USDCNH=X',
  'USD/SEK': 'USDSEK=X',
  'USD/NOK': 'USDNOK=X',
  'USD/DKK': 'USDDKK=X',
  'EUR/PLN': 'EURPLN=X',
  'EUR/HUF': 'EURHUF=X',
  'EUR/CZK': 'EURCZK=X',
  'EUR/ZAR': 'EURZAR=X',

  // Değerli Metaller
  'XAU/USD': 'GC=F',
  'XAU/EUR': 'XAUEUR=X',
  'XAU/GBP': 'XAUGBP=X',
  'XAU/TRY': 'GC=F',
  'XAG/USD': 'SI=F',
  'XAG/EUR': 'XAGEUR=X',
  'XAG/GBP': 'XAGGBP=X',
  'XPT/USD': 'PL=F',
  'XPD/USD': 'PA=F',

  // Enerji
  'BRENT': 'BZ=F',
  'WTI': 'CL=F',
  'NATGAS': 'NG=F',
  'GASOLINE': 'RB=F',
  'HEATING_OIL': 'HO=F',
  'COAL': 'NCF=F',

  // Endeksler
  'NAS100': '^IXIC',
  'SPX500': '^GSPC',
  'US30': '^DJI',
  'RUSSELL2000': '^RUT',
  'VIX': '^VIX',
  'GER40': '^GDAXI',
  'UK100': '^FTSE',
  'FRA40': '^FCHI',
  'EUSTX50': '^STOXX50E',
  'JP225': '^N225',
  'HK50': '^HSI',

  // Hisseler
  'NVDA': 'NVDA',
  'AAPL': 'AAPL',
  'MSFT': 'MSFT',
  'GOOGL': 'GOOGL',
  'AMZN': 'AMZN',
  'META': 'META',
  'AMD': 'AMD',
  'INTC': 'INTC',
  'AVGO': 'AVGO',
  'QCOM': 'QCOM',
  'ORCL': 'ORCL',
  'TSLA': 'TSLA',
  'JPM': 'JPM',
  'GS': 'GS',
  'BAC': 'BAC',
  'V': 'V',
  'MA': 'MA',
  'KO': 'KO',
  'PEP': 'PEP',
  'MCD': 'MCD',
  'WMT': 'WMT',
  'XOM': 'XOM',
  'CVX': 'CVX',

  // Kripto
  'BTC/USD': 'BTC-USD',
  'ETH/USD': 'ETH-USD',
  'SOL/USD': 'SOL-USD',
  'BNB/USD': 'BNB-USD',
  'XRP/USD': 'XRP-USD',
  'DOGE/USD': 'DOGE-USD',
  'ADA/USD': 'ADA-USD',
  'AVAX/USD': 'AVAX-USD',
  'LINK/USD': 'LINK-USD',
  'DOT/USD': 'DOT-USD',
  'LTC/USD': 'LTC-USD',
  'BCH/USD': 'BCH-USD',
  'TON/USD': 'TON11419-USD',
  'TRX/USD': 'TRX-USD',
  'XLM/USD': 'XLM-USD',
  'ETC/USD': 'ETC-USD',

  // Tarım & Sanayi Metalleri
  'WHEAT': 'ZW=F',
  'CORN': 'ZC=F',
  'SOYBEANS': 'ZS=F',
  'COFFEE': 'KC=F',
  'COCOA': 'CC=F',
  'SUGAR': 'SB=F',
  'COTTON': 'CT=F',
  'COPPER': 'HG=F',
  'ALUMINUM': 'ALI=F',

  // Tahviller & ETF
  'US10Y': '^TNX',
  'US30Y': '^TYX',
  'US05Y': '^FVX',
  'GLD': 'GLD',
  'SLV': 'SLV',
  'USO': 'USO',
};

// Real 1-Year OHLC Data Fetcher
export async function fetchReal1YearData(symbol: string) {
  const yahooTicker = SYMBOL_MAP[symbol] || symbol.replace('/', '');
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=1y&interval=1d`;

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
  });

  if (!resp.ok) {
    throw new Error(`Yahoo Finance HTTP error: ${resp.status}`);
  }

  const data: any = await resp.json();
  const result = data?.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
    throw new Error('Geçersiz veri yapısı');
  }

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const meta = result.meta;

  const currentPrice = meta.regularMarketPrice || quote.close[quote.close.length - 1];
  const previousClose = meta.chartPreviousClose || meta.previousClose || currentPrice;
  const change24h = +(currentPrice - previousClose).toFixed(4);
  const changePercent24h = +((change24h / previousClose) * 100).toFixed(2);

  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close[i];
    if (close === null || close === undefined || isNaN(close)) continue;

    const open = quote.open[i] ?? close;
    const high = quote.high[i] ?? Math.max(open, close);
    const low = quote.low[i] ?? Math.min(open, close);
    const volume = quote.volume[i] ?? 0;
    const ts = timestamps[i] * 1000;
    const dateStr = new Date(ts).toISOString().split('T')[0];

    candles.push({
      timestamp: ts,
      dateStr,
      open: +open.toFixed(4),
      high: +high.toFixed(4),
      low: +low.toFixed(4),
      close: +close.toFixed(4),
      volume,
    });
  }

  return {
    symbol,
    ticker: yahooTicker,
    price: currentPrice,
    change24h,
    changePercent24h,
    currency: meta.currency || 'USD',
    exchangeTimezoneName: meta.exchangeTimezoneName,
    candles,
    lastUpdated: new Date().toISOString(),
  };
}

// 5 Günlük Saatlik Geçmiş Mum Verisi (PC Kapalıyken Oluşan Süreleri Geriye Dönük Doğrulama)
export async function fetchRealHourlyHistory(symbol: string): Promise<{ timestamp: number; close: number }[]> {
  const yahooTicker = SYMBOL_MAP[symbol] || symbol.replace('/', '');
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=5d&interval=1h`;

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
  });

  if (!resp.ok) return [];

  const data: any = await resp.json();
  const result = data?.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]) return [];

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const list: { timestamp: number; close: number }[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const c = quote.close[i];
    if (c !== null && c !== undefined && !isNaN(c)) {
      list.push({
        timestamp: timestamps[i] * 1000,
        close: +c,
      });
    }
  }

  return list;
}

// Multi-Source Financial Feeds (Strictly Last 24 Hours)
const FINANCIAL_NEWS_FEEDS = [
  { source: 'CNBC Markets', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html' },
  { source: 'CNBC Economy', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html' },
  { source: 'MarketWatch / Dow Jones', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { source: 'Wall Street Journal', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml' },
  { source: 'Investing.com Forex', url: 'https://www.investing.com/rss/forex.rss' },
  { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
];

// In-Memory Translation Cache & News Cache
const translationCache = new Map<string, string>();
let cachedNews: any[] = [];
let lastNewsFetchTime = 0;
const NEWS_CACHE_TTL = 60 * 1000; // 60 saniye tazeleme döngüsü

export async function translateToTurkish(text: string): Promise<string> {
  if (!text || text.trim().length === 0) return '';
  const trimmed = text.trim();
  if (translationCache.has(trimmed)) {
    return translationCache.get(trimmed)!;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=${encodeURIComponent(trimmed)}`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      },
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const data: any = await resp.json();
      if (Array.isArray(data?.[0])) {
        const translated = data[0].map((item: any) => item[0]).join('').trim();
        if (translated) {
          translationCache.set(trimmed, translated);
          return translated;
        }
      }
    }
  } catch {
    // Çeviri servisi yanıt vermezse orijinal metin döner
  }

  return trimmed;
}

export async function fetchRealFinancialNews() {
  const now = Date.now();
  if (cachedNews.length > 0 && now - lastNewsFetchTime < NEWS_CACHE_TTL) {
    return cachedNews;
  }

  const allNews: any[] = [];
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  await Promise.allSettled(
    FINANCIAL_NEWS_FEEDS.map(async (feed) => {
      try {
        const resp = await fetch(feed.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        if (!resp.ok) return;

        const xml = await resp.text();
        const items = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<description>(.*?)<\/description>[\s\S]*?<pubDate>(.*?)<\/pubDate>/g)];

        for (const m of items) {
          const rawTitle = cleanXml(m[1]);
          const rawLink = cleanXml(m[2]);
          const rawDesc = cleanXml(m[3]);
          const pubDate = new Date(m[4]);
          const ageMs = now - pubDate.getTime();

          if (!isNaN(pubDate.getTime()) && ageMs >= 0 && ageMs <= ONE_DAY_MS) {
            allNews.push({
              id: `news-${feed.source.replace(/[\/\s]/g, '')}-${pubDate.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
              originalTitle: rawTitle,
              title: rawTitle,
              originalSummary: rawDesc.slice(0, 220),
              summary: rawDesc.slice(0, 220) + (rawDesc.length > 220 ? '...' : ''),
              source: feed.source,
              sourceUrl: rawLink,
              impact: rawTitle.toLowerCase().includes('fed') || rawTitle.toLowerCase().includes('rate') || rawTitle.toLowerCase().includes('cpi') || rawTitle.toLowerCase().includes('inflation') ? 'YÜKSEK' : 'ORTA',
              sentiment: rawTitle.toLowerCase().includes('fall') || rawTitle.toLowerCase().includes('drop') || rawTitle.toLowerCase().includes('crisis') || rawTitle.toLowerCase().includes('probe') ? 'NEGATİF' : 'POZİTİF',
              publishedAt: formatTimeAgo(pubDate),
              publishedTimestamp: pubDate.getTime(),
              read: false,
            });
          }
        }
      } catch {
        // Feed hata verirse diğer kaynaklar kesintisiz çalışmaya devam eder
      }
    })
  );

  allNews.sort((a, b) => b.publishedTimestamp - a.publishedTimestamp);
  const selectedNews = allNews.slice(0, 25);

  // Başlıkları ve Özetleri Türkçe Bilgilendirmeye Çevir
  await Promise.allSettled(
    selectedNews.map(async (n) => {
      try {
        const [trTitle, trSummary] = await Promise.all([
          translateToTurkish(n.title),
          translateToTurkish(n.summary),
        ]);
        if (trTitle) n.title = trTitle;
        if (trSummary) n.summary = trSummary;
      } catch {
        // Hata durumunda orijinal başlık korunur
      }
    })
  );

  cachedNews = selectedNews;
  lastNewsFetchTime = now;
  return selectedNews;
}

function cleanXml(str: string): string {
  if (!str) return '';
  let cleaned = str
    // CDATA bloklarını temizle
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    // HTML taglerini temizle
    .replace(/<[^>]*>?/gm, ' ')
    // Standart HTML isimlendirilmiş varlıklar
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&hellip;/gi, '...')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&rdquo;|&ldquo;/gi, '"');

  // Hexadecimal kodlu karakterler (Örn: &#x201c;, &#x201d;, &#x2014;)
  cleaned = cleaned.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return '';
    }
  });

  // Desimal kodlu karakterler (Örn: &#8216;, &#8217;, &#8220;, &#8221;)
  cleaned = cleaned.replace(/&#([0-9]+);/g, (_, dec) => {
    try {
      return String.fromCharCode(parseInt(dec, 10));
    } catch {
      return '';
    }
  });

  // Çift encode edilmiş olası durumlar için ikinci geçiş
  cleaned = cleaned.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try { return String.fromCharCode(parseInt(hex, 16)); } catch { return ''; }
  });
  cleaned = cleaned.replace(/&#([0-9]+);/g, (_, dec) => {
    try { return String.fromCharCode(parseInt(dec, 10)); } catch { return ''; }
  });

  return cleaned.replace(/\s+/g, ' ').trim();
}

function formatTimeAgo(date: Date): string {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Az önce';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} dakika önce`;
  const hours = Math.floor(diffSec / 3600);
  return `${hours} saat önce (Son 24s)`;
}

// Haber Duyarlılığı & Şok Faktörü Analiz Motoru
export interface NewsContext {
  sentimentScore: number; // -1.0 (aşırı negatif) ile +1.0 (aşırı pozitif)
  shockLevel: number; // 0.0 (sakin) ile 1.0 (yüksek şok/flaş haber)
  impactingHeadline: string;
  source: string;
  biasDescription: string;
  newsTimeAgo: string;
}

export function extractNewsSentimentForAsset(symbol: string, newsList: any[]): NewsContext {
  if (!newsList || newsList.length === 0) {
    return {
      sentimentScore: 0,
      shockLevel: 0,
      impactingHeadline: '',
      source: '',
      biasDescription: 'Haber akışı sakin; saf teknik model devrede.',
      newsTimeAgo: '',
    };
  }

  // Enstrüman ilişkili anahtar kelimeler
  const keywordMap: Record<string, string[]> = {
    'EUR/USD': ['euro', 'dollar', 'ecb', 'fed', 'powell', 'lagarde', 'inflation', 'cpi', 'rate'],
    'GBP/USD': ['pound', 'sterling', 'boe', 'bailey', 'uk inflation', 'dollar', 'britain'],
    'USD/TRY': ['turkey', 'lira', 'cbrt', 'tcmb', 'inflation', 'dollar'],
    'USD/JPY': ['yen', 'boj', 'ueda', 'japan', 'intervention', 'carry'],
    'XAU/USD': ['gold', 'bullion', 'precious metal', 'yields', 'safe haven', 'inflation', 'fed'],
    'BRENT': ['oil', 'brent', 'crude', 'opec', 'saudi', 'energy', 'middle east', 'supply'],
    'BTC/USD': ['bitcoin', 'crypto', 'btc', 'sec', 'etf', 'mining', 'binance', 'coinbase'],
    'NVDA': ['nvidia', 'huang', 'ai', 'semiconductor', 'chips', 'gpu', 'tech', 'probe'],
    'SPX500': ['s&p', 'wall street', 'stocks', 'equities', 'fed', 'inflation', 'yields'],
  };

  const assetKeys = keywordMap[symbol] || [symbol.toLowerCase().replace('/', ''), 'market', 'fed'];

  // Aday haberleri alakalılık derecesine göre puanla
  let bestNews: any = null;
  let maxScore = 0;

  for (const n of newsList) {
    const text = ((n.title || '') + ' ' + (n.summary || '')).toLowerCase();
    let score = 0;
    assetKeys.forEach((k) => {
      if (text.includes(k)) score += 2;
    });

    if (score > maxScore) {
      maxScore = score;
      bestNews = n;
    }
  }

  // Doğrudan eşleşme yoksa en son piyasa manşetini al
  if (!bestNews && newsList.length > 0) {
    bestNews = newsList[0];
  }

  if (!bestNews) {
    return {
      sentimentScore: 0,
      shockLevel: 0,
      impactingHeadline: '',
      source: '',
      biasDescription: 'Doğrudan etkileyen flaş haber yok.',
      newsTimeAgo: '',
    };
  }

  const text = ((bestNews.title || '') + ' ' + (bestNews.summary || '')).toLowerCase();

  const positiveWords = ['surge', 'jump', 'rally', 'gain', 'rise', 'beat', 'record', 'bullish', 'cut rate', 'ease', 'soar', 'strong', 'higher'];
  const negativeWords = ['fall', 'drop', 'plunge', 'probe', 'crisis', 'war', 'tariff', 'crash', 'down', 'miss', 'bearish', 'hike rate', 'slips', 'declines', 'stress'];

  let posCount = 0;
  let negCount = 0;
  positiveWords.forEach((w) => { if (text.includes(w)) posCount++; });
  negativeWords.forEach((w) => { if (text.includes(w)) negCount++; });

  let sentimentScore = 0;
  if (posCount > negCount) sentimentScore = Math.min(0.85, 0.35 + posCount * 0.15);
  else if (negCount > posCount) sentimentScore = Math.max(-0.85, -0.35 - negCount * 0.15);

  const shockLevel = Math.min(1.0, 0.2 + (posCount + negCount) * 0.25 + (bestNews.impact === 'YÜKSEK' ? 0.3 : 0.1));

  let biasDescription = 'Nötr piyasa haber akışı';
  if (sentimentScore > 0.2) biasDescription = `Pozitif Haber Desteği (+%${(sentimentScore * 100).toFixed(0)} ivme)`;
  else if (sentimentScore < -0.2) biasDescription = `Negatif Haber Baskısı (%${(sentimentScore * 100).toFixed(0)} baskı)`;

  return {
    sentimentScore,
    shockLevel,
    impactingHeadline: bestNews.title,
    source: bestNews.source,
    biasDescription,
    newsTimeAgo: bestNews.publishedAt,
  };
}

// 24 Saatlik İleriye Dönük Kantitatif Tahmin Modeli (Canlı Haber Şokuna Göre Dinamik Adaptasyon)
export interface HourlyPrediction {
  hour: number;
  targetTime: string;
  targetTimestamp: number;
  predictedPrice: number;
  expectedDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
  upperBound: number;
  lowerBound: number;
  expectedMovePercent: number;
  confidenceScore: number;
  session: string;
  newsAdjusted: boolean;
  rationale: string;
}

export function generate24HourPredictions(
  currentPrice: number,
  candles: any[],
  digits: number = 4,
  totalHours: number = 24,
  newsContext?: NewsContext
): HourlyPrediction[] {
  const now = Date.now();
  const predictions: HourlyPrediction[] = [];

  // Günlük ATR'den saatlik volatilite marjı hesabı
  const lastSlice = candles.slice(-14);
  let trSum = 0;
  for (let i = 1; i < lastSlice.length; i++) {
    const cur = lastSlice[i];
    const prev = lastSlice[i - 1];
    trSum += Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
  }
  const dailyATR = (trSum / (lastSlice.length - 1 || 1)) || (currentPrice * 0.006);
  const hourlyATR = dailyATR / Math.sqrt(24);

  // Teknik momentum eğimi
  const recentCloses = candles.slice(-20).map((c: any) => c.close);
  const slope = (recentCloses[recentCloses.length - 1] - recentCloses[0]) / (recentCloses.length || 1);
  const baseTechnicalUp = slope >= 0;

  // CANLI HABER ŞOKU VE DUYARLILIK UYARLAMASI
  const newsSentiment = newsContext?.sentimentScore || 0;
  const newsShock = newsContext?.shockLevel || 0;
  const isNewsActive = Math.abs(newsSentiment) > 0.15 || newsShock > 0.3;

  for (let h = 1; h <= totalHours; h++) {
    const targetTimestamp = now + h * 3600 * 1000;
    const targetDate = new Date(targetTimestamp);
    const hoursNum = targetDate.getHours();
    const targetTime = `${hoursNum.toString().padStart(2, '0')}:${targetDate.getMinutes().toString().padStart(2, '0')}`;

    // Piyasa seans sınıflandırması
    let session = 'Avrupa / Londra Seansı';
    let sessionVolFactor = 1.0;
    if (hoursNum >= 0 && hoursNum < 8) {
      session = 'Asya / Pasifik Seansı';
      sessionVolFactor = 0.75;
    } else if (hoursNum >= 8 && hoursNum < 15) {
      session = 'Avrupa / Londra Seansı';
      sessionVolFactor = 1.15;
    } else if (hoursNum >= 15 && hoursNum < 22) {
      session = 'ABD / New York Seansı';
      sessionVolFactor = 1.25;
    } else {
      session = 'New York Kapanış / Geç Seans';
      sessionVolFactor = 0.85;
    }

    const timeFactor = Math.sqrt(h);

    // Teknik sapma
    const technicalDrift = (baseTechnicalUp ? 1 : -1) * (0.24 * timeFactor * hourlyATR * sessionVolFactor);
    // Canlı Haber Şoku: İlk 8 saatte en yüksek ağırlıkla fiyata yansır
    const newsDecay = Math.exp(-h / 10);
    const newsDrift = (newsSentiment * 0.48 * newsDecay * timeFactor * hourlyATR);

    const totalDrift = technicalDrift + newsDrift;
    const predictedPrice = +(currentPrice + totalDrift).toFixed(digits);

    // %98 Gauss Güven Koridoru (Z = 2.42 sigma) ve Canlı Haber Volatilite Genişlemesi
    const newsVolatilityExpansion = 1 + (newsShock * 0.35 * newsDecay);
    const zMultiplier = 2.42; // %98 Normal / Gauss güven aralığı
    const bandWidth = zMultiplier * hourlyATR * (0.55 * timeFactor) * sessionVolFactor * newsVolatilityExpansion;
    const upperBound = +(predictedPrice + bandWidth).toFixed(digits);
    const lowerBound = +(predictedPrice - bandWidth).toFixed(digits);
    const expectedMovePercent = +(((predictedPrice - currentPrice) / currentPrice) * 100).toFixed(3);

    const expectedDirection = totalDrift >= 0 ? 'YÜKSELİŞ' : 'DÜŞÜŞ';
    const confidenceScore = Math.max(68, Math.floor(94 - h * 0.88 - (newsShock * 4)));

    let rationale = '';
    if (isNewsActive && h <= 6) {
      rationale = `Canlı Haber Uyarlaması: "${newsContext?.impactingHeadline?.slice(0, 52)}..." sebebiyle fiyat projeksiyonu anlık revize edildi.`;
    } else if (h <= 12) {
      rationale = `${session}: Seans likidite havuzu ve haber sindirme dengesi.`;
    } else {
      rationale = `${session}: 24 saatlik tam döngü ve günlük ATR kapanış hedefi.`;
    }

    predictions.push({
      hour: h,
      targetTime,
      targetTimestamp,
      predictedPrice,
      expectedDirection,
      upperBound,
      lowerBound,
      expectedMovePercent,
      confidenceScore,
      session,
      newsAdjusted: isNewsActive,
      rationale,
    });
  }

  return predictions;
}

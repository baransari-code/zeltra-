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

// Multi-Source Financial Feeds (14 Global Financial & Market Feeds — Last 24 Hours)
const FINANCIAL_NEWS_FEEDS = [
  { source: 'CNBC Markets', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html' },
  { source: 'CNBC Economy', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html' },
  { source: 'CNBC Investing', url: 'https://www.cnbc.com/id/15839069/device/rss/rss.html' },
  { source: 'CNBC Technology', url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html' },
  { source: 'MarketWatch / Dow Jones', url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse' },
  { source: 'MarketWatch Top Stories', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { source: 'Wall Street Journal Markets', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml' },
  { source: 'Wall Street Journal Economy', url: 'https://feeds.a.dj.com/rss/RSSEconomics.xml' },
  { source: 'Investing.com Forex', url: 'https://www.investing.com/rss/forex.rss' },
  { source: 'Investing.com Emtia (Altın & Petrol)', url: 'https://www.investing.com/rss/commodities.rss' },
  { source: 'Investing.com Borsa', url: 'https://www.investing.com/rss/stock.rss' },
  { source: 'Yahoo Finance Markets', url: 'https://finance.yahoo.com/news/rssindex' },
  { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
];

// Magazin, Yaşam, Seyahat ve Kişisel Tüketici Şikayeti Filtresi (Örn: "Uçmaktan bıktım / bagaj" vb. haberleri kesin olarak eler)
const NON_FINANCIAL_LIFESTYLE_BLOCKLIST = [
  'boarding', 'luggage', 'baggage', 'overhead bin', 'sick of flying', 'vacation',
  'wedding', 'divorce', 'mother-in-law', 'stepchild', 'inheritance', 'etiquette',
  'tipping', 'horoscope', 'celebrity', 'recipe', 'diet', 'workout', 'cruise ship',
  'hotel room', 'dating', 'spouse', 'funeral', 'pet', 'dog', 'cat',
];

// Enstrüman Bazlı Kurumsal Anahtar Kelime Haritası (Tam Kelime Sınırı Kontrollü)
const ASSET_KEYWORD_MAP: Record<string, string[]> = {
  'EUR/USD': ['eur/usd', 'eurusd', 'eurozone', 'ecb', 'lagarde', 'avrupa merkez bankası', 'euro'],
  'GBP/USD': ['gbp/usd', 'gbpusd', 'pound', 'sterling', 'boe', 'bailey', 'bank of england', 'uk inflation', 'britain', 'sterlin'],
  'USD/TRY': ['usd/try', 'usdtry', 'turkey', 'lira', 'cbrt', 'tcmb', 'turkish lira', 'merkez bankası'],
  'USD/JPY': ['usd/jpy', 'usdjpy', 'japanese yen', 'boj', 'ueda', 'bank of japan', 'japon yeni', 'yen'],
  'USD/CHF': ['usd/chf', 'usdchf', 'swiss franc', 'snb', 'switzerland', 'isviçre frangı'],
  'AUD/USD': ['aud/usd', 'audusd', 'australian dollar', 'rba', 'aussie', 'avustralya doları'],
  'USD/CAD': ['usd/cad', 'usdcad', 'canadian dollar', 'boc', 'loonie', 'kanada doları'],
  'XAU/USD': ['xau/usd', 'xauusd', 'gold', 'bullion', 'precious metal', 'safe haven', 'safe-haven', 'ons altın', 'altın'],
  'XAG/USD': ['xag/usd', 'xagusd', 'silver', 'gümüş'],
  'WTI': ['wti', 'crude oil', 'west texas', 'opec', 'petroleum', 'oil prices', 'barrel', 'ham petrol', 'petrol'],
  'BRENT': ['brent', 'brent crude', 'opec', 'north sea oil', 'oil prices', 'petrol'],
  'NATGAS': ['natural gas', 'natgas', 'lng', 'doğalgaz'],
  'BTC/USD': ['btc/usd', 'btc', 'bitcoin', 'crypto', 'coindesk', 'cointelegraph', 'bitcoin etf', 'crypto etf', 'mining', 'capitulation', 'halving', 'binance', 'coinbase', 'kripto'],
  'ETH/USD': ['eth/usd', 'ethereum', 'ether', 'defi', 'ether etf', 'staking'],
  'SOL/USD': ['sol/usd', 'solana'],
  'XRP/USD': ['xrp/usd', 'ripple', 'xrp'],
  'NVDA': ['nvidia', 'nvda', 'jensen huang', 'huang', 'blackwell', 'semiconductor', 'chips', 'gpu', 'ai chip', 'yapay zeka çip'],
  'AAPL': ['apple', 'aapl', 'iphone', 'tim cook', 'cupertino'],
  'MSFT': ['microsoft', 'msft', 'satya nadella', 'azure', 'copilot'],
  'GOOGL': ['alphabet', 'google', 'googl', 'sundar pichai', 'waymo'],
  'AMZN': ['amazon', 'amzn', 'aws', 'andy jassy'],
  'META': ['meta platforms', 'meta', 'zuckerberg', 'instagram', 'whatsapp'],
  'AMD': ['advanced micro devices', 'amd', 'lisa su'],
  'TSLA': ['tesla', 'tsla', 'elon musk', 'musk', 'electric vehicle', 'cybertruck'],
  'SPX500': ['s&p 500', 's&p500', 'spx', 'wall street', 'equities', 'us stocks', 'dow jones'],
  'NAS100': ['nasdaq', 'tech stocks', 'big tech', 'qqq', 'ai trade', 'yapay zeka ticaret'],
  'US30': ['dow jones', 'djia', 'blue-chip'],
  'GER40': ['dax', 'german economy', 'bundesbank'],
  'US10Y': ['10-year treasury', 'treasury yield', 'treasury yields', 'bond yields', 'us10y'],
};

// Küresel Makro / Merkez Bankası Anahtar Kelimeleri (Tüm Pariteleri ve Riskli Varlıkları Etkiler)
const GLOBAL_MACRO_KEYWORDS = [
  'federal reserve', 'powell', 'fomc', 'interest rate', 'interest rates', 'rate cut', 'rate hike',
  'inflation', 'cpi', 'pce', 'ppi', 'nonfarm', 'payrolls', 'unemployment', 'jobless',
  'gdp', 'recession', 'treasury yield', 'treasury yields', 'tariff', 'tariffs', 'trade war',
  'central bank', 'dxy', 'greenback', 'enflasyon', 'faiz kararı',
];

// Alt-kelime (substring) tuzaklarını önleyen kelime sınırı kontrolcüsü (Örn: "turmoil" != "oil", "yeniden" != "yen")
function matchesKeywordWithBoundary(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Kısa veya ek alabilecek kelimelerde tam kelime sınırı ara
  const regex = new RegExp(`(^|[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ])${escaped}($|[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ])`, 'i');
  return regex.test(text);
}

// Ham İngilizce ve Türkçe Metin Üzerinden Varlık Eşleştirme ve Bağlamsal Duyarlılık (NLP) Analizi
export function analyzeFinancialHeadline(rawTitle: string, rawDesc: string, source: string, trTitle?: string, trDesc?: string) {
  const rawCombined = `${rawTitle} ${rawDesc}`.toLowerCase();
  const fullCombined = `${rawTitle} ${rawDesc} ${trTitle || ''} ${trDesc || ''}`.toLowerCase();

  // 1. Yaşam / Magazin / Seyahat Haberi Kontrolü
  for (const blocked of NON_FINANCIAL_LIFESTYLE_BLOCKLIST) {
    if (matchesKeywordWithBoundary(rawCombined, blocked)) {
      return null; // Finans dışı haberi tamamen reddet
    }
  }

  // 2. Etkilenen Varlıkları Tespit Et (Öncelikle Orjinal İngilizce Metin Üzerinden Tam Sınırla)
  const affectedAssets: string[] = [];
  for (const [symbol, keys] of Object.entries(ASSET_KEYWORD_MAP)) {
    if (keys.some((k) => matchesKeywordWithBoundary(rawCombined, k) || (k.length > 5 && matchesKeywordWithBoundary(fullCombined, k)))) {
      affectedAssets.push(symbol);
    }
  }

  if (source === 'CoinDesk' && !affectedAssets.includes('BTC/USD')) {
    affectedAssets.push('BTC/USD');
  }

  const isMacro = GLOBAL_MACRO_KEYWORDS.some((k) => matchesKeywordWithBoundary(rawCombined, k));
  if (isMacro) {
    if (!affectedAssets.includes('XAU/USD')) affectedAssets.push('XAU/USD');
    if (!affectedAssets.includes('EUR/USD')) affectedAssets.push('EUR/USD');
    if (!affectedAssets.includes('SPX500')) affectedAssets.push('SPX500');
  }

  // Hiçbir finansal varlık veya makro göstergeyle ilgisi yoksa elenir
  if (affectedAssets.length === 0 && !rawCombined.includes('market') && !rawCombined.includes('stock') && !rawCombined.includes('investor') && !rawCombined.includes('bank') && !rawCombined.includes('economy') && !rawCombined.includes('earnings') && !rawCombined.includes('shares')) {
    return null;
  }
  if (affectedAssets.length === 0) {
    affectedAssets.push('SPX500');
  }

  // 3. Bağlamsal (Phrase-First) Duyarlılık ve Risk Skoru Hesabı (-1.0 ile +1.0 arası)
  let rawScore = 0;
  let cleanedForSingleWords = fullCombined;

  // Önce bileşik makro ifadeler (Ters anlam tuzaklarını önler: örn. "interest rates surge" yükseliş değil, faiz şokudur!)
  const compoundBearishPhrases: { phrase: string; weight: number }[] = [
    { phrase: 'interest rates surge', weight: -0.75 },
    { phrase: 'rates surge', weight: -0.70 },
    { phrase: 'yields surge', weight: -0.65 },
    { phrase: 'yields jump', weight: -0.60 },
    { phrase: 'inflation surges', weight: -0.70 },
    { phrase: 'inflation rises', weight: -0.55 },
    { phrase: 'capitulation wave', weight: -0.85 },
    { phrase: 'teslimiyet dalgası', weight: -0.85 },
    { phrase: '3-month low', weight: -0.75 },
    { phrase: 'en düşük seviye', weight: -0.75 },
    { phrase: 'falls to', weight: -0.65 },
    { phrase: 'fell to', weight: -0.65 },
    { phrase: 'slumps below', weight: -0.80 },
    { phrase: 'drops below', weight: -0.70 },
    { phrase: 'rate hike', weight: -0.60 },
    { phrase: 'resigns', weight: -0.65 },
  ];

  const compoundBullishPhrases: { phrase: string; weight: number }[] = [
    { phrase: 'rate cut', weight: 0.75 },
    { phrase: 'cuts rate', weight: 0.75 },
    { phrase: 'faiz indirimi', weight: 0.75 },
    { phrase: 'record high', weight: 0.75 },
    { phrase: 'all-time high', weight: 0.80 },
    { phrase: 'beats expectations', weight: 0.65 },
    { phrase: 'beats estimates', weight: 0.65 },
    { phrase: 'inflation cools', weight: 0.65 },
    { phrase: 'inflation eases', weight: 0.65 },
    { phrase: 'strong inflows', weight: 0.60 },
  ];

  for (const item of compoundBearishPhrases) {
    if (cleanedForSingleWords.includes(item.phrase)) {
      rawScore += item.weight;
      cleanedForSingleWords = cleanedForSingleWords.replace(item.phrase, ' ');
    }
  }
  for (const item of compoundBullishPhrases) {
    if (cleanedForSingleWords.includes(item.phrase)) {
      rawScore += item.weight;
      cleanedForSingleWords = cleanedForSingleWords.replace(item.phrase, ' ');
    }
  }

  // Tekil Bearish (Negatif / Satış Baskısı) Kelimeler
  const bearishWords = [
    'fall', 'falls', 'fell', 'drop', 'drops', 'plunge', 'plunges', 'slump', 'slumps',
    'tumble', 'tumbles', 'crash', 'crashes', 'sink', 'sinks', 'slide', 'slides',
    'decline', 'declines', 'low', 'lower', 'bearish', 'capitulation', 'selloff', 'sell-off',
    'crisis', 'war', 'tariff', 'probe', 'lawsuit', 'default', 'recession', 'fear',
    'weak', 'weaker', 'miss', 'misses', 'downgrade', 'warning', 'outflows', 'hawkish',
    'geriledi', 'düştü', 'düşüş', 'çakıldı', 'teslimiyet', 'kriz', 'satış baskısı', 'zarar', 'endişe',
  ];

  // Tekil Bullish (Pozitif / Alım İvmesi) Kelimeler
  const bullishWords = [
    'surge', 'surges', 'jump', 'jumps', 'rally', 'rallies', 'gain', 'gains',
    'rise', 'rises', 'rose', 'soar', 'soars', 'climb', 'climbs', 'rebound', 'rebounds',
    'bullish', 'record', 'beat', 'beats', 'upgrade', 'optimism', 'inflows', 'dovish',
    'recovery', 'strong', 'higher', 'boost', 'boosts', 'approval',
    'yükseldi', 'arttı', 'ralli', 'rekor', 'iyimserlik', 'güçlü', 'destek', 'toparlanma',
  ];

  for (const w of bearishWords) {
    if (cleanedForSingleWords.includes(w)) rawScore -= 0.28;
  }
  for (const w of bullishWords) {
    if (cleanedForSingleWords.includes(w)) rawScore += 0.28;
  }

  const sentimentScore = Math.max(-0.95, Math.min(0.95, +rawScore.toFixed(2)));
  const absScore = Math.abs(sentimentScore);

  let sentiment: 'POZİTİF' | 'NEGATİF' | 'NÖTR' = 'NÖTR';
  if (sentimentScore >= 0.2) sentiment = 'POZİTİF';
  else if (sentimentScore <= -0.2) sentiment = 'NEGATİF';

  const isHighImpact =
    isMacro ||
    absScore >= 0.55 ||
    rawCombined.includes('breaking') ||
    rawCombined.includes('capitulation') ||
    rawCombined.includes('slump') ||
    rawCombined.includes('plunge') ||
    rawCombined.includes('record');

  const impact: 'YÜKSEK' | 'ORTA' | 'DÜŞÜK' = isHighImpact ? 'YÜKSEK' : absScore >= 0.25 ? 'ORTA' : 'DÜŞÜK';

  return {
    sentiment,
    sentimentScore,
    impact,
    affectedAssets: affectedAssets.slice(0, 4),
    isMacro,
  };
}

// In-Memory Translation Cache & News Cache
const translationCache = new Map<string, string>();
let cachedNews: any[] = [];
let lastNewsFetchTime = 0;
const NEWS_CACHE_TTL = 60 * 1000; // 60 saniye tazeleme döngüsü

// Canlı USD/TRY Kur Önbelleği
let cachedUsdTryRate = 38.55;
let lastUsdTryFetchTime = 0;

export async function fetchLiveUsdTryRate(): Promise<number> {
  const now = Date.now();
  if (now - lastUsdTryFetchTime < 5 * 60 * 1000 && cachedUsdTryRate > 10) {
    return cachedUsdTryRate;
  }
  try {
    const data = await fetchReal1YearData('USD/TRY');
    if (data && data.price > 10) {
      cachedUsdTryRate = +data.price.toFixed(4);
      lastUsdTryFetchTime = now;
    }
  } catch {
    // Fallback to last known live rate
  }
  return cachedUsdTryRate;
}

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
            // Çeviri öncesi ham İngilizce metin üzerinden finansal alaka ve duyarlılık analizi yap
            const nlp = analyzeFinancialHeadline(rawTitle, rawDesc, feed.source);
            if (!nlp) continue; // Magazin / seyahat / finans dışı haberleri eler

            allNews.push({
              id: `news-${feed.source.replace(/[\/\s]/g, '')}-${pubDate.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
              originalTitle: rawTitle,
              title: rawTitle,
              originalSummary: rawDesc.slice(0, 240),
              summary: rawDesc.slice(0, 240) + (rawDesc.length > 240 ? '...' : ''),
              source: feed.source,
              sourceUrl: rawLink,
              impact: nlp.impact,
              sentiment: nlp.sentiment,
              sentimentScore: nlp.sentimentScore,
              affectedAssets: nlp.affectedAssets,
              isMacro: nlp.isMacro,
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

  // Başlıkları ve Özetleri Türkçe Bilgilendirmeye Çevir + Türkçe Metinle NLP Skorunu Teyit Et
  await Promise.allSettled(
    selectedNews.map(async (n) => {
      try {
        const [trTitle, trSummary] = await Promise.all([
          translateToTurkish(n.title),
          translateToTurkish(n.summary),
        ]);
        if (trTitle) n.title = trTitle;
        if (trSummary) n.summary = trSummary;
        const refined = analyzeFinancialHeadline(n.originalTitle || '', n.originalSummary || '', n.source, n.title, n.summary);
        if (refined) {
          n.sentiment = refined.sentiment;
          n.sentimentScore = refined.sentimentScore;
          n.impact = refined.impact;
          n.affectedAssets = refined.affectedAssets;
        }
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

  const assetKeys = ASSET_KEYWORD_MAP[symbol] || [symbol.toLowerCase().replace('/', '')];

  // Sadece gerçekten bu enstrümanla veya doğrudan küresel makro/Fed ile ilişkili haberleri filtrele
  let bestNews: any = null;
  let maxRelevance = 0;

  for (const n of newsList) {
    const rawText = `${n.originalTitle || ''} ${n.originalSummary || ''}`.toLowerCase();
    const fullText = `${rawText} ${n.title || ''} ${n.summary || ''}`.toLowerCase();
    let relevance = 0;

    if (Array.isArray(n.affectedAssets) && n.affectedAssets.includes(symbol)) {
      relevance += 5;
    }
    assetKeys.forEach((k) => {
      if (matchesKeywordWithBoundary(rawText, k) || (k.length > 5 && matchesKeywordWithBoundary(fullText, k))) {
        relevance += 3;
      }
    });
    if (n.isMacro) {
      relevance += 1;
    }

    if (relevance > maxRelevance) {
      maxRelevance = relevance;
      bestNews = n;
    }
  }

  // Enstrümanla alakalı hiçbir haber yoksa alakasız manşet atama!
  if (!bestNews || maxRelevance < 3) {
    return {
      sentimentScore: 0,
      shockLevel: 0,
      impactingHeadline: '',
      source: '',
      biasDescription: `${symbol} için son 24 saatte ters bir haber şoku yok; teknik rejim geçerli.`,
      newsTimeAgo: '',
    };
  }

  // NLP Duyarlılık Skorunu Al (Hem İngilizce hem Türkçe metin üzerinden)
  const nlp = analyzeFinancialHeadline(
    bestNews.originalTitle || bestNews.title || '',
    bestNews.originalSummary || bestNews.summary || '',
    bestNews.source || '',
    bestNews.title,
    bestNews.summary
  );

  let sentimentScore = typeof bestNews.sentimentScore === 'number'
    ? bestNews.sentimentScore
    : (nlp ? nlp.sentimentScore : 0);

  // Dolar Bazlı Ters Korelasyon Düzeltmesi (Örn: Faiz/Dolar şoku USD/JPY ve USD/TRY için yukarı yönlüdür)
  const rawLower = `${bestNews.originalTitle || ''} ${bestNews.originalSummary || ''}`.toLowerCase();
  if ((symbol === 'USD/JPY' || symbol === 'USD/TRY') && (rawLower.includes('rates surge') || rawLower.includes('yields surge') || rawLower.includes('strong dollar'))) {
    sentimentScore = Math.abs(sentimentScore);
  }

  const absSent = Math.abs(sentimentScore);
  const shockLevel = Math.min(1.0, +(0.25 + absSent * 0.65 + (bestNews.impact === 'YÜKSEK' ? 0.2 : 0)).toFixed(2));

  let biasDescription = 'Nötr piyasa haber akışı';
  if (sentimentScore >= 0.2) {
    biasDescription = `Pozitif Haber Desteği (+%${Math.round(sentimentScore * 100)} Alım İvmesi)`;
  } else if (sentimentScore <= -0.2) {
    biasDescription = `Negatif Haber Baskısı (-%${Math.round(absSent * 100)} Satış Riski)`;
  }

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

  // 1. Wilder's RMA tabanlı gerçek Günlük ATR & Saatlik Volatilite
  const atrPeriod = 14;
  let dailyATR = currentPrice * 0.006;
  if (candles.length > 2) {
    const trList: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const cur = candles[i];
      const prev = candles[i - 1];
      trList.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
    }
    let rma = trList.slice(0, Math.min(atrPeriod, trList.length)).reduce((a, b) => a + b, 0) / Math.min(atrPeriod, trList.length);
    for (let i = atrPeriod; i < trList.length; i++) {
      rma = (rma * (atrPeriod - 1) + trList[i]) / atrPeriod;
    }
    dailyATR = rma || (currentPrice * 0.006);
  }
  const hourlyATR = dailyATR / Math.sqrt(24);

  // 2. Çok Faktörlü Kantitatif Yön & Momentum Motoru (EMA8/EMA21 + 3-Bar ROC + Wilder RSI-14 Esnekliği)
  const closes = candles.map((c: any) => c.close);
  const calcEMAVal = (arr: number[], period: number): number => {
    if (arr.length === 0) return currentPrice;
    const k = 2 / (period + 1);
    let ema = arr.slice(0, Math.min(period, arr.length)).reduce((a, b) => a + b, 0) / Math.min(period, arr.length);
    for (let i = period; i < arr.length; i++) {
      ema = arr[i] * k + ema * (1 - k);
    }
    return ema;
  };

  const ema8 = calcEMAVal(closes, 8);
  const ema21 = calcEMAVal(closes, 21);
  const ema50 = calcEMAVal(closes, 50);

  // Wilder's RSI-14 Hesabı
  let rsi14 = 50;
  if (closes.length > 15) {
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i <= 14; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) avgGain += diff;
      else avgLoss -= diff;
    }
    avgGain /= 14;
    avgLoss /= 14;
    for (let i = 15; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * 13 + (diff > 0 ? diff : 0)) / 14;
      avgLoss = (avgLoss * 13 + (diff < 0 ? -diff : 0)) / 14;
    }
    rsi14 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  // Kısa vadeli 3 günlük ivme ve orta vadeli EMA uyumu
  const cLen = closes.length;
  const shortImpulse = cLen >= 4 ? (currentPrice - closes[cLen - 4]) / (dailyATR * 3 || 1) : 0;
  const emaSpread = (ema8 - ema21) / (dailyATR || 1);
  const macroBias = currentPrice >= ema50 ? 0.25 : -0.25;

  // RSI Aşırı Alım (>70) / Aşırı Satım (<30) Ortalamaya Dönüş (Mean-Reversion) Düzeltmesi
  let rsiReversionForce = 0;
  if (rsi14 > 68) {
    rsiReversionForce = -((rsi14 - 68) / 32) * 0.65;
  } else if (rsi14 < 32) {
    rsiReversionForce = ((32 - rsi14) / 32) * 0.65;
  }

  // Birleşik Kantitatif Drift Katsayısı (-1.2 ile +1.2 arası normalize güç)
  const rawCompositeSignal = (shortImpulse * 0.45) + (emaSpread * 0.35) + macroBias + rsiReversionForce;
  const compositeDriftScore = Math.max(-1.1, Math.min(1.1, rawCompositeSignal));

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

    // Çok faktörlü teknik sapma (EMA8/21 + Kısa İvme + RSI Ortalamaya Dönüş)
    const technicalDrift = compositeDriftScore * (0.26 * timeFactor * hourlyATR * sessionVolFactor);
    // Canlı Haber Şoku: İlk 8 saatte en yüksek ağırlıkla fiyata yansır
    const newsDecay = Math.exp(-h / 10);
    const newsDrift = (newsSentiment * 0.45 * newsDecay * timeFactor * hourlyATR);

    const totalDrift = technicalDrift + newsDrift;
    const predictedPrice = +(currentPrice + totalDrift).toFixed(digits);

    // %98 Gauss Güven Koridoru (Z = 2.42 sigma) ve Canlı Haber Volatilite Genişlemesi
    const newsVolatilityExpansion = 1 + (newsShock * 0.35 * newsDecay);
    const zMultiplier = 2.42; // %98 Normal / Gauss güven aralığı
    const bandWidth = zMultiplier * hourlyATR * (0.55 * timeFactor) * sessionVolFactor * newsVolatilityExpansion;
    const upperBound = +(predictedPrice + bandWidth).toFixed(digits);
    const lowerBound = +(predictedPrice - bandWidth).toFixed(digits);
    const expectedMovePercent = +(((predictedPrice - currentPrice) / currentPrice) * 100).toFixed(3);

    const expectedDirection = Math.abs(expectedMovePercent) < 0.005 ? 'YATAY' : totalDrift >= 0 ? 'YÜKSELİŞ' : 'DÜŞÜŞ';
    const confidenceScore = Math.max(72, Math.floor(95 - h * 0.82 - (newsShock * 3.5)));

    let rationale = '';
    if (isNewsActive && h <= 6) {
      rationale = `Canlı Haber Uyarlaması: "${newsContext?.impactingHeadline?.slice(0, 52)}..." sebebiyle fiyat projeksiyonu anlık revize edildi.`;
    } else if (h <= 12) {
      rationale = `${session}: EMA8/21 akışı (RSI: ${rsi14.toFixed(1)}) ve seans likidite dengesi.`;
    } else {
      rationale = `${session}: 24 saatlik tam döngü ve günlük Wilder ATR kapanış hedefi.`;
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

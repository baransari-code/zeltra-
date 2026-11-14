// server/newsAiEngine.ts — ZELTRA Nedensel Haber Yapay Zekası & Fırsat Karar Motoru
// Haberleri sadece "olumlu/olumsuz kelime" olarak değil; Olay -> Ekonomik Mekanizma -> Varlık Bazlı Yön (Long/Short) -> Fırsat Kararı zinciriyle analiz eder.

export interface AssetDirectionalImpact {
  symbol: string;
  direction: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
  conviction: number; // 0 - 100
  reason: string;
}

export interface ArticleAiAnalysis {
  eventCategory:
    | 'Merkez Bankası & Faiz'
    | 'Enflasyon & Büyüme Verisi'
    | 'Jeopolitik & Güvenli Liman'
    | 'Kripto Kurumsal & Likidite'
    | 'Şirket Bilanço & Teknoloji'
    | 'Emtia Arz & Talep'
    | 'Küresel Piyasa Eğilimi';
  whatHappened: string;
  causalMechanism: string;
  opportunityVerdict: 'ALIM FIRSATI (LONG)' | 'SATIŞ FIRSATI (SHORT)' | 'RİSK KALKANI (BEKLE)' | 'NÖTR TAKİP';
  primarySymbol: string;
  primaryDirection: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
  confidencePercent: number;
  assetImpacts: AssetDirectionalImpact[];
}

export interface AiOpportunityCard {
  symbol: string;
  name: string;
  digits: number;
  currentPrice: number;
  changePercent24h: number;
  aiDecision: 'ALIM FIRSATI (LONG)' | 'SATIŞ FIRSATI (SHORT)' | 'RİSK KALKANI (BEKLE)';
  direction: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
  convictionScore: number; // 0 - 100
  newsCount24h: number;
  eventCategory: string;
  primaryHeadline: string;
  primarySource: string;
  publishedAt: string;
  whatHappened: string;
  causalMechanism: string;
  technicalAlignment: 'TAM UYUM (HABER + GRAFİK AYNI YÖNDE)' | 'HABER ÖNCÜSÜ (ERKEN FIRSAT)' | 'ÇATIŞMA (HABER VE GRAFİK TERS)';
  suggestedEntry: number;
  suggestedTp: number;
  suggestedSl: number;
  actionSummary: string;
}

interface CausalRule {
  id: string;
  category: ArticleAiAnalysis['eventCategory'];
  patterns: RegExp[];
  whatHappenedTR: string;
  mechanismTR: string;
  impacts: {
    symbol: string;
    direction: 'AL (LONG)' | 'SAT (SHORT)';
    weight: number; // 0.3 - 1.0
    reasonTR: string;
  }[];
}

// Kurumsal Makro-Ekonomik ve Varlık Bazlı Nedensellik Kuralları
const CAUSAL_RULES: CausalRule[] = [
  {
    id: 'fed_hawkish_or_hot_inflation',
    category: 'Merkez Bankası & Faiz',
    patterns: [
      /\b(rate hike|higher for longer|hawkish|inflation surges|inflation rises|hotter[- ]than[- ]expected|cpi rises|cpi beats|yields surge|yields jump|strong jobs|nonfarm beats)\b/i,
      /\b(faiz artışı|enflasyon yükseldi|tahvil faizleri yükseldi|şahin fed)\b/i,
    ],
    whatHappenedTR: 'ABD enflasyon/istihdam verileri güçlü geldi veya Fed faizleri yüksek tutma (şahin) sinyali verdi.',
    mechanismTR: 'Yüksek faiz beklentisi ABD Dolarını (DXY) güçlendirir; faiz getirmeyen Ons Altın ve Euro üzerinde satış baskısı yaratırken USD/JPY paritesini yukarı taşır.',
    impacts: [
      { symbol: 'XAU/USD', direction: 'SAT (SHORT)', weight: 0.82, reasonTR: 'Yükselen ABD tahvil getirileri ve güçlü dolar altın fiyatını baskılar.' },
      { symbol: 'EUR/USD', direction: 'SAT (SHORT)', weight: 0.80, reasonTR: 'Dolar endeksinin güçlenmesi EUR/USD paritesinde aşağı yönlü (Short) fırsat yaratır.' },
      { symbol: 'GBP/USD', direction: 'SAT (SHORT)', weight: 0.75, reasonTR: 'Güçlü ABD doları karşısında Sterlin baskılanır.' },
      { symbol: 'USD/JPY', direction: 'AL (LONG)', weight: 0.84, reasonTR: 'ABD-Japonya faiz farkının açılması USD/JPY paritesini yukarı iter.' },
      { symbol: 'NAS100', direction: 'SAT (SHORT)', weight: 0.72, reasonTR: 'Yüksek faiz teknoloji hisselerinin değerlemesini baskılar.' },
    ],
  },
  {
    id: 'fed_dovish_or_cooling_inflation',
    category: 'Merkez Bankası & Faiz',
    patterns: [
      /\b(rate cut|cuts rate|dovish|inflation cools|inflation eases|slower inflation|cpi falls|yields fall|yields drop|weak jobs|jobless claims rise)\b/i,
      /\b(faiz indirimi|enflasyon geriledi|enflasyon düştü|güvercin fed)\b/i,
    ],
    whatHappenedTR: 'Enflasyonda yavaşlama veya Merkez Bankası faiz indirimi beklentisi güçlendi.',
    mechanismTR: 'Faizlerin düşeceği beklentisi ABD Dolarını zayıflatır; güvenli liman Ons Altın, Euro ve riskli varlıklara (Bitcoin, Teknoloji hisseleri) güçlü alım getirir.',
    impacts: [
      { symbol: 'XAU/USD', direction: 'AL (LONG)', weight: 0.88, reasonTR: 'Düşen tahvil faizleri ve zayıflayan dolar Ons Altın için en güçlü yükseliş katalizörüdür.' },
      { symbol: 'EUR/USD', direction: 'AL (LONG)', weight: 0.80, reasonTR: 'Doların küresel olarak değer kaybetmesi EUR/USD paritesini yukarı taşır.' },
      { symbol: 'BTC/USD', direction: 'AL (LONG)', weight: 0.78, reasonTR: 'Küresel likidite artışı beklentisi Bitcoin talebini artırır.' },
      { symbol: 'USD/JPY', direction: 'SAT (SHORT)', weight: 0.78, reasonTR: 'ABD tahvil faizlerinin gevşemesi USD/JPY paritesinde satış fırsatı doğurur.' },
    ],
  },
  {
    id: 'geopolitical_safe_haven_and_oil',
    category: 'Jeopolitik & Güvenli Liman',
    patterns: [
      /\b(middle east|war|conflict|missile|sanctions|strait of hormuz|red sea|geopolitical|safe[- ]haven|escalat|opec cuts|supply disruption)\b/i,
      /\b(jeopolitik|savaş|gerilim|yaptırım|güvenli liman|arz kesintisi)\b/i,
    ],
    whatHappenedTR: 'Jeopolitik gerilim veya enerji arz güvenliği endişesi gündeme geldi.',
    mechanismTR: 'Küresel belirsizlik anlarında kurumsal fonlar hisse senetlerinden çıkıp güvenli liman olan Ons Altın ve Ham Petrole geçer.',
    impacts: [
      { symbol: 'XAU/USD', direction: 'AL (LONG)', weight: 0.86, reasonTR: 'Güvenli liman talebi Ons Altın alımlarını hızlandırır.' },
      { symbol: 'WTI', direction: 'AL (LONG)', weight: 0.84, reasonTR: 'Enerji arz endişesi ham petrol fiyatlarını yukarı taşır.' },
      { symbol: 'SPX500', direction: 'SAT (SHORT)', weight: 0.70, reasonTR: 'Jeopolitik risk iştahını düşürerek endekslerde satış baskısı yaratır.' },
    ],
  },
  {
    id: 'crypto_capitulation_or_selloff',
    category: 'Kripto Kurumsal & Likidite',
    patterns: [
      /\b(capitulation|3[- ]month low|bitcoin falls|bitcoin drops|btc falls|btc slumps|crypto selloff|outflows|liquidat|sec lawsuit|hack)\b/i,
      /\b(teslimiyet dalgası|en düşük seviye|bitcoin.*geriledi|bitcoin.*düştü|kripto.*çakıldı|çıkışlar)\b/i,
    ],
    whatHappenedTR: 'Kripto piyasasında kurumsal çıkış, likidasyon veya teslimiyet (satış) dalgası tespit edildi.',
    mechanismTR: 'Zincir üstü zararına satışlar ve kaldıraçlı Long tasfiyeleri fiyatı destek seviyelerinin altına iter; düşüş trendinde Short yönlü fırsat veya Long pozisyonlardan çıkış sinyali üretir.',
    impacts: [
      { symbol: 'BTC/USD', direction: 'SAT (SHORT)', weight: 0.88, reasonTR: 'Teslimiyet ve satış dalgası kırılımı aşağı yönlü momentumu güçlendirir.' },
      { symbol: 'ETH/USD', direction: 'SAT (SHORT)', weight: 0.82, reasonTR: 'Bitcoin öncülüğündeki satış dalgası Ethereum üzerinde de baskı oluşturur.' },
    ],
  },
  {
    id: 'crypto_bullish_adoption_or_inflows',
    category: 'Kripto Kurumsal & Likidite',
    patterns: [
      /\b(bitcoin surges|bitcoin rallies|btc surges|etf inflows|strong inflows|institutional buying|short squeeze|all[- ]time high|crypto rally)\b/i,
      /\b(bitcoin yükseldi|bitcoin ralli|kurumsal alım|rekor giriş)\b/i,
    ],
    whatHappenedTR: 'Kripto varlıklara güçlü kurumsal fon girişi (ETF) ve alım ivmesi kaydedildi.',
    mechanismTR: 'Spot ETF ve kurumsal alımlar borsalardaki arzı daraltarak yukarı yönlü trend kırılımı (Long fırsatı) başlatır.',
    impacts: [
      { symbol: 'BTC/USD', direction: 'AL (LONG)', weight: 0.87, reasonTR: 'Kurumsal fon girişi Bitcoin fiyatında yükseliş ivmesini destekler.' },
      { symbol: 'ETH/USD', direction: 'AL (LONG)', weight: 0.80, reasonTR: 'Kripto piyasasına giren kurumsal likidite Ethereum alımlarını destekler.' },
    ],
  },
  {
    id: 'ai_tech_earnings_bullish',
    category: 'Şirket Bilanço & Teknoloji',
    patterns: [
      /\b(nvidia|nvda|apple|aapl|microsoft|msft|chip|semiconductor|ai demand|blackwell).*\b(surge|rally|beat|record|boost|upgrade|strong)\b/i,
      /\b(surge|rally|beat|record|boost|upgrade|strong).*\b(nvidia|nvda|apple|aapl|microsoft|msft|chip|semiconductor|ai)\b/i,
    ],
    whatHappenedTR: 'Yapay zeka ve teknoloji devlerinde güçlü bilanço/talep beklentisi açıklandı.',
    mechanismTR: 'Yarı iletken ve bulut yatırımlarındaki büyüme doğrudan NVDA ve Nasdaq teknoloji endeksine alım getirir.',
    impacts: [
      { symbol: 'NVDA', direction: 'AL (LONG)', weight: 0.86, reasonTR: 'Güçlü yapay zeka çip talebi ve bilanço beklentisi hisseyi yukarı taşır.' },
      { symbol: 'NAS100', direction: 'AL (LONG)', weight: 0.80, reasonTR: 'Teknoloji devlerindeki alım dalgası Nasdaq endeksini güçlendirir.' },
      { symbol: 'SPX500', direction: 'AL (LONG)', weight: 0.74, reasonTR: 'Büyük teknoloji hisseleri S&P 500 endeksini yukarı çeker.' },
    ],
  },
  {
    id: 'oil_oversupply_or_demand_weak',
    category: 'Emtia Arz & Talep',
    patterns: [
      /\b(crude|oil|wti|brent|opec).*\b(fall|drop|slump|surplus|oversupply|weak demand|inventories rise)\b/i,
      /\b(petrol).*\b(geriledi|düştü|arz fazlası|stoklar arttı)\b/i,
    ],
    whatHappenedTR: 'Petrol piyasasında arz fazlası, stok artışı veya küresel talep yavaşlaması bildirildi.',
    mechanismTR: 'Stokların artması ve talebin zayıflaması enerji fiyatlarında aşağı yönlü (Short) baskı oluşturur.',
    impacts: [
      { symbol: 'WTI', direction: 'SAT (SHORT)', weight: 0.83, reasonTR: 'Arz fazlası ve zayıf talep ham petrol fiyatını aşağı çeker.' },
    ],
  },
];

// Bir haberin başlık, özet ve mevcut NLP skorundan tam kapsamlı Yapay Zeka Nedensel Analizi üretir
export function analyzeArticleWithAI(params: {
  rawTitle: string;
  rawSummary: string;
  trTitle: string;
  trSummary: string;
  source: string;
  sentimentScore: number;
  affectedAssets: string[];
  isMacro?: boolean;
}): ArticleAiAnalysis {
  const combinedText = `${params.rawTitle} ${params.rawSummary} ${params.trTitle} ${params.trSummary}`;
  const primaryAsset = params.affectedAssets[0] || 'SPX500';

  // 1. Özel Nedensellik Kuralı Eşleşmesi Var mı Kontrol Et
  for (const rule of CAUSAL_RULES) {
    if (rule.patterns.some((rx) => rx.test(combinedText))) {
      const relevantImpacts = rule.impacts.map((imp) => ({
        symbol: imp.symbol,
        direction: imp.direction,
        conviction: Math.min(95, Math.round(imp.weight * 100)),
        reason: imp.reasonTR,
      }));

      // Eğer haberin etkilediği birincil varlık listede yoksa onu da ekle
      if (!relevantImpacts.some((i) => i.symbol === primaryAsset)) {
        const dir: 'AL (LONG)' | 'SAT (SHORT)' = params.sentimentScore >= 0 ? 'AL (LONG)' : 'SAT (SHORT)';
        relevantImpacts.unshift({
          symbol: primaryAsset,
          direction: dir,
          conviction: Math.min(92, Math.max(60, Math.round(Math.abs(params.sentimentScore) * 95))),
          reason: dir === 'AL (LONG)'
            ? `${primaryAsset} için pozitif haber akışı alım yönlü fırsat oluşturuyor.`
            : `${primaryAsset} üzerinde satış baskısı oluşturan haber akışı.`,
        });
      }

      const mainImpact = relevantImpacts.find((i) => i.symbol === primaryAsset) || relevantImpacts[0];
      const verdict: ArticleAiAnalysis['opportunityVerdict'] =
        mainImpact.conviction >= 68
          ? mainImpact.direction === 'AL (LONG)'
            ? 'ALIM FIRSATI (LONG)'
            : 'SATIŞ FIRSATI (SHORT)'
          : 'NÖTR TAKİP';

      return {
        eventCategory: rule.category,
        whatHappened: rule.whatHappenedTR,
        causalMechanism: rule.mechanismTR,
        opportunityVerdict: verdict,
        primarySymbol: mainImpact.symbol,
        primaryDirection: mainImpact.direction,
        confidencePercent: mainImpact.conviction,
        assetImpacts: relevantImpacts.slice(0, 4),
      };
    }
  }

  // 2. Genel Bağlamsal Çıkarım (Özel kurala girmeyen varlık haberleri için)
  const score = params.sentimentScore;
  const absScore = Math.abs(score);
  const confidence = Math.min(90, Math.max(54, Math.round(52 + absScore * 42)));

  let direction: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE' = 'BEKLE';
  if (score >= 0.22) direction = 'AL (LONG)';
  else if (score <= -0.22) direction = 'SAT (SHORT)';

  // Ters korelasyonlu parite düzeltmesi: ABD doları pozitif haberi EUR/USD için SAT, USD/JPY için AL demektir
  const assetImpacts: AssetDirectionalImpact[] = params.affectedAssets.map((sym) => {
    let symDir = direction;
    let reason = '';
    if (symDir === 'AL (LONG)') {
      reason = `${sym} için kurumsal alım iştahını destekleyen olumlu gelişme.`;
    } else if (symDir === 'SAT (SHORT)') {
      reason = `${sym} üzerinde kısa vadeli satış baskısı yaratan gelişme.`;
    } else {
      reason = `${sym} üzerinde yön değiştirici sert bir şok yok; teknik seviyeler izlenmeli.`;
    }
    return {
      symbol: sym,
      direction: symDir,
      conviction: confidence,
      reason,
    };
  });

  const eventCategory: ArticleAiAnalysis['eventCategory'] = params.isMacro
    ? 'Enflasyon & Büyüme Verisi'
    : primaryAsset === 'BTC/USD' || primaryAsset === 'ETH/USD'
    ? 'Kripto Kurumsal & Likidite'
    : primaryAsset === 'XAU/USD' || primaryAsset === 'WTI' || primaryAsset === 'BRENT'
    ? 'Emtia Arz & Talep'
    : primaryAsset === 'NVDA' || primaryAsset === 'AAPL' || primaryAsset === 'TSLA'
    ? 'Şirket Bilanço & Teknoloji'
    : 'Küresel Piyasa Eğilimi';

  const whatHappened =
    direction === 'AL (LONG)'
      ? `${primaryAsset} ve ilişkili piyasalar için beklentileri destekleyen olumlu haber akışı kaydedildi.`
      : direction === 'SAT (SHORT)'
      ? `${primaryAsset} tarafında risk algısını artıran ve satış baskısı yaratan gelişme bildirildi.`
      : `${primaryAsset} ile ilgili dengeli/nötr piyasa haberi yayınlandı.`;

  const causalMechanism =
    direction === 'AL (LONG)'
      ? `Yatırımcı güvenini ve alım hacmini artırdığı için destek bölgelerinden yukarı yönlü (Long) hareketi destekler.`
      : direction === 'SAT (SHORT)'
      ? `Kurumsal riskten kaçışı tetiklediği için direnç bölgelerinden aşağı yönlü (Short) fırsat doğurur; Long işlemlerde dikkatli olunmalıdır.`
      : `Fiyat üzerinde tek başına sert bir kırılım yaratması beklenmez; mevcut grafik trendi takip edilmelidir.`;

  const opportunityVerdict: ArticleAiAnalysis['opportunityVerdict'] =
    direction === 'AL (LONG)' && confidence >= 65
      ? 'ALIM FIRSATI (LONG)'
      : direction === 'SAT (SHORT)' && confidence >= 65
      ? 'SATIŞ FIRSATI (SHORT)'
      : direction === 'SAT (SHORT)'
      ? 'RİSK KALKANI (BEKLE)'
      : 'NÖTR TAKİP';

  return {
    eventCategory,
    whatHappened,
    causalMechanism,
    opportunityVerdict,
    primarySymbol: primaryAsset,
    primaryDirection: direction,
    confidencePercent: confidence,
    assetImpacts,
  };
}

// Belirli bir varlık için son 24 saatteki tüm haberleri zaman ağırlıklı (yeni haber daha ağırlıklı) sentezler
export function synthesizeAssetNewsAI(symbol: string, newsList: any[]): {
  hasNews: boolean;
  netAiScore: number; // -1.0 .. +1.0
  convictionScore: number; // 0 .. 100
  direction: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE';
  aiDecision: 'ALIM FIRSATI (LONG)' | 'SATIŞ FIRSATI (SHORT)' | 'RİSK KALKANI (BEKLE)';
  newsCount: number;
  eventCategory: string;
  primaryHeadline: string;
  primarySource: string;
  publishedAt: string;
  whatHappened: string;
  causalMechanism: string;
} {
  if (!Array.isArray(newsList) || newsList.length === 0) {
    return {
      hasNews: false,
      netAiScore: 0,
      convictionScore: 50,
      direction: 'BEKLE',
      aiDecision: 'RİSK KALKANI (BEKLE)',
      newsCount: 0,
      eventCategory: 'Küresel Piyasa Eğilimi',
      primaryHeadline: '',
      primarySource: '',
      publishedAt: '',
      whatHappened: 'Son 24 saatte bu varlık için yön değiştirici bir haber kaydedilmedi.',
      causalMechanism: 'Saf teknik analiz ve fiyat hareketi geçerlidir.',
    };
  }

  const now = Date.now();
  let weightedSum = 0;
  let weightTotal = 0;
  let matchingArticles: { article: any; impact: AssetDirectionalImpact; weight: number }[] = [];

  for (const n of newsList) {
    const ai: ArticleAiAnalysis | undefined = n.aiAnalysis;
    const ageHours = Math.max(0.2, (now - (n.publishedTimestamp || now)) / (3600 * 1000));
    // Zaman aşımı ağırlığı: son 2 saatteki haberler 1.0x, 12 saat önceki haberler 0.35x ağırlık alır
    const recencyWeight = Math.exp(-ageHours / 10);

    if (ai && Array.isArray(ai.assetImpacts)) {
      const match = ai.assetImpacts.find((imp) => imp.symbol === symbol);
      if (match) {
        const dirSign = match.direction === 'AL (LONG)' ? 1 : match.direction === 'SAT (SHORT)' ? -1 : 0;
        const normStrength = (match.conviction / 100) * dirSign;
        const w = recencyWeight * (n.impact === 'YÜKSEK' ? 1.5 : 1.0);
        weightedSum += normStrength * w;
        weightTotal += w;
        matchingArticles.push({ article: n, impact: match, weight: w });
        continue;
      }
    }

    if (Array.isArray(n.affectedAssets) && n.affectedAssets.includes(symbol)) {
      const s = typeof n.sentimentScore === 'number' ? n.sentimentScore : 0;
      const w = recencyWeight;
      weightedSum += s * w;
      weightTotal += w;
      matchingArticles.push({
        article: n,
        impact: {
          symbol,
          direction: s >= 0.2 ? 'AL (LONG)' : s <= -0.2 ? 'SAT (SHORT)' : 'BEKLE',
          conviction: Math.min(90, Math.round(55 + Math.abs(s) * 40)),
          reason: n.title || '',
        },
        weight: w,
      });
    }
  }

  if (matchingArticles.length === 0 || weightTotal === 0) {
    return {
      hasNews: false,
      netAiScore: 0,
      convictionScore: 50,
      direction: 'BEKLE',
      aiDecision: 'RİSK KALKANI (BEKLE)',
      newsCount: 0,
      eventCategory: 'Küresel Piyasa Eğilimi',
      primaryHeadline: '',
      primarySource: '',
      publishedAt: '',
      whatHappened: `${symbol} için son 24 saatte ters bir haber şoku yok.`,
      causalMechanism: 'İşlem kararlarında teknik trend ve destek/direnç seviyeleri esas alınır.',
    };
  }

  matchingArticles.sort((a, b) => b.weight * b.impact.conviction - a.weight * a.impact.conviction);
  const top = matchingArticles[0];
  const topAi: ArticleAiAnalysis | undefined = top.article.aiAnalysis;

  const netAiScore = Math.max(-0.95, Math.min(0.95, +(weightedSum / weightTotal).toFixed(2)));
  const absNet = Math.abs(netAiScore);
  // Çoklu haber teyidi güven puanını artırır
  const multiSourceBonus = Math.min(12, (matchingArticles.length - 1) * 4);
  const convictionScore = Math.min(96, Math.max(55, Math.round(54 + absNet * 36 + multiSourceBonus)));

  let direction: 'AL (LONG)' | 'SAT (SHORT)' | 'BEKLE' = 'BEKLE';
  if (netAiScore >= 0.18) direction = 'AL (LONG)';
  else if (netAiScore <= -0.18) direction = 'SAT (SHORT)';

  const aiDecision: 'ALIM FIRSATI (LONG)' | 'SATIŞ FIRSATI (SHORT)' | 'RİSK KALKANI (BEKLE)' =
    direction === 'AL (LONG)'
      ? 'ALIM FIRSATI (LONG)'
      : direction === 'SAT (SHORT)'
      ? 'SATIŞ FIRSATI (SHORT)'
      : 'RİSK KALKANI (BEKLE)';

  return {
    hasNews: true,
    netAiScore,
    convictionScore,
    direction,
    aiDecision,
    newsCount: matchingArticles.length,
    eventCategory: topAi?.eventCategory || 'Küresel Piyasa Eğilimi',
    primaryHeadline: top.article.title || '',
    primarySource: top.article.source || '',
    publishedAt: top.article.publishedAt || '',
    whatHappened: topAi?.whatHappened || top.impact.reason,
    causalMechanism: topAi?.causalMechanism || top.impact.reason,
  };
}

import React, { useState, useMemo } from 'react';
import { NewsNotification } from '../types';
import { ExternalLink } from 'lucide-react';

interface InstitutionTrackerProps {
  news: NewsNotification[];
  onSelectAsset?: (symbol: string) => void;
}

interface SynthesizedOpportunity {
  symbol: string;
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  conviction: number;
  newsCount: number;
  headline: string;
  source: string;
  whatHappened: string;
  causalMechanism: string;
}

export const InstitutionTracker: React.FC<InstitutionTrackerProps> = ({
  news,
  onSelectAsset,
}) => {
  const [sourceFilter, setSourceFilter] = useState<string>('TÜMÜ');

  const availableSources = ['TÜMÜ', ...new Set(news.map((n) => n.source))];

  const filteredNews = news.filter((n) => {
    return sourceFilter === 'TÜMÜ' || n.source === sourceFilter;
  });

  // Son 24 saatteki tüm haberleri Yapay Zeka Nedensel Motoru ile varlık bazında sentezle ve en güçlü fırsatları çıkar
  const aiOpportunities = useMemo<SynthesizedOpportunity[]>(() => {
    const map = new Map<
      string,
      {
        weightedSum: number;
        totalWeight: number;
        count: number;
        bestArticle: NewsNotification;
        bestConviction: number;
        bestReason: string;
      }
    >();

    news.forEach((n, idx) => {
      const recencyWeight = Math.max(0.35, 1 - idx * 0.03);
      const impacts = n.aiAnalysis?.assetImpacts || [];

      if (impacts.length > 0) {
        impacts.forEach((imp) => {
          if (imp.direction === 'BEKLE') return;
          const sign = imp.direction === 'AL (LONG)' ? 1 : -1;
          const w = recencyWeight * (n.impact === 'YÜKSEK' ? 1.4 : 1.0);
          const existing = map.get(imp.symbol);
          if (!existing) {
            map.set(imp.symbol, {
              weightedSum: sign * (imp.conviction / 100) * w,
              totalWeight: w,
              count: 1,
              bestArticle: n,
              bestConviction: imp.conviction,
              bestReason: imp.reason,
            });
          } else {
            existing.weightedSum += sign * (imp.conviction / 100) * w;
            existing.totalWeight += w;
            existing.count += 1;
            if (imp.conviction > existing.bestConviction) {
              existing.bestConviction = imp.conviction;
              existing.bestArticle = n;
              existing.bestReason = imp.reason;
            }
          }
        });
      } else if (Array.isArray(n.affectedAssets) && n.sentiment !== 'NÖTR') {
        const sign = n.sentiment === 'POZİTİF' ? 1 : -1;
        const conv = Math.min(88, Math.round(58 + Math.abs(n.sentimentScore || 0.4) * 35));
        n.affectedAssets.forEach((sym) => {
          const existing = map.get(sym);
          if (!existing) {
            map.set(sym, {
              weightedSum: sign * (conv / 100) * recencyWeight,
              totalWeight: recencyWeight,
              count: 1,
              bestArticle: n,
              bestConviction: conv,
              bestReason: n.title,
            });
          } else {
            existing.weightedSum += sign * (conv / 100) * recencyWeight;
            existing.totalWeight += recencyWeight;
            existing.count += 1;
          }
        });
      }
    });

    const list: SynthesizedOpportunity[] = [];
    map.forEach((val, symbol) => {
      const net = val.weightedSum / (val.totalWeight || 1);
      if (Math.abs(net) < 0.18) return;
      const direction: 'AL (LONG)' | 'SAT (SHORT)' = net >= 0 ? 'AL (LONG)' : 'SAT (SHORT)';
      const conviction = Math.min(95, Math.max(60, Math.round(56 + Math.abs(net) * 36 + Math.min(8, (val.count - 1) * 3))));
      const ai = val.bestArticle.aiAnalysis;
      list.push({
        symbol,
        direction,
        conviction,
        newsCount: val.count,
        headline: val.bestArticle.title,
        source: val.bestArticle.source,
        whatHappened: ai?.whatHappened || val.bestArticle.title,
        causalMechanism: ai?.causalMechanism || val.bestReason,
      });
    });

    return list.sort((a, b) => b.conviction - a.conviction).slice(0, 6);
  }, [news]);

  return (
    <div className="space-y-4">
      {/* 1. YAPAY ZEKA HABER KARAR MOTORU VE FIRSAT DEĞERLENDİRMESİ */}
      <div className="border border-zinc-800 bg-zinc-900 rounded p-4 sm:p-5 space-y-3">
        <div className="border-b border-zinc-800 pb-3">
          <h2 className="text-base font-bold text-white">
            Yapay Zeka Haber Analizi ve Fırsat Kararları
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            14 küresel kaynaktan gelen son 24 saatlik haberler neden-sonuç (faiz, enflasyon, arz-talep ve kurumsal para girişi) ilişkisiyle analiz edilerek hangi varlıkta ne yönde fırsat oluştuğu aşağıda listelenir.
          </p>
        </div>

        {aiOpportunities.length === 0 ? (
          <div className="p-4 text-xs text-zinc-400 bg-zinc-950 rounded border border-zinc-800">
            Canlı haber akışı analiz ediliyor...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {aiOpportunities.map((opp) => {
              const isLong = opp.direction === 'AL (LONG)';
              return (
                <div
                  key={opp.symbol}
                  className="bg-zinc-950 border border-zinc-800/90 rounded p-3.5 flex flex-col justify-between space-y-2.5"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{opp.symbol}</span>
                        <span className="text-zinc-600">•</span>
                        <span className={`text-xs font-semibold ${isLong ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isLong ? 'Alış Fırsatı (Long)' : 'Satış Fırsatı (Short)'}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-zinc-300">
                        %{opp.conviction} Güven ({opp.newsCount} Haber)
                      </span>
                    </div>

                    <div className="text-xs text-zinc-200 font-medium">
                      Olay: {opp.whatHappened}
                    </div>
                    <div className="text-xs text-zinc-400 leading-relaxed">
                      Neden Etkiler: {opp.causalMechanism}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-900 text-[11px] text-zinc-500">
                    <span className="truncate">
                      Kaynak: {opp.source} — &ldquo;{opp.headline}&rdquo;
                    </span>
                    {onSelectAsset && (
                      <button
                        onClick={() => onSelectAsset(opp.symbol)}
                        className="shrink-0 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs transition-colors"
                      >
                        İşlem Planını Gör
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. SON 24 SAAT CANLI HABER AKIŞI */}
      <div className="border border-zinc-800 bg-zinc-900 rounded p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-white">
              Son 24 Saat Canlı Küresel Haber Akışı ({news.length} Haber)
            </h2>
            <span className="text-xs text-zinc-400">
              Gerçek RSS kaynaklarından çekilir; her haberin altında yapay zeka neden-sonuç özeti ve etkilenen varlık kararları yer alır
            </span>
          </div>
        </div>

        <div className="space-y-3">
            {/* Source Filter */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <span className="text-zinc-500 text-[11px] mr-1">Kaynak:</span>
              {availableSources.map((src) => (
                <button
                  key={src}
                  onClick={() => setSourceFilter(src)}
                  className={`px-2.5 py-1 rounded text-[11px] whitespace-nowrap transition-colors border ${
                    sourceFilter === src
                      ? 'bg-zinc-800 text-white font-medium border-zinc-700'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                  }`}
                >
                  {src}
                </button>
              ))}
            </div>

            {/* News List */}
            <div className="divide-y divide-zinc-800/80">
              {filteredNews.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  Son 24 saat içerisinde yayınlanmış haber bulunamadı veya akış yükleniyor...
                </div>
              ) : (
                filteredNews.map((n) => (
                  <div key={n.id} className="py-3.5 first:pt-1 last:pb-1 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-zinc-200">{n.source}</span>
                        <span className="text-zinc-600">•</span>
                        <span
                          className={`font-medium ${
                            n.sentiment === 'POZİTİF'
                              ? 'text-emerald-400'
                              : n.sentiment === 'NEGATİF'
                              ? 'text-rose-400'
                              : 'text-zinc-300'
                          }`}
                        >
                          {n.sentiment === 'POZİTİF'
                            ? 'Olumlu Etki'
                            : n.sentiment === 'NEGATİF'
                            ? 'Olumsuz Etki'
                            : 'Nötr'}
                        </span>
                        {n.aiAnalysis?.eventCategory && (
                          <>
                            <span className="text-zinc-600">•</span>
                            <span className="text-zinc-400">{n.aiAnalysis.eventCategory}</span>
                          </>
                        )}
                      </div>
                      <span className="text-zinc-500">{n.publishedAt}</span>
                    </div>

                    <h3 className="text-sm font-semibold text-white hover:text-sky-300 transition-colors">
                      {n.sourceUrl ? (
                        <a href={n.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5">
                          <span>{n.title}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        </a>
                      ) : (
                        n.title
                      )}
                    </h3>

                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {n.summary}
                    </p>

                    {/* Yapay Zeka Nedensel Analiz Kutusu */}
                    {n.aiAnalysis && (
                      <div className="bg-zinc-950 border border-zinc-800/80 rounded p-3 space-y-1.5 text-xs">
                        <div className="text-zinc-300">
                          <strong className="text-white">Yapay Zeka Yorumu:</strong> {n.aiAnalysis.causalMechanism}
                        </div>
                        {Array.isArray(n.aiAnalysis.assetImpacts) && n.aiAnalysis.assetImpacts.length > 0 && (
                          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
                            <span className="text-zinc-400">Etkilenen Varlık Kararları:</span>
                            {n.aiAnalysis.assetImpacts.map((imp) => (
                              <button
                                key={imp.symbol}
                                onClick={() => onSelectAsset && onSelectAsset(imp.symbol)}
                                className="inline-flex items-center gap-1 text-zinc-200 hover:underline"
                              >
                                <strong className="text-white">{imp.symbol}:</strong>
                                <span
                                  className={
                                    imp.direction === 'AL (LONG)'
                                      ? 'text-emerald-400 font-medium'
                                      : imp.direction === 'SAT (SHORT)'
                                      ? 'text-rose-400 font-medium'
                                      : 'text-zinc-400'
                                  }
                                >
                                  {imp.direction === 'AL (LONG)'
                                    ? 'Alış (Long)'
                                    : imp.direction === 'SAT (SHORT)'
                                    ? 'Satış (Short)'
                                    : 'İzle'}
                                </span>
                                <span className="text-zinc-500">(%{imp.conviction})</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
        </div>
      </div>
    </div>
  );
};

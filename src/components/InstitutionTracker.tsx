import React, { useState } from 'react';
import { InstitutionalEntity, NewsNotification } from '../types';
import { ExternalLink } from 'lucide-react';

interface InstitutionTrackerProps {
  institutions: InstitutionalEntity[];
  news: NewsNotification[];
}

export const InstitutionTracker: React.FC<InstitutionTrackerProps> = ({ institutions, news }) => {
  const [activeSubTab, setActiveSubTab] = useState<'news' | 'institutions'>('news');
  const [sourceFilter, setSourceFilter] = useState<string>('TÜMÜ');

  const availableSources = ['TÜMÜ', ...new Set(news.map((n) => n.source))];

  const filteredNews = news.filter((n) => {
    return sourceFilter === 'TÜMÜ' || n.source === sourceFilter;
  });

  return (
    <div className="border border-zinc-800 bg-zinc-900 rounded p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white">
            Piyasa Haberleri & Kurumsal Durum Takibi (Son 24 Saat)
          </h2>
          <span className="text-xs text-zinc-400">
            Yatırım araçlarımızla ilgili birden fazla küresel finans kaynağından anlık akış
          </span>
        </div>

        {/* Sub tabs */}
        <div className="flex items-center space-x-1.5 text-xs">
          <button
            onClick={() => setActiveSubTab('news')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeSubTab === 'news'
                ? 'bg-zinc-800 text-white font-medium'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Son 24 Saat Haberleri ({news.length})
          </button>
          <button
            onClick={() => setActiveSubTab('institutions')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeSubTab === 'institutions'
                ? 'bg-zinc-800 text-white font-medium'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Merkez Bankaları & Şirketler ({institutions.length})
          </button>
        </div>
      </div>

      {/* Subtab: News (Son 24 Saat) */}
      {activeSubTab === 'news' && (
        <div className="space-y-3">
          {/* Source Filter Pills */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <span className="text-zinc-500 font-mono text-[11px] mr-1">Kaynak Filtresi:</span>
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
              <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                Son 24 saat içerisinde yayınlanmış haber bulunamadı veya akış yükleniyor...
              </div>
            ) : (
              filteredNews.map((n) => (
                <div key={n.id} className="py-3 first:pt-1 last:pb-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-zinc-300 font-mono">{n.source}</span>
                      <span className="text-[10px] bg-zinc-800 text-emerald-400 px-1.5 py-0.5 rounded font-mono">
                        TR Finans Özeti
                      </span>
                    </div>
                    <span className="font-mono text-zinc-500">{n.publishedAt}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1 hover:text-sky-300 transition-colors">
                    {n.sourceUrl ? (
                      <a href={n.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5">
                        <span>{n.title}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      </a>
                    ) : (
                      n.title
                    )}
                  </h3>
                  {n.originalTitle && n.originalTitle !== n.title && (
                    <div className="text-[11px] text-zinc-500 italic mb-1.5 font-mono">
                      Kaynak Başlık: {n.originalTitle}
                    </div>
                  )}
                  <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950/70 p-2.5 rounded border border-zinc-800/80">
                    {n.summary}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Subtab: Institutions */}
      {activeSubTab === 'institutions' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                <th className="py-2 px-2 w-48">Kurum / Şirket</th>
                <th className="py-2 px-2 w-32">Kategori</th>
                <th className="py-2 px-2 w-24">Not</th>
                <th className="py-2 px-2 w-48">Makro Duruş</th>
                <th className="py-2 px-2">Son Şirket Olayı / Rapor</th>
                <th className="py-2 px-2 w-24 text-right">Zaman</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {institutions.map((inst) => (
                <tr key={inst.code} className="hover:bg-zinc-800/40">
                  <td className="py-2.5 px-2 font-semibold text-white">
                    <div>{inst.name}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">{inst.code}</div>
                  </td>
                  <td className="py-2.5 px-2 text-zinc-400">{inst.type}</td>
                  <td className="py-2.5 px-2 font-mono text-white">{inst.creditScore}</td>
                  <td className="py-2.5 px-2 text-zinc-300">{inst.macroTrend}</td>
                  <td className="py-2.5 px-2 text-zinc-300 leading-relaxed">{inst.lastNews}</td>
                  <td className="py-2.5 px-2 text-right font-mono text-zinc-500">{inst.lastUpdated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

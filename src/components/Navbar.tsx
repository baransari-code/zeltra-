import React, { useState } from 'react';
import { Bell, ExternalLink } from 'lucide-react';
import { NewsNotification } from '../types';

export type AppTab = 'canli' | 'fund' | 'indicator' | 'arena' | 'news' | 'calculator';

interface NavbarProps {
  notifications: NewsNotification[];
  onMarkAllAsRead: () => void;
  onRefreshNews: () => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
}

const NAV_ITEMS: { id: AppTab; label: string; accent?: boolean }[] = [
  { id: 'canli', label: 'Canlı Takip (/canli)', accent: true },
  { id: 'fund', label: 'Otonom Fon (v14)' },
  { id: 'indicator', label: 'ZAC v14 İndikatör' },
  { id: 'arena', label: 'Manuel Arena' },
  { id: 'news', label: 'Haber & Makro AI' },
  { id: 'calculator', label: 'Risk & Lot' },
];

export const Navbar: React.FC<NavbarProps> = ({
  notifications,
  onMarkAllAsRead,
  onRefreshNews,
  activeTab,
  setActiveTab,
}) => {
  const [isBellOpen, setIsBellOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <button
            onClick={() => setActiveTab('fund')}
            className="text-base font-bold tracking-tight text-white flex items-center space-x-2.5"
          >
            <img
              src="/zeltra-logo.png?v=2"
              alt="ZELTRA Logo"
              className="h-8 w-auto object-contain select-none"
            />
            <span>ZELTRA</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 hidden sm:inline">
              QUANT v14.0
            </span>
          </button>

          <nav className="hidden md:flex items-center space-x-1 text-xs font-medium">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    active
                      ? item.accent
                        ? 'text-emerald-300 font-semibold bg-emerald-950/60 border border-emerald-700/50'
                        : 'text-white font-semibold bg-zinc-800'
                      : item.accent
                        ? 'text-emerald-400/90 hover:text-emerald-300'
                        : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onRefreshNews}
            className="text-[11px] px-2.5 py-1 text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 rounded transition-colors whitespace-nowrap"
          >
            Haber Yenile
          </button>

          <div className="relative">
            <button
              onClick={() => setIsBellOpen(!isBellOpen)}
              className="relative p-2 text-zinc-300 hover:text-white rounded hover:bg-zinc-800 transition-colors"
              title="Canlı Haber Bildirimleri"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
              )}
            </button>

            {isBellOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-zinc-900 border border-zinc-700 shadow-xl rounded-md p-3 z-50">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                  <span className="text-xs font-semibold text-zinc-200">Canlı Haber Bildirimleri</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={onMarkAllAsRead}
                      className="text-[11px] text-zinc-400 hover:text-zinc-200"
                    >
                      Tümünü okundu say
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="text-xs text-zinc-500 py-4 text-center">Bildirim bulunmuyor.</div>
                  ) : (
                    notifications.slice(0, 15).map((n) => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded text-xs border ${
                          n.read
                            ? 'bg-zinc-950/40 border-zinc-800 text-zinc-400'
                            : 'bg-zinc-800/60 border-zinc-700 text-zinc-200'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                          <span className="font-semibold text-zinc-300">{n.source}</span>
                          <span>{n.publishedAt}</span>
                        </div>
                        <div className="font-medium text-white mb-1">{n.title}</div>
                        {n.sourceUrl && (
                          <a
                            href={n.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center space-x-1 text-[11px] text-cyan-400 hover:underline"
                          >
                            <span>Kaynağa git</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobil Yatay Navigasyon */}
      <div className="md:hidden flex items-center space-x-1.5 px-3 py-1.5 border-t border-zinc-800 bg-zinc-950 overflow-x-auto text-xs select-none">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`px-3 py-1 rounded whitespace-nowrap border transition-colors ${
              activeTab === item.id
                ? 'bg-zinc-800 text-white font-semibold border-zinc-700'
                : 'bg-zinc-900/60 text-zinc-400 border-zinc-800'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
};

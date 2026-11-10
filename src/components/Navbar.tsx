import React, { useState } from 'react';
import { Bell, ExternalLink } from 'lucide-react';
import { NewsNotification } from '../types';

interface NavbarProps {
  notifications: NewsNotification[];
  onMarkAllAsRead: () => void;
  onSimulateBreakingNews: () => void;
  activeTab: 'signals' | 'catalog' | 'news' | 'glossary' | 'calculator';
  setActiveTab: (tab: 'signals' | 'catalog' | 'news' | 'glossary' | 'calculator') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  notifications,
  onMarkAllAsRead,
  onSimulateBreakingNews,
  activeTab,
  setActiveTab,
}) => {
  const [isBellOpen, setIsBellOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-6">
          <button
            onClick={() => setActiveTab('signals')}
            className="text-base font-bold tracking-tight text-white flex items-center space-x-2"
          >
            <span>ZELTRA</span>
            <span className="text-[11px] font-normal text-zinc-400 font-mono">Kantitatif Piyasa Analizi</span>
          </button>

          {/* Traditional Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1 text-sm">
            <button
              onClick={() => setActiveTab('signals')}
              className={`px-3 py-1.5 rounded transition-colors ${
                activeTab === 'signals' ? 'text-white font-medium bg-zinc-800' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Analiz
            </button>
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-3 py-1.5 rounded transition-colors ${
                activeTab === 'catalog' ? 'text-white font-medium bg-zinc-800' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Varlık Listesi
            </button>
            <button
              onClick={() => setActiveTab('news')}
              className={`px-3 py-1.5 rounded transition-colors ${
                activeTab === 'news' ? 'text-white font-medium bg-zinc-800' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Haberler & Şirketler
            </button>
            <button
              onClick={() => setActiveTab('glossary')}
              className={`px-3 py-1.5 rounded transition-colors ${
                activeTab === 'glossary' ? 'text-white font-medium bg-zinc-800' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Forex Rehberi
            </button>
            <button
              onClick={() => setActiveTab('calculator')}
              className={`px-3 py-1.5 rounded transition-colors ${
                activeTab === 'calculator' ? 'text-white font-medium bg-zinc-800' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Risk & Lot
            </button>
          </nav>
        </div>

        {/* Right Area: Bell Notification & Test Button */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={onSimulateBreakingNews}
            className="text-[11px] sm:text-xs px-2 sm:px-2.5 py-1 text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 rounded transition-colors whitespace-nowrap"
          >
            Haber Yenile
          </button>

          {/* Bell Icon */}
          <div className="relative">
            <button
              onClick={() => setIsBellOpen(!isBellOpen)}
              className="relative p-2 text-zinc-300 hover:text-white rounded hover:bg-zinc-800 transition-colors"
              title="Bildirimler"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span>
              )}
            </button>

            {isBellOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-zinc-900 border border-zinc-700 shadow-xl rounded-md p-3 z-50">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                  <span className="text-xs font-semibold text-zinc-200">Son Haberler & Bildirimler</span>
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
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded text-xs border ${
                          n.read ? 'bg-zinc-950/40 border-zinc-800 text-zinc-400' : 'bg-zinc-800/60 border-zinc-700 text-zinc-200'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                          <span className="font-semibold text-zinc-300">{n.source}</span>
                          <span>{n.publishedAt}</span>
                        </div>
                        <div className="font-medium text-white mb-1">{n.title}</div>
                        <div className="text-zinc-400 text-[11px] leading-relaxed mb-1.5">{n.summary}</div>
                        {n.sourceUrl && (
                          <a
                            href={n.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center space-x-1 text-[11px] text-sky-400 hover:underline"
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

      {/* Mobile nav (Horizontal Touch Scroll) */}
      <div className="md:hidden flex items-center space-x-1.5 px-3 py-1.5 border-t border-zinc-800 bg-zinc-950 overflow-x-auto text-xs select-none">
        <button
          onClick={() => setActiveTab('signals')}
          className={`px-3 py-1 rounded whitespace-nowrap border transition-colors ${
            activeTab === 'signals'
              ? 'bg-zinc-800 text-white font-medium border-zinc-700'
              : 'bg-zinc-900/60 text-zinc-400 border-zinc-800'
          }`}
        >
          Analiz & Sinyal
        </button>
        <button
          onClick={() => setActiveTab('catalog')}
          className={`px-3 py-1 rounded whitespace-nowrap border transition-colors ${
            activeTab === 'catalog'
              ? 'bg-zinc-800 text-white font-medium border-zinc-700'
              : 'bg-zinc-900/60 text-zinc-400 border-zinc-800'
          }`}
        >
          120+ Varlık Listesi
        </button>
        <button
          onClick={() => setActiveTab('news')}
          className={`px-3 py-1 rounded whitespace-nowrap border transition-colors ${
            activeTab === 'news'
              ? 'bg-zinc-800 text-white font-medium border-zinc-700'
              : 'bg-zinc-900/60 text-zinc-400 border-zinc-800'
          }`}
        >
          Canlı Haberler
        </button>
        <button
          onClick={() => setActiveTab('calculator')}
          className={`px-3 py-1 rounded whitespace-nowrap border transition-colors ${
            activeTab === 'calculator'
              ? 'bg-zinc-800 text-white font-medium border-zinc-700'
              : 'bg-zinc-900/60 text-zinc-400 border-zinc-800'
          }`}
        >
          Risk & Lot
        </button>
        <button
          onClick={() => setActiveTab('glossary')}
          className={`px-3 py-1 rounded whitespace-nowrap border transition-colors ${
            activeTab === 'glossary'
              ? 'bg-zinc-800 text-white font-medium border-zinc-700'
              : 'bg-zinc-900/60 text-zinc-400 border-zinc-800'
          }`}
        >
          Forex Rehberi
        </button>
      </div>
    </header>
  );
};

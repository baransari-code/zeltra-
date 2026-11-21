import React, { useState, useEffect, useCallback } from 'react';
import { Navbar, AppTab } from './components/Navbar';
import { LiveAuditView } from './components/LiveAuditView';
import { AutonomousTestView } from './components/AutonomousTestView';
import { ProIndicatorTerminal } from './components/ProIndicatorTerminal';
import { ManualArenaView } from './components/ManualArenaView';
import { InstitutionTracker } from './components/InstitutionTracker';
import { RiskCalculator } from './components/RiskCalculator';
import { NewsNotification } from './types';

function resolveTabFromPath(pathname: string): AppTab {
  if (pathname === '/canli' || pathname === '/live') return 'canli';
  if (pathname === '/indicator' || pathname === '/zac') return 'indicator';
  if (pathname === '/test2' || pathname === '/ttest2' || pathname === '/arena') return 'arena';
  if (pathname === '/news') return 'news';
  if (pathname === '/risk') return 'calculator';
  return 'fund';
}

function pathForTab(tab: AppTab): string {
  switch (tab) {
    case 'canli':
      return '/canli';
    case 'indicator':
      return '/indicator';
    case 'arena':
      return '/test2';
    case 'news':
      return '/news';
    case 'calculator':
      return '/risk';
    default:
      return '/';
  }
}

export const App: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('MSFT');
  const [activeTab, setActiveTabState] = useState<AppTab>(() =>
    typeof window !== 'undefined' ? resolveTabFromPath(window.location.pathname) : 'fund'
  );
  const [notifications, setNotifications] = useState<NewsNotification[]>([]);
  const [liveUsdTry, setLiveUsdTry] = useState<number>(42.5);

  const setActiveTab = useCallback((tab: AppTab) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      const target = pathForTab(tab);
      if (window.location.pathname !== target) {
        window.history.pushState({}, '', target);
      }
    }
  }, []);

  useEffect(() => {
    const onPopState = () => setActiveTabState(resolveTabFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const loadLiveFxRate = useCallback(async () => {
    try {
      const res = await fetch('/api/live-fx-rate');
      if (res.ok) {
        const json = await res.json();
        if (json?.usdTry && json.usdTry > 10) setLiveUsdTry(json.usdTry);
      }
    } catch {
      // keep previous rate
    }
  }, []);

  const loadRealNews = useCallback(async () => {
    try {
      const res = await fetch('/api/real-news');
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) setNotifications(list);
      }
    } catch {
      // keep previous list
    }
  }, []);

  useEffect(() => {
    loadLiveFxRate();
    loadRealNews();
    const timer = setInterval(() => {
      loadLiveFxRate();
      loadRealNews();
    }, 120_000);
    const keepAlive = setInterval(() => {
      fetch('/api/health').catch(() => {});
    }, 30_000);
    return () => {
      clearInterval(timer);
      clearInterval(keepAlive);
    };
  }, [loadLiveFxRate, loadRealNews]);

  const handleInspectSymbol = useCallback(
    (sym: string) => {
      setSelectedSymbol(sym);
      setActiveTab('indicator');
    },
    [setActiveTab]
  );

  const handleMarkAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <Navbar
        notifications={notifications}
        onMarkAllAsRead={handleMarkAllAsRead}
        onRefreshNews={loadRealNews}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-5">
        {activeTab === 'canli' && (
          <LiveAuditView onInspectSymbol={handleInspectSymbol} />
        )}

        {activeTab === 'fund' && (
          <AutonomousTestView onInspectSymbol={handleInspectSymbol} />
        )}

        {activeTab === 'indicator' && (
          <ProIndicatorTerminal
            symbol={selectedSymbol}
            onSelectSymbol={setSelectedSymbol}
          />
        )}

        {activeTab === 'arena' && <ManualArenaView />}

        {activeTab === 'news' && (
          <InstitutionTracker
            news={notifications}
            onSelectAsset={handleInspectSymbol}
          />
        )}

        {activeTab === 'calculator' && (
          <RiskCalculator
            symbol={selectedSymbol}
            liveUsdTry={liveUsdTry}
            onSelectSymbol={setSelectedSymbol}
          />
        )}
      </main>

      <footer className="border-t border-zinc-900 py-3 px-4 text-center text-[11px] font-mono text-zinc-500">
        ZELTRA QUANT v14.0 — 3-Pod Kurumsal Otonom Fon & ZAC v14 İndikatör Terminali • Gerçek Piyasa Verisi • Canlı Geçiş Hedefi: 01.12.2026
      </footer>
    </div>
  );
};

export default App;

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Navbar, AppTab } from './components/Navbar';
import { SignalCard } from './components/SignalCard';
import { PriceChart } from './components/PriceChart';
import { TechnicalMatrix } from './components/TechnicalMatrix';
import { InstitutionTracker } from './components/InstitutionTracker';
import { RiskCalculator } from './components/RiskCalculator';
import { MarketCatalog } from './components/MarketCatalog';
import { ForexGlossary } from './components/ForexGlossary';
import { HourlyForecastView } from './components/HourlyForecastView';
import { AutonomousTestView } from './components/AutonomousTestView';
import { ManualArenaView } from './components/ManualArenaView';
import {
  ALL_ASSETS,
  fetchRealAssetData,
  fetchRealNewsList,
  generateQuantitativeSignal,
  analyzeTechnicals,
} from './services/dataEngine';
import { INSTITUTIONS_DATA } from './data/institutions';
import { Asset, Candle, NewsNotification } from './types';

export const App: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>(ALL_ASSETS);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('XAU/USD');
  const [activeTab, setActiveTabState] = useState<AppTab>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      if (p === '/test') return 'test';
      if (p === '/test2' || p === '/ttest2') return 'test2';
    }
    return 'signals';
  });
  const [candles, setCandles] = useState<Candle[]>([]);
  const [notifications, setNotifications] = useState<NewsNotification[]>([]);
  const [liveUsdTry, setLiveUsdTry] = useState<number>(38.55);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const setActiveTab = useCallback((tab: AppTab) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      const targetPath = tab === 'test' ? '/test' : tab === 'test2' ? '/test2' : '/';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath);
      }
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const p = window.location.pathname;
      if (p === '/test') {
        setActiveTabState('test');
      } else if (p === '/test2' || p === '/ttest2') {
        setActiveTabState('test2');
      } else {
        setActiveTabState('signals');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const selectedAsset = useMemo(() => {
    return assets.find((a) => a.symbol === selectedSymbol) || assets[0];
  }, [assets, selectedSymbol]);

  // Canlı USD/TRY Kurunu Çek
  const loadLiveFxRate = useCallback(async () => {
    try {
      const res = await fetch('/api/live-fx-rate');
      if (res.ok) {
        const json = await res.json();
        if (json?.usdTry && json.usdTry > 10) {
          setLiveUsdTry(json.usdTry);
        }
      }
    } catch {
      // Fallback korunur
    }
  }, []);

  // Canlı Gerçek 1 Yıllık Borsa Verisini Çek
  const loadRealMarketData = useCallback(async (symbol: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const realData = await fetchRealAssetData(symbol);
      setCandles(realData.candles);
      if (symbol === 'USD/TRY' && realData.price > 10) {
        setLiveUsdTry(realData.price);
      }

      setAssets((prev) =>
        prev.map((a) =>
          a.symbol === symbol
            ? {
                ...a,
                price: realData.price,
                change24h: realData.change24h,
                changePercent24h: realData.changePercent24h,
              }
            : a
        )
      );
    } catch (err: any) {
      console.error('Piyasa verisi çekilemedi:', err);
      setErrorMsg(`Canlı borsa verisi çekilemedi: ${err?.message || 'Bilinmeyen hata'}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Canlı Gerçek 24 Saatlik Haberleri Çek
  const loadRealNews = useCallback(async () => {
    try {
      const realNews = await fetchRealNewsList();
      if (Array.isArray(realNews) && realNews.length > 0) {
        setNotifications(realNews);
      }
    } catch (err) {
      console.error('Canlı haber akışı alınamadı:', err);
    }
  }, []);

  useEffect(() => {
    loadRealMarketData(selectedSymbol);
  }, [selectedSymbol, loadRealMarketData]);

  useEffect(() => {
    loadLiveFxRate();
    loadRealNews();
    const newsTimer = setInterval(() => {
      loadRealNews();
      loadLiveFxRate();
    }, 120000);
    return () => clearInterval(newsTimer);
  }, [loadRealNews, loadLiveFxRate]);

  const technicals = useMemo(() => {
    return analyzeTechnicals(candles);
  }, [candles]);

  const currentSignal = useMemo(() => {
    return generateQuantitativeSignal(selectedAsset, candles, liveUsdTry, notifications);
  }, [selectedAsset, candles, liveUsdTry, notifications]);

  const handleMarkAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const handleGoToAnalysis = useCallback(
    (symbol: string) => {
      setSelectedSymbol(symbol);
      setActiveTab('signals');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setActiveTab]
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Clean Navbar */}
      <Navbar
        notifications={notifications}
        onMarkAllAsRead={handleMarkAllAsRead}
        onSimulateBreakingNews={loadRealNews}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Subheader: Active Instrument Selector & Real Status Indicator */}
      <div className="border-b border-zinc-800 bg-zinc-900/60 py-2 px-3 sm:px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs w-full sm:w-auto">
            <span className="text-zinc-400 shrink-0">Aktif Enstrüman:</span>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="bg-zinc-950 border border-zinc-700 text-white font-mono text-xs rounded px-2.5 py-1 focus:outline-none flex-1 sm:flex-none max-w-full"
            >
              {assets.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol} — {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-4 text-xs font-mono">
            <div className="text-zinc-400">
              Canlı Fiyat: <strong className="text-white">{selectedAsset.price.toFixed(selectedAsset.digits)}</strong>{' '}
              <span className={selectedAsset.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                ({selectedAsset.change24h >= 0 ? '+' : ''}{selectedAsset.changePercent24h}%)
              </span>
            </div>

            <div className="text-zinc-400 hidden md:block">
              Canlı USD/TRY: <strong className="text-zinc-200">{liveUsdTry.toFixed(2)} ₺</strong>
            </div>

            <div className="flex items-center space-x-1.5 text-xs text-zinc-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="font-sans">Canlı Piyasa Aktif</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="max-w-6xl mx-auto w-full px-3 sm:px-4 pt-3">
          <div className="p-3 bg-rose-950/40 border border-rose-800 rounded text-xs text-rose-300">
            {errorMsg}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-2.5 sm:px-4 py-3 sm:py-4 space-y-3 sm:space-y-4">
        {activeTab === 'test' ? (
          <AutonomousTestView />
        ) : activeTab === 'test2' ? (
          <ManualArenaView onGoToBotTest={() => setActiveTab('test')} />
        ) : isLoading && candles.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-400 font-mono">
            {selectedSymbol} için son 1 yıllık resmi borsa mumları ve anlık fiyat yükleniyor...
          </div>
        ) : (
          <>
            {activeTab === 'signals' && (
              <div className="space-y-4">
                <SignalCard signal={currentSignal} asset={selectedAsset} liveUsdTry={liveUsdTry} />
                <HourlyForecastView
                  symbol={selectedAsset.symbol}
                  currentPrice={selectedAsset.price}
                  digits={selectedAsset.digits}
                />
                <PriceChart
                  candles={candles}
                  signal={currentSignal}
                  technicals={technicals}
                  symbol={selectedAsset.symbol}
                  digits={selectedAsset.digits}
                />
                <TechnicalMatrix technicals={technicals} asset={selectedAsset} candles={candles} />
              </div>
            )}

            {activeTab === 'catalog' && (
              <MarketCatalog
                assets={assets}
                selectedSymbol={selectedSymbol}
                onSelectAsset={setSelectedSymbol}
                onGoToAnalysis={handleGoToAnalysis}
              />
            )}

            {activeTab === 'news' && (
              <div className="space-y-4">
                <InstitutionTracker
                  institutions={INSTITUTIONS_DATA}
                  news={notifications}
                  onSelectAsset={handleGoToAnalysis}
                />
              </div>
            )}

            {activeTab === 'glossary' && <ForexGlossary />}

            {activeTab === 'calculator' && (
              <div className="space-y-4">
                <RiskCalculator currentSignal={currentSignal} asset={selectedAsset} />
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 bg-zinc-950 py-4 text-xs text-zinc-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>ZELTRA • Kurumsal Kantitatif Analiz, Canlı İşlem Kütüğü & 250.000 TL Otonom Portföy Motoru</div>
          <div className="font-mono text-zinc-400">nexustrans | Belgex | Toykarot | ZELTRA</div>
        </div>
      </footer>
    </div>
  );
};

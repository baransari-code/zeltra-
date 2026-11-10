import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { SignalCard } from './components/SignalCard';
import { PriceChart } from './components/PriceChart';
import { TechnicalMatrix } from './components/TechnicalMatrix';
import { InstitutionTracker } from './components/InstitutionTracker';
import { RiskCalculator } from './components/RiskCalculator';
import { MarketCatalog } from './components/MarketCatalog';
import { ForexGlossary } from './components/ForexGlossary';
import { HourlyForecastView } from './components/HourlyForecastView';
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
  const [selectedSymbol, setSelectedSymbol] = useState<string>('EUR/USD');
  const [activeTab, setActiveTab] = useState<'signals' | 'catalog' | 'news' | 'glossary' | 'calculator'>('signals');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [notifications, setNotifications] = useState<NewsNotification[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedAsset = useMemo(() => {
    return assets.find((a) => a.symbol === selectedSymbol) || assets[0];
  }, [assets, selectedSymbol]);

  // Canlı Gerçek 1 Yıllık Borsa Verisini Çek
  const loadRealMarketData = useCallback(async (symbol: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const realData = await fetchRealAssetData(symbol);
      setCandles(realData.candles);

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
    loadRealNews();
    const newsTimer = setInterval(loadRealNews, 120000);
    return () => clearInterval(newsTimer);
  }, [loadRealNews]);

  const technicals = useMemo(() => {
    return analyzeTechnicals(candles);
  }, [candles]);

  const currentSignal = useMemo(() => {
    return generateQuantitativeSignal(selectedAsset, candles);
  }, [selectedAsset, candles]);

  const handleMarkAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const handleGoToAnalysis = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
    setActiveTab('signals');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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
      <div className="border-b border-zinc-800 bg-zinc-900/60 py-2 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-3 text-xs">
            <span className="text-zinc-400">Aktif Enstrüman:</span>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="bg-zinc-950 border border-zinc-700 text-white font-mono text-xs rounded px-2.5 py-1 focus:outline-none"
            >
              {assets.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol} — {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-4 text-xs font-mono">
            <div className="text-zinc-400">
              Canlı Fiyat: <strong className="text-white">{selectedAsset.price.toFixed(selectedAsset.digits)}</strong>{' '}
              <span className={selectedAsset.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                ({selectedAsset.change24h >= 0 ? '+' : ''}{selectedAsset.changePercent24h}%)
              </span>
            </div>

            <div className="flex items-center space-x-1.5 text-[11px] text-emerald-400 border border-emerald-900/60 bg-emerald-950/30 px-2 py-0.5 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-sans">Canlı Borsa & Çok Kaynaklı 24s Akış</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="max-w-6xl mx-auto w-full px-4 pt-3">
          <div className="p-3 bg-rose-950/40 border border-rose-800 rounded text-xs text-rose-300">
            {errorMsg}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 space-y-4">
        {isLoading && candles.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-400 font-mono">
            {selectedSymbol} için son 1 yıllık resmi borsa mumları ve anlık fiyat yükleniyor...
          </div>
        ) : (
          <>
            {activeTab === 'signals' && (
              <div className="space-y-4">
                <SignalCard signal={currentSignal} asset={selectedAsset} />
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
                <InstitutionTracker institutions={INSTITUTIONS_DATA} news={notifications} />
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
          <div>TransZel • Çok Kaynaklı Son 24 Saat Haberleri & 7 Saatlik Tahmin Modeli</div>
          <div className="font-mono text-zinc-400">nexustrans | Belgex | Toykarot | TransZel</div>
        </div>
      </footer>
    </div>
  );
};

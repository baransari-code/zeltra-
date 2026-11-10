import React, { useState, useMemo } from 'react';
import { Asset, AssetCategory } from '../types';

interface MarketCatalogProps {
  assets: Asset[];
  selectedSymbol: string;
  onSelectAsset: (symbol: string) => void;
  onGoToAnalysis: (symbol: string) => void;
}

export const MarketCatalog: React.FC<MarketCatalogProps> = ({
  assets,
  selectedSymbol,
  onSelectAsset,
  onGoToAnalysis,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory | 'ALL'>('ALL');

  const categories: { key: AssetCategory | 'ALL'; label: string }[] = [
    { key: 'ALL', label: 'Tümü' },
    { key: 'MAJOR_FX', label: 'Majör Pariteler' },
    { key: 'MINOR_FX', label: 'Minör Pariteler' },
    { key: 'EXOTIC_FX', label: 'Egzotik Pariteler' },
    { key: 'PRECIOUS_METALS', label: 'Değerli Metaller' },
    { key: 'ENERGY', label: 'Enerji' },
    { key: 'INDICES', label: 'Endeksler' },
    { key: 'STOCKS', label: 'Hisseler' },
    { key: 'CRYPTO', label: 'Kripto' },
    { key: 'AGRICULTURE', label: 'Tarımsal Emtia' },
    { key: 'METALS', label: 'Sanayi Metalleri' },
    { key: 'BONDS', label: 'Tahviller & Faiz' },
    { key: 'DERIVATIVES', label: 'ETF & Türevler' },
  ];

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesSearch =
        asset.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCat = selectedCategory === 'ALL' || asset.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [assets, searchTerm, selectedCategory]);

  return (
    <div className="border border-zinc-800 bg-zinc-900 rounded p-4 space-y-4">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white">Varlık Listesi</h2>
          <span className="text-xs text-zinc-400">Toplam {filteredAssets.length} enstrüman listeleniyor</span>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as AssetCategory | 'ALL')}
            className="bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 rounded px-2.5 py-1.5 focus:outline-none"
          >
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>

          {/* Search Input */}
          <input
            type="text"
            placeholder="Sembol veya isim ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-56 bg-zinc-950 border border-zinc-700 text-xs text-white placeholder-zinc-500 rounded px-2.5 py-1.5 focus:outline-none"
          />
        </div>
      </div>

      {/* Traditional Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
              <th className="py-2 px-2">Sembol</th>
              <th className="py-2 px-2">Enstrüman Adı</th>
              <th className="py-2 px-2">Kategori</th>
              <th className="py-2 px-2">Tür</th>
              <th className="py-2 px-2 text-right">Son Fiyat</th>
              <th className="py-2 px-2 text-right">24s Değişim</th>
              <th className="py-2 px-2 text-center">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 font-mono">
            {filteredAssets.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-zinc-500 font-sans">
                  Sonuç bulunamadı.
                </td>
              </tr>
            ) : (
              filteredAssets.map((asset) => {
                const isSelected = asset.symbol === selectedSymbol;
                const isPositive = asset.change24h >= 0;
                return (
                  <tr
                    key={asset.symbol}
                    className={`hover:bg-zinc-800/50 transition-colors ${
                      isSelected ? 'bg-zinc-800/70 font-semibold text-white' : 'text-zinc-300'
                    }`}
                  >
                    <td className="py-2 px-2 font-bold text-white">{asset.symbol}</td>
                    <td className="py-2 px-2 font-sans text-zinc-300">{asset.name}</td>
                    <td className="py-2 px-2 font-sans text-zinc-400">{asset.categoryName}</td>
                    <td className="py-2 px-2 font-sans text-zinc-400">{asset.contractType}</td>
                    <td className="py-2 px-2 text-right text-white">{asset.price.toFixed(asset.digits)}</td>
                    <td className={`py-2 px-2 text-right font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isPositive ? '+' : ''}
                      {asset.changePercent24h}%
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        onClick={() => {
                          onSelectAsset(asset.symbol);
                          onGoToAnalysis(asset.symbol);
                        }}
                        className="px-2.5 py-1 text-[11px] font-sans font-medium rounded border border-zinc-700 bg-zinc-800 text-zinc-200 hover:text-white hover:bg-zinc-700 transition-colors"
                      >
                        Analiz Et
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

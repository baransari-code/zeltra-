import React, { useState, useMemo } from 'react';
import { TRADING_METHODS, TRADING_CONCEPTS } from '../data/marketDirectory';

export const ForexGlossary: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'methods' | 'concepts'>('methods');

  const filteredConcepts = useMemo(() => {
    return TRADING_CONCEPTS.filter((c) => {
      return (
        c.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.turkish.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.definition.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [searchTerm]);

  const filteredMethods = useMemo(() => {
    return TRADING_METHODS.filter(
      (m) =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <div className="border border-zinc-800 bg-zinc-900 rounded p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white">Forex İşlem Türleri ve Kavramlar Rehberi</h2>
          <span className="text-xs text-zinc-400">Piyasa mekaniği, emir türleri ve işlem yöntemleri</span>
        </div>

        <input
          type="text"
          placeholder="Kavram veya terim ara (örn: Pip, CFD)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:w-64 bg-zinc-950 border border-zinc-700 text-xs text-white placeholder-zinc-500 rounded px-2.5 py-1.5 focus:outline-none"
        />
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-zinc-800 pb-2 text-xs">
        <button
          onClick={() => setActiveTab('methods')}
          className={`px-3 py-1.5 rounded ${
            activeTab === 'methods' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-white'
          }`}
        >
          İşlem Türleri ({TRADING_METHODS.length})
        </button>
        <button
          onClick={() => setActiveTab('concepts')}
          className={`px-3 py-1.5 rounded ${
            activeTab === 'concepts' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-white'
          }`}
        >
          İşlem Kavramları & Emirler ({TRADING_CONCEPTS.length})
        </button>
      </div>

      {/* Simple Note */}
      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-300 leading-relaxed">
        <strong className="text-white">Önemli Ayrım: </strong>
        Yukarıdaki varlıkların tamamı her klasik Forex aracı kurumunda bulunmaz. Hisseler, kripto paralar, endeksler ve emtialar genellikle CFD (Fark Sözleşmesi) veya borsa vadeli türev sözleşmeleri üzerinden sunulur. Bunların tamamı teknik olarak spot Forex döviz piyasasının doğrudan bir parçası değildir.
      </div>

      {/* Methods Table */}
      {activeTab === 'methods' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                <th className="py-2 px-2 w-48">İşlem Türü</th>
                <th className="py-2 px-2">Açıklama</th>
                <th className="py-2 px-2 w-32">Risk Profili</th>
                <th className="py-2 px-2 w-56">Kullanılan Araçlar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {filteredMethods.map((m) => (
                <tr key={m.name} className="hover:bg-zinc-800/40">
                  <td className="py-2.5 px-2 font-semibold text-white">{m.name}</td>
                  <td className="py-2.5 px-2 text-zinc-300 leading-relaxed">{m.description}</td>
                  <td className="py-2.5 px-2 font-mono text-zinc-400">{m.riskProfile}</td>
                  <td className="py-2.5 px-2 text-zinc-400">{m.instruments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Concepts Table */}
      {activeTab === 'concepts' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                <th className="py-2 px-2 w-36">Kavram / Terim</th>
                <th className="py-2 px-2 w-36">Türkçe Karşılığı</th>
                <th className="py-2 px-2 w-24">Kategori</th>
                <th className="py-2 px-2">Tanım</th>
                <th className="py-2 px-2 w-64">Örnek</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {filteredConcepts.map((c) => (
                <tr key={c.term} className="hover:bg-zinc-800/40">
                  <td className="py-2.5 px-2 font-semibold font-mono text-white">{c.term}</td>
                  <td className="py-2.5 px-2 text-zinc-300">{c.turkish}</td>
                  <td className="py-2.5 px-2 text-zinc-400">{c.category}</td>
                  <td className="py-2.5 px-2 text-zinc-300 leading-relaxed">{c.definition}</td>
                  <td className="py-2.5 px-2 text-zinc-400 font-mono text-[11px]">{c.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

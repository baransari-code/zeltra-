import React, { useState } from 'react';
import { TradeSignal, Asset } from '../types';

interface SignalCardProps {
  signal: TradeSignal;
  asset: Asset;
}

export const SignalCard: React.FC<SignalCardProps> = ({ signal, asset }) => {
  const [copied, setCopied] = useState(false);
  const [userBalance, setUserBalance] = useState<number>(10000);
  const [activePreset, setActivePreset] = useState<number>(10000);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const handleCopy = () => {
    const text = `${signal.symbol} | Eylem: ${signal.decisionBadge} | Giriş: ${signal.entryPrice.toFixed(asset.digits)} | TP: ${signal.takeProfit.toFixed(asset.digits)} | SL: ${signal.stopLoss.toFixed(asset.digits)} | R:R: 1:${signal.riskRewardRatio}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePresetBalance = (val: number) => {
    setUserBalance(val);
    setActivePreset(val);
  };

  // Sermaye Kalkanı Dinamik Parasal Hesaplama
  const usdToTry = 38.5;
  const plan = signal.executivePlan;
  const userRiskUSD = +(userBalance * (plan.maxLossPercent / 100)).toFixed(1);
  const userRewardUSD = +(userRiskUSD * signal.riskRewardRatio).toFixed(1);
  const userRiskTRY = +(userRiskUSD * usdToTry).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  const userRewardTRY = +(userRewardUSD * usdToTry).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

  return (
    <div className="border border-zinc-800 bg-zinc-900 rounded p-3 sm:p-4 space-y-3 sm:space-y-4">
      {/* 1. ÜST KOKPİT: REJİM BAZLI 3 SANİYELİK KARAR ŞERİDİ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold text-white tracking-tight">{signal.symbol}</span>
            <span className="text-xs text-zinc-400 font-normal">({asset.name})</span>
            {/* Minimal Karar Rozeti (Glowsuz, Sade Koyu Finans Teması) */}
            <span className="text-xs px-2.5 py-0.5 rounded font-mono font-medium border border-zinc-700 bg-zinc-800 text-zinc-100">
              {signal.decisionBadge}
            </span>
            {/* İdeal Alım Kuşağı Durum Rozeti */}
            <span className="text-xs text-zinc-400 font-mono">
              [{signal.idealEntryRange.status === 'ALIM_BÖLGESİNDE' ? 'İdeal Fiyat Seviyesinde' : 'Düzeltme Bekleniyor'}]
            </span>
          </div>

          {/* Sıradan İnsanın Anlayacağı 1 Cümlelik Yönetici Tavsiyesi */}
          <p className="text-xs text-zinc-300 font-normal leading-relaxed">
            {signal.oneSentenceAdvice}
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={handleCopy}
            className="text-xs px-3 py-1.5 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 hover:text-white transition-colors"
          >
            {copied ? 'Kopyalandı' : 'Sinyali Kopyala'}
          </button>
        </div>
      </div>

      {/* İdeal Alım Aralığı Bilgi Şeridi */}
      <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-2 text-zinc-300">
          <span className="font-semibold text-white">İdeal Alım Aralığı:</span>
          <span className="font-mono text-zinc-200 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
            {signal.idealEntryRange.min.toFixed(asset.digits)} — {signal.idealEntryRange.max.toFixed(asset.digits)}
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-400">{signal.idealEntryRange.note}</span>
        </div>
        <div className="text-zinc-400 font-mono text-[11px] shrink-0">
          Geriye Dönük Başarı: <strong className="text-zinc-200 font-semibold">%{signal.winProbability}</strong> (1 Yıllık Test)
        </div>
      </div>

      {/* 2. SADE 3 KOLONLU İŞLEM PLANI (Giriş, Kâr Al, Zarar Durdur) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Giriş */}
        <div className="border border-zinc-800 bg-zinc-950 p-3 rounded space-y-1">
          <div className="text-zinc-400 text-xs font-medium flex items-center justify-between">
            <span>GİRİŞ SEVİYESİ</span>
            <span className="text-[10px] text-zinc-500 font-mono">Mevcut Fiyat</span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {signal.entryPrice.toFixed(asset.digits)}
          </div>
          <div className="text-[11px] text-zinc-500">
            İşleme dahil olunacak referans fiyat
          </div>
        </div>

        {/* Kâr Al (TP) */}
        <div className="border border-zinc-800 bg-zinc-950 p-3 rounded space-y-1">
          <div className="text-zinc-400 text-xs font-medium flex items-center justify-between">
            <span>KÂR AL HEDEFİ (TP 1)</span>
            <span className="font-mono text-zinc-300 text-[11px]">
              +%{plan.targetGainPercent}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            {signal.takeProfit.toFixed(asset.digits)}
          </div>
          <div className="text-[11px] text-zinc-400 font-mono">
            +{userRewardUSD} $ <span className="text-zinc-500">({userRewardTRY} TL Getiri)</span>
          </div>
        </div>

        {/* Zarar Durdur (SL / Emniyet Kemeri) */}
        <div className="border border-zinc-800 bg-zinc-950 p-3 rounded space-y-1">
          <div className="text-zinc-400 text-xs font-medium flex items-center justify-between">
            <span>ZARAR DURDUR (SL)</span>
            <span className="font-mono text-zinc-300 text-[11px]">
              -%{plan.maxLossPercent}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-rose-400">
            {signal.stopLoss.toFixed(asset.digits)}
          </div>
          <div className="text-[11px] text-zinc-400 font-mono">
            -{userRiskUSD} $ <span className="text-zinc-500">({userRiskTRY} TL Maks. Kayıp)</span>
          </div>
        </div>
      </div>

      {/* 3. AKILLI SERMAYE KALKANI (KASA KORUMA VE PROFESYONEL PARA YÖNETİMİ) */}
      <div className="border border-zinc-800 bg-zinc-950 p-3.5 rounded space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
            Sermaye Kalkanı (Kasa Büyüklüğü Simülasyonu)
          </h3>

          {/* Hızlı Bakiye Seçimi */}
          <div className="flex items-center space-x-1.5 text-xs font-mono">
            <span className="text-zinc-500 text-[11px]">Bakiye:</span>
            {[1000, 5000, 10000, 25000].map((preset) => (
              <button
                key={preset}
                onClick={() => handlePresetBalance(preset)}
                className={`px-2 py-0.5 rounded text-[11px] transition-colors border ${
                  activePreset === preset
                    ? 'bg-zinc-800 text-white font-medium border-zinc-600'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                }`}
              >
                ${preset.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Kurumsal Para Yönetimi Kuralı (Breakeven & %50 Kâr Al) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <div className="bg-zinc-900 border border-zinc-800/80 p-2.5 rounded space-y-1">
            <div className="text-zinc-200 font-semibold text-[11px]">
              Kural 1: %50 Kâr Alımı (TP1 Seviyesinde)
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {plan.partialTakeProfitRule}
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800/80 p-2.5 rounded space-y-1">
            <div className="text-zinc-200 font-semibold text-[11px]">
              Kural 2: Başa Baş (Risksiz Stop Kuralı)
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {plan.breakevenRule}
            </p>
          </div>
        </div>
      </div>

      {/* 4. DESTEK & KIRILIM GÜVENLİK BARI VE SENARYO A/B */}
      {signal.keyLevels && (
        <div className="border border-zinc-800 bg-zinc-950 p-3.5 rounded space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2">
            <span className="text-xs font-semibold text-white font-mono uppercase tracking-wider">
              Destek & Kırılım Durumu
            </span>
            <div className="flex items-center space-x-3 text-xs font-mono">
              <span className="text-zinc-400">
                Alıcı Teyidi: <strong className="text-zinc-200">{signal.keyLevels.supportTests} Kez</strong>
              </span>
              <span className="text-zinc-400">
                Güvenlik: <strong className="text-zinc-200">%{plan.supportSafetyScore}</strong>
              </span>
            </div>
          </div>

          {/* Güvenlik Gösterge Barı */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Destek: <strong className="text-zinc-200 font-mono">{signal.keyLevels.support}</strong></span>
              <span>Uzaklık: <strong className="text-zinc-200 font-mono">%{plan.distanceToSupportPercent}</strong></span>
              <span>Alt Destek: <strong className="text-zinc-400 font-mono">{signal.keyLevels.nextSupport}</strong></span>
            </div>
            <div className="w-full bg-zinc-900 border border-zinc-800 h-1.5 rounded overflow-hidden">
              <div
                className="h-full bg-zinc-400"
                style={{ width: `${plan.supportSafetyScore}%` }}
              ></div>
            </div>
          </div>

          {/* Senaryo A ve Senaryo B Karar Kartları */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
            {/* Senaryo A */}
            <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded space-y-1">
              <div className="flex items-center justify-between text-zinc-200 font-semibold text-[11px]">
                <span>{signal.scenarios.scenarioA.name}</span>
                <span className="font-mono text-[10px] text-zinc-400">
                  %{signal.scenarios.scenarioA.probability} İhtimal
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                <strong>Koşul:</strong> {signal.scenarios.scenarioA.condition}
              </p>
              <p className="text-[11px] text-zinc-400">
                <strong>Plan:</strong> {signal.scenarios.scenarioA.actionPlan}
              </p>
            </div>

            {/* Senaryo B */}
            <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded space-y-1">
              <div className="flex items-center justify-between text-zinc-200 font-semibold text-[11px]">
                <span>{signal.scenarios.scenarioB.name}</span>
                <span className="font-mono text-[10px] text-zinc-400">
                  %{signal.scenarios.scenarioB.probability} İhtimal
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                <strong>Koşul:</strong> {signal.scenarios.scenarioB.condition}
              </p>
              <p className="text-[11px] text-zinc-400">
                <strong>Plan:</strong> {signal.scenarios.scenarioB.actionPlan}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. HABER ETKİSİ ROZETİ */}
      {signal.newsSentiment && (
        <div className="bg-zinc-950 border border-zinc-800 p-2.5 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-mono text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded">
              Haber Etkisi
            </span>
            <span className="text-zinc-200 font-medium">
              {signal.newsSentiment.headline}
            </span>
          </div>
          <div className="text-zinc-400 text-[11px] shrink-0">
            {signal.newsSentiment.simpleImpact}
          </div>
        </div>
      )}

      {/* Akordiyon: Derin Teknik Gerekçeler (İsteyenler için) */}
      <div className="pt-1">
        <button
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center space-x-1 font-mono transition-colors"
        >
          <span>{showTechnicalDetails ? '[-] Teknik & İstatistiksel Detayları Gizle' : '[+] Teknik & İstatistiksel Detayları Göster'}</span>
        </button>

        {showTechnicalDetails && (
          <div className="mt-2 p-3 bg-zinc-950 border border-zinc-800 rounded text-xs space-y-2">
            <ul className="text-zinc-400 space-y-1 list-disc list-inside">
              {signal.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

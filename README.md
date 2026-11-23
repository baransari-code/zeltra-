# ZELTRA CORTEX v15.2 — Öz-Öğrenen 5-Uzmanlı Yapay Zeka & 250.000 TL Kurumsal Otonom Fon Platformu

**ZELTRA Cortex v15.2**, 17 küresel finansal enstrüman (Değerli Metaller, ABD Endeks & Teknoloji Hisseleri, Enerji, Majör FX ve 7/24 Kripto) üzerinde çalışan, sıfır look-ahead ilkesiyle gerçek borsa verisinde doğrulanmış ve her sonuçlanan tahminden kendi kendine öğrenen kurumsal kantitatif işlem platformudur.

---

## Modüler Dosya ve Klasör Mimarisi

```text
TransZel/
├── server/                         # Arka Plan Kantitatif Motorlar & API Katmanı
│   ├── prodServer.ts               # 7/24 Production HTTP Sunucusu & Keep-Alive Heartbeat
│   ├── apiRouter.ts                # Tekil Birleşik API Yönlendiricisi (/api/*)
│   ├── zeltraSelfLearningAi.ts     # Cortex v15.2 Öz-Öğrenen 5-Uzmanlı Yapay Zeka & Mum/VSA/Sweep Motoru
│   ├── zeltraAlphaIndicator.ts     # ZAC v14.0 5-Sütunlu Kantitatif İndikatör & 3-Pod Sinyal Çekirdeği
│   ├── liveAuditEngine.ts          # /canli İleri-Dönük Mühürlü Tahmin (+1S/+4S/+24S) & Doğrulama Motoru
│   ├── autonomousTrader.ts         # 250.000 TL 3-Pod Otonom Fon & 2Y Saatlik Walk-Forward Denetim Motoru
│   ├── manualTrader.ts             # 250.000 TL Manuel IBKR Arena & Sen vs Bot Yarışma Motoru
│   ├── marketService.ts            # Yahoo Finance & Kraken Gerçek Zamanlı OHLCV / Makro / RSS Veri Servisi
│   └── newsAiEngine.ts             # Kurumsal Haber Duyarlılık (NLP) & Nedensel Etki Analiz Motoru
│
├── src/                            # Ön Yüz (React + TypeScript + Tailwind CSS)
│   ├── App.tsx                     # Ana Uygulama Yönlendiricisi (/canli, /, /indicator, /test2, /news, /risk)
│   ├── types/index.ts              # Ortak TypeScript Veri Tipleri
│   └── components/
│       ├── Navbar.tsx              # Üst Navigasyon & Canlı Haber Bildirim Çubuğu
│       ├── LiveAuditView.tsx       # /canli — Mühürlü Canlı Tahmin Karnesi & 5-Uzman Yapay Zeka Öz-Eleştiri Paneli
│       ├── AutonomousTestView.tsx  # 250.000 TL 3-Pod Otonom Fon & 2Y Walk-Forward Denetim Ekranı
│       ├── ProIndicatorTerminal.tsx# ZAC v14 & Smart Money (VSA / BSL-SSL / Order Block / FVG) Grafik Terminali
│       ├── ManualArenaView.tsx     # 250.000 TL Manuel IBKR İşlem & Bot Karşılaştırma Arenası
│       ├── InstitutionTracker.tsx  # Küresel Kurumsal Haber & Makro Etki Takipçisi
│       └── RiskCalculator.tsx      # IBKR & Midas Pozisyon Büyüklüğü ve ATR Risk Hesaplayıcısı
│
└── data/                           # Kalıcı Canlı Durum & Yapay Zeka Hafıza Dosyaları (JSON)
    ├── zeltra_ai_brain.json        # Cortex v15.2 5-Uzman Ağırlıkları, Varlık Hafızası & Öğrenilen Dersler
    ├── live_forward_audit.json     # /canli Mühürlü İleri-Dönük Tahmin Defteri (+1S / +4S / +24S)
    ├── autonomous_trader_ledger.json # 250.000 TL Otonom Fon Açık/Kapalı İşlem & Bakiye Defteri
    └── manual_trader_ledger.json   # 250.000 TL Manuel Arena İşlem Defteri
```

---

## Çekirdek Bileşenler

### 1. ZELTRA Cortex v15.2 — Öz-Öğrenen 5-Uzmanlı Yapay Zeka (`server/zeltraSelfLearningAi.ts`)
- **Kurumsal Mum Anatomisi & Smart Money Mikroyapı:** `SSL_SWEEP_BULL_PINBAR`, `BSL_SWEEP_BEAR_REJECTION`, `VSA_STOPPING_VOLUME_BULL`, `VSA_ABSORPTION_SUPPLY_BEAR`, `BULLISH/BEARISH_ENGULFING_DISPLACEMENT`, `BULLISH/BEARISH_FVG_IMBALANCE`, `CLIMAX_EXHAUSTION_REVERSAL`, Order Block ve BOS/ChoCH tespiti.
- **5-Uzmanlı Ufuk-Bazlı (`+1S`, `+4S`, `+24S`) Adaptif Topluluk:**
  1. `E1_MACRO_TREND` (Günlük Çok-Hızlı EWMAC & SMA200)
  2. `E2_MICRO_DISPLACEMENT` (12H/1H İvme & FVG Dengesizliği)
  3. `E3_MEAN_REV_SPRING` (12H/1H RSI2 & IBS Yay Sıkışması)
  4. `E4_CANDLE_VSA_SWEEP` (Mum Anatomisi, VSA Emilim & BSL/SSL Likidite Süpürmesi)
  5. `E5_XSMOM_REGIME` (17 Varlık Kesitsel Liderlik & Volatilite Rejimi)
- **Dipten/Tepeden Geç Giriş Kalkanı (`Anti-Chasing Guard`) & Varlık Hafızası (`assetProfiles`):** Aşırı uzamış mumların peşinden geç giriş yapmayı engeller; her sonuçlanan tahminde L2-Multiplicative Weights ile uzman ağırlıklarını ve varlık bazlı yön kaymasını (`assetBiasScore`) günceller.

### 2. Citadel Tarzı 3-Pod Otonom Fon Motoru (`server/autonomousTrader.ts`)
- **Pod-1 (`MR_SPRING_12H`):** Seküler boğa trendinde 12H aşırı satım sıkışması (`IBS12 < 0.22`, `CumRSI2 < 18`).
- **Pod-2 (`CRYPTO_MOM_12H`):** `BTC/USD`, `ETH/USD`, `SOL/USD` üzerinde 7/24 sakin-volatilite çift yönlü trend.
- **Pod-3 (`CTA_TREND`):** Günlük çok-hızlı EWMAC makro trend takibi (çift yönlü kurumsal trend sürüşü).

---

## Çalıştırma Komutları

```bash
npm install
npm run dev      # Geliştirme sunucusu: http://localhost:5174
npm run build    # TypeScript + Vite Production derleme
npm start        # Production sunucusu: http://localhost:3000
```

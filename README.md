# ZELTRA CORTEX v16.1 — Kapanmış-Mum SMC Yapay Zeka & $25,000 USD Gerçek IBKR Pro Otonom Fon Platformu

**ZELTRA Cortex v16.1**, $25,000.00 USD başlangıç sermayeli gerçek **Interactive Brokers (IBKR Pro — Reg-T Margin / FINRA PDT Üstü)** hesap fiziğiyle çalışan; canlı Bid/Ask spread, giriş/çıkış kayması (`slippage`), resmi IBKR komisyonları, ABD hisse takas/SEC/FINRA TAF harçları ve `%6.33` gecelik marjin faizi dahil sıfır iyimser varsayımla gerçek piyasa üzerinde işlem yapan kurumsal kantitatif platformdur.

---

## Modüler Dosya ve Klasör Mimarisi

```text
TransZel/
├── server/                         # Arka Plan Kantitatif Motorlar & API Katmanı
│   ├── prodServer.ts               # 7/24 Production HTTP Sunucusu & Keep-Alive Heartbeat
│   ├── apiRouter.ts                # Tekil Birleşik API Yönlendiricisi (/api/*)
│   ├── zeltraSelfLearningAi.ts     # Cortex v16.0 Kapanmış-Mum SMC, Diurnal VSA & 5-Uzmanlı Öz-Öğrenen AI
│   ├── zeltraAlphaIndicator.ts     # ZAC v14.0 5-Sütunlu Kantitatif İndikatör, Wilder ADX14 & 4S/12S/1G Motoru
│   ├── liveAuditEngine.ts          # /canli İleri-Dönük Mühürlü Tahmin (+1S/+4S/+24S) & Kronolojik Denetim Motoru
│   ├── autonomousTrader.ts         # $1,000 USD Hibrit 3-Pod + Cortex Sniper Otonom Fon & 2Y Walk-Forward Motoru
│   ├── manualTrader.ts             # $1,000 USD Manuel IBKR Arena & Sen vs Bot Yarışma Motoru
│   ├── marketService.ts            # Yahoo Finance & Kraken OHLCV Sanitizer, NY 17:00 ET Seans & RSS Veri Servisi
│   └── newsAiEngine.ts             # Çift Yönlü FX-Bilinçli Kurumsal Haber Duyarlılık (NLP) & Nedensel Etki Motoru
│
├── src/                            # Ön Yüz (React + TypeScript + Tailwind CSS)
│   ├── App.tsx                     # Ana Uygulama Yönlendiricisi (/canli, /, /indicator, /test2, /news, /risk)
│   ├── types/index.ts              # Ortak TypeScript Veri Tipleri
│   └── components/
│       ├── Navbar.tsx              # Üst Navigasyon & Canlı Haber Bildirim Çubuğu
│       ├── LiveAuditView.tsx       # /canli — Mühürlü Canlı Tahmin Karnesi & 5-Uzman Yapay Zeka Öz-Eleştiri Paneli
│       ├── AutonomousTestView.tsx  # $1,000 USD 3-Pod + Cortex Otonom Fon & 2Y Walk-Forward Denetim Ekranı
│       ├── ProIndicatorTerminal.tsx# ZAC v14 & Görsel Smart Money (FVG / OB / BSL-SSL / Kapanmış Mum) Terminali
│       ├── ManualArenaView.tsx     # $1,000 USD Manuel IBKR İşlem & Bot Karşılaştırma Arenası
│       ├── InstitutionTracker.tsx  # Küresel Kurumsal Haber & Makro Etki Takipçisi
│       └── RiskCalculator.tsx      # IBKR & Midas USD Pozisyon Büyüklüğü ve ATR Risk Hesaplayıcısı
│
└── data/                           # Kalıcı Canlı Durum & Yapay Zeka Hafıza Dosyaları (JSON)
    ├── zeltra_ai_brain.json        # Cortex v16.0 5-Uzman Ağırlıkları, Saf Yönlü Varlık Hafızası & Dersler
    ├── live_forward_audit.json     # /canli Mühürlü İleri-Dönük Tahmin Defteri (+1S / +4S / +24S)
    ├── autonomous_trader_ledger.json # $1,000 USD Otonom Fon Açık/Kapalı İşlem & Bakiye Defteri
    └── manual_trader_ledger.json   # $1,000 USD Manuel Arena İşlem Defteri
```

---

## Çekirdek Bileşenler

### 1. ZELTRA Cortex v16.0 — Kapanmış-Mum SMC & Öz-Öğrenen 5-Uzmanlı Yapay Zeka (`server/zeltraSelfLearningAi.ts`)
- **%100 Kapanmış Mum Teyidi + Canlı Uzanım Kalkanı:** Yarım kalan saatlik/seanslık mumların sahte `Inside Bar` ve düşük hacim üretmesini engeller (`findLastClosedBarIndex`, NYSE `15:30–16:00 ET` yarım saatlik kapanış barı uyumlu).
- **15 Kurumsal Mum & Smart Money Yapısı:** Onaylı Swing Pivot (`L=2, R=2`) `BSL/SSL` likidite havuzları, `Equal Highs / Equal Lows (EQH/EQL)`, 24-bar kapatılmamış `FVG Retest` (`%50 CE`), `Order Block Mitigation`, `Morning/Evening Star`, `Tweezer Top/Bottom`, `Pinbar/Shooting Star`, `Selling/Buying Climax` ve Diurnal RVOL / FX Range-Activity VSA tespiti.
- **5-Uzmanlı Çok-Ölçekli (`1S + 4S + 12S + 1G`) Adaptif Topluluk:**
  1. `E1_MACRO_TREND` (Günlük Çok-Hızlı EWMAC & SMA200 Seküler Rejim)
  2. `E2_MICRO_DISPLACEMENT` (4S/12S/1S Verimlilik-Kapılı Yapısal İvme & FVG/OB)
  3. `E3_MEAN_REV_SPRING` (Trend-Koşullu 1S/4S/12S RSI2 & IBS Geri Çekilme Yayı)
  4. `E4_CANDLE_VSA_SWEEP` (Kapanmış Mum Anatomisi, Diurnal VSA & BSL/SSL Likidite Süpürmesi)
  5. `E5_XSMOM_REGIME` (17 Varlık Kesitsel Liderlik, Volatilite Rejimi & Nedensel Haber Katalizörü)

### 2. Hibrit 3-Pod Swing + Cortex Sniper Otonom Fon Motoru (`server/autonomousTrader.ts`)
- **Pod-1 (`MR_SPRING_12H`):** Seküler boğa trendinde 12H aşırı satım sıkışması (`IBS12 < 0.22`, `CumRSI2 < 18`).
- **Pod-2 (`CRYPTO_MOM_12H`):** `BTC/USD`, `ETH/USD`, `SOL/USD` üzerinde 7/24 sakin-volatilite çift yönlü trend.
- **Pod-3 (`CTA_TREND`):** Günlük çok-hızlı EWMAC makro trend takibi + yüksek konfluensli (`SNIPER / HIGH`) Cortex v16.0 tetik entegrasyonu ve sıkı IBKR komisyon/spread bariyeri.

---

## Çalıştırma Komutları

```bash
npm install
npm run dev      # Geliştirme sunucusu: http://localhost:5174
npm run build    # TypeScript + Vite Production derleme
npm start        # Production sunucusu: http://localhost:3000
```

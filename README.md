# ZELTRA QUANT v14.0 — Kurumsal 3-Pod Otonom Fon & ZAC v14 İndikatör Platformu

**ZELTRA v14.0**, 17 küresel finansal enstrüman (Değerli Metaller, ABD Endeks & Teknoloji Hisseleri, Enerji, Majör FX ve 7/24 Kripto) üzerinde çalışan, sıfır look-ahead ilkesiyle gerçek borsa verisinde doğrulanmış kurumsal kantitatif işlem ve tahmin platformudur.

## Mimari & Çekirdek Bileşenler

### 1. ZELTRA Alpha Composite (ZAC v14.0) — Kurumsal İndikatör (`server/zeltraAlphaIndicator.ts`)
Tüm platformun (Otonom Bot + Pro Grafik Terminali + Çoklu-Ufuk Tahmin + Piyasa Radarı) tekil matematiksel kaynağıdır:
- **Sütun 1 — Çok-Hızlı Trend Hızı (EWMAC 8/32 + 16/64 + 32/128):** ATR(20) normalize kurumsal trend gücü (`-20 .. +20`).
- **Sütun 2 — Varlık Sınıfına Özel 12H Mikro-Alfa:** Hisse/Endeks/Metaller için seküler boğa içi 12H dip sıkışması (`IBS12` + `CumRSI2`), Kripto için sakin volatilitede 12H çift yönlü momentum.
- **Sütun 3 — Kesitsel Liderlik Sıralaması (XSMOM 30G):** 17 varlık arası riske göre düzeltilmiş göreceli momentum sıralaması (`#1 .. #17`).
- **Sütun 4 — Rejim & Volatilite Kalkanı:** `SMA200` + `VolRatio (ATR14/ATR50)` + `Kaufman ER(20)` + canlı `VIX` koruması.
- **Sütun 5 — Kalibre Çoklu-Ufuk Tahmin Konisi (`+4S / +12S / +24S / +72S`):** `%90` ampirik volatilite bandı + gerçek zamanlı OOS kendi-denetim.

### 2. Citadel Tarzı 3-Pod Otonom Fon Motoru (`server/autonomousTrader.ts`)
250.000 TL başlangıç sermayesi, ayrık pod kotaları, gerçek IBKR komisyonları, spread, kayma ve `%6.8/yıl` gecelik finansman ile çalışır:
- **Pod-1 (`MR_SPRING_12H`):** Hisse/Endeks/Metal 12H seküler dip sıçraması (maks 4 slot, `%1.5` risk, 3 ATR SL / 3 ATR TP veya önceki 12H tepe üstü çıkış).
- **Pod-2 (`CRYPTO_MOM_12H`):** BTC, ETH, SOL üzerinde 7/24 sakin-volatilite çift yönlü trend (maks 2 slot, 3 ATR iz süren stop).
- **Pod-3 (`CTA_TREND`):** Günlük çok-hızlı EWMAC makro trend takibi (maks 2 slot, 3.2 ATR iz süren stop).

### 3. Gerçek 2 Yıllık Saatlik Walk-Forward Doğrulaması (Kasım 2024 – Kasım 2026)
- **Eski Sistem (v13.2):** 250.000 TL → **24.300 TL (-%90.3)** | MaxDD **%90.9** | PF **0.58** | **0/9** pozitif çeyrek
- **Yeni ZELTRA v14.0:** 250.000 TL → **381.093 TL (+%52.4)** | Sharpe **1.47** | Sortino **2.33** | MaxDD **%8.69** | PF **1.79** | WR **%61.6** | **7/9** pozitif çeyrek
- **Son 30 Gün (21.10.2026 – 19.11.2026):** 250.000 TL → **252.853 TL (+%1.14)** | Sharpe **1.14** | MaxDD **%2.64** | WR **%83.3** | PF **10.0**
- **±%20 Parametre Stres Testi:** 5/5 komşu senaryo net kârlı (`+%5.3` ile `+%55.8` arası).

## Kurulum ve Çalıştırma

```bash
cd c:\Users\Baran\Desktop\Business\TransZel
npm install
npm run dev      # Geliştirme sunucusu: http://localhost:5174
npm run build    # TypeScript + Production derleme
npm start        # Production sunucusu: http://localhost:3000
```

# TransZel — AI Destekli Forex & Emtia Kantitatif Analiz Platformu

**TransZel**, nexustrans, Belgex ve Toykarot projelerinizin yanına 4. ana proje olarak eklenen profesyonel bir kantitatif finans ve risk yönetim platformudur.

## Temel Amaç & Özellikler

1. **Risk Minimize Edici 1 Yıllık Veri Analizi:**
   - Seçilen enstrümanın (EUR/USD, GBP/USD, USD/JPY, XAU/USD Ons Altın, XAG/USD Ons Gümüş, BRENT Ham Petrol) son 365 günlük fiyat hareketlerini ve oynaklığını inceler.
   - 200 EMA, 50 EMA, 20 EMA, 14 periyotluk RSI, Bollinger Bantları ve ATR (Average True Range) modelleriyle trend yönünü ve destek/direnç eşiklerini belirler.

2. **Yapay Zeka Sinyal & Koordinat Motoru:**
   - Bot, rastgele tahminler yerine matematiksel doğruluk oranına dayalı net seviyeler verir.
   - Örnek: `EUR/USD 1.1116 seviyesinde TP 1.1120, SL 1.1115 izleyeceğiz.`
   - İkinci kâr hedefi (TP2), Risk/Kazanç (R:R) oranı ve geriye dönük test (backtest) kazanma olasılığı (%86.4) anlık hesaplanır.

3. **Sağ Üstte Canlı Bildirim Çanı & Flaş Haber Takibi:**
   - Şirketlerin, küresel merkez bankalarının (Fed, ECB, BoJ) ve dev emtia üreticilerinin (Barrick Gold, Saudi Aramco, Glencore) durumlarını 7/24 denetler.
   - Kritik bir haber piyasaya vurduğunda sağ üstteki çan ikonu titreşir ve rozet sayısı artar.
   - Çana tıklandığında haberin özeti, etki derecesi (Yüksek/Orta/Düşük), piyasa yönü (Pozitif/Negatif/Kritik) ve **resmi haber kaynağı** (Bloomberg, Reuters, Financial Times vb.) anında listelenir.
   - Arayüzden anlık haber test etmek için tek tıkla "Haber Vuruşu Simüle Et" özelliği bulunur.

4. **Sermaye Koruma & Güvenli Lot Hesaplayıcı:**
   - Kullanıcının hesap bakiyesine ($) ve belirlediği risk yüzdesine (%1 - %2) göre açması gereken tam lot büyüklüğünü hesaplar, stoploss olmadan işlem açılmasını engeller.

## Kurulum ve Çalıştırma

Proje klasörüne çift tıklayarak `baslat.bat` dosyasını çalıştırabilir veya terminalden şu komutları verebilirsiniz:

```bash
cd c:\Users\Baran\Desktop\Business\TransZel
npm.cmd run dev
```

Platform varsayılan olarak `http://localhost:5174` portunda canlı olarak açılır.

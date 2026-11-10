import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {
  fetchReal1YearData,
  fetchRealFinancialNews,
  generate24HourPredictions,
  extractNewsSentimentForAsset,
} from './server/marketService'
import {
  loadTestState,
  executeValidationCycle,
} from './server/forecastValidator'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'real-market-api',
      configureServer(server) {
        // 1 Yıllık Gerçek Mum Verisi ve Anlık Fiyat
        server.middlewares.use('/api/real-data', async (req, res) => {
          try {
            const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
            const symbol = urlObj.searchParams.get('symbol') || 'EUR/USD';
            const data = await fetchReal1YearData(symbol);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Bilinmeyen hata' }));
          }
        });

        // Çok Kaynaklı ve Sadece Son 24 Saat İçerisindeki Canlı Haberler
        server.middlewares.use('/api/real-news', async (_req, res) => {
          try {
            const news = await fetchRealFinancialNews();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(news));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Bilinmeyen hata' }));
          }
        });

        // Canlı Haber Tabanlı Dinamik 24 Saatlik Kantitatif Tahminler
        server.middlewares.use('/api/hourly-forecast', async (req, res) => {
          try {
            const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
            const symbol = urlObj.searchParams.get('symbol') || 'EUR/USD';
            const hours = parseInt(urlObj.searchParams.get('hours') || '24', 10);

            // Gerçek borsa verisi ve son 24 saatlik gerçek haberleri eşzamanlı çek
            const [marketData, newsList] = await Promise.all([
              fetchReal1YearData(symbol),
              fetchRealFinancialNews(),
            ]);

            // Enstrümana özel haber duyarlılığı ve şok puanı
            const newsContext = extractNewsSentimentForAsset(symbol, newsList);

            const digitsParam = urlObj.searchParams.get('digits');
            let digits = 4;
            if (digitsParam !== null && !isNaN(parseInt(digitsParam, 10))) {
              digits = parseInt(digitsParam, 10);
            } else if (marketData.price > 20 || symbol.includes('JPY') || symbol.includes('TRY') || symbol.includes('XAU') || symbol.includes('XAG') || symbol.includes('XPT') || symbol.includes('XPD') || symbol.includes('BRENT') || symbol.includes('WTI')) {
              digits = 2;
            }
            const predictions = generate24HourPredictions(marketData.price, marketData.candles, digits, hours, newsContext);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              symbol: marketData.symbol,
              currentPrice: marketData.price,
              change24h: marketData.change24h,
              digits,
              baselineTime: new Date().toISOString(),
              newsContext,
              predictions,
            }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Tahmin üretilemedi' }));
          }
        });

        // 4 Günlük Doğrulama Testi API'si ve Canlı İzleme
        server.middlewares.use('/api/forecast-validation', async (req, res) => {
          try {
            const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
            const triggerTick = urlObj.searchParams.get('tick') === 'true';
            const state = triggerTick ? await executeValidationCycle() : loadTestState();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(state));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Doğrulama verisi okunamadı' }));
          }
        });

        // İlk başlangıç testi döngüsünü tetikle ve her 30 dakikada bir otomatik yürüt
        setTimeout(() => {
          executeValidationCycle().catch(console.error);
        }, 3000);
        setInterval(() => {
          executeValidationCycle().catch(console.error);
        }, 30 * 60 * 1000);
      },
    },
  ],
  server: {
    port: 5174,
  },
})

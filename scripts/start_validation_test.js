// ZELTRA 4 Günlük Doğrulama Testi Başlatıcı & Anlık Durum Raporlayıcı
import http from 'http';

async function trigger() {
  const url = 'http://localhost:5174/api/forecast-validation?tick=true';
  const req = http.get(url, (res) => {
    let raw = '';
    res.on('data', (c) => (raw += c));
    res.on('end', () => {
      try {
        const state = JSON.parse(raw);
        console.log('--- ZELTRA 4 GÜNLÜK DOĞRULAMA TESTİ AKTİF ---');
        console.log('Test ID:', state.testId);
        console.log('Durum:', state.status);
        console.log('Başlangıç:', state.startDate);
        console.log('Hedef Bitiş (4. Gün):', state.targetEndDate);
        console.log('Takip Edilen Varlıklar:', state.testSymbols.join(', '));
        for (const sym of state.testSymbols) {
          const s = state.series[sym];
          console.log(`- ${sym}: Baz Fiyat=${s?.baselinePrice}, Snapshot Sayısı=${s?.snapshots?.length}`);
        }
      } catch (err) {
        console.error('Yanıt parse edilemedi:', err);
      }
    });
  });
  req.on('error', (e) => console.error('Bağlantı hatası:', e.message));
}

trigger();

// server/prodServer.ts — ZELTRA v14.0 Production HTTP Sunucusu (API + Statik SPA + Otonom Zamanlayıcı)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleZeltraApiRequest } from './apiRouter';
import { startAutonomousScheduler, STRATEGY_VERSION } from './autonomousTrader';
import { executeManualTradingTick } from './manualTrader';
import { runLiveAuditTick } from './liveAuditEngine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  try {
    const handled = await handleZeltraApiRequest(req, res);
    if (handled) return;
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: err?.message || 'Sunucu API hatası' }));
    return;
  }

  // SPA Statik Dosya Sunumu + Path Traversal Koruması
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const safeRelPath = urlObj.pathname.replace(/^\/+/, '');
  let filePath = path.resolve(DIST_DIR, safeRelPath);
  if (
    !filePath.startsWith(DIST_DIR) ||
    urlObj.pathname === '/' ||
    !fs.existsSync(filePath) ||
    fs.statSync(filePath).isDirectory()
  ) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    if (ext === '.html') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (safeRelPath.startsWith('assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.statusCode = 404;
    res.end('ZELTRA build çıktısı (dist/) bulunamadı. Lütfen önce "npm run build" çalıştırın.');
  }
});

// Mobil / Bulut Yük Dengeleyici (Render / Cloudflare) 502 Kopmalarını Önlemek İçin Keep-Alive Zaman Aşımları
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 [ZELTRA ${STRATEGY_VERSION}] 7/24 $25,000 IBKR Pro & Cortex v16.1 Sunucusu aktif -> http://0.0.0.0:${PORT}`);
  // Sıralı Orkestrasyon: Önce /canli mühürlerini sonuçlandır & kilitle, hemen ardından Otonom Fonu taze sinyallerle çalıştır!
  startAutonomousScheduler();
  setTimeout(async () => {
    await runLiveAuditTick(false).catch(() => {});
  }, 1000);
  setInterval(() => {
    runLiveAuditTick(false).catch(() => {});
  }, 60 * 1000);
  setInterval(() => {
    executeManualTradingTick(false).catch(() => {});
  }, 45 * 1000);

  // Render harici URL mevcutsa 8 dakikada bir yedek self-heartbeat (GitHub Actions gecikmelerine karşı çift kalkan)
  const externalUrl = process.env.RENDER_EXTERNAL_URL;
  if (externalUrl && externalUrl.startsWith('http')) {
    setInterval(() => {
      fetch(`${externalUrl.replace(/\/+$/, '')}/api/health`).catch(() => {});
    }, 8 * 60 * 1000);
  }
});

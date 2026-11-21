import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { handleZeltraApiRequest } from './server/apiRouter';
import { startAutonomousScheduler } from './server/autonomousTrader';
import { runLiveAuditTick } from './server/liveAuditEngine';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'zeltra-unified-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api/')) {
            try {
              const handled = await handleZeltraApiRequest(req, res);
              if (handled) return;
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: err?.message || 'Dev API hatası' }));
              return;
            }
          }
          next();
        });
        startAutonomousScheduler();
        setTimeout(() => runLiveAuditTick(false).catch(() => {}), 3000);
        setInterval(() => runLiveAuditTick(false).catch(() => {}), 60 * 1000);
      },
    },
  ],
  server: {
    port: 5174,
  },
});

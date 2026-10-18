import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server: arahkan deep link /portal/... ke portal/index.html (SPA fallback untuk frontend kedua)
const portalFallback = {
  name: 'portal-fallback',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (/^\/portal(\/[^.]*)?(\?.*)?$/.test(req.url)) req.url = '/portal/index.html';
      next();
    });
  },
};

export default defineConfig({
  // VITE_BASE=/itsm/ untuk GitHub Pages (https://<user>.github.io/itsm/)
  base: process.env.VITE_BASE || '/',
  plugins: [react(), portalFallback],
  build: {
    rollupOptions: {
      // Dua frontend: situs publik (/) dan portal login (/portal/)
      input: {
        public: resolve(__dirname, 'index.html'),
        portal: resolve(__dirname, 'portal/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});

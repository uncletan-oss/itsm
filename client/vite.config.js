import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // VITE_BASE=/itsm/ untuk GitHub Pages (https://<user>.github.io/itsm/)
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});

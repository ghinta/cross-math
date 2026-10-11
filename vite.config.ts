import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable.png'],
    manifest: {
      name: 'Cross Math', short_name: 'Cross Math', lang: 'de',
      description: 'Fülle die freien Felder so, dass alle Gleichungen stimmen.',
      theme_color: '#e8edf5', background_color: '#e8edf5',
      display: 'standalone', start_url: base, scope: base,
      icons: [
        { src: `${base}pwa-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${base}pwa-512.png`, sizes: '512x512', type: 'image/png' },
        { src: `${base}pwa-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      clientsClaim: true,
      globPatterns: ['**/*.{js,css,html,svg,png,wasm,webmanifest}'],
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      navigateFallback: `${base}index.html`,
    },
    disable: process.env.TAURI_ENV_PLATFORM !== undefined,
  })],
  clearScreen: false,
  server: { strictPort: true },
  build: { target: 'es2022' },
  worker: { format: 'es' },
});

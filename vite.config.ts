import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.VITE_BASE_PATH ?? '/';
const revision = process.env.GITHUB_SHA ?? process.env.BUILD_REVISION ?? 'local';

export default defineConfig({
  base,
  define: { __BUILD_REVISION__: JSON.stringify(revision) },
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png', 'pwa-1024.png', 'pwa-maskable.png', 'pwa-maskable-1024.png', 'appearance.js', 'crossmath-notice.txt'],
    manifest: {
      name: 'Cross Math', short_name: 'Cross Math', lang: 'de',
      description: 'Fülle die freien Felder so, dass alle Gleichungen stimmen.',
      theme_color: '#e8edf5', background_color: '#e8edf5',
      display: 'standalone', start_url: base, scope: base,
      icons: [
        { src: `${base}pwa-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${base}pwa-512.png`, sizes: '512x512', type: 'image/png' },
        { src: `${base}pwa-1024.png`, sizes: '1024x1024', type: 'image/png' },
        { src: `${base}pwa-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: `${base}pwa-maskable-1024.png`, sizes: '1024x1024', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      clientsClaim: true,
      skipWaiting: true,
      importScripts: ['sw-update-v1.js'],
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

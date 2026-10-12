import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.env.VITE_BASE_PATH ?? '/';
const revision = process.env.GITHUB_SHA ?? process.env.BUILD_REVISION ?? 'local';

export default defineConfig({
  base,
  define: { __BUILD_REVISION__: JSON.stringify(revision) },
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable.png', 'crossmath-notice.txt'],
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
  }), {
    name: 'release-manifest', enforce: 'post',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: '{}' });
    },
    writeBundle(options, bundle) {
      // Hash emitted files after Vite has resolved final chunk references.
      const dir = resolve(options.dir!);
      const files = Object.fromEntries(Object.keys(bundle).filter(name => name !== 'version.json').map(name => [name,
        createHash('sha256').update(readFileSync(resolve(dir, name))).digest('hex'),
      ]));
      writeFileSync(resolve(dir, 'version.json'), JSON.stringify({ revision, files }) + '\n');
    },
  }],
  clearScreen: false,
  server: { strictPort: true },
  build: { target: 'es2022' },
  worker: { format: 'es' },
});

import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Render the vector at each target resolution; never upscale a small bitmap.
const temporary = await mkdtemp(join(tmpdir(), 'cross-math-icons-'));
function icon(input, output, sizes = []) {
  const result = spawnSync(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', 'icon', input, '--output', output, ...sizes.flatMap(n => ['--png', String(n)])], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Icon generation failed.');
}
try {
  icon('public/icon.svg', join(temporary, 'web'), [32, 180, 192, 512, 1024]);
  for (const [size, name] of [[32, 'favicon-32.png'], [180, 'apple-touch-icon.png'], [192, 'pwa-192.png'], [512, 'pwa-512.png'], [1024, 'pwa-1024.png']]) {
    await cp(join(temporary, 'web', `${size}x${size}.png`), `public/${name}`);
  }
  const source = await readFile('public/icon.svg', 'utf8');
  const maskable = join(temporary, 'maskable.svg');
  await writeFile(maskable, source.replace('rx="114"', ''));
  icon(maskable, join(temporary, 'maskable'), [512, 1024]);
  await cp(join(temporary, 'maskable', '512x512.png'), 'public/pwa-maskable.png');
  await cp(join(temporary, 'maskable', '1024x1024.png'), 'public/pwa-maskable-1024.png');
  icon('public/icon.svg', join(temporary, 'native'));
  for (const name of ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.icns', 'icon.ico', 'icon.png']) await cp(join(temporary, 'native', name), `src-tauri/icons/${name}`);
  console.log('Vector icons rendered: favicon, Apple touch icon, PWA up to 1024 px, maskable and native icons.');
} finally { await rm(temporary, { recursive: true, force: true }); }

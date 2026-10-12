import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import legacy from '../data/legacy-puzzles.json' with { type: 'json' };
import { verifyDeployment } from '../../scripts/verify-deployment.mjs';

test('an old cached PWA with no update UI refreshes automatically and preserves its game twice', async ({ browser }) => {
  const base = process.env.E2E_BASE_PATH ?? '/';
  let stage = 0;
  const oldHtml = `<!doctype html><html><body><h1>Alte Version</h1><script>
    navigator.serviceWorker.register(${JSON.stringify(`${base}sw.js`)}).then(reg=>reg.update());
    </script></body></html>`;
  const oldWorker = `self.addEventListener('install',e=>e.waitUntil(caches.open('previous-pwa').then(c=>c.add(${JSON.stringify(base)}))));
    self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
    self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request))));
    self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();});`;
  const server = createServer((req, res) => {
    const pathname = new URL(req.url!, 'http://localhost').pathname;
    const relative = pathname.slice(base.length) || 'index.html';
    res.setHeader('Cache-Control', 'no-store');
    if (pathname !== base && !pathname.startsWith(base)) { res.writeHead(404).end(); return; }
    if (stage === 0 && relative === 'index.html') { res.setHeader('Content-Type', 'text/html'); res.end(oldHtml); return; }
    if (stage === 0 && relative === 'sw.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(oldWorker); return; }
    try {
      const types = { js: 'text/javascript', html: 'text/html', wasm: 'application/wasm', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json' };
      res.setHeader('Content-Type', types[relative.split('.').pop()!] ?? 'application/octet-stream');
      const file = readFileSync(resolve('dist', relative));
      res.end(stage === 2 && relative === 'sw.js' ? Buffer.concat([file, Buffer.from('\n// next release\n')]) : file);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}${base}`;
  const revision = JSON.parse(readFileSync('dist/version.json', 'utf8')).revision;
  const context = await browser.newContext();
  const puzzle = legacy[0], board = [...puzzle.givens], cell = board.findIndex(n => n === null);
  board[cell] = puzzle.bank[0];
  const previous = { version: 1, activeMode: 'free', session: { puzzle, board, notes: {}, undo: [], redo: [], elapsed: 37, hints: 0, mode: 'free', day: null, completed: false }, daily: null,
    settings: { theme: 'light', reduceMotion: false, opaque: false, showTimer: true, checkErrors: false }, stats: { solved: [], best: {}, dailyDates: [] } };
  try {
    // A successful metadata response alone does not prove the published UI is current.
    await expect(verifyDeployment(url, revision)).rejects.toThrow('Published bytes differ: index.html');
    await context.addInitScript(value => { if (!localStorage.getItem('cross-math-backup-v1')) localStorage.setItem('cross-math-backup-v1', JSON.stringify({ writtenAt: Date.now(), value })); }, previous);
    const page = await context.newPage();
    await page.goto(url); await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
    await page.reload(); await expect(page.getByRole('heading', { name: 'Alte Version' })).toBeVisible();
    stage = 1;
    await verifyDeployment(url, revision);
    await page.reload(); // The new worker must recover even this early client.
    // Includes worker installation, the save grace period and a full reload.
    await expect(page.locator('.legacy-upgrade')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`[data-cell="${cell}"] .number-value`)).toHaveText(String(board[cell]));
    await expect(page.getByRole('heading', { name: 'Alte Version' })).toHaveCount(0);
    stage = 2;
    const navigation = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await navigation;
    await expect(page.locator('.legacy-upgrade')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`[data-cell="${cell}"] .number-value`)).toHaveText(String(board[cell]));
    await page.locator('.legacy-upgrade').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Neues Rätsel' }).click();
    await expect(page.locator('.game-card')).toHaveAttribute('data-puzzle-source', 'crossmath');
    await expect(page.locator('.crossword-grid')).toBeVisible();
  } finally { await context.close(); await new Promise<void>(r => server.close(() => r())); }
});

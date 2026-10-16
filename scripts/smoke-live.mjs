import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const browser = await chromium.launch(existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {});
const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
try {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Use the canonical URL, exactly as someone opening the website does.
  await page.goto(process.env.DEPLOYED_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.game-card')).toHaveAttribute('data-puzzle-source', 'crossmath', { timeout: 30_000 });
  await expect(page.locator('.crossword-grid')).toBeVisible();
  expect(Number(await page.locator('.crossword-grid').getAttribute('data-equations'))).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.app-footer')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-ui', 'material');
  await expect(page.getByRole('button', { name: 'Notizen', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'App installieren', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Geführt an', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await expect(page.locator('.source-attribution')).toContainText('242 geprüfte Originalaufgaben');
  await expect(page.locator('.app-version')).toContainText(process.env.EXPECTED_REVISION.slice(0, 7));
  await page.getByRole('button', { name: 'Alle Aufgaben herunterladen', exact: true }).click();
  await expect(page.locator('.download-section')).toContainText('242 / 242', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.getByRole('button', { name: 'Meldung schließen' }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await context.setOffline(true); await page.reload();
  await expect(page.locator('.crossword-grid')).toBeVisible();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await expect(page.locator('.download-section')).toContainText('242 / 242');
  await expect(page.locator('.app-info')).toContainText('Offline');
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.getByRole('button', { name: 'Hinweis', exact: true }).click();
  await expect(page.locator('.hint-explanation')).toContainText('=');
  await page.getByRole('button', { name: 'Zahl einsetzen', exact: true }).click();
  expect(await page.evaluate(() => ({ x: document.documentElement.scrollWidth > innerWidth, y: document.documentElement.scrollHeight > innerHeight }))).toEqual({ x: false, y: false });
  expect(errors).toEqual([]);
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/live-cross-math.png' });
  console.log(`Live browser verified: ${process.env.EXPECTED_REVISION}; guided board, 242 originals, offline restart and no page overflow.`);
} finally { await browser.close(); }

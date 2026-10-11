import { test, expect } from '@playwright/test';

test('play, notes, undo/redo, pause and persisted restore', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('.puzzle-grid')).toBeVisible();
  const cell = page.locator('[data-cell][aria-pressed="true"]');
  const cellId = await cell.getAttribute('data-cell');
  const tile = page.locator('[data-number]:not(:disabled)').first();
  const n = await tile.getAttribute('data-number');
  await tile.click();
  await expect(cell.locator('.number-value')).toHaveText(n!);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(cell.locator('.number-value')).toHaveCount(0);
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect(cell.locator('.number-value')).toHaveText(n!);
  await page.getByRole('button', { name: 'Zahl entfernen' }).click();
  await page.getByRole('button', { name: 'Notizen' }).click();
  await page.locator(`[data-number="${n}"]`).click();
  await expect(cell.locator('.cell-notes')).toHaveText(n!);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('.puzzle-grid')).toHaveCount(0);
  await page.getByRole('button', { name: 'Spiel fortsetzen' }).click();
  await page.reload();
  await expect(page.locator(`[data-cell="${cellId}"] .cell-notes`)).toHaveText(n!);
  expect(errors).toEqual([]);
});

test('hints complete the puzzle and statistics survive reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.puzzle-grid')).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Hinweis', exact: true }).click();
    await page.getByRole('button', { name: 'Zahl einsetzen' }).click();
  }
  await expect(page.getByText('Rätsel gelöst.', { exact: true })).toBeVisible();
  await expect(page.locator('.result.correct')).toHaveCount(6);
  await page.getByRole('button', { name: 'Statistik', exact: true }).click();
  await expect(page.locator('.stats-total strong')).toHaveText('1');
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Rätsel gelöst.', { exact: true })).toBeVisible();
});

test('daily game preserves free game and all difficulties generate', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.puzzle-grid')).toBeVisible();
  const free = await page.locator('.puzzle-grid').textContent();
  await page.getByRole('button', { name: 'Tagesrätsel', exact: true }).first().click();
  await expect(page.locator('.game-title')).toContainText('Tagesrätsel');
  await expect(page.locator('.number-counter')).toContainText('6');
  await page.getByRole('button', { name: 'Freies Spiel', exact: true }).click();
  await expect(page.locator('.puzzle-grid')).toHaveText(free!);
  await page.getByRole('button', { name: 'Schwer', exact: true }).click();
  await expect(page.locator('.level-tag')).toHaveText('Schwer');
  await expect(page.locator('.number-counter')).toContainText('8');
  await page.getByRole('button', { name: 'Mittel', exact: true }).click();
  await expect(page.locator('.level-tag')).toHaveText('Mittel');
});

test('PWA restarts offline and generates new puzzles offline', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.locator('.puzzle-grid')).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.puzzle-grid')).toBeVisible();
  await expect(page.getByText('Du spielst offline.')).toBeVisible();
  await page.getByRole('button', { name: 'Schwer', exact: true }).click();
  await expect(page.locator('.level-tag')).toHaveText('Schwer');
  await page.getByRole('button', { name: 'Hinweis', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Zahl einsetzen' })).toBeVisible();
});

test('responsive glass view, dark mode and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('./');
  await expect(page.locator('.puzzle-grid')).toBeVisible();
  await page.screenshot({ path: 'artifacts/cross-math-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('button', { name: 'Dunkel', exact: true }).click();
  await page.getByLabel('Weniger Bewegung').check();
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.screenshot({ path: 'artifacts/cross-math-dark.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  const toolbar = await page.locator('.game-toolbar').boundingBox();
  const palette = await page.locator('.numbers-card').boundingBox();
  expect(toolbar!.y + toolbar!.height).toBeLessThan(palette!.y);
  await page.screenshot({ path: 'artifacts/cross-math-mobile.png' });
  await page.getByRole('button', { name: 'Notizen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Notizen', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Hinweis', exact: true }).click();
  await page.getByRole('button', { name: 'Zahl einsetzen' }).click();
  await expect(page.locator('.number-cell.editable .number-value')).toHaveCount(1);
});

test('export, import and invalid backup handling', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.puzzle-grid')).toBeVisible();
  const cell = page.locator('[data-cell][aria-pressed="true"]');
  const cellId = await cell.getAttribute('data-cell');
  const n = await page.locator('[data-number]:not(:disabled)').first().getAttribute('data-number');
  await page.locator(`[data-number="${n}"]`).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Sichern', exact: true }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const backup = Buffer.concat(chunks);
  expect(JSON.parse(backup.toString()).session.board[Number(cellId)]).toBe(Number(n));
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
  await expect(page.getByRole('alert')).toContainText('kein gültiger');
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.getByRole('button', { name: 'Zahl entfernen' }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'save.json', mimeType: 'application/json', buffer: backup });
  await expect(page.locator(`[data-cell="${cellId}"] .number-value`)).toHaveText(n!);
});

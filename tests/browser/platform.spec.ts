import { expect, test, type Page } from '@playwright/test';
import originals from '../../src/data/crossmath-originals.json' with { type: 'json' };

const large = originals.records.find(r => r.puzzle.id === 'hf-crossmath-0004')!;
async function seed(page: Page, style: string, puzzle = large.puzzle) {
  await page.addInitScript(({ style, puzzle }) => {
    if (localStorage.getItem('cross-math-backup-v1')) return;
    localStorage.setItem('cross-math-appearance-v1', JSON.stringify({ version: 1, settings: { uiStyle: style, theme: 'light' } }));
    localStorage.setItem('cross-math-backup-v1', JSON.stringify({ writtenAt: Date.now(), value: { version: 1, activeMode: 'free', session: { puzzle, board: puzzle.givens, notes: {}, undo: [], redo: [], elapsed: 0, hints: 0, mode: 'free', day: null, completed: false }, daily: null, settings: { theme: 'light', guided: true, puzzleSource: 'crossmath', reduceMotion: false, opaque: false, showTimer: true, checkErrors: false }, stats: { solved: [], dailyDates: [], best: {} } } }));
  }, { style, puzzle });
}

for (const style of ['liquid', 'material', 'fluent']) {
  test(`${style}: complete controls fit, deletion is red and display settings persist`, async ({ page }) => {
    await seed(page, style); await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-ui', style);
    await expect(page.locator('.crossword-grid')).toBeVisible();
    for (const theme of ['Hell', 'Dunkel']) {
      await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
      await page.getByRole('button', { name: theme, exact: true }).click();
      await page.getByRole('button', { name: 'Schließen', exact: true }).click();
      for (const [width, height] of [[320, 568], [390, 844], [667, 375], [1024, 768], [360, 480]]) {
        await page.setViewportSize({ width, height });
        await expect.poll(async () => page.locator('[data-cell], [data-number], .app-header button, .view-tools button, .game-toolbar button').evaluateAll(nodes => nodes.flatMap(el => {
          const r = el.getBoundingClientRect();
          const fits = r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
          const hit = el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
          return fits && hit ? [] : [{ label: el.getAttribute('aria-label') || el.textContent, x: r.x, y: r.y, right: r.right, bottom: r.bottom }];
        }))).toEqual([]);
        expect(await page.evaluate(() => ({ x: document.documentElement.scrollWidth > innerWidth, y: document.documentElement.scrollHeight > innerHeight }))).toEqual({ x: false, y: false });
        if (width === 390) await page.screenshot({ path: `artifacts/${style}-${theme === 'Hell' ? 'light' : 'dark'}-mobile.png` });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const del = page.getByRole('button', { name: 'Zahl entfernen', exact: true });
    await expect(del).toBeDisabled();
    const cell = page.locator('[data-cell][aria-pressed="true"]').first(), id = await cell.getAttribute('data-cell');
    await page.locator('[data-number]:not(:disabled)').first().click();
    await expect(del).toHaveClass(/delete-active/);
    const color = await del.evaluate(el => getComputedStyle(el).color.match(/\d+/g)!.map(Number));
    expect(color[0]).toBeGreaterThan(color[1]); expect(color[0]).toBeGreaterThan(color[2]);
    await del.click(); await expect(del).toBeDisabled();
    await expect(page.locator(`[data-cell="${id}"] .number-value`)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Notizen' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Geführt an', exact: true }).click();
    await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
    await page.getByRole('combobox', { name: 'UI-Stil' }).selectOption(style === 'fluent' ? 'liquid' : 'fluent');
    await page.getByRole('switch', { name: 'Bildschirm ausfüllen', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ui', style === 'fluent' ? 'liquid' : 'fluent');
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'compact');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Geführt aus', exact: true })).toBeVisible();
    await expect(page.locator('.game-card')).toHaveAttribute('data-puzzle-id', large.puzzle.id);
    await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
    await page.getByRole('button', { name: 'Darstellung zurücksetzen', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'UI-Stil' })).toHaveValue('auto');
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Geführt aus', exact: true })).toBeVisible();
    await expect(page.locator('.game-card')).toHaveAttribute('data-puzzle-id', large.puzzle.id);
  });
}

test('appearance is ready before React, including native OS priority and manual overrides', async ({ browser }) => {
  for (const [nativePlatform, expected] of [['windows', 'fluent'], ['linux', 'material'], ['macos', 'liquid']]) {
    const context = await browser.newContext();
    try {
      await context.addInitScript(platform => {
        Object.assign(window, { __TAURI_INTERNALS__: {}, __TAURI_OS_PLUGIN_INTERNALS__: { platform } });
        Object.defineProperty(navigator, 'userAgent', { value: 'Windows Chrome/140 Edg/140' });
      }, nativePlatform);
      const page = await context.newPage();
      await page.route(/\/assets\/index-[^/]+\.js$/, route => route.abort());
      await page.goto('./');
      await expect(page.locator('html')).toHaveAttribute('data-ui', expected);
      expect(await page.evaluate(() => globalThis.CrossMathAppearance.initial.detected.browser)).toBe('Tauri');
      await page.evaluate(() => localStorage.setItem('cross-math-appearance-v1', JSON.stringify({ version: 1, settings: { uiStyle: 'liquid', theme: 'dark', glassLevel: 72 } })));
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-ui', 'liquid');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await page.locator('html').evaluate(el => el.style.getPropertyValue('--glass-level'))).toBe('0.72');
      await expect(page.locator('.game-card')).toHaveCount(0);
    } finally { await context.close(); }
  }
});

test('blocked storage still permits UI switching and follows the system theme', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    Storage.prototype.setItem = () => { throw new Error('blocked'); };
  });
  await page.emulateMedia({ colorScheme: 'dark' }); await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.puzzle-grid')).toBeVisible();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('combobox', { name: 'UI-Stil' }).selectOption('fluent');
  await expect(page.locator('html')).toHaveAttribute('data-ui', 'fluent');
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the install button opens instructions and handles a one-use browser prompt', async ({ page }) => {
  await page.goto('./'); await expect(page.locator('.puzzle-grid')).toBeVisible();
  const button = page.getByRole('button', { name: 'App installieren', exact: true });
  await expect(button).toBeVisible(); await button.click();
  await expect(page.locator('.install-instructions')).toBeVisible();
  await page.getByRole('button', { name: 'Verstanden', exact: true }).click();
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt: async () => { document.body.dataset.promptCalls = String(Number(document.body.dataset.promptCalls ?? 0) + 1); }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    dispatchEvent(event);
  });
  await button.click();
  await expect(button).toHaveCount(0); await expect(page.locator('body')).toHaveAttribute('data-prompt-calls', '1');
});

test('installed iPhone PWAs hide installation and prompt failures keep instructions available', async ({ page, browser }) => {
  const installed = await browser.newContext();
  try {
    await installed.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    const app = await installed.newPage(); await app.goto('./');
    await expect(app.locator('.puzzle-grid')).toBeVisible();
    await expect(app.getByRole('button', { name: 'App installieren', exact: true })).toHaveCount(0);
  } finally { await installed.close(); }
  await page.goto('./'); await expect(page.locator('.puzzle-grid')).toBeVisible();
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt: async () => { throw new Error('denied'); }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    dispatchEvent(event);
  });
  await page.getByRole('button', { name: 'App installieren', exact: true }).click();
  await expect(page.locator('.install-instructions')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Browsermenü');
});

test('1024px icons are real raster assets and the entire board is available on desktop', async ({ page, request }) => {
  await seed(page, 'liquid'); await page.goto('./');
  const source = await request.get('pwa-1024.png'), bytes = await source.body();
  expect(source.ok()).toBe(true); expect(bytes.readUInt32BE(16)).toBe(1024); expect(bytes.readUInt32BE(20)).toBe(1024);
  const maskable = await request.get('pwa-maskable-1024.png');
  expect((await maskable.body()).readUInt32BE(16)).toBe(1024);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.area-counter')).toHaveText('Ganzes Brett');
  await expect(page.locator('[data-cell]')).toHaveCount(large.puzzle.givens.length);
  await page.getByRole('button', { name: 'Bereiche', exact: true }).click();
  await expect(page.locator('.area-counter')).toContainText('Bereich');
  await page.getByRole('button', { name: 'Ganzes Brett', exact: true }).click();
  await expect(page.locator('[data-cell]')).toHaveCount(large.puzzle.givens.length);
});


test('the reported nine-blank puzzle stays whole on a phone and only splits when space requires it', async ({ page }) => {
  const record = originals.records.find(r => r.puzzle.id === 'hf-crossmath-0068')!;
  await seed(page, 'liquid', record.puzzle);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('.area-counter')).toHaveText('Ganzes Brett');
  await expect(page.locator('.crossword-grid')).toHaveAttribute('data-equations', '12');
  await expect(page.locator('[data-cell]')).toHaveCount(25);
  await expect(page.locator('[data-number]')).toHaveCount(9);
  await expect(page.getByRole('button', { name: 'Nächster Bereich', exact: true })).toHaveCount(0);
  const assertReachable = async () => {
    await expect.poll(() => page.locator('[data-cell], [data-number], .view-tools button').evaluateAll(nodes => nodes.every(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  await assertReachable();
  await page.screenshot({ path: 'artifacts/reported-whole-phone.png' });
  await page.locator('[data-cell="1"]').click();
  await page.locator('[data-number="10"]').click();
  await expect(page.locator('[data-cell="1"] .number-value')).toHaveText('10');
  // The explicit focus mode remains available, with all its controls reachable.
  await page.getByRole('button', { name: 'Bereiche', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nächster Bereich', exact: true })).toBeVisible();
  await assertReachable();
  await page.getByRole('button', { name: 'Ganzes Brett', exact: true }).click();
  for (const size of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(size);
    await expect(page.locator('.area-counter')).toContainText('Bereich');
    expect(Number(await page.locator('.crossword-grid').getAttribute('data-equations'))).toBeGreaterThanOrEqual(2);
    await assertReachable();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.area-counter')).toHaveText('Ganzes Brett');
  await expect(page.locator('[data-cell]')).toHaveCount(25);
  await expect(page.locator('[data-cell="1"] .number-value')).toHaveText('10');
  await page.reload();
  await expect(page.locator('.area-counter')).toHaveText('Ganzes Brett');
  await expect(page.locator('[data-cell="1"] .number-value')).toHaveText('10');
});


test('short desktop grids keep every row inside the measured board space', async ({ page }) => {
  const record = originals.records.find(r => r.puzzle.id === 'hf-crossmath-0077')!;
  await seed(page, 'material', record.puzzle);
  await page.setViewportSize({ width: 900, height: 600 }); await page.goto('./');
  await expect(page.locator('.crossword-grid')).toBeVisible();
  await expect.poll(() => page.locator('.board-content').evaluate(el => {
    const area = el.getBoundingClientRect();
    return [...el.querySelectorAll('.crossword-grid, [data-cell], .cross-symbol')].every(child => {
      const r = child.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.x >= area.x - 1 && r.y >= area.y - 1 && r.right <= area.right + 1 && r.bottom <= area.bottom + 1 && child.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
  })).toBe(true);
});

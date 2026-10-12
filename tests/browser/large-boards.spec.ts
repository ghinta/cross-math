import { test, expect, type Page } from '@playwright/test';
import originals from '../../src/data/crossmath-originals.json' with { type: 'json' };

const wide = originals.records.find(r => r.puzzle.layout.cols === 21)!;
const tall = originals.records.find(r => r.puzzle.id === 'hf-crossmath-0004')!;
async function seed(page: Page, record: typeof wide) {
  await page.addInitScript(puzzle => {
    if (localStorage.getItem('cross-math-backup-v1')) return;
    const value = { version: 1, activeMode: 'free', session: { puzzle, board: puzzle.givens, notes: {}, undo: [], redo: [], elapsed: 0, hints: 0, mode: 'free', day: null, completed: false }, daily: null,
      settings: { guided: true, puzzleSource: 'crossmath', theme: 'light', reduceMotion: false, opaque: false, showTimer: true, checkErrors: false }, stats: { solved: [], best: {}, dailyDates: [] } };
    localStorage.setItem('cross-math-backup-v1', JSON.stringify({ writtenAt: Date.now(), value }));
  }, record.puzzle);
}

test('wide original supports overview navigation, three-digit keyboard entry and restore', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); await seed(page, wide); await page.goto('./');
  await expect(page.locator('.game-card')).toHaveAttribute('data-puzzle-id', wide.puzzle.id);
  await expect(page.locator('.side-heading')).toContainText('ZAHLEN FÜR DIESEN BEREICH');
  const cell = wide.puzzle.givens.findIndex((n, i) => n === null && wide.solution[i] > 99);
  await page.getByRole('button', { name: 'Brettübersicht öffnen' }).click();
  const pos = wide.puzzle.layout.cells[cell];
  const point = await page.locator('.overview-board').evaluate((el: SVGSVGElement, pos) => {
    const point = el.createSVGPoint(); point.x = pos.col; point.y = pos.row;
    const screen = point.matrixTransform(el.getScreenCTM()!); return { x: screen.x, y: screen.y };
  }, pos);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator(`[data-cell="${cell}"]`)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type(String(wide.solution[cell]));
  await expect(page.locator(`[data-cell="${cell}"] .number-value`)).toHaveText(String(wide.solution[cell]));
  await page.getByRole('button', { name: 'Geführt an', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Geführt aus', exact: true })).toBeVisible();
  await page.reload();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('cross-math-backup-v1')!).value);
  expect(state.session.board[cell]).toBe(wide.solution[cell]); expect(state.settings.guided).toBe(false);
  await expect(page.locator('.game-card')).toHaveAttribute('data-puzzle-id', wide.puzzle.id);
});

test('guided areas can complete a large original using only local tiles, without hints', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await seed(page, tall); await page.goto('./');
  await expect(page.locator('.side-heading')).toContainText('ZAHLEN FÜR DIESEN BEREICH');
  for (let turn = 0; turn < 50; turn++) {
    if (await page.getByText('Rätsel gelöst.', { exact: true }).count()) break;
    const empty = page.locator('.number-cell.editable').filter({ has: page.locator('.empty-cell') });
    if (!await empty.count()) { await page.getByRole('button', { name: 'Nächster Bereich' }).click(); continue; }
    const button = empty.first(), cell = Number(await button.getAttribute('data-cell'));
    await button.click();
    const board = await page.evaluate(() => JSON.parse(localStorage.getItem('cross-math-backup-v1')!).value.session.board);
    const visible = (await page.locator('[data-cell]').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('data-cell')))));
    const expected = [...new Set(visible.filter(i => tall.puzzle.givens[i] === null && board[i] !== tall.solution[i]).map(i => tall.solution[i]))].sort((a, b) => a - b);
    await expect.poll(async () => (await page.locator('[data-number]').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('data-number'))))).sort((a, b) => a - b)).toEqual(expected);
    await page.locator(`[data-number="${tall.solution[cell]}"]`).click();
    await expect(page.locator(`[data-cell="${cell}"] .number-value`)).toHaveText(String(tall.solution[cell]));
  }
  await expect(page.getByText('Rätsel gelöst.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cross-math-backup-v1')!).value.session.hints)).toBe(0);
  expect(await page.evaluate(() => ({ x: document.documentElement.scrollWidth > innerWidth, y: document.documentElement.scrollHeight > innerHeight }))).toEqual({ x: false, y: false });
});

test('all 242 originals download without WebCrypto and remain selectable after offline restart', async ({ page, context }) => {
  await page.addInitScript(() => Object.defineProperty(crypto, 'subtle', { value: undefined }));
  await page.goto('./'); await expect(page.locator('.puzzle-grid')).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('button', { name: 'Alle Aufgaben herunterladen', exact: true }).click();
  await expect(page.locator('.download-section')).toContainText('242 / 242');
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.getByRole('button', { name: 'Meldung schließen' }).click();
  await context.setOffline(true); await page.reload();
  await expect(page.locator('.puzzle-grid')).toBeVisible();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await expect(page.locator('.download-section')).toContainText('242 / 242');
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.evaluate(() => { let seed = 20; crypto.getRandomValues = ((array: Uint32Array) => { array[0] = seed++; return array; }) as typeof crypto.getRandomValues; });
  const selected = new Set<string>();
  const hard = originals.records.filter(r => r.puzzle.difficulty === 'hard');
  for (let i = 0; i < 7; i++) {
    await page.getByRole('button', { name: 'Schwer', exact: true }).click();
    // Selection verifies asynchronously; wait for this specific new task.
    await expect(page.locator('.game-card')).toHaveAttribute('data-puzzle-id', hard[20 + i].puzzle.id);
    await expect(page.locator('.game-card')).toHaveAttribute('data-puzzle-source', 'crossmath');
    await expect(page.locator('.level-tag')).toHaveText('Schwer');
    const id = (await page.locator('.game-card').getAttribute('data-puzzle-id'))!;
    selected.add(id); expect(originals.records.some(r => r.puzzle.id === id)).toBe(true);
  }
  expect(selected.size).toBe(7);
});

for (const size of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 667, height: 375 }]) {
  test(`large boards, overview and complete number inventory fit at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size); await seed(page, tall); await page.goto('./');
    await expect(page.locator('.side-heading')).toContainText('ZAHLEN FÜR DIESEN BEREICH');
    await page.getByRole('button', { name: 'Alle Zahlen', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Weitere Zahlen' })).toBeVisible();
    await page.getByRole('button', { name: 'Weitere Zahlen' }).click();
    await expect(page.locator(`[data-number="${Math.max(...tall.puzzle.bank)}"]`)).toBeVisible();
    for (const step of ['detail', 'overview', 'next']) {
      if (step === 'overview') await page.getByRole('button', { name: 'Brettübersicht öffnen' }).click();
      if (step === 'next') await page.getByRole('button', { name: 'Nächster Bereich' }).click();
      expect(await page.evaluate(() => ({ x: document.documentElement.scrollWidth > innerWidth, y: document.documentElement.scrollHeight > innerHeight }))).toEqual({ x: false, y: false });
      for (const selector of ['.puzzle-grid', '[data-cell]', '[data-number]', '.view-tools button', '.bank-pages button', '.game-toolbar button']) {
        for (const item of await page.locator(selector).all()) {
          const box = (await item.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1); expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
          expect(await item.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
        }
      }
    }
    if (size.width === 375) await page.screenshot({ path: 'artifacts/cross-math-large-guided.png' });
  });
}

test('two-finger gestures switch between overview and readable detail', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await seed(page, wide); await page.goto('./');
    await expect(page.locator('.side-heading')).toContainText('ZAHLEN FÜR DIESEN BEREICH');
    const client = await context.newCDPSession(page);
    const area = (await page.locator('.board-content').boundingBox())!;
    const x = area.x + area.width / 2, y = area.y + area.height / 2;
    const points = (distance: number) => [{ x: x - distance / 2, y, id: 1 }, { x: x + distance / 2, y, id: 2 }];
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(200) });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(110) });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.crossword-view')).toHaveAttribute('data-view', 'overview');
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(70) });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(150) });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.crossword-view')).toHaveAttribute('data-view', 'detail');
  } finally { await context.close(); }
});

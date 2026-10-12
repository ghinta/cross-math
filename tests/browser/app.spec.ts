import legacy from '../data/legacy-puzzles.json' with { type: 'json' };
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
  const freeFields = await page.evaluate(() => JSON.parse(localStorage.getItem('cross-math-backup-v1')!).value.session.puzzle.bank.length);
  for (let i = 0; i < freeFields; i++) {
    await page.getByRole('button', { name: 'Hinweis', exact: true }).click();
    await page.getByRole('button', { name: 'Zahl einsetzen' }).click();
  }
  await expect(page.getByText('Rätsel gelöst.', { exact: true })).toBeVisible();
  const total = await page.locator('.equation-progress span').count();
  await expect(page.locator('.equation-progress .done')).toHaveCount(total);
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
  await expect(page.locator('.number-counter')).toContainText(String(await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cross-math-backup-v1')!).value; return s[s.activeMode === 'daily' ? 'daily' : 'session'].puzzle.bank.length; })));
  await page.getByRole('button', { name: 'Freies Spiel', exact: true }).click();
  await expect(page.locator('.puzzle-grid')).toHaveText(free!);
  await page.getByRole('button', { name: 'Schwer', exact: true }).click();
  await expect(page.locator('.level-tag')).toHaveText('Schwer');
  await expect(page.locator('.number-counter')).toContainText(String(await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cross-math-backup-v1')!).value; return s[s.activeMode === 'daily' ? 'daily' : 'session'].puzzle.bank.length; })));
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
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('button', { name: 'Generator', exact: true }).click();
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.puzzle-grid')).toBeVisible();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await expect(page.locator('.app-info')).toContainText('Offline');
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
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
  expect(palette!.y + palette!.height).toBeLessThanOrEqual(toolbar!.y);
  expect(toolbar!.y + toolbar!.height).toBeLessThanOrEqual(812);
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

for (const size of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 667, height: 375 }, { width: 900, height: 600 }]) {
  test(`all game elements fit without scrolling at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size); await page.goto('./');
    await expect(page.locator('.puzzle-grid')).toBeVisible();
    const assertFits = async () => {
      const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth > innerWidth, y: document.documentElement.scrollHeight > innerHeight }));
      expect(overflow).toEqual({ x: false, y: false });
      const area = (await page.locator('.board-area').boundingBox())!;
      const grid = (await page.locator('.puzzle-grid').boundingBox())!;
      expect(grid.x).toBeGreaterThanOrEqual(area.x - 1); expect(grid.y).toBeGreaterThanOrEqual(area.y - 1);
      expect(grid.x + grid.width).toBeLessThanOrEqual(area.x + area.width + 1);
      expect(grid.y + grid.height).toBeLessThanOrEqual(area.y + area.height + 1);
      for (const selector of ['.puzzle-grid', '[data-cell]', '[data-number]', '.game-toolbar button', '.difficulty-switch button', '.mode-switch button']) {
        for (const element of await page.locator(selector).all()) {
          const box = (await element.boundingBox())!;
          expect(box.width).toBeGreaterThan(0); expect(box.height).toBeGreaterThan(0);
          expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
          expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
          const exposed=await element.evaluate(el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); });
          expect(exposed).toBe(true);
        }
      }
    };
    await assertFits(); // The bundled first puzzle deliberately has a tall layout.
    for (const difficulty of ['Mittel','Schwer']) {
      await page.getByRole('button', { name: difficulty, exact: true }).click();
      await expect(page.locator('.level-tag')).toHaveText(difficulty);
      await assertFits();
    }
    if (size.width === 375) await page.screenshot({ path: 'artifacts/cross-math-mobile-hard.png' });
    if (size.width === 667) await page.screenshot({ path: 'artifacts/cross-math-landscape.png' });
    // All tiles can be reached by touch without a scroll container or clipping.
    const palette = (await page.locator('.number-bank').boundingBox())!;
    for (const tile of await page.locator('[data-number]').all()) {
      const box=(await tile.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(palette.y + palette.height + 1);
      const exposed=await tile.evaluate(el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); });
      expect(exposed).toBe(true);
    }
    await page.getByRole('button', { name: 'Hinweis', exact: true }).click();
    await expect(page.locator('.hint-explanation')).toContainText('=');
    await page.getByRole('button', { name: 'Zahl einsetzen' }).click();
    await expect(page.locator('.number-cell.editable .number-value')).toHaveCount(1);
    await page.getByRole('button', { name: 'Tagesrätsel', exact: true }).click();
    await expect(page.locator('.game-title')).toContainText('Tagesrätsel');
    await assertFits();
    const title = (await page.locator('.game-title').boundingBox())!;
    const clock = (await page.locator('.game-clock').boundingBox())!;
    expect(title.x + title.width).toBeLessThanOrEqual(clock.x);

  });
}

test('existing v1 game, history and statistics survive the upgrade', async ({ page }) => {
  const puzzle=legacy[0]; const board=[...puzzle.givens]; const cell=board.findIndex(n=>n===null); board[cell]=puzzle.bank[0];
  const previous={ version: 1, activeMode:'free', session: {puzzle,board,notes:{},undo:[{board:puzzle.givens,notes:{}}],redo:[],elapsed:42,hints:0,mode:'free',day:null,completed:false},daily:null,
    settings:{theme:'light',reduceMotion:false,opaque:false,showTimer:true,checkErrors:false},stats:{solved:[legacy[1].id],best:{easy:123},dailyDates:[]} };
  await page.addInitScript(value => { if (!localStorage.getItem('cross-math-backup-v1')) localStorage.setItem('cross-math-backup-v1',JSON.stringify({writtenAt:Date.now(),value})); },previous);
  await page.goto('./');await expect(page.locator('[data-cell]')).toHaveCount(9);
  await expect(page.locator(`[data-cell="${cell}"] .number-value`)).toHaveText(String(board[cell]));
  await page.getByRole('button',{name:'Neues Rätsel',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Neues Rätsel'}).click();
  await expect(page.locator('.crossword-grid')).toBeVisible();
  await page.getByRole('button',{name:'Statistik',exact:true}).click();
  await expect(page.locator('.stats-total strong')).toHaveText('1');
});
test('import rejects a structurally valid task with multiple solutions', async ({ page }) => {
  await page.goto('./');await expect(page.locator('.puzzle-grid')).toBeVisible();
  await page.getByRole('button',{name:'Einstellungen',exact:true}).click();
  const puzzle={id:'ambiguous',version:2,seed:0,difficulty:'easy',givens:[null,null,5,1,6],bank:[2,3],equations:[{cells:[0,1,2],operator:'+'},{cells:[2,3,4],operator:'+'}],layout:{rows:5,cols:5,cells:[{row:0,col:0},{row:0,col:2},{row:0,col:4},{row:2,col:4},{row:4,col:4}]},rating:{deductions:0,rounds:0,branches:0}};
  const value=await page.evaluate(() => JSON.parse(localStorage.getItem('cross-math-backup-v1')!).value);
  value.session={puzzle,board:puzzle.givens,notes:{},undo:[],redo:[],elapsed:0,hints:0,mode:'free',day:null,completed:false};
  await page.locator('input[type=file]').setInputFiles({ name:'ambiguous.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value)) });
  await expect(page.getByRole('alert')).toContainText('keine geprüfte eindeutige Lösung');
});

test('original tasks have attribution and the generator remains selectable', async ({ page }) => {
  await page.goto('./'); await expect(page.locator('.game-card')).toHaveAttribute('data-puzzle-source','crossmath');
  await page.getByRole('button',{name:'Einstellungen',exact:true}).click();
  await expect(page.getByRole('button',{name:'Originalaufgaben',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.source-attribution')).toContainText('CC BY-NC-ND 4.0');
  await page.getByRole('button',{name:'Generator',exact:true}).click();
  await page.getByRole('button',{name:'Schließen',exact:true}).click();
  await page.getByRole('button',{name:'Schwer',exact:true}).click();
  await expect(page.locator('.game-card')).toHaveAttribute('data-puzzle-source','generator');
});

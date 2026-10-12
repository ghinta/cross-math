import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { initSync, generate, check, hint, verify } from '../src/wasm/cross_math_core.js';

initSync({ module: readFileSync(new URL('../src/wasm/cross_math_core_bg.wasm', import.meta.url)) });
const catalog = JSON.parse(readFileSync(new URL('../src/data/puzzles.json', import.meta.url), 'utf8'));
const originals = JSON.parse(readFileSync(new URL('../src/data/crossmath-originals.json', import.meta.url), 'utf8')).records;
const index = JSON.parse(readFileSync(new URL('../src/data/crossmath-index.json', import.meta.url), 'utf8'));
const packed = [];
for (const pack of index.packs) {
  const bytes = readFileSync(new URL(`../public/puzzles/${pack.file}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pack.sha256);
  for (const [id, difficulty, rows, cols, cells, givens, bank, equations, rating] of JSON.parse(bytes)) {
    const original = originals.find(r => r.puzzle.source.record === id);
    assert(original, `Unknown packed task: ${id}`);
    assert.deepEqual({ difficulty, rows, cols, cells, givens, bank, equations, rating }, {
      difficulty: original.puzzle.difficulty, rows: original.puzzle.layout.rows, cols: original.puzzle.layout.cols,
      cells: original.puzzle.layout.cells.map(p => [p.row, p.col]), givens: original.puzzle.givens, bank: original.puzzle.bank,
      equations: original.puzzle.equations.map(eq => [eq.cells, eq.operator]), rating: original.puzzle.rating,
    });
    packed.push(id);
  }
}
assert.equal(new Set(packed).size, index.count);
assert.equal(packed.length, originals.length);
let longest = 0;
const legacy = JSON.parse(readFileSync(new URL('../tests/data/legacy-puzzles.json', import.meta.url), 'utf8'));
for (const expected of [...catalog, ...legacy, ...originals.map(r => r.puzzle)]) {
  const start = performance.now();
  const actual = expected.version === 2 && !expected.source ? JSON.parse(generate(expected.seed, expected.difficulty)) : expected;
  longest = Math.max(longest, performance.now() - start);
  assert.deepEqual(actual, expected, `Native/WASM mismatch: ${expected.id}`);
  assert.equal(JSON.parse(verify(JSON.stringify(actual))), true);
  const board = [...actual.givens];
  while (board.includes(null)) {
    const next = JSON.parse(hint(JSON.stringify(actual), JSON.stringify(board)));
    board[next.cell] = next.value;
  }
  assert.equal(JSON.parse(check(JSON.stringify(actual), JSON.stringify(board))).valid, true);
  if (actual.source) assert.deepEqual(board, originals.find(r => r.puzzle.id === actual.id).solution);
}
console.log(`${catalog.length} native/WASM parity checks, ${catalog.length + legacy.length + originals.length} verified tasks and complete hint paths passed. Slowest generation: ${longest.toFixed(1)} ms.`);

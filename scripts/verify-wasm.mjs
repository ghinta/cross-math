import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { initSync, generate, check, hint, verify } from '../src/wasm/cross_math_core.js';

initSync({ module: readFileSync(new URL('../src/wasm/cross_math_core_bg.wasm', import.meta.url)) });
const catalog = JSON.parse(readFileSync(new URL('../src/data/puzzles.json', import.meta.url), 'utf8'));
const originals = JSON.parse(readFileSync(new URL('../src/data/crossmath-originals.json', import.meta.url), 'utf8')).records;
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

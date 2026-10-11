import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { initSync, generate, check, hint } from '../src/wasm/cross_math_core.js';

initSync({ module: readFileSync(new URL('../src/wasm/cross_math_core_bg.wasm', import.meta.url)) });
const catalog = JSON.parse(readFileSync(new URL('../src/data/puzzles.json', import.meta.url), 'utf8'));
let longest = 0;
for (const expected of catalog) {
  const start = performance.now();
  const actual = JSON.parse(generate(expected.seed, expected.difficulty));
  longest = Math.max(longest, performance.now() - start);
  assert.deepEqual(actual, expected, `Native/WASM mismatch: ${expected.id}`);
  const board = [...actual.givens];
  while (board.includes(null)) {
    const next = JSON.parse(hint(JSON.stringify(actual), JSON.stringify(board)));
    board[next.cell] = next.value;
  }
  assert.equal(JSON.parse(check(JSON.stringify(actual), JSON.stringify(board))).valid, true);
}
console.log(`${catalog.length} native/WASM parity checks and complete hint paths passed. Slowest generation: ${longest.toFixed(1)} ms.`);

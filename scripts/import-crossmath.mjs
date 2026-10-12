// Unchanged original tasks, re-encoded for the app. No clue/number/layout edits.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { initSync, verify, hint, check } from '../src/wasm/cross_math_core.js';

initSync({ module: readFileSync(new URL('../src/wasm/cross_math_core_bg.wasm', import.meta.url)) });
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/import-crossmath.mjs <Original/testset_hr.jsonl>');
const raw = readFileSync(input);
const rows = raw.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
const source = {
  dataset: 'xuyige/CrossMath', revision: 'b6cb3a1ff374af296786d74459cc16a931d97bc2',
  file: 'Original/testset_hr.jsonl', license: 'CC-BY-NC-ND-4.0',
  url: 'https://huggingface.co/datasets/xuyige/CrossMath',
  sha256: createHash('sha256').update(raw).digest('hex'),
};
const grid = text => text.split('\n').map(row => row.split('|').slice(1, -1).map(v => v.trim()));
const operators = { '+': '+', '-': '-', '−': '-', '×': '*', '*': '*', '÷': '/', '/': '/' };
const calculate = (a, b, op) => op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : b && a % b === 0 ? a / b : NaN;
const normalized = text => text.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-').replaceAll(' ', '');
const accepted = [], rejected = [];
for (const [index, original] of rows.entries()) {
  try {
    const table = grid(original.markdown_table), answer = grid(original.markdown_answer);
    const height = table.length, width = table[0].length;
    assert(table.every(row => row.length === width));
    assert.equal(answer.length, height); assert(answer.every(row => row.length === width));
    if (height > 11 || width > 11) { rejected.push({ index, reason: 'screen_dimensions' }); continue; }
    const cells = [], givens = [], solution = [], bank = [], indices = new Map();
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
      const value = table[row][col];
      if (value !== '?' && !/^\d+$/.test(value)) { assert.equal(answer[row][col], ''); continue; }
      const n = value === '?' ? Number(answer[row][col]) : Number(value);
      assert(Number.isInteger(n) && n > 0);
      if (value !== '?') assert.equal(answer[row][col], '');
      indices.set(`${row},${col}`, cells.length); cells.push({ row, col });
      solution.push(n); givens.push(value === '?' ? null : n);
      if (value === '?') bank.push(n);
    }
    if (solution.some(n => n > 99)) { rejected.push({ index, reason: 'number_range' }); continue; }
    const equations = [];
    for (const { row, col } of cells) for (const [dy, dx] of [[0, 1], [1, 0]]) {
      if (row + 4 * dy >= height || col + 4 * dx >= width) continue;
      const operator = operators[table[row + dy][col + dx]];
      if (!operator || table[row + 3 * dy][col + 3 * dx] !== '=') continue;
      const relation = [0, 2, 4].map(j => indices.get(`${row + j * dy},${col + j * dx}`));
      assert(relation.every(Number.isInteger));
      equations.push({ cells: relation, operator });
    }
    assert.equal(equations.length, original.problems);
    // Independently check every supplied answer and the author's equation list.
    for (const eq of equations) {
      const [a, b, c] = eq.cells.map(i => solution[i]); assert.equal(calculate(a, b, eq.operator), c);
    }
    const actual = equations.map(eq => { const [a, b, c] = eq.cells.map(i => solution[i]); return `${a}${eq.operator}${b}=${c}`; }).sort();
    const declared = original.solutions.split('\n').filter(line => /\d/.test(line)).map(normalized).sort();
    assert.deepEqual(actual, declared);
    const stepEquations = Object.values(original.solving_steps).flat().map(normalized);
    assert(stepEquations.every(eq => actual.includes(eq)));
    const id = original.img.match(/math_puzzle_(\d+)\.png$/)[1];
    const puzzle = { id: `hf-crossmath-${id}`, version: 2, seed: Number(id), difficulty: original.difficulty,
      givens, bank: bank.sort((a, b) => a - b), equations, layout: { rows: height, cols: width, cells },
      rating: { deductions: bank.length, rounds: Object.keys(original.solving_steps).length, branches: 0 },
      source: { ...source, record: id },
    };
    assert.equal(JSON.parse(verify(JSON.stringify(puzzle))), true);
    const board = [...givens];
    while (board.includes(null)) {
      const step = JSON.parse(hint(JSON.stringify(puzzle), JSON.stringify(board)));
      assert.equal(step.clear_cell, null); assert.equal(step.value, solution[step.cell]);
      board[step.cell] = step.value;
    }
    assert.deepEqual(board, solution);
    assert.equal(JSON.parse(check(JSON.stringify(puzzle), JSON.stringify(board))).valid, true);
    accepted.push({ index, original, puzzle, solution });
  } catch (error) { rejected.push({ index, reason: 'failed_validation', detail: String(error.message) }); }
}
const report = { source, inputRows: rows.length, accepted: accepted.length,
  difficulties: Object.fromEntries(['easy', 'medium', 'hard'].map(d => [d, accepted.filter(r => r.puzzle.difficulty === d).length])), rejected };
assert(accepted.length > 0 && Object.values(report.difficulties).every(n => n > 0));
writeFileSync(new URL('../src/data/crossmath-originals.json', import.meta.url), JSON.stringify({ source, records: accepted }, null, 2) + '\n');
writeFileSync(new URL('../src/data/crossmath-audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ rows: rows.length, accepted: accepted.length, difficulties: report.difficulties,
  rejected: Object.fromEntries([...new Set(rejected.map(r => r.reason))].map(reason => [reason, rejected.filter(r => r.reason === reason).length])) }));

import { expect, it } from 'vitest';
import originals from '../src/data/crossmath-originals.json';
import { guidedNumbers, workAreas } from '../src/workareas';
import { emptySave, parseSave } from '../src/storage';
import { newSession, place } from '../src/game';
import type { CrosswordPuzzle } from '../src/types';

it('every original retains complete connected equations, including on very small screens', () => {
  for (const record of originals.records) {
    const p = record.puzzle as CrosswordPuzzle;
    for (const [rows, cols] of [[5, 7], [1, 5], [11, 11]]) {
      const areas = workAreas(p, rows, cols);
      expect(new Set(areas.flatMap(a => a.equations)).size).toBe(p.equations.length);
      for (const area of areas) {
        expect(area.equations.length).toBeGreaterThanOrEqual(2);
        if (area.rows > rows || area.cols > cols) expect(area.equations.length).toBe(2);
        const connected = new Set(p.equations[area.equations[0]].cells);
        for (let pass = 0; pass < area.equations.length; pass++) {
          for (const i of area.equations) if (p.equations[i].cells.some(c => connected.has(c))) p.equations[i].cells.forEach(c => connected.add(c));
        }
        expect(connected.size).toBe(area.cells.length);
        for (const i of area.equations) {
          expect(p.equations[i].cells.every(c => area.cells.includes(c))).toBe(true);
        }
      }
      expect(new Set(areas.flatMap(a => a.cells)).size).toBe(p.givens.length);
    }
  }
});

it('one open regional field still offers alternatives from real stock and preserves the final move', () => {
  for (const record of originals.records) {
    const p = record.puzzle as CrosswordPuzzle;
    const cell = p.givens.findIndex(n => n === null);
    const choices = guidedNumbers(p, p.givens, record.solution, [cell]);
    expect(choices.has(record.solution[cell])).toBe(true);
    expect(choices.size).toBeGreaterThanOrEqual(Math.min(4, new Set(p.bank).size));
    expect([...choices.keys()].every(n => p.bank.includes(n))).toBe(true);
    const finalBoard = [...record.solution]; finalBoard[cell] = null;
    expect([...guidedNumbers(p, finalBoard, record.solution, [cell])]).toEqual([[record.solution[cell], 1]]);
    expect(guidedNumbers(p, record.solution, record.solution, [cell]).size).toBe(0);
  }
});

it('guided inventory preserves duplicate counts and offers corrections to misplaced tiles', () => {
  const record = originals.records.find(r => new Set(r.puzzle.bank).size < r.puzzle.bank.length)!;
  const p = record.puzzle as CrosswordPuzzle, solution = record.solution;
  const value = p.bank.find((n, i) => p.bank.indexOf(n) !== i)!;
  const cells = solution.map((n, i) => n === value && p.givens[i] === null ? i : -1).filter(i => i >= 0);
  const board = [...p.givens];
  expect(guidedNumbers(p, board, solution, cells).get(value)).toBe(cells.length);
  board[cells[0]] = value;
  expect(guidedNumbers(p, board, solution, cells).get(value)).toBe(cells.length - 1);
  board[cells[0]] = p.bank.find(n => n !== value)!;
  expect(guidedNumbers(p, board, solution, cells).get(value)).toBe(cells.length);
});

it('wide boards and three-digit entries round-trip with history and guided settings', () => {
  const record = originals.records.find(r => r.puzzle.layout.cols === 21 && r.puzzle.bank.some(n => n > 99))!;
  const p = record.puzzle as CrosswordPuzzle;
  const cell = p.givens.findIndex((n, i) => n === null && record.solution[i] > 99);
  const save = emptySave(); save.session = place(newSession(p), cell, record.solution[cell]);
  expect(parseSave(JSON.stringify(save))).toEqual(save);
  const old = JSON.parse(JSON.stringify(save)); delete old.settings.guided;
  expect(parseSave(JSON.stringify(old)).settings.guided).toBe(true);
});

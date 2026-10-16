import { describe, expect, it } from 'vitest';
import { newSession, place, remainingNumbers, clearCell, travel } from '../src/game';
import { emptySave, parseSave } from '../src/storage';
import type { Puzzle } from '../src/types';
import catalog from '../src/data/puzzles.json';

const p = catalog[0] as Puzzle;
const first = p.givens.findIndex(n => n === null);

describe('number inventory and game history', () => {
  it('consumes duplicate tiles individually and restores them with undo', () => {
    const puzzle = (catalog as Puzzle[]).find(p => new Set(p.bank).size < p.bank.length)!;
    const n = puzzle.bank.find((n, i) => puzzle.bank.indexOf(n) !== i)!;
    const cells = puzzle.givens.map((n, i) => n === null ? i : -1).filter(i => i >= 0);
    let s = newSession(puzzle);
    const count = remainingNumbers(puzzle, s.board).get(n)!;
    s = place(s, cells[0], n);
    expect(remainingNumbers(puzzle, s.board).get(n)).toBe(count - 1);
    s = place(s, cells[1], n);
    expect(remainingNumbers(puzzle, s.board).get(n)).toBe(count - 2);
    s = travel(s, 'undo');
    expect(s.board[cells[1]]).toBeNull();
    expect(remainingNumbers(puzzle, s.board).get(n)).toBe(count - 1);
    s = travel(s, 'redo');
    expect(s.board[cells[1]]).toBe(n);
  });
  it('protects givens and rejects unavailable numbers', () => {
    const s = newSession(p);
    const given = p.givens.findIndex(n => n !== null);
    expect(place(s, given, 99)).toBe(s);
    const unavailable = Array.from({ length: 99 }, (_, i) => i + 1).find(n => !p.bank.includes(n))!;
    expect(place(s, first, unavailable)).toBe(s);
    expect(clearCell(s, given)).toBe(s);
  });
  it('clears a placed tile, restores inventory and clears redo after a new action', () => {
    const s = place(newSession(p), first, p.bank[0]);
    const cleared = clearCell(s, first);
    expect(cleared.board[first]).toBeNull();
    expect(remainingNumbers(p, cleared.board)).toEqual(remainingNumbers(p, p.givens));
    const undone = travel(cleared, 'undo');
    expect(undone.board[first]).toBe(p.bank[0]);
    expect(clearCell(undone, first).redo).toEqual([]);
  });
});

describe('save import validation', () => {
  it('round-trips a legitimate save including history', () => {
    const save = emptySave();
    save.session = place(newSession(p), first, p.bank[0]);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
  });
  it('rejects corrupt boards, equation indices, settings and excessive files', () => {
    const save = emptySave(); save.session = newSession(p);
    const broken = structuredClone(save);
    broken.session!.puzzle.equations[0].cells[0] = 99;
    expect(() => parseSave(JSON.stringify(broken))).toThrow();
    const wrong = structuredClone(save);
    wrong.session!.board[wrong.session!.puzzle.givens.findIndex(n => n !== null)] = 99;
    expect(() => parseSave(JSON.stringify(wrong))).toThrow();
    const badHistory = structuredClone(save);
    badHistory.session!.undo = [{ board: Array(9).fill(99), notes: {} }];
    expect(() => parseSave(JSON.stringify(badHistory))).toThrow();
    const badDate = structuredClone(save);
    badDate.daily = { ...newSession(p, 'daily', '2026-13-01') };
    expect(() => parseSave(JSON.stringify(badDate))).toThrow();
    expect(() => parseSave(JSON.stringify({ ...save, settings: { ...save.settings, theme: 'neon' } }))).toThrow();
    expect(() => parseSave(' '.repeat(1_000_001))).toThrow();
  });
});

import legacy from './data/legacy-puzzles.json';

it('keeps old games and statistics readable', () => {
  const save = emptySave(); save.session = newSession(legacy[0] as Puzzle); save.stats.solved = [legacy[1].id];
  expect(parseSave(JSON.stringify(save))).toEqual(save);
});
it('rejects overlapping, detached and malformed crossword geometry', () => {
  const save = emptySave(); save.session = newSession(p);
  const broken = structuredClone(save);
  if (broken.session!.puzzle.version === 2) broken.session!.puzzle.layout.cells[0] = broken.session!.puzzle.layout.cells[1];
  expect(() => parseSave(JSON.stringify(broken))).toThrow();
  const outOfBounds = structuredClone(save);
  if (outOfBounds.session!.puzzle.version === 2) outOfBounds.session!.puzzle.layout.cells[0].row = 11;
  expect(() => parseSave(JSON.stringify(outOfBounds))).toThrow();
});

import { describe, expect, it } from 'vitest';
import { newSession, place, remainingNumbers, toggleNote, travel } from '../src/game';
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
    expect(place(s, first, 99)).toBe(s);
    expect(toggleNote(s, first, 0)).toBe(s);
    expect(toggleNote(s, first, 99)).toBe(s);
  });
  it('records notes without consuming numbers and clears redo after a new action', () => {
    const s = newSession(p);
    const noted = toggleNote(s, first, p.bank[0]);
    expect(noted.notes[first]).toEqual([p.bank[0]]);
    expect(noted.board).toEqual(s.board);
    const undone = travel(noted, 'undo');
    const changed = place(undone, first, p.bank[0]);
    expect(changed.redo).toEqual([]);
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

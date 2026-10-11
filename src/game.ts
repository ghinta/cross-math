import type { Board, Puzzle, Session, Snapshot } from './types';

export function newSession(puzzle: Puzzle, mode: Session['mode'] = 'free', day: string | null = null): Session {
  return { puzzle, board: [...puzzle.givens], notes: {}, undo: [], redo: [], elapsed: 0, hints: 0, mode, day, completed: false };
}
export function remainingNumbers(puzzle: Puzzle, board: Board): Map<number, number> {
  const counts = new Map<number, number>();
  for (const n of puzzle.bank) counts.set(n, (counts.get(n) ?? 0) + 1);
  board.forEach((n, i) => { if (puzzle.givens[i] === null && n !== null) counts.set(n, (counts.get(n) ?? 0) - 1); });
  return counts;
}
export function snapshot(s: Session): Snapshot { return { board: [...s.board], notes: structuredClone(s.notes) } }
export function commit(s: Session, board: Board, notes = s.notes): Session {
  return { ...s, board, notes, undo: [...s.undo.slice(-99), snapshot(s)], redo: [], completed: false };
}
export function place(s: Session, cell: number, value: number | null): Session {
  if (s.completed || s.puzzle.givens[cell] !== null || s.board[cell] === value) return s;
  if (value !== null && (remainingNumbers(s.puzzle, s.board).get(value) ?? 0) <= 0) return s;
  const board = [...s.board]; board[cell] = value;
  const notes = { ...s.notes }; delete notes[cell];
  return commit(s, board, notes);
}
export function travel(s: Session, direction: 'undo' | 'redo'): Session {
  const from = s[direction];
  if (!from.length || s.completed) return s;
  const to = direction === 'undo' ? 'redo' : 'undo';
  return { ...s, ...from[from.length - 1], [direction]: from.slice(0, -1), [to]: [...s[to], snapshot(s)] };
}
export function clearCell(s: Session, cell: number): Session {
  if (s.completed || s.puzzle.givens[cell] !== null) return s;
  if (s.board[cell] !== null) return place(s, cell, null);
  if (!s.notes[cell]?.length) return s;
  const notes = { ...s.notes }; delete notes[cell];
  return commit(s, [...s.board], notes);
}
export function toggleNote(s: Session, cell: number, value: number): Session {
  if (s.completed || s.puzzle.givens[cell] !== null || s.board[cell] !== null || !s.puzzle.bank.includes(value)) return s;
  const old = s.notes[cell] ?? [];
  const values = old.includes(value) ? old.filter(n => n !== value) : [...old, value].sort((a, b) => a - b);
  return commit(s, [...s.board], { ...s.notes, [cell]: values });
}

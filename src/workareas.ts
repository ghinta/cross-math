import type { Board, CrosswordPuzzle } from './types';

export interface WorkArea { equations: number[]; cells: number[]; top: number; left: number; rows: number; cols: number }
function area(p: CrosswordPuzzle, equations: number[]): WorkArea {
  const cells = [...new Set(equations.flatMap(i => p.equations[i].cells))];
  const positions = cells.map(i => p.layout.cells[i]);
  const top = Math.min(...positions.map(p => p.row)), left = Math.min(...positions.map(p => p.col));
  return { equations, cells, top, left, rows: Math.max(...positions.map(p => p.row)) - top + 1, cols: Math.max(...positions.map(p => p.col)) - left + 1 };
}
// Areas overlap at crossings. Every displayed equation is complete.
export function workAreas(p: CrosswordPuzzle, maxRows: number, maxCols: number): WorkArea[] {
  const pending = new Set(p.equations.map((_, i) => i));
  const result: WorkArea[] = [];
  while (pending.size) {
    const first = pending.values().next().value!;
    pending.delete(first);
    let current = area(p, [first]);
    for (const i of pending) {
      if (!p.equations[i].cells.some(c => current.cells.includes(c))) continue;
      const candidate = area(p, [...current.equations, i]);
      if (candidate.rows <= maxRows && candidate.cols <= maxCols && candidate.cells.filter(c => p.givens[c] === null).length <= 5) { current = candidate; pending.delete(i); }
    }
    result.push(current);
  }
  return result;
}
export function guidedNumbers(p: CrosswordPuzzle, board: Board, solution: number[], cells: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const cell of cells) {
    if (p.givens[cell] !== null || board[cell] === solution[cell]) continue;
    const n = solution[cell]; counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return counts;
}
export const tileSpan = (pixels: number) => [9, 7, 5].find(span => ((span + 1) / 2 + (span - 1) / 2 * .45) * 44 + (span - 1) * 2 <= pixels) ?? 1;

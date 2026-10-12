import type { Board, CrosswordPuzzle } from './types';
import { remainingNumbers } from './game';

export interface WorkArea { equations: number[]; cells: number[]; top: number; left: number; rows: number; cols: number }
function area(p: CrosswordPuzzle, equations: number[]): WorkArea {
  const cells = [...new Set(equations.flatMap(i => p.equations[i].cells))];
  const positions = cells.map(i => p.layout.cells[i]);
  const top = Math.min(...positions.map(p => p.row)), left = Math.min(...positions.map(p => p.col));
  return { equations, cells, top, left, rows: Math.max(...positions.map(p => p.row)) - top + 1, cols: Math.max(...positions.map(p => p.col)) - left + 1 };
}
// Keep full equations and overlap neighbouring areas for context.
export function workAreas(p: CrosswordPuzzle, maxRows: number, maxCols: number): WorkArea[] {
  const pending = new Set(p.equations.map((_, i) => i));
  const result: WorkArea[] = [];
  while (pending.size) {
    const first = pending.values().next().value!;
    pending.delete(first);
    let current = area(p, [first]);
    let grew: boolean;
    do {
      grew = false;
      for (const i of pending) {
        if (!p.equations[i].cells.some(c => current.cells.includes(c))) continue;
        const candidate = area(p, [...current.equations, i]);
        if (candidate.rows <= maxRows && candidate.cols <= maxCols && candidate.cells.filter(c => p.givens[c] === null).length <= 8) {
          current = candidate; pending.delete(i); grew = true;
        }
      }
    } while (grew);
    // Fill small leftovers with neighbouring equations, even if another area
    // already contains them. Otherwise the final area often becomes a corner.
    do {
      grew = false;
      for (let i = 0; i < p.equations.length; i++) {
        if (current.equations.includes(i) || !p.equations[i].cells.some(c => current.cells.includes(c))) continue;
        const candidate = area(p, [...current.equations, i]);
        if (candidate.rows <= maxRows && candidate.cols <= maxCols && candidate.cells.filter(c => p.givens[c] === null).length <= 8) {
          current = candidate; pending.delete(i); grew = true;
        }
      }
    } while (grew);
    if (current.equations.length === 1) {
      const neighbours = p.equations.map((eq, i) => ({ eq, i }))
        .filter(({ eq, i }) => i !== first && eq.cells.some(c => current.cells.includes(c)))
        .map(({ i }) => area(p, [first, i]))
        .sort((a, b) => Math.max(a.rows / maxRows, a.cols / maxCols) - Math.max(b.rows / maxRows, b.cols / maxCols));
      // On very small screens the pair is rendered as linked equation rows.
      if (neighbours.length) { current = neighbours[0]; current.equations.forEach(i => pending.delete(i)); }
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
  if (!counts.size) return counts;
  const remaining = remainingNumbers(p, board);
  const targets = [...counts.keys()];
  const alternatives = [...remaining.keys()].filter(n => !counts.has(n) && remaining.get(n)! > 0)
    .sort((a, b) => Math.min(...targets.map(n => Math.abs(n - a))) - Math.min(...targets.map(n => Math.abs(n - b))) || a - b);
  // A local pool must not reveal the answer merely by offering a single tile.
  for (const n of alternatives) {
    if (counts.size >= 4) break;
    counts.set(n, remaining.get(n)!);
  }
  return counts;
}
export const tilePixels = (span: number, tile = 33) => ((span + 1) / 2 + (span - 1) / 2 * .45) * tile + (span - 1) * 2;
export const tileSpan = (pixels: number) => [21, 19, 17, 15, 13, 11, 9, 7, 5].find(span => tilePixels(span) <= pixels) ?? 1;

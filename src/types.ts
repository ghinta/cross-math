export type Difficulty = 'easy' | 'medium' | 'hard';
export type Operator = '+' | '-' | '*' | '/';
export type Board = (number | null)[];
export interface Equation { cells: number[]; operators: Operator[]; target: number }
interface PuzzleBase {
  id: string; seed: number; difficulty: Difficulty;
  givens: Board; bank: number[];
  rating: { deductions: number; rounds: number; branches: number };
}
export interface LegacyPuzzle extends PuzzleBase { version: 1; equations: Equation[] }
export interface CrosswordPuzzle extends PuzzleBase {
  version: 2; equations: { cells: number[]; operator: Operator }[];
  source?: { dataset: string; revision: string; file: string; license: string; url: string; sha256: string; record: string };
  layout: { rows: number; cols: number; cells: { row: number; col: number }[] };
}
export type Puzzle = LegacyPuzzle | CrosswordPuzzle;
export interface Check { equations: ('pending' | 'valid' | 'invalid')[]; complete: boolean; valid: boolean; inventory_valid: boolean }
export interface Hint { cell: number; value: number; clear_cell: number | null; explanation: string }
export interface Snapshot { board: Board; notes: Record<number, number[]> }
export interface Session {
  puzzle: Puzzle; board: Board; notes: Record<number, number[]>;
  undo: Snapshot[]; redo: Snapshot[]; elapsed: number; hints: number;
  mode: 'free' | 'daily'; day: string | null; completed: boolean;
}
export interface Settings { guided: boolean; puzzleSource: 'crossmath' | 'generator'; theme: 'system' | 'light' | 'dark'; reduceMotion: boolean; opaque: boolean; showTimer: boolean; checkErrors: boolean }
export interface Stats { solved: string[]; best: Partial<Record<Difficulty, number>>; dailyDates: string[] }
export interface Save { version: 1; activeMode: 'free' | 'daily'; session: Session | null; daily: Session | null; settings: Settings; stats: Stats }

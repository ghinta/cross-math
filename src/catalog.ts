import original from './data/crossmath-originals.json';
import generated from './data/puzzles.json';
import type { Difficulty, Puzzle } from './types';

export const originalPuzzles = original.records.map(r => r.puzzle) as Puzzle[];
export const generatedPuzzles = generated as Puzzle[];
export const originalSource = original.source;
export function pickOriginal(seed: number, difficulty: Difficulty, solved: string[] = []): Puzzle {
  const all = originalPuzzles.filter(p => p.difficulty === difficulty);
  const unseen = all.filter(p => !solved.includes(p.id));
  const pool = unseen.length ? unseen : all;
  return pool[seed % pool.length];
}

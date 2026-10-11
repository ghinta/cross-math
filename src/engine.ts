import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Board, Check, Difficulty, Hint, Puzzle } from './types';

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();

function request<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const command = method === 'generate' ? 'generate_puzzle' : method === 'check' ? 'check_board' : 'get_hint';
    const args = method === 'generate' ? payload : { puzzle: JSON.stringify(payload.puzzle), values: JSON.stringify(payload.board) };
    return invoke<string>(command, args).then(text => JSON.parse(text) as T);
  }
  if (!worker) {
    worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const entry = pending.get(data.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(data.id);
      if (data.error) entry.reject(new Error(data.error)); else entry.resolve(data.result);
    };
    worker.onerror = () => {
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Die Rätsel-Engine konnte nicht geladen werden.')); }
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
  }
  const id = ++nextId;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Die Berechnung dauert zu lange. Bitte versuche es erneut.')); }, 15000);
    pending.set(id, { resolve: value => resolve(value as T), reject, timer });
    worker!.postMessage({ id, method, ...payload });
  });
}
export const engine = {
  generate: (seed: number, difficulty: Difficulty) => request<Puzzle>('generate', { seed, difficulty }),
  check: (puzzle: Puzzle, board: Board) => request<Check>('check', { puzzle, board }),
  hint: (puzzle: Puzzle, board: Board) => request<Hint>('hint', { puzzle, board }),
};

export function dailySeed(date: string): number {
  let seed = 2166136261;
  for (const char of `cross-math:v1:daily:${date}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}
export function randomSeed(): number { return crypto.getRandomValues(new Uint32Array(1))[0] }
// One shared, explicitly UTC-based daily puzzle worldwide.
export function dailyDate(): string { return new Date().toISOString().slice(0, 10) }

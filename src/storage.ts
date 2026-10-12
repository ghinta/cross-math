import Dexie, { type Table } from 'dexie';
import type { Save, Session, Settings } from './types';

const db = new Dexie('cross-math');
db.version(1).stores({ saves: 'key' });
const saves = db.table('saves') as Table<{ key: string; value: Save; writtenAt: number }>;
const backupKey = 'cross-math-backup-v1';
export const defaults: Settings = { guided: true, puzzleSource: 'crossmath', theme: 'system', reduceMotion: false, opaque: false, showTimer: true, checkErrors: false };
export const emptySave = (): Save => ({ version: 1, activeMode: 'free', session: null, daily: null, settings: { ...defaults }, stats: { solved: [], best: {}, dailyDates: [] } });

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const natural = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const number = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 999;
const board = (v: unknown, length: number): v is (number | null)[] => Array.isArray(v) && v.length === length && v.every(n => n === null || number(n));
const date = (v: unknown): boolean => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
function notes(v: unknown, length: number): boolean {
  return object(v) && Object.entries(v).every(([key, values]) => /^(0|[1-9]\d*)$/.test(key) && Number(key) < length && Array.isArray(values) && values.length <= 99 && values.every(number));
}
function validLayout(p: Record<string, unknown>): boolean {
  if (!Array.isArray(p.equations) || !Array.isArray(p.givens)) return false;
  if (p.version === 1) return p.givens.length === 9 && p.equations.length === 6 && p.equations.every((eq, i) => object(eq)
    && JSON.stringify(eq.cells) === JSON.stringify(i < 3 ? [3 * i, 3 * i + 1, 3 * i + 2] : [i - 3, i, i + 3])
    && Array.isArray(eq.operators) && eq.operators.length === 2 && eq.operators.every(op => ['+', '-', '*', '/'].includes(op))
    && natural(eq.target) && (eq.target as number) > 0 && (eq.target as number) <= 999);
  if (p.version !== 2 || !object(p.layout) || !natural(p.layout.rows) || !natural(p.layout.cols)
    || (p.layout.rows as number) < 5 || (p.layout.rows as number) > 21 || (p.layout.cols as number) < 5 || (p.layout.cols as number) > 21
    || !Array.isArray(p.layout.cells) || p.layout.cells.length !== p.givens.length || p.equations.length < 2 || p.equations.length > 20) return false;
  const cells = p.layout.cells;
  const occupied = new Set<string>();
  for (const pos of cells) {
    if (!object(pos) || !natural(pos.row) || !natural(pos.col) || (pos.row as number) >= (p.layout.rows as number) || (pos.col as number) >= (p.layout.cols as number)) return false;
    const key = `${pos.row},${pos.col}`; if (occupied.has(key)) return false; occupied.add(key);
  }
  const used = new Set<number>();
  const axes = new Set<string>();
  const connected = new Set<number>([0]);
  const relations: number[][] = [];
  for (const eq of p.equations) {
    if (!object(eq) || !['+', '-', '*', '/'].includes(eq.operator as string) || !Array.isArray(eq.cells) || eq.cells.length !== 3
      || !eq.cells.every(i => natural(i) && i < cells.length)) return false;
    const [a, b, c] = eq.cells.map(i => cells[i]) as { row: number; col: number }[];
    const horizontal = a.row === b.row && b.row === c.row && a.col + 2 === b.col && b.col + 2 === c.col;
    const vertical = a.col === b.col && b.col === c.col && a.row + 2 === b.row && b.row + 2 === c.row;
    if (!horizontal && !vertical) return false;
    for (const cell of eq.cells) { const key = `${cell},${vertical}`; if (axes.has(key)) return false; axes.add(key); }
    for (const offset of [1, 3]) {
      const key = `${a.row + (vertical ? offset : 0)},${a.col + (horizontal ? offset : 0)}`;
      if (occupied.has(key)) return false; occupied.add(key);
    }
    eq.cells.forEach(i => used.add(i)); relations.push(eq.cells);
  }
  let count: number;
  do { count = connected.size; for (const relation of relations) if (relation.some(i => connected.has(i))) relation.forEach(i => connected.add(i)); } while (count !== connected.size);
  return used.size === cells.length && connected.size === cells.length;
}
export function validSession(value: unknown): value is Session | null {
  if (value === null) return true;
  if (!object(value) || !object(value.puzzle)) return false;
  const p = value.puzzle;
  const length = Array.isArray(p.givens) ? p.givens.length : 0;
  if (length < 5 || length > 36 || ![1, 2].includes(p.version as number) || typeof p.id !== 'string' || !p.id.length || p.id.length > 100 || !natural(p.seed) || (p.seed as number) > 0xffffffff
    || !['easy', 'medium', 'hard'].includes(p.difficulty as string) || !board(p.givens, length) || !board(value.board, length)
    || !Array.isArray(p.bank) || p.bank.length > length || !p.bank.every(number) || !object(p.rating) || !validLayout(p)) return false;
  if (!['deductions', 'rounds', 'branches'].every(k => natural((p.rating as Record<string, unknown>)[k]))) return false;
  if (p.bank.length !== p.givens.filter(n => n === null).length) return false;
  if (p.version === 1 && [...p.bank, ...p.givens].some(n => n !== null && (n as number) > 99)) return false;
  const validBoard = (values: unknown): boolean => {
    if (!board(values, length)) return false;
    const inventory = new Map<number, number>();
    for (const n of p.bank as number[]) inventory.set(n, (inventory.get(n) ?? 0) + 1);
    for (let i = 0; i < length; i++) {
      const given = (p.givens as (number | null)[])[i]; const valueAt = values[i];
      if (given !== null && valueAt !== given) return false;
      if (given === null && valueAt !== null) {
        inventory.set(valueAt, (inventory.get(valueAt) ?? 0) - 1); if (inventory.get(valueAt)! < 0) return false;
      }
    }
    return true;
  };
  const snapshots = (v: unknown) => Array.isArray(v) && v.length <= 100 && v.every(s => object(s) && validBoard(s.board) && notes(s.notes, length));
  if (!notes(value.notes, length) || !snapshots(value.undo) || !snapshots(value.redo) || !natural(value.elapsed) || !natural(value.hints)
    || !['free', 'daily'].includes(value.mode as string) || typeof value.completed !== 'boolean'
    || (value.mode === 'daily' ? !date(value.day) : value.day !== null)) return false;
  return validBoard(value.board);
}
export function parseSave(text: string): Save {
  if (text.length > 1_000_000) throw new Error('Die Datei ist zu groß.');
  const v: unknown = JSON.parse(text);
  if (!object(v) || v.version !== 1 || !['free', 'daily'].includes(v.activeMode as string) || !validSession(v.session) || !validSession(v.daily) || !object(v.settings) || !object(v.stats)) throw new Error('Das ist kein gültiger Cross-Math-Spielstand.');
  if ((v.session && v.session.mode !== 'free') || (v.daily && v.daily.mode !== 'daily')) throw new Error('Ungültiger Spielmodus.');
  if (!['system', 'light', 'dark'].includes(v.settings.theme as string)
    || !['reduceMotion', 'opaque', 'showTimer', 'checkErrors'].every(k => typeof (v.settings as Record<string, unknown>)[k] === 'boolean')) throw new Error('Ungültige Einstellungen.');
  if (v.settings.puzzleSource !== undefined && !['crossmath', 'generator'].includes(v.settings.puzzleSource as string)) throw new Error('Ungültige Aufgabenquelle.');
  if (v.settings.guided !== undefined && typeof v.settings.guided !== 'boolean') throw new Error('Ungültiger geführter Modus.');
  const list = (v: unknown) => Array.isArray(v) && v.length <= 10000 && v.every(s => typeof s === 'string' && s.length <= 100);
  if (!list(v.stats.solved) || !list(v.stats.dailyDates) || !object(v.stats.best)
    || !Object.entries(v.stats.best).every(([k, n]) => ['easy', 'medium', 'hard'].includes(k) && natural(n))) throw new Error('Ungültige Statistik.');
  const result = v as unknown as Save;
  return { ...result, settings: { ...result.settings, guided: result.settings.guided ?? true, puzzleSource: result.settings.puzzleSource ?? 'crossmath' } };
}
export async function loadSave(): Promise<Save> {
  const candidates: { writtenAt: number; value: Save }[] = [];
  try {
    const saved = await saves.get('main');
    if (saved) candidates.push({ writtenAt: saved.writtenAt ?? 0, value: parseSave(JSON.stringify(saved.value)) });
  } catch { /* Use synchronous backup when IndexedDB is unavailable. */ }
  try {
    const backup = localStorage.getItem(backupKey);
    if (backup) {
      const data = JSON.parse(backup);
      candidates.push({ writtenAt: data.writtenAt ?? 0, value: parseSave(JSON.stringify(data.value ?? data)) });
    }
  } catch { /* Browser storage can be unavailable in private mode. */ }
  return candidates.sort((a, b) => b.writtenAt - a.writtenAt)[0]?.value ?? emptySave();
}
let writing: Promise<unknown> = Promise.resolve();
export function saveGame(value: Save): Promise<boolean> {
  const writtenAt = Date.now();
  let backup = false;
  try { localStorage.setItem(backupKey, JSON.stringify({ writtenAt, value })); backup = true; } catch { /* Report if both stores fail. */ }
  const fallback = backup;
  const next = writing.catch(() => {}).then(async () => {
    try { await saves.put({ key: 'main', value, writtenAt }); return true; } catch { return fallback; }
  });
  writing = next;
  return next;
}

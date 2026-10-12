import Dexie from 'dexie';
import index from './data/crossmath-index.json';
import starter from './data/crossmath-starter.json';
import generated from './data/puzzles.json';
import type { CrosswordPuzzle, Difficulty, Operator, Puzzle } from './types';

type Compact = [string, Difficulty, number, number, [number, number][], (number | null)[], number[], [number[], Operator][], CrosswordPuzzle['rating']];
const unpack = (r: Compact): CrosswordPuzzle => ({ id: `hf-crossmath-${r[0]}`, version: 2, seed: Number(r[0]), difficulty: r[1],
  layout: { rows: r[2], cols: r[3], cells: r[4].map(([row, col]) => ({ row, col })) }, givens: r[5], bank: r[6],
  equations: r[7].map(([cells, operator]) => ({ cells, operator })), rating: r[8], source: { ...index.source, record: r[0] } });

export const originalPuzzles = (starter as Compact[]).map(unpack);
export const generatedPuzzles = generated as Puzzle[];
export const originalSource = index.source;
export const originalCount = index.count;
const available = new Map(originalPuzzles.map(p => [p.id, p]));
const loaded = new Set<string>();
const durable = new Set(available.keys());
const savedPacks = new Set<string>();
const inFlight = new Map<string, Promise<void>>();
const db = new Dexie('cross-math-puzzles');
db.version(1).stores({ packs: 'sha256' });
const packs = db.table<{ sha256: string; contents: string }, string>('packs');
let ready: Promise<void> | undefined;

function register(contents: string, file: string) {
  const records: unknown = JSON.parse(contents);
  const pack = index.packs.find(p => p.file === file)!;
  if (!Array.isArray(records) || records.length !== pack.tasks.length) throw new Error('Ungültiges Aufgabenpaket.');
  const puzzles = (records as Compact[]).map(unpack);
  if (puzzles.some((p, i) => p.source?.record !== pack.tasks[i][0] || p.difficulty !== pack.tasks[i][1])) throw new Error('Ungültiger Aufgabenindex.');
  puzzles.forEach(p => available.set(p.id, p));
  loaded.add(file);
}
async function verifiedContents(contents: string, hash: string) {
  const bytes = new TextEncoder().encode(contents);
  // Native custom-scheme WebViews do not consistently expose SubtleCrypto.
  const digest = crypto.subtle ? new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)) : (await import('@noble/hashes/sha2.js')).sha256(bytes);
  if ([...digest].map(n => n.toString(16).padStart(2, '0')).join('') !== hash) throw new Error('Das Aufgabenpaket ist unvollständig.');
}
export function prepareCatalog(): Promise<void> {
  return ready ??= (async () => {
    for (const pack of index.packs) {
      try {
        const cached = await packs.get(pack.sha256);
        if (cached) {
          await verifiedContents(cached.contents, pack.sha256); register(cached.contents, pack.file);
          pack.tasks.forEach(t => durable.add(`hf-crossmath-${t[0]}`)); savedPacks.add(pack.file);
        }
      } catch { /* The bundled starter remains available when storage is unavailable. */ }
    }
  })();
}
async function loadPack(pack: typeof index.packs[number]) {
  if (loaded.has(pack.file)) return;
  const previous = inFlight.get(pack.file); if (previous) return previous;
  const request = (async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}puzzles/${pack.file}`, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error('Das Aufgabenpaket konnte nicht geladen werden.');
    const contents = await response.text();
    await verifiedContents(contents, pack.sha256); register(contents, pack.file);
    try {
      await packs.put({ sha256: pack.sha256, contents });
      pack.tasks.forEach(t => durable.add(`hf-crossmath-${t[0]}`)); savedPacks.add(pack.file);
    } catch { /* Playing remains possible, but do not report a successful offline download. */ }
  })();
  inFlight.set(pack.file, request);
  try { await request; } finally { inFlight.delete(pack.file); }
}
export const downloadedCount = () => durable.size;
export async function downloadOriginals(onProgress?: (count: number) => void) {
  await prepareCatalog();
  for (const pack of index.packs) {
    await loadPack(pack); onProgress?.(durable.size);
    if (!savedPacks.has(pack.file)) throw new Error('Aufgaben konnten nicht lokal gespeichert werden.');
  }
}
export async function preloadOriginals() {
  await prepareCatalog();
  const pack = index.packs.find(p => !loaded.has(p.file));
  if (pack && navigator.onLine) await loadPack(pack);
}
export async function pickOriginal(seed: number, difficulty: Difficulty, solved: string[] = []): Promise<CrosswordPuzzle> {
  await prepareCatalog();
  const tasks = index.packs.flatMap(pack => pack.tasks.filter(t => t[1] === difficulty).map(t => ({ id: `hf-crossmath-${t[0]}`, pack })));
  const unseen = tasks.filter(p => !solved.includes(p.id));
  const pool = unseen.length ? unseen : tasks;
  const chosen = pool[seed % pool.length];
  try { if (!available.has(chosen.id)) await loadPack(chosen.pack); return available.get(chosen.id)!; }
  catch {
    const cached = [...available.values()].filter(p => p.difficulty === difficulty);
    const fresh = cached.filter(p => !solved.includes(p.id));
    const fallback = fresh.length ? fresh : cached;
    if (!fallback.length) throw new Error('Lade Aufgaben mit einer Internetverbindung herunter.');
    return fallback[seed % fallback.length];
  }
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, Check, CheckCheck, CircleHelp, Clock3, Download, Eraser, Lightbulb, Pause, Play, Redo2, Settings2, Sparkles, Trophy, Undo2, Upload, WifiOff, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import type { Check as BoardCheck, Difficulty, CrosswordPuzzle, Hint, Puzzle, Save, Session } from './types';
import { dailyDate, dailySeed, engine, randomSeed } from './engine';
import { clearCell, commit, newSession, place, remainingNumbers, travel } from './game';
import { emptySave, loadSave, parseSave, saveGame } from './storage';
import { downloadOriginals, downloadedCount, generatedPuzzles, originalCount, originalPuzzles, originalSource, pickOriginal, preloadOriginals } from './catalog';
import CrosswordView from './CrosswordView';
import { guidedNumbers } from './workareas';
import { appearance } from './appearance';
import AppearanceSettings, { Toggle } from './AppearanceSettings';
import { useInstallation } from './install';
import { usePaletteLayout } from './usePaletteLayout';

const levels: { id: Difficulty; label: string; detail: string }[] = [
  { id: 'easy', label: 'Leicht', detail: 'Wenige freie Felder.' },
  { id: 'medium', label: 'Mittel', detail: 'Mehr freie Felder und Rechenarten.' },
  { id: 'hard', label: 'Schwer', detail: 'Viele freie Felder und verknüpfte Gleichungen.' },
];
const opLabel = (op: string) => op === '*' ? '×' : op === '/' ? '÷' : op === '-' ? '−' : op;
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
const dayLabel = (date = dailyDate()) => new Intl.DateTimeFormat('de-AT', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog ref={dialog} className="modal glass" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Schließen" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}

function Board({ session, selected, onSelect, check, showErrors, onVisible }: { session: Session; selected: number | null; onSelect: (cell: number) => void; check: BoardCheck | null; showErrors: boolean; onVisible: (cells: number[] | null) => void }) {
  const { puzzle, board } = session;
  if (puzzle.version === 2) return <CrosswordView {...{ session, selected, onSelect, check, showErrors, onVisible }} />;
  const cells: ReactNode[] = [];
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const key = `${x}-${y}`;
      if (y < 5 && y % 2 === 0 && x < 5 && x % 2 === 0) {
        const index = y / 2 * 3 + x / 2;
        const given = puzzle.givens[index] !== null;
        const isSelected = selected === index;
        const related = selected !== null && (Math.floor(selected / 3) === Math.floor(index / 3) || selected % 3 === index % 3);
        const error = showErrors && (check?.equations[Math.floor(index / 3)] === 'invalid' || check?.equations[3 + index % 3] === 'invalid');
        const name = `Zeile ${Math.floor(index / 3) + 1}, Spalte ${index % 3 + 1}${given ? ', vorgegeben' : ''}, ${board[index] === null ? 'leer' : board[index]}`;
        cells.push(<button key={key} data-cell={index} className={`number-cell ${given ? 'given' : 'editable'} ${isSelected ? 'selected' : ''} ${related && !isSelected ? 'related' : ''} ${error ? 'error' : ''}`} aria-label={name} aria-pressed={isSelected} disabled={given || session.completed} onClick={() => onSelect(index)}>
          {board[index] !== null ? <span className="number-value">{board[index]}</span> : <span className="empty-cell" aria-hidden="true">·</span>}
          {given && <span className="given-mark" aria-hidden="true" />}
        </button>);
      } else if (y < 5 && y % 2 === 0 && (x === 1 || x === 3)) {
        cells.push(<span className="operator" key={key}>{opLabel(puzzle.equations[y / 2].operators[(x - 1) / 2])}</span>);
      } else if ((y === 1 || y === 3) && x < 5 && x % 2 === 0) {
        cells.push(<span className="operator" key={key}>{opLabel(puzzle.equations[3 + x / 2].operators[(y - 1) / 2])}</span>);
      } else if ((x === 5 && y < 5 && y % 2 === 0) || (y === 5 && x < 5 && x % 2 === 0)) {
        cells.push(<span className="equals" key={key}>{y === 5 ? <span className="vertical-equals">=</span> : '='}</span>);
      } else if ((x === 6 && y < 5 && y % 2 === 0) || (y === 6 && x < 5 && x % 2 === 0)) {
        const equation = x === 6 ? y / 2 : 3 + x / 2;
        const status = check?.equations[equation];
        cells.push(<span key={key} className={`result ${status === 'valid' ? 'correct' : ''} ${status === 'invalid' && showErrors ? 'error' : ''}`} aria-label={`${equation < 3 ? 'Zeile' : 'Spalte'} ${equation % 3 + 1}, Ergebnis ${puzzle.equations[equation].target}${status === 'valid' ? ', korrekt' : ''}`}>
          {puzzle.equations[equation].target}{status === 'valid' && <Check className="result-check" size={12} />}
        </span>);
      } else cells.push(<span key={key} aria-hidden="true" />);
    }
  }
  return <div className="puzzle-grid" aria-label="Rechenrätsel mit drei Zeilen und drei Spalten">{cells}</div>;
}

export default function App() {
  const [save, setSave] = useState<Save | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [check, setCheck] = useState<BoardCheck | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [modal, setModal] = useState<'help' | 'settings' | 'stats' | null>(null);
  const [confirm, setConfirm] = useState<Difficulty | null>(null);
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [installHelp, setInstallHelp] = useState(false);
  const [backupError, setBackupError] = useState('');
  const [visibleCells, setVisibleCells] = useState<number[] | null>(null);
  const [solution, setSolution] = useState<{ id: string; values: number[] } | null>(null);
  const [numberPage, setNumberPage] = useState(0);
  const [downloaded, setDownloaded] = useState(downloadedCount());
  const [downloading, setDownloading] = useState(false);
  const gameCard = useRef<HTMLElement>(null);
  const installation = useInstallation(() => setInstallHelp(true));
  const [preferencesReady, setPreferencesReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const saveRef = useRef<Save | null>(null);
  const generating = useRef(0);
  const inputBuffer = useRef('');
  const inputTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const { offlineReady: [offlineReady] } = useRegisterSW({
    onRegisteredSW(url, registration) {
      registrationRef.current = registration;
      void navigator.serviceWorker.register(url, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' }).then(current => {
        registrationRef.current = current; return current.update();
      }).catch(() => {});
    },
  });
  const mode = save?.activeMode ?? 'free';
  const session = mode === 'free' ? save?.session : save?.daily;
  const settings = save?.settings ?? { ...emptySave().settings, ...appearance.initial.preferences };
  const palette = usePaletteLayout(gameCard, !!save, new Set(session?.puzzle.bank ?? []).size);
  const level = levels.find(level => level.id === session?.puzzle.difficulty) ?? levels[0];
  saveRef.current = save;

  useEffect(() => {
    let active = true;
    loadSave().then(value => {
      if (!active) return;
      if (appearance.initial.hasSaved || !value.session && !value.daily) value.settings = { ...value.settings, ...appearance.initial.preferences };
      setPreferencesReady(true);
      if (!value.session) value.session = newSession(value.settings.puzzleSource === 'generator' ? generatedPuzzles[0] : originalPuzzles.find(p => p.difficulty === 'easy')!);
      if (value.activeMode === 'daily' && (!value.daily || value.daily.day !== dailyDate())) value.activeMode = 'free';
      setSave(value);
      const s = value.activeMode === 'daily' ? value.daily : value.session;
      setSelected(s?.puzzle.givens.findIndex(n => n === null) ?? null);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!save) return;
    saveGame(save).then(success => { if (!success) setMessage('Dein Browser kann gerade nicht speichern. Sichere deinen Spielstand über die Einstellungen.'); });
  }, [save]);

  useEffect(() => {
    const preload = () => void preloadOriginals().then(() => setDownloaded(downloadedCount())).catch(() => {});
    preload(); addEventListener('online', preload);
    return () => removeEventListener('online', preload);
  }, []);

  useEffect(() => {
    let active = true;
    setSolution(null); setNumberPage(0);
    if (session?.puzzle.version === 2) {
      const p = session.puzzle;
      engine.solution(p).then(values => { if (active) setSolution({ id: p.id, values }); }).catch(() => { if (active && settings.guided) setMessage('Die Zahlenhilfe konnte nicht geladen werden. Alle Zahlen bleiben verfügbar.'); });
    }
    return () => { active = false; };
  }, [session?.puzzle.id]);

  const visibleKey = visibleCells?.join(',') ?? '';
  useEffect(() => { setNumberPage(0); }, [visibleKey]);

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = appearance.apply(settings, appearance.initial.detected);
      if (appearance.initial.detected.native) void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        const window = getCurrentWindow();
        return Promise.all([window.setTheme(resolved.theme), window.setBackgroundColor(resolved.color)]);
      }).catch(() => {});
    };
    apply(); media.addEventListener('change', apply);
    if (preferencesReady) appearance.persist(settings);
    return () => media.removeEventListener('change', apply);
  }, [settings.uiStyle, settings.theme, settings.glassLevel, settings.fillScreen, settings.reduceMotion, settings.opaque, preferencesReady]);

  useEffect(() => {
    const onOnline = () => setOnline(navigator.onLine);
    addEventListener('online', onOnline); addEventListener('offline', onOnline);
    return () => { removeEventListener('online', onOnline); removeEventListener('offline', onOnline); };
  }, []);

  async function checkForUpdate(manual = false) {
    if (!navigator.onLine) { if (manual) setMessage('Du bist offline. Prüfe das Update mit einer Internetverbindung.'); return; }
    try {
      const registration = registrationRef.current ?? await navigator.serviceWorker.getRegistration();
      await registration?.update();
      if (manual) setMessage('Update-Prüfung abgeschlossen. Eine neue Version wird automatisch geladen; dein Spielstand bleibt erhalten.');
    } catch { if (manual) setMessage('Das Update konnte nicht geprüft werden. Versuche es erneut.'); }
  }
  useEffect(() => {
    const update = () => { if (document.visibilityState === 'visible') void checkForUpdate(); };
    const prepare = (event: MessageEvent) => {
      if (event.data?.type !== 'PWA_UPDATE_PREPARE') return;
      void (async () => saveGame(saveRef.current ?? await loadSave()))().then(success => event.ports[0]?.postMessage(success ? 'saved' : 'failed'));
    };
    navigator.serviceWorker?.addEventListener('message', prepare);
    addEventListener('online', update); addEventListener('focus', update); document.addEventListener('visibilitychange', update);
    const timer = setInterval(update, 60_000);
    return () => { navigator.serviceWorker?.removeEventListener('message', prepare); removeEventListener('online', update); removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); clearInterval(timer); };
  }, []);

  const changeSession = useCallback((change: (s: Session) => Session) => {
    setSave(value => {
      if (!value) return value;
      const key = value.activeMode === 'free' ? 'session' : 'daily';
      return value[key] ? { ...value, [key]: change(value[key]!) } : value;
    });
  }, []);

  useEffect(() => {
    if (!session || session.completed || paused || busy || modal || installHelp || confirm || hint) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') changeSession(s => ({ ...s, elapsed: s.elapsed + 1 })); }, 1000);
    return () => clearInterval(timer);
  }, [session?.puzzle.id, session?.completed, mode, paused, busy, modal, installHelp, confirm, !!hint, changeSession]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setCheck(null);
    engine.check(session.puzzle, session.board).then(result => {
      if (!active) return;
      setCheck(result);
      if (result.valid && !session.completed) {
        setHint(null);
        setSave(value => {
          if (!value) return value;
          const key = value.activeMode === 'free' ? 'session' : 'daily';
          if (value[key]?.puzzle.id !== session.puzzle.id) return value;
          const oldBest = value.stats.best[session.puzzle.difficulty];
          const solved = [...new Set([...value.stats.solved, session.puzzle.id])].slice(-10000);
          const dailyDates = mode === 'daily' ? [...new Set([...value.stats.dailyDates, session.day ?? dailyDate()])].slice(-10000) : value.stats.dailyDates;
          return { ...value, [key]: { ...value[key]!, completed: true }, stats: { solved, dailyDates, best: { ...value.stats.best, [session.puzzle.difficulty]: oldBest === undefined ? session.elapsed : Math.min(oldBest, session.elapsed) } } };
        });
      }
    }).catch(error => { if (active) setMessage(String(error.message)); });
    return () => { active = false; };
  }, [session?.puzzle.id, JSON.stringify(session?.board)]);

  async function start(difficulty: Difficulty, nextMode: 'free' | 'daily' = 'free') {
    const request = ++generating.current;
    setBusy(true); setMessage(''); setHint(null); setPaused(false); setConfirm(null);
    const seed = nextMode === 'daily' ? dailySeed(dailyDate()) : randomSeed();
    try {
      const useOriginal = nextMode === 'free' && settings.puzzleSource === 'crossmath';
      const puzzle = useOriginal ? await pickOriginal(seed, difficulty, saveRef.current?.stats.solved) : await engine.generate(seed, difficulty);
      if (useOriginal) { await engine.verify(puzzle); setDownloaded(downloadedCount()); }
      if (request !== generating.current) return;
      setSave(value => ({ ...(value ?? emptySave()), activeMode: nextMode, [nextMode === 'free' ? 'session' : 'daily']: newSession(puzzle, nextMode, nextMode === 'daily' ? dailyDate() : null) }));
      setSelected(puzzle.givens.findIndex(n => n === null));
    } catch (error) {
      if (request !== generating.current) return;
      if (nextMode === 'free') {
        const available = generatedPuzzles.filter(p => p.difficulty === difficulty && !saveRef.current?.stats.solved.includes(p.id));
        const pool = available.length ? available : generatedPuzzles.filter(p => p.difficulty === difficulty);
        const puzzle = pool[seed % pool.length];
        if (puzzle) {
          setSave(value => ({ ...(value ?? emptySave()), activeMode: 'free', session: newSession(puzzle) }));
          setSelected(puzzle.givens.findIndex(n => n === null));
          setMessage('Du spielst ein vorab geprüftes Rätsel.');
        } else setMessage(String((error as Error).message));
      } else setMessage('Das Tagesrätsel konnte nicht geladen werden. Bitte versuche es erneut.');
    } finally { if (request === generating.current) setBusy(false); }
  }

  useEffect(() => { if (save && !session && !busy) void start('easy'); }, [save !== null, !!session]);

  function askNew(difficulty: Difficulty) {
    if (busy) return;
    if (session && !session.completed && (session.board.some((n, i) => n !== session.puzzle.givens[i]))) setConfirm(difficulty);
    else void start(difficulty);
  }

  function choose(value: number) {
    if (selected === null || busy || paused) return;
    setHint(null);
    changeSession(s => place(s, selected, value));
  }

  async function showHint() {
    if (!session || session.completed || busy) return;
    const id = session.puzzle.id;
    try {
      const next = await engine.hint(session.puzzle, session.board);
      const current = saveRef.current;
      const s = current?.activeMode === 'free' ? current.session : current?.daily;
      if (s?.puzzle.id !== id || JSON.stringify(s.board) !== JSON.stringify(session.board)) return;
      setHint(next); setSelected(next.cell);
    } catch (error) { setMessage(String((error as Error).message)); }
  }

  function applyHint() {
    if (!hint) return;
    changeSession(s => {
      const board = [...s.board]; board[hint.cell] = hint.value;
      if (hint.clear_cell !== null) board[hint.clear_cell] = null;
      const notes = { ...s.notes }; delete notes[hint.cell];
      return { ...commit(s, board, notes), hints: s.hints + 1 };
    });
    setHint(null);
  }

  async function switchMode(nextMode: 'free' | 'daily') {
    if (!save || busy || (nextMode === mode && (nextMode === 'free' || save.daily?.day === dailyDate()))) return;
    setHint(null); setPaused(false);
    if (nextMode === 'daily' && (!save.daily || save.daily.day !== dailyDate())) { await start('medium', 'daily'); return; }
    const s = nextMode === 'free' ? save.session : save.daily;
    setSave({ ...save, activeMode: nextMode });
    setSelected(s?.puzzle.givens.findIndex(n => n === null) ?? null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!session || modal || installHelp || confirm || hint || paused || busy || session.completed || (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName))) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); changeSession(s => travel(s, e.shiftKey ? 'redo' : 'undo')); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); changeSession(s => travel(s, 'redo')); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); if (selected !== null) changeSession(s => clearCell(s, selected)); return; }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const puzzle = session.puzzle;
        if (puzzle.version === 2) {
          const origin = puzzle.layout.cells[selected ?? 0];
          const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
          const sign = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
          const axis = horizontal ? 'col' : 'row', other = horizontal ? 'row' : 'col';
          const next = puzzle.layout.cells.map((pos, i) => ({ pos, i })).filter(({ pos, i }) => puzzle.givens[i] === null && sign * (pos[axis] - origin[axis]) > 0)
            .sort((a, b) => (Math.abs(a.pos[other] - origin[other]) * 20 + Math.abs(a.pos[axis] - origin[axis])) - (Math.abs(b.pos[other] - origin[other]) * 20 + Math.abs(b.pos[axis] - origin[axis])))[0];
          if (next) setSelected(next.i);
        } else {
          const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -3 : 3;
          let next = selected ?? 0;
          for (let i = 0; i < 9; i++) { next = (next + delta + 9) % 9; if (puzzle.givens[next] === null) { setSelected(next); break; } }
        }
      }
      if (/^[0-9]$/.test(e.key) && selected !== null) {
        e.preventDefault(); inputBuffer.current = (inputBuffer.current + e.key).slice(session.puzzle.version === 2 ? -3 : -2);
        if (inputTimeout.current) clearTimeout(inputTimeout.current);
        const cell = selected;
        const id = session.puzzle.id;
        inputTimeout.current = setTimeout(() => {
          const n = Number(inputBuffer.current); inputBuffer.current = '';
          changeSession(s => s.puzzle.id === id ? place(s, cell, n) : s);
        }, 500);
      }
    }
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [session, selected, modal, installHelp, confirm, hint, paused, busy, changeSession]);

  async function exportSave() {
    if (!save) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `cross-math-${dailyDate()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importSave(file: File) {
    setBackupError('');
    try {
      if (file.size > 1_000_000) throw new Error('Die Datei ist zu groß.');
      const value = parseSave(await file.text());
      for (const s of [value.session, value.daily]) {
        if (!s) continue;
        await engine.verify(s.puzzle).catch(() => { throw new Error('Die Aufgabe hat keine geprüfte eindeutige Lösung mit nachvollziehbarem Lösungsweg.'); });
        const result = await engine.check(s.puzzle, s.board);
        if (!result.inventory_valid || (s.completed && !result.valid)) throw new Error('Der Spielstand enthält ungültige Zahlen.');
      }
      ++generating.current; setBusy(false); setSave(value); setModal(null); setHint(null); setPaused(false);
      const s = value.activeMode === 'free' ? value.session : value.daily;
      setSelected(s?.puzzle.givens.findIndex(n => n === null) ?? null);
      setMessage('Dein Spielstand wurde wiederhergestellt.');
    } catch (error) { setBackupError(String((error as Error).message)); }
    if (fileInput.current) fileInput.current.value = '';
  }

  const updateSetting = (key: keyof Save['settings'], value: string | boolean) => setSave(s => s ? { ...s, settings: { ...s.settings, [key]: value } } : s);
  const remaining = session ? remainingNumbers(session.puzzle, session.board) : new Map<number, number>();
  const filled = session ? session.board.filter((n, i) => n !== null && session.puzzle.givens[i] === null).length : 0;
  const total = session?.puzzle.bank.length ?? 0;
  const guided = settings.guided && session?.puzzle.version === 2 && solution?.id === session.puzzle.id && visibleCells !== null && !settings.showAllNumbers;
  const areaNumbers = guided ? guidedNumbers(session.puzzle as CrosswordPuzzle, session.board, solution.values, visibleCells) : remaining;
  const bankNumbers = guided ? [...areaNumbers.keys()].sort((a, b) => a - b) : [...new Set(session?.puzzle.bank ?? [])].sort((a, b) => a - b);
  const { columns: bankColumns, pageSize, tile: bankTile, gap: bankGap } = palette;
  const pages = Math.max(1, Math.ceil(bankNumbers.length / pageSize));
  const bankRows = Math.max(1, Math.ceil(Math.min(palette.side ? bankNumbers.length : Math.max(8, new Set(session?.puzzle.bank ?? []).size), pageSize) / bankColumns));
  const bankHeight = bankRows * bankTile + (bankRows - 1) * bankGap;
  const currentPage = Math.min(numberPage, pages - 1);
  const shownNumbers = bankNumbers.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const canDelete = session && selected !== null && session.puzzle.givens[selected] === null && session.board[selected] !== null && !session.completed && !busy && !paused;

  return <div className="app-shell">
    <div className="ambient" aria-hidden="true"><div className="orb orb-one" /><div className="orb orb-two" /><div className="orb orb-three" /></div>
    <header className="app-header">
      <a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="Cross Math"><img className="brand-icon" src={`${import.meta.env.BASE_URL}icon.svg`} width="38" height="38" alt="" /><span>cross<span className="brand-light">math</span><span className="brand-dot">.</span></span></a>
      <div className="header-right">{installation.visible && <button className="install-button glass" aria-label="App installieren" title="App installieren" disabled={installation.pending} onClick={() => void installation.install()}><Download size={18} /><span>Installieren</span></button>}
        <div className="header-tools glass"><button className="icon-button" aria-label="Statistik" title="Statistik" onClick={() => setModal('stats')}><Trophy size={19} /></button><button className="icon-button" aria-label="Spielregeln" title="Spielregeln" onClick={() => setModal('help')}><CircleHelp size={20} /></button><button className="icon-button" aria-label="Einstellungen" title="Einstellungen" onClick={() => setModal('settings')}><Settings2 size={20} /></button></div>
      </div>
    </header>

    <main>
      <section className="game-controls">
        <div className="mode-switch glass" aria-label="Spielmodus"><button aria-pressed={mode === 'free'} className={mode === 'free' ? 'active' : ''} disabled={busy} onClick={() => void switchMode('free')}><Sparkles size={16} />Freies Spiel</button><button aria-pressed={mode === 'daily'} className={mode === 'daily' ? 'active' : ''} disabled={busy} onClick={() => void switchMode('daily')}><CalendarDays size={16} />Tagesrätsel</button></div>
        <div className="difficulty-switch glass" aria-label="Schwierigkeit">{levels.map(item => <button key={item.id} aria-pressed={level.id === item.id} className={level.id === item.id ? 'active' : ''} disabled={busy || mode === 'daily'} onClick={() => askNew(item.id)}>{item.label}</button>)}</div>
      </section>

      {message && <div className="notice glass" role="status"><span>{message}</span><button className="icon-button" aria-label="Meldung schließen" onClick={() => setMessage('')}><X size={17} /></button></div>}

      <div className="play-layout">
        <section ref={gameCard} data-puzzle-id={session?.puzzle.id} data-puzzle-source={session?.puzzle.version === 2 && session.puzzle.source ? 'crossmath' : 'generator'} className={`game-card ${session?.completed ? 'solved' : ''}`} aria-label="Spielbereich">
          <div className="game-heading"><div className="game-title"><span className="level-dot" /><span>{mode === 'daily' ? `Tagesrätsel · ${dayLabel(session?.day ?? dailyDate())}` : 'Rätsel'}</span><span className="level-tag">{level.label}</span></div><div className="game-clock">{settings.showTimer && <><Clock3 size={15} /><span>{timeLabel(session?.elapsed ?? 0)}</span></>}<button className="icon-button" aria-label={paused ? 'Fortsetzen' : 'Pause'} disabled={!session || session.completed} onClick={() => setPaused(v => !v)}>{paused ? <Play size={15} /> : <Pause size={15} />}</button></div></div>
          <div className="board-area">
            {session && !paused && !busy && <Board onVisible={setVisibleCells} session={session} selected={selected} onSelect={cell => { setSelected(cell); setHint(null); }} check={check} showErrors={settings.checkErrors} />}
            {(!session || busy) && <div className="board-state"><div className="loading-cross">✦</div><p>Rätsel wird geladen …</p></div>}
            {paused && !busy && <div className="board-state"><span className="pause-symbol"><Pause size={32} /></span><h2>Spiel pausiert</h2><button className="primary-button" onClick={() => setPaused(false)}>Spiel fortsetzen <Play size={16} /></button></div>}
          </div>
          <div className="board-footer"><span className="board-rule">{session?.completed ? <strong role="status">Rätsel gelöst.</strong> : session?.puzzle.version === 1 ? <button className="legacy-upgrade" onClick={() => askNew(level.id)}>Altes Rätsel · Neues Brett starten</button> : 'Feld wählen · Zahl einsetzen'}</span><div className="equation-progress" aria-label={`${check?.equations.filter(s => s === 'valid').length ?? 0} von ${session?.puzzle.equations.length ?? 0} Gleichungen erfüllt`}>{session?.puzzle.equations.map((_, i) => <span className={check?.equations[i] === 'valid' ? 'done' : ''} key={i} />)}</div></div>
          <section className="numbers-card glass">
            <div className="side-heading"><span className="eyebrow">{guided ? 'ZAHLEN FÜR DIESEN BEREICH' : 'VERFÜGBARE ZAHLEN'}</span><span className="number-counter">{total - filled}<span> / {total}</span></span></div>
            {session?.puzzle.version === 2 && <div className="bank-options"><button aria-pressed={settings.guided} onClick={() => { updateSetting('guided', !settings.guided); updateSetting('showAllNumbers', false); setNumberPage(0); }}>Geführt {settings.guided ? 'an' : 'aus'}</button>{settings.guided && <button aria-pressed={settings.showAllNumbers} onClick={() => { updateSetting('showAllNumbers', !settings.showAllNumbers); setNumberPage(0); }}>{settings.showAllNumbers ? 'Bereichszahlen' : 'Alle Zahlen'}</button>}</div>}
            <div className="number-bank" style={{ minHeight: bankHeight }} aria-label="Verfügbare Zahlen">{shownNumbers.map(n => {
              const count = remaining.get(n) ?? 0;
              const chosen = selected !== null && session?.board[selected] === n;
              const displayCount = guided ? Math.min(count, areaNumbers.get(n) ?? 0) : count;
              return <button key={n} data-number={n} className={`bank-number ${chosen ? 'chosen' : ''}`} disabled={count <= 0 || selected === null || session?.completed || busy || paused} aria-label={`Zahl ${n}, ${displayCount} verfügbar`} onClick={() => choose(n)}>{n}{displayCount > 1 && <span className="tile-count">×{displayCount}</span>}{count === 0 && <Check size={14} className="used-check" />}</button>;
            })}{guided && !bankNumbers.length && <p className="area-finished" role="status">Bereich gelöst. Wähle den nächsten Bereich.</p>}</div>
            {pages > 1 && <div className="bank-pages"><button aria-label="Vorherige Zahlen" disabled={currentPage === 0} onClick={() => setNumberPage(currentPage - 1)}>←</button><span>{currentPage + 1} / {pages}</span><button aria-label="Weitere Zahlen" disabled={currentPage === pages - 1} onClick={() => setNumberPage(currentPage + 1)}>→</button></div>}
          </section>
          <div className="game-toolbar"><div className="history-buttons"><button className="tool-button" aria-label="Rückgängig" disabled={!session?.undo.length || session.completed || busy || paused} onClick={() => { changeSession(s => travel(s, 'undo')); setHint(null); }}><Undo2 size={20} /></button><button className="tool-button" aria-label="Wiederholen" disabled={!session?.redo.length || session.completed || busy || paused} onClick={() => { changeSession(s => travel(s, 'redo')); setHint(null); }}><Redo2 size={20} /></button><span className="toolbar-divider" /><button className={`tool-button delete-button ${canDelete ? 'delete-active' : ''}`} aria-label="Zahl entfernen" disabled={!canDelete} onClick={() => { if (selected !== null) changeSession(s => clearCell(s, selected)); setHint(null); }}><Eraser size={20} /></button></div>

            <button className="hint-button" disabled={!session || session.completed || busy || paused} onClick={() => void showHint()}><Lightbulb size={17} />Hinweis</button>
            <button className="new-game-button" aria-label={mode === 'daily' ? 'Zum freien Spiel' : 'Neues Rätsel'} title="Neues Rätsel" disabled={busy} onClick={() => { if (mode === 'daily') void switchMode('free'); else askNew(level.id); }}><span>{mode === 'daily' ? 'Zum freien Spiel' : 'Neues Rätsel'}</span><ArrowRight size={18} /></button>
          </div>
        </section>
      </div>


    </main>

    {hint && <Modal title="Hinweis" onClose={() => setHint(null)}><p className="modal-copy hint-explanation" role="status">{hint.explanation}</p><button className="primary-button full-width" onClick={applyHint}>Zahl einsetzen <ArrowRight size={16} /></button></Modal>}
    {confirm && <Modal title="Ein neues Rätsel?" onClose={() => setConfirm(null)}><p className="modal-copy">Damit beendest du dein aktuelles freies Rätsel. Deine gelösten Rätsel und Statistiken bleiben gespeichert.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setConfirm(null)}>Weiterspielen</button><button className="primary-button" onClick={() => void start(confirm)}>Neues Rätsel <ArrowRight size={16} /></button></div></Modal>}
    {modal === 'help' && <Modal title="Spielregeln" onClose={() => setModal(null)}><p className="modal-copy">Fülle die freien Zahlenfelder so, dass jede waagrechte und senkrechte Gleichung stimmt.</p><ol className="rule-list"><li><span>1</span><div><strong>Feld auswählen und Zahl einsetzen.</strong><p>Tippe ein freies Feld an und wähle eine Zahl aus deinem Vorrat. Jede Kachel wird einmal benutzt.</p></div></li><li><span>2</span><div><strong>Zeilen und Spalten prüfen.</strong><p>An Kreuzungen gilt dieselbe Zahl für beide Gleichungen. Ergebnisse können ebenfalls freie Felder sein.</p></div></li><li><span>3</span><div><strong>Punkt vor Strich.</strong><p>Multiplikation und Division kommen vor Addition und Subtraktion. Gleichrangige Zeichen rechnest du von links nach rechts.</p><div className="math-example">2 + 3 × 4 = <strong>14</strong></div></div></li></ol><p className="modal-copy">Wähle einen Bereich über die Übersicht oder die Pfeile. Im geführten Modus wird der Vorrat für den Bereich begrenzt. Er enthält zusätzliche Auswahlzahlen, damit du selbst rechnest. „Alle Zahlen“ zeigt den gesamten Vorrat. Wische nach links oder rechts, um den Bereich zu wechseln. Auf kleinen Bildschirmen können verknüpfte Felder in mehreren Rechnungen erscheinen; Änderungen gelten für alle.</p><p className="keyboard-help">Tastatur: Pfeile wählen ein Feld · Zahlen eingeben · Entf entfernen · Strg/⌘ Z zurück. Das Tagesrätsel wechselt um 00:00 UTC.</p><button className="primary-button full-width" onClick={() => setModal(null)}>Verstanden <Check size={17} /></button></Modal>}
    {modal === 'settings' && <Modal title="Einstellungen" onClose={() => setModal(null)}>
      <AppearanceSettings settings={settings} onChange={value => setSave(s => s ? { ...s, settings: { ...s.settings, ...value } } : s)} />
      <h3 className="settings-section-title">Spiel</h3>
      <div className="setting-group source-group"><span className="eyebrow">AUFGABEN IM FREIEN SPIEL</span><div className="theme-switch glass"><button aria-pressed={settings.puzzleSource === 'crossmath'} className={settings.puzzleSource === 'crossmath' ? 'active' : ''} onClick={() => updateSetting('puzzleSource', 'crossmath')}>Originalaufgaben</button><button aria-pressed={settings.puzzleSource === 'generator'} className={settings.puzzleSource === 'generator' ? 'active' : ''} onClick={() => updateSetting('puzzleSource', 'generator')}>Generator</button></div><p className="source-copy">Die Auswahl gilt ab dem nächsten freien Rätsel.</p></div>
      <label className="setting-row"><span><strong>Geführter Modus</strong><small>Begrenzt den Zahlenvorrat für den Bereich. Zusätzliche Auswahlzahlen bleiben enthalten.</small></span><input type="checkbox" checked={settings.guided} onChange={e => updateSetting('guided', e.target.checked)} /><span className="toggle" aria-hidden="true" /></label>
      <div className="download-section"><p>{downloaded} / {originalCount} Aufgaben geladen.</p><button className="secondary-button" disabled={downloading || !online || downloaded === originalCount} onClick={() => {
        setDownloading(true);
        void downloadOriginals(setDownloaded).then(() => setMessage('Alle Aufgaben sind für die Offline-Nutzung geladen.')).catch(() => setMessage('Der Download wurde unterbrochen. Bereits geladene Aufgaben bleiben verfügbar.')).finally(() => setDownloading(false));
      }}><Download size={16} />{downloading ? 'Aufgaben werden geladen …' : 'Alle Aufgaben herunterladen'}</button></div>
      <Toggle title="Zeit anzeigen" detail="Die verstrichene Spielzeit anzeigen." checked={settings.showTimer} onChange={value => updateSetting('showTimer', value)} />
      <Toggle title="Fehler direkt anzeigen" detail="Falsche vollständige Gleichungen markieren." checked={settings.checkErrors} onChange={value => updateSetting('checkErrors', value)} />
      <div className="backup-section"><span className="eyebrow">SPIELSTAND</span><p>Exportiere deinen Spielstand, um ihn zu sichern oder auf einem anderen Gerät wiederherzustellen.</p><div className="backup-buttons"><button className="secondary-button" onClick={() => void exportSave()}><Download size={16} />Sichern</button><button className="secondary-button" onClick={() => fileInput.current?.click()}><Upload size={16} />Wiederherstellen</button></div>{backupError && <p className="backup-error" role="alert">{backupError}</p>}<input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void importSave(file); }} /></div>
      <div className="source-attribution"><strong>CrossMath · {originalCount} geprüfte Originalaufgaben</strong><p>Yige Xu, Yongjie Wang, Zizhuo Wu, Kaisong Song, Jun Lin und Zhiqi Shen. Aufgaben unverändert; Darstellung technisch in das App-Format übertragen.</p><p><a href={originalSource.url} target="_blank" rel="noreferrer">Datensatz</a> · <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/" target="_blank" rel="noreferrer">CC BY-NC-ND 4.0</a></p></div>
      <div className="app-info"><p><span className="status-dot" />{online ? 'Online' : 'Offline'} · {offlineReady ? 'App offline bereit' : 'Spielstand lokal gespeichert'}</p></div>
      <div className="app-version"><span>Version {__BUILD_REVISION__.slice(0, 7)}</span><button className="secondary-button" onClick={() => void checkForUpdate(true)}>Update prüfen</button></div>
      </Modal>}
    {modal === 'stats' && <Modal title="Statistik" onClose={() => setModal(null)}><div className="stats-total"><Trophy size={28} /><strong>{save?.stats.solved.length ?? 0}</strong><span>gelöste Rätsel</span></div><div className="stat-rows">{levels.map(item => <div key={item.id}><span>{item.label}</span><span>{save?.stats.best[item.id] !== undefined ? timeLabel(save.stats.best[item.id]!) : 'Keine Zeit gespeichert'}<small>Beste Zeit</small></span></div>)}</div><div className="stats-daily"><CalendarDays size={20} /><span><strong>{save?.stats.dailyDates.length ?? 0} Tagesrätsel gelöst</strong><small>Neues Tagesrätsel täglich um 00:00 UTC.</small></span></div></Modal>}
    {installHelp && <Modal title="App installieren" onClose={() => setInstallHelp(false)}><ol className="install-instructions">{installation.instructions.map(step => <li key={step}>{step}</li>)}</ol>{installation.error && <p className="backup-error" role="alert">{installation.error}</p>}<div className="help-footer"><WifiOff size={20} /><p>Nach dem ersten Laden kannst du auch ohne Internet neue Rätsel spielen.</p></div><button className="primary-button full-width" onClick={() => setInstallHelp(false)}>Verstanden <Check size={17} /></button></Modal>}
  </div>;
}

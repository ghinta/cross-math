import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, Check, CheckCheck, CircleHelp, Clock3, Download, Eraser, Lightbulb, Moon, Pause, Pencil, Play, Plus, Redo2, Settings2, Sparkles, Sun, Trophy, Undo2, Upload, WifiOff, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import type { Check as BoardCheck, Difficulty, Hint, Puzzle, Save, Session } from './types';
import { dailyDate, dailySeed, engine, randomSeed } from './engine';
import { clearCell, commit, newSession, place, remainingNumbers, toggleNote, travel } from './game';
import { emptySave, loadSave, parseSave, saveGame } from './storage';
import catalog from './data/puzzles.json';

const levels: { id: Difficulty; label: string; detail: string }[] = [
  { id: 'easy', label: 'Leicht', detail: 'Vier freie Felder. Addition und Subtraktion mit Zahlen bis 12.' },
  { id: 'medium', label: 'Mittel', detail: 'Sechs freie Felder. Alle vier Rechenarten mit Zahlen bis 20.' },
  { id: 'hard', label: 'Schwer', detail: 'Acht freie Felder. Alle vier Rechenarten mit Zahlen bis 30.' },
];
const opLabel = (op: string) => op === '*' ? '×' : op === '/' ? '÷' : op === '-' ? '−' : op;
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
const dayLabel = (date = dailyDate()) => new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog ref={dialog} className="modal glass" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Schließen" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}

function Board({ session, selected, onSelect, check, showErrors }: { session: Session; selected: number | null; onSelect: (cell: number) => void; check: BoardCheck | null; showErrors: boolean }) {
  const { puzzle, board, notes } = session;
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
          {board[index] !== null ? <span className="number-value">{board[index]}</span> : notes[index]?.length ? <span className="cell-notes">{notes[index].join(' · ')}</span> : <span className="empty-cell" aria-hidden="true">·</span>}
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
  const [noting, setNoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [check, setCheck] = useState<BoardCheck | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [modal, setModal] = useState<'help' | 'settings' | 'stats' | null>(null);
  const [confirm, setConfirm] = useState<Difficulty | null>(null);
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<(Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [backupError, setBackupError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const saveRef = useRef<Save | null>(null);
  const generating = useRef(0);
  const inputBuffer = useRef('');
  const inputTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { offlineReady: [offlineReady], needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const mode = save?.activeMode ?? 'free';
  const session = mode === 'free' ? save?.session : save?.daily;
  const settings = save?.settings ?? emptySave().settings;
  const level = levels.find(level => level.id === session?.puzzle.difficulty) ?? levels[0];
  saveRef.current = save;

  useEffect(() => {
    let active = true;
    loadSave().then(value => {
      if (!active) return;
      if (!value.session && catalog.length) value.session = newSession((catalog as Puzzle[])[0]);
      if (value.activeMode === 'daily' && (!value.daily || value.daily.puzzle.seed !== dailySeed(dailyDate()))) value.activeMode = 'free';
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
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = settings.theme === 'system' ? media.matches ? 'dark' : 'light' : settings.theme; };
    apply(); media.addEventListener('change', apply);
    document.documentElement.dataset.motion = settings.reduceMotion ? 'reduced' : 'normal';
    document.documentElement.dataset.glass = settings.opaque ? 'opaque' : 'clear';
    return () => media.removeEventListener('change', apply);
  }, [settings.theme, settings.reduceMotion, settings.opaque]);

  useEffect(() => {
    const onOnline = () => setOnline(navigator.onLine);
    const onInstall = (e: Event) => { e.preventDefault(); setInstallPrompt(e as typeof installPrompt); };
    addEventListener('online', onOnline); addEventListener('offline', onOnline); addEventListener('beforeinstallprompt', onInstall);
    return () => { removeEventListener('online', onOnline); removeEventListener('offline', onOnline); removeEventListener('beforeinstallprompt', onInstall); };
  }, []);

  const changeSession = useCallback((change: (s: Session) => Session) => {
    setSave(value => {
      if (!value) return value;
      const key = value.activeMode === 'free' ? 'session' : 'daily';
      return value[key] ? { ...value, [key]: change(value[key]!) } : value;
    });
  }, []);

  useEffect(() => {
    if (!session || session.completed || paused || busy || modal || confirm) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') changeSession(s => ({ ...s, elapsed: s.elapsed + 1 })); }, 1000);
    return () => clearInterval(timer);
  }, [session?.puzzle.id, session?.completed, mode, paused, busy, modal, confirm, changeSession]);

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
      const puzzle = await engine.generate(seed, difficulty);
      if (request !== generating.current) return;
      setSave(value => ({ ...(value ?? emptySave()), activeMode: nextMode, [nextMode === 'free' ? 'session' : 'daily']: newSession(puzzle, nextMode, nextMode === 'daily' ? dailyDate() : null) }));
      setSelected(puzzle.givens.findIndex(n => n === null)); setNoting(false);
    } catch (error) {
      if (request !== generating.current) return;
      if (nextMode === 'free') {
        const available = (catalog as Puzzle[]).filter(p => p.difficulty === difficulty && !saveRef.current?.stats.solved.includes(p.id));
        const pool = available.length ? available : (catalog as Puzzle[]).filter(p => p.difficulty === difficulty);
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
    if (session && !session.completed && (session.board.some((n, i) => n !== session.puzzle.givens[i]) || Object.keys(session.notes).length)) setConfirm(difficulty);
    else void start(difficulty);
  }

  function choose(value: number) {
    if (selected === null || busy || paused) return;
    setHint(null);
    changeSession(s => noting ? toggleNote(s, selected, value) : place(s, selected, value));
  }

  async function showHint() {
    if (!session || session.completed || busy) return;
    const id = session.puzzle.id;
    try {
      const next = await engine.hint(session.puzzle, session.board);
      const current = saveRef.current;
      const s = current?.activeMode === 'free' ? current.session : current?.daily;
      if (s?.puzzle.id !== id || JSON.stringify(s.board) !== JSON.stringify(session.board)) return;
      setHint(next); setSelected(next.cell); setNoting(false);
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
    setHint(null); setPaused(false); setNoting(false);
    if (nextMode === 'daily' && (!save.daily || save.daily.puzzle.seed !== dailySeed(dailyDate()))) { await start('medium', 'daily'); return; }
    const s = nextMode === 'free' ? save.session : save.daily;
    setSave({ ...save, activeMode: nextMode });
    setSelected(s?.puzzle.givens.findIndex(n => n === null) ?? null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!session || modal || confirm || paused || busy || session.completed || (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName))) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); changeSession(s => travel(s, e.shiftKey ? 'redo' : 'undo')); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); changeSession(s => travel(s, 'redo')); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); if (selected !== null) changeSession(s => clearCell(s, selected)); return; }
      if (e.key.toLowerCase() === 'n') { setNoting(value => !value); return; }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -3 : 3;
        let next = selected ?? 0;
        for (let i = 0; i < 9; i++) { next = (next + delta + 9) % 9; if (session.puzzle.givens[next] === null) { setSelected(next); break; } }
      }
      if (/^[0-9]$/.test(e.key) && selected !== null) {
        e.preventDefault(); inputBuffer.current = (inputBuffer.current + e.key).slice(-2);
        if (inputTimeout.current) clearTimeout(inputTimeout.current);
        const cell = selected;
        const id = session.puzzle.id;
        inputTimeout.current = setTimeout(() => {
          const n = Number(inputBuffer.current); inputBuffer.current = '';
          changeSession(s => s.puzzle.id === id ? noting ? toggleNote(s, cell, n) : place(s, cell, n) : s);
        }, 500);
      }
    }
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [session, selected, noting, modal, confirm, paused, busy, changeSession]);

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
  const isStandalone = matchMedia('(display-mode: standalone)').matches;

  return <div className="app-shell">
    <div className="ambient" aria-hidden="true"><div className="orb orb-one" /><div className="orb orb-two" /><div className="orb orb-three" /></div>
    <header className="app-header">
      <a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="Cross Math"><div className="brand-icon glass"><span>+</span><span>×</span><span>÷</span><span>−</span></div><span>cross<span className="brand-light">math</span><span className="brand-dot">.</span></span></a>
      <div className="header-right"><span className="privacy-label"><span className="status-dot" />{online ? 'Online' : 'Du spielst offline.'}</span>
        <div className="header-tools glass"><button className="icon-button" aria-label="Statistik" title="Statistik" onClick={() => setModal('stats')}><Trophy size={19} /></button><button className="icon-button" aria-label="Spielregeln" title="Spielregeln" onClick={() => setModal('help')}><CircleHelp size={20} /></button><button className="icon-button" aria-label="Einstellungen" title="Einstellungen" onClick={() => setModal('settings')}><Settings2 size={20} /></button></div>
      </div>
    </header>

    <main>
      <section className="intro"><p className="game-instructions">Wähle ein freies Feld und setze eine Zahl ein.</p>
        <div className="mode-switch glass" aria-label="Spielmodus"><button aria-pressed={mode === 'free'} className={mode === 'free' ? 'active' : ''} disabled={busy} onClick={() => void switchMode('free')}><Sparkles size={17} />Freies Spiel</button><button aria-pressed={mode === 'daily'} className={mode === 'daily' ? 'active' : ''} disabled={busy} onClick={() => void switchMode('daily')}><CalendarDays size={17} />Tagesrätsel</button></div>
      </section>

      {message && <div className="notice glass" role="status"><span>{message}</span><button className="icon-button" aria-label="Meldung schließen" onClick={() => setMessage('')}><X size={17} /></button></div>}

      <div className="play-layout">
        <section className={`game-card ${session?.completed ? 'solved' : ''}`} aria-label="Spielbereich">
          <div className="game-heading"><div className="game-title"><span className="level-dot" /><span>{mode === 'daily' ? `${dayLabel(session?.day ?? dailyDate())} · Tagesrätsel` : 'Rätsel'}</span><span className="level-tag">{level.label}</span></div><div className="game-clock">{settings.showTimer && <><Clock3 size={15} /><span>{timeLabel(session?.elapsed ?? 0)}</span></>}<button className="icon-button" aria-label={paused ? 'Fortsetzen' : 'Pause'} disabled={!session || session.completed} onClick={() => setPaused(v => !v)}>{paused ? <Play size={15} /> : <Pause size={15} />}</button></div></div>
          <div className="board-area">
            {session && !paused && !busy && <Board session={session} selected={selected} onSelect={cell => { setSelected(cell); setHint(null); }} check={check} showErrors={settings.checkErrors} />}
            {(!session || busy) && <div className="board-state"><div className="loading-cross">✦</div><p>Rätsel wird erzeugt …</p></div>}
            {paused && !busy && <div className="board-state"><span className="pause-symbol"><Pause size={32} /></span><h2>Spiel pausiert</h2><button className="primary-button" onClick={() => setPaused(false)}>Spiel fortsetzen <Play size={16} /></button></div>}
          </div>
          <div className="board-footer"><div className="board-rule"><span className="rule-symbol">× ÷</span><span>Punkt vor Strich</span></div><div className="equation-progress" aria-label={`${check?.equations.filter(s => s === 'valid').length ?? 0} von 6 Gleichungen erfüllt`}>{Array.from({ length: 6 }, (_, i) => <span className={check?.equations[i] === 'valid' ? 'done' : ''} key={i} />)}</div></div>
          <div className="game-toolbar"><div className="history-buttons"><button className="tool-button" aria-label="Rückgängig" disabled={!session?.undo.length || session.completed || busy || paused} onClick={() => { changeSession(s => travel(s, 'undo')); setHint(null); }}><Undo2 size={20} /></button><button className="tool-button" aria-label="Wiederholen" disabled={!session?.redo.length || session.completed || busy || paused} onClick={() => { changeSession(s => travel(s, 'redo')); setHint(null); }}><Redo2 size={20} /></button><span className="toolbar-divider" /><button className="tool-button" aria-label="Zahl entfernen" disabled={!session || selected === null || (!session.board[selected] && !session.notes[selected]?.length) || session.completed || busy || paused} onClick={() => { if (selected !== null) changeSession(s => clearCell(s, selected)); setHint(null); }}><Eraser size={20} /></button></div>
            <button className={`text-tool ${noting ? 'active' : ''}`} aria-pressed={noting} disabled={session?.completed || busy || paused} onClick={() => setNoting(v => !v)}><Pencil size={17} />Notizen<span className="key-hint">N</span></button>
            <button className="hint-button" disabled={!session || session.completed || busy || paused} onClick={() => void showHint()}><Lightbulb size={17} />Hinweis</button>
          </div>
        </section>

        <aside className="side-panel">
          <section className="numbers-card glass">
            <div className="side-heading"><span className="eyebrow">{noting ? 'NOTIZEN' : 'VERFÜGBARE ZAHLEN'}</span><span className="number-counter">{total - filled}<span> / {total}</span></span></div>
            <p className="side-copy">{session?.completed ? 'Starte mit „Neues Rätsel“ das nächste Spiel.' : noting ? 'Markiere mögliche Zahlen im gewählten Feld.' : 'Wähle eine Zahl für das markierte Feld.'}</p>
            <div className="number-bank" aria-label="Verfügbare Zahlen">{[...new Set(session?.puzzle.bank ?? [])].map(n => {
              const count = remaining.get(n) ?? 0;
              const chosen = selected !== null && session?.board[selected] === n;
              return <button key={n} data-number={n} className={`bank-number ${chosen ? 'chosen' : ''}`} disabled={count <= 0 || selected === null || session?.completed || busy || paused} aria-label={`Zahl ${n}, ${count} verfügbar`} onClick={() => choose(n)}>{n}{count > 1 && <span className="tile-count">×{count}</span>}{count === 0 && <Check size={14} className="used-check" />}</button>;
            })}</div>
            <div className="fill-progress"><div style={{ width: `${total ? filled / total * 100 : 0}%` }} /></div><div className="progress-caption"><span>{session?.completed ? 'Alle Felder ausgefüllt' : 'Ausgefüllte Felder'}</span><span>{total ? Math.round(filled / total * 100) : 0}%</span></div>
            {session?.completed && <div className="completion" role="status"><span className="completion-icon"><CheckCheck size={24} /></span><div><strong>Rätsel gelöst.</strong><p>{timeLabel(session.elapsed)} · {session.hints === 0 ? '0 Hinweise' : `${session.hints} ${session.hints === 1 ? 'Hinweis' : 'Hinweise'}`}</p></div></div>}
            {hint && <div className="hint-content" role="status"><div><Lightbulb size={18} /><strong>Hinweis</strong></div><p>{hint.explanation}</p><button className="inline-button" onClick={applyHint}>Zahl einsetzen <ArrowRight size={15} /></button></div>}
          </section>

          <section className="difficulty-section"><div className="section-label"><span className="eyebrow">SCHWIERIGKEIT</span>{mode === 'daily' && <span>Im Tagesrätsel festgelegt</span>}</div><div className="difficulty-switch glass">{levels.map(item => <button key={item.id} aria-pressed={level.id === item.id} className={level.id === item.id ? 'active' : ''} disabled={busy || mode === 'daily'} onClick={() => askNew(item.id)}>{item.label}</button>)}</div><p className="difficulty-copy">{level.detail}</p></section>
          <button className="new-game-button glass" disabled={busy} onClick={() => { if (mode === 'daily') void switchMode('free'); else askNew(level.id); }}><span>{mode === 'daily' ? 'Zum freien Spiel' : 'Neues Rätsel'}</span><span className="new-game-arrow"><ArrowRight size={20} /></span></button>
        </aside>
      </div>

    </main>

    <footer className="app-footer"><div><span className="footer-status"><span className="status-dot" />{offlineReady ? 'Auch offline bereit' : !online ? 'Offline' : 'Lokal gespeichert'}</span>{!isStandalone && <button className="footer-link" onClick={async () => { if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); } else setInstallHelp(true); }}><Plus size={14} />App installieren</button>}</div></footer>

    {needRefresh && <div className="update-toast glass" role="status"><span>Eine neue Version ist bereit. Dein Spielstand bleibt erhalten.</span><button onClick={() => void saveGame(save ?? emptySave()).then(() => updateServiceWorker(true))}>Jetzt aktualisieren <ArrowRight size={14} /></button></div>}

    {confirm && <Modal title="Ein neues Rätsel?" onClose={() => setConfirm(null)}><p className="modal-copy">Damit beendest du dein aktuelles freies Rätsel. Deine gelösten Rätsel und Statistiken bleiben gespeichert.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setConfirm(null)}>Weiterspielen</button><button className="primary-button" onClick={() => void start(confirm)}>Neues Rätsel <ArrowRight size={16} /></button></div></Modal>}
    {modal === 'help' && <Modal title="Spielregeln" onClose={() => setModal(null)}><p className="modal-copy">Fülle die freien Felder so, dass jede Zeile und jede Spalte das angegebene Ergebnis ergibt.</p><ol className="rule-list"><li><span>1</span><div><strong>Feld auswählen und Zahl einsetzen.</strong><p>Tippe ein freies Feld an und wähle eine Zahl aus deinem Vorrat. Jede Kachel wird einmal benutzt.</p></div></li><li><span>2</span><div><strong>Zeilen und Spalten prüfen.</strong><p>Jedes Feld gehört zu einer Zeile und einer Spalte. Beide Gleichungen müssen stimmen.</p></div></li><li><span>3</span><div><strong>Punkt vor Strich.</strong><p>Multiplikation und Division kommen vor Addition und Subtraktion. Gleichrangige Zeichen rechnest du von links nach rechts.</p><div className="math-example">2 + 3 × 4 = <strong>14</strong></div></div></li></ol><div className="help-footer"><Pencil size={17} /><p>Aktiviere Notizen, um mögliche Zahlen im ausgewählten Feld zu markieren.</p></div><p className="keyboard-help">Tastatur: Pfeile wählen ein Feld · Zahlen eingeben · Entf entfernen · N Notizen · Strg/⌘ Z zurück. Das Tagesrätsel wechselt um 00:00 UTC.</p><button className="primary-button full-width" onClick={() => setModal(null)}>Schließen <Check size={17} /></button></Modal>}
    {modal === 'settings' && <Modal title="Einstellungen" onClose={() => setModal(null)}><div className="setting-group"><span className="eyebrow">ERSCHEINUNGSBILD</span><div className="theme-switch glass">{([{ value: 'light', label: 'Hell', icon: Sun }, { value: 'dark', label: 'Dunkel', icon: Moon }, { value: 'system', label: 'System', icon: Settings2 }] as const).map(({ value, label, icon: Icon }) => <button key={value} className={settings.theme === value ? 'active' : ''} aria-pressed={settings.theme === value} onClick={() => updateSetting('theme', value)}><Icon size={17} />{label}</button>)}</div></div>
      <div className="setting-toggles">{([{ key: 'reduceMotion', title: 'Weniger Bewegung', text: 'Animationen und Übergänge deaktivieren.' }, { key: 'opaque', title: 'Weniger Transparenz', text: 'Glaseffekte reduzieren und den Kontrast erhöhen.' }, { key: 'showTimer', title: 'Zeit anzeigen', text: 'Die verstrichene Spielzeit anzeigen.' }, { key: 'checkErrors', title: 'Fehler direkt anzeigen', text: 'Falsche vollständige Gleichungen markieren.' }] as const).map(item => <label className="setting-row" key={item.key}><span><strong>{item.title}</strong><small>{item.text}</small></span><input type="checkbox" checked={settings[item.key]} onChange={e => updateSetting(item.key, e.target.checked)} /><span className="toggle" aria-hidden="true" /></label>)}</div>
      <div className="backup-section"><span className="eyebrow">SPIELSTAND</span><p>Exportiere deinen Spielstand, um ihn zu sichern oder auf einem anderen Gerät wiederherzustellen.</p><div className="backup-buttons"><button className="secondary-button" onClick={() => void exportSave()}><Download size={16} />Sichern</button><button className="secondary-button" onClick={() => fileInput.current?.click()}><Upload size={16} />Wiederherstellen</button></div>{backupError && <p className="backup-error" role="alert">{backupError}</p>}<input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void importSave(file); }} /></div></Modal>}
    {modal === 'stats' && <Modal title="Statistik" onClose={() => setModal(null)}><div className="stats-total"><Trophy size={28} /><strong>{save?.stats.solved.length ?? 0}</strong><span>gelöste Rätsel</span></div><div className="stat-rows">{levels.map(item => <div key={item.id}><span>{item.label}</span><span>{save?.stats.best[item.id] !== undefined ? timeLabel(save.stats.best[item.id]!) : 'Keine Zeit gespeichert'}<small>Beste Zeit</small></span></div>)}</div><div className="stats-daily"><CalendarDays size={20} /><span><strong>{save?.stats.dailyDates.length ?? 0} Tagesrätsel gelöst</strong><small>Neues Tagesrätsel täglich um 00:00 UTC.</small></span></div></Modal>}
    {installHelp && <Modal title="App installieren" onClose={() => setInstallHelp(false)}><p className="modal-copy">Öffne das Menü deines Browsers und wähle „App installieren“ oder „Zum Home-Bildschirm hinzufügen“. Auf dem iPhone findest du die Option im Teilen-Menü.</p><div className="help-footer"><WifiOff size={20} /><p>Nach dem ersten Laden kannst du auch ohne Internet neue Rätsel spielen.</p></div><button className="primary-button full-width" onClick={() => setInstallHelp(false)}>Verstanden <Check size={17} /></button></Modal>}
  </div>;
}

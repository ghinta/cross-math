import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Expand, Focus } from 'lucide-react';
import type { Check, CrosswordPuzzle, Session } from './types';
import { tilePixels, tileSpan, wholeBoard, workAreas, type WorkArea } from './workareas';

const symbol = (op: string) => op === '*' ? '×' : op === '/' ? '÷' : op === '-' ? '−' : op;
interface Props { session: Session; selected: number | null; onSelect: (cell: number) => void; check: Check | null; showErrors: boolean; onVisible: (cells: number[] | null) => void }

function Grid({ session, selected, onSelect, check, showErrors, area, compact }: Omit<Props, 'onVisible'> & { area: WorkArea; compact: boolean }) {
  const p = session.puzzle as CrosswordPuzzle;
  const tiles = new Map<string, ReactNode>();
  const positions = compact ? area.equations.flatMap((eq, row) => p.equations[eq].cells.map((index, col) => ({ index, row: row * 2, col: col * 2 })))
    : area.cells.map(index => ({ index, row: p.layout.cells[index].row - area.top, col: p.layout.cells[index].col - area.left }));
  const shared = compact ? area.cells.filter(cell => positions.filter(pos => pos.index === cell).length > 1) : [];
  for (const { index, row, col } of positions) {
    const given = p.givens[index] !== null;
    const eqs = p.equations.map((eq, i) => eq.cells.includes(index) ? i : -1).filter(i => i >= 0);
    const related = selected !== null && eqs.some(i => p.equations[i].cells.includes(selected));
    const error = showErrors && eqs.some(i => check?.equations[i] === 'invalid');
    const correct = eqs.every(i => check?.equations[i] === 'valid');
    const original = p.layout.cells[index];
    tiles.set(`${row},${col}`, <button key={`${row},${col}`} data-cell={index} data-digits={String(session.board[index] ?? '').length} className={`number-cell ${given ? 'given' : 'editable'} ${selected === index ? 'selected' : related ? 'related' : ''} ${error ? 'error' : ''} ${correct ? 'correct' : ''}`} aria-label={`Zeile ${original.row + 1}, Spalte ${original.col + 1}${given ? ', vorgegeben' : ''}, ${session.board[index] ?? 'leer'}`} aria-pressed={selected === index} disabled={given || session.completed} onClick={() => onSelect(index)}>
      {session.board[index] !== null ? <span className="number-value">{session.board[index]}</span> : <span className="empty-cell" aria-hidden="true">·</span>}
      {shared.includes(index) && <span className="linked-mark" aria-hidden="true">{String.fromCharCode(65 + shared.indexOf(index))}</span>}
    </button>);
  }
  for (const [row, i] of area.equations.entries()) {
    const eq = p.equations[i], [a, b] = compact ? [{ row: row * 2, col: 0 }, { row: row * 2, col: 2 }] : eq.cells.map(c => positions.find(pos => pos.index === c)!);
    const vertical = a.col === b.col;
    for (const offset of [1, 3]) {
      const key = `${a.row + (vertical ? offset : 0)},${a.col + (vertical ? 0 : offset)}`;
      tiles.set(key, <span key={key} className={`cross-symbol ${check?.equations[i] === 'valid' ? 'correct' : ''} ${showErrors && check?.equations[i] === 'invalid' ? 'error' : ''}`} aria-hidden="true">{offset === 1 ? symbol(eq.operator) : <span className={vertical ? 'vertical-equals' : ''}>=</span>}</span>);
    }
  }
  const rows = compact ? area.equations.length * 2 - 1 : area.rows, cols = compact ? 5 : area.cols;
  const units = (n: number) => (n + 1) / 2 + (n - 1) / 2 * .45;
  const style = { '--cols': cols, '--rows': rows, '--units-x': units(cols), '--ratio': units(cols) / units(rows), aspectRatio: `${units(cols)}/${units(rows)}`,
    gridTemplateColumns: Array.from({ length: cols }, (_, i) => `${i % 2 ? .45 : 1}fr`).join(' '), gridTemplateRows: Array.from({ length: rows }, (_, i) => `${i % 2 ? .45 : 1}fr`).join(' ') } as CSSProperties;
  return <div className={`puzzle-grid crossword-grid ${compact ? 'linked-equations' : ''}`} data-equations={area.equations.length} style={style} aria-label={`Arbeitsbereich mit ${area.equations.length} vollständigen Gleichungen`}>{Array.from({ length: rows * cols }, (_, i) => {
    const key = `${Math.floor(i / cols)},${i % cols}`;
    return tiles.get(key) ?? <span key={key} aria-hidden="true" />;
  })}</div>;
}

function MapBoard({ session, area, selected, onChoose, small = false }: { session: Session; area: WorkArea; selected: number | null; onChoose?: (cell: number) => void; small?: boolean }) {
  const p = session.puzzle as CrosswordPuzzle;
  return <svg className={small ? 'mini-board' : 'overview-board'} viewBox={`-.6 -.6 ${p.layout.cols + .2} ${p.layout.rows + .2}`} aria-hidden={small || !onChoose ? true : undefined} role={onChoose ? 'img' : undefined} aria-label={onChoose ? 'Gesamtes Brett. Tippe einen Bereich an, um ihn zu vergrößern.' : undefined}
    onClick={onChoose ? e => {
      const svg = e.currentTarget, point = svg.createSVGPoint(); point.x = e.clientX; point.y = e.clientY;
      const local = point.matrixTransform(svg.getScreenCTM()!.inverse());
      const nearest = p.layout.cells.map((pos, i) => ({ i, distance: Math.hypot(pos.col - local.x, pos.row - local.y) })).sort((a, b) => a.distance - b.distance)[0];
      onChoose(nearest.i);
    } : undefined}>
    {p.equations.map((eq, i) => { const [a, , c] = eq.cells.map(i => p.layout.cells[i]), vertical = a.col === c.col; return <g key={i}><line x1={a.col} y1={a.row} x2={c.col} y2={c.row} className={area.equations.includes(i) ? 'map-active' : ''} />{!small && [1, 3].map(offset => <text key={offset} x={a.col + (vertical ? 0 : offset)} y={a.row + (vertical ? offset : 0) + .14}>{offset === 1 ? symbol(eq.operator) : '='}</text>)}</g>; })}
    {p.layout.cells.map(({ row, col }, i) => <g key={i}><rect x={col - .42} y={row - .42} width=".84" height=".84" rx=".16" className={`${area.cells.includes(i) ? 'map-active' : ''} ${selected === i ? 'map-selected' : ''} ${session.board[i] !== null ? 'map-filled' : ''}`} />{!small && <text x={col} y={row + .14}>{session.board[i] ?? '·'}</text>}</g>)}
  </svg>;
}

export default function CrosswordView(props: Props) {
  const { session, selected, onSelect, check, onVisible } = props;
  const p = session.puzzle as CrosswordPuzzle;
  const content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 280, height: 200 });
  const [overview, setOverview] = useState(false);
  const [focusArea, setFocusArea] = useState(false);
  const [current, setCurrent] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const swipe = useRef<{ id: number; x: number; y: number; time: number; multi: boolean } | null>(null);
  const suppressClickUntil = useRef(0);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  const regions = useMemo(() => workAreas(p, tileSpan(size.height), tileSpan(size.width)), [p, size.width, size.height]);
  const whole = useMemo(() => wholeBoard(p), [p]);
  const wholeFits = size.width >= 500 && tilePixels(whole.rows) <= size.height && tilePixels(whole.cols) <= size.width;
  const areas = useMemo(() => wholeFits && !focusArea ? [whole] : regions, [wholeFits, focusArea, whole, regions]);
  const active = areas[Math.min(current, areas.length - 1)];
  useEffect(() => { setCurrent(0); setOverview(false); setFocusArea(false); }, [p.id]);
  useEffect(() => {
    if (selected !== null && !active.cells.includes(selected)) {
      const match = areas.findIndex(a => a.cells.includes(selected));
      if (match >= 0) setCurrent(match);
    }
  }, [selected, areas]);
  useEffect(() => { onVisible(overview ? null : active.cells); }, [overview, active, onVisible]);
  const compact = tilePixels(active.rows) > size.height || tilePixels(active.cols) > size.width;
  function chooseArea(index: number, preferred?: number, list = areas) {
    setCurrent(index); setOverview(false);
    const area = list[index];
    const cell = preferred !== undefined && p.givens[preferred] === null ? preferred : area.cells.find(i => p.givens[i] === null && session.board[i] === null) ?? area.cells.find(i => p.givens[i] === null);
    if (cell !== undefined) onSelect(cell);
  }
  function next() {
    for (let offset = 1; offset <= areas.length; offset++) {
      const index = (current + offset) % areas.length;
      if (areas[index].equations.some(i => check?.equations[i] !== 'valid')) { chooseArea(index); return; }
    }
    chooseArea((current + 1) % areas.length);
  }
  return <div className="crossword-view" data-view={overview ? 'overview' : 'detail'} data-area={Math.min(current, areas.length - 1)} onClickCapture={e => {
    if (performance.now() < suppressClickUntil.current && (e.target as HTMLElement).closest('.board-content')) { e.preventDefault(); e.stopPropagation(); }
  }}>
    <nav className="view-tools" aria-label="Brettansicht">
      <button className="overview-button" aria-label={overview ? 'Zum Arbeitsbereich' : 'Brettübersicht öffnen'} onClick={() => setOverview(v => !v)}><MapBoard {...{ session, selected }} area={active} small /><span>{overview ? <Focus size={15} /> : <Expand size={15} />}{overview ? 'Detail' : 'Übersicht'}</span></button>
      <span className="area-counter" aria-live="polite">{wholeFits && !focusArea ? 'Ganzes Brett' : `Bereich ${Math.min(current, areas.length - 1) + 1} / ${areas.length}`}{compact && <small>Gleiche Felder sind verknüpft</small>}</span>
      <div className="area-buttons">{wholeFits && <button className="view-mode-button" onClick={() => { setFocusArea(v => !v); setOverview(false); setCurrent(0); }}>{focusArea ? 'Ganzes Brett' : 'Bereiche'}</button>}<button aria-label="Vorheriger Bereich" disabled={areas.length === 1} onClick={() => chooseArea((current - 1 + areas.length) % areas.length)}><ChevronLeft size={19} /></button><button aria-label="Nächster Bereich" disabled={areas.length === 1} onClick={next}><ChevronRight size={19} /></button></div>
    </nav>
    <div className="board-content" ref={content} onPointerDown={e => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 1) swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, time: performance.now(), multi: false };
      if (pointers.current.size === 2) { if (swipe.current) swipe.current.multi = true; const [a, b] = [...pointers.current.values()]; pinch.current = Math.hypot(a.x - b.x, a.y - b.y); }
    }} onPointerMove={e => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current && pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()], scale = Math.hypot(a.x - b.x, a.y - b.y) / pinch.current;
        if (scale > 1.2) { setOverview(false); pinch.current = null; suppressClickUntil.current = performance.now() + 250; }
        if (scale < .8) { setOverview(true); pinch.current = null; suppressClickUntil.current = performance.now() + 250; }
      }
    }} onPointerUp={e => {
      const start = swipe.current, dx = start ? e.clientX - start.x : 0, dy = start ? e.clientY - start.y : 0;
      if (start?.id === e.pointerId && !start.multi && !overview && areas.length > 1 && performance.now() - start.time < 1000 && Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5 && start.x > 18 && start.x < innerWidth - 18) {
        suppressClickUntil.current = performance.now() + 250;
        if (dx < 0) next(); else chooseArea((current - 1 + areas.length) % areas.length);
        e.preventDefault();
      }
      pointers.current.delete(e.pointerId); pinch.current = null;
      if (!pointers.current.size) swipe.current = null;
    }} onPointerCancel={e => { pointers.current.delete(e.pointerId); pinch.current = null; if (swipe.current) swipe.current.multi = true; }}>
      {overview ? <div className="puzzle-grid overview-grid"><MapBoard {...{ session, selected }} area={active} onChoose={cell => { const index = regions.findIndex(a => a.cells.includes(cell)); setFocusArea(true); chooseArea(index, cell, regions); }} /></div> : <Grid {...props} area={active} compact={compact} />}
    </div>
  </div>;
}

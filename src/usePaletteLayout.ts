import { useEffect, useState, type RefObject } from 'react';

// Capacity follows the allocated panel and actual control sizes. It is based on
// the complete stock so placing a tile cannot resize the board or change pages.
export function usePaletteLayout(card: RefObject<HTMLElement | null>, ready: boolean, stockSize: number) {
  const [layout, setLayout] = useState({ columns: 5, pageSize: 10, tile: 34, gap: 5, side: false });
  useEffect(() => {
    const element = card.current, panel = element?.querySelector<HTMLElement>('.numbers-card');
    if (!element || !panel) return;
    const measure = () => {
      const style = getComputedStyle(panel);
      const value = (name: string, fallback: number) => parseFloat(style.getPropertyValue(name)) || fallback;
      const columns = value('--bank-columns', 5), tile = value('--bank-tile', 34), gap = value('--bank-gap', 5);
      const side = style.getPropertyValue('--palette-side').trim() === '1';
      let pageSize = columns * 2;
      if (side) {
        const headings = ['.side-heading', '.bank-options'].reduce((sum, selector) => {
          const child = panel.querySelector<HTMLElement>(selector);
          if (!child) return sum;
          const box = getComputedStyle(child);
          return sum + child.getBoundingClientRect().height + parseFloat(box.marginTop) + parseFloat(box.marginBottom);
        }, 0);
        const bank = panel.querySelector<HTMLElement>('.number-bank');
        const chrome = ['.game-heading', '.game-toolbar'].reduce((sum, selector) => sum + (element.querySelector(selector)?.getBoundingClientRect().height ?? 0), 0);
        const available = element.clientHeight - chrome - parseFloat(style.marginTop) - parseFloat(style.marginBottom) - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - headings - (bank ? parseFloat(getComputedStyle(bank).marginTop) : 14);
        const capacity = (height: number) => Math.max(columns, Math.floor((height + gap) / (tile + gap)) * columns);
        pageSize = stockSize <= capacity(available) ? capacity(available) : capacity(available - 36);
      }
      const next = { columns, pageSize, tile, gap, side };
      setLayout(old => Object.keys(next).every(key => old[key as keyof typeof old] === next[key as keyof typeof next]) ? old : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element); observer.observe(panel);
    panel.querySelectorAll('.side-heading, .bank-options').forEach(el => observer.observe(el));
    measure();
    return () => observer.disconnect();
  }, [card, ready, stockSize]);
  return layout;
}

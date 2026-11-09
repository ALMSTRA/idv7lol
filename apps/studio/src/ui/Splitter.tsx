export type Pane = 'left' | 'right' | 'bottom';

const KEY = 'idv7lol.studio.panes';
const LIMITS: Record<Pane, [number, number]> = {
  left: [180, 420],
  right: [240, 480],
  bottom: [120, 520],
};
const DEFAULTS: Record<Pane, number> = { left: 240, right: 300, bottom: 240 };

const sizes = { ...DEFAULTS };

function apply(pane: Pane, size: number): void {
  const [min, max] = LIMITS[pane];
  sizes[pane] = Math.round(Math.min(max, Math.max(min, size)));
  document.documentElement.style.setProperty(`--pane-${pane}`, `${sizes[pane]}px`);
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sizes));
  } catch {
    /* sizes reset next time */
  }
}

/** Put the panels back at the sizes the user left them. */
export function restorePanes(): void {
  let saved: Partial<Record<Pane, number>> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as typeof saved;
  } catch {
    /* defaults */
  }
  for (const pane of Object.keys(DEFAULTS) as Pane[]) apply(pane, saved[pane] ?? DEFAULTS[pane]);
}

/**
 * Drag handle between panels. It writes a CSS variable directly, so resizing
 * never re-renders the panels.
 */
export function Splitter({ pane }: { pane: Pane }): JSX.Element {
  const vertical = pane !== 'bottom';
  const direction = pane === 'left' ? 1 : -1;
  return (
    <div
      className={`splitter ${pane}`}
      role="separator"
      tabIndex={0}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuenow={sizes[pane]}
      onDoubleClick={() => {
        apply(pane, DEFAULTS[pane]);
        save();
      }}
      onKeyDown={(e) => {
        const grow = vertical
          ? e.key === 'ArrowRight'
            ? direction
            : e.key === 'ArrowLeft'
              ? -direction
              : 0
          : e.key === 'ArrowUp'
            ? 1
            : e.key === 'ArrowDown'
              ? -1
              : 0;
        if (!grow) return;
        e.preventDefault();
        e.stopPropagation();
        apply(pane, sizes[pane] + grow * 16);
        save();
      }}
      onPointerDown={(e) => {
        const el = e.currentTarget;
        const start = vertical ? e.clientX : e.clientY;
        const from = sizes[pane];
        el.setPointerCapture(e.pointerId);
        el.classList.add('dragging');
        const move = (ev: PointerEvent) => {
          const delta = (vertical ? ev.clientX : ev.clientY) - start;
          apply(pane, from + delta * (vertical ? direction : -1));
        };
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
          el.classList.remove('dragging');
          save();
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      }}
    />
  );
}

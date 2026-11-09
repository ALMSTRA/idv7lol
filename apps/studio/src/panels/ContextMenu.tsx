import { Check } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useUiStore, type MenuItem } from '../store/ui.js';

function MenuList({
  items,
  x,
  y,
  level,
}: {
  items: MenuItem[];
  x: number;
  y: number;
  level: number;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const close = useUiStore((s) => s.closeMenu);
  const [pos, setPos] = useState({ x, y });
  const [open, setOpen] = useState<number | null>(null);
  const [subAt, setSubAt] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(-1);

  // Keep the menu on screen, whatever its size.
  useLayoutEffect(() => {
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    const margin = 6;
    const nx =
      x + r.width > innerWidth - margin
        ? level
          ? x - r.width - 190
          : innerWidth - r.width - margin
        : x;
    const ny =
      y + r.height > innerHeight - margin ? Math.max(margin, innerHeight - r.height - margin) : y;
    setPos({ x: Math.max(margin, nx), y: ny });
    if (level === 0) el.focus();
  }, [x, y, level]);

  const enabled = items
    .map((it, i) => (!it.separator && !it.disabled ? i : -1))
    .filter((i) => i >= 0);
  const run = (it: MenuItem) => {
    if (it.disabled || it.items) return;
    close();
    it.onSelect?.();
  };
  const showSub = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setSubAt({ x: r.right - 2, y: r.top - 4 });
    setOpen(i);
  };
  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const at = enabled.indexOf(active);
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setActive(enabled[(at + dir + enabled.length) % enabled.length] ?? -1);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      const it = items[active]!;
      if (it.items) {
        const el = ref.current!.children[active] as HTMLElement;
        showSub(active, el);
      } else run(it);
    } else if (e.key === 'ArrowRight' && active >= 0 && items[active]!.items) {
      showSub(active, ref.current!.children[active] as HTMLElement);
    } else if (e.key === 'ArrowLeft') setOpen(null);
  };

  return (
    <>
      <div
        ref={ref}
        className="ctx"
        role="menu"
        tabIndex={-1}
        style={{ left: pos.x, top: pos.y }}
        onKeyDown={onKey}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((it, i) =>
          it.separator ? (
            <hr key={i} />
          ) : (
            <button
              key={i}
              role="menuitem"
              tabIndex={-1}
              disabled={it.disabled}
              aria-haspopup={it.items ? 'menu' : undefined}
              className={`${it.danger ? 'danger' : ''} ${active === i || open === i ? 'on' : ''}`}
              onPointerEnter={(e) => {
                setActive(i);
                if (it.items && !it.disabled) showSub(i, e.currentTarget);
                else setOpen(null);
              }}
              onClick={() => run(it)}
            >
              <span className="ctx-check">{it.checked ? <Check size={13} /> : null}</span>
              <span className="ctx-label">{it.label}</span>
              {it.shortcut && <kbd>{it.shortcut}</kbd>}
              {it.items && <span className="ctx-more">›</span>}
            </button>
          ),
        )}
      </div>
      {open !== null && items[open]?.items && (
        <MenuList items={items[open]!.items!} x={subAt.x} y={subAt.y} level={level + 1} />
      )}
    </>
  );
}

export function ContextMenu(): JSX.Element | null {
  const menu = useUiStore((s) => s.menu);
  const close = useUiStore((s) => s.closeMenu);

  useEffect(() => {
    if (!menu) return;
    const outside = (e: Event) => {
      if (!(e.target as Element | null)?.closest?.('.ctx')) close();
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('wheel', outside, { capture: true, passive: true });
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('wheel', outside, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [menu, close]);

  return menu ? (
    <MenuList key={menu.key} items={menu.items} x={menu.x} y={menu.y} level={0} />
  ) : null;
}

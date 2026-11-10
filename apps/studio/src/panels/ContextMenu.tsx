import { Check } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useUiStore, type MenuItem } from '../store/ui.js';

function MenuList({
  items,
  x,
  y,
  level,
  keyboard = false,
  onBack,
}: {
  items: MenuItem[];
  x: number;
  y: number;
  level: number;
  /** Opened from the keyboard: take the focus and start on the first item. */
  keyboard?: boolean;
  /** Close this submenu and give the focus back to its parent. */
  onBack?: () => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const close = useUiStore((s) => s.closeMenu);
  const [pos, setPos] = useState({ x, y });
  const [open, setOpen] = useState<number | null>(null);
  const [subAt, setSubAt] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(-1);
  const [subByKey, setSubByKey] = useState(false);

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
    if (level === 0 || keyboard) el.focus();
  }, [x, y, level, keyboard]);

  const enabled = items
    .map((it, i) => (!it.separator && !it.disabled ? i : -1))
    .filter((i) => i >= 0);
  const run = (it: MenuItem) => {
    if (it.disabled || it.items) return;
    close();
    it.onSelect?.();
  };
  const showSub = (i: number, el: HTMLElement, byKey = false) => {
    const r = el.getBoundingClientRect();
    setSubAt({ x: r.right - 2, y: r.top - 4 });
    setSubByKey(byKey);
    setOpen(i);
  };
  // A submenu opened from the keyboard starts on its first item.
  useEffect(() => {
    if (keyboard) setActive(enabled[0] ?? -1);
  }, [keyboard]);
  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const at = enabled.indexOf(active);
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      // Nothing highlighted yet: Down starts at the top, Up at the bottom.
      const next =
        at < 0 ? (dir > 0 ? 0 : enabled.length - 1) : (at + dir + enabled.length) % enabled.length;
      setActive(enabled[next] ?? -1);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      const it = items[active]!;
      if (it.items) {
        const el = ref.current!.children[active] as HTMLElement;
        showSub(active, el, true);
      } else run(it);
    } else if (e.key === 'ArrowRight' && active >= 0 && items[active]!.items) {
      e.preventDefault();
      showSub(active, ref.current!.children[active] as HTMLElement, true);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (onBack) onBack();
      else setOpen(null);
    }
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
        <MenuList
          items={items[open]!.items!}
          x={subAt.x}
          y={subAt.y}
          level={level + 1}
          keyboard={subByKey}
          onBack={() => {
            setOpen(null);
            ref.current?.focus();
          }}
        />
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

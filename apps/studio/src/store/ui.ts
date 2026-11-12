import { create } from 'zustand';
import { systemLang, type Lang } from '../i18n/languages.js';

export type ColorScheme = 'dark' | 'light';
export type RightTab = 'inspector' | 'layers' | 'palettes';
export type BottomTab = 'simulator' | 'validation' | 'timeline' | 'build' | 'console';

export interface LogEntry {
  at: number;
  level: 'info' | 'warning' | 'error';
  text: string;
}

export interface MenuItem {
  label?: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  separator?: boolean;
  items?: MenuItem[];
  onSelect?: () => void;
}

interface UiState {
  busy: string | null;
  toast: { key: number; text: string } | null;
  setBusy(text: string | null): void;
  showToast(text: string): void;
  menu: { key: number; x: number; y: number; items: MenuItem[] } | null;
  openMenu(x: number, y: number, items: MenuItem[]): void;
  closeMenu(): void;
  lang: Lang;
  scheme: ColorScheme;
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  rightTab: RightTab;
  bottomTab: BottomTab;
  showZones: boolean;
  showGrid: boolean;
  snap: boolean;
  gridSize: number;
  showRulers: boolean;
  showBounds: boolean;
  /** Draw the canvas with the car's engine and shaders (WebGL) instead of the editor's renderer. */
  carPreview: boolean;
  /** Manual palette for the preview (null = automatic by driving mode). */
  previewPalette: string | null;
  welcomeOpen: boolean;
  /** Component whose picture is open in the image editor. */
  imageEditorFor: string | null;
  /** Text component being edited in place on the canvas. */
  editingText: string | null;
  log: LogEntry[];
  cursor: { x: number; y: number } | null;

  setLang(lang: Lang): void;
  setScheme(scheme: ColorScheme): void;
  toggle(
    key:
      | 'leftOpen'
      | 'rightOpen'
      | 'bottomOpen'
      | 'showZones'
      | 'showGrid'
      | 'snap'
      | 'showRulers'
      | 'showBounds'
      | 'carPreview',
  ): void;
  setRightTab(tab: RightTab): void;
  setBottomTab(tab: BottomTab): void;
  setPreviewPalette(id: string | null): void;
  setWelcomeOpen(open: boolean): void;
  setImageEditorFor(id: string | null): void;
  setEditingText(id: string | null): void;
  setCursor(c: { x: number; y: number } | null): void;
  logMessage(level: LogEntry['level'], text: string): void;
  clearLog(): void;
}

const PREFS_KEY = 'idv7lol.studio.prefs';

function loadPrefs(): Partial<
  Pick<UiState, 'lang' | 'scheme' | 'showZones' | 'showGrid' | 'snap' | 'gridSize' | 'showRulers'>
> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as Partial<UiState>;
  } catch {
    /* ignore */
  }
  return { lang: systemLang(typeof navigator !== 'undefined' ? navigator.language : undefined) };
}

function savePrefs(s: UiState): void {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        lang: s.lang,
        scheme: s.scheme,
        showZones: s.showZones,
        showGrid: s.showGrid,
        snap: s.snap,
        gridSize: s.gridSize,
        showRulers: s.showRulers,
      }),
    );
  } catch {
    /* ignore */
  }
}

export const useUiStore = create<UiState>((set, get) => {
  const prefs = loadPrefs();
  const persist = () => savePrefs(get());
  return {
    lang: prefs.lang ?? 'en',
    scheme: prefs.scheme ?? 'dark',
    leftOpen: true,
    rightOpen: true,
    bottomOpen: true,
    rightTab: 'inspector',
    bottomTab: 'simulator',
    showZones: prefs.showZones ?? true,
    showGrid: prefs.showGrid ?? true,
    snap: prefs.snap ?? true,
    gridSize: prefs.gridSize ?? 10,
    showRulers: prefs.showRulers ?? true,
    carPreview: false,
    showBounds: false,
    previewPalette: null,
    welcomeOpen: true,
    imageEditorFor: null,
    editingText: null,
    menu: null,
    busy: null,
    toast: null,
    setBusy: (busy) => set({ busy }),
    showToast: (text) => set({ toast: { key: Date.now(), text } }),
    openMenu: (x, y, items) => set({ menu: { key: Date.now(), x, y, items } }),
    closeMenu: () => set({ menu: null }),
    log: [],
    cursor: null,

    setLang: (lang) => {
      set({ lang });
      persist();
    },
    setScheme: (scheme) => {
      set({ scheme });
      document.documentElement.dataset['theme'] = scheme;
      persist();
    },
    toggle: (key) => {
      set({ [key]: !get()[key] } as Partial<UiState>);
      persist();
    },
    setRightTab: (rightTab) => set({ rightTab, rightOpen: true }),
    setBottomTab: (bottomTab) => set({ bottomTab, bottomOpen: true }),
    setPreviewPalette: (previewPalette) => set({ previewPalette }),
    setWelcomeOpen: (welcomeOpen) => set({ welcomeOpen }),
    setImageEditorFor: (imageEditorFor) => set({ imageEditorFor }),
    setEditingText: (editingText) => set({ editingText }),
    setCursor: (cursor) => set({ cursor }),
    logMessage: (level, text) =>
      set({ log: [...get().log.slice(-299), { at: Date.now(), level, text }] }),
    clearLog: () => set({ log: [] }),
  };
});

if (typeof document !== 'undefined')
  document.documentElement.dataset['theme'] = useUiStore.getState().scheme;

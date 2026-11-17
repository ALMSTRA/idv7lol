import { create } from 'zustand';
import { systemLang, type Lang } from '../i18n/languages.js';
import type { FoundUpdate } from '../lib/updater.js';

export type ColorScheme = 'dark' | 'light';
export type RightTab = 'inspector' | 'layers' | 'palettes';
export type BottomTab = 'simulator' | 'validation' | 'timeline' | 'build' | 'console';
/** The classic window shows every panel; the new one goes a step at a time. */
export type StudioView = 'classic' | 'modern';
export type Step = 'design' | 'simulate' | 'validate' | 'car';
export type Rail = 'pieces' | 'layers' | 'images' | 'palettes' | 'animate';

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
  view: StudioView;
  /** The question "classic or new view" is on screen. */
  askView: boolean;
  /** New view: the step on screen and what the left panel holds. */
  step: Step;
  rail: Rail;
  /** Desktop app: look for a newer release when it starts. */
  checkUpdates: boolean;
  /** Install what it finds without asking; otherwise it asks first. */
  autoUpdate: boolean;
  update: FoundUpdate | null;
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
  chooseView(view: StudioView): void;
  setAskView(open: boolean): void;
  setStep(step: Step): void;
  setRail(rail: Rail): void;
  setCheckUpdates(on: boolean): void;
  setAutoUpdate(on: boolean): void;
  setUpdate(update: FoundUpdate | null): void;
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

const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const PREFS_KEY = 'idv7lol.studio.prefs';

function loadPrefs(): Partial<
  Pick<
    UiState,
    | 'lang'
    | 'scheme'
    | 'view'
    | 'checkUpdates'
    | 'autoUpdate'
    | 'showZones'
    | 'showGrid'
    | 'snap'
    | 'gridSize'
    | 'showRulers'
  >
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
        view: s.view,
        checkUpdates: s.checkUpdates,
        autoUpdate: s.autoUpdate,
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
    view: prefs.view === 'classic' ? 'classic' : 'modern',
    // The desktop app asks the first time it runs; the web editor asks every time it opens.
    askView: typeof window !== 'undefined' && (!desktop || !prefs.view),
    step: 'design',
    rail: 'pieces',
    checkUpdates: prefs.checkUpdates ?? true,
    autoUpdate: prefs.autoUpdate ?? false,
    update: null,
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
    chooseView: (view) => {
      set({ view, askView: false });
      persist();
    },
    setAskView: (askView) => set({ askView }),
    setStep: (step) => {
      const tab = get().bottomTab;
      set({
        step,
        bottomTab:
          step === 'validate'
            ? 'validation'
            : step === 'car'
              ? 'build'
              : step === 'simulate' || tab === 'validation' || tab === 'build'
                ? 'simulator'
                : tab,
        ...(step === 'simulate' ? { bottomOpen: true } : {}),
      });
    },
    setRail: (rail) => {
      const s = get();
      // the one already open closes its panel, as a toggle
      if (s.rail === rail && s.leftOpen && rail !== 'animate') return set({ leftOpen: false });
      set({
        rail,
        leftOpen: true,
        ...(rail === 'animate' ? { bottomTab: 'timeline' as const, bottomOpen: true } : {}),
      });
    },
    setCheckUpdates: (checkUpdates) => {
      set({ checkUpdates });
      persist();
    },
    setAutoUpdate: (autoUpdate) => {
      set({ autoUpdate });
      persist();
    },
    setUpdate: (update) => set({ update }),
    toggle: (key) => {
      set({ [key]: !get()[key] } as Partial<UiState>);
      persist();
    },
    // Anything that opens a classic tab also lands on its place in the new view.
    setRightTab: (rightTab) =>
      set({
        rightTab,
        rightOpen: true,
        ...(rightTab === 'inspector' ? {} : { rail: rightTab, step: 'design' as const }),
      }),
    setBottomTab: (bottomTab) =>
      set({
        bottomTab,
        bottomOpen: true,
        step: bottomTab === 'validation' ? 'validate' : bottomTab === 'build' ? 'car' : get().step,
      }),
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

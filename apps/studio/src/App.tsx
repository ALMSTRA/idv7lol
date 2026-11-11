import {
  ChevronDown,
  Cpu,
  Ellipsis,
  ImagePlus,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  Redo2,
  RefreshCw,
  Save,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { parseThemeJson, serializeTheme, type Theme } from '@idv7lol/theme-schema';
import { useProjectStore } from './store/project.js';
import { restorePanes, Splitter } from './ui/Splitter.js';
import { useUiStore, type MenuItem } from './store/ui.js';
import { useSimStore } from './store/sim.js';
import { translate, useT } from './i18n/index.js';
import { perf } from './lib/perf.js';
import { shareBlock, shareTheme } from './lib/share.js';
import { CanvasView, renderToCanvas } from './canvas/CanvasView.js';
import { LibraryPanel } from './panels/LibraryPanel.js';
import { InspectorPanel } from './panels/InspectorPanel.js';
import { LayersPanel } from './panels/LayersPanel.js';
import { PalettePanel } from './panels/PalettePanel.js';
import { SimulatorPanel } from './panels/SimulatorPanel.js';
import { ValidationPanel } from './panels/ValidationPanel.js';
import { TimelinePanel } from './panels/TimelinePanel.js';
import { BuildPanel } from './panels/BuildPanel.js';
import { ConsolePanel } from './panels/ConsolePanel.js';
import { WelcomeDialog } from './panels/WelcomeDialog.js';
import { ImageEditor } from './panels/ImageEditor.js';
import { syncAssets } from './lib/imageStore.js';
import { browseAndPlace } from './lib/imageActions.js';
import { copySelection, cutSelection, pasteFromEvent } from './lib/clipboard.js';
import { ContextMenu } from './panels/ContextMenu.js';
import {
  CursorReadout,
  LayerCount,
  LiveStats,
  Notices,
  ValidateButton,
  ValidationTabBadge,
} from './panels/StatusBits.js';
import { useShallow } from 'zustand/react/shallow';
import { findComponent } from '@idv7lol/theme-engine';
import {
  baseName,
  isTauri,
  openExternal,
  openThemeFile,
  readTextAt,
  rememberRecent,
  savePng,
  saveThemeFile,
} from './host/files.js';

export function App(): JSX.Element {
  useEffect(() => {
    restorePanes();
    // Small windows close the side panels, which then open as drawers. Widening
    // the window again brings back what was open before, not everything.
    const narrow = window.matchMedia('(max-width: 1000px)');
    let wide = { leftOpen: true, rightOpen: true };
    const apply = () => {
      if (narrow.matches) {
        const s = useUiStore.getState();
        wide = { leftOpen: s.leftOpen, rightOpen: s.rightOpen };
        useUiStore.setState({ leftOpen: false, rightOpen: false });
      } else {
        useUiStore.setState(wide);
      }
    };
    if (narrow.matches) apply();
    narrow.addEventListener('change', apply);
    return () => narrow.removeEventListener('change', apply);
  }, []);

  perf.appRenders += 1;
  const t = useT();
  const ui = useUiStore(
    useShallow((s) => ({
      lang: s.lang,
      scheme: s.scheme,
      leftOpen: s.leftOpen,
      rightOpen: s.rightOpen,
      bottomOpen: s.bottomOpen,
      rightTab: s.rightTab,
      bottomTab: s.bottomTab,
      welcomeOpen: s.welcomeOpen,
      logMessage: s.logMessage,
      setWelcomeOpen: s.setWelcomeOpen,
      setBottomTab: s.setBottomTab,
      setRightTab: s.setRightTab,
      setLang: s.setLang,
      setScheme: s.setScheme,
      toggle: s.toggle,
    })),
  );
  const project = useProjectStore(
    useShallow((s) => ({
      dirty: s.dirty,
      filePath: s.filePath,
      past: s.past,
      future: s.future,
      undo: s.undo,
      redo: s.redo,
      loadTheme: s.loadTheme,
      markSaved: s.markSaved,
      newTheme: s.newTheme,
      selectionCount: s.selection.length,
      themeName: s.theme.name,
      assets: s.theme.assets,
      layoutWidth: s.theme.layout.width,
      layoutHeight: s.theme.layout.height,
      display: s.theme.target.display,
    })),
  );
  const running = useSimStore((s) => s.running);
  const [, force] = useState(0);

  const log = ui.logMessage;

  /* ----- file operations ----- */
  const confirmDiscard = useCallback(
    (): boolean => !project.dirty || window.confirm(t('confirm.discard')),
    [project.dirty, t],
  );

  const loadFromText = useCallback(
    (text: string, path: string | null, name: string) => {
      const r = parseThemeJson(text);
      if (!r.ok) {
        log(
          'error',
          `Cannot open ${name}: ${r.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
        );
        window.alert(
          `${name}\n\n${r.issues
            .slice(0, 6)
            .map((i) => `${i.path}: ${i.message}`)
            .join('\n')}`,
        );
        return;
      }
      project.loadTheme(r.theme, path);
      if (path) rememberRecent(path);
      ui.setWelcomeOpen(false);
      log('info', `Opened ${name}`);
    },
    [project, ui, log],
  );

  const doOpen = useCallback(async () => {
    if (!confirmDiscard()) return;
    const f = await openThemeFile();
    if (f) loadFromText(f.text, f.path, f.name);
  }, [confirmDiscard, loadFromText]);

  const doOpenPath = useCallback(
    async (path: string) => {
      if (!confirmDiscard()) return;
      try {
        loadFromText(await readTextAt(path), path, baseName(path));
      } catch (e) {
        log('error', `Cannot read ${path}: ${(e as Error).message}`);
      }
    },
    [confirmDiscard, loadFromText, log],
  );

  const doSave = useCallback(
    async (as = false) => {
      const theme = useProjectStore.getState().theme;
      const text = serializeTheme({
        ...theme,
        meta: { ...theme.meta, createdWith: 'idv7lol Studio', modified: new Date().toISOString() },
      });
      const path = await saveThemeFile(
        text,
        as ? null : useProjectStore.getState().filePath,
        theme.id,
      );
      if (path !== null || !isTauri) {
        project.markSaved(path);
        if (path) rememberRecent(path);
        log('info', `${t('status.saved')}${path ? `: ${path}` : ''}`);
      }
    },
    [project, log, t],
  );

  const doNew = useCallback(
    (template?: Theme) => {
      if (!confirmDiscard()) return;
      project.newTheme(template);
      ui.setWelcomeOpen(false);
    },
    [confirmDiscard, project, ui],
  );

  const doExportPng = useCallback(async () => {
    const canvas = renderToCanvas(useProjectStore.getState().theme, 1);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) await savePng(blob, useProjectStore.getState().theme.id);
  }, []);

  const doShare = useCallback(async () => {
    const { showToast } = useUiStore.getState();
    const say = (key: string, vars?: Record<string, string | number>) =>
      translate(useUiStore.getState().lang, key, vars);
    const theme = useProjectStore.getState().theme;
    const block = shareBlock(theme);
    if (block) {
      showToast(
        block.reason === 'errors'
          ? say('share.needsFix', { n: block.count })
          : block.reason === 'id'
            ? say('share.needsId', { id: block.id })
            : say('share.needsAuthor'),
      );
      return;
    }
    try {
      const canvas = renderToCanvas(theme, 1);
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!png) throw new Error('no picture');
      const names = await shareTheme(theme, png, say('share.pick'));
      if (names) showToast(say('share.saved', { files: names.join(', ') }));
    } catch (e) {
      showToast(say('share.failed', { error: e instanceof Error ? e.message : String(e) }));
    }
  }, []);

  /* ----- launch args (double-clicked file) ----- */
  useEffect(() => {
    if (!isTauri) return;
    (async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const args = await invoke<string[]>('launch_args');
      const file = args.find((a) => /\.(idv7theme|json)$/i.test(a));
      if (file) await doOpenPath(file);
    })().catch(() => undefined);
  }, []);

  /* ----- window title & unload guard ----- */
  useEffect(() => {
    document.title = `${project.dirty ? '• ' : ''}${project.themeName} — idv7lol Studio`;
  }, [project.dirty, project.themeName]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (useProjectStore.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  /* ----- images: keep pixels decoded; Ctrl+V pastes pictures or components ----- */
  useEffect(() => syncAssets(useProjectStore.getState().theme), [project.assets]);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (useUiStore.getState().imageEditorFor) return;
      pasteFromEvent(e);
    };
    // The browser's own menu makes no sense in an app window; text fields keep theirs.
    const onMenu = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      e.preventDefault();
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('contextmenu', onMenu);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('contextmenu', onMenu);
    };
  }, []);

  /* ----- keyboard shortcuts ----- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useUiStore.getState().imageEditorFor) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      const p = useProjectStore.getState();
      // While the welcome window is up, nothing acts on the theme behind it.
      if (useUiStore.getState().welcomeOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          useUiStore.getState().setWelcomeOpen(false);
        } else if (mod && e.key.toLowerCase() === 'o') {
          e.preventDefault();
          void doOpen();
        } else if (e.key === 'F5' || (mod && /^[snrp]$/i.test(e.key))) {
          // Keep the browser's reload, save-page and print from firing behind the window.
          e.preventDefault();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void doSave(e.shiftKey);
        return;
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void doOpen();
        return;
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        useUiStore.getState().setWelcomeOpen(true);
        return;
      }
      if (typing) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) p.redo();
        else p.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        p.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        p.duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'c') {
        copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === 'x') {
        cutSelection();
        return;
      }
      if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
        e.preventDefault();
        const up = e.code === 'BracketRight';
        const dir = e.shiftKey ? (up ? 'top' : 'bottom') : up ? 'up' : 'down';
        p.reorderSelected(dir);
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const comps = p.selection.map((id) => findComponent(p.theme.components, id));
        const locked = comps.every((c) => c?.locked);
        p.selection.forEach((id) =>
          useProjectStore.getState().updateComponent(id, { locked: !locked }),
        );
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        const comps = p.selection.map((id) => findComponent(p.theme.components, id));
        const hidden = comps.every((c) => !c?.visible);
        p.selection.forEach((id) =>
          useProjectStore.getState().updateComponent(id, { visible: hidden }),
        );
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        p.select(p.theme.components.map((c) => c.id));
        return;
      }
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) p.ungroupSelected();
        else p.groupSelected();
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        (window as unknown as { __idv7fit?: () => void }).__idv7fit?.();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (p.selection.length) {
          e.preventDefault();
          p.deleteSelected();
        }
        return;
      }
      const onCanvasOrPage = !target || target === document.body || target.tagName === 'CANVAS';
      if ((e.key === 'Enter' || e.key === 'F2') && onCanvasOrPage && p.selection.length === 1) {
        const c = findComponent(p.theme.components, p.selection[0]!);
        if (c?.type === 'text') {
          e.preventDefault();
          useUiStore.getState().setEditingText(c.id);
          return;
        }
      }
      if (e.key === 'Escape') {
        // In a narrow window, Escape first closes an open drawer.
        const ui = useUiStore.getState();
        if (window.matchMedia('(max-width: 1000px)').matches && (ui.leftOpen || ui.rightOpen)) {
          useUiStore.setState({ leftOpen: false, rightOpen: false });
          return;
        }
        // Inside a group, Escape steps out to the group first.
        if (!p.selectParent()) p.select([]);
        return;
      }
      if (e.key.startsWith('Arrow') && p.selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        p.moveSelected(dx, dy);
        return;
      }
      if (e.key === ' ' && !mod) {
        // space is pan (handled by the canvas); ignore here
        return;
      }
      if (e.key === 'F5') {
        e.preventDefault();
        useSimStore.getState().setRunning(!useSimStore.getState().running);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doSave, doOpen]);

  const openBelow = (e: React.MouseEvent<HTMLElement>, items: MenuItem[]) => {
    const r = e.currentTarget.getBoundingClientRect();
    useUiStore.getState().openMenu(r.left, r.bottom + 4, items);
  };
  const fileMenu = (): MenuItem[] => [
    {
      label: t('menu.new'),
      shortcut: 'Ctrl+N',
      onSelect: () => useUiStore.getState().setWelcomeOpen(true),
    },
    { label: t('menu.open'), shortcut: 'Ctrl+O', onSelect: () => void doOpen() },
    { separator: true },
    { label: t('menu.save'), shortcut: 'Ctrl+S', onSelect: () => void doSave(false) },
    { label: t('menu.saveAs'), shortcut: 'Ctrl+Shift+S', onSelect: () => void doSave(true) },
    { separator: true },
    { label: t('image.add'), onSelect: () => void browseAndPlace() },
    { label: t('menu.export'), onSelect: () => void doExportPng() },
    { separator: true },
    { label: t('menu.share'), onSelect: () => void doShare() },
  ];
  const moreMenu = (): MenuItem[] => [
    {
      label: t('menu.language'),
      items: [
        { label: 'English', checked: ui.lang === 'en', onSelect: () => ui.setLang('en') },
        { label: 'Español', checked: ui.lang === 'es', onSelect: () => ui.setLang('es') },
      ],
    },
    {
      label: t('menu.theme'),
      onSelect: () => ui.setScheme(ui.scheme === 'dark' ? 'light' : 'dark'),
    },
    { separator: true },
    {
      label: t('menu.help'),
      onSelect: () =>
        openExternal('https://github.com/ALMSTRA/idv7lol/blob/main/docs/user/STUDIO_USER_GUIDE.md'),
    },
  ];

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">
          <img src="/logo-mark.png" alt="idv7lol" />
          <span className="brand-name">Studio</span>
        </span>
        <button onClick={(e) => openBelow(e, fileMenu())}>
          {t('menu.file')}
          <ChevronDown size={13} />
        </button>
        <span className="sep" />
        <button
          className="icon"
          onClick={() => void doSave(false)}
          title={`${t('menu.save')} (Ctrl+S)`}
          aria-label={t('menu.save')}
        >
          <Save size={16} />
        </button>
        <button
          className="icon"
          onClick={() => project.undo()}
          disabled={!project.past.length}
          title={`${t('menu.undo')} (Ctrl+Z)`}
          aria-label={t('menu.undo')}
        >
          <Undo2 size={16} />
        </button>
        <button
          className="icon"
          onClick={() => project.redo()}
          disabled={!project.future.length}
          title={`${t('menu.redo')} (Ctrl+Y)`}
          aria-label={t('menu.redo')}
        >
          <Redo2 size={16} />
        </button>
        <span className="sep" />
        <button onClick={() => void browseAndPlace()} title={t('image.add')}>
          <ImagePlus size={16} />
          <span className="lbl">{t('image.add')}</span>
        </button>
        <div className="center">
          <span className="title">
            {project.dirty && <span className="dirty-dot" title={t('status.unsaved')} />}
            {project.filePath ?? project.themeName}
          </span>
        </div>
        <button
          className={running ? 'active' : ''}
          onClick={() => useSimStore.getState().setRunning(!running)}
          title={`${t('menu.simulate')} (F5)`}
        >
          {running ? <Pause size={15} /> : <Play size={15} />}
          <span className="lbl">{t('menu.simulate')}</span>
        </button>
        <ValidateButton />
        <button
          className="primary"
          onClick={() => ui.setBottomTab('build')}
          title={t('menu.build')}
        >
          <Cpu size={15} />
          <span className="lbl">{t('menu.build')}</span>
        </button>
        <span className="sep" />
        <button
          className={`icon ${ui.leftOpen ? 'active' : ''}`}
          onClick={() => ui.toggle('leftOpen')}
          title={t('panels.library')}
          aria-label={t('panels.library')}
        >
          <PanelLeft size={16} />
        </button>
        <button
          className={`icon ${ui.bottomOpen ? 'active' : ''}`}
          onClick={() => ui.toggle('bottomOpen')}
          title={t('panels.simulator')}
          aria-label={t('panels.simulator')}
        >
          <PanelBottom size={16} />
        </button>
        <button
          className={`icon ${ui.rightOpen ? 'active' : ''}`}
          onClick={() => ui.toggle('rightOpen')}
          title={t('panels.inspector')}
          aria-label={t('panels.inspector')}
        >
          <PanelRight size={16} />
        </button>
        <button
          className="icon"
          onClick={(e) => openBelow(e, moreMenu())}
          title={t('menu.more')}
          aria-label={t('menu.more')}
        >
          <Ellipsis size={16} />
        </button>
      </div>

      <div
        className={`workspace ${ui.leftOpen ? '' : 'no-left'} ${ui.rightOpen ? '' : 'no-right'}`}
      >
        <div className="panel">
          <div className="panel-header">{t('panels.library')}</div>
          <LibraryPanel />
        </div>
        <CanvasView />
        {ui.leftOpen && <Splitter pane="left" />}
        {ui.rightOpen && <Splitter pane="right" />}
        <div className="panel right">
          <div className="tabs">
            {(['inspector', 'layers', 'palettes'] as const).map((tab) => (
              <button
                key={tab}
                className={ui.rightTab === tab ? 'active' : ''}
                onClick={() => ui.setRightTab(tab)}
              >
                {t(`panels.${tab}`)}
              </button>
            ))}
          </div>
          <div className="panel-body">
            {ui.rightTab === 'inspector' && <InspectorPanel />}
            {ui.rightTab === 'layers' && <LayersPanel />}
            {ui.rightTab === 'palettes' && <PalettePanel />}
          </div>
        </div>
      </div>

      <div className={`bottom ${ui.bottomOpen ? '' : 'collapsed'}`}>
        {ui.bottomOpen && <Splitter pane="bottom" />}
        <div className="tabs">
          {(['simulator', 'validation', 'timeline', 'build', 'console'] as const).map((tab) => (
            <button
              key={tab}
              className={ui.bottomTab === tab && ui.bottomOpen ? 'active' : ''}
              onClick={() =>
                ui.bottomTab === tab && ui.bottomOpen
                  ? ui.toggle('bottomOpen')
                  : ui.setBottomTab(tab)
              }
            >
              {t(`panels.${tab}`)}
              {tab === 'validation' && <ValidationTabBadge />}
            </button>
          ))}
        </div>
        {ui.bottomOpen && (
          <div className="bottom-body">
            {ui.bottomTab === 'simulator' && <SimulatorPanel />}
            {ui.bottomTab === 'validation' && <ValidationPanel />}
            {ui.bottomTab === 'timeline' && <TimelinePanel />}
            {ui.bottomTab === 'build' && <BuildPanel />}
            {ui.bottomTab === 'console' && <ConsolePanel />}
          </div>
        )}
      </div>

      <div className="statusbar">
        <span>
          <span
            className="dot"
            style={{ background: project.dirty ? 'var(--warning)' : 'var(--success)' }}
          />
          {project.dirty ? t('status.unsaved') : t('status.saved')}
        </span>
        <span>{t('status.selection', { n: project.selectionCount })}</span>
        <CursorReadout />
        <span className="grow" />
        <LayerCount />
        <LiveStats />
        <span className="opt">
          {project.layoutWidth}×{project.layoutHeight} · {project.display}
        </span>
        <button
          className="ghost icon"
          style={{ padding: 0 }}
          onClick={() => force((x) => x + 1)}
          title="refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <ImageEditor />

      <ContextMenu />

      <Notices />

      {ui.welcomeOpen && (
        <WelcomeDialog
          onPick={(th) => doNew(th)}
          onOpen={() => void doOpen()}
          onOpenRecent={(p) => void doOpenPath(p)}
          onClose={() => ui.setWelcomeOpen(false)}
        />
      )}
    </div>
  );
}

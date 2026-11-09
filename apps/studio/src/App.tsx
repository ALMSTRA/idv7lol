import { useCallback, useEffect, useState } from 'react';
import { parseThemeJson, serializeTheme, type Theme } from '@idv7lol/theme-schema';
import { useProjectStore } from './store/project.js';
import { useUiStore } from './store/ui.js';
import { useSimStore } from './store/sim.js';
import { useT } from './i18n/index.js';
import { perf } from './lib/perf.js';
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
        p.selection.forEach((id) => useProjectStore.getState().reorder(id, dir));
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
      if (e.key === 'Escape') {
        p.select([]);
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

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">
          <img src="/icon.png" alt="" />
          idv7lol Studio
        </span>
        <button onClick={() => useUiStore.getState().setWelcomeOpen(true)} title="Ctrl+N">
          {t('menu.new')}
        </button>
        <button onClick={() => void doOpen()} title="Ctrl+O">
          {t('menu.open')}
        </button>
        <button
          onClick={() => void doSave(false)}
          title="Ctrl+S"
          className={project.dirty ? 'primary' : ''}
        >
          {t('menu.save')}
        </button>
        <button onClick={() => void doSave(true)} title="Ctrl+Shift+S">
          {t('menu.saveAs')}
        </button>
        <button onClick={() => void browseAndPlace()}>{t('image.add')}</button>
        <button onClick={() => void doExportPng()}>{t('menu.export')}</button>
        <span className="sep" />
        <button
          className="icon"
          onClick={() => project.undo()}
          disabled={!project.past.length}
          title={`${t('menu.undo')} (Ctrl+Z)`}
        >
          ↶
        </button>
        <button
          className="icon"
          onClick={() => project.redo()}
          disabled={!project.future.length}
          title={`${t('menu.redo')} (Ctrl+Y)`}
        >
          ↷
        </button>
        <span className="sep" />
        <button
          className={running ? 'active' : ''}
          onClick={() => useSimStore.getState().setRunning(!running)}
          title="F5"
        >
          {running ? '❚❚' : '▶'} {t('menu.simulate')}
        </button>
        <ValidateButton />
        <button onClick={() => ui.setBottomTab('build')}>⚙ {t('menu.build')}</button>
        <span className="grow" />
        <span className="title">{project.filePath ?? project.themeName}</span>
        <span className="sep" />
        <select
          value={ui.lang}
          onChange={(e) => ui.setLang(e.target.value as 'en' | 'es')}
          title={t('menu.language')}
          style={{ width: 64 }}
        >
          <option value="en">EN</option>
          <option value="es">ES</option>
        </select>
        <button
          className="icon"
          onClick={() => ui.setScheme(ui.scheme === 'dark' ? 'light' : 'dark')}
          title={t('menu.theme')}
        >
          {ui.scheme === 'dark' ? '☾' : '☀'}
        </button>
        <button
          className="icon"
          onClick={() =>
            openExternal(
              'https://github.com/ALMSTRA/idv7lol/blob/main/docs/user/STUDIO_USER_GUIDE.md',
            )
          }
          title={t('menu.help')}
        >
          ?
        </button>
        <button
          className={`icon ${ui.leftOpen ? 'active' : ''}`}
          onClick={() => ui.toggle('leftOpen')}
          title={t('panels.library')}
        >
          ◧
        </button>
        <button
          className={`icon ${ui.bottomOpen ? 'active' : ''}`}
          onClick={() => ui.toggle('bottomOpen')}
          title={t('panels.simulator')}
        >
          ⬓
        </button>
        <button
          className={`icon ${ui.rightOpen ? 'active' : ''}`}
          onClick={() => ui.toggle('rightOpen')}
          title={t('panels.inspector')}
        >
          ◨
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
        <span>
          {project.layoutWidth}×{project.layoutHeight} · {project.display}
        </span>
        <button
          className="ghost icon"
          style={{ padding: 0 }}
          onClick={() => force((x) => x + 1)}
          title="refresh"
        >
          ↻
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

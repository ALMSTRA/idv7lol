import { useCallback, useEffect, useState } from 'react';
import { parseThemeJson, serializeTheme, type Theme } from '@idv7lol/theme-schema';
import { RENDERER_LIMITS } from '@idv7lol/theme-engine';
import { useProjectStore } from './store/project.js';
import { useUiStore } from './store/ui.js';
import { useSimStore, simulator } from './store/sim.js';
import { useT } from './i18n/index.js';
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
import { useValidation } from './lib/useValidation.js';
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
  const t = useT();
  const ui = useUiStore();
  const project = useProjectStore();
  const report = useValidation();
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
    document.title = `${project.dirty ? '• ' : ''}${project.theme.name} — idv7lol Studio`;
  }, [project.dirty, project.theme.name]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (useProjectStore.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  /* ----- keyboard shortcuts ----- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
        p.copySelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        p.paste();
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

  const errors = report?.errors.length ?? 0;
  const warnings = report?.warnings.length ?? 0;
  const layers = report?.layers ?? 0;

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
        <button onClick={() => ui.setBottomTab('validation')} className={errors ? 'danger' : ''}>
          ✓ {t('menu.validate')}
          {report && (
            <span className={`badge ${errors ? 'error' : warnings ? 'warning' : 'ok'}`}>
              {errors || warnings || '✓'}
            </span>
          )}
        </button>
        <button onClick={() => ui.setBottomTab('build')}>⚙ {t('menu.build')}</button>
        <span className="grow" />
        <span className="title">{project.filePath ?? project.theme.name}</span>
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
              {tab === 'validation' && report && (errors || warnings) ? (
                <span className={`badge ${errors ? 'error' : 'warning'}`}>
                  {errors || warnings}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="bottom-body">
          {ui.bottomTab === 'simulator' && <SimulatorPanel />}
          {ui.bottomTab === 'validation' && <ValidationPanel />}
          {ui.bottomTab === 'timeline' && <TimelinePanel />}
          {ui.bottomTab === 'build' && <BuildPanel />}
          {ui.bottomTab === 'console' && <ConsolePanel />}
        </div>
      </div>

      <div className="statusbar">
        <span>
          <span
            className="dot"
            style={{ background: project.dirty ? 'var(--warning)' : 'var(--success)' }}
          />
          {project.dirty ? t('status.unsaved') : t('status.saved')}
        </span>
        <span>{t('status.selection', { n: project.selection.length })}</span>
        <span>{ui.cursor ? t('status.cursor', { x: ui.cursor.x, y: ui.cursor.y }) : ''}</span>
        <span className="grow" />
        <span>{t('validation.layers', { n: layers, max: RENDERER_LIMITS.layersPerApp })}</span>
        <span>
          {t('sim.health')} {Math.round(simulator.bus.number('system.signal.health', 0))}%
        </span>
        <span>
          {project.theme.layout.width}×{project.theme.layout.height} ·{' '}
          {project.theme.target.display}
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

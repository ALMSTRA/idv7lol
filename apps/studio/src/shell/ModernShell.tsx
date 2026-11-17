import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Ellipsis,
  Image as ImageIcon,
  Layers,
  Palette,
  Redo2,
  Save,
  Shapes,
  SlidersHorizontal,
  Undo2,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '../store/project.js';
import { useSimStore } from '../store/sim.js';
import { useUiStore, type BottomTab, type MenuItem, type Rail, type Step } from '../store/ui.js';
import { useT } from '../i18n/index.js';
import { Splitter } from '../ui/Splitter.js';
import { CanvasView } from '../canvas/CanvasView.js';
import { LibraryPanel } from '../panels/LibraryPanel.js';
import { ImagesPanel } from '../panels/ImagesPanel.js';
import { InspectorPanel } from '../panels/InspectorPanel.js';
import { LayersPanel } from '../panels/LayersPanel.js';
import { PalettePanel } from '../panels/PalettePanel.js';
import { SimulatorPanel } from '../panels/SimulatorPanel.js';
import { ValidationPanel } from '../panels/ValidationPanel.js';
import { TimelinePanel } from '../panels/TimelinePanel.js';
import { BuildPanel } from '../panels/BuildPanel.js';
import { ConsolePanel } from '../panels/ConsolePanel.js';
import { ValidationTabBadge } from '../panels/StatusBits.js';
import { Thumb } from '../panels/WelcomeDialog.js';

const STEPS: Step[] = ['design', 'simulate', 'validate', 'car'];
const RAIL: { id: Rail; icon: typeof Shapes; label: string }[] = [
  { id: 'pieces', icon: Shapes, label: 'rail.pieces' },
  { id: 'layers', icon: Layers, label: 'panels.layers' },
  { id: 'images', icon: ImageIcon, label: 'rail.images' },
  { id: 'palettes', icon: Palette, label: 'panels.palettes' },
  { id: 'animate', icon: Zap, label: 'rail.animate' },
];
/** What the strip under the canvas offers in each step. */
const DOCK: Record<Step, BottomTab[]> = {
  design: ['simulator', 'timeline', 'console'],
  simulate: ['simulator'],
  validate: ['validation'],
  car: [],
};

function CarPage(): JSX.Element {
  const t = useT();
  const theme = useProjectStore((s) => s.theme);
  return (
    <div className="car-page">
      <div className="car-inner">
        <div className="car-head">
          <div className="thumb">
            <Thumb theme={theme} />
          </div>
          <div>
            <h2>{t('steps.carTitle')}</h2>
            <p className="lead">{t('steps.carLead')}</p>
            <strong>{theme.name}</strong>
          </div>
        </div>
        <BuildPanel />
      </div>
    </div>
  );
}

/**
 * The new window: the work as steps along the top, one thing in the left panel
 * at a time. It holds the same panels as the classic window.
 */
export function ModernShell({
  onSave,
  onHelp,
  fileMenu,
  moreMenu,
  status,
}: {
  onSave: () => void;
  onHelp: () => void;
  fileMenu: () => MenuItem[];
  moreMenu: () => MenuItem[];
  status: ReactNode;
}): JSX.Element {
  const t = useT();
  const ui = useUiStore(
    useShallow((s) => ({
      step: s.step,
      rail: s.rail,
      leftOpen: s.leftOpen,
      rightOpen: s.rightOpen,
      bottomOpen: s.bottomOpen,
      bottomTab: s.bottomTab,
      setStep: s.setStep,
      setRail: s.setRail,
      setBottomTab: s.setBottomTab,
      toggle: s.toggle,
    })),
  );
  const project = useProjectStore(
    useShallow((s) => ({
      dirty: s.dirty,
      name: s.theme.name,
      canUndo: s.past.length > 0,
      canRedo: s.future.length > 0,
      undo: s.undo,
      redo: s.redo,
    })),
  );
  const openBelow = (e: React.MouseEvent<HTMLElement>, items: MenuItem[]) => {
    const r = e.currentTarget.getBoundingClientRect();
    useUiStore.getState().openMenu(r.left, r.bottom + 4, items);
  };
  const openBeside = (e: React.MouseEvent<HTMLElement>, items: MenuItem[]) => {
    const r = e.currentTarget.getBoundingClientRect();
    useUiStore.getState().openMenu(r.right + 4, r.top - 120, items);
  };

  const at = STEPS.indexOf(ui.step);
  const next = STEPS[at + 1];
  const go = (step: Step) => {
    ui.setStep(step);
    if (step === 'simulate') useSimStore.getState().setRunning(true);
  };

  const left = ui.step === 'design' && ui.leftOpen;
  const right = (ui.step === 'design' || ui.step === 'validate') && ui.rightOpen;
  const tabs = DOCK[ui.step];
  const tab = tabs.includes(ui.bottomTab) ? ui.bottomTab : tabs[0];
  const dockOpen = ui.bottomOpen || ui.step !== 'design';

  return (
    <div className="app modern" data-step={ui.step}>
      <header className="m-top">
        <img className="m-logo" src="/logo-mark.png" alt="idv7lol Studio" />
        <button className="m-name" onClick={(e) => openBelow(e, fileMenu())} title={t('menu.file')}>
          <span>
            <strong>{project.name}</strong>
            <ChevronDown size={14} />
          </span>
          <small>
            <i className={project.dirty ? 'unsaved' : ''} />
            {project.dirty ? t('status.unsaved') : t('status.saved')}
          </small>
        </button>
        <nav className="stepper">
          <button className="done" onClick={() => useUiStore.getState().setWelcomeOpen(true)}>
            <b>
              <Check size={12} />
            </b>
            <span>{t('steps.template')}</span>
          </button>
          {STEPS.map((s, i) => (
            <button
              key={s}
              className={i === at ? 'current' : i < at ? 'done' : ''}
              aria-current={i === at ? 'step' : undefined}
              title={t(`steps.${s}`)}
              onClick={() => go(s)}
            >
              <b>{i < at ? <Check size={12} /> : i + 2}</b>
              <span>{t(`steps.${s}`)}</span>
              {s === 'validate' && <ValidationTabBadge />}
            </button>
          ))}
        </nav>
        <span className="m-actions">
          <button
            className="icon"
            onClick={onSave}
            title={`${t('menu.save')} (Ctrl+S)`}
            aria-label={t('menu.save')}
          >
            <Save size={16} />
          </button>
          <button
            className="icon"
            onClick={() => project.undo()}
            disabled={!project.canUndo}
            title={`${t('menu.undo')} (Ctrl+Z)`}
            aria-label={t('menu.undo')}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="icon"
            onClick={() => project.redo()}
            disabled={!project.canRedo}
            title={`${t('menu.redo')} (Ctrl+Y)`}
            aria-label={t('menu.redo')}
          >
            <Redo2 size={16} />
          </button>
          {next && (
            <button
              className="primary m-next"
              onClick={() => go(next)}
              title={t('steps.continue', { step: t(`steps.${next}`) })}
            >
              <span>{t('steps.continue', { step: t(`steps.${next}`) })}</span>
              <ArrowRight size={15} />
            </button>
          )}
          <button
            className="icon"
            onClick={(e) => openBelow(e, moreMenu())}
            title={t('menu.more')}
            aria-label={t('menu.more')}
          >
            <Ellipsis size={16} />
          </button>
        </span>
      </header>

      <div className="m-body">
        <nav className="rail">
          {ui.step === 'design' &&
            RAIL.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                className={ui.rail === id && ui.leftOpen ? 'active' : ''}
                onClick={() => ui.setRail(id)}
              >
                <Icon size={20} />
                <span>{t(label)}</span>
              </button>
            ))}
          <span className="grow" />
          <button onClick={onHelp}>
            <CircleHelp size={20} />
            <span>{t('menu.help')}</span>
          </button>
          <button onClick={(e) => openBeside(e, moreMenu())}>
            <SlidersHorizontal size={20} />
            <span>{t('rail.settings')}</span>
          </button>
        </nav>
        <div className="m-main">
          {ui.step === 'car' && <CarPage />}
          <div
            className={`workspace ${left ? '' : 'no-left'} ${right ? '' : 'no-right'}`}
            hidden={ui.step === 'car'}
          >
            <div className="panel">
              <div className="panel-header">
                {t(RAIL.find((r) => r.id === ui.rail)?.label ?? 'rail.pieces')}
              </div>
              {ui.rail === 'pieces' && <LibraryPanel />}
              {ui.rail === 'images' && (
                <div className="panel-body">
                  <ImagesPanel />
                </div>
              )}
              {(ui.rail === 'layers' || ui.rail === 'animate') && (
                <div className="panel-body">
                  <LayersPanel />
                </div>
              )}
              {ui.rail === 'palettes' && (
                <div className="panel-body">
                  <PalettePanel />
                </div>
              )}
            </div>
            {ui.step !== 'car' && <CanvasView />}
            {left && <Splitter pane="left" />}
            {right && <Splitter pane="right" />}
            <div className="panel right">
              <div className="panel-header">{t('panels.inspector')}</div>
              <div className="panel-body">
                <InspectorPanel />
              </div>
            </div>
          </div>
          {tab && (
            <div className={`bottom ${dockOpen ? '' : 'collapsed'}`}>
              {dockOpen && <Splitter pane="bottom" />}
              <div className="tabs">
                {tabs.map((b) => (
                  <button
                    key={b}
                    className={tab === b && dockOpen ? 'active' : ''}
                    onClick={() =>
                      tab === b && ui.bottomOpen && ui.step === 'design'
                        ? ui.toggle('bottomOpen')
                        : ui.setBottomTab(b)
                    }
                  >
                    {t(`panels.${b}`)}
                    {b === 'validation' && <ValidationTabBadge />}
                  </button>
                ))}
              </div>
              {dockOpen && (
                <div className="bottom-body">
                  {tab === 'simulator' && <SimulatorPanel />}
                  {tab === 'validation' && <ValidationPanel />}
                  {tab === 'timeline' && <TimelinePanel />}
                  {tab === 'console' && <ConsolePanel />}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {status}
    </div>
  );
}

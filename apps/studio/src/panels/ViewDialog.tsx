import { useUiStore, type StudioView } from '../store/ui.js';
import { useT } from '../i18n/index.js';

/** A wireframe of each window, so the choice can be made by eye. */
function Sketch({ view }: { view: StudioView }): JSX.Element {
  return view === 'modern' ? (
    <svg viewBox="0 0 240 132" aria-hidden="true">
      <rect className="sk-bar" x="0" y="0" width="240" height="16" />
      {[78, 104, 130, 156].map((x, i) => (
        <rect
          key={x}
          className={i === 0 ? 'sk-on' : 'sk-dim'}
          x={x}
          y="5"
          width="20"
          height="6"
          rx="3"
        />
      ))}
      <rect className="sk-on" x="204" y="4" width="28" height="8" rx="3" />
      <rect className="sk-bar" x="0" y="17" width="14" height="115" />
      {[24, 38, 52, 66].map((y, i) => (
        <rect
          key={y}
          className={i === 0 ? 'sk-on' : 'sk-dim'}
          x="4"
          y={y}
          width="6"
          height="6"
          rx="2"
        />
      ))}
      <rect className="sk-panel" x="15" y="17" width="40" height="115" />
      <rect className="sk-canvas" x="64" y="30" width="112" height="42" rx="3" />
      <rect className="sk-panel" x="62" y="90" width="116" height="34" rx="4" />
      <rect className="sk-panel" x="186" y="17" width="54" height="115" />
    </svg>
  ) : (
    <svg viewBox="0 0 240 132" aria-hidden="true">
      <rect className="sk-bar" x="0" y="0" width="240" height="12" />
      {[6, 22, 38, 54, 150, 176, 202].map((x) => (
        <rect key={x} className="sk-dim" x={x} y="4" width="12" height="4" rx="2" />
      ))}
      <rect className="sk-panel" x="0" y="13" width="44" height="73" />
      <rect className="sk-canvas" x="54" y="24" width="122" height="46" rx="3" />
      <rect className="sk-panel" x="186" y="13" width="54" height="73" />
      {[190, 206, 222].map((x) => (
        <rect key={x} className="sk-dim" x={x} y="17" width="12" height="4" rx="2" />
      ))}
      <rect className="sk-panel" x="0" y="87" width="240" height="45" />
      {[6, 30, 54, 78, 102].map((x, i) => (
        <rect
          key={x}
          className={i === 0 ? 'sk-on' : 'sk-dim'}
          x={x}
          y="91"
          width="18"
          height="4"
          rx="2"
        />
      ))}
    </svg>
  );
}

/** "Classic or new view": once on the desktop, every time the web editor opens. */
export function ViewDialog(): JSX.Element {
  const t = useT();
  const view = useUiStore((s) => s.view);
  const choose = useUiStore((s) => s.chooseView);
  return (
    <div className="modal-backdrop view-ask">
      <div
        className="modal view-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('view.title')}
      >
        <h2>{t('view.title')}</h2>
        <p className="lead">{t('view.lead')}</p>
        <div className="view-choices">
          {(['modern', 'classic'] as const).map((v) => (
            <button
              key={v}
              className={`view-choice ${view === v ? 'current' : ''}`}
              autoFocus={view === v}
              onClick={() => choose(v)}
            >
              <Sketch view={v} />
              <strong>{t(`view.${v}`)}</strong>
              <small>{t(`view.${v}Desc`)}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

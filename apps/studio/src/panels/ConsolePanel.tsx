import { useUiStore } from '../store/ui.js';
import { useT } from '../i18n/index.js';

export function ConsolePanel(): JSX.Element {
  const t = useT();
  const log = useUiStore((s) => s.log);
  const clear = useUiStore((s) => s.clearLog);
  return (
    <>
      <div className="panel-header" style={{ fontWeight: 400 }}>
        <span className="grow" />
        <button onClick={clear}>{t('console.clear')}</button>
      </div>
      <div className="log">
        {log.map((e, i) => (
          <div key={i} className={e.level}>
            <span className="t">{new Date(e.at).toLocaleTimeString()} </span>
            {e.text}
          </div>
        ))}
        {log.length === 0 && <span className="t">—</span>}
      </div>
    </>
  );
}

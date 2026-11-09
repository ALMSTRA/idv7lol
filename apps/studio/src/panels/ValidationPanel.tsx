import { useState } from 'react';
import { RENDERER_LIMITS } from '@idv7lol/theme-engine';
import type { Finding } from '@idv7lol/theme-compiler';
import { useProjectStore } from '../store/project.js';
import { useT } from '../i18n/index.js';
import { useValidation } from '../lib/useValidation.js';

export function ValidationPanel(): JSX.Element {
  const t = useT();
  const report = useValidation();
  const [showInfos, setShowInfos] = useState(false);
  const select = useProjectStore((s) => s.select);
  if (!report) return <div className="empty">…</div>;
  const list: Finding[] = [
    ...report.errors,
    ...report.warnings,
    ...(showInfos ? report.infos : []),
  ];
  return (
    <>
      <div className="panel-header" style={{ fontWeight: 400 }}>
        <span
          className={`badge ${report.errors.length ? 'error' : report.warnings.length ? 'warning' : 'ok'}`}
        >
          {report.errors.length
            ? t('validation.errors', { n: report.errors.length })
            : report.warnings.length
              ? t('validation.warnings', { n: report.warnings.length })
              : t('validation.ok')}
        </span>
        {report.layers !== undefined && (
          <span className="badge">
            {t('validation.layers', { n: report.layers, max: RENDERER_LIMITS.layersPerApp })}
          </span>
        )}
        <span className="grow" />
        <label
          style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-muted)' }}
        >
          <input
            type="checkbox"
            checked={showInfos}
            onChange={(e) => setShowInfos(e.target.checked)}
          />{' '}
          {t('validation.showInfos')} ({report.infos.length})
        </label>
      </div>
      <div>
        {list.map((f, i) => (
          <div
            key={i}
            className={`finding ${f.severity}`}
            onClick={() => f.componentId && select([f.componentId])}
          >
            <span className="sev">{f.severity}</span>
            <span className="msg">
              {f.message}
              <small>
                <code>{f.code}</code>
                {f.componentId ? ` · ${f.componentId}` : f.path ? ` · ${f.path}` : ''}
                {f.hint ? ` — ${f.hint}` : ''}
              </small>
            </span>
          </div>
        ))}
        {list.length === 0 && <div className="empty">{t('validation.ok')}</div>}
      </div>
    </>
  );
}

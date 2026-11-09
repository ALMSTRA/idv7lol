import { Cpu } from 'lucide-react';
import { useState } from 'react';
import { compileTheme, type CompileResult } from '@idv7lol/theme-compiler';
import { RENDERER_LIMITS } from '@idv7lol/theme-engine';
import { useProjectStore } from '../store/project.js';
import { useUiStore } from '../store/ui.js';
import { useT } from '../i18n/index.js';
import { useValidation } from '../lib/useValidation.js';
import { decodeThemeImages } from '../lib/imageStore.js';
import { fetchStatic, isTauri, openExternal, pickFolder, writeBundleFiles } from '../host/files.js';

interface BuildState {
  result: CompileResult | null;
  exportedTo: string | null;
  busy: boolean;
}

export function BuildPanel(): JSX.Element {
  const t = useT();
  const theme = useProjectStore((s) => s.theme);
  const report = useValidation();
  const log = useUiStore((s) => s.logMessage);
  const [state, setState] = useState<BuildState>({ result: null, exportedTo: null, busy: false });
  const stale =
    state.result && state.result.compiled && state.result.compiled.compiledAt < '' ? true : false;

  const compile = async () => {
    setState((s) => ({ ...s, busy: true }));
    try {
      const families = new Set(Object.values(theme.fonts).map((f) => f.family));
      const fonts: Record<string, { pixels: Uint8Array; metrics: object }> = {};
      for (const fam of families) {
        const px = await fetchStatic(`/fonts/${fam}.r8`);
        const mt = await fetchStatic(`/fonts/${fam}.json`);
        if (px && mt)
          fonts[fam] = { pixels: px, metrics: JSON.parse(new TextDecoder().decode(mt)) as object };
      }
      const result = compileTheme(theme, { fonts, images: await decodeThemeImages(theme) });
      setState({ result, exportedTo: null, busy: false });
      if (result.compiled)
        log(
          'info',
          `Compiled "${theme.name}": ${result.compiled.layers} layers, ${result.files.length} files, ${result.report.warnings.length} warnings`,
        );
      else log('error', `Compilation failed: ${result.report.errors.length} error(s)`);
    } catch (e) {
      log('error', `Compilation crashed: ${(e as Error).message}`);
      setState((s) => ({ ...s, busy: false }));
    }
  };

  const exportBundle = async () => {
    if (!state.result?.compiled) return;
    const folder = isTauri ? await pickFolder(t('build.exportBundle')) : null;
    if (isTauri && !folder) return;
    const path = await writeBundleFiles(folder, state.result.compiled.id, state.result.files);
    setState((s) => ({ ...s, exportedTo: path }));
    log('info', t('build.exportedTo', { path }));
  };

  const c = state.result?.compiled;
  const steps = [
    { key: 'preview', state: 'done' },
    { key: 'tests', state: !report ? '' : report.ok ? 'done' : 'fail' },
    { key: 'compiled', state: c ? 'done' : state.result ? 'fail' : '' },
    { key: 'exported', state: state.exportedTo ? 'done' : '' },
    { key: 'installed', state: '' },
  ] as const;

  return (
    <div className="build-grid">
      <div className="sim-card">
        <h4>{t('build.status')}</h4>
        <div className="status-steps">
          {steps.map((s) => (
            <div key={s.key} className={`status-step ${s.state}`}>
              <span className="dot" />
              <span>{t(`build.steps.${s.key}`)}</span>
              {s.key === 'installed' && <span className="hint">— {t('build.installedNote')}</span>}
            </div>
          ))}
        </div>
        <div className="sim-buttons" style={{ marginTop: 6 }}>
          <button
            className="primary"
            onClick={compile}
            disabled={state.busy || !report || !report.ok}
          >
            <Cpu size={14} /> {t('build.compile')}
          </button>
          <button onClick={exportBundle} disabled={!c || stale}>
            ⇩ {t('build.exportBundle')}
          </button>
          <button
            onClick={() =>
              openExternal('https://github.com/ALMSTRA/idv7lol/blob/main/docs/user/DEPLOYMENT.md')
            }
          >
            ? {t('build.howToInstall')}
          </button>
        </div>
        {!isTauri && <div className="hint">{t('build.noTauri')}</div>}
        {state.exportedTo && (
          <div className="hint">{t('build.exportedTo', { path: state.exportedTo })}</div>
        )}
        <h4 style={{ marginTop: 8 }}>{t('build.deps')}</h4>
        <div className="hint">{t('build.depsNote')}</div>
        <table className="plain">
          <tbody>
            <tr>
              <td>cluster-render</td>
              <td>≥ 0.4.2</td>
              <td>robertnisipeanu/idrive-apps</td>
            </tr>
            <tr>
              <td>mgu-deploy</td>
              <td>≥ 0.7.11</td>
              <td>robertnisipeanu/mgu-store</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="sim-card">
        <h4>{t('menu.build')}</h4>
        {!c && !state.result && <div className="hint">—</div>}
        {state.result && !c && (
          <div className="log">
            {state.result.report.errors.map((e, i) => (
              <div key={i} className="error">
                {e.code}: {e.message}
              </div>
            ))}
          </div>
        )}
        {c && (
          <>
            <table className="plain">
              <tbody>
                <tr>
                  <th>{t('build.layers')}</th>
                  <td>
                    {c.layers} / {RENDERER_LIMITS.layersPerApp}
                  </td>
                </tr>
                <tr>
                  <th>{t('build.pieces')}</th>
                  <td>
                    {c.pieces.length} effect, {c.images.length} image
                  </td>
                </tr>
                <tr>
                  <th>{t('build.shaders')}</th>
                  <td>{Object.keys(c.shaders).join(', ')}</td>
                </tr>
                <tr>
                  <th>{t('build.signals')}</th>
                  <td>{c.signals.length}</td>
                </tr>
                <tr>
                  <th>{t('build.fonts')}</th>
                  <td>
                    {state.result!.files.filter((f) => f.path.startsWith('fonts/')).length
                      ? c.fonts.join(', ')
                      : `${c.fonts.join(', ')} (atlas missing)`}
                  </td>
                </tr>
                <tr>
                  <th>{t('build.warnings')}</th>
                  <td>{c.warnings.length}</td>
                </tr>
              </tbody>
            </table>
            {c.warnings.length > 0 && (
              <div className="log">
                {c.warnings.map((w, i) => (
                  <div key={i} className="warning">
                    {w.componentId ? `[${w.componentId}] ` : ''}
                    {w.message}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

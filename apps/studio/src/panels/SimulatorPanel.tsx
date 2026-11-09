import { useEffect, useMemo, useState } from 'react';
import { SCENARIOS } from '@idv7lol/simulator';
import { PROFILES, SIGNALS, getSignal } from '@idv7lol/vehicle-signals';
import { collectSignals } from '@idv7lol/theme-engine';
import { useProjectStore } from '../store/project.js';
import { simulator, useSimStore } from '../store/sim.js';
import { useUiStore } from '../store/ui.js';
import { useT } from '../i18n/index.js';
import { Select } from '../inspector/fields.js';

const DRIVE_MODES = ['ECO_PRO', 'COMFORT', 'SPORT', 'SPORT_PLUS', 'ADAPTIVE', 'TRACK'];

export function SimulatorPanel(): JSX.Element {
  const t = useT();
  const sim = useSimStore();
  const theme = useProjectStore((s) => s.theme);
  const ui = useUiStore();
  const [, setTick] = useState(0);
  const [onlyUsed, setOnlyUsed] = useState(true);
  const [filter, setFilter] = useState('');

  // Refresh the live values table a few times per second.
  useEffect(() => {
    const h = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(h);
  }, []);

  const inputs = simulator.inputs;
  const used = useMemo(() => collectSignals(theme.components), [theme]);
  const snapshot = simulator.bus.snapshot();
  const rows = SIGNALS.filter(
    (s) => (!onlyUsed || used.has(s.id)) && (!filter || s.id.includes(filter.toLowerCase())),
  );
  const palettes = Object.keys(theme.palettes);
  const overrides = simulator.publisher.overrides;
  const dropped = simulator.publisher.faults.dropped;

  return (
    <div className="sim-grid">
      <div className="sim-card">
        <h4>{t('sim.scenario')}</h4>
        <Select
          value={sim.scenarioId ?? ''}
          options={[
            { value: '', label: t('sim.manual') },
            ...SCENARIOS.map((s) => ({ value: s.id, label: s.name })),
          ]}
          onChange={(v) => sim.loadScenario(v || null)}
        />
        {sim.scenarioId && (
          <div className="hint">{SCENARIOS.find((s) => s.id === sim.scenarioId)?.description}</div>
        )}
        <div className="sim-buttons">
          <button
            className={sim.running ? 'active' : 'primary'}
            onClick={() => sim.setRunning(!sim.running)}
          >
            {sim.running ? `❚❚ ${t('sim.pause')}` : `▶ ${t('sim.play')}`}
          </button>
          <button onClick={() => sim.reset()}>↺ {t('sim.reset')}</button>
          <button
            className={sim.recording ? 'danger active' : ''}
            onClick={() => sim.toggleRecording()}
          >
            ● {sim.recording ? t('sim.stopRecord') : t('sim.record')}
          </button>
          <button disabled={!sim.lastRecording} onClick={() => sim.replayLast()}>
            ⟲ {t('sim.replay')}
          </button>
        </div>
        <div className="sim-row">
          <span>{t('sim.speed')}</span>
          <input
            type="range"
            min={0.1}
            max={10}
            step={0.1}
            value={sim.speed}
            onChange={(e) => sim.setSpeed(parseFloat(e.target.value))}
          />
          <span className="val">{sim.speed.toFixed(1)}</span>
        </div>
        <div className="sim-row">
          <span>{t('sim.profile')}</span>
          <select
            value={simulator.publisher.profile.id}
            onChange={(e) => sim.setProfile(e.target.value)}
            style={{ gridColumn: '2 / 4' }}
          >
            {PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sim-row">
          <span>{t('sim.palette')}</span>
          <select
            value={ui.previewPalette ?? ''}
            onChange={(e) => ui.setPreviewPalette(e.target.value || null)}
            style={{ gridColumn: '2 / 4' }}
          >
            <option value="">{t('sim.auto')}</option>
            {palettes.map((p) => (
              <option key={p} value={p}>
                {theme.palettes[p]?.name ?? p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="sim-card">
        <h4>{t('sim.manual')}</h4>
        <div className="sim-row">
          <span>{t('sim.throttle')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={inputs.throttle}
            onChange={(e) => sim.setInputs({ throttle: parseFloat(e.target.value) })}
          />
          <span className="val">{Math.round(inputs.throttle * 100)}%</span>
        </div>
        <div className="sim-row">
          <span>{t('sim.brake')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={inputs.brake}
            onChange={(e) => sim.setInputs({ brake: parseFloat(e.target.value) })}
          />
          <span className="val">{Math.round(inputs.brake * 100)}%</span>
        </div>
        <div className="sim-row">
          <span>{t('sim.gear')}</span>
          <div className="sim-buttons" style={{ gridColumn: '2 / 4' }}>
            {(['P', 'R', 'N', 'D'] as const).map((g) => (
              <button
                key={g}
                className={inputs.gearPosition === g ? 'active' : ''}
                onClick={() => sim.setInputs({ gearPosition: g })}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="sim-row">
          <span>{t('sim.mode')}</span>
          <div className="sim-buttons" style={{ gridColumn: '2 / 4' }}>
            {(['D', 'S', 'M'] as const).map((m) => (
              <button
                key={m}
                className={inputs.gearMode === m ? 'active' : ''}
                onClick={() => sim.setInputs({ gearMode: m })}
              >
                {m}
              </button>
            ))}
            {inputs.gearMode === 'M' && (
              <>
                <button
                  onClick={() => sim.setInputs({ manualGear: Math.max(1, inputs.manualGear - 1) })}
                >
                  −
                </button>
                <span className="val" style={{ alignSelf: 'center' }}>
                  {inputs.manualGear}
                </span>
                <button
                  onClick={() => sim.setInputs({ manualGear: Math.min(8, inputs.manualGear + 1) })}
                >
                  +
                </button>
              </>
            )}
          </div>
        </div>
        <div className="sim-row">
          <span>{t('sim.driveMode')}</span>
          <select
            value={inputs.driveMode}
            onChange={(e) =>
              sim.setInputs({ driveMode: e.target.value as typeof inputs.driveMode })
            }
            style={{ gridColumn: '2 / 4' }}
          >
            {DRIVE_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="sim-row">
          <span>{t('sim.cruise')}</span>
          <input
            type="range"
            min={0}
            max={250}
            step={5}
            value={inputs.cruiseSpeed}
            onChange={(e) => sim.setInputs({ cruiseSpeed: parseFloat(e.target.value) })}
          />
          <span className="val">{inputs.cruiseSpeed || '—'}</span>
        </div>
        <div className="sim-row">
          <span>{t('sim.outside')}</span>
          <input
            type="range"
            min={-30}
            max={45}
            step={0.5}
            value={inputs.outsideTemp}
            onChange={(e) => sim.setInputs({ outsideTemp: parseFloat(e.target.value) })}
          />
          <span className="val">{inputs.outsideTemp}°</span>
        </div>
        <div className="sim-buttons">
          <label>
            <input
              type="checkbox"
              checked={inputs.ignition}
              onChange={(e) => sim.setInputs({ ignition: e.target.checked })}
            />{' '}
            {t('sim.ignition')}
          </label>
          <label>
            <input
              type="checkbox"
              checked={inputs.turnLeft}
              onChange={(e) => sim.setInputs({ turnLeft: e.target.checked, turnRight: false })}
            />{' '}
            ⇦
          </label>
          <label>
            <input
              type="checkbox"
              checked={inputs.turnRight}
              onChange={(e) => sim.setInputs({ turnRight: e.target.checked, turnLeft: false })}
            />{' '}
            ⇨
          </label>
          <label>
            <input
              type="checkbox"
              checked={inputs.highBeam}
              onChange={(e) => sim.setInputs({ highBeam: e.target.checked })}
            />{' '}
            ≡D
          </label>
        </div>
      </div>

      <div className="sim-card" style={{ gridColumn: '3 / 5' }}>
        <h4>
          {t('sim.signals')} · {t('sim.health')}{' '}
          {Math.round(simulator.bus.number('system.signal.health', 0))}%
        </h4>
        <div className="sim-buttons">
          <input
            type="search"
            placeholder="filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 160 }}
          />
          <label>
            <input
              type="checkbox"
              checked={onlyUsed}
              onChange={(e) => setOnlyUsed(e.target.checked)}
            />{' '}
            used by theme
          </label>
          <label>
            <input
              type="checkbox"
              checked={simulator.publisher.faults.commLoss}
              onChange={(e) => sim.setCommLoss(e.target.checked)}
            />{' '}
            {t('sim.commLoss')}
          </label>
          <label>
            {t('sim.latency')}{' '}
            <input
              type="number"
              min={0}
              max={5000}
              step={50}
              value={simulator.publisher.faults.latencyMs}
              onChange={(e) => sim.setLatency(parseInt(e.target.value) || 0)}
              style={{ width: 70 }}
            />
          </label>
        </div>
        <div className="sim-signals">
          {rows.map((s) => {
            const sample = snapshot[s.id];
            const stale = !sample || !sample.valid || performance.now() - sample.at > 3000;
            const ov = overrides.get(s.id);
            const def = getSignal(s.id)!;
            return (
              <div
                key={s.id}
                className={`sim-signal ${stale ? 'stale' : ''}`}
                title={s.description}
              >
                <code>{s.id}</code>
                {ov !== undefined ? (
                  def.kind === 'number' ? (
                    <input
                      type="number"
                      value={Number(ov)}
                      step={def.decimals ? 1 / 10 ** def.decimals : 1}
                      onChange={(e) => sim.override(s.id, parseFloat(e.target.value))}
                    />
                  ) : def.kind === 'enum' ? (
                    <select value={String(ov)} onChange={(e) => sim.override(s.id, e.target.value)}>
                      {def.enumValues?.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="checkbox"
                      checked={!!ov}
                      onChange={(e) => sim.override(s.id, e.target.checked)}
                    />
                  )
                ) : (
                  <span className="v">
                    {sample && sample.valid
                      ? String(
                          typeof sample.value === 'number'
                            ? Math.round(sample.value * 100) / 100
                            : sample.value,
                        )
                      : '—'}
                  </span>
                )}
                <button
                  className={`icon ghost ${ov !== undefined ? 'active' : ''}`}
                  title={t('sim.override')}
                  onClick={() =>
                    sim.override(
                      s.id,
                      ov !== undefined
                        ? null
                        : (sample?.value ??
                            (def.kind === 'enum'
                              ? def.enumValues![0]!
                              : def.kind === 'boolean'
                                ? true
                                : def.min)),
                    )
                  }
                >
                  ✎
                </button>
                <button
                  className={`icon ghost ${dropped.has(s.id) ? 'active' : ''}`}
                  title={t('sim.drop')}
                  onClick={() => sim.drop(s.id, !dropped.has(s.id))}
                >
                  ⚡
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

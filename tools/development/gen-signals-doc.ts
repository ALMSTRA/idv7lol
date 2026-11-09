/**
 * Generates docs/developer/SIGNALS.md from the signal catalog so the document
 * never drifts from the code.
 *
 *   npx tsx tools/development/gen-signals-doc.ts
 */
import { writeFileSync } from 'node:fs';
import {
  PROFILES,
  SIGNALS,
  UNITS,
  profileHasSignal,
  signalsByGroup,
} from '../../packages/vehicle-signals/src/index.js';

const lines: string[] = [];
lines.push('# Signals');
lines.push('');
lines.push(
  '_Generated from `packages/vehicle-signals/src/catalog.ts` by `tools/development/gen-signals-doc.ts`. Do not edit by hand._',
);
lines.push('');
lines.push(
  "Themes bind components to **catalog signal ids**. The catalog is idv7lol's own stable naming; the MGU app maps each id to the head unit's SOME/IP fields (see `apps/idv7lol/vehicle.js`). Values are stored in the canonical unit of each signal; components may display another unit of the same dimension.",
);
lines.push('');
lines.push('## Availability');
lines.push('');
lines.push('| Level | Meaning |');
lines.push('|---|---|');
lines.push('| core | present on every iDrive 7 MGU car; safe to require |');
lines.push('| common | present on most cars; may be missing on some engines or markets |');
lines.push('| model-dependent | only on some drivetrains (turbo, hybrid, xDrive…) |');
lines.push('| experimental | observed but not verified on real hardware by this project |');
lines.push('');
lines.push(
  "**Mapped on the car today** (`apps/idv7lol/vehicle.js`): `engine.rpm`, `vehicle.speed`, `engine.coolant.temp`, `engine.oil.temp`, `engine.running`, `engine.torque`, `engine.boost`, `chassis.accel.lon`, `chassis.accel.lat`, `transmission.gear`, `transmission.mode`, `transmission.oil.temp`, `drive.mode`, `environment.outside.temp`. Everything else shows the component's fallback until a provider is added. Nothing has been verified in a vehicle by idv7lol yet.",
);
lines.push('');
lines.push('## Catalog');
lines.push('');
for (const [group, list] of signalsByGroup()) {
  lines.push(`### ${group}`);
  lines.push('');
  lines.push('| Id | Name | Kind | Unit | Range | Rate | Availability | Description |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const s of list) {
    const unit = UNITS[s.unit].symbol || '—';
    const range =
      s.kind === 'enum'
        ? (s.enumValues ?? []).join(', ')
        : s.kind === 'boolean'
          ? 'true / false'
          : `${s.min} … ${s.max}`;
    lines.push(
      `| \`${s.id}\` | ${s.name} | ${s.kind} | ${unit} | ${range} | ${s.rateHz ? `${s.rateHz} Hz` : 'on change'} | ${s.availability} | ${s.description} |`,
    );
  }
  lines.push('');
}
lines.push('## Vehicle profiles');
lines.push('');
lines.push(
  "A theme declares the profile it targets; the validator warns when it binds a signal the profile does not provide and the simulator only produces the profile's signals.",
);
lines.push('');
lines.push('| Profile | Description | Signals not available |');
lines.push('|---|---|---|');
for (const p of PROFILES) {
  const missing = SIGNALS.filter((s) => !profileHasSignal(p, s.id)).map((s) => `\`${s.id}\``);
  lines.push(`| \`${p.id}\` | ${p.description} | ${missing.length ? missing.join(', ') : '—'} |`);
}
lines.push('');
lines.push('## Units');
lines.push('');
lines.push('| Unit | Symbol | Dimension |');
lines.push('|---|---|---|');
for (const u of Object.values(UNITS))
  lines.push(`| \`${u.id}\` | ${u.symbol || '—'} | ${u.dimension} |`);
lines.push('');
writeFileSync('docs/developer/SIGNALS.md', lines.join('\n'));
console.log(`wrote docs/developer/SIGNALS.md (${SIGNALS.length} signals)`);

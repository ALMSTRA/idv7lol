import {
  REQUIRED_PALETTE_TOKENS,
  getDisplayProfile,
  parseTheme,
  type Color,
  type Component,
  type Condition,
  type Fill,
} from '@idv7lol/theme-schema';
import {
  contrastRatio,
  flattenComponents,
  outOfBounds,
  parseColor,
  reservedZoneOverlaps,
  RENDERER_LIMITS,
} from '@idv7lol/theme-engine';
import { getProfile, getSignal, profileHasSignal, sameDimension } from '@idv7lol/vehicle-signals';
import { buildPieces } from './pieces.js';
import { lintShader, SHADERS } from './glsl.js';
import { missingGlyphs } from './font/glyphs.js';
import type { Finding, ValidationReport } from './types.js';

const INFORMATIVE_TYPES = new Set<Component['type']>([
  'text',
  'gauge.arc',
  'gauge.bar',
  'value.digital',
  'indicator.gear',
  'indicator.shiftlights',
  'clock',
  'telltale',
  'status.panel',
]);

class Collector {
  findings: Finding[] = [];
  error(code: string, message: string, extra: Partial<Finding> = {}): void {
    this.findings.push({ severity: 'error', code, message, ...extra });
  }
  warning(code: string, message: string, extra: Partial<Finding> = {}): void {
    this.findings.push({ severity: 'warning', code, message, ...extra });
  }
  info(code: string, message: string, extra: Partial<Finding> = {}): void {
    this.findings.push({ severity: 'info', code, message, ...extra });
  }
}

function* colorsOf(value: unknown, path: string): Generator<{ color: string; path: string }> {
  if (typeof value === 'string') {
    if (value.startsWith('$')) yield { color: value, path };
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* colorsOf(value[i], `${path}[${i}]`);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) yield* colorsOf(v, path ? `${path}.${k}` : k);
  }
}

function* conditionSignals(c: Condition | undefined): Generator<string> {
  if (!c) return;
  if ('all' in c) for (const x of c.all) yield* conditionSignals(x);
  else if ('any' in c) for (const x of c.any) yield* conditionSignals(x);
  else if ('not' in c) yield* conditionSignals(c.not);
  else yield c.signal;
}

function fillColor(f: Fill | undefined): Color | undefined {
  if (!f) return undefined;
  return typeof f === 'string' ? f : f.stops[0]?.color;
}

/** Validate a theme document (parsed or raw JSON object). */
export function validateTheme(doc: unknown): ValidationReport {
  const out = new Collector();
  const parsed = parseTheme(doc);
  if (!parsed.ok) {
    for (const i of parsed.issues) out.error(`schema.${i.code}`, i.message, { path: i.path });
    return finish(out);
  }
  const theme = parsed.theme;
  const profile = getProfile(theme.vehicleProfile);
  const display = getDisplayProfile(theme.target.display);

  // --- target and profile
  if (!display)
    out.error('target.display', `Unknown display profile "${theme.target.display}".`, {
      path: 'target.display',
    });
  else {
    if (display.width !== theme.layout.width || display.height !== theme.layout.height) {
      out.error(
        'layout.size',
        `Layout is ${theme.layout.width}×${theme.layout.height} but the display "${display.name}" is ${display.width}×${display.height}.`,
        { path: 'layout' },
      );
    }
    if (!display.verified)
      out.info(
        'target.unverified',
        `Display profile "${display.id}" has not been verified on a car by idv7lol yet.`,
      );
  }
  if (!profile)
    out.error('profile.unknown', `Unknown vehicle profile "${theme.vehicleProfile}".`, {
      path: 'vehicleProfile',
    });

  // --- palettes
  const paletteIds = Object.keys(theme.palettes);
  if (!theme.palettes[theme.palette.default])
    out.error('palette.default', `Default palette "${theme.palette.default}" does not exist.`, {
      path: 'palette.default',
    });
  for (const [mode, id] of Object.entries(theme.palette.byDriveMode)) {
    if (id && !theme.palettes[id])
      out.error('palette.drive-mode', `Palette "${id}" for driving mode ${mode} does not exist.`, {
        path: `palette.byDriveMode.${mode}`,
      });
  }
  for (const [id, pal] of Object.entries(theme.palettes)) {
    for (const token of REQUIRED_PALETTE_TOKENS) {
      if (!pal.colors[token])
        out.error(
          'palette.missing-token',
          `Palette "${id}" lacks the required token "$${token}".`,
          { path: `palettes.${id}.colors.${token}` },
        );
    }
    const bg = parseColor(pal.colors['background'] ?? '#000');
    const text = parseColor(pal.colors['text'] ?? '#fff');
    const muted = parseColor(pal.colors['text-muted'] ?? '#888');
    if (contrastRatio(bg, text) < 4.5)
      out.warning(
        'palette.contrast',
        `Palette "${id}": text on background has low contrast (${contrastRatio(bg, text).toFixed(1)}:1, aim for 4.5:1).`,
        { path: `palettes.${id}` },
      );
    if (contrastRatio(bg, muted) < 3)
      out.warning(
        'palette.contrast-muted',
        `Palette "${id}": muted text on background is hard to read (${contrastRatio(bg, muted).toFixed(1)}:1).`,
        { path: `palettes.${id}` },
      );
  }
  const usedTokens = new Set<string>();
  for (const { color, path } of colorsOf(
    { layout: theme.layout, components: theme.components, animations: theme.animations },
    '',
  )) {
    const token = color.slice(1);
    usedTokens.add(token);
    const missingIn = paletteIds.filter((id) => !theme.palettes[id]!.colors[token]);
    if (missingIn.length)
      out.error(
        'palette.unknown-token',
        `Colour token "${color}" is not defined in palette(s): ${missingIn.join(', ')}.`,
        { path },
      );
  }
  if (
    !usedTokens.has('background') &&
    typeof theme.layout.background === 'string' &&
    !theme.layout.background.startsWith('$')
  ) {
    out.info(
      'layout.background-literal',
      'The layout background is a literal colour; palettes cannot change it.',
    );
  }

  // --- components
  const flat = flattenComponents(theme.components);
  const ids = new Map<string, number>();
  for (const f of flat) ids.set(f.component.id, (ids.get(f.component.id) ?? 0) + 1);
  for (const [id, n] of ids)
    if (n > 1)
      out.error('component.duplicate-id', `Component id "${id}" is used ${n} times.`, {
        componentId: id,
      });

  for (const f of flat) {
    const c = f.component;
    const cid = c.id;
    // fonts
    for (const { path } of styleFonts(c)) {
      const fontId = path.value;
      if (!theme.fonts[fontId])
        out.error('font.unknown', `Font "${fontId}" is not defined in the theme's fonts.`, {
          componentId: cid,
          path: path.path,
        });
    }
    // bindings
    const bindings: Array<{ b: Component['binding']; path: string }> = [
      { b: c.binding, path: 'binding' },
    ];
    if (c.type === 'status.panel')
      c.props.rows.forEach((r, i) =>
        bindings.push({ b: r.binding, path: `props.rows[${i}].binding` }),
      );
    for (const { b, path } of bindings) {
      if (!b) continue;
      const def = getSignal(b.signal);
      if (!def) {
        out.error('signal.unknown', `Signal "${b.signal}" is not in the catalog.`, {
          componentId: cid,
          path,
        });
        continue;
      }
      if (profile && !profileHasSignal(profile, b.signal))
        out.warning(
          'signal.profile',
          `Signal "${b.signal}" is not available on vehicle profile "${profile.name}"; the component will show its fallback.`,
          { componentId: cid, path },
        );
      if (def.availability === 'experimental')
        out.warning(
          'signal.experimental',
          `Signal "${b.signal}" is experimental and not verified on real hardware.`,
          { componentId: cid, path },
        );
      else if (def.availability === 'model-dependent')
        out.info(
          'signal.model-dependent',
          `Signal "${b.signal}" depends on the engine/model (${def.description}).`,
          { componentId: cid, path },
        );
      if (b.unit && !sameDimension(def.unit, b.unit))
        out.error('binding.unit', `Unit "${b.unit}" cannot display "${b.signal}" (${def.unit}).`, {
          componentId: cid,
          path: `${path}.unit`,
        });
      if (b.min !== undefined && b.max !== undefined && b.min >= b.max)
        out.error('binding.range', `Binding range min (${b.min}) must be below max (${b.max}).`, {
          componentId: cid,
          path,
        });
      if (
        def.kind !== 'number' &&
        (c.type === 'gauge.arc' || c.type === 'gauge.bar' || c.type === 'indicator.shiftlights')
      ) {
        out.warning(
          'binding.kind',
          `Signal "${b.signal}" is ${def.kind}; a gauge expects a number.`,
          { componentId: cid, path },
        );
      }
    }
    if (
      (c.type === 'gauge.arc' ||
        c.type === 'gauge.bar' ||
        c.type === 'value.digital' ||
        c.type === 'indicator.shiftlights') &&
      !c.binding
    ) {
      out.warning(
        'binding.missing',
        `${c.type} "${cid}" has no signal bound and will show nothing useful.`,
        { componentId: cid, path: 'binding' },
      );
    }
    for (const s of conditionSignals(c.visibleWhen))
      if (!getSignal(s))
        out.error('signal.unknown', `Condition uses unknown signal "${s}".`, {
          componentId: cid,
          path: 'visibleWhen',
        });
    // animations
    c.animations.forEach((a, i) => {
      if (!theme.animations[a.clip])
        out.error('animation.unknown', `Animation clip "${a.clip}" does not exist.`, {
          componentId: cid,
          path: `animations[${i}].clip`,
        });
      if (a.trigger.on === 'change' && !getSignal(a.trigger.signal))
        out.error(
          'signal.unknown',
          `Animation trigger uses unknown signal "${a.trigger.signal}".`,
          { componentId: cid, path: `animations[${i}].trigger` },
        );
      if ('condition' in a.trigger)
        for (const s of conditionSignals(a.trigger.condition))
          if (!getSignal(s))
            out.error('signal.unknown', `Animation trigger uses unknown signal "${s}".`, {
              componentId: cid,
              path: `animations[${i}].trigger`,
            });
    });
    // assets
    if (c.type === 'image' && !theme.assets[c.props.asset])
      out.error('asset.unknown', `Image asset "${c.props.asset}" is not defined.`, {
        componentId: cid,
        path: 'props.asset',
      });
    if (
      c.type === 'telltale' &&
      c.props.icon === 'custom' &&
      (!c.props.asset || !theme.assets[c.props.asset])
    )
      out.error('asset.unknown', `Custom telltale needs an existing asset.`, {
        componentId: cid,
        path: 'props.asset',
      });
    // zones
    const zones =
      c.type === 'gauge.arc' || c.type === 'gauge.bar'
        ? c.props.fill.zones
        : c.type === 'value.digital'
          ? c.props.zones
          : [];
    zones.forEach((z, i) => {
      if (z.from >= z.to)
        out.error('zone.range', `Zone ${i} of "${cid}" has from (${z.from}) ≥ to (${z.to}).`, {
          componentId: cid,
          path: `zones[${i}]`,
        });
    });
    // glyph coverage
    for (const text of literalTexts(c)) {
      const missing = missingGlyphs(text);
      if (missing.length)
        out.warning(
          'text.glyphs',
          `"${text.slice(0, 24)}" uses characters the car font cannot draw: ${missing.map((m) => `"${m}"`).join(' ')}.`,
          { componentId: cid, hint: 'They are skipped on the car; the preview still shows them.' },
        );
    }
    // legibility: text colour vs layout background in each palette
    const textColor = textColorOf(c);
    if (textColor && INFORMATIVE_TYPES.has(c.type)) {
      for (const [pid, pal] of Object.entries(theme.palettes)) {
        const fg = textColor.startsWith('$') ? pal.colors[textColor.slice(1)] : textColor;
        const bgRef = fillColor(theme.layout.background) ?? '#000';
        const bg = bgRef.startsWith('$') ? pal.colors[bgRef.slice(1)] : bgRef;
        if (fg && bg && bg !== 'transparent') {
          const ratio = contrastRatio(parseColor(fg), parseColor(bg));
          if (ratio < 3)
            out.warning(
              'legibility.contrast',
              `"${cid}" text has low contrast against the background in palette "${pid}" (${ratio.toFixed(1)}:1).`,
              { componentId: cid },
            );
        }
      }
    }
  }

  // --- geometry
  for (const id of outOfBounds(theme))
    out.warning(
      'layout.out-of-bounds',
      `Component "${id}" extends outside the ${theme.layout.width}×${theme.layout.height} layout.`,
      { componentId: id },
    );
  for (const o of reservedZoneOverlaps(theme)) {
    const c = flat.find((f) => f.component.id === o.componentId)?.component;
    if (!c) continue;
    if (o.zone.kind === 'keep-clear' && INFORMATIVE_TYPES.has(c.type))
      out.error(
        'layout.keep-clear',
        `Component "${o.componentId}" enters the keep-clear zone "${o.zone.name}" (not visible on the car's glass).`,
        { componentId: o.componentId, hint: 'Move or shrink the component.' },
      );
    else if (o.zone.kind === 'keep-clear')
      out.info(
        'layout.keep-clear-decor',
        `Decorative "${o.componentId}" extends into "${o.zone.name}"; that part is not visible on the car.`,
        { componentId: o.componentId },
      );
    else if (o.zone.kind === 'factory' && INFORMATIVE_TYPES.has(c.type))
      out.warning(
        'layout.reserved',
        `Component "${o.componentId}" overlaps "${o.zone.name}", where the factory cluster draws over custom content.`,
        { componentId: o.componentId, hint: 'Keep essential readings out of factory zones.' },
      );
    else if (o.zone.kind === 'factory')
      out.info(
        'layout.reserved-decor',
        `Decorative "${o.componentId}" overlaps "${o.zone.name}"; it will be partly hidden by factory content.`,
        { componentId: o.componentId },
      );
  }

  // --- compiler mapping: layer budget and shader sanity
  const build = buildPieces(theme);
  out.findings.push(...build.findings);
  const layers = build.pieces.length + build.images.length;
  if (layers > RENDERER_LIMITS.layersPerApp)
    out.error(
      'budget.layers',
      `The theme needs ${layers} renderer layers; the cluster renderer allows ${RENDERER_LIMITS.layersPerApp} per app.`,
      { hint: 'Remove components or merge texts; see the Layers panel cost column.' },
    );
  else if (layers > RENDERER_LIMITS.layersRecommended)
    out.warning(
      'budget.layers',
      `The theme needs ${layers} renderer layers; keep it under ${RENDERER_LIMITS.layersRecommended} so other apps still fit (hard limit ${RENDERER_LIMITS.layersPerApp}).`,
    );
  if (layers === 0) out.warning('budget.empty', 'The theme has no visible components.');
  const atlasBytes = new Set(Object.values(theme.fonts).map((f) => f.family)).size * 344_064;
  const sprites = build.images.filter((i) => i.sprite).length;
  // One asset is the glyph atlas of the text.
  if (sprites + 1 > RENDERER_LIMITS.assetsPerClient) {
    out.error(
      'budget.assets',
      `${sprites} animations are placed but the car allows ${RENDERER_LIMITS.assetsPerClient - 1}.`,
      { hint: 'Remove some animations from the layout.' },
    );
  }
  const imageBytes = build.images.reduce((sum, i) => sum + i.iw * i.ih * 4, 0);
  if (imageBytes > 0) {
    const mib = (n: number) => (n / (1024 * 1024)).toFixed(1);
    const total = imageBytes + atlasBytes;
    const limit = RENDERER_LIMITS.pixelMemoryBytes;
    if (total > limit) {
      out.error(
        'budget.images',
        `Images need ${mib(total)} MiB of renderer memory; the cluster renderer has ${mib(limit)} MiB for all apps.`,
        {
          hint: 'Make images smaller or remove some: memory depends on their size on the cluster.',
        },
      );
    } else if (total > limit * 0.6) {
      out.warning(
        'budget.images',
        `Images need ${mib(total)} MiB of the renderer's ${mib(limit)} MiB, shared with other apps.`,
        { hint: 'Smaller images leave room for other apps and load faster.' },
      );
    }
  }
  for (const [kind, src] of Object.entries(SHADERS))
    for (const p of lintShader(src)) out.error('shader.lint', `Shader ${kind}: ${p}`);

  const report = finish(out);
  report.theme = theme;
  report.layers = layers;
  return report;
}

function finish(out: Collector): ValidationReport {
  const errors = out.findings.filter((f) => f.severity === 'error');
  const warnings = out.findings.filter((f) => f.severity === 'warning');
  const infos = out.findings.filter((f) => f.severity === 'info');
  return { ok: errors.length === 0, errors, warnings, infos };
}

function* styleFonts(c: Component): Generator<{ path: { path: string; value: string } }> {
  const walk = function* (
    v: unknown,
    path: string,
  ): Generator<{ path: { path: string; value: string } }> {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) yield* walk(v[i], `${path}[${i}]`);
      return;
    }
    const o = v as Record<string, unknown>;
    if (typeof o['font'] === 'string' && typeof o['size'] === 'number')
      yield { path: { path: `${path}.font`, value: o['font'] } };
    for (const [k, val] of Object.entries(o))
      if (k !== 'children') yield* walk(val, path ? `${path}.${k}` : k);
  };
  yield* walk(c.props, 'props');
}

function* literalTexts(c: Component): Generator<string> {
  switch (c.type) {
    case 'text':
      yield c.props.text.replace(/\{value\}|\{unit\}/g, '');
      break;
    case 'value.digital':
      if (c.props.label) yield c.props.label;
      break;
    case 'status.panel':
      for (const r of c.props.rows) yield r.label;
      break;
    case 'indicator.gear':
      for (const v of Object.values(c.props.mapping)) yield v;
      break;
  }
}

function textColorOf(c: Component): Color | undefined {
  switch (c.type) {
    case 'text':
      return c.props.style.color;
    case 'value.digital':
      return c.props.valueStyle.color;
    case 'clock':
      return c.props.style.color;
    case 'indicator.gear':
      return c.props.style.color;
    case 'status.panel':
      return c.props.valueStyle.color;
    case 'gauge.arc':
      return c.props.labels.show ? c.props.labels.style.color : undefined;
    default:
      return undefined;
  }
}

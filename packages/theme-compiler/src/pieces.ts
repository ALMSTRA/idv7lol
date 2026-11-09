import type {
  ArcGaugeComponent,
  BarGaugeComponent,
  Binding,
  Color,
  Component,
  Fill,
  Gradient,
  TextStyle,
  Theme,
  Zone,
} from '@idv7lol/theme-schema';
import {
  RENDERER_LIMITS,
  anchorFraction,
  flattenComponents,
  normalize,
  type FlatComponent,
} from '@idv7lol/theme-engine';
import { convert, getSignal, unitSymbol, type UnitId } from '@idv7lol/vehicle-signals';
import type {
  CompiledAnimation,
  CompiledBinding,
  CompiledImage,
  CompiledPiece,
  Dynamic,
  Finding,
  ShaderKind,
} from './types.js';

/** Glyph cells are 56×64 and the font is set at 0.92 of the cell height: layer height for a font size. */
export const GLYPH_LAYER_SCALE = 1 / 0.92;
/** Baseline position within a glyph cell, as a fraction of its height. */
export const GLYPH_BASELINE = 0.79;
export const MAX_GLYPHS = 32;

export const ICON_IDS: Record<string, number> = {
  'turn-left': 0,
  'turn-right': 1,
  'high-beam': 2,
  'low-beam': 3,
  'fog-rear': 4,
  'parking-brake': 5,
  cruise: 6,
  battery: 7,
  fuel: 8,
  engine: 9,
  oil: 10,
  coolant: 11,
  snowflake: 12,
};

export interface PieceBuild {
  pieces: CompiledPiece[];
  images: CompiledImage[];
  findings: Finding[];
  /** Assets referenced by image pieces, by component id. */
  assetRefs: Array<{ componentId: string; asset: string; key: string }>;
}

interface Ctx {
  theme: Theme;
  findings: Finding[];
  pieces: CompiledPiece[];
  images: CompiledImage[];
  assetRefs: PieceBuild['assetRefs'];
  z: number;
}

const TRANSPARENT: Color = 'transparent';

function warn(ctx: Ctx, code: string, message: string, componentId?: string, hint?: string): void {
  ctx.findings.push({ severity: 'warning', code, message, componentId, hint });
}
function info(ctx: Ctx, code: string, message: string, componentId?: string): void {
  ctx.findings.push({ severity: 'info', code, message, componentId });
}

/** Resolve a binding against the catalog so the runtime needs no catalog. */
export function compileBinding(b: Binding): CompiledBinding {
  const def = getSignal(b.signal);
  const unit: UnitId = b.unit ?? def?.unit ?? 'none';
  const conv = (v: number): number => {
    let out = v;
    if (def && b.unit && b.unit !== def.unit) {
      try {
        out = convert(out, def.unit, b.unit);
      } catch {
        /* reported by the validator */
      }
    }
    return out * b.scale + b.offset;
  };
  const dmin = def ? conv(def.min) : 0;
  const dmax = def ? conv(def.max) : 1;
  return {
    ...b,
    rangeMin: b.min ?? Math.min(dmin, dmax),
    rangeMax: b.max ?? Math.max(dmin, dmax),
    kind: def?.kind ?? 'number',
    catalogUnit: def?.unit ?? 'none',
    unitSymbol: unitSymbol(unit),
  };
}

function normZones(zones: Zone[], cb: CompiledBinding): Zone[] {
  return zones.map((z) => ({
    ...z,
    from: normalize(z.from, cb.rangeMin, cb.rangeMax),
    to: normalize(z.to, cb.rangeMin, cb.rangeMax),
  }));
}

/** Split a fill into a primary colour and an optional gradient end for the shaders. */
function fillUniforms(
  ctx: Ctx,
  fill: Fill | undefined,
  componentId: string,
  name = 'u_fill',
): { colors: Record<string, Color>; statics: Record<string, number[]> } {
  if (!fill)
    return {
      colors: { [name]: TRANSPARENT, [`${name}2`]: TRANSPARENT },
      statics: { u_grad: [0, 0, 0, 0] },
    };
  if (typeof fill === 'string')
    return {
      colors: { [name]: fill, [`${name}2`]: TRANSPARENT },
      statics: { u_grad: [0, 0, 0, 0] },
    };
  const g: Gradient = fill;
  if (g.stops.length > 2)
    warn(
      ctx,
      'fill.gradient-stops',
      `Gradients on the car use only the first and last stop (${g.stops.length} given).`,
      componentId,
    );
  if (g.type !== 'linear')
    warn(
      ctx,
      'fill.gradient-type',
      `${g.type} gradients are drawn as linear gradients on the car.`,
      componentId,
    );
  const a = g.stops[0]!.color;
  const b = g.stops[g.stops.length - 1]!.color;
  return { colors: { [name]: a, [`${name}2`]: b }, statics: { u_grad: [g.angle, 1, 0, 0] } };
}

function animationsOf(ctx: Ctx, c: Component): CompiledAnimation[] {
  const out: CompiledAnimation[] = [];
  for (const ref of c.animations) {
    const clip = ctx.theme.animations[ref.clip];
    if (!clip) continue;
    out.push({
      clip: ref.clip,
      duration: clip.duration,
      loop: clip.loop,
      direction: clip.direction,
      easing: clip.easing,
      trigger: ref.trigger as CompiledAnimation['trigger'],
      delay: ref.delay,
      tracks: clip.tracks.map((t) => ({
        property: t.property,
        keyframes: t.keyframes.map((k) => ({ t: k.t, value: k.value, easing: k.easing })),
      })),
    });
  }
  return out;
}

function basePiece(
  ctx: Ctx,
  f: FlatComponent,
  key: string,
  shader: ShaderKind,
  rect: { x: number; y: number; w: number; h: number },
): CompiledPiece {
  const c = f.component;
  const { fx, fy } = anchorFraction(c.anchor);
  const piece: CompiledPiece = {
    key,
    componentId: c.id,
    shader,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.max(1, Math.round(rect.w)),
    h: Math.max(1, Math.round(rect.h)),
    z: ctx.z++,
    rotation: c.rotation,
    opacity: c.opacity,
    usesFont: false,
    usesTime: false,
    statics: {},
    colors: {},
    dynamics: [],
    animations: animationsOf(ctx, c),
  };
  if (c.visibleWhen) piece.visibleWhen = c.visibleWhen;
  if (c.rotation !== 0) {
    // Pivot: the component's anchor point, expressed from this layer's top-left.
    piece.statics['_pivot'] = [f.absX + fx * c.width - rect.x, f.absY + fy * c.height - rect.y];
  }
  return piece;
}

/* -------------------------------------------------------------------------- */
/* Text                                                                       */
/* -------------------------------------------------------------------------- */

export interface TextLayerGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  align: number;
  tracking: number;
}

/** Where a text line's glyph layer goes for a style inside a box. */
export function textLayerGeometry(
  box: { x: number; y: number; w: number; h: number },
  style: TextStyle,
  lineIndex = 0,
  lineCount = 1,
  lineHeight = 1.2,
): TextLayerGeometry {
  const H = style.size * GLYPH_LAYER_SCALE;
  const lh = style.size * lineHeight;
  const total = lh * lineCount;
  let top: number;
  switch (style.baseline) {
    case 'top':
      top = box.y;
      break;
    case 'bottom':
      top = box.y + box.h - total;
      break;
    case 'middle':
      top = box.y + (box.h - total) / 2;
      break;
    default: {
      // alphabetic: the engine puts the baseline at h/2 + 0.35*size
      const baseline = box.y + box.h / 2 + style.size * 0.35;
      top = baseline - GLYPH_BASELINE * H + (H - lh) / 2 - (lineCount - 1) * lh * 0.5;
      break;
    }
  }
  const lineTop = top + lineIndex * lh + (lh - H) / 2;
  const align = style.align === 'left' ? 0 : style.align === 'right' ? 1 : 0.5;
  return { x: box.x, y: lineTop, w: box.w, h: H, align, tracking: style.letterSpacing / H };
}

function textPiece(
  ctx: Ctx,
  f: FlatComponent,
  key: string,
  box: { x: number; y: number; w: number; h: number },
  style: TextStyle,
  dyn: Dynamic,
  opts: {
    color?: Color;
    color2?: Color;
    scale2?: number;
    glow?: Color;
    line?: number;
    lines?: number;
    lineHeight?: number;
  } = {},
): CompiledPiece {
  const g = textLayerGeometry(box, style, opts.line ?? 0, opts.lines ?? 1, opts.lineHeight ?? 1.2);
  const piece = basePiece(ctx, f, key, 'text', g);
  piece.usesFont = true;
  piece.colors['u_color'] = opts.color ?? style.color;
  piece.colors['u_color2'] = opts.color2 ?? style.color;
  piece.statics['u_scale2'] = [opts.scale2 ?? 1];
  piece.statics['u_glow'] = [0, 0, 0, 0];
  if (opts.glow) piece.colors['u_glow'] = opts.glow;
  piece.dynamics.push(dyn);
  return piece;
}

const staticText = (
  template: string,
  style: TextStyle,
  align: number,
  tracking: number,
  secondary?: { text: string; scale: number },
): Dynamic => ({
  kind: 'text',
  template,
  format: '0',
  align,
  tracking,
  uppercase: style.uppercase,
  ...(secondary ? { secondary } : {}),
});

/* -------------------------------------------------------------------------- */
/* Per component                                                              */
/* -------------------------------------------------------------------------- */

function buildShape(ctx: Ctx, f: FlatComponent): void {
  const c = f.component;
  const abs = { x: f.absX, y: f.absY, w: c.width, h: c.height };
  if (c.type === 'rect' || c.type === 'ellipse') {
    const p = c.props;
    const piece = basePiece(ctx, f, c.id, 'flat', abs);
    const fu = fillUniforms(ctx, p.fill, c.id);
    Object.assign(piece.colors, fu.colors);
    Object.assign(piece.statics, fu.statics);
    piece.colors['u_stroke'] = p.stroke?.color ?? TRANSPARENT;
    piece.statics['u_shape'] = [
      c.type === 'rect' ? 0 : 1,
      c.type === 'rect' ? c.props.radius : 0,
      p.stroke?.width ?? 0,
      0,
    ];
    if ('shadow' in p && p.shadow)
      info(ctx, 'shape.shadow', 'Drop shadows are not drawn on the car.', c.id);
    ctx.pieces.push(piece);
  } else if (c.type === 'line') {
    const p = c.props;
    const grow = p.stroke.width;
    const piece = basePiece(ctx, f, c.id, 'flat', {
      x: abs.x - grow,
      y: abs.y - grow,
      w: abs.w + grow * 2,
      h: abs.h + grow * 2,
    });
    const shape = { horizontal: 2, vertical: 3, diagonal: 4, 'diagonal-flip': 5 }[p.direction];
    piece.colors['u_fill'] = TRANSPARENT;
    piece.colors['u_fill2'] = TRANSPARENT;
    piece.colors['u_stroke'] = p.stroke.color;
    piece.statics['u_grad'] = [0, 0, 0, 0];
    piece.statics['u_shape'] = [shape, 0, p.stroke.width, 0];
    if (p.stroke.dash) info(ctx, 'line.dash', 'Dashed lines are drawn solid on the car.', c.id);
    ctx.pieces.push(piece);
  } else if (c.type === 'arc') {
    const p = c.props;
    const piece = basePiece(ctx, f, c.id, 'arc-band', abs);
    const R = Math.min(abs.w, abs.h) / 2;
    piece.statics['u_arc'] = [p.startAngle, p.sweepAngle, 0, 0];
    piece.statics['u_geo'] = [R, p.stroke.width, 0, R - p.stroke.width / 2];
    piece.statics['u_value'] = [0];
    piece.statics['u_red'] = [2, 0, 0, 0];
    piece.statics['u_seg'] = [0, 1, 0, 0];
    piece.statics['u_zone'] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    piece.statics['u_glow'] = [0, 0, 0, 0];
    piece.colors['u_track'] = p.stroke.color;
    piece.colors['u_fill'] = TRANSPARENT;
    piece.colors['u_fill2'] = TRANSPARENT;
    piece.colors['u_redc'] = TRANSPARENT;
    piece.colors['u_glowc'] = TRANSPARENT;
    piece.colors['u_zonec'] = TRANSPARENT;
    if (abs.w !== abs.h)
      warn(
        ctx,
        'arc.ellipse',
        'Elliptical arcs are drawn as circles on the car; make the box square.',
        c.id,
      );
    if (p.fill)
      warn(ctx, 'arc.fill', 'Pie fills of decorative arcs are not drawn on the car.', c.id);
    ctx.pieces.push(piece);
  }
}

function buildText(ctx: Ctx, f: FlatComponent): void {
  const c = f.component;
  if (c.type !== 'text') return;
  const p = c.props;
  const abs = { x: f.absX, y: f.absY, w: c.width, h: c.height };
  const style = p.style;
  const align = style.align === 'left' ? 0 : style.align === 'right' ? 1 : 0.5;
  const g = textLayerGeometry(abs, style);
  const dyn: Dynamic = {
    kind: 'text',
    template: p.text,
    format: p.format,
    align,
    tracking: g.tracking,
    uppercase: style.uppercase,
    ...(c.binding ? { binding: compileBinding(c.binding) } : {}),
  };
  if (p.wrap && !c.binding) {
    // Static wrapped text: one layer per line, split on explicit newlines and length.
    const lines = wrapStatic(p.text, Math.max(1, Math.floor(abs.w / (style.size * 0.5))));
    lines.forEach((line, i) => {
      ctx.pieces.push(
        textPiece(ctx, f, `${c.id}:l${i}`, abs, style, staticText(line, style, align, g.tracking), {
          line: i,
          lines: lines.length,
          lineHeight: p.lineHeight,
        }),
      );
    });
    return;
  }
  if (p.text.length > MAX_GLYPHS)
    warn(
      ctx,
      'text.too-long',
      `Text layers show at most ${MAX_GLYPHS} glyphs; "${p.text.slice(0, 20)}…" is longer.`,
      c.id,
      'Shorten the text or enable wrapping.',
    );
  ctx.pieces.push(textPiece(ctx, f, c.id, abs, style, dyn));
}

function wrapStatic(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${word}` : word;
      if (line && cand.length > Math.min(maxChars, MAX_GLYPHS)) {
        out.push(line);
        line = word;
      } else line = cand;
    }
    out.push(line);
  }
  return out;
}

function buildImage(ctx: Ctx, f: FlatComponent): void {
  const c = f.component;
  if (c.type !== 'image') return;
  if (!ctx.theme.assets[c.props.asset]) return; // validator reports it
  const key = `${c.id}:img`;
  ctx.assetRefs.push({ componentId: c.id, asset: c.props.asset, key });
  if (c.props.edits.tint?.color.startsWith('$')) {
    info(
      ctx,
      'image.tint-palette',
      'The image tint is baked with the default palette; it does not change with the palette on the car.',
      c.id,
    );
  }
  const { fx, fy } = anchorFraction(c.anchor);
  ctx.images.push({
    key,
    componentId: c.id,
    x: Math.round(f.absX),
    y: Math.round(f.absY),
    w: Math.round(c.width),
    h: Math.round(c.height),
    z: ctx.z++,
    // The renderer limits image layers; a larger box is drawn scaled up.
    iw: Math.max(1, Math.min(RENDERER_LIMITS.imageMaxWidth, Math.round(c.width))),
    ih: Math.max(1, Math.min(RENDERER_LIMITS.imageMaxHeight, Math.round(c.height))),
    file: `images/${c.id}.rgba`,
    opacity: c.opacity,
    rotation: c.rotation,
    pivotX: fx * c.width,
    pivotY: fy * c.height,
    ...(c.visibleWhen ? { visibleWhen: c.visibleWhen } : {}),
  });
}

function zoneStatics(
  zones: Zone[],
  cb: CompiledBinding | undefined,
): { statics: number[]; colors: Color[] } {
  const statics: number[] = [];
  const colors: Color[] = [];
  const nz = cb ? normZones(zones, cb) : [];
  for (let i = 0; i < 4; i++) {
    const z = nz[i];
    statics.push(z ? z.from : 0, z ? z.to : 0, z ? 1 : 0, 0);
    colors.push(z ? z.color : TRANSPARENT);
  }
  return { statics, colors };
}

function buildArcGauge(ctx: Ctx, f: FlatComponent, c: ArcGaugeComponent): void {
  const p = c.props;
  const abs = { x: f.absX, y: f.absY, w: c.width, h: c.height };
  const cb = c.binding ? compileBinding(c.binding) : undefined;
  const R = Math.min(abs.w, abs.h) / 2;
  const cx = abs.x + abs.w / 2;
  const cy = abs.y + abs.h / 2;
  const square = { x: cx - R, y: cy - R, w: R * 2, h: R * 2 };
  if (abs.w !== abs.h)
    info(
      ctx,
      'gauge.square',
      'Arc gauges are drawn in the largest centred square of their box.',
      c.id,
    );
  if (p.fill.zones.length > 4)
    warn(ctx, 'gauge.zones', 'Only the first 4 colour zones are drawn on the car.', c.id);

  let outer = R;
  const redFrom = cb && p.redline.show ? normalize(p.redline.from, cb.rangeMin, cb.rangeMax) : 2;
  if (p.redline.show && p.redline.placement === 'outer') outer -= p.redline.width + 4;
  const trackWidth = p.track.show ? p.track.width : 0;
  const fillWidth = p.fill.show ? p.fill.width : 0;
  const bandWidth = Math.max(trackWidth, fillWidth);
  const bandR = outer - bandWidth / 2;

  const band = basePiece(ctx, f, `${c.id}:band`, 'arc-band', square);
  band.statics['u_arc'] = [p.startAngle, p.sweepAngle, 0, 0];
  band.statics['u_geo'] = [R, trackWidth, fillWidth, bandR];
  band.statics['u_value'] = [0];
  band.statics['u_red'] = [
    redFrom,
    p.redline.width,
    p.redline.placement === 'outer' ? 0 : 1,
    p.redline.show ? 1 : 0,
  ];
  band.statics['u_seg'] = [
    p.fill.mode === 'segments' ? 1 : 0,
    p.fill.segments,
    p.fill.segmentGap,
    p.fill.cap === 'round' ? 1 : 0,
  ];
  band.statics['u_glow'] = [p.glow.show ? 1 : 0, p.glow.blur, 0, 0];
  const zs = zoneStatics(p.fill.zones, cb);
  band.statics['u_zone'] = zs.statics;
  band.colors['u_track'] = p.track.show ? p.track.color : TRANSPARENT;
  const fu = fillUniforms(ctx, p.fill.show ? p.fill.color : undefined, c.id);
  band.colors['u_fill'] = fu.colors['u_fill']!;
  band.colors['u_fill2'] = fu.colors['u_fill2']!;
  band.colors['u_redc'] = p.redline.color;
  band.colors['u_glowc'] = p.glow.color;
  band.colors['u_zonec'] = zs.colors as unknown as Color; // array; see colorArrays below
  (band as unknown as { colorArrays: Record<string, Color[]> }).colorArrays = {
    u_zonec: zs.colors,
  };
  delete band.colors['u_zonec'];
  if (cb) band.dynamics.push({ kind: 'norm', uniform: 'u_value', binding: cb });
  if (p.fill.cap === 'round')
    info(ctx, 'gauge.cap', 'Round arc caps are drawn square on the car.', c.id);
  ctx.pieces.push(band);

  const tickOuter = outer - bandWidth - p.ticks.inset - 4;
  if (
    (p.ticks.major > 0 && (p.ticks.majorLength > 0 || p.ticks.minorLength > 0)) ||
    (p.labels.show && p.ticks.major > 0)
  ) {
    const t = basePiece(ctx, f, `${c.id}:ticks`, 'arc-ticks', square);
    t.usesFont = true;
    t.statics['u_arc'] = [p.startAngle, p.sweepAngle, 0, 0];
    t.statics['u_ticks'] = [p.ticks.major, p.ticks.minor, p.ticks.majorLength, p.ticks.minorLength];
    t.statics['u_tickw'] = [
      p.ticks.majorWidth,
      p.ticks.minorWidth,
      tickOuter,
      p.ticks.redlineColor ? redFrom : 2,
    ];
    const labelR = tickOuter - p.ticks.majorLength - p.labels.inset;
    const glyphH = p.labels.style.size * GLYPH_LAYER_SCALE;
    t.statics['u_labels'] = [p.labels.show ? 1 : 0, p.labels.every, labelR, glyphH];
    t.statics['u_range'] = [cb?.rangeMin ?? 0, cb?.rangeMax ?? 100, p.labels.divisor, 0];
    t.colors['u_tickc'] = p.ticks.color;
    t.colors['u_minorc'] = p.ticks.minorColor ?? p.ticks.color;
    t.colors['u_redc'] = p.ticks.redlineColor ?? p.ticks.color;
    t.colors['u_labelc'] = p.labels.style.color;
    if (p.labels.show && /\.0/.test(p.labels.format))
      warn(
        ctx,
        'gauge.label-decimals',
        'Gauge numerals are drawn as integers on the car.',
        c.id,
        'Use a divisor (e.g. 1000 for rpm) instead of decimals.',
      );
    ctx.pieces.push(t);
  }

  if (p.valueText.show && cb) {
    const vs = { ...p.valueText.style, align: 'center' as const, baseline: 'middle' as const };
    const box = {
      x: cx - R + p.valueText.offsetX,
      y: cy - vs.size / 2 + p.valueText.offsetY,
      w: R * 2,
      h: vs.size,
    };
    ctx.pieces.push(
      textPiece(ctx, f, `${c.id}:value`, box, vs, {
        kind: 'text',
        binding: cb,
        template: '{value}',
        format: p.valueText.format,
        align: 0.5,
        tracking: 0,
        uppercase: false,
      }),
    );
    if (p.valueText.showUnit) {
      const us = {
        ...p.valueText.unitStyle,
        align: 'center' as const,
        baseline: 'middle' as const,
      };
      const ubox = {
        x: cx - R + p.valueText.offsetX,
        y: cy + vs.size * 0.75 - us.size / 2 + p.valueText.offsetY,
        w: R * 2,
        h: us.size,
      };
      const unit = unitSymbol(p.valueText.unit ?? cb.unit ?? getSignal(cb.signal)?.unit ?? 'none');
      ctx.pieces.push(textPiece(ctx, f, `${c.id}:unit`, ubox, us, staticText(unit, us, 0.5, 0)));
    }
  }

  if (p.needle.show && cb) {
    const n = basePiece(ctx, f, `${c.id}:needle`, 'needle', square);
    n.statics['u_angle'] = [p.startAngle];
    n.statics['u_needle'] = [
      p.needle.length * R,
      p.needle.tail * R,
      p.needle.width,
      { tapered: 0, bar: 1, arrow: 2 }[p.needle.shape],
    ];
    n.statics['u_cap'] = [p.needle.cap.radius, p.needle.cap.show ? 1 : 0, 0, 0];
    n.statics['u_shadow'] = [p.needle.shadow ? 1 : 0, p.needle.shadow?.blur ?? 0, 0, 0];
    n.colors['u_color'] = p.needle.color;
    n.colors['u_capc'] = p.needle.cap.color;
    n.dynamics.push({
      kind: 'angle',
      uniform: 'u_angle',
      binding: cb,
      from: p.startAngle,
      sweep: p.sweepAngle,
    });
    ctx.pieces.push(n);
  }
}

function buildBarGauge(ctx: Ctx, f: FlatComponent, c: BarGaugeComponent): void {
  const p = c.props;
  const abs = { x: f.absX, y: f.absY, w: c.width, h: c.height };
  const cb = c.binding ? compileBinding(c.binding) : undefined;
  const horiz = p.orientation === 'horizontal';
  const bar = basePiece(ctx, f, `${c.id}:bar`, 'bar', abs);
  bar.statics['u_geo'] = [
    horiz ? 0 : 1,
    p.direction === 'forward' ? 0 : 1,
    p.track.radius,
    p.fill.radius,
  ];
  bar.statics['u_value'] = [0];
  bar.statics['u_seg'] = [
    p.fill.mode === 'segments' ? 1 : 0,
    p.fill.segments,
    p.fill.segmentGap,
    0,
  ];
  const zs = zoneStatics(p.fill.zones, cb);
  bar.statics['u_zone'] = zs.statics;
  (bar as unknown as { colorArrays: Record<string, Color[]> }).colorArrays = { u_zonec: zs.colors };
  bar.statics['u_marker'] = [
    p.marker.show ? 1 : 0,
    cb ? normalize(p.marker.value, cb.rangeMin, cb.rangeMax) : 0,
    p.marker.width,
    0,
  ];
  bar.statics['u_strokew'] = [p.track.stroke?.width ?? 0, 0, 0, 0];
  bar.statics['u_glow'] = [p.glow.show ? 1 : 0, p.glow.blur, 0, 0];
  bar.colors['u_track'] = p.track.show ? p.track.color : TRANSPARENT;
  const fu = fillUniforms(ctx, p.fill.color, c.id);
  bar.colors['u_fill'] = fu.colors['u_fill']!;
  bar.colors['u_fill2'] = fu.colors['u_fill2']!;
  bar.colors['u_markerc'] = p.marker.color;
  bar.colors['u_stroke'] = p.track.stroke?.color ?? TRANSPARENT;
  bar.colors['u_glowc'] = p.glow.color;
  if (cb) bar.dynamics.push({ kind: 'norm', uniform: 'u_value', binding: cb });
  ctx.pieces.push(bar);

  if (p.ticks.show || p.labels.show) {
    const glyphH = p.labels.style.size * GLYPH_LAYER_SCALE;
    const margin =
      (p.ticks.show ? p.ticks.length : 0) + (p.labels.show ? p.labels.offset + glyphH : 0) + 4;
    const rect = horiz
      ? { x: abs.x - glyphH, y: abs.y - margin, w: abs.w + glyphH * 2, h: abs.h + margin * 2 }
      : { x: abs.x - margin, y: abs.y - glyphH, w: abs.w + margin * 2, h: abs.h + glyphH * 2 };
    const t = basePiece(ctx, f, `${c.id}:ticks`, 'bar-ticks', rect);
    t.usesFont = true;
    const barOffset = horiz ? abs.y - rect.y : abs.x - rect.x;
    const barCross = horiz ? abs.h : abs.w;
    const barStart = horiz ? abs.x - rect.x : rect.y + rect.h - (abs.y + abs.h);
    t.statics['u_geo'] = [horiz ? 0 : 1, p.direction === 'forward' ? 0 : 1, barOffset, barCross];
    t.statics['u_bar'] = [barStart, horiz ? abs.w : abs.h, 0, 0];
    t.statics['u_ticks'] = [p.ticks.show ? 1 : 0, p.ticks.count, p.ticks.length, p.ticks.width];
    t.statics['u_side'] = [
      p.ticks.side === 'before' || p.ticks.side === 'both' ? 1 : 0,
      p.ticks.side === 'after' || p.ticks.side === 'both' ? 1 : 0,
      0,
      0,
    ];
    t.statics['u_labels'] = [
      p.labels.show ? 1 : 0,
      p.ticks.show ? p.ticks.count : 2,
      glyphH,
      p.labels.offset,
    ];
    t.statics['u_range'] = [cb?.rangeMin ?? 0, cb?.rangeMax ?? 100, p.labels.divisor, 0];
    t.colors['u_tickc'] = p.ticks.color;
    t.colors['u_labelc'] = p.labels.style.color;
    ctx.pieces.push(t);
  }
}

function buildDigital(ctx: Ctx, f: FlatComponent): void {
  const c = f.component;
  if (c.type !== 'value.digital') return;
  const p = c.props;
  const abs = { x: f.absX, y: f.absY, w: c.width, h: c.height };
  const cb = c.binding ? compileBinding(c.binding) : undefined;
  if (p.background) {
    const bg = basePiece(ctx, f, `${c.id}:bg`, 'panel', abs);
    const fu = fillUniforms(ctx, p.background, c.id);
    Object.assign(bg.colors, fu.colors);
    Object.assign(bg.statics, fu.statics);
    bg.colors['u_stroke'] = p.stroke?.color ?? TRANSPARENT;
    bg.statics['u_shape'] = [p.radius, p.stroke?.width ?? 0, 0, 0];
    bg.statics['u_div'] = [0, 0, 0, 0];
    bg.colors['u_divc'] = TRANSPARENT;
    ctx.pieces.push(bg);
  }
  const pad = p.padding;
  const inner = { x: abs.x + pad, y: abs.y + pad, w: abs.w - pad * 2, h: abs.h - pad * 2 };
  const unit =
    cb && p.showUnit ? unitSymbol(p.unit ?? cb.unit ?? getSignal(cb.signal)?.unit ?? 'none') : '';
  const vs = { ...p.valueStyle, baseline: 'middle' as const };
  const us = { ...p.unitStyle, baseline: 'middle' as const };
  const ls = { ...p.labelStyle, baseline: 'middle' as const };
  const hasLabel = p.label !== '';
  const valueDyn = (secondary?: { text: string; scale: number }, align = 0.5): Dynamic => ({
    kind: 'text',
    ...(cb ? { binding: cb } : {}),
    template: '{value}',
    format: p.format,
    align,
    tracking: 0,
    uppercase: false,
    ...(secondary ? { secondary } : {}),
    ...(p.zones.length ? { zones: p.zones } : {}),
  });
  const alignOf = (s: TextStyle) => (s.align === 'left' ? 0 : s.align === 'right' ? 1 : 0.5);

  if (p.layout === 'inline') {
    const labelH = hasLabel ? ls.size * 1.4 : 0;
    const row = { x: inner.x, y: inner.y + labelH, w: inner.w, h: inner.h - labelH };
    if (hasLabel)
      ctx.pieces.push(
        textPiece(
          ctx,
          f,
          `${c.id}:label`,
          { ...inner, h: labelH },
          ls,
          staticText(p.label, ls, alignOf(ls), 0),
        ),
      );
    ctx.pieces.push(
      textPiece(
        ctx,
        f,
        `${c.id}:value`,
        row,
        vs,
        valueDyn(unit ? { text: unit, scale: us.size / vs.size } : undefined, alignOf(vs)),
        { color2: us.color, scale2: us.size / vs.size },
      ),
    );
  } else if (p.layout === 'label-left') {
    if (hasLabel)
      ctx.pieces.push(
        textPiece(
          ctx,
          f,
          `${c.id}:label`,
          inner,
          { ...ls, align: 'left' },
          staticText(p.label, ls, 0, 0),
        ),
      );
    ctx.pieces.push(
      textPiece(
        ctx,
        f,
        `${c.id}:value`,
        inner,
        { ...vs, align: 'right' },
        valueDyn(unit ? { text: unit, scale: us.size / vs.size } : undefined, 1),
        { color2: us.color, scale2: us.size / vs.size },
      ),
    );
  } else {
    const labelH = hasLabel ? ls.size * 1.4 : 0;
    const unitH = unit ? us.size * 1.4 : 0;
    const valueH = Math.max(vs.size, inner.h - labelH - unitH);
    if (hasLabel)
      ctx.pieces.push(
        textPiece(
          ctx,
          f,
          `${c.id}:label`,
          { ...inner, h: labelH },
          ls,
          staticText(p.label, ls, alignOf(ls), 0),
        ),
      );
    ctx.pieces.push(
      textPiece(
        ctx,
        f,
        `${c.id}:value`,
        { x: inner.x, y: inner.y + labelH, w: inner.w, h: valueH },
        vs,
        valueDyn(undefined, alignOf(vs)),
      ),
    );
    if (unit)
      ctx.pieces.push(
        textPiece(
          ctx,
          f,
          `${c.id}:unit`,
          { x: inner.x, y: inner.y + labelH + valueH, w: inner.w, h: unitH },
          us,
          staticText(unit, us, alignOf(us), 0),
        ),
      );
  }
}

function buildGear(ctx: Ctx, f: FlatComponent): void {
  const c = f.component;
  if (c.type !== 'indicator.gear') return;
  const p = c.props;
  const abs = { x: f.absX, y: f.absY, w: c.width, h: c.height };
  const cb = c.binding
    ? compileBinding(c.binding)
    : compileBinding({
        signal: 'transmission.gear',
        scale: 1,
        offset: 0,
        clamp: true,
        smoothing: 0,
        fallback: 'dash',
      });
  if (p.background) {
    const bg = basePiece(ctx, f, `${c.id}:bg`, 'panel', abs);
    const fu = fillUniforms(ctx, p.background, c.id);
    Object.assign(bg.colors, fu.colors);
    Object.assign(bg.statics, fu.statics);
    bg.colors['u_stroke'] = TRANSPARENT;
    bg.statics['u_shape'] = [p.radius, 0, 0, 0];
    bg.statics['u_div'] = [0, 0, 0, 0];
    bg.colors['u_divc'] = TRANSPARENT;
    ctx.pieces.push(bg);
  }
  const gs = { ...p.style, align: 'center' as const, baseline: 'middle' as const };
  const ms = { ...p.modeStyle, align: 'center' as const, baseline: 'middle' as const };
  const gearDyn: Dynamic = {
    kind: 'gear',
    binding: cb,
    mapping: p.mapping,
    modeSignal: p.modeSignal,
    ...(p.manualColor ? { manualColor: p.manualColor } : {}),
  };
  if (p.showMode) {
    const total = gs.size + ms.size * 1.2;
    const top = abs.y + (abs.h - total) / 2;
    ctx.pieces.push(
      textPiece(ctx, f, `${c.id}:gear`, { x: abs.x, y: top, w: abs.w, h: gs.size }, gs, gearDyn),
    );
    ctx.pieces.push(
      textPiece(
        ctx,
        f,
        `${c.id}:mode`,
        { x: abs.x, y: top + gs.size, w: abs.w, h: ms.size * 1.2 },
        ms,
        { kind: 'mode-text', modeSignal: p.modeSignal },
      ),
    );
  } else {
    ctx.pieces.push(textPiece(ctx, f, `${c.id}:gear`, abs, gs, gearDyn));
  }
}

function buildShiftLights(ctx: Ctx, f: FlatComponent): void {
  const c = f.component;
  if (c.type !== 'indicator.shiftlights') return;
  const p = c.props;
  const abs = { x: f.absX, y: f.absY, w: c.width, h: c.height };
  const cb = c.binding ? compileBinding(c.binding) : undefined;
  const grow = p.glow ? Math.min(abs.w / p.count, abs.h) * 0.6 : 0;
  const piece = basePiece(ctx, f, c.id, 'shiftlights', {
    x: abs.x - grow,
    y: abs.y - grow,
    w: abs.w + grow * 2,
    h: abs.h + grow * 2,
  });
  // The shader lays lights out over the full layer; pass the inner geometry through u_cfg gap and count.
  piece.statics['u_cfg'] = [
    p.count,
    { circle: 0, rect: 1, pill: 2 }[p.shape],
    p.gap,
    p.glow ? 1 : 0,
  ];
  piece.statics['u_lit'] = [0];
  piece.statics['u_flash'] = [0];
  piece.statics['u_sym'] = [p.symmetric ? 1 : 0];
  const colors: Color[] = [];
  for (let i = 0; i < 32; i++) colors.push(p.colors[Math.min(i, p.colors.length - 1)]!);
  (piece as unknown as { colorArrays: Record<string, Color[]> }).colorArrays = { u_colors: colors };
  piece.colors['u_off'] = p.offColor;
  if (grow > 0) {
    // Compensate the glow margin: shrink the drawing to the original box.
    piece.statics['_inset'] = [grow];
  }
  if (cb)
    piece.dynamics.push({
      kind: 'shiftlights',
      binding: cb,
      from: p.from,
      to: p.to,
      count: p.count,
      flashAbove: p.flashAbove,
      flashRateHz: p.flashRateHz,
    });
  ctx.pieces.push(piece);
}

function buildClock(ctx: Ctx, f: FlatComponent): void {
  const c = f.component;
  if (c.type !== 'clock') return;
  const p = c.props;
  const abs = { x: f.absX, y: f.absY, w: c.width, h: c.height };
  const g = textLayerGeometry(abs, p.style);
  ctx.pieces.push(
    textPiece(ctx, f, c.id, abs, p.style, {
      kind: 'clock',
      format: p.format,
      showSeconds: p.showSeconds,
      showSuffix: p.showSuffix,
      blinkColon: p.blinkColon,
      align: g.align,
    }),
  );
}

function buildTelltale(ctx: Ctx, f: FlatComponent): void {
  const c = f.component;
  if (c.type !== 'telltale') return;
  const p = c.props;
  const abs = { x: f.absX, y: f.absY, w: c.width, h: c.height };
  const cb = c.binding ? compileBinding(c.binding) : undefined;
  if (p.icon === 'custom') {
    warn(
      ctx,
      'telltale.custom',
      'Custom telltale icons are not drawn on the car yet.',
      c.id,
      'Use one of the built-in icons.',
    );
    return;
  }
  const size = Math.min(abs.w, abs.h);
  const piece = basePiece(ctx, f, c.id, 'telltale', {
    x: abs.x + (abs.w - size) / 2,
    y: abs.y + (abs.h - size) / 2,
    w: size,
    h: size,
  });
  piece.usesFont = true;
  piece.statics['u_icon'] = [ICON_IDS[p.icon] ?? 0];
  piece.statics['u_code_p'] = [0]; // filled by the compiler from the atlas
  piece.colors['u_color'] = p.offColor;
  if (cb)
    piece.dynamics.push({
      kind: 'telltale',
      binding: cb,
      onColor: p.onColor,
      offColor: p.offColor,
      hideWhenOff: p.hideWhenOff,
    });
  ctx.pieces.push(piece);
}

function buildStatusPanel(ctx: Ctx, f: FlatComponent): void {
  const c = f.component;
  if (c.type !== 'status.panel') return;
  const p = c.props;
  const abs = { x: f.absX, y: f.absY, w: c.width, h: c.height };
  if (p.background || p.divider) {
    const bg = basePiece(ctx, f, `${c.id}:bg`, 'panel', abs);
    const fu = fillUniforms(ctx, p.background, c.id);
    Object.assign(bg.colors, fu.colors);
    Object.assign(bg.statics, fu.statics);
    bg.colors['u_stroke'] = TRANSPARENT;
    bg.statics['u_shape'] = [p.radius, 0, 0, 0];
    bg.statics['u_div'] = [
      p.divider ? p.rows.length - 1 : 0,
      p.rowHeight,
      p.padding,
      p.divider?.width ?? 0,
    ];
    bg.colors['u_divc'] = p.divider?.color ?? TRANSPARENT;
    ctx.pieces.push(bg);
  }
  const ls = { ...p.labelStyle, align: 'left' as const, baseline: 'middle' as const };
  const vs = { ...p.valueStyle, align: 'right' as const, baseline: 'middle' as const };
  const us = { ...p.unitStyle };
  const scale2 = ls.size / vs.size;
  if (Math.abs(us.size - ls.size) > 2)
    info(
      ctx,
      'panel.unit-size',
      'Status panel units are drawn at the label size on the car.',
      c.id,
    );
  p.rows.forEach((row, i) => {
    const rowBox = {
      x: abs.x + p.padding,
      y: abs.y + p.padding + i * p.rowHeight,
      w: abs.w - p.padding * 2,
      h: p.rowHeight,
    };
    const cb = compileBinding(row.binding);
    const unit = row.showUnit
      ? unitSymbol(row.unit ?? cb.unit ?? getSignal(cb.signal)?.unit ?? 'none')
      : '';
    // One layer per row: label glyphs are secondary (left), value primary (right), unit secondary after it.
    ctx.pieces.push(
      textPiece(
        ctx,
        f,
        `${c.id}:row${i}`,
        rowBox,
        vs,
        {
          kind: 'text',
          binding: cb,
          template: `\u0001${row.label}\u0002{value}`,
          format: row.format,
          align: 1,
          tracking: 0,
          uppercase: false,
          ...(unit ? { secondary: { text: unit, scale: scale2 } } : {}),
        },
        { color2: ls.color, scale2 },
      ),
    );
  });
}

/* -------------------------------------------------------------------------- */

export function buildPieces(theme: Theme): PieceBuild {
  const ctx: Ctx = { theme, findings: [], pieces: [], images: [], assetRefs: [], z: 0 };
  const flat = flattenComponents(theme.components);
  for (const f of flat) {
    const c = f.component;
    if (!c.visible) continue;
    switch (c.type) {
      case 'rect':
      case 'ellipse':
      case 'line':
      case 'arc':
        buildShape(ctx, f);
        break;
      case 'text':
        buildText(ctx, f);
        break;
      case 'image':
        buildImage(ctx, f);
        break;
      case 'gauge.arc':
        buildArcGauge(ctx, f, c);
        break;
      case 'gauge.bar':
        buildBarGauge(ctx, f, c);
        break;
      case 'value.digital':
        buildDigital(ctx, f);
        break;
      case 'indicator.gear':
        buildGear(ctx, f);
        break;
      case 'indicator.shiftlights':
        buildShiftLights(ctx, f);
        break;
      case 'clock':
        buildClock(ctx, f);
        break;
      case 'telltale':
        buildTelltale(ctx, f);
        break;
      case 'status.panel':
        buildStatusPanel(ctx, f);
        break;
      case 'group':
        if (c.props.clip)
          info(ctx, 'group.clip', 'Group clipping is not applied on the car.', c.id);
        break;
    }
  }
  return {
    pieces: ctx.pieces,
    images: ctx.images,
    findings: ctx.findings,
    assetRefs: ctx.assetRefs,
  };
}

import type {
  DigitalValueComponent,
  GearIndicatorComponent,
  ShiftLightsComponent,
  StatusPanelComponent,
  TelltaleComponent,
} from '@idv7lol/theme-schema';
import { unitSymbol } from '@idv7lol/vehicle-signals';
import { clamp, normalize } from '../math.js';
import { drawIcon } from './icons.js';
import { textOrigin } from './text.js';
import type { ComponentRenderer } from './types.js';

/* -------------------------------------------------------------------------- */
/* Digital value                                                              */
/* -------------------------------------------------------------------------- */

export const digitalValueRenderer: ComponentRenderer<DigitalValueComponent> = {
  type: 'value.digital',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    const p = c.props;
    if (p.background) {
      rc.roundRectPath(0, 0, w, h, p.radius);
      ctx.fillStyle = rc.fill(p.background, { x: 0, y: 0, w, h });
      ctx.fill();
      if (p.stroke && p.stroke.width > 0) rc.stroke(p.stroke);
    }
    const eb = rc.binding(c);
    const pad = p.padding;
    const iw = w - pad * 2;
    const ih = h - pad * 2;
    let valueText = '--';
    let unitText = '';
    let value: number | undefined;
    if (eb && c.binding) {
      const d = rc.display(eb, c.binding, p.format);
      if (!d.show) return;
      valueText = d.text;
      value = d.value;
      unitText = p.showUnit ? unitSymbol(p.unit ?? eb.unit) : '';
    }
    const valueColor = rc.zoneColor(p.zones, value, rc.color(p.valueStyle.color));
    const vs = { ...p.valueStyle, baseline: 'middle' as const };
    const us = { ...p.unitStyle, baseline: 'middle' as const };
    const ls = { ...p.labelStyle, baseline: 'middle' as const };
    const hasLabel = p.label !== '';

    ctx.save();
    ctx.translate(pad, pad);
    if (p.layout === 'inline') {
      const vw = rc.measure(valueText, vs);
      const uw = unitText ? rc.measure(unitText, us) + us.size * 0.3 : 0;
      const total = vw + uw;
      const labelH = hasLabel ? ls.size * 1.4 : 0;
      const cy = labelH + (ih - labelH) / 2;
      const startX = vs.align === 'left' ? 0 : vs.align === 'right' ? iw - total : (iw - total) / 2;
      if (hasLabel) rc.text(p.label, textOrigin(ls, iw, labelH).x, labelH / 2, ls);
      rc.text(valueText, startX, cy, { ...vs, align: 'left' }, valueColor);
      if (unitText)
        rc.text(unitText, startX + vw + us.size * 0.3, cy + vs.size * 0.18, {
          ...us,
          align: 'left',
        });
    } else if (p.layout === 'label-left') {
      const cy = ih / 2;
      if (hasLabel) rc.text(p.label, 0, cy, { ...ls, align: 'left' });
      const uw = unitText ? rc.measure(unitText, us) + us.size * 0.3 : 0;
      rc.text(valueText, iw - uw, cy, { ...vs, align: 'right' }, valueColor);
      if (unitText) rc.text(unitText, iw, cy + vs.size * 0.18, { ...us, align: 'right' });
    } else {
      // stacked: label / value / unit
      const labelH = hasLabel ? ls.size * 1.4 : 0;
      const unitH = unitText ? us.size * 1.4 : 0;
      const valueH = Math.max(vs.size, ih - labelH - unitH);
      const x = vs.align === 'left' ? 0 : vs.align === 'right' ? iw : iw / 2;
      if (hasLabel) rc.text(p.label, textOrigin(ls, iw, labelH).x, labelH / 2, ls);
      rc.text(valueText, x, labelH + valueH / 2, vs, valueColor);
      if (unitText) rc.text(unitText, textOrigin(us, iw, unitH).x, labelH + valueH + unitH / 2, us);
    }
    ctx.restore();
  },
  layers(c) {
    let n = 1;
    if (c.props.showUnit) n += 1;
    if (c.props.label) n += 1;
    if (c.props.background) n += 1;
    return n;
  },
};

/* -------------------------------------------------------------------------- */
/* Gear indicator                                                             */
/* -------------------------------------------------------------------------- */

export const gearIndicatorRenderer: ComponentRenderer<GearIndicatorComponent> = {
  type: 'indicator.gear',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    const p = c.props;
    if (p.background) {
      rc.roundRectPath(0, 0, w, h, p.radius);
      ctx.fillStyle = rc.fill(p.background, { x: 0, y: 0, w, h });
      ctx.fill();
    }
    const eb = rc.binding(c);
    let gear = '-';
    if (eb && c.binding) {
      const d = rc.display(eb, c.binding, '0');
      if (!d.show) return;
      gear = eb.valid && !eb.stale ? (eb.text ?? d.text) : d.text;
    }
    gear = p.mapping[gear] ?? gear;
    const modeSample = rc.state.bus.get(p.modeSignal);
    const mode = modeSample && modeSample.valid ? String(modeSample.value) : '';
    const color = mode === 'M' && p.manualColor ? rc.color(p.manualColor) : undefined;
    const style = { ...p.style, align: 'center' as const, baseline: 'middle' as const };
    if (p.showMode && mode) {
      const ms = { ...p.modeStyle, align: 'center' as const, baseline: 'middle' as const };
      const total = style.size + ms.size * 1.2;
      const top = (h - total) / 2;
      rc.text(gear, w / 2, top + style.size / 2, style, color);
      rc.text(mode, w / 2, top + style.size + ms.size * 0.6, ms);
    } else {
      rc.text(gear, w / 2, h / 2, style, color);
    }
  },
  layers: (c) => (c.props.showMode ? 2 : 1) + (c.props.background ? 1 : 0),
};

/* -------------------------------------------------------------------------- */
/* Shift lights                                                               */
/* -------------------------------------------------------------------------- */

export function shiftLightsLit(
  value: number | undefined,
  from: number,
  to: number,
  count: number,
): number {
  if (value === undefined || to <= from) return 0;
  if (value < from) return 0;
  return clamp(Math.ceil(((value - from) / (to - from)) * count), 0, count);
}

export const shiftLightsRenderer: ComponentRenderer<ShiftLightsComponent> = {
  type: 'indicator.shiftlights',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    const p = c.props;
    const eb = rc.binding(c);
    const value = eb && eb.valid && !eb.stale ? eb.value : undefined;
    const lit = shiftLightsLit(value, p.from, p.to, p.count);
    const flashing = p.flashAbove > 0 && value !== undefined && value >= p.flashAbove;
    const flashOn = !flashing || Math.floor((rc.now / 1000) * p.flashRateHz * 2) % 2 === 0;
    const n = p.count;
    const cellW = (w - p.gap * (n - 1)) / n;
    const size = Math.min(cellW, h);
    const offColor = rc.color(p.offColor);
    for (let i = 0; i < n; i++) {
      let on: boolean;
      if (p.symmetric) {
        const fromEdge = Math.min(i, n - 1 - i);
        const pairs = Math.ceil(n / 2);
        on = fromEdge < Math.ceil((lit / n) * pairs);
      } else {
        on = i < lit;
      }
      if (flashing) on = flashOn;
      const colorIdx = Math.min(i, p.colors.length - 1);
      const color = on ? rc.color(p.colors[colorIdx]!) : offColor;
      const x = i * (cellW + p.gap) + (cellW - size) / 2;
      const y = (h - size) / 2;
      if (on && p.glow) rc.shadow(p.colors[colorIdx], size * 0.6);
      ctx.fillStyle = color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'pill') {
        rc.roundRectPath(i * (cellW + p.gap), 0, cellW, h, Math.min(cellW, h) / 2);
        ctx.fill();
      } else {
        rc.roundRectPath(i * (cellW + p.gap), 0, cellW, h, 2);
        ctx.fill();
      }
      if (on && p.glow) rc.shadow(undefined);
    }
  },
  layers: () => 1,
};

/* -------------------------------------------------------------------------- */
/* Telltale                                                                   */
/* -------------------------------------------------------------------------- */

export const telltaleRenderer: ComponentRenderer<TelltaleComponent> = {
  type: 'telltale',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    const p = c.props;
    const eb = rc.binding(c);
    const on = !!eb && eb.valid && !eb.stale && eb.value >= 0.5;
    if (!on && p.hideWhenOff) return;
    const color = rc.color(on ? p.onColor : p.offColor);
    const size = Math.min(w, h);
    ctx.save();
    ctx.translate((w - size) / 2, (h - size) / 2);
    ctx.scale(size / 100, size / 100);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (p.icon === 'custom') {
      const img = p.asset ? rc.options.images?.get(p.asset) : undefined;
      if (img) ctx.drawImage(img.image, 0, 0, 100, 100);
      else {
        ctx.beginPath();
        ctx.arc(50, 50, 40, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      drawIcon(ctx, p.icon);
    }
    ctx.restore();
  },
  layers: () => 1,
};

/* -------------------------------------------------------------------------- */
/* Status panel                                                               */
/* -------------------------------------------------------------------------- */

export const statusPanelRenderer: ComponentRenderer<StatusPanelComponent> = {
  type: 'status.panel',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    const p = c.props;
    if (p.background) {
      rc.roundRectPath(0, 0, w, h, p.radius);
      ctx.fillStyle = rc.fill(p.background, { x: 0, y: 0, w, h });
      ctx.fill();
    }
    const pad = p.padding;
    const iw = w - pad * 2;
    const ls = { ...p.labelStyle, align: 'left' as const, baseline: 'middle' as const };
    const vs = { ...p.valueStyle, align: 'right' as const, baseline: 'middle' as const };
    const us = { ...p.unitStyle, align: 'left' as const, baseline: 'middle' as const };
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    ctx.translate(pad, pad);
    p.rows.forEach((row, i) => {
      const cy = i * p.rowHeight + p.rowHeight / 2;
      rc.text(row.label, 0, cy, ls);
      const eb = rc.bindingFor(`${c.id}/row${i}`, row.binding);
      const d = rc.display(eb, row.binding, row.format);
      if (d.show) {
        const unit = row.showUnit ? unitSymbol(row.unit ?? eb.unit) : '';
        const uw = unit ? rc.measure(unit, us) + us.size * 0.3 : 0;
        rc.text(d.text, iw - uw, cy, vs);
        if (unit) rc.text(unit, iw - uw + us.size * 0.3, cy + vs.size * 0.12, us);
      }
      if (p.divider && i < p.rows.length - 1) {
        ctx.beginPath();
        ctx.moveTo(0, (i + 1) * p.rowHeight);
        ctx.lineTo(iw, (i + 1) * p.rowHeight);
        rc.stroke(p.divider);
      }
    });
    ctx.restore();
  },
  layers: (c) => (c.props.background ? 1 : 0) + c.props.rows.length * 2,
};

/** Normalised position helper shared with tests. */
export { normalize };

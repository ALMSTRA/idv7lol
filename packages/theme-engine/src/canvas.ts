import type { ImageEdits } from '@idv7lol/theme-schema';

/**
 * The subset of CanvasRenderingContext2D the engine uses. Keeping it explicit
 * lets the engine run against a real browser canvas, an OffscreenCanvas, a
 * node-canvas, or the RecordingContext used by the tests.
 */
export interface GradientLike {
  addColorStop(offset: number, color: string): void;
}

export interface TextMetricsLike {
  width: number;
}

export interface Canvas2DLike {
  fillStyle: string | GradientLike | object;
  strokeStyle: string | GradientLike | object;
  lineWidth: number;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'round' | 'bevel' | 'miter';
  globalAlpha: number;
  font: string;
  textAlign: 'left' | 'right' | 'center' | 'start' | 'end';
  textBaseline: 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom';
  letterSpacing?: string;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  fontKerning?: string;

  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(rad: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number, ccw?: boolean): void;
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    start: number,
    end: number,
    ccw?: boolean,
  ): void;
  rect(x: number, y: number, w: number, h: number): void;
  roundRect?(x: number, y: number, w: number, h: number, radii?: number | number[]): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): TextMetricsLike;
  setLineDash(segments: number[]): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): GradientLike;
  createConicGradient?(startAngle: number, x: number, y: number): GradientLike;
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void;
}

/** Something the engine can hand to drawImage. Resolved by the host (Studio/Node). */
export type ImageSource = unknown;

export interface ImageResolver {
  /**
   * Return a drawable for an asset id with its edits applied, or undefined
   * while loading / missing. `resolveColor` turns palette tokens into colours.
   */
  get(
    assetId: string,
    edits?: ImageEdits,
    resolveColor?: (color: string) => string,
  ): { image: ImageSource; width: number; height: number } | undefined;
}

export type RecordedOp = { op: string; args: unknown[] };

/**
 * A fake context that records calls. Used by tests to assert that renderers
 * draw what they should without needing a real canvas.
 */
export class RecordingContext implements Canvas2DLike {
  ops: RecordedOp[] = [];
  fillStyle: string | GradientLike | object = '#000';
  strokeStyle: string | GradientLike | object = '#000';
  lineWidth = 1;
  lineCap: 'butt' | 'round' | 'square' = 'butt';
  lineJoin: 'round' | 'bevel' | 'miter' = 'miter';
  globalAlpha = 1;
  font = '10px sans-serif';
  textAlign: Canvas2DLike['textAlign'] = 'start';
  textBaseline: Canvas2DLike['textBaseline'] = 'alphabetic';
  letterSpacing = '0px';
  shadowColor = 'rgba(0,0,0,0)';
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;

  private rec(op: string, ...args: unknown[]): void {
    this.ops.push({ op, args });
  }
  save(): void {
    this.rec('save');
  }
  restore(): void {
    this.rec('restore');
  }
  translate(x: number, y: number): void {
    this.rec('translate', x, y);
  }
  rotate(rad: number): void {
    this.rec('rotate', rad);
  }
  scale(x: number, y: number): void {
    this.rec('scale', x, y);
  }
  beginPath(): void {
    this.rec('beginPath');
  }
  closePath(): void {
    this.rec('closePath');
  }
  moveTo(x: number, y: number): void {
    this.rec('moveTo', x, y);
  }
  lineTo(x: number, y: number): void {
    this.rec('lineTo', x, y);
  }
  arc(x: number, y: number, r: number, s: number, e: number, ccw?: boolean): void {
    this.rec('arc', x, y, r, s, e, ccw);
  }
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rot: number,
    s: number,
    e: number,
    ccw?: boolean,
  ): void {
    this.rec('ellipse', x, y, rx, ry, rot, s, e, ccw);
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.rec('rect', x, y, w, h);
  }
  roundRect(x: number, y: number, w: number, h: number, radii?: number | number[]): void {
    this.rec('roundRect', x, y, w, h, radii);
  }
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.rec('quadraticCurveTo', cpx, cpy, x, y);
  }
  fill(): void {
    this.rec('fill', this.fillStyle);
  }
  stroke(): void {
    this.rec('stroke', this.strokeStyle, this.lineWidth);
  }
  clip(): void {
    this.rec('clip');
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    this.rec('clearRect', x, y, w, h);
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.rec('fillRect', x, y, w, h, this.fillStyle);
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.rec('strokeRect', x, y, w, h);
  }
  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.rec('fillText', text, x, y, maxWidth, this.font, this.fillStyle);
  }
  measureText(text: string): TextMetricsLike {
    const size = parseFloat(this.font) || 10;
    return { width: text.length * size * 0.6 };
  }
  setLineDash(segments: number[]): void {
    this.rec('setLineDash', segments);
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike {
    const stops: Array<[number, string]> = [];
    this.rec('createLinearGradient', x0, y0, x1, y1);
    return {
      addColorStop: (o, c) => stops.push([o, c]),
      toString: () => `linear(${stops.map((s) => s.join(':')).join(',')})`,
    } as GradientLike;
  }
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): GradientLike {
    const stops: Array<[number, string]> = [];
    this.rec('createRadialGradient', x0, y0, r0, x1, y1, r1);
    return {
      addColorStop: (o, c) => stops.push([o, c]),
      toString: () => `radial(${stops.map((s) => s.join(':')).join(',')})`,
    } as GradientLike;
  }
  createConicGradient(start: number, x: number, y: number): GradientLike {
    const stops: Array<[number, string]> = [];
    this.rec('createConicGradient', start, x, y);
    return {
      addColorStop: (o, c) => stops.push([o, c]),
      toString: () => `conic(${stops.map((s) => s.join(':')).join(',')})`,
    } as GradientLike;
  }
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void {
    this.rec('drawImage', image, dx, dy, dw, dh);
  }

  /** Texts drawn, in order. */
  texts(): string[] {
    return this.ops.filter((o) => o.op === 'fillText').map((o) => String(o.args[0]));
  }
  count(op: string): number {
    return this.ops.filter((o) => o.op === op).length;
  }
}

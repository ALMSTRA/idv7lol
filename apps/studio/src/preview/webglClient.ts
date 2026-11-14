/**
 * A stand-in for the cluster-render client that draws with WebGL in the Studio.
 *
 * The car app's engine (apps/idv7lol/engine.js) talks to cluster-render through
 * a small set of calls: effect, image, asset, pixels, uniform, bind, set,
 * animate, stop and drop (see docs/architecture/RENDERER.md). This class takes
 * the same calls and draws the same GLSL ES 1.00 shaders, so the preview runs
 * the car's code and the car's shaders. It is still not the car: the KOMBI's
 * RAMSES renderer, its anti-aliasing and its colour handling can differ.
 */

type Vec = number[];

interface Uniform {
  loc: WebGLUniformLocation;
  type: number;
  size: number;
}

interface Anim {
  id: number;
  property: string;
  name?: string;
  keys: Array<{ t: number; v: number[] }>;
  loop: boolean;
  step: boolean;
  start: number;
}

interface Layer {
  kind: 'effect' | 'image';
  program: WebGLProgram;
  uniforms: Map<string, Uniform>;
  values: Map<string, Float32Array>;
  binds: Map<string, number>;
  texture?: WebGLTexture;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  order: number;
  visible: boolean;
  opacity: number;
  rotate: number;
  px: number | undefined;
  py: number | undefined;
  time: boolean;
  born: number;
  anims: Anim[];
}

interface Asset {
  texture: WebGLTexture;
  format: string;
  w: number;
  h: number;
}

import { decodeEtc2Rgba } from '@idv7lol/theme-compiler';
const VS = `
attribute vec2 a_pos;
uniform vec4 u_rect;   // x, y, w, h in layout pixels
uniform vec2 u_canvas; // layout size
uniform vec4 u_xf;     // rotation (rad), pivot x, pivot y, 0
uniform vec2 u_scl;
varying vec2 v_uv;
void main() {
  v_uv = a_pos;
  vec2 p = a_pos * u_rect.zw - u_xf.yz;
  p *= u_scl;
  float c = cos(u_xf.x);
  float s = sin(u_xf.x);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + u_xf.yz + u_rect.xy;
  vec2 clip = p / u_canvas * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const IMAGE_FS = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_opacity;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  gl_FragColor = vec4(c.rgb, c.a * u_opacity);
}`;

function parseKeys(keys: string): Array<{ t: number; v: number[] }> {
  return keys
    .trim()
    .split(/\s+/)
    .map((k) => {
      const i = k.indexOf(':');
      return {
        t: Number(k.slice(0, i)),
        v: k
          .slice(i + 1)
          .split(',')
          .map(Number),
      };
    })
    .filter((k) => isFinite(k.t) && k.v.every(isFinite))
    .sort((a, b) => a.t - b.t);
}

/** Value of a keyframe track at `t` ms; null once a one-shot track has ended. */
function sample(a: Anim, now: number): number[] | null {
  const keys = a.keys;
  if (!keys.length) return null;
  const end = keys[keys.length - 1]!.t;
  let t = now - a.start;
  if (t >= end) {
    if (!a.loop || end <= 0) return null;
    t %= end;
  }
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1]!.t <= t) i++;
  const k0 = keys[i]!;
  const k1 = keys[Math.min(i + 1, keys.length - 1)]!;
  if (a.step || k1 === k0 || k1.t === k0.t) return k0.v;
  const f = (t - k0.t) / (k1.t - k0.t);
  return k0.v.map((v, j) => v + ((k1.v[j] ?? v) - v) * f);
}

export class WebGLClusterClient {
  readonly ready = true;
  readonly backend = 'studio-webgl';
  readonly targets = 'panel:1920x720';
  /** Shader compile errors, by layer key, for the preview to show. */
  readonly errors: string[] = [];

  private gl: WebGLRenderingContext;
  private quad: WebGLBuffer;
  private layers = new Map<number, Layer>();
  private assets = new Map<number, Asset>();
  private programs = new Map<string, { program: WebGLProgram; uniforms: Map<string, Uniform> }>();
  private next = 1;
  private nextAnim = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    private width: number,
    private height: number,
    private now: () => number = () => performance.now(),
  ) {
    const gl = canvas.getContext('webgl', {
      premultipliedAlpha: false,
      antialias: true,
      // Keeps the last frame readable, so screenshots and copies of the canvas work.
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL is not available here');
    this.gl = gl;
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.quad = quad;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }

  /* ----- what the engine calls ----- */

  on(): void {}
  status(): void {}

  asset(o: { format: string; w: number; h: number; sampling?: string }): number {
    const ref = this.next++;
    this.assets.set(ref, {
      texture: this.makeTexture(o.sampling),
      format: o.format,
      w: o.w,
      h: o.h,
    });
    return ref;
  }

  effect(o: Record<string, unknown>): number {
    const fs = String(o['fs'] ?? '');
    const prog = this.program(fs, String(o['key'] ?? ''));
    if (!prog) return 0;
    return this.addLayer('effect', prog, o);
  }

  image(o: Record<string, unknown>): number {
    const prog = this.program(IMAGE_FS, 'image');
    if (!prog) return 0;
    const ref = this.addLayer('image', prog, o);
    const layer = this.layers.get(ref)!;
    layer.texture = this.makeTexture(String(o['sampling'] ?? 'bilinear'));
    this.assets.set(ref, {
      texture: layer.texture,
      format: 'rgba8',
      w: Number(o['iw']),
      h: Number(o['ih']),
    });
    return ref;
  }

  pixels(ref: number, _rects: unknown, px: Uint8Array): void {
    const a = this.assets.get(ref);
    if (!a) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, a.texture);
    const fmt = a.format === 'r8' ? gl.LUMINANCE : gl.RGBA;
    let data = new Uint8Array(px.buffer, px.byteOffset, px.byteLength);
    // An animation's ETC2 atlas, decoded here so the preview shows what the car draws.
    if (a.format === 'etc2rgba') data = decodeEtc2Rgba(data, a.w, a.h);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, a.w, a.h, 0, fmt, gl.UNSIGNED_BYTE, data);
  }

  uniform(ref: number, name: string, v: Vec): void {
    const layer = this.layers.get(ref);
    if (!layer) return;
    layer.values.set(name, Float32Array.from(v));
  }

  bind(ref: number, sampler: string, asset: number): void {
    this.layers.get(ref)?.binds.set(sampler, asset);
  }

  set(ref: number, o: Record<string, unknown>): void {
    const layer = this.layers.get(ref);
    if (!layer) return;
    if (o['visible'] !== undefined) layer.visible = !!o['visible'];
    for (const k of ['x', 'y', 'w', 'h', 'z', 'opacity', 'rotate'] as const)
      if (typeof o[k] === 'number') layer[k] = o[k];
  }

  animate(
    ref: number,
    o: { property: string; name?: string; keys: string; loop?: boolean; interp?: string },
  ): number {
    const layer = this.layers.get(ref);
    if (!layer) return 0;
    const id = this.nextAnim++;
    // A new track on the same property replaces the old one, as on the renderer.
    layer.anims = layer.anims.filter((a) => a.property !== o.property || a.name !== o.name);
    layer.anims.push({
      id,
      property: o.property,
      name: o.name,
      keys: parseKeys(o.keys),
      loop: !!o.loop,
      step: o.interp === 'step',
      start: this.now(),
    });
    return id;
  }

  stop(ref: number, anim: number): void {
    const layer = this.layers.get(ref);
    if (layer) layer.anims = layer.anims.filter((a) => a.id !== anim);
  }

  drop(ref: number): void {
    const layer = this.layers.get(ref);
    if (layer?.texture) this.gl.deleteTexture(layer.texture);
    this.layers.delete(ref);
    const a = this.assets.get(ref);
    if (a && !layer) this.gl.deleteTexture(a.texture);
    this.assets.delete(ref);
  }

  /* ----- drawing ----- */

  get layerCount(): number {
    return this.layers.size;
  }

  draw(): void {
    const gl = this.gl;
    const now = this.now();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const list = [...this.layers.values()]
      .filter((l) => l.visible)
      .sort((a, b) => a.z - b.z || a.order - b.order);
    for (const l of list) this.drawLayer(l, now);
  }

  dispose(): void {
    for (const ref of [...this.layers.keys(), ...this.assets.keys()]) this.drop(ref);
    for (const p of this.programs.values()) this.gl.deleteProgram(p.program);
    this.programs.clear();
    this.gl.deleteBuffer(this.quad);
  }

  private drawLayer(l: Layer, now: number): void {
    const gl = this.gl;
    let rotate = l.rotate;
    let sx = 1;
    let sy = 1;
    const animated = new Map<string, number[]>();
    l.anims = l.anims.filter((a) => {
      const v = sample(a, now);
      if (!v) return false;
      if (a.property === 'uniform' && a.name) animated.set(a.name, v);
      else if (a.property === 'rotate') rotate = v[0] ?? rotate;
      else if (a.property === 'scale') {
        sx = v[0] ?? 1;
        sy = v[1] ?? sx;
      }
      return true;
    });

    gl.useProgram(l.program);
    const set = (name: string, v: ArrayLike<number>) => {
      const u = l.uniforms.get(name);
      if (u) this.setUniform(u, v);
    };
    set('u_rect', [l.x, l.y, l.w, l.h]);
    set('u_canvas', [this.width, this.height]);
    const px = l.px ?? l.w / 2;
    const py = l.py ?? l.h / 2;
    set('u_xf', [(rotate * Math.PI) / 180, px, py, 0]);
    set('u_scl', [sx, sy]);
    if (l.kind === 'image') set('u_opacity', [l.opacity]);
    if (l.time) set('u_time', [(now - l.born) / 1000]);
    for (const [name, v] of l.values) if (!animated.has(name)) set(name, v);
    for (const [name, v] of animated) set(name, v);

    let unit = 0;
    const bindTex = (sampler: string, tex: WebGLTexture) => {
      const u = l.uniforms.get(sampler);
      if (!u) return;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.loc, unit);
      unit++;
    };
    if (l.kind === 'image' && l.texture) bindTex('u_tex', l.texture);
    for (const [sampler, ref] of l.binds) {
      const a = this.assets.get(ref);
      if (a) bindTex(sampler, a.texture);
    }

    const loc = gl.getAttribLocation(l.program, 'a_pos');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private setUniform(u: Uniform, v: ArrayLike<number>): void {
    const gl = this.gl;
    const per =
      u.type === gl.FLOAT_VEC4
        ? 4
        : u.type === gl.FLOAT_VEC3
          ? 3
          : u.type === gl.FLOAT_VEC2
            ? 2
            : 1;
    const want = per * u.size;
    const data = new Float32Array(want);
    data.set(v.length > want ? Array.prototype.slice.call(v, 0, want) : v);
    if (u.type === gl.FLOAT_VEC4) gl.uniform4fv(u.loc, data);
    else if (u.type === gl.FLOAT_VEC3) gl.uniform3fv(u.loc, data);
    else if (u.type === gl.FLOAT_VEC2) gl.uniform2fv(u.loc, data);
    else if (u.type === gl.FLOAT) gl.uniform1fv(u.loc, data);
    else if (u.type === gl.INT || u.type === gl.BOOL) gl.uniform1iv(u.loc, Int32Array.from(data));
  }

  private addLayer(
    kind: Layer['kind'],
    prog: { program: WebGLProgram; uniforms: Map<string, Uniform> },
    o: Record<string, unknown>,
  ): number {
    const ref = this.next++;
    const num = (k: string, d = 0) => (typeof o[k] === 'number' ? (o[k] as number) : d);
    this.layers.set(ref, {
      kind,
      program: prog.program,
      uniforms: prog.uniforms,
      values: new Map(),
      binds: new Map(),
      x: num('x'),
      y: num('y'),
      w: num('w', 1),
      h: num('h', 1),
      z: num('z'),
      order: ref,
      visible: o['visible'] === undefined ? true : !!o['visible'],
      opacity: num('opacity', 1),
      rotate: num('rotate'),
      px: typeof o['px'] === 'number' ? (o['px'] as number) : undefined,
      py: typeof o['py'] === 'number' ? (o['py'] as number) : undefined,
      time: !!o['time'],
      born: this.now(),
      anims: [],
    });
    return ref;
  }

  private makeTexture(sampling = 'bilinear'): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    const f = sampling === 'nearest' ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return t;
  }

  private program(
    fs: string,
    key: string,
  ): { program: WebGLProgram; uniforms: Map<string, Uniform> } | null {
    const cached = this.programs.get(fs);
    if (cached) return cached;
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s) ?? 'unknown error';
        gl.deleteShader(s);
        throw new Error(log);
      }
      return s;
    };
    try {
      const program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) ?? 'link failed');
      const uniforms = new Map<string, Uniform>();
      const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(program, i);
        if (!info) continue;
        const name = info.name.replace(/\[0\]$/, '');
        const loc = gl.getUniformLocation(program, info.name);
        if (loc) uniforms.set(name, { loc, type: info.type, size: info.size });
      }
      const entry = { program, uniforms };
      this.programs.set(fs, entry);
      return entry;
    } catch (e) {
      this.errors.push(`${key || 'shader'}: ${(e as Error).message}`);
      return null;
    }
  }
}

import type { AnimationClip, AnimationRef, Component, Theme } from '@idv7lol/theme-schema';
import { ease } from './easing.js';
import { mixColors, parseColor, toCss } from './color.js';
import type { EngineState } from './state.js';

/** Property overrides produced by animations for one frame. */
export interface AnimationOverrides {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  scale?: number;
  /** Values keyed by dotted path under `props`, e.g. "needle.color". */
  props: Record<string, number | string>;
}

interface ClipPlayback {
  startedAt: number;
  /** Playing (true) or stopped/finished (false). */
  active: boolean;
  /** Loops completed so far. */
  loops: number;
}

/**
 * Drives animation clips for components: decides when each clip plays
 * according to its trigger and samples its tracks.
 */
export class AnimationPlayer {
  private readonly playbacks = new Map<string, ClipPlayback>();

  reset(): void {
    this.playbacks.clear();
  }

  /** Compute this frame's overrides for a component. */
  evaluate(component: Component, theme: Theme, state: EngineState): AnimationOverrides {
    const out: AnimationOverrides = { props: {} };
    if (component.animations.length === 0) return out;
    for (let i = 0; i < component.animations.length; i++) {
      const ref = component.animations[i]!;
      const clip = theme.animations[ref.clip];
      if (!clip) continue;
      const key = `${component.id}#${i}`;
      const pb = this.updatePlayback(key, ref, state);
      if (!pb || !pb.active) continue;
      const local = state.now - pb.startedAt - ref.delay;
      if (local < 0) continue;
      const t = this.clipTime(clip, local, pb);
      if (t === null) {
        pb.active = false;
        continue;
      }
      this.sampleTracks(clip, t, out);
    }
    return out;
  }

  /** Is any clip of this component currently playing? */
  isAnimating(component: Component): boolean {
    for (let i = 0; i < component.animations.length; i++) {
      const pb = this.playbacks.get(`${component.id}#${i}`);
      if (pb?.active) return true;
    }
    return false;
  }

  private updatePlayback(
    key: string,
    ref: AnimationRef,
    state: EngineState,
  ): ClipPlayback | undefined {
    let pb = this.playbacks.get(key);
    const start = (): ClipPlayback => {
      pb = { startedAt: state.now, active: true, loops: 0 };
      this.playbacks.set(key, pb);
      return pb;
    };
    const trig = ref.trigger;
    switch (trig.on) {
      case 'load':
      case 'always':
        return pb ?? start();
      case 'while': {
        const holds = state.condition(trig.condition);
        if (holds && (!pb || !pb.active)) return start();
        if (!holds && pb) {
          pb.active = false;
          this.playbacks.delete(key);
          return undefined;
        }
        return pb;
      }
      case 'rising':
      case 'falling': {
        const holds = state.condition(trig.condition);
        const e = state.edge(key, holds);
        if (e === trig.on) return start();
        return pb;
      }
      case 'change': {
        if (state.changed(key, trig.signal)) return start();
        return pb;
      }
    }
  }

  /** Normalised clip time 0..1 for a local time in ms, or null when finished. */
  private clipTime(clip: AnimationClip, localMs: number, pb: ClipPlayback): number | null {
    const d = clip.duration;
    const iteration = Math.floor(localMs / d);
    const maxLoops =
      clip.loop === true ? Number.POSITIVE_INFINITY : clip.loop === false ? 1 : clip.loop;
    if (iteration >= maxLoops) {
      pb.loops = maxLoops;
      // Hold the final pose.
      return this.direction(clip, maxLoops - 1, 1);
    }
    pb.loops = iteration;
    const frac = (localMs % d) / d;
    return this.direction(clip, iteration, frac);
  }

  private direction(clip: AnimationClip, iteration: number, frac: number): number {
    switch (clip.direction) {
      case 'normal':
        return frac;
      case 'reverse':
        return 1 - frac;
      case 'alternate':
        return iteration % 2 === 0 ? frac : 1 - frac;
    }
  }

  private sampleTracks(clip: AnimationClip, t: number, out: AnimationOverrides): void {
    for (const track of clip.tracks) {
      const v = sampleTrack(track.keyframes, t, clip.easing);
      if (v === undefined) continue;
      if (track.property.startsWith('props.')) {
        out.props[track.property.slice(6)] = v;
      } else {
        (out as unknown as Record<string, unknown>)[track.property] = v;
      }
    }
  }
}

/** Interpolate keyframes at normalised time t. Colours interpolate in RGB. */
export function sampleTrack(
  keyframes: AnimationClip['tracks'][number]['keyframes'],
  t: number,
  defaultEasing: AnimationClip['easing'],
): number | string | undefined {
  if (keyframes.length === 0) return undefined;
  const sorted = keyframes.length > 1 ? [...keyframes].sort((a, b) => a.t - b.t) : keyframes;
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (t <= first.t) return first.value;
  if (t >= last.t) return last.value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const local = span === 0 ? 1 : (t - a.t) / span;
      const k = ease(a.easing ?? defaultEasing, local);
      if (typeof a.value === 'number' && typeof b.value === 'number') {
        return a.value + (b.value - a.value) * k;
      }
      if (typeof a.value === 'string' && typeof b.value === 'string') {
        if (a.value.startsWith('$') || b.value.startsWith('$')) return k < 0.5 ? a.value : b.value;
        return toCss(mixColors(parseColor(a.value), parseColor(b.value), k));
      }
      return k < 0.5 ? a.value : b.value;
    }
  }
  return last.value;
}

/** Apply "props" overrides to a cloned props object by dotted path. */
export function applyPropOverrides<T extends Record<string, unknown>>(
  props: T,
  overrides: Record<string, number | string>,
): T {
  const keys = Object.keys(overrides);
  if (keys.length === 0) return props;
  const clone = structuredClone(props) as Record<string, unknown>;
  for (const path of keys) {
    const parts = path.split('.');
    let target: Record<string, unknown> = clone;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]!;
      const next = target[p];
      if (!next || typeof next !== 'object') {
        target[p] = {};
      }
      target = target[p] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]!] = overrides[path];
  }
  return clone as T;
}

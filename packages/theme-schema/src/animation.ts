import { z } from 'zod';
import { ColorSchema, EasingSchema, IdSchema } from './primitives.js';
import { ConditionSchema, SignalIdSchema } from './bindings.js';

/**
 * Properties a keyframe track may animate. Transform and opacity tracks apply
 * to any component; "props.<path>" tracks address a type-specific property
 * such as "props.needle.color" or "props.fill.color".
 */
export const AnimatablePropertySchema = z
  .string()
  .regex(
    /^(x|y|width|height|rotation|opacity|scale|props(\.[a-zA-Z][a-zA-Z0-9]*)+)$/,
    'animatable properties are x, y, width, height, rotation, opacity, scale or props.<path>',
  );

export const KeyframeSchema = z.object({
  /** Normalised time within the clip, 0..1. */
  t: z.number().min(0).max(1),
  value: z.union([z.number(), ColorSchema]),
  /** Easing from this keyframe to the next; overrides the clip default. */
  easing: EasingSchema.optional(),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

export const TrackSchema = z.object({
  property: AnimatablePropertySchema,
  keyframes: z.array(KeyframeSchema).min(1),
});
export type Track = z.infer<typeof TrackSchema>;

/** A reusable, named animation. */
export const AnimationClipSchema = z.object({
  name: z.string().max(48).optional(),
  /** Duration in milliseconds. */
  duration: z.number().int().positive().max(60_000),
  easing: EasingSchema.default('ease-in-out'),
  /** `true` loops forever, a number loops that many times, `false` plays once. */
  loop: z.union([z.boolean(), z.number().int().positive()]).default(false),
  direction: z.enum(['normal', 'reverse', 'alternate']).default('normal'),
  tracks: z.array(TrackSchema).min(1),
});
export type AnimationClip = z.infer<typeof AnimationClipSchema>;
export type AnimationClipInput = z.input<typeof AnimationClipSchema>;

/**
 * When a clip plays.
 *  - load:    once when the layout appears
 *  - always:  continuously (looping clips)
 *  - while:   while `condition` holds; stops and resets when it stops holding
 *  - rising:  once each time `condition` becomes true
 *  - falling: once each time `condition` becomes false
 *  - change:  once each time `signal` changes value (e.g. gear change)
 */
export const AnimationTriggerSchema = z.discriminatedUnion('on', [
  z.object({ on: z.literal('load') }),
  z.object({ on: z.literal('always') }),
  z.object({ on: z.literal('while'), condition: ConditionSchema }),
  z.object({ on: z.literal('rising'), condition: ConditionSchema }),
  z.object({ on: z.literal('falling'), condition: ConditionSchema }),
  z.object({ on: z.literal('change'), signal: SignalIdSchema }),
]);
export type AnimationTrigger = z.infer<typeof AnimationTriggerSchema>;

export const AnimationRefSchema = z.object({
  clip: IdSchema,
  trigger: AnimationTriggerSchema.default({ on: 'load' }),
  /** Delay before the clip starts, milliseconds. */
  delay: z.number().int().min(0).default(0),
});
export type AnimationRef = z.infer<typeof AnimationRefSchema>;

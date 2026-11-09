import { z } from 'zod';
import { UNITS, type UnitId } from '@idv7lol/vehicle-signals';

const UNIT_IDS = Object.keys(UNITS) as [UnitId, ...UnitId[]];
export const UnitIdSchema = z.enum(UNIT_IDS);

/** Catalog signal id, e.g. "engine.rpm". Existence is checked by the validator, not the schema. */
export const SignalIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(\.[a-z0-9]+)+$/, 'signal ids look like "engine.rpm"');

/**
 * Connects a component to a vehicle signal.
 *
 * The raw catalog value is converted to `unit` (if given), then `scale` and
 * `offset` are applied, then the value is clamped to [min, max] when `clamp`
 * is set. Gauges normalise the result to 0..1 using min/max; when they are
 * omitted the catalog range of the signal is used.
 */
export const BindingSchema = z.object({
  signal: SignalIdSchema,
  min: z.number().optional(),
  max: z.number().optional(),
  /** Display unit; must share the signal's dimension. */
  unit: UnitIdSchema.optional(),
  scale: z.number().default(1),
  offset: z.number().default(0),
  clamp: z.boolean().default(true),
  /**
   * Smoothing time constant in seconds (0 = none). Values are eased towards
   * the target so needles glide instead of jumping.
   */
  smoothing: z.number().min(0).max(5).default(0),
  /**
   * After this many milliseconds without a fresh sample the value is stale.
   * Defaults to a multiple of the signal's catalog rate.
   */
  staleAfterMs: z.number().int().positive().optional(),
  /** What a component shows while the signal is stale or unavailable. */
  fallback: z.enum(['dash', 'hide', 'last', 'zero']).default('dash'),
});
export type Binding = z.infer<typeof BindingSchema>;
export type BindingInput = z.input<typeof BindingSchema>;

export const ConditionOpSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'truthy',
  'falsy',
  'stale',
]);

const ScalarSchema = z.union([z.number(), z.string(), z.boolean()]);

/** A single comparison against a signal. */
export const ComparisonSchema = z.object({
  signal: SignalIdSchema,
  op: ConditionOpSchema,
  value: ScalarSchema.optional(),
  /** Upper bound for "between". */
  value2: z.number().optional(),
});
export type Comparison = z.infer<typeof ComparisonSchema>;

export type Condition =
  Comparison | { all: Condition[] } | { any: Condition[] } | { not: Condition };

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    ComparisonSchema,
    z.object({ all: z.array(ConditionSchema).min(1) }),
    z.object({ any: z.array(ConditionSchema).min(1) }),
    z.object({ not: ConditionSchema }),
  ]),
);

/** A value zone: colours or styles that apply while the value is within [from, to). */
export const ZoneSchema = z.object({
  from: z.number(),
  to: z.number(),
  color: z.string(),
  label: z.string().max(24).optional(),
});
export type Zone = z.infer<typeof ZoneSchema>;

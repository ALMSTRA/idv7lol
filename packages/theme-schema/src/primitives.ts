import { z } from 'zod';

/** Identifier used for components, palettes, fonts, assets: kebab-case, 1–48 chars. */
export const IdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]{0,47}$/,
    'must be kebab-case (a-z, 0-9, "-"), start with a letter, max 48 chars',
  );

/** Semantic version "x.y.z" with an optional pre-release suffix. */
export const SemverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, 'must be a semantic version like 1.2.0');

/**
 * A colour is either a literal (#rgb, #rrggbb, #rrggbbaa, rgb()/rgba()/hsl()) or a
 * palette token reference written as "$token".
 */
export const ColorLiteralSchema = z
  .string()
  .regex(
    /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\([^)]*\)|hsla?\([^)]*\)|transparent)$/,
    'must be a hex colour (#rgb, #rrggbb, #rrggbbaa), rgb()/hsl() or "transparent"',
  );

export const ColorTokenSchema = z
  .string()
  .regex(/^\$[a-z][a-z0-9-]*$/, 'palette tokens are written "$name"');

export const COLOR_MESSAGE =
  'must be a hex colour (#rgb, #rrggbb, #rrggbbaa), rgb()/hsl(), "transparent" or a palette token "$name"';

export const ColorSchema = z.union([ColorLiteralSchema, ColorTokenSchema], {
  error: COLOR_MESSAGE,
});
export type Color = z.infer<typeof ColorSchema>;

export const GradientStopSchema = z.object({
  offset: z.number().min(0).max(1),
  color: ColorSchema,
});

export const GradientSchema = z.object({
  type: z.enum(['linear', 'radial', 'conic']),
  /** Angle in degrees for linear/conic gradients (0 = left to right, 90 = top to bottom). */
  angle: z.number().default(0),
  stops: z.array(GradientStopSchema).min(2),
});
export type Gradient = z.infer<typeof GradientSchema>;

/** A fill is a colour or a gradient. */
export const FillSchema = z.union([ColorSchema, GradientSchema], {
  error: 'must be a colour, a palette token "$name" or a gradient object',
});
export type Fill = z.infer<typeof FillSchema>;

export const StrokeSchema = z.object({
  color: ColorSchema,
  width: z.number().min(0).default(1),
  cap: z.enum(['butt', 'round', 'square']).default('butt'),
  dash: z.array(z.number().min(0)).optional(),
});
export type Stroke = z.infer<typeof StrokeSchema>;

export const ShadowSchema = z.object({
  color: ColorSchema,
  blur: z.number().min(0).default(0),
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
});

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type Rect = z.infer<typeof RectSchema>;

export const PointSchema = z.object({ x: z.number(), y: z.number() });

export const AnchorSchema = z.enum([
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
]);
export type Anchor = z.infer<typeof AnchorSchema>;

export const TextAlignSchema = z.enum(['left', 'center', 'right']);
export const TextBaselineSchema = z.enum(['top', 'middle', 'bottom', 'alphabetic']);

export const EasingSchema = z.enum([
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'ease-in-cubic',
  'ease-out-cubic',
  'ease-in-out-cubic',
  'ease-out-back',
  'ease-out-elastic',
  'ease-out-bounce',
  'step',
]);
export type Easing = z.infer<typeof EasingSchema>;

/**
 * Typography reference. `font` names an entry of the theme's `fonts` table.
 */
export const TextStyleSchema = z.object({
  font: IdSchema.default('default'),
  size: z.number().positive().default(24),
  weight: z.enum(['light', 'regular', 'medium', 'bold']).default('regular'),
  color: ColorSchema.default('$text'),
  align: TextAlignSchema.default('left'),
  baseline: TextBaselineSchema.default('alphabetic'),
  letterSpacing: z.number().default(0),
  uppercase: z.boolean().default(false),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

/**
 * A number format string. Supported tokens:
 *  - "0"      integer
 *  - "0.0"    one decimal (any number of zeros after the point)
 *  - "00"     zero-padded to the number of zeros
 *  - "+0"     always show the sign
 *  - "0,0"    thousands separator
 * Anything else in the string is literal (e.g. "0 km/h").
 */
export const NumberFormatSchema = z.string().max(32).default('0');

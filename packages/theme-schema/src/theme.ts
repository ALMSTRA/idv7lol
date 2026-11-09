import { z } from 'zod';
import {
  ColorLiteralSchema,
  FillSchema,
  IdSchema,
  PointSchema,
  RectSchema,
  SemverSchema,
} from './primitives.js';
import { AnimationClipSchema } from './animation.js';
import { ComponentSchema } from './components.js';

export const SCHEMA_VERSION = 1 as const;

/**
 * Palette tokens every theme must define. Components reference them as "$name".
 * Themes may add more tokens.
 */
export const REQUIRED_PALETTE_TOKENS = [
  'background',
  'surface',
  'text',
  'text-muted',
  'accent',
  'track',
  'success',
  'warning',
  'danger',
] as const;

export const PaletteSchema = z.object({
  name: z.string().max(48),
  colors: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), ColorLiteralSchema),
});
export type Palette = z.infer<typeof PaletteSchema>;

export const DriveModeSchema = z.enum([
  'ECO_PRO',
  'COMFORT',
  'SPORT',
  'SPORT_PLUS',
  'ADAPTIVE',
  'TRACK',
]);
export type DriveMode = z.infer<typeof DriveModeSchema>;

export const PaletteSelectionSchema = z.object({
  default: IdSchema,
  /** Switch palettes with the Driving Experience Control mode when the car reports it. */
  byDriveMode: z.partialRecord(DriveModeSchema, IdSchema).prefault({}),
  /** Let the user override the automatic choice from the idv7lol menu. */
  allowManual: z.boolean().default(true),
});

export const FontSchema = z.object({
  /** Logical family. The compiler maps it to the fonts the renderer provides. */
  family: z.enum(['sans', 'sans-condensed', 'mono', 'display']).default('sans'),
  /** Optional custom font file (TTF/OTF) relative to the theme folder. */
  file: z.string().max(200).optional(),
});
export type Font = z.infer<typeof FontSchema>;

export const AssetSchema = z
  .object({
    type: z.enum(['image']),
    /** Display name, usually the imported file's name. */
    name: z.string().max(120).optional(),
    /** PNG file relative to the theme folder. */
    path: z.string().max(200).optional(),
    /** Embedded PNG, so a theme saved from the Studio is one self-contained file. */
    data: z
      .string()
      .startsWith('data:image/png;base64,', 'embedded images must be PNG data URLs')
      .optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    license: z.string().max(120).optional(),
  })
  .refine((a) => a.path !== undefined || a.data !== undefined, {
    message: 'an image asset needs a file path or embedded data',
  });
export type Asset = z.infer<typeof AssetSchema>;

export const ReservedZoneSchema = RectSchema.extend({
  id: IdSchema,
  name: z.string().max(64),
  /**
   * `factory` zones are drawn over by the factory cluster (telltales, cowl,
   * gear bracket): content there is hidden or must not be essential.
   * `keep-clear` zones must stay empty. `info` zones are informational
   * (e.g. the stock map window) and never produce validation errors.
   */
  kind: z.enum(['factory', 'keep-clear', 'info']).default('factory'),
  /**
   * Optional polygon (layout pixels) for non-rectangular zones such as the
   * slanted glass corners. The rect is then the polygon's bounding box.
   */
  polygon: z.array(PointSchema).min(3).optional(),
});
export type ReservedZone = z.infer<typeof ReservedZoneSchema>;

export const LayoutSchema = z.object({
  width: z.number().int().min(320).max(4096),
  height: z.number().int().min(200).max(2160),
  background: FillSchema.default('$background'),
  /**
   * Areas of the instrument cluster the factory software may draw over, or that
   * must stay clear. Defaults come from the display profile.
   */
  reservedZones: z.array(ReservedZoneSchema).default([]),
});

export const TargetSchema = z.object({
  platform: z.literal('idrive7-mgu').default('idrive7-mgu'),
  /** Display profile id, e.g. "kombi-id7-12.3". */
  display: z.string().default('kombi-id7-12.3'),
  renderer: z.literal('cluster-render').default('cluster-render'),
  /** Minimum renderer version known to work, semver. */
  minRendererVersion: SemverSchema.optional(),
});

export const ThemeMetaSchema = z.object({
  createdWith: z.string().max(80).optional(),
  created: z.string().datetime().optional(),
  modified: z.string().datetime().optional(),
  tags: z.array(z.string().max(24)).max(10).default([]),
  /** Preview image path relative to the theme folder. */
  preview: z.string().max(200).optional(),
});

/**
 * The theme document: everything the Studio edits and the compiler reads.
 * This is idv7lol's own declarative format, not a renderer API.
 */
export const ThemeSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: IdSchema,
  name: z.string().min(1).max(64),
  version: SemverSchema,
  author: z.string().max(80).default(''),
  description: z.string().max(500).default(''),
  license: z.string().max(80).default('GPL-3.0-or-later'),
  target: TargetSchema.prefault({}),
  /** Vehicle profile id from the signal catalog. */
  vehicleProfile: z.string().default('turbo-ice'),
  layout: LayoutSchema,
  palettes: z.record(IdSchema, PaletteSchema),
  palette: PaletteSelectionSchema,
  fonts: z.record(IdSchema, FontSchema).prefault({ default: { family: 'sans' } }),
  assets: z.record(IdSchema, AssetSchema).prefault({}),
  animations: z.record(IdSchema, AnimationClipSchema).prefault({}),
  components: z.array(ComponentSchema),
  meta: ThemeMetaSchema.prefault({}),
});

export type Theme = z.infer<typeof ThemeSchema>;
export type ThemeInput = z.input<typeof ThemeSchema>;

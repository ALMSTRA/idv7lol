import type { z } from 'zod';
import { ThemeSchema, type Theme, SCHEMA_VERSION } from './theme.js';

export interface SchemaIssue {
  /** JSON path to the offending value, e.g. "components[3].props.needle.width". */
  path: string;
  message: string;
  code: string;
}

export type ParseResult = { ok: true; theme: Theme } | { ok: false; issues: SchemaIssue[] };

export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = '';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out ? `.${String(seg)}` : String(seg);
  }
  return out || '(root)';
}

export function issuesFromZod(error: z.ZodError): SchemaIssue[] {
  return error.issues.map((i) => ({
    path: formatPath(i.path),
    message: i.message,
    code: i.code,
  }));
}

/**
 * Upgrade older documents to the current schema version. There is only one
 * version today; this is the single place future migrations live.
 */
export function migrateTheme(doc: unknown): unknown {
  if (doc && typeof doc === 'object') {
    const v = (doc as { schemaVersion?: unknown }).schemaVersion;
    if (v === undefined) return { ...(doc as object), schemaVersion: SCHEMA_VERSION };
  }
  return doc;
}

/** Parse an untrusted document (already JSON-decoded) into a Theme with defaults applied. */
export function parseTheme(doc: unknown): ParseResult {
  const migrated = migrateTheme(doc);
  const result = ThemeSchema.safeParse(migrated);
  if (result.success) return { ok: true, theme: result.data };
  return { ok: false, issues: issuesFromZod(result.error) };
}

/** Parse a JSON string; JSON syntax errors become a single issue at the root. */
export function parseThemeJson(text: string): ParseResult {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      issues: [
        { path: '(root)', message: `Invalid JSON: ${(e as Error).message}`, code: 'invalid_json' },
      ],
    };
  }
  return parseTheme(doc);
}

/** Serialise a theme for saving. Stable key order makes diffs readable. */
export function serializeTheme(theme: Theme): string {
  return JSON.stringify(theme, null, 2) + '\n';
}

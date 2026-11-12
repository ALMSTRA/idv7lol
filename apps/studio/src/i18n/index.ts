import { en, type Dictionary } from './en.js';
import { ES_FIELD_LABELS, ES_PROFILES, ES_SCENARIOS, es } from './es.js';
import { JA_FIELD_LABELS, JA_PROFILES, JA_SCENARIOS, ja } from './ja.js';
import { RU_FIELD_LABELS, RU_PROFILES, RU_SCENARIOS, ru } from './ru.js';
import { ZH_FIELD_LABELS, ZH_PROFILES, ZH_SCENARIOS, zh } from './zh.js';
import type { Lang } from './languages.js';
import { useUiStore } from '../store/ui.js';

export { LANGUAGES, systemLang, type Lang } from './languages.js';
export const DICTIONARIES: Record<Lang, Dictionary> = { en, es, ru, ja, zh };

/** Names the Studio takes from other packages, in English there: Inspector fields, scenarios, profiles. */
interface Extras {
  fields: Record<string, string>;
  scenarios: Record<string, [string, string]>;
  profiles: Record<string, string>;
}
export const EXTRAS: Partial<Record<Lang, Extras>> = {
  es: { fields: ES_FIELD_LABELS, scenarios: ES_SCENARIOS, profiles: ES_PROFILES },
  ru: { fields: RU_FIELD_LABELS, scenarios: RU_SCENARIOS, profiles: RU_PROFILES },
  ja: { fields: JA_FIELD_LABELS, scenarios: JA_SCENARIOS, profiles: JA_PROFILES },
  zh: { fields: ZH_FIELD_LABELS, scenarios: ZH_SCENARIOS, profiles: ZH_PROFILES },
};

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string
  ? never
  : { [K in keyof T & string]: T[K] extends string ? K : Join<K, Paths<T[K]>> }[keyof T & string];
export type TKey = Paths<Dictionary>;

/**
 * Walk a dotted key. Some keys hold dots themselves (component types such as
 * `gauge.arc`), so each step tries the longest name that exists first.
 */
function lookup(dict: Dictionary, key: string): string | undefined {
  const walk = (cur: unknown, parts: string[]): string | undefined => {
    if (!parts.length) return typeof cur === 'string' ? cur : undefined;
    if (!cur || typeof cur !== 'object') return undefined;
    const obj = cur as Record<string, unknown>;
    for (let n = parts.length; n >= 1; n--) {
      const name = parts.slice(0, n).join('.');
      if (Object.prototype.hasOwnProperty.call(obj, name)) {
        const found = walk(obj[name], parts.slice(n));
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  return walk(dict, key.split('.'));
}

export function translate(
  lang: Lang,
  key: TKey | string,
  vars?: Record<string, string | number>,
): string {
  const s = lookup(DICTIONARIES[lang], key) ?? lookup(en, key) ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}

/** Hook: returns a `t` function bound to the current UI language. */
export function useT(): (key: TKey | string, vars?: Record<string, string | number>) => string {
  const lang = useUiStore((s) => s.lang);
  return (key, vars) => translate(lang, key, vars);
}

/** An Inspector field or section name, from inspector/descriptors.ts, in the UI language. */
export function fieldLabel(lang: Lang, label: string): string {
  return EXTRAS[lang]?.fields[label] ?? label;
}

/** A simulator scenario's name and description in the UI language (English comes from the simulator). */
export function scenarioText(
  lang: Lang,
  s: { id: string; name: string; description: string } | undefined,
): [string, string] {
  if (!s) return ['', ''];
  return EXTRAS[lang]?.scenarios[s.id] ?? [s.name, s.description];
}

/** A vehicle profile's name in the UI language. */
export function profileName(lang: Lang, p: { id: string; name: string }): string {
  return EXTRAS[lang]?.profiles[p.id] ?? p.name;
}

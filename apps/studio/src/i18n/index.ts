import { en, type Dictionary } from './en.js';
import { ES_FIELD_LABELS, es } from './es.js';
import { useUiStore } from '../store/ui.js';

export type Lang = 'en' | 'es';
export const DICTIONARIES: Record<Lang, Dictionary> = { en, es };

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
  return lang === 'es' ? (ES_FIELD_LABELS[label] ?? label) : label;
}

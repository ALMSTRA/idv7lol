import { en, type Dictionary } from './en.js';
import { es } from './es.js';
import { useUiStore } from '../store/ui.js';

export type Lang = 'en' | 'es';
export const DICTIONARIES: Record<Lang, Dictionary> = { en, es };

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string
  ? never
  : { [K in keyof T & string]: T[K] extends string ? K : Join<K, Paths<T[K]>> }[keyof T & string];
export type TKey = Paths<Dictionary>;

function lookup(dict: Dictionary, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
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

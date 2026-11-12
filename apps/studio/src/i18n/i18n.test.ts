import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '@idv7lol/simulator';
import { PROFILES } from '@idv7lol/vehicle-signals';
import { DESCRIPTORS } from '../inspector/descriptors.js';
import { en } from './en.js';
import { DICTIONARIES, EXTRAS, LANGUAGES, systemLang, translate } from './index.js';

describe('translate', () => {
  it('finds keys whose names hold dots, such as component types', () => {
    expect(translate('en', 'components.gauge.arc')).toBe('Circular gauge');
    expect(translate('es', 'components.value.digital')).not.toBe('components.value.digital');
  });

  it('still finds ordinary nested keys and fills in values', () => {
    expect(translate('en', 'library.pieceCount', { n: 3 })).toBe('3 pieces');
  });
});

describe('systemLang', () => {
  it('picks a language the Studio has, else English', () => {
    expect(systemLang('es-MX')).toBe('es');
    expect(systemLang('ja-JP')).toBe('ja');
    expect(systemLang('zh-CN')).toBe('zh');
    expect(systemLang('fr-FR')).toBe('en');
    expect(systemLang(undefined)).toBe('en');
  });
});

/** Every string in a dictionary, by dotted key. */
function leaves(obj: object, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out.set(prefix + k, v);
    else for (const [kk, vv] of leaves(v as object, `${prefix}${k}.`)) out.set(kk, vv);
  }
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe.each(LANGUAGES.filter((l) => l.id !== 'en'))('$name', ({ id }) => {
  it('has every string of the English dictionary, with the same {placeholders}', () => {
    const theirs = leaves(DICTIONARIES[id]);
    const wrong: string[] = [];
    for (const [key, text] of leaves(en)) {
      const t = theirs.get(key);
      if (t === undefined || placeholders(t).join() !== placeholders(text).join()) wrong.push(key);
    }
    expect(wrong).toEqual([]);
  });

  it('names every Inspector field, scenario and vehicle profile', () => {
    const extras = EXTRAS[id]!;
    const missing: string[] = [];
    for (const sections of Object.values(DESCRIPTORS))
      for (const sec of sections)
        for (const label of [sec.title, ...sec.fields.map((f) => f.label)])
          if (!extras.fields[label]) missing.push(label);
    for (const s of SCENARIOS) if (!extras.scenarios[s.id]) missing.push(`scenario ${s.id}`);
    for (const p of PROFILES) if (!extras.profiles[p.id]) missing.push(`profile ${p.id}`);
    expect([...new Set(missing)]).toEqual([]);
  });
});

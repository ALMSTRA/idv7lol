// Kept apart from index.ts, which needs the UI store: the store reads the system language from here.

export type Lang = 'en' | 'es' | 'ru' | 'ja' | 'zh';

/** The languages in the menu, by their own name, and the HTML `lang` each one sets. */
export const LANGUAGES: { id: Lang; name: string; tag: string }[] = [
  { id: 'en', name: 'English', tag: 'en' },
  { id: 'es', name: 'Español', tag: 'es' },
  { id: 'ru', name: 'Русский', tag: 'ru' },
  { id: 'ja', name: '日本語', tag: 'ja' },
  { id: 'zh', name: '简体中文', tag: 'zh-CN' },
];

/** The UI language for a system language such as `ja-JP`; English when the Studio doesn't have it. */
export function systemLang(tag: string | undefined): Lang {
  const base = (tag ?? '').toLowerCase().split('-')[0];
  return LANGUAGES.find((l) => l.id === base)?.id ?? 'en';
}

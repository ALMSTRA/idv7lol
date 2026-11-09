import { createEmptyTheme, parseTheme, type Theme } from '@idv7lol/theme-schema';
import performance from '../../../../themes/performance/theme.json';
import modern from '../../../../themes/modern/theme.json';
import classic from '../../../../themes/classic/theme.json';
import minimal from '../../../../themes/examples/minimal/theme.json';

export interface Template {
  id: string;
  name: string;
  description: string;
  theme: Theme;
}

function load(doc: unknown): Theme | null {
  const r = parseTheme(doc);
  return r.ok ? r.theme : null;
}

export const TEMPLATES: Template[] = [
  { id: 'performance', doc: performance },
  { id: 'modern', doc: modern },
  { id: 'classic', doc: classic },
  { id: 'minimal', doc: minimal },
]
  .map(({ id, doc }) => {
    const theme = load(doc);
    return theme ? { id, name: theme.name, description: theme.description, theme } : null;
  })
  .filter((t): t is Template => t !== null);

export function blankTemplate(): Theme {
  return createEmptyTheme({ id: 'my-cluster', name: 'My cluster' });
}

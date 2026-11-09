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
  /** Conversions of other people's GPL layouts, offered as optional starting points. */
  community: boolean;
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
  ...Object.entries(
    import.meta.glob<unknown>('../../../../themes/community/*/theme.json', {
      eager: true,
      import: 'default',
    }),
  ).map(([path, doc]) => ({ id: `community/${path.split('/').at(-2)!}`, doc })),
]
  .map(({ id, doc }) => {
    const theme = load(doc);
    return theme
      ? {
          id,
          name: theme.name,
          description: theme.description,
          theme,
          community: id.startsWith('community/'),
        }
      : null;
  })
  .filter((t): t is Template => t !== null);

export function blankTemplate(): Theme {
  return createEmptyTheme({ id: 'my-cluster', name: 'My cluster' });
}

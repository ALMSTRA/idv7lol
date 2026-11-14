import { createEmptyTheme, parseTheme, type Theme } from '@idv7lol/theme-schema';
import performance from '../../../../themes/performance/theme.json';
import modern from '../../../../themes/modern/theme.json';
import classic from '../../../../themes/classic/theme.json';
import supercarTrack from '../../../../themes/supercar-track/theme.json';
import nightMinimal from '../../../../themes/night-minimal/theme.json';
import rallyDash from '../../../../themes/rally-dash/theme.json';
import voltRunner from '../../../../themes/volt-runner/theme.json';
import lilyPad from '../../../../themes/lily-pad/theme.json';
import neonDrive from '../../../../themes/neon-drive/theme.json';
import heritage89 from '../../../../themes/heritage-89/theme.json';
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

// The newest first: they open the template list.
export const TEMPLATES: Template[] = [
  { id: 'lily-pad', doc: lilyPad },
  { id: 'supercar-track', doc: supercarTrack },
  { id: 'neon-drive', doc: neonDrive },
  { id: 'heritage-89', doc: heritage89 },
  { id: 'volt-runner', doc: voltRunner },
  { id: 'performance', doc: performance },
  { id: 'modern', doc: modern },
  { id: 'classic', doc: classic },
  { id: 'night-minimal', doc: nightMinimal },
  { id: 'rally-dash', doc: rallyDash },
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

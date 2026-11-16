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

function template(id: string, doc: unknown): Template | null {
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
  .map(({ id, doc }) => template(id, doc))
  .filter((t): t is Template => t !== null);

/**
 * Templates with their pictures inside the file (VDO Classic M is 1.2 MB), newest first: kept out
 * of the Studio's start-up bundle and loaded when the template list opens. `themeId` is the
 * theme's own id, known before the file is loaded (share.ts refuses a theme that keeps it).
 */
const LARGE: { id: string; themeId: string; doc: () => Promise<unknown> }[] = [
  {
    id: 'vdo-classic-m',
    themeId: 'vdo-classic-m',
    doc: () => import('../../../../themes/vdo-classic-m/theme.json').then((m) => m.default),
  },
];

/** Theme ids of every template, the large ones included before they are loaded. */
export const TEMPLATE_THEME_IDS: ReadonlySet<string> = new Set([
  ...TEMPLATES.map((t) => t.theme.id),
  ...LARGE.map((t) => t.themeId),
]);

let large: Promise<Template[]> | null = null;
/** The large templates, loaded once; one that fails to load or parse is left out. */
export function loadLargeTemplates(): Promise<Template[]> {
  large ??= Promise.all(
    LARGE.map((t) =>
      t
        .doc()
        .then((doc) => template(t.id, doc))
        .catch(() => null),
    ),
  ).then((list) => list.filter((t): t is Template => t !== null));
  return large;
}

export function blankTemplate(): Theme {
  return createEmptyTheme({ id: 'my-cluster', name: 'My cluster' });
}

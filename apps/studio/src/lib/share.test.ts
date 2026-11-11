import { describe, expect, it } from 'vitest';
import { createEmptyTheme, parseThemeJson } from '@idv7lol/theme-schema';
import { shareBlock, shareText, submissionUrl } from './share.js';

describe('sharing a theme', () => {
  it('asks for an author before sharing', () => {
    const theme = createEmptyTheme({ id: 'my-cluster', name: 'My cluster' });
    expect(shareBlock(theme)).toEqual({ reason: 'author' });
    expect(shareBlock({ ...theme, author: 'Someone' })).toBeNull();
  });

  it("asks for an id of its own when the theme still has a template's", () => {
    const theme = { ...createEmptyTheme({ id: 'idv7lol-performance', name: 'Mine' }), author: 'A' };
    expect(shareBlock(theme)).toEqual({ reason: 'id', id: 'idv7lol-performance' });
  });

  it('refuses a theme with validation errors', () => {
    const theme = createEmptyTheme({ id: 'my-cluster', name: 'My cluster' });
    const broken = {
      ...theme,
      author: 'Someone',
      palette: { ...theme.palette, default: 'missing' },
    };
    const block = shareBlock(broken);
    expect(block?.reason).toBe('errors');
  });

  it('opens the submission form with the theme name as title', () => {
    const theme = createEmptyTheme({ id: 'night-run', name: 'Night & run' });
    const url = new URL(submissionUrl(theme));
    expect(url.origin + url.pathname).toBe('https://github.com/ALMSTRA/idv7lol/issues/new');
    expect(url.searchParams.get('template')).toBe('theme_submission.yml');
    expect(url.searchParams.get('title')).toBe('Theme: Night & run');
  });

  it('shares a file the Studio can open again', () => {
    const theme = {
      ...createEmptyTheme({ id: 'night-run', name: 'Night run' }),
      author: 'Someone',
    };
    const text = shareText(theme, new Date('2026-11-11T00:00:00Z'));
    const back = parseThemeJson(text);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.theme.author).toBe('Someone');
      expect(back.theme.meta.modified).toBe('2026-11-11T00:00:00.000Z');
    }
  });
});

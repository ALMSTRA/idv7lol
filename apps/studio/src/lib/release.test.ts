import { describe, expect, it } from 'vitest';
import { RELEASE, compareVersions, newerRelease } from './release.js';
import pkg from '../../package.json';
import tauri from '../../src-tauri/tauri.conf.json';

const page = 'https://github.com/ALMSTRA/idv7lol/releases/tag/';
const rel = (tag: string, extra: object = {}) => ({
  tag_name: tag,
  html_url: page + tag,
  ...extra,
});

describe('looking for a newer Studio', () => {
  it('orders versions, a beta before its release', () => {
    expect(compareVersions('0.2.0-beta.6', '0.2.0-beta.7')).toBeLessThan(0);
    expect(compareVersions('0.2.0-beta.10', '0.2.0-beta.9')).toBeGreaterThan(0);
    expect(compareVersions('0.2.0', '0.2.0-beta.9')).toBeGreaterThan(0);
    expect(compareVersions('v0.3.0-beta.1', '0.2.0')).toBeGreaterThan(0);
    expect(compareVersions('0.2.0-beta.6', '0.2.0-beta.6')).toBe(0);
    expect(compareVersions('0.2.0-beta', '0.2.0-beta.1')).toBeLessThan(0);
    expect(compareVersions('catalog', '0.2.0')).toBe(0);
  });

  it('picks the newest release, and only a Studio one from the project’s page', () => {
    const list = [
      rel('catalog'),
      rel('v0.2.0-beta.5'),
      rel('v0.2.0-beta.8'),
      rel('v0.2.0-beta.7'),
      rel('v0.9.0', { draft: true }),
      { tag_name: 'v0.9.9', html_url: 'https://example.com/v0.9.9' },
    ];
    expect(newerRelease(list, '0.2.0-beta.6')).toEqual({
      version: '0.2.0-beta.8',
      url: page + 'v0.2.0-beta.8',
    });
    expect(newerRelease(list, '0.2.0-beta.8')).toBeNull();
    expect(newerRelease({ message: 'rate limited' }, '0.2.0')).toBeNull();
  });

  it('carries the version the desktop app is built with', () => {
    expect(RELEASE.startsWith((pkg as { version: string }).version)).toBe(true);
    // the updater compares against this one, so a release must raise both
    expect((tauri as { version: string }).version).toBe(RELEASE);
  });
});

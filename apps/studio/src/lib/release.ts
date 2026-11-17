/** The release this build belongs to: the tag on GitHub without its `v`. Set when a release is cut. */
export const RELEASE = '0.2.0-beta.7';

const RELEASES_API = 'https://api.github.com/repos/ALMSTRA/idv7lol/releases?per_page=30';
const RELEASES_PAGE = 'https://github.com/ALMSTRA/idv7lol/releases/';
const TAG = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.]+))?$/;

/** Orders two versions such as `0.2.0-beta.6` and `0.2.0`: below zero when `a` is the older one. */
export function compareVersions(a: string, b: string): number {
  const pa = TAG.exec(a);
  const pb = TAG.exec(b);
  if (!pa || !pb) return 0;
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return d;
  }
  // 1.0.0 comes after every 1.0.0-something
  if (!pa[4] || !pb[4]) return pa[4] ? -1 : pb[4] ? 1 : 0;
  const ia = pa[4].split('.');
  const ib = pb[4].split('.');
  for (let i = 0; i < Math.max(ia.length, ib.length); i++) {
    const x = ia[i];
    const y = ib[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      if (Number(x) !== Number(y)) return Number(x) - Number(y);
    } else if (nx !== ny) return nx ? -1 : 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export interface NewRelease {
  version: string;
  url: string;
}

/** The newest Studio release in GitHub's list that is newer than `current`, if there is one. */
export function newerRelease(list: unknown, current: string): NewRelease | null {
  if (!Array.isArray(list)) return null;
  let best: NewRelease | null = null;
  for (const r of list as Array<Record<string, unknown>>) {
    if (!r || r['draft'] === true) continue;
    const tag = r['tag_name'];
    const url = r['html_url'];
    // the car app's catalogue and other tags are not Studio versions
    if (typeof tag !== 'string' || !TAG.test(tag) || typeof url !== 'string') continue;
    if (!url.startsWith(RELEASES_PAGE)) continue;
    const version = tag.replace(/^v/, '');
    if (compareVersions(version, best?.version ?? current) > 0) best = { version, url };
  }
  return best;
}

/** Asks GitHub for the list of releases. Sends nothing about the user or the project. */
export async function checkForUpdate(current = RELEASE): Promise<NewRelease | null> {
  const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return newerRelease(await res.json(), current);
}

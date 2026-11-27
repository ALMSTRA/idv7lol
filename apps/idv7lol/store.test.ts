import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createHash, createSign, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { connect as tcpConnect, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildThemePackage, compileTheme } from '@idv7lol/theme-compiler';
import { createComponent, createEmptyTheme } from '@idv7lol/theme-schema';

const require = createRequire(import.meta.url);
interface Meta {
  key: string;
  id: string;
  name: string;
  hash: string;
  source?: string;
}
interface Item {
  id: string;
  name: string;
  size: number;
  sha256: string;
  url: string;
  theme: { preview: unknown[]; palettes: { store: { colors: Record<string, string> } } };
}
type Get = (
  url: string,
  opts: { hosts: string[]; maxBytes: number; dns: string[]; userAgent: string },
  cb: (err: Error | null, buf?: Buffer) => void,
) => { abort(): void };
interface StoreT {
  items: Item[];
  loaded: boolean;
  busy: string;
  note: string;
  error: string;
  state: { seq: number };
  code(): string;
  phoneUrl(): string;
  statusOf(item: Item): string;
  blocked(): string;
  refresh(cb?: (err: Error | null) => void): void;
  install(item: Item, cb?: (err: Error | null, meta?: Meta) => void): void;
  checkInbox(cb?: (err: Error | null, done?: Meta[]) => void): void;
  tick(): void;
}
const storeJs = require('./store.js') as {
  BASE: string;
  HOST: string;
  PHONE: string;
  NO_INTERNET: string;
  PARKED_ONLY: string;
  newCode(): string;
  cleanItem(raw: unknown, host: string): Item | null;
  readCatalog(buf: Buffer, keys: string[], host?: string): { seq: number; themes: Item[] };
  Store: new (o: Record<string, unknown>) => StoreT;
};
const usb = require('./usb_themes.js') as {
  ThemeLibrary: new (o: { dataDir: string }) => { list(): Meta[] };
};
const net = require('./net.js') as {
  readLease(dir: string): { dns: string[]; interface: string } | null;
  get(
    url: string,
    opts: Record<string, unknown>,
    cb: (err: (Error & { status?: number }) | null, buf?: Buffer) => void,
  ): { abort(): void };
};
const SHADERS = require('./shaders.js') as Record<string, string>;

const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PUBLIC = keys.publicKey.export({ type: 'spki', format: 'pem' }) as string;
const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

function pkgBytes(id: string, name: string): Buffer {
  const base = createEmptyTheme({ id, name });
  const theme = {
    ...base,
    components: [
      createComponent('value.digital', { id: 'speed', x: 760, y: 300, width: 300, height: 120 }),
      createComponent('rect', { id: 'bar', x: 100, y: 300, width: 400, height: 20 }),
    ],
  };
  const result = compileTheme(theme, {});
  expect(result.report.errors).toEqual([]);
  const pkg = buildThemePackage(result, { now: () => new Date('2026-11-27T00:00:00Z') });
  return gzipSync(Buffer.from(JSON.stringify(pkg)));
}

function entry(id: string, name: string, bytes: Buffer, more: Record<string, unknown> = {}) {
  return {
    id,
    name,
    author: 'Community',
    version: '1.0.0',
    layers: 2,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    url: storeJs.BASE + 'themes/' + id + '.idv7pkg',
    preview: [
      ['r', 0, 0, 1920, 720, 0, '$background'],
      ['t', name.slice(0, 20), 100, 200, 40, '$text', 0, 0],
      ['x', 1, 2],
    ],
    background: '$background',
    colors: { background: '#101418', text: '#ffffff', 'bad one': 'red', odd: 'javascript:1' },
    ...more,
  };
}

function envelope(body: object, key = keys.privateKey): Buffer {
  const text = JSON.stringify(body);
  const sig = createSign('SHA256').update(text, 'utf8').sign(key).toString('base64');
  return Buffer.from(JSON.stringify({ sig, body: text }));
}

describe('the store catalog', () => {
  const a = pkgBytes('store-a', 'Store A');

  it('is taken only when signed by a known key', () => {
    const body = { v: 1, seq: 3, themes: [entry('store-a', 'Store A', a)] };
    const cat = storeJs.readCatalog(envelope(body), [PUBLIC]);
    expect(cat.seq).toBe(3);
    expect(cat.themes.map((t) => t.id)).toEqual(['store-a']);
    expect(() => storeJs.readCatalog(envelope(body, other.privateKey), [PUBLIC])).toThrow(
      /not signed/,
    );
    expect(() => storeJs.readCatalog(envelope(body), [])).toThrow(/not signed/);
    // the body changed after it was signed
    const env = JSON.parse(envelope(body).toString()) as { sig: string; body: string };
    env.body = env.body.replace('Store A', 'Store B');
    expect(() => storeJs.readCatalog(Buffer.from(JSON.stringify(env)), [PUBLIC])).toThrow(
      /not signed/,
    );
    expect(() => storeJs.readCatalog(Buffer.from('<html>'), [PUBLIC])).toThrow(/not JSON/);
    expect(() => storeJs.readCatalog(envelope({ v: 2, seq: 1, themes: [] }), [PUBLIC])).toThrow(
      /unknown catalog/,
    );
  });

  it('drops entries the app cannot offer and anything odd in the rest', () => {
    const good = entry('store-a', 'Store A', a);
    const cat = storeJs.readCatalog(
      envelope({
        v: 1,
        seq: 1,
        themes: [
          good,
          good, // twice
          { ...good, id: 'Bad Id' },
          { ...good, id: 'elsewhere', url: 'https://example.com/x.idv7pkg' },
          { ...good, id: 'plain', url: 'http://www.idv7lol.com/x.idv7pkg' },
          { ...good, id: 'port', url: 'https://www.idv7lol.com:8443/x.idv7pkg' },
          { ...good, id: 'constructor' },
          { ...good, id: 'huge', size: 9 * 1024 * 1024 },
          { ...good, id: 'nohash', sha256: 'abc' },
          'text',
          null,
        ],
      }),
      [PUBLIC],
    );
    expect(cat.themes.map((t) => t.id)).toEqual(['store-a', 'constructor']);
    const it0 = cat.themes[0]!;
    expect(it0.theme.preview).toHaveLength(2);
    expect(it0.theme.palettes.store.colors).toEqual({ background: '#101418', text: '#ffffff' });
  });

  it('makes a code of 20 letters and digits from random bytes', () => {
    const codes = new Set(Array.from({ length: 50 }, () => storeJs.newCode()));
    expect(codes.size).toBe(50);
    codes.forEach((c) => expect(c).toMatch(/^[a-z2-7]{20}$/));
  });
});

describe('the store', () => {
  let dir: string;
  let files: Record<string, Buffer | number>;
  let asked: string[];
  let lease: { dns: string[] } | null;
  let moving: boolean;
  const a = pkgBytes('store-a', 'Store A');
  const b = pkgBytes('store-b', 'Store B');

  const get: Get = (url, opts, cb) => {
    asked.push(url);
    expect(opts.hosts).toEqual([storeJs.HOST]);
    expect(opts.userAgent).toBe('idv7lol/0.2.30');
    const f = files[url];
    let done = false;
    const end = (err: Error | null, buf?: Buffer) => {
      if (done) return;
      done = true;
      cb(err, buf);
    };
    setTimeout(() => {
      if (typeof f === 'number' || f === undefined)
        end(Object.assign(new Error('HTTP ' + (f || 404)), { status: f || 404 }));
      else if (f.length > opts.maxBytes) end(new Error('too large'));
      else end(null, f);
    }, 5);
    return { abort: () => end(new Error('cancelled')) };
  };

  function make(more: Record<string, unknown> = {}) {
    const library = new usb.ThemeLibrary({ dataDir: dir });
    const store = new storeJs.Store({
      dataDir: dir,
      library,
      appVersion: '0.2.30',
      shaders: SHADERS,
      fonts: ['sans'],
      keys: [PUBLIC],
      get,
      lease: () => lease,
      moving: () => moving,
      bundled: ['idv7lol-modern'],
      ...more,
    });
    return { store, library };
  }
  const catalog = (seq: number, themes: object[]) => {
    files[storeJs.BASE + 'catalog.json'] = envelope({ v: 1, seq, themes });
  };
  const run = <T>(fn: (cb: (err: Error | null, v?: T) => void) => void) =>
    new Promise<{ err: Error | null; v?: T }>((res) => fn((err, v) => res({ err, v })));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'idv7-store-'));
    files = {};
    asked = [];
    lease = { dns: ['10.0.0.1'] };
    moving = false;
    catalog(1, [entry('store-a', 'Store A', a), entry('store-b', 'Store B', b)]);
    files[storeJs.BASE + 'themes/store-a.idv7pkg'] = a;
    files[storeJs.BASE + 'themes/store-b.idv7pkg'] = b;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('asks for nothing without a lease or while the car moves', async () => {
    const { store } = make();
    lease = null;
    expect((await run((cb) => store.refresh(cb))).err?.message).toBe(storeJs.NO_INTERNET);
    lease = { dns: ['10.0.0.1'] };
    moving = true;
    expect((await run((cb) => store.refresh(cb))).err?.message).toBe(storeJs.PARKED_ONLY);
    expect(asked).toEqual([]);
    expect(store.loaded).toBe(false);
  });

  it('loads the catalog and installs a theme as a USB stick would', async () => {
    const { store, library } = make();
    expect((await run((cb) => store.refresh(cb))).err).toBeNull();
    expect(store.items.map((i) => i.id)).toEqual(['store-a', 'store-b']);
    expect(store.statusOf(store.items[0]!)).toBe('');
    const got = await run<Meta>((cb) => store.install(store.items[0]!, cb));
    expect(got.err).toBeNull();
    expect(got.v?.key).toBe('usb:store-a');
    expect(library.list().map((t) => [t.id, t.source])).toEqual([['store-a', 'store']]);
    expect(store.statusOf(store.items[0]!)).toBe('installed');
    expect(store.note).toMatch(/Installed Store A/);
    expect(store.busy).toBe('');
  });

  it('refuses a file that is not the one the catalog names', async () => {
    const { store, library } = make();
    await run((cb) => store.refresh(cb));
    // another good package of the same size is still not the signed one
    files[storeJs.BASE + 'themes/store-a.idv7pkg'] = Buffer.from(a).fill(1, a.length - 8);
    expect((await run((cb) => store.install(store.items[0]!, cb))).err?.message).toMatch(
      /not the file the catalog names/,
    );
    files[storeJs.BASE + 'themes/store-a.idv7pkg'] = Buffer.concat([a, Buffer.alloc(1)]);
    expect((await run((cb) => store.install(store.items[0]!, cb))).err?.message).toMatch(
      /too large/,
    );
    files[storeJs.BASE + 'themes/store-a.idv7pkg'] = a.subarray(0, a.length - 1);
    expect((await run((cb) => store.install(store.items[0]!, cb))).err?.message).toMatch(/size/);
    // signed, but the package inside is another theme
    catalog(2, [entry('store-a', 'Store A', b)]);
    files[storeJs.BASE + 'themes/store-a.idv7pkg'] = b;
    await run((cb) => store.refresh(cb));
    expect((await run((cb) => store.install(store.items[0]!, cb))).err?.message).toMatch(
      /another theme/,
    );
    expect(library.list()).toEqual([]);
  });

  it('refuses a catalog older than the last one it saw, across restarts', async () => {
    catalog(7, [entry('store-a', 'Store A', a)]);
    const first = make().store;
    await run((cb) => first.refresh(cb));
    expect(JSON.parse(readFileSync(join(dir, 'store.json'), 'utf8')).seq).toBe(7);
    catalog(6, [entry('store-b', 'Store B', b)]);
    const again = make().store;
    expect((await run((cb) => again.refresh(cb))).err?.message).toMatch(/older/);
    expect(again.items).toEqual([]);
  });

  it('keeps one code for the phone page and takes what the phone sent', async () => {
    const { store, library } = make();
    const code = store.code();
    expect(make().store.code()).toBe(code);
    expect(store.phoneUrl()).toBe(storeJs.PHONE + code);
    await run((cb) => store.refresh(cb));
    // nothing sent yet
    expect((await run<Meta[]>((cb) => store.checkInbox(cb))).v).toEqual([]);
    files[storeJs.BASE + 'inbox/' + code] = Buffer.from(
      JSON.stringify({ v: 1, themes: ['store-b', 'not-in-the-catalog', 'idv7lol-modern', 7] }),
    );
    const got = await run<Meta[]>((cb) => store.checkInbox(cb));
    expect(got.v?.map((m) => m.id)).toEqual(['store-b']);
    expect(library.list().map((t) => t.id)).toEqual(['store-b']);
    expect(store.note).toMatch(/From your phone: Store B/);
    // the same inbox again downloads nothing more
    const before = asked.length;
    expect((await run<Meta[]>((cb) => store.checkInbox(cb))).v).toEqual([]);
    expect(asked.slice(before)).toEqual([storeJs.BASE + 'inbox/' + code]);
  });

  it('takes the inbox one theme at a time, whatever the page does meanwhile', async () => {
    const started: string[] = [];
    const box: { store?: StoreT } = {};
    // the page draws again on every change and looks at the inbox whenever the store is free
    const { store, library } = make({
      onChange: () => {
        // (three looks: the real page waits 15 s between two)
        if (box.store && !box.store.busy && box.store.loaded && started.length < 3) {
          started.push('look');
          box.store.checkInbox();
        }
      },
    });
    box.store = store;
    files[storeJs.BASE + 'inbox/' + store.code()] = Buffer.from(
      JSON.stringify({ v: 1, themes: ['store-a', 'store-b'] }),
    );
    // the catalog comes, the page draws, and its look at the inbox starts the chain
    await run((cb) => store.refresh(cb));
    for (let i = 0; i < 100 && (store.busy || library.list().length < 2); i++)
      await new Promise((res) => setTimeout(res, 10));
    expect(
      library
        .list()
        .map((t) => t.id)
        .sort(),
    ).toEqual(['store-a', 'store-b']);
    // each theme was fetched once: no second chain ran beside the first
    expect(asked.filter((u) => u.endsWith('.idv7pkg'))).toHaveLength(2);
    expect(started[0]).toBe('look');
    await new Promise((res) => setTimeout(res, 40));
    expect(asked.filter((u) => u.endsWith('.idv7pkg'))).toHaveLength(2);
    expect(store.busy).toBe('');
  });

  it('leaves a file from the inbox that fails twice, and takes the ones after it', async () => {
    const { store, library } = make();
    await run((cb) => store.refresh(cb));
    files[storeJs.BASE + 'themes/store-a.idv7pkg'] = Buffer.from(a).fill(1, a.length - 8);
    files[storeJs.BASE + 'inbox/' + store.code()] = Buffer.from(
      JSON.stringify({ v: 1, themes: ['store-a', 'store-b'] }),
    );
    const first = await run<Meta[]>((cb) => store.checkInbox(cb));
    expect(first.v?.map((m) => m.id)).toEqual(['store-b']);
    expect(library.list().map((t) => t.id)).toEqual(['store-b']);
    await run((cb) => store.checkInbox(cb));
    const before = asked.length;
    await run((cb) => store.checkInbox(cb));
    expect(asked.slice(before)).toEqual([storeJs.BASE + 'inbox/' + store.code()]);
    expect(store.busy).toBe('');
  });

  it('ends a download when the car moves off', async () => {
    const { store, library } = make();
    await run((cb) => store.refresh(cb));
    const p = run((cb) => store.install(store.items[0]!, cb));
    moving = true;
    store.tick();
    expect((await p).err).not.toBeNull();
    expect(store.error).toBe(storeJs.PARKED_ONLY);
    expect(library.list()).toEqual([]);
  });
});

describe('the app’s downloads', () => {
  let server: Server;
  let port: number;
  let dir: string;
  // the TLS connection itself is not under test here: a plain socket to a local server stands in
  const connect = (
    _t: unknown,
    _o: unknown,
    cb: (err: Error | null, sock?: ReturnType<typeof tcpConnect>) => void,
  ) => {
    const s = tcpConnect(port, '127.0.0.1', () => cb(null, s));
    s.once('error', (e) => cb(e));
  };
  const fetch = (path: string, more: Record<string, unknown> = {}) =>
    new Promise<{ err: (Error & { status?: number }) | null; buf?: Buffer }>((res) =>
      net.get(
        'https://store.test' + path,
        { hosts: ['store.test'], maxBytes: 1000, connect, idleMs: 200, connectMs: 500, ...more },
        (err, buf) => res({ err, buf }),
      ),
    );

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'idv7-net-'));
    server = createServer((req, res) => {
      if (req.url === '/ok') {
        res.setHeader('x-agent', String(req.headers['user-agent']));
        res.end('hello');
      } else if (req.url === '/big') res.end(Buffer.alloc(5000));
      else if (req.url === '/moved') {
        res.statusCode = 302;
        res.setHeader('Location', 'https://store.test/ok');
        res.end();
      } else if (req.url === '/silent') res.write('a');
      else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
    port = (server.address() as AddressInfo).port;
  });
  afterEach(async () => {
    rmSync(dir, { recursive: true, force: true });
    await new Promise((res) => server.close(res));
  });

  it('reads the uplink’s lease from the data folder', () => {
    expect(net.readLease(dir)).toBeNull();
    writeFileSync(join(dir, 'uplink.json'), '{"interface":"wlan1","dns":["192.168.1.1","x",5]}');
    expect(net.readLease(dir)).toEqual({ dns: ['192.168.1.1'], interface: 'wlan1' });
    writeFileSync(join(dir, 'uplink.json'), '{"interface":"wlan1","dns":[]}');
    expect(net.readLease(dir)).toBeNull();
    writeFileSync(join(dir, 'uplink.json'), 'not json');
    expect(net.readLease(dir)).toBeNull();
  });

  it('gets a file, and nothing over the size it was told', async () => {
    expect((await fetch('/ok')).buf?.toString()).toBe('hello');
    expect((await fetch('/big')).err?.message).toBe('too large');
    expect((await fetch('/ok', { maxBytes: 4 })).err?.message).toBe('too large');
  });

  it('follows no redirect and reports what the server answered', async () => {
    expect((await fetch('/moved')).err?.status).toBe(302);
    expect((await fetch('/nothing')).err?.status).toBe(404);
  });

  it('gives up on a server that goes quiet', async () => {
    expect((await fetch('/silent')).err?.message).toMatch(/no data/);
  });

  it('asks only https addresses of the hosts it was given', async () => {
    const refused = (url: string) =>
      new Promise<string>((res) =>
        net.get(url, { hosts: ['store.test'], maxBytes: 10, connect }, (err) =>
          res(err ? err.message : ''),
        ),
      );
    expect(await refused('http://store.test/ok')).toMatch(/only https/);
    expect(await refused('https://other.test/ok')).toMatch(/not a store address/);
    expect(await refused('https://user:pw@store.test/ok')).toMatch(/only https/);
    expect(await refused('nonsense')).toMatch(/bad address/);
    const unlimited = await new Promise<string>((res) =>
      net.get('https://store.test/ok', { hosts: ['store.test'], connect }, (err) =>
        res(err ? err.message : ''),
      ),
    );
    expect(unlimited).toMatch(/no size limit/);
  });
});

'use strict';
/**
 * net.js - one HTTPS GET from the head unit, for the online store (store.js).
 *
 * An app on the unit has no internet of its own. The MGU Store's mgu-uplink gives it to the apps
 * whose package says "mguInternet": true, through a phone's hotspot, a USB-tethered phone or an
 * LTE stick (mgu-store, native/mgu-uplink/README.md):
 *
 * - while the uplink is online it writes the lease to the app's data folder, uplink.json:
 *   { interface, ip, prefix, router, dns[], leaseSeconds, updated }. No file: no connection.
 * - the unit's own resolver does not reach the internet, so names are looked up through the
 *   lease's dns servers.
 * - the unit's clock may be days off. Node checks a certificate as usual; when its only
 *   complaint can be the dates, the chain is checked again without them (certs.js) and the host
 *   name with tls.checkServerIdentity, as the Store's own downloads do
 *   (native/mgu-updater/js/fetch.js). Nothing is sent before that passes.
 *
 * https only, one host list, no redirects, a size limit, and a limit on every wait. What comes
 * back is checked again by the caller (a signature, a sha256): TLS is not what the store trusts.
 *
 * Node 8: CommonJS, builtins only.
 */
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const net = require('net');
const tls = require('tls');
const https = require('https');
const { URL } = require('url');
const certs = require('./certs');

// a network that has moved on leaves a connection silent, never reset: these bound each wait
const CONNECT_MS = 15000;
const IDLE_MS = 30000;
const DATE_ERRORS = ['CERT_NOT_YET_VALID', 'CERT_HAS_EXPIRED'];
const LEASE_FILE = 'uplink.json';

/** The uplink's lease in the app's data folder: { dns: [..], interface }, or null while offline. */
function readLease(dataDir) {
  try {
    const l = JSON.parse(fs.readFileSync(path.join(dataDir, LEASE_FILE), 'utf8'));
    const servers = (Array.isArray(l.dns) ? l.dns : []).filter(
      (s) => typeof s === 'string' && net.isIP(s),
    );
    return servers.length ? { dns: servers, interface: String(l.interface || '') } : null;
  } catch (_e) {
    return null;
  }
}

/** A `lookup` for tls.connect that asks these DNS servers; undefined (the system's) for none. */
function lookupVia(servers) {
  if (!servers || !servers.length) return undefined;
  const resolver = new dns.Resolver();
  resolver.setServers(servers);
  return (hostname, options, cb) => {
    const done = typeof options === 'function' ? options : cb;
    resolver.resolve4(hostname, (err, addrs) => {
      if (err || !addrs.length) done(err || new Error('no address for ' + hostname));
      else done(null, addrs[0], 4);
    });
  };
}

/** Why sock's certificate is refused once its dates are left out; null if it is not. */
function refusedButForDates(sock, host, ca) {
  const peer = sock.getPeerCertificate(true);
  const chain = [];
  for (let c = peer; c && c.raw && !chain.some((d) => d.equals(c.raw)); c = c.issuerCertificate)
    chain.push(c.raw);
  const why = certs.verifyChain(chain, ca ? certs.pemCerts(ca) : certs.nodeRoots());
  if (why) return why;
  const name = tls.checkServerIdentity(host, peer);
  return name ? name.message : null;
}

/**
 * A TLS connection to target ({ host, port }) whose certificate checks out, dates aside.
 * opts: { dns, connectMs, ca }. cb(err, socket); socket.datesIgnored names the date error that
 * was left out, when one was.
 */
function secureConnect(target, opts, cb) {
  let done = false;
  let sock = null;
  const connectMs = opts.connectMs || CONNECT_MS;
  // a timer of its own: Node 8's socket timeout can fire at up to twice its time
  const timer = setTimeout(() => {
    finish(new Error('no connection in ' + Math.round(connectMs / 1000) + ' s'));
    if (sock) sock.destroy();
  }, connectMs);
  function finish(err, s) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    cb(err, s);
  }
  const host = target.host;
  sock = tls.connect(
    {
      host,
      port: target.port,
      servername: net.isIP(host) ? undefined : host,
      ca: opts.ca || undefined,
      rejectUnauthorized: false,
      lookup: lookupVia(opts.dns),
    },
    () => {
      if (sock.authorized) return finish(null, sock);
      const code = sock.authorizationError;
      const why =
        DATE_ERRORS.indexOf(code) < 0 ? String(code) : refusedButForDates(sock, host, opts.ca);
      if (why) {
        sock.destroy();
        return finish(new Error('certificate refused: ' + why));
      }
      sock.datesIgnored = code;
      return finish(null, sock);
    },
  );
  sock.on('error', finish);
}

/**
 * GET url. opts: { hosts: [allowed host names], maxBytes, dns, userAgent, connectMs, idleMs, ca,
 * onProgress(bytes, total|null), connect (tests) }. cb(err, buffer) exactly once. Returns
 * { abort() }, which ends it with the error 'cancelled'.
 */
function get(url, opts, cb) {
  let settled = false;
  let req = null;
  let timer = null;
  const settle = (err, buf) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (req) req.abort();
    cb(err, buf);
  };
  const handle = { abort: () => settle(new Error('cancelled')) };
  let target;
  try {
    target = new URL(url);
  } catch (_e) {
    setImmediate(() => settle(new Error('bad address')));
    return handle;
  }
  if (target.protocol !== 'https:' || target.username || target.password) {
    setImmediate(() => settle(new Error('only https addresses are fetched')));
    return handle;
  }
  if (!opts.hosts || opts.hosts.indexOf(target.hostname) < 0) {
    setImmediate(() => settle(new Error('not a store address: ' + target.hostname)));
    return handle;
  }
  const maxBytes = opts.maxBytes;
  if (!(maxBytes > 0)) {
    setImmediate(() => settle(new Error('no size limit given')));
    return handle;
  }
  const idleMs = opts.idleMs || IDLE_MS;
  const port = Number(target.port) || 443;
  const connect = opts.connect || secureConnect;
  const agent = new https.Agent({ keepAlive: false });
  agent.createConnection = (_options, done) => {
    connect({ host: target.hostname, port }, opts, (err, sock) => done(err, sock));
  };
  // the headers, then each part of the body, within idleMs (the connection has its own limit)
  const wait = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () =>
        settle(new Error(target.hostname + ': no data for ' + Math.round(idleMs / 1000) + ' s')),
      idleMs + (req && req.socket ? 0 : opts.connectMs || CONNECT_MS),
    );
  };
  req = https.request(
    {
      method: 'GET',
      hostname: target.hostname,
      port,
      path: target.pathname + target.search,
      headers: {
        'User-Agent': opts.userAgent || 'idv7lol',
        Accept: '*/*',
        'Accept-Encoding': 'identity',
      },
      agent,
    },
    (res) => {
      wait();
      if (res.statusCode !== 200) {
        res.resume();
        const e = new Error('HTTP ' + res.statusCode + ' from ' + target.hostname);
        e.status = res.statusCode;
        return settle(e);
      }
      const stated = Number(res.headers['content-length']);
      const total = isFinite(stated) && stated >= 0 ? stated : null;
      if (total !== null && total > maxBytes) return settle(new Error('too large'));
      const parts = [];
      let bytes = 0;
      res.on('data', (c) => {
        if (settled) return;
        bytes += c.length;
        if (bytes > maxBytes) return settle(new Error('too large'));
        parts.push(c);
        wait();
        if (opts.onProgress) opts.onProgress(bytes, total);
        return undefined;
      });
      res.on('aborted', () => settle(new Error('connection lost')));
      res.on('error', (e) => settle(e));
      res.on('end', () => {
        if (total !== null && bytes !== total) return settle(new Error('connection lost'));
        return settle(null, Buffer.concat(parts, bytes));
      });
      return undefined;
    },
  );
  req.on('error', (e) => settle(e));
  wait();
  req.end();
  return handle;
}

module.exports = { CONNECT_MS, IDLE_MS, LEASE_FILE, readLease, lookupVia, secureConnect, get };

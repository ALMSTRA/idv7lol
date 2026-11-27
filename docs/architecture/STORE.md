# The online store

How the car app takes themes from idv7lol.com (car app 0.2.30, `apps/idv7lol/store.js` and
`net.js`). Developed and tested locally with a stand-in server; **not tested in a vehicle**.

## Reaching the internet from the head unit

Nothing here is idv7lol's own invention: it is what the MGU Store documents and does.

- An app has internet only through the Store's `mgu-uplink`, and only if its `package.json` says
  `"mguInternet": true` (mgu-store `docs/PUBLISHING.md`, `deploy/README.md` "Internet for selected
  components"). The deploy tool writes the app's id to `/var/opt/mgu-uplink/apps.d/` while
  `mgu-uplink` is installed; without it the field does nothing. `kit/tools/build.py` copies
  `mguInternet` from `app.json`.
- While online the uplink writes its lease to the app's data folder, `uplink.json`:
  `{interface, ip, prefix, router, dns[], leaseSeconds, updated}`; the file is there only while
  online (mgu-store `native/mgu-uplink/README.md`). No file, no request.
- The unit's resolver does not reach the internet: names are looked up through the lease's `dns`
  servers (`dns.Resolver`, as `lookupVia` in mgu-store `native/mgu-updater/js/fetch.js`).
- The unit's clock may be days off. Node checks the certificate as usual; when its only complaint
  can be the dates, the chain is checked again without them and the host name with
  `tls.checkServerIdentity`, before anything is sent. `apps/idv7lol/certs.js` is mgu-store's
  `native/mgu-updater/js/certs.js`, copied verbatim (GPL-3.0-or-later).
- Node 8 on the unit speaks TLS 1.2 at most.

## What the app asks the site

All GET, to `https://www.idv7lol.com/car/v1/` only, no redirects followed, with
`User-Agent: idv7lol/<version>` and nothing about the car.

| Request              | Answer                                | Limit                                      |
| -------------------- | ------------------------------------- | ------------------------------------------ |
| `catalog.json`       | `{ "sig", "body" }`                   | 512 KiB                                    |
| the `url` of a theme | its `.idv7pkg`                        | the size the catalog states, 8 MiB at most |
| `inbox/<code>`       | `{ "v": 1, "themes": ["<id>", ...] }` | 16 KiB                                     |

- `body` is the catalog as JSON text and `sig` its signature: ECDSA P-256 with SHA-256, DER, in
  base64, over the UTF-8 bytes of `body`. The public keys are in `apps/idv7lol/store_keys.js`;
  the private ones are not in this repository.
- The catalog: `{ "v": 1, "seq": <number that only grows>, "themes": [...] }`. A theme:
  `id`, `name`, `author`, `version`, `layers`, `size`, `sha256`, `url`, and for its sketch
  `preview`, `background` and `colors` (the compiled theme's `preview`, `background` and default
  palette). The app refuses a catalog whose `seq` is under the last it saw, and drops any entry
  with an odd id, hash, size or an address on another host.
- A theme is saved only when the downloaded file has the signed size and SHA-256, and then only
  through `readPackage` and `ThemeLibrary.install` of `usb_themes.js`: the checks of a USB
  package, with nothing loosened.
- `<code>` is 20 characters of `a-z2-7` from 13 random bytes, made once and kept in
  `store.json` in the data folder. The Store tab shows `https://www.idv7lol.com/car/#<code>` as a
  QR code; the site's page puts theme ids in that inbox. The app only reads it, and takes only
  ids that are in the signed catalog.

## When

Only with the setting _Online store_ on, the Store tab on screen and the car under 3 km/h. The
catalog is asked for when the tab opens and every five minutes while it stays open, the inbox
every 15 s. A download started there goes on if the tab is left; a car that moves off, or the
setting switched off, ends it. A file from the inbox that fails twice is not asked for again
until the app restarts. Installing never changes the theme on the cluster.

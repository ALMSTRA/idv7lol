# Renderer: how idv7lol draws on the instrument cluster

This document condenses what idv7lol relies on from the reference implementations
(`native/cluster-render` in `robertnisipeanu/idrive-apps`, and `apps/cluster_layouts` in
`eroobeeroo/idrive7-cluster-info`). Nothing here is invented; where
idv7lol has not verified a fact on a car it says so. Keep it current when the renderer changes.

## The pipeline

```
theme.json ──compiler──▶ pieces (GLSL ES 1.00 + uniforms) ──runtime (Node 8)──▶ cluster-render ──RAMSES──▶ KOMBI
                                                                 ▲
                                        SOME/IP vehicle signals ─┘
```

- cluster-render is a C++ service on the head unit (RAMSES participant, Dcsm2 slots on
  iDrive 7). It builds RAMSES scenes from what clients send and publishes them; the cluster's
  own renderer draws them. It is installed as a root tool by the MGU Store.
- Clients (apps) talk to it over the Unix socket `/dev/shm/cluster-render/render.sock`
  (group `tm_oap_app`, which every OAP app has).
- Framing: `u32 LE length | u8 type | body`; type `J` = JSON, `F` = frame (pixels), `M` =
  mesh. Max frame 5,529,664 bytes.
- Handshake: the client sends `{"op":"hello","app":"<id>","proto":1}` and gets back
  `{"ev":"hello","proto":1,"backend":"id7"|"id8","targets":"map:1088x480,panel:1920x720,hud:800x480","repeat":1}`.
  idv7lol reads `targets` instead of hard-coding sizes (other apps can change a target's size in
  the service's config). iDrive 8 has no `panel`; its hello lists
  `map:874x749,hud:353x203,guide:702x213,widget:2240x896,popup:2240x896` (`PROTOCOL.md`).

## Targets (iDrive 7)

| Target  | Slot / scene       | Size                  | Where                                                                                     |
| ------- | ------------------ | --------------------- | ----------------------------------------------------------------------------------------- |
| `panel` | 0x203 / 0x010004f8 | 1920×720              | the whole cluster, _above_ the stock gauges and _below_ the factory telltales and pop-ups |
| `map`   | 0x100 / 0x010004f0 | 1088×480 at (416,120) | the stock map window under the gauges                                                     |
| `hud`   | 0x323 / 0x01000400 | 800×480               | head-up display                                                                           |

idv7lol targets `panel`. Since cluster-render 0.5.1 the panel has its own scene id,
0x010004f8, so the panel and the HUD can show at the same time (upstream: "reported on one
car"). If the cluster refuses that id, or the mapping guard turns it off, the panel falls back
to 0x01000400, the HUD's, and then the two can't show together, as before 0.5.1
(`cluster-render.conf`, `panel_scene_id` / `panel_fallback_scene_id`). The guard keeps the
fallback once the panel's id has had two strikes, until `cluster-render guard-reset` (root, SSH)
or a new cluster-render version (idrive-apps #128, #54).

idv7lol requires cluster-render **0.5.9** or newer:

- before 0.5.2, stopping a renderer-side animation left RAMSES 19's animation system broken, and
  the next request for the target crashed the service (idrive-apps #132). The car app starts and
  stops animations.
- 0.5.5 and 0.5.6 ask again for a scene the cluster accepted and then never mapped: a cluster
  that is still starting, or a lock that unmapped a parked scene, left the panel blank until the
  next request (idrive-apps #147, #151).
- 0.5.9 releases the target when the renderer refuses the texture a layer samples, as for any
  layer in error (idrive-apps #159). Every idv7lol piece samples the glyph atlas and animated
  pictures sample their sprite atlas, so a refused atlas now hands the cluster back instead of
  holding an empty panel.

## iDrive 8 (not supported by idv7lol)

There is no full-cluster target on iDrive 8: the factory gauges always stay. The largest area is
the `widget`/`popup` canvas of 2240×896, of which only the middle is visible (about x 400–1720,
y 143–765, with a notch at the top), and only when the driver picks the widget. Limits and the
GLSL ES 1.00 shaders are the same as on iDrive 7. Upstream verified drawing there on one M4; the
MGU Store says iDrive 8 "is not yet tested on a real car". A port of idv7lol would be a
centre-widget theme type, not a full layout. See `docs/compatibility/COMPATIBILITY.md`.

## Operations

`hello, layer, asset, set, uniform, bind, part, transform, animate, stop, scene, edit, drop,
repeat, status`. Events: `hello, layer, target, budget, error, status`. Unknown fields are
ignored (forward compatible).

- `layer` kinds: `effect` (fragment-shader quad, what idv7lol uses), `image` (RGBA8, dirty
  rects), `video`, `mesh`. Fields include `target, x, y, w, h, z, class, opacity, rotate,
exclusive, time`, plus `guide_hold` (iDrive 7 `map` only) and `yield` (0.5.3, targets with
  yield slots, today `hud`: 0 keeps the layer over the stock HMI's pop-ups). idv7lol uses
  neither; on `panel` the factory telltales and pop-ups always stay on top.
- `asset`: `r8`/`rgba8` textures ≤ 2048², and from 0.5.9 `etc2rgba`/`etc2rgb` (ETC2, w and h
  multiples of 4, sent once, charged once to the pixel memory), sampled by effects (`bind`).
  idv7lol uploads one R8 glyph atlas, and each animation's frames as one `etc2rgba` atlas of at
  most 2048×1024 (the size upstream's ETC2 test drew on the instrument cluster, TEST-ETC2.md). If
  the renderer refuses an ETC2 texture, the sampling layer goes to `error` with
  `asset N: the renderer refused its WxH etc2rgba texture`; the car app then decodes the atlas
  (`apps/idv7lol/etc2.js`) and sends it again as `rgba8`.
- `uniform`: `v` = 1–4 numbers, or with `type` (`float|vec2|vec3|vec4|mat4`) arrays up to 1024
  numbers. A name the shader lacks is silently dropped.
- `animate`: renderer-side keyframes (`keys "t:v,…"`, `loop`, `interp`) on `rotate`,
  `translate`, `scale` or a `uniform`; `time: 1` on an effect drives `u_time` from the KOMBI
  clock. Nothing has to be sent per frame for decorative motion.
- `drop` releases a layer; closing the socket releases everything.

## Limits (cluster-render ≥ 0.4.2, server-enforced)

| Limit                    | Value                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| Effect layers per client | 64 (96 for all clients together)                                                                    |
| Uniforms per layer       | 32 (reference tests assert ≤ 30)                                                                    |
| Floats per layer         | 4096; ≤ 1024 per array uniform                                                                      |
| Animations per layer     | 16                                                                                                  |
| Assets                   | 16 per client / 32 total, ≤ 16 MiB pixel memory; image layers and uncompressed assets count twice   |
| Video layers             | 2 (0.5.x)                                                                                           |
| Clients / binds          | 16 clients; 32 binds (0.5.x)                                                                        |
| Layer geometry           | x,y ±4096; w,h 1..4096; opacity 0..1; rotate ±36000°                                                |
| Bandwidth                | shared budget, ceiling 5500 KB/s (8000 flashed the cluster black); `budget` events announce the cap |
| Bandwidth floor          | 2000 KB/s (0.5.x); the HUD gets its own share, up to half, without raising the ceiling              |

Reserved uniform names (RAMSES matrices): `u_mvp u_mv u_m u_v u_p u_normal`. Never declare
them in a shader. A shader that fails to compile is refused at `layer` time
("effect did not compile"). **One large shader drawing many pieces made the KOMBI restart**;
keep one small shader per piece. Two other cluster projects report the same with heavy
full-screen shaders (the cluster display restarted; locking the car for about two minutes
brought it back). A flat full-panel background, like idv7lol's, has run fine on a car.

## Shaders

- `#version 100`, GLSL ES 1.00, precision qualifiers required (`precision highp float` when
  available, fallback `mediump`).
- The default vertex shader gives `varying vec2 v_uv` with (0,0) at the layer's top-left.
  Fragment shaders convert to pixels with a `u_size` uniform.
- Blending: SrcAlpha / OneMinusSrcAlpha, no depth. Unpainted (alpha 0) pixels show the factory
  cluster beneath.
- Text: there is no font primitive. The proven method is an R8 signed-distance-field atlas
  (reference: Barlow Semi Condensed, 56×64 cells, 32 columns × 3 rows, spread 8 px) bound as
  `u_font`, with glyph codes and x-centres passed as `vec4[8]` arrays (≤ 32 glyphs per layer);
  glyph height = layer height.

## Runtime behaviour the reference proved

- Needles/bars: client-side exponential easing at 60 Hz (τ ≈ 30 ms, 0.15 %-of-scale deadband),
  nudged on each fresh sample; texts and colours ≤ 30 Hz and only on change. Measured traffic
  ≈ 2.5 KB/s while driving, 0 when static, ≈ 600 KB at start (atlas + shaders).
- Fail-safe: layers exist only while the layout is on and data is live (3 s stale + 1.5 s
  grace); dropping all layers hands the slot back to the stock HMI. The KOMBI watchdog drops
  content ≈ 10 s after a client dies.
- A start-up "sweep" is a renderer-side `animate` on the value uniform.

## Reserved zones of the 1920×720 panel

Factory content drawn over the panel, from the Cluster Layouts geometry (`layout_common.js`):

| Zone                        | Rect (x, y, w, h)             | Kind       |
| --------------------------- | ----------------------------- | ---------- |
| Top cowl (telltales)        | 730, 0, 460, 128              | factory    |
| Gear bracket                | 1410, 262, 252, 192           | factory    |
| eDrive status box (hybrids) | 1770, 170, 150, 95            | factory    |
| Bottom telltale strip       | 560, 652, 960, 68             | factory    |
| Slanted glass corners       | y < 217 − 0.55·min(x, 1920−x) | keep clear |
| Stock map window            | 416, 120, 1088, 480           | info       |

They are encoded in `packages/theme-schema/src/display-profiles.ts` and enforced by the
validator (errors for keep-clear, warnings for factory). idv7lol has drawn on one car (a 2021
X4 M) but has **not measured these zones there yet**.

Other projects report more, measured on their cars or from photos. idv7lol shows them in the
Studio as hints (info zones, no findings) until someone checks them:

| Zone                         | Rect (x, y, w, h)  | Source                                                                                                 |
| ---------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| Bottom strip                 | 0, 646, 1920, 74   | Cluster Layouts ends layouts at `STRIP_Y = 646` so the cluster doesn't draw black boxes; bimmer-lab #5 |
| M cars: two cluster boxes    | 793, 289, 246, 92  | Cluster Layouts `M_BOXES`, "from one photo of a car" (±10 px)                                          |
|                              | 1223, 328, 171, 78 |                                                                                                        |
| Driver camera notch (if any) | 740, 128, 440, 19  | cruzen991/Cluster: the notch reaches y ≈ 147                                                           |

## Recovery and risks

- `drop` / socket close / SIGTERM release layers; the Store's uninstall removes
  `/var/opt/cluster-render`.
- Real risks documented upstream: a crashing _service_ restarts the head unit; a bad slot
  mapping restarts the cluster or HUD (guard file at `/var/opt/cluster-render/state/guard.txt`,
  reset with `cluster-render guard-reset` as root). idv7lol only uses the allow-listed `panel`
  target and never sends custom scene ids.
- Vehicle data does **not** come from cluster-render: the app reads SOME/IP fields through
  the OAP SDK proxies declared in its manifest (see `docs/developer/SIGNALS.md`).

## Licensing of what idv7lol copies

- `cluster_render_client.js` and `PROTOCOL.md`: MPL-2.0 (Robert Nisipeanu). Copied
  verbatim with header into `apps/idv7lol`, listed in `THIRD_PARTY_NOTICES.md`.
- Barlow fonts: SIL OFL 1.1.
- Cluster Layouts code (GPL-3.0-or-later) is a reference, not copied; idv7lol writes its own
  engine, shaders and compiler. Since commit `10cefda` Cluster Layouts is PolyForm
  Noncommercial: nothing from later versions is copied or converted, and the community
  templates come from the earlier GPL version.
- Proprietary and never redistributed: BMW rootfs, `libramses`, `libvsomeip3`, vsomeip
  configs, the OAP SDK.

## Versions seen

| Component       | Version      | Note                                                                                             |
| --------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| cluster-render  | 0.4.2, 0.4.3 | 0.4.2 raised layers from 8 to 64/96; 0.4.3 zero-copy receive                                     |
| cluster-render  | 0.5.0–0.5.5  | 0.5.0 scene files (off by default); 0.5.1 panel's own scene id; 0.5.3 `yield`; 0.5.4–0.5.5 fixes |
| Cluster Layouts | 0.13.2       | requires cluster-render 0.4.2, idrive7-renderd 2.1.7, mgu-inputgate 1.0.0                        |
| Cluster Layouts | 0.28.1       | still requires cluster-render 0.4.2; PolyForm Noncommercial since commit `10cefda`               |
| mgu-deploy      | 0.7.11       | pinned by waze-on-cluster                                                                        |

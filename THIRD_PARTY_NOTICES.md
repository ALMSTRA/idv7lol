# Third-party notices

idv7lol's own code is licensed under GPL-3.0-or-later (see `LICENSE`). The following
third-party material is included or will be included with its own licence. Each entry is
updated when the material is added to the repository.

| Material                                              | Origin                                                                                                                                                             | Licence                   | Where                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| cluster-render protocol and JavaScript client         | Robert Nisipeanu, [robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps) `native/cluster-render/js/cluster_render_client.js`, `PROTOCOL.md` | MPL-2.0                   | `apps/idv7lol/cluster_render_client.js` (copied verbatim with header)                                         |
| Barlow, Barlow Semi Condensed, Barlow Condensed fonts | Jeremy Tribby, [Barlow](https://github.com/jpt/barlow)                                                                                                             | SIL Open Font License 1.1 | `apps/studio/public/fonts/*.r8`, `apps/idv7lol/font_*.wad` (baked SDF atlases); `@fontsource/*` in the Studio |
| MGU App Kit (`kit/`: tools, runtime, platform, icons) | cauliflowermossgrape and contributors, [idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps)                                                        | MIT (`kit/LICENSE`)       | `kit/` (vendored so the MGU Store can build the app on the head unit)                                         |

The licence texts that must travel with those parts are in `LICENSES/` (the SIL Open Font License
for Barlow, the MIT licence of the app kit); the car app's package carries them in its `NOTICE`
with the GPL in its `LICENSE`, and the Studio's installers carry `LICENSE`,
`THIRD_PARTY_NOTICES.md` and `LICENSES/`. The MPL-2.0 client keeps its header, which names the
licence and where its source is. Two lines of the vendored kit differ from upstream:
`kit/tools/build.py` takes an interface's methods and broadcasts as a list or a single name, and
writes the app's `license` from `app.json` into its package instead of `UNLICENSED`.

The Studio's interface icons come from [Lucide](https://lucide.dev) (ISC licence), through the
`lucide-react` package.

The ETC2 encoder in `packages/theme-compiler/src/etc2.ts` follows the approach of cluster-render's
`tools/etc2_test/etc2_encode.py` (Robert Nisipeanu,
[robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps), GPL-3.0-or-later):
ETC1 individual and differential modes for colour, EAC for alpha, weighted by alpha. It is a new
implementation with its own search; its blocks decode the same with that script's decoder.

Reference projects studied but **not copied** (their code stays under their own licences and
is not part of idv7lol): eroobeeroo/idrive7-apps and robertnisipeanu/mgu-store (GPL-3.0-or-later).

`themes/community/` holds hand conversions of twelve layouts in
[eroobeeroo/idrive7-cluster-info](https://github.com/eroobeeroo/idrive7-cluster-info), Copyright (C)
2026 eroobeeroo, GPL-3.0-or-later. Their arrangement, proportions, colours and readouts were carried
over; no upstream code, shader, font or image was copied. See `themes/community/README.md`.

The twenty-three `themes/community/kb-*` themes are hand conversions of the cluster themes in
[FDX100/KB](https://github.com/FDX100/KB) (KurdBimmer Themes), Copyright (c) 2026 bimmer-lab,
Copyright (c) 2026 FDX100 (the KurdBimmer themes and changes), MIT. Their arrangement, proportions,
colours and readouts were carried over; no upstream code, shader, font or image was copied. The
conversions stay under the MIT licence. See `themes/community/README.md`.

The five `themes/community/ct-*` themes are hand conversions of the cluster themes of Cluster
Themes 0.26.0 in [jsbaughman/apps](https://github.com/jsbaughman/apps), a fork of bimmer-lab/apps,
Copyright (c) 2026 bimmer-lab, MIT. Their arrangement, proportions, colours and readouts were
carried over; no upstream code, shader, font or image was copied. The conversions stay under the
MIT licence. See `themes/community/README.md`.

Runtime dependencies of the Studio and tooling (React, Vite, Tauri, zod, zustand, …) are
listed with their licences in the generated `apps/studio/src-tauri/THIRD_PARTY.txt` and
`package-lock.json`.

Proprietary BMW material (SDK, head-unit binaries, vsomeip configurations) is never included.

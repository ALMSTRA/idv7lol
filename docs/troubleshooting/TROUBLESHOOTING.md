# Troubleshooting

## Studio

**The installer warns about an unknown publisher.** The executable is not code-signed (no
certificate). Click _More info_, then _Run anyway_, if you downloaded it from this project's releases.

**Nothing moves on the canvas.** The simulator is paused: press **Simulate** (F5) or the ▶
button in the canvas corner. Check the simulator's ignition toggle and that the scenario is not
_cold start_ at the end (non-looping scenarios pause when done: press Reset).

**A component shows dashes.** Its signal is unavailable in the simulator: it is not part of the
vehicle profile (Simulator > Vehicle profile), it is dropped (⚡ in the signals table), or
communication loss is on. The fallback is set in the Inspector, under Signal.

**Validation says "enters the keep-clear zone".** The component touches a slanted glass corner.
Move it right/down (corners end at x ≈ 395 and y ≈ 217).

**"needs N renderer layers; the cluster renderer allows 64".** Reduce components or merge
texts; the Layers panel shows each component's cost. Status panels cost 1 per row.

**Characters the car font cannot draw.** The atlas has digits, Latin letters and common
punctuation; accents and symbols are skipped on the car. Use plain ASCII in texts.

**Save does nothing when running `npm run dev:studio`.** Development mode in a browser downloads
the file instead of writing it. Use the desktop app for Save, Open and bundle export.

**Compile is disabled.** Validation has errors; fix them first.

**Build & Deploy says the atlas is missing.** `apps/studio/public/fonts/` was not generated:
run `npx tsx tools/build/bake-fonts.ts` before `npm run build` / `tauri build`.

## Car app

**The app does not appear in the Store.** Check the source (`ALMSTRA/idv7lol`, branch `main`)
and that `mgu-repo.json` is at the repository root. The Store shows a source error when a
component cannot be used.

**Install fails with a signal/interface error.** A field declared in `apps/idv7lol/app.json`
`signals` does not exist in this car's SOME/IP catalog. Optional interfaces (`_optional`) do not
block; a mandatory one does. Open an issue with the error text and your car model; the fix is
to mark the interface optional or remove it.

**The app page says "not connected".** cluster-render is not installed or not running. Install
it from the Store (source `robertnisipeanu/idrive-apps`); the app requires version 0.5.1+.

**"Waiting for live car data".** No signal has arrived: with the engine off and the car asleep
the bus is silent. Start the car, or set _Demo data: On_ to check the layout.

**The layout shows then disappears after a few seconds.** Car data went stale (3 s) and the
fail-safe dropped the layout; it returns when data flows. Check the Signals page (Diagnostics).

**The factory gear box / telltales cover part of my layout.** Expected: the panel sits below the
factory telltales and the KOMBI keeps its gear bracket. Keep readings out of the reserved zones
(the Studio draws them).

**The cluster restarted.** Stop using the app (Show on the cluster: Off), note the theme and
what you did, and open an issue. cluster-render's upstream documentation describes its
mapping guard; `cluster-render guard-reset` (root SSH) clears it.

**Restore everything.** In the app's Settings, Show on the cluster: Off restores the factory
cluster at once. MGU Store > Installed > idv7lol > Remove uninstalls the app. The Store's rollback restores
the previous state of tools it changed.

## Collecting diagnostics

- Studio: Console tab, Validation tab, and the exported bundle's `theme.json`.
- Car: the app's Diagnostics pages (status, signals with raw payloads, renderer status, versions)
  and the app log `oap_<uid>/data/idv7lol.log` on the unit; cluster-render's log is
  `/var/opt/cluster-render/log/cluster-render.log`.

Never include your VIN, GPS position or personal data in an issue.

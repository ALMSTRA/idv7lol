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

**The app does not appear in the Store.** Check the source (`ALMSTRA/idv7lol`, **Releases** or
**Branch** `main`). The Tags channel skips pre-release tags such as `v0.2.0-beta.3`, so idv7lol
isn't listed there. The Store shows a source error when a component cannot be used.

**"no catalog release and no <id>@<x.y.z>.tgz or .mgu in its releases".** The source was added
on Releases before the repository had its `catalog` release (November 2026). Let the Store check
its sources again, or remove the source and add it again; **Branch** `main` works as well.

**The Store says "coding is missing: it holds default values".** The head unit has no coding,
usually because the SSH unlock flash erased it. MainApp doesn't start on default coding, so no
app can be installed (mgu-store #102). Code the head unit again (BimmerCode, E-Sys or a
workshop), then retry. See "Before you install the MGU Store" in
[DEPLOYMENT.md](../user/DEPLOYMENT.md).

**Black boxes on the cluster that stay after switching idv7lol off** (issue #7, a G82 M4).
Some KOMBIs, M cars among them, put black boxes over a full-screen layout that covers the
cluster's own bottom strip, in the middle and right of the panel, and keep them until the head unit
restarts. From car app 0.2.3 the layout ends at y 646 so the bottom strip (gear, drive mode,
ranges, time, outside temperature) shows below it; other cluster projects found that the boxes no
longer appear then. If you see boxes: update the app, then restart the head unit (hold the volume
knob for about 30 s) to clear them. The setting **Bottom strip > Covered by the layout** draws
layouts whole again, boxes and all.

**Install fails with a signal/interface error.** A field declared in `apps/idv7lol/app.json`
`signals` does not exist in this car's SOME/IP catalog. Since the kit build of November 2026 the
Store build leaves out fields and interfaces the unit lacks and logs what was left out
(idrive7-apps #145), so update to the latest idv7lol first. If it still fails, open an issue with
the error text and your car model.

**Installed, but no tile in the apps menu.** Some iDrive 7 units report HMI version 3, and older
Store versions gave apps marked only `ID7` no tile there (mgu-store #255). Update the Store's
tools, then reinstall idv7lol.

**An update installed, but the app behaves like the old version.** Older Store versions could
run a cached copy of the previous code when the new bundle had the same length (mgu-store #261).
Update the Store's tools and restart the head unit.

**The head unit boot-loops after the Store's first install (firmware 030.016).** A file
permission problem fixed in the Store's deploy tool (mgu-store #173, #185). Follow the Store's
README to recover, and use its current version.

**A Store update shows for idv7lol after every commit.** Fixed from November 2026: the Branch
channel now offers an update only when the car app or the kit changes (`build.shared` in
`mgu-repo.json`, mgu-store #205).

**The app page says "not connected".** cluster-render is not installed or not running. Install
it from the Store (source `robertnisipeanu/idrive-apps`); the app requires version 0.5.9+.

**"Waiting for live car data".** No signal has arrived: with the engine off and the car asleep
the bus is silent. Start the car, or set _Demo data: On_ to check the layout.

**The layout shows then disappears after a few seconds.** Car data went stale (3 s) and the
fail-safe dropped the layout; it returns when data flows. Check the Signals page (Diagnostics).

**The factory gear box / telltales cover part of my layout.** Expected: the panel sits below the
factory telltales and the KOMBI keeps its gear bracket. Keep readings out of the reserved zones
(the Studio draws them).

**The cluster restarted.** Stop using the app (Show on the cluster: Off), note the theme and
what you did, and open an issue. cluster-render's upstream documentation describes its
mapping guard; `cluster-render guard-reset` (root SSH) clears it. Another project saw a cluster
restart twice from one heavy shader, with brake, ABS and stability warnings until the car slept
(idrive7-apps #120); idv7lol keeps one small shader per piece for that reason.

**The layout and a HUD app no longer show at the same time.** After two strikes on the panel's
own scene id, cluster-render's guard keeps the panel on the HUD's id, and then the two can't
show together. It stays that way until `cluster-render guard-reset` (root SSH) or a new
cluster-render version (idrive-apps #128).

**The factory gauges flash for a moment when switching themes.** An empty panel hands the
cluster back for an instant (seen by another cluster app, idrive7-cluster-info #9). Since the
fix of November 2026 idv7lol keeps the old layout's background until the new layout is up, so
this should not happen; if it still does, note the two themes and open an issue.

**Restore everything.** In the app's Settings, Show on the cluster: Off restores the factory
cluster at once. MGU Store > Installed > idv7lol > Remove uninstalls the app. The Store's rollback restores
the previous state of tools it changed.

## Collecting diagnostics

- Studio: Console tab, Validation tab, and the exported bundle's `theme.json`.
- Car: the app's Diagnostics pages (status, signals with raw payloads, renderer status, versions)
  and the app log `oap_<uid>/data/idv7lol.log` on the unit; cluster-render's log is
  `/var/opt/cluster-render/log/cluster-render.log`.

Never include your VIN, GPS position or personal data in an issue.

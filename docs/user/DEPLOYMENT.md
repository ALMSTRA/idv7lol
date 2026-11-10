# Deployment: installing idv7lol on the car

**Status: developed and tested locally; not yet tested in a vehicle.** Read this as the intended
procedure. Until someone confirms it on a car, treat every step as experimental, do it parked,
with the car on stable power, and know how to remove the app (last section).

## What gets installed

- The idv7lol app (an OAP app built from source on the head unit by the MGU Store).
- Its dependency cluster-render (the cluster renderer service by Robert Nisipeanu), which the
  Store installs from `robertnisipeanu/idrive-apps` when it is not already present.
- The Store itself needs mgu-deploy and app-privacy, installed by the Store's own
  installer.

The app ships the three bundled themes (Performance, Modern, Classic) compiled in. From version
0.2.0 it also installs your own themes from a USB stick (next section). To change the built-in
ones instead, add them to the repository or your fork under `themes/<id>/theme.json` and rebuild
(`npx tsx tools/build/build-mgu-themes.ts`), so the Store builds them into the app.

## Your own themes from a USB stick

1. In the Studio, **Build & Deploy** > **Compile theme** > **Save for the car (USB)**, and pick the
   stick. The file lands in `idv7lol/themes/<theme>.idv7pkg`. Any FAT32 or exFAT stick works; several
   themes can sit in that folder.
2. Open the idv7lol app on the car and plug the stick in. The app looks at `/media/<label>` (and
   `/run/media/<user>/<label>`) every 5 seconds, checks each new package and copies the good ones to
   its data folder. The status page shows "Installed from USB: …" or why a file was refused.
3. **Next theme** now cycles through the built-in themes and the installed ones. Installing never
   changes what the cluster shows.
4. **Remove USB theme** deletes the theme being shown, if it came from a stick. Take the file off
   the stick too, or it installs again the next time the stick is plugged in.

What the app checks before installing: package format and minimum app version, file size (32 MB),
at most 64 layers and 15 animations, image sizes, renderer memory (16 MiB), that every layer is on
the 1920×720 panel, and that every layer names a shader the app ships. Packages carry no shaders;
the app uses its own copy. Unknown fonts fall back to the app's font. At most 20 themes.

**Not tested in a vehicle.** That the app can read the stick at `/media` is inferred from Cluster
Layouts, which writes its logs there; confirm it on the first car test.

## Requirements

- A BMW with iDrive 7 (MGU) head unit. The development car runs software `20w44.1-1-3`; that
  string identifies the head-unit software, not the renderer.
- The [MGU Store](https://github.com/robertnisipeanu/mgu-store) installed on the head unit
  (root SSH access is needed once for that; follow its README).
- Internet on the head unit for the Store (mgu-uplink) or a USB stick with the repository
  checkout.

## Procedure (via the MGU Store)

1. In the Store on the car, open **Settings > Sources > Add GitHub repository** and enter
   `ALMSTRA/idv7lol`. Choose the `main` branch (or a tag once releases exist).
2. The Store lists **idv7lol**. Open it and press **Install**. The Store installs
   `cluster-render` first if needed, then builds idv7lol from source on the unit (Python +
   Node, about a minute) and installs it.
3. Restart the head unit if the Store asks.
4. Open the **idv7lol** app from the apps menu. Its page shows status, car data and the renderer
   connection. Diagnostics pages follow with the **Diagnostics** button.
5. Nothing is drawn on the cluster until you press **Show on the cluster** (or set _Show on the
   cluster: On_ in the app's Settings). The layout appears only while car data is live.
6. Choose the theme and palette with **Next theme** / **Palette** or in Settings. _Start-up
   sweep_, _Clock offset from UTC_ and _Demo data_ are there too.

## Checking that it worked

- The app page says _Showing <theme>_ and _connected (id7)_.
- The cluster shows the layout; factory telltales and pop-ups remain on top.
- Turn **Show on the cluster** off: the factory cluster is back within a second.

## Removing

- In the app's own Settings, _Show on the cluster: Off_ stops drawing immediately.
- MGU Store > Installed > idv7lol > **Remove** uninstalls the app; removing `cluster-render` is
  optional (other apps may use it). The Store's deploy tool can also roll back.
- If the head unit misbehaves, the Store's documentation describes SSH-level removal of
  everything it installed.

## Alternative: USB stick

Copy a checkout of this repository to a USB stick, plug it into the car and add it as a source
in the Store (_Add from USB_). The Store builds the app the same way.

## Known limits of this release

- Not tested in a vehicle yet; the first on-car run should be done by a maintainer with SSH
  access to recover if needed.
- Signals mapped on the car: engine speed, speed, coolant, oil, torque, accelerations, gear and
  gearbox mode, drive mode, boost (sport display cars), outside temperature, gearbox oil. Fuel
  level, range and 12 V battery are not mapped yet and show dashes.
- Opacity animations do not play on the car; conditional rotation/scale clips are not started.

# Deployment: installing idv7lol on the car

**Status: first vehicle test done.** On a 2021 BMW X4 M Competition (F98, iDrive 7) the app
installed from the Store, drew the Performance and Supercar Track themes on the cluster, and
turning it off brought the factory cluster back. Everything else in this guide (USB themes,
images, animations, the other themes) has not been tried on a car yet. Do it parked, with the car
on stable power, and know how to remove the app (last section).

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
Layouts, which writes its logs there; it still has to be confirmed on a car.

## Requirements

- A BMW with iDrive 7 (MGU) head unit. The development car runs software `20w44.1-1-3`; that
  string identifies the head-unit software, not the renderer.
- The [MGU Store](https://github.com/robertnisipeanu/mgu-store) installed on the head unit
  (root SSH access is needed once for that; follow its README).
- Internet on the head unit for the Store (mgu-uplink) or a USB stick with the repository
  checkout.

## Before you install the MGU Store: the SSH unlock erases the head unit's coding

Getting root SSH (needed once for the Store) means flashing a debug software image onto the head
unit. That flash replaces one software part and **does not code the unit afterwards**, so the head
unit is left on its default values. BMW's own tools (ISTA, E-Sys) always code right after
programming; the unlock does only the first half.

What it looked like on the car idv7lol was tested on, before and after the flash:

| Part                                   | Before        | After                              |
| -------------------------------------- | ------------- | ---------------------------------- |
| CAFD (the head unit's coding)          | `006.036.022` | `FFFFFFFF_255.255.255` (no coding) |
| SWFL `000056EA` (the part it replaces) | `016.012.001` | `030.016.002` (the debug image)    |

What you lose, and what to expect:

- **The head unit's settings and coding**: language, menu tiles, display settings and anything
  BMW or BimmerCode had coded. The screen comes back looking "unconfigured".
- **The Store won't install anything until the unit is coded again.** Its installer refuses with
  "coding is missing: it holds default values", because MainApp doesn't start on default coding
  (mgu-store #102). Recoding the head unit fixes it; on the test car BimmerCode did it.
- Turning debug mode on (the flash does, and so does each later enable) resets the driver
  profile, seat memory and the BMW ID session.
- **BMW Digital Key**: owners report that the paired keys are erased in most cases. Plan to pair
  them again.
- Not touched: the rest of the car's software, other modules and the navigation maps (they live
  on another partition).

Other owners report the same after the flash (for example idrive7-8-ssh-root issues #5, #17 and
#41); it is not one car's fault, and it happens again on every flash. The unlock tool's own
README has a "Back up your coding before flashing" section; read it first:
[cauliflowermossgrape/idrive7-8-ssh-root](https://github.com/cauliflowermossgrape/idrive7-8-ssh-root).
So:

1. Before flashing, back up the head unit's coding (BimmerCode or E-Sys) and note your settings.
2. Have a way to recode ready (BimmerCode, E-Sys or a workshop) before you start.
3. Flash once. If SSH stops working later, use the unlock tool's enable or persist steps, which
   don't flash, instead of flashing again.

This is about installing the Store, not idv7lol: idv7lol itself doesn't flash or code anything.

## Procedure (via the MGU Store)

1. In the Store on the car, open **Settings > Sources > Add GitHub repository** and enter
   `ALMSTRA/idv7lol`. Either channel works:
   - **Releases** (the Store's default once a repo has releases) reads the `catalog` release: a
     ready package of the car app, without BMW's SDK, which the head unit makes from one of its
     own apps. Not tried on a car yet.
   - **Branch** `main` builds the app on the head unit from the latest code. Tested on a car.

   Don't pick Tags: it skips pre-release tags such as `v0.2.0-beta.3`.

2. The Store lists **idv7lol**. Open it and press **Install**. The Store installs what idv7lol
   needs first (`cluster-render` 0.5.9, and its own deploy tool 0.8.12, which makes an update run
   the new code), then installs idv7lol: on **Releases** the ready package, on **Branch** after
   building it from source on the unit (Python + Node, about a minute).
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
  optional (other apps may use it). The Store removes `cluster-render` only once no installed app
  needs it: while idv7lol is installed it refuses with _Needed by idv7lol_ (mgu-store #242, #249).
  The Store's deploy tool can also roll back.
- **Before a firmware (I-Step) update**, set _Show on the cluster: Off_. The Store's author
  advises uninstalling the Store and its apps before an I-Step update (mgu-store #280).
- If the head unit misbehaves, the Store's documentation describes SSH-level removal of
  everything it installed.

## Alternative: USB stick

Copy a checkout of this repository to a USB stick, plug it into the car and add it as a source
in the Store (_Add from USB_). The Store builds the app the same way. The Store reads a stick
with `mgu-repo.json` or `catalog.json` at its root or under `mgu-repo/`, not under `apps/`
(mgu-store #284). The Store repository's installer can write our ready package and icon to a
stick: `node deploy/mgu-install.js usb-repo <stick> github:ALMSTRA/idv7lol` (mgu-store #268). Not
tried with idv7lol yet.

## Known limits of this release

- Tested on one car so far (X4 M, see above). Not confirmed on a car yet: USB themes, image layers
  and animations, the Modern and Classic themes, and the community templates. Keep SSH access
  at hand in case you need to recover.
- Signals mapped on the car: engine speed, speed, coolant, oil, torque, accelerations, gear and
  gearbox mode, drive mode, boost (sport display cars), outside temperature, gearbox oil, and from
  the cluster the fuel level, fuel range, odometer and reserve warning. The 12 V battery is not
  mapped yet and shows dashes.
- The fuel level is the engine unit's own percentage (OBD-II, read only) where it answers;
  otherwise the cluster's litres over the tank size. The engine unit is asked only while the car
  is switched on, never parked, so the car's networks can go to sleep. That size is learned (from the engine unit's
  percentage, or from the fullest level seen, never below 65 l) or set in the app's settings
  (_Fuel tank size_); until it is known a tank smaller than 65 l reads low. The app's page shows
  which source it uses. Not tested in a vehicle yet.
- Opacity animations do not play on the car; conditional rotation/scale clips are not started.

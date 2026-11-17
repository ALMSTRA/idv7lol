# Build

## Toolchain

| Tool                           | Version used               | Purpose                                  |
| ------------------------------ | -------------------------- | ---------------------------------------- |
| Node.js                        | 24 (20+ works)             | packages, Studio front end, tooling      |
| npm                            | 11                         | workspaces                               |
| Rust (MSVC)                    | stable                     | Studio desktop shell (Tauri 2)           |
| Visual Studio Build Tools 2022 | C++ workload               | linking the Rust binary                  |
| WebView2                       | preinstalled on Windows 11 | Studio runtime                           |
| Python 3                       | 3.12                       | MGU app kit build (`kit/tools/build.py`) |

## Everyday

```bash
npm install
```

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm run format
```

Tests run on the TypeScript sources through Vitest aliases; no build step is needed. `npm run
build` compiles the packages to `dist/` with project references.

## Studio

```bash
npm run dev:studio
```

Runs Vite only (browser at `http://localhost:1420`; file dialogs fall back to downloads).

```bash
npm run tauri:dev
```

Runs the desktop app with hot reload. Run Rust/Tauri commands from PowerShell, not Git Bash:
Git's `link.exe` shadows the MSVC linker.

```bash
npm run tauri:build
```

Produces `apps/studio/src-tauri/target/release/bundle/nsis/idv7lol Studio_<version>_x64-setup.exe`
(and the bare `idv7lol-studio.exe`). The installer is not code-signed (there is no
certificate), so SmartScreen shows a warning on first run.

Icons: replace `apps/studio/app-icon.png` (made from `docs/assets/logo.png`), then
`npx tauri icon app-icon.png -o src-tauri/icons` inside `apps/studio`.

Font atlases for the Studio's compile step: `npx tsx tools/build/bake-fonts.ts` writes them to
`apps/studio/public/fonts/`.

## Themes and the MGU app

```bash
npm run themes:validate
```

```bash
npx tsx tools/build/build-mgu-themes.ts
```

Compiles every `themes/*/theme.json` into `apps/idv7lol/theme_<id>.js`, bakes the font atlases
to `apps/idv7lol/font_<family>.{wad,js}`, writes `themes_index.js` and refreshes the theme and
palette choices in `apps/idv7lol/app.json`. These generated files are committed: the head unit
builds the app from the repository without our toolchain.

Compiler CLI: `npx tsx packages/theme-compiler/src/cli.ts validate|build|bake-font …`.

### Packaging the app without the SDK

```bash
python kit/tools/build.py --preview-only idv7lol
```

Stages the app under `dist/idv7lol/` (javascript, kit runtime, RHMI data). Handy for checking
what the Store will build. An installable package needs BMW's proprietary `oap-sdk`, which the
MGU Store extracts from the head unit itself at install time; it is never part of this
repository. Developers with a unit can place their own extracted `oap-sdk/` at the repository
root to produce `dist/idv7lol@<version>.tgz` locally (see the kit's documentation in
`cauliflowermossgrape/idrive7-apps`).

## CI

`.github/workflows/ci.yml` runs on pushes to `main`, tags and pull requests: format check, lint,
typecheck, tests, theme validation, package build, Studio front-end build, a secret scan
(gitleaks) and, on pushes, the Windows installer build (artifact kept 14 days). Workflows run
with read-only tokens.

## Releases

Tag `vX.Y.Z` only for documented, tested milestones. Attach the Studio installer from the CI
artifact. The MGU Store reads the repository tree (`mgu-repo.json`) on a branch or tag. Its Tags
channel skips tags with a pre-release suffix, so `v0.2.0-beta.7` is not offered there.

### Studio releases and the updater

The desktop Studio updates itself from `studio-latest.json` in the `catalog` release (Tauri's
updater plugin; the address and the public key are in `apps/studio/src-tauri/tauri.conf.json`).
The update files are signed in CI with the repository secret `TAURI_SIGNING_PRIVATE_KEY`; without
the secret (a pull request from a fork) the Studio still builds, without them. Whoever holds the
private key can publish updates, and losing it means installed copies can no longer be updated:
keep it out of the repository and keep a copy.

For a release `vX.Y.Z[-beta.N]`:

1. Set that version in `apps/studio/src-tauri/tauri.conf.json` and in `RELEASE`
   (`apps/studio/src/lib/release.ts`); a test keeps the two equal. Push and wait for CI.
2. Download the `idv7lol-studio-windows` and `idv7lol-studio-macos` artifacts and publish the
   release with the files named `idv7lol-Studio-<version>-x64-setup.exe`,
   `idv7lol-Studio-<version>-universal.dmg` and `idv7lol-Studio-<version>-universal.app.tar.gz`.
3. Write the list from the `.sig` files of the same artifacts and upload it:

```bash
python tools/build/studio-update-manifest.py <version> <folder with the artifacts>
```

```bash
gh release upload catalog dist/studio-update/studio-latest.json --clobber
```

Installed copies offer the update from then on, so upload the list last.

### The car app's catalogue

On the **Releases** channel, which the Store offers first once a repository has releases, it
reads the `catalog.json` of a release named `catalog`. After a car-app change, rebuild that
release:

```bash
python tools/build/build-store-catalog.py
```

```bash
gh release upload catalog dist/catalog/* --clobber
```

The script runs `kit/tools/build.py` with an empty stand-in for BMW's oap-sdk and takes it out of
the package again: the head unit makes that module from one of its own apps (mgu-store
`docs/PUBLISHING.md`, "Releases"). The `catalog` release is a normal release that is not marked
latest, so the Studio pre-releases stay at the top of the Releases page.

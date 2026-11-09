# Quick start

Two ways to use idv7lol: as a **theme designer** with the Studio, or as a **developer** working
on the platform. Installing on a car is a separate step described in
[user/DEPLOYMENT.md](user/DEPLOYMENT.md); nothing here touches your vehicle.

## Designers: idv7lol Studio (Windows)

1. Get the Studio: download the latest `idv7lol Studio_x.y.z_x64-setup.exe` from the GitHub
   Releases page when one exists, or build it from source (below). The installer is **not
   code-signed**; Windows SmartScreen will ask you to confirm the first start.
2. Start idv7lol Studio from the Start menu.
3. In the welcome dialog pick a template (Performance, Modern, Classic), the minimal example or
   a blank layout.
4. Drag components from the **Library** onto the canvas. Click one to edit it in the
   **Inspector**: position, size, the signal it shows, colours, styles.
5. Watch it move: the **Simulator** at the bottom runs a virtual car (choose a scenario or move
   the throttle and brake yourself).
6. Press **Validate**: errors (red) must be fixed, warnings (orange) are worth reading. The
   reserved zones of the cluster are drawn on the canvas; keep essential readings out of them.
7. **Save** your theme (`.idv7theme`, plain JSON).
8. **Build & Deploy → Compile theme**, then **Export bundle…** to a folder. The bundle holds
   the compiled theme, shaders and font atlas the car app loads.

Spanish user guide: [user/GUIA_USUARIO_ES.md](user/GUIA_USUARIO_ES.md). Full manual:
[user/STUDIO_USER_GUIDE.md](user/STUDIO_USER_GUIDE.md).

## Developers

Requirements: Node.js 20+ (24 recommended), npm 10+, Python 3, and for the desktop app Rust
stable (MSVC) plus Visual Studio Build Tools 2022 (C++ workload).

```bash
git clone https://github.com/ALMSTRA/idv7lol.git
```

```bash
cd idv7lol && npm install
```

```bash
npm test
```

```bash
npm run tauri:dev
```

`npm run dev:studio` runs the editor in a browser (file dialogs fall back to downloads).
`npm run themes:validate` checks the bundled themes; `npx tsx tools/build/build-mgu-themes.ts`
compiles them into the MGU app. See [developer/BUILD.md](developer/BUILD.md).

## Where things are

| You want to…                   | Look at                                                                  |
| ------------------------------ | ------------------------------------------------------------------------ |
| write a theme by hand          | [developer/THEME_DEVELOPMENT.md](developer/THEME_DEVELOPMENT.md)         |
| know what a component can do   | [developer/COMPONENT_API.md](developer/COMPONENT_API.md)                 |
| know which car data exists     | [developer/SIGNALS.md](developer/SIGNALS.md)                             |
| understand the renderer limits | [architecture/RENDERER.md](architecture/RENDERER.md)                     |
| install on the car             | [user/DEPLOYMENT.md](user/DEPLOYMENT.md)                                 |
| fix a problem                  | [troubleshooting/TROUBLESHOOTING.md](troubleshooting/TROUBLESHOOTING.md) |

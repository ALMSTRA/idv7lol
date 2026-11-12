# idv7lol Studio on a Mac

**Status: compiled, not tested on a Mac yet.** The macOS build comes from CI on a GitHub macOS
machine: one app for Apple silicon and Intel Macs, macOS 10.15 or newer. It is the same Studio as
on Windows. Reports from Mac users are very welcome.

## Download

Get `idv7lol Studio_<version>_universal.dmg` from the
[Releases page](https://github.com/ALMSTRA/idv7lol/releases) when the release lists it. Every
build of `main` is also kept for 14 days as the `idv7lol-studio-macos` artifact of its
[CI run](https://github.com/ALMSTRA/idv7lol/actions/workflows/ci.yml) (you need to be signed in to
GitHub to download those; the download is a zip with the `.dmg` inside).

## Install

1. Open the `.dmg` and drag **idv7lol Studio** to **Applications**.
2. Eject the disk image.

## The first time you open it

The app isn't notarized by Apple (that needs a paid developer account), so macOS asks once:

- **macOS 14 and older:** in Applications, right-click **idv7lol Studio**, choose **Open**, then
  **Open** again.
- **macOS 15 and newer:** open it once and close the warning. Then go to **System Settings >
  Privacy & Security**, scroll down to the message about idv7lol Studio and click **Open
  Anyway**.

If macOS says the app "is damaged and can't be opened", that's the download quarantine flag, not a
broken file. Remove it in Terminal, then open the app again:

```bash
xattr -dr com.apple.quarantine "/Applications/idv7lol Studio.app"
```

## Using it

Everything works as on Windows; see the [Studio user guide](STUDIO_USER_GUIDE.md). Double-clicking
a `.idv7theme` file in Finder opens it in the Studio. **Save for the car (USB)** asks for the
stick: pick it under **Volumes** (it shows by its name in the sidebar). The Studio writes
`idv7lol/themes/<theme>.idv7pkg` on it, the same as on Windows.

To remove the Studio, drag it from Applications to the Trash.

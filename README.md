# Chis Flasher (beggar_chis)

Tauri 2 + Vue 3 desktop client. Cartridge operations are delegated to the `cfb` sidecar from [chis-burner-cmd](https://github.com/eyenobig/chis-burner-cmd).

## Local development

Local development and production deliberately use different sidecar sources.

The local source repository is expected next to this project:

```text
Z:\Project\
  beggar_chis\
  chis-burner-cmd\
```

Build and copy the local sidecar only when `chis-burner-cmd` changes:

```bash
npm run build:cfb:local
```

Then start Tauri without rebuilding `cfb`:

```bash
npm install
npm run dev
```

To explicitly refresh the local sidecar and then start Tauri in one command:

```bash
npm run dev:refresh-cfb
```

When the local repository lives elsewhere, set `CFB_LOCAL_DIR` before running `build:cfb:local`.

## Production sidecar

CI and Release builds never compile `chis-burner-cmd`. They download the matching prebuilt Tauri sidecar from the `eyenobig/chis-burner-cmd` GitHub Release:

```bash
npm run build:cfb:github
```

The release must contain these assets:

```text
cfb-x86_64-pc-windows-msvc.exe
cfb-x86_64-unknown-linux-gnu
cfb-x86_64-apple-darwin
cfb-aarch64-apple-darwin
```

Configuration:

- `CFB_RELEASE_TAG`: release tag to download; defaults to `latest`.
- `CFB_GITHUB_REPO`: source repository; defaults to `eyenobig/chis-burner-cmd`.
- `CFB_TARGET`: Rust target triple; CI supplies this from its platform matrix.
- `CFB_GITHUB_TOKEN`: token used for private repositories.

Set the repository variable `CFB_RELEASE_TAG` to pin production builds to a known `cfb` release. If `chis-burner-cmd` is private, add a `CFB_RELEASE_TOKEN` Actions secret with read access to that repository.

## Commands

- `npm run dev`: start Tauri with the existing sidecar.
- `npm run build:cfb:local`: build from the sibling local repository.
- `npm run build:cfb:github`: download a GitHub Release sidecar.
- `npm run dev:refresh-cfb`: rebuild the local sidecar, then start Tauri.
- `npm run build`: build the Vue frontend.

## Recommended IDE setup

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

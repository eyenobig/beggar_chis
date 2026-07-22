# Chis Flasher (beggar_chis)

Tauri 2 + Vue 3 desktop client. Cartridge operations are delegated to the `cfb` sidecar from [chis-burner-cmd](https://github.com/eyenobig/chis-burner-cmd).

`chis-burner-cmd` is a **separate repository** consumed only as a prebuilt sidecar binary — it is intentionally not a git submodule and not nested in this repo. See [docs/client-cmd-integration.md](docs/client-cmd-integration.md) for the rationale (a submodule was tried before and broke CI). All cfb process and command integration lives under src/services/cfb/.

## Local development

Local development and production deliberately use different sidecar sources.

The local source repository is expected next to this project:

```text
Z:\Project\
  beggar_chis\
  chis-burner-cmd\
```

`npm run dev` is self-sufficient: before starting Vite it runs `npm run ensure:cfb`, which checks the sidecar version and only builds when needed.

```bash
npm install
npm run dev
```

How `ensure:cfb` resolves the sidecar:

- If a sibling `chis-burner-cmd` source checkout is present (or `CFB_LOCAL_DIR` is set), the expected version is read from its `Cargo.toml`. A missing or version-mismatched sidecar is rebuilt locally (`build:cfb:local`).
- Otherwise the expected version comes from the chis-burner-cmd GitHub Release and the sidecar is downloaded (`build:cfb:github`).
- If the existing sidecar already reports the expected version, the build/download is skipped (a few hundred ms).

To force a rebuild regardless of version (e.g. you edited cfb source without bumping the version), use:

```bash
npm run dev:refresh-cfb
```

When the local repository lives elsewhere, set `CFB_LOCAL_DIR` so both `build:cfb:local` and `ensure:cfb` find it.

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

## Release build gate

The Release workflow (`.github/workflows/release.yml`) only builds on **double gate**, mirroring `chis-burner-cmd`:

| Gate | Where | Meaning |
| --- | --- | --- |
| Tag required | `on.push.tags: ['v*']` | Only a pushed `v*` tag triggers a build. Plain pushes / PRs never build. |
| Tag must be on `main` | `gate` job | `git merge-base --is-ancestor` checks the tagged commit is an ancestor of `main`; a tag on any other branch is rejected before any platform builds. |

`workflow_dispatch` (manual run) bypasses the gate since it carries no tag. To cut a release: ff-merge `dev` into `main`, push `main`, then tag and push the tag.

## Commands

- `npm run dev`: start Tauri with the existing sidecar.
- `npm run build:cfb:local`: build from the sibling local repository.
- `npm run build:cfb:github`: download a GitHub Release sidecar.
- `npm run dev:refresh-cfb`: rebuild the local sidecar, then start Tauri.
- `npm run build`: build the Vue frontend.

## Recommended IDE setup

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
## API environment

Frontend API URLs are resolved through `src/config/api.js`.

- Local development and local packaging default to `http://localhost:1145`.
- CI and release packaging read the `API_BASE_URL` GitHub Actions secret and expose it to Vite as `VITE_API_BASE_URL`.
- Application code should use `API_CONFIG.baseUrl` or `apiUrl(path)` instead of embedding an endpoint.

`VITE_` values are compiled into the frontend bundle. Store only the API endpoint in this secret, never an API token or credential.

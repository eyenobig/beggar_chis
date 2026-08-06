# Multi-platform build and compatibility checks

## Automated workflows

- Pull requests and pushes to `main` run `.github/workflows/ci.yml`.
- Version tags matching `v*` run `.github/workflows/release.yml` and create platform installers.
- Both workflows download the matching released CFB sidecar and run `npm run check:platform` before building Tauri.

The CI matrix uses native GitHub-hosted runners:

| Platform | Rust target | Runner |
| --- | --- | --- |
| Windows x64 | `x86_64-pc-windows-msvc` | `windows-latest` |
| Linux x64 | `x86_64-unknown-linux-gnu` | `ubuntu-22.04` |
| macOS Intel | `x86_64-apple-darwin` | `macos-15-intel` |
| macOS Apple Silicon | `aarch64-apple-darwin` | `macos-15` |

## What the compatibility check proves

`scripts/check-platform.mjs` performs a hardware-free native smoke test:

1. Finds the correctly named Tauri sidecar for the target triple.
2. Starts CFB and validates its JSON version event.
3. Starts the CFB help command.
4. Confirms the CFB command parser exposes EEPROM 4K, EEPROM 64K, SRAM, FLASH, and FRAM compatibility modes.
5. After Tauri compilation, confirms the application and renamed `cfb[.exe]` output both exist.
6. Starts the copied output sidecar and checks its version again.
7. Writes `artifacts/platform-compatibility-<target>.json`.

This validates compilation, process launch, CLI compatibility, and sidecar packaging. It does not prove USB serial access or cartridge read/write on a physical machine; hardware regression tests remain separate.

## Current result (2026-08-02)

| Component | Windows x64 | Linux x64 | macOS Intel | macOS Apple Silicon |
| --- | --- | --- | --- | --- |
| Released CFB v0.3.3 native build | Passed | Passed | Passed | Passed |
| Tauri Release build with packaged CFB | Passed locally | Pending new CI run | Pending new CI run | Pending new CI run |

The last public Tauri release workflow stopped before compilation because it required an unset `API_BASE_URL` secret on every platform. The application already has a production default URL, so the redundant secret gate has been removed. Push these workflow changes to run the new native matrix and obtain final Linux/macOS reports.

## Local commands

```sh
npm ci
npm run build:cfb:github
npm run check:platform
npm run tauri -- build --target <rust-target> --no-bundle
CFB_TAURI_OUTPUT=1 npm run check:platform
```

On PowerShell, set `CFB_TARGET` and `CFB_TAURI_OUTPUT` through `$env:` before the last command.

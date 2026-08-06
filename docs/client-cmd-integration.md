# Client and cfb integration

`beggar_chis` does not link the Rust command project as a library. The desktop app runs the released `cfb` executable (Tauri sidecar or Settings absolute bin path) and exchanges NDJSON over stdio.

**Agent / path truth:** [`.claude/skills/cfb-bridge/SKILL.md`](../.claude/skills/cfb-bridge/SKILL.md) — config only (`scripts/cfb-config.mjs`).

## Repositories

`chis-burner-cmd` is a **separate** repo ([GitHub](https://github.com/eyenobig/chis-burner-cmd)), intentionally **not** a git submodule.

- Local source: `CFB_LOCAL_DIR` → `local-paths.json.cfbSourceDir` → default `../chis-burner-cmd`.
- No `Cargo.toml` there / release: `CFB_GITHUB_REPO` (default `eyenobig/chis-burner-cmd`).
- Submodule was tried and rejected (broken CI checkout).

## Call stack

```text
Vue / Pinia
  → src/services/cfb/client.js   (command names / flags)
  → src/services/cfb/transport.js  (sidecar or direct bin + NDJSON)
  → cfb executable
```

- `client.js` is the only place UI code should know cfb command names.
- `transport.js` is the only place that talks to shell/NDJSON.
- Stores own state; they do not assemble argv arrays.
- `useCfbSettings.js` owns language / port / burn prefs and `cfbBinPath` (exe or bins dir — never source tree).

## Command map

| Client method | cfb command | Execution |
| --- | --- | --- |
| `detect` | `detect --json` | buffered |
| `selectPort` | `select --port <port> --json` | buffered |
| `disconnect` | `disconnect --json` | buffered |
| `setVoltage` | `voltage <value> --json` | buffered |
| `readRomFile` | `rom-info --file <path> --json` | buffered |
| `version` | `version --json` | buffered |
| `readCartridge` | `info [--mbc] [--port] --json` | buffered |
| `readRtc` | `rtc [--mbc] [--port] --json` | buffered |
| `burnRom` | `burn --rom <path> ... --json` | streaming |
| `erase` | `erase [--mbc] [--port] --json` | streaming |
| `dumpRom` | `dump --out <path> ... --json` | streaming |
| `saveDump` / `saveWrite` / `saveVerify` / `saveErase` | `save-*` | streaming |

## Tauri boundary

- Vue drives cfb via shell plugin / direct invoke; no custom Rust invoke proxy for each CLI verb.
- `tauri.conf.json` declares `binaries/cfb`; capabilities allow that sidecar.
- Dev: `ensure:cfb` keeps `src-tauri/binaries` current (download or optional local build).
- Prod: Release download / updater under app-data toolchain.

## Protocol

Stdout: one JSON object per line with `type`. Stderr: diagnostics only.
Canonical schema: chis-burner-cmd `docs/client-protocol.md` / `src/event.rs` / skill `cfb-output`.

New operations: update cmd schema first, then one named method on `client.js`, then store handlers.

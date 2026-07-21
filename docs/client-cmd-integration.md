# Client and cfb integration

`beggar_chis` does not link the Rust command project as a library. The desktop app starts the released `cfb` executable as a Tauri sidecar and exchanges newline-delimited JSON (NDJSON) over stdio.

```text
Vue components
    |
Pinia stores
    |  named operations: detect(), readCartridge(), burnRom(), ...
    v
src/services/cfb/client.js
    |  command names, flags, port/burn settings
    v
src/services/cfb/transport.js
    |  Tauri Command.sidecar + NDJSON parsing
    v
src-tauri/binaries/cfb-<target>[.exe]
    |  stdout: one JSON event per line
    |  stderr: diagnostics
    v
chis-burner-cmd
```

## Client boundary

- `client.js` is the only place where UI code should know cfb command names and flags.
- `transport.js` is the only place that imports `@tauri-apps/plugin-shell` or parses NDJSON.
- Stores own application state and react to typed events; they do not assemble command arrays.
- `useCfbSettings.js` owns persisted language, port and burn preferences. The client applies those preferences before transport starts a process.

## Command map

| Client method | cfb command | Execution |
| --- | --- | --- |
| `detect` | `detect --json` | buffered |
| `selectPort` | `select --port <port> --json` | buffered |
| `disconnect` | `disconnect --json` | buffered |
| `setVoltage` | `voltage <value> --json` | buffered |
| `readRomFile` | `rom-info --file <path> --json` | buffered |
| `readCartridge` | `info [--mbc] [--port] --json` | buffered |
| `readRtc` | `rtc [--mbc] [--port] --json` | buffered |
| `burnRom` | `burn --rom <path> ... --json` | streaming |
| `erase` | `erase [--mbc] [--port] --json` | streaming |
| `dumpRom` | `dump --out <path> ... --json` | streaming |

Buffered commands use `executeCfb`; long operations use `streamCfb` so `progress`, `log`, `error` and `result` events reach the UI while the process is running.

## Tauri boundary

- Vue calls the sidecar directly through the Tauri Shell plugin; there is no custom Rust `invoke` proxy for cfb commands.

- `src-tauri/tauri.conf.json` declares `binaries/cfb` as an external binary.
- src-tauri/capabilities/default.json allows only that sidecar to execute/spawn.
- `src-tauri/src/device_watcher.rs` only emits `device-changed`; `useConnection` responds by calling `cfbClient.detect()`.
- Development reuses a sidecar in `src-tauri/binaries`; `npm run build:cfb:local` refreshes it from the sibling repository.
- Production workflows download a prebuilt sidecar from a `chis-burner-cmd` GitHub Release.

## Protocol

Every stdout line in `--json` mode is one JSON object with a `type` discriminator. Diagnostics belong on stderr. The canonical event schema is maintained in `chis-burner-cmd/docs/client-protocol.md` and implemented by `chis-burner-cmd/src/event.rs`.

When adding a command, update the cmd event schema first, add one named method to `client.js`, and keep event-to-state handling in the relevant store.
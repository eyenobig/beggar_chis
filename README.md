# Chis Flasher (beggar_chis)

Tauri 2 + Vue 3 desktop client for GB cartridge flashing. Cartridge I/O goes through the `cfb` sidecar from [chis-burner-cmd](https://github.com/eyenobig/chis-burner-cmd) (separate repo; not a submodule). Frontend wiring: `src/services/cfb/`.

## Quick start

```bash
npm install
npm run dev
```

`npm run dev` runs `ensure:cfb` first (config: local source or GitHub Release). Details: [cfb-bridge](.claude/skills/cfb-bridge/SKILL.md), [dev-launch](.agents/skills/dev-launch/SKILL.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Tauri + Vite (auto sidecar via `ensure:cfb`) |
| `npm run dev:prod-api` | Dev with temporary public API proxy (see `.env.temporary.prod.example`) |
| `npm run build` | Build the desktop app (Tauri: frontend + Rust + installer) |
| `npm run build:web` | Build the Vue frontend only (for CI / lint checks) |
| `npm run ensure:cfb` | Ensure sidecar (local source via config, else GitHub Release) |
| `npm run build:cfb:github` | Force download from GitHub Release |
| `npm run check:platform` | Sidecar / platform smoke check |
| `npm run check:compat` | Verify cmd/rule/app version linkage (blocks release on mismatch) |

## Docs & skills

- Env / API: [`.env.example`](.env.example), `src/config/api.js`
- cfb config / bridge: [`.claude/skills/cfb-bridge`](.claude/skills/cfb-bridge/SKILL.md)（`scripts/cfb-config.mjs`）
- Dev launch (port 1420, ensure:cfb): [`.agents/skills/dev-launch`](.agents/skills/dev-launch/SKILL.md)
- Outbound URLs: [`.agents/skills/outbound-links`](.agents/skills/outbound-links/SKILL.md)
- CI / multi-platform: [docs/multi-platform-build.md](docs/multi-platform-build.md)
- App / sidecar updates: [docs/update-architecture.md](docs/update-architecture.md)

IDE: [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-analyzer.rust-analyzer)

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

本地 agent skills 在 `.agents/skills/`（gitignore，不上传）。仓库内可提交的桥接说明在 `.claude/skills/cfb-bridge/`。

- Env / API: [`.env.example`](.env.example), `src-ui/src/config/api.js`
- cfb 桥接: [`.claude/skills/cfb-bridge`](.claude/skills/cfb-bridge/SKILL.md)（`scripts/cfb-config.mjs`）
- 生产打包 / 签名: `.agents/skills/prod-packaging`（`npm run build:prod-api`）
- client↔cfb 集成: `.agents/skills/client-cmd-integration`
- Dev launch: `.agents/skills/dev-launch`
- 发版四件套: `.agents/skills/release-parts-overview` / `update-part-app`
- 安全构建审计: `.agents/skills/security-build-test`

IDE: [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-analyzer.rust-analyzer)

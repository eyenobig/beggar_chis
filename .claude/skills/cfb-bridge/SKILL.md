---
name: cfb-bridge
description: >-
  beggar_chis（Tauri+Vue）如何驱动烧录器：一律通过外部 cfb（chis-burner-cmd）二进制 + --json NDJSON，
  不在本仓重写串口/烧录协议。含 sidecar/直连路径、配置键（CFB_* / local-paths）、ensure:cfb、
  命令与事件映射。做烧录、串口、读卡、写卡、进度、工具链路径、cfb 桥接相关功能前必读。
  源码/Release 只认 scripts/cfb-config.mjs 与 src-tauri/src/cfb_config.rs 中的配置。
---

# 用 cfb 驱动烧录器（监听 + 反馈）

本仓（`beggar_chis`）**只做 GUI**。卡带 I/O 全部委托给外部命令行 **`cfb`**
（独立仓库 [chis-burner-cmd](https://github.com/eyenobig/chis-burner-cmd)，**不是** git submodule）。

> 串口枚举、协议、GBA/MBC 引擎只在 cfb。本仓：拼命令 → 起进程 → 解析 NDJSON → 更新 UI。

## 配置（只认这些）

**真相源：** `scripts/cfb-config.mjs` ↔ `src-tauri/src/cfb_config.rs`（默认值必须两边一致）。

### 构建 / `ensure:cfb`（源码 vs Release）

| 优先级 | 键 / 默认 | 含义 |
|--------|-----------|------|
| 1 | `CFB_LOCAL_DIR` | 本地 cmd **源码**绝对/相对路径 |
| 2 | `local-paths.json` → `paths.cfbSourceDir`（兼容扁平 `cfbSourceDir`） | 同上（gitignored；模板 `local-paths.example.json`） |
| 3 | **默认** `../chis-burner-cmd` | 相对本仓根的开发默认（常量 `DEFAULT_CFB_LOCAL_REL`） |
| — | 上述路径无 `Cargo.toml` | → GitHub Release |

| 键 | 默认 | 含义 |
|----|------|------|
| `CFB_GITHUB_REPO` | `eyenobig/chis-burner-cmd` | Release 仓库 |
| `CFB_RELEASE_TAG` | `latest` | Release 标签 |
| `CFB_GITHUB_TOKEN` / `GITHUB_TOKEN` | （空） | API 鉴权 |
| `CFB_TARGET` | 本机 triple | 覆盖 sidecar 目标三元组 |
| `CFB_RULE_DIR` | （空） | 本地编 rule 数据目录 |
| `local-paths.json` → `paths.ruleSourceDir`（兼容扁平） | （空） | 同上 |
| rule 默认 | `{cfbSource}/vendor/chis-burner-rule` | 仅当该目录含 `profiles/` |

**不要**再猜其它相对路径（例如独立的 `../chis-burner-rule`）。

`local-paths.json` **只放构建用源码路径**（`paths` 分区）。运行时 bin / 设置 / 卡带缓存走前端 `src/services/localConfig.js`（localStorage `chis.local.v1`，同分区名 `paths` / `settings` / `cache` / `locale`），勿混写进仓库根文件（debug 下 Rust 会重写该文件）。

### 运行时（可执行文件，不是源码）

| 优先级 | 来源 |
|--------|------|
| 1 | Settings `cfbBinPath`（绝对路径 exe 或 bins 目录）→ `resolve_cfb_binary` / 直连 |
| 2 | Tauri sidecar `binaries/cfb-*` |
| 3 | 打包态空路径 → `bootstrap_toolchain_paths` 下到 app-data `toolchain/` |

Settings **绝不是**源码树。持久化在 `localConfig.paths`（非 `local-paths.json`）。

## Sidecar：`ensure:cfb`

`scripts/ensure-cfb.mjs`（`beforeDevCommand`）：

1. `resolveCfbBuildSource()`（仅上表配置）
2. 本地有 `Cargo.toml` → 缺/旧则跑 `scripts/build-cfb.mjs`
3. 否则 → `build:cfb:github` / `scripts/download-cfb-release.mjs`
4. 版本已匹配 → `skip build`

本地源只靠配置（`CFB_LOCAL_DIR` / `local-paths.json` / 默认相对路径），无单独的 `build:cfb:local` npm 入口。

## 工具链资产抽象（与 SkyEmu / rule 对齐）

SkyEmu、cfb、rule 的 **获取/路径** 共用 `src/services/toolchain/`（GitHub resolve、download+进度、locate）；**执行** 仍分叉（SkyEmu DirectPlay / cfb spawn / rule profiles）。详见 [toolchain-assets](../../.agents/skills/toolchain-assets/SKILL.md)。

- 前端：`services/toolchain/components/cfb.js` → `ensureCfbPaths` / `resolveCfbBinary`
- Rust：`toolchain.rs` + `toolchain_update.rs`（打包 ensure）
- 构建脚本：仍只认 `cfb-config.mjs`（本 skill 上表）

## 调用约定

一律加 `--json`（一行一事件 NDJSON，stdout）。诊断在 stderr，勿当 JSON 解析。
语言：`--lang` 与 vue-i18n 对齐（`useCfbSettings.withGlobalArgs`）。

| UI / `cfbClient` | cfb 命令 |
|------------------|----------|
| `detect` | `detect --json` |
| `selectPort` | `select --port <P> --json` |
| `disconnect` | `disconnect --json` |
| `setVoltage` | `voltage <3v3\|5v\|off>` 或 `voltage --clear` |
| `readRomFile` | `rom-info --file <path> --json` |
| `version` | `version --json` |
| `readCartridge` | `info [--mbc] [--port] --json` |
| `readRtc` | `rtc [--mbc] [--port] --json` |
| `burnRom` / `erase` / `dumpRom` | `burn` / `erase` / `dump`（stream） |
| `saveDump` / `saveWrite` / `saveVerify` / `saveErase` | `save-*`（stream） |

GBA 默认；GB/GBC 加 `--mbc`。长任务用 `streamCfb`，短任务用 `executeCfb`。

前端入口：`src/services/cfb/`（`client.js` 命令、`transport.js` 进程/NDJSON）。

## 事件（按 `type` 分发）

字段契约以 cmd 仓为准：`docs/client-protocol.md` + `src/event.rs`；摘要 skill：
`chis-burner-cmd/.claude/skills/cfb-output/SKILL.md`（若本机有该仓）。

常见：`port` / `summary` / `selected` / `info` / `progress` / `log` / `result` /
`voltage` / `version` / `error` / `rtc_data` / `save_info`。

**只解析 stdout JSON 行**；stderr → 日志面板文本。

## Agent 工作流

1. 改烧录 UI / 进度 / 设备列表 → 读本 skill + `client.js` / 相关 store；**不要**在本仓写串口协议。
2. 新操作 → 先在 cmd 加命令与事件，再在 `client.js` 加命名方法，store 只消费 `type`。
3. 路径 /「找不到 cfb」→ 查 Settings `cfbBinPath`、sidecar、`ensure:cfb` 日志；改默认只动 `cfb-config`。
4. 启动 app → 另读 [dev-launch](../../.agents/skills/dev-launch/SKILL.md)。
5. 对外 URL → [outbound-links](../../.agents/skills/outbound-links/SKILL.md)。
6. 改 SkyEmu/cfb/rule 下载或路径抽象 → [toolchain-assets](../../.agents/skills/toolchain-assets/SKILL.md)。

## 不要做

- 不要在 JS/Rust 重写串口/VID-PID/烧录引擎。
- 不要解析非 `--json` 人类可读输出。
- 不要把源码根写进 Settings 当可执行文件。
- 不要在脚本/Rust 里另写一套相对路径探测；只扩展 `cfb-config`。
- 不要把「必须同级 checkout」写成生产硬依赖（无本地源则走 GitHub）。

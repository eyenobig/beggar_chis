---
name: cfb-bridge
description: beggar_chis（Tauri+Vue 桌面端）如何驱动烧录器。所有卡带读写（detect/info/burn/erase/dump/select/voltage）一律调用外部 cfb 命令行（chis-burner-cmd），监听它的 --json NDJSON 事件流并反馈到 UI——不要在本项目里自己实现串口/烧录协议。做任何与烧录、串口、读卡、写卡、进度展示相关的功能前必读。
---

# 用 cfb 驱动烧录器（监听 + 反馈）

本项目（`beggar_chis`，Tauri 2 + Vue 3 + vue-i18n）**只做 GUI**。所有与烧录器/卡带的交互
**统一委托给外部命令行 `cfb`**（Git 子模块 `chis-burner-cmd/`，仓库 https://github.com/eyenobig/chis-burner-cmd.git，Rust，跨平台 Win/macOS/Linux）。

> 单一事实来源原则：串口枚举、协议时序、GBA/MBC 烧录引擎都在 cfb 里，且跨平台。
> **本项目不要重写这些**——只负责：拼命令 → 起进程 → 逐行监听 NDJSON → 反馈到界面。

## 为什么这样做

- cfb 一份代码三平台（靠 `serialport` crate），桌面端不必碰各平台串口差异。
- cfb 已有稳定的 **NDJSON 事件契约**（见 `chis-burner-cmd/.claude/skills/cfb-output/SKILL.md`），
  逐行 `JSON.parse` 即可流式驱动 UI（进度条、日志、结果）。

## 调用方式

所有命令都加 `--json`，得到**一行一个事件**的 NDJSON（stdout）。诊断在 stderr。

| UI 动作 | cfb 命令 |
|---------|----------|
| 刷新设备列表 | `cfb detect --json` |
| 选择并记住烧录器 | `cfb select --port <P> --json` |
| 读卡带信息 | `cfb info [--mbc] --json` |
| 写入 ROM | `cfb burn --rom <file> [--mbc] --json` |
| 清空 ROM | `cfb erase [--mbc] --json` |
| 导出 ROM | `cfb dump --out <file> [--mbc] [--len N] --json` |
| 记住电压(仅 MBC) | `cfb voltage 5v --json` |

GBA 用默认（3.3V）；GB/GBC 加 `--mbc`（cfb 自动上 5V）。`--lang zh-CN|en` 让 cfb 的文案跟随
应用语言（与 vue-i18n 当前语言保持一致）。

## 事件类型（按 `type` 分发，反馈到 UI）

逐行解析，按 `event.type` 路由（字段细节以 cfb-output 契约为准）：

- `port` / `summary` → detect/select 的设备列表
- `info` → 卡带信息面板（present/kind/id/capacity/buffer_write_bytes/sector_size/sector_count/game_name/rom_title/game_code/revision/rom_checksum/rtc）。GBA 默认；GB/GBC 加 `--mbc`。
- `progress` `{done,total}` → 进度条
- `log` `{message}` → 日志面板
- `result` `{command,ok,bytes,mismatch_bytes,seconds}` → 完成提示（成功/失败）
- `voltage` `{voltage}` → 电压偏好显示
- `selected` `{port}` → 记住的端口
- `error` `{command,message}` → 错误提示

**只解析 stdout 的 JSON 行**；stderr 当作诊断文本进日志面板，不要当数据解析。

## Tauri 2 实现要点

用 `tauri-plugin-shell` 起进程并按行监听（shell 插件会按行缓冲，正好对应 NDJSON）：

```js
import { Command } from '@tauri-apps/plugin-shell'

async function runCfb(args, { onEvent, onLog }) {
  const cmd = Command.create('cfb', [...args, '--json'])   // 或 Command.sidecar('binaries/cfb', ...)
  cmd.stdout.on('data', line => {
    const s = line.trim()
    if (!s) return
    let ev; try { ev = JSON.parse(s) } catch { return }     // 容错：忽略非 JSON 行
    onEvent(ev)                                              // 按 ev.type 反馈到 UI
  })
  cmd.stderr.on('data', onLog)
  const child = await cmd.spawn()
  return child
}
```

UI 侧按 `ev.type` 更新响应式状态（进度条接 `progress`，结果接 `result`，列表接 `port`/`summary`）。

落地清单：
1. 装 `@tauri-apps/plugin-shell` 并在 `src-tauri` 注册插件、在 `capabilities/default.json` 放行
   执行 `cfb`（或把 cfb 作为 **sidecar** 打包：`tauri.conf.json` 的 `bundle.externalBin`）。
2. TS 侧维护一份与 cfb-output 契约对应的事件类型（`type` 判别联合），契约更新时同步。
3. 进度/结果通过响应式状态或 Tauri event 推给 Vue 组件（如 `RomPanel.vue`）。
4. 跨平台：定位/打包对应平台的 cfb 二进制；命令与解析逻辑三平台一致。

## 不要做

- 不要在 JS/Rust 里重写串口枚举、VID/PID 识别、烧录/擦除/校验、bank 切换、电压控制——这些都在 cfb。
- 不要解析 cfb 的人类可读输出（不带 `--json` 的那种）；只解析 `--json` 的 NDJSON。
- 契约字段以 `chis-burner-cmd/.claude/skills/cfb-output/SKILL.md` 为准，不要各自臆造。

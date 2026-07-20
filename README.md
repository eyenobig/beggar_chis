# Chis Flasher（beggar_chis）

Tauri 2 + Vue 3 桌面端，烧录逻辑委托给子模块 [`chis-burner-cmd`](https://github.com/eyenobig/chis-burner-cmd)（`cfb` sidecar）。

## 克隆

```bash
git clone --recurse-submodules <本仓库 URL>
# 若已克隆但未拉子模块：
git submodule update --init --recursive
```

## 本地开发

1. 安装 [Node.js](https://nodejs.org/) LTS、[Rust](https://rustup.rs/)（MSVC toolchain）
2. 从子模块构建 `cfb` sidecar：

```bash
npm run build:cfb
```

3. 启动：

```bash
npm install
npm run dev
```

## 子模块

| 路径 | 远程 | 跟踪分支 |
|------|------|----------|
| `chis-burner-cmd/` | https://github.com/eyenobig/chis-burner-cmd.git | `dev` |

更新子模块到远端 `dev` 最新提交：

```bash
git submodule update --remote chis-burner-cmd
```

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

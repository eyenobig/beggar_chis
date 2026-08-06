#!/usr/bin/env node
/**
 * tauri build 后处理：把 NSIS 安装包复制到项目根目录，方便分发。
 * 清理根目录下旧的 *.exe 安装包，只保留本次构建产物。
 *
 * 由 `npm run build`（= tauri build && node scripts/copy-bundle.mjs）自动调用。
 */
import { copyFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nsisDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis')

if (!existsSync(nsisDir)) {
  console.error('[copy-bundle] NSIS 产物目录不存在，跳过（构建可能失败）:', nsisDir)
  process.exit(0)
}

// 找最新生成的 setup.exe（NSIS 安装包）
const exes = readdirSync(nsisDir)
  .filter((f) => f.endsWith('-setup.exe') || f.endsWith('.exe'))
  .map((f) => ({ name: f, path: join(nsisDir, f), mtime: statSync(join(nsisDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)

if (!exes.length) {
  console.error('[copy-bundle] 未在 NSIS 目录找到 .exe 安装包')
  process.exit(0)
}

// 清理根目录下旧的安装包（Chis Flasher_*-setup.exe）
for (const f of readdirSync(root)) {
  if (f.endsWith('-setup.exe') && f.startsWith('Chis Flasher')) {
    rmSync(join(root, f), { force: true })
  }
}

// 复制最新安装包到根目录
const src = exes[0]
const dest = join(root, src.name)
copyFileSync(src.path, dest)
const sizeMB = (statSync(dest).size / 1024 / 1024).toFixed(1)
console.log(`[copy-bundle] ✓ 安装包已复制到根目录: ${src.name} (${sizeMB} MB)`)
console.log(`              路径: ${dest}`)

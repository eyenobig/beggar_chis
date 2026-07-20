#!/usr/bin/env node
/**
 * 从 Git 子模块 chis-burner-cmd 构建 cfb，并复制为 Tauri sidecar 命名：
 *   src-tauri/binaries/cfb-<rust-triple>[.exe]
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = join(root, 'chis-burner-cmd', 'Cargo.toml')
const outDir = join(root, 'src-tauri', 'binaries')
const isWin = process.platform === 'win32'

if (!existsSync(manifest)) {
  console.error('找不到 chis-burner-cmd/Cargo.toml。请先初始化子模块：')
  console.error('  git submodule update --init --recursive')
  process.exit(1)
}

const triple = detectTriple()
const binName = isWin ? 'cfb.exe' : 'cfb'
const sidecarName = isWin ? `cfb-${triple}.exe` : `cfb-${triple}`

console.log(`Building cfb for ${triple}...`)
const build = spawnSync(
  'cargo',
  ['build', '--release', '--locked', '--manifest-path', manifest, '--target', triple],
  { stdio: 'inherit', shell: isWin },
)
if (build.status !== 0) process.exit(build.status ?? 1)

const targetDir = cargoTargetDir(manifest)
const candidates = [
  join(targetDir, triple, 'release', binName),
  join(targetDir, 'release', binName),
]
const src = candidates.find((p) => existsSync(p))
if (!src) {
  console.error('构建产物不存在，已尝试：')
  for (const p of candidates) console.error(`  - ${p}`)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const dest = join(outDir, sidecarName)
copyFileSync(src, dest)
console.log(`Wrote ${dest}`)

function detectTriple() {
  if (process.env.CFB_TARGET) return process.env.CFB_TARGET
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  if (process.platform === 'win32') return `${arch}-pc-windows-msvc`
  if (process.platform === 'darwin') return `${arch}-apple-darwin`
  if (process.platform === 'linux') return `${arch}-unknown-linux-gnu`
  throw new Error(`不支持的平台: ${process.platform}/${process.arch}`)
}

/** 尊重 CARGO_TARGET_DIR / cargo metadata，避免硬编码路径。 */
function cargoTargetDir(manifestPath) {
  const meta = spawnSync(
    'cargo',
    ['metadata', '--format-version', '1', '--no-deps', '--manifest-path', manifestPath],
    { encoding: 'utf8', shell: isWin },
  )
  if (meta.status !== 0) {
    console.error(meta.stderr || meta.stdout)
    process.exit(meta.status ?? 1)
  }
  return JSON.parse(meta.stdout).target_directory
}

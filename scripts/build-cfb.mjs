#!/usr/bin/env node
/** Build cfb from the sibling local repository and copy it into Tauri sidecars. */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = resolve(process.env.CFB_LOCAL_DIR || join(root, '..', 'chis-burner-cmd'))
const manifest = join(sourceDir, 'Cargo.toml')
const outDir = join(root, 'src-tauri', 'binaries')
const isWin = process.platform === 'win32'

if (!existsSync(manifest)) {
  console.error(`Local chis-burner-cmd was not found: ${manifest}`)
  console.error('Set CFB_LOCAL_DIR when the repository is stored elsewhere.')
  process.exit(1)
}

const triple = detectTriple()
const binName = isWin ? 'cfb.exe' : 'cfb'
const sidecarName = isWin ? `cfb-${triple}.exe` : `cfb-${triple}`

console.log(`Building local cfb from ${sourceDir}`)
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
const source = candidates.find((path) => existsSync(path))
if (!source) {
  console.error('Local cfb build completed without the expected executable:')
  for (const path of candidates) console.error(`  - ${path}`)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const destination = join(outDir, sidecarName)
copyFileSync(source, destination)
console.log(`Local sidecar ready: ${destination}`)

function detectTriple() {
  if (process.env.CFB_TARGET) return process.env.CFB_TARGET
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  if (process.platform === 'win32') return `${arch}-pc-windows-msvc`
  if (process.platform === 'darwin') return `${arch}-apple-darwin`
  if (process.platform === 'linux') return `${arch}-unknown-linux-gnu`
  throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`)
}

function cargoTargetDir(manifestPath) {
  const metadata = spawnSync(
    'cargo',
    ['metadata', '--format-version', '1', '--no-deps', '--manifest-path', manifestPath],
    { encoding: 'utf8', shell: isWin },
  )
  if (metadata.status !== 0) {
    console.error(metadata.stderr || metadata.stdout)
    process.exit(metadata.status ?? 1)
  }
  return JSON.parse(metadata.stdout).target_directory
}

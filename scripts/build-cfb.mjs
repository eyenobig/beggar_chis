#!/usr/bin/env node
/**
 * Build cfb from the configured local chis-burner-cmd checkout into Tauri sidecars.
 * Path resolution: `scripts/cfb-config.mjs` only.
 * No local tree at the configured path? use: npm run build:cfb:github
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  DEFAULT_CFB_LOCAL_REL,
  configuredCfbSourceDir,
  detectTriple,
  repoRoot,
  resolveRuleSourceDir,
} from './cfb-config.mjs'

const root = repoRoot()
const sourceDir = configuredCfbSourceDir(root)
const ruleDir = resolveRuleSourceDir(root, sourceDir)
const manifest = join(sourceDir, 'Cargo.toml')
const outDir = join(root, 'src-tauri', 'binaries')
const isWin = process.platform === 'win32'

if (!existsSync(manifest)) {
  console.error(`Local chis-burner-cmd was not found: ${manifest}`)
  console.error(
    `Configured path comes from CFB_LOCAL_DIR / local-paths.json.cfbSourceDir / default ${DEFAULT_CFB_LOCAL_REL}.`,
  )
  console.error('No local source? download Release: npm run build:cfb:github')
  process.exit(1)
}

const triple = detectTriple()
const binName = isWin ? 'cfb.exe' : 'cfb'
const sidecarName = isWin ? `cfb-${triple}.exe` : `cfb-${triple}`

console.log(`Building local cfb from ${sourceDir}`)
if (ruleDir) console.log(`  using rule source: ${ruleDir}`)
const build = spawnSync(
  'cargo',
  ['build', '--release', '--locked', '--manifest-path', manifest, '--target', triple],
  {
    stdio: 'inherit',
    shell: isWin,
    env: { ...process.env, ...(ruleDir ? { CFB_RULE_DIR: resolve(ruleDir) } : {}) },
  },
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

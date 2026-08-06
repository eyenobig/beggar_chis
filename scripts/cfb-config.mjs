/**
 * Single source of CFB/cmd path & GitHub defaults for Node scripts.
 * Keep defaults in sync with `src-tauri/src/cfb_config.rs`.
 *
 * Runtime/UI acquisition for SkyEmu + cfb + rule lives in
 * `src/services/toolchain/` (see `.agents/skills/toolchain-assets/SKILL.md`).
 * This module is **build/ensure only** (local source vs Release for sidecar).
 *
 * Local source priority (configured values only):
 *   CFB_LOCAL_DIR → local-paths.json paths.cfbSourceDir (or flat cfbSourceDir) → DEFAULT_CFB_LOCAL_REL
 * No Cargo.toml at that path → GitHub Release (CFB_GITHUB_REPO / CFB_RELEASE_TAG).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Dev default: sibling checkout relative to this repo root. */
export const DEFAULT_CFB_LOCAL_REL = '../chis-burner-cmd'
export const DEFAULT_CFB_GITHUB_REPO = 'eyenobig/chis-burner-cmd'
export const DEFAULT_CFB_RELEASE_TAG = 'latest'
/** Default rule data dir relative to the resolved CFB source tree. */
export const DEFAULT_RULE_UNDER_CFB = join('vendor', 'chis-burner-rule')

export function repoRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '..')
}

/** Optional gitignored `local-paths.json` (see `local-paths.example.json`). */
export function loadLocalPaths(root = repoRoot()) {
  const file = join(root, 'local-paths.json')
  try {
    if (!existsSync(file)) return {}
    return JSON.parse(readFileSync(file, 'utf8')) || {}
  } catch {
    return {}
  }
}

/**
 * Read a path field from local-paths.json.
 * Accepts nested `paths.<key>` (preferred) or legacy flat `<key>`.
 */
export function localPathField(localPaths, key) {
  const nested = localPaths?.paths?.[key]
  if (nested != null && String(nested).trim()) return String(nested).trim()
  const flat = localPaths?.[key]
  if (flat != null && String(flat).trim()) return String(flat).trim()
  return ''
}

/**
 * Configured CFB **source** directory (always resolved; may not exist).
 * Does not invent alternate relative paths beyond DEFAULT_CFB_LOCAL_REL.
 */
export function configuredCfbSourceDir(root = repoRoot()) {
  const localPaths = loadLocalPaths(root)
  const configured =
    process.env.CFB_LOCAL_DIR ||
    localPathField(localPaths, 'cfbSourceDir') ||
    join(root, DEFAULT_CFB_LOCAL_REL)
  return resolve(configured)
}

/**
 * Local build vs GitHub download for `ensure:cfb` / `build:cfb:github`.
 * @returns {{ kind: 'local', dir: string } | { kind: 'download' }}
 */
export function resolveCfbBuildSource(root = repoRoot()) {
  const dir = configuredCfbSourceDir(root)
  if (existsSync(join(dir, 'Cargo.toml'))) return { kind: 'local', dir }
  return { kind: 'download' }
}

/**
 * Rule data dir for local builds: CFB_RULE_DIR → local-paths.ruleSourceDir →
 * `{configuredCfbSource}/vendor/chis-burner-rule` (only if `profiles/` exists).
 * Returns '' when none apply (cfb may embed rules).
 */
export function resolveRuleSourceDir(root = repoRoot(), cfbSourceDir = configuredCfbSourceDir(root)) {
  const localPaths = loadLocalPaths(root)
  const candidates = [
    process.env.CFB_RULE_DIR,
    localPathField(localPaths, 'ruleSourceDir'),
    join(cfbSourceDir, DEFAULT_RULE_UNDER_CFB),
  ]
  for (const raw of candidates) {
    if (!raw || !String(raw).trim()) continue
    const dir = resolve(String(raw).trim())
    if (existsSync(join(dir, 'profiles'))) return dir
  }
  return ''
}

export function githubConfig() {
  return {
    repository: process.env.CFB_GITHUB_REPO || DEFAULT_CFB_GITHUB_REPO,
    releaseTag: process.env.CFB_RELEASE_TAG || DEFAULT_CFB_RELEASE_TAG,
    token: process.env.CFB_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '',
  }
}

export function detectTriple() {
  if (process.env.CFB_TARGET) return process.env.CFB_TARGET
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  if (process.platform === 'win32') return `${arch}-pc-windows-msvc`
  if (process.platform === 'darwin') return `${arch}-apple-darwin`
  if (process.platform === 'linux') return `${arch}-unknown-linux-gnu`
  throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`)
}

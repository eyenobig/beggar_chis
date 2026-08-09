/**
 * cfb (chis-burner-cmd) execution adapter.
 *
 * Acquisition differs by layer (same lifecycle, different execute):
 * - Dev sidecar: Node `ensure:cfb` / `download-cfb-release.mjs` → `src-tauri/binaries/`
 * - Packaged runtime: Rust `bootstrap_toolchain_paths` → `toolchain_update::ensure_latest_cfb`
 * - Settings override: absolute exe / bins dir → `resolve_cfb_binary` + spawn
 *
 * Frontend here mirrors SkyEmu's resolve/download shape for UI/update flows;
 * production ensure still prefers the Rust path (SHA-256 + version verify).
 */
import { invoke } from '@tauri-apps/api/core'
import { fetchGithubRelease } from '../githubRelease.js'
import { downloadToolchainAsset } from '../download.js'

/** Keep in sync with scripts/cfb-config.mjs / src-tauri/src/cfb_config.rs */
export const CFB = Object.freeze({
  id: 'cfb',
  displayName: 'cfb',
  repo: 'eyenobig/chis-burner-cmd',
  defaultTag: 'latest',
})

/**
 * Settings row badge: prefer `cfb version` result stored in settings.
 * @param {string} [activeVersion]
 * @returns {string}
 */
export function formatCfbVersion(activeVersion) {
  return String(activeVersion || '').trim() || '—'
}

/**
 * @param {string} [triple] host triple from `sidecar_triple` when omitted
 * @returns {Promise<{ tag: string, name: string, url: string, size: number, digest?: string }>}
 */
export async function resolveCfbRelease(triple) {
  const hostTriple = triple || (await invoke('sidecar_triple'))
  const release = await fetchGithubRelease(CFB.repo, CFB.defaultTag)
  const isWin = /windows/i.test(hostTriple)
  const assetName = isWin ? `cfb-${hostTriple}.exe` : `cfb-${hostTriple}`
  const asset = release.assets.find((a) => a.name === assetName)
  if (!asset?.url) {
    throw new Error(`CFB ${release.tag} 缺少平台资产 ${assetName}`)
  }
  return {
    tag: release.tag,
    name: asset.name,
    url: asset.url,
    size: asset.size,
    digest: asset.digest,
  }
}

/**
 * Manual download into destDir (SkyEmu-shaped). Prefer `ensureCfbPaths` in app bootstrap.
 * @param {{ url: string, destDir: string, fileName: string, taskId: number, onProgress?: Function }} opts
 */
export async function downloadCfbTo(opts) {
  return downloadToolchainAsset(opts)
}

/**
 * Runtime path bootstrap (debug detect / release ensure). Writes Settings-facing paths.
 * @returns {Promise<{ cfbBin?: string, ruleDir?: string }>}
 */
export async function ensureCfbPaths() {
  return invoke('bootstrap_toolchain_paths')
}

/**
 * Resolve Settings path → absolute executable (no auto-build).
 * @param {string} cfbPath
 */
export async function resolveCfbBinary(cfbPath) {
  return invoke('resolve_cfb_binary', { cfbPath })
}

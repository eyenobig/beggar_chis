/**
 * chis-burner-rule execution adapter.
 *
 * Today: local data dir with `profiles/` (vendor under cfb source, or Settings path).
 * Packaged cfb embeds profiles — remote rule zip is intentionally not fetched yet
 * (see docs/update-architecture.md). This adapter still shares the same component
 * shape so a future GitHub Release install can plug into downloadToolchainAsset.
 */
import { invoke } from '@tauri-apps/api/core'

/** Keep defaults aligned with cfb-config (rule under cfb vendor). */
export const RULE = Object.freeze({
  id: 'rule',
  displayName: 'chis-burner-rule',
  /** Reserved for a future release-backed updater; empty until assets are published. */
  repo: '',
  markerDir: 'profiles',
})

/**
 * Settings row badge: local path only (no remote tag yet).
 * @param {string} [ruleDir]
 * @param {{ local: string, unknown: string }} labels
 * @returns {string}
 */
export function formatRuleVersion(ruleDir, { local, unknown }) {
  return String(ruleDir || '').trim() ? local : unknown
}

/**
 * @param {string} dir
 * @returns {boolean}
 */
export function looksLikeRuleDataDir(dir) {
  const s = String(dir || '').trim()
  if (!s) return false
  // Frontend cannot always stat; callers that have invoked detect already trust the path.
  // Heuristic: non-empty path; Rust side requires profiles/.
  return true
}

/**
 * Dev / bootstrap: detect configured vendor or app-data rule dir.
 * @returns {Promise<string | null>}
 */
export async function locateRuleDataDir() {
  try {
    const dir = await invoke('detect_default_rule_dir')
    return dir ? String(dir) : null
  } catch {
    return null
  }
}

/**
 * Part of `bootstrap_toolchain_paths` — returns ruleDir when profiles exist under app-data.
 * Prefer ensureCfbPaths() when both cfb + rule are needed together.
 * @returns {Promise<string | null>}
 */
export async function ensureRulePaths() {
  const result = await invoke('bootstrap_toolchain_paths')
  return result?.ruleDir ? String(result.ruleDir) : null
}

/**
 * Future: resolve a published rule archive from GitHub.
 * Throws until RULE.repo + release assets are defined.
 */
export async function resolveRuleRelease() {
  throw new Error(
    'rule 远程发行版尚未启用：当前仅使用本地 vendor/profiles 或 cfb 内嵌资料（见 docs/update-architecture.md）',
  )
}

/**
 * Toolchain asset layer — shared acquisition for SkyEmu / cfb / rule.
 *
 * Lifecycle (shared): resolveRelease → download/ensure → locate local path → progress/errors.
 * Execution (per adapter only):
 *   skyemu → DirectPlay launch (`launch_skyemu`)
 *   cfb    → spawn NDJSON (`cfb_exec` / `cfb_spawn` / ensure:cfb)
 *   rule   → data dir with profiles/ (build-time CFB_RULE_DIR; runtime optional)
 */

export {
  fetchGithubRelease,
  preferredAssetName,
  detectHostFamily,
} from './githubRelease.js'

export { downloadToolchainAsset } from './download.js'

export { versionFromInstallPath } from './version.js'

export {
  SKYEMU,
  formatSkyEmuVersion,
  resolveSkyEmuRelease,
  downloadSkyEmuTo,
} from './components/skyemu.js'

export {
  CFB,
  formatCfbVersion,
  resolveCfbRelease,
  downloadCfbTo,
  ensureCfbPaths,
  resolveCfbBinary,
} from './components/cfb.js'

export {
  RULE,
  formatRuleVersion,
  looksLikeRuleDataDir,
  locateRuleDataDir,
  ensureRulePaths,
  resolveRuleRelease,
} from './components/rule.js'

/** Component registry for Help/update UIs (ids stable). */
export const TOOLCHAIN_COMPONENTS = Object.freeze([
  { id: 'skyemu', module: 'skyemu' },
  { id: 'cfb', module: 'cfb' },
  { id: 'rule', module: 'rule' },
])

/** 安装目录（主 exe 父目录 = NSIS $INSTDIR）；用于判断路径是否安装器写入。 */
export async function installDir() {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('install_dir')
}

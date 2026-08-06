/**
 * SkyEmu execution adapter — ChisBread fork: zip → exe + DirectPlay launch.
 * Acquisition uses shared githubRelease + downloadToolchainAsset.
 */
import {
  detectHostFamily,
  fetchGithubRelease,
  preferredAssetName,
} from '../githubRelease.js'
import { downloadToolchainAsset } from '../download.js'
import { versionFromInstallPath } from '../version.js'

export const SKYEMU = Object.freeze({
  id: 'skyemu',
  displayName: 'SkyEmu',
  repo: 'ChisBread/SkyEmu',
  /** Basenames used by Rust extract_zip_exe to locate the runnable. */
  preferredExeNames: ['skyemu.exe', 'skyemu'],
})

/**
 * Settings row badge: sniff tag from install path, else local/unknown.
 * @param {string} [path]
 * @param {{ local: string, unknown: string }} labels
 * @returns {string}
 */
export function formatSkyEmuVersion(path, { local, unknown }) {
  if (!String(path || '').trim()) return unknown
  return versionFromInstallPath(path) || local
}

function skyEmuPreferPatterns() {
  const family = detectHostFamily()
  if (family === 'win') {
    return [/win.*x64.*\.zip$/i, /win.*\.zip$/i, /windows\.exe$/i, /win.*\.exe$/i, /\.exe$/i]
  }
  if (family === 'mac') {
    return [/macos.*\.zip$/i, /mac.*\.zip$/i, /macos\.dmg$/i, /mac.*\.dmg$/i, /\.dmg$/i]
  }
  return [/linux\.zip$/i, /linux/i, /\.AppImage$/i]
}

/**
 * @returns {Promise<{ tag: string, name: string, url: string, size: number }>}
 */
export async function resolveSkyEmuRelease() {
  const release = await fetchGithubRelease(SKYEMU.repo)
  const name = preferredAssetName(release.assets, skyEmuPreferPatterns())
  const asset = release.assets.find((a) => a.name === name)
  if (!asset?.url) {
    throw new Error('当前平台没有可用的 SkyEmu 安装包')
  }
  return {
    tag: release.tag,
    name: asset.name,
    url: asset.url,
    size: asset.size,
  }
}

/**
 * @param {{ url: string, destDir: string, fileName: string, taskId: number, onProgress?: Function }} opts
 * @returns {Promise<string>}
 */
export async function downloadSkyEmuTo(opts) {
  return downloadToolchainAsset({
    ...opts,
    preferredNames: SKYEMU.preferredExeNames,
  })
}

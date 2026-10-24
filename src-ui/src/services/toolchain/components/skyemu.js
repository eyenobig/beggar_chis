/**
 * SkyEmu execution adapter — eyenobig DirectPlay + cfb; zip → exe + launch.
 * Acquisition uses shared githubRelease + downloadToolchainAsset.
 */
import { i18n } from '../../../i18n'
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
  /** 只认本仓 Release（v* / nightly），不要回落到 ChisBread / 上游官方包。 */
  repo: 'eyenobig/SkyEmu-GBmake',
  preferredExeNames: ['SkyEmu.exe', 'skyemu.exe', 'SkyEmu', 'skyemu', 'SkyEmu.AppImage'],
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
    return [
      /skyemu-win-x64\.zip$/i,
      /win.*x64.*\.zip$/i,
      /win.*\.zip$/i,
      /windows\.exe$/i,
      /win.*\.exe$/i,
      /\.exe$/i,
    ]
  }
  if (family === 'mac') {
    return [
      /skyemu-macos\.zip$/i,
      /macos.*\.zip$/i,
      /mac.*\.zip$/i,
      /macos\.dmg$/i,
      /mac.*\.dmg$/i,
      /\.dmg$/i,
    ]
  }
  return [
    /skyemu-linux-x64\.zip$/i,
    /linuxrelease/i,
    /linux.*x64.*\.zip$/i,
    /linux\.zip$/i,
    /linux.*\.AppImage$/i,
    /\.AppImage$/i,
    /linux/i,
  ]
}

/**
 * @returns {Promise<{ tag: string, name: string, url: string, size: number }>}
 */
export async function resolveSkyEmuRelease() {
  const release = await fetchGithubRelease(SKYEMU.repo)
  const name = preferredAssetName(release.assets, skyEmuPreferPatterns())
  const asset = release.assets.find((a) => a.name === name)
  if (!asset?.url) {
    throw new Error(`${i18n.global.t('settings.skyemuNoPackage')} (${SKYEMU.repo} ${release.tag})`)
  }
  return {
    tag: release.tag,
    name: asset.name,
    url: asset.url,
    size: asset.size,
    repo: SKYEMU.repo,
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

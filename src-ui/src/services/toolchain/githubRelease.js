/**
 * Shared GitHub Release helpers for toolchain assets (SkyEmu / cfb / rule).
 * Pattern taken from the former skyemu.js resolve flow.
 */

import { i18n } from '../../i18n'
import { apiFetch } from '../http'

/**
 * @param {string} repo owner/name
 * @param {string} [tag='latest']
 * @param {{ token?: string, userAgent?: string }} [opts]
 * @returns {Promise<{ tag: string, assets: Array<{ name: string, url: string, size: number, digest?: string }> }>}
 */
export async function fetchGithubRelease(repo, tag = 'latest', opts = {}) {
  const api =
    !tag || tag === 'latest'
      ? `https://api.github.com/repos/${repo}/releases/latest`
      : `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': opts.userAgent || 'chis-flasher',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`

  const res = await apiFetch(api, { headers })
  // `/latest` 在只有 nightly pre-release、或尚未标 latest 时 404；改拿仓库里最新一条。
  if (!res.ok && res.status === 404 && (!tag || tag === 'latest')) {
    const listRes = await apiFetch(`https://api.github.com/repos/${repo}/releases?per_page=1`, {
      headers,
    })
    if (listRes.ok) {
      const list = await listRes.json()
      const first = Array.isArray(list) ? list[0] : null
      if (first) return mapGithubRelease(first, tag)
    }
  }
  if (!res.ok) {
    throw new Error(i18n.global.t('help.updateManifestMissing') + ` (${repo} ${res.status})`)
  }
  const release = await res.json()
  return mapGithubRelease(release, tag)
}

function mapGithubRelease(release, tag) {
  const assets = (release.assets || []).map((a) => ({
    name: a.name,
    url: a.browser_download_url,
    size: Number(a.size) || 0,
    digest: a.digest || undefined,
  }))
  return {
    tag: release.tag_name || tag || 'latest',
    assets,
  }
}

/**
 * Pick the first asset whose name matches any of the preference regexes (in order).
 * @param {Array<{ name: string }>} assets
 * @param {RegExp[]} prefer
 * @returns {string | null} asset name
 */
export function preferredAssetName(assets, prefer) {
  const names = (assets || []).map((a) => a.name)
  for (const re of prefer || []) {
    const hit = names.find((n) => re.test(n))
    if (hit) return hit
  }
  return names[0] || null
}

/**
 * Platform heuristics shared by zip/exe pickers (SkyEmu-style).
 * @returns {'win' | 'mac' | 'linux'}
 */
export function detectHostFamily() {
  const platform = typeof navigator !== 'undefined' ? navigator.platform || '' : ''
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'win'
  if (/Mac/i.test(platform)) return 'mac'
  return 'linux'
}

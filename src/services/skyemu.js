/** SkyEmu 发行版解析与下载（进度走 Tauri download_file + download-progress）。 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { join } from '@tauri-apps/api/path'

/**
 * ChisBread fork：支持直接读卡带（DirectPlay）。
 * 启动须带 READREALTIME 配置 ROM（见 launch_skyemu / virtual_rom.gba），
 * 裸打开 exe 不会连烧录器。协议对 VID=0x0483 PID=0x0721（beggar_socket 系）。
 */
const REPO = 'ChisBread/SkyEmu'
const API = `https://api.github.com/repos/${REPO}/releases/latest`

function preferredAssetName(assets) {
  const names = (assets || []).map((a) => a.name)
  const platform = navigator.platform || ''
  const ua = navigator.userAgent || ''
  const isWin = /Win/i.test(platform) || /Windows/i.test(ua)
  const isMac = /Mac/i.test(platform)
  // ChisBread 发布产物为 zip（如 SkyEmu-*-win-x64.zip / *-macOS-*.zip）
  const prefer = isWin
    ? [/win.*x64.*\.zip$/i, /win.*\.zip$/i, /windows\.exe$/i, /win.*\.exe$/i, /\.exe$/i]
    : isMac
      ? [/macos.*\.zip$/i, /mac.*\.zip$/i, /macos\.dmg$/i, /mac.*\.dmg$/i, /\.dmg$/i]
      : [/linux\.zip$/i, /linux/i, /\.AppImage$/i]
  for (const re of prefer) {
    const hit = names.find((n) => re.test(n))
    if (hit) return hit
  }
  return names[0] || null
}

/**
 * @returns {Promise<{ tag: string, name: string, url: string, size: number }>}
 */
export async function resolveSkyEmuRelease() {
  const res = await fetch(API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'chis-flasher',
    },
  })
  if (!res.ok) {
    throw new Error(`无法获取 SkyEmu 发行版 (${res.status})`)
  }
  const release = await res.json()
  const name = preferredAssetName(release.assets)
  const asset = release.assets?.find((a) => a.name === name)
  if (!asset?.browser_download_url) {
    throw new Error('当前平台没有可用的 SkyEmu 安装包')
  }
  return {
    tag: release.tag_name || 'latest',
    name: asset.name,
    url: asset.browser_download_url,
    size: Number(asset.size) || 0,
  }
}

/**
 * @param {{ url: string, destDir: string, fileName: string, taskId: number, onProgress?: (done: number, total: number) => void }} opts
 * @returns {Promise<string>} 可启动的可执行文件路径（zip 会解压并定位 SkyEmu.exe）
 */
export async function downloadSkyEmuTo({ url, destDir, fileName, taskId, onProgress }) {
  const dest = await join(destDir, fileName)
  const unlisten = await listen('download-progress', (event) => {
    const p = event.payload
    if (!p || Number(p.id) !== Number(taskId)) return
    onProgress?.(Number(p.done) || 0, Number(p.total) || 0)
  })
  try {
    await invoke('download_file', {
      url,
      dest,
      id: Number(taskId) || 0,
    })
    if (/\.zip$/i.test(fileName)) {
      return await invoke('extract_zip_exe', { archive: dest, destDir })
    }
    return dest
  } finally {
    unlisten()
  }
}

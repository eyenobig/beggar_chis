/**
 * Shared download + zip-locate for toolchain assets.
 * Progress: Tauri `download_file` + `download-progress` events (SkyEmu pattern).
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { join } from '@tauri-apps/api/path'

/**
 * @param {object} opts
 * @param {string} opts.url
 * @param {string} opts.destDir
 * @param {string} opts.fileName
 * @param {number} opts.taskId
 * @param {(done: number, total: number) => void} [opts.onProgress]
 * @param {string[]} [opts.preferredNames] When fileName is .zip: preferred exe basenames.
 * @returns {Promise<string>} final artifact path (exe after extract, or downloaded file)
 */
export async function downloadToolchainAsset({
  url,
  destDir,
  fileName,
  taskId,
  onProgress,
  preferredNames,
}) {
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
      return await invoke('extract_zip_exe', {
        archive: dest,
        destDir,
        preferredNames: preferredNames || null,
      })
    }
    return dest
  } finally {
    unlisten()
  }
}

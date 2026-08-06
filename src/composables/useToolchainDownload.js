/**
 * Shared toast / taskProgress / dest-dir helpers for toolchain asset downloads.
 * SkyEmu composable is the reference consumer; cfb/rule can reuse the same helpers
 * without forcing a single mega-composable.
 */
import { dirname } from '@tauri-apps/api/path'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useTaskProgress } from '../stores/useTaskProgress'
import { useToast } from '../stores/useToast'

/**
 * @param {string | null | undefined} path file or directory
 * @returns {Promise<string | null>}
 */
export async function resolveAssetDestDir(path) {
  if (!path) return null
  const normalized = String(path).replace(/[/\\]+$/, '')
  if (/\.(exe|dmg|zip|AppImage)$/i.test(normalized)) {
    return await dirname(normalized)
  }
  return normalized
}

/**
 * @param {{ title: string, defaultPath?: string | null }} opts
 * @returns {Promise<string | null>}
 */
export async function pickAssetDestDir({ title, defaultPath } = {}) {
  const selected = await openDialog({
    directory: true,
    multiple: false,
    title: title || '选择保存路径',
    defaultPath: defaultPath || undefined,
  })
  if (!selected) return null
  return typeof selected === 'string' ? selected : selected[0]
}

/**
 * Run a download task with standard toast + taskProgress + log wiring (SkyEmu pattern).
 *
 * @param {object} opts
 * @param {string} opts.title task title
 * @param {string} opts.detail initial detail
 * @param {(ctx: { taskId: number, updateDetail: (d: string) => void, updateProgress: (done: number, total: number) => void }) => Promise<string>} opts.run
 * @param {(msg: string, level?: string) => void} [opts.addLog]
 * @param {() => void} [opts.onOpenProgress] e.g. open settings drawer
 * @returns {Promise<string | null>} artifact path or null if aborted before task start
 */
export async function runToolchainDownloadTask({
  title,
  detail,
  run,
  addLog,
  onOpenProgress,
}) {
  const taskProgress = useTaskProgress()
  const toast = useToast()
  onOpenProgress?.()
  toast.info(`${title}…`)
  const taskId = taskProgress.startTask({
    kind: 'download',
    title,
    detail: detail || '',
  })
  addLog?.(`开始${title}…`, 'warn')
  try {
    const dest = await run({
      taskId,
      updateDetail: (d) => taskProgress.updateTask(taskId, { detail: d }),
      updateProgress: (done, total) => taskProgress.updateProgress(taskId, done, total),
    })
    taskProgress.completeTask(taskId, dest)
    const msg = `${title}已完成`
    toast.success(msg)
    addLog?.(`${msg}\n${dest}`, 'success')
    return dest
  } catch (error) {
    const msg = String(error?.message || error || '下载失败')
    taskProgress.failTask(taskId, msg)
    toast.error(msg)
    addLog?.(msg, 'error')
    throw error
  }
}

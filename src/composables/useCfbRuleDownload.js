/**
 * cfb / rule 下载入口（Settings），对齐 SkyEmu 的 toast + taskProgress 模式。
 * cfb：走 ensureCfbPaths（打包 ensure / GitHub）；rule：远程 stub，诚实反馈本地-only。
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { clearDirectBinaryCache, inTauri } from '../services/cfb'
import {
  downloadCfbTo,
  ensureCfbPaths,
  ensureRulePaths,
  locateRuleDataDir,
  resolveCfbRelease,
  resolveRuleRelease,
} from '../services/toolchain'
import { invoke } from '@tauri-apps/api/core'
import { runToolchainDownloadTask } from './useToolchainDownload'
import { useCfbSettings } from '../stores/useCfbSettings'
import { useEmulator, BOOKMARK_IDS } from '../stores/useEmulator'
import { useLogStore } from '../stores/useLogStore'
import { useTaskProgress } from '../stores/useTaskProgress'
import { useToast } from '../stores/useToast'

const downloadingCfb = ref(false)
const downloadingRule = ref(false)

export function useCfbRuleDownload() {
  const { t } = useI18n()
  const settings = useCfbSettings()
  const emu = useEmulator()
  const logStore = useLogStore()
  const taskProgress = useTaskProgress()
  const toast = useToast()

  function openSettingsWithProgress() {
    emu.openBookmark(BOOKMARK_IDS.settings)
    taskProgress.drawerOpen = true
  }

  async function downloadCfb() {
    if (downloadingCfb.value) return
    if (!inTauri) {
      toast.error(t('settings.pathPickDesktopOnly'))
      return
    }

    downloadingCfb.value = true
    try {
      // 进行中 toast 由 runToolchainDownloadTask 统一打出
      await runToolchainDownloadTask({
        title: t('settings.cfbDownload'),
        detail: t('settings.cfbDownloading'),
        addLog: (msg, level) => logStore.addLog(msg, level),
        onOpenProgress: openSettingsWithProgress,
        run: async ({ taskId, updateDetail, updateProgress }) => {
          updateDetail(t('settings.cfbDownloading'))
          const result = await ensureCfbPaths()
          let bin = result?.cfbBin ? String(result.cfbBin) : ''

          // ensure 在 debug 仅探测本地；若为空则走前端 GitHub 下载（与 SkyEmu 同形）。
          if (!bin) {
            const release = await resolveCfbRelease()
            updateDetail(`${release.tag} · ${release.name}`)
            if (release.size > 0) updateProgress(0, release.size)
            const destDir = await invoke('sidecar_binaries_dir')
            bin = await downloadCfbTo({
              url: release.url,
              destDir: String(destDir),
              fileName: release.name,
              taskId,
              onProgress: (done, total) => {
                updateProgress(done, total || release.size || 0)
              },
            })
          }

          if (!bin) {
            throw new Error(t('settings.verifyMissing'))
          }
          clearDirectBinaryCache()
          settings.cfbBinPath = bin
          if (result?.ruleDir && !settings.ruleDataDir) {
            settings.ruleDataDir = String(result.ruleDir)
          }
          updateDetail(bin)
          return bin
        },
      })
    } catch {
      // toast/log already handled in runToolchainDownloadTask
    } finally {
      downloadingCfb.value = false
    }
  }

  /**
   * rule 远程尚未发布：可点，尝试定位本地 profiles；否则诚实提示暂不可用。
   */
  async function downloadRule() {
    if (downloadingRule.value) return
    if (!inTauri) {
      toast.error(t('settings.pathPickDesktopOnly'))
      return
    }

    downloadingRule.value = true
    toast.info(t('settings.ruleDownloading'))
    try {
      // 若将来配置了 RULE.repo，这里会真正拉 GitHub；当前 stub 会抛错。
      try {
        await resolveRuleRelease()
      } catch {
        /* expected until remote assets exist */
      }

      let dir = await locateRuleDataDir()
      if (!dir) dir = await ensureRulePaths()

      if (dir) {
        settings.ruleDataDir = String(dir)
        const msg = t('settings.ruleLocalFound', { path: dir })
        toast.info(msg)
        logStore.addLog(msg, 'warn')
        return
      }

      const msg = t('settings.ruleRemoteUnavailable')
      toast.info(msg)
      logStore.addLog(msg, 'warn')
    } catch (error) {
      const msg = String(error?.message || error || t('settings.ruleRemoteUnavailable'))
      toast.error(msg)
      logStore.addLog(msg, 'error')
    } finally {
      downloadingRule.value = false
    }
  }

  return {
    downloadingCfb,
    downloadingRule,
    downloadCfb,
    downloadRule,
  }
}

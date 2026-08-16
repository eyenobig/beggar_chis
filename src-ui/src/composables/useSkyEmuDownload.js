import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { inTauri, cfbClient } from '../services/cfb'
import { downloadSkyEmuTo, resolveSkyEmuRelease } from '../services/toolchain'
import {
  pickAssetDestDir,
  resolveAssetDestDir,
  runToolchainDownloadTask,
} from './useToolchainDownload'
import { useEmulator, BOOKMARK_IDS } from '../stores/useEmulator'
import { useConnection } from '../stores/useConnection'
import { useCartData } from '../stores/useCartData'
import { useTaskProgress } from '../stores/useTaskProgress'
import { useToast } from '../stores/useToast'

const downloading = ref(false)

/** ChisBread DirectPlay 默认按 32MB GBA 窗口映射；有卡带 info 时用实测容量。 */
const DEFAULT_DIRECTPLAY_ROM_SIZE = 32 * 1024 * 1024

/** 共享：SkyEmu 下载 / 启动（首页按钮与设置页共用） */
export function useSkyEmuDownload() {
  const { t } = useI18n()
  const emu = useEmulator()
  const conn = useConnection()
  const cart = useCartData()
  const { skyEmuPath, currentPlatform } = storeToRefs(emu)
  const taskProgress = useTaskProgress()
  const toast = useToast()

  const canLaunch = computed(() => {
    const p = String(skyEmuPath.value || '')
    // Windows exe / Linux AppImage / mac 手选的 .app 或 .dmg；
    // mac zip 解出的产物是 .app 包内层二进制（…/SkyEmu.app/Contents/MacOS/SkyEmu），也认。
    return /\.(exe|app|AppImage|dmg)$/i.test(p) || /\.app\/contents\/macos\//i.test(p)
  })

  /** DirectPlay / SkyEmu 启动仅支持 GBA；平台 `gbc` 含 GB&GBC。 */
  const emulatorSupported = computed(() => currentPlatform.value !== 'gbc')

  function openSettingsWithProgress() {
    emu.openBookmark(BOOKMARK_IDS.settings)
    taskProgress.drawerOpen = true
  }

  /**
   * DirectPlay：生成 virtual_rom.gba（READREALTIME/SERIAL）并带参启动。
   * 裸 openPath 不会读卡带。串口由 SkyEmu 独占，启动前释放 cfb。
   */
  async function launchSkyEmu() {
    if (!canLaunch.value || downloading.value) return
    if (!emulatorSupported.value) {
      toast.error(t('launch.gbcUnsupported'))
      return
    }
    if (!inTauri) {
      toast.error(t('launch.desktopOnly'))
      return
    }

    if (cart.opRunning) {
      toast.error(t('launch.waitOp'))
      return
    }

    try {
      // 尽量拿到已选 COM，避免 AUTO 漏检非 0483:0721 设备
      if (!conn.selectedPort) {
        await conn.detect()
      }
      const serialPort = conn.selectedPort || 'AUTO'
      if (!conn.selectedPort) {
        toast.error(t('launch.noBurner'))
        return
      }

      // 释放串口给 SkyEmu；不走 disconnect()，以免关掉自动重连偏好
      try {
        await cfbClient.disconnect()
      } catch {
        // 忽略：即使 disconnect 失败也尝试启动
      }
      conn.connected = false

      const romSize =
        Number(cart.flashInfo?.capacityBytes) > 0
          ? Number(cart.flashInfo.capacityBytes)
          : DEFAULT_DIRECTPLAY_ROM_SIZE

      const romPath = await invoke('launch_skyemu', {
        exe: skyEmuPath.value,
        serialPort,
        romSize,
      })

      const msg = t('launch.directPlayLog', { port: serialPort, rom: romPath })
      toast.success(t('launch.started'))
      emu.addLog(msg, 'success')
      emu.addLog(t('launch.serialHandedOff'), 'warn')
    } catch (error) {
      const msg = String(error?.message || error || t('launch.fail'))
      toast.error(msg)
      emu.addLog(msg, 'error')
    }
  }

  async function downloadSkyEmu() {
    if (downloading.value) return
    if (!inTauri) {
      toast.error(t('launch.downloadDesktopOnly'))
      return
    }

    downloading.value = true
    try {
      let destDir = await resolveAssetDestDir(skyEmuPath.value)
      if (!destDir) {
        destDir = await pickAssetDestDir({
          title: t('launch.pickDest'),
          defaultPath: await resolveAssetDestDir(skyEmuPath.value),
        })
        if (!destDir) return
        emu.setSkyEmuPath(destDir)
      }

      await runToolchainDownloadTask({
        title: t('launch.downloadSkyEmu'),
        detail: destDir,
        addLog: (msg, level) => emu.addLog(msg, level),
        onOpenProgress: openSettingsWithProgress,
        run: async ({ taskId, updateDetail, updateProgress }) => {
          const release = await resolveSkyEmuRelease()
          updateDetail(`${release.tag} · ${release.name}`)
          if (release.size > 0) updateProgress(0, release.size)

          const dest = await downloadSkyEmuTo({
            url: release.url,
            destDir,
            fileName: release.name,
            taskId,
            onProgress: (done, total) => {
              updateProgress(done, total || release.size || 0)
            },
          })
          emu.setSkyEmuPath(dest)
          return dest
        },
      })
    } catch {
      // toast/log already handled in runToolchainDownloadTask
    } finally {
      downloading.value = false
    }
  }

  return {
    skyEmuPath,
    downloading,
    canLaunch,
    emulatorSupported,
    downloadSkyEmu,
    launchSkyEmu,
    pickDestDir: () =>
      pickAssetDestDir({
        title: t('launch.pickDest'),
        defaultPath: skyEmuPath.value || undefined,
      }),
  }
}

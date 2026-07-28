import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { dirname } from '@tauri-apps/api/path'
import { inTauri, cfbClient } from '../services/cfb'
import { downloadSkyEmuTo, resolveSkyEmuRelease } from '../services/skyemu'
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

  const canLaunch = computed(() =>
    /\.(exe|app|AppImage|dmg)$/i.test(String(skyEmuPath.value || '')),
  )

  /** DirectPlay / SkyEmu 启动仅支持 GBA；平台 `gbc` 含 GB&GBC。 */
  const emulatorSupported = computed(() => currentPlatform.value !== 'gbc')

  async function resolveDestDir(path) {
    if (!path) return null
    const normalized = String(path).replace(/[/\\]+$/, '')
    if (/\.(exe|dmg|zip|AppImage)$/i.test(normalized)) {
      return await dirname(normalized)
    }
    return normalized
  }

  async function pickDestDir() {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: '选择 SkyEmu 保存路径',
      defaultPath: (await resolveDestDir(skyEmuPath.value)) || undefined,
    })
    if (!selected) return null
    return typeof selected === 'string' ? selected : selected[0]
  }

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
      toast.error('请在桌面客户端中启动 SkyEmu')
      return
    }

    if (cart.opRunning) {
      toast.error('请先等待烧录/导出任务完成后再启动模拟器')
      return
    }

    try {
      // 尽量拿到已选 COM，避免 AUTO 漏检非 0483:0721 设备
      if (!conn.selectedPort) {
        await conn.detect()
      }
      const serialPort = conn.selectedPort || 'AUTO'
      if (!conn.selectedPort) {
        toast.error('未检测到烧录器，请先连接后再启动')
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

      const msg = `启动 SkyEmu DirectPlay · ${serialPort} · ${romPath}`
      toast.success('已启动 SkyEmu（DirectPlay 读卡带）')
      emu.addLog(msg, 'success')
      emu.addLog('串口已交给 SkyEmu；关闭模拟器后请在本应用重新连接烧录器', 'warn')
    } catch (error) {
      const msg = String(error?.message || error || '启动失败')
      toast.error(msg)
      emu.addLog(msg, 'error')
    }
  }

  async function downloadSkyEmu() {
    if (downloading.value) return
    if (!inTauri) {
      toast.error('请在桌面客户端中下载 SkyEmu')
      return
    }

    downloading.value = true
    let taskId = null
    try {
      let destDir = await resolveDestDir(skyEmuPath.value)
      if (!destDir) {
        destDir = await pickDestDir()
        if (!destDir) return
        emu.setSkyEmuPath(destDir)
      }

      openSettingsWithProgress()
      taskId = taskProgress.startTask({
        kind: 'download',
        title: '下载 SkyEmu',
        detail: destDir,
      })
      emu.addLog('开始下载 SkyEmu…', 'warn')

      const release = await resolveSkyEmuRelease()
      taskProgress.updateTask(taskId, { detail: `${release.tag} · ${release.name}` })
      if (release.size > 0) {
        taskProgress.updateProgress(taskId, 0, release.size)
      }

      const dest = await downloadSkyEmuTo({
        url: release.url,
        destDir,
        fileName: release.name,
        taskId,
        onProgress: (done, total) => {
          taskProgress.updateProgress(taskId, done, total || release.size || 0)
        },
      })

      emu.setSkyEmuPath(dest)
      taskProgress.completeTask(taskId, dest)
      const msg = `SkyEmu 已下载 · ${release.name}`
      toast.success(msg)
      emu.addLog(`${msg}\n${dest}`, 'success')
    } catch (error) {
      const msg = String(error?.message || error || '下载失败')
      if (taskId != null) taskProgress.failTask(taskId, msg)
      toast.error(msg)
      emu.addLog(msg, 'error')
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
    pickDestDir,
  }
}

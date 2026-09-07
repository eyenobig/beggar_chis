import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { inTauri, cfbClient } from '../services/cfb'
import { downloadSkyEmuTo, resolveCfbBinary, resolveSkyEmuRelease } from '../services/toolchain'
import { useCfbSettings } from '../stores/useCfbSettings'
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

/** Windows exe / Linux AppImage 或无后缀 SkyEmu / mac .app 及包内二进制。 */
export function isSkyEmuBinary(path) {
  const raw = String(path || '').trim()
  if (!raw) return false
  if (/\.(exe|app|AppImage|dmg)$/i.test(raw)) return true
  const norm = raw.replace(/\\/g, '/')
  if (/\.app\/contents\/macos\//i.test(norm)) return true
  return /(^|\/)SkyEmu$/i.test(norm)
}

/** DirectPlay 默认按 32MB GBA 窗口映射；有卡带 info 时用实测容量。 */
const DEFAULT_DIRECTPLAY_ROM_SIZE = 32 * 1024 * 1024

/** 共享：SkyEmu 下载 / 启动（首页按钮与设置页共用） */
export function useSkyEmuDownload() {
  const { t } = useI18n()
  const emu = useEmulator()
  const conn = useConnection()
  const cart = useCartData()
  const cfbSettings = useCfbSettings()
  const { skyEmuPath, currentPlatform } = storeToRefs(emu)
  const taskProgress = useTaskProgress()
  const toast = useToast()

  const canLaunch = computed(() => isSkyEmuBinary(skyEmuPath.value))

  function openSettingsWithProgress() {
    emu.openBookmark(BOOKMARK_IDS.settings)
    taskProgress.drawerOpen = true
  }

  /**
   * DirectPlay：按平台写 virtual_rom.gba / virtual_rom.gb 并带参启动。
   * 裸 openPath 不会读卡带。串口由 SkyEmu 独占，启动前释放 cfb。
   */
  async function launchSkyEmu() {
    if (!canLaunch.value || downloading.value) return
    if (!inTauri) {
      toast.error(t('launch.desktopOnly'))
      return
    }

    if (cart.opRunning) {
      toast.error(t('launch.waitOp'))
      return
    }

    try {
      // 口写 AUTO：SkyEmu 用 cfb detect+info 按 gba / gb_mbc 选台，不钉本页已选 COM。
      const serialPort = 'AUTO'

      // 释放串口给 SkyEmu；不走 disconnect()，以免关掉自动重连偏好
      try {
        await cfbClient.disconnect()
      } catch {
        // 忽略：即使 disconnect 失败也尝试启动
      }
      conn.connected = false

      const isMbc = currentPlatform.value === 'gbc'
      // GB: 传 0，让 SkyEmu 读卡带头 0x148。CFI 容量是烧录器 flash 芯片的，不是 GB ROM。
      // GBA: 有实测容量用实测，否则 32MB 窗口。
      const romSize = isMbc
        ? 0
        : Number(cart.flashInfo?.capacityBytes) > 0
          ? Number(cart.flashInfo.capacityBytes)
          : DEFAULT_DIRECTPLAY_ROM_SIZE

      let cfbBin = String(cfbSettings.cfbBinPath || '').trim()
      if (cfbBin) {
        try {
          cfbBin = String(await resolveCfbBinary(cfbBin) || cfbBin)
        } catch {
          // 路径无效时仍启动：SkyEmu 会自己找 exe 旁 / PATH 的 cfb
        }
      }

      const romPath = await invoke('launch_skyemu', {
        exe: skyEmuPath.value,
        serialPort,
        romSize,
        mbc: isMbc,
        cfbBin: cfbBin || null,
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
    downloadSkyEmu,
    launchSkyEmu,
    pickDestDir: () =>
      pickAssetDestDir({
        title: t('launch.pickDest'),
        defaultPath: skyEmuPath.value || undefined,
      }),
  }
}

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getVersion } from '@tauri-apps/api/app'
import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'
import { inTauri } from '../services/cfb'
import { useCartData } from './useCartData'

const AUTO_CHECK_DELAY_MS = 10_000
const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

function formatUpdaterError(cause) {
  const raw = String(cause?.message || cause || '')
  const lower = raw.toLowerCase()
  if (
    lower.includes('could not fetch a valid release json')
    || lower.includes('error status request')
    || lower.includes('404')
  ) {
    return '无法获取更新清单（latest.json）。仓库尚无已发布的 Release，或清单文件缺失。请先按发版流程打 tag 发布后再试。'
  }
  // 平台缺失：已发布版本的更新清单只含部分平台（如 v0.2.12 仅 Windows）。
  // tauri updater 在解析阶段就抛错，即使版本号相同也不会走到"已是最新"。
  if (
    lower.includes('platform')
    || lower.includes('darwin')
    || lower.includes('no suitable')
    || lower.includes('not found for target')
    || lower.includes('installer')
  ) {
    return '当前已发布版本的更新包不包含本平台（macOS 更新包自下个发版起提供，发版流水线已支持 macOS）。可先从 Releases 页手动下载新版安装。'
  }
  if (lower.includes('network') || lower.includes('timed out') || lower.includes('timeout')) {
    return `网络异常，检查更新失败：${raw}`
  }
  return raw || '检查更新失败'
}

export const useAppUpdater = defineStore('appUpdater', () => {
  const cart = useCartData()
  const currentVersion = ref('')
  const availableVersion = ref('')
  const notes = ref('')
  const publishedAt = ref('')
  const status = ref('idle')
  const error = ref('')
  const downloaded = ref(0)
  const total = ref(0)
  const lastCheckedAt = ref('')

  let pendingUpdate = null
  let startTimer = null
  let intervalTimer = null
  let initialized = false

  const isChecking = computed(() => status.value === 'checking')
  const isDownloading = computed(() => status.value === 'downloading' || status.value === 'installing')
  const updateAvailable = computed(() => !!pendingUpdate && !!availableVersion.value)
  const progressPct = computed(() => total.value > 0
    ? Math.min(100, Math.round((downloaded.value / total.value) * 100))
    : 0)
  const installBlocked = computed(() => cart.opRunning)

  async function init({ auto = true } = {}) {
    if (!inTauri) return
    if (!currentVersion.value) {
      try {
        currentVersion.value = await getVersion()
      } catch {
        currentVersion.value = ''
      }
    }
    if (!auto || initialized || !import.meta.env.PROD) return
    initialized = true
    startTimer = window.setTimeout(() => checkForUpdates({ silent: true }), AUTO_CHECK_DELAY_MS)
    intervalTimer = window.setInterval(
      () => checkForUpdates({ silent: true }),
      AUTO_CHECK_INTERVAL_MS,
    )
  }

  async function checkForUpdates({ silent = false } = {}) {
    if (!inTauri || isChecking.value || isDownloading.value) return null
    status.value = 'checking'
    error.value = ''
    try {
      const update = await check({ timeout: 15_000 })
      lastCheckedAt.value = new Date().toISOString()
      if (!update) {
        pendingUpdate = null
        availableVersion.value = ''
        notes.value = ''
        publishedAt.value = ''
        status.value = 'upToDate'
        return null
      }
      pendingUpdate = update
      availableVersion.value = String(update.version || '')
      notes.value = String(update.body || '')
      publishedAt.value = update.date ? String(update.date) : ''
      status.value = 'available'
      return update
    } catch (cause) {
      error.value = formatUpdaterError(cause)
      status.value = 'error'
      if (silent) console.warn('[appUpdater] automatic check failed:', cause)
      return null
    }
  }

  async function downloadAndInstall() {
    if (!inTauri || isDownloading.value) return false
    if (cart.opRunning) {
      error.value = '烧录器任务运行中，请等待任务完成后再安装更新。'
      status.value = 'blocked'
      return false
    }
    if (!pendingUpdate) {
      await checkForUpdates()
      if (!pendingUpdate) return false
    }

    downloaded.value = 0
    total.value = 0
    error.value = ''
    status.value = 'downloading'
    try {
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total.value = Number(event.data?.contentLength || 0)
        } else if (event.event === 'Progress') {
          downloaded.value += Number(event.data?.chunkLength || 0)
        } else if (event.event === 'Finished') {
          status.value = 'installing'
        }
      })
      status.value = 'installed'
      await relaunch()
      return true
    } catch (cause) {
      error.value = String(cause?.message || cause)
      status.value = 'error'
      return false
    }
  }

  function dispose() {
    if (startTimer) window.clearTimeout(startTimer)
    if (intervalTimer) window.clearInterval(intervalTimer)
    startTimer = null
    intervalTimer = null
    initialized = false
  }

  return {
    currentVersion,
    availableVersion,
    notes,
    publishedAt,
    status,
    error,
    downloaded,
    total,
    lastCheckedAt,
    isChecking,
    isDownloading,
    updateAvailable,
    progressPct,
    installBlocked,
    init,
    checkForUpdates,
    downloadAndInstall,
    dispose,
  }
})

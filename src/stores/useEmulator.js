import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useLogStore } from './useLogStore'
import { useTaskProgress } from './useTaskProgress'
import { getLocalPaths, patchLocalConfig } from '../services/localConfig'

/** 左侧书签 ↔ 抽屉页 1:1 的 id（强关联） */
export const BOOKMARK_IDS = Object.freeze({
  logs: 'logs',
  rom: 'rom',
  help: 'help',
  settings: 'settings',
  shop: 'shop',
})

const LOGS_TABS = new Set([BOOKMARK_IDS.logs, BOOKMARK_IDS.rom])
const UTIL_TABS = new Set([BOOKMARK_IDS.help, BOOKMARK_IDS.settings, BOOKMARK_IDS.shop])

function loadSkyEmuPath() {
  return String(getLocalPaths().skyEmuPath || '').trim()
}

export const useEmulator = defineStore('emulator', () => {
  const currentPlatform = ref('gbc')
  /** @type {import('vue').Ref<null | keyof typeof BOOKMARK_IDS>} */
  const activeBookmark = ref(null)
  const lastLogsTab = ref(BOOKMARK_IDS.logs)
  const lastUtilTab = ref(BOOKMARK_IDS.help)
  const skyEmuPath = ref(loadSkyEmuPath())
  /** 贴纸架顶栏是否已折叠（仅留信息 bar） */
  const romShelfCollapsed = ref(true)
  /** 右侧抽屉垂直拖拽偏移（正值下移）；各抽屉共用 */
  const drawerOffsetY = ref(0)

  const logStore = useLogStore()
  const taskProgress = useTaskProgress()
  const logs = logStore.logs
  const uiSwitchLocked = computed(() => taskProgress.romOperationRunning)
  /** 软拒提示节流，避免连点刷同一条 warn */
  let lastRejectLogAt = 0

  watch(skyEmuPath, (path) => {
    patchLocalConfig('paths', { skyEmuPath: path || '' })
  })

  const logsOpen = computed({
    get: () => LOGS_TABS.has(activeBookmark.value),
    set: (open) => {
      if (open) openBookmark(lastLogsTab.value)
      else if (LOGS_TABS.has(activeBookmark.value)) activeBookmark.value = null
    },
  })

  const helpOpen = computed({
    get: () => activeBookmark.value === BOOKMARK_IDS.help,
    set: (open) => {
      if (open) openBookmark(BOOKMARK_IDS.help)
      else if (activeBookmark.value === BOOKMARK_IDS.help) activeBookmark.value = null
    },
  })

  const settingsOpen = computed({
    get: () => activeBookmark.value === BOOKMARK_IDS.settings,
    set: (open) => {
      if (open) openBookmark(BOOKMARK_IDS.settings)
      else if (activeBookmark.value === BOOKMARK_IDS.settings) activeBookmark.value = null
    },
  })

  const shopOpen = computed({
    get: () => activeBookmark.value === BOOKMARK_IDS.shop,
    set: (open) => {
      if (open) openBookmark(BOOKMARK_IDS.shop)
      else if (activeBookmark.value === BOOKMARK_IDS.shop) activeBookmark.value = null
    },
  })

  /** Logs 抽屉内 tab；与 activeBookmark 在 logs/rom 时同步 */
  const activeTab = computed({
    get: () => (LOGS_TABS.has(activeBookmark.value) ? activeBookmark.value : lastLogsTab.value),
    set: (tab) => {
      if (!LOGS_TABS.has(tab)) return
      if (logsOpen.value && !openBookmark(tab)) return
      lastLogsTab.value = tab
    },
  })

  function isBookmarkActive(id) {
    return activeBookmark.value === id
  }

  function rejectUiSwitchWhileRomRunning() {
    if (!uiSwitchLocked.value) return false
    const now = Date.now()
    // 同一轮操作里只提示一次，避免连点刷屏
    if (now - lastRejectLogAt > 2500) {
      lastRejectLogAt = now
      addLog('ROM 操作进行中，请等待完成后再切换页面或机型。', 'warn')
    }
    return true
  }

  function openBookmark(id) {
    if (!Object.values(BOOKMARK_IDS).includes(id)) return false
    if (activeBookmark.value === id) return true
    // 烧录/擦除中允许 Logs ↔ ROM（纯 UI，不跑 cfb）；帮助/设置/商店仍锁
    if (uiSwitchLocked.value && !LOGS_TABS.has(id)) {
      rejectUiSwitchWhileRomRunning()
      return false
    }
    activeBookmark.value = id
    if (LOGS_TABS.has(id)) lastLogsTab.value = id
    if (UTIL_TABS.has(id)) lastUtilTab.value = id
    return true
  }

  /** 点选书签：已选中则关闭，否则打开对应抽屉（其它书签自动折叠） */
  function selectBookmark(id) {
    if (activeBookmark.value === id) {
      closeDrawers()
      return
    }
    openBookmark(id)
  }

  function closeDrawers() {
    activeBookmark.value = null
  }

  function addLog(message, type = 'info') { logStore.addLog(message, type) }
  function clearLogs() { logStore.clearLogs() }

  function setSkyEmuPath(path) {
    skyEmuPath.value = String(path || '').trim()
  }

  function toggleLogs(forceState, tab) {
    const opening = forceState !== undefined ? forceState : !logsOpen.value
    if (!opening) {
      if (logsOpen.value) activeBookmark.value = null
      return
    }
    openBookmark(tab && LOGS_TABS.has(tab) ? tab : lastLogsTab.value)
  }

  function toggleConnection() {
    // 连接状态由 useConnection store 管理；此处保留为空壳以兼容旧调用方。
  }

  function setPlatform(pid) {
    if (currentPlatform.value === pid) return true
    if (rejectUiSwitchWhileRomRunning()) return false
    currentPlatform.value = pid
    addLog(`Core switched to ${pid.toUpperCase()}.`)
    return true
  }

  return {
    BOOKMARK_IDS,
    currentPlatform,
    uiSwitchLocked,
    activeBookmark,
    activeTab,
    logsOpen,
    shopOpen,
    settingsOpen,
    helpOpen,
    skyEmuPath,
    romShelfCollapsed,
    drawerOffsetY,
    logs,
    isBookmarkActive,
    openBookmark,
    selectBookmark,
    closeDrawers,
    addLog,
    clearLogs,
    setSkyEmuPath,
    toggleLogs,
    toggleConnection,
    setPlatform,
  }
})

import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useLogStore } from './useLogStore'

export const useEmulator = defineStore('emulator', () => {
  const currentPlatform = ref('gbc')
  const logsOpen = ref(false)
  const activeTab = ref('logs')
  const shopOpen = ref(false)
  const settingsOpen = ref(false)
  const helpOpen = ref(false)

  const logStore = useLogStore()
  const logs = logStore.logs

  function addLog(message, type = 'info') { logStore.addLog(message, type) }
  function clearLogs() { logStore.clearLogs() }

  function toggleLogs(forceState, tab) {
    logsOpen.value = forceState !== undefined ? forceState : !logsOpen.value
    if (tab) activeTab.value = tab
  }

  function toggleConnection() {
    // 连接状态由 useConnection store 管理；此处保留为空壳以兼容旧调用方。
  }

  function setPlatform(pid) {
    if (currentPlatform.value === pid) return
    currentPlatform.value = pid
    addLog(`Core switched to ${pid.toUpperCase()}.`)
  }

  return {
    currentPlatform,
    logsOpen,
    activeTab,
    shopOpen,
    settingsOpen,
    helpOpen,
    logs,
    addLog,
    clearLogs,
    toggleLogs,
    toggleConnection,
    setPlatform,
  }
})

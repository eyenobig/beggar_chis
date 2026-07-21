import { ref } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useLogStore } from './useLogStore'
import { useCfbSettings } from './useCfbSettings'

export const useEmulator = defineStore('emulator', () => {
  const currentPlatform = ref('gbc')
  const emulatorState = ref('stopped')
  const emulatorPid = ref(null)
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const logsOpen = ref(false)
  const activeTab = ref('logs')
  const shopOpen = ref(false)
  const settingsOpen = ref(false)
  const bootProgress = ref(0)

  const logStore = useLogStore()
  const settings = useCfbSettings()
  const logs = logStore.logs

  function addLog(message, type = 'info') { logStore.addLog(message, type) }
  function clearLogs() { logStore.clearLogs() }

  function toggleLogs(forceState, tab) {
    logsOpen.value = forceState !== undefined ? forceState : !logsOpen.value
    if (tab) activeTab.value = tab
  }

  function toggleConnection() {
    if (isConnecting.value) return
    if (!isConnected.value) {
      isConnecting.value = true
      addLog('Attempting to bridge host hardware...', 'warn')
      setTimeout(() => {
        isConnecting.value = false
        isConnected.value = true
        addLog('Hardware linked successfully. Port active.', 'success')
      }, 1500)
    } else {
      isConnected.value = false
      addLog('Hardware bridge disconnected.', 'error')
    }
  }

  function setPlatform(pid) {
    if (emulatorState.value !== 'stopped' || currentPlatform.value === pid) return
    currentPlatform.value = pid
    addLog(`Core switched to ${pid.toUpperCase()} architecture.`)
  }

  async function toggleEmulator() {
    if (emulatorState.value === 'booting') return

    if (emulatorState.value === 'stopped') {
      if (!settings.emulatorPath) {
        addLog('SkyEmu path is not configured. Open Settings to select or install it.', 'error')
        settingsOpen.value = true
        return
      }

      emulatorState.value = 'booting'
      bootProgress.value = 35
      addLog(`Starting SkyEmu: ${settings.emulatorPath}`, 'warn')
      try {
        emulatorPid.value = await invoke('launch_emulator', { path: settings.emulatorPath })
        bootProgress.value = 100
        emulatorState.value = 'running'
        addLog('SkyEmu started.', 'success')
      } catch (error) {
        emulatorState.value = 'stopped'
        addLog(String(error), 'error')
      } finally {
        bootProgress.value = 0
      }
      return
    }

    if (emulatorPid.value) {
      try {
        await invoke('stop_emulator', { pid: emulatorPid.value })
      } catch (error) {
        addLog(String(error), 'error')
      }
    }
    emulatorPid.value = null
    emulatorState.value = 'stopped'
    addLog('SkyEmu stopped.', 'warn')
  }

  return {
    currentPlatform,
    emulatorState,
    emulatorPid,
    isConnected,
    isConnecting,
    logsOpen,
    activeTab,
    shopOpen,
    settingsOpen,
    bootProgress,
    logs,
    addLog,
    clearLogs,
    toggleLogs,
    toggleConnection,
    setPlatform,
    toggleEmulator,
  }
})
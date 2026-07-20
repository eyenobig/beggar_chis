// 模拟器状态（Pinia store）。保留原导出名 useEmulator，消费方 import 不变；
// 解构请用 storeToRefs 取 state、直接取 action。
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useLogStore } from './useLogStore'

export const dataConfig = {
  gbc: {
    rom: { name: 'Pokemon_Crystal.gbc', type: 'GBC ROM', size: 2048, max: 4096 },
    sav: { name: 'Pokemon_Crystal.sav', type: 'SRAM Backup', chip: 'SRAM', size: 32 },
  },
  gba: {
    rom: { name: 'Pokemon_Emerald.gba', type: 'GBA ROM', size: 16384, max: 32768 },
    sav: { name: 'Pokemon_Emerald.sav', type: 'Flash Memory', chip: 'Flash 1M', size: 128 },
  },
}

export const useEmulator = defineStore('emulator', () => {
  const currentPlatform = ref('gbc')
  const emulatorState = ref('stopped') // 'stopped' | 'booting' | 'running'
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const logsOpen = ref(false)
  const activeTab = ref('logs') // 'logs' | 'progress'
  const shopOpen = ref(false)
  const helpOpen = ref(false)
  const settingsOpen = ref(false)
  const bootProgress = ref(0)

  const logStore = useLogStore()
  const logs = logStore.logs // 保留 logs 引用，兼容已有消费方
  function addLog(message, type = 'info') { logStore.addLog(message, type) }
  function clearLogs() { logStore.clearLogs() }

  function toggleLogs(forceState, tab) {
    logsOpen.value = forceState !== undefined ? forceState : !logsOpen.value
    if (tab) activeTab.value = tab
  }

  function toggleConnection() {
    if (isConnecting.value) return

    if (!isConnected.value) {
      if (!logsOpen.value) toggleLogs(true)
      isConnecting.value = true
      addLog('Attempting to bridge host hardware...', 'warn')

      setTimeout(() => {
        isConnecting.value = false
        isConnected.value = true
        addLog('Hardware linked successfully. Port active.', 'success')
      }, 1500)
    } else {
      if (emulatorState.value !== 'stopped') _stopEmulator()
      isConnected.value = false
      addLog('Hardware bridge disconnected.', 'error')
    }
  }

  function setPlatform(pid) {
    if (emulatorState.value !== 'stopped' || currentPlatform.value === pid) return
    currentPlatform.value = pid
    addLog(`Core switched to ${pid.toUpperCase()} architecture.`)
    addLog(`Loaded Payload: ${dataConfig[pid].rom.name}`)
  }

  function _finishBoot() {
    addLog('Payload executed successfully.', 'success')
    addLog('--- SYSTEM RUNNING ---', 'success')
    emulatorState.value = 'running'
    bootProgress.value = 0
    setTimeout(() => { if (logsOpen.value) toggleLogs(false) }, 2000)
  }

  function _stopEmulator() {
    addLog('Saving SRAM state to disk...', 'warn')
    addLog('Unmounting payload. Core stopped.', 'error')
    emulatorState.value = 'stopped'
    setTimeout(() => { if (logsOpen.value) toggleLogs(false) }, 1000)
  }

  function toggleEmulator() {
    if (emulatorState.value === 'booting') return

    if (emulatorState.value === 'stopped') {
      if (!isConnected.value) {
        addLog('Error: Hardware offline. Initializing auto-connect...', 'error')
        toggleConnection()
        return
      }

      emulatorState.value = 'booting'
      bootProgress.value = 0
      if (!logsOpen.value) toggleLogs(true)

      addLog('--- BOOT SEQUENCE INITIATED ---', 'warn')
      addLog(`Allocating memory for ${dataConfig[currentPlatform.value].rom.type}...`)

      const bootSteps = [
        'Loading core modules...',
        'Mounting ROM payload into virtual memory...',
        `Injecting Save Data (${dataConfig[currentPlatform.value].sav.chip})...`,
        'Executing BIOS sequence...',
        'Bypassing logo verification...',
      ]

      let progress = 0
      let step = 0

      const interval = setInterval(() => {
        progress += Math.random() * 8

        if (progress >= 100) {
          bootProgress.value = 100
          clearInterval(interval)
          _finishBoot()
        } else {
          bootProgress.value = progress
          if (Math.random() > 0.5 && step < bootSteps.length) {
            addLog(bootSteps[step++])
          }
        }
      }, 100)
    } else if (emulatorState.value === 'running') {
      _stopEmulator()
    }
  }

  return {
    currentPlatform,
    emulatorState,
    isConnected,
    isConnecting,
    logsOpen,
    activeTab,
    shopOpen,
    helpOpen,
    settingsOpen,
    bootProgress,
    logs, // 兼容旧消费方；新代码请用 useLogStore
    addLog,
    clearLogs,
    toggleLogs,
    toggleConnection,
    setPlatform,
    toggleEmulator,
  }
})

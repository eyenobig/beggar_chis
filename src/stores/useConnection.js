// 烧录器连接状态（Pinia store）：插入烧录器自动连接，拔出自动断开。
// 「连接」= cfb detect + select；「断开」= cfb disconnect。

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { listen } from '@tauri-apps/api/event'
import { inTauri, runCfb } from '../composables/useCfb'

let _unlisten = null

export const useConnection = defineStore('connection', () => {
  const devices = ref([]) // [{port,vid,pid,burner,open,name}]
  const detecting = ref(false)
  const connected = ref(false)
  const dialogOpen = ref(false)
  const lastError = ref('')
  const selectedPort = ref(null)
  // 用户主动断开后不自动重连，直到设备拔插
  const autoConnect = ref(true)

  const burners = computed(() => devices.value.filter((d) => d.burner))
  const isConnected = computed(() => connected.value)
  const isConnecting = computed(() => detecting.value && !connected.value)

  /** 记住端口，后续 info/burn 走同一烧录器。 */
  async function selectPort(port) {
    if (!inTauri || !port) return false
    let ok = false
    await runCfb(['select', '--port', port], (ev) => {
      if (ev.type === 'selected' && ev.port) {
        selectedPort.value = ev.port
        ok = true
      } else if (ev.type === 'error') {
        lastError.value = ev.message
      }
    })
    return ok
  }

  /** cfb detect --json，刷新 devices；有烧录器则 select 第一台。 */
  async function detect() {
    if (!inTauri) {
      lastError.value = '非 Tauri 运行时（请用 npm run tauri dev）'
      return false
    }
    if (detecting.value) return burners.value.length > 0
    detecting.value = true
    lastError.value = ''
    const found = []
    try {
      await runCfb(['detect'], (ev) => {
        if (ev.type === 'port') {
          found.push({
            port: ev.port,
            vid: ev.vid,
            pid: ev.pid,
            burner: ev.burner,
            open: ev.open,
            name: ev.name,
          })
        } else if (ev.type === 'error') {
          lastError.value = ev.message
        }
      })
      devices.value = found
      if (found.length > 0) {
        await selectPort(found[0].port)
      } else {
        selectedPort.value = null
      }
    } catch (e) {
      lastError.value = String(e?.message || e)
    } finally {
      detecting.value = false
    }
    return burners.value.length > 0
  }

  function openDialog() {
    dialogOpen.value = true
    detect()
  }
  function closeDialog() {
    dialogOpen.value = false
  }

  async function connect() {
    const ok = await detect()
    connected.value = ok
  }

  async function disconnect() {
    autoConnect.value = false
    connected.value = false
    devices.value = []
    selectedPort.value = null
    closeDialog()
    if (inTauri) {
      try {
        await runCfb(['disconnect'])
      } catch (e) {
        lastError.value = String(e?.message || e)
      }
    }
  }

  async function handleDeviceChange() {
    await detect()
    if (burners.value.length === 0) {
      autoConnect.value = true
      if (connected.value) connected.value = false
    } else if (autoConnect.value) {
      connected.value = true
    }
  }

  async function startWatching() {
    if (_unlisten || !inTauri) return
    _unlisten = await listen('device-changed', () => handleDeviceChange())
    await handleDeviceChange()
  }

  function stopWatching() {
    _unlisten?.()
    _unlisten = null
  }

  return {
    devices,
    burners,
    detecting,
    connected,
    dialogOpen,
    lastError,
    selectedPort,
    isConnected,
    isConnecting,
    detect,
    selectPort,
    connect,
    disconnect,
    handleDeviceChange,
    openDialog,
    closeDialog,
    startWatching,
    stopWatching,
  }
})

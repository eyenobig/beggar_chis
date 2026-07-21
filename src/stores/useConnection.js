// 鐑у綍鍣ㄨ繛鎺ョ姸鎬侊紙Pinia store锛夛細鎻掑叆鐑у綍鍣ㄨ嚜鍔ㄨ繛鎺ワ紝鎷斿嚭鑷姩鏂紑銆?// 銆岃繛鎺ャ€? cfb detect + select锛涖€屾柇寮€銆? cfb disconnect銆?
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { cfbClient, inTauri } from '../services/cfb'
import { useCfbSettings } from './useCfbSettings'

export const useConnection = defineStore('connection', () => {
  const settings = useCfbSettings()
  const devices = ref([]) // [{port,vid,pid,burner,open,name}]
  const detecting = ref(false)
  const connected = ref(false)
  const dialogOpen = ref(false)
  const lastError = ref('')
  const selectedPort = ref(null)
  // 鐢ㄦ埛涓诲姩鏂紑鍚庝笉鑷姩閲嶈繛锛岀洿鍒拌澶囨嫈鎻?
  const autoConnect = ref(true)

  const burners = computed(() => devices.value.filter((d) => d.burner))
  const isConnected = computed(() => connected.value)
  const isConnecting = computed(() => detecting.value && !connected.value)

  /** 璁颁綇绔彛锛屽悗缁?info/burn 璧板悓涓€鐑у綍鍣ㄣ€?*/
  async function selectPort(port) {
    if (!inTauri || !port) return false
    let ok = false
    await cfbClient.selectPort(port, (ev) => {
      if (ev.type === 'selected' && ev.port) {
        selectedPort.value = ev.port
        settings.setPreferredPort(ev.port)
        ok = true
      } else if (ev.type === 'error') {
        lastError.value = ev.message
      }
    })
    return ok
  }

  /** cfb detect --json锛屽埛鏂?devices锛涙湁鐑у綍鍣ㄥ垯 select 绗竴鍙般€?*/
  async function detect() {
    if (!inTauri) {
      lastError.value = 'cfb is only available in Tauri runtime. Use npm run dev.'
      return false
    }
    if (detecting.value) return burners.value.length > 0
    detecting.value = true
    lastError.value = ''
    const found = []
    try {
      await cfbClient.detect((ev) => {
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
        const preferred = settings.preferredPort && found.find((d) => d.port === settings.preferredPort)
        await selectPort((preferred || found[0]).port)
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
        await cfbClient.disconnect()
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

  // 设备热插拔监听（device_watcher.rs）已移除：此处只做一次初始 detect。
  // 重新检测由用户在连接弹窗里手动触发（openDialog → detect）。
  async function startWatching() {
    if (!inTauri) return
    await handleDeviceChange()
  }

  function stopWatching() {
    // 保留为空壳，兼容旧调用方（App.vue 等不再主动停用监听）。
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

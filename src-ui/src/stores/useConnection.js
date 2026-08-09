// 烧录器连接状态（Pinia store）：插入烧录器自动连接，拔出自动断开。
// 「连接」= cfb detect + select；「断开」= cfb disconnect。
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { cfbClient, inTauri } from '../services/cfb'
import { useCfbSettings } from './useCfbSettings'

export const useConnection = defineStore('connection', () => {
  const settings = useCfbSettings()
  const devices = ref([]) // [{port,vid,pid,burner,open,name,serial}]
  const detecting = ref(false)
  const connected = ref(false)
  const dialogOpen = ref(false)
  const lastError = ref('')
  const selectedPort = ref(null)
  // 用户主动断开后不自动重连，直到设备拔插
  const autoConnect = ref(true)

  const burners = computed(() => dedupeBurners(devices.value.filter((d) => d.burner)))
  const needsSelection = computed(
    () => burners.value.length > 1 && !selectedPort.value,
  )
  const isConnected = computed(() => connected.value && !!selectedPort.value)
  const isConnecting = computed(() => detecting.value && !connected.value)

  /**
   * Windows 常把同一 USB 烧录器枚举成多个 COM（同 serial）——真正的幽灵口。
   * 但同型号克隆烧录器出厂 serial 也常相同（如都是 "6"），它们是独立物理设备，不该合并。
   *
   * 区分依据：同一物理设备不会同时有两个「COM 名不同且都能打开」的口。
   * 所以同 serial 的多个端口里，凡「不同 COM 名 + 都能 open」的一律判为独立设备并保留；
   * 只剩同 COM 名重复、或仅一个能 open 的，才按幽灵口合并（优先 open、次选较小 COM 名）。
   */
  function dedupeBurners(ports) {
    const bySerial = new Map()
    const noSerial = []
    for (const p of ports) {
      const sn = p.serial != null && String(p.serial).trim() !== '' ? String(p.serial) : ''
      if (!sn) {
        noSerial.push(p)
        continue
      }
      ;(bySerial.get(sn) || bySerial.set(sn, []).get(sn)).push(p)
    }

    const kept = [...noSerial]
    for (const group of bySerial.values()) {
      if (group.length === 1) {
        kept.push(group[0])
        continue
      }
      // 同 serial 多端口：统计「不同 COM 名且都能 open」的独立设备。
      const distinctOpenPorts = new Set(
        group.filter((p) => p.open).map((p) => String(p.port)),
      )
      if (distinctOpenPorts.size > 1) {
        // 多个可同时打开的不同 COM = 独立物理设备，全部保留。
        kept.push(...group)
        continue
      }
      // 其余视为同一设备的幽灵口：合并为一个（优先 open、次选较小 COM 名）。
      group.sort((a, b) => {
        if (a.open !== b.open) return a.open ? -1 : 1
        return String(a.port) < String(b.port) ? -1 : 1
      })
      kept.push(group[0])
    }
    return kept
  }

  /** 记住端口，后续 info/burn 走同一烧录器。 */
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

  /**
   * cfb detect --json，刷新 devices。
   * - 0 台：清空选择
   * - 1 台：自动 select
   * - N 台：优先 preferred / 当前仍在线的 selected；否则留空等用户点选
   */
  async function detect() {
    if (!inTauri) {
      lastError.value = 'cfb is only available in Tauri runtime. Use npm run dev.'
      return false
    }
    if (detecting.value) return burners.value.length > 0 && !!selectedPort.value
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
            serial: ev.serial || null,
          })
        } else if (ev.type === 'error') {
          lastError.value = ev.message
        }
      })
      const unique = dedupeBurners(found.filter((d) => d.burner))
      // 列表仍展示 detect 原始结果，选择逻辑按去重后的烧录器数量
      devices.value = found
      if (unique.length === 0) {
        selectedPort.value = null
      } else if (unique.length === 1) {
        await selectPort(unique[0].port)
      } else {
        const preferred =
          settings.preferredPort && unique.find((d) => d.port === settings.preferredPort)
        const stillSelected =
          selectedPort.value && unique.find((d) => d.port === selectedPort.value)
        if (preferred) {
          await selectPort(preferred.port)
        } else if (stillSelected) {
          // 会话内已选且仍在线：保持，并同步 CLI select / preferred
          await selectPort(stillSelected.port)
        } else {
          // 多台且无偏好：留空等用户手动选，不自动选。
          selectedPort.value = null
        }
      }
    } catch (e) {
      lastError.value = String(e?.message || e)
    } finally {
      detecting.value = false
    }
    // detect 只负责选口；连接态与 autoConnect 对齐，避免「已选 COM 却显示未连接」。
    if (autoConnect.value && selectedPort.value) {
      connected.value = true
    } else if (!selectedPort.value) {
      connected.value = false
    }
    return burners.value.length > 0 && !!selectedPort.value
  }

  function openDialog() {
    dialogOpen.value = true
    detect()
  }
  function closeDialog() {
    dialogOpen.value = false
  }

  /** 点选设备行：select 并视为已连接。 */
  async function pickDevice(port) {
    if (!port || detecting.value) return false
    lastError.value = ''
    const ok = await selectPort(port)
    if (ok) {
      autoConnect.value = true
      connected.value = true
    }
    return ok
  }

  /** 外部在确认硬件可用后同步 UI 连接态（如识别卡带成功）。 */
  function markConnected(port) {
    if (port) {
      selectedPort.value = port
      settings.setPreferredPort(port)
    }
    if (!selectedPort.value) return false
    autoConnect.value = true
    connected.value = true
    return true
  }

  async function connect() {
    if (needsSelection.value) {
      lastError.value = 'select_required'
      return false
    }
    // 已有选中口：只刷新列表并确认仍在线；否则走 detect 自动选（单机）
    let ok = false
    if (selectedPort.value) {
      const stillThere = devices.value.some((d) => d.port === selectedPort.value)
      if (!stillThere) {
        ok = await detect()
      } else {
        ok = await selectPort(selectedPort.value)
      }
    } else {
      ok = await detect()
    }
    if (needsSelection.value) {
      lastError.value = 'select_required'
      connected.value = false
      return false
    }
    connected.value = ok
    if (ok) autoConnect.value = true
    return ok
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
    } else if (autoConnect.value && selectedPort.value) {
      connected.value = true
    } else if (!selectedPort.value) {
      connected.value = false
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
    needsSelection,
    isConnected,
    isConnecting,
    detect,
    selectPort,
    pickDevice,
    markConnected,
    connect,
    disconnect,
    handleDeviceChange,
    openDialog,
    closeDialog,
    startWatching,
    stopWatching,
  }
})

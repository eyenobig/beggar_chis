// 烧录器连接状态：detect 确认可用端口，select 记住操作目标。
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { cfbClient, inTauri, clearDirectBinaryCache } from '../services/cfb'
import { useCfbSettings } from './useCfbSettings'
import { useTaskProgress } from './useTaskProgress'
import { i18n } from '../i18n'

/** 展示用口名精简（仅显示，传给 cfb 的仍是原始路径）：
 *  /dev/cu.usbmodem11201 → USB 11201；/dev/cu.usbserial-1234 → USB 1234；
 *  /dev/ttyUSB0 → ttyUSB0；Windows 的 COM3 原样。完整路径放 title 悬停。 */
export function shortPort(port) {
  let s = String(port || '').trim()
  if (!s) return ''
  s = s.replace(/^\/dev\/(cu|tty)\./, '').replace(/^\/dev\//, '')
  s = s.replace(/^usb[a-z]*-?(\d+[a-z]*)$/i, 'USB $1')
  return s
}

export const useConnection = defineStore('connection', () => {
  const settings = useCfbSettings()
  const taskProgress = useTaskProgress()
  const devices = ref([]) // [{port,vid,pid,burner,open,name,serial}]
  const detecting = ref(false)
  const connected = ref(false)
  /** DirectPlay 会话中（SkyEmu 持有串口）：此时「断开」是有意为之，UI 显示会话态。 */
  const directPlay = ref(false)
  const dialogOpen = ref(false)
  const lastError = ref('')
  const selectedPort = ref(null)
  // 用户主动断开后不自动重连，直到设备拔插
  const autoConnect = ref(true)

  const burners = computed(() => dedupeBurners(devices.value.filter((d) => d.burner)))
  const needsSelection = computed(
    () => burners.value.length > 1 && !selectedPort.value,
  )
  const selectedDevice = computed(() => burners.value.find((d) => d.port === selectedPort.value))
  const selectedPortReady = computed(() => selectedDevice.value?.open === true)
  const isConnected = computed(() => connected.value && selectedPortReady.value)
  const isConnecting = computed(() => detecting.value && !isConnected.value)
  const repairBlocked = computed(() =>
    taskProgress.runningCount > 0 || directPlay.value || detecting.value,
  )

  // 串口被挡（有烧录器但全部打不开 open=false）一键修复：
  // Linux → 权限不足，cfb udev 一键装规则；macOS → 串口被其他程序占用，一键释放；
  // Windows → 被残留进程占用（SkyEmu / 卡死的 cfb），一键结束（排除会话中——
  // directPlay 时 SkyEmu 持有串口是设计使然，绝不能在弹窗里把它杀掉）。
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isLinux = /Linux/.test(ua)
  const isMac = /Mac/.test(ua) && !/iPhone|iPad/.test(ua)
  const isWindows = /Windows/.test(ua)
  const permBlocked = computed(
    () =>
      (isLinux || isMac || isWindows) &&
      !directPlay.value &&
      burners.value.length > 0 &&
      burners.value.every((d) => d.open === false),
  )
  const fixingPerms = ref(false)
  const permFixPhase = ref('') // prompt | installed | already | canceled | manual | failed

  /**
   * Windows 常把同一 USB 烧录器枚举成多个 COM（同 serial）——真正的幽灵口。
   * 但同型号克隆烧录器出厂 serial 也常相同（如都是 "6"），它们是独立物理设备，不该合并。
   *
   * 区分依据：同一物理设备不会同时有两个「COM 名不同且都能打开」的口。
   * 所以同 serial 的多个端口里，凡「不同 COM 名 + 都能 open」的一律判为独立设备并保留；
   * 只剩同 COM 名重复、或仅一个能 open 的，才按幽灵口合并（优先 open、次选较小 COM 名）。
   *
   * macOS 例外：同一物理设备会同时枚举为 /dev/cu.* 与 /dev/tty.* 且都能 open，
   * 上面这条判据会把它误判成两台。先剔除「存在 cu.* 孪生口」的 tty.* 条目
   * （只剩 tty.* 的设备不受影响），再走 serial 合并。
   */
  function dedupeBurners(ports) {
    let list = ports
    const cuNames = new Set(
      ports
        .filter((p) => String(p.port).startsWith('/dev/cu.'))
        .map((p) => String(p.port)),
    )
    if (cuNames.size > 0) {
      list = ports.filter((p) => {
        const name = String(p.port)
        if (!name.startsWith('/dev/tty.')) return true
        return !cuNames.has(name.replace(/^\/dev\/tty\./, '/dev/cu.'))
      })
    }
    const bySerial = new Map()
    const noSerial = []
    for (const p of list) {
      const sn = p.serial != null && String(p.serial).trim() !== '' ? String(p.serial) : ''
      if (!sn) {
        noSerial.push(p)
        continue
      }
      if (!bySerial.has(sn)) bySerial.set(sn, [])
      bySerial.get(sn).push(p)
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
    const result = await cfbClient.selectPort(port, (ev) => {
      if (ev.type === 'selected' && ev.port) {
        selectedPort.value = ev.port
        settings.setPreferredPort(ev.port)
        ok = true
      } else if (ev.type === 'error') {
        lastError.value = ev.message
      }
    })
    if (result.error) lastError.value = result.error
    const success = ok && !result.error
    if (!success) connected.value = false
    return success
  }

  /** 单台自动选；多台只沿用偏好或当前选择，避免误选另一台烧录器。 */
  function preferredDevice() {
    const available = burners.value
    if (available.length === 1) return available[0]
    return available.find((d) => d.port === settings.preferredPort) || selectedDevice.value
  }

  let detectInFlight = null

  /**
   * cfb detect --json，刷新 devices。
   * - 0 台：清空选择
   * - 1 台：自动 select
   * - N 台：优先 preferred / 当前仍在线的 selected；否则留空等用户点选
   */
  function detect() {
    if (!inTauri) {
      lastError.value = 'cfb is only available in Tauri runtime. Use npm run dev.'
      return Promise.resolve(false)
    }
    // 并发检测共享结果，不能把上一次的在线状态当作这次检测结果。
    if (!detectInFlight) {
      detectInFlight = detectDevices().finally(() => { detectInFlight = null })
    }
    return detectInFlight
  }

  async function detectDevices() {
    detecting.value = true
    lastError.value = ''
    const found = []
    try {
      const result = await cfbClient.detect((ev) => {
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
      if (result.error || lastError.value) throw new Error(lastError.value || result.error)
      devices.value = found
      const target = preferredDevice()
      const selected = target ? await selectPort(target.port) : false
      if (!target) selectedPort.value = null
      const ready = selected && selectedPortReady.value && !lastError.value
      connected.value = autoConnect.value && ready
      return ready
    } catch (e) {
      lastError.value = String(e?.message || e)
      connected.value = false
      return false
    } finally {
      detecting.value = false
    }
  }

  function openDialog() {
    dialogOpen.value = true
    detect()
  }
  function closeDialog() {
    dialogOpen.value = false
  }

  /** 点选后重新检测实际可用性。 */
  async function pickDevice(port) {
    if (!port || detecting.value) return false
    lastError.value = ''
    const ok = await selectPort(port)
    if (ok) {
      autoConnect.value = true
      return detect()
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
    lastError.value = ''
    if (selectedDevice.value) selectedDevice.value.open = true
    else devices.value.push({ port: selectedPort.value, burner: true, open: true })
    autoConnect.value = true
    connected.value = true
    return true
  }

  function markUnavailable(error) {
    lastError.value = String(error || '')
    connected.value = false
    for (const device of devices.value) {
      if (device.port === selectedPort.value) device.open = false
    }
  }

  async function connect() {
    if (needsSelection.value) {
      lastError.value = 'select_required'
      return false
    }
    autoConnect.value = true
    const ok = await detect()
    if (needsSelection.value) {
      lastError.value = 'select_required'
      connected.value = false
      return false
    }
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

  /**
   * 一键修复烧录器串口（三平台，强制内置 sidecar）：
   * Linux 装udev 规则（pkexec 密码框）；macOS 释放占用 + 提权修设备节点；
   * Windows 释放占用 + UAC 提权修设备状态。成功后自动重新 detect 接上烧录器。
   */
  async function fixSerialPerms() {
    if (!inTauri || fixingPerms.value) return false
    if (repairBlocked.value) {
      lastError.value = i18n.global.t('settings.cfbRepairBusy')
      return false
    }
    fixingPerms.value = true
    lastError.value = ''
    permFixPhase.value = ''
    try {
      const res = await cfbClient.installUdev((ev) => {
        if (ev.type === 'udev') permFixPhase.value = ev.phase
        else if (ev.type === 'error') lastError.value = ev.message
      })
      const ok = res.code === 0
      if (!ok && !lastError.value) lastError.value = res.error || ''
      if (!ok) return false
      clearDirectBinaryCache()
      const ready = await detect()
      if (!ready && !lastError.value) lastError.value = i18n.global.t('conn.reconnectHint')
      return ready
    } catch (e) {
      lastError.value = String(e?.message || e)
      return false
    } finally {
      fixingPerms.value = false
    }
  }

  return {
    devices,
    burners,
    detecting,
    connected,
    directPlay,
    dialogOpen,
    lastError,
    selectedPort,
    needsSelection,
    isConnected,
    isConnecting,
    permBlocked,
    fixingPerms,
    permFixPhase,
    repairBlocked,
    detect,
    selectPort,
    pickDevice,
    markConnected,
    markUnavailable,
    connect,
    disconnect,
    handleDeviceChange,
    openDialog,
    closeDialog,
    startWatching,
    stopWatching,
    fixSerialPerms,
  }
})

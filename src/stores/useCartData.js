// 卡带数据（Pinia store）：ROM Payload / Save Data + 真烧录/清空（cfb）。
// Flash 芯片信息来自 cfb info 的 FlashInfo 字段（id/capacity/buffer/sector…）。
// 拖文件进窗口 → 按扩展名识别；GB/GBC 走 --mbc。测试 ROM：Z:/Project/testrom。

import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { downloadDir, join } from '@tauri-apps/api/path'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { spawnCfb, runCfb, inTauri } from '../composables/useCfb'
import { useConnection } from './useConnection'
import { useEmulator } from './useEmulator'
import { useLogStore } from './useLogStore'

/** 本地测试 ROM 目录（验证写入/识别替换）。 */
export const TESTROM_DIR = 'Z:/Project/testrom'
export const TESTROM_FILES = {
  gb_check: `${TESTROM_DIR}/gb_check.gb`,
  pokemon_green: `${TESTROM_DIR}/pokemon_green.gb`,
}

function basename(p) {
  return p.split(/[\\/]/).pop()
}
function ext(p) {
  return (basename(p).split('.').pop() || '').toLowerCase()
}
/** 扩展名 → 类型。 */
function classify(p) {
  const e = ext(p)
  if (e === 'gba') return { kind: 'rom', mbc: false }
  if (e === 'gb' || e === 'gbc') return { kind: 'rom', mbc: true }
  if (e === 'sav' || e === 'srm') return { kind: 'save' }
  return null
}

function fmtSize(bytes) {
  if (!bytes) return null
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes % (1024 * 1024) ? 1 : 0)}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}

export const useCartData = defineStore('cart', () => {
  const logStore = useLogStore()
  const emu = useEmulator()

  const romFile = ref(null) // { name, path, mbc }
  const saveFile = ref(null)

  const drawerOpen = ref(false)
  const drawerKind = ref('rom') // 'rom' | 'save'

  /** cfb info → FlashInfo + 游戏头 */
  const cartInfo = ref(null)
  const cartReading = ref(false)
  const cartError = ref('')
  const rtcInfo = ref(null)
  const romFileInfo = ref(null)

  const opRunning = ref(false)
  const opKind = ref('') // 'burn' | 'erase' | 'dump'
  const progress = ref({ done: 0, total: 0 })
  const opLogs = ref([])
  const opResult = ref(null)
  const confirm = ref('')

  const currentFile = computed(() =>
    drawerKind.value === 'rom' ? romFile.value : saveFile.value,
  )
  const progressPct = computed(() =>
    progress.value.total ? Math.round((progress.value.done / progress.value.total) * 100) : 0,
  )

  /** 当前平台是否 MBC（UI 开关优先；否则看卡带/文件）。 */
  const preferMbc = computed(() => {
    if (emu.currentPlatform === 'gbc') return true
    if (emu.currentPlatform === 'gba') return false
    if (cartInfo.value?.kind === 'gb_mbc') return true
    if (romFile.value?.mbc) return true
    return false
  })

  /** 从 cartInfo 抽出 Flash 芯片展示字段（有容量即视为在位）。 */
  const flashInfo = computed(() => {
    const c = cartInfo.value
    if (!c) return null
    const present = c.present === true || (c.capacity_bytes > 0)
    if (!present) return null
    return {
      id: c.id || '—',
      capacity: fmtSize(c.capacity_bytes) || '—',
      capacityBytes: c.capacity_bytes || 0,
      bufferWrite: c.buffer_write_bytes ? `${c.buffer_write_bytes}B` : '单字',
      sectorSize: fmtSize(c.sector_size) || '—',
      sectorCount: c.sector_count || 0,
      kind: c.kind,
      title: c.rom_title || c.game_name || null,
      maptype: c.game_code || null,
      checksum: c.rom_checksum || null,
      rtc: c.rtc,
      port: c.port || null,
    }
  })

  let _readSeq = 0
  let _readInFlight = null

  async function pickRomFile() {
    if (!inTauri) return
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'ROM', extensions: ['gba', 'gb', 'gbc'] }],
    })
    if (selected) setDropped(selected)
  }

  async function readRomFileInfo(path) {
    if (!inTauri) return
    romFileInfo.value = null
    try {
      await runCfb(['rom-info', '--file', path], (ev) => {
        if (ev.type === 'info') romFileInfo.value = ev
      })
    } catch {
      romFileInfo.value = null
    }
  }

  function setDropped(path) {
    const c = classify(path)
    if (!c) return false
    if (c.kind === 'rom') {
      romFile.value = { name: basename(path), path, mbc: c.mbc }
      if (c.mbc && emu.currentPlatform !== 'gbc') emu.setPlatform('gbc')
      else if (!c.mbc && emu.currentPlatform !== 'gba') emu.setPlatform('gba')
      readRomFileInfo(path)
    } else {
      saveFile.value = { name: basename(path), path }
    }
    return c.kind
  }

  /** 载入 testrom 下指定 ROM，作为待写入文件。 */
  function loadTestRom(key = 'gb_check') {
    const path = TESTROM_FILES[key] || key
    return setDropped(path)
  }

  function handleDrop(paths) {
    let last = false
    for (const p of paths || []) {
      const k = setDropped(p)
      if (k) last = k
    }
    return last
  }

  function openDrawer(kind) {
    drawerKind.value = kind
    drawerOpen.value = true
    confirm.value = ''
    opResult.value = null
    readCart()
  }
  function closeDrawer() {
    drawerOpen.value = false
  }

  /**
   * 读卡带 FlashInfo + 游戏头。
   * 单飞锁：并发调用合并为一次，避免多进程抢 COM 口卡死。
   */
  async function readCart() {
    if (_readInFlight) return _readInFlight
    _readInFlight = _readCartImpl().finally(() => {
      _readInFlight = null
    })
    return _readInFlight
  }

  async function _readCartImpl() {
    if (!inTauri) {
      cartError.value = '非 Tauri 运行时'
      return
    }
    const seq = ++_readSeq
    cartReading.value = true
    cartError.value = ''
    rtcInfo.value = null

    const tryOne = async (mbc) => {
      const args = mbc ? ['info', '--mbc'] : ['info']
      let info = null
      let err = ''
      await runCfb(args, (ev) => {
        if (ev.type === 'info') info = ev
        else if (ev.type === 'error') err = ev.message || err
      })
      return { info, err, mbc }
    }

    try {
      const firstMbc = preferMbc.value
      let hit = await tryOne(firstMbc)
      if (seq !== _readSeq) return
      const ok = hit.info && (hit.info.present === true || hit.info.capacity_bytes > 0)
      if (!ok) {
        hit = await tryOne(!firstMbc)
        if (seq !== _readSeq) return
      }
      const good = hit.info && (hit.info.present === true || hit.info.capacity_bytes > 0)
      if (good) {
        cartInfo.value = { ...hit.info, present: true }
        cartError.value = ''
        // 静默对齐平台，不走 setPlatform（避免再触发读卡 watch）
        const want = hit.info.kind === 'gb_mbc' ? 'gbc' : hit.info.kind === 'gba' ? 'gba' : null
        if (want && emu.currentPlatform !== want) {
          emu.$patch({ currentPlatform: want })
        }
        logStore.addLog(
          `识别卡带 · ${hit.info.rom_title || hit.info.game_name || hit.info.kind} · ${fmtSize(hit.info.capacity_bytes) || '?'}`,
          'success',
        )
      } else {
        cartInfo.value = null
        cartError.value = hit.err || '未检测到卡带（flash 无响应）'
        logStore.addLog(cartError.value, 'warn')
      }
    } catch (e) {
      if (seq !== _readSeq) return
      cartInfo.value = null
      cartError.value = String(e?.message || e)
    } finally {
      if (seq === _readSeq) cartReading.value = false
    }
    if (seq === _readSeq && cartInfo.value?.rtc === true) await readRtc()
  }

  async function readRtc() {
    if (!inTauri) return
    rtcInfo.value = null
    try {
      const args = ['rtc']
      if (preferMbc.value || cartInfo.value?.kind === 'gb_mbc') args.push('--mbc')
      await runCfb(args, (ev) => {
        if (ev.type === 'rtc_data') rtcInfo.value = ev
      })
    } catch {
      rtcInfo.value = null
    }
  }

  function mbcArgs() {
    return preferMbc.value || romFile.value?.mbc || cartInfo.value?.kind === 'gb_mbc'
  }

  /** 烧录 ROM（cfb burn）。 */
  async function burn() {
    const f = romFile.value
    if (!f || opRunning.value) return

    opRunning.value = true
    opKind.value = 'burn'
    opResult.value = null
    progress.value = { done: 0, total: 0 }
    opLogs.value = []
    logStore.addLog(`烧录开始 · ${f.name}`, 'warn')
    try {
      const args = ['burn', '--rom', f.path]
      if (f.mbc || preferMbc.value) args.push('--mbc')
      let progressLogId = null
      const fmtProgress = (done, total) => {
        const dMb = (done / 1024 / 1024).toFixed(2)
        const tMb = (total / 1024 / 1024).toFixed(2)
        const pct = total ? Math.round((done / total) * 100) : 0
        return `写入 ${dMb} / ${tMb} MB  (${pct}%)`
      }
      const { error } = await spawnCfb(args, (ev) => {
        if (ev.type === 'progress') {
          progress.value = { done: ev.done, total: ev.total }
          if (ev.total > 0) {
            if (progressLogId === null) progressLogId = logStore.addLog(fmtProgress(ev.done, ev.total))
            else logStore.updateLog(progressLogId, fmtProgress(ev.done, ev.total))
          }
        } else if (ev.type === 'log') {
          opLogs.value.push(ev.message)
          logStore.addLog(ev.message)
        } else if (ev.type === 'result') opResult.value = ev
        else if (ev.type === 'error') {
          opResult.value = { ok: false, error: ev.message }
          logStore.addLog(ev.message, 'error')
        }
      })
      if (error) logStore.addLog(error, 'error')
    } catch (e) {
      const msg = String(e?.message || e)
      opResult.value = { ok: false, error: msg }
      logStore.addLog(msg, 'error')
    } finally {
      opRunning.value = false
      if (opResult.value?.ok) {
        const r = opResult.value
        logStore.addLog(
          `烧录完成 · ${r.bytes ? (r.bytes / 1024 / 1024).toFixed(1) + 'MB' : ''} · ${r.seconds ? Math.round(r.seconds) + 's' : ''}`
            .trimEnd()
            .replace(/ · $/, ''),
          'success',
        )
      } else if (opResult.value && !opResult.value.ok) {
        logStore.addLog(`烧录失败：${opResult.value.error || '未知错误'}`, 'error')
      }
      await readCart()
    }
  }

  /**
   * 识别替换：载入 testrom → 烧录 → 再读卡确认标题已替换。
   * @returns {{ ok:boolean, before?:string, after?:string, error?:string }}
   */
  async function burnAndIdentify(key = 'gb_check') {
    const before = cartInfo.value?.rom_title || cartInfo.value?.game_name || null
    if (!loadTestRom(key)) return { ok: false, error: '无法载入 testrom' }
    await burn()
    const after = cartInfo.value?.rom_title || cartInfo.value?.game_name || null
    const ok = !!opResult.value?.ok && !!after
    if (ok) logStore.addLog(`识别替换 · ${before || '—'} → ${after}`, 'success')
    return { ok, before, after, error: opResult.value?.ok ? undefined : (opResult.value?.error || '烧录失败') }
  }

  async function erase() {
    if (opRunning.value) return

    opRunning.value = true
    opKind.value = 'erase'
    opResult.value = null
    progress.value = { done: 0, total: 0 }
    opLogs.value = []
    logStore.addLog('擦除开始…', 'warn')
    try {
      const args = ['erase']
      if (mbcArgs()) args.push('--mbc')
      const { error } = await spawnCfb(args, (ev) => {
        if (ev.type === 'log') {
          opLogs.value.push(ev.message)
          logStore.addLog(ev.message)
        } else if (ev.type === 'result') opResult.value = ev
        else if (ev.type === 'error') {
          opResult.value = { ok: false, error: ev.message }
          logStore.addLog(ev.message, 'error')
        }
      })
      if (error) logStore.addLog(error, 'error')
    } catch (e) {
      const msg = String(e?.message || e)
      opResult.value = { ok: false, error: msg }
      logStore.addLog(msg, 'error')
    } finally {
      opRunning.value = false
      if (opResult.value?.ok) logStore.addLog('擦除完成', 'success')
      else if (opResult.value && !opResult.value.ok) {
        logStore.addLog(`擦除失败：${opResult.value.error || '未知错误'}`, 'error')
      }
      await readCart()
    }
  }

  async function dump() {
    if (opRunning.value) return

    opRunning.value = true
    opKind.value = 'dump'
    opResult.value = null
    progress.value = { done: 0, total: 0 }
    opLogs.value = []
    logStore.addLog('导出开始…', 'warn')
    try {
      const title = (cartInfo.value?.rom_title || cartInfo.value?.game_name || 'dump')
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
      const extName = mbcArgs() ? 'gb' : 'gba'
      const outPath = await join(await downloadDir(), `${title}_${Date.now()}.${extName}`)
      const args = ['dump', '--out', outPath]
      if (mbcArgs()) args.push('--mbc')
      let dumpProgressId = null
      const fmtDump = (done, total) => {
        const dMb = (done / 1024 / 1024).toFixed(2)
        const tMb = (total / 1024 / 1024).toFixed(2)
        const pct = total ? Math.round((done / total) * 100) : 0
        return `读取 ${dMb} / ${tMb} MB  (${pct}%)`
      }
      await spawnCfb(args, (ev) => {
        if (ev.type === 'progress') {
          progress.value = { done: ev.done, total: ev.total }
          if (ev.total > 0) {
            if (dumpProgressId === null) dumpProgressId = logStore.addLog(fmtDump(ev.done, ev.total))
            else logStore.updateLog(dumpProgressId, fmtDump(ev.done, ev.total))
          }
        } else if (ev.type === 'log') {
          opLogs.value.push(ev.message)
          logStore.addLog(ev.message)
        } else if (ev.type === 'result') opResult.value = { ...ev, outPath }
        else if (ev.type === 'error') {
          opResult.value = { ok: false, error: ev.message }
          logStore.addLog(ev.message, 'error')
        }
      })
    } catch (e) {
      const msg = String(e?.message || e)
      opResult.value = { ok: false, error: msg }
      logStore.addLog(msg, 'error')
    } finally {
      opRunning.value = false
      if (opResult.value?.ok) logStore.addLog(`导出完成 · ${opResult.value.outPath || ''}`, 'success')
      else if (opResult.value && !opResult.value.ok) {
        logStore.addLog(`导出失败：${opResult.value.error || '未知错误'}`, 'error')
      }
    }
  }

  function requestConfirm(kind) {
    confirm.value = kind
  }
  function cancelConfirm() {
    confirm.value = ''
  }
  function doConfirmed() {
    const k = confirm.value
    confirm.value = ''
    if (k === 'burn') burn()
    else if (k === 'erase') erase()
  }

  const conn = useConnection()
  watch(
    () => conn.isConnected,
    (v) => {
      if (v) readCart()
      else {
        cartInfo.value = null
        cartError.value = ''
      }
    },
  )
  // 用户手动切平台时再读；识别成功里的 $patch 也会触发——单飞锁保证不并发抢口
  watch(
    () => emu.currentPlatform,
    () => {
      if (conn.isConnected && !cartReading.value) readCart()
    },
  )
  watch(
    () => [emu.logsOpen, emu.activeTab],
    ([open, tab]) => {
      if (open && tab === 'rom' && conn.isConnected) readCart()
    },
  )

  return {
    romFile,
    saveFile,
    drawerOpen,
    drawerKind,
    currentFile,
    cartInfo,
    flashInfo,
    cartReading,
    cartError,
    opRunning,
    opKind,
    progress,
    progressPct,
    opLogs,
    opResult,
    confirm,
    preferMbc,
    setDropped,
    handleDrop,
    openDrawer,
    closeDrawer,
    rtcInfo,
    romFileInfo,
    readCart,
    readRtc,
    readRomFileInfo,
    pickRomFile,
    loadTestRom,
    burnAndIdentify,
    burn,
    dump,
    erase,
    requestConfirm,
    cancelConfirm,
    doConfirmed,
    TESTROM_FILES,
  }
})

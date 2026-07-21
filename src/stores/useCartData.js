// 鍗″甫鏁版嵁锛圥inia store锛夛細ROM Payload / Save Data + 鐪熺儳褰?娓呯┖锛坈fb锛夈€?// Flash 鑺墖淇℃伅鏉ヨ嚜 cfb info 鐨?FlashInfo 瀛楁锛坕d/capacity/buffer/sector鈥︼級銆?// 鎷栨枃浠惰繘绐楀彛 鈫?鎸夋墿灞曞悕璇嗗埆锛汫B/GBC 璧?--mbc銆傛祴璇?ROM锛歓:/Project/testrom銆?
import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { downloadDir, join } from '@tauri-apps/api/path'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { cfbClient, inTauri } from '../services/cfb'
import { useConnection } from './useConnection'
import { useEmulator } from './useEmulator'
import { useLogStore } from './useLogStore'
import { useTaskProgress } from './useTaskProgress'

/** 鏈湴娴嬭瘯 ROM 鐩綍锛堥獙璇佸啓鍏?璇嗗埆鏇挎崲锛夈€?*/
export const TESTROM_DIR = 'Z:/Project/testrom'
export const TESTROM_FILES = {
  gb_check: `${TESTROM_DIR}/gb_check.gb`,
}

function basename(p) {
  return p.split(/[\\/]/).pop()
}
function ext(p) {
  return (basename(p).split('.').pop() || '').toLowerCase()
}
/** 鎵╁睍鍚?鈫?绫诲瀷銆?*/
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
  const taskProgress = useTaskProgress()
  const emu = useEmulator()

  const romFile = ref(null) // { name, path, mbc }
  const saveFile = ref(null)

  const drawerOpen = ref(false)
  const drawerKind = ref('rom') // 'rom' | 'save'

  /** cfb info 鈫?FlashInfo + 娓告垙澶?*/
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

  /** 褰撳墠骞冲彴鏄惁 MBC锛圲I 寮€鍏充紭鍏堬紱鍚﹀垯鐪嬪崱甯?鏂囦欢锛夈€?*/
  const preferMbc = computed(() => {
    if (emu.currentPlatform === 'gbc') return true
    if (emu.currentPlatform === 'gba') return false
    if (cartInfo.value?.kind === 'gb_mbc') return true
    if (romFile.value?.mbc) return true
    return false
  })

  /** 浠?cartInfo 鎶藉嚭 Flash 鑺墖灞曠ず瀛楁锛堟湁瀹归噺鍗宠涓哄湪浣嶏級銆?*/
  const flashInfo = computed(() => {
    const c = cartInfo.value
    if (!c) return null
    const present = c.present === true || (c.capacity_bytes > 0)
    if (!present) return null
    return {
      id: c.id || '-',
      capacity: fmtSize(c.capacity_bytes) || '-',
      capacityBytes: c.capacity_bytes || 0,
      bufferWrite: c.buffer_write_bytes ? `${c.buffer_write_bytes}B` : '鍗曞瓧',
      sectorSize: fmtSize(c.sector_size) || '-',
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
      await cfbClient.readRomFile(path, (ev) => {
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

  /** 杞藉叆 testrom 涓嬫寚瀹?ROM锛屼綔涓哄緟鍐欏叆鏂囦欢銆?*/
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
   * 璇诲崱甯?FlashInfo + 娓告垙澶淬€?   * 鍗曢閿侊細骞跺彂璋冪敤鍚堝苟涓轰竴娆★紝閬垮厤澶氳繘绋嬫姠 COM 鍙ｅ崱姝汇€?   */
  async function readCart() {
    if (_readInFlight) return _readInFlight
    _readInFlight = _readCartImpl().finally(() => {
      _readInFlight = null
    })
    return _readInFlight
  }

  async function _readCartImpl() {
    if (!inTauri) {
      cartError.value = 'cfb is only available in Tauri runtime.'
      return
    }
    const seq = ++_readSeq
    cartReading.value = true
    cartError.value = ''
    rtcInfo.value = null

    const tryOne = async (mbc) => {
      let info = null
      let err = ''
      const { error } = await cfbClient.readCartridge({ mbc }, (ev) => {
        if (ev.type === 'info') info = ev
        else if (ev.type === 'error') err = ev.message || err
      })
      if (error && !err) err = error
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
        // Platform is updated silently after card detection.
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
        cartError.value = hit.err || '未检测到卡带（Flash 无响应）'
        logStore.addLog(cartError.value, 'warn')
      }
    } catch (e) {
      if (seq !== _readSeq) return
      cartInfo.value = null
      cartError.value = String(e?.message || e)
      logStore.addLog(cartError.value, 'error')
    } finally {
      if (seq === _readSeq) cartReading.value = false
    }
    if (seq === _readSeq && cartInfo.value?.rtc === true) await readRtc()
  }

  async function readRtc() {
    if (!inTauri) return
    rtcInfo.value = null
    try {
      const mbc = preferMbc.value || cartInfo.value?.kind === 'gb_mbc'
      await cfbClient.readRtc({ mbc }, (ev) => {
        if (ev.type === 'rtc_data') rtcInfo.value = ev
      })
    } catch {
      rtcInfo.value = null
    }
  }

  function mbcArgs() {
    return preferMbc.value || romFile.value?.mbc || cartInfo.value?.kind === 'gb_mbc'
  }

  /** 鐑у綍 ROM锛坈fb burn锛夈€?*/
  async function burn() {
    const f = romFile.value
    if (!f || opRunning.value) return

    opRunning.value = true
    opKind.value = 'burn'
    opResult.value = null
    progress.value = { done: 0, total: 0 }
    opLogs.value = []
    const taskId = taskProgress.startTask({ kind: 'burn', title: '\u70e7\u5f55\u5361\u5e26', detail: f.name })
    logStore.addLog(`开始烧录 · ${f.name}`, 'warn')
    try {
      let progressLogId = null
      const fmtProgress = (done, total) => {
        const dMb = (done / 1024 / 1024).toFixed(2)
        const tMb = (total / 1024 / 1024).toFixed(2)
        const pct = total ? Math.round((done / total) * 100) : 0
        return `写入 ${dMb} / ${tMb} MB (${pct}%)`
      }
      const { error } = await cfbClient.burnRom({ romPath: f.path, mbc: f.mbc || preferMbc.value }, (ev) => {
        if (ev.type === 'progress') {
          progress.value = { done: ev.done, total: ev.total }
          taskProgress.updateProgress(taskId, ev.done, ev.total)
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
      if (error && !opResult.value) {
        opResult.value = { ok: false, error }
        logStore.addLog(error, 'error')
      }
    } catch (e) {
      const msg = String(e?.message || e)
      opResult.value = { ok: false, error: msg }
      logStore.addLog(msg, 'error')
    } finally {
      opRunning.value = false
      if (!opResult.value) {
        opResult.value = { ok: false, error: '操作未返回结果' }
        logStore.addLog(opResult.value.error, 'error')
      }
      if (opResult.value?.ok) {
        taskProgress.completeTask(taskId, f.name)
        const r = opResult.value
        logStore.addLog(
          `烧录完成 · ${r.bytes ? (r.bytes / 1024 / 1024).toFixed(1) + 'MB' : ''} · ${r.seconds ? Math.round(r.seconds) + 's' : ''}`
            .trimEnd()
            .replace(/ · $/, ''),
          'success',
        )
      } else if (opResult.value && !opResult.value.ok) {
        taskProgress.failTask(taskId, opResult.value.error)
      }
      await readCart()
    }
  }

  /**
   * 璇嗗埆鏇挎崲锛氳浇鍏?testrom 鈫?鐑у綍 鈫?鍐嶈鍗＄‘璁ゆ爣棰樺凡鏇挎崲銆?   * @returns {{ ok:boolean, before?:string, after?:string, error?:string }}
   */
  async function burnAndIdentify(key = 'gb_check') {
    const before = cartInfo.value?.rom_title || cartInfo.value?.game_name || null
    if (!loadTestRom(key)) return { ok: false, error: 'Unable to load testrom' }
    await burn()
    const after = cartInfo.value?.rom_title || cartInfo.value?.game_name || null
    const ok = !!opResult.value?.ok && !!after
    if (ok) logStore.addLog(`Identify changed ${before || '-'} -> ${after}`, 'success')
    return { ok, before, after, error: opResult.value?.ok ? undefined : (opResult.value?.error || 'Burn failed') }
  }

  async function erase() {
    if (opRunning.value) return

    opRunning.value = true
    opKind.value = 'erase'
    opResult.value = null
    progress.value = { done: 0, total: 0 }
    opLogs.value = []
    const taskId = taskProgress.startTask({ kind: 'erase', title: '\u64e6\u9664\u5361\u5e26' })
    logStore.addLog('开始擦除卡带', 'warn')
    try {
      const { error } = await cfbClient.erase({ mbc: mbcArgs() }, (ev) => {
        if (ev.type === 'log') {
          opLogs.value.push(ev.message)
          logStore.addLog(ev.message)
        } else if (ev.type === 'result') opResult.value = ev
        else if (ev.type === 'error') {
          opResult.value = { ok: false, error: ev.message }
          logStore.addLog(ev.message, 'error')
        }
      })
      if (error && !opResult.value) {
        opResult.value = { ok: false, error }
        logStore.addLog(error, 'error')
      }
    } catch (e) {
      const msg = String(e?.message || e)
      opResult.value = { ok: false, error: msg }
      logStore.addLog(msg, 'error')
    } finally {
      opRunning.value = false
      if (!opResult.value) {
        opResult.value = { ok: false, error: '操作未返回结果' }
        logStore.addLog(opResult.value.error, 'error')
      }
      if (opResult.value?.ok) taskProgress.completeTask(taskId)
      if (opResult.value?.ok) logStore.addLog('擦除完成', 'success')
      else if (opResult.value && !opResult.value.ok) {
        taskProgress.failTask(taskId, opResult.value.error)
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
    const taskId = taskProgress.startTask({ kind: 'dump', title: '\u8bfb\u53d6\u5361\u5e26', detail: cartInfo.value?.rom_title || cartInfo.value?.game_name || '' })
    logStore.addLog('开始读取卡带', 'warn')
    try {
      const title = (cartInfo.value?.rom_title || cartInfo.value?.game_name || 'dump')
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
      const extName = mbcArgs() ? 'gb' : 'gba'
      const outPath = await join(await downloadDir(), `${title}_${Date.now()}.${extName}`)
      let dumpProgressId = null
      const fmtDump = (done, total) => {
        const dMb = (done / 1024 / 1024).toFixed(2)
        const tMb = (total / 1024 / 1024).toFixed(2)
        const pct = total ? Math.round((done / total) * 100) : 0
        return `读取 ${dMb} / ${tMb} MB (${pct}%)`
      }
      const { error } = await cfbClient.dumpRom({ outputPath: outPath, mbc: mbcArgs() }, (ev) => {
        if (ev.type === 'progress') {
          progress.value = { done: ev.done, total: ev.total }
          taskProgress.updateProgress(taskId, ev.done, ev.total)
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
      if (error && !opResult.value) {
        opResult.value = { ok: false, error }
        logStore.addLog(error, 'error')
      }
    } catch (e) {
      const msg = String(e?.message || e)
      opResult.value = { ok: false, error: msg }
      logStore.addLog(msg, 'error')
    } finally {
      opRunning.value = false
      if (!opResult.value) {
        opResult.value = { ok: false, error: '操作未返回结果' }
        logStore.addLog(opResult.value.error, 'error')
      }
      if (opResult.value?.ok) taskProgress.completeTask(taskId)
      if (opResult.value?.ok) logStore.addLog('读取完成', 'success')
      else if (opResult.value && !opResult.value.ok) {
        taskProgress.failTask(taskId, opResult.value.error)
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
  // 鐢ㄦ埛鎵嬪姩鍒囧钩鍙版椂鍐嶈锛涜瘑鍒垚鍔熼噷鐨?$patch 涔熶細瑙﹀彂鈥斺€斿崟椋為攣淇濊瘉涓嶅苟鍙戞姠鍙?
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

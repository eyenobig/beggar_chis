// 鍗″甫鏁版嵁锛圥inia store锛夛細ROM Payload / Save Data + 鐪熺儳褰?娓呯┖锛坈fb锛夈€?// Flash 鑺墖淇℃伅鏉ヨ嚜 cfb info 鐨?FlashInfo 瀛楁锛坕d/capacity/buffer/sector鈥︼級銆?// 鎷栨枃浠惰繘绐楀彛 鈫?鎸夋墿灞曞悕璇嗗埆锛汫B/GBC 璧?--mbc銆傛祴璇?ROM锛歓:/Project/testrom銆?
import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { downloadDir, join } from '@tauri-apps/api/path'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { cfbClient, ensureDirectBinary, inTauri } from '../services/cfb'

import { useCfbSettings } from './useCfbSettings'
import { useConnection } from './useConnection'
import { useEmulator } from './useEmulator'
import { useLogStore, stripLogElapsed, parsePhaseProgress } from './useLogStore'
import { useTaskProgress } from './useTaskProgress'
import { useToast } from './useToast'
import { i18n } from '../i18n'
import { gameCodeOf, romTitleOf } from '../components/drawer/logs/rom/romFields'

function t(key, params) {
  return i18n.global.t(key, params)
}

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

/**
 * info 命中质量（双模式回退用）：
 * 3 = 明确平台 + ROM 头身份；2 = 明确 gba/gb_mbc（可能空标题）；
 * 1 = 仅 flash 在位 / kind=unknown（弱命中，不得挡住另一模式）；
 * 0 = 无。
 * 注意：GB NOR 在 GBA 总线 3.3V 下也可能 CFI 有响应 → unknown+capacity，必须让 MBC 有机会赢。
 */
function infoQuality(info) {
  if (!info) return 0
  const present = info.present === true || info.capacity_bytes > 0
  if (!present) return 0
  const kind = info.kind
  const hasId = !!(romTitleOf(info) || gameCodeOf(info))
  if (kind === 'gb_mbc' || kind === 'gba') {
    return hasId ? 3 : 2
  }
  return 1
}

/** USB 重枚举后 COM 号会变，旧 --port 打开失败时应重新 detect。 */
function isStalePortError(err) {
  const s = String(err || '')
  return /打开端口|找不到指定的文件|cannot find the file|access is denied|拒绝访问|not found|当前不在线/i.test(s)
}

/** 瞬时识别失败（接触抖动 / 上电未稳），值得短退避后再试。 */
function isTransientCartError(err) {
  const s = String(err || '')
  return (
    isStalePortError(s) ||
    /未检测|无响应|flash|timeout|超时|exited with code 3/i.test(s)
  )
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 进度类 log 并入已有进度行；返回是否已消化（勿再 addLog）。
 * 实际合并由 logStore.addLog 按 phase 锚点完成。
 */
function absorbPhaseProgressLog(logStore, rawMessage) {
  const parsed = parsePhaseProgress(rawMessage)
  if (!parsed) return false
  const id = logStore.addLog(parsed.message)
  if (parsed.elapsed) logStore.setLogElapsed(id, parsed.elapsed)
  return true
}

/**
 * LOGS 面板阶段进度：同一 phase 原地更新一行；phase 切换新开一行。
 * 底层走 logStore.addLog 的 progress coalesce，堵住 cfb log / progress 双通道刷屏。
 */
function createPhaseProgressLog(logStore) {
  let logId = null
  let phase = ''
  let lastPct = -1
  let lastUiAt = 0
  const UI_THROTTLE_MS = 200

  function upsert(nextPhase, pct, { elapsed, force = false } = {}) {
    if (!nextPhase) return logId
    const shownPct = pct != null && pct >= 0 ? pct : (lastPct >= 0 ? lastPct : 0)
    const label = `${nextPhase} ${shownPct}%`
    const now = Date.now()
    const phaseChanged = nextPhase !== phase
    if (!force && !phaseChanged && logId != null && pct === lastPct && now - lastUiAt < UI_THROTTLE_MS) {
      if (elapsed) logStore.setLogElapsed(logId, elapsed)
      return logId
    }
    phase = nextPhase
    lastPct = shownPct
    lastUiAt = now
    // addLog 对同 phase 进度行 upsert；phase 切换自然新开一行
    logId = logStore.addLog(label)
    if (elapsed != null) logStore.setLogElapsed(logId, elapsed)
    return logId
  }

  /** @returns {boolean} 是否已消化为进度行（调用方勿再 addLog） */
  function fromCfbLog(rawMessage) {
    const parsed = parsePhaseProgress(rawMessage)
    if (!parsed) return false
    upsert(parsed.phase, parsed.pct, { elapsed: parsed.elapsed, force: true })
    return true
  }

  function setElapsed(elapsed) {
    if (logId != null && elapsed != null) logStore.setLogElapsed(logId, elapsed)
  }

  return {
    upsert,
    fromCfbLog,
    setElapsed,
    get logId() { return logId },
    get phase() { return phase },
  }
}

function phaseKeyFromLabel(label) {
  if (label === '擦除') return 'erase'
  if (label === '写入') return 'write'
  if (label === '校验') return 'verify'
  if (label === '导出') return 'dump'
  return ''
}

export const useCartData = defineStore('cart', () => {
  const logStore = useLogStore()
  const taskProgress = useTaskProgress()
  const toast = useToast()
  const emu = useEmulator()
  const cfbSettings = useCfbSettings()
  const conn = useConnection()

  /**
   * 烧录/擦除前的门禁：等待路径自动填充后，若配置了 cfb 路径则确认可执行文件存在；
   * 未配置时走内置 sidecar，不拦截。
   */
  async function ensureToolchainReady() {
    if (!inTauri) return { ok: true }
    await cfbSettings.ensurePathsReady()
    if (!cfbSettings.cfbBinPath) {
      return { ok: true }
    }
    try {
      const resolved = await ensureDirectBinary(cfbSettings.cfbBinPath)
      if (resolved && resolved !== cfbSettings.cfbBinPath) {
        cfbSettings.cfbBinPath = resolved
      }
      return { ok: true }
    } catch (e) {
      return {
        ok: false,
        error: `未找到可执行的 cfb 二进制。${String(e?.message || e)}`,
      }
    }
  }

  const romFile = ref(null) // { name, path, mbc }
  const saveFile = ref(null) // { name, path, size? }
  const saveType = ref('sram')

  const drawerOpen = ref(false)
  const drawerKind = ref('rom') // 'rom' | 'save'

  /** cfb info 鈫?FlashInfo + 娓告垙澶?*/
  const cartInfo = ref(null)
  const cartReading = ref(false)
  const cartError = ref('')
  const rtcInfo = ref(null)
  const romFileInfo = ref(null)
  const saveInfo = ref(null)

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
      id: c.id || '—',
      chipId: c.id || null,
      capacity: fmtSize(c.capacity_bytes) || '-',
      capacityBytes: c.capacity_bytes || 0,
      bufferWrite: c.buffer_write_bytes ? `${c.buffer_write_bytes}B` : '单字',
      kind: c.kind,
      title: c.rom_title || c.game_name || null,
      checksum: c.rom_checksum || null,
      rtc: c.rtc,
      port: c.port || null,
    }
  })

  let _readSeq = 0
  let _readInFlight = null
  let _opChild = null // 当前烧录/导出/擦除的 cfb 子进程 handle，用于中止
  let _opAborted = false
  /** 识别成功后静默切平台时，跳过 platform watch 触发的二次 readCart。 */
  let _suppressPlatformRead = false

  async function abortOp() {
    if (!opRunning.value || !_opChild) return
    _opAborted = true
    const child = _opChild
    _opChild = null
    try {
      await child.kill()
    } catch {
      /* 进程可能已退出 */
    }
    logStore.addLog('操作已中断', 'warn')
  }

  async function pickRomFile() {
    if (!inTauri) {
      toast.error('请在桌面客户端中选择 ROM')
      return null
    }
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'ROM', extensions: ['gba', 'gb', 'gbc'] }],
      })
      if (!selected) return null
      const path = typeof selected === 'string' ? selected : selected[0]
      if (!path) return null
      setDropped(path)
      return path
    } catch (e) {
      const msg = String(e?.message || e || '选择 ROM 失败')
      toast.error(msg)
      logStore.addLog(msg, 'error')
      return null
    }
  }

  async function pickSaveFile() {
    if (!inTauri) {
      toast.error('请在桌面客户端中选择存档')
      return null
    }
    try {
      const selected = await openDialog({
        multiple: false,
        title: '选择存档文件',
        filters: [{ name: 'Save', extensions: ['sav', 'srm'] }],
      })
      if (!selected) return null
      const path = typeof selected === 'string' ? selected : selected[0]
      if (!path) return null
      const kind = setDropped(path)
      if (kind !== 'save') {
        toast.error('请选择 .sav 或 .srm 存档文件')
        return null
      }
      return path
    } catch (e) {
      const msg = String(e?.message || e || '选择存档失败')
      toast.error(msg)
      logStore.addLog(msg, 'error')
      return null
    }
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

  async function fillSaveFileSize(path) {
    if (!inTauri || !path) return
    try {
      const size = await invoke('file_size', { path })
      if (saveFile.value?.path === path) {
        saveFile.value = { ...saveFile.value, size: Number(size) || 0 }
      }
    } catch {
      /* 展示层用 — 占位 */
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
      saveFile.value = { name: basename(path), path, size: null }
      // 不再切 drawerKind='save'：ROM 页 ROM/存档六按钮并存，勿替换烧录条
      drawerOpen.value = true
      void fillSaveFileSize(path)
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
    // 展开抽屉不自动读卡；仅手动「识别」才刷新
  }
  function closeDrawer() {
    drawerOpen.value = false
  }

  /**
   * 读卡带 FlashInfo + 游戏头。
   * 单飞锁：并发调用合并为一次，避免多进程抢 COM 口卡死。
   * @param {{ silent?: boolean }} [opts] silent=true 时不写 log 面板（重连/自动刷新用）
   */
  async function readCart(opts = {}) {
    if (_readInFlight) return _readInFlight
    _readInFlight = _readCartImpl(opts).finally(() => {
      _readInFlight = null
    })
    return _readInFlight
  }

  async function _readCartImpl({ silent = false } = {}) {
    if (!inTauri) {
      cartError.value = 'cfb is only available in Tauri runtime.'
      return
    }
    const seq = ++_readSeq
    cartReading.value = true
    cartError.value = ''
    rtcInfo.value = null

    /** 热敏纸连续出纸：每条状态追加一行，整张纸随内容变高；silent 不打扰。 */
    const showStatus = (msg, type = 'info') => {
      if (silent) return
      if (type === 'success') toast.success(msg)
      else if (type === 'error') toast.error(msg)
      else toast.info(msg)
    }

    showStatus(t('rom.op.identifying'))

    const tryOne = async (mbc) => {
      showStatus(mbc ? t('rom.op.probeMbc') : t('rom.op.probeGba'))
      let info = null
      let err = ''
      // MBC/5V 比 GBA 更易抖：多一次退避。cmd 侧已有上电重试；这里覆盖进程刚释放 COM 的窗口。
      const maxAttempts = mbc ? 3 : 2
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) await sleep(mbc ? 180 * attempt : 150 * attempt)
        info = null
        err = ''
        const { error } = await cfbClient.readCartridge({ mbc }, (ev) => {
          if (ev.type === 'info') info = ev
          else if (ev.type === 'error') err = ev.message || err
        })
        if (error && !err) err = error
        // 明确平台命中即可停；unknown 弱命中继续重试（尤其 MBC）
        if (infoQuality(info) >= 2) return { info, err, mbc }
        if (infoQuality(info) > 0 && !mbc) return { info, err, mbc }
        if (!mbc && !isTransientCartError(err)) break
      }
      return { info, err, mbc }
    }

    const tryBothModes = async () => {
      const firstMbc = preferMbc.value
      let hit = await tryOne(firstMbc)
      if (seq !== _readSeq) return null
      // 非强身份（无明确 kind+标题）时再试另一模式；GB 卡在 GBA 模式常出现 unknown+CFI。
      if (infoQuality(hit.info) < 3) {
        // 换电压前多等一会：尤其切到 MBC(5V) 需要轨稳定
        const switchingToMbc = !firstMbc
        await sleep(switchingToMbc ? 280 : 160)
        const other = await tryOne(!firstMbc)
        if (seq !== _readSeq) return null
        const qOther = infoQuality(other.info)
        const qHit = infoQuality(hit.info)
        if (qOther > qHit) hit = other
        else if (
          qOther === qHit &&
          other.info?.kind &&
          other.info.kind !== 'unknown' &&
          (!hit.info?.kind || hit.info.kind === 'unknown')
        ) {
          hit = other
        }
      }
      return hit
    }

    try {
      let hit = await tryBothModes()
      if (seq !== _readSeq || !hit) return
      // 记住的 COM 失效（拔插后变成 COM16 等）→ 重新 detect 再读一次
      if (infoQuality(hit.info) === 0 && isStalePortError(hit.err)) {
        const redetectMsg = t('rom.op.redetectPort')
        showStatus(redetectMsg)
        await conn.detect()
        if (seq !== _readSeq) return
        if (conn.selectedPort) {
          conn.connected = true
          await sleep(200)
          hit = await tryBothModes()
          if (seq !== _readSeq || !hit) return
        }
      }
      const good = infoQuality(hit.info) > 0
      if (good) {
        cartInfo.value = { ...hit.info, present: true }
        cartError.value = ''
        // 同步实际用到的 COM，避免 UI 仍钉着已消失的旧口。
        if (hit.info.port) {
          cfbSettings.setPreferredPort(hit.info.port)
          conn.selectedPort = hit.info.port
        }
        // 识别成功后切到对应平台选项卡（GB/GBC ↔ GBA）。
        // 用 setPlatform（勿仅 $patch）：保证 PlatformToggle 响应式更新；
        // _suppressPlatformRead 避免 platform watch 立刻二次 readCart。
        const want =
          hit.info.kind === 'gb_mbc' ? 'gbc' : hit.info.kind === 'gba' ? 'gba' : null
        if (want && emu.currentPlatform !== want) {
          _suppressPlatformRead = true
          try {
            emu.setPlatform(want)
          } finally {
            // 等平台 watch 与后续 flush 都过完再放开，避免识别成功后立刻二次读卡
            setTimeout(() => {
              _suppressPlatformRead = false
            }, 400)
          }
        }
        const name = romTitleOf(hit.info) || hit.info.kind || '?'
        if (!silent) {
          logStore.addLog(
            `识别卡带 · ${name} · ${fmtSize(hit.info.capacity_bytes) || '?'}`,
            'success',
          )
        }
        showStatus(t('rom.op.identifyOk', { name }), 'success')
      } else {
        cartInfo.value = null
        cartError.value = hit.err || t('rom.op.identifyEmpty')
        if (!silent) logStore.addLog(cartError.value, 'warn')
        showStatus(
          hit.err ? t('rom.op.identifyFail', { err: hit.err }) : t('rom.op.identifyEmpty'),
          'error',
        )
      }
    } catch (e) {
      if (seq !== _readSeq) return
      cartInfo.value = null
      cartError.value = String(e?.message || e)
      if (!silent) logStore.addLog(cartError.value, 'error')
      showStatus(t('rom.op.identifyFail', { err: cartError.value }), 'error')
    } finally {
      if (seq === _readSeq) {
        cartReading.value = false
      }
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

    if (!conn.isConnected) {
      const msg = conn.needsSelection ? t('conn.selectHint') : t('rom.hint.connect')
      toast.error(msg)
      logStore.addLog(msg, 'warn')
      if (conn.needsSelection || !conn.selectedPort) conn.openDialog()
      return
    }
    if (!flashInfo.value) {
      const msg = cartError.value || t('rom.op.identifyEmpty')
      toast.error(msg)
      logStore.addLog(msg, 'warn')
      return
    }

    const toolchain = await ensureToolchainReady()
    if (!toolchain.ok) {
      toast.error(toolchain.error)
      logStore.addLog(toolchain.error, 'error')
      return
    }

    opRunning.value = true
    opKind.value = 'burn'
    opResult.value = null
    progress.value = { done: 0, total: 0 }
    opLogs.value = []
    _opAborted = false
    // 烧录时展开 ROM 页 + 第三层进度条
    emu.toggleLogs(true, 'rom')
    const taskId = taskProgress.startTask({ kind: 'burn', title: '\u70e7\u5f55\u5361\u5e26', detail: f.name })
    // 烧录成功启动：清空进度条，避免沿用上一次操作的残条/%
    taskProgress.resetProgress(taskId)
    taskProgress.drawerOpen = true
    toast.info(t('rom.op.burnStart', { name: f.name }))
    const burnStartedAt = Date.now()
    const fmtElapsed = () => {
      const sec = (Date.now() - burnStartedAt) / 1000
      if (sec < 60) return `${sec.toFixed(1)}s`
      const m = Math.floor(sec / 60)
      const s = Math.round(sec % 60)
      return `${m}m${String(s).padStart(2, '0')}s`
    }
    // 起始行保留；擦除/写入/校验进度各自一行原地更新；完成/失败另起一行
    logStore.addLog(`烧录 ${f.name}`, 'warn')
    const phaseProg = createPhaseProgressLog(logStore)
    /** 'erase' | 'write' | 'verify' | '' — 扇区擦除→字节写入时重置进度条 */
    let burnPhase = ''
    const applyBurnPhase = (nextPhase) => {
      if (!nextPhase) return
      if (burnPhase && nextPhase !== burnPhase && (nextPhase === 'write' || nextPhase === 'erase' || nextPhase === 'verify')) {
        progress.value = { done: 0, total: 0 }
        taskProgress.resetProgress(taskId)
      }
      burnPhase = nextPhase
    }
    const tickTimer = setInterval(() => phaseProg.setElapsed(fmtElapsed()), 250)
    try {
      const { error } = await cfbClient.burnRom({ romPath: f.path, mbc: f.mbc || preferMbc.value }, (ev) => {
        if (ev.type === 'progress') {
          if (ev.total > 0) {
            // write/verify total 常相同，校验阶段靠 log 切相；否则 total<4096 视为擦除
            let nextPhase = burnPhase
            if (burnPhase !== 'verify') {
              nextPhase = ev.total < 4096 ? 'erase' : 'write'
            }
            applyBurnPhase(nextPhase)
            const label = nextPhase === 'erase' ? '擦除' : nextPhase === 'verify' ? '校验' : '写入'
            const pct = Math.round((ev.done / ev.total) * 100)
            phaseProg.upsert(label, pct, { elapsed: fmtElapsed() })
          }
          progress.value = { done: ev.done, total: ev.total }
          taskProgress.updateProgress(taskId, ev.done, ev.total)
        } else if (ev.type === 'log') {
          opLogs.value.push(ev.message)
          const raw = String(ev.message || '')
          if (phaseProg.fromCfbLog(raw)) {
            applyBurnPhase(phaseKeyFromLabel(phaseProg.phase))
            return
          }
          // 兜底：任何进度形态都走 store coalesce，绝不新开行
          if (absorbPhaseProgressLog(logStore, raw)) {
            applyBurnPhase(phaseKeyFromLabel(parsePhaseProgress(raw)?.phase || ''))
            return
          }
          const msg = stripLogElapsed(raw)
          // 完成/失败由 finally 单独成行，避免与 cfb 收尾 log 重复
          if (/^(擦除|写入|校验|烧录)(完成|失败|已中断)\b/.test(msg)) return
          // 非百分比阶段提示：切入校验（progress total 与写入相同）
          if (/校验/.test(msg) && !/不符/.test(msg)) applyBurnPhase('verify')
          else if (/开始写入|写入中|开始编程/.test(msg)) {
            // GBA 整片擦除没有细粒度 progress；进入写入即代表擦除完成。
            if (burnPhase === 'erase') phaseProg.upsert('擦除', 100, { elapsed: fmtElapsed(), force: true })
            applyBurnPhase('write')
          } else if (/擦除/.test(msg) && /开始|整片/.test(msg)) {
            applyBurnPhase('erase')
            // GBA 默认整片擦除期间底层可能只有阶段日志。先建立进度行，
            // 让右侧耗时从 0.0s 起持续刷新，与 GB/GBC 日志表现一致。
            phaseProg.upsert('擦除', 0, { elapsed: fmtElapsed(), force: true })
          }
          logStore.addLog(msg || raw)
        } else if (ev.type === 'result') opResult.value = ev
        else if (ev.type === 'error') {
          opResult.value = { ok: false, error: ev.message }
          logStore.addLog(ev.message, 'error')
        }
      }, (child) => { _opChild = child })
      if (_opAborted) {
        opResult.value = { ok: false, error: '已中断', aborted: true }
      } else if (error && !opResult.value) {
        opResult.value = { ok: false, error }
        logStore.addLog(error, 'error')
      }
    } catch (e) {
      if (_opAborted) {
        opResult.value = { ok: false, error: '已中断', aborted: true }
      } else {
        const msg = String(e?.message || e)
        opResult.value = { ok: false, error: msg }
        logStore.addLog(msg, 'error')
      }
    } finally {
      clearInterval(tickTimer)
      _opChild = null
      opRunning.value = false
      if (!opResult.value) {
        opResult.value = { ok: false, error: _opAborted ? '已中断' : '操作未返回结果', aborted: _opAborted }
        if (!_opAborted) logStore.addLog(opResult.value.error, 'error')
      }
      const timePart = opResult.value?.seconds != null && opResult.value.seconds > 0
        ? `${Number(opResult.value.seconds).toFixed(1)}s`
        : fmtElapsed()
      if (opResult.value?.ok) {
        taskProgress.completeTask(taskId, f.name)
        const r = opResult.value
        const sizePart = r.bytes ? `${(r.bytes / 1024 / 1024).toFixed(1)}MB` : ''
        const doneId = logStore.addLog(['烧录完成', sizePart].filter(Boolean).join(' '), 'success')
        logStore.setLogElapsed(doneId, timePart)
        toast.success(t('rom.op.burnOk'))
      } else if (opResult.value && !opResult.value.ok) {
        taskProgress.failTask(taskId, opResult.value.error)
        const failLabel = _opAborted ? '烧录已中断' : '烧录失败'
        const failId = logStore.addLog(failLabel, _opAborted ? 'warn' : 'error')
        logStore.setLogElapsed(failId, timePart)
        if (_opAborted) toast.info(t('rom.op.burnAbort'))
        else toast.error(t('rom.op.burnFail'))
      }
      await readCart({ silent: true })
    }
  }

  /**
   * 识别替换：载入 testrom → 烧录 → 再读卡确认标题已替换。
   * @returns {{ ok:boolean, before?:string, after?:string, error?:string }}
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

    const toolchain = await ensureToolchainReady()
    if (!toolchain.ok) {
      toast.error(toolchain.error)
      logStore.addLog(toolchain.error, 'error')
      return
    }

    opRunning.value = true
    opKind.value = 'erase'
    opResult.value = null
    progress.value = { done: 0, total: 0 }
    opLogs.value = []
    _opAborted = false
    // 擦除时展开 ROM 页 + 第三层进度条（与烧录一致，否则 drawer3 不可见）
    emu.toggleLogs(true, 'rom')
    const taskId = taskProgress.startTask({ kind: 'erase', title: '\u64e6\u9664\u5361\u5e26' })
    // 擦除成功启动：清空进度条
    taskProgress.resetProgress(taskId)
    taskProgress.drawerOpen = true
    toast.info(t('rom.op.eraseStart'))
    const eraseStartedAt = Date.now()
    const fmtEraseElapsed = () => `${((Date.now() - eraseStartedAt) / 1000).toFixed(1)}s`
    // 起始行保留；进度「擦除 N%」单行原地更新；完成/失败另起一行
    logStore.addLog('擦除卡带', 'warn')
    const phaseProg = createPhaseProgressLog(logStore)
    const tickTimer = setInterval(() => phaseProg.setElapsed(fmtEraseElapsed()), 250)
    try {
      const { error } = await cfbClient.erase({ mbc: mbcArgs() }, (ev) => {
        if (ev.type === 'progress') {
          progress.value = { done: ev.done, total: ev.total }
          taskProgress.updateProgress(taskId, ev.done, ev.total)
          if (ev.total > 0) {
            const pct = Math.round((ev.done / ev.total) * 100)
            phaseProg.upsert('擦除', pct, { elapsed: fmtEraseElapsed() })
          } else {
            phaseProg.upsert('擦除', null, { elapsed: fmtEraseElapsed() })
          }
        } else if (ev.type === 'log') {
          opLogs.value.push(ev.message)
          const raw = String(ev.message || '')
          if (phaseProg.fromCfbLog(raw)) return
          if (absorbPhaseProgressLog(logStore, raw)) return
          const msg = stripLogElapsed(raw)
          if (/^(擦除)(完成|失败|已中断)\b/.test(msg)) return
          logStore.addLog(msg || raw)
        } else if (ev.type === 'result') opResult.value = ev
        else if (ev.type === 'error') {
          opResult.value = { ok: false, error: ev.message }
          logStore.addLog(ev.message, 'error')
        }
      }, (child) => { _opChild = child })
      if (_opAborted) {
        opResult.value = { ok: false, error: '已中断', aborted: true }
      } else if (error && !opResult.value) {
        opResult.value = { ok: false, error }
        logStore.addLog(error, 'error')
      }
    } catch (e) {
      if (_opAborted) {
        opResult.value = { ok: false, error: '已中断', aborted: true }
      } else {
        const msg = String(e?.message || e)
        opResult.value = { ok: false, error: msg }
        logStore.addLog(msg, 'error')
      }
    } finally {
      clearInterval(tickTimer)
      _opChild = null
      opRunning.value = false
      if (!opResult.value) {
        opResult.value = { ok: false, error: _opAborted ? '已中断' : '操作未返回结果', aborted: _opAborted }
        if (!_opAborted) logStore.addLog(opResult.value.error, 'error')
      }
      const timePart = opResult.value?.seconds != null && opResult.value.seconds > 0
        ? `${Number(opResult.value.seconds).toFixed(1)}s`
        : fmtEraseElapsed()
      if (opResult.value?.ok) {
        taskProgress.completeTask(taskId)
        const doneId = logStore.addLog('擦除完成', 'success')
        logStore.setLogElapsed(doneId, timePart)
        toast.success(t('rom.op.eraseOk'))
      } else if (opResult.value && !opResult.value.ok) {
        taskProgress.failTask(taskId, opResult.value.error)
        const failId = logStore.addLog(_opAborted ? '擦除已中断' : '擦除失败', _opAborted ? 'warn' : 'error')
        logStore.setLogElapsed(failId, timePart)
        if (_opAborted) toast.info(t('rom.op.eraseAbort'))
        else toast.error(t('rom.op.eraseFail'))
      }
      await readCart({ silent: true })
    }
  }

  async function chooseExportDirectory(title) {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title,
        defaultPath: await downloadDir(),
      })
      if (!selected) return null
      return Array.isArray(selected) ? (selected[0] || null) : selected
    } catch (error) {
      const message = `无法选择导出文件夹：${String(error?.message || error)}`
      toast.error(message)
      logStore.addLog(message, 'error')
      return null
    }
  }

  async function dump() {
    if (opRunning.value) return
    const exportDir = await chooseExportDirectory('选择 ROM 导出文件夹')
    if (!exportDir) return

    opRunning.value = true
    opKind.value = 'dump'
    opResult.value = null
    progress.value = { done: 0, total: 0 }
    opLogs.value = []
    _opAborted = false
    const taskId = taskProgress.startTask({ kind: 'dump', title: '导出 ROM', detail: cartInfo.value?.rom_title || cartInfo.value?.game_name || '' })
    logStore.addLog('开始导出 ROM', 'warn')
    const phaseProg = createPhaseProgressLog(logStore)
    try {
      const title = (cartInfo.value?.rom_title || cartInfo.value?.game_name || 'dump')
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
      const extName = mbcArgs() ? 'gb' : 'gba'
      const outPath = await join(exportDir, `${title}_${Date.now()}.${extName}`)
      const { error } = await cfbClient.dumpRom({ outputPath: outPath, mbc: mbcArgs() }, (ev) => {
        if (ev.type === 'progress') {
          progress.value = { done: ev.done, total: ev.total }
          taskProgress.updateProgress(taskId, ev.done, ev.total)
          if (ev.total > 0) {
            const pct = Math.round((ev.done / ev.total) * 100)
            phaseProg.upsert('导出', pct)
          }
        } else if (ev.type === 'log') {
          opLogs.value.push(ev.message)
          const raw = String(ev.message || '')
          if (phaseProg.fromCfbLog(raw)) return
          if (absorbPhaseProgressLog(logStore, raw)) return
          const msg = stripLogElapsed(raw)
          if (/^(读取|导出)(完成|失败|已中断)\b/.test(msg)) return
          logStore.addLog(msg || raw)
        } else if (ev.type === 'result') opResult.value = { ...ev, outPath }
        else if (ev.type === 'error') {
          opResult.value = { ok: false, error: ev.message }
          logStore.addLog(ev.message, 'error')
        }
      }, (child) => { _opChild = child })
      if (_opAborted) {
        opResult.value = { ok: false, error: '已中断', aborted: true }
      } else if (error && !opResult.value) {
        opResult.value = { ok: false, error }
        logStore.addLog(error, 'error')
      }
    } catch (e) {
      if (_opAborted) {
        opResult.value = { ok: false, error: '已中断', aborted: true }
      } else {
        const msg = String(e?.message || e)
        opResult.value = { ok: false, error: msg }
        logStore.addLog(msg, 'error')
      }
    } finally {
      _opChild = null
      opRunning.value = false
      if (!opResult.value) {
        opResult.value = { ok: false, error: _opAborted ? '已中断' : '操作未返回结果', aborted: _opAborted }
        if (!_opAborted) logStore.addLog(opResult.value.error, 'error')
      }
      if (opResult.value?.ok) {
        taskProgress.completeTask(taskId)
        logStore.addLog('导出 ROM 完成', 'success')
      } else if (opResult.value && !opResult.value.ok) {
        taskProgress.failTask(taskId, opResult.value.error)
        if (_opAborted) logStore.addLog('导出已中断', 'warn')
      }
    }
  }

  /** 读取存档到文件（cfb save-dump，只读）。镜像 dump()，仅换命令/扩展名/文案。 */
  async function saveDump() {
    if (opRunning.value) return
    const exportDir = await chooseExportDirectory('选择存档导出文件夹')
    if (!exportDir) return
    opRunning.value = true
    opKind.value = 'saveDump'
    opResult.value = null
    progress.value = { done: 0, total: 0 }
    opLogs.value = []
    saveInfo.value = null
    _opAborted = false
    const taskId = taskProgress.startTask({ kind: 'saveDump', title: '读取存档', detail: cartInfo.value?.rom_title || '' })
    logStore.addLog('开始读取存档', 'warn')
    try {
      const title = (cartInfo.value?.rom_title || cartInfo.value?.game_name || 'save')
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
      const outPath = await join(exportDir, `${title}_save_${Date.now()}.sav`)
      let progId = null
      const fmt = (done, total) => {
        const dKb = (done / 1024).toFixed(0)
        const tKb = (total / 1024).toFixed(0)
        const pct = total ? Math.round((done / total) * 100) : 0
        return `读取存档 ${dKb} / ${tKb} KB (${pct}%)`
      }
      const { error } = await cfbClient.saveDump({ outputPath: outPath, mbc: mbcArgs(), type: saveType.value }, (ev) => {
        if (ev.type === 'progress') {
          progress.value = { done: ev.done, total: ev.total }
          taskProgress.updateProgress(taskId, ev.done, ev.total)
          if (ev.total > 0) {
            if (progId === null) progId = logStore.addLog(fmt(ev.done, ev.total))
            else logStore.updateLog(progId, fmt(ev.done, ev.total))
          }
        } else if (ev.type === 'save_info') saveInfo.value = ev
        else if (ev.type === 'log') {
          opLogs.value.push(ev.message)
          const raw = String(ev.message || '')
          if (absorbPhaseProgressLog(logStore, raw)) return
          logStore.addLog(stripLogElapsed(raw) || raw)
        }
        else if (ev.type === 'result') opResult.value = { ...ev, outPath }
        else if (ev.type === 'error') { opResult.value = { ok: false, error: ev.message }; logStore.addLog(ev.message, 'error') }
      }, (child) => { _opChild = child })
      if (_opAborted) opResult.value = { ok: false, error: '已中断', aborted: true }
      else if (error && !opResult.value) { opResult.value = { ok: false, error }; logStore.addLog(error, 'error') }
    } catch (e) {
      if (_opAborted) opResult.value = { ok: false, error: '已中断', aborted: true }
      else { const msg = String(e?.message || e); opResult.value = { ok: false, error: msg }; logStore.addLog(msg, 'error') }
    } finally {
      _opChild = null
      opRunning.value = false
      if (!opResult.value) {
        opResult.value = { ok: false, error: _opAborted ? '已中断' : '操作未返回结果', aborted: _opAborted }
        if (!_opAborted) logStore.addLog(opResult.value.error, 'error')
      }
      if (opResult.value?.ok) { taskProgress.completeTask(taskId); logStore.addLog('存档读取完成', 'success') }
      else if (opResult.value && !opResult.value.ok) {
        taskProgress.failTask(taskId, opResult.value.error)
        if (!opResult.value.aborted) toast.error(opResult.value.error || '存档读取失败')
      }
    }
  }

  /** 写入存档（cfb save-write，改 SRAM）。镜像 saveDump，加确认门。 */
  async function saveWrite() {
    const f = saveFile.value
    if (!f || opRunning.value) return

    if (!conn.isConnected) {
      const msg = conn.needsSelection ? t('conn.selectHint') : t('rom.hint.connect')
      toast.error(msg)
      logStore.addLog(msg, 'warn')
      if (conn.needsSelection || !conn.selectedPort) conn.openDialog()
      return
    }
    if (!flashInfo.value) {
      const msg = cartError.value || t('rom.op.identifyEmpty')
      toast.error(msg)
      logStore.addLog(msg, 'warn')
      return
    }

    opRunning.value = true
    opKind.value = 'saveWrite'
    opResult.value = null
    progress.value = { done: 0, total: 0 }
    opLogs.value = []
    saveInfo.value = null
    _opAborted = false
    const taskId = taskProgress.startTask({ kind: 'saveWrite', title: '写入存档', detail: f.name || '' })
    logStore.addLog(`开始写入存档 ${f.name}`, 'warn')
    try {
      let progId = null
      const fmt = (done, total) => {
        const dKb = (done / 1024).toFixed(0)
        const tKb = (total / 1024).toFixed(0)
        const pct = total ? Math.round((done / total) * 100) : 0
        return `写入存档 ${dKb} / ${tKb} KB (${pct}%)`
      }
      const { error } = await cfbClient.saveWrite({ savePath: f.path, mbc: mbcArgs(), type: saveType.value }, (ev) => {
        if (ev.type === 'progress') {
          progress.value = { done: ev.done, total: ev.total }
          taskProgress.updateProgress(taskId, ev.done, ev.total)
          if (ev.total > 0) {
            if (progId === null) progId = logStore.addLog(fmt(ev.done, ev.total))
            else logStore.updateLog(progId, fmt(ev.done, ev.total))
          }
        } else if (ev.type === 'save_info') saveInfo.value = ev
        else if (ev.type === 'log') {
          opLogs.value.push(ev.message)
          const raw = String(ev.message || '')
          if (absorbPhaseProgressLog(logStore, raw)) return
          logStore.addLog(stripLogElapsed(raw) || raw)
        }
        else if (ev.type === 'result') opResult.value = { ...ev }
        else if (ev.type === 'error') { opResult.value = { ok: false, error: ev.message }; logStore.addLog(ev.message, 'error') }
      }, (child) => { _opChild = child })
      if (_opAborted) opResult.value = { ok: false, error: '已中断', aborted: true }
      else if (error && !opResult.value) { opResult.value = { ok: false, error }; logStore.addLog(error, 'error') }
    } catch (e) {
      if (_opAborted) opResult.value = { ok: false, error: '已中断', aborted: true }
      else { const msg = String(e?.message || e); opResult.value = { ok: false, error: msg }; logStore.addLog(msg, 'error') }
    } finally {
      _opChild = null
      opRunning.value = false
      if (!opResult.value) {
        opResult.value = { ok: false, error: _opAborted ? '已中断' : '操作未返回结果', aborted: _opAborted }
        if (!_opAborted) logStore.addLog(opResult.value.error, 'error')
      }
      if (opResult.value?.ok) { taskProgress.completeTask(taskId); logStore.addLog('存档写入完成', 'success') }
      else if (opResult.value && !opResult.value.ok) {
        taskProgress.failTask(taskId, opResult.value.error)
        if (!opResult.value.aborted) toast.error(opResult.value.error || '存档写入失败')
      }
    }
  }

  /** 校验存档（cfb save-verify，只读比对）。镜像 saveWrite，结果含 mismatch_bytes。 */
  async function saveVerify() {
    const f = saveFile.value
    if (opRunning.value) return
    if (!f) {
      const msg = t('rom.op.verifyNeedSave')
      toast.error(msg)
      logStore.addLog(msg, 'warn')
      return
    }

    if (!conn.isConnected) {
      const msg = conn.needsSelection ? t('conn.selectHint') : t('rom.hint.connect')
      toast.error(msg)
      logStore.addLog(msg, 'warn')
      if (conn.needsSelection || !conn.selectedPort) conn.openDialog()
      return
    }
    if (!flashInfo.value) {
      const msg = cartError.value || t('rom.op.identifyEmpty')
      toast.error(msg)
      logStore.addLog(msg, 'warn')
      return
    }

    opRunning.value = true
    opKind.value = 'saveVerify'
    opResult.value = null
    progress.value = { done: 0, total: 0 }
    opLogs.value = []
    saveInfo.value = null
    _opAborted = false
    const taskId = taskProgress.startTask({ kind: 'saveVerify', title: t('rom.op.verifyTitle'), detail: f.name || '' })
    logStore.addLog(t('rom.op.verifyStart', { name: f.name }), 'warn')
    toast.info(t('rom.op.verifyStart', { name: f.name }))
    try {
      let progId = null
      const fmt = (done, total) => {
        const dKb = (done / 1024).toFixed(0)
        const tKb = (total / 1024).toFixed(0)
        const pct = total ? Math.round((done / total) * 100) : 0
        return `${t('rom.op.verifyTitle')} ${dKb} / ${tKb} KB (${pct}%)`
      }
      const { error } = await cfbClient.saveVerify({ savePath: f.path, mbc: mbcArgs(), type: saveType.value }, (ev) => {
        if (ev.type === 'progress') {
          progress.value = { done: ev.done, total: ev.total }
          taskProgress.updateProgress(taskId, ev.done, ev.total)
          if (ev.total > 0) {
            if (progId === null) progId = logStore.addLog(fmt(ev.done, ev.total))
            else logStore.updateLog(progId, fmt(ev.done, ev.total))
          }
        } else if (ev.type === 'save_info') saveInfo.value = ev
        else if (ev.type === 'log') {
          opLogs.value.push(ev.message)
          const raw = String(ev.message || '')
          if (absorbPhaseProgressLog(logStore, raw)) return
          logStore.addLog(stripLogElapsed(raw) || raw)
        }
        else if (ev.type === 'result') opResult.value = { ...ev }
        else if (ev.type === 'error') { opResult.value = { ok: false, error: ev.message }; logStore.addLog(ev.message, 'error') }
      }, (child) => { _opChild = child })
      if (_opAborted) opResult.value = { ok: false, error: t('rom.op.verifyAbort'), aborted: true }
      else if (error && !opResult.value) { opResult.value = { ok: false, error }; logStore.addLog(error, 'error') }
    } catch (e) {
      if (_opAborted) opResult.value = { ok: false, error: t('rom.op.verifyAbort'), aborted: true }
      else { const msg = String(e?.message || e); opResult.value = { ok: false, error: msg }; logStore.addLog(msg, 'error') }
    } finally {
      _opChild = null
      opRunning.value = false
      if (!opResult.value) {
        opResult.value = { ok: false, error: _opAborted ? t('rom.op.verifyAbort') : t('rom.op.verifyNoResult'), aborted: _opAborted }
        if (!_opAborted) logStore.addLog(opResult.value.error, 'error')
      }
      if (opResult.value?.ok) {
        taskProgress.completeTask(taskId)
        const mismatch = Number(opResult.value.mismatch_bytes) || 0
        if (mismatch > 0) {
          const msg = t('rom.op.verifyMismatch', { n: mismatch })
          logStore.addLog(msg, 'warn')
          toast.error(msg)
        } else {
          const msg = t('rom.op.verifyOk')
          logStore.addLog(msg, 'success')
          toast.success(msg)
        }
      } else if (opResult.value && !opResult.value.ok) {
        taskProgress.failTask(taskId, opResult.value.error)
        if (!opResult.value.aborted) toast.error(opResult.value.error || t('rom.op.verifyFail'))
        else toast.info(t('rom.op.verifyAbort'))
      }
    }
  }

  /** 擦除存档（cfb save-erase，填 0xFF）。危险操作，走确认门。 */
  async function saveErase() {
    if (opRunning.value) return
    opRunning.value = true
    opKind.value = 'saveErase'
    opResult.value = null
    progress.value = { done: 0, total: 0 }
    opLogs.value = []
    saveInfo.value = null
    _opAborted = false
    const taskId = taskProgress.startTask({ kind: 'saveErase', title: '擦除存档', detail: cartInfo.value?.rom_title || '' })
    logStore.addLog('开始擦除存档', 'warn')
    try {
      let progId = null
      const fmt = (done, total) => {
        const dKb = (done / 1024).toFixed(0)
        const tKb = (total / 1024).toFixed(0)
        const pct = total ? Math.round((done / total) * 100) : 0
        return `擦除存档 ${dKb} / ${tKb} KB (${pct}%)`
      }
      const isEeprom = saveType.value === 'eeprom4k' || saveType.value === 'eeprom64k'
      const len = isEeprom ? undefined : (cartInfo.value?.save_size_bytes || undefined)
      const { error } = await cfbClient.saveErase({ mbc: mbcArgs(), type: saveType.value, len }, (ev) => {
        if (ev.type === 'progress') {
          progress.value = { done: ev.done, total: ev.total }
          taskProgress.updateProgress(taskId, ev.done, ev.total)
          if (ev.total > 0) {
            if (progId === null) progId = logStore.addLog(fmt(ev.done, ev.total))
            else logStore.updateLog(progId, fmt(ev.done, ev.total))
          }
        } else if (ev.type === 'save_info') saveInfo.value = ev
        else if (ev.type === 'log') {
          opLogs.value.push(ev.message)
          const raw = String(ev.message || '')
          if (absorbPhaseProgressLog(logStore, raw)) return
          logStore.addLog(stripLogElapsed(raw) || raw)
        }
        else if (ev.type === 'result') opResult.value = { ...ev }
        else if (ev.type === 'error') { opResult.value = { ok: false, error: ev.message }; logStore.addLog(ev.message, 'error') }
      }, (child) => { _opChild = child })
      if (_opAborted) opResult.value = { ok: false, error: '已中断', aborted: true }
      else if (error && !opResult.value) { opResult.value = { ok: false, error }; logStore.addLog(error, 'error') }
    } catch (e) {
      if (_opAborted) opResult.value = { ok: false, error: '已中断', aborted: true }
      else { const msg = String(e?.message || e); opResult.value = { ok: false, error: msg }; logStore.addLog(msg, 'error') }
    } finally {
      _opChild = null
      opRunning.value = false
      if (!opResult.value) {
        opResult.value = { ok: false, error: _opAborted ? '已中断' : '操作未返回结果', aborted: _opAborted }
        if (!_opAborted) logStore.addLog(opResult.value.error, 'error')
      }
      if (opResult.value?.ok) { taskProgress.completeTask(taskId); logStore.addLog('存档擦除完成', 'success') }
      else if (opResult.value && !opResult.value.ok) {
        taskProgress.failTask(taskId, opResult.value.error)
        if (!opResult.value.aborted) toast.error(opResult.value.error || '存档擦除失败')
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
    else if (k === 'saveWrite') saveWrite()
    else if (k === 'saveErase') saveErase()
  }

  let _connectReadTimer = null
  watch(
    () => conn.isConnected,
    (v) => {
      clearTimeout(_connectReadTimer)
      if (v) {
        // 防抖：避免窗口尺寸狂抖 / 端口赋值造成的连读
        _connectReadTimer = setTimeout(() => {
          if (conn.isConnected) readCart({ silent: true })
        }, 250)
      } else {
        cartInfo.value = null
        cartError.value = ''
      }
    },
  )
  // 用户手动切平台时再读；识别成功里的静默切平台用 _suppressPlatformRead 跳过，避免连打串口
  let _platformReadTimer = null
  watch(
    () => emu.currentPlatform,
    () => {
      if (_suppressPlatformRead) return
      clearTimeout(_platformReadTimer)
      _platformReadTimer = setTimeout(() => {
        if (_suppressPlatformRead) return
        if (conn.isConnected && !cartReading.value) readCart({ silent: true })
      }, 250)
    },
  )
  watch(preferMbc, (isMbc) => {
    if (isMbc && ['eeprom4k', 'eeprom64k', 'flash'].includes(saveType.value)) {
      saveType.value = 'sram'
    }
  })
  // 展开 ROM / 切到 ROM 页不自动读卡；仅手动点「识别」才刷新

  return {
    romFile,
    saveFile,
    saveType,
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
    saveInfo,
    readCart,
    readRtc,
    readRomFileInfo,
    pickRomFile,
    pickSaveFile,
    loadTestRom,
    burnAndIdentify,
    burn,
    dump,
    erase,
    saveDump,
    saveWrite,
    saveVerify,
    saveErase,
    abortOp,
    requestConfirm,
    cancelConfirm,
    doConfirmed,
    TESTROM_FILES,
  }
})

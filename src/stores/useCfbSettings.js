import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { applyLocalePreference, getLocalePreference } from '../i18n'

const STORAGE_KEY = 'chis.cfb.settings.v1'

const inTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

function loadSettings() {
  if (typeof localStorage === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveSettings(value) {
  if (typeof localStorage === 'undefined') return
  // 路径只进本机 localStorage，绝不写入仓库内可提交文件。
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

function cleanPort(port) {
  const s = String(port || '').trim()
  return s || ''
}

export const useCfbSettings = defineStore('cfbSettings', () => {
  const saved = loadSettings()

  const preferredPort = ref(cleanPort(saved.preferredPort))
  // 与 vue-i18n 共用偏好
  const language = ref(saved.language || getLocalePreference() || 'auto')
  const voltageAuto = ref(saved.voltageAuto ?? (saved.voltage ? saved.voltage === 'auto' : true))
  const manualVoltage = ref(
    ['3.3V', '5V'].includes(saved.manualVoltage)
      ? saved.manualVoltage
      : ['3.3V', '5V'].includes(saved.voltage) ? saved.voltage : '3.3V',
  )
  const voltage = computed(() => (voltageAuto.value ? 'auto' : manualVoltage.value))
  const chipErase = ref(saved.chipErase === true)
  // PPB 解锁是烧录前自动校验的一部分，不再暴露为用户选项。
  // 固定为 true，同时把旧版曾关闭的持久配置迁移回安全默认值。
  const unlockPpb = ref(true)
  const verifyAfter = ref(saved.verifyAfter !== false)
  /**
   * cfb 可执行文件路径，或包含平台 sidecar 的 bins 目录。
   * 注意：旧键 `cfbSourceDir` 曾指向源码树，绝不能直接当作可执行文件展示/持久化；
   * 若仅有旧键则留空，由 ensurePathsReady 探测真实 exe（或 resolve 纠正）。
   */
  const cfbBinPath = ref(String(saved.cfbBinPath || '').trim())
  /**
   * 已解压的 rule 数据目录（含 profiles）。预编译 cfb 通常已内嵌 rule，此项可选展示/备用。
   * 兼容旧键 `ruleSourceDir`。
   */
  const ruleDataDir = ref(String(saved.ruleDataDir || saved.ruleSourceDir || '').trim())

  /** 已解析二进制实际报告的版本（`cfb version`）；仅展示用，运行时状态，不持久化。 */
  const activeCfbVersion = ref('')
  const toolchainReady = computed(() => !!cfbBinPath.value && !!activeCfbVersion.value)
  function setActiveCfbVersion(v) {
    activeCfbVersion.value = String(v || '').trim()
  }

  let pathsReadyPromise = null

  /**
   * 规范化已持久化的 cfb 路径：源码根/bins 目录 → 实际可执行文件；无效则清空以便重新探测。
   */
  async function normalizeCfbBinPath() {
    const raw = String(cfbBinPath.value || '').trim()
    if (!raw) return
    try {
      const resolved = await invoke('resolve_cfb_binary', { cfbPath: raw })
      const next = String(resolved || '').trim()
      if (next && next !== raw) cfbBinPath.value = next
    } catch {
      // 目录当 exe、未构建等：清空后走 bootstrap 重新探测。
      cfbBinPath.value = ''
    }
  }

  /**
   * 自动填充 / 纠正工具链路径：debug 探测本机已构建二进制；release 下载到 app data。
   * 会纠正「把源码根写进可执行文件」的旧持久化值。构建脚本用的源码路径由 Rust 写 local-paths.json。
   */
  function ensurePathsReady() {
    if (!inTauri) return Promise.resolve()
    if (pathsReadyPromise) return pathsReadyPromise
    pathsReadyPromise = (async () => {
      try {
        await normalizeCfbBinPath()
        if (cfbBinPath.value && ruleDataDir.value) return
        const result = await invoke('bootstrap_toolchain_paths')
        if (result?.cfbBin && !cfbBinPath.value) cfbBinPath.value = String(result.cfbBin)
        if (result?.ruleDir && !ruleDataDir.value) ruleDataDir.value = String(result.ruleDir)
      } catch (err) {
        // ACL / 网络失败：保持空路径，运行时回退 sidecar。
        console.warn('[cfbSettings] bootstrap_toolchain_paths failed:', err)
        pathsReadyPromise = null
      }
    })()
    return pathsReadyPromise
  }

  // 启动即尝试填充（App / Settings / 烧录门禁也会 await）。
  ensurePathsReady()

  applyLocalePreference(language.value)
  watch(language, (pref) => {
    applyLocalePreference(pref)
  })

  watch(
    () => ({
      preferredPort: preferredPort.value,
      language: language.value,
      voltage: voltage.value,
      voltageAuto: voltageAuto.value,
      manualVoltage: manualVoltage.value,
      chipErase: chipErase.value,
      unlockPpb: unlockPpb.value,
      verifyAfter: verifyAfter.value,
      cfbBinPath: cfbBinPath.value,
      ruleDataDir: ruleDataDir.value,
    }),
    (value) => {
      saveSettings(value)
    },
    { deep: true },
  )

  function setPreferredPort(port) {
    preferredPort.value = cleanPort(port)
  }

  function clearPreferredPort() {
    preferredPort.value = ''
  }

  function withGlobalArgs(args) {
    if (!language.value || language.value === 'auto') return [...args]
    const lang = language.value === 'zh-CN' ? 'zh' : language.value
    return ['--lang', lang, ...args]
  }

  function withPortArgs(args) {
    const out = [...args]
    if (preferredPort.value && !out.includes('--port')) {
      out.push('--port', preferredPort.value)
    }
    return out
  }

  function withBurnArgs(args) {
    const out = withPortArgs(args)
    if (chipErase.value) out.push('--chip-erase')
    if (!verifyAfter.value) out.push('--no-verify')
    return out
  }

  return {
    preferredPort,
    language,
    voltage,
    voltageAuto,
    manualVoltage,
    chipErase,
    unlockPpb,
    verifyAfter,
    cfbBinPath,
    ruleDataDir,
    activeCfbVersion,
    toolchainReady,
    setActiveCfbVersion,
    ensurePathsReady,
    setPreferredPort,
    clearPreferredPort,
    withGlobalArgs,
    withPortArgs,
    withBurnArgs,
  }
})

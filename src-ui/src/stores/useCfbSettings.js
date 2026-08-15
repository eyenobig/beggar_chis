import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { applyLocalePreference, getLocalePreference } from '../i18n'
import { ensureCfbPaths, resolveCfbBinary, installDir } from '../services/toolchain'
import { getLocalPaths, getLocalSettings, patchLocalConfig } from '../services/localConfig'

const inTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

function cleanPort(port) {
  const s = String(port || '').trim()
  return s || ''
}

export const useCfbSettings = defineStore('cfbSettings', () => {
  const saved = getLocalSettings()
  const savedPaths = getLocalPaths()

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
  /** SkyEmu 下热敏纸（刀口+纸面）；关闭后改用底部 banner，toast 仍可见 */
  const thermalPaper = ref(saved.thermalPaper !== false)
  /** 主栏上方卡带舞台；关闭后不占窗口顶部，识别结果仍保留 */
  const cartridgeStage = ref(saved.cartridgeStage !== false)
  /** Logs 打开时的卡带贴纸架；可单独关闭 */
  const cartridgeStickers = ref(saved.cartridgeStickers !== false)
  /**
   * cfb 可执行文件路径，或包含平台 sidecar 的 bins 目录。
   * 注意：旧键 `cfbSourceDir` 曾指向源码树，绝不能直接当作可执行文件展示/持久化；
   * 若仅有旧键则留空，由 ensurePathsReady 探测真实 exe（或 resolve 纠正）。
   */
  const cfbBinPath = ref(String(savedPaths.cfbBinPath || '').trim())
  /**
   * 已解压的 rule 数据目录（含 profiles）。预编译 cfb 通常已内嵌 rule，此项可选展示/备用。
   * 兼容旧键 `ruleSourceDir`。
   */
  const ruleDataDir = ref(String(savedPaths.ruleDataDir || '').trim())

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
      const resolved = await resolveCfbBinary(raw)
      const next = String(resolved || '').trim()
      if (next && next !== raw) cfbBinPath.value = next
    } catch {
      // 目录当 exe、未构建等：清空后走 bootstrap 重新探测。
      cfbBinPath.value = ''
    }
  }

  /**
   * 自动填充 / 纠正工具链路径：debug 探测本机已构建二进制；release 优先用安装器写入的
   * paths.json（安装向导里用户选的），其次 GitHub 下载，最后打包 sidecar。
   * 关键：安装器路径优先于 localStorage 历史记录——避免升级安装后仍用过期的旧路径。
   */
  function ensurePathsReady() {
    if (!inTauri) return Promise.resolve()
    if (pathsReadyPromise) return pathsReadyPromise
    pathsReadyPromise = (async () => {
      try {
        await normalizeCfbBinPath()
        const result = await ensureCfbPaths()
        // 安装器写入的路径（cfb 在 app 安装目录内）始终优先，覆盖过期 localStorage 历史值。
        const installerCfb = result?.cfbBin && await isInstallerPath(String(result.cfbBin))
        if (result?.cfbBin && (installerCfb || !cfbBinPath.value)) {
          cfbBinPath.value = String(result.cfbBin)
        }
        if (result?.ruleDir && (installerCfb || !ruleDataDir.value)) {
          ruleDataDir.value = String(result.ruleDir)
        }
      } catch (err) {
        // ACL / 网络失败：保持空路径，运行时回退 sidecar。
        console.warn('[cfbSettings] ensureCfbPaths failed:', err)
        pathsReadyPromise = null
      }
    })()
    return pathsReadyPromise
  }

  /** 路径是否在 app 安装目录（主 exe 父目录）内 → 判定为安装器写入。 */
  async function isInstallerPath(path) {
    try {
      const dir = await installDir()
      if (!dir) return false
      const norm = (s) => String(s || '').toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '')
      return norm(path).startsWith(norm(dir))
    } catch {
      return false
    }
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
      thermalPaper: thermalPaper.value,
      cartridgeStage: cartridgeStage.value,
      cartridgeStickers: cartridgeStickers.value,
    }),
    (value) => {
      // 路径 / 设置分区写入统一文档；绝不写入仓库内可提交文件。
      patchLocalConfig('settings', value)
    },
    { deep: true },
  )

  watch(
    () => ({
      cfbBinPath: cfbBinPath.value,
      ruleDataDir: ruleDataDir.value,
    }),
    (value) => {
      patchLocalConfig('paths', value)
    },
  )

  function setPreferredPort(port) {
    preferredPort.value = cleanPort(port)
  }

  function clearPreferredPort() {
    preferredPort.value = ''
  }

  function withGlobalArgs(args) {
    if (!language.value || language.value === 'auto') return [...args]
    // cfb 语言码：zh-CN|en|ja|ko|fr|de|es|pt-BR。
    // zh-CN 原样传（旧映射 'zh' 非法、靠回落侥幸工作）；ru 无 cfb 包 → 回退 en。
    const lang = language.value === 'ru' ? 'en' : language.value
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
    thermalPaper,
    cartridgeStage,
    cartridgeStickers,
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

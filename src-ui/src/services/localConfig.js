/**
 * 本机持久化单一真相源（与仓库根 `local-paths.json` 同分区风格）。
 *
 * 磁盘 `local-paths.json`：仅构建用源码路径（paths.cfbSourceDir / ruleSourceDir），
 * 由 ensure:cfb / Rust debug 读写；勿把运行时状态写进该文件。
 *
 * 本模块：运行时 paths / settings / cache / locale → 一个 localStorage 文档。
 *
 * Schema（chis.local.v1）:
 * {
 *   version: 1,
 *   paths: { cfbBinPath, ruleDataDir, skyEmuPath },
 *   settings: { preferredPort, language, voltage*, chipErase, verifyAfter,
 *               thermalPaper, cartridgeStage, cartridgeStickers },
 *   cache: { cartridges: [] },
 *   locale: { pref, resolved }
 * }
 */

export const LOCAL_CONFIG_KEY = 'chis.local.v1'
export const LOCAL_CONFIG_VERSION = 1

/** 旧键：首次读时迁入新结构后清除 */
const LEGACY_KEYS = Object.freeze({
  settings: 'chis.cfb.settings.v1',
  cartridgesV2: 'chis.cartridges.v2',
  cartridgesV1: 'chis.cartridges.v1',
  skyEmuPath: 'chis.skyemu.path.v1',
  localePref: 'app-locale-pref',
  localeResolved: 'app-locale',
})

function emptyConfig() {
  return {
    version: LOCAL_CONFIG_VERSION,
    paths: {
      cfbBinPath: '',
      ruleDataDir: '',
      skyEmuPath: '',
    },
    settings: {
      preferredPort: '',
      language: 'auto',
      voltageAuto: true,
      manualVoltage: '3.3V',
      voltage: 'auto',
      chipErase: false,
      unlockPpb: true,
      verifyAfter: true,
      thermalPaper: true,
      cartridgeStage: true,
      cartridgeStickers: true,
    },
    cache: {
      cartridges: [],
    },
    locale: {
      pref: 'auto',
      resolved: '',
    },
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function readLegacy(key) {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function migrateFromLegacy() {
  const next = emptyConfig()
  let hit = false

  const settingsRaw = readLegacy(LEGACY_KEYS.settings)
  if (settingsRaw) {
    const saved = safeParse(settingsRaw)
    if (saved && typeof saved === 'object') {
      hit = true
      if (saved.cfbBinPath != null) next.paths.cfbBinPath = String(saved.cfbBinPath || '').trim()
      const rule = saved.ruleDataDir || saved.ruleSourceDir
      if (rule != null) next.paths.ruleDataDir = String(rule || '').trim()
      for (const key of Object.keys(next.settings)) {
        if (saved[key] !== undefined) next.settings[key] = saved[key]
      }
      if (saved.language) next.locale.pref = saved.language
    }
  }

  const sky = readLegacy(LEGACY_KEYS.skyEmuPath)
  if (sky != null && String(sky).trim()) {
    hit = true
    next.paths.skyEmuPath = String(sky).trim()
  }

  const cartsRaw = readLegacy(LEGACY_KEYS.cartridgesV2) || readLegacy(LEGACY_KEYS.cartridgesV1)
  if (cartsRaw) {
    const carts = safeParse(cartsRaw)
    if (Array.isArray(carts)) {
      hit = true
      next.cache.cartridges = carts
    }
  }

  const pref = readLegacy(LEGACY_KEYS.localePref)
  const resolved = readLegacy(LEGACY_KEYS.localeResolved)
  if (pref != null || resolved != null) {
    hit = true
    if (pref != null) next.locale.pref = pref
    if (resolved != null) next.locale.resolved = resolved
    if (!next.settings.language || next.settings.language === 'auto') {
      next.settings.language = pref || 'auto'
    }
  }

  return hit ? next : null
}

function clearLegacyKeys() {
  if (typeof localStorage === 'undefined') return
  for (const key of Object.values(LEGACY_KEYS)) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}

function normalize(doc) {
  const base = emptyConfig()
  if (!doc || typeof doc !== 'object') return base
  return {
    version: LOCAL_CONFIG_VERSION,
    paths: { ...base.paths, ...(doc.paths || {}) },
    settings: { ...base.settings, ...(doc.settings || {}) },
    cache: {
      cartridges: Array.isArray(doc.cache?.cartridges) ? doc.cache.cartridges : [],
    },
    locale: { ...base.locale, ...(doc.locale || {}) },
  }
}

/** 内存缓存，避免每个 store 重复 parse；写入后同步更新 */
let cached = null

/**
 * 读取完整本地配置（含旧键一次性迁移）。
 * @returns {ReturnType<typeof emptyConfig>}
 */
export function loadLocalConfig() {
  if (cached) return cached
  if (typeof localStorage === 'undefined') {
    cached = emptyConfig()
    return cached
  }

  try {
    const raw = localStorage.getItem(LOCAL_CONFIG_KEY)
    if (raw) {
      const parsed = safeParse(raw)
      if (parsed && typeof parsed === 'object') {
        cached = normalize(parsed)
        return cached
      }
    }
  } catch {
    /* fall through to migrate */
  }

  const migrated = migrateFromLegacy()
  if (migrated) {
    cached = normalize(migrated)
    saveLocalConfig(cached)
    clearLegacyKeys()
    return cached
  }

  cached = emptyConfig()
  return cached
}

/**
 * 整文档写回。调用方应传入完整对象（或先 load 再改）。
 * @param {ReturnType<typeof emptyConfig>} value
 */
export function saveLocalConfig(value) {
  cached = normalize(value)
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(cached))
  } catch {
    /* quota / private mode */
  }
}

/** 浅合并某一分区并保存 */
export function patchLocalConfig(section, patch) {
  const doc = loadLocalConfig()
  if (section === 'cache' && patch && Array.isArray(patch.cartridges)) {
    doc.cache = { cartridges: patch.cartridges }
  } else if (doc[section] && patch && typeof patch === 'object') {
    doc[section] = { ...doc[section], ...patch }
  }
  saveLocalConfig(doc)
  return doc
}

export function getLocalPaths() {
  return loadLocalConfig().paths
}

export function getLocalSettings() {
  return loadLocalConfig().settings
}

export function getLocalCache() {
  return loadLocalConfig().cache
}

export function getLocalLocale() {
  return loadLocalConfig().locale
}

/** 测试或清空缓存后重置内存态 */
export function resetLocalConfigMemory() {
  cached = null
}

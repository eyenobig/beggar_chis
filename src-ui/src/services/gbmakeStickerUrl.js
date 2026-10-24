/**
 * GBMake 单贴纸页深链约定（与 storefront / chis 客户端共用）。
 *
 * 页面：https://www.gbmake.com/{locale}/pages/cartridge-sticker/single
 *
 * Query（参数堆）：
 * | 键        | 含义 |
 * |-----------|------|
 * | product   | 商品 handle，默认 custom-sticker-single |
 * | sticker   | FlashSticker id（打开已有贴纸） |
 * | config    | 编辑器配置 JSON URL |
 * | mode      | 设备：gb | gba |
 * | romId     | FlashRom id |
 * | serial    | 序列号 / game code |
 * | title     | ROM 标题 |
 * | refKey    | FlashRom.refKey |
 * | region    | 区域码 |
 * | revision  | 修订号 |
 */

import { gameCodeOf, romTitleOf } from '../components/drawer/logs/rom/romFields'

// 烧录器是本地工具：dev/prod（打包发布）区分 storefront 地址。
//   dev  → 本地 storefront（localhost:8000），与本地 Payload/Medusa 一致，便于测试跳转。
//   prod → 公网 storefront（www.gbmake.com）。
const STOREFRONT_ORIGIN = import.meta.env.DEV
  ? 'http://localhost:8000'
  : 'https://www.gbmake.com'
export const GBMAKE_SINGLE_STICKER = `${STOREFRONT_ORIGIN}/us/pages/cartridge-sticker/single`
export const GBMAKE_STICKER_PRODUCT = 'custom-sticker-single'

/** @typedef {{ product?: string, sticker?: string, config?: string, mode?: string, romId?: string, serial?: string, title?: string, refKey?: string, region?: string, revision?: string }} GbmakeStickerParams */

/**
 * @param {unknown} rom
 * @param {unknown} [sticker]
 * @returns {'gb' | 'gba'}
 */
export function resolveStickerMode(rom, sticker) {
  const mode = String(sticker?.editorData?.mode || '').toLowerCase()
  if (mode === 'gba' || mode === 'advance') return 'gba'
  if (mode === 'gb' || mode === 'gbc' || mode === 'dmg' || mode === 'color') return 'gb'
  const ref = String(rom?.refKey || '').toLowerCase()
  if (ref.startsWith('gba__')) return 'gba'
  if (ref.startsWith('gb__') || ref.startsWith('gbc__')) return 'gb'
  return rom?.kind === 'gba' ? 'gba' : 'gb'
}

function pickConfigUrl(sticker) {
  if (!sticker || typeof sticker !== 'object') return ''
  const candidates = [
    sticker.configUrl,
    sticker.config,
    sticker.editorConfigUrl,
    sticker.sticker_config_url,
    sticker.editorData?.configUrl,
    sticker.editorData?.config,
  ]
  for (const raw of candidates) {
    const url = String(raw || '').trim()
    if (/^https?:\/\//i.test(url)) return url
  }
  return ''
}

/**
 * 组装单贴纸页 query 参数堆。
 * @param {{ rom?: object | null, sticker?: object | null, cartInfo?: object | null, product?: string }} [opts]
 * @returns {GbmakeStickerParams}
 */
export function buildGbmakeStickerParams(opts = {}) {
  const { rom = null, sticker = null, cartInfo = null, product = GBMAKE_STICKER_PRODUCT } = opts
  /** @type {GbmakeStickerParams} */
  const params = {
    product: product || GBMAKE_STICKER_PRODUCT,
    mode: resolveStickerMode(rom, sticker),
  }

  if (sticker?.id != null && String(sticker.id)) {
    params.sticker = String(sticker.id)
  }

  const config = pickConfigUrl(sticker)
  if (config) params.config = config

  if (rom?.id != null && String(rom.id)) params.romId = String(rom.id)

  const serial = String(rom?.serialCode || gameCodeOf(cartInfo) || '').trim()
  if (serial) params.serial = serial

  const title = String(rom?.title || romTitleOf(cartInfo) || '').trim()
  if (title) params.title = title

  if (rom?.refKey) params.refKey = String(rom.refKey)

  const region = String(rom?.region || '').trim()
  if (region) params.region = region

  const revision = String(rom?.revision ?? cartInfo?.revision ?? '').trim()
  if (revision) params.revision = revision

  return params
}

/**
 * @param {GbmakeStickerParams | URLSearchParams | string | Record<string, string>} params
 * @returns {URLSearchParams}
 */
export function toGbmakeSearchParams(params) {
  if (params instanceof URLSearchParams) return params
  const out = new URLSearchParams()
  const entries = typeof params === 'string'
    ? new URLSearchParams(params).entries()
    : Object.entries(params || {})
  for (const [key, value] of entries) {
    if (value == null || value === '') continue
    out.set(key, String(value))
  }
  return out
}

/**
 * 从 URL / search 解析参数堆（与 build 对称，供落地页或调试用）。
 * @param {string | URL | URLSearchParams | Location} [input]
 * @returns {GbmakeStickerParams}
 */
export function parseGbmakeStickerParams(input) {
  let search = ''
  if (!input) {
    search = typeof window !== 'undefined' ? window.location.search : ''
  } else if (typeof input === 'string') {
    search = input.includes('?') ? input.slice(input.indexOf('?') + 1) : input
  } else if (input instanceof URLSearchParams) {
    search = input.toString()
  } else if (typeof URL !== 'undefined' && input instanceof URL) {
    search = input.searchParams.toString()
  } else if (input && typeof input === 'object' && 'search' in input) {
    search = String(input.search || '').replace(/^\?/, '')
  }

  const sp = new URLSearchParams(search)
  /** @type {GbmakeStickerParams} */
  const out = {}
  for (const key of ['product', 'sticker', 'config', 'mode', 'romId', 'serial', 'title', 'refKey', 'region', 'revision']) {
    const v = sp.get(key)
    if (v) out[key] = v
  }
  return out
}

/**
 * @param {{ rom?: object | null, sticker?: object | null, cartInfo?: object | null, product?: string, baseUrl?: string }} [opts]
 */
export function buildGbmakeStickerUrl(opts = {}) {
  const base = opts.baseUrl || GBMAKE_SINGLE_STICKER
  const params = toGbmakeSearchParams(buildGbmakeStickerParams(opts))
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

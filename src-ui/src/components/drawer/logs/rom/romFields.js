/** 将 cfb info / rom-info 结果整理为 UI 字段（不含 RTC）。 */
import { i18n } from '../../../../i18n'

function t(key, params) {
  return i18n.global.t(key, params)
}

/**
 * ROM 头标题。优先 `rom_title`（头内 ASCII）；`game_name` 可能是数据库友好名，勿混用。
 * @param {Record<string, unknown> | null | undefined} info
 * @returns {string}
 */
export function romTitleOf(info) {
  if (!info) return ''
  const t = info.rom_title != null && info.rom_title !== '' ? info.rom_title : info.game_name
  if (t == null || t === '') return ''
  return String(t).trim()
}

/**
 * GBA GameCode（头 0xAC..0xAF）或 GB/GBC 的代号（db_DMG 的 `DMG-APAE` / 标题拆出的 4 字母）。
 * 旧版 sidecar 曾误把 maptype（如 MBC3）写入 game_code，需丢弃。
 * @param {Record<string, unknown> | null | undefined} info
 * @returns {string}
 */
export function gameCodeOf(info) {
  if (!info) return ''
  const raw = info.game_code ?? info.gameCode
  if (raw == null || raw === '') return ''
  let code = String(raw).trim()
  if (!code) return ''

  // 旧 sidecar 把 mbc_name 塞进了 game_code
  if (/^(MBC\d|ROM ONLY|MMM01|Unknown)$/i.test(code)) return ''

  // 已是 DMG-/CGB-/AGB- 产品码
  if (/^(DMG|CGB|AGB)-[A-Z0-9]{4}$/i.test(code)) return code.toUpperCase()

  // 兼容已带 AGB- 前缀 / 嵌入 revision 的值
  const pref = code.match(/^(AGB|DMG|CGB)-([A-Z0-9]{4})(?:-\d+)?$/i)
  if (pref) return `${pref[1].toUpperCase()}-${pref[2].toUpperCase()}`

  code = code.toUpperCase()
  if (/^[A-Z0-9]{4}$/.test(code)) return code
  return code
}

/**
 * 「Game Code and Revision」展示值。
 * - GBA：AGB-XXXX-N（对齐 flashGBX）
 * - GB/GBC：优先库内完整码 DMG-APAE-N；否则 4 字母-N
 * @param {Record<string, unknown> | null | undefined} info
 * @returns {string}
 */
export function codeRevOf(info) {
  const code = gameCodeOf(info)
  if (!code) return '—'
  const rev = info?.revision != null && info.revision !== '' ? Number(info.revision) : null
  const revStr = Number.isFinite(rev) ? String(rev) : '0'

  if (/^(DMG|CGB|AGB)-[A-Z0-9]{4}$/i.test(code)) {
    return `${code}-${revStr}`
  }
  if (info?.kind === 'gba' || (info?.kind !== 'gb_mbc' && /^[A-Z0-9]{4}$/.test(code))) {
    return `AGB-${code}-${revStr}`
  }
  // GB/GBC：仅有 4 字母（标题拆出）时不加 DMG- 前缀，对齐 flashGBX
  if (info?.kind === 'gb_mbc') {
    return `${code}-${revStr}`
  }
  return `${code}-${revStr}`
}

/**
 * GB/GBC 卡带类型（头 0x147 maptype，JSON 字段 `cartridge_type`/`mbc_name`）。
 * @param {Record<string, unknown> | null | undefined} info
 * @returns {string}
 */
export function cartTypeOf(info) {
  if (!info) return ''
  const name = info.mbc_name
  const raw = info.cartridge_type
  const hex = raw != null && raw !== ''
    ? `0x${Number(raw).toString(16).toUpperCase().padStart(2, '0')}`
    : null
  if (name && hex) return `${name} (${hex})`
  return name || hex || ''
}

/**
 * @param {Record<string, unknown> | null | undefined} info
 * @returns {{
 *   gameName: string
 *   romTitle: string
 *   codeRev: string
 *   cartType: string
 *   headerChecksum: string
 *   headerOk: boolean | null
 *   kind: string | undefined
 *   hasGame: boolean
 *   emptyReason: string | null
 * } | null}
 */
export function buildRomFields(info) {
  if (!info) return null
  const title = romTitleOf(info)
  const friendly =
    info.game_name != null && String(info.game_name).trim() !== ''
      ? String(info.game_name).trim()
      : title
  const code = gameCodeOf(info)
  const hasGame = !!(title || code || friendly)
  const present = info.present === true || info.capacity_bytes > 0
  if (!hasGame && !present) return null

  const cs = info.rom_checksum
  let headerChecksum = '—'
  let headerOk = null
  if (cs && typeof cs === 'object') {
    headerOk = !!cs.ok
    const stored = `0x${Number(cs.stored).toString(16).toUpperCase().padStart(2, '0')}`
    headerChecksum = cs.ok
      ? t('rom.checksumValid', { stored })
      : t('rom.checksumInvalid', {
          stored,
          computed: `0x${Number(cs.computed).toString(16).toUpperCase().padStart(2, '0')}`,
        })
  }

  let emptyReason = null
  if (!hasGame) {
    emptyReason = info.kind === 'unknown'
      ? t('rom.emptyBlank')
      : t('rom.emptyNoHeader')
  }

  return {
    gameName: hasGame ? friendly || '—' : emptyReason,
    romTitle: hasGame ? (title || '—') : '—',
    // 始终走 codeRevOf：有 cfb `game_code`+`revision` 时显示 DMG-APAE-0 / AAUE-0 / AGB-BPEE-0
    codeRev: hasGame ? codeRevOf(info) : '—',
    cartType: hasGame ? (cartTypeOf(info) || '—') : '—',
    headerChecksum,
    headerOk,
    kind: info.kind,
    hasGame,
    emptyReason,
  }
}

export function kindLabel(kind) {
  if (kind === 'gba') return 'GBA'
  if (kind === 'gb_mbc') return 'GB/GBC'
  return kind || null
}

/**
 * FlashGBX 风格字段行：Game Name / ROM Title / Code+Rev。
 * Cartridge Type 不展示（cmd 仍可能下发字段，仅 UI 隐藏）。
 * 无卡带/未连接时仍返回同结构空行（标题 + — / 状态文案），避免折叠成单行提示。
 * @param {{ gameName: string, romTitle: string, codeRev: string, kind?: string, hasGame?: boolean, emptyReason?: string | null } | null} d
 * @param {(key: string) => string} t i18n t('rom.field.*')
 * @param {{ placeholder?: string | null }} [opts]
 * @returns {{ label: string, value: string, mono?: boolean }[]}
 */
export function romDisplayRows(d, t, opts = {}) {
  const placeholder = opts.placeholder || null
  if (!d) {
    return [
      { label: t('rom.field.gameName'), value: placeholder || '—' },
      { label: t('rom.field.romTitle'), value: '—', mono: true },
      { label: t('rom.field.codeRev'), value: '—', mono: true },
    ]
  }
  if (d.hasGame === false) {
    return [
      { label: t('rom.field.gameName'), value: d.emptyReason || placeholder || '—' },
      { label: t('rom.field.romTitle'), value: '—', mono: true },
      { label: t('rom.field.codeRev'), value: '—', mono: true },
    ]
  }
  return [
    { label: t('rom.field.gameName'), value: d.gameName },
    { label: t('rom.field.romTitle'), value: d.romTitle, mono: true },
    // 始终展示 Game Code and Revision（有则 DMG-APAE-0 / AAUE-0，无则 —）
    { label: t('rom.field.codeRev'), value: d.codeRev || '—', mono: true },
  ]
}

/**
 * @param {Record<string, unknown> | null | undefined} rtc
 * @returns {string | null}
 */
export function formatRtcClock(rtc) {
  if (!rtc?.ok) return null
  if (rtc.kind === 'gba') {
    const p = (n, w = 2) => String(n).padStart(w, '0')
    const year = rtc.year >= 100 ? rtc.year : 2000 + (rtc.year || 0)
    return `${year}-${p(rtc.month)}-${p(rtc.date)} ${p(rtc.hour)}:${p(rtc.minute)}:${p(rtc.second)}`
  }
  if (rtc.kind === 'mbc3') {
    const p = (n) => String(n).padStart(2, '0')
    return `d${rtc.day_count} ${p(rtc.hour)}:${p(rtc.minute)}:${p(rtc.second)}`
  }
  return null
}

import { apiUrl, stickerApiUrl } from '../config/api'
import { apiFetch } from './http'
import { gameCodeOf, romTitleOf } from '../components/drawer/logs/rom/romFields'

const FETCH_MS = 12000
/** Payload 的 cartridgeImage 常为空；完整卡带 PNG 与贴纸同路径，仅目录为 rom-cartridges。 */
const R2_PUBLIC = 'https://pub-ffb1b55676a8415d85e91f9b53c96742.r2.dev'

function normalize(value) {
  return String(value || '').trim().toUpperCase()
}

/**
 * 解析卡带外壳图 URL。
 * 优先 API 字段；否则由贴纸图 / refKey 推导 R2 上的 rom-cartridges 资源。
 */
export function resolveCartridgeImage(rom) {
  const raw = rom?.cartridgeImage
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (raw && typeof raw === 'object') {
    const url = raw.url || raw.src || ''
    if (url) return String(url).trim()
  }

  const stickers = approvedStickersOf(rom)
  for (const sticker of stickers) {
    const img = sticker?.image
    if (typeof img === 'string' && img.includes('/rom-labels/')) {
      return img.replace('/rom-labels/', '/rom-cartridges/')
    }
  }

  const parts = String(rom?.refKey || '').split('__').filter(Boolean)
  if (parts.length >= 2) {
    const [platform, game, ...rest] = parts
    const variant = rest.join('__')
    const file = variant ? `${game}__${variant}` : game
    return `${R2_PUBLIC}/rom-cartridges/${platform}/${game}/${file}.png`
  }
  return ''
}

function enrichFlashRom(doc) {
  if (!doc || typeof doc !== 'object') return doc
  const cartridgeImage = resolveCartridgeImage(doc)
  if (!cartridgeImage || cartridgeImage === doc.cartridgeImage) return doc
  return { ...doc, cartridgeImage }
}

/** DMG-APAE / AGB-BPEE / APAE → 用于 like 查询的候选串 */
function serialQueryCandidates(code) {
  const raw = normalize(code)
  if (!raw) return []
  const out = [raw]
  const m = raw.match(/^(?:DMG|CGB|AGB)-([A-Z0-9]{4})(?:-.*)?$/)
  if (m) {
    out.push(m[1])
    out.push(`${raw.split('-').slice(0, 2).join('-')}`) // DMG-APAE
  } else if (/^[A-Z0-9]{4}$/.test(raw)) {
    out.push(`DMG-${raw}`, `CGB-${raw}`, `AGB-${raw}`)
  }
  return [...new Set(out)]
}

function docPlatform(doc) {
  const refKey = String(doc?.refKey || doc?.game?.refKey || '').toLowerCase()
  if (refKey.startsWith('gba__')) return 'gba'
  if (refKey.startsWith('gb__') || refKey.startsWith('gbc__')) return 'gb_mbc'

  const rawMachine = doc?.game?.machine
  const machine = Number(typeof rawMachine === 'object' ? rawMachine?.id : rawMachine)
  if ([5, 6, 7, 9].includes(machine)) return 'gba'
  if ([1, 2, 3, 4, 8].includes(machine)) return 'gb_mbc'
  return ''
}

export function flashRomMatchesPlatform(doc, info) {
  const expected = info?.kind === 'gba' ? 'gba' : info?.kind === 'gb_mbc' ? 'gb_mbc' : ''
  return !expected || docPlatform(doc) === expected
}

function serialLooseMatch(docSerial, code) {
  const a = normalize(docSerial)
  const b = normalize(code)
  if (!a || !b) return false
  if (a.includes(b) || b.includes(a)) return true
  const shortA = a.match(/[A-Z0-9]{4}/g) || []
  const shortB = b.match(/[A-Z0-9]{4}/g) || []
  return shortA.some((x) => shortB.includes(x))
}

/** 卡带头标题常无连字符（POKEMON RED），库内多为 Pokemon - Red Version… */
function titleTokens(value) {
  return normalize(value)
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function tokenSoftEq(a, b) {
  if (a === b) return true
  // 头内截断：POKEMON EMER ↔ EMERALD
  if (a.length >= 4 && b.startsWith(a)) return true
  if (b.length >= 4 && a.startsWith(b)) return true
  return false
}

/** 查询词在文档标题里按顺序、连续出现（允许单 token 前缀软匹配）。 */
function titleLooseMatch(query, docTitle) {
  const q = titleTokens(query)
  const d = titleTokens(docTitle)
  if (!q.length || !d.length) return false
  if (q.length > d.length) {
    // 查询更长时，允许文档标题整段被查询包含（罕见）
    return q.join(' ').includes(d.join(' '))
  }
  for (let i = 0; i <= d.length - q.length; i += 1) {
    if (q.every((tok, j) => tokenSoftEq(tok, d[i + j]))) return true
  }
  return false
}

function stickerCountOf(rom) {
  return approvedStickersOf(rom).length
}

function rankFlashDocs(docs, info) {
  const code = normalize(gameCodeOf(info))
  const title = normalize(romTitleOf(info))
  return [...docs].sort((a, b) => {
    const score = (doc) => {
      let s = 0
      if (code && serialLooseMatch(doc.serialCode, code)) s += 100
      const docTitle = doc.title || doc?.game?.name || ''
      if (title && titleLooseMatch(title, docTitle)) s += 40
      s += Math.min(stickerCountOf(doc), 5) * 3
      if (doc.cartridgeImage) s += 2
      return s
    }
    return score(b) - score(a)
  })
}

async function fetchJson(url, init = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS)
  try {
    const response = await apiFetch(url, { ...init, signal: ctrl.signal })
    return response
  } finally {
    clearTimeout(timer)
  }
}

async function queryFlashRoms(field, value) {
  const params = new URLSearchParams({ limit: '50', depth: '2' })
  params.set(`where[${field}][like]`, value)
  const response = await fetchJson(apiUrl(`/api/FlashRom?${params}`), { credentials: 'include' })
  if (!response.ok) throw new Error(`FlashRom API returned ${response.status}`)
  const body = await response.json()
  return Array.isArray(body?.docs) ? body.docs : []
}

/** 单次查询失败时返回 []，避免配图 API 挂掉时整条识别展示链路被 catch 清掉。 */
async function queryFlashRomsSafe(field, value) {
  try {
    return await queryFlashRoms(field, value)
  } catch (err) {
    console.warn('[flashRom] query failed', field, value, err?.message || err)
    return []
  }
}

function uniqueById(docs) {
  const seen = new Set()
  return docs.filter((doc) => {
    const id = String(doc?.id ?? '')
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/** 只展示公开且已通过的贴纸 */
export function approvedStickersOf(rom) {
  const raw = rom?.stickers
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.docs) ? raw.docs : []
  return list.filter((s) => {
    const status = String(s?.status || '').toLowerCase()
    const vis = String(s?.visibility || 'public').toLowerCase()
    if (vis && vis !== 'public') return false
    return !status || status === 'approved'
  })
}

function filterTitleHits(docs, info, query) {
  return docs
    .filter((doc) => flashRomMatchesPlatform(doc, info))
    .filter((doc) => titleLooseMatch(query, doc.title || doc?.game?.name || ''))
}

function finalizeDocs(docs, info) {
  return rankFlashDocs(uniqueById(docs).map(enrichFlashRom), info)
}

/** 查询与当前 ROM ID 相同且平台一致的全部卡带版本。 */
export async function findFlashRoms(info) {
  const code = normalize(gameCodeOf(info))
  const title = normalize(romTitleOf(info))

  if (code) {
    for (const q of serialQueryCandidates(code)) {
      const serialMatches = (await queryFlashRomsSafe('serialCode', q))
        .filter((doc) => flashRomMatchesPlatform(doc, info))
        .filter((doc) => serialLooseMatch(doc.serialCode, code) || serialLooseMatch(doc.serialCode, q))
      if (serialMatches.length) return finalizeDocs(serialMatches, info)
    }
  }

  if (title) {
    const titleMatches = filterTitleHits(await queryFlashRomsSafe('title', title), info, title)
    if (titleMatches.length) return finalizeDocs(titleMatches, info)

    // 标题过长时再试前几个词（如 POKEMON RED VERSION → POKEMON RED）
    const words = titleTokens(title)
    if (words.length >= 2) {
      const short = words.slice(0, 2).join(' ')
      const shortMatches = filterTitleHits(await queryFlashRomsSafe('title', short), info, short)
      if (shortMatches.length) return finalizeDocs(shortMatches, info)
    }
  }

  return []
}

export async function findFlashRomGroup(info) {
  const seeds = await findFlashRoms(info)
  const source = seeds[0]
  if (!source?.id) return seeds

  try {
    const params = new URLSearchParams({
      resource: 'roms-by-id',
      id: String(source.id),
      depth: '2',
      limit: '100',
    })
    const response = await fetchJson(stickerApiUrl(`/browse?${params}`), {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`ROM sticker API returned ${response.status}`)
    const body = await response.json()
    const docs = Array.isArray(body?.docs) ? body.docs : []
    const platformDocs = docs.filter((doc) => flashRomMatchesPlatform(doc, info))
    return finalizeDocs(platformDocs.length ? platformDocs : seeds, info)
  } catch (err) {
    console.warn('[flashRom] sticker browse failed, fallback seeds', err?.message || err)
    return seeds
  }
}

export async function submitFlashSticker(data) {
  const response = await fetchJson(stickerApiUrl('/submit'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body?.error || body?.message || `贴纸上传失败 (${response.status})`
    throw new Error(message)
  }
  return body
}
export async function findFlashRom(info) {
  const docs = await findFlashRoms(info)
  return docs.find((doc) => resolveCartridgeImage(doc)) || docs[0] || null
}

export async function createFlashRom(data) {
  const response = await fetchJson(apiUrl('/api/FlashRom'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body?.errors?.[0]?.message || body?.message || `创建失败 (${response.status})`
    throw new Error(message)
  }
  return body?.doc || body
}

export async function updateFlashRom(id, data) {
  const response = await fetchJson(apiUrl(`/api/FlashRom/${id}`), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body?.errors?.[0]?.message || body?.message || `更新失败 (${response.status})`
    throw new Error(message)
  }
  return body?.doc || body
}

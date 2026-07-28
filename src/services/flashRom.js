import { apiUrl, stickerApiUrl } from '../config/api'
import { gameCodeOf, romTitleOf } from '../components/drawer/logs/rom/romFields'

function normalize(value) {
  return String(value || '').trim().toUpperCase()
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

async function queryFlashRoms(field, value) {
  const params = new URLSearchParams({ limit: '50', depth: '1' })
  params.set(`where[${field}][like]`, value)
  const response = await fetch(apiUrl(`/api/FlashRom?${params}`), { credentials: 'include' })
  if (!response.ok) throw new Error(`FlashRom API returned ${response.status}`)
  const body = await response.json()
  return Array.isArray(body?.docs) ? body.docs : []
}

/** 单次查询失败时返回 []，避免配图 API 挂掉时整条识别展示链路被 catch 清掉。 */
async function queryFlashRomsSafe(field, value) {
  try {
    return await queryFlashRoms(field, value)
  } catch {
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

/** 查询与当前 ROM ID 相同且平台一致的全部卡带版本。 */
export async function findFlashRoms(info) {
  const code = normalize(gameCodeOf(info))
  const title = normalize(romTitleOf(info))

  if (code) {
    const serialMatches = (await queryFlashRomsSafe('serialCode', code))
      .filter((doc) => flashRomMatchesPlatform(doc, info))
      .filter((doc) => normalize(doc.serialCode).includes(code))
    if (serialMatches.length) return uniqueById(serialMatches)
  }

  if (title) {
    const titleMatches = (await queryFlashRomsSafe('title', title))
      .filter((doc) => flashRomMatchesPlatform(doc, info))
      .filter((doc) => {
        const docTitle = normalize(doc.title || doc?.game?.name)
        return docTitle.includes(title) || title.includes(docTitle)
      })
    return uniqueById(titleMatches)
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
    const response = await fetch(stickerApiUrl(`/browse?${params}`), {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`ROM sticker API returned ${response.status}`)
    const body = await response.json()
    const docs = Array.isArray(body?.docs) ? body.docs : []
    const platformDocs = docs.filter((doc) => flashRomMatchesPlatform(doc, info))
    return uniqueById(platformDocs.length ? platformDocs : seeds)
  } catch {
    return seeds
  }
}

export async function submitFlashSticker(data) {
  const response = await fetch(stickerApiUrl('/submit'), {
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
  return docs.find((doc) => doc?.cartridgeImage) || null
}

export async function createFlashRom(data) {
  const response = await fetch(apiUrl('/api/FlashRom'), {
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
  const response = await fetch(apiUrl(`/api/FlashRom/${id}`), {
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
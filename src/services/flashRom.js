import { apiUrl } from '../config/api'

function normalize(value) {
  return String(value || '').trim().toUpperCase()
}

function platformPrefix(info) {
  if (info?.kind === 'gba') return 'gba__'
  return ''
}

async function queryFlashRoms(field, value) {
  const params = new URLSearchParams({ limit: '12', depth: '1' })
  params.set(`where[${field}][like]`, value)
  const response = await fetch(apiUrl(`/api/FlashRom?${params}`))
  if (!response.ok) throw new Error(`FlashRom API returned ${response.status}`)
  const body = await response.json()
  return Array.isArray(body?.docs) ? body.docs : []
}

function chooseMatch(docs, info) {
  const code = normalize(info?.game_code)
  const title = normalize(info?.rom_title || info?.game_name)
  const prefix = platformPrefix(info)
  const candidates = docs.filter((doc) => doc?.cartridgeImage)

  if (code && info?.kind === 'gba') {
    const serialPrefix = `AGB-${code}`
    const exactPlatform = candidates.find((doc) => normalize(doc.serialCode).startsWith(serialPrefix))
    if (exactPlatform) return exactPlatform
  }

  if (title) {
    const samePlatform = candidates.find((doc) =>
      (!prefix || String(doc.refKey || '').startsWith(prefix)) &&
      (normalize(doc.title).includes(title) || title.includes(normalize(doc.game?.name))),
    )
    if (samePlatform) return samePlatform
  }

  return candidates[0] || null
}

export async function findFlashRom(info) {
  const code = normalize(info?.game_code)
  const title = String(info?.rom_title || info?.game_name || '').trim()
  const searches = []

  if (code && info?.kind === 'gba') searches.push(['serialCode', code])
  if (title) searches.push(['title', title])

  for (const [field, value] of searches) {
    const match = chooseMatch(await queryFlashRoms(field, value), info)
    if (match) return match
  }
  return null
}

import star1 from './masks/star-1.svg'
import star2 from './masks/star-2.svg'
import star3 from './masks/star-3.svg'
import shards1 from './masks/shards-1.svg'
import shards2 from './masks/shards-2.svg'
import shards3 from './masks/shards-3.svg'

/** Star / Shard 镭射层遮罩（来源：gbmake Lamination 预览） */
export const LASER_MASKS = Object.freeze({
  star: Object.freeze([star1, star2, star3]),
  shards: Object.freeze([shards1, shards2, shards3]),
})

/** Star 镭射各层 hue / 位移参数 */
export const STAR_LAYER_STYLES = Object.freeze([
  { filter: 'hue-rotate(45deg)', '--sx': '0.8', '--sy': '0.4', '--rot': '30deg' },
  { filter: 'hue-rotate(-60deg)', '--sx': '-0.5', '--sy': '0.9', '--rot': '-45deg' },
  { filter: 'hue-rotate(150deg)', '--sx': '0.2', '--sy': '-0.7', '--rot': '90deg' },
])

/** Shard 镭射各层 hue / 位移参数 */
export const SHARD_LAYER_STYLES = Object.freeze([
  { filter: 'hue-rotate(15deg) saturate(1.5)', '--sx': '0.8', '--sy': '0.4', '--rot': '25deg' },
  { filter: 'hue-rotate(120deg) saturate(1.5)', '--sx': '-0.5', '--sy': '0.9', '--rot': '-45deg' },
  { filter: 'hue-rotate(-60deg) saturate(1.5)', '--sx': '0.2', '--sy': '-0.7', '--rot': '80deg' },
])

/** 覆膜预设（与编辑器 data-capture-name 对齐） */
export const CARTRIDGE_LAMINATIONS = Object.freeze([
  { id: 'none', name: 'None', kind: 'none' },
  { id: 'glossy', name: 'Gloss', kind: 'gloss', aliases: ['gloss'] },
  { id: 'matte', name: 'Matte', kind: 'matte' },
  { id: 'spectrum', name: 'Spectrum laser', kind: 'spectrum', aliases: ['holo', 'holographic', 'laser'] },
  { id: 'star', name: 'Star laser', kind: 'star', aliases: ['stars'] },
  { id: 'shards', name: 'Shard laser', kind: 'shards', aliases: ['shard'] },
])

export function normalizeLaminationId(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw || raw === 'none') return 'none'
  for (const item of CARTRIDGE_LAMINATIONS) {
    if (item.id === raw) return item.id
    if (item.aliases?.includes(raw)) return item.id
  }
  return raw
}

export function laminationLabel(value) {
  const id = normalizeLaminationId(value)
  const hit = CARTRIDGE_LAMINATIONS.find((item) => item.id === id)
  if (hit) return hit.name === 'None' ? 'No lamination' : hit.name
  return id || '—'
}

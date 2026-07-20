/**
 * Sprite loader — uses Vite's import.meta.glob for lazy per-sprite loading.
 * Generate data with:  python tools/batch_sprites.py [id | start end]
 */

const modules = import.meta.glob('./pokemon/*.js')

const _keys = Object.keys(modules).sort()

/** Total number of available sprites */
export const count = _keys.length

/** Load a specific sprite by 1-based Pokémon ID (e.g. 25 = Pikachu) */
export async function loadById(id) {
  const key = `./pokemon/${String(id).padStart(3, '0')}.js`
  if (!modules[key]) return null
  const mod = await modules[key]()
  return mod.default
}

/** Load a random sprite from all available files */
export async function loadRandom() {
  if (_keys.length === 0) return null
  const key = _keys[Math.floor(Math.random() * _keys.length)]
  const mod = await modules[key]()
  return mod.default
}

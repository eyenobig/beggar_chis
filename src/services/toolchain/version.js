/**
 * Shared version-label helpers for toolchain path rows (Settings).
 * Adapters format their own local state; path sniffing is shared.
 */

/** Extract semver-ish fragment from an install path when present. */
export function versionFromInstallPath(path) {
  const s = String(path || '')
  const m =
    s.match(/[\\/](v?\d+\.\d+(?:\.\d+)?)(?:[\\/]|$)/i) ||
    s.match(/(v?\d+\.\d+(?:\.\d+)?)/i)
  return m?.[1] || ''
}

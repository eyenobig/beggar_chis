#!/usr/bin/env node
/**
 * Ensure the cfb sidecar in src-tauri/binaries/ exists and matches the expected version.
 * Source resolution: `scripts/cfb-config.mjs` only (local config → else GitHub Release).
 * Used by tauri's beforeDevCommand so `npm run dev` is self-sufficient.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_CFB_LOCAL_REL,
  detectTriple,
  githubConfig,
  repoRoot,
  resolveCfbBuildSource,
} from './cfb-config.mjs'

const root = repoRoot()
const isWin = process.platform === 'win32'
const binSuffix = isWin ? '.exe' : ''
const scriptsDir = join(root, 'scripts')

const triple = detectTriple()
const sidecarPath = join(root, 'src-tauri', 'binaries', `cfb-${triple}${binSuffix}`)

main()

function main() {
  const source = resolveCfbBuildSource(root)
  const expectedVersion = source.kind === 'local'
    ? readLocalCargoVersion(source.dir)
    : fetchReleaseVersion()

  if (!expectedVersion) {
    // Could not determine expected version: if a sidecar already runs, keep it; else fail loud.
    const current = readSidecarVersion()
    if (current) {
      console.log(`cfb: could not determine expected version, keeping existing sidecar (${current})`)
      return
    }
    console.error('cfb: cannot determine expected version and no usable sidecar present.')
    if (source.kind === 'download') {
      console.error(
        `   (offline? check network, or set CFB_LOCAL_DIR / local-paths.json, or place source at ${DEFAULT_CFB_LOCAL_REL})`,
      )
    }
    process.exit(1)
  }

  const currentVersion = readSidecarVersion()
  if (currentVersion === expectedVersion) {
    console.log(`cfb sidecar up to date (${currentVersion}), skip build`)
    return
  }

  const reason = currentVersion
    ? `sidecar ${currentVersion} != expected ${expectedVersion}`
    : `sidecar missing for ${triple}`
  console.log(`cfb: ${reason} → ${source.kind === 'local' ? 'rebuild from source' : 'download from release'}`)
  runBuildScript(source.kind === 'local' ? 'build-cfb.mjs' : 'download-cfb-release.mjs')
}

/** Read the package version from a chis-burner-cmd Cargo.toml (no TOML dep). */
function readLocalCargoVersion(sourceDir) {
  const manifest = join(sourceDir, 'Cargo.toml')
  const text = readFileSync(manifest, 'utf8')
  const match = text.match(/^version\s*=\s*"([^"]+)"/m)
  return match ? match[1] : null
}

/** Resolve the version from the matching chis-burner-cmd GitHub Release tag (strips leading v). */
function fetchReleaseVersion() {
  const { repository, releaseTag, token } = githubConfig()
  const apiUrl = releaseTag === 'latest'
    ? `https://api.github.com/repos/${repository}/releases/latest`
    : `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(releaseTag)}`
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'beggar-chis-ensure-cfb',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = spawnSync('node', ['-e', `
    const headers = ${JSON.stringify(headers)}
    fetch(${JSON.stringify(apiUrl)}, { headers })
      .then(async r => { if (!r.ok) process.exit(1); const j = await r.json(); process.stdout.write(j.tag_name || '') })
      .catch(() => process.exit(1))
  `], { encoding: 'utf8' })
  const tag = (res.stdout || '').trim()
  return tag ? tag.replace(/^v/, '') : null
}

/** Run the existing sidecar and read its reported version (null if missing/broken). */
function readSidecarVersion() {
  if (!existsSync(sidecarPath)) return null
  // Old sidecars predate the `version` command; treat "unknown command" as null → rebuild.
  const res = spawnSync(sidecarPath, ['version', '--json'], { encoding: 'utf8' })
  if (res.status !== 0) return null
  for (const line of String(res.stdout || '').split(/\r?\n/)) {
    const value = line.trim()
    if (!value) continue
    try {
      const ev = JSON.parse(value)
      if (ev && ev.type === 'version' && ev.version) return ev.version
    } catch { /* not NDJSON / diagnostic line */ }
  }
  return null
}

function runBuildScript(scriptName) {
  const res = spawnSync('node', [join(scriptsDir, scriptName)], { stdio: 'inherit' })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

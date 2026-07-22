#!/usr/bin/env node
/**
 * Ensure the cfb sidecar in src-tauri/binaries/ exists and matches the expected version.
 *
 * Strategy (local-first, with a download fallback):
 *   1. If a sibling chis-burner-cmd source repo is present (or CFB_LOCAL_DIR points to one),
 *      the expected version is read from its Cargo.toml; if the sidecar is missing or reports
 *      a different version, it is rebuilt locally via build-cfb.mjs.
 *   2. Otherwise (someone cloned only beggar_chis), the expected version is resolved from the
 *      chis-burner-cmd GitHub Release; if the sidecar is missing or differs, it is downloaded
 *      via download-cfb-release.mjs.
 *   3. If the sidecar already reports the expected version, the build/download is skipped.
 *
 * Any failure to read a version is treated as "version unknown" and triggers a rebuild, so
 * `npm run dev` always ends up with a usable sidecar. Used by tauri's beforeDevCommand so
 * `npm run dev` is self-sufficient.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const binSuffix = isWin ? '.exe' : ''
const scriptsDir = join(root, 'scripts')

const triple = detectTriple()
const sidecarPath = join(root, 'src-tauri', 'binaries', `cfb-${triple}${binSuffix}`)

main()

function main() {
  const source = resolveSource()
  const expectedVersion = source.kind === 'local'
    ? readLocalCargoVersion(source.dir)
    : fetchReleaseVersion(source)

  if (!expectedVersion) {
    // Could not determine expected version: if a sidecar already runs, keep it; else fail loud.
    const current = readSidecarVersion()
    if (current) {
      console.log(`cfb: could not determine expected version, keeping existing sidecar (${current})`)
      return
    }
    console.error('cfb: cannot determine expected version and no usable sidecar present.')
    if (source.kind === 'download') {
      console.error('   (offline? check network, or set CFB_LOCAL_DIR to a local chis-burner-cmd checkout)')
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

/** Decide whether to build locally or download, and where the local source lives. */
function resolveSource() {
  const localDir = resolve(process.env.CFB_LOCAL_DIR || join(root, '..', 'chis-burner-cmd'))
  if (existsSync(join(localDir, 'Cargo.toml'))) return { kind: 'local', dir: localDir }
  return { kind: 'download' }
}

/** Read the package version from a chis-burner-cmd Cargo.toml (no TOML dep). */
function readLocalCargoVersion(sourceDir) {
  const manifest = join(sourceDir, 'Cargo.toml')
  const text = readFileSync(manifest, 'utf8')
  const match = text.match(/^version\s*=\s*"([^"]+)"/m)
  return match ? match[1] : null
}

/** Resolve the version from the matching chis-burner-cmd GitHub Release tag (strips leading v). */
function fetchReleaseVersion(source) {
  const repository = process.env.CFB_GITHUB_REPO || 'eyenobig/chis-burner-cmd'
  const releaseTag = process.env.CFB_RELEASE_TAG || 'latest'
  const apiUrl = releaseTag === 'latest'
    ? `https://api.github.com/repos/${repository}/releases/latest`
    : `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(releaseTag)}`
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'beggar-chis-ensure-cfb',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = process.env.CFB_GITHUB_TOKEN || process.env.GITHUB_TOKEN
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

function detectTriple() {
  if (process.env.CFB_TARGET) return process.env.CFB_TARGET
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  if (process.platform === 'win32') return `${arch}-pc-windows-msvc`
  if (process.platform === 'darwin') return `${arch}-apple-darwin`
  if (process.platform === 'linux') return `${arch}-unknown-linux-gnu`
  throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`)
}

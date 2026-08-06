#!/usr/bin/env node
/** Download a prebuilt cfb sidecar from the configured chis-burner-cmd GitHub Release. */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectTriple, githubConfig, repoRoot } from './cfb-config.mjs'

const root = repoRoot()
const { repository, releaseTag, token } = githubConfig()
const target = detectTriple()
const assetName = process.platform === 'win32' || target.includes('windows')
  ? `cfb-${target}.exe`
  : `cfb-${target}`

const apiUrl = releaseTag === 'latest'
  ? `https://api.github.com/repos/${repository}/releases/latest`
  : `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(releaseTag)}`
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'beggar-chis-build',
  'X-GitHub-Api-Version': '2022-11-28',
}
if (token) headers.Authorization = `Bearer ${token}`

console.log(`Resolving ${repository} release ${releaseTag} for ${target}`)
const releaseResponse = await fetch(apiUrl, { headers })
if (!releaseResponse.ok) {
  const detail = await releaseResponse.text()
  throw new Error(`GitHub release lookup failed (${releaseResponse.status}): ${detail}`)
}

const release = await releaseResponse.json()
const asset = release.assets?.find((item) => item.name === assetName)
if (!asset) {
  const available = release.assets?.map((item) => item.name).join(', ') || 'none'
  throw new Error(`Release ${release.tag_name} has no ${assetName}. Available assets: ${available}`)
}

const downloadHeaders = { ...headers, Accept: 'application/octet-stream' }
const assetResponse = await fetch(asset.url, { headers: downloadHeaders, redirect: 'follow' })
if (!assetResponse.ok) {
  throw new Error(`GitHub asset download failed (${assetResponse.status}): ${await assetResponse.text()}`)
}

const outDir = join(root, 'src-tauri', 'binaries')
const destination = join(outDir, assetName)
mkdirSync(outDir, { recursive: true })
writeFileSync(destination, Buffer.from(await assetResponse.arrayBuffer()))
if (!target.includes('windows')) chmodSync(destination, 0o755)
console.log(`GitHub sidecar ready: ${destination}`)

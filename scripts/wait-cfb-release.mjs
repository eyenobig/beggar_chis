// CI dependency gate: allow the upstream cfb release to finish before downloading.
const repo = process.env.CFB_GITHUB_REPO || 'eyenobig/chis-burner-cmd'
const tag = process.env.CFB_RELEASE_TAG
if (!tag || tag === 'latest') throw new Error('A pinned CFB_RELEASE_TAG is required')
const allNames = [
  'cfb-x86_64-pc-windows-msvc.exe', 'cfb-x86_64-unknown-linux-gnu',
  'cfb-aarch64-apple-darwin', 'cfb-x86_64-apple-darwin',
]
const target = process.env.CFB_TARGET
if (!target) throw new Error('CFB_TARGET is required')
const names = allNames.filter(name => name === `cfb-${target}${target.includes('windows') ? '.exe' : ''}`)
if (!names.length) throw new Error(`Unsupported CFB_TARGET: ${target}`)
const headers = { Accept: 'application/vnd.github+json' }
if (process.env.CFB_GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.CFB_GITHUB_TOKEN}`
const deadline = Date.now() + 15 * 60 * 1000
while (true) {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
    headers, signal: AbortSignal.timeout(30000),
  })
  if (response.ok) {
    const release = await response.json()
    if (!release.draft && names.every(name => release.assets.some(a => a.name === name && a.size > 0))) {
      console.log(`${repo} ${tag}: ${names[0]} is ready`)
      break
    }
  } else if (response.status !== 404) {
    throw new Error(`CFB release lookup failed: HTTP ${response.status}`)
  }
  if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${repo} ${tag} assets`)
  console.log(`Waiting for ${repo} ${tag} assets...`)
  await new Promise(resolve => setTimeout(resolve, 30000))
}

#!/usr/bin/env node
/**
 * 不碰硬件：校验烧丐对 cfb sidecar 的平台绑定（Win / Linux / macOS）。
 * CI 的 frontend job 与本地 `npm run check:sidecar-bind` 都跑这个。
 */
import { sidecarFileName, SIDECAR_TRIPLES } from './cfb-config.mjs'

const expected = {
  'x86_64-pc-windows-msvc': 'cfb-x86_64-pc-windows-msvc.exe',
  'x86_64-unknown-linux-gnu': 'cfb-x86_64-unknown-linux-gnu',
  'x86_64-apple-darwin': 'cfb-x86_64-apple-darwin',
  'aarch64-apple-darwin': 'cfb-aarch64-apple-darwin',
}

let failed = 0

for (const triple of SIDECAR_TRIPLES) {
  const got = sidecarFileName(triple)
  const want = expected[triple]
  if (!want) {
    console.error(`✗ 未知 triple ${triple}`)
    failed++
    continue
  }
  const linuxBare = triple.includes('linux') && !got.endsWith('.exe')
  const winExe = triple.includes('windows') && got.endsWith('.exe')
  const ok = got === want && (linuxBare || winExe || !triple.includes('windows'))
  console.log(`${ok ? '✓' : '✗'} ${triple} → ${got}`)
  if (got !== want) {
    console.error(`  期望 ${want}`)
    failed++
  }
}

const linux = sidecarFileName('x86_64-unknown-linux-gnu')
if (linux.endsWith('.exe')) {
  console.error('✗ Linux sidecar 不能带 .exe（Tauri / chmod 都会对不上）')
  failed++
} else {
  console.log('✓ Linux sidecar 无 .exe 后缀')
}

if (!SIDECAR_TRIPLES.includes('x86_64-unknown-linux-gnu')) {
  console.error('✗ SIDECAR_TRIPLES 缺少 Linux x64')
  failed++
} else {
  console.log('✓ 已绑定 Linux x64 triple')
}

if (failed) {
  console.error(`\n[sidecar-bind] ${failed} 项失败`)
  process.exit(1)
}
console.log('\n[sidecar-bind] ✓ Win/Linux/macOS 文件名绑定通过')

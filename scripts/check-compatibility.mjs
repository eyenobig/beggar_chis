#!/usr/bin/env node
/**
 * 校验 app 期望的 cmd/rule 版本与实际打包的 sidecar 是否匹配。
 * 读取 package.json 的 compatibility 字段（裸版本号，不带 v），对比 sidecar 二进制报告的版本。
 *
 * 用法：
 *   node scripts/check-compatibility.mjs          # 检查打包的 sidecar
 *   node scripts/check-compatibility.mjs /path/to/cfb.exe  # 检查指定 cfb 二进制
 *
 * 由 release 流程（update-part-app skill）在 build 前后调用。
 * 不匹配时退出码 1（阻断 release）。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const expected = pkg.compatibility

if (!expected?.cmd || !expected?.rule) {
  console.error('[compat] package.json 缺少 compatibility.cmd / compatibility.rule')
  process.exit(1)
}

const isWin = process.platform === 'win32'
const sidecarDir = join(root, 'src-tauri', 'binaries')

function detectTriple() {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  if (process.platform === 'win32') return `${arch}-pc-windows-msvc`
  if (process.platform === 'darwin') return `${arch}-apple-darwin`
  if (process.platform === 'linux') return `${arch}-unknown-linux-gnu`
  return ''
}

function sidecarPath() {
  if (process.argv[2]) return process.argv[2]
  if (!existsSync(sidecarDir)) return ''
  const ext = isWin ? '.exe' : ''
  const triple = process.env.CFB_TARGET || detectTriple()
  const named = join(sidecarDir, `cfb-${triple}${ext}`)
  if (existsSync(named)) return named
  const hit = readdirSync(sidecarDir).find((f) => /^cfb-.+/.test(f) && f.endsWith(ext))
  return hit ? join(sidecarDir, hit) : ''
}

/** 去掉前导 v，统一成裸版本号比较。 */
const bare = (v) => String(v || '').trim().replace(/^v/i, '')

let ok = true

// ── cmd：运行 sidecar version，对比 compatibility.cmd ──────────────
const bin = sidecarPath()
if (!bin) {
  console.warn('[compat] 未找到 cfb sidecar 二进制，跳过 cmd 校验（dev 模式正常）')
} else {
  const res = spawnSync(bin, ['version', '--json'], { encoding: 'utf8', shell: isWin })
  const out = (res.stdout || '').trim()
  let actualCmd = ''
  try {
    const line = out.split('\n').find((l) => l.includes('"version"')) || out
    actualCmd = bare(JSON.parse(line).version)
  } catch {
    const m = out.match(/"version"\s*:\s*"([^"]+)"/)
    if (m) actualCmd = bare(m[1])
  }
  const want = bare(expected.cmd)
  const match = actualCmd === want
  console.log(`${match ? '✓' : '✗'} cmd:  期望 ${want} | sidecar ${actualCmd || '(未知)'} ${bin.replace(root, '.')}`)
  if (!match) ok = false
}

// ── rule：内嵌模式无法运行时读取，提示手动确认 ────────────────────
console.log(`• rule: 期望 ${bare(expected.rule)} | 内嵌在 cfb 里，需在 release 记录确认（对照 chis-burner-rule git tag）`)

// ── client/app 版本一致性 ──────────────────────────────────────────
const tauriConf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const appVer = bare(pkg.version)
const confVer = bare(tauriConf.version)
const appMatch = appVer === confVer
console.log(`${appMatch ? '✓' : '✗'} app:  package.json ${appVer} | tauri.conf.json ${confVer}`)
if (!appMatch) {
  console.error('  package.json 和 tauri.conf.json 的 version 必须相等')
  ok = false
}

if (!ok) {
  console.error('\n[compat] 版本联动校验失败，阻断 release')
  process.exit(1)
}
console.log('\n[compat] ✓ 版本联动校验通过')

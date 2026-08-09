#!/usr/bin/env node
/**
 * Native smoke test for the CFB sidecar and (optionally) the Tauri output.
 * It does not access cartridge hardware.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectTriple, repoRoot } from './cfb-config.mjs'

const root = repoRoot()
const target = detectTriple()
const windows = target.includes('windows')
const sidecarName = windows ? `cfb-${target}.exe` : `cfb-${target}`
const sidecarPath = join(root, 'src-tauri', 'binaries', sidecarName)
const requiredSaveTypes = ['eeprom4k', 'eeprom64k', 'sram', 'flash', 'fram']

assertFile(sidecarPath, 'Tauri source sidecar')

const versionRun = run(sidecarPath, ['version', '--json'])
if (versionRun.status !== 0) {
  fail(`CFB version smoke test failed: ${versionRun.output}`)
}
const versionEvent = versionRun.stdout
  .split(/\r?\n/)
  .filter(Boolean)
  .map(parseJson)
  .find((event) => event?.type === 'version')
if (!versionEvent?.version) {
  fail(`CFB did not emit a JSON version event: ${versionRun.output}`)
}

const helpRun = run(sidecarPath, ['help'])
if (helpRun.status !== 0) {
  fail(`CFB help smoke test failed: ${helpRun.output}`)
}

// An invalid type is rejected before serial-port discovery and prints a short supported set.
// Full type list (incl. eeprom4k/64k) lives in `help`; merge both so either surface counts.
const invalidTypeRun = run(sidecarPath, [
  'save-dump',
  '--out',
  windows ? 'NUL' : '/dev/null',
  '--type',
  '__platform_check__',
])
if (invalidTypeRun.status === 0) {
  fail('CFB unexpectedly accepted an invalid save type')
}
const typeSurface = `${helpRun.output}\n${invalidTypeRun.output}`
const missingTypes = requiredSaveTypes.filter((type) => !typeSurface.includes(type))
if (missingTypes.length) {
  fail(`CFB save type list is incomplete; missing: ${missingTypes.join(', ')}`)
}

const report = {
  checked_at: new Date().toISOString(),
  target,
  host: { platform: process.platform, arch: process.arch },
  cfb: {
    version: versionEvent.version,
    source_sidecar: relative(sidecarPath),
    source_sidecar_bytes: statSync(sidecarPath).size,
    save_types: requiredSaveTypes,
    launches: true,
  },
  tauri: { checked: false },
}

if (process.env.CFB_TAURI_OUTPUT === '1') {
  const outputDir = join(root, 'src-tauri', 'target', target, 'release')
  const appPath = join(outputDir, windows ? 'tauri-app.exe' : 'tauri-app')
  const bundledSidecarPath = join(outputDir, windows ? 'cfb.exe' : 'cfb')
  assertFile(appPath, 'Tauri application')
  assertFile(bundledSidecarPath, 'Tauri output sidecar')
  const bundledVersionRun = run(bundledSidecarPath, ['version', '--json'])
  if (bundledVersionRun.status !== 0 || !bundledVersionRun.output.includes(String(versionEvent.version))) {
    fail(`Bundled CFB sidecar smoke test failed: ${bundledVersionRun.output}`)
  }
  report.tauri = {
    checked: true,
    application: relative(appPath),
    application_bytes: statSync(appPath).size,
    sidecar: relative(bundledSidecarPath),
    sidecar_bytes: statSync(bundledSidecarPath).size,
    sidecar_launches: true,
  }
}

const artifactDir = join(root, 'dist', 'build', 'reports')
mkdirSync(artifactDir, { recursive: true })
const reportPath = join(artifactDir, `platform-compatibility-${target}.json`)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
console.log(`Compatibility report: ${reportPath}`)

function run(file, args) {
  const result = spawnSync(file, args, { encoding: 'utf8', windowsHide: true })
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
  }
}

function assertFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    fail(`${label} was not found: ${path}`)
  }
}

function parseJson(line) {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function relative(path) {
  return path.slice(root.length + 1).replaceAll('\\', '/')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

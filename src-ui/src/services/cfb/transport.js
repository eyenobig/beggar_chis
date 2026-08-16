import { Channel, invoke } from '@tauri-apps/api/core'
import { Command } from '@tauri-apps/plugin-shell'
import { useCfbSettings } from '../../stores/useCfbSettings'

export const inTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

// ---- 直连二进制模式 ----
//
// 说明见 src-tauri/src/toolchain.rs「直连二进制模式」注释：`@tauri-apps/plugin-shell`
// 的 `Command.create(program, args)` 在非 sidecar 模式下要求 `program` 精确匹配
// capabilities 里静态声明的 scope 条目，无法表达 `cfbBinPath` 这种运行时才知道的
// 任意绝对路径。因此这里不使用 `Command.create`，而是改为 invoke 后端自定义命令
// （`resolve_cfb_binary` / `cfb_exec` / `cfb_spawn` / `cfb_kill_process`），并包一层
// `DirectCfbCommand` 适配器，对外暴露与 plugin-shell `Command` 相同的接口。
//
// 直连模式只解析已存在的可执行文件（或 bins 目录内的平台产物），不在应用内自动 cargo build；
// 缺失时由 ensureToolchainReady / 启动 bootstrap 处理（开发态本机构建产物，打包态首次下载）。

let _resolvedBinCache = null // { key, promise }

/**
 * 解析直连模式的 cfb 二进制路径（不构建）。
 * 同一 `cfbBinPath` 在会话内只 invoke 一次，路径变化时自然失效。
 */
function resolveDirectBinary(cfbPath) {
  const key = String(cfbPath || '')
  if (_resolvedBinCache?.key === key) return _resolvedBinCache.promise
  const promise = invoke('resolve_cfb_binary', { cfbPath })
  _resolvedBinCache = { key, promise }
  promise.catch(() => {
    if (_resolvedBinCache?.promise === promise) _resolvedBinCache = null
  })
  return promise
}

/** 清除直连二进制路径缓存（验证成功后或路径变更时调用）。 */
export function clearDirectBinaryCache() {
  _resolvedBinCache = null
}

/**
 * 供 `ensureToolchainReady()` 烧录/擦除前置检查：确认配置路径下存在可执行二进制。
 */
export function ensureDirectBinary(cfbPath) {
  return resolveDirectBinary(cfbPath)
}

/** 设置页 rule 数据目录（含 profiles/ 的根）→ cfb 的 CFB_RULE_DIR；空配置返回 null。 */
function cfbRuleDirEnv() {
  const dir = String(useCfbSettings().ruleDataDir || '').trim()
  return dir || null
}

/** 模拟 plugin-shell `Command` 接口的直连执行器，底层为 cfb_exec/cfb_spawn/cfb_kill_process。 */
class DirectCfbCommand {
  constructor(binPath, args, ruleDir = null) {
    this.binPath = binPath
    this.args = args
    this.ruleDir = ruleDir
    this._stdout = []
    this._stderr = []
    this._close = []
    this._error = []
    this.stdout = { on: (evt, cb) => { if (evt === 'data') this._stdout.push(cb) } }
    this.stderr = { on: (evt, cb) => { if (evt === 'data') this._stderr.push(cb) } }
  }

  on(evt, cb) {
    if (evt === 'close') this._close.push(cb)
    else if (evt === 'error') this._error.push(cb)
  }

  async execute() {
    const out = await invoke('cfb_exec', { binPath: this.binPath, args: this.args, ruleDir: this.ruleDir })
    return { stdout: out.stdout, stderr: out.stderr, code: out.code }
  }

  async spawn() {
    const channel = new Channel()
    channel.onmessage = (ev) => {
      if (ev.event === 'Stdout') this._stdout.forEach((cb) => cb(ev.payload))
      else if (ev.event === 'Stderr') this._stderr.forEach((cb) => cb(ev.payload))
      else if (ev.event === 'Error') this._error.forEach((cb) => cb(ev.payload))
      else if (ev.event === 'Terminated') this._close.forEach((cb) => cb({ code: ev.payload.code, signal: null }))
    }
    const pid = await invoke('cfb_spawn', { binPath: this.binPath, args: this.args, ruleDir: this.ruleDir, onEvent: channel })
    return { pid, kill: () => invoke('cfb_kill_process', { pid }) }
  }
}

/**
 * 构造本次调用要使用的命令对象：配置了 `cfbBinPath` 时走直连二进制模式
 * （解析已有可执行文件 + `DirectCfbCommand`），否则保持内置 sidecar 行为完全不变。
 * 两种模式都注入 CFB_RULE_DIR，把设置页的 rule 数据目录绑定到 cfb。
 */
async function createCommand(args) {
  const settings = useCfbSettings()
  const finalArgs = [...settings.withGlobalArgs(args), '--json']
  const ruleDir = cfbRuleDirEnv()
  if (settings.cfbBinPath) {
    const binPath = await resolveDirectBinary(settings.cfbBinPath)
    return new DirectCfbCommand(binPath, finalArgs, ruleDir)
  }
  const sidecar = Command.sidecar('binaries/cfb', finalArgs)
  return ruleDir ? sidecar.env('CFB_RULE_DIR', ruleDir) : sidecar
}

function emitLine(line, onEvent) {
  const value = String(line || '').trim()
  if (!value) return
  try {
    onEvent?.(JSON.parse(value))
  } catch {
    // stdout is an NDJSON protocol; malformed diagnostic lines are ignored.
  }
}

/** 全局串行化 cfb 调用，避免 UI 并发 info/detect/burn 抢同一 COM。 */
let _cfbChain = Promise.resolve()

function withCfbLock(fn) {
  const run = _cfbChain.then(fn, fn)
  // 吞掉链上错误，避免一次失败永久卡住后续调用。
  _cfbChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export async function executeCfb(args, onEvent) {
  if (!inTauri) throw new Error('cfb is only available in Tauri runtime. Use npm run dev.')
  return withCfbLock(async () => {
    try {
      const command = await createCommand(args)
      const output = await Promise.race([
        command.execute(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`cfb timeout: ${args.join(' ')}`)), 30000),
        ),
      ])
      for (const line of String(output.stdout || '').split(/\r?\n/)) emitLine(line, onEvent)
      const stderr = String(output.stderr || '').trim()
      const code = output.code ?? -1
      return {
        logs: stderr ? stderr.split(/\r?\n/) : [],
        code,
        error: code !== 0 ? stderr || `cfb exited with code ${code}` : undefined,
      }
    } catch (error) {
      return { logs: [], code: -1, error: String(error?.message || error) }
    }
  })
}

export async function streamCfb(args, onEvent, onChild) {
  if (!inTauri) throw new Error('cfb is only available in Tauri runtime. Use npm run dev.')
  return withCfbLock(async () => {
    const logs = []
    let buffer = ''

    try {
      const command = await createCommand(args)

      command.stdout.on('data', (chunk) => {
        buffer += String(chunk)
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''
        for (const line of lines) emitLine(line, onEvent)
      })
      command.stderr.on('data', (line) => logs.push(String(line).trimEnd()))

      let settled = false
      const done = new Promise((resolve) => {
        const finish = (result) => {
          if (settled) return
          settled = true
          resolve(result)
        }
        command.on('close', ({ code, signal }) => {
          emitLine(buffer, onEvent)
          const stderr = logs.filter(Boolean).join('\n').trim()
          const exitCode = code ?? -1
          finish({
            logs,
            code: exitCode,
            error: exitCode !== 0
              ? stderr || (signal ? `cfb terminated by signal ${signal}` : `cfb exited with code ${exitCode}`)
              : undefined,
          })
        })
        command.on('error', (error) => finish({ logs, code: -1, error: String(error) }))
      })

      const child = await command.spawn()
      onChild?.(child)
      return await done
    } catch (error) {
      return { logs, code: -1, error: String(error?.message || error) }
    }
  })
}

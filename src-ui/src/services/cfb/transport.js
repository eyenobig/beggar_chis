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
// （`resolve_cfb_binary` / `cfb_spawn` / `cfb_kill_process`），并包一层
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

/** 模拟 plugin-shell `Command` 接口的直连执行器，底层为 cfb_spawn/cfb_kill_process。 */
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
 * `forceSidecar`：客户端自身能力（如 udev 权限修复）强制走内置 sidecar——
 * 这些能力与应用版本绑定，用户配置的 cfb 引擎可能较旧而没有对应实现。
 * 两种模式都注入 CFB_RULE_DIR，把设置页的 rule 数据目录绑定到 cfb。
 * 注意：plugin-shell v2 的 Command 没有 .env() 方法，sidecar 只能在构造 options 里传 env。
 */
async function createCommand(args, { forceSidecar = false } = {}) {
  const settings = useCfbSettings()
  const finalArgs = [...settings.withGlobalArgs(args), '--json']
  const ruleDir = cfbRuleDirEnv()
  if (forceSidecar) {
    const binPath = await invoke('resolve_bundled_cfb')
    return new DirectCfbCommand(binPath, finalArgs, ruleDir)
  }
  if (settings.cfbBinPath) {
    const binPath = await resolveDirectBinary(settings.cfbBinPath)
    return new DirectCfbCommand(binPath, finalArgs, ruleDir)
  }
  const options = ruleDir ? { env: { CFB_RULE_DIR: ruleDir } } : undefined
  return Command.sidecar('binaries/cfb', finalArgs, options)
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
let _cfbUnreleased = null

function withCfbLock(fn, recovery = false) {
  const guarded = () => _cfbUnreleased && !recovery
    ? { logs: [], code: -1, error: _cfbUnreleased.error, errorKind: 'process' }
    : fn()
  const run = _cfbChain.then(guarded, guarded)
  // 吞掉链上错误，避免一次失败永久卡住后续调用。
  _cfbChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export async function executeCfb(args, onEvent) {
  return runCfb(args, onEvent, null, { timeoutMs: 30000, buffered: true })
}

export async function streamCfb(args, onEvent, onChild, opts = {}) {
  return runCfb(args, onEvent, onChild, opts)
}

/** 短命令也必须 spawn：保留进程句柄，超时后先终止并等待退出，再释放串行锁。 */
async function runCfb(args, onEvent, onChild, { timeoutMs = 0, buffered = false, recovery = false, ...opts } = {}) {
  if (!inTauri) throw new Error('cfb is only available in Tauri runtime. Use npm run dev.')
  return withCfbLock(async () => {
    const logs = []
    const output = []
    const state = { closed: false, failed: false, error: '' }
    let child = null
    let timer = null
    let cleanupTimer = null
    let closeProcess
    const closed = new Promise((resolve) => { closeProcess = resolve })

    try {
      const command = await createCommand(args, opts)

      // plugin-shell 默认按行发送（不含换行）；直连模式转发的是同一类事件。
      command.stdout.on('data', (data) => {
        if (state.closed || state.failed) return
        for (const line of String(data).split(/\r?\n/)) {
          if (buffered) output.push(line)
          else emitLine(line, onEvent)
        }
      })
      command.stderr.on('data', (line) => logs.push(String(line).trimEnd()))
      command.on('close', (result) => {
        state.closed = true
        if (_cfbUnreleased === state) _cfbUnreleased = null
        closeProcess(result)
      })
      const failed = new Promise((resolve) => {
        command.on('error', (error) => resolve({ error: String(error), errorKind: 'process' }))
      })

      child = await command.spawn()
      onChild?.(child)
      const waits = [closed, failed]
      if (timeoutMs > 0 && !state.closed) {
        waits.push(new Promise((resolve) => {
          timer = setTimeout(() => resolve({
            error: `cfb timeout: ${args.join(' ')}`,
            errorKind: 'timeout',
          }), timeoutMs)
        }))
      }
      const result = await Promise.race(waits)
      if (result.error) throw Object.assign(new Error(result.error), { errorKind: result.errorKind })
      if (buffered) for (const line of output) emitLine(line, onEvent)
      const stderr = logs.filter(Boolean).join('\n').trim()
      const code = result.code ?? -1
      return {
        logs,
        code,
        error: code !== 0
          ? stderr || (result.signal ? `cfb terminated by signal ${result.signal}` : `cfb exited with code ${code}`)
          : undefined,
      }
    } catch (error) {
      state.failed = true
      clearTimeout(timer)
      let message = String(error?.message || error)
      if (child && !state.closed) {
        // kill 请求成功不代表进程已退出；只有 close 才能保证下一条命令不会抢口。
        Promise.resolve().then(() => child.kill()).catch((err) => logs.push(String(err)))
        await Promise.race([
          closed,
          new Promise((resolve) => { cleanupTimer = setTimeout(resolve, 5000) }),
        ])
        if (!state.closed) {
          state.error = `cfb process ${child.pid} has not exited; restart the app before retrying.`
          _cfbUnreleased = state
          message += `; ${state.error}`
        }
      }
      return { logs, code: -1, error: message, errorKind: error?.errorKind || 'process' }
    } finally {
      clearTimeout(timer)
      clearTimeout(cleanupTimer)
    }
  }, recovery)
}

import { Command } from '@tauri-apps/plugin-shell'
import { useCfbSettings } from '../../stores/useCfbSettings'

export const inTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

function createCommand(args) {
  const settings = useCfbSettings()
  return Command.sidecar('binaries/cfb', [...settings.withGlobalArgs(args), '--json'])
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

export async function executeCfb(args, onEvent) {
  if (!inTauri) throw new Error('cfb is only available in Tauri runtime. Use npm run dev.')
  const command = createCommand(args)
  try {
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
}

export async function streamCfb(args, onEvent) {
  if (!inTauri) throw new Error('cfb is only available in Tauri runtime. Use npm run dev.')
  const command = createCommand(args)
  const logs = []
  let buffer = ''

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
  try {
    await command.spawn()
    return await done
  } catch (error) {
    return { logs, code: -1, error: String(error?.message || error) }
  }
}

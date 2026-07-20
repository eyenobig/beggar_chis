// cfb（chis-burner-cmd）sidecar：Tauri 运行时起进程并解析 NDJSON。
// 短命令用 execute() 拿完整 stdout（避免 spawn 关进程时丢尾行）；
// 长命令（burn/dump）用 spawn 流式进度。

import { Command } from '@tauri-apps/plugin-shell'

/** 是否在 Tauri 运行时（纯 vite 浏览器下为 false）。 */
export const inTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

function parseNdjson(text, onEvent) {
  const logs = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const s = line.trim()
    if (!s) continue
    let ev
    try {
      ev = JSON.parse(s)
    } catch {
      continue
    }
    onEvent?.(ev)
  }
  return logs
}

/**
 * 短命令：一次跑完，可靠拿到全部 NDJSON（info / detect / select / rom-info / rtc…）。
 * @param {string[]} args
 * @param {(ev:any)=>void} [onEvent]
 * @returns {Promise<{logs:string[], error?:string, code:number}>}
 */
export async function runCfb(args, onEvent) {
  if (!inTauri) throw new Error('cfb 仅在 Tauri 运行时可用（请用 npm run tauri dev）')
  const cmd = Command.sidecar('binaries/cfb', [...args, '--json'])
  try {
    // info/detect 等短命令不应超过 30s；超时则中止，避免 UI 永久卡住
    const out = await Promise.race([
      cmd.execute(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`cfb 超时: ${args.join(' ')}`)), 30000),
      ),
    ])
    parseNdjson(out.stdout, onEvent)
    const stderr = String(out.stderr || '').trim()
    const logs = stderr ? stderr.split(/\r?\n/) : []
    return { logs, code: out.code ?? 0, error: out.code && out.code !== 0 ? stderr || undefined : undefined }
  } catch (e) {
    return { logs: [], code: -1, error: String(e?.message || e) }
  }
}

/**
 * 长命令：流式进度（burn / dump / erase）。
 * @param {string[]} args
 * @param {(ev:any)=>void} [onEvent]
 * @returns {Promise<{logs:string[], error?:string}>}
 */
export async function spawnCfb(args, onEvent) {
  if (!inTauri) throw new Error('cfb 仅在 Tauri 运行时可用（请用 npm run tauri dev）')
  const cmd = Command.sidecar('binaries/cfb', [...args, '--json'])
  const logs = []
  let buf = ''
  const feed = (chunk) => {
    buf += String(chunk)
    const parts = buf.split(/\r?\n/)
    buf = parts.pop() || ''
    for (const line of parts) {
      const s = line.trim()
      if (!s) continue
      try {
        onEvent?.(JSON.parse(s))
      } catch {
        /* ignore */
      }
    }
  }
  cmd.stdout.on('data', feed)
  cmd.stderr.on('data', (l) => logs.push(String(l).trimEnd()))
  const done = new Promise((resolve) => {
    cmd.on('close', () => {
      if (buf.trim()) {
        try {
          onEvent?.(JSON.parse(buf.trim()))
        } catch {
          /* ignore */
        }
      }
      resolve({ logs })
    })
    cmd.on('error', (e) => resolve({ logs, error: String(e) }))
  })
  await cmd.spawn()
  return done
}

// cfb锛坈his-burner-cmd锛塻idecar锛歍auri 杩愯鏃惰捣杩涚▼骞惰В鏋?NDJSON銆?// 鐭懡浠ょ敤 execute() 鎷垮畬鏁?stdout锛堥伩鍏?spawn 鍏宠繘绋嬫椂涓㈠熬琛岋級锛?// 闀垮懡浠わ紙burn/dump锛夌敤 spawn 娴佸紡杩涘害銆?
import { Command } from '@tauri-apps/plugin-shell'
import { useCfbSettings } from '../stores/useCfbSettings'

/** 鏄惁鍦?Tauri 杩愯鏃讹紙绾?vite 娴忚鍣ㄤ笅涓?false锛夈€?*/
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
 * 鐭懡浠わ細涓€娆¤窇瀹岋紝鍙潬鎷垮埌鍏ㄩ儴 NDJSON锛坕nfo / detect / select / rom-info / rtc鈥︼級銆? * @param {string[]} args
 * @param {(ev:any)=>void} [onEvent]
 * @returns {Promise<{logs:string[], error?:string, code:number}>}
 */
export async function runCfb(args, onEvent) {
  if (!inTauri) throw new Error('cfb is only available in Tauri runtime. Use npm run dev.')
  const settings = useCfbSettings()
  const cmd = Command.sidecar('binaries/cfb', [...settings.withGlobalArgs(args), '--json'])
  try {
    // info/detect 绛夌煭鍛戒护涓嶅簲瓒呰繃 30s锛涜秴鏃跺垯涓锛岄伩鍏?UI 姘镐箙鍗′綇
    const out = await Promise.race([
      cmd.execute(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`cfb 瓒呮椂: ${args.join(' ')}`)), 30000),
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
 * 闀垮懡浠わ細娴佸紡杩涘害锛坆urn / dump / erase锛夈€? * @param {string[]} args
 * @param {(ev:any)=>void} [onEvent]
 * @returns {Promise<{logs:string[], error?:string}>}
 */
export async function spawnCfb(args, onEvent) {
  if (!inTauri) throw new Error('cfb is only available in Tauri runtime. Use npm run dev.')
  const settings = useCfbSettings()
  const cmd = Command.sidecar('binaries/cfb', [...settings.withGlobalArgs(args), '--json'])
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

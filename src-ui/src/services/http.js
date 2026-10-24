/**
 * Tauri 打包态 origin 为 http://tauri.localhost，window.fetch 直连公网 API 会撞 CORS。
 * 绝对 https URL 走 @tauri-apps/plugin-http（Rust 发请求，无 CORS）。
 * 相对路径（dev 的 /payload-api 等）仍用原生 fetch，交给 Vite proxy。
 */
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { inTauri } from './cfb/transport'

function isAbsoluteHttpUrl(input) {
  const url = typeof input === 'string' ? input : input?.url
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}

export function apiFetch(input, init) {
  if (inTauri && isAbsoluteHttpUrl(input)) return tauriFetch(input, init)
  return fetch(input, init)
}

// API 后端地址：dev 全走 Vite proxy（避 CORS），prod 用公网域名（打包给用户）。
// 三个后端（dev 代理默认目标见 vite.config.js，可用 VITE_*_PROXY_TARGET 改回本机）：
// - Payload (ROM 数据)：dev /payload-api → payload.gbmake.com；prod 同
// - Medusa storefront (贴纸)：dev /sticker-api → g.gbmake.com/api/rom-sticker；prod 同
//
// 安全：prod 域名写死为公网地址，绝不 fallback 到 localhost（否则打包给用户会指向不存在的本地后端）。
//       贴纸 base 必须含 /api/rom-sticker（与旧 LOCAL_STOREFRONT_STICKER_URL 一致）。

const DEV = import.meta.env.DEV

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

// 生产公网域名（与 gbmake 后端部署一致）。
const PROD_PAYLOAD_URL = 'https://payload.gbmake.com'
/** 贴纸 browse/上传入口在 storefront 的 /api/rom-sticker 下，不能只写域名根 */
const PROD_STOREFRONT_STICKER_URL = 'https://g.gbmake.com/api/rom-sticker'

export const API_CONFIG = Object.freeze({
  // dev 走 Vite proxy；prod 可用 VITE_* 覆盖，默认公网。
  baseUrl: DEV
    ? '/payload-api'
    : normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL) || PROD_PAYLOAD_URL,
  stickerBaseUrl: DEV
    ? '/sticker-api'
    : normalizeBaseUrl(import.meta.env.VITE_STOREFRONT_STICKER_URL) || PROD_STOREFRONT_STICKER_URL,
})

function joinApi(base, path = '') {
  const suffix = String(path).trim()
  if (!suffix) return base
  return `${base}/${suffix.replace(/^\/+/, '')}`
}

export function apiUrl(path = '') {
  return joinApi(API_CONFIG.baseUrl, path)
}

export function stickerApiUrl(path = '') {
  return joinApi(API_CONFIG.stickerBaseUrl, path)
}

// 供安全构建测试（skill）断言：prod 构建时后端地址是否都已脱离 localhost。
export function apiConfigDiagnostics() {
  const issues = []
  if (DEV) return issues
  for (const [k, v] of Object.entries(API_CONFIG)) {
    if (/localhost|127\.0\.0\.1/.test(v)) {
      issues.push(`${k}=${v} 仍指向 localhost（prod 应为公网域名）`)
    }
    if (!/^https:\/\//.test(v)) {
      issues.push(`${k}=${v} 非 https（prod 应加密传输）`)
    }
  }
  if (!String(API_CONFIG.stickerBaseUrl).includes('/api/rom-sticker')) {
    issues.push(`stickerBaseUrl=${API_CONFIG.stickerBaseUrl} 缺少 /api/rom-sticker 路径`)
  }
  return issues
}

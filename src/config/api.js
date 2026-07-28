const LOCAL_API_BASE_URL = 'http://localhost:1145'
const LOCAL_STOREFRONT_STICKER_URL = 'http://localhost:8000/api/rom-sticker'

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export const API_CONFIG = Object.freeze({
  baseUrl: import.meta.env.DEV
    ? '/payload-api'
    : normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL) || LOCAL_API_BASE_URL,
  stickerBaseUrl: import.meta.env.DEV
    ? '/sticker-api'
    : normalizeBaseUrl(import.meta.env.VITE_STOREFRONT_STICKER_URL) || LOCAL_STOREFRONT_STICKER_URL,
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
const LOCAL_API_BASE_URL = 'http://localhost:1145'

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export const API_CONFIG = Object.freeze({
  baseUrl: import.meta.env.DEV
    ? '/payload-api'
    : normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL) || LOCAL_API_BASE_URL,
})

export function apiUrl(path = '') {
  const suffix = String(path).trim()
  if (!suffix) return API_CONFIG.baseUrl
  return `${API_CONFIG.baseUrl}/${suffix.replace(/^\/+/, '')}`
}
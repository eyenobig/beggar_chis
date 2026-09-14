import { ref } from 'vue'
import { defineStore } from 'pinia'
import { i18n } from '../i18n'

const MAX_LOGS = 500
const DEDUPE_WINDOW_MS = 1000
const VALID_TYPES = new Set(['info', 'success', 'warn', 'error'])
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g
/** Strip trailing `· 12.3s` / `| 12.3s` from cfb lines */
const ELAPSED_TAIL = /\s*[|·•･・]\s*(\d+(?:\.\d+)?)s\s*$/u
/** 通用进度行检测：任意文字 + 百分比（跨语言，百分比格式全球统一） */
const IS_PROGRESS_LINE = /\s\d+\s*%/

const LIVE_PROGRESS_KEY = '__progress__'
const LIVE_TOTAL_KEY = '__total__'

let nextLogId = 0

function normalizeMessage(value) {
  let message
  if (value instanceof Error) message = value.message
  else if (typeof value === 'string') message = value
  else {
    try {
      message = JSON.stringify(value)
    } catch {
      message = String(value)
    }
  }
  return String(message || 'Unknown error')
    .replace(ANSI_PATTERN, '')
    .replace(/\r/g, '')
    .trim()
}

function timeString(timestamp) {
  const date = new Date(timestamp)
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function stripLogElapsed(message) {
  return String(message || '').replace(ELAPSED_TAIL, '').trim()
}

function formatTotalMessage(time) {
  return i18n.global.t('logs.totalTime', { time: String(time) })
}

function isTotalTimeMessage(message) {
  const body = stripLogElapsed(String(message || ''))
  if (!/(\d+(?:\.\d+)?s|\d+m\d{2}s)\s*$/i.test(body)) return false
  const sample = formatTotalMessage('0.0s')
  const prefix = sample.replace(/0\.0s\s*$/i, '').trim()
  return !!(prefix && body.toLowerCase().startsWith(prefix.toLowerCase()))
}

export const useLogStore = defineStore('log', () => {
  const logs = ref([])
  const hasUnread = ref(false)
  /** @type {Record<string, number>} */
  const liveProgressIds = Object.create(null)

  function clearLiveProgress(phase) {
    if (phase === LIVE_TOTAL_KEY) {
      delete liveProgressIds[LIVE_TOTAL_KEY]
      return
    }
    delete liveProgressIds[LIVE_PROGRESS_KEY]
    if (phase && phase !== LIVE_PROGRESS_KEY) delete liveProgressIds[phase]
  }

  function findLiveEntry(key, predicate) {
    const existingId = liveProgressIds[key]
    if (existingId == null) return null
    const entry = logs.value.find((log) => log.id === existingId)
    if (entry) return entry
    for (let i = logs.value.length - 1; i >= 0; i--) {
      const log = logs.value[i]
      if (predicate(log)) {
        liveProgressIds[key] = log.id
        return log
      }
    }
    delete liveProgressIds[key]
    return null
  }

  function ensureTotalAtBottom() {
    const id = liveProgressIds[LIVE_TOTAL_KEY]
    if (id == null) return
    const idx = logs.value.findIndex((log) => log.id === id)
    if (idx < 0 || idx === logs.value.length - 1) return
    const [entry] = logs.value.splice(idx, 1)
    logs.value.push(entry)
  }

  function upsertLiveLine(key, message, type = 'info', elapsed = undefined) {
    const timestamp = Date.now()
    const existing = findLiveEntry(key, (log) =>
      key === LIVE_TOTAL_KEY ? isTotalTimeMessage(log.message) : IS_PROGRESS_LINE.test(log.message),
    )
    if (existing) {
      if (existing.message !== message) existing.message = message
      if (elapsed !== undefined) existing.elapsed = elapsed
      existing.isTotal = key === LIVE_TOTAL_KEY
      existing.isProgress = key === LIVE_PROGRESS_KEY
      liveProgressIds[key] = existing.id
      ensureTotalAtBottom()
      hasUnread.value = true
      return existing.id
    }
    const entry = {
      id: ++nextLogId,
      timestamp,
      timeStr: timeString(timestamp),
      message,
      type,
      count: 1,
      elapsed: elapsed ?? null,
      isTotal: key === LIVE_TOTAL_KEY,
      isProgress: key === LIVE_PROGRESS_KEY,
    }
    logs.value.push(entry)
    if (logs.value.length > MAX_LOGS) logs.value.splice(0, logs.value.length - MAX_LOGS)
    liveProgressIds[key] = entry.id
    ensureTotalAtBottom()
    hasUnread.value = true
    return entry.id
  }

  function addLog(value, type = 'info', elapsed = undefined) {
    const message = normalizeMessage(value)
    const normalizedType = VALID_TYPES.has(type) ? type : 'info'
    const timestamp = Date.now()

    // 进度行（含百分比）：原地更新，不新增行
    if (IS_PROGRESS_LINE.test(message)) {
      return upsertLiveLine(LIVE_PROGRESS_KEY, message, 'info', elapsed)
    }

    if (isTotalTimeMessage(message)) {
      const timeMatch = message.match(/(\d+(?:\.\d+)?s|\d+m\d{2}s)\s*$/i)
      const time = timeMatch ? timeMatch[1] : message
      return upsertLiveLine(LIVE_TOTAL_KEY, formatTotalMessage(time), 'info')
    }

    // 去重：同 type + message 在 1s 内合并计数
    const last = logs.value[logs.value.length - 1]
    if (
      last
      && last.type === normalizedType
      && last.message === message
      && !last.isProgress
      && !last.isTotal
      && timestamp - last.timestamp < DEDUPE_WINDOW_MS
    ) {
      last.count++
      hasUnread.value = true
      return last.id
    }

    const entry = {
      id: ++nextLogId,
      timestamp,
      timeStr: timeString(timestamp),
      message,
      type: normalizedType,
      count: 1,
      elapsed: elapsed ?? null,
      isTotal: false,
      isProgress: false,
    }
    logs.value.push(entry)
    if (logs.value.length > MAX_LOGS) logs.value.splice(0, logs.value.length - MAX_LOGS)
    hasUnread.value = true
    return entry.id
  }

  function updateLog(id, updates) {
    const entry = logs.value.find((log) => log.id === id)
    if (!entry) return
    Object.assign(entry, updates)
  }

  function setLogElapsed(id, elapsed) {
    const entry = logs.value.find((log) => log.id === id)
    if (entry) entry.elapsed = elapsed
  }

  const sessionElapsed = ref('')

  function setSessionElapsed(time) {
    sessionElapsed.value = String(time || '')
  }

  function clearSessionElapsed() {
    sessionElapsed.value = ''
  }

  function markRead() {
    hasUnread.value = false
  }

  function clearLogs() {
    logs.value = []
    hasUnread.value = false
    for (const k of Object.keys(liveProgressIds)) delete liveProgressIds[k]
  }

  return {
    logs,
    hasUnread,
    sessionElapsed,
    addLog,
    updateLog,
    setLogElapsed,
    clearLiveProgress,
    setSessionElapsed,
    clearSessionElapsed,
    markRead,
    clearLogs,
  }
})

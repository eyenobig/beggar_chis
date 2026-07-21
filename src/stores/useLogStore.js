import { ref } from 'vue'
import { defineStore } from 'pinia'

const MAX_LOGS = 500
const DEDUPE_WINDOW_MS = 1000
const VALID_TYPES = new Set(['info', 'success', 'warn', 'error'])
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g
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

export const useLogStore = defineStore('log', () => {
  const logs = ref([])
  const hasUnread = ref(false)

  function addLog(value, type = 'info') {
    const message = normalizeMessage(value)
    const normalizedType = VALID_TYPES.has(type) ? type : 'info'
    const timestamp = Date.now()
    const previous = logs.value.at(-1)

    if (
      previous &&
      previous.message === message &&
      previous.type === normalizedType &&
      timestamp - previous.timestamp <= DEDUPE_WINDOW_MS
    ) {
      previous.count += 1
      previous.timestamp = timestamp
      previous.timeStr = timeString(timestamp)
      hasUnread.value = true
      return previous.id
    }

    const entry = {
      id: ++nextLogId,
      timestamp,
      timeStr: timeString(timestamp),
      message,
      type: normalizedType,
      count: 1,
    }
    logs.value.push(entry)
    if (logs.value.length > MAX_LOGS) logs.value.splice(0, logs.value.length - MAX_LOGS)
    hasUnread.value = true
    return entry.id
  }

  function clearLogs() {
    logs.value = []
    hasUnread.value = false
  }

  function updateLog(id, value, type) {
    const entry = logs.value.find((log) => log.id === id)
    if (!entry) return
    entry.message = normalizeMessage(value)
    if (type && VALID_TYPES.has(type)) entry.type = type
    entry.timestamp = Date.now()
    entry.timeStr = timeString(entry.timestamp)
  }

  function markRead() {
    hasUnread.value = false
  }

  return { logs, hasUnread, addLog, updateLog, clearLogs, markRead }
})

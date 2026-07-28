import { ref } from 'vue'
import { defineStore } from 'pinia'

const MAX_LOGS = 500
const DEDUPE_WINDOW_MS = 1000
const VALID_TYPES = new Set(['info', 'success', 'warn', 'error'])
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g
/** 进度行尾耗时：`· 1.2s` / `| 1.2s` / 多种中点字符 */
const ELAPSED_TAIL = /\s*[|·•･・]\s*(\d+(?:\.\d+)?)s\s*$/u
/**
 * cfb / UI 阶段进度：`擦除|写入|校验|编程|读取|导出 N%`
 * 「编程」并入写入；「读取」并入导出（ROM dump）。
 * 允许行首杂质（编码前缀等），只要含该模式即视为进度行。
 */
const PHASE_PROGRESS = /(擦除|写入|校验|编程|读取|导出)\s+(\d+)\s*%/
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

/** 剥掉进度 log 尾部耗时：`擦除 12% · 1.2s` → `擦除 12%` */
export function stripLogElapsed(message) {
  return String(message || '').replace(ELAPSED_TAIL, '').trim()
}

/**
 * 解析阶段进度 log。命中则返回统一文案（不含耗时列）。
 * @returns {{ phase: string, pct: number, message: string, elapsed: string|null } | null}
 */
export function parsePhaseProgress(message) {
  const raw = String(message || '')
  const body = stripLogElapsed(raw)
  const m = PHASE_PROGRESS.exec(body)
  if (!m) return null
  let phase = m[1]
  if (phase === '编程') phase = '写入'
  else if (phase === '读取') phase = '导出'
  const pct = Number(m[2])
  const elapsedMatch = raw.match(ELAPSED_TAIL)
  return {
    phase,
    pct,
    message: `${phase} ${pct}%`,
    elapsed: elapsedMatch?.[1] != null ? `${elapsedMatch[1]}s` : null,
  }
}

/** 操作起止边界：清掉 live 进度锚点，避免跨任务误合并 */
function isProgressBoundary(message) {
  return (
    /^(擦除|写入|校验|烧录|读取|导出).*(完成|失败|已中断)\b/.test(message)
    || /^(擦除卡带|烧录\s|开始(读取|导出|擦除|写入|校验|烧录))/.test(message)
  )
}

export const useLogStore = defineStore('log', () => {
  const logs = ref([])
  const hasUnread = ref(false)
  /** @type {Record<string, number>} phase → 当前进度行 id */
  const liveProgressIds = Object.create(null)

  function clearLiveProgress(phase) {
    if (phase) delete liveProgressIds[phase]
    else {
      for (const key of Object.keys(liveProgressIds)) delete liveProgressIds[key]
    }
  }

  function addLog(value, type = 'info') {
    const message = normalizeMessage(value)
    const normalizedType = VALID_TYPES.has(type) ? type : 'info'
    const timestamp = Date.now()

    // 进度类消息一律 upsert 同一 phase 行，堵住所有 addLog 刷屏路径
    const progress = parsePhaseProgress(message)
    if (progress) {
      const existingId = liveProgressIds[progress.phase]
      if (existingId != null) {
        const entry = logs.value.find((log) => log.id === existingId)
        if (entry) {
          entry.message = progress.message
          entry.timestamp = timestamp
          entry.timeStr = timeString(timestamp)
          if (progress.elapsed) entry.elapsed = progress.elapsed
          hasUnread.value = true
          return entry.id
        }
      }
      const entry = {
        id: ++nextLogId,
        timestamp,
        timeStr: timeString(timestamp),
        message: progress.message,
        type: 'info',
        count: 1,
        elapsed: progress.elapsed,
      }
      logs.value.push(entry)
      if (logs.value.length > MAX_LOGS) logs.value.splice(0, logs.value.length - MAX_LOGS)
      liveProgressIds[progress.phase] = entry.id
      hasUnread.value = true
      return entry.id
    }

    if (isProgressBoundary(message)) clearLiveProgress()

    const previous = logs.value.at(-1)

    if (
      previous &&
      previous.message === message &&
      previous.type === normalizedType &&
      previous.elapsed == null &&
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
      /** 右侧实时耗时（如 12.5s）；与 message 分离，避免换行错位 */
      elapsed: null,
    }
    logs.value.push(entry)
    if (logs.value.length > MAX_LOGS) logs.value.splice(0, logs.value.length - MAX_LOGS)
    hasUnread.value = true
    return entry.id
  }

  function clearLogs() {
    logs.value = []
    hasUnread.value = false
    clearLiveProgress()
  }

  function updateLog(id, value, type) {
    const entry = logs.value.find((log) => log.id === id)
    if (!entry) return
    const message = normalizeMessage(value)
    const progress = parsePhaseProgress(message)
    entry.message = progress ? progress.message : message
    if (progress) liveProgressIds[progress.phase] = id
    if (type && VALID_TYPES.has(type)) entry.type = type
  }

  /** 只刷新右侧耗时列，供烧录/擦除实时计时 */
  function setLogElapsed(id, elapsed) {
    const entry = logs.value.find((log) => log.id === id)
    if (!entry) return
    entry.elapsed = elapsed == null || elapsed === '' ? null : String(elapsed)
  }

  function markRead() {
    hasUnread.value = false
  }

  return { logs, hasUnread, addLog, updateLog, setLogElapsed, clearLogs, markRead, clearLiveProgress }
})

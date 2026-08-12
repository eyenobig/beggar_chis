import { ref } from 'vue'
import { defineStore } from 'pinia'
import { i18n } from '../i18n'
import zhCN from '../i18n/locales/zh-CN.json'
import en from '../i18n/locales/en.json'
import ja from '../i18n/locales/ja.json'
import ko from '../i18n/locales/ko.json'
import es from '../i18n/locales/es.json'
import fr from '../i18n/locales/fr.json'
import de from '../i18n/locales/de.json'
import ru from '../i18n/locales/ru.json'

const MAX_LOGS = 500
const DEDUPE_WINDOW_MS = 1000
const VALID_TYPES = new Set(['info', 'success', 'warn', 'error'])
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g
/** Strip trailing `· 12.3s` / `| 12.3s` from cfb progress lines */
const ELAPSED_TAIL = /\s*[|·•･・]\s*(\d+(?:\.\d+)?)s\s*$/u
/**
 * Phase + percent, optional cfb elapsed tail:
 * `löschen 4%` / `löschen 4% · 8.0s` / `erase 4%`
 */
const PHASE_PCT_LINE = /^(.+?)\s+(\d+)\s*%(?:\s*[|·•･・].*)?$/u

const LIVE_PROGRESS_KEY = '__progress__'
const LIVE_TOTAL_KEY = '__total__'

/** UI locale packs (beggar_chis) */
const UI_LOCALE_PACKS = Object.freeze({
  'zh-CN': zhCN,
  en,
  ja,
  ko,
  es,
  fr,
  de,
  ru,
})

/**
 * cfb CLI progress.label.* (chis-burner-cmd/src/i18n)
 * Must stay in sync with burner language packs — these are what stdout emits.
 */
const CFB_PROGRESS_LABELS = Object.freeze({
  erase: ['擦除', 'erase', 'löschen', 'effacer', 'borrar', '지우기', '消去', 'apagar', 'Стереть'],
  write: ['写入', 'write', 'schreiben', 'écrire', 'escribir', '쓰기', '書込', 'gravar', 'Запись', '编程', 'program', 'programming'],
  verify: ['校验', 'verify', 'prüfen', 'vérifier', 'verificar', '검증', '検証', '照合', 'Проверка'],
  dump: ['导出', 'dump', 'export', 'lesen', 'lire', 'leer', '읽기', '読取', '読出', '덤프', 'ler', 'Дамп', '读取', 'read', 'reading'],
})

function foldLabel(s) {
  return String(s || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim()
}

/** Build once: every UI + cfb phase label → erase|write|verify|dump */
function buildPhaseLabelMap() {
  const map = Object.create(null)

  for (const [phase, labels] of Object.entries(CFB_PROGRESS_LABELS)) {
    for (const label of labels) map[foldLabel(label)] = phase
  }

  for (const pack of Object.values(UI_LOCALE_PACKS)) {
    const phase = pack?.logs?.phase
    if (!phase || typeof phase !== 'object') continue
    for (const [key, label] of Object.entries(phase)) {
      if (typeof label === 'string' && label.trim()) map[foldLabel(label)] = key
    }
  }

  // Also register runtime i18n messages (covers hot-added packs)
  for (const loc of i18n.global.availableLocales || []) {
    const phase = i18n.global.getLocaleMessage(loc)?.logs?.phase
    if (!phase || typeof phase !== 'object') continue
    for (const [key, label] of Object.entries(phase)) {
      if (typeof label === 'string' && label.trim()) map[foldLabel(label)] = key
    }
  }

  return map
}

const PHASE_LABEL_MAP = buildPhaseLabelMap()

function phaseLabel(phaseKey) {
  return i18n.global.t(`logs.phase.${phaseKey}`)
}

function formatPhaseMessage(phaseKey, pct) {
  return `${phaseLabel(phaseKey)} ${pct}%`
}

function formatTotalMessage(time) {
  return i18n.global.t('logs.totalTime', { time: String(time) })
}

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

/**
 * Parse phase progress from UI or cfb language packs.
 * @returns {{ phase: string, pct: number, message: string, elapsed: string|null } | null}
 */
export function parsePhaseProgress(message) {
  const raw = String(message || '')
  const body = stripLogElapsed(raw)
  const m = PHASE_PCT_LINE.exec(body) || PHASE_PCT_LINE.exec(raw)
  if (!m) return null

  const token = m[1].trim()
  const pct = Number(m[2])
  const phase = PHASE_LABEL_MAP[foldLabel(token)] || null
  if (!phase || !Number.isFinite(pct)) return null

  const elapsedMatch = raw.match(ELAPSED_TAIL)
  return {
    phase,
    pct,
    message: formatPhaseMessage(phase, pct),
    elapsed: elapsedMatch?.[1] != null ? `${elapsedMatch[1]}s` : null,
  }
}

function isTotalTimeMessage(message) {
  const body = stripLogElapsed(String(message || ''))
  if (!/(\d+(?:\.\d+)?s|\d+m\d{2}s)\s*$/i.test(body)) return false
  for (const pack of Object.values(UI_LOCALE_PACKS)) {
    const tpl = pack?.logs?.totalTime
    if (typeof tpl !== 'string') continue
    const prefix = tpl.replace(/\{time\}/g, '').trim()
    if (prefix && foldLabel(body).startsWith(foldLabel(prefix))) return true
  }
  const sample = formatTotalMessage('0.0s')
  const prefix = sample.replace(/0\.0s\s*$/i, '').trim()
  return !!(prefix && foldLabel(body).startsWith(foldLabel(prefix)))
}

function isProgressBoundary(message) {
  return (
    /^(擦除|写入|校验|烧录|读取|导出).*(完成|失败|已中断)\b/.test(message)
    || /^(擦除卡带|烧录\s)/.test(message)
    || /\b(erase|write|verify|burn|dump|export)\b.*(complete|fail|abort|done|finished|ok)\b/i.test(message)
    || /整片擦除完毕/.test(message)
    || /^(Burn|Erase|Dump|Export)\b/i.test(message)
  )
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
      key === LIVE_TOTAL_KEY ? isTotalTimeMessage(log.message) : !!parsePhaseProgress(log.message),
    )
    if (existing) {
      if (existing.message !== message) existing.message = message
      if (elapsed !== undefined) existing.elapsed = elapsed
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

    const progress = parsePhaseProgress(message)
    if (progress) {
      return upsertLiveLine(LIVE_PROGRESS_KEY, progress.message, 'info', elapsed)
    }

    if (isTotalTimeMessage(message)) {
      const timeMatch = message.match(/(\d+(?:\.\d+)?s|\d+m\d{2}s)\s*$/i)
      const time = timeMatch ? timeMatch[1] : message
      return upsertLiveLine(LIVE_TOTAL_KEY, formatTotalMessage(time), 'info')
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
    delete liveProgressIds[LIVE_PROGRESS_KEY]
    delete liveProgressIds[LIVE_TOTAL_KEY]
  }

  function updateLog(id, value, type) {
    const entry = logs.value.find((log) => log.id === id)
    if (!entry) return
    const message = normalizeMessage(value)
    const progress = parsePhaseProgress(message)
    entry.message = progress ? progress.message : message
    if (progress) liveProgressIds[LIVE_PROGRESS_KEY] = id
    if (type && VALID_TYPES.has(type)) entry.type = type
  }

  function setLogElapsed(id, elapsed) {
    const entry = logs.value.find((log) => log.id === id)
    if (!entry) return
    entry.elapsed = elapsed == null || elapsed === '' ? null : String(elapsed)
  }

  function setSessionElapsed(elapsed) {
    if (elapsed == null || elapsed === '') return
    upsertLiveLine(LIVE_TOTAL_KEY, formatTotalMessage(elapsed), 'info')
  }

  function clearSessionElapsed() {
    delete liveProgressIds[LIVE_TOTAL_KEY]
  }

  function markRead() {
    hasUnread.value = false
  }

  return {
    logs,
    hasUnread,
    addLog,
    updateLog,
    setLogElapsed,
    setSessionElapsed,
    clearSessionElapsed,
    clearLogs,
    markRead,
    clearLiveProgress,
  }
})

// 独立 log store：所有日志的唯一来源（useEmulator 和 useCartData 均写入此处）。
import { ref } from 'vue'
import { defineStore } from 'pinia'

let _id = 0

export const useLogStore = defineStore('log', () => {
  const logs = ref([])
  const hasUnread = ref(false) // 有未读 log 时为 true，切换到 logs tab 后清除

  function addLog(message, type = 'info') {
    const now = new Date()
    const h = String(now.getHours()).padStart(2, '0')
    const m = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    const id = ++_id
    logs.value.push({ id, timeStr: `${h}:${m}:${s}`, message, type })
    hasUnread.value = true
    return id
  }

  function clearLogs() {
    logs.value = []
    hasUnread.value = false
    addLog('Console cleared.')
  }

  function updateLog(id, message) {
    const entry = logs.value.find(l => l.id === id)
    if (entry) entry.message = message
  }

  function markRead() {
    hasUnread.value = false
  }

  return { logs, hasUnread, addLog, updateLog, clearLogs, markRead }
})

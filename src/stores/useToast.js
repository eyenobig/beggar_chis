import { ref } from 'vue'
import { defineStore } from 'pinia'

let _seq = 0

export const useToast = defineStore('toast', () => {
  /** @type {import('vue').Ref<Array<{ id: number, message: string, type: 'info' | 'success' | 'error', createdAt: number }>>} */
  const toasts = ref([])
  /** 固定吐纸区高度（有纸=占用，无纸=0），供窗口预留，不再随纸无限增高 */
  const paperHeight = ref(0)

  /** 按 id 移除一条（烧录/擦除进度收尾用） */
  function dismiss(id) {
    if (id == null) return
    const next = toasts.value.filter((t) => t.id !== id)
    if (next.length !== toasts.value.length) toasts.value = next
  }

  /** 清空全部热敏提示（撕纸后调用）；占位高度由 EmulatorWidget 始终保留 */
  function clear() {
    if (toasts.value.length) toasts.value = []
    if (paperHeight.value !== 0) paperHeight.value = 0
  }

  /** 原地更新文案；识别进度用，避免每步新吐一行 */
  function upsert(id, message, type = 'info') {
    const text = String(message || '').trim()
    if (!text) return id ?? null
    if (id != null) {
      const idx = toasts.value.findIndex((t) => t.id === id)
      if (idx >= 0) {
        const copy = toasts.value.slice()
        copy[idx] = { ...copy[idx], message: text, type, createdAt: Date.now() }
        toasts.value = copy
        return id
      }
    }
    return push(text, type)
  }

  function setPaperHeight(px) {
    const next = Math.max(0, Math.ceil(Number(px) || 0))
    if (paperHeight.value !== next) paperHeight.value = next
  }

  /**
   * @param {string} message
   * @param {'info' | 'success' | 'error'} [type]
   */
  function push(message, type = 'info') {
    const text = String(message || '').trim()
    if (!text) return null
    const id = ++_seq
    toasts.value = [...toasts.value, { id, message: text, type, createdAt: Date.now() }]
    return id
  }

  function info(message) {
    return push(message, 'info')
  }

  function success(message) {
    return push(message, 'success')
  }

  function error(message) {
    return push(message, 'error')
  }

  return { toasts, paperHeight, push, upsert, info, success, error, dismiss, clear, setPaperHeight }
})

import { ref } from 'vue'
import { defineStore } from 'pinia'

let _seq = 0

export const useToast = defineStore('toast', () => {
  /** @type {import('vue').Ref<Array<{ id: number, message: string, type: 'info' | 'success' | 'error', createdAt: number }>>} */
  const toasts = ref([])
  /** 当前整张热敏纸高度，供窗口预留；随连续出纸变高 */
  const paperHeight = ref(0)

  /** 按 id 移除一条；连续出纸一般不删旧行，整叠清除用 clear() */
  function dismiss(id) {
    if (id == null) return
    const next = toasts.value.filter((t) => t.id !== id)
    if (next.length !== toasts.value.length) toasts.value = next
  }

  /** 清空全部热敏提示（撕纸后调用） */
  function clear() {
    if (toasts.value.length) toasts.value = []
    if (paperHeight.value !== 0) paperHeight.value = 0
  }

  function setPaperHeight(px) {
    const next = Math.max(0, Math.ceil(Number(px) || 0))
    if (paperHeight.value !== next) paperHeight.value = next
  }

  /**
   * 追加一条（连续出纸，不替换旧行）
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

  return { toasts, paperHeight, push, info, success, error, dismiss, clear, setPaperHeight }
})

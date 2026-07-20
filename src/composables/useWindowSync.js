import { onMounted, onUnmounted, ref } from 'vue'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'

// 根容器尺寸 → Tauri 窗口大小（ResizeObserver）。
// 返回 paused：左抽屉做"窗口左扩"时需要暂停本同步，改由调用方原子地一起设 size+position，避免抖动。
export function useWindowSync(elRef) {
  let ro = null
  const paused = ref(false)

  async function syncSize(width, height) {
    try {
      await getCurrentWindow().setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)))
    } catch (e) {
      if (window.__TAURI_INTERNALS__) console.error('[useWindowSync]', e)
    }
  }

  onMounted(() => {
    if (!elRef.value) return
    ro = new ResizeObserver((entries) => {
      if (paused.value) return
      const { width, height } = entries[0].contentRect
      syncSize(width, height)
    })
    ro.observe(elRef.value)
  })

  onUnmounted(() => ro?.disconnect())

  return { paused }
}

import { onMounted, onUnmounted, ref } from 'vue'
import { currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window'

// 根容器尺寸 → Tauri 窗口大小（ResizeObserver）。
// 必须用 border-box（含 padding），否则卡带舞台的 paddingTop 不会进窗口高度，白卡片会被 overflow:hidden 裁切。
// size 始终独立执行；仅在窗口顶部越界时拉回可视区。
export function useWindowSync(elRef) {
  let ro = null
  const paused = ref(false)

  async function ensureVisible(appWindow) {
    try {
      const [position, size, monitor] = await Promise.all([
        appWindow.outerPosition(),
        appWindow.outerSize(),
        currentMonitor(),
      ])
      if (!monitor) return
      const area = monitor.workArea || { position: monitor.position, size: monitor.size }
      const minY = area.position.y
      const maxY = area.position.y + area.size.height
      const targetY = Math.min(
        Math.max(position.y, minY),
        Math.max(minY, maxY - size.height),
      )
      if (targetY !== position.y) {
        await appWindow.setPosition(new PhysicalPosition(position.x, targetY))
      }
    } catch (e) {
      if (window.__TAURI_INTERNALS__) console.warn('[useWindowSync:visible]', e)
    }
  }

  async function syncSize(width, height) {
    const appWindow = getCurrentWindow()
    try {
      await appWindow.setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)))
    } catch (e) {
      if (window.__TAURI_INTERNALS__) console.error('[useWindowSync]', e)
    }
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await ensureVisible(appWindow)
  }

  /** contentRect 不含 padding；卡带 inset 在 paddingTop 上，必须读 border-box。 */
  function measureBorderBox(entry) {
    const box = Array.isArray(entry.borderBoxSize)
      ? entry.borderBoxSize[0]
      : entry.borderBoxSize
    if (box && (box.inlineSize > 0 || box.blockSize > 0)) {
      return { width: box.inlineSize, height: box.blockSize }
    }
    const el = entry.target
    return { width: el.offsetWidth, height: el.offsetHeight }
  }

  onMounted(() => {
    if (!elRef.value) return

    const push = (el) => {
      if (paused.value) return
      const width = el.offsetWidth
      const height = el.offsetHeight
      if (width < 1 || height < 1) return
      syncSize(width, height)
    }

    push(elRef.value)
    requestAnimationFrame(() => {
      if (elRef.value) push(elRef.value)
    })

    ro = new ResizeObserver((entries) => {
      if (paused.value) return
      const { width, height } = measureBorderBox(entries[0])
      if (width < 1 || height < 1) return
      syncSize(width, height)
    })
    ro.observe(elRef.value)
  })

  onUnmounted(() => ro?.disconnect())

  return { paused }
}

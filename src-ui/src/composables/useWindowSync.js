import { onMounted, onUnmounted, ref, watch } from 'vue'
import { currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window'

/**
 * 根容器尺寸 → Tauri 窗口大小。
 * 卡带/吐纸靠 padding 预留，测量必须含 padding；只应用最新一次 setSize。
 */
export function useWindowSync(elRef, deps = []) {
  let ro = null
  const paused = ref(false)
  let seq = 0
  let debounceTimer = 0
  let pending = null

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
      // 窗口高于工作区时无法完整显示，优先保证顶部（卡带）可见
      const targetY = Math.min(
        Math.max(position.y, minY),
        Math.max(minY, maxY - Math.min(size.height, area.size.height)),
      )
      if (targetY !== position.y) {
        await appWindow.setPosition(new PhysicalPosition(position.x, targetY))
      }
    } catch (e) {
      if (window.__TAURI_INTERNALS__) console.warn('[useWindowSync:visible]', e)
    }
  }

  async function syncSize(width, height, token) {
    if (token !== seq) return
    const appWindow = getCurrentWindow()
    try {
      await appWindow.setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)))
    } catch (e) {
      if (window.__TAURI_INTERNALS__) console.error('[useWindowSync]', e)
    }
    if (token !== seq) return
    await new Promise((resolve) => requestAnimationFrame(resolve))
    if (token !== seq) return
    await ensureVisible(appWindow)
  }

  function queueSize(width, height) {
    if (paused.value) return
    if (width < 1 || height < 1) return
    pending = { width, height }
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (!pending || paused.value) return
      const { width: w, height: h } = pending
      pending = null
      const token = ++seq
      void syncSize(w, h, token)
    }, 16)
  }

  /** 显式计入 padding，避免 WebView 把 border-box 量矮导致裁切白卡片/吐纸 */
  function measureRoot(el) {
    if (!el) return { width: 0, height: 0 }
    const style = getComputedStyle(el)
    const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
    const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
    const rect = el.getBoundingClientRect()

    let flowBottom = 0
    let flowRight = 0
    for (const child of el.children) {
      const cs = getComputedStyle(child)
      if (cs.display === 'none') continue
      if (cs.position === 'absolute' || cs.position === 'fixed') continue
      flowBottom = Math.max(flowBottom, child.offsetTop + child.offsetHeight)
      flowRight = Math.max(flowRight, child.offsetLeft + child.offsetWidth)
    }

    const width = Math.max(el.offsetWidth, Math.ceil(rect.width), Math.ceil(flowRight + padX))
    const height = Math.max(el.offsetHeight, Math.ceil(rect.height), Math.ceil(flowBottom + padY))

    return { width, height }
  }

  function push() {
    if (!elRef.value || paused.value) return
    const { width, height } = measureRoot(elRef.value)
    queueSize(width, height)
  }

  onMounted(() => {
    if (!elRef.value) return

    push()
    requestAnimationFrame(push)
    setTimeout(push, 50)
    setTimeout(push, 200)
    setTimeout(push, 500)

    ro = new ResizeObserver(() => {
      push()
    })
    ro.observe(elRef.value)
  })

  // 卡带/吐纸 padding 变化时强制再测（有时只改 style 不触发 RO）
  if (deps.length) {
    watch(deps, () => {
      requestAnimationFrame(push)
      setTimeout(push, 32)
    })
  }

  onUnmounted(() => {
    clearTimeout(debounceTimer)
    seq += 1
    ro?.disconnect()
  })

  return { paused, resync: push }
}

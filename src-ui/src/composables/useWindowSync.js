import { onMounted, onUnmounted, ref, watch } from 'vue'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'

/**
 * 根容器尺寸 → Tauri 窗口大小。
 * 卡带/吐纸靠 padding 预留，测量必须含 padding；只应用最新一次 setSize。
 *
 * 窗口位置完全由用户手动控制：setSize 只改大小、锚定左上角，绝不自动挪位——
 * 任何"保证可见"的钳制都会在用户故意把窗口拖出屏幕（如 200% 缩放时够到底部
 * 设置项）时把窗口拽回去，已按用户要求移除。
 */
export function useWindowSync(elRef, deps = []) {
  let ro = null
  const paused = ref(false)
  let seq = 0
  let debounceTimer = 0
  let pending = null

  async function syncSize(width, height, token) {
    if (token !== seq) return
    const appWindow = getCurrentWindow()
    try {
      await appWindow.setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)))
    } catch (e) {
      if (window.__TAURI_INTERNALS__) console.error('[useWindowSync]', e)
    }
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
    if (!el) return { width: 0, height: 0, zoom: 1 }
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

    // CSS zoom（UI 缩放）下 gBCR 返回的是缩放后的客户端 px，offset*/padding 是本地 px；
    // 统一归一到本地 px 再乘 zoom，窗口逻辑尺寸 = 布局尺寸 × zoom
    const zoom = parseFloat(document.documentElement.style.zoom) || 1
    const width = Math.max(el.offsetWidth, Math.ceil(rect.width / zoom), Math.ceil(flowRight + padX))
    const height = Math.max(el.offsetHeight, Math.ceil(rect.height / zoom), Math.ceil(flowBottom + padY))

    return { width, height, zoom }
  }

  function push() {
    if (!elRef.value || paused.value) return
    const { width, height, zoom } = measureRoot(elRef.value)
    queueSize(Math.round(width * zoom), Math.round(height * zoom))
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

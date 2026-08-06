/**
 * 在 overflow 容器上按住拖动即可滚动。
 * 超过移动阈值后滚动并吞掉 click；未移动则保留按钮点击。
 */
export function useDragScroll() {
  const THRESHOLD = 4

  let tracking = false
  let dragging = false
  let suppressClick = false
  let pointerId = null
  let startY = 0
  let startScrollTop = 0
  /** @type {HTMLElement | null} */
  let el = null

  function onPointerDown(event) {
    if (event.button !== 0) return
    // 表单控件保留原生交互；按钮/卡片可拖过阈值后滚动并取消点击
    if (event.target?.closest?.('input, select, textarea, [data-no-drag-scroll]')) return
    const node = event.currentTarget
    if (!(node instanceof HTMLElement)) return
    if (node.scrollHeight <= node.clientHeight + 1) return

    tracking = true
    dragging = false
    pointerId = event.pointerId
    startY = event.clientY
    startScrollTop = node.scrollTop
    el = node
    // 不能在 pointerdown 就 setPointerCapture：Chromium 会把捕获期间的 click
    // 重定向到捕获元素（容器），面板可滚时按钮点击全部失效（Tauri 紧凑窗口必现）。
    // 改为越过阈值、真正开始拖动滚动时再捕获。
  }

  function onPointerMove(event) {
    if (!tracking || event.pointerId !== pointerId || !el) return
    const delta = event.clientY - startY
    if (!dragging && Math.abs(delta) < THRESHOLD) return
    if (!dragging) el.setPointerCapture?.(event.pointerId)
    dragging = true
    el.scrollTop = startScrollTop - delta
    event.preventDefault()
  }

  function endPointer(event) {
    if (!tracking) return
    if (event?.pointerId != null && event.pointerId !== pointerId) return
    const node = el
    if (dragging) suppressClick = true
    tracking = false
    dragging = false
    pointerId = null
    el = null
    try {
      node?.releasePointerCapture?.(event.pointerId)
    } catch {
      /* already released */
    }
  }

  function onClickCapture(event) {
    if (!suppressClick) return
    suppressClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  return {
    scrollBind: {
      onPointerdown: onPointerDown,
      onPointermove: onPointerMove,
      onPointerup: endPointer,
      onPointercancel: endPointer,
      onLostpointercapture: endPointer,
      onClickCapture,
    },
  }
}

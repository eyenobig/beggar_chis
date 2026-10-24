/**
 * UI 整体缩放：在根节点施加 CSS zoom，等比放大布局像素。
 *
 * 关键约束：窗口尺寸由 useWindowSync 独占（测量根容器 CSS 尺寸 → setSize）。
 * 因此绝不能用 webview setZoom + 手动 setSize——zoom 不改变 CSS 布局像素，
 * ResizeObserver 量到的仍是原始尺寸，会立刻把窗口改回去，缩放永远不生效。
 * CSS zoom 让布局整体放大，useWindowSync 自动跟随（含抽屉展开等状态宽度）。
 */
export const UI_SCALE_MIN = 0.75
export const UI_SCALE_MAX = 2
export const UI_SCALE_STEP = 0.05

const round2 = (n) => Math.round(n * 100) / 100

/** 夹到范围内并按步进吸附（消浮点尘埃）；非法值回退 1。 */
export function normalizeUiScale(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 1
  const snapped = Math.round((n - UI_SCALE_MIN) / UI_SCALE_STEP) * UI_SCALE_STEP + UI_SCALE_MIN
  return round2(Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, snapped)))
}

/** 应用缩放：根节点 CSS zoom；窗口尺寸交由 useWindowSync 跟随。幂等，浏览器 dev 同样生效。 */
export function applyUiScale(scale) {
  const s = normalizeUiScale(scale)
  if (typeof document === 'undefined') return
  document.documentElement.style.zoom = s === 1 ? '' : String(s)
  // zoom 不改变布局 px，根容器的 ResizeObserver 不会触发；
  // 显式通知 EmulatorWidget 重测根容器并把窗口调到 布局尺寸 × zoom
  window.dispatchEvent(new CustomEvent('ui-scale-applied'))
}

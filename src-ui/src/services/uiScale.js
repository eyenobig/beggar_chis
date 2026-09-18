/**
 * UI 整体缩放：等比调整内容渲染（webview zoom）+ 窗口尺寸。
 *
 * 基准尺寸 = tauri.conf.json 的初始窗口（376×780 逻辑像素）。
 * 缩放后窗口必须同比放大，否则固定窗口内容会被裁切。
 * setZoom 需 ACL `core:webview:allow-set-webview-zoom`；失败时静默（仅窗口缩放无效但布局仍可用）。
 */
import { inTauri } from './cfb'

export const UI_SCALE_BASE = { w: 376, h: 780 }

/** 允许的档位（与设置页下拉一致）。 */
export const UI_SCALE_OPTIONS = [0.9, 1, 1.1, 1.2, 1.25, 1.5]

export function normalizeUiScale(v) {
  const n = Number(v)
  return UI_SCALE_OPTIONS.includes(n) ? n : 1
}

/** 应用缩放：zoom 内容 + 等比放大窗口。幂等；非 Tauri 环境静默跳过。 */
export async function applyUiScale(scale) {
  const s = normalizeUiScale(scale)
  if (!inTauri) return
  try {
    const [{ getCurrentWebview }, { getCurrentWindow, LogicalSize }] = await Promise.all([
      import('@tauri-apps/api/webview'),
      import('@tauri-apps/api/window'),
    ])
    await getCurrentWebview().setZoom(s).catch(() => {})
    await getCurrentWindow().setSize(
      new LogicalSize(Math.round(UI_SCALE_BASE.w * s), Math.round(UI_SCALE_BASE.h * s)),
    )
  } catch {
    /* 缩放失败不阻塞启动 */
  }
}

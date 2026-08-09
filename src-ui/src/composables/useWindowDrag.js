// 窗口拖动：按住左键调用 startDragging() 拖动整个窗口
import { getCurrentWindow } from "@tauri-apps/api/window";

// 交互元素一律放行：startDragging 会吞掉后续 click，绝不能对按钮/表单/滚动区触发
const NO_DRAG_SELECTOR =
  'button, a, input, select, textarea, label, [role="button"], [data-no-drag], [data-drawer-scroll]';

export function useWindowDrag() {
  // 浏览器直开 Vite 时无 Tauri 运行时；避免 setup 抛错导致整页白屏（便于 z-index 等 UI 验证）
  let appWindow = null;
  try {
    appWindow = getCurrentWindow();
  } catch {
    /* non-Tauri */
  }

  async function onDragMouseDown(e) {
    if (!appWindow) return;
    if (e.button !== 0) return; // 只响应左键
    if (e.target?.closest?.(NO_DRAG_SELECTOR)) return; // 标记/交互区域不触发拖动
    await appWindow.startDragging();
  }

  return { onDragMouseDown };
}

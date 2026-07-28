// 窗口拖动：按住左键调用 startDragging() 拖动整个窗口
import { getCurrentWindow } from "@tauri-apps/api/window";

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
    if (e.target.closest("[data-no-drag]")) return; // 标记区域不触发拖动
    await appWindow.startDragging();
  }

  return { onDragMouseDown };
}

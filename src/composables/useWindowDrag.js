// 窗口拖动：按住左键调用 startDragging() 拖动整个窗口
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useWindowDrag() {
  const appWindow = getCurrentWindow();

  async function onDragMouseDown(e) {
    if (e.button !== 0) return; // 只响应左键
    if (e.target.closest("[data-no-drag]")) return; // 标记区域不触发拖动
    await appWindow.startDragging();
  }

  return { onDragMouseDown };
}

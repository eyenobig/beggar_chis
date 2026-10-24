// 窗口拖动：JS 驱动（pointermove → setPosition），不用系统 startDragging。
// 原因：系统模态拖拽循环会把位于屏幕外的窗口钳回可见区——窗口被 Alt+方向键
// 推到屏幕上方外后，一点击头部（进入系统拖拽）窗口就被拽回（真机实测）。
// JS 拖拽无此限制；rAF 节流 setPosition，pointer capture 保证快速拖动不丢事件。
import { getCurrentWindow, LogicalPosition } from "@tauri-apps/api/window";

// 交互元素一律放行：绝不能对按钮/表单/滚动区触发拖动
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

  let dragging = false;
  let start = null; // { winX, winY: 窗口物理坐标; cssX, cssY: 光标 CSS 坐标; scale }
  let raf = 0;
  let targetPhys = null;

  function onMove(e) {
    if (!dragging || !start) return;
    const dpr = window.devicePixelRatio || 1;
    targetPhys = {
      x: start.winX + (e.screenX - start.cssX) * dpr,
      y: start.winY + (e.screenY - start.cssY) * dpr,
    };
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!targetPhys || !appWindow || !start) return;
        const p = targetPhys;
        targetPhys = null;
        appWindow
          .setPosition(
            new LogicalPosition(Math.round(p.x / start.scale), Math.round(p.y / start.scale)),
          )
          .catch(() => {});
      });
    }
  }

  function onEnd() {
    dragging = false;
    start = null;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    targetPhys = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onEnd);
    window.removeEventListener("pointercancel", onEnd);
  }

  function onDragMouseDown(e) {
    if (!appWindow) return;
    if (e.button !== 0) return; // 只响应左键
    if (e.target?.closest?.(NO_DRAG_SELECTOR)) return; // 标记/交互区域不触发拖动
    e.preventDefault();
    Promise.all([appWindow.outerPosition(), appWindow.scaleFactor()])
      .then(([pos, scale]) => {
        dragging = true;
        start = { winX: pos.x, winY: pos.y, cssX: e.screenX, cssY: e.screenY, scale };
        // pointer capture：光标移出窗口边界（快速拖动）时 move/up 事件不丢
        try {
          e.target?.setPointerCapture?.(e.pointerId);
        } catch {
          /* 某些目标不可 capture */
        }
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onEnd);
        window.addEventListener("pointercancel", onEnd);
      })
      .catch((err) => console.warn("[useWindowDrag]", err));
  }

  return { onDragMouseDown };
}

//! ⌘P 窗口截图：截取本应用主窗口（含当前连接/卡带/任务状态）存 PNG 到桌面。
//!
//! 前端在应用内监听 Cmd/Ctrl+P 触发（非全局热键，不抢系统打印快捷键）。
//! macOS 首次使用会请求「屏幕录制」权限；拒绝或失败时把原因返回给前端 toast。

use tauri::{AppHandle, Manager};

const WINDOW_TITLE_MARK: &str = "Chis Flasher";

#[tauri::command]
pub fn screenshot_window(app: AppHandle) -> Result<String, String> {
    let windows = xcap::Window::all().map_err(|e| format!("枚举窗口失败: {e}"))?;
    let win = windows
        .into_iter()
        .find(|w| w.title().map(|t| t.contains(WINDOW_TITLE_MARK)).unwrap_or(false))
        .ok_or_else(|| "未找到应用窗口".to_string())?;
    let img = win.capture_image().map_err(|e| format!("截图失败: {e}"))?;
    if img.width() == 0 || img.height() == 0 {
        return Err("截图内容为空：请在 系统设置 → 隐私与安全性 → 屏幕录制 中允许本应用".into());
    }

    let dir = app
        .path()
        .desktop_dir()
        .map_err(|e| format!("无法定位桌面目录: {e}"))?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path = dir.join(format!("chis-flasher-{ts}.png"));
    img.save(&path).map_err(|e| format!("写入 PNG 失败: {e}"))?;

    // 保存后在访达/资源管理器里定位（失败不影响结果）
    let _ = tauri_plugin_opener::reveal_item_in_dir(&path);
    Ok(path.to_string_lossy().into_owned())
}

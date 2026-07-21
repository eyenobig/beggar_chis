#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init()) // 允许前端以 sidecar 方式驱动 cfb
        .plugin(tauri_plugin_dialog::init()) // ROM、安装目录选择
        .setup(|_app| {
            // dev 模式自动打开 devtools，便于查看 JS console.log
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                if let Some(w) = _app.get_webview_window("main") {
                    w.open_devtools();
                }
            }
            // 设备热插拔监听与 SkyEmu 启动逻辑已移除：全部统一走 cfb sidecar。
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

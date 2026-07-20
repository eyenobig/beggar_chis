mod device_watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init()) // 用于以 sidecar 方式驱动 cfb（chis-burner-cmd）
        .setup(|app| {
            // dev 模式自动打开 devtools，便于查看 JS console.log
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                if let Some(w) = app.get_webview_window("main") {
                    w.open_devtools();
                }
            }
            device_watcher::start(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

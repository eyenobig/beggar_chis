#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;
    use tauri_plugin_global_shortcut::ShortcutState;

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init()) // 允许前端以 sidecar 方式驱动 cfb
        .plugin(tauri_plugin_dialog::init()) // ROM、安装目录选择
        .plugin(tauri_plugin_http::init()) // WebView CORS 旁路：payload / storefront API
        // 老板键：全局快捷键切换窗口显隐（隐藏不退出，烧录任务不受影响）。
        // 快捷键本体不在此注册——由前端启动时按设置调用 set_boss_shortcut 应用
        //（默认 mac ⌘B / Windows Ctrl+B，可在设置页改键/关闭）。
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    if let Some(w) = app.get_webview_window("main") {
                        if w.is_visible().unwrap_or(false) {
                            let _ = w.hide();
                        } else {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(),
        )
            .manage(toolchain::CfbChildren::default()) // 直连 bin 模式下 cfb_spawn 启动的子进程表
            .manage(bosskey::BossKeyState(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            bosskey::set_boss_shortcut,
            bosskey::clear_boss_shortcut,
            screenshot::screenshot_window,
            download::download_file,
            download::extract_zip_exe,
            download::file_size,
            skyemu_launch::launch_skyemu,
            toolchain::git_head_sha,
            toolchain::git_pull,
            toolchain::rebuild_cfb_sidecar,
            toolchain::sidecar_triple,
            toolchain::sidecar_binaries_dir,
            toolchain::read_cargo_version,
            toolchain::detect_default_cfb_bin,
            toolchain::detect_default_rule_dir,
            toolchain::bootstrap_toolchain_paths,
            toolchain::sync_local_paths_json,
            toolchain::install_dir,
            toolchain::resolve_cfb_binary,
            toolchain::cfb_exec,
            toolchain::cfb_spawn,
            toolchain::cfb_kill_process
        ])
        .on_page_load(|webview, payload| {
            // 透明窗口 visible:false 的显示兜底：页面加载完成后若前端 show() 因故未执行
            // （如隐藏窗口 rAF 被暂停），200ms 后由 Rust 侧显示。仅首次生效，不影响老板键。
            use tauri::Manager;
            use tauri::webview::PageLoadEvent;
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            static SHOWN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
            if SHOWN.swap(true, std::sync::atomic::Ordering::SeqCst) {
                return;
            }
            let handle = webview.app_handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(200));
                if let Some(w) = handle.get_webview_window("main") {
                    if !w.is_visible().unwrap_or(false) {
                        let _ = w.show();
                    }
                }
            });
        })
        .setup(|_app| {
            // 老板键不再在此硬编码注册：前端启动时按设置调用 set_boss_shortcut 应用
            // 仅 debug 构建自动开 DevTools；release / 安装包默认关闭。
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                if let Some(w) = _app.get_webview_window("main") {
                    w.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

mod bosskey;
mod screenshot;
mod cfb_config;
mod download;
mod skyemu_launch;
mod toolchain;
mod toolchain_update;

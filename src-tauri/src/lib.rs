#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init()) // 允许前端以 sidecar 方式驱动 cfb
        .plugin(tauri_plugin_dialog::init()) // ROM、安装目录选择
        .plugin(tauri_plugin_http::init()) // WebView CORS 旁路：payload / storefront API
            .manage(toolchain::CfbChildren::default()) // 直连 bin 模式下 cfb_spawn 启动的子进程表
        .invoke_handler(tauri::generate_handler![
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
        .setup(|_app| {
            // 自动打开 devtools，便于查看 JS console（临时调试：release 也开）
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

mod cfb_config;
mod download;
mod skyemu_launch;
mod toolchain;
mod toolchain_update;

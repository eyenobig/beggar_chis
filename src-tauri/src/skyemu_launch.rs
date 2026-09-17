use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::AppHandle;

/// 写入 DirectPlay 配置 ROM，并以该路径为 argv[1] 启动 eyenobig/SkyEmu。
///
/// 配置写到 SkyEmu 用户目录 `directplay/`（与模拟器侧一致），不要写 exe 旁。
///
/// GBA（`mbc=false`）:
/// ```text
/// READREALTIME
/// <rom_size_bytes>
/// SERIAL
/// AUTO
/// AUTO
/// ```
/// 口行 AUTO：SkyEmu `cfb_refresh` 按 kind=gba 选台。末行 AUTO：`cfb save-probe`。
///
/// GB/GBC（`mbc=true`）:
/// ```text
/// READREALTIME
/// <rom_size_bytes, 0=从卡带头识别>
/// SERIAL
/// AUTO
/// ```
/// 扩展名必须是 `.gb` / `.gbc`，SkyEmu 才走 GB 总线。
#[tauri::command]
pub fn launch_skyemu(
    app: AppHandle,
    exe: String,
    serial_port: Option<String>,
    rom_size: Option<u64>,
    mbc: Option<bool>,
    cfb_bin: Option<String>,
) -> Result<String, String> {
    let mut exe_path = PathBuf::from(exe.trim());
    // mac 手选的是 .app 包（目录）：解析到内层二进制 Contents/MacOS/<name>
    if exe_path.is_dir() && exe_path.extension().map(|e| e.eq_ignore_ascii_case("app")).unwrap_or(false)
    {
        let stem = exe_path
            .file_stem()
            .and_then(|s| s.to_str())
            .ok_or_else(|| "无法解析 .app 名称".to_string())?;
        let inner = exe_path.join("Contents/MacOS").join(stem);
        if inner.is_file() {
            exe_path = inner;
        }
    }
    if !exe_path.is_file() {
        return Err(format!("SkyEmu 可执行文件不存在: {}", exe_path.display()));
    }

    let cwd = exe_path
        .parent()
        .ok_or_else(|| "无法解析 SkyEmu 所在目录".to_string())?;

    let is_mbc = mbc.unwrap_or(false);
    // 烧丐启动一律 AUTO：SkyEmu 用 cfb detect 按 kind=gba / gb_mbc 选口。
    // serial_port 保留给旧前端签名，不再钉 COM。
    let _ = serial_port;
    let port = launch_serial_port();
    // GB: 0 = 从卡带头 0x148 识别真实 ROM 大小。烧录器 CFI 报的是 flash 芯片容量
    // （常见 32MB），拿去当 GB ROM 窗口会把模拟器撑爆。
    // GBA: 缺省仍用 32MB 窗口，有实测容量则用实测值。
    let size = if is_mbc {
        rom_size.unwrap_or(0)
    } else {
        rom_size.unwrap_or(32 * 1024 * 1024).max(1)
    };
    let name = if is_mbc {
        "virtual_rom.gb"
    } else {
        "virtual_rom.gba"
    };
    let dir = directplay_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("创建 DirectPlay 目录失败: {e}"))?;
    let rom_path = dir.join(name);
    // SkyEmu 解析要求 LF；用 \n 避免 Windows 写文件时变成 CRLF 后再被二次转换。
    let config = directplay_config(is_mbc, size, &port);
    std::fs::write(&rom_path, config.as_bytes())
        .map_err(|e| format!("写入 {name} 失败: {e}"))?;

    // 与烧丐 Settings / sidecar 同一份 cfb，避免 SkyEmu 再下一份或用 exe 旁旧副本。
    let cfb = crate::toolchain::resolve_runtime_cfb(&app, cfb_bin.as_deref());
    let child = spawn_skyemu(&exe_path, &rom_path, cwd, cfb.as_deref())?;
    Ok(format!("{}|{}", rom_path.to_string_lossy(), child.id()))
}

fn directplay_config(mbc: bool, rom_size: u64, port: &str) -> String {
    if mbc {
        format!("READREALTIME\n{rom_size}\nSERIAL\n{port}\n")
    } else {
        format!("READREALTIME\n{rom_size}\nSERIAL\n{port}\nAUTO\n")
    }
}

/// 与 SkyEmu `SDL_GetPrefPath("Sky","SkyEmu")` + `directplay/` 对齐。
fn directplay_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            if !appdata.is_empty() {
                return PathBuf::from(appdata)
                    .join("Sky")
                    .join("SkyEmu")
                    .join("directplay");
            }
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            if !local.is_empty() {
                return PathBuf::from(local)
                    .join("SkyEmu")
                    .join("directplay");
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            if !home.is_empty() {
                return PathBuf::from(home)
                    .join("Library")
                    .join("Application Support")
                    .join("Sky")
                    .join("SkyEmu")
                    .join("directplay");
            }
        }
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        if let Ok(home) = std::env::var("HOME") {
            if !home.is_empty() {
                return PathBuf::from(home)
                    .join(".local")
                    .join("share")
                    .join("Sky")
                    .join("SkyEmu")
                    .join("directplay");
            }
        }
    }
    std::env::temp_dir().join("SkyEmu").join("directplay")
}

/// 烧丐启动口：永远 AUTO。多烧录器时由 SkyEmu `cfb_refresh` 按 .gba / .gb 选 kind。
fn launch_serial_port() -> String {
    "AUTO".to_string()
}

fn normalize_serial_port(port: &str) -> String {
    let p = port.trim();
    if p.is_empty() || p.eq_ignore_ascii_case("AUTO") {
        return "AUTO".to_string();
    }
    #[cfg(windows)]
    {
        // SkyEmu 开串口会自己加 \\.\ ；配置里只写 COM7，避免双重前缀。
        const WIN_DEV_PREFIX: &str = r"\\.\";
        if let Some(rest) = p.strip_prefix(WIN_DEV_PREFIX) {
            return rest.to_string();
        }
    }
    p.to_string()
}

/// 清理残留的 SkyEmu 进程 (孤儿: 上次会话退出后仍占用串口)。
fn kill_stale_skyemu() {
    #[cfg(windows)]
    let _ = Command::new("taskkill").args(["/F", "/IM", "SkyEmu.exe"]).output();
    #[cfg(not(windows))]
    let _ = Command::new("pkill").arg("-f").arg("SkyEmu").output();
}

fn spawn_skyemu(exe: &Path, rom: &Path, cwd: &Path, cfb_bin: Option<&str>) -> Result<std::process::Child, String> {
    // 清理残留的 SkyEmu 孤儿进程: 它若还开着串口, 新会话会打不开
    kill_stale_skyemu();
    let mut cmd = Command::new(exe);
    cmd.arg(rom).current_dir(cwd);
    if let Some(bin) = cfb_bin.map(str::trim).filter(|s| !s.is_empty()) {
        cmd.env("CFB_BIN", bin);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // 独立进程，不挂在宿主控制台上。
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        const DETACHED_PROCESS: u32 = 0x00000008;
        cmd.creation_flags(CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS);
    }
    cmd.spawn()
        .map_err(|e| format!("启动 SkyEmu 失败: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gba_config_asks_skyemu_to_probe_save() {
        let s = directplay_config(false, 32 * 1024 * 1024, "AUTO");
        assert_eq!(
            s,
            "READREALTIME\n33554432\nSERIAL\nAUTO\nAUTO\n",
            "口 AUTO 时存档也应 AUTO：口由 cfb 按 kind=gba 选，存档走 save-probe"
        );
    }

    #[test]
    fn beggar_launch_always_auto() {
        assert_eq!(launch_serial_port(), "AUTO", "烧丐启动必须 AUTO，不能钉已选 COM");
        assert_eq!(
            directplay_config(false, 32 * 1024 * 1024, &launch_serial_port()),
            "READREALTIME\n33554432\nSERIAL\nAUTO\nAUTO\n",
            "GBA 启动配置口必须是 AUTO"
        );
        assert_eq!(
            directplay_config(true, 0, &launch_serial_port()),
            "READREALTIME\n0\nSERIAL\nAUTO\n",
            "GB 启动配置口必须是 AUTO；size=0 从头识别"
        );
    }

    #[test]
    fn gba_config_format_can_pin_com_for_skyemu_play() {
        let s = directplay_config(false, 16 * 1024 * 1024, "COM7");
        assert_eq!(
            s,
            "READREALTIME\n16777216\nSERIAL\nCOM7\nAUTO\n",
            "格式器仍能写 COM（SkyEmu 侧栏点某台 Play）；烧丐启动不走这条"
        );
    }

    #[test]
    fn gb_config_uses_header_sized_rom() {
        let s = directplay_config(true, 0, "AUTO");
        assert_eq!(
            s,
            "READREALTIME\n0\nSERIAL\nAUTO\n",
            "GB 配置 size=0 从头识别；烧丐口为 AUTO"
        );
    }

    #[test]
    fn windows_com_strips_device_prefix() {
        let p = normalize_serial_port(r"\\.\COM13");
        #[cfg(windows)]
        assert_eq!(p, "COM13", "配置里只留 COM13，开串口由 SkyEmu 加 \\\\.\\");
        #[cfg(not(windows))]
        assert_eq!(p, r"\\.\COM13");
    }

    #[test]
    fn empty_port_is_auto() {
        assert_eq!(normalize_serial_port(""), "AUTO");
        assert_eq!(normalize_serial_port("auto"), "AUTO");
    }

    #[test]
    fn directplay_dir_is_not_exe_adjacent() {
        let dir = directplay_dir();
        let name = dir.file_name().and_then(|s| s.to_str()).unwrap_or("");
        assert_eq!(name, "directplay", "假 ROM 必须落在 directplay 子目录: {dir:?}");
    }
}


/// 监控 SkyEmu 进程, 退出后自动 cfb detect (恢复 chis-flasher 对烧录器的控制)。
/// 前端在 launch 成功后调用, 传入 spawn 返回的 pid。
#[tauri::command]
pub async fn skyemu_watch_exit(
    app: AppHandle,
    pid: u32,
) -> Result<(), String> {
        tauri::async_runtime::spawn(async move {
        // 轮询等待进程退出 (Windows 无 waitpid, 用任务管理器思路: 检查进程存在)
        loop {
            #[cfg(windows)]
            let alive = std::process::Command::new("tasklist")
                .args(["/FI", &format!("PID eq {pid}"), "/NH"])
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
                .unwrap_or(true);
            #[cfg(not(windows))]
            let alive = std::path::Path::new(&format!("/proc/{pid}")).exists();

            if !alive {
                log_printf(&format!("SkyEmu (pid {pid}) exited; re-detecting burner..."));
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(1000));
        }
        // 退出后: cfb detect 让应用恢复设备列表 (走 toolchain::cfb_exec 的 detect)
        let _ = crate::toolchain::cfb_detect_after_skyemu(app).await;
    });
    Ok(())
}

fn log_printf(msg: &str) {
    println!("[skyemu_launch] {msg}");
}
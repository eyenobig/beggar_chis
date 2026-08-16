use std::path::{Path, PathBuf};
use std::process::Command;

/// 写入 DirectPlay 配置 ROM，并以该路径为 argv[1] 启动 ChisBread SkyEmu。
///
/// 配置格式见 DirectPlayV0.3 release notes：
/// ```text
/// READREALTIME
/// <rom_size_bytes>
/// SERIAL
/// <port|AUTO>
/// <backup|AUTO>
/// ```
#[tauri::command]
pub fn launch_skyemu(
    exe: String,
    serial_port: Option<String>,
    rom_size: Option<u64>,
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

    let dir = exe_path
        .parent()
        .ok_or_else(|| "无法解析 SkyEmu 所在目录".to_string())?;
    let rom_path = dir.join("virtual_rom.gba");

    let port = normalize_serial_port(serial_port.as_deref().unwrap_or("AUTO"));
    let size = rom_size.unwrap_or(32 * 1024 * 1024).max(1);
    // SkyEmu 解析要求 LF；用 \n 避免 Windows 写文件时变成 CRLF 后再被二次转换。
    let config = format!("READREALTIME\n{size}\nSERIAL\n{port}\nAUTO\n");
    std::fs::write(&rom_path, config.as_bytes())
        .map_err(|e| format!("写入 virtual_rom.gba 失败: {e}"))?;

    spawn_skyemu(&exe_path, &rom_path, dir)?;
    Ok(rom_path.to_string_lossy().into_owned())
}

fn normalize_serial_port(port: &str) -> String {
    let p = port.trim();
    if p.is_empty() || p.eq_ignore_ascii_case("AUTO") {
        return "AUTO".to_string();
    }
    #[cfg(windows)]
    {
        // CreateFile 对 COM10+ 需要 \\.\COMx；SkyEmu AUTO 路径也用此形式。
        const WIN_DEV_PREFIX: &str = r"\\.\";
        if let Some(rest) = p.strip_prefix(WIN_DEV_PREFIX) {
            return format!("{WIN_DEV_PREFIX}{rest}");
        }
        if p.len() >= 4 && p[..3].eq_ignore_ascii_case("COM") {
            return format!("{WIN_DEV_PREFIX}{p}");
        }
    }
    p.to_string()
}

fn spawn_skyemu(exe: &Path, rom: &Path, cwd: &Path) -> Result<(), String> {
    let mut cmd = Command::new(exe);
    cmd.arg(rom).current_dir(cwd);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // 独立进程，不挂在宿主控制台上。
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        const DETACHED_PROCESS: u32 = 0x00000008;
        cmd.creation_flags(CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS);
    }
    cmd.spawn()
        .map_err(|e| format!("启动 SkyEmu 失败: {e}"))?;
    Ok(())
}

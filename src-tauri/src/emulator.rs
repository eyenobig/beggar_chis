use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const SKYEMU_VERSION: &str = "DirectPlayV0.6";
const SKYEMU_WINDOWS_URL: &str = "https://github.com/ChisBread/SkyEmu/releases/download/DirectPlayV0.6/SkyEmu-DirectPlayV0.6-win-x64.zip";

#[tauri::command]
pub async fn install_skyemu(destination: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || install_skyemu_blocking(&destination))
        .await
        .map_err(|error| format!("SkyEmu install task failed: {error}"))?
}

#[cfg(target_os = "windows")]
fn install_skyemu_blocking(destination: &str) -> Result<String, String> {
    let destination = PathBuf::from(destination);
    if !destination.is_dir() {
        return Err("The selected download directory does not exist.".into());
    }

    let install_dir = destination.join(format!("SkyEmu-{SKYEMU_VERSION}"));
    fs::create_dir_all(&install_dir).map_err(|error| error.to_string())?;
    let archive = install_dir.join("SkyEmu.zip");

    let script = format!(
        "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '{}' -OutFile '{}'; Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force; Remove-Item -LiteralPath '{}' -Force",
        SKYEMU_WINDOWS_URL,
        quote_ps_path(&archive),
        quote_ps_path(&archive),
        quote_ps_path(&install_dir),
        quote_ps_path(&archive),
    );

    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .output()
        .map_err(|error| format!("Unable to start PowerShell: {error}"))?;

    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(if message.is_empty() { "SkyEmu download failed.".into() } else { message });
    }

    find_skyemu(&install_dir)
        .map(|path| path.to_string_lossy().into_owned())
        .ok_or_else(|| "Download completed, but SkyEmu.exe was not found.".into())
}

#[cfg(not(target_os = "windows"))]
fn install_skyemu_blocking(_destination: &str) -> Result<String, String> {
    Err("One-click SkyEmu installation is currently available on Windows only.".into())
}

#[cfg(target_os = "windows")]
fn quote_ps_path(path: &Path) -> String {
    path.to_string_lossy().replace('\'', "''")
}

fn find_skyemu(directory: &Path) -> Option<PathBuf> {
    for entry in fs::read_dir(directory).ok()? {
        let path = entry.ok()?.path();
        if path.is_dir() {
            if let Some(found) = find_skyemu(&path) {
                return Some(found);
            }
        } else if path
            .file_name()
            .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case("SkyEmu.exe"))
        {
            return Some(path);
        }
    }
    None
}

#[tauri::command]
pub fn launch_emulator(path: String) -> Result<u32, String> {
    let executable = PathBuf::from(&path);
    if !executable.is_file() {
        return Err("The configured SkyEmu executable does not exist.".into());
    }

    let mut command = Command::new(&executable);
    if let Some(parent) = executable.parent() {
        command.current_dir(parent);
    }
    command
        .spawn()
        .map(|child| child.id())
        .map_err(|error| format!("Unable to start SkyEmu: {error}"))
}

#[tauri::command]
pub fn stop_emulator(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let status = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .status();

    #[cfg(not(target_os = "windows"))]
    let status = Command::new("kill").arg(pid.to_string()).status();

    match status {
        Ok(code) if code.success() => Ok(()),
        Ok(code) => Err(format!("SkyEmu exited with status {code}.")),
        Err(error) => Err(format!("Unable to stop SkyEmu: {error}")),
    }
}
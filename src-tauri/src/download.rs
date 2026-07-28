use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    id: u32,
    done: u64,
    total: u64,
}

/// 下载文件到 dest，并通过 `download-progress` 事件上报进度。
#[tauri::command]
pub async fn download_file(
    app: AppHandle,
    url: String,
    dest: String,
    id: u32,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("chis-flasher")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("下载请求失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("下载失败: HTTP {}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);
    if let Some(parent) = std::path::Path::new(&dest).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("创建目录失败: {e}"))?;
    }

    let mut file = tokio::fs::File::create(&dest)
        .await
        .map_err(|e| format!("创建文件失败: {e}"))?;

    let mut stream = response.bytes_stream();
    let mut done: u64 = 0;
    let _ = app.emit(
        "download-progress",
        ProgressPayload { id, done: 0, total },
    );

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("下载中断: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入失败: {e}"))?;
        done += chunk.len() as u64;
        let _ = app.emit(
            "download-progress",
            ProgressPayload { id, done, total },
        );
    }

    file.flush()
        .await
        .map_err(|e| format!("写入失败: {e}"))?;

    if total > 0 {
        let _ = app.emit(
            "download-progress",
            ProgressPayload {
                id,
                done: total,
                total,
            },
        );
    }

    Ok(())
}

/// 将 zip 解压到 dest_dir（已存在则覆盖同名文件）。
pub fn extract_zip_sync(archive: &str, dest_dir: &str) -> Result<(), String> {
    let dest = std::path::Path::new(dest_dir);
    std::fs::create_dir_all(dest).map_err(|e| format!("创建解压目录失败: {e}"))?;

    #[cfg(windows)]
    {
        let archive_lit = archive.replace('\'', "''");
        let dest_lit = dest_dir.replace('\'', "''");
        let status = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!(
                    "Expand-Archive -LiteralPath '{archive_lit}' -DestinationPath '{dest_lit}' -Force"
                ),
            ])
            .status()
            .map_err(|e| format!("解压失败: {e}"))?;
        if !status.success() {
            return Err(format!("解压失败: exit {status}"));
        }
    }

    #[cfg(not(windows))]
    {
        let status = std::process::Command::new("unzip")
            .args(["-o", archive, "-d", dest_dir])
            .status()
            .map_err(|e| format!("解压失败（需要 unzip）: {e}"))?;
        if !status.success() {
            return Err(format!("解压失败: exit {status}"));
        }
    }

    Ok(())
}

/// 解压 zip，返回其中的可执行文件路径（优先 SkyEmu.exe）。
#[tauri::command]
pub async fn extract_zip_exe(archive: String, dest_dir: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || extract_zip_exe_sync(&archive, &dest_dir))
        .await
        .map_err(|e| format!("解压任务失败: {e}"))?
}

fn extract_zip_exe_sync(archive: &str, dest_dir: &str) -> Result<String, String> {
    extract_zip_sync(archive, dest_dir)?;
    find_skyemu_exe(std::path::Path::new(dest_dir))
}

/// 静默下载到 dest（无前端进度事件），供首次安装拉取工具链使用。
pub async fn download_file_silent(url: &str, dest: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("chis-flasher")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("下载请求失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("下载失败: HTTP {}", response.status()));
    }

    if let Some(parent) = std::path::Path::new(dest).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("创建目录失败: {e}"))?;
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取下载内容失败: {e}"))?;
    tokio::fs::write(dest, &bytes)
        .await
        .map_err(|e| format!("写入失败: {e}"))?;
    Ok(())
}

fn find_skyemu_exe(dir: &std::path::Path) -> Result<String, String> {
    let mut preferred: Option<std::path::PathBuf> = None;
    let mut any_exe: Option<std::path::PathBuf> = None;
    let walker = walkdir_exe(dir);
    for path in walker {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if name == "skyemu.exe" || name == "skyemu" {
            preferred = Some(path);
            break;
        }
        if any_exe.is_none()
            && (name.ends_with(".exe") || name == "skyemu.app" || name.ends_with(".app"))
        {
            any_exe = Some(path);
        }
    }
    preferred
        .or(any_exe)
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "解压后未找到 SkyEmu 可执行文件".to_string())
}

fn walkdir_exe(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            out.extend(walkdir_exe(&path));
        } else {
            out.push(path);
        }
    }
    out
}

/// 返回本地文件字节大小（供前端展示存档 size 等）。
#[tauri::command]
pub fn file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(path.trim())
        .map(|m| m.len())
        .map_err(|e| format!("无法读取文件大小: {e}"))
}


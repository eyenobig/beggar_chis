//! CFB 运行时更新（打包态 app-data）。
//!
//! 与前端 `services/toolchain/components/cfb.js` 同属 cfb 适配器执行层：
//! GitHub Release → 校验 SHA-256 → `version --json` → 原子切换 `current.json`。
//! SkyEmu 走前端 `download_file`（可带进度）；rule 暂不拉远程归档。

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::cfb_config;

const MAX_CFB_BYTES: usize = 32 * 1024 * 1024;
const CHECK_INTERVAL_SECONDS: u64 = 6 * 60 * 60;

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    size: u64,
    digest: Option<String>,
    browser_download_url: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct CurrentToolchain {
    version: String,
    path: String,
    sha256: String,
    #[serde(default)]
    checked_at: u64,
}

pub async fn ensure_latest_cfb(app: &AppHandle, triple: &str) -> Result<PathBuf, String> {
    let cmd_root = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法解析 app data 目录: {e}"))?
        .join("toolchain")
        .join("cmd");
    std::fs::create_dir_all(&cmd_root)
        .map_err(|e| format!("创建 CFB 版本目录失败: {e}"))?;

    let marker_path = cmd_root.join("current.json");
    let current = read_marker(&marker_path);
    if let Some(marker) = current.as_ref() {
        if marker_is_valid(marker)
            && now_unix().saturating_sub(marker.checked_at) < CHECK_INTERVAL_SECONDS
        {
            return Ok(PathBuf::from(&marker.path));
        }
    }

    let release = match fetch_latest_release().await {
        Ok(release) => release,
        Err(error) => {
            if let Some(marker) = current.filter(marker_is_valid) {
                return Ok(PathBuf::from(marker.path));
            }
            return Err(error);
        }
    };
    let asset_name = if cfg!(windows) {
        format!("cfb-{triple}.exe")
    } else {
        format!("cfb-{triple}")
    };
    let asset = release
        .assets
        .iter()
        .find(|asset| asset.name == asset_name)
        .ok_or_else(|| format!("CFB {} 缺少平台资产 {asset_name}", release.tag_name))?;
    let expected_sha = asset
        .digest
        .as_deref()
        .and_then(|digest| digest.strip_prefix("sha256:"))
        .filter(|digest| digest.len() == 64)
        .ok_or_else(|| format!("{asset_name} 缺少有效 SHA-256 digest"))?
        .to_ascii_lowercase();

    if let Some(mut marker) = current {
        if marker.version == release.tag_name
            && marker.sha256.eq_ignore_ascii_case(&expected_sha)
            && marker_is_valid(&marker)
        {
            marker.checked_at = now_unix();
            write_marker_atomic(&marker_path, &marker)?;
            return Ok(PathBuf::from(marker.path));
        }
    }

    let installed = install_release(&cmd_root, &release.tag_name, asset, &expected_sha).await?;
    if let Some(previous) = read_marker(&marker_path).filter(marker_is_valid) {
        write_marker_atomic(&cmd_root.join("previous.json"), &previous)?;
    }
    let marker = CurrentToolchain {
        version: release.tag_name,
        path: installed.display().to_string(),
        sha256: expected_sha,
        checked_at: now_unix(),
    };
    write_marker_atomic(&marker_path, &marker)?;
    Ok(installed)
}

async fn fetch_latest_release() -> Result<GithubRelease, String> {
    let api_url = cfb_config::github_release_api_url();
    let response = reqwest::Client::builder()
        .user_agent("chis-flasher-updater")
        .redirect(reqwest::redirect::Policy::limited(5))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?
        .get(&api_url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| format!("检查 CFB 更新失败: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("检查 CFB 更新失败: HTTP {}", response.status()));
    }
    let text = response
        .text()
        .await
        .map_err(|e| format!("读取 CFB release 失败: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("解析 CFB release 失败: {e}"))
}

async fn install_release(
    cmd_root: &Path,
    version: &str,
    asset: &GithubAsset,
    expected_sha: &str,
) -> Result<PathBuf, String> {
    if asset.size == 0 || asset.size as usize > MAX_CFB_BYTES {
        return Err(format!("CFB 资产大小异常: {} bytes", asset.size));
    }
    if !asset
        .browser_download_url
        .starts_with(&cfb_config::github_download_prefix())
    {
        return Err("CFB 下载地址不属于受信任的 GitHub Release".to_string());
    }

    let response = reqwest::Client::builder()
        .user_agent("chis-flasher-updater")
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?
        .get(&asset.browser_download_url)
        .send()
        .await
        .map_err(|e| format!("下载 CFB 失败: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("下载 CFB 失败: HTTP {}", response.status()));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取 CFB 下载内容失败: {e}"))?;
    if bytes.len() != asset.size as usize || bytes.len() > MAX_CFB_BYTES {
        return Err(format!(
            "CFB 下载大小不符: 期望 {}，实际 {}",
            asset.size,
            bytes.len()
        ));
    }
    let actual_sha = sha256_hex(&bytes);
    if !actual_sha.eq_ignore_ascii_case(expected_sha) {
        return Err(format!(
            "CFB SHA-256 校验失败: 期望 {expected_sha}，实际 {actual_sha}"
        ));
    }

    let version_dir = cmd_root.join(safe_version(version));
    std::fs::create_dir_all(&version_dir)
        .map_err(|e| format!("创建 CFB 版本目录失败: {e}"))?;
    let final_path = version_dir.join(&asset.name);
    let staged_name = if cfg!(windows) {
        format!("{}.download.exe", asset.name.trim_end_matches(".exe"))
    } else {
        format!("{}.download", asset.name)
    };
    let staged_path = version_dir.join(staged_name);
    std::fs::write(&staged_path, &bytes).map_err(|e| format!("写入 CFB 临时文件失败: {e}"))?;
    set_executable(&staged_path)?;
    verify_executable(&staged_path, version)?;

    if final_path.exists() {
        std::fs::remove_file(&final_path).map_err(|e| format!("移除旧 CFB 文件失败: {e}"))?;
    }
    std::fs::rename(&staged_path, &final_path)
        .map_err(|e| format!("切换 CFB 版本失败: {e}"))?;
    set_executable(&final_path)?;
    Ok(final_path)
}

fn verify_executable(path: &Path, release_tag: &str) -> Result<(), String> {
    let output = Command::new(path)
        .args(["version", "--json"])
        .output()
        .map_err(|e| format!("启动新 CFB 失败: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "新 CFB 版本检查失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let expected = release_tag.trim_start_matches('v');
    let version_matches = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .any(|event| {
            event.get("type").and_then(|value| value.as_str()) == Some("version")
                && event.get("version").and_then(|value| value.as_str()) == Some(expected)
        });
    if !version_matches {
        return Err(format!("新 CFB 报告版本与 release {release_tag} 不一致"));
    }
    Ok(())
}

fn marker_is_valid(marker: &CurrentToolchain) -> bool {
    let path = Path::new(&marker.path);
    if !path.is_file() {
        return false;
    }
    match std::fs::read(path) {
        Ok(bytes) => sha256_hex(&bytes).eq_ignore_ascii_case(&marker.sha256),
        Err(_) => false,
    }
}

fn read_marker(path: &Path) -> Option<CurrentToolchain> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_marker_atomic(path: &Path, marker: &CurrentToolchain) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(marker).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, format!("{text}\n"))
        .map_err(|e| format!("写入 CFB 版本指针失败: {e}"))?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| format!("替换 CFB 版本指针失败: {e}"))?;
    }
    std::fs::rename(&tmp, path).map_err(|e| format!("提交 CFB 版本指针失败: {e}"))
}

fn safe_version(version: &str) -> String {
    version
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_'))
        .collect()
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = std::fs::metadata(path)
        .map_err(|e| format!("读取 CFB 权限失败: {e}"))?
        .permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(path, permissions)
        .map_err(|e| format!("设置 CFB 可执行权限失败: {e}"))
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_version_removes_path_characters() {
        assert_eq!(safe_version("v0.3.4/../../bad"), "v0.3.4....bad");
    }

    #[test]
    fn marker_rejects_missing_file() {
        let marker = CurrentToolchain {
            version: "v0.0.0".into(),
            path: "definitely-missing-cfb".into(),
            sha256: "0".repeat(64),
            checked_at: 0,
        };
        assert!(!marker_is_valid(&marker));
    }

    #[test]
    fn sha256_hex_matches_known_vector() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}

//! 工具链管理：运行时二进制 / rule 数据路径探测、打包首次下载，以及直连模式下的
//! 二进制解析与执行。设置页配置的是 **可执行文件或 bins 目录**（平台相关产物），
//! 不是 cmd/rule 源码树。开发者构建用的源码路径写在 gitignored 的
//! `local-paths.json`，与 Settings 工具链引用分离。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use crate::download;

/// 打包版默认拉取的 GitHub tag（与近期可用带资产发布对齐）。
const TOOLCHAIN_TAG: &str = "v0.3.3";
const CFB_REPO: &str = "eyenobig/chis-burner-cmd";
const RULE_REPO: &str = "eyenobig/chis-burner-rule";

fn run(cmd: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("{cmd} 执行失败: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("{cmd} 退出码非零")
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// 读取本地仓库当前 HEAD commit（40 位 SHA）。用于跟远端最新提交比对版本。
#[tauri::command]
pub fn git_head_sha(dir: String) -> Result<String, String> {
    if !Path::new(&dir).join(".git").exists() {
        return Err("目录不是 git 仓库".to_string());
    }
    run("git", &["-C", &dir, "rev-parse", "HEAD"])
}

/// 快进拉取远端最新提交（仅 --ff-only，避免产生合并冲突需人工处理）。
#[tauri::command]
pub fn git_pull(dir: String) -> Result<String, String> {
    run("git", &["-C", &dir, "pull", "--ff-only"])
}

/// 读取 `<dir>/Cargo.toml` 里的 `version = "X.Y.Z"`（正则式简单解析，够用不引入 toml 依赖）。
#[tauri::command]
pub fn read_cargo_version(dir: String) -> Result<String, String> {
    let manifest = Path::new(&dir).join("Cargo.toml");
    let text = std::fs::read_to_string(&manifest)
        .map_err(|e| format!("读取 {} 失败: {e}", manifest.display()))?;
    text.lines()
        .find_map(|line| {
            let line = line.trim();
            let rest = line.strip_prefix("version")?;
            let rest = rest.trim_start();
            let rest = rest.strip_prefix('=')?;
            let rest = rest.trim();
            let rest = rest.strip_prefix('"')?;
            rest.split('"').next().map(|s| s.to_string())
        })
        .ok_or_else(|| "Cargo.toml 中未找到 version 字段".to_string())
}

/// 自动探测本机已构建的 cfb 可执行文件（仅开发构建有意义）。
#[tauri::command]
pub fn detect_default_cfb_bin() -> Option<String> {
    detect_dev_cfb_bin()
}

/// 自动探测已解压的 rule 数据目录（开发：vendor/同级；打包：app-data）。
#[tauri::command]
pub fn detect_default_rule_dir() -> Option<String> {
    detect_dev_rule_data_dir()
}

/// 同级 `chis-burner-cmd` 源码根（仅供 local-paths.json / 构建脚本，不进 Settings）。
fn detect_dev_cfb_source_dir() -> Option<PathBuf> {
    let candidate = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()? // beggar_chis
        .parent()? // Project
        .join("chis-burner-cmd");
    if candidate.join("Cargo.toml").exists() {
        Some(candidate)
    } else {
        None
    }
}

/// 开发态探测已构建 cfb **可执行文件**（绝不返回源码根目录）。
/// 优先级：`target/<triple>/release` → `target/release` → 同路径 debug → 本 app sidecar。
fn detect_dev_cfb_bin() -> Option<String> {
    let triple = current_triple();
    let bin_name = if cfg!(windows) { "cfb.exe" } else { "cfb" };
    if let Some(source) = detect_dev_cfb_source_dir() {
        let candidates = [
            source.join("target").join(triple).join("release").join(bin_name),
            source.join("target").join("release").join(bin_name),
            source.join("target").join(triple).join("debug").join(bin_name),
            source.join("target").join("debug").join(bin_name),
        ];
        if let Some(p) = candidates.into_iter().find(|p| p.is_file()) {
            return Some(p.display().to_string());
        }
    }
    let sidecar_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries");
    find_bin_in_dir(&sidecar_dir, triple).map(|p| p.display().to_string())
}

fn detect_dev_rule_data_dir() -> Option<String> {
    let project = Path::new(env!("CARGO_MANIFEST_DIR")).parent()?.parent()?;
    let nested = project
        .join("chis-burner-cmd")
        .join("vendor")
        .join("chis-burner-rule");
    if nested.join("profiles").exists() {
        return Some(nested.display().to_string());
    }
    let sibling = project.join("chis-burner-rule");
    if sibling.join("profiles").exists() {
        Some(sibling.display().to_string())
    } else {
        None
    }
}

/// 前端 bootstrap 返回值：cfb 可执行文件（或 bins 目录）+ rule 数据目录。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolchainPaths {
    /// cfb 可执行文件绝对路径，或包含平台 sidecar 的 bins 目录。
    pub cfb_bin: Option<String>,
    /// 已解压的 rule 数据目录（含 profiles）；预编译 cfb 通常已内嵌 rule，此项可选。
    pub rule_dir: Option<String>,
}

/// 路径为空时由前端调用：debug 探测本机已构建二进制；release 下载平台产物到 app data。
/// 幂等：已存在则跳过下载。返回路径给前端写入 localStorage。
/// debug 另写 gitignored 的 `local-paths.json`（**源码**路径，供 `npm run build:cfb:local`）。
#[tauri::command]
pub async fn bootstrap_toolchain_paths(app: AppHandle) -> Result<ToolchainPaths, String> {
    if cfg!(debug_assertions) {
        write_build_local_paths_json();
        return Ok(ToolchainPaths {
            cfb_bin: detect_dev_cfb_bin(),
            rule_dir: detect_dev_rule_data_dir(),
        });
    }
    ensure_release_toolchain(&app).await
}

/// 开发态把 **源码** 路径写入仓库根 `local-paths.json`（构建脚本用，与 Settings bin 引用无关）。
fn write_build_local_paths_json() {
    let Some(cfb) = detect_dev_cfb_source_dir() else {
        return;
    };
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent();
    let Some(root) = root else { return };
    let file = root.join("local-paths.json");
    let mut map = serde_json::Map::new();
    map.insert(
        "cfbSourceDir".into(),
        serde_json::Value::String(cfb.display().to_string().replace('\\', "/")),
    );
    if let Some(rule) = detect_dev_rule_data_dir() {
        map.insert(
            "ruleSourceDir".into(),
            serde_json::Value::String(rule.replace('\\', "/")),
        );
    }
    let Ok(text) = serde_json::to_string_pretty(&serde_json::Value::Object(map)) else {
        return;
    };
    let _ = std::fs::write(file, format!("{text}\n"));
}

/// 保留命令供兼容；Settings 改存 bin 路径后不再从设置页回写。
/// 仍仅在 debug 下把探测到的 **源码** 目录写入 `local-paths.json`。
#[tauri::command]
pub fn sync_local_paths_json(_cfb_dir: Option<String>, _rule_dir: Option<String>) -> Result<(), String> {
    if cfg!(debug_assertions) {
        write_build_local_paths_json();
    }
    Ok(())
}

async fn ensure_release_toolchain(app: &AppHandle) -> Result<ToolchainPaths, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法解析 app data 目录: {e}"))?
        .join("toolchain");
    let cmd_dir = base.join("cmd");
    let rule_dir = base.join("rule");
    std::fs::create_dir_all(&cmd_dir).map_err(|e| format!("创建 cmd 目录失败: {e}"))?;
    std::fs::create_dir_all(&rule_dir).map_err(|e| format!("创建 rule 目录失败: {e}"))?;

    let triple = current_triple();
    let asset_name = if cfg!(windows) {
        format!("cfb-{triple}.exe")
    } else {
        format!("cfb-{triple}")
    };
    let bin_path = cmd_dir.join(&asset_name);
    if !bin_path.exists() {
        let url = format!(
            "https://github.com/{CFB_REPO}/releases/download/{TOOLCHAIN_TAG}/{asset_name}"
        );
        download::download_file_silent(&url, &bin_path.to_string_lossy())
            .await
            .map_err(|e| format!("下载 cfb 失败: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&bin_path)
                .map_err(|e| format!("读取权限失败: {e}"))?
                .permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&bin_path, perms)
                .map_err(|e| format!("设置可执行权限失败: {e}"))?;
        }
    }

    if !rule_dir.join("profiles").exists() {
        let zip_path = base.join("rule.zip");
        let url = format!(
            "https://github.com/{RULE_REPO}/archive/refs/tags/{TOOLCHAIN_TAG}.zip"
        );
        download::download_file_silent(&url, &zip_path.to_string_lossy())
            .await
            .map_err(|e| format!("下载 rule 失败: {e}"))?;
        let extract_tmp = base.join("rule-extract");
        if extract_tmp.exists() {
            let _ = std::fs::remove_dir_all(&extract_tmp);
        }
        let zip_s = zip_path.to_string_lossy().to_string();
        let tmp_s = extract_tmp.to_string_lossy().to_string();
        tokio::task::spawn_blocking(move || download::extract_zip_sync(&zip_s, &tmp_s))
            .await
            .map_err(|e| format!("解压任务失败: {e}"))??;
        let nested = find_rule_root(&extract_tmp)
            .ok_or_else(|| "解压后未找到 rule（缺少 profiles 目录）".to_string())?;
        if rule_dir.exists() {
            let _ = std::fs::remove_dir_all(&rule_dir);
        }
        std::fs::rename(&nested, &rule_dir).or_else(|_| copy_dir_recursive(&nested, &rule_dir))?;
        let _ = std::fs::remove_dir_all(&extract_tmp);
        let _ = std::fs::remove_file(&zip_path);
    }

    // Settings 存具体可执行文件路径（平台相关），与一般 bin 引用一致。
    Ok(ToolchainPaths {
        cfb_bin: Some(bin_path.display().to_string()),
        rule_dir: Some(rule_dir.display().to_string()),
    })
}

fn find_rule_root(dir: &Path) -> Option<PathBuf> {
    if dir.join("profiles").exists() {
        return Some(dir.to_path_buf());
    }
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && path.join("profiles").exists() {
            return Some(path);
        }
    }
    None
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| format!("创建目录失败: {e}"))?;
    for entry in std::fs::read_dir(src).map_err(|e| format!("读取目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取目录项失败: {e}"))?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            std::fs::copy(&from, &to).map_err(|e| format!("拷贝失败: {e}"))?;
        }
    }
    Ok(())
}

fn current_triple() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "aarch64-pc-windows-msvc"
    } else if cfg!(target_os = "windows") {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(target_os = "macos") {
        "x86_64-apple-darwin"
    } else {
        "x86_64-unknown-linux-gnu"
    }
}

/// 前端拼接下载目标路径 / 匹配发布资产文件名用：当前平台三元组 + sidecar 目录。
#[tauri::command]
pub fn sidecar_triple() -> String {
    current_triple().to_string()
}

/// 本 app 的 `src-tauri/binaries/` 绝对路径（sidecar 存放处）。
#[tauri::command]
pub fn sidecar_binaries_dir() -> String {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .display()
        .to_string()
}

fn cargo_target_dir(manifest: &str) -> Result<String, String> {
    let out = Command::new("cargo")
        .args(["metadata", "--format-version", "1", "--no-deps", "--manifest-path", manifest])
        .output()
        .map_err(|e| format!("cargo metadata 执行失败: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    let v: serde_json::Value =
        serde_json::from_slice(&out.stdout).map_err(|e| format!("解析 cargo metadata 失败: {e}"))?;
    v.get("target_directory")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "cargo metadata 未返回 target_directory".to_string())
}

/// 从本地 `chis-burner-cmd` 源码重建 cfb sidecar，写入本 app 的 `src-tauri/binaries/`。
/// 仅本地开发 / 打包内置回退用；设置页主流程为直连 bin，不再暴露为按钮。
#[tauri::command]
pub fn rebuild_cfb_sidecar(cfb_dir: String, rule_dir: Option<String>) -> Result<String, String> {
    let cfb_dir = cfb_dir.trim_end_matches(['/', '\\']).to_string();
    let manifest = format!("{cfb_dir}/Cargo.toml");
    if !Path::new(&manifest).exists() {
        return Err(format!("未找到 {manifest}，请传入 chis-burner-cmd 源码目录"));
    }

    let triple = current_triple();
    let mut cmd = Command::new("cargo");
    cmd.args([
        "build",
        "--release",
        "--locked",
        "--manifest-path",
        &manifest,
        "--target",
        triple,
    ]);
    if let Some(rd) = rule_dir.filter(|s| !s.trim().is_empty()) {
        cmd.env("CFB_RULE_DIR", rd);
    }
    let out = cmd.output().map_err(|e| format!("cargo build 执行失败: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let tail: String = stderr.lines().rev().take(20).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(format!("cargo build 失败:\n{tail}"));
    }

    let target_dir = cargo_target_dir(&manifest)?;
    let bin_name = if cfg!(windows) { "cfb.exe" } else { "cfb" };
    let sidecar_name = if cfg!(windows) {
        format!("cfb-{triple}.exe")
    } else {
        format!("cfb-{triple}")
    };
    let candidates = [
        format!("{target_dir}/{triple}/release/{bin_name}"),
        format!("{target_dir}/release/{bin_name}"),
    ];
    let src = candidates
        .iter()
        .find(|p| Path::new(p).exists())
        .ok_or_else(|| format!("构建完成但未找到产物: {candidates:?}"))?;

    let dest_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries");
    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("创建 binaries 目录失败: {e}"))?;
    let dest = dest_dir.join(&sidecar_name);
    std::fs::copy(src, &dest).map_err(|e| format!("拷贝产物失败: {e}"))?;
    Ok(dest.display().to_string())
}

// ==================== 直连二进制模式 ====================
//
// 背景 / 为什么不用 `@tauri-apps/plugin-shell` 的 `Command.create()`：
// tauri-plugin-shell 2.3.5 的 `execute`/`spawn` 这两个 *JS 可调用* 命令，在非 sidecar
// 分支里会把调用方传入的 `program` 原样当作 scope 查找键，且 scope 只能通过 capabilities
// 静态列出，无法表达运行时才知道的任意绝对路径。
//
// 可行机制：走 `ShellExt::shell(app).command(program)` 的 Rust 侧 API（不经 JS scope），
// 包进本 app 的 `cfb_exec` / `cfb_spawn` / `cfb_kill_process`。这些命令需在
// `permissions/toolchain.toml` + capabilities 里放行。直连执行只解析已存在的二进制，
// 不在此自动 cargo build。

/// 直连模式下由 [`cfb_spawn`] 启动、尚未退出的子进程，供 [`cfb_kill_process`] 按 pid 中止。
#[derive(Default)]
pub struct CfbChildren(Arc<Mutex<HashMap<u32, CommandChild>>>);

/// 转发给前端的流式事件（对应 `streamCfb` 里对 `stdout`/`stderr`/`close` 的监听）。
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "payload")]
pub enum CfbStreamEvent {
    Stdout(String),
    Stderr(String),
    Error(String),
    Terminated { code: Option<i32> },
}

/// `cfb_exec` 的一次性执行结果（对应 `executeCfb`）。
#[derive(Serialize)]
pub struct CfbExecOutput {
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

fn bin_name_candidates(triple: &str) -> Vec<String> {
    if cfg!(windows) {
        vec![
            format!("cfb-{triple}.exe"),
            format!("cfb-{triple}"),
            "cfb.exe".into(),
            "cfb".into(),
        ]
    } else {
        vec![
            format!("cfb-{triple}"),
            "cfb".into(),
            format!("cfb-{triple}.exe"),
            "cfb.exe".into(),
        ]
    }
}

/// 在目录内查找平台相关 cfb 可执行文件（不递归进 target）。
fn find_bin_in_dir(dir: &Path, triple: &str) -> Option<PathBuf> {
    for name in bin_name_candidates(triple) {
        let p = dir.join(&name);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

/// 解析 cfb 二进制绝对路径。**不**自动构建。
/// `cfb_path` 可为：
/// 1. 可执行文件本身（推荐，与一般 bin 引用一致）
/// 2. 含平台 sidecar 的 bins 目录（`cfb` / `cfb-{triple}[.exe]`）
/// 3. 兼容旧配置：含 `Cargo.toml` 的源码树且已有 `target/.../release/cfb`
#[tauri::command]
pub fn resolve_cfb_binary(cfb_path: String) -> Result<String, String> {
    let raw = cfb_path.trim().trim_end_matches(['/', '\\']);
    if raw.is_empty() {
        return Err("未配置 cfb 路径".to_string());
    }
    let path = Path::new(raw);
    let triple = current_triple();

    if path.is_file() {
        return Ok(path.display().to_string());
    }

    if path.is_dir() {
        if let Some(p) = find_bin_in_dir(path, triple) {
            return Ok(p.display().to_string());
        }

        // 兼容旧 Settings：曾把源码根目录当作工具链路径。
        let manifest = path.join("Cargo.toml");
        if manifest.is_file() {
            if let Ok(target_dir) = cargo_target_dir(&manifest.to_string_lossy()) {
                let bin_name = if cfg!(windows) { "cfb.exe" } else { "cfb" };
                let candidates = [
                    PathBuf::from(&target_dir)
                        .join(triple)
                        .join("release")
                        .join(bin_name),
                    PathBuf::from(&target_dir).join("release").join(bin_name),
                ];
                if let Some(p) = candidates.into_iter().find(|p| p.is_file()) {
                    return Ok(p.display().to_string());
                }
                return Err(format!(
                    "目录内未找到 cfb 可执行文件（已检查 bins 与 target/.../release）。请先构建，或将设置改为指向 cfb 可执行文件"
                ));
            }
        }

        return Err(format!(
            "未在目录中找到 cfb 可执行文件（已检查: {}）",
            bin_name_candidates(triple).join(", ")
        ));
    }

    Err(format!("路径不存在: {raw}"))
}

/// 一次性执行已解析出的 cfb 二进制（对应前端 `executeCfb`），收集完整 stdout/stderr。
#[tauri::command]
pub async fn cfb_exec(
    app: AppHandle,
    bin_path: String,
    args: Vec<String>,
) -> Result<CfbExecOutput, String> {
    let output = app
        .shell()
        .command(&bin_path)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("执行 {bin_path} 失败: {e}"))?;
    Ok(CfbExecOutput {
        code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

/// 流式执行（对应前端 `streamCfb`）：逐行把 stdout/stderr 经 `Channel` 推给前端，
/// 返回 pid 供 [`cfb_kill_process`] 中止；进程退出后自动从 [`CfbChildren`] 里移除。
#[tauri::command]
pub fn cfb_spawn(
    app: AppHandle,
    children: State<'_, CfbChildren>,
    bin_path: String,
    args: Vec<String>,
    on_event: Channel<CfbStreamEvent>,
) -> Result<u32, String> {
    let (mut rx, child) = app
        .shell()
        .command(&bin_path)
        .args(args)
        .spawn()
        .map_err(|e| format!("启动 {bin_path} 失败: {e}"))?;
    let pid = child.pid();
    let store = children.0.clone();
    store.lock().unwrap().insert(pid, child);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            let js_event = match event {
                CommandEvent::Stdout(bytes) => {
                    CfbStreamEvent::Stdout(String::from_utf8_lossy(&bytes).into_owned())
                }
                CommandEvent::Stderr(bytes) => {
                    CfbStreamEvent::Stderr(String::from_utf8_lossy(&bytes).into_owned())
                }
                CommandEvent::Error(err) => CfbStreamEvent::Error(err),
                CommandEvent::Terminated(payload) => {
                    store.lock().unwrap().remove(&pid);
                    CfbStreamEvent::Terminated { code: payload.code }
                }
                // `CommandEvent` is #[non_exhaustive]; 未来新增的事件种类先忽略，不中断转发循环。
                _ => continue,
            };
            if on_event.send(js_event).is_err() {
                break;
            }
        }
    });

    Ok(pid)
}

/// 中止 [`cfb_spawn`] 启动的子进程（对应前端「中断」按钮）。
#[tauri::command]
pub fn cfb_kill_process(children: State<'_, CfbChildren>, pid: u32) -> Result<(), String> {
    if let Some(child) = children.0.lock().unwrap().remove(&pid) {
        child.kill().map_err(|e| format!("终止进程失败: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_sibling_chis_burner_cmd_source() {
        let dir = detect_dev_cfb_source_dir().expect("chis-burner-cmd should exist beside beggar_chis");
        assert!(
            dir.join("Cargo.toml").exists(),
            "detected cfb source missing Cargo.toml: {}",
            dir.display()
        );
    }

    #[test]
    fn detect_dev_cfb_bin_returns_executable_not_source_root() {
        let Some(bin) = detect_dev_cfb_bin() else {
            // 本机尚未构建 / 无 sidecar 时跳过（CI 可能无产物）。
            return;
        };
        let path = Path::new(&bin);
        assert!(
            path.is_file(),
            "detect_dev_cfb_bin must be a file, got: {bin}"
        );
        let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        assert!(
            name == "cfb" || name == "cfb.exe" || name.starts_with("cfb-"),
            "unexpected cfb binary name: {bin}"
        );
        // 绝不能把源码根（含 Cargo.toml 的目录）当成「可执行文件」返回。
        assert!(
            !path.is_dir(),
            "detect_dev_cfb_bin must not return a directory: {bin}"
        );
        if let Some(source) = detect_dev_cfb_source_dir() {
            assert_ne!(
                path,
                source.as_path(),
                "must not return chis-burner-cmd source root"
            );
        }
    }

    #[test]
    fn resolve_source_dir_to_built_exe_when_present() {
        let Some(source) = detect_dev_cfb_source_dir() else {
            return;
        };
        let Ok(resolved) = resolve_cfb_binary(source.display().to_string()) else {
            // 源码在但未构建：兼容路径应给出明确错误，而不是静默当 exe。
            return;
        };
        let path = Path::new(&resolved);
        assert!(path.is_file(), "resolved path must be a file: {resolved}");
        assert_ne!(path, source.as_path());
    }

    #[test]
    fn detects_rule_profiles() {
        let dir = detect_dev_rule_data_dir().expect("chis-burner-rule should exist (vendor or sibling)");
        assert!(
            Path::new(&dir).join("profiles").exists(),
            "detected rule dir missing profiles: {dir}"
        );
    }

    #[test]
    fn resolve_accepts_missing_gracefully() {
        let err = resolve_cfb_binary("/no/such/cfb/path".into()).unwrap_err();
        assert!(err.contains("不存在") || err.contains("未找到") || err.contains("未配置"));
    }
}

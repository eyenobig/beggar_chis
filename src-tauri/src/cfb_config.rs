//! CFB path / GitHub defaults — keep in sync with `scripts/cfb-config.mjs`.
//!
//! Local source priority (configured values only):
//!   `CFB_LOCAL_DIR` → `local-paths.json` `paths.cfbSourceDir` (or flat) → [`DEFAULT_CFB_LOCAL_REL`]
//! No `Cargo.toml` there → callers fall back to GitHub Release.

use std::path::{Path, PathBuf};

/// Dev default: sibling checkout relative to this repo root.
pub const DEFAULT_CFB_LOCAL_REL: &str = "../chis-burner-cmd";
pub const DEFAULT_CFB_GITHUB_REPO: &str = "eyenobig/chis-burner-cmd";
pub const DEFAULT_CFB_RELEASE_TAG: &str = "latest";
/// Default rule data dir relative to the resolved CFB source tree.
pub const DEFAULT_RULE_UNDER_CFB: &str = "vendor/chis-burner-rule";

pub fn repo_root() -> Option<PathBuf> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
}

fn load_local_paths_json(root: &Path) -> Option<serde_json::Value> {
    let file = root.join("local-paths.json");
    let text = std::fs::read_to_string(file).ok()?;
    serde_json::from_str(&text).ok()
}

fn json_path_field(value: &serde_json::Value, key: &str) -> Option<PathBuf> {
    // Prefer nested `paths.<key>` (same partition style as runtime localConfig).
    let nested = value
        .get("paths")
        .and_then(|p| p.get(key))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    if nested.is_some() {
        return nested;
    }
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
}

/// Configured CFB **source** directory (may not exist). No alternate relative guesses.
pub fn configured_cfb_source_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("CFB_LOCAL_DIR") {
        let dir = dir.trim();
        if !dir.is_empty() {
            return Some(PathBuf::from(dir));
        }
    }
    let root = repo_root()?;
    if let Some(value) = load_local_paths_json(&root) {
        if let Some(dir) = json_path_field(&value, "cfbSourceDir") {
            return Some(dir);
        }
    }
    Some(root.join(DEFAULT_CFB_LOCAL_REL))
}

/// Local source only when configured path has `Cargo.toml`.
pub fn resolve_local_cfb_source() -> Option<PathBuf> {
    let dir = configured_cfb_source_dir()?;
    dir.join("Cargo.toml").is_file().then_some(dir)
}

/// Rule data: `CFB_RULE_DIR` → `local-paths.json.ruleSourceDir` →
/// `{configured_cfb}/vendor/chis-burner-rule` (requires `profiles/`).
pub fn resolve_rule_source_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("CFB_RULE_DIR") {
        let dir = dir.trim();
        if !dir.is_empty() {
            let p = PathBuf::from(dir);
            if p.join("profiles").exists() {
                return Some(p);
            }
        }
    }
    if let Some(root) = repo_root() {
        if let Some(value) = load_local_paths_json(&root) {
            if let Some(dir) = json_path_field(&value, "ruleSourceDir") {
                if dir.join("profiles").exists() {
                    return Some(dir);
                }
            }
        }
    }
    let cfb = configured_cfb_source_dir()?;
    let nested = cfb.join(DEFAULT_RULE_UNDER_CFB);
    nested.join("profiles").exists().then_some(nested)
}

pub fn github_repo() -> String {
    std::env::var("CFB_GITHUB_REPO")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_CFB_GITHUB_REPO.to_string())
}

pub fn github_release_tag() -> String {
    std::env::var("CFB_RELEASE_TAG")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_CFB_RELEASE_TAG.to_string())
}

pub fn github_release_api_url() -> String {
    let repo = github_repo();
    let tag = github_release_tag();
    if tag == "latest" {
        format!("https://api.github.com/repos/{repo}/releases/latest")
    } else {
        format!(
            "https://api.github.com/repos/{repo}/releases/tags/{}",
            urlencoding_minimal(&tag)
        )
    }
}

pub fn github_download_prefix() -> String {
    format!("https://github.com/{}/releases/download/", github_repo())
}

fn urlencoding_minimal(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

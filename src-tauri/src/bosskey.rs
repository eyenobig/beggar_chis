//! 老板键：全局快捷键切换主窗口显隐，快捷键可由前端设置页配置。
//!
//! 前端把 keydown 录制的 `event.code`（如 "KeyB"/"F9"）+ 修饰键 tokens 传给
//! `set_boss_shortcut`；Rust 侧注销旧键、注册新键。`clear_boss_shortcut` 注销。
//! 窗口切换逻辑在 lib.rs 插件 Builder 的 with_handler 里（对所有注册键生效）。

use std::sync::Mutex;

use tauri::{AppHandle, State};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

pub struct BossKeyState(pub Mutex<Option<Shortcut>>);

fn modifiers_from_tokens(tokens: &[String]) -> Option<Modifiers> {
    let mut m = Modifiers::empty();
    for t in tokens {
        m |= match t.trim().to_ascii_uppercase().as_str() {
            "CONTROL" | "CTRL" => Modifiers::CONTROL,
            "ALT" | "OPTION" => Modifiers::ALT,
            "SHIFT" => Modifiers::SHIFT,
            "META" | "SUPER" | "CMD" | "COMMAND" => Modifiers::META,
            _ => return None,
        };
    }
    Some(m)
}

/// `event.code` 字符串 → Code。覆盖字母/数字/F1-F24 和常用控制键，够录制用。
fn code_from_str(s: &str) -> Option<Code> {
    use Code::*;
    Some(match s {
        "KeyA" => KeyA, "KeyB" => KeyB, "KeyC" => KeyC, "KeyD" => KeyD, "KeyE" => KeyE,
        "KeyF" => KeyF, "KeyG" => KeyG, "KeyH" => KeyH, "KeyI" => KeyI, "KeyJ" => KeyJ,
        "KeyK" => KeyK, "KeyL" => KeyL, "KeyM" => KeyM, "KeyN" => KeyN, "KeyO" => KeyO,
        "KeyP" => KeyP, "KeyQ" => KeyQ, "KeyR" => KeyR, "KeyS" => KeyS, "KeyT" => KeyT,
        "KeyU" => KeyU, "KeyV" => KeyV, "KeyW" => KeyW, "KeyX" => KeyX, "KeyY" => KeyY,
        "KeyZ" => KeyZ,
        "Digit0" => Digit0, "Digit1" => Digit1, "Digit2" => Digit2, "Digit3" => Digit3,
        "Digit4" => Digit4, "Digit5" => Digit5, "Digit6" => Digit6, "Digit7" => Digit7,
        "Digit8" => Digit8, "Digit9" => Digit9,
        "F1" => F1, "F2" => F2, "F3" => F3, "F4" => F4, "F5" => F5, "F6" => F6,
        "F7" => F7, "F8" => F8, "F9" => F9, "F10" => F10, "F11" => F11, "F12" => F12,
        "F13" => F13, "F14" => F14, "F15" => F15, "F16" => F16, "F17" => F17,
        "F18" => F18, "F19" => F19, "F20" => F20, "F21" => F21, "F22" => F22,
        "F23" => F23, "F24" => F24,
        "Space" => Space, "Enter" => Enter, "Tab" => Tab, "Backspace" => Backspace,
        "ArrowUp" => ArrowUp, "ArrowDown" => ArrowDown, "ArrowLeft" => ArrowLeft,
        "ArrowRight" => ArrowRight,
        "Comma" => Comma, "Period" => Period, "Slash" => Slash, "Semicolon" => Semicolon,
        "Quote" => Quote, "BracketLeft" => BracketLeft, "BracketRight" => BracketRight,
        "Backslash" => Backslash, "Minus" => Minus, "Equal" => Equal, "Backquote" => Backquote,
        _ => return None,
    })
}

#[tauri::command]
pub fn set_boss_shortcut(
    app: AppHandle,
    state: State<BossKeyState>,
    mods: Vec<String>,
    key: String,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let modifiers = modifiers_from_tokens(&mods).filter(|m| !m.is_empty())
        .ok_or_else(|| format!("invalid modifiers: {mods:?}"))?;
    let code = code_from_str(&key).ok_or_else(|| format!("unsupported key: {key}"))?;
    let sc = Shortcut::new(Some(modifiers), code);
    let gs = app.global_shortcut();
    let mut cur = state.0.lock().unwrap();
    if let Some(old) = cur.take() {
        let _ = gs.unregister(old);
    }
    gs.register(sc).map_err(|e| format!("register failed: {e}"))?;
    *cur = Some(sc);
    Ok(())
}

#[tauri::command]
pub fn clear_boss_shortcut(app: AppHandle, state: State<BossKeyState>) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let mut cur = state.0.lock().unwrap();
    if let Some(old) = cur.take() {
        app.global_shortcut().unregister(old).map_err(|e| format!("unregister failed: {e}"))?;
    }
    Ok(())
}

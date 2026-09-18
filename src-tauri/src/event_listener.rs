//! 本地 UDP 事件监听：接收外部工具（SkyEmu DirectPlay 等）的主动通知，供前端轮询。
//!
//! 协议：一行文本 UDP 数据报到 127.0.0.1:<port>（仅本机）。
//!   `skyemu-exited[:pid]` → 写入事件槽，前端 poll_events 轮询拉取。
//! **不做 Rust→前端事件推送**（emit 到 webview 在本机实测触发 0xc0000005）；
//! 事件槽是唯一出口：UDP 收包线程与 skyemu_watch_exit（pid 轮询备份）都是生产者。
//! 监听在 App setup() 启动（默认端口 47623，不依赖前端）；设置页变更端口时经
//! `start_event_listener` 命令切换（幂等：同端口不重复监听，换端口旧线程自检退出）。
//! 启动 SkyEmu 时（spawn_skyemu）把当前端口经 CHIS_EVENT_PORT 环境变量带给子进程。

use std::net::UdpSocket;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::Mutex;

/// 事件槽：生产者 post_event / 消费者 poll_events（取走并清空）。
static EVENT_SLOT: Mutex<Option<String>> = Mutex::new(None);

/// 任意线程可调：写入一条待前端拉取的事件（覆盖旧事件——同类事件只关心最新）。
pub fn post_event(msg: &str) {
    if let Ok(mut slot) = EVENT_SLOT.lock() {
        *slot = Some(msg.to_string());
    }
}

/// 前端轮询：取走事件槽里的事件（None=无）。
#[tauri::command]
pub fn poll_events() -> Option<String> {
    EVENT_SLOT.lock().ok().and_then(|mut slot| slot.take())
}

pub const DEFAULT_EVENT_PORT: u16 = 47623;

/// 当前生效端口（供 spawn_skyemu 注入环境变量）。0 = 尚未启动，回落默认。
static CURRENT_PORT: AtomicU16 = AtomicU16::new(0);
/// 已在监听的端口（0=未启动）。同端口重复调用幂等；换端口由旧线程自检退出。
static LISTENING_PORT: AtomicU16 = AtomicU16::new(0);

pub fn current_port() -> u16 {
    let p = CURRENT_PORT.load(Ordering::SeqCst);
    if p != 0 {
        p
    } else {
        DEFAULT_EVENT_PORT
    }
}

/// 事件日志落文件（GUI 的 stdout 不可见，文件是唯一可靠观测点）。
fn log_line(msg: &str) {
    let path = std::env::temp_dir().join("chis-event-listener.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().append(true).create(true).open(path) {
        use std::io::Write;
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let _ = writeln!(f, "[{secs}s] {msg}");
    }
}

/// 启动（或切换）本地 UDP 事件监听。App setup() 启动时调（默认端口），
/// 前端设置变更时经命令调用（切端口）。
pub fn start_listener(port: u16) -> Result<(), String> {
    CURRENT_PORT.store(port, Ordering::SeqCst);
    if LISTENING_PORT.load(Ordering::SeqCst) == port {
        return Ok(()); // 同端口已在监听
    }
    let sock = match UdpSocket::bind(("127.0.0.1", port)) {
        Ok(s) => s,
        Err(e) => {
            let m = format!("listen 127.0.0.1:{port} failed: {e}");
            log_line(&m);
            return Err(m);
        }
    };
    // 读超时让旧端口的线程能自检退出（换端口场景）
    let _ = sock.set_read_timeout(Some(std::time::Duration::from_millis(500)));
    LISTENING_PORT.store(port, Ordering::SeqCst);
    log_line(&format!("listening on 127.0.0.1:{port}"));

    std::thread::spawn(move || {
        let mut buf = [0u8; 128];
        loop {
            match sock.recv_from(&mut buf) {
                Ok((n, _)) => {
                    if LISTENING_PORT.load(Ordering::SeqCst) != port {
                        break; // 已切换到新端口
                    }
                    let msg = String::from_utf8_lossy(&buf[..n]).trim().to_string();
                    if msg == "skyemu-exited" || msg.starts_with("skyemu-exited:") {
                        post_event(&msg);
                    }
                }
                Err(_) => {
                    if LISTENING_PORT.load(Ordering::SeqCst) != port {
                        break;
                    }
                }
            }
        }
    });
    Ok(())
}

/// Tauri 命令包装：设置页变更端口时调用（幂等）。
#[tauri::command]
pub fn start_event_listener(port: Option<u16>) -> Result<(), String> {
    let port = match port {
        Some(p) if (1..=65535).contains(&p) => p,
        _ => DEFAULT_EVENT_PORT,
    };
    start_listener(port)
}

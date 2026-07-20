/// 监听操作系统设备热插拔事件，向前端发送 "device-changed" Tauri 事件。
/// 前端收到事件后调用 cfb detect，无需 JS 轮询。
///
/// Windows  — WM_DEVICECHANGE 广播（真正的隐藏顶层窗口，非 HWND_MESSAGE）
/// Linux    — inotify 监听 /dev 目录（ttyUSB* / ttyACM*）
/// macOS    — kqueue 监听 /dev 目录（tty.usb* / cu.usb*）

// ─────────────────────────────────────────────
// Windows
// ─────────────────────────────────────────────
#[cfg(target_os = "windows")]
pub fn start(app: tauri::AppHandle) {
    use std::mem;
    use tauri::Emitter;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, GetWindowLongPtrW,
        RegisterClassExW, SetWindowLongPtrW, TranslateMessage, GWLP_USERDATA, MSG, WNDCLASSEXW,
        WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };

    const WM_DEVICECHANGE: u32 = 0x0219;
    const DBT_DEVNODES_CHANGED: WPARAM = 0x0007;

    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_DEVICECHANGE && wparam == DBT_DEVNODES_CHANGED {
            let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *const tauri::AppHandle;
            if !ptr.is_null() {
                let _ = (*ptr).emit("device-changed", ());
            }
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    std::thread::spawn(move || unsafe {
        let class_name: Vec<u16> = "CfbDeviceWatcher\0".encode_utf16().collect();
        let hinstance = GetModuleHandleW(std::ptr::null());

        let wc = WNDCLASSEXW {
            cbSize: mem::size_of::<WNDCLASSEXW>() as u32,
            style: 0,
            lpfnWndProc: Some(wnd_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: hinstance,
            hIcon: 0,
            hCursor: 0,
            hbrBackground: 0,
            lpszMenuName: std::ptr::null(),
            lpszClassName: class_name.as_ptr(),
            hIconSm: 0,
        };
        RegisterClassExW(&wc);

        // 必须是真正的顶层窗口（parent=0）才能收到 WM_DEVICECHANGE 广播。
        // HWND_MESSAGE 是消息专用窗口，不接收系统广播消息。
        // WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE：不出现在任务栏/Alt-Tab，不抢焦点。
        let hwnd = CreateWindowExW(
            WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            class_name.as_ptr(),
            std::ptr::null(),
            0,           // 无 WS_VISIBLE，保持不可见
            -1, -1, 0, 0,
            0,           // NULL parent = 真正的顶层窗口
            0,
            hinstance,
            std::ptr::null(),
        );
        if hwnd == 0 {
            return;
        }

        let boxed = Box::new(app);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, Box::into_raw(boxed) as isize);

        let mut msg: MSG = mem::zeroed();
        while GetMessageW(&mut msg, hwnd, 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut tauri::AppHandle;
        if !ptr.is_null() {
            drop(Box::from_raw(ptr));
        }
    });
}

// ─────────────────────────────────────────────
// Linux（inotify）& macOS（kqueue）
// ─────────────────────────────────────────────
#[cfg(not(target_os = "windows"))]
pub fn start(app: tauri::AppHandle) {
    use notify::{EventKind, RecursiveMode, Watcher, event::CreateKind, event::RemoveKind};
    use std::path::Path;
    use tauri::Emitter;

    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();

        let mut watcher = match notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        }) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[device_watcher] failed to create watcher: {e}");
                return;
            }
        };

        if let Err(e) = watcher.watch(Path::new("/dev"), RecursiveMode::NonRecursive) {
            eprintln!("[device_watcher] failed to watch /dev: {e}");
            return;
        }

        for result in rx {
            let Ok(event) = result else { continue };

            // 只关心串口设备文件的创建和删除
            let is_relevant = match event.kind {
                EventKind::Create(CreateKind::File | CreateKind::Any)
                | EventKind::Remove(RemoveKind::File | RemoveKind::Any) => {
                    event.paths.iter().any(|p| {
                        let name = p
                            .file_name()
                            .map(|n| n.to_string_lossy().into_owned())
                            .unwrap_or_default();
                        // Linux: ttyUSB*, ttyACM*
                        // macOS: tty.usbmodem*, cu.usbmodem*, tty.wchusbserial*, cu.wchusbserial*
                        name.starts_with("ttyUSB")
                            || name.starts_with("ttyACM")
                            || name.starts_with("tty.usb")
                            || name.starts_with("cu.usb")
                            || name.starts_with("tty.wch")
                            || name.starts_with("cu.wch")
                    })
                }
                _ => false,
            };

            if is_relevant {
                let _ = app.emit("device-changed", ());
            }
        }
    });
}

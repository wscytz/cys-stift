// cy's Stift — Tauri shell entry.
//
// Phase C (v0.25.0): registers a global shortcut (CmdOrCtrl+Shift+E)
// so the user can invoke capture even when the window is unfocused or
// minimised. The handler shows + focuses the main window and emits a
// `global-capture-open` event; the web CaptureHost listens for it (via
// window.__TAURI__, see withGlobalTauri in tauri.conf.json) and opens the
// Mini Input. Plugin load / register failures are logged, not fatal —
// the app still runs, just without the global hotkey.
//
// 修补轮(v0.38):① 注册失败 emit `global-shortcut-error` 事件给前端 toast
// (此前仅 eprintln,桌面用户看不到 stderr → 静默失效)。② 加 `update_shortcut`
// 命令:用户在设置页改快捷键后,前端 invoke 它 → 注销旧快捷键、注册新的,
// 使桌面全局热键跟随用户配置(此前 Rust 写死,web 可改但不联动 = 功能断裂)。

#[cfg(desktop)]
use tauri::{Emitter, Manager};
#[cfg(desktop)]
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// 当前 accelerator + 前端会话/请求顺序。一个 webview session 内只接受递增
/// request_id；新 webview 先 begin session，使旧 IPC 响应不能覆盖新值。
// global-shortcut 是桌面专属(安卓无系统全局热键概念),整套守 cfg(desktop)。
#[cfg(desktop)]
struct ShortcutRegistrationState {
    active: Option<String>,
    session_id: u64,
    latest_request_id: u64,
}

#[cfg(desktop)]
static SHORTCUT_STATE: std::sync::Mutex<ShortcutRegistrationState> =
    std::sync::Mutex::new(ShortcutRegistrationState {
        active: None,
        session_id: 0,
        latest_request_id: 0,
    });

/// 默认快捷键(仅桌面注册;安卓无系统全局热键概念)。
#[cfg(desktop)]
const DEFAULT_SHORTCUT: &str = "CmdOrCtrl+Shift+E";

/// 注册一个快捷键:注销当前(若有)、注册新的、更新 active accelerator。
/// 失败 emit `global-shortcut-error`。返回 Ok(()) 让前端知道成功。
#[cfg(desktop)]
fn rebind_shortcut(
    app: &tauri::AppHandle,
    accelerator: &str,
    fallback_accelerator: &str,
    state: &mut ShortcutRegistrationState,
) -> Result<(), String> {
    let gs = app.global_shortcut();
    let previous = state.active.clone();
    if previous.as_deref() == Some(accelerator) {
        return Ok(());
    }
    // 注销旧的(若与新的不同)。
    if let Some(prev) = previous.as_ref() {
        if prev != accelerator {
            let _ = gs.unregister(prev.as_str()); // 旧的可能已失效,忽略错误
        }
    }
    match gs.register(accelerator) {
        Ok(()) => {
            state.active = Some(String::from(accelerator));
            Ok(())
        }
        Err(e) => {
            let mut msg = e.to_string();
            // previous 可能是刚成功的旧候选。失败时必须恢复前端随请求带来的
            // durable fallback，而不是恢复 previous，否则乱序请求仍会三端分叉。
            match gs.register(fallback_accelerator) {
                Ok(()) => {
                    state.active = Some(String::from(fallback_accelerator));
                }
                Err(rollback_error) => {
                    state.active = None;
                    msg = format!(
                        "{msg}; failed to restore {fallback_accelerator}: {rollback_error}"
                    );
                }
            }
            let _ = app.emit("global-shortcut-error", msg.clone());
            Err(msg)
        }
    }
}

#[cfg(desktop)]
#[tauri::command]
fn begin_shortcut_session() -> Result<u64, String> {
    let mut state = SHORTCUT_STATE.lock().map_err(|e| e.to_string())?;
    state.session_id = state.session_id.saturating_add(1);
    state.latest_request_id = 0;
    Ok(state.session_id)
}

#[cfg(desktop)]
fn accept_shortcut_request(
    state: &mut ShortcutRegistrationState,
    session_id: u64,
    request_id: u64,
) -> bool {
    if session_id != state.session_id || request_id <= state.latest_request_id {
        return false;
    }
    state.latest_request_id = request_id;
    true
}

#[cfg(desktop)]
#[tauri::command]
fn update_shortcut(
    app: tauri::AppHandle,
    accelerator: String,
    fallback_accelerator: String,
    session_id: u64,
    request_id: u64,
) -> Result<bool, String> {
    let mut state = SHORTCUT_STATE.lock().map_err(|e| e.to_string())?;
    if !accept_shortcut_request(&mut state, session_id, request_id) {
        return Ok(false);
    }
    rebind_shortcut(
        &app,
        &accelerator,
        &fallback_accelerator,
        &mut state,
    )?;
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Android: Tauri 的间接依赖 reqwest 用 rustls 且默认无 crypto provider
    // (rustls-no-provider)。启动建 reqwest Client 时会 panic
    // ("No rustls crypto provider is configured") → app 闪退。先装 ring provider。
    // 桌面用 native-tls(macOS Secure Transport),不受影响、不触发此块。
    #[cfg(target_os = "android")]
    {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            #[cfg(desktop)] begin_shortcut_session,
            #[cfg(desktop)] update_shortcut,
        ])
        // dialog + fs:导出 helper(Android)用 dialog save(SAF picker)+ fs
        // writeFile 绕过 WebView 不处理 Blob download 的限制。桌面也注册(统一),
        // 但桌面导出路径走 Blob + a.click,不实际调用这两个插件。
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::ShortcutState;

                let app_handle = app.handle().clone();
                if let Err(e) = app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |_app, _shortcut, event| {
                            if event.state() == ShortcutState::Pressed {
                                // Bring the window to the front (un-minimise /
                                // refocus), then ask the frontend to open the
                                // capture Mini Input.
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                                let _ = app_handle.emit("global-capture-open", ());
                            }
                        })
                        .build(),
                ) {
                    eprintln!("[global-shortcut] plugin load failed: {e}");
                    let _ = app.handle().emit("global-shortcut-error", format!("plugin load failed: {e}"));
                }

                // CmdOrCtrl resolves to Cmd on macOS, Ctrl on Windows/Linux —
                // matches the web-side default capture shortcut.
                match app.global_shortcut().register(DEFAULT_SHORTCUT) {
                    Ok(()) => {
                        if let Ok(mut state) = SHORTCUT_STATE.lock() {
                            state.active = Some(String::from(DEFAULT_SHORTCUT));
                        }
                    }
                    Err(e) => {
                        eprintln!("[global-shortcut] register failed: {e}");
                        let _ = app.handle().emit("global-shortcut-error", format!("register failed: {e}"));
                    }
                }
            }
            // mobile: setup 参数 app 在 #[cfg(desktop)] 块内才用,这里显式标记
            // unused 避免移动端 unused_variables warning(桌面端此行被 cfg 排除)。
            #[cfg(not(desktop))]
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(all(test, desktop))]
mod tests {
    use super::{accept_shortcut_request, ShortcutRegistrationState};

    fn state(session_id: u64) -> ShortcutRegistrationState {
        ShortcutRegistrationState {
            active: None,
            session_id,
            latest_request_id: 0,
        }
    }

    #[test]
    fn older_request_cannot_follow_a_newer_request() {
        let mut state = state(4);
        assert!(accept_shortcut_request(&mut state, 4, 2));
        assert!(!accept_shortcut_request(&mut state, 4, 1));
        assert_eq!(state.latest_request_id, 2);
    }

    #[test]
    fn previous_webview_session_cannot_mutate_current_state() {
        let mut state = state(8);
        assert!(!accept_shortcut_request(&mut state, 7, 99));
        assert!(accept_shortcut_request(&mut state, 8, 1));
    }
}

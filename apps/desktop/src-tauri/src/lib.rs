// cy's Stift — Tauri shell entry.
//
// Phase C (v0.25.0): registers a global shortcut (CmdOrCtrl+Shift+Space)
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

use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// 当前已注册的快捷键 accelerator。update_shortcut 时先注销它再注册新的。
/// 用 Mutex 保护(invoke 跨线程);初始 = 默认快捷键。
static CURRENT_SHORTCUT: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

const DEFAULT_SHORTCUT: &str = "CmdOrCtrl+Shift+Space";

/// 注册一个快捷键:注销当前(若有)、注册新的、更新 CURRENT_SHORTCUT。
/// 失败 emit `global-shortcut-error`。返回 Ok(()) 让前端知道成功。
fn rebind_shortcut(app: &tauri::AppHandle, accelerator: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    let mut current = CURRENT_SHORTCUT.lock().map_err(|e| e.to_string())?;
    // 注销旧的(若与新的不同)。
    if let Some(prev) = current.as_ref() {
        if prev != accelerator {
            let _ = gs.unregister(prev.as_str()); // 旧的可能已失效,忽略错误
        }
    }
    match gs.register(accelerator) {
        Ok(()) => {
            *current = Some(String::from(accelerator));
            Ok(())
        }
        Err(e) => {
            let msg = e.to_string();
            // 新注册失败:若 prev 已被注销(与新不同分支),尝试重新注册旧的保命。
            if let Some(prev) = current.as_ref() {
                if prev != accelerator {
                    let _ = gs.register(prev.as_str());
                }
            }
            let _ = app.emit("global-shortcut-error", msg.clone());
            Err(msg)
        }
    }
}

#[tauri::command]
fn update_shortcut(app: tauri::AppHandle, accelerator: String) -> Result<(), String> {
    rebind_shortcut(&app, &accelerator)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![update_shortcut])
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
                        if let Ok(mut c) = CURRENT_SHORTCUT.lock() {
                            *c = Some(String::from(DEFAULT_SHORTCUT));
                        }
                    }
                    Err(e) => {
                        eprintln!("[global-shortcut] register failed: {e}");
                        let _ = app.handle().emit("global-shortcut-error", format!("register failed: {e}"));
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

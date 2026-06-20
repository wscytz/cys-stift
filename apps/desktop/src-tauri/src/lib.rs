// cy's Stift — Tauri shell entry.
//
// Phase C (v0.25.0): registers a global shortcut (CmdOrCtrl+Shift+Space)
// so the user can invoke capture even when the window is unfocused or
// minimised. The handler shows + focuses the main window and emits a
// `global-capture-open` event; the web CaptureHost listens for it (via
// window.__TAURI__, see withGlobalTauri in tauri.conf.json) and opens the
// Mini Input. Plugin load / register failures are logged, not fatal —
// the app still runs, just without the global hotkey.

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

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
                }

                // CmdOrCtrl resolves to Cmd on macOS, Ctrl on Windows/Linux —
                // matches the web-side default capture shortcut.
                if let Err(e) = app.global_shortcut().register("CmdOrCtrl+Shift+Space") {
                    eprintln!("[global-shortcut] register failed: {e}");
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

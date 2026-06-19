// cy's Stift — Tauri shell entry (Phase 0 scaffold).
// Phase 0 only opens a window pointing at the web app. Real Tauri commands
// (global-shortcut, fs, etc.) land in later phases.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|_app| Ok(()))
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

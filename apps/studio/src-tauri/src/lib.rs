//! idv7lol Studio desktop shell.
//!
//! The editor itself is the web front end in `../src`; this crate only
//! provides the window, file dialogs, file system access, the opener and a few
//! commands that need the host (version info, data directory, environment).

use serde::Serialize;

#[derive(Serialize)]
struct HostInfo {
    app_version: String,
    tauri_version: String,
    os: String,
    arch: String,
    debug: bool,
}

/// Static information about the host, shown in the About / diagnostics panels.
#[tauri::command]
fn host_info() -> HostInfo {
    HostInfo {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        tauri_version: tauri::VERSION.to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        debug: cfg!(debug_assertions),
    }
}

/// Paths of files passed on the command line (double-clicking a .idv7theme file).
#[tauri::command]
fn launch_args() -> Vec<String> {
    std::env::args().skip(1).filter(|a| !a.starts_with('-')).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![host_info, launch_args])
        .run(tauri::generate_context!())
        .expect("error while running idv7lol Studio");
}

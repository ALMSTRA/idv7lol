//! idv7lol Studio desktop shell.
//!
//! The editor itself is the web front end in `../src`; this crate only
//! provides the window, file dialogs, file system access, the opener and a few
//! commands that need the host (version info, data directory, environment).

use serde::Serialize;
use std::sync::Mutex;

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

/// Files macOS asked the app to open (double-clicking a .idv7theme file in Finder) before the
/// window asked for them. On Windows and Linux they arrive on the command line instead.
#[derive(Default)]
struct OpenedFiles(Mutex<Vec<String>>);

/// Paths of files to open at start: the command line's, plus any macOS handed over.
#[tauri::command]
fn launch_args(opened: tauri::State<'_, OpenedFiles>) -> Vec<String> {
    let mut paths: Vec<String> = std::env::args()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .collect();
    if let Ok(mut list) = opened.0.lock() {
        paths.append(&mut list);
    }
    paths
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OpenedFiles::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![host_info, launch_args])
        .build(tauri::generate_context!())
        .expect("error while running idv7lol Studio")
        .run(|app, event| {
            // macOS opens files with an event, at launch or while the app runs: keep them for
            // launch_args and tell the window, which opens the first one.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                use tauri::{Emitter, Manager};
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                if let Ok(mut list) = app.state::<OpenedFiles>().0.lock() {
                    list.extend(paths.iter().cloned());
                }
                let _ = app.emit("open-files", paths);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}

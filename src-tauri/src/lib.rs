use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
fn is_codex_installed() -> bool {
    get_codex_version().is_some()
}

#[tauri::command]
fn get_codex_version() -> Option<String> {
    let executable = if cfg!(target_os = "windows") {
        "codex.exe"
    } else {
        "codex"
    };

    let mut command = Command::new(executable);
    command.arg("--version");

    // Keep the background CLI check from flashing a console window.
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }

    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            is_codex_installed,
            get_codex_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

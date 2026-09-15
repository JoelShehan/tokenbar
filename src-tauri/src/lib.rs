use std::process::Command;
mod codex_usage;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Emitter,
};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

const TOKENBAR_SERVICE: &str = "tokenbar";
const OPENAI_ACCOUNT: &str = "openai-admin-key";

#[derive(Debug, Serialize)]
struct OpenAiUsageSummary {
    total_input_tokens: i64,
    total_output_tokens: i64,
    total_tokens: i64,
    total_cost_usd: f64,
}

#[derive(Debug, Deserialize)]
struct UsageResponse {
    data: Vec<UsageBucket>,
    #[serde(default)]
    has_more: bool,
    next_page: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UsageBucket {
    results: Vec<UsageResult>,
}

#[derive(Debug, Deserialize)]
struct UsageResult {
    #[serde(default)]
    input_tokens: i64,

    #[serde(default)]
    output_tokens: i64,
}

#[derive(Debug, Deserialize)]
struct CostResponse {
    data: Vec<CostBucket>,
    #[serde(default)]
    has_more: bool,
    next_page: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CostBucket {
    results: Vec<CostResult>,
}

#[derive(Debug, Deserialize)]
struct CostResult {
    amount: CostAmount,
}

#[derive(Debug, Deserialize)]
struct CostAmount {
    value: f64,
    currency: String,
}

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
fn get_codex_login_status() -> String {
    let executable = if cfg!(target_os = "windows") {
        "codex.exe"
    } else {
        "codex"
    };

    let mut command = Command::new(executable);
    command.args(["login", "status"]);

    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW

    match command.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

            if !stdout.is_empty() {
                stdout
            } else if !stderr.is_empty() {
                stderr
            } else if output.status.success() {
                "Logged in".to_string()
            } else {
                "Unavailable".to_string()
            }
        }
        Err(_) => "Unavailable".to_string(),
    }
}

fn get_openai_key_from_keychain() -> Result<String, String> {
    let entry =
        keyring::Entry::new(TOKENBAR_SERVICE, OPENAI_ACCOUNT).map_err(|error| error.to_string())?;

    entry
        .get_password()
        .map_err(|_| "OpenAI Admin API key not found".to_string())
}

#[tauri::command]
async fn save_openai_key(api_key: String) -> Result<(), String> {
    if !validate_openai_key(Some(api_key.clone())).await? {
        return Err("Authentication failed: invalid key or missing organization admin access".into());
    }
    let entry =
        keyring::Entry::new(TOKENBAR_SERVICE, OPENAI_ACCOUNT).map_err(|error| error.to_string())?;

    entry
        .set_password(&api_key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn has_openai_key() -> bool {
    get_openai_key_from_keychain().is_ok()
}

#[tauri::command]
fn delete_openai_key() -> Result<(), String> {
    let entry =
        keyring::Entry::new(TOKENBAR_SERVICE, OPENAI_ACCOUNT).map_err(|error| error.to_string())?;

    entry.delete_credential().map_err(|error| error.to_string())
}

#[tauri::command]
async fn validate_openai_key(api_key: Option<String>) -> Result<bool, String> {
    let api_key = match api_key { Some(key) => key, None => get_openai_key_from_keychain()? };

    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).build().map_err(|e| e.to_string())?;

    let response = client
        .get("https://api.openai.com/v1/organization/projects")
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if response.status().as_u16() == 401 || response.status().as_u16() == 403 { return Ok(false); }
    if !response.status().is_success() { return Err(format!("Could not validate API key: {}", response.status())); }
    Ok(true)
}

#[tauri::command]
async fn get_openai_usage() -> Result<OpenAiUsageSummary, String> {
    let api_key = get_openai_key_from_keychain()?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();

    let start_time = now - (30 * 24 * 60 * 60);

    let usage_url = format!(
        "https://api.openai.com/v1/organization/usage/completions\
         ?start_time={}&end_time={}&bucket_width=1d",
        start_time, now
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;
    let mut input_tokens = 0;
    let mut output_tokens = 0;
    let mut page: Option<String> = None;
    loop {
        let mut request = client.get(&usage_url).bearer_auth(&api_key);
        if let Some(cursor) = &page {
            request = request.query(&[("page", cursor)]);
        }
        let response = request
            .send()
            .await
            .map_err(|error| error.to_string())?;

        if !response.status().is_success() {
            return Err(format!(
                "OpenAI usage request failed: {}",
                response.status()
            ));
        }

        let usage: UsageResponse = response.json().await.map_err(|error| error.to_string())?;

        for bucket in usage.data {
            for result in bucket.results {
                input_tokens += result.input_tokens;
                output_tokens += result.output_tokens;
            }
        }
        if !usage.has_more {
            break;
        }
        let next = usage
            .next_page
            .ok_or("OpenAI usage response missing next page")?;
        if page.as_ref() == Some(&next) {
            return Err("OpenAI usage pagination did not advance".into());
        }
        page = Some(next);
    }

    let costs_url = format!(
        "https://api.openai.com/v1/organization/costs\
         ?start_time={}&end_time={}&bucket_width=1d",
        start_time, now
    );

    let mut total_cost = 0.0;
    page = None;
    loop {
        let mut request = client.get(&costs_url).bearer_auth(&api_key);
        if let Some(cursor) = &page {
            request = request.query(&[("page", cursor)]);
        }
        let costs_response = request
            .send()
            .await
            .map_err(|error| error.to_string())?;

        if !costs_response.status().is_success() {
            return Err(format!(
                "OpenAI costs request failed: {}",
                costs_response.status()
            ));
        }
        let costs: CostResponse = costs_response
            .json()
            .await
            .map_err(|error| error.to_string())?;

        for bucket in costs.data {
            for result in bucket.results {
                if result.amount.currency == "usd" {
                    total_cost += result.amount.value;
                }
            }
        }
        if !costs.has_more {
            break;
        }
        let next = costs
            .next_page
            .ok_or("OpenAI costs response missing next page")?;
        if page.as_ref() == Some(&next) {
            return Err("OpenAI costs pagination did not advance".into());
        }
        page = Some(next);
    }

    Ok(OpenAiUsageSummary {
        total_input_tokens: input_tokens,
        total_output_tokens: output_tokens,
        total_tokens: input_tokens + output_tokens,
        total_cost_usd: total_cost,
    })
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    // A persistence failure must never prevent an explicit quit.
    if let Err(error) = app.save_window_state(StateFlags::POSITION) { eprintln!("Could not save window position: {error}"); }
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod usage_tests {
    #[test]
    #[ignore = "requires a saved Admin API key and network access"]
    fn live_api_usage() {
        let result = tauri::async_runtime::block_on(super::get_openai_usage());
        let usage = result.expect("organization usage request");
        assert!(usage.total_tokens >= 0);
        println!("API tokens: {}; cost: {}", usage.total_tokens, usage.total_cost_usd);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().with_state_flags(StateFlags::POSITION).build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "Show TokenBar", true, None::<&str>)?;

            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let refresh_item = MenuItem::with_id(app, "refresh", "Refresh usage", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let about_item = MenuItem::with_id(app, "about", "About TokenBar", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &refresh_item, &settings_item, &about_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("bundled app icon").clone())
                .menu(&menu)
                .tooltip("TokenBar")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }

                    "refresh" => { let _ = app.emit("refresh-usage", ()); }
                    "settings" | "about" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit("navigate", event.id.as_ref());
                    }
                    "quit" => { let _ = quit_app(app.clone()); }

                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();

                        if let Some(window) = app.get_webview_window("main") {
                            match window.is_visible() {
                                Ok(true) => {
                                    let _ = window.hide();
                                }

                                Ok(false) => {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }

                                Err(_) => {}
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.app_handle().save_window_state(StateFlags::POSITION);
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            quit_app,
            is_codex_installed,
            get_codex_version,
            get_codex_login_status,
            codex_usage::get_codex_usage,
            save_openai_key,
            has_openai_key,
            delete_openai_key,
            validate_openai_key,
            get_openai_usage
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

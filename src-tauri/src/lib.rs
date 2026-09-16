use std::process::Command;
mod codex_response;
mod codex_usage;
mod security;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

const TOKENBAR_SERVICE: &str = "tokenbar";
const OPENAI_ACCOUNT: &str = "openai-admin-key";

fn ensure_native_key_store() -> Result<(), String> {
    if cfg!(any(target_os = "windows", target_os = "macos")) {
        Ok(())
    } else {
        Err("API credentials require Windows Credential Manager or macOS Keychain".into())
    }
}

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
    has_more: bool,
    next_page: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UsageBucket {
    results: Vec<UsageResult>,
}

#[derive(Debug, Deserialize)]
struct UsageResult {
    input_tokens: i64,

    output_tokens: i64,
}

#[derive(Debug, Deserialize)]
struct CostResponse {
    data: Vec<CostBucket>,
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
async fn is_codex_installed() -> bool {
    get_codex_version().await.is_some()
}

#[tauri::command]
async fn get_codex_version() -> Option<String> {
    tauri::async_runtime::spawn_blocking(read_codex_version)
        .await
        .ok()
        .flatten()
}

fn read_codex_version() -> Option<String> {
    use std::io::Read;
    let executable = if cfg!(target_os = "windows") {
        "codex.exe"
    } else {
        "codex"
    };

    let mut command = Command::new(executable);
    command
        .arg("--version")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());

    // Keep the background CLI check from flashing a console window.
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = command.spawn().ok()?;
    let stdout = child.stdout.take()?;
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stdout.take(4096).read_to_end(&mut bytes).map(|_| bytes);
        let _ = sender.send(result);
    });
    let result = receiver.recv_timeout(std::time::Duration::from_secs(3));
    let _ = child.kill();
    let _ = child.wait();
    let bytes = result.ok()?.ok()?;
    let raw = String::from_utf8_lossy(&bytes);
    let version = raw.trim().strip_prefix("codex-cli ")?;
    if version.len() > 24 || !version.chars().all(|c| c.is_ascii_digit() || c == '.') {
        return None;
    }
    Some(format!("codex-cli {version}"))
}

fn get_openai_key_from_keychain() -> Result<String, String> {
    ensure_native_key_store()?;
    let entry = keyring::Entry::new(TOKENBAR_SERVICE, OPENAI_ACCOUNT)
        .map_err(|_| "Secure credential store unavailable")?;

    entry
        .get_password()
        .map_err(|_| "OpenAI Admin API key not found".to_string())
}

#[tauri::command]
async fn save_openai_key(api_key: String) -> Result<(), String> {
    ensure_native_key_store()?;
    if api_key.len() > 1024 || api_key.trim().is_empty() || api_key.chars().any(char::is_whitespace)
    {
        return Err("Invalid API key format".into());
    }
    if !validate_openai_key(Some(api_key.clone())).await? {
        return Err(
            "Authentication failed: invalid key or missing organization admin access".into(),
        );
    }
    let entry = keyring::Entry::new(TOKENBAR_SERVICE, OPENAI_ACCOUNT)
        .map_err(|_| "Secure credential store unavailable")?;

    entry
        .set_password(&api_key)
        .map_err(|_| "Could not save key in secure credential store".into())
}

#[tauri::command]
fn has_openai_key() -> bool {
    get_openai_key_from_keychain().is_ok()
}

#[tauri::command]
fn delete_openai_key() -> Result<(), String> {
    ensure_native_key_store()?;
    let entry = keyring::Entry::new(TOKENBAR_SERVICE, OPENAI_ACCOUNT)
        .map_err(|_| "Secure credential store unavailable")?;

    entry
        .delete_credential()
        .map_err(|_| "Could not remove key from secure credential store".into())
}

#[tauri::command]
async fn validate_openai_key(api_key: Option<String>) -> Result<bool, String> {
    let api_key = match api_key {
        Some(key) => key,
        None => get_openai_key_from_keychain()?,
    };

    let client = security::client()?;

    let response = client
        .get("https://api.openai.com/v1/organization/projects")
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|_| "OpenAI connection failed")?;

    if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
        return Ok(false);
    }
    if !response.status().is_success() {
        return Err(format!("Could not validate API key: {}", response.status()));
    }
    Ok(true)
}

#[tauri::command]
async fn get_openai_usage() -> Result<OpenAiUsageSummary, String> {
    tokio::time::timeout(std::time::Duration::from_secs(45), read_openai_usage())
        .await
        .map_err(|_| "OpenAI usage request timed out".to_string())?
}

async fn read_openai_usage() -> Result<OpenAiUsageSummary, String> {
    let api_key = get_openai_key_from_keychain()?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "System clock is unavailable")?
        .as_secs();

    let start_time = now.saturating_sub(30 * 24 * 60 * 60);

    let usage_url = format!(
        "https://api.openai.com/v1/organization/usage/completions\
         ?start_time={}&end_time={}&bucket_width=1d",
        start_time, now
    );

    let client = security::client()?;
    let mut input_tokens = 0;
    let mut output_tokens = 0;
    let mut page: Option<String> = None;
    let mut seen = std::collections::HashSet::new();
    loop {
        let mut request = client.get(&usage_url).bearer_auth(&api_key);
        if let Some(cursor) = &page {
            request = request.query(&[("page", cursor)]);
        }
        let response = request
            .send()
            .await
            .map_err(|_| "OpenAI connection failed")?;

        if !response.status().is_success() {
            return Err(format!(
                "OpenAI usage request failed: {}",
                response.status()
            ));
        }

        let usage: UsageResponse = security::json(response).await?;

        for bucket in usage.data {
            for result in bucket.results {
                input_tokens = security::add_tokens(input_tokens, result.input_tokens)?;
                output_tokens = security::add_tokens(output_tokens, result.output_tokens)?;
            }
        }
        page = security::next_page(usage.has_more, usage.next_page, &mut seen)?;
        if page.is_none() {
            break;
        }
    }

    let costs_url = format!(
        "https://api.openai.com/v1/organization/costs\
         ?start_time={}&end_time={}&bucket_width=1d",
        start_time, now
    );

    let mut total_cost = 0.0;
    page = None;
    seen.clear();
    loop {
        let mut request = client.get(&costs_url).bearer_auth(&api_key);
        if let Some(cursor) = &page {
            request = request.query(&[("page", cursor)]);
        }
        let costs_response = request
            .send()
            .await
            .map_err(|_| "OpenAI connection failed")?;

        if !costs_response.status().is_success() {
            return Err(format!(
                "OpenAI costs request failed: {}",
                costs_response.status()
            ));
        }
        let costs: CostResponse = security::json(costs_response).await?;

        for bucket in costs.data {
            for result in bucket.results {
                if result.amount.currency != "usd"
                    || !result.amount.value.is_finite()
                    || result.amount.value < 0.0
                {
                    return Err("Invalid API cost response".into());
                }
                total_cost += result.amount.value;
                if !total_cost.is_finite() || total_cost > security::MAX_SAFE_INTEGER as f64 {
                    return Err("Invalid API cost total".into());
                }
            }
        }
        page = security::next_page(costs.has_more, costs.next_page, &mut seen)?;
        if page.is_none() {
            break;
        }
    }

    Ok(OpenAiUsageSummary {
        total_input_tokens: input_tokens,
        total_output_tokens: output_tokens,
        total_tokens: security::add_tokens(input_tokens, output_tokens)?,
        total_cost_usd: total_cost,
    })
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    // A persistence failure must never prevent an explicit quit.
    let _ = app.save_window_state(StateFlags::POSITION);
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
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::POSITION)
                .build(),
        )
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "Show TokenBar", true, None::<&str>)?;

            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let refresh_item =
                MenuItem::with_id(app, "refresh", "Refresh usage", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let about_item = MenuItem::with_id(app, "about", "About TokenBar", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &show_item,
                    &refresh_item,
                    &settings_item,
                    &about_item,
                    &quit_item,
                ],
            )?;

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

                    "refresh" => {
                        let _ = app.emit("refresh-usage", ());
                    }
                    "settings" | "about" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit("navigate", event.id.as_ref());
                    }
                    "quit" => {
                        let _ = quit_app(app.clone());
                    }

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

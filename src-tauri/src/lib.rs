use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::{Deserialize, Serialize};

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
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn get_openai_key_from_keychain() -> Result<String, String> {
    let entry =
        keyring::Entry::new(TOKENBAR_SERVICE, OPENAI_ACCOUNT).map_err(|error| error.to_string())?;

    entry
        .get_password()
        .map_err(|_| "OpenAI Admin API key not found".to_string())
}

#[tauri::command]
fn save_openai_key(api_key: String) -> Result<(), String> {
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
async fn validate_openai_key() -> Result<bool, String> {
    let api_key = get_openai_key_from_keychain()?;

    let client = reqwest::Client::new();

    let response = client
        .get("https://api.openai.com/v1/organization/projects")
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    Ok(response.status().is_success())
}

#[tauri::command]
async fn get_openai_usage() -> Result<OpenAiUsageSummary, String> {
    let api_key = get_openai_key_from_keychain()?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();

    let start_time = now - (24 * 60 * 60);

    let usage_url = format!(
        "https://api.openai.com/v1/organization/usage/completions\
         ?start_time={}&end_time={}&bucket_width=1d",
        start_time, now
    );

    let client = reqwest::Client::new();

    let response = client
        .get(usage_url)
        .bearer_auth(&api_key)
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

    let mut input_tokens = 0;
    let mut output_tokens = 0;

    for bucket in usage.data {
        for result in bucket.results {
            input_tokens += result.input_tokens;
            output_tokens += result.output_tokens;
        }
    }

    let costs_url = format!(
        "https://api.openai.com/v1/organization/costs\
         ?start_time={}&end_time={}&bucket_width=1d",
        start_time, now
    );

    let costs_response = client
        .get(costs_url)
        .bearer_auth(&api_key)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let mut total_cost = 0.0;

    if costs_response.status().is_success() {
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
    }

    Ok(OpenAiUsageSummary {
        total_input_tokens: input_tokens,
        total_output_tokens: output_tokens,
        total_tokens: input_tokens + output_tokens,
        total_cost_usd: total_cost,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            is_codex_installed,
            get_codex_version,
            save_openai_key,
            has_openai_key,
            delete_openai_key,
            validate_openai_key,
            get_openai_usage
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use super::codex_connection::Session;
use serde_json::{json, Value};

pub fn read_usage() -> Result<Value, String> {
    let mut session = Session::start()?;
    let account = session.request(1, "account/read", Some(json!({"refreshToken":true})))?;
    if account["account"].is_null() {
        return Err("Codex authentication required".into());
    }
    let mut limits =
        super::codex_response::limits(session.request(2, "account/rateLimits/read", None)?)?;
    if limits["rateLimits"]["planType"].is_null() {
        limits["rateLimits"]["planType"] = account["account"]["planType"].clone();
    }
    let activity = session
        .request(3, "account/usage/read", None)
        .and_then(super::codex_response::activity);
    Ok(
        json!({"limits":limits,"activity":activity.as_ref().ok(),"activityError":activity.as_ref().err()}),
    )
}

#[tauri::command]
pub async fn get_codex_usage() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(read_usage)
        .await
        .map_err(|_| "Codex worker failed".to_string())?
}

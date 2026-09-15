use serde_json::{json, Value};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    io::{BufRead, BufReader, Write},
    process::{Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

// Read-only app-server requests reuse the CLI's authentication without exposing tokens.
pub fn read_usage() -> Result<Value, String> {
    let mut command = Command::new(if cfg!(windows) { "codex.exe" } else { "codex" });
    command
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command
        .spawn()
        .map_err(|e| format!("Cannot start Codex: {e}"))?;
    let result = (|| {
        let mut input = child.stdin.take().ok_or("Codex stdin unavailable")?;
        let output = child.stdout.take().ok_or("Codex stdout unavailable")?;
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(output).lines() {
                let Ok(line) = line else { break };
                if let Ok(message) = serde_json::from_str::<Value>(&line) {
                    if tx.send(message).is_err() {
                        break;
                    }
                }
            }
        });
        let mut send = |value: Value| writeln!(input, "{value}").map_err(|e| e.to_string());
        let request = |id: i64| -> Result<Value, String> {
            let deadline = Instant::now() + Duration::from_secs(20);
            loop {
                let message = rx
                    .recv_timeout(deadline.saturating_duration_since(Instant::now()))
                    .map_err(|_| "Codex usage request timed out or the CLI exited".to_string())?;
                if message["id"].as_i64() != Some(id) {
                    continue;
                }
                if let Some(error) = message.get("error") {
                    return Err(error["message"]
                        .as_str()
                        .unwrap_or("Codex usage unavailable")
                        .to_string());
                }
                return message
                    .get("result")
                    .cloned()
                    .ok_or("Invalid Codex response".to_string());
            }
        };
        send(
            json!({"id":0,"method":"initialize","params":{"clientInfo":{"name":"tokenbar","version":"0.1.0"}}}),
        )?;
        request(0)?;
        send(json!({"method":"initialized","params":{}}))?;
        send(json!({"id":1,"method":"account/rateLimits/read"}))?;
        let limits = request(1)?;
        send(json!({"id":2,"method":"account/usage/read"}))?;
        // Older CLIs may expose limits without the newer token summary method.
        let activity = request(2);
        Ok(
            json!({"limits":limits,"activity":activity.as_ref().ok(),"activityError":activity.as_ref().err()}),
        )
    })();
    let _ = child.kill();
    let _ = child.wait();
    result
}

#[tauri::command]
pub async fn get_codex_usage() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(read_usage)
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "requires a locally authenticated Codex CLI and network access"]
    fn live_usage() {
        let usage = super::read_usage().expect("live Codex usage");
        println!(
            "limits: {}; token summary: {}",
            usage["limits"]["rateLimits"], usage["activity"]["summary"]
        );
        assert!(usage["limits"]["rateLimits"].is_object());
    }
}

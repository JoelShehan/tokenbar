use serde_json::{json, Value};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex, OnceLock, Weak,
    },
    time::{Duration, Instant},
};
use tauri::Manager;

struct Runtime {
    executable: PathBuf,
    home: PathBuf,
}
static RUNTIME: OnceLock<Runtime> = OnceLock::new();
static LOGIN_BUSY: AtomicBool = AtomicBool::new(false);
static LOGIN_CANCELLED: AtomicBool = AtomicBool::new(false);
static CHILDREN: Mutex<Vec<Weak<Mutex<Child>>>> = Mutex::new(Vec::new());

pub fn shutdown() {
    LOGIN_CANCELLED.store(true, Ordering::SeqCst);
    if let Ok(children) = CHILDREN.lock() {
        for child in children.iter().filter_map(Weak::upgrade) {
            if let Ok(mut child) = child.lock() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

pub fn configure(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let executable = app.path().resource_dir()?.join("resources/codex/codex.exe");
    let executable = if cfg!(debug_assertions) && !executable.is_file() {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/codex/codex.exe")
    } else {
        executable
    };
    let home = app.path().app_local_data_dir()?.join("codex-connection");
    std::fs::create_dir_all(&home)?;
    RUNTIME
        .set(Runtime { executable, home })
        .map_err(|_| "Codex connection already configured")?;
    Ok(())
}

pub fn command() -> Result<Command, String> {
    let runtime = RUNTIME.get().ok_or("Codex connection is unavailable")?;
    if !runtime.executable.is_file() {
        return Err("Bundled Codex helper is missing. Reinstall TokenBar.".into());
    }
    let mut command = Command::new(&runtime.executable);
    command
        .env("CODEX_HOME", &runtime.home)
        .current_dir(&runtime.home);
    command.args([
        "-c",
        "cli_auth_credentials_store=\"keyring\"",
        "-c",
        "forced_login_method=\"chatgpt\"",
        "-c",
        "analytics.enabled=false",
        "-c",
        "feedback.enabled=false",
    ]);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    Ok(command)
}

pub struct Session {
    child: Arc<Mutex<Child>>,
    input: ChildStdin,
    messages: mpsc::Receiver<Value>,
}
impl Drop for Session {
    fn drop(&mut self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
impl Session {
    pub fn start() -> Result<Self, String> {
        Self::from_command(command()?)
    }
    fn from_command(mut command: Command) -> Result<Self, String> {
        let mut child = command
            .arg("app-server")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "Cannot start the bundled Codex helper")?;
        let input = child.stdin.take().ok_or("Codex stdin unavailable")?;
        let output = child.stdout.take().ok_or("Codex stdout unavailable")?;
        let child = Arc::new(Mutex::new(child));
        if let Ok(mut children) = CHILDREN.lock() {
            children.retain(|child| child.strong_count() > 0);
            children.push(Arc::downgrade(&child));
        }
        let (tx, messages) = mpsc::sync_channel(32);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(output);
            loop {
                let mut line = Vec::new();
                let read = reader
                    .by_ref()
                    .take((super::security::MAX_RESPONSE_BYTES + 1) as u64)
                    .read_until(b'\n', &mut line);
                if !matches!(read, Ok(n) if n > 0)
                    || line.len() > super::security::MAX_RESPONSE_BYTES
                {
                    break;
                }
                if let Ok(message) = serde_json::from_slice::<Value>(&line) {
                    if message.get("id").is_some() || message["method"] == "account/login/completed"
                    {
                        if tx.send(message).is_err() {
                            break;
                        }
                    }
                }
            }
        });
        let mut session = Self {
            child,
            input,
            messages,
        };
        session.request(
            0,
            "initialize",
            Some(json!({"clientInfo":{"name":"tokenbar","version":env!("CARGO_PKG_VERSION")}})),
        )?;
        session.send(json!({"method":"initialized","params":{}}))?;
        Ok(session)
    }
    fn send(&mut self, message: Value) -> Result<(), String> {
        writeln!(self.input, "{message}").map_err(|_| "Codex communication failed".into())
    }
    pub fn request(
        &mut self,
        id: i64,
        method: &str,
        params: Option<Value>,
    ) -> Result<Value, String> {
        let mut message = json!({"id":id,"method":method});
        if let Some(params) = params {
            message["params"] = params;
        }
        self.send(message)?;
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let message = self
                .messages
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))
                .map_err(|_| "Codex request timed out or the helper exited")?;
            if message["id"].as_i64() != Some(id) {
                continue;
            }
            return response_result(message);
        }
    }
    fn login(&mut self) -> Result<(), String> {
        let response = self.request(1, "account/login/start", Some(json!({"type":"chatgpt"})))?;
        let url = response["authUrl"]
            .as_str()
            .ok_or("Invalid Codex sign-in response")?;
        validate_login_url(url)?;
        tauri_plugin_opener::open_url(url, None::<&str>)
            .map_err(|_| "Could not open the sign-in browser")?;
        let login_id = response["loginId"]
            .as_str()
            .ok_or("Invalid Codex sign-in response")?;
        let deadline = Instant::now() + Duration::from_secs(300);
        loop {
            if LOGIN_CANCELLED.load(Ordering::SeqCst) {
                let _ = self.send(
                    json!({"id":2,"method":"account/login/cancel","params":{"loginId":login_id}}),
                );
                return Err("Sign-in cancelled".into());
            }
            if Instant::now() >= deadline {
                return Err("Sign-in timed out. Please try again.".into());
            }
            match self.messages.recv_timeout(Duration::from_millis(250)) {
                Ok(message)
                    if message["method"] == "account/login/completed"
                        && message["params"]["loginId"].as_str() == Some(login_id) =>
                {
                    return if message["params"]["success"] == true {
                        Ok(())
                    } else {
                        Err("Sign-in failed. Please try again.".into())
                    };
                }
                Ok(_) | Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(_) => return Err("Codex sign-in helper exited".into()),
            }
        }
    }
}

fn validate_login_url(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "Invalid Codex sign-in response")?;
    if parsed.scheme() != "https"
        || !matches!(parsed.host_str(), Some("auth.openai.com" | "chatgpt.com"))
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
    {
        return Err("Invalid Codex sign-in response".into());
    }
    Ok(())
}
fn response_result(message: Value) -> Result<Value, String> {
    if let Some(error) = message.get("error") {
        let text = error["message"].as_str().unwrap_or("").to_ascii_lowercase();
        return Err(if [
            "401",
            "403",
            "unauthorized",
            "not logged",
            "authentication",
            "sign in",
            "requires chatgpt",
        ]
        .iter()
        .any(|s| text.contains(s))
        {
            "Codex authentication required"
        } else if text.contains("keyring") || text.contains("credential") {
            "The secure credential store is unavailable"
        } else {
            "Codex usage unavailable"
        }
        .into());
    }
    message
        .get("result")
        .cloned()
        .ok_or("Invalid Codex response".into())
}
struct LoginGuard;
impl Drop for LoginGuard {
    fn drop(&mut self) {
        LOGIN_BUSY.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
pub async fn connect_codex() -> Result<(), String> {
    if LOGIN_BUSY
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Sign-in already in progress".into());
    }
    LOGIN_CANCELLED.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(|| {
        let _guard = LoginGuard;
        Session::start()?.login()
    })
    .await
    .map_err(|_| "Codex sign-in worker failed".to_string())?
}
#[tauri::command]
pub fn cancel_codex_login() {
    LOGIN_CANCELLED.store(true, Ordering::SeqCst);
}
#[tauri::command]
pub async fn disconnect_codex() -> Result<(), String> {
    if LOGIN_BUSY.load(Ordering::SeqCst) {
        return Err("Cancel sign-in before disconnecting".into());
    }
    tauri::async_runtime::spawn_blocking(|| {
        Session::start()?
            .request(1, "account/logout", None)
            .map(|_| ())
    })
    .await
    .map_err(|_| "Codex disconnect worker failed".to_string())?
}

#[tauri::command]
pub async fn codex_account_connected() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let account =
            Session::start()?.request(1, "account/read", Some(json!({"refreshToken":false})))?;
        Ok(!account["account"].is_null())
    })
    .await
    .map_err(|_| "Codex account worker failed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sign_in_only_opens_official_https_hosts() {
        assert!(validate_login_url("https://auth.openai.com/oauth/authorize?state=test").is_ok());
        assert!(validate_login_url("https://chatgpt.com/auth").is_ok());
        for url in [
            "http://auth.openai.com",
            "https://auth.openai.com.attacker.test",
            "file:///secret",
            "https://user@chatgpt.com",
            "https://chatgpt.com:444",
        ] {
            assert!(validate_login_url(url).is_err());
        }
    }
    #[test]
    fn errors_do_not_expose_provider_secrets() {
        assert_eq!(
            response_result(json!({"error":{"message":"401 secret-token"}})).unwrap_err(),
            "Codex authentication required"
        );
        assert_eq!(
            response_result(json!({"error":{"message":"secret-token"}})).unwrap_err(),
            "Codex usage unavailable"
        );
        assert!(response_result(json!({"id":1})).is_err());
    }
    #[test]
    #[cfg(windows)]
    fn bundled_helper_starts_sign_in_without_codex_on_path() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let home = root.join("target").join(format!(
            "codex-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&home).unwrap();
        let mut command = Command::new(root.join("resources/codex/codex.exe"));
        command
            .env("CODEX_HOME", &home)
            .env("PATH", "")
            .current_dir(&home)
            .args([
                "-c",
                "cli_auth_credentials_store=\"keyring\"",
                "-c",
                "analytics.enabled=false",
                "-c",
                "feedback.enabled=false",
            ]);
        command.creation_flags(0x08000000);
        let mut session = Session::from_command(command).expect("standalone bundled helper");
        let account = session
            .request(1, "account/read", Some(json!({"refreshToken":false})))
            .unwrap();
        assert!(
            account["account"].is_null(),
            "test home must not inherit another Codex account"
        );
        let login = session
            .request(2, "account/login/start", Some(json!({"type":"chatgpt"})))
            .unwrap();
        validate_login_url(login["authUrl"].as_str().unwrap()).unwrap();
        session
            .request(
                3,
                "account/login/cancel",
                Some(json!({"loginId":login["loginId"]})),
            )
            .unwrap();
        drop(session);
        assert!(
            !home.join("auth.json").exists(),
            "no plaintext credential fallback"
        );
    }
}

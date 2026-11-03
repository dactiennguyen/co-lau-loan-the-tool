// Quản lý thiết bị (docs/integration/rust/features.md#thiết-bị, server/README.md#thiết-bị): as it opens and every 15
// minutes, the app says hello to CLLT Server (POST /api/devices/hello) with the id of this machine, its name and system,
// the version of the app and the usernames of its accounts (no passwords). The answer says whether this device may run;
// one that may then sends its accounts that changed, passwords included (sync.rs).
//
// The id is the SHA-256 of the operating system's machine id (MachineGuid on Windows, IOPlatformUUID on macOS,
// /etc/machine-id on Linux, read by machine-uid): the same after the app is removed and installed again.
//
// A device never seen is allowed. A blocked one logs every account out, refuses to log one in, and the UI covers the
// window (DeviceGate.tsx). The answer is kept in device.json beside accounts.json: without network the app keeps the
// last one, so a blocked device stays blocked offline, and an allowed or never-answered one keeps running.
use crate::app::Shared;
use cllt_core::net::Command;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// CLLT Server; CLLT_DEVICE_SERVER changes it, and `off` there turns the hello off (development). Another server must be
/// https, or on this machine: the sync sends passwords (server_of).
const SERVER: &str = "https://colau.olachat.net";
const EVERY: Duration = Duration::from_secs(15 * 60);
const TIMEOUT: Duration = Duration::from_secs(15);

/// Whether this device may run, as the UI shows it (DeviceView in ../src/api/types.ts).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum DeviceState {
    /// No hello: --sample, or CLLT_DEVICE_SERVER=off.
    Off,
    /// No answer yet (first start, or the server could not be reached so far).
    Unknown,
    Allowed {
        checked_at: u64,
    },
    Blocked {
        reason: String,
        checked_at: u64,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceView {
    /// The first 12 characters of the device id, as the admin page shows them.
    pub id: String,
    #[serde(flatten)]
    pub state: DeviceState,
}

/// The last answer of the server, kept in device.json.
#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Saved {
    blocked: bool,
    #[serde(default)]
    reason: String,
    #[serde(default)]
    checked_at: u64,
}

struct Inner {
    id: String,
    /// The secret of this device (device.key): the server keeps the first one it gets and takes no hello or sync of
    /// this id without it, so knowing the id is not enough to pass for the device. None when it could not be kept.
    key: Option<String>,
    state: DeviceState,
    file: PathBuf,
}

/// Managed by the app (lib.rs); the hello thread, the commands and App::login read it.
pub struct Devices(Mutex<Inner>);

impl Devices {
    pub fn blocked(&self) -> bool {
        matches!(self.0.lock().unwrap().state, DeviceState::Blocked { .. })
    }
}

pub fn view<R: Runtime>(app: &AppHandle<R>) -> DeviceView {
    let d = app.state::<Devices>();
    let inner = d.0.lock().unwrap();
    DeviceView {
        id: inner.id.chars().take(12).collect(),
        state: inner.state.clone(),
    }
}

/// This machine's id: SHA-256 (hex) of the system's machine id with the app's name, so the raw id never leaves it. A
/// machine whose id cannot be read gets one from its name and home folder (it changes with them).
pub fn machine_id() -> String {
    let raw = machine_uid::get().unwrap_or_else(|e| {
        eprintln!("Quản lý thiết bị: không đọc được machine id ({e}), dùng tên máy");
        format!(
            "fallback:{}:{}",
            hostname(),
            std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .unwrap_or_default()
        )
    });
    hash(&raw)
}

/// The device key of device.key beside accounts.json (`file` is device.json): made once, 32 random bytes in hex, readable
/// by the owner only. None when it can be neither read nor made: the hello then goes without one (the server answers,
/// but takes no sync), rather than with a key the next start would not have, which the server would refuse.
fn device_key(file: &Path) -> Option<String> {
    let path = file.with_file_name("device.key");
    let valid = |k: &str| k.len() == 64 && k.bytes().all(|b| b.is_ascii_hexdigit());
    if let Ok(text) = std::fs::read_to_string(&path) {
        let key = text.trim();
        if valid(key) {
            return Some(key.to_string());
        }
    }
    let mut bytes = [0u8; 32];
    if let Err(e) = getrandom::fill(&mut bytes) {
        eprintln!("Quản lý thiết bị: không tạo được khoá thiết bị ({e})");
        return None;
    }
    let key: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    match cllt_core::accounts::write_private(&path, key.as_bytes()) {
        Ok(()) => Some(key),
        Err(e) => {
            eprintln!("Quản lý thiết bị: không ghi được khoá thiết bị: {e}");
            None
        }
    }
}

/// CLLT_DEVICE_SERVER when it is "off", https, or on this machine; else CLLT Server, as the hello and the sync carry the
/// device key and the passwords.
fn server_of(var: Option<String>) -> String {
    match var {
        Some(s) if s == "off" || s.starts_with("https://") => s,
        Some(s)
            if ["http://localhost", "http://127.0.0.1"]
                .iter()
                .any(|local| {
                    s == *local
                        || s.starts_with(&format!("{local}:"))
                        || s.starts_with(&format!("{local}/"))
                }) =>
        {
            s
        }
        Some(s) => {
            eprintln!("Quản lý thiết bị: bỏ qua CLLT_DEVICE_SERVER {s}: phải là https");
            SERVER.into()
        }
        None => SERVER.into(),
    }
}

fn hash(raw: &str) -> String {
    let digest = Sha256::digest(format!("colautool-device:{}", raw.trim()).as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

fn hostname() -> String {
    gethostname::gethostname().to_string_lossy().into_owned()
}

fn load(file: &Path) -> Saved {
    std::fs::read(file)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn state_of(saved: &Saved) -> DeviceState {
    match saved.blocked {
        true => DeviceState::Blocked {
            reason: saved.reason.clone(),
            checked_at: saved.checked_at,
        },
        false if saved.checked_at > 0 => DeviceState::Allowed {
            checked_at: saved.checked_at,
        },
        false => DeviceState::Unknown,
    }
}

/// Sets up the state from device.json (`accounts` is accounts.json, which it sits beside) and starts the hellos.
pub fn start<R: Runtime>(app: &AppHandle<R>, accounts: &Path, sample: bool) {
    let server = server_of(std::env::var("CLLT_DEVICE_SERVER").ok());
    let off = sample || server == "off";
    let file = accounts.with_file_name("device.json");
    let state = if off {
        DeviceState::Off
    } else {
        state_of(&load(&file))
    };
    let key = if off { None } else { device_key(&file) };
    app.manage(Devices(Mutex::new(Inner {
        id: machine_id(),
        key,
        state,
        file,
    })));
    if off {
        return;
    }
    // Blocked at the last answer: blocked now, before any hello.
    enforce(app);
    let app = app.clone();
    std::thread::spawn(move || loop {
        tauri::async_runtime::block_on(hello(&app, &server));
        std::thread::sleep(EVERY);
    });
}

/// A blocked device logs every account out.
fn enforce<R: Runtime>(app: &AppHandle<R>) {
    if app.state::<Devices>().blocked() {
        if let Some(shared) = app.try_state::<Shared>() {
            shared.with(|a| a.send_all(Command::Logout));
        }
    }
}

#[derive(Debug, Deserialize)]
struct Answer {
    allowed: bool,
    #[serde(default)]
    reason: String,
    /// The admin let this device sync (Cho đồng bộ) and its key is the one the server keeps: only then does the sync go,
    /// with the passwords. A server from before it says nothing: no sync.
    #[serde(default)]
    sync: bool,
}

/// POST /api/devices/hello and its answer.
async fn ask(server: &str, body: &serde_json::Value) -> reqwest::Result<Answer> {
    // As tauri-plugin-updater does: reqwest is built without a TLS crypto provider of its own.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder().timeout(TIMEOUT).build()?;
    client
        .post(format!("{server}/api/devices/hello"))
        .json(body)
        .send()
        .await?
        .error_for_status()?
        .json::<Answer>()
        .await
}

/// One hello; a failure keeps the state as it was.
async fn hello<R: Runtime>(app: &AppHandle<R>, server: &str) {
    let accounts: Vec<serde_json::Value> = app
        .try_state::<Shared>()
        .map(|s| {
            s.with(|a| {
                a.entries
                    .iter()
                    .map(|e| serde_json::json!({ "username": e.account.username, "serverId": e.account.server_id }))
                    .collect()
            })
        })
        .unwrap_or_default();
    let (id, key, file) = {
        let devices = app.state::<Devices>();
        let inner = devices.0.lock().unwrap();
        (
            inner.id.clone(),
            inner.key.clone(),
            inner.file.with_file_name("sync.json"),
        )
    };
    let body = serde_json::json!({
        "id": id,
        "key": key,
        "hostname": hostname(),
        "os": format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        "version": env!("CARGO_PKG_VERSION"),
        "accounts": accounts,
    });
    match ask(server, &body).await {
        Ok(a) => {
            let sync = a.allowed && a.sync;
            settle(app, a);
            // Đồng bộ nick lên server (sync.rs): only from a device that may run, that the admin let sync and whose key
            // the server holds. Nothing with the passwords goes before that.
            if let (true, Some(key)) = (sync, key) {
                crate::sync::run(app, server, &id, &key, &file).await;
            }
        }
        Err(e) => eprintln!("Quản lý thiết bị: không hỏi được server ({e}), giữ trạng thái cũ"),
    }
}

fn settle<R: Runtime>(app: &AppHandle<R>, answer: Answer) {
    let saved = Saved {
        blocked: !answer.allowed,
        reason: answer.reason,
        checked_at: crate::app::epoch_ms(),
    };
    {
        let devices = app.state::<Devices>();
        let mut inner = devices.0.lock().unwrap();
        inner.state = state_of(&saved);
        if let Err(e) = std::fs::write(&inner.file, serde_json::to_vec(&saved).unwrap_or_default())
        {
            eprintln!(
                "Quản lý thiết bị: không ghi được {}: {e}",
                inner.file.display()
            );
        }
    }
    enforce(app);
    let _ = app.emit("device", view(app));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_device_key_is_made_once_kept_for_the_owner_and_made_again_when_broken() {
        let dir = std::env::temp_dir().join(format!("cllt-key-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("device.json");
        let key = device_key(&file).unwrap();
        assert!(key.len() == 64 && key.bytes().all(|b| b.is_ascii_hexdigit()));
        assert_eq!(
            device_key(&file),
            Some(key.clone()),
            "the same at the next start"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.join("device.key"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        std::fs::write(dir.join("device.key"), "hỏng").unwrap();
        let again = device_key(&file).unwrap();
        assert!(again != key && again.len() == 64);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn another_device_server_must_be_https_or_on_this_machine() {
        for kept in [
            "off",
            "https://x.example",
            "http://localhost:8787",
            "http://127.0.0.1",
            "http://127.0.0.1/a",
        ] {
            assert_eq!(server_of(Some(kept.into())), kept);
        }
        for refused in [
            "http://x.example",
            "http://localhost.evil.example",
            "ftp://x",
        ] {
            assert_eq!(server_of(Some(refused.into())), SERVER, "{refused}");
        }
        assert_eq!(server_of(None), SERVER);
    }

    #[test]
    fn an_answer_says_sync_only_when_the_server_does() {
        let a: Answer = serde_json::from_str(r#"{"allowed": true}"#).unwrap();
        assert!(a.allowed && !a.sync);
        let a: Answer = serde_json::from_str(r#"{"allowed": true, "sync": true}"#).unwrap();
        assert!(a.sync);
    }

    #[test]
    fn the_id_is_a_sha256_of_the_machine_id_and_stays_the_same() {
        let id = machine_id();
        assert_eq!(id.len(), 64);
        assert!(id
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        assert_eq!(id, machine_id());
        assert_ne!(hash("a"), hash("b"));
    }

    #[test]
    fn device_json_gives_the_last_answer_and_nothing_is_unknown() {
        assert_eq!(state_of(&Saved::default()), DeviceState::Unknown);
        let blocked = Saved {
            blocked: true,
            reason: "Hết hạn".into(),
            checked_at: 5,
        };
        assert_eq!(
            state_of(&blocked),
            DeviceState::Blocked {
                reason: "Hết hạn".into(),
                checked_at: 5
            }
        );
        let back: Saved = serde_json::from_slice(&serde_json::to_vec(&blocked).unwrap()).unwrap();
        assert_eq!(back, blocked);
        let dir = std::env::temp_dir().join(format!("cllt-device-{}", std::process::id()));
        assert_eq!(load(&dir.join("none.json")), Saved::default());
    }

    /// The real hello over HTTPS, by hand: CLLT_DEVICE_SERVER=https://colau.olachat.net cargo test -- --ignored hello
    /// (it records a device "test" with the id below, to delete on the admin page).
    #[test]
    #[ignore]
    fn hello_reaches_the_server() {
        let server = std::env::var("CLLT_DEVICE_SERVER").unwrap_or_else(|_| SERVER.into());
        let body = serde_json::json!({ "id": "0".repeat(64), "hostname": "test", "os": "test", "version": "test", "accounts": [] });
        let answer = tauri::async_runtime::block_on(ask(&server, &body)).unwrap();
        assert!(answer.allowed, "{answer:?}");
    }

    #[test]
    fn the_view_is_flat_camel_case_with_the_state_as_its_tag() {
        let v = DeviceView {
            id: "abcdef012345".into(),
            state: DeviceState::Blocked {
                reason: "x".into(),
                checked_at: 7,
            },
        };
        assert_eq!(
            serde_json::to_value(v).unwrap(),
            serde_json::json!({ "id": "abcdef012345", "state": "blocked", "reason": "x", "checkedAt": 7 })
        );
    }
}

// Quản lý thiết bị (docs/integration/rust/features.md#thiết-bị, server/README.md#thiết-bị): as it opens and every 15
// minutes, the app says hello to CLLT Server (POST /api/devices/hello) with the id of this machine, its name and system,
// the version of the app and the usernames of its accounts (no passwords). The answer says whether this device may run.
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

/// CLLT Server; CLLT_DEVICE_SERVER changes it, and `off` there turns the hello off (development).
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
    let server = std::env::var("CLLT_DEVICE_SERVER").unwrap_or_else(|_| SERVER.into());
    let off = sample || server == "off";
    let file = accounts.with_file_name("device.json");
    let state = if off {
        DeviceState::Off
    } else {
        state_of(&load(&file))
    };
    app.manage(Devices(Mutex::new(Inner {
        id: machine_id(),
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
    let id = app.state::<Devices>().0.lock().unwrap().id.clone();
    let body = serde_json::json!({
        "id": id,
        "hostname": hostname(),
        "os": format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        "version": env!("CARGO_PKG_VERSION"),
        "accounts": accounts,
    });
    match ask(server, &body).await {
        Ok(a) => settle(app, a),
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

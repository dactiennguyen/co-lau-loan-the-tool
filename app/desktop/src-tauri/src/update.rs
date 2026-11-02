// Tự cập nhật (docs/integration/rust/release.md#tự-cập-nhật): tauri-plugin-updater reads latest.json of the latest GitHub
// release once, as soon as the app opens, or when the user asks: a version released while the app runs waits for the next
// time it opens, so accounts playing are not logged out for it. Every newer version is mandatory: it is
// downloaded at once, its minisign signature checked against the public key of tauri.conf.json, then installed at once
// (every account logged out first) and the app opened again; the UI covers the whole window meanwhile (UpdateGate.tsx).
// A check that fails (no network, GitHub down) blocks nothing. The UI hears of each change with the "update" event.
// Only an installed app updates itself: `tauri dev` and the portable Windows exe carry no bundle type.
use crate::app::Shared;
use cllt_core::net::Command;
use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Least time between two "update" events while downloading.
const PROGRESS: Duration = Duration::from_millis(250);
/// Longest the app waits, once its window is gone, for the update to install on quit.
const ON_QUIT: Duration = Duration::from_secs(30);

/// Where the update stands, as the UI shows it (UpdateView in ../src/api/types.ts).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum UpdateState {
    /// This copy does not update itself, and why.
    Off {
        reason: String,
    },
    /// Not checked yet.
    Idle,
    Checking,
    /// The last check found nothing newer, at `checked_at` (ms since 1970).
    Latest {
        checked_at: u64,
    },
    Downloading {
        version: String,
        notes: String,
        got: u64,
        total: Option<u64>,
    },
    /// Downloaded and verified: being installed at once (mandatory), or when the app quits if that failed to start.
    Ready {
        version: String,
        notes: String,
    },
    Installing {
        version: String,
    },
    Failed {
        message: String,
        checked_at: u64,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateView {
    /// The version running.
    pub current: String,
    #[serde(flatten)]
    pub state: UpdateState,
}

#[derive(Default)]
struct Inner {
    state: Option<UpdateState>,
    /// The update downloaded and verified, with its bytes.
    ready: Option<(Update, Vec<u8>)>,
}

/// Managed by the app (lib.rs); the commands and the check thread share it.
#[derive(Default)]
pub struct Updates(Mutex<Inner>);

impl Updates {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
    fn state(&self) -> UpdateState {
        self.lock().state.clone().unwrap_or(UpdateState::Idle)
    }
}

pub fn view<R: Runtime>(app: &AppHandle<R>) -> UpdateView {
    UpdateView {
        current: app.package_info().version.to_string(),
        state: app.state::<Updates>().state(),
    }
}

fn set<R: Runtime>(app: &AppHandle<R>, state: UpdateState) {
    app.state::<Updates>().lock().state = Some(state);
    let _ = app.emit("update", view(app));
}

/// Turns updates off for a copy that cannot update itself, else checks once, at once (a newer version is mandatory).
pub fn start<R: Runtime>(app: &AppHandle<R>, sample: bool) {
    let off = if sample {
        Some("dữ liệu mẫu (--sample)")
    } else if tauri::utils::platform::bundle_type().is_none() {
        Some("bản chạy từ mã nguồn hay bản portable, không phải bản cài")
    } else {
        None
    };
    if let Some(reason) = off {
        app.state::<Updates>().lock().state = Some(UpdateState::Off {
            reason: reason.into(),
        });
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || tauri::async_runtime::block_on(check(&app)));
}

/// Checks for a newer version and downloads it. Does nothing while off, checking, downloading, or once one is ready.
pub async fn check<R: Runtime>(app: &AppHandle<R>) {
    {
        let updates = app.state::<Updates>();
        let mut inner = updates.lock();
        match inner.state {
            None
            | Some(UpdateState::Idle | UpdateState::Latest { .. } | UpdateState::Failed { .. }) => {
                inner.state = Some(UpdateState::Checking)
            }
            _ => return,
        }
    }
    let _ = app.emit("update", view(app));
    let found = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(e) => Err(e),
    };
    match found {
        Ok(None) => set(
            app,
            UpdateState::Latest {
                checked_at: crate::app::epoch_ms(),
            },
        ),
        Ok(Some(update)) => download(app, update).await,
        Err(e) => fail(app, &e),
    }
}

async fn download<R: Runtime>(app: &AppHandle<R>, update: Update) {
    let (version, notes) = (
        update.version.clone(),
        update.body.clone().unwrap_or_default(),
    );
    let downloading = |got, total| UpdateState::Downloading {
        version: version.clone(),
        notes: notes.clone(),
        got,
        total,
    };
    set(app, downloading(0, None));
    let (mut got, mut told) = (0u64, Instant::now());
    let bytes = update
        .download(
            |chunk, total| {
                got += chunk as u64;
                if told.elapsed() >= PROGRESS {
                    told = Instant::now();
                    set(app, downloading(got, total));
                }
            },
            || {},
        )
        .await;
    match bytes {
        Ok(bytes) => {
            app.state::<Updates>().lock().ready = Some((update, bytes));
            set(app, UpdateState::Ready { version, notes });
            // Mandatory: installed now, and the app opens again. Off the async workers, as install_update does (macOS
            // may ask for an admin password). A failed install leaves the state Failed, which unblocks the UI; the next
            // check tries again.
            let app = app.clone();
            let _ = tauri::async_runtime::spawn_blocking(move || install_now(&app)).await;
        }
        Err(e) => fail(app, &e),
    }
}

fn fail<R: Runtime>(app: &AppHandle<R>, e: &tauri_plugin_updater::Error) {
    eprintln!("Tự cập nhật: {e}");
    set(
        app,
        UpdateState::Failed {
            message: message(e),
            checked_at: crate::app::epoch_ms(),
        },
    );
}

/// What the UI says of an error of the updater.
fn message(e: &tauri_plugin_updater::Error) -> String {
    use tauri_plugin_updater::Error as E;
    match e {
        E::ReleaseNotFound => "chưa có bản nào trên GitHub Releases có latest.json".into(),
        E::Reqwest(_) | E::Network(_) => format!("không tải được từ GitHub ({e})"),
        E::Minisign(_)
        | E::Base64(_)
        | E::SignatureUtf8(_)
        | E::SignedVersionMismatch { .. }
        | E::MissingSignedVersion => {
            format!("chữ ký của bản tải về không khớp, không cài ({e})")
        }
        E::TargetNotFound(_) | E::TargetsNotFound(_) => {
            format!("bản mới chưa có cho máy này ({e})")
        }
        _ => e.to_string(),
    }
}

/// Khởi động lại: logs every account out, installs the update and opens the new version. On Windows the installer
/// takes over (the app exits and the installer opens it again).
pub fn install_now<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let Some((update, bytes)) = app.state::<Updates>().lock().ready.take() else {
        return Err("Chưa có bản cập nhật nào tải xong".into());
    };
    set(
        app,
        UpdateState::Installing {
            version: update.version.clone(),
        },
    );
    if let Some(shared) = app.try_state::<Shared>() {
        shared.with(|a| a.send_all(Command::Logout));
    }
    // The sessions close their sockets.
    std::thread::sleep(Duration::from_millis(500));
    match update.install(&bytes) {
        Ok(()) => app.restart(),
        Err(e) => {
            let text = message(&e);
            set(
                app,
                UpdateState::Failed {
                    message: format!("không cài được bản {}: {text}", update.version),
                    checked_at: crate::app::epoch_ms(),
                },
            );
            Err(text)
        }
    }
}

/// When the app quits with an update downloaded, installs it, for the next start. In a thread with a time limit: on
/// macOS an app in a folder the user cannot write asks for an admin password on the main thread, which is gone by
/// then; that update is then left for the next time.
pub fn install_on_quit<R: Runtime>(app: &AppHandle<R>) {
    let Some((update, bytes)) = app.state::<Updates>().lock().ready.take() else {
        return;
    };
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        // On Windows the installer starts and this process exits; it does not open the app again.
        let result = update.restart_after_install(false).install(&bytes);
        let _ = tx.send(result);
    });
    match rx.recv_timeout(ON_QUIT) {
        Ok(Ok(())) => {}
        Ok(Err(e)) => eprintln!("Tự cập nhật khi tắt app: {e}"),
        Err(_) => eprintln!(
            "Tự cập nhật khi tắt app: quá {} s, để lần sau",
            ON_QUIT.as_secs()
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_view_is_flat_camel_case_with_the_state_as_its_tag() {
        let view = |state| {
            serde_json::to_value(UpdateView {
                current: "0.2.0".into(),
                state,
            })
            .unwrap()
        };
        assert_eq!(
            view(UpdateState::Downloading {
                version: "0.3.0".into(),
                notes: "Nhật ký theo loại".into(),
                got: 1024,
                total: Some(4096),
            }),
            serde_json::json!({ "current": "0.2.0", "state": "downloading", "version": "0.3.0",
                "notes": "Nhật ký theo loại", "got": 1024, "total": 4096 })
        );
        assert_eq!(
            view(UpdateState::Failed {
                message: "x".into(),
                checked_at: 5
            }),
            serde_json::json!({ "current": "0.2.0", "state": "failed", "message": "x", "checkedAt": 5 })
        );
        assert_eq!(
            view(UpdateState::Idle),
            serde_json::json!({ "current": "0.2.0", "state": "idle" })
        );
    }
}

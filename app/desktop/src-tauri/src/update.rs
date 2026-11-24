// Tự cập nhật (docs/integration/rust/release.md#tự-cập-nhật): tauri-plugin-updater reads latest.json of the latest GitHub
// release once, as soon as the app opens, or when the user asks: a version released while the app runs waits for the next
// time it opens, so accounts playing are not logged out for it. Every newer version is mandatory: it is
// downloaded at once, its minisign signature checked against the public key of tauri.conf.json, then installed at once
// (every account logged out first) and the app opened again; the UI covers the whole window meanwhile (UpdateGate.tsx).
// A check that fails (no network, GitHub down) blocks nothing. The UI hears of each change with the "update" event.
// Only an installed app updates itself: `tauri dev` and the portable Windows exe carry no bundle type.
// The Android app has no tauri-plugin-updater: it reads the same latest.json, whose `android` (latest-json.mjs) names the
// APK of the version and its SHA-256, downloads it to its cache, checks the SHA-256 and opens the installer of Android on
// it (plugins/keepalive installApk), which the user confirms; Android lets only an APK signed with the same key replace
// the app, which keeps its data. The UI says the same as on the desktop, with Cài đặt and Để sau once it is ready
// (UpdateGate.tsx): the user may cancel the installer, or must first let the app install apps.
#[cfg(desktop)]
use crate::app::Shared;
#[cfg(desktop)]
use cllt_core::net::Command;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tauri::{AppHandle, Manager, Runtime};
#[cfg(desktop)]
use tauri_plugin_updater::{Update, UpdaterExt};

/// What the Android app says when the user has not let it install apps yet (installApk opened that setting).
#[cfg(mobile)]
const ALLOW: &str =
    "Bật \"Cho phép từ nguồn này\" cho Co Lau Tool ở màn hình vừa mở, rồi quay lại bấm Cài đặt";
/// Longest the download of an APK may take.
#[cfg(mobile)]
const APK_TIMEOUT: Duration = Duration::from_secs(900);

/// Least time between two "update" events while downloading.
const PROGRESS: Duration = Duration::from_millis(250);
/// Longest the app waits, once its window is gone, for the update to install on quit.
#[cfg(desktop)]
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
    #[cfg(desktop)]
    ready: Option<(Update, Vec<u8>)>,
    /// Android: the APK downloaded and checked, in the app's cache.
    #[cfg(mobile)]
    apk: Option<std::path::PathBuf>,
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

/// Checking, unless off, checking, downloading, or once one is ready: false then, and the check does nothing.
fn begin_check<R: Runtime>(app: &AppHandle<R>) -> bool {
    {
        let updates = app.state::<Updates>();
        let mut inner = updates.lock();
        match inner.state {
            None
            | Some(UpdateState::Idle | UpdateState::Latest { .. } | UpdateState::Failed { .. }) => {
                inner.state = Some(UpdateState::Checking)
            }
            _ => return false,
        }
    }
    let _ = app.emit("update", view(app));
    true
}

fn failed<R: Runtime>(app: &AppHandle<R>, message: String) {
    eprintln!("Tự cập nhật: {message}");
    set(
        app,
        UpdateState::Failed {
            message,
            checked_at: crate::app::epoch_ms(),
        },
    );
}

/// Turns updates off for a copy that cannot update itself, else checks once, at once (a newer version is mandatory).
pub fn start<R: Runtime>(app: &AppHandle<R>, sample: bool) {
    #[cfg(mobile)]
    start_mobile(app, sample);
    #[cfg(desktop)]
    start_desktop(app, sample);
}

#[cfg(mobile)]
fn start_mobile<R: Runtime>(app: &AppHandle<R>, sample: bool) {
    if sample {
        app.state::<Updates>().lock().state = Some(UpdateState::Off {
            reason: "dữ liệu mẫu (--sample)".into(),
        });
        return;
    }
    // The APK of the version now running, or of one the user did not install: a check downloads it again.
    if let Ok(cache) = app.path().app_cache_dir() {
        let _ = std::fs::remove_dir_all(cache.join("update"));
    }
    let app = app.clone();
    std::thread::spawn(move || tauri::async_runtime::block_on(check(&app)));
}

#[cfg(desktop)]
fn start_desktop<R: Runtime>(app: &AppHandle<R>, sample: bool) {
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

/// The APK of a version, as latest-json.mjs writes it in latest.json (`android`).
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Apk {
    pub url: String,
    pub sha256: String,
}

/// A version newer than the one running, for Android.
#[derive(Debug, Clone, PartialEq)]
pub struct AndroidRelease {
    pub version: String,
    pub notes: String,
    pub apk: Apk,
}

/// The numbers of a version ("2.2.21", "v2.2.21"; what follows a "-" or "+" is left out), three at least.
fn numbers(version: &str) -> Vec<u64> {
    let core = version.trim().trim_start_matches('v');
    let core = core.split(['-', '+']).next().unwrap_or("");
    let mut n: Vec<u64> = core.split('.').map(|p| p.parse().unwrap_or(0)).collect();
    n.resize(n.len().max(3), 0);
    n
}

/// Whether `latest` is a version after `current`.
pub fn newer(latest: &str, current: &str) -> bool {
    numbers(latest) > numbers(current)
}

/// What latest.json offers Android: its version, notes and APK when that version is after `current`; None when it is
/// not, or when that release has no APK (built without the signing key of the APK).
// Only Android reads it; the tests run on the desktop.
#[cfg_attr(desktop, allow(dead_code))]
pub fn android_release(latest: &serde_json::Value, current: &str) -> Option<AndroidRelease> {
    let version = latest.get("version")?.as_str()?.trim_start_matches('v');
    if !newer(version, current) {
        return None;
    }
    let apk: Apk = serde_json::from_value(latest.get("android")?.clone()).ok()?;
    Some(AndroidRelease {
        version: version.to_string(),
        notes: latest
            .get("notes")
            .and_then(|n| n.as_str())
            .unwrap_or_default()
            .to_string(),
        apk,
    })
}

/// The hex SHA-256 of `bytes`.
#[cfg_attr(desktop, allow(dead_code))]
fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Checks for a newer version and downloads it. Does nothing while off, checking, downloading, or once one is ready.
#[cfg(mobile)]
pub async fn check<R: Runtime>(app: &AppHandle<R>) {
    if !begin_check(app) {
        return;
    }
    match android_latest(app).await {
        Ok(None) => set(
            app,
            UpdateState::Latest {
                checked_at: crate::app::epoch_ms(),
            },
        ),
        Ok(Some(release)) => match download_apk(app, &release).await {
            Ok(path) => {
                app.state::<Updates>().lock().apk = Some(path);
                set(
                    app,
                    UpdateState::Ready {
                        version: release.version,
                        notes: release.notes,
                    },
                );
                // The installer at once (mandatory, as on the desktop); the user confirms it there.
                let app = app.clone();
                let _ = tauri::async_runtime::spawn_blocking(move || install_now(&app)).await;
            }
            Err(message) => failed(app, message),
        },
        Err(message) => failed(app, message),
    }
}

/// latest.json of the latest release (the endpoint of the updater in tauri.conf.json), read for Android.
#[cfg(mobile)]
async fn android_latest<R: Runtime>(app: &AppHandle<R>) -> Result<Option<AndroidRelease>, String> {
    let endpoint = app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|u| u.get("endpoints"))
        .and_then(|e| e.get(0))
        .and_then(|e| e.as_str())
        .ok_or("tauri.conf.json không có endpoints của updater")?
        .to_string();
    let client = crate::machine::client(Duration::from_secs(30)).map_err(|e| e.to_string())?;
    let latest: serde_json::Value = client
        .get(&endpoint)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("không tải được từ GitHub ({e})"))?
        .json()
        .await
        .map_err(|e| format!("latest.json không đọc được ({e})"))?;
    Ok(android_release(
        &latest,
        &app.package_info().version.to_string(),
    ))
}

/// Downloads the APK of `release` to the app's cache, telling the UI how far it got, and checks its SHA-256.
#[cfg(mobile)]
async fn download_apk<R: Runtime>(
    app: &AppHandle<R>,
    release: &AndroidRelease,
) -> Result<std::path::PathBuf, String> {
    let downloading = |got, total| UpdateState::Downloading {
        version: release.version.clone(),
        notes: release.notes.clone(),
        got,
        total,
    };
    set(app, downloading(0, None));
    let net = |e: reqwest::Error| format!("không tải được bản {} ({e})", release.version);
    let client = crate::machine::client(APK_TIMEOUT).map_err(|e| e.to_string())?;
    let mut response = client
        .get(&release.apk.url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(net)?;
    let total = response.content_length();
    let mut bytes = Vec::with_capacity(total.unwrap_or(0) as usize);
    let mut told = Instant::now();
    while let Some(chunk) = response.chunk().await.map_err(net)? {
        bytes.extend_from_slice(&chunk);
        if told.elapsed() >= PROGRESS {
            told = Instant::now();
            set(app, downloading(bytes.len() as u64, total));
        }
    }
    if !sha256_hex(&bytes).eq_ignore_ascii_case(release.apk.sha256.trim()) {
        return Err(format!(
            "bản {} tải về không khớp SHA-256, không cài",
            release.version
        ));
    }
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("update");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("colautool-{}.apk", release.version));
    std::fs::write(&path, &bytes).map_err(|e| format!("không lưu được APK ({e})"))?;
    Ok(path)
}

/// Checks for a newer version and downloads it. Does nothing while off, checking, downloading, or once one is ready.
#[cfg(desktop)]
pub async fn check<R: Runtime>(app: &AppHandle<R>) {
    if !begin_check(app) {
        return;
    }
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

#[cfg(desktop)]
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

#[cfg(desktop)]
fn fail<R: Runtime>(app: &AppHandle<R>, e: &tauri_plugin_updater::Error) {
    failed(app, message(e));
}

/// What the UI says of an error of the updater.
#[cfg(desktop)]
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

/// Cài đặt (Android): the installer of Android on the APK downloaded, which replaces the app once the user confirms.
/// The state stays Ready: the user may cancel there, and press Cài đặt again.
#[cfg(mobile)]
pub fn install_now<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let Some(path) = app.state::<Updates>().lock().apk.clone() else {
        return Err("Chưa có bản cập nhật nào tải xong".into());
    };
    tauri_plugin_keepalive::install_apk(app, &path.to_string_lossy()).map_err(|e| {
        if e.contains("allow") {
            ALLOW.to_string()
        } else {
            format!("không mở được trình cài APK ({e})")
        }
    })
}

/// Khởi động lại: logs every account out, installs the update and opens the new version. On Windows the installer
/// takes over (the app exits and the installer opens it again).
#[cfg(desktop)]
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
#[cfg(mobile)]
pub fn install_on_quit<R: Runtime>(_app: &AppHandle<R>) {}

#[cfg(desktop)]
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
    fn a_version_is_newer_by_its_numbers() {
        assert!(newer("2.2.22", "2.2.21"));
        assert!(newer("2.10.0", "2.9.9"), "numbers, not text");
        assert!(newer("v3.0", "2.99.99"));
        assert!(!newer("2.2.21", "2.2.21"));
        assert!(!newer("2.2.20", "2.2.21"));
        assert!(!newer("2.2.21-beta", "2.2.21"));
    }

    #[test]
    fn android_takes_the_apk_of_latest_json_only_when_newer() {
        let latest = serde_json::json!({
            "version": "2.2.22", "notes": "QR nick", "pub_date": "2026-11-24T16:00:00Z", "platforms": {},
            "android": { "url": "https://github.com/o/r/releases/download/v2.2.22/colautool_2.2.22_android_arm64.apk",
                "sha256": "ab12" }
        });
        assert_eq!(
            android_release(&latest, "2.2.21"),
            Some(AndroidRelease {
                version: "2.2.22".into(),
                notes: "QR nick".into(),
                apk: Apk {
                    url: "https://github.com/o/r/releases/download/v2.2.22/colautool_2.2.22_android_arm64.apk".into(),
                    sha256: "ab12".into(),
                },
            })
        );
        assert_eq!(android_release(&latest, "2.2.22"), None);
        let mut no_apk = latest.clone();
        no_apk.as_object_mut().unwrap().remove("android");
        assert_eq!(
            android_release(&no_apk, "2.2.21"),
            None,
            "a release without an APK"
        );
    }

    #[test]
    fn the_sha256_is_lowercase_hex() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

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

// Key (docs/integration/rust/features.md#key, server/README.md#key): the app runs its accounts only with a key of CLLT
// Server. The key is typed once (LicenseGate.tsx) and kept in license.json beside accounts.json; each start, then every
// hour while the app is open, it is checked again (POST /api/license/verify) with the id of this machine. The first
// check of a key binds it to this machine: one key, one device. The answer says until when it holds and how many
// accounts the app may have (Thêm nick and Nhập JSON stop there; accounts already in the list stay).
//
// While the key holds, the accounts that changed go to the server after each check and every 15 minutes (sync.rs,
// POST /api/license/sync with the key): no other approval.
//
// No logins before a check said yes: without network at the start the app waits, and Thử lại asks again. Once it said
// yes, a check that cannot reach the server keeps it running (it asks again 5 minutes later), but the end of the key
// still stops it on time. A key refused (wrong, khoá, on another machine, hết hạn) logs every account out.
use crate::app::Shared;
use cllt_core::net::Command;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime};

const EVERY: Duration = Duration::from_secs(60 * 60);
const SYNC_EVERY: Duration = Duration::from_secs(15 * 60);
/// After a check that did not reach the server: while the key holds, and while the app waits for its first yes.
const RETRY_VALID: Duration = Duration::from_secs(5 * 60);
const RETRY_WAITING: Duration = Duration::from_secs(30);
/// How often the thread looks at the clock (the end of the key) and at a Thử lại.
const TICK: Duration = Duration::from_secs(15);
const TIMEOUT: Duration = Duration::from_secs(15);

/// Where the key stands, as the UI shows it (LicenseView in ../src/api/types.ts).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum LicenseState {
    /// No check: --sample, or CLLT_SERVER=off in a debug build.
    Off,
    /// No key typed yet.
    Missing,
    /// The key is being checked (at the start, before any answer).
    Checking,
    Valid {
        expires_at: u64,
        max_accounts: u32,
        activated_at: u64,
        checked_at: u64,
        /// Bạch Hổ may run (bachHo of the answer; on when a server before 24/11/2026 does not say). The admin turns it
        /// off for a key; the app hears it at its next check (each hour, at the start, when the Bạch Hổ window opens).
        bach_ho: bool,
    },
    /// The server refused the key: `code` unknown, revoked, taken or expired, with its words.
    Refused { code: String, message: String },
    /// No answer yet this run: the server could not be reached.
    Unreachable { message: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseView {
    /// The key kept, its middle hidden ("CLLT-AB12-…-YZ89"); "" without one.
    pub key: String,
    #[serde(flatten)]
    pub state: LicenseState,
}

/// license.json: the key typed, once the server took it.
#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
struct Saved {
    key: String,
}

struct Inner {
    key: Option<String>,
    state: LicenseState,
    file: PathBuf,
    server: String,
    /// When the thread checks again; Thử lại sets it to now.
    next: Instant,
    /// When the accounts go to the server again; each yes sets it to now.
    next_sync: Instant,
    /// license-sync.json: what the server last took (sync.rs).
    sync_file: PathBuf,
    /// This clock less the server's (the Date of its last answer), in ms: the end of the key is the server's.
    skew: i64,
    /// --login-all waiting for the first yes.
    login_all: bool,
}

/// Managed by the app (lib.rs); the commands, the check thread and the login commands read it.
pub struct Licenses(Mutex<Inner>);

impl Licenses {
    /// Whether accounts may log in: the key holds now (or there is no check).
    pub fn valid(&self) -> bool {
        let inner = self.0.lock().unwrap();
        holds(&inner.state, inner.server_now())
    }
    /// How many accounts the app may have: None without a check; 0 while the key does not hold.
    pub fn max_accounts(&self) -> Option<usize> {
        let inner = self.0.lock().unwrap();
        match &inner.state {
            LicenseState::Off => None,
            s @ LicenseState::Valid { max_accounts, .. } if holds(s, inner.server_now()) => {
                Some(*max_accounts as usize)
            }
            _ => Some(0),
        }
    }
    /// Whether Bạch Hổ may run: the key holds and allows it (always without a check).
    pub fn bach_ho(&self) -> bool {
        let inner = self.0.lock().unwrap();
        match &inner.state {
            LicenseState::Off => true,
            s @ LicenseState::Valid { bach_ho, .. } => *bach_ho && holds(s, inner.server_now()),
            _ => false,
        }
    }
}

impl Inner {
    /// Now by the server's clock, as far as its last answer tells.
    fn server_now(&self) -> u64 {
        (crate::app::epoch_ms() as i64 - self.skew).max(0) as u64
    }
}

fn holds(state: &LicenseState, now: u64) -> bool {
    match state {
        LicenseState::Off => true,
        LicenseState::Valid { expires_at, .. } => now < *expires_at,
        _ => false,
    }
}

/// Why Thêm nick or Nhập JSON stops at `max` (None: no limit): `have` accounts in the list, `adding` more.
pub fn over_limit(max: Option<usize>, have: usize, adding: usize) -> Option<String> {
    let max = max.filter(|_| adding > 0)?;
    if max == 0 {
        return Some("Cần nhập key hợp lệ trước khi thêm nick".into());
    }
    (have + adding > max).then(|| match adding {
        1 => format!("Key chỉ cho tối đa {max} nick (đang có {have})"),
        n => format!("Key chỉ cho tối đa {max} nick: đang có {have}, thêm {n} nick nữa sẽ vượt"),
    })
}

/// "CLLT-AB12-CD34-EF56-GH78" → "CLLT-AB12-…-GH78".
fn masked(key: &str) -> String {
    let parts: Vec<&str> = key.split('-').collect();
    match parts.as_slice() {
        [head, first, .., last] if parts.len() > 3 => format!("{head}-{first}-…-{last}"),
        _ if key.chars().count() > 8 => {
            let chars: Vec<char> = key.chars().collect();
            let (a, b) = (&chars[..4], &chars[chars.len() - 4..]);
            format!(
                "{}…{}",
                a.iter().collect::<String>(),
                b.iter().collect::<String>()
            )
        }
        _ => key.to_string(),
    }
}

pub fn view<R: Runtime>(app: &AppHandle<R>) -> LicenseView {
    let l = app.state::<Licenses>();
    let inner = l.0.lock().unwrap();
    view_of(&inner)
}

fn view_of(inner: &Inner) -> LicenseView {
    LicenseView {
        key: inner.key.as_deref().map(masked).unwrap_or_default(),
        state: inner.state.clone(),
    }
}

fn load(file: &Path) -> Option<String> {
    let saved: Saved = serde_json::from_slice(&std::fs::read(file).ok()?).ok()?;
    let key = saved.key.trim().to_string();
    (!key.is_empty()).then_some(key)
}

/// Sets up the key of license.json (`accounts` is accounts.json, which it sits beside) and starts the checks;
/// `login_all` (--login-all) logs every account in at the first yes.
pub fn start<R: Runtime>(app: &AppHandle<R>, accounts: &Path, sample: bool, login_all: bool) {
    let server = crate::machine::server_of(std::env::var("CLLT_SERVER").ok());
    let off = sample || server == "off";
    let file = accounts.with_file_name("license.json");
    // Left by Quản lý thiết bị, which the key replaced (1.1.8): its answer, its key and its sync.json.
    for old in ["device.json", "device.key", "sync.json"] {
        let _ = std::fs::remove_file(accounts.with_file_name(old));
    }
    if !off {
        crate::events::start(accounts.with_file_name("license-events.json"));
    }
    let key = if off { None } else { load(&file) };
    let state = match (&key, off) {
        (_, true) => LicenseState::Off,
        (None, false) => LicenseState::Missing,
        (Some(_), false) => LicenseState::Checking,
    };
    app.manage(Licenses(Mutex::new(Inner {
        key,
        state,
        file,
        server,
        next: Instant::now(),
        next_sync: Instant::now(),
        sync_file: accounts.with_file_name("license-sync.json"),
        skew: 0,
        login_all: login_all && !off,
    })));
    if off {
        if login_all {
            login_all_now(app);
        }
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || loop {
        tauri::async_runtime::block_on(tick(&app));
        std::thread::sleep(TICK);
    });
}

/// One turn of the thread: the end of the key by the clock and a check when it is due, then the sync when it is due.
async fn tick<R: Runtime>(app: &AppHandle<R>) {
    check(app).await;
    let due = {
        let l = app.state::<Licenses>();
        let valid = l.valid();
        let mut inner = l.0.lock().unwrap();
        match (valid, inner.key.clone()) {
            // A new Thêm, Sửa, Xoá nick (events.rs) goes now rather than within 15 minutes.
            (true, Some(key))
                if Instant::now() >= inner.next_sync || crate::events::take_fresh() =>
            {
                inner.next_sync = Instant::now() + SYNC_EVERY;
                Some((key, inner.server.clone(), inner.sync_file.clone()))
            }
            _ => None,
        }
    };
    if let Some((key, server, file)) = due {
        crate::sync::run(app, &server, &crate::machine::id(), &key, &file).await;
    }
}

/// The end of the key by the clock, then a check when it is due.
async fn check<R: Runtime>(app: &AppHandle<R>) {
    let (key, server, due) = {
        let l = app.state::<Licenses>();
        let mut inner = l.0.lock().unwrap();
        if let LicenseState::Valid { expires_at, .. } = inner.state {
            if inner.server_now() >= expires_at {
                inner.state = LicenseState::Refused {
                    code: "expired".into(),
                    message: format!("Key đã hết hạn ngày {}", date(expires_at)),
                };
                drop(inner);
                changed(app);
                return;
            }
        }
        (
            inner.key.clone(),
            inner.server.clone(),
            Instant::now() >= inner.next,
        )
    };
    let Some(key) = key.filter(|_| due) else {
        return;
    };
    let answer = ask(&server, &body(app, &key)).await;
    let l = app.state::<Licenses>();
    let mut inner = l.0.lock().unwrap();
    if inner.key.as_deref() != Some(key.as_str()) {
        // Another key was typed while this one was asked about: its own check stands.
        return;
    }
    let was_valid = matches!(inner.state, LicenseState::Valid { .. });
    match answer {
        Ok((verdict, skew)) => {
            inner.next = Instant::now() + EVERY;
            inner.next_sync = Instant::now();
            inner.skew = skew.unwrap_or(inner.skew);
            inner.state = verdict.state(crate::app::epoch_ms());
        }
        Err(e) => {
            eprintln!("Key: không hỏi được server ({e})");
            if was_valid {
                inner.next = Instant::now() + RETRY_VALID;
                return;
            }
            inner.next = Instant::now() + RETRY_WAITING;
            inner.state = LicenseState::Unreachable {
                message: format!("Không kết nối được server kiểm tra key: {e}"),
            };
        }
    }
    drop(inner);
    changed(app);
}

/// Kích hoạt: checks `key` now; the server's yes keeps it in license.json and lets the accounts log in, its no is the
/// error (the key kept before, if any, stays as it was).
pub async fn activate<R: Runtime>(app: &AppHandle<R>, key: String) -> Result<LicenseView, String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("Nhập key trước".into());
    }
    let server = app.state::<Licenses>().0.lock().unwrap().server.clone();
    let (verdict, skew) = ask(&server, &body(app, &key)).await.map_err(|e| match e {
        Failure::Server(said) => said,
        Failure::Network(e) => format!("Không kết nối được server kiểm tra key: {e}"),
    })?;
    let state = verdict.state(crate::app::epoch_ms());
    if let LicenseState::Refused { message, .. } = &state {
        return Err(message.clone());
    }
    let key = verdict.key.unwrap_or(key);
    {
        let l = app.state::<Licenses>();
        let mut inner = l.0.lock().unwrap();
        let text = serde_json::to_vec(&Saved { key: key.clone() }).unwrap_or_default();
        cllt_core::accounts::write_private(&inner.file, &text)
            .map_err(|e| format!("Key đúng nhưng chưa lưu được: {e}"))?;
        if inner.key.as_deref() != Some(key.as_str()) {
            // What the server took was for the key before: the new one gets every account.
            let _ = std::fs::remove_file(&inner.sync_file);
        }
        inner.skew = skew.unwrap_or(inner.skew);
        inner.key = Some(key);
        inner.state = state;
        inner.next = Instant::now() + EVERY;
        inner.next_sync = Instant::now();
    }
    changed(app);
    Ok(view(app))
}

/// Thử lại: the thread checks at its next turn.
pub fn recheck<R: Runtime>(app: &AppHandle<R>) {
    let l = app.state::<Licenses>();
    let mut inner = l.0.lock().unwrap();
    if inner.key.is_some() {
        inner.next = Instant::now();
        if !matches!(inner.state, LicenseState::Valid { .. }) {
            inner.state = LicenseState::Checking;
        }
    }
    drop(inner);
    let _ = app.emit("license", view(app));
}

/// After a change of state: a key that no longer holds logs every account out; the first yes logs in those waiting
/// for it; the UI gets the new state.
fn changed<R: Runtime>(app: &AppHandle<R>) {
    let l = app.state::<Licenses>();
    let valid = l.valid();
    let login_all = {
        let mut inner = l.0.lock().unwrap();
        valid && std::mem::take(&mut inner.login_all)
    };
    if !valid {
        if let Some(shared) = app.try_state::<Shared>() {
            shared.with(|a| a.send_all(Command::Logout));
        }
    } else if login_all {
        login_all_now(app);
    }
    // Bạch Hổ turned off for the key: the runs under way stop (Bot::bach_ho_stop does nothing without one).
    if valid && !l.bach_ho() {
        if let Some(shared) = app.try_state::<Shared>() {
            shared.with(|a| a.send_all(Command::BachHoStop));
        }
    }
    let _ = app.emit("license", view(app));
}

fn login_all_now<R: Runtime>(app: &AppHandle<R>) {
    if let Some(shared) = app.try_state::<Shared>() {
        shared.with(|a| a.login_all());
    }
}

/// dd/mm/yyyy in Vietnam time (UTC+7), as the server writes it.
fn date(ms: u64) -> String {
    chrono::DateTime::from_timestamp_millis(ms as i64 + 7 * 3600 * 1000)
        .map(|t| t.format("%d/%m/%Y").to_string())
        .unwrap_or_default()
}

fn body<R: Runtime>(app: &AppHandle<R>, key: &str) -> serde_json::Value {
    let accounts = app
        .try_state::<Shared>()
        .map(|s| s.with(|a| a.entries.len()))
        .unwrap_or_default();
    serde_json::json!({
        "key": key,
        "id": crate::machine::id(),
        "hostname": crate::machine::hostname(),
        "os": format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        "version": env!("CARGO_PKG_VERSION"),
        "accounts": accounts,
    })
}

/// The answer of POST /api/license/verify: yes with what the key allows, or no with the reason.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Verdict {
    ok: bool,
    #[serde(default)]
    code: String,
    #[serde(default)]
    error: String,
    #[serde(default)]
    expires_at: u64,
    #[serde(default)]
    max_accounts: u32,
    #[serde(default)]
    activated_at: u64,
    /// Bạch Hổ allowed; a server before 24/11/2026 does not say, and it is on.
    #[serde(default = "yes")]
    bach_ho: bool,
    /// The key as the server writes it, when it says so.
    #[serde(default)]
    key: Option<String>,
}

fn yes() -> bool {
    true
}

impl Verdict {
    fn state(&self, now: u64) -> LicenseState {
        match self.ok {
            true => LicenseState::Valid {
                expires_at: self.expires_at,
                max_accounts: self.max_accounts,
                activated_at: self.activated_at,
                checked_at: now,
                bach_ho: self.bach_ho,
            },
            false => LicenseState::Refused {
                code: self.code.clone(),
                message: match self.error.trim() {
                    "" => "Key không dùng được".into(),
                    e => e.into(),
                },
            },
        }
    }
}

/// Why a check got no verdict: the server answered something else (its words), or did not answer.
#[derive(Debug)]
enum Failure {
    Server(String),
    Network(String),
}

impl std::fmt::Display for Failure {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            Failure::Server(s) | Failure::Network(s) => f.write_str(s),
        }
    }
}

/// This clock less the server's, by the Date of its answer (to the second); None without one.
fn skew_of(date: Option<&str>, now: u64) -> Option<i64> {
    let at = chrono::DateTime::parse_from_rfc2822(date?).ok()?;
    Some(now as i64 - at.timestamp_millis())
}

/// POST /api/license/verify, with the skew of this clock. A yes or a no comes as 200; anything else is a failure.
async fn ask(server: &str, body: &serde_json::Value) -> Result<(Verdict, Option<i64>), Failure> {
    let network = |e: reqwest::Error| Failure::Network(e.to_string());
    let res = crate::machine::client(TIMEOUT)
        .map_err(network)?
        .post(format!("{server}/api/license/verify"))
        .json(body)
        .send()
        .await
        .map_err(network)?;
    let skew = skew_of(
        res.headers()
            .get(reqwest::header::DATE)
            .and_then(|d| d.to_str().ok()),
        crate::app::epoch_ms(),
    );
    let status = res.status();
    if !status.is_success() {
        #[derive(Deserialize)]
        struct Error {
            error: String,
        }
        let said = res.json::<Error>().await.map(|e| e.error).ok();
        return Err(Failure::Server(
            said.unwrap_or_else(|| format!("Server kiểm tra key trả {status}")),
        ));
    }
    let verdict = res.json::<Verdict>().await.map_err(network)?;
    Ok((verdict, skew))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_verdict_is_a_state_and_a_no_keeps_the_words_of_the_server() {
        let yes: Verdict = serde_json::from_str(
            r#"{"ok": true, "maxAccounts": 100, "expiresAt": 2000, "activatedAt": 1000}"#,
        )
        .unwrap();
        assert_eq!(
            yes.state(1500),
            LicenseState::Valid {
                expires_at: 2000,
                max_accounts: 100,
                activated_at: 1000,
                checked_at: 1500,
                bach_ho: true
            },
            "a server that does not say: Bạch Hổ on"
        );
        let off: Verdict = serde_json::from_str(
            r#"{"ok": true, "maxAccounts": 100, "expiresAt": 2000, "activatedAt": 1000, "bachHo": false}"#,
        )
        .unwrap();
        assert!(matches!(
            off.state(1500),
            LicenseState::Valid { bach_ho: false, .. }
        ));
        let no: Verdict = serde_json::from_str(
            r#"{"ok": false, "code": "taken", "error": "Key đã được kích hoạt trên máy khác"}"#,
        )
        .unwrap();
        assert_eq!(
            no.state(1),
            LicenseState::Refused {
                code: "taken".into(),
                message: "Key đã được kích hoạt trên máy khác".into()
            }
        );
        let bare: Verdict = serde_json::from_str(r#"{"ok": false}"#).unwrap();
        assert!(
            matches!(bare.state(1), LicenseState::Refused { message, .. } if message == "Key không dùng được")
        );
    }

    #[test]
    fn a_key_holds_until_its_end_and_off_always() {
        let valid = LicenseState::Valid {
            expires_at: 10,
            max_accounts: 5,
            activated_at: 1,
            checked_at: 1,
            bach_ho: true,
        };
        assert!(holds(&valid, 9));
        assert!(!holds(&valid, 10));
        assert!(holds(&LicenseState::Off, u64::MAX));
        for no in [
            LicenseState::Missing,
            LicenseState::Checking,
            LicenseState::Unreachable {
                message: "x".into(),
            },
        ] {
            assert!(!holds(&no, 0));
        }
    }

    #[test]
    fn the_limit_stops_only_what_is_added() {
        assert_eq!(over_limit(None, 500, 10), None);
        assert_eq!(over_limit(Some(100), 99, 1), None);
        assert_eq!(
            over_limit(Some(100), 100, 1).as_deref(),
            Some("Key chỉ cho tối đa 100 nick (đang có 100)")
        );
        assert_eq!(
            over_limit(Some(10), 8, 3).as_deref(),
            Some("Key chỉ cho tối đa 10 nick: đang có 8, thêm 3 nick nữa sẽ vượt")
        );
        // Over the limit already (it was lowered): what is there stays, nothing is added.
        assert_eq!(over_limit(Some(10), 12, 0), None);
        assert!(over_limit(Some(0), 0, 1).unwrap().contains("key"));
    }

    #[test]
    fn the_skew_is_this_clock_less_the_date_of_the_answer() {
        // Sun, 01 Nov 2026 00:00:00 GMT is 1793491200000 ms.
        let date = Some("Sun, 01 Nov 2026 00:00:00 GMT");
        assert_eq!(
            skew_of(date, 1_793_491_200_000 + 86_400_000),
            Some(86_400_000)
        );
        assert_eq!(skew_of(date, 1_793_491_200_000 - 5_000), Some(-5_000));
        assert_eq!(skew_of(Some("hôm qua"), 1), None);
        assert_eq!(skew_of(None, 1), None);
    }

    #[test]
    fn the_key_shown_hides_its_middle() {
        assert_eq!(masked("CLLT-AB12-CD34-EF56-GH78"), "CLLT-AB12-…-GH78");
        assert_eq!(masked("ABCDEFGHIJ"), "ABCD…GHIJ");
        assert_eq!(masked("ABC"), "ABC");
    }

    #[test]
    fn license_json_gives_the_key_and_nothing_is_none() {
        let dir = std::env::temp_dir().join(format!("cllt-license-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("license.json");
        assert_eq!(load(&file), None);
        std::fs::write(&file, r#"{"key": " CLLT-AB12-CD34-EF56-GH78 "}"#).unwrap();
        assert_eq!(load(&file).as_deref(), Some("CLLT-AB12-CD34-EF56-GH78"));
        std::fs::write(&file, r#"{"key": ""}"#).unwrap();
        assert_eq!(load(&file), None);
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(date(0), "01/01/1970");
    }

    #[test]
    fn the_view_is_flat_camel_case_with_the_state_as_its_tag() {
        let v = LicenseView {
            key: "CLLT-AB12-…-GH78".into(),
            state: LicenseState::Valid {
                expires_at: 3,
                max_accounts: 100,
                activated_at: 1,
                checked_at: 2,
                bach_ho: false,
            },
        };
        assert_eq!(
            serde_json::to_value(v).unwrap(),
            serde_json::json!({ "key": "CLLT-AB12-…-GH78", "state": "valid", "expiresAt": 3, "maxAccounts": 100, "activatedAt": 1, "checkedAt": 2, "bachHo": false })
        );
    }
}

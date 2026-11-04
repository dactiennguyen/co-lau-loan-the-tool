// Đồng bộ nick (server/README.md#đồng-bộ-nick): while the key holds (license.rs), after each check of it and every 15
// minutes, the accounts that changed since the last sync go to CLLT Server (POST /api/license/sync, with the key and
// this machine's id), whole, with their passwords, proxy and Cài đặt đánh, and the Cài đặt of the app with them when
// those changed. The server takes them for that key, new accounts only up to its Số nick tối đa.
//
// Two devices may have the same account. For each field of each account (label, password, proxy, fight, …) the app keeps
// in license-sync.json, beside accounts.json, a hash of its value and the time it saw that value change; the server keeps each
// field as the device that changed it last sent it. So the same account sent twice makes one, an edit on each device is
// kept, and a device with an old copy does not undo a newer edit. At the first sync (no license-sync.json) every value counts as
// from before (time 0): a device joining late does not overwrite what the others sent.
//
// Nhập JSON brings old data, not an edit made now: what it adds or replaces counts as from before too (`imported`), so
// it fills in an account the server lacks but does not undo a later edit of another device.
//
// license-sync.json holds hashes and times, no password. Nothing comes back: the server keeps a copy, the app does not read it.
use crate::app::Shared;
use crate::settings::Settings;
use cllt_core::accounts::Account;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};

const TIMEOUT: Duration = Duration::from_secs(30);
/// Fields that name the account: they find it on the server and are never merged.
const IDENTITY: [&str; 2] = ["username", "serverId"];

/// license-sync.json: what the server last took.
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
pub struct State {
    /// By server and username in lower case, as the server keys them.
    #[serde(default)]
    accounts: BTreeMap<String, Fields>,
    /// Hash of the Cài đặt last sent.
    #[serde(default)]
    settings: String,
}

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
struct Fields {
    /// Field → hash of its value (a field gone hashes as null) and the epoch ms it was seen changing to it.
    #[serde(default)]
    fields: BTreeMap<String, (String, u64)>,
    /// Hash of the whole account the server last took; empty before.
    #[serde(default)]
    sent: String,
}

/// Accounts of Nhập JSON not yet marked in license-sync.json (`imported`, then `run`).
static IMPORTED: Mutex<Vec<Account>> = Mutex::new(Vec::new());

/// Nhập JSON added or replaced these: the next sync counts their values as from before (time 0).
pub fn imported(accounts: &[Account]) {
    IMPORTED.lock().unwrap().extend_from_slice(accounts);
}

/// Each field of `accounts` whose value license-sync.json has not got is recorded with time 0, as at the first sync; the server
/// then takes it only where it has nothing later.
fn mark_old(state: &mut State, accounts: &[Account]) {
    for a in accounts {
        let Ok(Value::Object(map)) = serde_json::to_value(a) else {
            continue;
        };
        let entry = state.accounts.entry(key(a)).or_default();
        let names: BTreeSet<String> = map.keys().chain(entry.fields.keys()).cloned().collect();
        for f in names {
            let h = digest(map.get(&f).unwrap_or(&Value::Null));
            if entry.fields.get(&f).is_none_or(|(old, _)| *old != h) {
                entry.fields.insert(f, (h, 0));
            }
        }
    }
}

/// What one sync sends, and license-sync.json once the server took it.
#[derive(Debug)]
pub struct Plan {
    pub accounts: Vec<Value>,
    pub settings: Option<Value>,
    pub next: State,
}

fn digest(v: &Value) -> String {
    Sha256::digest(v.to_string().as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn key(a: &Account) -> String {
    format!("{}\n{}", a.server_id, a.username.to_lowercase())
}

/// The accounts to send, each with the time each field changed, and the Cài đặt if they changed. A field whose value
/// differs from the one of license-sync.json is stamped `now` (0 at the `first` sync); an account is sent when it differs as a
/// whole from the one the server took.
pub fn plan(
    state: &State,
    accounts: &[Account],
    settings: &Settings,
    first: bool,
    now: u64,
) -> Plan {
    let mut next = state.clone();
    let at = if first { 0 } else { now };
    let mut out = Vec::new();
    for a in accounts {
        let value = serde_json::to_value(a).unwrap_or(Value::Null);
        let Value::Object(map) = &value else {
            continue;
        };
        let entry = next.accounts.entry(key(a)).or_default();
        let names: BTreeSet<String> = map.keys().chain(entry.fields.keys()).cloned().collect();
        for f in names {
            let h = digest(map.get(&f).unwrap_or(&Value::Null));
            if entry.fields.get(&f).is_none_or(|(old, _)| *old != h) {
                entry.fields.insert(f, (h, at));
            }
        }
        let whole = digest(&value);
        if entry.sent != whole {
            let changed: Map<String, Value> = entry
                .fields
                .iter()
                .filter(|(f, _)| !IDENTITY.contains(&f.as_str()))
                .map(|(f, (_, t))| (f.clone(), json!(t)))
                .collect();
            out.push(json!({ "account": value, "changed": changed }));
            entry.sent = whole;
        }
    }
    let settings = serde_json::to_value(settings).unwrap_or(Value::Null);
    let hash = digest(&settings);
    let settings = (hash != state.settings).then(|| {
        next.settings = hash;
        settings
    });
    Plan {
        accounts: out,
        settings,
        next,
    }
}

fn load(file: &Path) -> Option<State> {
    serde_json::from_slice(&std::fs::read(file).ok()?).ok()
}

/// What the server did, as POST /api/license/sync answers (server/src/models/index.ts, Merged); `refused` the accounts
/// not taken: new ones over the Số nick tối đa of the key, and those another key holds.
#[derive(Debug, Deserialize)]
struct Merged {
    added: u32,
    updated: u32,
    unchanged: u32,
    kept: u32,
    #[serde(default)]
    refused: u32,
    /// Of those refused, the accounts another key holds: never written.
    #[serde(default)]
    taken: u32,
}

/// license-sync.json, readable by the owner only: its hashes come from the passwords.
fn write(file: &Path, state: &State) -> Result<(), String> {
    cllt_core::accounts::write_private(file, &serde_json::to_vec(state).unwrap_or_default())
}

async fn post(server: &str, body: &Value) -> reqwest::Result<Merged> {
    crate::machine::client(TIMEOUT)?
        .post(format!("{server}/api/license/sync"))
        .json(body)
        .send()
        .await?
        .error_for_status()?
        .json::<Merged>()
        .await
}

/// One sync of machine `id` with the key `key`; `file` is license-sync.json. A failure leaves it as it was, to send it
/// all again next time.
pub async fn run<R: Runtime>(app: &AppHandle<R>, server: &str, id: &str, key: &str, file: &Path) {
    let Some(shared) = app.try_state::<Shared>() else {
        return;
    };
    // An accounts.json that could not be read is not "no account": nothing is sent until it is.
    let Some((accounts, settings)) = shared.with(|a| {
        a.load_error.is_none().then(|| {
            (
                a.entries
                    .iter()
                    .map(|e| e.account.clone())
                    .collect::<Vec<_>>(),
                a.settings().clone(),
            )
        })
    }) else {
        return;
    };
    let mut saved = load(file);
    // Nhập JSON since the last sync. Before the first one everything counts as from before anyway. Written now, so that
    // a failed send does not lose it.
    let marks = std::mem::take(&mut *IMPORTED.lock().unwrap());
    if let Some(state) = saved.as_mut().filter(|_| !marks.is_empty()) {
        mark_old(state, &marks);
        if let Err(e) = write(file, state) {
            eprintln!("Đồng bộ nick: không ghi được {}: {e}", file.display());
            IMPORTED.lock().unwrap().extend(marks);
        }
    }
    let plan = plan(
        saved.as_ref().unwrap_or(&State::default()),
        &accounts,
        &settings,
        saved.is_none(),
        crate::app::epoch_ms(),
    );
    if plan.accounts.is_empty() && plan.settings.is_none() {
        return;
    }
    let body =
        json!({ "id": id, "key": key, "settings": plan.settings, "accounts": plan.accounts });
    match post(server, &body).await {
        Ok(m) => {
            let mut next = plan.next;
            if m.refused > 0 {
                // Which new accounts the key had no room for is not said: every account new to the server is sent
                // again next time, with the times it has (the server takes those it already has as unchanged).
                let before = saved.as_ref();
                for (k, f) in next.accounts.iter_mut() {
                    if before
                        .and_then(|s| s.accounts.get(k))
                        .is_none_or(|b| b.sent.is_empty())
                    {
                        f.sent.clear();
                    }
                }
            }
            if let Err(e) = write(file, &next) {
                eprintln!("Đồng bộ nick: không ghi được {}: {e}", file.display());
            }
            eprintln!(
                "Đồng bộ nick: {} nick mới, {} cập nhật, {} như cũ, {} có mục máy khác sửa sau, {} không nhận ({} thuộc key khác)",
                m.added, m.updated, m.unchanged, m.kept, m.refused, m.taken
            );
        }
        Err(e) => eprintln!("Đồng bộ nick: không gửi được ({e}), gửi lại lần sau"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn account(username: &str, password: &str) -> Account {
        serde_json::from_value(json!({ "username": username, "password": password })).unwrap()
    }

    fn changed(v: &Value) -> &Map<String, Value> {
        v["changed"].as_object().unwrap()
    }

    #[test]
    fn the_first_sync_sends_everything_as_from_before_then_only_what_changed() {
        let settings = Settings::default();
        let first = plan(
            &State::default(),
            &[account("a", "1"), account("b", "2")],
            &settings,
            true,
            500,
        );
        assert_eq!(first.accounts.len(), 2);
        assert!(first.settings.is_some());
        let a = &first.accounts[0];
        assert_eq!(a["account"]["password"], "1");
        assert!(changed(a).values().all(|t| t == 0));
        assert!(!changed(a).contains_key("username") && !changed(a).contains_key("serverId"));

        // Nothing changed: nothing to send.
        let again = plan(
            &first.next,
            &[account("a", "1"), account("b", "2")],
            &settings,
            false,
            600,
        );
        assert!(again.accounts.is_empty() && again.settings.is_none());

        // The password of b changes: b alone goes, its password stamped now, the rest as before.
        let edit = plan(
            &first.next,
            &[account("a", "1"), account("b", "3")],
            &settings,
            false,
            700,
        );
        assert_eq!(edit.accounts.len(), 1);
        let b = changed(&edit.accounts[0]);
        assert_eq!(
            (b["password"].clone(), b["label"].clone()),
            (json!(700), json!(0))
        );
    }

    #[test]
    fn a_field_taken_off_is_sent_as_changed_and_a_new_account_is_stamped_now() {
        let settings = Settings::default();
        let mut with_proxy = account("a", "1");
        with_proxy.proxy = serde_json::from_value(json!({ "host": "h", "port": 1 })).unwrap();
        let first = plan(&State::default(), &[with_proxy], &settings, true, 1);
        let off = plan(
            &first.next,
            &[account("a", "1"), account("new", "x")],
            &settings,
            false,
            9,
        );
        assert_eq!(off.accounts.len(), 2);
        assert!(off.accounts[0]["account"].get("proxy").is_none());
        assert_eq!(changed(&off.accounts[0])["proxy"], 9);
        assert_eq!(changed(&off.accounts[1])["password"], 9);
        // Usernames in any case are the same account.
        let upper = plan(&off.next, &[account("A", "1")], &settings, false, 10);
        assert_eq!(changed(&upper.accounts[0])["password"], 0);
    }

    #[test]
    fn an_import_counts_as_from_before_and_an_edit_after_it_as_now() {
        let settings = Settings::default();
        let first = plan(&State::default(), &[account("a", "1")], &settings, true, 1);
        let mut state = first.next;
        // Nhập JSON brings an old password: sent, but as from before.
        mark_old(&mut state, &[account("a", "cu")]);
        let sent = plan(&state, &[account("a", "cu")], &settings, false, 50);
        assert_eq!(changed(&sent.accounts[0])["password"], 0);
        // Changed by hand afterwards: now.
        let edit = plan(&sent.next, &[account("a", "moi")], &settings, false, 60);
        assert_eq!(changed(&edit.accounts[0])["password"], 60);
    }

    #[test]
    fn sync_json_has_no_password() {
        let p = plan(
            &State::default(),
            &[account("a", "mat-khau-bi-mat")],
            &Settings::default(),
            true,
            1,
        );
        let text = serde_json::to_string(&p.next).unwrap();
        assert!(!text.contains("mat-khau-bi-mat"));
        assert_eq!(serde_json::from_str::<State>(&text).unwrap(), p.next);
    }
}

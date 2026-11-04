// Log of the accounts for CLLT Server (server/README.md#log): Thêm nick, Sửa nick, Xoá nick and Nhập JSON each note an
// event here (who, when, which account: no password), and the next sync (sync.rs) sends them with the key. Removing an
// account here never removes it on the server: the server keeps it and marks it "Đã xoá ở máy".
//
// The events wait in license-events.json beside accounts.json until the server took them, so a send without network
// or an app closed before it loses none. A new event makes the sync go at the next turn of the key thread (license.rs)
// instead of within 15 minutes. Without a key check (--sample, CLLT_SERVER=off) nothing is noted.
use cllt_core::accounts::Account;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

/// The most events kept while the server cannot be reached; the oldest go first.
const KEEP: usize = 1000;
/// The most events one sync sends (the server takes 200).
pub const PER_SYNC: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Add,
    Remove,
    Edit,
    Import,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    /// Made once, kept when the event is sent again (a send whose answer was lost): the server takes an id once.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub id: String,
    pub at: u64,
    pub kind: Kind,
    pub username: String,
    pub server_id: i32,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub label: String,
}

#[derive(Default)]
struct Queue {
    file: Option<PathBuf>,
    list: Vec<Event>,
    /// An event came since the key thread last looked.
    fresh: bool,
}

static QUEUE: Mutex<Queue> = Mutex::new(Queue {
    file: None,
    list: Vec::new(),
    fresh: false,
});

impl Queue {
    fn started(file: PathBuf) -> Self {
        let list = load(&file);
        Queue {
            fresh: !list.is_empty(),
            file: Some(file),
            list,
        }
    }
    fn save(&self) {
        if let Some(file) = &self.file {
            let text = serde_json::to_vec(&self.list).unwrap_or_default();
            if let Err(e) = cllt_core::accounts::write_private(file, &text) {
                eprintln!("Log nick: không ghi được {}: {e}", file.display());
            }
        }
    }
    fn note(&mut self, kind: Kind, account: &Account, at: u64) {
        if self.file.is_none() {
            return;
        }
        self.list.push(Event {
            id: new_id(at),
            at,
            kind,
            username: account.username.clone(),
            server_id: account.server_id,
            label: account.label.clone(),
        });
        let over = self.list.len().saturating_sub(KEEP);
        self.list.drain(..over);
        self.save();
        self.fresh = true;
    }
    fn edited(&mut self, before: &Account, after: &Account, at: u64) {
        let same = before.server_id == after.server_id
            && before.username.eq_ignore_ascii_case(&after.username);
        if same {
            self.note(Kind::Edit, after, at);
        } else {
            self.note(Kind::Remove, before, at);
            self.note(Kind::Add, after, at);
        }
    }
    fn pending(&self) -> Vec<Event> {
        self.list.iter().take(PER_SYNC).cloned().collect()
    }
    fn sent(&mut self, n: usize) {
        let n = n.min(self.list.len());
        self.list.drain(..n);
        self.save();
        self.fresh |= !self.list.is_empty();
    }
}

/// An id no other event of this app has: the time in hex, then a counter mixed with the clock's nanoseconds of the start.
fn new_id(at: u64) -> String {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    static SEED: OnceLock<u64> = OnceLock::new();
    let seed = *SEED.get_or_init(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or_default()
    });
    let n = SEQ.fetch_add(1, Ordering::Relaxed);
    format!(
        "{at:x}-{:x}",
        seed.wrapping_add(n.wrapping_mul(0x9E37_79B9_7F4A_7C15))
    )
}

fn load(file: &Path) -> Vec<Event> {
    std::fs::read(file)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

/// Starts noting, with what license-events.json still holds from before.
pub fn start(file: PathBuf) {
    *QUEUE.lock().unwrap() = Queue::started(file);
}

/// Notes `kind` for `account` now; nothing before `start`.
pub fn note(kind: Kind, account: &Account) {
    QUEUE
        .lock()
        .unwrap()
        .note(kind, account, crate::app::epoch_ms());
}

/// Sửa nick: an edit, or, when it changed the username or the game server, the account before removed and the new one
/// added (the server keys accounts by both).
pub fn edited(before: &Account, after: &Account) {
    QUEUE
        .lock()
        .unwrap()
        .edited(before, after, crate::app::epoch_ms());
}

/// The oldest events, at most PER_SYNC, for the next sync.
pub fn pending() -> Vec<Event> {
    QUEUE.lock().unwrap().pending()
}

/// The server took the `n` oldest.
pub fn sent(n: usize) {
    QUEUE.lock().unwrap().sent(n);
}

/// Whether an event came since the last call: the key thread then syncs at once.
pub fn take_fresh() -> bool {
    std::mem::take(&mut QUEUE.lock().unwrap().fresh)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn account(username: &str, server_id: i32) -> Account {
        Account {
            username: username.into(),
            server_id,
            label: "Nick".into(),
            ..serde_json::from_value(serde_json::json!({"username": "x", "password": "p"})).unwrap()
        }
    }

    #[test]
    fn events_wait_in_a_file_until_sent_and_an_edit_of_the_name_is_a_remove_and_an_add() {
        let dir = std::env::temp_dir().join(format!("cllt-events-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("license-events.json");
        let _ = std::fs::remove_file(&file);
        // Not started: nothing noted (the tests of app.rs add and remove accounts).
        let mut q = Queue::default();
        q.note(Kind::Add, &account("manina", 24), 1);
        assert!(q.pending().is_empty() && !q.fresh);
        let mut q = Queue::started(file.clone());
        q.note(Kind::Add, &account("manina", 24), 1);
        assert!(std::mem::take(&mut q.fresh));
        q.edited(&account("manina", 24), &account("Manina", 24), 2);
        q.edited(&account("manina", 24), &account("manina2", 24), 3);
        let kinds: Vec<Kind> = q.pending().iter().map(|e| e.kind).collect();
        assert_eq!(kinds, [Kind::Add, Kind::Edit, Kind::Remove, Kind::Add]);
        // Kept for the next start, which then syncs at once; the JSON is what the server reads.
        let again = Queue::started(file.clone());
        assert!(again.list.len() == 4 && again.fresh);
        let first = serde_json::to_value(&q.pending()[0]).unwrap();
        let id = first["id"].as_str().unwrap().to_string();
        assert!(id.starts_with("1-") && id.len() <= 40, "{id}");
        assert_eq!(
            first,
            serde_json::json!({"id": id, "at": 1, "kind": "add", "username": "manina", "serverId": 24, "label": "Nick"})
        );
        let ids: std::collections::HashSet<String> =
            q.pending().into_iter().map(|e| e.id).collect();
        assert_eq!(ids.len(), 4, "each event its own id");
        assert_eq!(again.list[0].id, id, "kept in the file");
        q.fresh = false;
        q.sent(3);
        assert_eq!(q.pending().len(), 1);
        assert_eq!(load(&file).len(), 1);
        assert!(q.fresh, "what is left goes at the next turn");
        q.fresh = false;
        q.sent(5);
        assert!(q.pending().is_empty() && load(&file).is_empty() && !q.fresh);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}

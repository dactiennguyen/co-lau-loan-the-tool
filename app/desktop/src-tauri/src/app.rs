// Accounts and their sessions. Shared between the Tauri commands (UI thread) and the session events (tokio threads);
// every change ends with `broadcast`, which sends the new account list and the new log lines to the web UI.
use crate::paths;
use crate::view::{self, AccountView, LogLine};
use cllt_core::accounts::{self, Account};
use cllt_core::bot::Snapshot;
use cllt_core::net::{Command, ConnState, Event, Manager};
use serde::Serialize;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager as _};

/// Lines of log kept per account.
const LOG_LINES: usize = 500;

pub struct Entry {
    pub id: u64,
    pub account: Account,
    /// From the .env file: shown, never written to accounts.json.
    pub from_env: bool,
    pub state: ConnState,
    pub snap: Snapshot,
    pub since: String,
    pub log: VecDeque<LogLine>,
}
impl Entry {
    pub fn new(id: u64, account: Account, from_env: bool) -> Self {
        Self {
            id,
            account,
            from_env,
            state: ConnState::Offline,
            snap: Snapshot::default(),
            since: String::new(),
            log: VecDeque::new(),
        }
    }
    fn push(&mut self, line: LogLine) {
        self.log.push_back(line);
        if self.log.len() > LOG_LINES {
            self.log.pop_front();
        }
    }
}

/// Payload of the "log" event.
#[derive(Clone, Serialize)]
struct LogEvent {
    id: u64,
    line: LogLine,
}

pub struct App {
    manager: Option<Manager>,
    pub entries: Vec<Entry>,
    path: PathBuf,
    next_id: u64,
    /// Log lines not yet sent to the UI.
    pending: Vec<(u64, LogLine)>,
    /// Why accounts.json could not be read. While set, the app never writes the file, so a typo does not cost the
    /// accounts in it.
    pub load_error: Option<String>,
}

pub struct Shared(Mutex<App>);
impl Shared {
    pub fn new(app: App) -> Self {
        Self(Mutex::new(app))
    }
    pub fn with<R>(&self, f: impl FnOnce(&mut App) -> R) -> R {
        f(&mut self.0.lock().unwrap_or_else(|e| e.into_inner()))
    }
}

/// Sends the account list and the pending log lines to the UI.
pub fn broadcast(handle: &AppHandle) {
    let Some(shared) = handle.try_state::<Shared>() else {
        return;
    };
    let (accounts, lines) = shared.with(|app| {
        (
            serde_json::to_value(app.views()).unwrap_or_default(),
            std::mem::take(&mut app.pending),
        )
    });
    for (id, line) in lines {
        let _ = handle.emit("log", LogEvent { id, line });
    }
    let _ = handle.emit("accounts", accounts);
}

fn now(format: &str) -> String {
    chrono::Local::now().format(format).to_string()
}

impl App {
    pub fn new(manager: Option<Manager>, path: PathBuf) -> Self {
        Self {
            manager,
            entries: vec![],
            path,
            next_id: 0,
            pending: vec![],
            load_error: None,
        }
    }

    /// accounts.json; the account of the .env file when there is no accounts.json.
    pub fn load(&mut self) {
        if !self.path.exists() {
            if let Some(a) = paths::env_account() {
                self.add(a, true);
            }
            return;
        }
        match accounts::load(&self.path) {
            Ok(list) => list.into_iter().for_each(|a| {
                self.add(a, false);
            }),
            Err(e) => self.load_error = Some(e),
        }
    }

    pub fn path_shown(&self) -> String {
        paths::shown(&self.path)
    }

    pub fn views(&self) -> Vec<AccountView<'_>> {
        self.entries.iter().map(view::account).collect()
    }

    pub fn logs(&self, id: u64) -> Vec<LogLine> {
        self.entry(id)
            .map(|e| e.log.iter().cloned().collect())
            .unwrap_or_default()
    }

    fn entry(&self, id: u64) -> Option<&Entry> {
        self.entries.iter().find(|e| e.id == id)
    }
    fn entry_mut(&mut self, id: u64) -> Option<&mut Entry> {
        self.entries.iter_mut().find(|e| e.id == id)
    }

    pub fn add(&mut self, account: Account, from_env: bool) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        self.entries.push(Entry::new(id, account, from_env));
        id
    }
    pub fn push(&mut self, entry: Entry) {
        self.next_id = self.next_id.max(entry.id + 1);
        self.entries.push(entry);
    }

    /// Adds the account and saves accounts.json; nothing is added when it cannot be saved.
    pub fn add_saved(&mut self, account: Account) -> Result<u64, String> {
        let id = self.add(account, false);
        self.save()
            .inspect_err(|_| self.entries.retain(|e| e.id != id))?;
        Ok(id)
    }

    /// Removes an account that has no session and saves accounts.json; the account stays when it cannot be saved.
    pub fn remove(&mut self, id: u64) {
        if self.manager.as_ref().is_some_and(|m| m.running(id)) {
            return;
        }
        let Some(i) = self.entries.iter().position(|e| e.id == id) else {
            return;
        };
        let entry = self.entries.remove(i);
        if let Err(e) = self.save() {
            self.entries.insert(i, entry);
            self.log(id, &format!("Lỗi: không xoá được nick, {e}"));
        }
    }

    fn save(&self) -> Result<(), String> {
        if let Some(e) = &self.load_error {
            return Err(format!(
                "accounts.json đang lỗi, sửa file rồi mở lại app ({e})"
            ));
        }
        let list: Vec<Account> = self
            .entries
            .iter()
            .filter(|e| !e.from_env)
            .map(|e| e.account.clone())
            .collect();
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        }
        accounts::save(&self.path, &list)
    }

    pub fn login(&mut self, id: u64) {
        let Some(account) = self.entry(id).map(|e| e.account.clone()) else {
            return;
        };
        if let Some(m) = &mut self.manager {
            m.login(id, account);
        }
    }

    pub fn login_all(&mut self) {
        let ids: Vec<u64> = self.entries.iter().map(|e| e.id).collect();
        ids.into_iter().for_each(|id| self.login(id));
    }

    pub fn send(&mut self, id: u64, command: Command) {
        let logout = command == Command::Logout;
        let sent = self.manager.as_ref().is_some_and(|m| m.send(id, command));
        if !sent && !logout {
            self.log(id, "Nick chưa đăng nhập");
        }
    }

    pub fn send_all(&mut self, command: Command) {
        let ids: Vec<u64> = self.entries.iter().map(|e| e.id).collect();
        ids.into_iter()
            .for_each(|id| self.send(id, command.clone()));
    }

    pub fn log(&mut self, id: u64, text: &str) {
        let line = LogLine::new(now("%H:%M:%S"), text);
        if let Some(e) = self.entry_mut(id) {
            e.push(line.clone());
            self.pending.push((id, line));
        }
    }

    pub fn on_event(&mut self, id: u64, event: Event) {
        match event {
            Event::State(state) => {
                let text = match &state {
                    ConnState::Offline => "Đã thoát".to_string(),
                    ConnState::Connecting => "Đang kết nối…".to_string(),
                    ConnState::Online => "Đã vào game".to_string(),
                    ConnState::Error(m) => format!("Lỗi: {m}"),
                };
                self.log(id, &text);
                if let Some(e) = self.entry_mut(id) {
                    if state == ConnState::Online {
                        e.since = now("%H:%M");
                    }
                    e.state = state;
                }
            }
            Event::Snapshot(s) => {
                if let Some(e) = self.entry_mut(id) {
                    e.snap = *s;
                }
            }
            Event::Log(text) => self.log(id, &text),
        }
    }
}

// Accounts and their sessions. Shared between the Tauri commands and the session events (tokio threads). A change marks
// the account it touched and wakes the flusher thread, which sends the UI only the accounts that changed, at most every
// FLUSH and with the revision they were read at, so the UI can drop what is older than what it shows.
use crate::view::{self, AccountView, LogLine};
use cllt_core::accounts::{self, Account};
use cllt_core::bot::Snapshot;
use cllt_core::net::{Command, ConnState, Event, Manager};
use cllt_core::potentials::StatPlan;
use serde::Serialize;
use std::collections::{BTreeSet, VecDeque};
use std::path::PathBuf;
use std::sync::mpsc::{Receiver, Sender};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager as _};

/// Lines of log kept per account.
const LOG_LINES: usize = 500;
/// Longest wait before the UI hears of a change: the changes of that window (a battle turn on every account, a zone
/// full of players) go in one update.
const FLUSH: Duration = Duration::from_millis(50);

pub struct Entry {
    pub id: u64,
    pub account: Account,
    pub state: ConnState,
    pub snap: Snapshot,
    pub since: String,
    pub log: VecDeque<LogLine>,
    /// Number of the next log line.
    next_line: u64,
    /// While a battle is on: the line it opened on, which shows its latest result.
    live: Option<u64>,
}
impl Entry {
    pub fn new(id: u64, account: Account) -> Self {
        Self {
            id,
            account,
            state: ConnState::Offline,
            snap: Snapshot::default(),
            since: String::new(),
            log: VecDeque::new(),
            next_line: 1,
            live: None,
        }
    }
    /// Numbers the line, so the UI can tell the lines it has from new ones, and keeps it.
    pub fn push(&mut self, mut line: LogLine) -> LogLine {
        line.seq = self.next_line;
        self.next_line += 1;
        self.log.push_back(line.clone());
        if self.log.len() > LOG_LINES {
            self.log.pop_front();
        }
        line
    }

    /// Takes snapshot `s`. A battle that opens gets the line logged last, which is its challenge or the note that an
    /// earlier challenge opened late; each new result of the battle goes on that line, the one that ended it included.
    /// Returns the line when it changed.
    fn take_snapshot(&mut self, s: Snapshot) -> Option<LogLine> {
        if self.snap.battle.is_none() && s.battle.is_some() {
            self.live = self.log.back().map(|l| l.seq);
        }
        let changed = match (&s.turn, self.live) {
            (Some(turn), Some(seq)) if s.turn != self.snap.turn => {
                self.log.iter_mut().rev().find(|l| l.seq == seq).map(|l| {
                    l.turn = Some(turn.clone());
                    l.clone()
                })
            }
            _ => None,
        };
        if s.battle.is_none() {
            self.live = None;
        }
        self.snap = s;
        changed
    }
}

/// One line of the "log" event.
#[derive(Clone, Serialize)]
struct LogEvent {
    id: u64,
    line: LogLine,
}

/// Payload of the "accounts" event: the accounts that changed, as they were at `rev`.
#[derive(Clone, Serialize)]
struct Update {
    rev: u64,
    accounts: Vec<serde_json::Value>,
    /// Every account id in order, when an account was added or removed.
    ids: Option<Vec<u64>>,
}

pub struct App {
    manager: Option<Manager>,
    pub entries: Vec<Entry>,
    path: PathBuf,
    next_id: u64,
    /// Counts the changes; the `state` reply and each update carry the count they were read at.
    rev: u64,
    /// Accounts changed since the last update, and whether one was added or removed.
    changed: BTreeSet<u64>,
    list_changed: bool,
    /// Log lines not yet sent to the UI.
    pending: Vec<(u64, LogLine)>,
    wake: Sender<()>,
    /// Why accounts.json could not be read. While set, the app never writes the file, so a typo does not cost the
    /// accounts in it.
    pub load_error: Option<String>,
}

pub struct Shared {
    app: Mutex<App>,
    /// Held while accounts.json is written, instead of the App lock: writes go one at a time and in order, and the
    /// sessions and the window never wait for the disk.
    saving: tauri::async_runtime::Mutex<()>,
}
impl Shared {
    pub fn new(app: App) -> Self {
        Self {
            app: Mutex::new(app),
            saving: Default::default(),
        }
    }
    pub fn with<R>(&self, f: impl FnOnce(&mut App) -> R) -> R {
        f(&mut self.app.lock().unwrap_or_else(|e| e.into_inner()))
    }

    /// Adds the account once accounts.json holds it; nothing is added when the file cannot be written.
    pub async fn add(&self, account: Account) -> Result<u64, String> {
        let _turn = self.saving.lock().await;
        let (path, mut list) = self.with(|app| {
            app.unique(&account, None)?;
            app.saved(None, None)
        })?;
        list.push(account.clone());
        write(path, list).await?;
        Ok(self.with(|app| {
            let id = app.add(account);
            app.touch(id, true);
            id
        }))
    }

    /// Changes the account once accounts.json holds the change; an empty `password` keeps the one it has. A session
    /// already running goes on as it logged in: the change counts from the next login.
    pub async fn update(&self, id: u64, edit: Account) -> Result<(), String> {
        let _turn = self.saving.lock().await;
        let (path, list, account) = self.with(|app| {
            let old = &app
                .entry(id)
                .ok_or("Nick này không còn trong danh sách")?
                .account;
            let account = Account {
                password: if edit.password.is_empty() {
                    old.password.clone()
                } else {
                    edit.password
                },
                skill: old.skill,
                stats: old.stats,
                ..edit
            };
            app.unique(&account, Some(id))?;
            let (path, list) = app.saved(Some(id), Some(&account))?;
            Ok::<_, String>((path, list, account))
        })?;
        write(path, list).await?;
        self.with(|app| {
            if let Some(e) = app.entry_mut(id) {
                e.account = account;
                app.touch(id, false);
            }
        });
        Ok(())
    }

    /// Saves how the account spends potential points on its own (None: not at all) and tells its session, if it has one.
    pub async fn set_stats(&self, id: u64, plan: Option<StatPlan>) -> Result<(), String> {
        let _turn = self.saving.lock().await;
        let (path, list, account) = self.with(|app| {
            let old = &app
                .entry(id)
                .ok_or("Nick này không còn trong danh sách")?
                .account;
            let account = Account {
                stats: plan,
                ..old.clone()
            };
            let (path, list) = app.saved(Some(id), Some(&account))?;
            Ok::<_, String>((path, list, account))
        })?;
        write(path, list).await?;
        self.with(|app| {
            if let Some(e) = app.entry_mut(id) {
                e.account = account;
                app.touch(id, false);
            }
            if app.running(id) {
                app.send(id, Command::Stats(plan));
            }
        });
        Ok(())
    }

    /// Removes an account that has no session once accounts.json no longer holds it. The error, for the dialog that
    /// asked, when it has a session or the file cannot be written: the account then stays.
    pub async fn remove(&self, id: u64) -> Result<(), String> {
        let _turn = self.saving.lock().await;
        let (path, list) = self.with(|app| {
            if app.entry(id).is_none() {
                return Err("Nick này không còn trong danh sách".to_string());
            }
            if app.running(id) {
                return Err("Nick đang đăng nhập: đăng xuất trước khi xoá".into());
            }
            app.saved(Some(id), None)
        })?;
        write(path, list).await?;
        self.with(|app| app.drop_entry(id));
        Ok(())
    }
}

/// Writes accounts.json on a blocking thread.
async fn write(path: PathBuf, list: Vec<Account>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        }
        accounts::save(&path, &list)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Sends the UI what changed, woken by `App::touch` and `App::log`.
pub fn spawn_flusher(handle: AppHandle, wake: Receiver<()>) {
    std::thread::spawn(move || {
        while wake.recv().is_ok() {
            std::thread::sleep(FLUSH);
            while wake.try_recv().is_ok() {}
            let Some(shared) = handle.try_state::<Shared>() else {
                continue;
            };
            let (update, lines) = shared.with(App::take_update);
            if !lines.is_empty() {
                let _ = handle.emit("log", lines);
            }
            if let Some(update) = update {
                let _ = handle.emit("accounts", update);
            }
        }
    });
}

fn now(format: &str) -> String {
    chrono::Local::now().format(format).to_string()
}

impl App {
    pub fn new(manager: Option<Manager>, path: PathBuf, wake: Sender<()>) -> Self {
        Self {
            manager,
            entries: vec![],
            path,
            next_id: 0,
            rev: 0,
            changed: BTreeSet::new(),
            list_changed: false,
            pending: vec![],
            wake,
            load_error: None,
        }
    }

    /// The accounts of accounts.json, in its order; none when there is no file yet.
    pub fn load(&mut self) {
        if !self.path.exists() {
            return;
        }
        match accounts::load(&self.path) {
            Ok(list) => list.into_iter().for_each(|a| {
                self.add(a);
            }),
            Err(e) => self.load_error = Some(e),
        }
    }

    pub fn rev(&self) -> u64 {
        self.rev
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
    fn running(&self, id: u64) -> bool {
        self.manager.as_ref().is_some_and(|m| m.running(id))
    }

    /// Marks `id` for the next update (and the order of the list when `list`), then wakes the flusher.
    fn touch(&mut self, id: u64, list: bool) {
        self.rev += 1;
        self.changed.insert(id);
        self.list_changed |= list;
        let _ = self.wake.send(());
    }

    /// The accounts changed since the last call, as they are now, and the log lines not yet sent.
    fn take_update(&mut self) -> (Option<Update>, Vec<LogEvent>) {
        let lines = std::mem::take(&mut self.pending)
            .into_iter()
            .map(|(id, line)| LogEvent { id, line })
            .collect();
        if self.changed.is_empty() && !self.list_changed {
            return (None, lines);
        }
        let changed = std::mem::take(&mut self.changed);
        let accounts = self
            .entries
            .iter()
            .filter(|e| changed.contains(&e.id))
            .map(|e| serde_json::to_value(view::account(e)).unwrap_or_default())
            .collect();
        let ids = std::mem::take(&mut self.list_changed)
            .then(|| self.entries.iter().map(|e| e.id).collect());
        let update = Update {
            rev: self.rev,
            accounts,
            ids,
        };
        (Some(update), lines)
    }

    /// Adds an account without telling the UI: at start, before it asks for the `state`.
    pub fn add(&mut self, account: Account) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        self.entries.push(Entry::new(id, account));
        id
    }
    pub fn push(&mut self, entry: Entry) {
        self.next_id = self.next_id.max(entry.id + 1);
        self.entries.push(entry);
    }

    /// What accounts.json should hold: the account `id` replaced by `with`, or left out without it. An error while the
    /// file could not be read.
    fn saved(
        &self,
        id: Option<u64>,
        with: Option<&Account>,
    ) -> Result<(PathBuf, Vec<Account>), String> {
        if let Some(e) = &self.load_error {
            return Err(format!(
                "accounts.json đang lỗi, sửa file rồi mở lại app ({e})"
            ));
        }
        let list = self
            .entries
            .iter()
            .filter_map(|e| match Some(e.id) == id {
                true => with.cloned(),
                false => Some(e.account.clone()),
            })
            .collect();
        Ok((self.path.clone(), list))
    }

    /// Two sessions of one account on one server would log each other out.
    fn unique(&self, account: &Account, except: Option<u64>) -> Result<(), String> {
        let taken = self.entries.iter().any(|e| {
            Some(e.id) != except
                && e.account.server_id == account.server_id
                && e.account.username.eq_ignore_ascii_case(&account.username)
        });
        match taken {
            true => Err("Nick này đã có trong danh sách".into()),
            false => Ok(()),
        }
    }

    /// Takes the account out once accounts.json no longer has it; a session started while the file was written logs out.
    fn drop_entry(&mut self, id: u64) {
        if let Some(m) = &self.manager {
            m.send(id, Command::Logout);
        }
        self.entries.retain(|e| e.id != id);
        self.touch(id, true);
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
            let line = e.push(line);
            self.pending.push((id, line));
            let _ = self.wake.send(());
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
                    self.touch(id, false);
                }
            }
            Event::Snapshot(s) => {
                let Some(e) = self.entry_mut(id) else { return };
                if let Some(line) = e.take_snapshot(*s) {
                    self.pending.push((id, line));
                }
                self.touch(id, false);
            }
            Event::Log(text) => self.log(id, &text),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::channel;
    use tauri::async_runtime::block_on;

    fn account(name: &str) -> Account {
        Account {
            label: String::new(),
            username: name.into(),
            password: "x".into(),
            server_id: 24,
            skill: None,
            stats: None,
        }
    }

    #[test]
    fn an_update_holds_the_accounts_that_changed_as_of_its_revision() {
        let (wake, woken) = channel();
        let mut app = App::new(None, PathBuf::from("accounts.json"), wake);
        let (a, b) = (app.add(account("a")), app.add(account("b")));
        assert!(app.take_update().0.is_none());

        app.on_event(b, Event::State(ConnState::Connecting));
        app.on_event(b, Event::Snapshot(Box::default()));
        let (update, lines) = app.take_update();
        let update = update.unwrap();
        assert_eq!(
            (update.rev, update.accounts.len(), update.ids),
            (app.rev(), 1, None)
        );
        assert_eq!(update.accounts[0]["id"], b);
        assert_eq!(
            lines.iter().map(|l| (l.id, l.line.seq)).collect::<Vec<_>>(),
            [(b, 1)]
        );
        assert!(woken.try_iter().count() > 0);
        assert!(app.take_update().0.is_none());

        app.drop_entry(a);
        let update = app.take_update().0.unwrap();
        assert!(update.accounts.is_empty());
        assert_eq!(update.ids, Some(vec![b]));
    }

    #[test]
    fn each_result_of_a_battle_goes_on_the_line_it_opened_on() {
        use cllt_core::bot::BattleView;
        use cllt_core::runner::Turn;
        let mut app = App::new(None, PathBuf::from("accounts.json"), channel().0);
        let id = app.add(account("a"));
        let battle = || BattleView {
            mob_id: "mob61000".into(),
            mob_name: "Cóc Xanh".into(),
            hp: 150.0,
            max_hp: 180.0,
            mob_hp: None,
            mob_max_hp: None,
            turns: 0,
            timed: false,
            leaving: false,
        };
        let snap = |battle: Option<BattleView>, n: Option<u32>| {
            Event::Snapshot(Box::new(Snapshot {
                battle,
                turn: n.map(|n| Turn {
                    n,
                    end: n == 3,
                    ..Turn::default()
                }),
                ..Snapshot::default()
            }))
        };
        // The line logged last when the battle opens is its challenge; a later line does not take the results.
        app.on_event(
            id,
            Event::Log("Trận 1: thách đấu Cóc Xanh cấp 13 (mob61000)".into()),
        );
        app.on_event(id, snap(Some(battle()), None));
        app.on_event(id, Event::Log("Bàn cờ lệch với server ở lượt 2".into()));
        app.take_update();
        let sent = |app: &mut App| -> Vec<(u64, Option<u32>)> {
            let lines = app.take_update().1;
            lines
                .iter()
                .map(|l| (l.line.seq, l.line.turn.as_ref().map(|t| t.n)))
                .collect()
        };
        app.on_event(id, snap(Some(battle()), Some(1)));
        assert_eq!(sent(&mut app), [(1, Some(1))]);
        // A snapshot with the same result sends nothing; the result that ends the battle comes with no battle.
        app.on_event(id, snap(Some(battle()), Some(1)));
        app.on_event(id, snap(Some(battle()), Some(2)));
        app.on_event(id, snap(None, Some(3)));
        assert_eq!(sent(&mut app), [(1, Some(2)), (1, Some(3))]);
        let log = app.logs(id);
        assert_eq!(log[0].turn.as_ref().map(|t| t.end), Some(true));
        assert_eq!(log[1].turn, None);
        // The next battle, before its first result, leaves that line as it is.
        app.on_event(
            id,
            Event::Log("Trận 2: thách đấu Cóc Xanh cấp 13 (mob61000)".into()),
        );
        app.on_event(id, snap(Some(battle()), None));
        assert_eq!(sent(&mut app), [(3, None)]);
    }

    #[test]
    fn accounts_json_is_written_before_an_account_is_added_or_removed() {
        let dir = std::env::temp_dir().join(format!("cllt-desktop-{}", std::process::id()));
        let path = dir.join("accounts.json");
        let shared = Shared::new(App::new(None, path.clone(), channel().0));
        let id = block_on(shared.add(account("a"))).unwrap();
        assert_eq!(accounts::load(&path).unwrap().len(), 1);
        assert_eq!(shared.with(|app| app.entries.len()), 1);

        // The same account twice would log itself out.
        assert!(block_on(shared.add(account("A"))).is_err());

        // An empty password keeps the saved one.
        let edit = Account {
            label: "Nick chính".into(),
            password: String::new(),
            ..account("a2")
        };
        block_on(shared.update(id, edit)).unwrap();
        let saved = &accounts::load(&path).unwrap()[0];
        assert_eq!(
            (
                saved.username.as_str(),
                saved.label.as_str(),
                saved.password.as_str()
            ),
            ("a2", "Nick chính", "x")
        );
        assert_eq!(
            shared.with(|app| app.entries[0].account.username.clone()),
            "a2"
        );

        block_on(shared.remove(id)).unwrap();
        assert!(accounts::load(&path).unwrap().is_empty());
        assert!(block_on(shared.remove(id)).is_err());
        assert!(shared.with(|app| app.entries.is_empty()));

        // A file that did not read is never written over: adding fails, and so does removing, which says so and keeps
        // the account.
        let id = block_on(shared.add(account("b"))).unwrap();
        shared.with(|app| app.load_error = Some("bad".into()));
        assert!(block_on(shared.add(account("c"))).is_err());
        assert!(block_on(shared.remove(id))
            .unwrap_err()
            .contains("accounts.json đang lỗi"));
        assert_eq!(shared.with(|app| app.entries.len()), 1);
        std::fs::remove_dir_all(dir).ok();
    }
}

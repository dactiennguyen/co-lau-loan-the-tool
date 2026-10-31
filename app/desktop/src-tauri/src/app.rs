// Accounts and their sessions. Shared between the Tauri commands and the session events (tokio threads). A change marks
// the account it touched and wakes the flusher thread, which sends the UI only the accounts that changed, at most every
// FLUSH and with the revision they were read at, so the UI can drop what is older than what it shows.
use crate::store::Store;
use crate::view::{self, AccountView, LogLine};
use cllt_core::accounts::{self, Account};
use cllt_core::bot::{FightSettings, LogKind, Snapshot};
use cllt_core::net::{Command, ConnState, Event, Manager};
use cllt_core::potentials::StatPlan;
use cllt_core::proxy::Proxy;
use serde::Serialize;
use std::collections::{BTreeSet, VecDeque};
use std::path::PathBuf;
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager as _};

/// Lines of log kept per account.
const LOG_LINES: usize = 500;
/// Lines of the earlier sessions shown when the app starts; older ones come from cllt.db on demand.
const HISTORY: u32 = 200;
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
    /// cllt.db: every log line and battle, by account username. None when it could not be opened.
    store: Option<Arc<Store>>,
}

/// The key of an account in cllt.db: its username in lower case, as the server takes it.
pub fn username(account: &Account) -> String {
    account.username.to_lowercase()
}

/// Wall clock in ms since 1970.
pub fn epoch_ms() -> u64 {
    chrono::Utc::now().timestamp_millis().max(0) as u64
}

pub struct Shared {
    app: Mutex<App>,
    /// The queries of the Nhật ký and Thống kê go to the database without the App lock.
    store: Option<Arc<Store>>,
    /// Held while accounts.json is written, instead of the App lock: writes go one at a time and in order, and the
    /// sessions and the window never wait for the disk.
    saving: tauri::async_runtime::Mutex<()>,
}
impl Shared {
    pub fn new(app: App) -> Self {
        Self {
            store: app.store.clone(),
            app: Mutex::new(app),
            saving: Default::default(),
        }
    }
    pub fn store(&self) -> Option<&Store> {
        self.store.as_deref()
    }
    pub fn with<R>(&self, f: impl FnOnce(&mut App) -> R) -> R {
        f(&mut self.app.lock().unwrap_or_else(|e| e.into_inner()))
    }

    /// Adds the account once accounts.json holds it; nothing is added when the file cannot be written, nor when its
    /// proxy is on and does not reach the game server.
    pub async fn add(&self, account: Account) -> Result<u64, String> {
        let _turn = self.saving.lock().await;
        self.with(|app| app.unique(&account, None))?;
        if needs_check(None, account.proxy.as_ref()) {
            check(account.proxy.as_ref().unwrap()).await?;
        }
        let (path, mut list) = self.with(|app| app.saved(None, None))?;
        list.push(account.clone());
        write(path, list).await?;
        Ok(self.with(|app| {
            let id = app.add(account);
            app.touch(id, true);
            id
        }))
    }

    /// Changes the account once accounts.json holds the change; an empty `password` keeps the one it has, and so does
    /// an empty proxy password with a proxy username. A proxy turned on or changed is tested first: the change is not
    /// saved when it does not reach the game server. A session already running goes on as it logged in: the change
    /// counts from the next login.
    pub async fn update(&self, id: u64, edit: Account) -> Result<(), String> {
        let _turn = self.saving.lock().await;
        let (account, old_proxy) = self.with(|app| {
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
                fight: old.fight,
                proxy: keep_password(old.proxy.as_ref(), edit.proxy),
                ..edit
            };
            app.unique(&account, Some(id))?;
            Ok::<_, String>((account, old.proxy.clone()))
        })?;
        if needs_check(old_proxy.as_ref(), account.proxy.as_ref()) {
            check(account.proxy.as_ref().unwrap()).await?;
        }
        let (path, list) = self.with(|app| app.saved(Some(id), Some(&account)))?;
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
        self.change(id, |a| a.stats = plan, Command::Stats(plan))
            .await
    }

    /// Saves the Cài đặt đánh of the account and tells its session, if it has one.
    pub async fn set_fight(&self, id: u64, settings: FightSettings) -> Result<(), String> {
        self.change(id, |a| a.fight = settings, Command::FightSettings(settings))
            .await
    }

    /// Changes a setting of the account once accounts.json holds the change, then passes `command` to its session.
    async fn change(
        &self,
        id: u64,
        set: impl FnOnce(&mut Account),
        command: Command,
    ) -> Result<(), String> {
        let _turn = self.saving.lock().await;
        let (path, list, account) = self.with(|app| {
            let mut account = app
                .entry(id)
                .ok_or("Nick này không còn trong danh sách")?
                .account
                .clone();
            set(&mut account);
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
                app.send(id, command);
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

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Secrets {
    pub password: String,
    pub proxy_password: String,
}

/// A proxy edited with its username kept and no password typed in keeps the saved password.
pub fn keep_password(old: Option<&Proxy>, edit: Option<Proxy>) -> Option<Proxy> {
    let mut p = edit?;
    if !p.username.is_empty() && p.password.is_empty() {
        if let Some(old) = old.filter(|o| o.username == p.username) {
            p.password = old.password.clone();
        }
    }
    Some(p)
}

/// A proxy is tested before it is saved when it is on and is new, was off, or changed.
fn needs_check(old: Option<&Proxy>, new: Option<&Proxy>) -> bool {
    new.is_some_and(|n| n.enabled && old.is_none_or(|o| !o.enabled || o != n))
}

/// The test before saving: the proxy must reach the game server (net::check_proxy).
async fn check(proxy: &Proxy) -> Result<(), String> {
    cllt_core::net::check_proxy(proxy)
        .await
        .map(|_| ())
        .map_err(|e| format!("Chưa lưu: kiểm tra proxy không qua. {e}"))
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
            store: None,
        }
    }

    pub fn set_store(&mut self, store: Arc<Store>) {
        self.store = Some(store);
    }

    /// The last lines of each account from the earlier sessions, before its new ones.
    pub fn load_history(&mut self) {
        let Some(store) = self.store.clone() else {
            return;
        };
        for e in &mut self.entries {
            let lines = store
                .logs(&username(&e.account), None, &[], None, HISTORY)
                .unwrap_or_default();
            for l in lines.iter().rev() {
                e.push(LogLine::stored(l));
            }
        }
    }

    pub fn username(&self, id: u64) -> Option<String> {
        self.entry(id).map(|e| username(&e.account))
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

    /// The proxy saved for the account, with its password, for `test_proxy`.
    pub fn proxy_of(&self, id: u64) -> Option<Proxy> {
        self.entry(id)?.account.proxy.clone()
    }
    /// The game password and the proxy password of the account, for the edit form only (`account_secrets`): the
    /// "accounts" event and the log never carry them.
    pub fn secrets(&self, id: u64) -> Option<Secrets> {
        let a = &self.entry(id)?.account;
        Some(Secrets {
            password: a.password.clone(),
            proxy_password: a
                .proxy
                .as_ref()
                .map(|p| p.password.clone())
                .unwrap_or_default(),
        })
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
            self.log(id, LogKind::Connection, "Nick chưa đăng nhập");
        }
    }

    pub fn send_all(&mut self, command: Command) {
        let ids: Vec<u64> = self.entries.iter().map(|e| e.id).collect();
        ids.into_iter()
            .for_each(|id| self.send(id, command.clone()));
    }

    /// Keeps the line in the log of the account and in cllt.db, and tells the UI.
    pub fn log(&mut self, id: u64, kind: LogKind, text: &str) {
        let mut line = LogLine::new(epoch_ms(), kind, text);
        let Some(e) = self.entries.iter_mut().find(|e| e.id == id) else {
            return;
        };
        if let Some(s) = &self.store {
            line.id = s.add_log(&username(&e.account), line.at, kind, line.tone, text);
        }
        let line = e.push(line);
        self.pending.push((id, line));
        let _ = self.wake.send(());
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
                self.log(id, LogKind::Connection, &text);
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
            Event::Log(kind, text) => self.log(id, kind, &text),
            Event::Battle(record) => {
                let (Some(store), Some(user)) = (&self.store, self.username(id)) else {
                    return;
                };
                if let Err(e) = store.add_battle(&user, &record) {
                    eprintln!("cllt.db: không ghi được trận: {e}");
                }
            }
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
            fight: Default::default(),
            proxy: None,
        }
    }

    #[test]
    fn log_lines_and_battles_go_to_cllt_db_by_username_and_come_back_at_the_next_start() {
        use crate::store::BattleFilter;
        use cllt_core::bot::{BattleRecord, BattleResult, BattleSource};
        let store = Arc::new(Store::memory().unwrap());
        let mut app = App::new(None, PathBuf::from("accounts.json"), channel().0);
        app.set_store(store.clone());
        let id = app.add(account("Manina2"));
        app.on_event(id, Event::State(ConnState::Online));
        app.on_event(id, Event::Log(LogKind::Travel, "Sang khu 4".into()));
        let lines = app.logs(id);
        assert_eq!(
            lines
                .iter()
                .map(|l| (l.kind, l.text.as_str()))
                .collect::<Vec<_>>(),
            [
                (LogKind::Connection, "Đã vào game"),
                (LogKind::Travel, "Sang khu 4")
            ]
        );
        assert!(lines.iter().all(|l| l.id.is_some() && l.at > 0));
        let battle = BattleRecord {
            character: "manina".into(),
            level: 21,
            started_at: 1,
            ended_at: 30_001,
            map_id: "M2".into(),
            map_name: "Trại Vân Sơn".into(),
            zone: 4,
            mob_id: "mob61000".into(),
            mob_name: "Cóc Xanh".into(),
            mob_level: 13,
            boss: false,
            source: BattleSource::Fight,
            result: BattleResult::Won,
            turns: 11,
            damage: 249,
            hp_before: 238,
            hp_after: 200,
            max_hp: 238,
            exp: 52,
            coin: 6,
        };
        app.on_event(id, Event::Battle(Box::new(battle)));
        let filter = BattleFilter {
            username: "manina2",
            since: None,
            source: None,
        };
        assert_eq!(store.stats(filter).unwrap().totals.won, 1);

        // The next start: the account, under any case, gets its lines back before its new ones.
        let mut again = App::new(None, PathBuf::from("accounts.json"), channel().0);
        again.set_store(store);
        let id = again.add(account("manina2"));
        again.load_history();
        again.on_event(id, Event::State(ConnState::Connecting));
        let texts: Vec<String> = again.logs(id).into_iter().map(|l| l.text).collect();
        assert_eq!(texts, ["Đã vào game", "Sang khu 4", "Đang kết nối…"]);
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
            Event::Log(
                LogKind::Battle,
                "Trận 1: thách đấu Cóc Xanh cấp 13 (mob61000)".into(),
            ),
        );
        app.on_event(id, snap(Some(battle()), None));
        app.on_event(
            id,
            Event::Log(LogKind::Battle, "Bàn cờ lệch với server ở lượt 2".into()),
        );
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
            Event::Log(
                LogKind::Battle,
                "Trận 2: thách đấu Cóc Xanh cấp 13 (mob61000)".into(),
            ),
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

        // Tự sửa đồ is saved on its own, and the edit form (which does not send it) keeps it.
        let repair = FightSettings {
            repair: true,
            ..FightSettings::default()
        };
        block_on(shared.set_fight(id, repair)).unwrap();
        assert_eq!(accounts::load(&path).unwrap()[0].fight, repair);

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
                saved.password.as_str(),
                saved.fight
            ),
            ("a2", "Nick chính", "x", repair)
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

    #[test]
    fn a_proxy_is_saved_on_or_off_and_tested_before_it_is_turned_on() {
        let dir = std::env::temp_dir().join(format!("cllt-proxy-{}", std::process::id()));
        let path = dir.join("accounts.json");
        let shared = Shared::new(App::new(None, path.clone(), channel().0));
        // Nothing listens there: the test before saving fails at once.
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let off = Proxy {
            enabled: false,
            kind: cllt_core::proxy::ProxyKind::Socks5,
            host: "127.0.0.1".into(),
            port,
            username: "bot".into(),
            password: "s3cret".into(),
        };
        let with = |proxy: Proxy| Account {
            proxy: Some(proxy),
            ..account("a")
        };
        // Off, it is saved as it is, untested.
        let id = block_on(shared.add(with(off.clone()))).unwrap();
        assert_eq!(accounts::load(&path).unwrap()[0].proxy, Some(off.clone()));
        // Turned on, it must reach the game server first: nothing changes when it does not.
        let on = Proxy {
            enabled: true,
            password: String::new(),
            ..off.clone()
        };
        let err = block_on(shared.update(id, with(on))).unwrap_err();
        assert!(
            err.starts_with(
                "Chưa lưu: kiểm tra proxy không qua. Không kết nối được proxy socks5 127.0.0.1:"
            ),
            "{err}"
        );
        assert!(!err.contains("s3cret"));
        assert_eq!(accounts::load(&path).unwrap()[0].proxy, Some(off.clone()));
        assert!(block_on(shared.add(with(Proxy {
            enabled: true,
            ..off.clone()
        })))
        .is_err());
        // Left off with another label: no test, and the empty password keeps the saved one.
        let edit = Account {
            label: "Nick có proxy".into(),
            ..with(Proxy {
                password: String::new(),
                ..off.clone()
            })
        };
        block_on(shared.update(id, edit)).unwrap();
        let saved = &accounts::load(&path).unwrap()[0];
        assert_eq!(
            (saved.label.as_str(), &saved.proxy),
            ("Nick có proxy", &Some(off))
        );
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_proxy_password_is_kept_only_for_the_same_username() {
        let old = Proxy {
            enabled: true,
            kind: cllt_core::proxy::ProxyKind::Http,
            host: "h".into(),
            port: 1,
            username: "bot".into(),
            password: "pw".into(),
        };
        let edit = |username: &str, password: &str| {
            keep_password(
                Some(&old),
                Some(Proxy {
                    username: username.into(),
                    password: password.into(),
                    ..old.clone()
                }),
            )
            .unwrap()
            .password
        };
        assert_eq!(edit("bot", ""), "pw");
        assert_eq!(edit("bot", "new"), "new");
        assert_eq!(edit("other", ""), "");
        assert_eq!(edit("", ""), "");
        assert!(!needs_check(Some(&old), Some(&old)));
        assert!(needs_check(None, Some(&old)));
        assert!(needs_check(
            Some(&Proxy {
                enabled: false,
                ..old.clone()
            }),
            Some(&old)
        ));
        assert!(needs_check(
            Some(&Proxy {
                port: 2,
                ..old.clone()
            }),
            Some(&old)
        ));
        assert!(!needs_check(
            None,
            Some(&Proxy {
                enabled: false,
                ..old.clone()
            })
        ));
        assert!(!needs_check(Some(&old), None));
    }

    #[test]
    fn the_edit_form_gets_both_passwords_and_the_account_view_neither() {
        let (wake, _woken) = channel();
        let mut app = App::new(None, PathBuf::from("accounts.json"), wake);
        let plain = app.add(account("a"));
        let proxied = app.add(Account {
            proxy: Some(Proxy {
                enabled: true,
                kind: cllt_core::proxy::ProxyKind::Socks5,
                host: "h".into(),
                port: 1,
                username: "bot".into(),
                password: "s3cret".into(),
            }),
            ..account("b")
        });
        assert_eq!(
            app.secrets(plain),
            Some(Secrets {
                password: "x".into(),
                proxy_password: String::new()
            })
        );
        assert_eq!(app.secrets(proxied).unwrap().proxy_password, "s3cret");
        assert_eq!(app.secrets(99), None);
        let views = serde_json::to_string(&app.views()).unwrap();
        assert!(
            !views.contains("s3cret") && !views.contains("\"x\""),
            "{views}"
        );
    }
}

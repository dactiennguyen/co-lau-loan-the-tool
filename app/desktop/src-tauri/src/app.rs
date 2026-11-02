// Accounts and their sessions. Shared between the Tauri commands and the session events (tokio threads). A change marks
// the account it touched and wakes the flusher thread, which sends the UI only the accounts that changed, at most every
// FLUSH and with the revision they were read at, so the UI can drop what is older than what it shows.
use crate::backup::{self, Imported, Step};
use crate::settings::{self, Settings};
use crate::store::Store;
use crate::view::{self, AccountView, LogLine};
use cllt_core::accounts::{self, Account};
use cllt_core::bot::{add_picked, BattleResult, FightSettings, LogKind, Snapshot};
use cllt_core::items::book;
use cllt_core::net::{Command, ConnState, Event, Fault, Manager, Server};
use cllt_core::npc::{self, BagItem, MergeForecast, MergeOptions};
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
/// Lines of the account's log a Log lỗi keeps, the last ones.
const FAULT_LINES: usize = 60;
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
    /// Tự nhặt đồ: the end (ms) of the battle just won, until the bot's line about it ("Trận 3: thắng …") comes; then
    /// that end and the line, which shows what is picked up after it.
    loot_next: Option<u64>,
    loot_line: Option<(u64, u64)>,
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
            loot_next: None,
            loot_line: None,
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
    /// Cài đặt of the app (settings.json), as the manager was last given them.
    settings: Settings,
    /// Notifications of jobs and quest runs that ended, for the flusher to show (notify.rs).
    notices: Vec<crate::notify::Notice>,
}

/// The key of an account in cllt.db: its username in lower case, as the server takes it.
pub fn username(account: &Account) -> String {
    account.username.to_lowercase()
}

/// The app and the system, at the head of a Log lỗi and of the file Xuất log lỗi writes.
pub fn app_info() -> serde_json::Map<String, serde_json::Value> {
    let mut m = serde_json::Map::new();
    m.insert("app".into(), crate::app_name().into());
    m.insert("version".into(), env!("CARGO_PKG_VERSION").into());
    m.insert("os".into(), std::env::consts::OS.into());
    m.insert("arch".into(), std::env::consts::ARCH.into());
    m
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
    /// For work off the async threads (Xuất dữ liệu trận).
    pub fn store_handle(&self) -> Option<Arc<Store>> {
        self.store.clone()
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
            check(&self.server(), account.proxy.as_ref().unwrap()).await?;
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
                fight_targets: old.fight_targets.clone(),
                proxy: keep_password(old.proxy.as_ref(), edit.proxy),
                ..edit
            };
            app.unique(&account, Some(id))?;
            Ok::<_, String>((account, old.proxy.clone()))
        })?;
        if needs_check(old_proxy.as_ref(), account.proxy.as_ref()) {
            check(&self.server(), account.proxy.as_ref().unwrap()).await?;
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

    /// The game server of the Cài đặt, which the proxy checks reach.
    pub fn server(&self) -> Server {
        self.with(|app| app.settings.server.clone())
    }

    /// Saves the Cài đặt of the app to settings.json, then gives them to the manager: the game server counts from the
    /// next login, Lưu dữ liệu trận at once for every session. The error, for the dialog, when the file cannot be
    /// written or a value cannot be used; nothing changes then.
    pub async fn set_settings(&self, settings: Settings) -> Result<(), String> {
        let settings = settings.checked()?;
        let _turn = self.saving.lock().await;
        let (path, saved) = (self.with(|app| app.settings_path()), settings.clone());
        tauri::async_runtime::spawn_blocking(move || settings::save(&path, &saved))
            .await
            .map_err(|e| e.to_string())??;
        self.with(|app| app.apply_settings(settings));
        Ok(())
    }

    /// Saves how the account spends potential points on its own (None: not at all) and tells its session, if it has one.
    pub async fn set_stats(&self, id: u64, plan: Option<StatPlan>) -> Result<(), String> {
        self.change(id, |a| a.stats = plan, Some(Command::Stats(plan)))
            .await
    }

    /// Saves the Cài đặt đánh of the account and tells its session, if it has one.
    pub async fn set_fight(&self, id: u64, settings: FightSettings) -> Result<(), String> {
        self.change(
            id,
            |a| a.fight = settings,
            Some(Command::FightSettings(settings)),
        )
        .await
    }

    /// Saves the target the Đánh quái tab chose on a map; the session never reads it.
    pub async fn set_fight_target(
        &self,
        id: u64,
        map_id: String,
        target: String,
    ) -> Result<(), String> {
        self.change(
            id,
            |a| {
                a.fight_targets.insert(map_id, target);
            },
            None,
        )
        .await
    }

    /// Changes a setting of the account once accounts.json holds the change, then passes `command`, if any, to its
    /// session.
    async fn change(
        &self,
        id: u64,
        set: impl FnOnce(&mut Account),
        command: Option<Command>,
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
            if let Some(command) = command.filter(|_| app.running(id)) {
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

    /// Nhập JSON (backup.rs): adds the accounts of the JSON the list has not got and, with `replace`, replaces those it
    /// has, in one write of accounts.json; an account the JSON repeats counts once. Proxies are not tested: they were
    /// when added on the machine that exported them, and Kiểm tra of Sửa nick tests one. A session already running goes
    /// on as it logged in: a replaced account counts from its next login. Nothing changes when the file cannot be
    /// written.
    pub async fn import(&self, accounts: Vec<Account>, replace: bool) -> Result<Imported, String> {
        let _turn = self.saving.lock().await;
        let (path, list, steps) = self.with(|app| {
            let steps = backup::plan(&accounts, replace, |a| app.find(a));
            let (path, mut list) = app.saved(None, None)?;
            for (step, account) in steps.iter().zip(&accounts) {
                match step {
                    Step::Add => list.push(account.clone()),
                    Step::Replace(id) => {
                        let at = app.entries.iter().position(|e| e.id == *id).unwrap();
                        list[at] = backup::replacement(&app.entries[at].account, account.clone());
                    }
                    Step::Skip => {}
                }
            }
            Ok::<_, String>((path, list, steps))
        })?;
        write(path, list.clone()).await?;
        Ok(self.with(|app| {
            let mut done = Imported::default();
            for (step, account) in steps.into_iter().zip(accounts) {
                match step {
                    Step::Add => {
                        done.accounts.push(account.clone());
                        let id = app.add(account);
                        app.touch(id, true);
                        done.added += 1;
                    }
                    Step::Replace(id) => {
                        if let Some(at) = app.entries.iter().position(|e| e.id == id) {
                            app.entries[at].account = list[at].clone();
                            done.accounts.push(list[at].clone());
                            app.touch(id, false);
                        }
                        done.replaced += 1;
                    }
                    Step::Skip => done.skipped += 1,
                }
            }
            done
        }))
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
async fn check(server: &Server, proxy: &Proxy) -> Result<(), String> {
    cllt_core::net::check_proxy(server, proxy)
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
            for n in shared.with(|app| std::mem::take(&mut app.notices)) {
                if let Err(e) = crate::notify::show(&handle, &n) {
                    eprintln!("{e}");
                }
            }
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
            settings: Settings::default(),
            notices: vec![],
        }
    }

    pub fn settings(&self) -> &Settings {
        &self.settings
    }

    /// settings.json, beside accounts.json.
    pub fn settings_path(&self) -> PathBuf {
        settings::path(&self.path)
    }

    /// Gives the manager the game server of the next logins and Lưu dữ liệu trận.
    pub fn apply_settings(&mut self, settings: Settings) {
        if let Some(m) = &mut self.manager {
            m.set_server(settings.server.clone());
            m.set_record(settings.record);
        }
        self.settings = settings;
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
    /// Gộp đá on the account's bag as it is now: what it would do in all (npc::merge_forecast); None without a bag.
    pub fn merge_forecast(&self, id: u64, options: MergeOptions) -> Option<MergeForecast> {
        let bag = self.entry(id)?.snap.bag.as_ref()?;
        let items: Vec<BagItem> = bag.items.iter().map(BagItem::from).collect();
        Some(npc::merge_forecast(&items, options))
    }

    /// The bag slots Chuyển hoá may move the level of bag slot `source` to (npc::transmute_targets).
    pub fn transmute_targets(&self, id: u64, source: u8) -> Vec<i32> {
        let Some(bag) = self.entry(id).and_then(|e| e.snap.bag.as_ref()) else {
            return vec![];
        };
        let items: Vec<BagItem> = bag.items.iter().map(BagItem::from).collect();
        let Some(from) = items.iter().find(|i| i.slot == source as i32) else {
            return vec![];
        };
        let def = |id: i32| book().get(id).map(|d| (d.kind, d.level as i32));
        npc::transmute_targets(&items, from, def)
            .iter()
            .map(|i| i.slot)
            .collect()
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

    /// The account of the list that logs in as `account`: one username (case aside) on one server.
    pub fn find(&self, account: &Account) -> Option<u64> {
        self.entries
            .iter()
            .find(|e| backup::same(&e.account, account))
            .map(|e| e.id)
    }

    /// Xuất JSON: the accounts `ids`, in the order of the list.
    pub fn accounts_of(&self, ids: &[u64]) -> Vec<Account> {
        self.entries
            .iter()
            .filter(|e| ids.contains(&e.id))
            .map(|e| e.account.clone())
            .collect()
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

    /// Keeps the line in the log of the account and in cllt.db, and tells the UI. The first line after a won battle is the
    /// bot's line about it ("Trận 3: thắng …", "Trận của việc trước: thắng …"): the items picked up after that battle go
    /// under it.
    pub fn log(&mut self, id: u64, kind: LogKind, text: &str) {
        let mut line = LogLine::new(epoch_ms(), kind, text);
        let Some(e) = self.entries.iter_mut().find(|e| e.id == id) else {
            return;
        };
        let won = e
            .loot_next
            .take()
            .filter(|_| kind == LogKind::Battle && text.starts_with("Trận"));
        if let Some(s) = &self.store {
            line.id = s.add_log(&username(&e.account), line.at, kind, line.tone, text);
            if let (Some(row), Some(at)) = (line.id, won) {
                if let Err(err) = s.link_battle(row, at) {
                    eprintln!("cllt.db: không ghi được trận của dòng nhật ký: {err}");
                }
            }
        }
        let line = e.push(line);
        if let Some(at) = won {
            e.loot_line = Some((at, line.seq));
        }
        self.pending.push((id, line));
        let _ = self.wake.send(());
    }

    /// Log lỗi: keeps fault `f` of account `id` (None for the UI, whose stack is `detail`) in cllt.db, with what the app
    /// knows of the account then (its card as the UI has it, without the proxy; its last FAULT_LINES log lines) and the
    /// app and system. Never the password: accounts.json is not read, and the session's trace leaves out c2s/4.
    pub fn add_fault(&mut self, id: Option<u64>, f: Fault, detail: Option<&str>) {
        let Some(store) = &self.store else { return };
        let entry = id.and_then(|id| self.entries.iter().find(|e| e.id == id));
        let source = if f.reported {
            "report"
        } else if entry.is_none() {
            "ui"
        } else if f.kind == LogKind::Connection && f.text.starts_with("Lỗi") {
            "connection"
        } else {
            "bot"
        };
        let account = entry.map(|e| {
            let mut card = serde_json::to_value(view::account(e)).unwrap_or_default();
            if let Some(card) = card.as_object_mut() {
                card.remove("proxy");
            }
            card
        });
        let log: Vec<_> = entry
            .map(|e| e.log.iter().rev().take(FAULT_LINES).rev().collect())
            .unwrap_or_default();
        let report = serde_json::json!({
            "app": app_info(),
            "kind": f.kind,
            "reported": f.reported,
            "detail": detail,
            "account": account,
            "log": log
                .iter()
                .map(|l| serde_json::json!({ "at": l.at, "time": l.time, "kind": l.kind, "text": l.text }))
                .collect::<Vec<_>>(),
            "commands": f.commands,
            "packets": f.packets,
        });
        let user = entry.map(|e| username(&e.account));
        if let Err(e) = store.add_fault(
            epoch_ms(),
            user.as_deref(),
            source,
            &f.text,
            &report.to_string(),
        ) {
            eprintln!("cllt.db: không ghi được log lỗi: {e}");
        }
    }

    /// Báo lỗi of account `id` with the user's `note`: through its session, which adds its last packets and commands
    /// (Command::Report, back as Event::Fault); without one, at once with what the app has.
    pub fn report(&mut self, id: u64, note: &str) {
        let running = self.manager.as_ref().is_some_and(|m| m.running(id));
        if !(running
            && self
                .manager
                .as_ref()
                .is_some_and(|m| m.send(id, Command::Report(note.into()))))
        {
            self.add_fault(Some(id), Fault::note(note), None);
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
                let (done, lost) = (self.settings.notify_done, self.settings.notify_lost);
                let Some(e) = self.entry_mut(id) else { return };
                let who = match e.account.label.trim() {
                    "" => e.account.username.clone(),
                    label => label.to_string(),
                };
                let ended = crate::notify::ended(&who, &e.snap, &s);
                if let Some(line) = e.take_snapshot(*s) {
                    self.pending.push((id, line));
                }
                self.notices
                    .extend(ended.into_iter().filter(|n| match n.kind {
                        crate::notify::Kind::Done => done,
                        crate::notify::Kind::Lost => lost,
                    }));
                self.touch(id, false);
            }
            Event::Log(kind, text) => self.log(id, kind, &text),
            Event::Fault(f) => self.add_fault(Some(id), *f, None),
            Event::Battle(record) => {
                if let Some(e) = self.entry_mut(id) {
                    e.loot_next = (record.result == BattleResult::Won).then_some(record.ended_at);
                }
                let (Some(store), Some(user)) = (&self.store, self.username(id)) else {
                    return;
                };
                if let Err(e) = store.add_battle(&user, &record) {
                    eprintln!("cllt.db: không ghi được trận: {e}");
                }
            }
            // Lưu dữ liệu trận: for `npm run battles` and the training of the battle algorithm, never shown.
            Event::BattleData(data) => {
                let (Some(store), Some(user)) = (&self.store, self.username(id)) else {
                    return;
                };
                if let Err(e) = store.add_battle_data(&user, &data) {
                    eprintln!("cllt.db: không ghi được dữ liệu trận: {e}");
                }
            }
            // Under the line of its battle, sent to the UI again; without that line (gone from the 500 kept), a line of
            // its own.
            Event::Pickup(record) => {
                if let (Some(store), Some(user)) = (&self.store, self.username(id)) {
                    if let Err(e) = store.add_pickup(&user, &record) {
                        eprintln!("cllt.db: không ghi được món nhặt: {e}");
                    }
                }
                let line = self.entry_mut(id).and_then(|e| {
                    let (_, seq) = e.loot_line.filter(|l| l.0 == record.battle_at)?;
                    let line = e.log.iter_mut().rev().find(|l| l.seq == seq)?;
                    add_picked(&mut line.picked, &record.item);
                    Some(line.clone())
                });
                match line {
                    Some(line) => {
                        self.pending.push((id, line));
                        let _ = self.wake.send(());
                    }
                    None => self.log(
                        id,
                        LogKind::Item,
                        &format!("Đã nhặt {}", record.item.label()),
                    ),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
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
            fight_targets: Default::default(),
            proxy: None,
            algorithm: Default::default(),
        }
    }

    #[test]
    fn log_loi_keeps_the_fault_with_the_account_its_last_lines_and_packets_but_no_secret() {
        use cllt_core::net::Traced;
        let store = Arc::new(Store::memory().unwrap());
        let mut app = App::new(None, PathBuf::from("accounts.json"), channel().0);
        app.set_store(store.clone());
        let mut a = account("Wangpt");
        a.proxy = Some(Proxy {
            enabled: true,
            kind: Default::default(),
            host: "1.2.3.4".into(),
            port: 1080,
            username: "proxy-user".into(),
            password: "proxy-secret".into(),
        });
        let id = app.add(a);
        app.on_event(id, Event::State(ConnState::Online));
        let text = "Không đọc được túi đồ (s2c/1187): PAYLOAD_SCHEMA: Invalid field length 4 at 5";
        app.on_event(id, Event::Log(LogKind::Item, text.into()));
        let packet = Traced {
            at: 1,
            dir: "s2c",
            op: 1187,
            len: 2,
            hex: "0001".into(),
        };
        let fault = Fault {
            text: text.into(),
            kind: LogKind::Item,
            reported: false,
            commands: vec![(1, "Item(Use(8))".into())],
            packets: vec![packet],
        };
        app.on_event(id, Event::Fault(Box::new(fault)));
        // Báo lỗi without a session: saved at once, with what the app has.
        app.report(id, "mở trứng không được");
        app.on_event(
            id,
            Event::Fault(Box::new(Fault {
                text: "Lỗi: Server đã đóng kết nối".into(),
                ..Fault::note("")
            })),
        );
        app.on_event(
            id,
            Event::Fault(Box::new(Fault {
                reported: false,
                ..Fault::note("Lỗi: Server đã đóng kết nối")
            })),
        );
        app.add_fault(
            None,
            Fault {
                reported: false,
                ..Fault::note("TypeError: x")
            },
            Some("at f (App.tsx:1)"),
        );

        let list = store.faults(10).unwrap();
        assert_eq!(
            list.recent
                .iter()
                .rev()
                .map(|f| (f.source.as_str(), f.username.as_deref()))
                .collect::<Vec<_>>(),
            [
                ("bot", Some("wangpt")),
                ("report", Some("wangpt")),
                ("report", Some("wangpt")),
                ("connection", Some("wangpt")),
                ("ui", None)
            ]
        );
        let dir = std::env::temp_dir().join(format!("cllt-app-faults-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let to = dir.join("cllt-errors.json");
        let _ = std::fs::remove_file(&to);
        store.export_faults(&to, app_info()).unwrap();
        let file = std::fs::read_to_string(&to).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();
        for secret in ["proxy-secret", "proxy-user", "\"password\""] {
            assert!(!file.contains(secret), "{secret} in {file}");
        }
        let doc: serde_json::Value = serde_json::from_str(&file).unwrap();
        assert_eq!(doc["version"], env!("CARGO_PKG_VERSION"));
        let bot = &doc["faults"][0]["report"];
        assert_eq!(bot["packets"][0]["hex"], "0001");
        assert_eq!(bot["commands"][0][1], "Item(Use(8))");
        assert_eq!(bot["account"]["username"], "Wangpt");
        assert!(bot["account"].get("proxy").is_none());
        let lines: Vec<_> = bot["log"]
            .as_array()
            .unwrap()
            .iter()
            .map(|l| l["text"].as_str().unwrap())
            .collect();
        assert_eq!(lines, ["Đã vào game", text]);
        assert_eq!(doc["faults"][1]["text"], "mở trứng không được");
        assert_eq!(doc["faults"][4]["report"]["detail"], "at f (App.tsx:1)");
        // The line of the fault is red.
        assert_eq!(app.logs(id)[1].tone, crate::view::LogTone::Bad as u8);
    }

    #[test]
    fn log_lines_battles_and_pickups_go_to_cllt_db_by_username_and_come_back_at_the_next_start() {
        use crate::store::BattleFilter;
        use cllt_core::bot::{BattleRecord, BattleResult, BattleSource, Picked, PickupRecord};
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
        let pickup = PickupRecord {
            character: "manina".into(),
            at: 30_031,
            battle_at: battle.ended_at,
            map_name: battle.map_name.clone(),
            mob_name: battle.mob_name.clone(),
            source: battle.source,
            item: Picked::of(41, 230),
        };
        app.on_event(id, Event::Battle(Box::new(battle)));
        app.on_event(id, Event::Pickup(Box::new(pickup)));
        let filter = BattleFilter {
            username: "manina2",
            since: None,
            source: None,
        };
        let st = store.stats(filter).unwrap();
        assert_eq!((st.totals.won, st.picked[0].item.quantity), (1, 230));

        // The next start: the account, under any case, gets its lines back before its new ones.
        let mut again = App::new(None, PathBuf::from("accounts.json"), channel().0);
        again.set_store(store);
        let id = again.add(account("manina2"));
        again.load_history();
        again.on_event(id, Event::State(ConnState::Connecting));
        let texts: Vec<String> = again.logs(id).into_iter().map(|l| l.text).collect();
        // The item came with no line of its battle here, so it has a line of its own.
        assert_eq!(
            texts,
            [
                "Đã vào game",
                "Sang khu 4",
                "Đã nhặt Xu khóa ×230",
                "Đang kết nối…"
            ]
        );
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
    fn the_items_picked_up_after_a_won_battle_go_under_its_line_and_come_back_with_it() {
        use cllt_core::bot::{BattleRecord, BattleSource, Picked, PickupRecord};
        let store = Arc::new(Store::memory().unwrap());
        let mut app = App::new(None, PathBuf::from("accounts.json"), channel().0);
        app.set_store(store.clone());
        let id = app.add(account("manina2"));
        let battle = |result, ended_at| BattleRecord {
            character: "manina".into(),
            level: 22,
            started_at: ended_at - 40_000,
            ended_at,
            map_id: "M2".into(),
            map_name: "Trại Vân Sơn".into(),
            zone: 1,
            mob_id: "mob80".into(),
            mob_name: "Kẻ Quấy Phá".into(),
            mob_level: 20,
            boss: false,
            source: BattleSource::Fight,
            result,
            turns: 37,
            damage: 704,
            hp_before: 180,
            hp_after: 135,
            max_hp: 180,
            exp: 236,
            coin: 24,
        };
        let pickup = |battle_at, item_id, quantity| {
            Event::Pickup(Box::new(PickupRecord {
                character: "manina".into(),
                at: battle_at + 40,
                battle_at,
                map_name: "Trại Vân Sơn".into(),
                mob_name: "Kẻ Quấy Phá".into(),
                source: BattleSource::Fight,
                item: Picked::of(item_id, quantity),
            }))
        };
        let won = 1_793_400_000_000;
        app.on_event(id, Event::Battle(Box::new(battle(BattleResult::Won, won))));
        app.on_event(
            id,
            Event::Log(LogKind::Battle, "Trận 1: thắng, 37 lượt".into()),
        );
        app.take_update();
        for (item, qty) in [(413, 1), (41, 230), (413, 1)] {
            app.on_event(id, pickup(won, item, qty));
        }
        let items = |l: &LogLine| -> Vec<(i32, i64)> {
            l.picked.iter().map(|p| (p.item_id, p.quantity)).collect()
        };
        let lines = app.logs(id);
        assert_eq!(lines.len(), 1, "no line of their own");
        assert_eq!(items(&lines[0]), [(413, 2), (41, 230)]);
        // Sent to the UI again with each item.
        let sent = app.take_update().1;
        assert_eq!(sent.len(), 3);
        assert_eq!(
            (sent[2].line.seq, items(&sent[2].line)),
            (1, vec![(413, 2), (41, 230)])
        );
        // A lost battle takes nothing; an item whose battle line is not there gets a line of its own.
        app.on_event(
            id,
            Event::Battle(Box::new(battle(BattleResult::Lost, won + 60_000))),
        );
        app.on_event(id, Event::Log(LogKind::Battle, "Trận 2: thua".into()));
        app.on_event(id, pickup(won + 60_000, 3, 1));
        let texts: Vec<String> = app.logs(id).into_iter().map(|l| l.text).collect();
        assert_eq!(texts[1..], ["Trận 2: thua", "Đã nhặt Trứng Gà"]);
        assert!(app.logs(id)[1].picked.is_empty());

        // The next start: the line of the won battle comes back from cllt.db with its items.
        let mut again = App::new(None, PathBuf::from("accounts.json"), channel().0);
        again.set_store(store);
        let id = again.add(account("manina2"));
        again.load_history();
        let lines = again.logs(id);
        assert_eq!(items(&lines[0]), [(413, 2), (41, 230)]);
        assert!(lines[1..].iter().all(|l| l.picked.is_empty()));
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
        // So is the target chosen on each map, the last one of a map winning.
        for (map, target) in [
            ("M2", "Sói Xám"),
            ("M4", "Chim Điên"),
            ("M2", "Kẻ Quấy Phá"),
        ] {
            block_on(shared.set_fight_target(id, map.into(), target.into())).unwrap();
        }
        let targets = BTreeMap::from([
            ("M2".to_string(), "Kẻ Quấy Phá".to_string()),
            ("M4".to_string(), "Chim Điên".to_string()),
        ]);
        assert_eq!(accounts::load(&path).unwrap()[0].fight_targets, targets);

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
                saved.fight,
                &saved.fight_targets
            ),
            ("a2", "Nick chính", "x", repair, &targets)
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
    fn an_import_adds_new_accounts_and_replaces_only_when_asked_in_one_write() {
        let dir = std::env::temp_dir().join(format!("cllt-import-{}", std::process::id()));
        let path = dir.join("accounts.json");
        let shared = Shared::new(App::new(None, path.clone(), channel().0));
        let id = block_on(shared.add(Account {
            label: "Cũ".into(),
            ..account("a")
        }))
        .unwrap();
        let repair = FightSettings {
            repair: true,
            ..FightSettings::default()
        };
        let json = vec![
            Account {
                password: String::new(),
                fight: repair,
                ..account("A")
            },
            account("b"),
            Account {
                password: "y".into(),
                ..account("B")
            },
        ];

        // Without Ghi đè the account the list has stays as it was; "B" repeats "b" and counts once.
        let done = block_on(shared.import(json.clone(), false)).unwrap();
        assert_eq!((done.added, done.replaced, done.skipped), (1, 0, 2));
        let saved = accounts::load(&path).unwrap();
        assert_eq!(
            saved
                .iter()
                .map(|a| a.username.as_str())
                .collect::<Vec<_>>(),
            ["a", "b"]
        );
        assert_eq!(saved[1].password, "x");
        assert!(!saved[0].fight.repair);

        // With it, "a" takes the settings of the JSON but keeps its label and password, which the JSON left empty.
        let done = block_on(shared.import(json, true)).unwrap();
        assert_eq!((done.added, done.replaced, done.skipped), (0, 2, 1));
        let saved = accounts::load(&path).unwrap();
        assert_eq!(
            (
                saved[0].label.as_str(),
                saved[0].password.as_str(),
                saved[0].fight.repair
            ),
            ("Cũ", "x", true)
        );
        assert_eq!(shared.with(|app| app.entries.len()), 2);
        assert_eq!(shared.with(|app| app.find(&account("A"))), Some(id));
        assert_eq!(shared.with(|app| app.accounts_of(&[id]).len()), 1);

        // A file that did not read is never written over.
        shared.with(|app| app.load_error = Some("bad".into()));
        assert!(block_on(shared.import(vec![account("c")], false)).is_err());
        assert_eq!(shared.with(|app| app.entries.len()), 2);
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

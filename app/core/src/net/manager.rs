//! Quản lý phiên: one session per account on a shared tokio runtime.
use super::*;

/// One session per account on a shared tokio runtime. Accounts are keyed by an id the caller keeps stable (a list
/// index would shift when an account is removed); events come back tagged with it.
pub struct Manager {
    runtime: tokio::runtime::Runtime,
    atlas: Arc<Atlas>,
    sessions: std::collections::HashMap<u64, UnboundedSender<Command>>,
    emit: Arc<dyn Fn(u64, Event) + Send + Sync>,
    /// Where the sessions started from now on connect (set_server).
    server: Server,
    /// Lưu dữ liệu trận of every session (set_record).
    record: bool,
    /// Mã quà tặng of each username (lower case): the codes refused in a row and the server's lock, kept across its
    /// sessions so a new login does not forget them (BotOptions::gift).
    gifts: std::collections::HashMap<String, Arc<Mutex<GiftMemory>>>,
}
impl Manager {
    pub fn new(
        atlas: Atlas,
        emit: impl Fn(u64, Event) + Send + Sync + 'static,
    ) -> std::io::Result<Self> {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()?;
        Ok(Self {
            runtime,
            atlas: Arc::new(atlas),
            sessions: Default::default(),
            emit: Arc::new(emit),
            server: Server::default(),
            record: true,
            gifts: Default::default(),
        })
    }
    /// The game server of the logins from now on; the sessions running stay where they are.
    pub fn set_server(&mut self, server: Server) {
        self.server = server;
    }
    /// Lưu dữ liệu trận, for the sessions started from now on and those running (Command::Record).
    pub fn set_record(&mut self, on: bool) {
        if on == self.record {
            return;
        }
        self.record = on;
        for s in self.sessions.values() {
            let _ = s.send(Command::Record(on));
        }
    }
    pub fn running(&self, id: u64) -> bool {
        self.sessions.get(&id).is_some_and(|s| !s.is_closed())
    }
    /// Starts the session of `account` unless one runs already under `id`.
    pub fn login(&mut self, id: u64, account: Account) {
        if self.running(id) {
            return;
        }
        let (tx, rx) = unbounded_channel();
        self.sessions.insert(id, tx);
        let emit = self.emit.clone();
        let gift = self
            .gifts
            .entry(account.username.to_lowercase())
            .or_default()
            .clone();
        let emit: Arc<dyn Fn(Event) + Send + Sync> = Arc::new(move |e| emit(id, e));
        let session = self.runtime.spawn(run(
            self.server.clone(),
            self.record,
            account,
            self.atlas.clone(),
            gift,
            rx,
            emit.clone(),
        ));
        // A panic in a session (a bug of the app: bytes from the server that do not decode are errors, not panics) ends
        // that account alone, which goes to Lỗi saying so, where run() would have said how it ended. The release build
        // unwinds for this (app/Cargo.toml).
        self.runtime.spawn(async move {
            if let Err(e) = session.await {
                if e.is_panic() {
                    let what = panic_text(e.into_panic());
                    emit(Event::State(ConnState::Error(format!(
                        "Lỗi trong app: {what}"
                    ))));
                }
            }
        });
    }
    /// False when the account has no session.
    pub fn send(&self, id: u64, command: Command) -> bool {
        self.sessions
            .get(&id)
            .is_some_and(|s| s.send(command).is_ok())
    }
}

/// What a panic said, for the account it stopped.
fn panic_text(payload: Box<dyn std::any::Any + Send>) -> String {
    payload
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "không rõ".into())
}

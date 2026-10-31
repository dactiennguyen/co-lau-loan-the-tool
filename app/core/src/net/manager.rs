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
        self.runtime.spawn(run(
            self.server.clone(),
            self.record,
            account,
            self.atlas.clone(),
            rx,
            Arc::new(move |e| emit(id, e)),
        ));
    }
    /// False when the account has no session.
    pub fn send(&self, id: u64, command: Command) -> bool {
        self.sessions
            .get(&id)
            .is_some_and(|s| s.send(command).is_ok())
    }
}

//! Quản lý phiên: one session per account on a shared tokio runtime.
use super::*;

/// One session per account on a shared tokio runtime. Accounts are keyed by an id the caller keeps stable (a list
/// index would shift when an account is removed); events come back tagged with it.
pub struct Manager {
    runtime: tokio::runtime::Runtime,
    atlas: Arc<Atlas>,
    sessions: std::collections::HashMap<u64, UnboundedSender<Command>>,
    emit: Arc<dyn Fn(u64, Event) + Send + Sync>,
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
        })
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

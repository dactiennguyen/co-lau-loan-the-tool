//! One TCP session per account over tokio: the login of FLOW in src/client.ts, heartbeat c2s/1 every 2 s from the key
//! exchange on, then the Bot with its commands and timers. Manager runs one session per account on a shared runtime.
use crate::accounts::Account;
use crate::atlas::Atlas;
use crate::bot::{Bot, BotOptions, Out, Snapshot};
use crate::opcodes::{HOST, PORT};
use crate::protocol::{
    character_location, character_prefix, handshake, session_key, Protocol, Reader,
};
use crate::requests::{build, Ctx};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::time::{interval, sleep_until, timeout, Instant, MissedTickBehavior};

#[derive(Debug, Clone, PartialEq)]
pub enum Command {
    Fight {
        target: String,
        count: u32,
        max_losses: u32,
    },
    Stop,
    Logout,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ConnState {
    Offline,
    Connecting,
    Online,
    Error(String),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    State(ConnState),
    Snapshot(Box<Snapshot>),
    Log(String),
}

type Emit = Arc<dyn Fn(Event) + Send + Sync>;
type Error = String;
const STEP: Duration = Duration::from_secs(8);

/// Runs the session of `account` until Logout, the server closing, or an error; reports through `emit`.
pub async fn run(
    account: Account,
    atlas: Arc<Atlas>,
    mut commands: UnboundedReceiver<Command>,
    emit: Emit,
) {
    emit(Event::State(ConnState::Connecting));
    let state = match session(&account, atlas, &mut commands, &emit).await {
        Ok(()) => ConnState::Offline,
        Err(e) => ConnState::Error(e),
    };
    emit(Event::State(state));
}

/// Login states of FLOW (src/client.ts): each sends one request and waits for its answers.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Step {
    Key,
    Version,
    Notice,
    Gate,
    Challenge,
    Auth,
    Character,
    Skills,
    Profile,
    Location,
    Map,
    Entities,
    Ready,
}

async fn session(
    account: &Account,
    atlas: Arc<Atlas>,
    commands: &mut UnboundedReceiver<Command>,
    emit: &Emit,
) -> Result<(), Error> {
    let mut stream = timeout(STEP, TcpStream::connect((HOST, PORT)))
        .await
        .map_err(|_| "Hết giờ kết nối".to_string())?
        .map_err(|e| e.to_string())?;
    stream.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut seed = [0u8; 4];
    timeout(STEP, stream.read_exact(&mut seed))
        .await
        .map_err(|_| "Server không gửi seed".to_string())?
        .map_err(|e| e.to_string())?;
    stream
        .write_all(&handshake(i32::from_be_bytes(seed)))
        .await
        .map_err(|e| e.to_string())?;

    let mut proto = Protocol::default();
    let options = BotOptions {
        skill: account.skill,
        ..BotOptions::default()
    };
    let mut bot = Bot::new(options, atlas);
    let (mut step, mut deadline) = (Step::Key, Instant::now() + STEP);
    let (mut have_list, mut have_flag, mut entities, mut snapshot) = (false, false, false, false);
    let (mut name, mut map_id) = (String::new(), String::new());
    let mut heartbeat = interval(Duration::from_secs(2));
    heartbeat.set_missed_tick_behavior(MissedTickBehavior::Delay);
    let mut buf = vec![0u8; 65536];
    let mut out: Vec<Out> = vec![];
    let mut last = Snapshot::default();

    macro_rules! send {
        ($op:expr, $ctx:expr) => {{
            let frame = proto
                .encode($op, &build($op, &$ctx).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            stream.write_all(&frame).await.map_err(|e| e.to_string())?;
        }};
    }
    send!(-1, Ctx::default());

    loop {
        let wake = bot.deadline().map(Instant::from_std);
        tokio::select! {
            n = stream.read(&mut buf) => {
                let n = n.map_err(|e| e.to_string())?;
                if n == 0 {
                    return Err(if step == Step::Ready { "Server đã đóng kết nối".into() } else { format!("Server đóng kết nối lúc đăng nhập ({step:?})") });
                }
                proto.push(&buf[..n]);
                while let Some(p) = proto.next_packet().map_err(|e| e.to_string())? {
                    let Some(op) = p.opcode else { continue };
                    let now = std::time::Instant::now();
                    if let Err(e) = bot.on_packet(op, &p.payload, now, &mut out) {
                        out.push(Out::Log(format!("Không đọc được s2c/{op}: {e}")));
                    }
                    if op == 0 && step != Step::Ready {
                        let mut r = Reader::new(&p.payload);
                        let text = r.u8().and_then(|_| r.string()).unwrap_or_default();
                        return Err(format!("Server từ chối: {text}"));
                    }
                    let before = step;
                    match (step, op) {
                        (Step::Key, -1) => {
                            proto.enable_key(session_key(&p.payload).map_err(|e| e.to_string())?);
                            heartbeat.reset();
                            send!(1206, Ctx::default());
                            step = Step::Version;
                        }
                        (Step::Version, 1207 | 1209) => {
                            if op == 1207 { have_list = true } else { have_flag = true }
                            if have_list && have_flag {
                                send!(5, Ctx { server_id: Some(account.server_id), ..Ctx::default() });
                                step = Step::Notice;
                            }
                        }
                        (Step::Notice, 5) => { send!(2, Ctx::default()); step = Step::Gate; }
                        (Step::Gate, 2) => {
                            if !Reader::new(&p.payload).string().map_err(|e| e.to_string())?.is_empty() {
                                return Err("Cổng đăng nhập không rỗng (nhánh chưa điều tra)".into());
                            }
                            send!(3, Ctx::default());
                            step = Step::Challenge;
                        }
                        (Step::Challenge, 3) => {
                            let challenge = Reader::new(&p.payload).bytes().map_err(|e| e.to_string())?.to_vec();
                            send!(4, Ctx { username: Some(&account.username), password: Some(&account.password), challenge: Some(&challenge), server_id: Some(account.server_id), ..Ctx::default() });
                            step = Step::Auth;
                        }
                        (Step::Auth, 4) => {
                            if !p.payload.is_empty() {
                                return Err("Xác thực trả về nhánh chưa điều tra".into());
                            }
                            send!(9, Ctx { username: Some(&account.username), ..Ctx::default() });
                            step = Step::Character;
                        }
                        (Step::Character, 9) => {
                            name = character_prefix(&p.payload).map_err(|e| e.to_string())?.name;
                            send!(30, Ctx::default());
                            step = Step::Skills;
                        }
                        (Step::Skills, 30) => { send!(42, Ctx { character_name: Some(&name), ..Ctx::default() }); step = Step::Profile; }
                        (Step::Profile, 42) => { send!(29, Ctx { character_name: Some(&name), ..Ctx::default() }); step = Step::Location; }
                        (Step::Location, 29) => {
                            map_id = character_location(&p.payload).map_err(|e| e.to_string())?.map_id;
                            send!(11, Ctx { map_id: Some(&map_id), ..Ctx::default() });
                            step = Step::Map;
                        }
                        (Step::Map, 11) => { send!(43, Ctx { map_id: Some(&map_id), ..Ctx::default() }); step = Step::Entities; }
                        (Step::Entities, 43 | 1263) => {
                            if op == 43 { entities = true } else { snapshot = true }
                            if entities && snapshot {
                                step = Step::Ready;
                                emit(Event::State(ConnState::Online));
                            }
                        }
                        _ => {}
                    }
                    if step != before {
                        deadline = Instant::now() + STEP;
                    }
                }
            }
            _ = heartbeat.tick(), if step != Step::Key => send!(1, Ctx::default()),
            cmd = commands.recv(), if step == Step::Ready => {
                let now = std::time::Instant::now();
                match cmd {
                    None | Some(Command::Logout) => return Ok(()),
                    Some(Command::Fight { target, count, max_losses }) => bot.fight(&target, count, max_losses, now, &mut out),
                    Some(Command::Stop) => bot.stop(&mut out),
                }
            }
            _ = sleep_until(wake.unwrap_or_else(Instant::now)), if wake.is_some() => bot.on_timer(std::time::Instant::now(), &mut out),
            _ = sleep_until(deadline), if step != Step::Ready => return Err(format!("Hết giờ chờ server ở bước {step:?}")),
        }
        for o in out.drain(..) {
            match o {
                Out::Send(op, payload) => {
                    let frame = proto.encode(op, &payload).map_err(|e| e.to_string())?;
                    stream.write_all(&frame).await.map_err(|e| e.to_string())?;
                }
                Out::Log(text) => emit(Event::Log(text)),
            }
        }
        let snap = bot.snapshot();
        if snap != last {
            emit(Event::Snapshot(Box::new(snap.clone())));
            last = snap;
        }
    }
}

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

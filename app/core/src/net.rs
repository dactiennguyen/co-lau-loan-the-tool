//! One TCP session per account over tokio: the login of FLOW in src/client.ts, heartbeat c2s/1 every 2 s from the key
//! exchange on, then the Bot with its commands and timers. Manager runs one session per account on a shared runtime.
use crate::accounts::Account;
use crate::atlas::Atlas;
use crate::bot::{Bot, BotOptions, Out, Snapshot};
use crate::opcodes::{HOST, PORT};
use crate::potentials::StatPlan;
use crate::protocol::{
    character_location, character_prefix, handshake, map_prefix, session_key, Protocol, Reader,
};
use crate::requests::{build, Ctx};
use crate::world::map_entities;
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
    /// "Tự làm nhiệm vụ" on the current main quest; with `step` = (quest id, step index), ▶ on that step: only it, which
    /// must be the current one of that quest.
    Quest {
        max_losses: u32,
        step: Option<(i32, i32)>,
    },
    /// Ends the job or quest run; `surrender` also leaves a battle in progress (Bot::stop), else it is played out.
    Stop {
        surrender: bool,
    },
    /// How potential points are spent on their own, None for not at all (Bot::set_stats).
    Stats(Option<StatPlan>),
    /// "Cộng +1" on the potential of that c2s/10 index (Bot::add_stat).
    AddStat(usize),
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
    commands: UnboundedReceiver<Command>,
    emit: Emit,
) {
    run_at(HOST.into(), PORT, account, atlas, commands, emit).await
}

/// `run` against the server at `host`:`port` (the tests run a local one).
async fn run_at(
    host: String,
    port: u16,
    account: Account,
    atlas: Arc<Atlas>,
    mut commands: UnboundedReceiver<Command>,
    emit: Emit,
) {
    emit(Event::State(ConnState::Connecting));
    let state = match session((&host, port), &account, atlas, &mut commands, &emit).await {
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

/// Resolves on Logout, or when the app drops the session. Jobs wait for the game, so the ones sent before are dropped.
async fn logged_out(commands: &mut UnboundedReceiver<Command>, emit: &Emit) {
    loop {
        match commands.recv().await {
            None | Some(Command::Logout) => return,
            Some(_) => emit(Event::Log(NOT_READY.into())),
        }
    }
}
const NOT_READY: &str = "Nick chưa vào game xong";

/// A login answer that does not read: the session stops there rather than go on with a map or mobs it does not know.
fn unread(op: i32, e: impl std::fmt::Display) -> Error {
    format!("Không đọc được s2c/{op} lúc đăng nhập: {e}")
}

async fn session(
    server: (&str, u16),
    account: &Account,
    atlas: Arc<Atlas>,
    commands: &mut UnboundedReceiver<Command>,
    emit: &Emit,
) -> Result<(), Error> {
    // Logout works at every step: the connect and the seed wait end on it too, as the login steps below do.
    let mut stream = tokio::select! {
        r = timeout(STEP, TcpStream::connect(server)) => r
            .map_err(|_| "Hết giờ kết nối".to_string())?
            .map_err(|e| e.to_string())?,
        () = logged_out(commands, emit) => return Ok(()),
    };
    stream.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut seed = [0u8; 4];
    tokio::select! {
        r = timeout(STEP, stream.read_exact(&mut seed)) => r
            .map_err(|_| "Server không gửi seed".to_string())?
            .map_err(|e| e.to_string())?,
        () = logged_out(commands, emit) => return Ok(()),
    };
    stream
        .write_all(&handshake(i32::from_be_bytes(seed)))
        .await
        .map_err(|e| e.to_string())?;

    let mut proto = Protocol::default();
    let options = BotOptions {
        skill: account.skill,
        stats: account.stats,
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
                            proto.enable_key(session_key(&p.payload).map_err(|e| unread(op, e))?);
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
                            if !Reader::new(&p.payload).string().map_err(|e| unread(op, e))?.is_empty() {
                                return Err("Cổng đăng nhập không rỗng (nhánh chưa điều tra)".into());
                            }
                            send!(3, Ctx::default());
                            step = Step::Challenge;
                        }
                        (Step::Challenge, 3) => {
                            let challenge = Reader::new(&p.payload).bytes().map_err(|e| unread(op, e))?.to_vec();
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
                            name = character_prefix(&p.payload).map_err(|e| unread(op, e))?.name;
                            send!(30, Ctx::default());
                            step = Step::Skills;
                        }
                        (Step::Skills, 30) => { send!(42, Ctx { character_name: Some(&name), ..Ctx::default() }); step = Step::Profile; }
                        (Step::Profile, 42) => { send!(29, Ctx { character_name: Some(&name), ..Ctx::default() }); step = Step::Location; }
                        (Step::Location, 29) => {
                            map_id = character_location(&p.payload).map_err(|e| unread(op, e))?.map_id;
                            send!(11, Ctx { map_id: Some(&map_id), ..Ctx::default() });
                            step = Step::Map;
                        }
                        // The map and its mobs must read, as in src/client.ts: the bot moves and fights from them.
                        (Step::Map, 11) => {
                            map_prefix(&p.payload).map_err(|e| unread(op, e))?;
                            send!(43, Ctx { map_id: Some(&map_id), ..Ctx::default() });
                            step = Step::Entities;
                        }
                        (Step::Entities, 43 | 1263) => {
                            // s2c/1263 only lists the other players: one record this decoder does not know leaves them
                            // unknown (Snapshot::players_unread) instead of stopping the login, as in src/client.ts.
                            if op == 43 {
                                map_entities(&p.payload).map_err(|e| unread(op, e))?;
                                entities = true;
                            } else {
                                snapshot = true;
                            }
                            if entities && snapshot {
                                step = Step::Ready;
                                emit(Event::State(ConnState::Online));
                                bot.on_ready(std::time::Instant::now(), &mut out);
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
            cmd = commands.recv() => {
                let now = std::time::Instant::now();
                match cmd {
                    None | Some(Command::Logout) => return Ok(()),
                    Some(_) if step != Step::Ready => out.push(Out::Log(NOT_READY.into())),
                    Some(Command::Fight { target, count, max_losses }) => bot.fight(&target, count, max_losses, now, &mut out),
                    Some(Command::Quest { max_losses, step }) => bot.quest(max_losses, step, now, &mut out),
                    Some(Command::Stop { surrender }) => bot.stop(surrender, now, &mut out),
                    Some(Command::Stats(plan)) => bot.set_stats(plan, now, &mut out),
                    Some(Command::AddStat(stat)) => bot.add_stat(stat, &mut out),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{opcode_of, wire_opcode, Writer, XorStream};
    use std::sync::Mutex;
    use tokio::net::TcpListener;
    use tokio::task::JoinHandle;

    /// What the local server gets wrong.
    #[derive(Clone, Copy, PartialEq)]
    enum Fault {
        None,
        /// s2c/11, s2c/43, s2c/1263 that do not read.
        Map,
        Mobs,
        Players,
        /// Accepts the connection and never sends the seed.
        NoSeed,
        /// Never answers c2s/11.
        StallMap,
    }

    /// Made-up answers to each login request, enough for the parsers of FLOW.
    fn answers(op: i32, fault: Fault) -> Vec<(i32, Vec<u8>)> {
        let w = Writer::new;
        let map = w()
            .u8(1)
            .string("M1")
            .string("Làng Thanh Khê")
            .u8(0)
            .i32(64)
            .i32(320)
            .build();
        let mobs = w()
            .string("M1")
            .u8(3)
            .string("mob1")
            .string("Heo Mọi")
            .i32(7)
            .u8(0)
            .i32(6)
            .i32(1)
            .u8(0);
        match op {
            1206 => vec![(1207, w().string("").build()), (1209, w().u8(1).build())],
            5 => vec![(5, w().u8(1).string("").build())],
            2 => vec![(2, w().string("").build())],
            3 => vec![(3, w().bytes(&[0x10, 0x0c, 0, 1]).build())],
            4 => vec![(4, vec![])],
            9 => {
                let c = w()
                    .u8(1)
                    .u8(1)
                    .string("manina")
                    .i32(7)
                    .string("manina")
                    .u8(0)
                    .u8(0);
                vec![(9, c.i32(21).i32(132).i32(180).build())]
            }
            30 => vec![(30, w().i32(0).i32(0).string("").build())],
            42 => vec![(42, w().string("").build())],
            29 => vec![(29, w().string("manina").string("M1").i32(0).build())],
            11 if fault == Fault::StallMap => vec![],
            11 => vec![(11, if fault == Fault::Map { vec![1] } else { map })],
            43 => vec![
                (
                    43,
                    if fault == Fault::Mobs {
                        w().string("M1").u8(3).i32(5).build()
                    } else {
                        mobs.build()
                    },
                ),
                (
                    1263,
                    if fault == Fault::Players {
                        vec![0, 1, 0xff]
                    } else {
                        vec![0, 0]
                    },
                ),
            ],
            _ => vec![],
        }
    }

    /// A local server playing the login of FLOW with `answers`; returns its port.
    async fn server(fault: Fault) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let (mut s, _) = listener.accept().await.unwrap();
            if fault == Fault::NoSeed {
                return std::future::pending().await;
            }
            let seed = 0x0102_0304;
            s.write_all(&i32::to_be_bytes(seed)).await.unwrap();
            let mut hello = [0u8; 21];
            s.read_exact(&mut hello).await.unwrap();
            assert_eq!(hello.to_vec(), handshake(seed));
            let key_body: Vec<u8> = std::iter::once(16).chain(1..=16).collect();
            let key = session_key(&key_body).unwrap();
            let (mut rx, mut tx, mut keyed) = (XorStream::new(key), XorStream::new(key), false);
            loop {
                // Client frame: i32 length, 1, "PT01", i32 payload length, then the opcode and payload (XORed).
                let mut len = [0u8; 4];
                if s.read_exact(&mut len).await.is_err() {
                    return;
                }
                let mut frame = vec![0u8; i32::from_be_bytes(len) as usize];
                if s.read_exact(&mut frame).await.is_err() {
                    return;
                }
                let mut body = frame.split_off(9);
                if keyed {
                    rx.apply(&mut body);
                }
                let op = opcode_of(i32::from_be_bytes(body[..4].try_into().unwrap())).unwrap();
                let replies = if op == -1 {
                    vec![(-1, key_body.clone())]
                } else {
                    answers(op, fault)
                };
                for (op, payload) in replies {
                    // Server frame: 14-byte header with the length at 2 and the opcode bytes at 10, 6, 12, 8.
                    let mut f = vec![0u8; 14];
                    f[2..6].copy_from_slice(&((14 + payload.len()) as i32).to_be_bytes());
                    let e = wire_opcode(op).unwrap().to_be_bytes();
                    for (i, at) in [10, 6, 12, 8].into_iter().enumerate() {
                        f[at] = e[i];
                    }
                    f.extend_from_slice(&payload);
                    if keyed {
                        tx.apply(&mut f[6..]);
                    }
                    s.write_all(&f).await.unwrap();
                }
                keyed |= op == -1;
            }
        });
        port
    }

    type Events = Arc<Mutex<Vec<Event>>>;

    /// A session against `server(fault)`: what it reports, its commands, and its task.
    async fn login(fault: Fault) -> (Events, UnboundedSender<Command>, JoinHandle<()>) {
        let port = server(fault).await;
        let events: Events = Default::default();
        let sink = events.clone();
        let (tx, rx) = unbounded_channel();
        let account = Account {
            label: String::new(),
            username: "probe_user".into(),
            password: "abc".into(),
            server_id: 24,
            skill: None,
            stats: None,
        };
        let emit: Emit = Arc::new(move |e| sink.lock().unwrap().push(e));
        let task = tokio::spawn(run_at(
            "127.0.0.1".into(),
            port,
            account,
            Default::default(),
            rx,
            emit,
        ));
        (events, tx, task)
    }

    fn states(events: &Events) -> Vec<ConnState> {
        let events = events.lock().unwrap();
        events
            .iter()
            .filter_map(|e| match e {
                Event::State(s) => Some(s.clone()),
                _ => None,
            })
            .collect()
    }
    fn last_snapshot(events: &Events) -> Snapshot {
        let events = events.lock().unwrap();
        events
            .iter()
            .rev()
            .find_map(|e| match e {
                Event::Snapshot(s) => Some((**s).clone()),
                _ => None,
            })
            .unwrap_or_default()
    }
    fn logs(events: &Events) -> Vec<String> {
        let events = events.lock().unwrap();
        events
            .iter()
            .filter_map(|e| match e {
                Event::Log(t) => Some(t.clone()),
                _ => None,
            })
            .collect()
    }
    async fn online(events: &Events) {
        let wait = async {
            while !states(events).contains(&ConnState::Online) {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        };
        timeout(Duration::from_secs(5), wait)
            .await
            .unwrap_or_else(|_| panic!("not online: {:?}", states(events)));
    }
    /// Well under STEP: the session ended on its own, not on a step timeout.
    async fn ends(task: JoinHandle<()>) {
        timeout(Duration::from_secs(2), task)
            .await
            .expect("the session did not end")
            .unwrap();
    }

    #[tokio::test]
    async fn a_login_whose_answers_read_goes_online() {
        let (events, tx, task) = login(Fault::None).await;
        online(&events).await;
        assert!(!last_snapshot(&events).players_unread);
        tx.send(Command::Logout).unwrap();
        ends(task).await;
        assert_eq!(
            states(&events),
            [ConnState::Connecting, ConnState::Online, ConnState::Offline]
        );
    }

    #[tokio::test]
    async fn a_map_or_mobs_that_do_not_read_stop_the_login() {
        for (fault, op) in [(Fault::Map, "s2c/11"), (Fault::Mobs, "s2c/43")] {
            let (events, _tx, task) = login(fault).await;
            ends(task).await;
            let states = states(&events);
            assert_eq!(states.len(), 2, "{states:?}");
            assert!(
                matches!(&states[1], ConnState::Error(m) if m.contains(op)),
                "{states:?}"
            );
        }
    }

    #[tokio::test]
    async fn players_that_do_not_read_leave_the_login_online_with_them_unknown() {
        let (events, tx, task) = login(Fault::Players).await;
        online(&events).await;
        assert!(last_snapshot(&events).players_unread);
        assert!(
            logs(&events).iter().any(|l| l.contains("s2c/1263")),
            "{:?}",
            logs(&events)
        );
        tx.send(Command::Logout).unwrap();
        ends(task).await;
    }

    #[tokio::test]
    async fn logout_ends_a_session_waiting_for_the_seed() {
        let (events, tx, task) = login(Fault::NoSeed).await;
        tokio::time::sleep(Duration::from_millis(200)).await;
        tx.send(Command::Logout).unwrap();
        ends(task).await;
        assert_eq!(states(&events), [ConnState::Connecting, ConnState::Offline]);
    }

    #[tokio::test]
    async fn logout_ends_a_session_stuck_in_the_login() {
        let (events, tx, task) = login(Fault::StallMap).await;
        tokio::time::sleep(Duration::from_millis(300)).await;
        tx.send(Command::Quest {
            max_losses: 1,
            step: None,
        })
        .unwrap();
        tx.send(Command::Logout).unwrap();
        ends(task).await;
        assert_eq!(states(&events), [ConnState::Connecting, ConnState::Offline]);
        assert!(logs(&events).contains(&NOT_READY.to_string()));
    }
}

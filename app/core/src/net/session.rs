//! Đăng nhập and the session of one account: the login steps of FLOW (src/net/client.ts), then the Bot with its
//! packets, commands, timers and the heartbeat until Logout or the end of the connection.
use super::connect::connect;
use super::*;

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
pub(super) async fn run_at(
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

/// Login states of FLOW (src/net/client.ts): each sends one request and waits for its answers.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) enum Step {
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
pub(super) async fn logged_out(commands: &mut UnboundedReceiver<Command>, emit: &Emit) {
    loop {
        match commands.recv().await {
            None | Some(Command::Logout) => return,
            Some(_) => emit(Event::Log(LogKind::Connection, NOT_READY.into())),
        }
    }
}
pub(super) const NOT_READY: &str = "Nick chưa vào game xong";

/// A login answer that does not read: the session stops there rather than go on with a map or mobs it does not know.
pub(super) fn unread(op: i32, e: impl std::fmt::Display) -> Error {
    format!("Không đọc được s2c/{op} lúc đăng nhập: {e}")
}

pub(super) async fn session(
    server: (&str, u16),
    account: &Account,
    atlas: Arc<Atlas>,
    commands: &mut UnboundedReceiver<Command>,
    emit: &Emit,
) -> Result<(), Error> {
    // Logout works at every step: the connect and the seed wait end on it too, as the login steps below do.
    let proxy = account.proxy.as_ref().filter(|p| p.enabled);
    let (mut stream, early) = tokio::select! {
        r = connect(server, proxy, emit) => r?,
        () = logged_out(commands, emit) => return Ok(()),
    };
    // A proxy may pass on the start of the seed with its last reply.
    let mut seed = [0u8; 4];
    let have = early.len().min(4);
    seed[..have].copy_from_slice(&early[..have]);
    tokio::select! {
        r = timeout(STEP, stream.read_exact(&mut seed[have..])) => r
            .map_err(|_| "Server không gửi seed".to_string())?
            .map_err(|e| e.to_string())?,
        () = logged_out(commands, emit) => return Ok(()),
    };
    stream
        .write_all(&handshake(i32::from_be_bytes(seed)))
        .await
        .map_err(|e| e.to_string())?;

    let mut proto = Protocol::default();
    proto.push(&early[have..]);
    let options = BotOptions {
        skill: account.skill,
        stats: account.stats,
        fight: account.fight,
        ..BotOptions::default()
    };
    let mut bot = Bot::new(options, atlas);
    let (mut step, mut deadline) = (Step::Key, Instant::now() + STEP);
    let (mut have_list, mut have_flag, mut entities, mut snapshot) = (false, false, false, false);
    // Set by s2c/43 while no s2c/1263 has come: the login goes on without it at that time.
    let mut players_wait: Option<Instant> = None;
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
    macro_rules! online {
        () => {{
            step = Step::Ready;
            emit(Event::State(ConnState::Online));
            bot.on_ready(std::time::Instant::now(), &mut out);
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
                        out.push(Out::Log(LogKind::Server, format!("Không đọc được s2c/{op}: {e}")));
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
                            let c = character_prefix(&p.payload).map_err(|e| unread(op, e))?;
                            name = c.name;
                            send!(30, Ctx { element: Some(c.field01 as i32), ..Ctx::default() });
                            step = Step::Skills;
                        }
                        (Step::Skills, 30) => { send!(42, Ctx { character_name: Some(&name), ..Ctx::default() }); step = Step::Profile; }
                        (Step::Profile, 42) => { send!(29, Ctx { character_name: Some(&name), ..Ctx::default() }); step = Step::Location; }
                        (Step::Location, 29) => {
                            map_id = character_location(&p.payload).map_err(|e| unread(op, e))?.map_id;
                            send!(11, Ctx { map_id: Some(&map_id), ..Ctx::default() });
                            step = Step::Map;
                        }
                        // The map and its mobs must read, as in src/net/client.ts: the bot moves and fights from them.
                        (Step::Map, 11) => {
                            map_prefix(&p.payload).map_err(|e| unread(op, e))?;
                            send!(43, Ctx { map_id: Some(&map_id), ..Ctx::default() });
                            step = Step::Entities;
                        }
                        (Step::Entities, 43 | 1263) => {
                            // s2c/1263 only lists the other players: one record this decoder does not know leaves them
                            // unknown (Snapshot::players_unread) instead of stopping the login, as in src/net/client.ts.
                            if op == 43 {
                                map_entities(&p.payload).map_err(|e| unread(op, e))?;
                                entities = true;
                                if !snapshot {
                                    players_wait.get_or_insert(Instant::now() + PLAYERS_WAIT);
                                }
                            } else {
                                snapshot = true;
                            }
                            if entities && snapshot {
                                online!();
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
                    Some(_) if step != Step::Ready => out.push(Out::Log(LogKind::Connection, NOT_READY.into())),
                    Some(Command::Fight { target, count, max_losses }) => bot.fight(&target, count, max_losses, now, &mut out),
                    Some(Command::Quest { max_losses, step }) => bot.quest(max_losses, step, now, &mut out),
                    Some(Command::Stop { surrender }) => bot.stop(surrender, now, &mut out),
                    Some(Command::Stats(plan)) => bot.set_stats(plan, now, &mut out),
                    Some(Command::FightSettings(settings)) => bot.set_fight(settings, &mut out),
                    Some(Command::LossesLeft(left)) => bot.set_losses_left(left, &mut out),
                    Some(Command::AddStat(stat)) => bot.add_stat(stat, &mut out),
                    Some(Command::UpgradeSkill(id)) => bot.upgrade_skill(id, now, &mut out),
                    Some(Command::Item(act)) => bot.item(act, now, &mut out),
                    Some(Command::ListZones) => bot.list_zones(&mut out),
                    Some(Command::ChangeZone(zone)) => bot.change_zone(zone, now, &mut out),
                    Some(Command::GoTo(map_id)) => bot.go_to(&map_id, now, &mut out),
                    Some(Command::OpenShop) => bot.open_shop(now, &mut out),
                    Some(Command::Buy { shop_id, quantity }) => bot.buy(shop_id, quantity, now, &mut out),
                }
            }
            _ = sleep_until(wake.unwrap_or_else(Instant::now)), if wake.is_some() => bot.on_timer(std::time::Instant::now(), &mut out),
            // Alone in the zone, the server sends no s2c/1263 at all.
            _ = sleep_until(players_wait.unwrap_or_else(Instant::now)), if players_wait.is_some() && step == Step::Entities => {
                out.push(Out::Log(LogKind::Connection, "Không có người chơi nào khác trong khu (server không gửi s2c/1263)".into()));
                online!();
            }
            _ = sleep_until(deadline), if step != Step::Ready => return Err(format!("Hết giờ chờ server ở bước {step:?}")),
        }
        for o in out.drain(..) {
            match o {
                Out::Send(op, payload) => {
                    let frame = proto.encode(op, &payload).map_err(|e| e.to_string())?;
                    stream.write_all(&frame).await.map_err(|e| e.to_string())?;
                }
                Out::Log(kind, text) => emit(Event::Log(kind, text)),
                Out::Battle(record) => emit(Event::Battle(record)),
                Out::Pickup(record) => emit(Event::Pickup(record)),
            }
        }
        let snap = bot.snapshot();
        if snap != last {
            emit(Event::Snapshot(Box::new(snap.clone())));
            last = snap;
        }
    }
}

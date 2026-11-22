//! Đăng nhập and the session of one account: the login steps of FLOW (src/net/client.ts), then the Bot with its
//! packets, commands, timers and the heartbeat until Logout or the end of the connection.
use super::connect::connect;
use super::trace::Trace;
use super::*;

/// Runs the session of `account` on `server` until Logout, the server closing, or an error; reports through `emit`.
/// `record` is Lưu dữ liệu trận (BotOptions::record); `gift` the account's GiftMemory, which outlives the session
/// (BotOptions::gift).
pub async fn run(
    server: Server,
    record: bool,
    account: Account,
    atlas: Arc<Atlas>,
    gift: Arc<Mutex<GiftMemory>>,
    mut commands: UnboundedReceiver<Command>,
    emit: Emit,
) {
    emit(Event::State(ConnState::Connecting));
    let mut trace = Trace::default();
    let (mut out, mut in_game) = (vec![], false);
    let ended = session(
        server.addr(),
        record,
        &account,
        atlas,
        gift,
        &mut commands,
        &emit,
        &mut trace,
        &mut out,
        &mut in_game,
    )
    .await;
    // What the bot said in the game before an error ended the session (a packet later in the same read that did not
    // decode, a send that failed): its log lines and records still reach the app, before the state; its sends cannot.
    // During the login the error itself says what went wrong.
    if in_game {
        for o in out.drain(..) {
            deliver(o, &emit, &mut trace);
        }
    }
    // Log lỗi: an error of the session, not the server saying no to the login ("Vui lòng chờ 8 giây", the account
    // playing elsewhere), with the packets before it.
    let fault = ended
        .as_ref()
        .err()
        .filter(|e| !e.starts_with(REFUSED))
        .map(|e| trace.ended(&format!("Lỗi: {e}")));
    emit(Event::State(match ended {
        Ok(()) => ConnState::Offline,
        Err(e) => ConnState::Error(e),
    }));
    if let Some(f) = fault {
        emit(Event::Fault(Box::new(f)));
    }
}
/// How the session's error starts when the server refused the login (s2c/0 before the game).
const REFUSED: &str = "Server từ chối";

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

/// Resolves on Logout, or when the app drops the session. Jobs wait for the game, so the ones sent before are dropped;
/// Lưu dữ liệu trận changed meanwhile goes to `record`, for the Bot to come (Manager::set_record sends it only once).
pub(super) async fn logged_out(
    commands: &mut UnboundedReceiver<Command>,
    emit: &Emit,
    record: &mut bool,
) {
    loop {
        match commands.recv().await {
            None | Some(Command::Logout) => return,
            Some(Command::Record(on)) => *record = on,
            // Nothing went in or out yet.
            Some(Command::Report(note)) => emit(Event::Fault(Box::new(super::Fault::note(&note)))),
            Some(_) => emit(Event::Log(LogKind::Connection, NOT_READY.into())),
        }
    }
}
pub(super) const NOT_READY: &str = "Nick chưa vào game xong";

/// A login answer that does not read: the session stops there rather than go on with a map or mobs it does not know.
pub(super) fn unread(op: i32, e: impl std::fmt::Display) -> Error {
    format!("Không đọc được s2c/{op} lúc đăng nhập: {e}")
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn session(
    server: (&str, u16),
    record: bool,
    account: &Account,
    atlas: Arc<Atlas>,
    gift: Arc<Mutex<GiftMemory>>,
    commands: &mut UnboundedReceiver<Command>,
    emit: &Emit,
    trace: &mut Trace,
    out: &mut Vec<Out>,
    in_game: &mut bool,
) -> Result<(), Error> {
    // Logout works at every step: the connect and the seed wait end on it too, as the login steps below do.
    let proxy = account.proxy.as_ref().filter(|p| p.enabled);
    let mut record = record;
    let (mut stream, early) = tokio::select! {
        r = connect(server, proxy, emit) => r?,
        () = logged_out(commands, emit, &mut record) => return Ok(()),
    };
    // A proxy may pass on the start of the seed with its last reply.
    let mut seed = [0u8; 4];
    let have = early.len().min(4);
    seed[..have].copy_from_slice(&early[..have]);
    tokio::select! {
        r = timeout(STEP, stream.read_exact(&mut seed[have..])) => r
            .map_err(|_| "Server không gửi seed".to_string())?
            .map_err(|e| e.to_string())?,
        () = logged_out(commands, emit, &mut record) => return Ok(()),
    };
    stream
        .write_all(&handshake(i32::from_be_bytes(seed)))
        .await
        .map_err(|e| e.to_string())?;

    let mut proto = Protocol::default();
    proto.push(&early[have..]);
    let options = BotOptions {
        algorithm: account.algorithm,
        skill: account.skill,
        stats: account.stats,
        fight: account.fight,
        record,
        gift,
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
    let mut last = Snapshot::default();
    // When the server last sent anything. It answers each c2s/1 of the heartbeat: in the game, SILENT without a byte is a
    // connection gone (a NAT that forgot it, a network switch) that would otherwise look online for minutes.
    let mut heard = Instant::now();

    macro_rules! send {
        ($op:expr, $ctx:expr) => {{
            let payload = build($op, &$ctx).map_err(|e| e.to_string())?;
            trace.packet(true, $op, &payload);
            let frame = proto.encode($op, &payload).map_err(|e| e.to_string())?;
            write(&mut stream, &frame).await?;
        }};
    }
    macro_rules! online {
        () => {{
            step = Step::Ready;
            *in_game = true;
            emit(Event::State(ConnState::Online));
            bot.on_ready(std::time::Instant::now(), out);
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
                heard = Instant::now();
                proto.push(&buf[..n]);
                while let Some(p) = proto.next_packet().map_err(|e| e.to_string())? {
                    let Some(op) = p.opcode else { continue };
                    trace.packet(false, op, &p.payload);
                    let now = std::time::Instant::now();
                    if let Err(e) = bot.on_packet(op, &p.payload, now, out) {
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
                            // As the game does (VG1 20/11, game 1.1.1 22/11): c2s/1282, the state of the phone
                            // (adb, developer options, accessibility services), here a clean phone 00 00 00, then
                            // the chat block list (c2s/1284 command 0), then c2s/9.
                            send!(1282, Ctx::default());
                            send!(1284, Ctx::default());
                            send!(9, Ctx { username: Some(&account.username), ..Ctx::default() });
                            step = Step::Character;
                        }
                        // No character on the account: the server sends the options of the character screen instead
                        // of s2c/9 (20/11, after the Open Beta wiped the Alpha characters; src/net/client.ts NO_CHARACTER).
                        (Step::Character, 8) => {
                            return Err("Nick chưa có nhân vật: vào game tạo nhân vật trước".into());
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
                if let Some(c) = &cmd {
                    trace.command(c);
                }
                match cmd {
                    None | Some(Command::Logout) => return Ok(()),
                    // At any step, with what went in and out so far.
                    Some(Command::Report(note)) => emit(Event::Fault(Box::new(trace.report(&note)))),
                    // Sent once to every session, so kept even before the game is ready.
                    Some(Command::Record(on)) => bot.set_record(on, out),
                    // Closing the dialog of a nick not in the game is nothing to say.
                    Some(Command::ShopClosed) => bot.shop_closed(now, out),
                    Some(_) if step != Step::Ready => out.push(Out::Log(LogKind::Connection, NOT_READY.into())),
                    Some(Command::Fight { target, count, max_losses }) => bot.fight(&target, count, max_losses, now, out),
                    Some(Command::Quest { max_losses, step }) => bot.quest(max_losses, step, now, out),
                    Some(Command::Stop { surrender }) => bot.stop(surrender, now, out),
                    Some(Command::Stats(plan)) => bot.set_stats(plan, now, out),
                    Some(Command::FightSettings(settings)) => {
                        bot.set_fight(settings, now, out);
                        bot.spend_points(now, out);
                    }
                    Some(Command::LossesLeft(left)) => bot.set_losses_left(left, out),
                    Some(Command::AddStat(stat)) => bot.add_stat(stat, out),
                    Some(Command::UpgradeSkill(id)) => bot.upgrade_skill(id, now, out),
                    Some(Command::Item(act)) => bot.item(act, now, out),
                    Some(Command::ItemOf(act, uuid)) => bot.item_of(act, &uuid, now, out),
                    Some(Command::DiscardMany(items)) => bot.discard_many(items, now, out),
                    Some(Command::BreakAll(slot, uuid)) => bot.break_all(slot, &uuid, now, out),
                    Some(Command::ListZones) => bot.list_zones(out),
                    Some(Command::ChangeZone(zone)) => bot.change_zone(zone, now, out),
                    Some(Command::GoTo(map_id)) => bot.go_to(&map_id, now, out),
                    Some(Command::ShopTrip { back }) => bot.go_to_shop(back, now, out),
                    Some(Command::OpenShop) => bot.open_shop(now, out),
                    Some(Command::OpenShopKind(kind)) => bot.open_shop_kind(kind, now, out),
                    Some(Command::Smith(task)) => bot.smith(task, now, out),
                    Some(Command::Buy { shop_id, quantity }) => bot.buy(shop_id, quantity, now, out),
                    Some(Command::Gift(codes)) => bot.redeem(&codes, now, out),
                    Some(Command::GiftReset) => bot.gift_reset(out),
                    Some(Command::Mail(task)) => bot.mail(task, now, out),
                    Some(Command::Market(task)) => bot.market(task, now, out),
                    Some(Command::Welfare) => bot.welfare(now, out),
                    Some(Command::BachHo {
                        from_ms,
                        until_ms,
                        pace,
                    }) => bot.bach_ho(from_ms, until_ms, pace, now, out),
                    Some(Command::BachHoStop) => bot.bach_ho_stop(out),
                    Some(Command::GoBack) => bot.go_back(now, out),
                }
            }
            _ = sleep_until(wake.unwrap_or_else(Instant::now)), if wake.is_some() => bot.on_timer(std::time::Instant::now(), out),
            // Alone in the zone, the server sends no s2c/1263 at all.
            _ = sleep_until(players_wait.unwrap_or_else(Instant::now)), if players_wait.is_some() && step == Step::Entities => {
                out.push(Out::Log(LogKind::Connection, "Không có người chơi nào khác trong khu (server không gửi s2c/1263)".into()));
                online!();
            }
            _ = sleep_until(deadline), if step != Step::Ready => return Err(format!("Hết giờ chờ server ở bước {step:?}")),
            _ = sleep_until(heard + SILENT), if step == Step::Ready => {
                return Err(format!("Mất kết nối: server không gửi gì trong {} giây", SILENT.as_secs()));
            }
        }
        // One at a time: a send that fails leaves what follows it in `out`, for run() to deliver.
        let mut batch = std::mem::take(out).into_iter();
        while let Some(o) = batch.next() {
            let Out::Send(op, payload) = o else {
                deliver(o, emit, trace);
                continue;
            };
            trace.packet(true, op, &payload);
            let sent = match proto.encode(op, &payload) {
                Ok(frame) => write(&mut stream, &frame).await,
                Err(e) => Err(e.to_string()),
            };
            if let Err(e) = sent {
                out.extend(batch);
                return Err(e);
            }
            // Lưu dữ liệu trận: what goes out during a battle goes into its data.
            bot.record_sent(op, &payload, std::time::Instant::now());
        }
        let snap = bot.snapshot();
        if snap != last {
            emit(Event::Snapshot(Box::new(snap.clone())));
            last = snap;
        }
    }
}

/// A log line (with its Log lỗi when it is a fault) or a record of the bot, to the app; a send is not this.
fn deliver(o: Out, emit: &Emit, trace: &mut Trace) {
    match o {
        Out::Send(..) => {}
        Out::Log(kind, text) => {
            let fault = if is_fault(&text) {
                trace.fault(kind, &text, std::time::Instant::now())
            } else {
                None
            };
            emit(Event::Log(kind, text));
            if let Some(f) = fault {
                emit(Event::Fault(Box::new(f)));
            }
        }
        Out::Battle(record) => emit(Event::Battle(record)),
        Out::Pickup(record) => emit(Event::Pickup(record)),
        Out::BattleData(data) => emit(Event::BattleData(data)),
        Out::BattleEvent(e) => emit(Event::BattleEvent(e)),
    }
}

/// Writes a frame, within STEP: a server that stops reading must not hold the session, deaf to Đăng xuất.
async fn write<S: tokio::io::AsyncWrite + Unpin>(
    stream: &mut S,
    frame: &[u8],
) -> Result<(), Error> {
    timeout(STEP, stream.write_all(frame))
        .await
        .map_err(|_| format!("Gửi tới server quá {} giây", STEP.as_secs()))?
        .map_err(|e| e.to_string())
}

use super::connect::*;
use super::session::*;
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
    /// No other player in the zone: s2c/43 without s2c/1263 (M25, 31/10).
    Alone,
    /// In the game, answers nothing, not even the heartbeat: a connection gone without a close.
    Mute,
    /// An account without a character: s2c/8 (the options of the character screen) instead of s2c/9 (20/11).
    NoCharacter,
    /// The notice of a ban from EXP (s2c/0, flag -1) between s2c/43 and s2c/1263, as the server sent it to nobita and
    /// 40six2 on 26/11: the login is taken, the game shows the box and goes on.
    Banned,
    /// "Tài khoản hiện đang đăng nhập ở một nơi khác" (s2c/0) instead of s2c/4: the login is refused.
    Elsewhere,
}

/// s2c/0: i8 flag; string text.
fn message_box(text: &str) -> Vec<u8> {
    Writer::new().u8(0xff).string(text).build()
}
const BAN: &str = "Xử lý vi phạm lần 1, tài khoản của bạn đang bị cấm nhận kinh nghiệm (đánh quái).\nLý do: Sử dụng phần mềm thứ 3 can thiệp trò chơi\nThời hạn: tới 13:14 03/12/2026";

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
        // The heartbeat: the game server answers each c2s/1 with s2c/1.
        1 if fault == Fault::Mute => vec![],
        1 => vec![(1, vec![])],
        1206 => vec![(1207, w().string("").build()), (1209, w().u8(1).build())],
        5 => vec![(5, w().u8(1).string("").build())],
        2 => vec![(2, w().string("").build())],
        3 => vec![(3, w().bytes(&[0x10, 0x0c, 0, 1]).build())],
        4 if fault == Fault::Elsewhere => vec![(
            0,
            message_box("Tài khoản hiện đang đăng nhập ở một nơi khác"),
        )],
        4 => vec![(4, vec![])],
        9 if fault == Fault::NoCharacter => vec![(8, w().i32(18).i32(0).build())],
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
        30 => vec![(30, w().i32(0).build())],
        42 => vec![(42, w().string("").build())],
        29 => vec![(29, w().string("manina").string("M1").i32(0).build())],
        11 if fault == Fault::StallMap => vec![],
        11 => vec![(11, if fault == Fault::Map { vec![1] } else { map })],
        43 if fault == Fault::Alone => vec![(43, mobs.build())],
        43 if fault == Fault::Banned => vec![
            (43, mobs.build()),
            (0, message_box(BAN)),
            (1263, vec![0, 0]),
        ],
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

/// What the local server got, with when.
type Seen = Arc<Mutex<Vec<(i32, std::time::Instant)>>>;

/// A local server playing the login of FLOW with `answers`; returns its port.
async fn server(fault: Fault) -> u16 {
    server_seen(fault, Seen::default()).await
}
/// `server`, noting each request it gets in `seen`.
async fn server_seen(fault: Fault, seen: Seen) -> u16 {
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
            seen.lock().unwrap().push((op, std::time::Instant::now()));
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

/// A local SOCKS5 proxy wanting `user` / `pass`, for one connection: it holds its last reply until the game
/// server's seed and sends both in one write, then pipes both ways. Returns its port.
async fn socks5(user: &'static str, pass: &'static str) -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(async move {
        let (mut c, _) = listener.accept().await.unwrap();
        let mut head = [0u8; 2];
        c.read_exact(&mut head).await.unwrap();
        let mut methods = vec![0u8; head[1] as usize];
        c.read_exact(&mut methods).await.unwrap();
        assert_eq!(methods, [0, 2]);
        c.write_all(&[5, 2]).await.unwrap();
        async fn field(c: &mut TcpStream) -> Vec<u8> {
            let mut n = [0u8; 1];
            c.read_exact(&mut n).await.unwrap();
            let mut v = vec![0u8; n[0] as usize];
            c.read_exact(&mut v).await.unwrap();
            v
        }
        let mut version = [0u8; 1];
        c.read_exact(&mut version).await.unwrap();
        let (u, p) = (field(&mut c).await, field(&mut c).await);
        let ok = u == user.as_bytes() && p == pass.as_bytes();
        c.write_all(&[1, u8::from(!ok)]).await.unwrap();
        if !ok {
            return;
        }
        let mut request = [0u8; 10];
        c.read_exact(&mut request).await.unwrap();
        assert_eq!(request[..4], [5, 1, 0, 1]);
        let target = (
            std::net::Ipv4Addr::from(<[u8; 4]>::try_from(&request[4..8]).unwrap()),
            u16::from_be_bytes([request[8], request[9]]),
        );
        let mut up = TcpStream::connect(target).await.unwrap();
        let mut reply = vec![5, 0, 0, 1, 127, 0, 0, 1, 0, 0, 0, 0, 0, 0];
        up.read_exact(&mut reply[10..]).await.unwrap();
        c.write_all(&reply).await.unwrap();
        let _ = tokio::io::copy_bidirectional(&mut c, &mut up).await;
    });
    port
}
/// The test server of `server` on this machine.
fn local(port: u16) -> Server {
    Server {
        host: "127.0.0.1".into(),
        port,
    }
}

fn socks(port: u16, username: &str, password: &str) -> Proxy {
    Proxy {
        enabled: true,
        kind: crate::proxy::ProxyKind::Socks5,
        host: "127.0.0.1".into(),
        port,
        username: username.into(),
        password: password.into(),
    }
}
/// A port nothing listens on.
async fn dead_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    listener.local_addr().unwrap().port()
}

type Events = Arc<Mutex<Vec<Event>>>;

/// A session against `server(fault)`: what it reports, its commands, and its task.
async fn login(fault: Fault) -> (Events, UnboundedSender<Command>, JoinHandle<()>) {
    login_via(fault, None).await
}
/// `login` through `proxy`: a SOCKS5 proxy on that port with the username and password of `socks5`, unless set.
async fn login_via(
    fault: Fault,
    proxy: Option<Proxy>,
) -> (Events, UnboundedSender<Command>, JoinHandle<()>) {
    login_seen(fault, proxy, Seen::default()).await
}
/// `login_via`, with what the server got in `seen`.
async fn login_seen(
    fault: Fault,
    proxy: Option<Proxy>,
    seen: Seen,
) -> (Events, UnboundedSender<Command>, JoinHandle<()>) {
    let port = server_seen(fault, seen).await;
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
        fight: Default::default(),
        fight_targets: Default::default(),
        proxy,
        algorithm: Default::default(),
    };
    let emit: Emit = Arc::new(move |e| sink.lock().unwrap().push(e));
    let task = tokio::spawn(run(
        local(port),
        true,
        account,
        Default::default(),
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
            Event::Log(_, t) => Some(t.clone()),
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

/// A message box after s2c/4 is not a refusal: the notice of a ban from EXP came between s2c/43 and s2c/1263 and the app
/// ended the login with "Server từ chối: Xử lý vi phạm lần 1…" (40six2, Android 2.2.27, 26/11) while the game went in.
#[tokio::test]
async fn a_message_box_after_s2c_4_is_logged_and_the_login_goes_on() {
    let (events, tx, task) = login(Fault::Banned).await;
    online(&events).await;
    assert!(
        logs(&events)
            .iter()
            .any(|l| l.starts_with("Server: Xử lý vi phạm lần 1")),
        "{:?}",
        logs(&events)
    );
    tx.send(Command::Logout).unwrap();
    ends(task).await;
    assert_eq!(
        states(&events),
        [ConnState::Connecting, ConnState::Online, ConnState::Offline]
    );
}

/// Before s2c/4 a message box is the server saying no to the login.
#[tokio::test]
async fn a_message_box_instead_of_s2c_4_refuses_the_login() {
    let (events, _tx, task) = login(Fault::Elsewhere).await;
    ends(task).await;
    assert_eq!(
        states(&events),
        [
            ConnState::Connecting,
            ConnState::Error("Server từ chối: Tài khoản hiện đang đăng nhập ở một nơi khác".into())
        ]
    );
}

#[tokio::test]
async fn the_heartbeat_follows_the_login_schedule_until_s2c_4_then_the_world_one() {
    // human::heartbeat_delay BEAT_SCALE times faster: 2 s / 30 until s2c/4, the first 25 s / 30 after it, then 30 s / 30.
    let seen = Seen::default();
    let (events, tx, task) = login_seen(Fault::None, None, seen.clone()).await;
    online(&events).await;
    tokio::time::sleep(Duration::from_millis(2900)).await;
    tx.send(Command::Logout).unwrap();
    ends(task).await;
    let seen = seen.lock().unwrap().clone();
    // c2s/1282 goes right after s2c/4.
    let auth = seen.iter().find(|s| s.0 == 1282).unwrap().1;
    let beats: Vec<Duration> = (seen.iter())
        .filter(|s| s.0 == 1 && s.1 > auth)
        .map(|s| s.1 - auth)
        .collect();
    let first = crate::human::HEARTBEAT_FIRST / BEAT_SCALE;
    let every = crate::human::HEARTBEAT_WORLD / BEAT_SCALE;
    assert!((2..=3).contains(&beats.len()), "{beats:?}");
    assert!(beats[0] >= first - Duration::from_millis(30), "{beats:?}");
    assert!(
        beats[0] < every,
        "the first sooner than the rest: {beats:?}"
    );
    for w in beats.windows(2) {
        assert!(
            w[1] - w[0] >= every - Duration::from_millis(30),
            "{beats:?}"
        );
    }
}

#[tokio::test]
async fn a_server_that_goes_silent_in_the_game_ends_the_session_as_a_lost_connection() {
    let (events, _tx, task) = login(Fault::Mute).await;
    online(&events).await;
    timeout(SILENT + Duration::from_secs(3), task)
        .await
        .expect("the silent session did not end")
        .unwrap();
    let last = states(&events).pop();
    assert!(
        matches!(&last, Some(ConnState::Error(e)) if e.starts_with("Mất kết nối")),
        "{last:?}"
    );
}

#[tokio::test]
async fn a_server_that_answers_the_heartbeat_keeps_the_session_past_the_silence_limit() {
    let (events, tx, task) = login(Fault::None).await;
    online(&events).await;
    tokio::time::sleep(SILENT + Duration::from_secs(1)).await;
    assert_eq!(states(&events).last(), Some(&ConnState::Online));
    tx.send(Command::Logout).unwrap();
    ends(task).await;
}

#[tokio::test]
async fn lưu_dữ_liệu_trận_turned_off_while_logging_in_is_kept() {
    let (events, tx, task) = login(Fault::None).await;
    // Before the session has even connected: Manager::set_record sends it once, so it must not be dropped.
    tx.send(Command::Record(false)).unwrap();
    online(&events).await;
    tx.send(Command::Record(true)).unwrap();
    let on = "Bật lưu dữ liệu trận: gói tin của mỗi trận được lưu vào cllt.db";
    timeout(Duration::from_secs(2), async {
        while !logs(&events).iter().any(|l| l == on) {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap_or_else(|_| panic!("the session never had it off: {:?}", logs(&events)));
    assert!(!logs(&events).iter().any(|l| l == NOT_READY));
    tx.send(Command::Logout).unwrap();
    ends(task).await;
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
async fn an_account_without_a_character_stops_the_login_and_says_so() {
    let (events, _tx, task) = login(Fault::NoCharacter).await;
    ends(task).await;
    let states = states(&events);
    assert!(
        matches!(states.last(), Some(ConnState::Error(m)) if m.contains("chưa có nhân vật")),
        "{states:?}"
    );
}

/// The Event::Fault the session sent, in order.
fn faults(events: &Events) -> Vec<super::Fault> {
    let events = events.lock().unwrap();
    events
        .iter()
        .filter_map(|e| match e {
            Event::Fault(f) => Some((**f).clone()),
            _ => None,
        })
        .collect()
}

#[tokio::test]
async fn the_error_that_ends_a_login_goes_to_log_loi_with_the_packets_before_it() {
    let (events, _tx, task) = login(Fault::Map).await;
    ends(task).await;
    let faults = faults(&events);
    // The made-up s2c/9 and s2c/42 do not read in full: one fault each, though four decoders of s2c/9 say so.
    assert_eq!(
        faults
            .iter()
            .map(|f| f.text.split(':').next().unwrap())
            .collect::<Vec<_>>(),
        [
            "Không đọc được phần sau của s2c/9",
            "Không đọc được túi đồ (s2c/42)",
            "Lỗi"
        ]
    );
    let f = &faults[2];
    assert!(
        f.text.starts_with("Lỗi: Không đọc được s2c/11"),
        "{}",
        f.text
    );
    assert!(!f.reported);
    // The last packet is the one that did not read; c2s/4 is there without its payload, the heartbeats are not.
    let last = f.packets.last().unwrap();
    assert_eq!((last.dir, last.op, last.hex.as_str()), ("s2c", 11, "01"));
    let proof = f
        .packets
        .iter()
        .find(|p| p.dir == "c2s" && p.op == 4)
        .unwrap();
    assert!(proof.len > 0 && proof.hex.is_empty(), "{proof:?}");
    assert!(f.packets.iter().all(|p| p.op != 1));
    // After the state it is about.
    let events = events.lock().unwrap();
    assert!(matches!(events.last(), Some(Event::Fault(_))));
}

#[tokio::test]
async fn bao_loi_answers_with_what_went_in_and_out() {
    let (events, tx, task) = login(Fault::None).await;
    online(&events).await;
    tx.send(Command::ListZones).unwrap();
    tx.send(Command::Report("mở trứng không được".into()))
        .unwrap();
    let reported = || faults(&events).into_iter().find(|f| f.reported);
    let wait = async {
        while reported().is_none() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    };
    timeout(Duration::from_secs(2), wait).await.unwrap();
    let f = reported().unwrap();
    assert_eq!(f.text, "mở trứng không được");
    assert!(
        f.commands.iter().any(|(_, c)| c == "ListZones"),
        "{:?}",
        f.commands
    );
    assert!(f.packets.iter().any(|p| p.dir == "s2c" && p.op == 43));
    let before = faults(&events).len();
    tx.send(Command::Logout).unwrap();
    ends(task).await;
    // A session that just ended is no fault.
    assert_eq!(faults(&events).len(), before);
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
async fn alone_in_the_zone_the_login_goes_online_without_s2c_1263() {
    let (events, tx, task) = login(Fault::Alone).await;
    online(&events).await;
    let snap = last_snapshot(&events);
    assert!(snap.players.is_empty() && !snap.players_unread);
    assert!(
        logs(&events)
            .iter()
            .any(|l| l.contains("Không có người chơi nào khác")),
        "{:?}",
        logs(&events)
    );
    tx.send(Command::Logout).unwrap();
    ends(task).await;
    assert_eq!(
        states(&events),
        [ConnState::Connecting, ConnState::Online, ConnState::Offline]
    );
}

#[tokio::test]
async fn a_login_through_a_socks5_proxy_goes_online() {
    let proxy = socks(socks5("bot", "s3cret").await, "bot", "s3cret");
    let (events, tx, task) = login_via(Fault::None, Some(proxy.clone())).await;
    online(&events).await;
    tx.send(Command::Logout).unwrap();
    ends(task).await;
    assert_eq!(
        states(&events),
        [ConnState::Connecting, ConnState::Online, ConnState::Offline]
    );
    let logs = logs(&events);
    assert_eq!(
        logs[..2],
        [
            format!("Kết nối qua proxy {}", proxy.label()),
            format!("Proxy {} đã mở đường tới server game", proxy.label())
        ]
    );
}

#[tokio::test]
async fn a_proxy_that_fails_is_the_error_of_the_login_and_a_proxy_turned_off_is_not_used() {
    let refused = socks(socks5("bot", "s3cret").await, "bot", "wrong");
    let dead = socks(dead_port().await, "bot", "s3cret");
    for (proxy, why) in [
        (refused, "từ chối tài khoản hoặc mật khẩu"),
        (dead.clone(), "Không kết nối được proxy socks5 127.0.0.1:"),
    ] {
        let (events, _tx, task) = login_via(Fault::None, Some(proxy.clone())).await;
        ends(task).await;
        let states = states(&events);
        assert!(
            matches!(&states[..], [ConnState::Connecting, ConnState::Error(m)]
                if m.contains(why) && m.contains(&proxy.label()) && !m.contains("s3cret") && !m.contains("wrong")),
            "{states:?}"
        );
    }
    let off = Proxy {
        enabled: false,
        ..dead
    };
    let (events, tx, task) = login_via(Fault::None, Some(off)).await;
    online(&events).await;
    assert!(!logs(&events).iter().any(|l| l.contains("proxy")));
    tx.send(Command::Logout).unwrap();
    ends(task).await;
}

#[tokio::test]
async fn the_proxy_check_waits_for_the_game_servers_seed() {
    let game = server(Fault::None).await;
    let proxy = socks(socks5("bot", "s3cret").await, "bot", "s3cret");
    assert!(check_proxy(&local(game), &proxy).await.is_ok());
    let game = server(Fault::None).await;
    let refused = socks(socks5("bot", "s3cret").await, "bot", "x");
    let err = check_proxy(&local(game), &refused).await.unwrap_err();
    assert_eq!(
        err,
        format!(
            "Proxy {}: proxy từ chối tài khoản hoặc mật khẩu",
            refused.label()
        )
    );
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

#[test]
fn the_exit_ip_of_a_proxy_is_the_body_of_the_echo_when_it_is_an_address() {
    use super::connect::exit_ip_of;
    let ok = b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n203.0.113.7";
    assert_eq!(exit_ip_of(ok).as_deref(), Some("203.0.113.7"));
    let v6 = b"HTTP/1.1 200 OK\r\n\r\n2001:db8::1\n";
    assert_eq!(exit_ip_of(v6).as_deref(), Some("2001:db8::1"));
    assert_eq!(
        exit_ip_of(b"HTTP/1.1 407 Proxy Authentication Required\r\n\r\nno"),
        None
    );
    assert_eq!(exit_ip_of(b"HTTP/1.1 200 OK\r\n\r\n<html>"), None);
    assert_eq!(exit_ip_of(b"garbage"), None);
}

//! Phúc lợi (18-players-checkin.md#điểm-danh, #quà-online) against src/protocol/welfare.ts (`npm run export:rust`,
//! vectors.json "welfare"): what the TS decoders read in the packets of PL1, the bytes of c2s/1236, c2s/1239, c2s/1232
//! and c2s/1233, and Tự nhận Phúc lợi of the bot (Bot::welfare) driven by those packets.
use cllt_core::atlas::Atlas;
use cllt_core::bot::{Bot, BotOptions, FightSettings, Out};
use cllt_core::protocol::Writer;
use cllt_core::requests::{build, Ctx};
use cllt_core::welfare;
use std::sync::Arc;
use std::time::{Duration, Instant};

mod common;
use common::{hex, tohex, v};

/// The captured packet of PL1 under that key of test/fixtures-pl1.ts.
fn pl1(key: &str) -> Vec<u8> {
    let all = v();
    let case = all["welfare"]["packets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["key"] == key)
        .unwrap_or_else(|| panic!("no PL1 packet {key}"))
        .clone();
    hex(case["hex"].as_str().unwrap())
}
fn pl1_hex(key: &str) -> String {
    tohex(&pl1(key))
}
fn lines(out: &[Out]) -> Vec<&str> {
    out.iter()
        .filter_map(|o| match o {
            Out::Log(_, t) => Some(t.as_str()),
            _ => None,
        })
        .collect()
}
fn sent(out: &[Out]) -> Vec<(i32, String)> {
    out.iter()
        .filter_map(|o| match o {
            Out::Send(op, p) => Some((*op, tohex(p))),
            _ => None,
        })
        .collect()
}

#[test]
fn the_pl1_packets_read_as_the_ts_side_reads_them_and_the_requests_are_the_phones() {
    let all = v();
    let cases = all["welfare"]["decoders"].as_array().unwrap();
    assert_eq!(cases.len(), 15);
    for case in cases {
        let p = hex(case["hex"].as_str().unwrap());
        let key = case["key"].as_str().unwrap();
        let mut got = match case["fn"].as_str().unwrap() {
            "eventDefinition" => serde_json::to_value(welfare::event_definition(&p).unwrap()),
            "eventProgress" => serde_json::to_value(welfare::event_progress(&p).unwrap()),
            "checkinResult" => serde_json::to_value(welfare::checkin_result(&p).unwrap()),
            "welfareDots" => serde_json::to_value(welfare::welfare_dots(&p).unwrap()),
            other => panic!("no Rust decoder for {other}"),
        }
        .unwrap();
        if let Some(o) = got.as_object_mut() {
            o.remove("stamp");
        }
        assert_eq!(got, case["expected"], "{key}");
    }
    let r = &all["welfare"]["requests"];
    for case in r["keys"].as_array().unwrap() {
        let ctx = Ctx {
            key: case["key"].as_str(),
            ..Ctx::default()
        };
        for op in [1236, 1239] {
            assert_eq!(tohex(&build(op, &ctx).unwrap()), case["hex"], "{op}");
        }
    }
    for case in r["checkin"].as_array().unwrap() {
        let ctx = Ctx {
            event: case["event"].as_i64(),
            milestone: case["milestone"].as_i64(),
            ..Ctx::default()
        };
        assert_eq!(tohex(&build(1232, &ctx).unwrap()), case["hex"]);
    }
    for case in r["claim"].as_array().unwrap() {
        let ctx = Ctx {
            event: case["event"].as_i64(),
            ..Ctx::default()
        };
        assert_eq!(tohex(&build(1233, &ctx).unwrap()), case["hex"]);
    }
    assert!(build(1233, &Ctx::default()).is_err(), "no event");
    for case in all["welfare"]["claimed"].as_array().unwrap() {
        let text = case["text"].as_str().unwrap();
        assert_eq!(
            welfare::claimed_gifts(text).map(|n| n as u64),
            case["count"].as_u64(),
            "{text}"
        );
    }
    let d = welfare::event_progress(&pl1("s2c/1239 CHECKIN_MONTHLY đã điểm danh")).unwrap();
    assert_eq!(d.checkin.unwrap().days(), [20]);
    assert!(welfare::has_dot(9, welfare::TAB_CHECKIN) && welfare::has_dot(9, welfare::TAB_ONLINE));
}

/// s2c/1187 with `capacity` slots and `items` (item id), one per slot from 0, locked.
fn bag(capacity: i32, items: &[i32]) -> Vec<u8> {
    let mut w = Writer::new().u8(1).i32(capacity).i32(items.len() as i32);
    for (slot, &item) in items.iter().enumerate() {
        w = w
            .u8(slot as u8)
            .i32(item)
            .string(&format!("u{slot}"))
            .i32(0)
            .i32(-1)
            .i32(1)
            .u8(0)
            .u8(0xff)
            .i32(0)
            .u8(0)
            .u8(0)
            .u8(0);
    }
    w.build()
}
/// akaito in PL1: a bag of 42 with 16 items, Tự điểm danh và nhận quà on or off.
fn bot(auto: bool, free: bool) -> (Bot, Vec<Out>, Instant) {
    let options = BotOptions {
        fight: FightSettings {
            auto_welfare: auto,
            ..FightSettings::default()
        },
        ..BotOptions::default()
    };
    let mut b = Bot::new(options, Arc::new(Atlas::default()));
    let now = Instant::now();
    let mut out = vec![];
    let items: Vec<i32> = match free {
        true => vec![412; 16],
        false => vec![412; 42],
    };
    b.on_packet(1187, &bag(42, &items), now, &mut out).unwrap();
    b.on_packet(1279, &pl1("s2c/1279 lúc vào game"), now, &mut out)
        .unwrap();
    (b, vec![], now)
}
fn feed(b: &mut Bot, keys: &[(i32, &str)], now: Instant, out: &mut Vec<Out>) {
    for (op, key) in keys {
        b.on_packet(*op, &pl1(key), now, out).unwrap();
    }
}
/// The reads of a run: c2s/1236 then c2s/1239 for each key as the phone sent them, each answered with `answers` (the
/// definition, then the progress).
fn reads(b: &mut Bot, progress: [&str; 3], now: Instant, out: &mut Vec<Out>) {
    for (key, p) in welfare::WELFARE_KEYS.into_iter().zip(progress) {
        let def = format!("s2c/1236 {key}");
        assert_eq!(
            sent(out),
            [(1236, pl1_hex(&format!("c2s/1236 {key}")))],
            "c2s/1236 {key}"
        );
        out.clear();
        b.on_packet(1236, &pl1(&def), now, out).unwrap();
        assert_eq!(
            sent(out),
            [(1239, pl1_hex(&format!("c2s/1236 {key}")))],
            "c2s/1239 {key}"
        );
        out.clear();
        b.on_packet(1239, &pl1(p), now, out).unwrap();
    }
}
const DUE: [&str; 3] = [
    "s2c/1239 CHECKIN_MONTHLY chưa điểm danh",
    "s2c/1239 ONLINE_DAILY 484 phút",
    "s2c/1239 LEVEL_UP 5 mốc nhận được",
];
const TAKEN: [&str; 3] = [
    "s2c/1239 CHECKIN_MONTHLY đã điểm danh",
    "s2c/1239 ONLINE_DAILY đã nhận",
    "s2c/1239 LEVEL_UP đã nhận",
];

#[test]
fn on_its_own_after_login_it_checks_in_and_takes_the_gifts_of_online_and_level_as_the_phone_did() {
    let (mut b, mut out, now) = bot(true, true);
    assert!(b.snap.welfare.due, "s2c/1279 9 before any read");
    b.on_ready(now, &mut out);
    assert!(sent(&out).is_empty());
    let at = now + Duration::from_secs(3);
    assert_eq!(b.deadline(), Some(at));
    b.on_timer(at, &mut out);
    reads(&mut b, DUE, at, &mut out);
    let w = &b.snap.welfare;
    assert_eq!(
        (w.known, w.due, w.checked_today, w.day, w.days_in_month),
        (true, true, Some(false), Some(20), Some(30))
    );
    assert_eq!(w.online.as_ref().unwrap().progress, 484);
    assert_eq!(w.daily.len(), 10);
    assert_eq!(
        w.level.as_ref().unwrap().milestones[0].gifts,
        "25.000 Xu khóa"
    );

    assert_eq!(sent(&out), [(1232, pl1_hex("c2s/1232 Điểm danh"))]);
    assert_eq!(
        b.snap.welfare.doing.as_deref(),
        Some("Đang nhận Điểm danh…")
    );
    out.clear();
    feed(
        &mut b,
        &[
            (1232, "s2c/1232 Điểm danh ngày 20"),
            (1239, "s2c/1239 CHECKIN_MONTHLY đã điểm danh"),
            (1279, "s2c/1279 sau Điểm danh"),
        ],
        at,
        &mut out,
    );
    assert_eq!(sent(&out), [(1233, pl1_hex("c2s/1233 ONLINE_DAILY"))]);
    out.clear();
    feed(
        &mut b,
        &[
            (46, "s2c/46 sau quà online"),
            (1256, "s2c/1256 Đã nhận 4 phần thưởng"),
            (1239, "s2c/1239 ONLINE_DAILY đã nhận"),
            (1279, "s2c/1279 sau quà online"),
        ],
        at,
        &mut out,
    );
    assert_eq!(sent(&out), [(1233, pl1_hex("c2s/1233 LEVEL_UP"))]);
    out.clear();
    feed(
        &mut b,
        &[
            (46, "s2c/46 sau quà thăng cấp"),
            (1256, "s2c/1256 Đã nhận 5 phần thưởng"),
            (1239, "s2c/1239 LEVEL_UP đã nhận"),
        ],
        at,
        &mut out,
    );
    assert!(sent(&out).is_empty());
    let w = &b.snap.welfare;
    assert_eq!(
        w.last.as_deref(),
        Some("Điểm danh ngày 20: nhận 1 Đá cấp 6; Quà online: Đã nhận 4 phần thưởng (15.000 Xu khóa, Đá cấp 5, Đá cấp 6); Quà thăng cấp: Đã nhận 5 phần thưởng (25.000 Xu khóa, Tăng Kinh Nghiệm ×2, Hoàn Linh Dược ×10, Kim Đan Dược ×10, Chuyển hoá trang bị trung cấp)")
    );
    assert_eq!(
        (
            w.doing.as_deref(),
            w.due,
            w.checked_today,
            w.today_gift.as_deref()
        ),
        (None, false, Some(true), Some("1 Đá cấp 6"))
    );
    assert_eq!(w.days.as_deref(), Some(&[20][..]));
    assert!(
        lines(&out).contains(&"Đã nhận 5 phần thưởng"),
        "the notice is the server's line"
    );
    // Next on its own: after the check-in's reset (00:00), nothing else being due.
    let next = b.deadline().unwrap();
    assert!(next > at + Duration::from_secs(59), "{:?}", next - at);
}

#[test]
fn nothing_due_sends_no_claim_and_nhan_ngay_says_so_with_the_switch_off() {
    let (mut b, mut out, now) = bot(false, true);
    b.on_ready(now, &mut out);
    assert_eq!(b.deadline(), None, "off: nothing on its own");
    b.on_timer(now + Duration::from_secs(60), &mut out);
    assert!(sent(&out).is_empty());
    b.welfare(now, &mut out);
    reads(&mut b, TAKEN, now, &mut out);
    assert!(sent(&out).is_empty(), "no claim");
    assert!(lines(&out)[0].starts_with("Phúc lợi: không có gì để nhận"));
    assert!(!b.snap.welfare.due);
    assert_eq!(b.deadline(), None, "off: no next run");
    // A second run reads only the progress: the definitions are kept for the session.
    out.clear();
    b.welfare(now, &mut out);
    assert_eq!(sent(&out), [(1239, pl1_hex("c2s/1236 CHECKIN_MONTHLY"))]);
}

#[test]
fn the_servers_refusals_end_each_claim_and_the_run_goes_on() {
    let (mut b, mut out, now) = bot(false, true);
    b.welfare(now, &mut out);
    reads(&mut b, [DUE[0], DUE[1], TAKEN[2]], now, &mut out);
    assert_eq!(sent(&out), [(1232, pl1_hex("c2s/1232 Điểm danh"))]);
    out.clear();
    feed(
        &mut b,
        &[
            (1232, "s2c/1232 hôm nay đã điểm danh"),
            (1256, "s2c/1256 hôm nay đã điểm danh"),
        ],
        now,
        &mut out,
    );
    assert_eq!(
        lines(&out),
        ["Phúc lợi: Chưa nhận Điểm danh: Hôm nay bạn đã điểm danh"],
        "the echo is not logged twice"
    );
    assert_eq!(sent(&out), [(1233, pl1_hex("c2s/1233 ONLINE_DAILY"))]);
    out.clear();
    feed(
        &mut b,
        &[
            (1256, "s2c/1256 không có phần thưởng"),
            (1239, "s2c/1239 ONLINE_DAILY 498 phút đã nhận"),
        ],
        now,
        &mut out,
    );
    assert_eq!(
        lines(&out),
        [
            "Không có phần thưởng nào để nhận",
            "Phúc lợi: Chưa nhận Quà online: Không có phần thưởng nào để nhận"
        ]
    );
    assert!(sent(&out).is_empty());
    assert_eq!(b.snap.welfare.online.as_ref().unwrap().progress, 498);
}

#[test]
fn a_full_bag_skips_each_claim_that_needs_room_and_a_silent_server_does_not_hold_the_run() {
    let (mut b, mut out, now) = bot(false, false);
    b.welfare(now, &mut out);
    reads(&mut b, DUE, now, &mut out);
    assert!(sent(&out).is_empty());
    assert_eq!(
        lines(&out),
        [
            "Phúc lợi: Chưa nhận Điểm danh: cần 1 ô trống, túi còn 0",
            "Phúc lợi: Chưa nhận Quà online: cần 2 ô trống, túi còn 0",
            "Phúc lợi: Chưa nhận Quà thăng cấp: cần 4 ô trống, túi còn 0"
        ]
    );
    // Room again, the server silent: each claim gives up after 8 s and the next goes.
    let (mut b, mut out, now) = bot(false, true);
    b.welfare(now, &mut out);
    reads(&mut b, [DUE[0], TAKEN[1], DUE[2]], now, &mut out);
    assert_eq!(sent(&out)[0].0, 1232);
    out.clear();
    let late = now + Duration::from_secs(8);
    assert_eq!(b.deadline(), Some(late));
    b.on_timer(late, &mut out);
    assert_eq!(
        lines(&out),
        ["Phúc lợi: Chưa nhận Điểm danh: server không trả lời sau 8 s"]
    );
    assert_eq!(sent(&out), [(1233, pl1_hex("c2s/1233 LEVEL_UP"))]);
}

#[test]
fn turned_on_it_runs_soon_and_a_level_that_reaches_a_milestone_runs_it_again() {
    let (mut b, mut out, now) = bot(false, true);
    b.set_fight(
        FightSettings {
            auto_welfare: true,
            ..FightSettings::default()
        },
        now,
        &mut out,
    );
    assert!(lines(&out)[0].starts_with("Bật tự điểm danh và nhận quà"));
    assert_eq!(b.deadline(), Some(now + Duration::from_secs(1)));
    out.clear();
    b.on_timer(now + Duration::from_secs(1), &mut out);
    reads(&mut b, TAKEN, now, &mut out);
    assert!(sent(&out).is_empty());
    // Level 54 → 75 (Đá cấp 9 ×3 of milestone 308): s2c/10 kind 2.
    let level = |l: i32| {
        let mut w = Writer::new().i32(2).string("akaito").i32(l);
        for _ in 0..10 {
            w = w.i32(1);
        }
        w.build()
    };
    b.snap.level = 54;
    b.on_packet(10, &level(55), now, &mut out).unwrap();
    assert!(
        b.deadline().unwrap() > now + Duration::from_secs(60),
        "55 reaches nothing"
    );
    b.on_packet(10, &level(75), now, &mut out).unwrap();
    assert_eq!(b.deadline(), Some(now + Duration::from_secs(2)));
    out.clear();
    b.set_fight(FightSettings::default(), now, &mut out);
    assert_eq!(lines(&out), ["Tắt tự điểm danh và nhận quà"]);
    assert_eq!(b.deadline(), None);
}

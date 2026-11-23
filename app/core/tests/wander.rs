//! Đi lại như người chơi (bot/wander.rs, walk.rs): the fall after a map load and a walk on the platform before the
//! challenge, as c2s/1169; nothing with it off.
use cllt_core::atlas::Atlas;
use cllt_core::bot::{Bot, BotOptions, FightSettings, Out};
use cllt_core::protocol::Writer;
use std::sync::Arc;
use std::time::{Duration, Instant};

mod common;
use common::{hex, v};

/// s2c/11 of M1 zone 0 with the character at (593, 5), a grid of 16 × 24 tiles: the platform 35 36 39 at row 13,
/// columns 17–19 (as MV1, 23/11), a floor at row 15; no NPC nor portal.
fn m1(x: i32, y: i32) -> Vec<u8> {
    let (rows, cols) = (16usize, 24usize);
    let mut tiles = vec![0u8; rows * cols];
    for (c, v) in [(17, 35), (18, 36), (19, 39)] {
        tiles[13 * cols + c] = v;
    }
    for c in 0..cols {
        tiles[15 * cols + c] = 7;
    }
    let none = vec![0u8; rows * cols];
    let mut w = Writer::new()
        .u8(1)
        .string("M1")
        .string("Làng Thanh Khê")
        .u8(0)
        .i32(x)
        .i32(y)
        .i32(0)
        .i32(rows as i32)
        .i32(cols as i32);
    for layer in [&tiles, &none, &none] {
        w = w.i32(layer.len() as i32);
        for &b in layer.iter() {
            w = w.u8(b);
        }
    }
    w.i32(0).i32(0).i32(0).i32(0).i32(0).i32(0).i32(0).build()
}
fn mobs() -> Vec<u8> {
    Writer::new()
        .string("M1")
        .u8(3)
        .string("mob61000")
        .string("Cóc Xanh")
        .i32(13)
        .u8(0)
        .i32(6)
        .i32(1)
        .u8(0)
        .build()
}
/// The c2s/1169 sent, as (x, y, state).
fn moves(out: &[Out]) -> Vec<(i32, i32, i32)> {
    out.iter()
        .filter_map(|o| match o {
            Out::Send(1169, p) => Some((
                i32::from_be_bytes(p[0..4].try_into().unwrap()),
                i32::from_be_bytes(p[4..8].try_into().unwrap()),
                i32::from_be_bytes(p[8..12].try_into().unwrap()),
            )),
            _ => None,
        })
        .collect()
}
/// Runs the bot's timer to `until`, every deadline on the way.
fn run(bot: &mut Bot, from: Instant, until: Instant, out: &mut Vec<Out>) {
    let mut now = from;
    while let Some(d) = bot.deadline().filter(|d| *d <= until) {
        now = d.max(now);
        bot.on_timer(now, out);
    }
}
fn bot(wander: bool) -> (Bot, Instant, Vec<Out>) {
    let mut b = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let now = Instant::now();
    let mut out = vec![];
    b.set_fight(
        FightSettings {
            wander,
            ..FightSettings::default()
        },
        now,
        &mut out,
    );
    (b, now, vec![])
}

#[test]
fn sau_khi_vao_map_roi_xuong_dat_nhu_game() {
    let (mut b, now, mut out) = bot(true);
    b.on_packet(11, &m1(593, 5), now, &mut out).unwrap();
    assert!(
        moves(&out).is_empty(),
        "the fall waits about a second as the game's"
    );
    run(&mut b, now, now + Duration::from_secs(5), &mut out);
    let m = moves(&out);
    assert_eq!(m.first(), Some(&(593, 5, 6)));
    assert_eq!(m.last(), Some(&(593, 416, 0)));
    assert!(m.windows(2).all(|w| w[1].1 > w[0].1));
    let s = b.snapshot();
    assert_eq!((s.x, s.y), (593, 416));
}

#[test]
fn danh_sach_quai_ve_thi_di_vai_buoc_tren_buc_va_khong_ra_khoi_mep() {
    let mut walked = 0;
    for _ in 0..20 {
        let (mut b, now, mut out) = bot(true);
        b.on_packet(11, &m1(600, 416), now, &mut out).unwrap();
        b.on_packet(43, &mobs(), now, &mut out).unwrap();
        run(&mut b, now, now + Duration::from_secs(6), &mut out);
        let m = moves(&out);
        if m.is_empty() {
            continue;
        }
        walked += 1;
        assert!(
            m.iter()
                .all(|&(x, y, _)| (556..=628).contains(&x) && y == 416),
            "{m:?}"
        );
        let n = m.len();
        assert_eq!(
            (m[n - 2].2, m[n - 1].2),
            (0, 0),
            "two packets of standing at the end"
        );
    }
    assert!(walked >= 5, "7 in 10 arrivals get a walk: {walked}/20");
}

#[test]
fn tat_thi_khong_gui_goi_di_chuyen_nao() {
    let (mut b, now, mut out) = bot(false);
    b.on_packet(11, &m1(593, 5), now, &mut out).unwrap();
    b.on_packet(43, &mobs(), now, &mut out).unwrap();
    run(&mut b, now, now + Duration::from_secs(6), &mut out);
    assert!(moves(&out).is_empty());
}

#[test]
fn thach_dau_doi_di_xong_roi_moi_gui() {
    let mut seen_walk = false;
    for _ in 0..20 {
        let (mut b, now, mut out) = bot(true);
        b.on_packet(11, &m1(600, 416), now, &mut out).unwrap();
        b.on_packet(43, &mobs(), now, &mut out).unwrap();
        out.clear();
        b.fight("Cóc Xanh", 1, 1, now, &mut out);
        run(&mut b, now, now + Duration::from_secs(8), &mut out);
        let ops: Vec<i32> = out
            .iter()
            .filter_map(|o| match o {
                Out::Send(op, _) => Some(*op),
                _ => None,
            })
            .collect();
        let Some(c) = ops.iter().position(|&op| op == 15) else {
            panic!("no challenge: {ops:?}");
        };
        if ops.contains(&1169) {
            seen_walk = true;
            assert!(
                ops[c..].iter().all(|&op| op != 1169),
                "a move after the challenge: {ops:?}"
            );
        }
    }
    assert!(seen_walk);
}

/// s2c/19 ending the battle against mob61000 with a loss (lost_battle of pace.rs).
fn lost_battle() -> Vec<u8> {
    Writer::new()
        .i32(2)
        .i32(0)
        .i32(0)
        .i32(2)
        .i32(2)
        .i32(2)
        .i32(3)
        .i32(1)
        .bytes(&[])
        .u8(1)
        .string("manina")
        .i32(40)
        .u8(0)
        .i32(0)
        .i32(-1)
        .i32(-1)
        .u8(0)
        .u8(0)
        .u8(0)
        .u8(0)
        .string("mob61000")
        .u8(1)
        .u8(0)
        .i32(0)
        .i32(0)
        .build()
}

#[test]
fn nhip_nguoi_choi_tat_thi_het_tran_cung_di_vai_buoc_truoc_tran_sau() {
    let setup = hex(v()["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["fn"] == "battleSetup")
        .unwrap()["hex"]
        .as_str()
        .unwrap());
    let mut walked = 0;
    for _ in 0..20 {
        let (mut b, now, mut out) = bot(true);
        b.on_packet(11, &m1(600, 416), now, &mut out).unwrap();
        b.on_packet(43, &mobs(), now, &mut out).unwrap();
        b.fight("Cóc Xanh", 5, 10, now, &mut out);
        let t = now + Duration::from_secs(8);
        run(&mut b, now, t, &mut out);
        b.on_packet(22, &setup, t, &mut out).unwrap();
        b.on_packet(19, &lost_battle(), t, &mut out).unwrap();
        out.clear();
        run(&mut b, t, t + Duration::from_secs(8), &mut out);
        let ops: Vec<i32> = out
            .iter()
            .filter_map(|o| match o {
                Out::Send(op, _) => Some(*op),
                _ => None,
            })
            .collect();
        let c = ops
            .iter()
            .position(|&op| op == 15)
            .expect("the next challenge");
        if ops[..c].contains(&1169) {
            walked += 1;
        }
        assert!(ops[c..].iter().all(|&op| op != 1169), "{ops:?}");
    }
    assert!(walked >= 5, "7 in 10 battles end with a walk: {walked}/20");
}

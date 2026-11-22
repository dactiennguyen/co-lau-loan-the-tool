//! Bạch Hổ (bot/bachho.rs): the way to the cave through Bản đồ thế giới as LN1 recorded it (17-bach-ho.md,
//! 19-luyen-nguc.md), and the fight as BH2 recorded it (21/11, mimosa on the phone with Frida): the boss in s2c/43,
//! c2s/15 with flag 1, the s2c/45 of its kill, and s2c/1275 byte for byte.
use cllt_core::atlas::{find_upwards, Atlas};
use cllt_core::bot::{bach_ho_result, BachHoPace, Bot, BotOptions, Out};
use cllt_core::protocol::Writer;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

mod common;
use common::hex;

fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}
fn sent(out: &mut Vec<Out>) -> Vec<(i32, String)> {
    out.drain(..)
        .filter_map(|o| match o {
            Out::Send(op, p) => Some((op, p.iter().map(|b| format!("{b:02x}")).collect())),
            _ => None,
        })
        .collect()
}

/// The s2c/22 fixture of pace.rs: a battle against mob61000.
fn setup() -> Vec<u8> {
    hex(common::v()["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["fn"] == "battleSetup")
        .unwrap()["hex"]
        .as_str()
        .unwrap())
}

/// manina already in Hang Bạch Hổ with the boss there (mob61000 named Bạch Hổ Thống Lĩnh).
fn in_the_cave() -> (Bot, Vec<Out>, Instant) {
    let (mut bot, mut out, now) = (
        Bot::new(BotOptions::default(), Arc::new(Atlas::default())),
        vec![],
        Instant::now(),
    );
    bot.on_packet(
        29,
        &Writer::new().string("manina").string("M24").i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    let boss = Writer::new()
        .string("M24")
        .u8(3)
        .string("mob61000")
        .string("Bạch Hổ Thống Lĩnh")
        .i32(40)
        .u8(0)
        .i32(6)
        .i32(1)
        .u8(0)
        .build();
    bot.on_packet(43, &boss, now, &mut out).unwrap();
    out.clear();
    (bot, out, now)
}

#[test]
fn in_the_cave_it_challenges_the_boss_plays_the_battle_by_itself_and_tries_again() {
    let (mut bot, mut out, now) = in_the_cave();
    let setup = setup();
    let at = epoch_ms();
    bot.bach_ho(
        at - 1_000,
        at + 3_600_000,
        BachHoPace::default(),
        now,
        &mut out,
    );
    bot.on_timer(now, &mut out);
    // Not a boss of s2c/1177: challenged as a mob (c2s/15), no warp since it is in the cave.
    let first = sent(&mut out);
    assert!(first.iter().any(|(op, _)| *op == 15), "{first:?}");
    assert!(!first.iter().any(|(op, _)| *op == 11));
    assert!(
        bot.snap.back_point.is_none(),
        "nothing to go back to from the cave"
    );

    // The battle opens: played by the bot, an own turn answered with a move (c2s/19) within the turn delay.
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    assert!(
        !out.iter()
            .any(|o| matches!(o, Out::Log(_, l) if l.contains("thách đấu trước"))),
        "a battle of Bạch Hổ is not one left over: {out:?}"
    );
    out.clear();
    let own_turn = Writer::new().i32(5).i32(0).u8(1).u8(0).build();
    bot.on_packet(24, &own_turn, now, &mut out).unwrap();
    for s in 1..=10 {
        bot.on_timer(now + Duration::from_secs(s), &mut out);
    }
    assert!(
        sent(&mut out).iter().any(|(op, _)| *op == 19),
        "the bot moves by itself"
    );

    // Lost: counted, saved as any battle, and the boss challenged again (Chờ vào trận lại 0 by default).
    let end = now + Duration::from_secs(20);
    bot.on_packet(19, &lost_battle(), end, &mut out).unwrap();
    assert!(out.iter().any(|o| matches!(o, Out::Battle(_))));
    // Kết quả Bạch Hổ asked after the battle (c2s/1275, empty), as "Xem tất cả bậc" of the game.
    assert!(out
        .iter()
        .any(|o| matches!(o, Out::Send(1275, p) if p.is_empty())));
    let run = bot.snap.bach_ho.clone().unwrap();
    assert_eq!((run.tries, run.battles, run.wins), (1, 1, 0));
    out.clear();
    bot.on_timer(end + Duration::from_millis(1_600), &mut out);
    assert!(
        sent(&mut out).iter().any(|(op, _)| *op == 15),
        "tries again"
    );
    assert_eq!(bot.snap.bach_ho.as_ref().unwrap().tries, 2);
}

/// Chờ vào trận lại of the window: the next try waits that long after a battle, not Cài đặt đánh's waits.
#[test]
fn the_windows_wait_between_a_battle_and_the_next_try_is_kept() {
    let (mut bot, mut out, now) = in_the_cave();
    let at = epoch_ms();
    let pace = BachHoPace {
        move_ms: 0,
        rejoin_ms: 3_000,
    };
    bot.bach_ho(at - 1_000, at + 3_600_000, pace, now, &mut out);
    bot.on_timer(now, &mut out);
    assert!(sent(&mut out).iter().any(|(op, _)| *op == 15));
    bot.on_packet(22, &setup(), now, &mut out).unwrap();
    let end = now + Duration::from_secs(20);
    bot.on_packet(19, &lost_battle(), end, &mut out).unwrap();
    out.clear();
    bot.on_timer(end + Duration::from_millis(2_500), &mut out);
    assert!(
        !sent(&mut out).iter().any(|(op, _)| *op == 15),
        "not before 3 s"
    );
    bot.on_timer(end + Duration::from_millis(3_100), &mut out);
    assert!(
        sent(&mut out).iter().any(|(op, _)| *op == 15),
        "tries again"
    );
}

/// s2c/1275 as sqtm.a of game 1.1.0 reads it: `state`, the boss at 0 of 500.000 HP, akaito (id 77, tier 2, 9.000)
/// finished it; tier 1 (levels 30–59, threshold 5.000, nobody) and tier 2 (60+, 20.000, 3 players, one row); own tier 2,
/// rank 4, 31.000 damage, threshold reached.
fn result_bytes(state: u8) -> Vec<u8> {
    let i16 = |v: i16| v.to_be_bytes().to_vec();
    [
        Writer::new()
            .u8(state)
            .i64(1_763_733_600_000)
            .i32(0)
            .i32(500_000)
            .i32(77)
            .string("akaito")
            .u8(2)
            .i32(9_000)
            .u8(2)
            .build(),
        Writer::new().u8(1).build(),
        i16(30),
        i16(59),
        Writer::new().i32(5_000).i32(0).u8(0).u8(2).build(),
        i16(60),
        i16(999),
        Writer::new()
            .i32(20_000)
            .i32(3)
            .u8(1)
            .u8(1)
            .i32(77)
            .string("akaito")
            .build(),
        i16(88),
        Writer::new()
            .i32(120_000)
            .u8(2)
            .i32(4)
            .i32(31_000)
            .u8(1)
            .build(),
    ]
    .concat()
}

#[test]
fn kết_quả_bạch_hổ_reads_whole() {
    let b = bach_ho_result(&result_bytes(1)).unwrap();
    assert_eq!(
        (
            b.state,
            b.hp,
            b.max_hp,
            b.killer_id,
            b.killer.as_str(),
            b.killer_tier,
            b.killer_damage
        ),
        (1, 0, 500_000, 77, "akaito", 2, 9_000)
    );
    assert_eq!(b.tiers.len(), 2);
    assert_eq!(
        (
            b.tiers[1].min_level,
            b.tiers[1].max_level,
            b.tiers[1].threshold,
            b.tiers[1].players
        ),
        (60, 999, 20_000, 3)
    );
    assert_eq!(
        (b.own_tier, b.own_rank, b.own_damage, b.reached),
        (2, 4, 31_000, true)
    );
    // One byte short or long is an error, as every reader of the catalog.
    let bytes = result_bytes(1);
    assert!(bach_ho_result(&bytes[..bytes.len() - 1]).is_err());
    assert!(bach_ho_result(&[bytes.as_slice(), &[0]].concat()).is_err());
}

#[test]
fn the_boss_killed_after_a_battle_ends_the_run_with_where_the_character_stands() {
    let (mut bot, mut out, now) = in_the_cave();
    let at = epoch_ms();
    bot.bach_ho(
        at - 1_000,
        at + 3_600_000,
        BachHoPace::default(),
        now,
        &mut out,
    );
    bot.on_timer(now, &mut out);
    bot.on_packet(22, &setup(), now, &mut out).unwrap();
    bot.on_packet(19, &lost_battle(), now, &mut out).unwrap();
    out.clear();
    // Under way: the log says the HP and the place, the snapshot keeps the read, the run goes on.
    let mut going = result_bytes(0);
    going[9..13].copy_from_slice(&250_000i32.to_be_bytes());
    bot.on_packet(1275, &going, now, &mut out).unwrap();
    assert!(out.iter().any(|o| matches!(o, Out::Log(_, l)
        if l.contains("Bạch Hổ còn 50% máu") && l.contains("Bậc 2 (cấp 60+), hạng 4, 31.000 sát thương"))));
    assert_eq!(
        bot.snap.bach_ho_result.as_ref().map(|r| r.own_rank),
        Some(4)
    );
    assert!(bot.snap.bach_ho.as_ref().unwrap().done.is_none());
    // An answer not asked for changes the place quietly.
    out.clear();
    bot.on_packet(1275, &going, now, &mut out).unwrap();
    assert!(!out.iter().any(|o| matches!(o, Out::Log(..))));
    // Killed, after the next battle: the run ends, and no more challenge.
    bot.on_timer(now + Duration::from_secs(2), &mut out);
    bot.on_packet(22, &setup(), now, &mut out).unwrap();
    bot.on_packet(19, &lost_battle(), now, &mut out).unwrap();
    bot.on_packet(1275, &result_bytes(1), now, &mut out)
        .unwrap();
    let run = bot.snap.bach_ho.clone().unwrap();
    assert!(
        run.done
            .as_deref()
            .is_some_and(|d| d.starts_with("Boss đã bị tiêu diệt")),
        "{run:?}"
    );
    assert!(out.iter().any(
        |o| matches!(o, Out::Log(_, l) if l.contains("kết liễu: akaito (bậc 2, 9.000 sát thương)"))
    ));
    out.clear();
    bot.on_timer(now + Duration::from_secs(10), &mut out);
    assert!(!out
        .iter()
        .any(|o| matches!(o, Out::Send(15 | 1178 | 1275, _))));
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
fn bach_ho_goes_to_the_cave_through_the_world_map_then_back_where_it_was() {
    let (mut bot, mut out, now) = (
        Bot::new(BotOptions::default(), Arc::new(Atlas::default())),
        vec![],
        Instant::now(),
    );
    bot.on_packet(
        29,
        &Writer::new().string("tiheo1").string("M25").i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    out.clear();
    let at = epoch_ms();
    bot.bach_ho(
        at - 1_000,
        at + 3_600_000,
        BachHoPace::default(),
        now,
        &mut out,
    );
    bot.on_timer(now, &mut out);
    // Bản đồ thế giới: c2s/11 "M99" (0, -1), as LN1.
    assert!(sent(&mut out).contains(&(11, "000000034d393900ffffffff".into())));
    assert!(bot
        .snap
        .back_point
        .as_ref()
        .is_some_and(|b| b.map_id == "M25"));
    // Its s2c/11 (flag 0): c2s/13 ("M99", 14) for Cổng Luyện Ngục.
    bot.on_packet(
        11,
        &Writer::new().u8(0).string("M99").i32(0).i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(sent(&mut out), vec![(13, "000000034d39390000000e".into())]);
    // s2c/13 M15: the map asked (c2s/11 "M15", ff, -1), its mobs next.
    bot.on_packet(13, &hex("000000034d31350000000e00ff"), now, &mut out)
        .unwrap();
    assert_eq!(
        sent(&mut out),
        vec![(11, "000000034d3135ffffffffff".into())]
    );
    bot.on_packet(
        43,
        &Writer::new().string("M15").u8(3).build(),
        now,
        &mut out,
    )
    .unwrap();
    // A moment later: portal 1006 into Hang Bạch Hổ.
    bot.on_timer(now + Duration::from_secs(2), &mut out);
    assert!(sent(&mut out).contains(&(13, "000000034d3135000003ee".into())));
    // Dừng, then Quay về chỗ cũ jumps back to M25 (line 24) through Bản đồ thế giới.
    bot.bach_ho_stop(&mut out);
    assert!(bot.snap.bach_ho.as_ref().is_some_and(|r| r.done.is_some()));
    bot.on_packet(13, &hex("000000034d32340000001700ff"), now, &mut out)
        .unwrap();
    bot.on_packet(
        43,
        &Writer::new().string("M24").u8(3).build(),
        now,
        &mut out,
    )
    .unwrap();
    out.clear();
    bot.go_back(now, &mut out);
    assert!(sent(&mut out).contains(&(11, "000000034d393900ffffffff".into())));
    bot.on_packet(
        11,
        &Writer::new().u8(0).string("M99").i32(0).i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(sent(&mut out), vec![(13, "000000034d393900000018".into())]);
    // Kept until there, so a jump with no answer can be tried again; gone once on M25.
    assert!(bot.snap.back_point.is_some());
    bot.on_packet(13, &hex("000000034d32350000001800ff"), now, &mut out)
        .unwrap();
    bot.on_packet(
        43,
        &Writer::new().string("M25").u8(3).build(),
        now,
        &mut out,
    )
    .unwrap();
    assert!(bot.snap.back_point.is_none());
}

// BH2 (captures/bh2-2026-11-21, 21/11): the packets of the game, byte for byte.
/// s2c/10 kind 2 of mimosa: level 68.
const BH2_LEVEL: &str = "00000002000000066d696d6f736100000044000001200000000a0000000a0000004d00000008000000150000000c000000080000000000000000";
/// s2c/43 of Hang Bạch Hổ at 21:00:00: mob800 Bạch Hổ Thống Lĩnh, level 155 (1.1.0 layout).
const BH2_BOSS: &str = "000000034d323403000000066d6f623830300000001942e1baa163682048e1bb95205468e1bb916e67204cc4a96e680000009b000000000b0000000100650000004fffffffff";
/// s2c/43 of the cave once the boss is gone.
const BH2_EMPTY: &str = "000000034d323403";
/// The game's challenge of it: c2s/15 ("mob800", 1).
const BH2_CHALLENGE: &str = "000000066d6f6238303001";
/// s2c/45 at 21:00:00: "Bạch Hổ Thống Lĩnh đã phá vỡ Phong Ấn, đang ẩn náu tại Hang Bạch Hổ của Luyện Ngục".
const BH2_SEAL: &str = "0000007042e1baa163682048e1bb95205468e1bb916e67204cc4a96e6820c491c3a3207068c3a12076e1bba12050686f6e6720e1baa46e2c20c491616e6720e1baa96e206ec3a1752074e1baa1692048616e672042e1baa163682048e1bb952063e1bba761204c7579e1bb876e204e67e1bba563";
/// s2c/45 at 21:09:32: "Bạch Hổ Thống Lĩnh vừa bị tiêu diệt bởi @XiaoMeiMei, công lớn thuộc về @LoveLove (51-100) và
/// @thuthuy (30-50). Xem kết quả ở mục Bạch Hổ".
const BH2_KILL: &str = "000000ac42e1baa163682048e1bb95205468e1bb916e67204cc4a96e682076e1bbab612062e1bb8b207469c3aa75206469e1bb87742062e1bb9f6920405869616f4d65694d65692c2063c3b46e67206ce1bb9b6e20746875e1bb99632076e1bb8120404c6f76654c6f7665202835312d313030292076c3a0204074687574687579202833302d3530292e2058656d206be1babf74207175e1baa320e1bb9f206de1bba5632042e1baa163682048e1bb95";

/// mimosa in the cave before 21:00: no mob yet.
fn waiting_in_the_cave() -> (Bot, Vec<Out>, Instant) {
    let (mut bot, mut out, now) = (
        Bot::new(BotOptions::default(), Arc::new(Atlas::default())),
        vec![],
        Instant::now(),
    );
    bot.on_packet(
        29,
        &Writer::new().string("mimosa").string("M24").i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(43, &hex(BH2_EMPTY), now, &mut out).unwrap();
    out.clear();
    (bot, out, now)
}

#[test]
fn the_boss_of_bh2_comes_in_s2c_43_and_is_challenged_with_the_games_c2s_15_at_once() {
    let (mut bot, mut out, now) = waiting_in_the_cave();
    let at = epoch_ms();
    bot.bach_ho(
        at - 1_000,
        at + 3_600_000,
        BachHoPace::default(),
        now,
        &mut out,
    );
    bot.on_timer(now, &mut out);
    // Nobody yet: the cave asked again, and the next try in 5 s.
    let first = sent(&mut out);
    assert!(first.contains(&(43, "000000034d3234".into())), "{first:?}");
    assert!(!first.iter().any(|(op, _)| *op == 15));
    // 21:00: the s2c/45 then the s2c/43 of the boss: said, and challenged at once as the game does.
    let t = now + Duration::from_secs(1);
    bot.on_packet(45, &hex(BH2_SEAL), t, &mut out).unwrap();
    bot.on_packet(43, &hex(BH2_BOSS), t, &mut out).unwrap();
    assert!(out.iter().any(
        |o| matches!(o, Out::Log(_, l) if l == "Bạch Hổ: Bạch Hổ Thống Lĩnh cấp 155 đã vào hang")
    ));
    out.clear();
    bot.on_timer(t, &mut out);
    assert_eq!(
        sent(&mut out),
        vec![(15, BH2_CHALLENGE.into())],
        "c2s/15 (\"mob800\", 1), not c2s/1178"
    );
}

#[test]
fn the_s2c_45_of_the_kill_ends_the_run_and_nothing_more_is_challenged() {
    let (mut bot, mut out, now) = waiting_in_the_cave();
    bot.on_packet(43, &hex(BH2_BOSS), now, &mut out).unwrap();
    let at = epoch_ms();
    bot.bach_ho(
        at - 1_000,
        at + 3_600_000,
        BachHoPace::default(),
        now,
        &mut out,
    );
    bot.on_timer(now, &mut out);
    bot.on_packet(22, &setup(), now, &mut out).unwrap();
    bot.on_packet(19, &lost_battle(), now, &mut out).unwrap();
    out.clear();
    bot.on_packet(45, &hex(BH2_KILL), now, &mut out).unwrap();
    let run = bot.snap.bach_ho.clone().unwrap();
    assert!(
        run.done
            .as_deref()
            .is_some_and(|d| d.starts_with("Boss đã bị tiêu diệt: 1 lần thử, 1 trận")),
        "{run:?}"
    );
    assert!(out.iter().any(
        |o| matches!(o, Out::Log(_, l) if l.starts_with("Thông báo: Bạch Hổ Thống Lĩnh vừa bị tiêu diệt bởi @XiaoMeiMei"))
    ));
    // Where it stands asked once more; then the empty cave and the timers do nothing.
    assert!(out.iter().any(|o| matches!(o, Out::Send(1275, _))));
    out.clear();
    bot.on_packet(43, &hex(BH2_EMPTY), now, &mut out).unwrap();
    bot.on_timer(now + Duration::from_secs(10), &mut out);
    assert!(!out.iter().any(|o| matches!(o, Out::Send(15 | 1178, _))));
}

#[test]
fn a_cave_emptied_after_the_boss_was_seen_ends_the_run_without_the_notice() {
    let (mut bot, mut out, now) = waiting_in_the_cave();
    let at = epoch_ms();
    bot.bach_ho(
        at - 1_000,
        at + 3_600_000,
        BachHoPace::default(),
        now,
        &mut out,
    );
    bot.on_packet(43, &hex(BH2_BOSS), now, &mut out).unwrap();
    bot.on_packet(43, &hex(BH2_EMPTY), now, &mut out).unwrap();
    let run = bot.snap.bach_ho.clone().unwrap();
    assert!(
        run.done
            .as_deref()
            .is_some_and(|d| d.starts_with("Boss không còn trong hang")),
        "{run:?}"
    );
}

#[test]
fn the_s2c_1275_of_bh2_reads_as_the_games_board_showed_it() {
    let bytes = hex(include_str!("fixtures/bh2-s2c1275.hex").trim());
    assert_eq!(bytes.len(), 551);
    let b = bach_ho_result(&bytes).unwrap();
    // "Boss đã bị tiêu diệt", "Kết liễu: XiaoMeiMei (Bậc 2) 393.717", HP per mille.
    assert_eq!(
        (
            b.state,
            b.hp,
            b.max_hp,
            b.killer.as_str(),
            b.killer_tier,
            b.killer_damage
        ),
        (1, 0, 1000, "XiaoMeiMei", 2, 393_717)
    );
    // The run began at 21:00:00 (Vietnam time).
    assert_eq!(b.session_at, 1_795_269_600_805);
    let tiers: Vec<_> = b
        .tiers
        .iter()
        .map(|t| (t.tier, t.min_level, t.max_level, t.threshold, t.players))
        .collect();
    assert_eq!(
        tiers,
        [
            (1, 30, 50, 3_000, 24),
            (2, 51, 100, 12_000, 53),
            (3, 101, 150, 30_000, 0),
            (4, 151, 0, 30_000, 0)
        ]
    );
    // "Bạn: Bậc 2, hạng 50 … 15.261".
    assert_eq!(
        (b.own_tier, b.own_rank, b.own_damage, b.reached),
        (2, 50, 15_261, true)
    );
    // The ranking of each tier as the box shows it: 10 rows of tier 2, LoveLove first.
    let rows = &b.tiers[1].rows;
    assert_eq!(rows.len(), 10);
    assert_eq!(
        (
            rows[0].rank,
            rows[0].name.as_str(),
            rows[0].level,
            rows[0].damage
        ),
        (1, "LoveLove", 95, 466_247)
    );
    assert_eq!(
        (rows[1].name.as_str(), rows[1].damage),
        ("XiaoMeiMei", 393_717)
    );
    assert!(b.tiers[2].rows.is_empty());
}

#[test]
fn kết_quả_bạch_hổ_goes_on_the_snapshot_and_is_asked_again_on_the_bosss_clock_hits() {
    let (mut bot, mut out, now) = waiting_in_the_cave();
    bot.on_packet(43, &hex(BH2_BOSS), now, &mut out).unwrap();
    let at = epoch_ms();
    bot.bach_ho(
        at - 1_000,
        at + 3_600_000,
        BachHoPace::default(),
        now,
        &mut out,
    );
    bot.on_timer(now, &mut out);
    bot.on_packet(22, &setup(), now, &mut out).unwrap();
    out.clear();
    // A clock hit of the boss (s2c/21): Kết quả Bạch Hổ asked; another within 15 s is not.
    let hit = Writer::new().i32(4).build();
    let _ = bot.on_packet(21, &hit, now, &mut out);
    assert_eq!(
        out.iter()
            .filter(|o| matches!(o, Out::Send(1275, _)))
            .count(),
        1
    );
    out.clear();
    let _ = bot.on_packet(21, &hit, now + Duration::from_secs(5), &mut out);
    assert!(!out.iter().any(|o| matches!(o, Out::Send(1275, _))));
    let _ = bot.on_packet(21, &hit, now + Duration::from_secs(16), &mut out);
    assert!(out.iter().any(|o| matches!(o, Out::Send(1275, _))));
    // Its answer, asked or not, is kept whole for the window, with when it was read.
    let bytes = hex(include_str!("fixtures/bh2-s2c1275.hex").trim());
    bot.on_packet(1275, &bytes, now, &mut out).unwrap();
    let kept = bot.snapshot().bach_ho_result.unwrap();
    assert_eq!((kept.state, kept.own_rank, kept.tiers.len()), (1, 50, 4));
    assert!(kept.read_at_ms >= at);
}

#[test]
fn bach_ho_repairs_a_broken_worn_item_before_its_next_challenge_without_tu_sua_do() {
    let all = common::v();
    let hex_of = |f: &str| {
        hex(all["decoders"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["fn"] == f)
            .unwrap()["hex"]
            .as_str()
            .unwrap())
    };
    let (mut bot, mut out, now) = waiting_in_the_cave();
    // Nón Âu Lạc (gear slot 0) and Rìu Âu Lạc worn out; the bag holds a Búa Sửa Chữa. Tự sửa đồ is off.
    bot.on_packet(9, &hex_of("characterGear"), now, &mut out)
        .unwrap();
    bot.on_packet(42, &hex_of("characterExtra"), now, &mut out)
        .unwrap();
    // mimosa's level, 68 (s2c/10 kind 2 of BH2): Bạch Hổ wants 30.
    bot.on_packet(10, &hex(BH2_LEVEL), now, &mut out).unwrap();
    bot.on_packet(
        29,
        &Writer::new().string("mimosa").string("M24").i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(43, &hex(BH2_BOSS), now, &mut out).unwrap();
    out.clear();
    let at = epoch_ms();
    bot.bach_ho(
        at - 1_000,
        at + 3_600_000,
        BachHoPace::default(),
        now,
        &mut out,
    );
    bot.on_timer(now, &mut out);
    let first = sent(&mut out);
    assert_eq!(first.first().map(|s| s.0), Some(48), "{first:?}");
    assert!(!first.iter().any(|(op, _)| *op == 15));
}

/// mimosa (level 68, s2c/10 of BH2) in Hang Bạch Hổ with the atlas of data/maps.json: the cave's way out (gate 23, type 1)
/// leads to Cổng Luyện Ngục, which has no portal to the other maps, only Sơn Vi to Bản đồ thế giới.
fn stuck_in_the_cave() -> (Bot, Vec<Out>, Instant) {
    let atlas = Atlas::load(&find_upwards("data/maps.json").expect("data/maps.json"));
    let ways = atlas.hops("M24", 68, &Default::default());
    assert_eq!(
        ways.get("M15"),
        Some(&1),
        "gate 23 is a portal once its map is measured"
    );
    assert!(
        !ways.contains_key("M2"),
        "a portal way out of Luyện Ngục was learnt: the test wants none"
    );
    let (mut bot, mut out, now) = (
        Bot::new(BotOptions::default(), Arc::new(atlas)),
        vec![],
        Instant::now(),
    );
    bot.on_packet(10, &hex(BH2_LEVEL), now, &mut out).unwrap();
    bot.on_packet(
        29,
        &Writer::new().string("mimosa").string("M24").i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    out.clear();
    (bot, out, now)
}

#[test]
fn doi_map_out_of_the_cave_jumps_through_the_world_map_then_ends_there() {
    let (mut bot, mut out, now) = stuck_in_the_cave();
    // Trại Vân Sơn has no known portal way from the cave: offered through Bản đồ thế giới, one hop.
    let m2 = bot
        .snapshot()
        .maps
        .into_iter()
        .find(|m| m.map_id == "M2")
        .unwrap();
    assert_eq!((m2.hops, m2.warp), (Some(1), true));
    bot.go_to("M2", now, &mut out);
    assert!(out.iter().any(
        |o| matches!(o, Out::Log(_, l) if l == "Không có đường qua cổng từ đây: qua Bản đồ thế giới tới Trại Vân Sơn")
    ));
    assert!(sent(&mut out).contains(&(11, "000000034d393900ffffffff".into())));
    // Its s2c/11 (flag 0): c2s/13 ("M99", 1), M2 being line 1.
    bot.on_packet(
        11,
        &Writer::new().u8(0).string("M99").i32(0).i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(sent(&mut out), vec![(13, "000000034d393900000001".into())]);
    bot.on_packet(13, &hex("000000024d320000000100ff"), now, &mut out)
        .unwrap();
    bot.on_packet(43, &Writer::new().string("M2").u8(3).build(), now, &mut out)
        .unwrap();
    bot.on_timer(now + Duration::from_secs(2), &mut out);
    assert!(
        out.iter()
            .any(|o| matches!(o, Out::Log(_, l) if l == "Kết thúc: đã tới Trại Vân Sơn")),
        "{out:?}"
    );
    assert!(bot.snap.moving.is_none());
}

#[test]
fn a_quest_run_in_the_cave_jumps_through_the_world_map_to_its_mob_and_fights_it() {
    let (mut bot, mut out, now) = stuck_in_the_cave();
    // The cave's mobs (none after the boss), then a kill step of Gà Điên, which the atlas puts in Làng Thanh Khê.
    bot.on_packet(43, &hex(BH2_EMPTY), now, &mut out).unwrap();
    let quest = Writer::new()
        .i32(3)
        .string("Gà Điên")
        .string("")
        .string("main")
        .i32(0)
        .i32(0)
        .i32(1)
        .i32(0)
        .string("Tiêu diệt Gà Điên")
        .i32(0)
        .i32(5)
        .i32(-1)
        .build();
    bot.on_packet(39, &quest, now, &mut out).unwrap();
    out.clear();
    bot.quest(1, None, now, &mut out);
    assert!(
        out.iter().any(|o| matches!(o, Out::Log(_, l) if l.contains("không có đường qua cổng từ M24, qua Bản đồ thế giới tới Làng Thanh Khê"))),
        "{out:?}"
    );
    assert!(sent(&mut out).contains(&(11, "000000034d393900ffffffff".into())));
    // A timer of the run while the jump is under way sends nothing more.
    bot.on_timer(now + Duration::from_millis(500), &mut out);
    assert!(sent(&mut out).iter().all(|(op, _)| *op != 11 && *op != 13));
    // Bản đồ thế giới (flag 0): c2s/13 ("M99", 0), M1 being line 0; then M1 and its mobs.
    bot.on_packet(
        11,
        &Writer::new().u8(0).string("M99").i32(0).i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(sent(&mut out), vec![(13, "000000034d393900000000".into())]);
    bot.on_packet(13, &hex("000000024d310000000000ff"), now, &mut out)
        .unwrap();
    let mobs = Writer::new()
        .string("M1")
        .u8(3)
        .string("mob10")
        .string("Gà Điên")
        .i32(1)
        .u8(4)
        .i32(1)
        .i32(1)
        .u8(0)
        .build();
    bot.on_packet(43, &mobs, now, &mut out).unwrap();
    out.clear();
    bot.on_timer(now + Duration::from_secs(2), &mut out);
    assert!(
        sent(&mut out).contains(&(15, "000000056d6f62313001".into())),
        "Gà Điên challenged on arrival"
    );
}

/// After a battle the next try waits for the answer of Kết quả Bạch Hổ (not for a peek's): an answer with the boss still
/// there lets it go at once (Chờ vào trận lại 0), one with the boss killed ends the run, even when the answer of a peek
/// sent during the battle comes in first.
#[test]
fn the_next_try_waits_for_the_answer_asked_after_the_battle_not_a_peeks() {
    let try_now = |bot: &mut Bot, at: Instant, out: &mut Vec<Out>| {
        bot.on_timer(at, out);
        sent(out).iter().any(|(op, _)| *op == 15)
    };
    // The boss still there: no try before the answer, one at once after it.
    let (mut bot, mut out, now) = in_the_cave();
    let at = epoch_ms();
    bot.bach_ho(
        at - 1_000,
        at + 3_600_000,
        BachHoPace::default(),
        now,
        &mut out,
    );
    bot.on_timer(now, &mut out);
    bot.on_packet(22, &setup(), now, &mut out).unwrap();
    let end = now + Duration::from_secs(20);
    bot.on_packet(19, &lost_battle(), end, &mut out).unwrap();
    out.clear();
    assert!(
        !try_now(&mut bot, end + Duration::from_millis(500), &mut out),
        "the answer first"
    );
    bot.on_packet(
        1275,
        &result_bytes(0),
        end + Duration::from_millis(600),
        &mut out,
    )
    .unwrap();
    assert!(
        try_now(&mut bot, end + Duration::from_millis(600), &mut out),
        "at once after it"
    );

    // A peek during the battle, then the battle's end: the peek's answer (boss on) comes first, the battle's (killed)
    // second, and the run ends on it.
    let (mut bot, mut out, now) = in_the_cave();
    bot.bach_ho(
        at - 1_000,
        at + 3_600_000,
        BachHoPace::default(),
        now,
        &mut out,
    );
    bot.on_timer(now, &mut out);
    bot.on_packet(22, &setup(), now, &mut out).unwrap();
    out.clear();
    // The peek 1 s before the battle's end: its answer is still on the way when the battle ends.
    let end = now + Duration::from_secs(20);
    let _ = bot.on_packet(
        21,
        &Writer::new().i32(4).build(),
        end - Duration::from_secs(1),
        &mut out,
    );
    assert!(
        out.iter().any(|o| matches!(o, Out::Send(1275, _))),
        "peeked"
    );
    bot.on_packet(19, &lost_battle(), end, &mut out).unwrap();
    out.clear();
    bot.on_packet(1275, &result_bytes(0), end, &mut out)
        .unwrap();
    assert!(
        !out.iter().any(|o| matches!(o, Out::Log(..))),
        "the peek's answer is read quietly"
    );
    bot.on_packet(1275, &result_bytes(1), end, &mut out)
        .unwrap();
    assert!(
        bot.snap.bach_ho.as_ref().unwrap().done.is_some(),
        "ended on the battle's answer"
    );
    assert!(!try_now(&mut bot, end + Duration::from_secs(5), &mut out));
}

/// s2c/21 of the Bạch Hổ kill as mokali's app got it (21/11, cllt.db): its refill (3 pieces, with the reshuffle flag and
/// 3 bytes after) is read, so the battle ends won instead of failing at byte 17 and being dropped.
#[test]
fn the_s2c_21_of_the_kill_reads_with_its_refill() {
    let bytes = hex(include_str!("fixtures/bh-s2c21-kill.hex").trim());
    let x = cllt_core::battle::timeout_result(&bytes).unwrap();
    assert_eq!((x.seq, x.refill.as_slice()), (39, &[2, 5, 70][..]));
    assert_eq!(x.actor, "mob800");
    assert!(x.end);
    assert!(x.reward.unwrap().won);
}

/// The review of 22/11: an s2c/43 with the boss while the next try waits for the answer does not start it early; a
/// peek never answered is dropped at the battle's end, so the battle's answer (boss killed) still ends the run; the
/// clock hit that ends the battle with a refill is not a board out of step.
#[test]
fn the_wait_after_a_battle_holds_against_a_push_and_a_lost_peek() {
    let at = epoch_ms();
    let boss = hex(BH2_BOSS);
    // A push of the cave with the boss right after the battle: no try before the answer.
    let (mut bot, mut out, now) = in_the_cave();
    bot.bach_ho(
        at - 1_000,
        at + 3_600_000,
        BachHoPace::default(),
        now,
        &mut out,
    );
    bot.on_timer(now, &mut out);
    bot.on_packet(22, &setup(), now, &mut out).unwrap();
    let end = now + Duration::from_secs(20);
    bot.on_packet(19, &lost_battle(), end, &mut out).unwrap();
    bot.on_packet(43, &boss, end, &mut out).unwrap();
    out.clear();
    bot.on_timer(end + Duration::from_millis(100), &mut out);
    assert!(
        !sent(&mut out).iter().any(|(op, _)| *op == 15),
        "waits for the answer"
    );

    // A peek at 5 s never answered; the battle ends at 20 s; its answer says the boss is dead: the run ends.
    let (mut bot, mut out, now) = in_the_cave();
    bot.bach_ho(
        at - 1_000,
        at + 3_600_000,
        BachHoPace::default(),
        now,
        &mut out,
    );
    bot.on_timer(now, &mut out);
    bot.on_packet(22, &setup(), now, &mut out).unwrap();
    let _ = bot.on_packet(
        21,
        &Writer::new().i32(4).build(),
        now + Duration::from_secs(5),
        &mut out,
    );
    let end = now + Duration::from_secs(20);
    bot.on_packet(19, &lost_battle(), end, &mut out).unwrap();
    bot.on_packet(1275, &result_bytes(1), end, &mut out)
        .unwrap();
    assert!(bot.snap.bach_ho.as_ref().unwrap().done.is_some(), "ended");

    // The kill's clock hit (refill, no cells): the battle ends without a line of the board out of step.
    let (mut bot, mut out, now) = in_the_cave();
    bot.bach_ho(
        at - 1_000,
        at + 3_600_000,
        BachHoPace::default(),
        now,
        &mut out,
    );
    bot.on_timer(now, &mut out);
    bot.on_packet(22, &setup(), now, &mut out).unwrap();
    out.clear();
    let kill = hex(include_str!("fixtures/bh-s2c21-kill.hex").trim());
    let _ = bot.on_packet(21, &kill, now + Duration::from_secs(20), &mut out);
    assert!(
        !out.iter()
            .any(|o| matches!(o, Out::Log(_, l) if l.contains("lệch"))),
        "{out:?}"
    );
    assert!(
        out.iter().any(|o| matches!(o, Out::Battle(_))),
        "the battle is saved"
    );
}

/// A battle with the boss without a packet for 90 s is left (Đầu hàng), and the run tries again after s2c/1214.
#[test]
fn a_stuck_battle_with_the_boss_is_left_and_the_run_tries_again() {
    let (mut bot, mut out, now) = in_the_cave();
    let at = epoch_ms();
    bot.bach_ho(
        at - 1_000,
        at + 3_600_000,
        BachHoPace::default(),
        now,
        &mut out,
    );
    bot.on_timer(now, &mut out);
    assert!(sent(&mut out).iter().any(|(op, _)| *op == 15));
    bot.on_packet(22, &setup(), now, &mut out).unwrap();
    out.clear();
    let quiet = now + Duration::from_secs(91);
    while let Some(d) = bot.deadline().filter(|d| *d <= quiet) {
        bot.on_timer(d, &mut out);
    }
    assert!(sent(&mut out).iter().any(|(op, _)| *op == 40), "left");
    bot.on_packet(1214, &[], quiet, &mut out).unwrap();
    assert_eq!(bot.snap.bach_ho.as_ref().unwrap().battles, 1);
    out.clear();
    let later = quiet + Duration::from_secs(2);
    while let Some(d) = bot.deadline().filter(|d| *d <= later) {
        bot.on_timer(d, &mut out);
    }
    assert!(
        sent(&mut out).iter().any(|(op, _)| *op == 15),
        "the boss challenged again"
    );
}

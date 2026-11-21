//! Bạch Hổ (bot/bachho.rs): the way to the cave through Bản đồ thế giới as LN1 recorded it (17-bach-ho.md,
//! 19-luyen-nguc.md). The fight itself is not measured yet.
use cllt_core::atlas::Atlas;
use cllt_core::bot::{bach_ho_result, Bot, BotOptions, Out};
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
    bot.bach_ho(at - 1_000, at + 3_600_000, now, &mut out);
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

    // Lost: counted, saved as any battle, and 1.5 s later the boss is challenged again.
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
    bot.bach_ho(at - 1_000, at + 3_600_000, now, &mut out);
    bot.on_timer(now, &mut out);
    bot.on_packet(22, &setup(), now, &mut out).unwrap();
    bot.on_packet(19, &lost_battle(), now, &mut out).unwrap();
    out.clear();
    // Under way: the place goes on the run, the log says the HP, the run goes on.
    let mut going = result_bytes(0);
    going[9..13].copy_from_slice(&250_000i32.to_be_bytes());
    bot.on_packet(1275, &going, now, &mut out).unwrap();
    assert!(out
        .iter()
        .any(|o| matches!(o, Out::Log(_, l) if l.contains("Bạch Hổ còn 50% máu"))));
    let run = bot.snap.bach_ho.clone().unwrap();
    assert_eq!(
        run.standing.as_deref(),
        Some("Bậc 2 (cấp 60+), hạng 4, 31.000 sát thương")
    );
    assert!(run.done.is_none());
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
    bot.bach_ho(at - 1_000, at + 3_600_000, now, &mut out);
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

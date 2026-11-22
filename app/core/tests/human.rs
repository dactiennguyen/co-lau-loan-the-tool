//! Nhịp như người chơi (human.rs, bot/reload.rs, BotOptions::human): the packets of the bot in the order and with the gaps
//! of the game 1.1.1 (Frida, 22/11): c2s/11 with the map's index, c2s/15 flag 1, the map reloaded after every battle
//! before its drops and the next challenge, Đầu hàng, and the gaps of a turn battle.
use cllt_core::atlas::Atlas;
use cllt_core::battle::{self, Board, N};
use cllt_core::bot::{Bot, BotOptions, Out};
use cllt_core::human::{self, Human};
use cllt_core::protocol::Writer;
use cllt_core::requests::{build, Ctx};
use cllt_core::runner::Act;
use cllt_core::runner_v3::{BattleRunner, RunnerOptions};
use cllt_core::world::MapLoads;
use std::sync::Arc;
use std::time::{Duration, Instant};

mod common;
use common::{hex, tohex, v};

fn location(map_id: &str, index: i32) -> Vec<u8> {
    Writer::new()
        .string("manina")
        .string(map_id)
        .i32(index)
        .build()
}
/// The head of s2c/11 for `map_id` in `zone` (its NPCs and portals do not read: the atlas is left alone).
fn map_head(map_id: &str, zone: u8) -> Vec<u8> {
    Writer::new()
        .u8(1)
        .string(map_id)
        .string("Map")
        .u8(zone)
        .i32(2784)
        .i32(864)
        .build()
}
fn mobs_of(map_id: &str) -> Vec<u8> {
    Writer::new()
        .string(map_id)
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
/// s2c/13 after a portal: the map, its index, 0, 0xff (B5).
fn portal(map_id: &str, index: i32) -> Vec<u8> {
    Writer::new()
        .string(map_id)
        .i32(index)
        .u8(0)
        .u8(0xff)
        .build()
}
fn ask11(map_id: &str, zone: Option<i32>, map_index: i32) -> String {
    let ctx = Ctx {
        map_id: Some(map_id),
        zone,
        map_index: Some(map_index),
        ..Ctx::default()
    };
    tohex(&build(11, &ctx).unwrap())
}
fn sends(out: &[Out]) -> Vec<(i32, String)> {
    out.iter()
        .filter_map(|o| match o {
            Out::Send(op, p) => Some((*op, tohex(p))),
            _ => None,
        })
        .collect()
}
/// s2c/19 ending the battle against mob61000, lost or won (as lost_battle of pace.rs).
fn end_of_battle(won: bool) -> Vec<u8> {
    let w = Writer::new()
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
        .u8(1);
    match won {
        true => w.u8(1).i32(142).i32(18).build(),
        false => w.u8(0).i32(0).i32(0).build(),
    }
}
/// s2c/1182 of an item fallen in M2.
fn drop_in(uuid: &str) -> Vec<u8> {
    Writer::new()
        .string("M2")
        .u8(0xfe)
        .i32(41)
        .string(uuid)
        .i32(0)
        .i32(-1)
        .i32(10)
        .u8(0)
        .u8(0xff)
        .i32(0)
        .u8(0)
        .u8(0)
        .u8(0)
        .i32(1400)
        .i32(640)
        .i32(417)
        .i32(0)
        .build()
}
/// manina in M2 khu 0 (index 1, loaded at the login) with Cóc Xanh around, `human` as its pace; and the s2c/22 of a
/// battle against it.
fn manina(human: Human) -> (Bot, Vec<Out>, Instant, Vec<u8>) {
    let setup = hex(v()["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["fn"] == "battleSetup")
        .unwrap()["hex"]
        .as_str()
        .unwrap());
    let options = BotOptions {
        human,
        ..BotOptions::default()
    };
    let (mut bot, mut out, now) = (
        Bot::new(options, Arc::new(Atlas::default())),
        vec![],
        Instant::now(),
    );
    bot.on_packet(29, &location("M2", 1), now, &mut out)
        .unwrap();
    bot.on_packet(11, &map_head("M2", 0), now, &mut out)
        .unwrap();
    bot.on_packet(43, &mobs_of("M2"), now, &mut out).unwrap();
    out.clear();
    (bot, out, now, setup)
}
/// Every timer of the bot up to `until`, with the sends of each and when.
fn run_to(bot: &mut Bot, until: Instant) -> Vec<(Instant, i32, String)> {
    let mut seen = vec![];
    while let Some(d) = bot.deadline().filter(|d| *d <= until) {
        let mut out = vec![];
        bot.on_timer(d, &mut out);
        seen.extend(sends(&out).into_iter().map(|(op, p)| (d, op, p)));
    }
    seen
}

#[test]
fn c2s_11_carries_ff_and_minus_1_on_a_first_load_the_index_once_loaded_the_new_zone_and_m99_as_0_and_minus_1(
) {
    let mut maps = MapLoads::default();
    maps.on(29, &location("M15", 14));
    assert_eq!(maps.map_index("M15"), -1, "the login's first load");
    maps.on(11, &map_head("M15", 0));
    maps.on(13, &portal("M24", 23));
    assert_eq!(maps.map_index("M24"), -1, "a map not loaded yet");
    maps.on(11, &map_head("M24", 0));
    maps.on(13, &portal("M15", 14));
    // Back through a portal to M15: "M15" ff 0000000e as the game 1.1.1.
    assert_eq!(
        ask11("M15", None, maps.map_index("M15")),
        "000000034d3135ff0000000e"
    );
    // A zone change in M11: "M11" 01 0000000a; after a battle in M12: "M12" 00 0000000b.
    assert_eq!(ask11("M11", Some(1), 10), "000000034d3131010000000a");
    assert_eq!(ask11("M12", Some(0), 11), "000000034d3132000000000b");
    // Bản đồ thế giới, whatever else is asked.
    assert_eq!(ask11("M99", Some(3), 98), "000000034d393900ffffffff");
}

#[test]
fn every_challenge_goes_with_flag_1_as_the_attack_button_of_the_game() {
    let (mut bot, mut out, now, _) = manina(Human::Off);
    bot.fight("Cóc Xanh", 1, 1, now, &mut out);
    assert_eq!(
        sends(&out),
        [(15, "000000086d6f62363130303001".to_string())]
    );
}

#[test]
fn after_a_won_battle_the_map_is_reloaded_then_its_drops_picked_up_then_the_next_challenge() {
    let (mut bot, mut out, entered, setup) = manina(Human::seeded(3));
    // After the walk to the mob that follows s2c/43 (CHALLENGE_AFTER_ENTITIES, at most 4 s).
    let now = entered + Duration::from_secs(4);
    bot.fight("Cóc Xanh", 5, 5, now, &mut out);
    assert_eq!(sends(&out).last().unwrap().0, 15);
    // c2s/18 1.1–1.6 s after s2c/22.
    out.clear();
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    assert!(sends(&out).is_empty(), "{out:?}");
    let join = run_to(&mut bot, now + Duration::from_millis(1600));
    assert_eq!(join.iter().map(|s| s.1).collect::<Vec<_>>(), [18]);
    assert!(join[0].0 >= now + Duration::from_millis(1100));
    // The battle ends with its drop: nothing goes at once, neither the pickup nor c2s/11.
    let end = now + Duration::from_secs(10);
    out.clear();
    bot.on_packet(1182, &drop_in("gold"), end, &mut out)
        .unwrap();
    bot.on_packet(19, &end_of_battle(true), end, &mut out)
        .unwrap();
    assert!(sends(&out).is_empty(), "{out:?}");
    // c2s/11 of the map stood in, its zone and index, 2.4–4.7 s after the end; nothing before it.
    let before = run_to(&mut bot, end + Duration::from_millis(4700));
    assert_eq!(before.len(), 1, "{before:?}");
    let (at, op, payload) = before[0].clone();
    assert_eq!((op, payload.as_str()), (11, "000000024d320000000001"));
    assert!(at >= end + Duration::from_millis(2400), "{:?}", at - end);
    // Its s2c/11 clears the ground of the zone, not the drop queued: c2s/43 0.3–0.8 s later, then the pickup.
    out.clear();
    bot.on_packet(11, &map_head("M2", 0), at, &mut out).unwrap();
    assert!(sends(&out).is_empty(), "{out:?}");
    let after = run_to(&mut bot, at + Duration::from_millis(800));
    let ops: Vec<i32> = after.iter().map(|s| s.1).collect();
    assert_eq!(ops, [43, 1188], "{after:?}");
    assert!(after[0].0 >= at + Duration::from_millis(300));
    let pickup = Ctx {
        uuid: Some("gold"),
        ..Ctx::default()
    };
    assert_eq!(after[1].2, tohex(&build(1188, &pickup).unwrap()));
    // The mobs of the reload, then the next challenge after the pickup.
    let t = after[0].0;
    bot.on_packet(43, &mobs_of("M2"), t, &mut out).unwrap();
    let next = run_to(&mut bot, t + Duration::from_secs(5));
    assert_eq!(next.first().map(|s| s.1), Some(15), "{next:?}");
    assert!(next[0].0 > after[1].0);
}

#[test]
fn a_lost_battle_reloads_too_zero_keeps_the_order_without_waits_and_off_keeps_the_old_3_s() {
    let (mut bot, mut out, now, setup) = manina(Human::Zero);
    bot.fight("Cóc Xanh", 5, 5, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    out.clear();
    bot.on_packet(19, &end_of_battle(false), now, &mut out)
        .unwrap();
    assert_eq!(
        sends(&out),
        [(11, "000000024d320000000001".to_string())],
        "c2s/11 at once"
    );
    out.clear();
    bot.on_packet(11, &map_head("M2", 0), now, &mut out)
        .unwrap();
    assert_eq!(sends(&out), [(43, "000000024d32".to_string())]);
    let next = run_to(&mut bot, now + Duration::from_secs(3));
    assert_eq!(
        next.iter().map(|s| (s.0 - now, s.1)).collect::<Vec<_>>(),
        [(Duration::from_secs(3), 15)]
    );

    let (mut bot, mut out, now, setup) = manina(Human::Off);
    bot.fight("Cóc Xanh", 5, 5, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    out.clear();
    bot.on_packet(19, &end_of_battle(false), now, &mut out)
        .unwrap();
    assert!(sends(&out).is_empty());
    let next = run_to(&mut bot, now + Duration::from_secs(3));
    assert_eq!(next.iter().map(|s| s.1).collect::<Vec<_>>(), [15]);
}

#[test]
fn a_reload_whose_map_never_comes_goes_on_after_8_s() {
    let (mut bot, mut out, now, setup) = manina(Human::Zero);
    bot.fight("Cóc Xanh", 5, 5, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    bot.on_packet(19, &end_of_battle(false), now, &mut out)
        .unwrap();
    let next = run_to(&mut bot, now + Duration::from_secs(9));
    assert_eq!(
        next.iter().map(|s| (s.0 - now, s.1)).collect::<Vec<_>>(),
        [(Duration::from_millis(8200), 15)]
    );
}

#[test]
fn dau_hang_sends_the_zone_and_index_with_c2s_40_and_c2s_43_after_s2c_1214_not_after_s2c_11() {
    let (mut bot, mut out, entered, setup) = manina(Human::seeded(8));
    let now = entered + Duration::from_secs(4);
    bot.fight("Cóc Xanh", 5, 5, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    let uuid = battle::battle_setup(&setup).unwrap().uuid;
    run_to(&mut bot, now + Duration::from_millis(1600));
    out.clear();
    bot.stop(true, now + Duration::from_secs(2), &mut out);
    assert_eq!(
        sends(&out),
        [
            (11, "000000024d320000000001".to_string()),
            (40, tohex(&Writer::new().string(&uuid).build())),
        ]
    );
    let t = now + Duration::from_secs(2);
    out.clear();
    bot.on_packet(11, &map_head("M2", 0), t, &mut out).unwrap();
    assert!(sends(&out).is_empty(), "{out:?}");
    bot.on_packet(1214, &[], t, &mut out).unwrap();
    assert!(sends(&out).is_empty(), "{out:?}");
    let after = run_to(&mut bot, t + Duration::from_secs(1));
    assert_eq!(after.iter().map(|s| s.1).collect::<Vec<_>>(), [43]);
    let gap = after[0].0 - t;
    assert!(
        (Duration::from_millis(500)..=Duration::from_millis(700)).contains(&gap),
        "{gap:?}"
    );
}

fn turn_of(seq: i32, own: bool) -> Vec<u8> {
    Writer::new().i32(seq).i32(0).u8(own as u8).u8(0).build()
}
fn acts_sent(acts: &[Act]) -> Vec<i32> {
    acts.iter()
        .filter_map(|a| match a {
            Act::Send(op, _) => Some(*op),
            _ => None,
        })
        .collect()
}
/// A turn battle of manina on the board of the first captured battle, with `human` as its pace.
fn runner(human: Human, turn_delay: Duration) -> BattleRunner {
    let mut b: Board = [0; N * N];
    for (i, x) in v()["battles"][0]["board"]
        .as_array()
        .unwrap()
        .iter()
        .enumerate()
    {
        b[i] = x.as_i64().unwrap() as i16;
    }
    let setup = battle::Setup {
        me: "manina".into(),
        level: 3,
        hp: 120,
        max_hp: 130,
        uuid: "u".into(),
        board: b.to_vec(),
        turn_seconds: 30,
    };
    let options = RunnerOptions {
        human,
        turn_delay,
        ..RunnerOptions::default()
    };
    BattleRunner::new(&setup, "mob872604", options)
}

#[test]
fn a_turn_battle_waits_like_the_game_before_c2s_18_c2s_14_and_an_own_move() {
    let now = Instant::now();
    let (mut r, mut acts) = (runner(Human::seeded(4), Duration::ZERO), vec![]);
    r.start(now, &mut acts);
    assert!(acts_sent(&acts).is_empty());
    let join = r.deadline().unwrap() - now;
    assert!(
        (Duration::from_millis(1100)..=Duration::from_millis(1600)).contains(&join),
        "{join:?}"
    );
    r.on_timer(now + join, &mut acts);
    assert_eq!(acts_sent(&acts), [18]);
    // The mob's turn with no cascade of ours before it: c2s/14 within 10–40 ms.
    acts.clear();
    r.on_packet(24, &turn_of(3, false), now, &mut acts).unwrap();
    assert!(acts_sent(&acts).is_empty());
    let step = r.deadline().unwrap() - now;
    assert!(
        (Duration::from_millis(10)..=Duration::from_millis(40)).contains(&step),
        "{step:?}"
    );
    r.on_timer(now + step, &mut acts);
    assert_eq!(acts_sent(&acts), [14]);
    // An own turn: never within 1.2 s, nor sooner than Chờ trước mỗi lượt đi when that is longer.
    acts.clear();
    r.on_packet(24, &turn_of(4, true), now, &mut acts).unwrap();
    let own = r.deadline().unwrap() - now;
    assert!(
        (Duration::from_millis(1200)..=Duration::from_millis(2600)).contains(&own),
        "{own:?}"
    );
    let (mut slow, mut acts2) = (runner(Human::seeded(4), Duration::from_secs(3)), vec![]);
    slow.on_packet(24, &turn_of(4, true), now, &mut acts2)
        .unwrap();
    assert_eq!(slow.deadline(), Some(now + Duration::from_secs(3)));
    // Off: at once, as before.
    let (mut off, mut acts3) = (runner(Human::Off, Duration::ZERO), vec![]);
    off.start(now, &mut acts3);
    off.on_packet(24, &turn_of(3, false), now, &mut acts3)
        .unwrap();
    assert_eq!(acts_sent(&acts3), [18, 14]);
}

#[test]
fn no_challenge_within_the_walk_to_the_mob_after_its_s2c_43() {
    let (mut bot, mut out, now, _) = manina(Human::seeded(4));
    bot.fight("Cóc Xanh", 5, 5, now, &mut out);
    assert!(
        sends(&out).is_empty(),
        "no c2s/15 at once after s2c/43: {out:?}"
    );
    let early = run_to(&mut bot, now + Duration::from_millis(1499));
    assert!(early.is_empty(), "not within 1.5 s: {early:?}");
    let walk = run_to(&mut bot, now + Duration::from_secs(4));
    assert_eq!(walk.iter().map(|s| s.1).collect::<Vec<_>>(), [15]);
}

#[test]
fn a_battle_opened_with_timed_1_moves_first_after_first_move_and_turns_into_a_turn_battle_on_its_first_s2c_24(
) {
    let now = Instant::now();
    let (mut r, mut acts) = (runner(Human::seeded(6), Duration::ZERO), vec![]);
    r.start(now, &mut acts);
    let join = r.deadline().unwrap();
    r.on_timer(join, &mut acts);
    acts.clear();
    // s2c/18 `i32 0; u8 timed 1; u8 0` (every challenge with c2s/15 flag 1, game 1.1.1): the player moves first.
    r.on_packet(
        18,
        &Writer::new().i32(0).u8(1).u8(0).build(),
        now,
        &mut acts,
    )
    .unwrap();
    assert!(r.timed);
    assert!(
        acts_sent(&acts).is_empty(),
        "the player looks at the board first"
    );
    let first = r.deadline().unwrap() - now;
    assert!(
        (Duration::from_millis(1200)..=Duration::from_millis(2600)).contains(&first),
        "{first:?}"
    );
    r.on_timer(now + first, &mut acts);
    assert_eq!(acts_sent(&acts), [19]);
    // Its first s2c/24: a turn battle from here, an own turn of a turn battle (never within OWN_MOVE_MIN).
    acts.clear();
    let later = now + Duration::from_secs(5);
    r.on_packet(24, &turn_of(2, true), later, &mut acts)
        .unwrap();
    assert!(!r.timed);
    let own = r.deadline().unwrap() - later;
    assert!(
        own >= human::OWN_MOVE_MIN && own <= Duration::from_millis(2600),
        "{own:?}"
    );
}

/// s2c/19 of manina's own swap `seq`, the battle going on (the mob's turn next).
fn own_swap(seq: i32) -> Vec<u8> {
    Writer::new()
        .i32(seq)
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
        .string("manina")
        .u8(0)
        .build()
}

#[test]
fn with_the_pace_off_a_battle_opened_with_timed_1_waits_for_a_late_s2c_24_before_a_second_swap() {
    // 2.2.5 hung battles: the s2c/24 of the mob's turn came ~1.1 s after the first move's s2c/19 (cascades), later than
    // timed_move, and the second swap on the timer went in the mob's turn.
    let now = Instant::now();
    let (mut r, mut acts) = (runner(Human::Off, Duration::ZERO), vec![]);
    r.start(now, &mut acts);
    acts.clear();
    r.on_packet(
        18,
        &Writer::new().i32(0).u8(1).u8(0).build(),
        now,
        &mut acts,
    )
    .unwrap();
    assert_eq!(
        acts_sent(&acts),
        [19],
        "the pace off, the first move at once"
    );
    acts.clear();
    r.on_packet(19, &own_swap(1), now, &mut acts).unwrap();
    assert!(acts_sent(&acts).is_empty());
    assert!(r.deadline().unwrap() - now >= human::TURN_OR_TIMED);
    let late = now + Duration::from_millis(1100);
    r.on_timer(late, &mut acts);
    assert!(acts_sent(&acts).is_empty(), "no swap before the s2c/24");
    r.on_packet(24, &turn_of(1, false), late, &mut acts)
        .unwrap();
    assert!(!r.timed);
    assert_eq!(
        acts_sent(&acts),
        [14],
        "the mob's turn, no swap of ours in it"
    );
}

#[test]
fn a_battle_without_a_packet_for_90_s_is_left_so_the_job_goes_on() {
    let (mut bot, mut out, now, setup) = manina(Human::Off);
    bot.fight("Cóc Xanh", 5, 5, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    // s2c/18 timed 1: the first move at once, then the battle goes quiet.
    bot.on_packet(18, &Writer::new().i32(0).u8(1).u8(0).build(), now, &mut out)
        .unwrap();
    let quiet = run_to(&mut bot, now + Duration::from_secs(89));
    assert!(quiet.iter().all(|s| s.1 != 40), "{quiet:?}");
    let left = run_to(&mut bot, now + Duration::from_secs(91));
    assert!(left.iter().any(|s| s.1 == 40), "{left:?}");
}

//! Vào khu ít người (FightSettings::quiet_zone, Bot::job_zone, 23/11/2026): before the first battle of a fight job on a
//! map, the zone list (c2s/1172) is asked and the character goes to the zone of 10 to 12 with the fewest players, a tie
//! drawn at random (c2s/1173), then fights there; it stays when it already stands in one of the quietest; not for a
//! boss.
use cllt_core::atlas::{find_upwards, Atlas};
use cllt_core::bot::{Bot, BotOptions, FightSettings, LogKind, Out};
use cllt_core::protocol::Writer;
use std::sync::Arc;
use std::time::Instant;

fn travel_logs(out: &[Out]) -> Vec<String> {
    out.iter()
        .filter_map(|o| match o {
            Out::Log(LogKind::Travel, t) => Some(t.clone()),
            _ => None,
        })
        .collect()
}

fn gà_điên() -> Vec<u8> {
    Writer::new()
        .string("M1")
        .u8(0)
        .string("mob10")
        .string("Gà Điên")
        .i32(1)
        .u8(4)
        .i32(1)
        .i32(1)
        .u8(0)
        .build()
}

/// A bot on M1 zone `zone`, its mobs in, with Vào khu ít người on (10 to 12).
fn on_m1(zone: i32) -> (Bot, Vec<Out>, Instant) {
    let atlas = Atlas::load(&find_upwards("data/maps.json").expect("data/maps.json"));
    let mut bot = Bot::new(BotOptions::default(), Arc::new(atlas));
    let (now, mut out) = (Instant::now(), vec![]);
    bot.on_packet(
        29,
        &Writer::new().string("akaito").string("M1").i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(
        13,
        &Writer::new().string("M1").i32(zone).build(),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(43, &gà_điên(), now, &mut out).unwrap();
    assert_eq!(bot.snap.zone, zone);
    let settings = FightSettings {
        quiet_zone: true,
        ..FightSettings::default()
    };
    bot.set_fight(settings, now, &mut out);
    out.clear();
    (bot, out, now)
}

/// Zones 0 (2 players), 10 (8), 11 (3), 12 (3), 13 (0): 13 is out of 10–12, so 11 or 12.
fn zones() -> Vec<u8> {
    let mut list = Writer::new().u8(5);
    for (zone, players) in [(0, 2), (10, 8), (11, 3), (12, 3), (13, 0)] {
        list = list.u8(zone).u8(0).u8(players).u8(20);
    }
    list.build()
}

#[test]
fn a_fight_job_goes_to_the_quietest_zone_of_10_to_12_then_fights_there() {
    let (mut bot, mut out, mut now) = on_m1(0);
    bot.fight("Gà Điên", 5, 1, now, &mut out);
    assert!(
        out.iter().any(|o| matches!(o, Out::Send(1172, _))),
        "the zone list first: {out:?}"
    );
    assert!(!out.iter().any(|o| matches!(o, Out::Send(15, _))));
    bot.on_packet(1172, &zones(), now, &mut out).unwrap();
    now = bot.deadline().unwrap();
    out.clear();
    bot.on_timer(now, &mut out);
    let to = out.iter().find_map(|o| match o {
        Out::Send(1173, p) => Some(p.clone()),
        _ => None,
    });
    let zone = *to.expect("c2s/1173").last().unwrap() as i32;
    assert!(zone == 11 || zone == 12, "zone {zone}");
    let logs = travel_logs(&out);
    assert_eq!(
        logs[0],
        format!("Vào khu ít người: khu {zone} có 3/20 người, ít nhất trong khu 10–12")
    );
    assert!(!out.iter().any(|o| matches!(o, Out::Send(15, _))));
    // There: s2c/13 with the zone, its mobs; the job fights on.
    bot.on_packet(
        13,
        &Writer::new().string("M1").i32(zone).build(),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(43, &gà_điên(), now, &mut out).unwrap();
    out.clear();
    now = bot.deadline().unwrap();
    bot.on_timer(now, &mut out);
    assert!(out.iter().any(|o| matches!(o, Out::Send(15, _))), "{out:?}");
}

#[test]
fn in_one_of_the_quietest_it_stays_and_off_it_never_asks() {
    let (mut bot, mut out, mut now) = on_m1(12);
    bot.fight("Gà Điên", 5, 1, now, &mut out);
    bot.on_packet(1172, &zones(), now, &mut out).unwrap();
    now = bot.deadline().unwrap();
    out.clear();
    bot.on_timer(now, &mut out);
    assert!(!out.iter().any(|o| matches!(o, Out::Send(1173, _))));
    assert!(
        out.iter().any(|o| matches!(o, Out::Send(15, _))),
        "zone 12 has 3 players, as few as any: {out:?}"
    );

    // Off: no list, the first challenge at once.
    let (mut bot, mut out, now) = on_m1(0);
    bot.set_fight(FightSettings::default(), now, &mut out);
    out.clear();
    bot.fight("Gà Điên", 5, 1, now, &mut out);
    assert!(!out.iter().any(|o| matches!(o, Out::Send(1172, _))));
    assert!(out.iter().any(|o| matches!(o, Out::Send(15, _))));
}

#[test]
fn a_list_kept_from_before_is_asked_again_and_alone_in_its_zone_it_stays() {
    let (mut bot, mut out, mut now) = on_m1(11);
    // A list from before (the Khu panel): zone 12 had 3 players then.
    let old = Writer::new().u8(1).u8(12).u8(0).u8(3).u8(20).build();
    bot.on_packet(1172, &old, now, &mut out).unwrap();
    out.clear();
    bot.fight("Gà Điên", 5, 1, now, &mut out);
    assert!(
        out.iter().any(|o| matches!(o, Out::Send(1172, _))),
        "a fresh list: {out:?}"
    );
    // Now: alone in 11 (1 player, itself), 12 empty: no gain in moving.
    let mut now_list = Writer::new().u8(3);
    for (zone, players) in [(10, 4), (11, 1), (12, 0)] {
        now_list = now_list.u8(zone).u8(0).u8(players).u8(20);
    }
    bot.on_packet(1172, &now_list.build(), now, &mut out)
        .unwrap();
    now = bot.deadline().unwrap();
    out.clear();
    bot.on_timer(now, &mut out);
    assert!(
        !out.iter().any(|o| matches!(o, Out::Send(1173, _))),
        "{out:?}"
    );
    assert!(out.iter().any(|o| matches!(o, Out::Send(15, _))));
}

#[test]
fn no_answer_to_the_zone_change_and_the_job_fights_where_it_stands() {
    let (mut bot, mut out, mut now) = on_m1(0);
    bot.fight("Gà Điên", 5, 1, now, &mut out);
    bot.on_packet(1172, &zones(), now, &mut out).unwrap();
    now = bot.deadline().unwrap();
    bot.on_timer(now, &mut out);
    assert!(out.iter().any(|o| matches!(o, Out::Send(1173, _))));
    out.clear();
    // No s2c/13 nor s2c/43 within 8 s.
    for _ in 0..3 {
        now = bot.deadline().unwrap();
        bot.on_timer(now, &mut out);
    }
    assert!(
        travel_logs(&out)
            .iter()
            .any(|l| l.starts_with("Server không trả lời khi sang khu")),
        "{out:?}"
    );
    assert!(out.iter().any(|o| matches!(o, Out::Send(15, _))), "{out:?}");
    assert_eq!(bot.snap.zone, 0);
}

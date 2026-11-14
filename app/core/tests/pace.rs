//! Thời gian chờ of Cài đặt đánh (bot/pace.rs, RunnerOptions::turn_delay of runner_v3.rs): Chờ giữa các trận, Chờ trước
//! mỗi lượt đi, Chờ giữa các bước nhiệm vụ, Nghỉ giải lao, Thời gian ngẫu nhiên. Every one off by default, and off the bot
//! plays as before (3 s between battles, a turn at once).
use cllt_core::atlas::Atlas;
use cllt_core::battle::{self, Board, N};
use cllt_core::bot::{Bot, BotOptions, FightSettings, LogKind, Out};
use cllt_core::protocol::Writer;
use cllt_core::runner::Act;
use cllt_core::runner_v3::{BattleRunner, RunnerOptions};
use std::sync::Arc;
use std::time::{Duration, Instant};

mod common;
use common::{hex, logged, v};

fn challenges(out: &[Out]) -> usize {
    out.iter().filter(|o| matches!(o, Out::Send(15, _))).count()
}
fn sent(acts: &[Act]) -> Vec<i32> {
    acts.iter()
        .filter_map(|a| match a {
            Act::Send(op, _) => Some(*op),
            _ => None,
        })
        .collect()
}
fn turn_of(seq: i32, own: bool) -> Vec<u8> {
    Writer::new().i32(seq).i32(0).u8(own as u8).u8(0).build()
}

/// The board of the first captured battle (it has moves), in a battle of manina.
fn setup() -> battle::Setup {
    let all = v();
    let mut b: Board = [0; N * N];
    for (i, x) in all["battles"][0]["board"]
        .as_array()
        .unwrap()
        .iter()
        .enumerate()
    {
        b[i] = x.as_i64().unwrap() as i16;
    }
    battle::Setup {
        me: "manina".into(),
        level: 3,
        hp: 120,
        max_hp: 130,
        uuid: "u".into(),
        board: b.to_vec(),
        turn_seconds: 30,
    }
}
fn runner(turn_delay: Duration) -> BattleRunner {
    let options = RunnerOptions {
        turn_delay,
        ..RunnerOptions::default()
    };
    BattleRunner::new(&setup(), "mob872604", options)
}

#[test]
fn an_own_turn_waits_cho_truoc_moi_luot_di_then_moves_once_and_a_mob_turn_goes_at_once() {
    let (mut r, mut acts, now) = (runner(Duration::from_secs(2)), vec![], Instant::now());
    r.on_packet(24, &turn_of(5, true), now, &mut acts).unwrap();
    assert!(sent(&acts).is_empty(), "nothing before the 2 s: {acts:?}");
    assert_eq!(r.deadline(), Some(now + Duration::from_secs(2)));
    // Its s2c/24 again a second later keeps the time and sends nothing.
    let again = now + Duration::from_secs(1);
    r.on_packet(24, &turn_of(5, true), again, &mut acts)
        .unwrap();
    assert_eq!(r.deadline(), Some(now + Duration::from_secs(2)));
    r.on_timer(again, &mut acts);
    assert!(sent(&acts).is_empty());
    r.on_timer(now + Duration::from_secs(2), &mut acts);
    assert_eq!(sent(&acts), [19], "one swap after the 2 s");
    assert_eq!((r.turns, r.deadline()), (1, None));
    // The mob's turn is not own: its c2s/14 goes at once.
    r.on_packet(24, &turn_of(6, false), now, &mut acts).unwrap();
    assert_eq!(sent(&acts), [19, 14]);

    // Off (zero, the default): the swap goes as the turn comes, as before.
    let (mut r, mut acts) = (runner(Duration::ZERO), vec![]);
    r.on_packet(24, &turn_of(5, true), now, &mut acts).unwrap();
    assert_eq!(sent(&acts), [19]);
    // Turned on during the battle (Cài đặt đánh): the next own turn waits.
    r.set_turn_delay(Duration::from_secs(1), false);
    r.on_packet(24, &turn_of(7, true), now, &mut acts).unwrap();
    assert_eq!(sent(&acts), [19]);
    assert_eq!(r.deadline(), Some(now + Duration::from_secs(1)));
}

#[test]
fn a_surrender_during_the_wait_keeps_the_turn_so_resume_plays_it_at_once() {
    let (mut r, mut acts, now) = (runner(Duration::from_secs(3)), vec![], Instant::now());
    r.on_packet(24, &turn_of(5, true), now, &mut acts).unwrap();
    r.leave("M2", &mut acts);
    assert_eq!(sent(&acts), [11, 40]);
    assert_eq!(r.deadline(), None, "no move while leaving");
    // The server did not take the surrender: the turn passed over is played at once, without a second wait.
    r.resume(now + Duration::from_secs(8), &mut acts);
    assert_eq!(sent(&acts), [11, 40, 19]);
}

#[test]
fn a_timed_battle_waits_cho_truoc_moi_luot_di_before_its_first_swap() {
    let (mut r, mut acts, now) = (runner(Duration::from_secs(3)), vec![], Instant::now());
    let timed = Writer::new().i32(0).u8(1).u8(0).build();
    r.on_packet(18, &timed, now, &mut acts).unwrap();
    assert!(r.timed);
    assert!(sent(&acts).is_empty());
    r.on_timer(now + Duration::from_secs(3), &mut acts);
    assert_eq!(sent(&acts), [19]);
    // Off: at once, as before.
    let (mut r, mut acts) = (runner(Duration::ZERO), vec![]);
    r.on_packet(18, &timed, now, &mut acts).unwrap();
    assert_eq!(sent(&acts), [19]);
}

/// manina on M2 with Cóc Xanh around and Cài đặt đánh `fight`, and the s2c/22 of a battle against it.
fn coc_xanh_bot(fight: FightSettings) -> (Bot, Vec<Out>, Instant, Vec<u8>) {
    let all = v();
    let setup = hex(all["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["fn"] == "battleSetup")
        .unwrap()["hex"]
        .as_str()
        .unwrap());
    let options = BotOptions {
        fight,
        ..BotOptions::default()
    };
    let (mut bot, mut out, now) = (
        Bot::new(options, Arc::new(Atlas::default())),
        vec![],
        Instant::now(),
    );
    bot.on_packet(
        29,
        &Writer::new().string("manina").string("M2").i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    let mobs = Writer::new()
        .string("M2")
        .u8(3)
        .string("mob61000")
        .string("Cóc Xanh")
        .i32(13)
        .u8(0)
        .i32(6)
        .i32(1)
        .u8(0)
        .build();
    bot.on_packet(43, &mobs, now, &mut out).unwrap();
    out.clear();
    (bot, out, now, setup)
}
/// s2c/19 ending the battle against mob61000 with a loss (as lost_battle of parity.rs).
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
/// One battle of the job: s2c/22 at `at`, lost at once.
fn battle(bot: &mut Bot, out: &mut Vec<Out>, setup: &[u8], at: Instant) {
    bot.on_packet(22, setup, at, out).unwrap();
    bot.on_packet(19, &lost_battle(), at, out).unwrap();
}

#[test]
fn cho_giua_cac_tran_replaces_the_3_s_between_battles_and_off_they_stay_3_s() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot(FightSettings::default());
    bot.fight("Cóc Xanh", 5, 10, now, &mut out);
    battle(&mut bot, &mut out, &setup, now);
    assert_eq!(
        bot.deadline(),
        Some(now + Duration::from_secs(3)),
        "off: 3 s"
    );

    let on = FightSettings {
        mob_delay: true,
        mob_delay_secs: 1,
        ..FightSettings::default()
    };
    let (mut bot, mut out, now, setup) = coc_xanh_bot(on);
    bot.fight("Cóc Xanh", 5, 10, now, &mut out);
    battle(&mut bot, &mut out, &setup, now);
    assert_eq!(bot.deadline(), Some(now + Duration::from_secs(1)));
    out.clear();
    bot.on_timer(now + Duration::from_secs(1), &mut out);
    assert_eq!(challenges(&out), 1, "the next challenge after 1 s: {out:?}");

    // 0 in a file edited by hand is 1 s; with Thời gian ngẫu nhiên from 7 s to twice it.
    for (secs, random, from, to) in [(0, false, 1, 1), (7, true, 7, 14)] {
        let fight = FightSettings {
            mob_delay: true,
            mob_delay_secs: secs,
            delay_random: random,
            ..FightSettings::default()
        };
        let (mut bot, mut out, now, setup) = coc_xanh_bot(fight);
        bot.fight("Cóc Xanh", 5, 10, now, &mut out);
        battle(&mut bot, &mut out, &setup, now);
        let wait = bot.deadline().unwrap() - now;
        assert!(
            (Duration::from_secs(from)..=Duration::from_secs(to)).contains(&wait),
            "{secs} s, random {random}: {wait:?}"
        );
    }
}

#[test]
fn nghi_giai_lao_waits_its_minutes_after_its_battles_says_so_and_fights_on() {
    let fight = FightSettings {
        rest_break: true,
        break_every: 2,
        break_minutes: 1,
        ..FightSettings::default()
    };
    let (mut bot, mut out, now, setup) = coc_xanh_bot(fight);
    bot.fight("Cóc Xanh", 5, 10, now, &mut out);
    battle(&mut bot, &mut out, &setup, now);
    let t1 = bot.deadline().unwrap();
    bot.on_timer(t1, &mut out);
    battle(&mut bot, &mut out, &setup, t1);
    let t2 = bot.deadline().unwrap();
    out.clear();
    bot.on_timer(t2, &mut out);
    assert!(
        out.iter().any(|o| matches!(o, Out::Log(LogKind::Battle, t) if t == "Nghỉ giải lao 1 phút 00 giây sau 2 trận")),
        "{out:?}"
    );
    assert_eq!(challenges(&out), 0);
    assert!(bot.snapshot().break_until.is_some());
    assert_eq!(bot.deadline(), Some(t2 + Duration::from_secs(60)));
    // An answer or packet calling the job early does not end the break.
    bot.on_timer(t2 + Duration::from_secs(30), &mut out);
    assert_eq!(challenges(&out), 0);
    assert_eq!(bot.deadline(), Some(t2 + Duration::from_secs(60)));
    out.clear();
    bot.on_timer(t2 + Duration::from_secs(60), &mut out);
    assert!(logged(&out, "Hết giờ nghỉ giải lao, đánh tiếp"), "{out:?}");
    assert_eq!(challenges(&out), 1);
    assert_eq!(bot.snapshot().break_until, None);
    // Two battles later, another break; Dừng ends it.
    let t3 = t2 + Duration::from_secs(60);
    battle(&mut bot, &mut out, &setup, t3);
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    battle(&mut bot, &mut out, &setup, t3);
    out.clear();
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert!(logged(&out, "Nghỉ giải lao"), "{out:?}");
    bot.stop(false, t3, &mut out);
    assert_eq!(bot.snapshot().break_until, None);
    assert_eq!(bot.deadline(), None);
}

#[test]
fn nghi_giai_lao_turned_off_during_a_break_goes_on_at_once() {
    let fight = FightSettings {
        rest_break: true,
        break_every: 1,
        break_minutes: 5,
        ..FightSettings::default()
    };
    let (mut bot, mut out, now, setup) = coc_xanh_bot(fight);
    bot.fight("Cóc Xanh", 5, 10, now, &mut out);
    battle(&mut bot, &mut out, &setup, now);
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert!(bot.snapshot().break_until.is_some());
    out.clear();
    bot.set_fight(
        FightSettings {
            rest_break: false,
            ..fight
        },
        now,
        &mut out,
    );
    assert!(
        logged(&out, "Tắt nghỉ giải lao: thôi nghỉ, chạy tiếp ngay"),
        "{out:?}"
    );
    assert_eq!(bot.snapshot().break_until, None);
    let t = bot.deadline().unwrap();
    assert!(t <= Instant::now());
    out.clear();
    bot.on_timer(t.max(now + Duration::from_secs(4)), &mut out);
    assert_eq!(challenges(&out), 1, "{out:?}");
}

/// Quest 9 "Thử Sức Tân Binh" at step `current` with `progress` (as quest9 of parity.rs): its fourth step kills Cóc
/// Xanh, its fifth is a report to Võ Quan Đinh Mộc (NPC 141).
fn quest9(current: i32, progress: i32) -> Vec<u8> {
    let steps = [
        ("Đạt cấp độ 11", 11, 1, -1),
        ("Nói chuyện với Võ Quan Đinh Mộc", 141, 1, 141),
        ("Tiêu diệt Sói Xám", 4, 15, -1),
        ("Tiêu diệt Cóc Xanh", 5, 15, -1),
        ("Báo cáo với Võ Quan Đinh Mộc", 141, 1, 141),
    ];
    let mut w = Writer::new()
        .i32(9)
        .string("Thử Sức Tân Binh")
        .string("")
        .string("main")
        .i32(current)
        .i32(progress)
        .i32(steps.len() as i32);
    for (i, (text, param, required, npc)) in steps.into_iter().enumerate() {
        w = w
            .i32(i as i32)
            .string(text)
            .i32(param)
            .i32(required)
            .i32(npc);
    }
    w.build()
}

#[test]
fn cho_giua_cac_buoc_nhiem_vu_waits_before_a_talk_but_not_before_a_battle() {
    let fight = FightSettings {
        step_delay: true,
        step_delay_secs: 2,
        ..FightSettings::default()
    };
    let (mut bot, mut out, now, setup) = coc_xanh_bot(fight);
    bot.on_packet(39, &quest9(3, 14), now, &mut out).unwrap();
    bot.quest(1, None, now, &mut out);
    // The kill step's battle is challenged at once.
    assert_eq!(challenges(&out), 1, "{out:?}");
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    let won = {
        let lost = lost_battle();
        let mut won = lost[..lost.len() - 10].to_vec();
        won.extend(Writer::new().u8(1).u8(1).i32(142).i32(18).build());
        won
    };
    bot.on_packet(19, &won, now, &mut out).unwrap();
    // The 3 s after the battle, then the report waits 2 s more before its c2s/13.
    let rest = bot.deadline().unwrap();
    assert_eq!(rest, now + Duration::from_secs(3));
    out.clear();
    bot.on_timer(rest, &mut out);
    assert!(
        !out.iter().any(|o| matches!(o, Out::Send(13, _))),
        "{out:?}"
    );
    assert_eq!(bot.deadline(), Some(rest + Duration::from_secs(2)));
    bot.on_timer(rest + Duration::from_secs(2), &mut out);
    assert_eq!(
        out.last(),
        Some(&Out::Send(13, Writer::new().string("M2").i32(141).build()))
    );
}

#[test]
fn turned_on_or_off_each_wait_says_so_once_in_the_log() {
    let (mut bot, mut out, now, _) = coc_xanh_bot(FightSettings::default());
    let on = FightSettings {
        mob_delay: true,
        turn_delay: true,
        turn_delay_secs: 2,
        step_delay: true,
        rest_break: true,
        delay_random: true,
        ..FightSettings::default()
    };
    bot.set_fight(on, now, &mut out);
    for line in [
        "Chờ giữa các trận: nghỉ 1 s sau mỗi trận thay cho 3 s",
        "Chờ trước mỗi lượt đi: 2 s trước mỗi nước đi",
        "Chờ giữa các bước nhiệm vụ: 1 s trước mỗi việc không phải trận",
        "Nghỉ giải lao: nghỉ 2 phút sau mỗi 30 trận",
        "Bật thời gian ngẫu nhiên",
    ] {
        assert!(logged(&out, line), "{line}: {out:?}");
    }
    out.clear();
    bot.set_fight(on, now, &mut out);
    assert!(out.is_empty(), "nothing changed: {out:?}");
    bot.set_fight(FightSettings::default(), now, &mut out);
    for line in [
        "Tắt chờ giữa các trận: nghỉ 3 s sau mỗi trận như trước",
        "Tắt chờ trước mỗi lượt đi",
        "Tắt chờ giữa các bước nhiệm vụ",
        "Tắt nghỉ giải lao",
        "Tắt thời gian ngẫu nhiên",
    ] {
        assert!(logged(&out, line), "{line}: {out:?}");
    }
}

/// s2c/1182 of an item another player let fall in M2 (as drop_in of parity.rs).
fn drop_in(uuid: &str, item_id: i32, quantity: i32) -> Vec<u8> {
    Writer::new()
        .string("M2")
        .u8(0xfe)
        .i32(item_id)
        .string(uuid)
        .i32(0)
        .i32(-1)
        .i32(quantity)
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

#[test]
fn a_short_cho_giua_cac_tran_lets_the_items_of_others_be_picked_up_first_within_the_3_s() {
    let fight = FightSettings {
        mob_delay: true,
        mob_delay_secs: 1,
        ..FightSettings::default()
    };
    let (mut bot, mut out, now, setup) = coc_xanh_bot(fight);
    bot.fight("Cóc Xanh", 5, 10, now, &mut out);
    // Eight Xu khóa others left 20 s before the battle ends: one c2s/1188 every 200 ms after it, 1.4 s for the last.
    for i in 0..8 {
        bot.on_packet(1182, &drop_in(&format!("xu{i}"), 41, 10), now, &mut out)
            .unwrap();
    }
    let end = now + Duration::from_secs(20);
    bot.on_packet(22, &setup, end, &mut out).unwrap();
    let won = {
        let lost = lost_battle();
        let mut won = lost[..lost.len() - 10].to_vec();
        won.extend(Writer::new().u8(1).u8(1).i32(142).i32(18).build());
        won
    };
    out.clear();
    bot.on_packet(19, &won, end, &mut out).unwrap();
    let mut events: Vec<(Duration, i32)> = vec![];
    while let Some(d) = bot
        .deadline()
        .filter(|d| *d <= end + Duration::from_secs(4))
    {
        let mut acts = vec![];
        bot.on_timer(d, &mut acts);
        for a in &acts {
            if let Out::Send(op @ (15 | 1188), _) = a {
                events.push((d - end, *op));
            }
        }
        if events.iter().any(|e| e.1 == 15) {
            break;
        }
    }
    let first = out
        .iter()
        .filter(|o| matches!(o, Out::Send(1188, _)))
        .count();
    let asked = first + events.iter().filter(|e| e.1 == 1188).count();
    assert_eq!(asked, 8, "{events:?}");
    let (at, op) = *events.last().unwrap();
    assert_eq!(op, 15, "the challenge after the last request: {events:?}");
    assert!(
        at >= Duration::from_millis(1400) && at <= Duration::from_secs(3),
        "{at:?}"
    );
}

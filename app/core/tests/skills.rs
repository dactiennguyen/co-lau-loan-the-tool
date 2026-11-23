//! Tự cộng kỹ năng (FightSettings::auto_skills, Bot::auto_skill) on manina's tree of E1: level 21, Hỏa Cầu Thuật 1000 at
//! level 1, 19 skill points, the s2c/9 and s2c/30 of vectors.json.
use cllt_core::atlas::Atlas;
use cllt_core::bot::{Bot, BotOptions, FightSettings, LogKind, Out};
use serde_json::Value;
use std::sync::Arc;
use std::time::{Duration, Instant};

mod common;
use common::{hex, tohex};

/// The captured packet of decoder `f` in vectors.json.
fn captured(f: &str) -> Vec<u8> {
    let all: Value = serde_json::from_str(include_str!("vectors.json")).unwrap();
    let case = all["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["fn"] == f)
        .unwrap()
        .clone();
    hex(case["hex"].as_str().unwrap())
}
fn sent_1191(out: &[Out]) -> Vec<String> {
    out.iter()
        .filter_map(|o| match o {
            Out::Send(1191, p) => Some(tohex(p)),
            _ => None,
        })
        .collect()
}
/// manina logged in: s2c/9 (levels, points), then s2c/30 (the tree).
fn manina(auto_skills: bool) -> (Bot, Vec<Out>, Instant) {
    let options = BotOptions {
        fight: FightSettings {
            auto_skills,
            ..FightSettings::default()
        },
        ..BotOptions::default()
    };
    let mut bot = Bot::new(options, Arc::new(Atlas::default()));
    let (now, mut out) = (Instant::now(), vec![]);
    bot.on_packet(9, &captured("characterGear"), now, &mut out)
        .unwrap();
    bot.on_packet(30, &captured("skillTable"), now, &mut out)
        .unwrap();
    (bot, out, now)
}

#[test]
fn tu_cong_ky_nang_cong_chuong_dung_nhieu_truoc() {
    let (mut bot, mut out, now) = manina(true);
    assert!(sent_1191(&out).is_empty(), "nothing before the timer");
    // The tree is in and nothing runs: the first level in 250 ms. Hỏa Cầu Thuật 1000 (level 1, its level 2 asks level 7)
    // is the skill the battle casts most, so it goes before Hỏa Kiếm Thuật 1001, unlearnt (before 23/11 the lowest level
    // went first, and Hỏa Kiếm Thuật with it).
    let soon = now + Duration::from_millis(300);
    assert!(bot.deadline().is_some_and(|d| d <= soon));
    bot.on_timer(soon, &mut out);
    assert_eq!(sent_1191(&out), ["000003e800000001"], "{out:?}");
    assert!(out.iter().any(
        |o| matches!(o, Out::Log(LogKind::Character, t) if t.starts_with("Nâng Hỏa Cầu Thuật lên cấp 2"))
    ));
    // Nothing more before the answer.
    out.clear();
    bot.on_timer(soon, &mut out);
    assert!(sent_1191(&out).is_empty());
    // s2c/1191: 18 points left; the next level 250 ms later.
    bot.on_packet(1191, &hex("0000004400000012"), soon, &mut out)
        .unwrap();
    let later = soon + Duration::from_millis(300);
    bot.on_timer(later, &mut out);
    assert_eq!(sent_1191(&out).len(), 1, "{out:?}");

    // No answer in 8 s: Tự cộng kỹ năng stops until it is turned on again.
    out.clear();
    bot.on_timer(later + Duration::from_secs(9), &mut out);
    assert!(out
        .iter()
        .any(|o| matches!(o, Out::Log(LogKind::Character, t)
        if t == "Server không trả lời khi tự cộng kỹ năng; thôi tự cộng tới lần bật sau")));
    assert!(sent_1191(&out).is_empty());
    assert_eq!(bot.deadline(), None);
}

#[test]
fn tu_cong_ky_nang_tat_mac_dinh_va_bat_thi_cong_ngay() {
    // Off (the default): the tree and the points change nothing.
    let (mut bot, mut out, now) = manina(false);
    assert_eq!(bot.deadline(), None);
    assert!(sent_1191(&out).is_empty());
    // Turned on with nothing running: a level goes out at once.
    bot.set_fight(
        FightSettings {
            auto_skills: true,
            ..FightSettings::default()
        },
        now,
        &mut out,
    );
    bot.spend_points(now, &mut out);
    assert!(out
        .iter()
        .any(|o| matches!(o, Out::Log(LogKind::Character, t)
        if t.starts_with("Bật tự cộng kỹ năng"))));
    // Hỏa Cầu Thuật 1000, the skill cast most, first.
    assert_eq!(sent_1191(&out), ["000003e800000001"]);
}

#[test]
fn tu_cong_ky_nang_thoi_khi_server_khong_tru_diem() {
    let (mut bot, mut out, now) = manina(true);
    let soon = now + Duration::from_millis(300);
    bot.on_timer(soon, &mut out);
    assert_eq!(sent_1191(&out).len(), 1, "{out:?}");
    // s2c/1191 with the 19 points still there: nothing was spent, so the same level is not asked for again and again.
    out.clear();
    bot.on_packet(1191, &hex("0000004400000013"), soon, &mut out)
        .unwrap();
    bot.on_timer(soon + Duration::from_millis(300), &mut out);
    assert!(sent_1191(&out).is_empty(), "{out:?}");
    assert!(out
        .iter()
        .any(|o| matches!(o, Out::Log(LogKind::Character, t)
        if t == "Server không nâng kỹ năng (vẫn còn 19 điểm); thôi tự cộng tới lần bật sau")));
}

/// "Sử dụng điểm kỹ năng" when a skill was learnt before the step and none can take a level now: the server counts the
/// learnt skill and is already past the step (20/11: tiheo1, manina3 at level 3 with a skill at level 1 and 1 point), so
/// the run goes on with the next step instead of stopping with "Không kỹ năng nào lên cấp được".
#[test]
fn buoc_su_dung_diem_ky_nang_qua_luon_khi_da_hoc_ky_nang_tu_truoc() {
    let (mut bot, mut out, now) = manina(false);
    // s2c/1191: no skill point left, so Hỏa Cầu Thuật 1 cannot take level 2.
    bot.on_packet(1191, &hex("0000004400000000"), now, &mut out)
        .unwrap();
    let mut w = cllt_core::protocol::Writer::new()
        .i32(3)
        .string("Những Việc Đầu Tiên")
        .string("")
        .string("main")
        .i32(0)
        .i32(0)
        .i32(2);
    for (i, (text, npc)) in [
        ("Sử dụng điểm kỹ năng", -1),
        ("Nói chuyện với Hương Lão Trần Bá", 102),
    ]
    .into_iter()
    .enumerate()
    {
        w = w.i32(i as i32).string(text).i32(npc).i32(1).i32(npc);
    }
    bot.on_packet(39, &w.build(), now, &mut out).unwrap();
    out.clear();
    bot.quest(1, None, now, &mut out);
    assert!(sent_1191(&out).is_empty(), "{out:?}");
    let logs: Vec<&str> = out
        .iter()
        .filter_map(|o| match o {
            Out::Log(LogKind::Quest, t) => Some(t.as_str()),
            _ => None,
        })
        .collect();
    assert!(
        logs.iter().any(|t| t
            == &"Đã học Hỏa Cầu Thuật cấp 1 từ trước, server tự qua bước này; bước tiếp: Nói chuyện với Hương Lão Trần Bá"),
        "{logs:?}"
    );
    assert!(
        !logs.iter().any(|t| t.contains("Không kỹ năng nào")),
        "{logs:?}"
    );
    // The talk of the next step goes out at once.
    assert!(out.iter().any(|o| matches!(o, Out::Send(13, _))), "{out:?}");
}

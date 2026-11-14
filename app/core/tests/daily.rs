//! Nhiệm vụ hàng ngày (14-npc.md#nhiệm-vụ-hàng-ngày) against src/protocol/mail.ts and src/bot/daily.ts (`npm run
//! export:rust`, vectors.json "daily"): what dailyQuest reads in every s2c/1195 of G1 and NP1, how many were taken today
//! as dailyTaken reads Hương Lão's menus, and Bot::smith of SmithTask::Daily driven by those packets: Xem, Nhận, Hủy and
//! Hoàn thành, each line picked only when the menu and the quest held allow it, and Hương Lão talked to again after.
use cllt_core::atlas::Atlas;
use cllt_core::bot::{Bot, BotOptions, DailyAction, LogKind, Out, SmithTask};
use cllt_core::mail::{self, Daily};
use cllt_core::protocol::Writer;
use cllt_core::world;
use serde_json::Value;
use std::sync::Arc;
use std::time::{Duration, Instant};

mod common;
use common::{hex, tohex, v};

/// A captured packet of the daily vectors, under its key of test/fixtures-g1.ts or fixtures-np1.ts.
fn packet(key: &str) -> Vec<u8> {
    let all = v();
    let d = &all["daily"];
    let case = ["quests", "menus", "packets"]
        .iter()
        .flat_map(|part| d[part].as_array().unwrap().iter())
        .find(|c| c["key"] == key)
        .unwrap_or_else(|| panic!("no packet {key}"))
        .clone();
    hex(case["hex"].as_str().unwrap())
}
fn sent(out: &[Out], op: i32) -> Vec<String> {
    out.iter()
        .filter_map(|o| match o {
            Out::Send(o, p) if *o == op => Some(tohex(p)),
            _ => None,
        })
        .collect()
}
fn lines(out: &[Out]) -> Vec<(LogKind, &str)> {
    out.iter()
        .filter_map(|o| match o {
            Out::Log(k, t) => Some((*k, t.as_str())),
            _ => None,
        })
        .collect()
}
fn logged(out: &[Out], text: &str) -> bool {
    lines(out).iter().any(|(_, t)| *t == text)
}
/// c2s/13 to Hương Lão on M1, and c2s/57 of a line of his.
const HUONG_LAO: &str = "000000024d3100000066";
fn line57(option: u8) -> String {
    tohex(&Writer::new().u8(option).string("M1").i32(102).build())
}
fn notice(text: &str) -> Vec<u8> {
    Writer::new().u8(1).string(text).build()
}
/// Ttuananh on M1 with an empty bag and some money, and the daily quest the server says at login (s2c/1195 `quest`).
fn ttuananh(quest: &str) -> (Bot, Vec<Out>, Instant) {
    let (mut bot, mut out, now) = (
        Bot::new(BotOptions::default(), Arc::new(Atlas::default())),
        vec![],
        Instant::now(),
    );
    let at = Writer::new().string("Ttuananh").string("M1").i32(0).build();
    bot.on_packet(29, &at, now, &mut out).unwrap();
    bot.snap.name = "Ttuananh".into();
    let bag = Writer::new()
        .string("test dong 1")
        .i32(42)
        .i32(3)
        .u8(2)
        .i32(54)
        .i32(0)
        .build();
    bot.on_packet(42, &bag, now, &mut out).unwrap();
    let money = [
        Writer::new().string("update Xu").build(),
        5_000_000i64.to_be_bytes().to_vec(),
        5_000_000i64.to_be_bytes().to_vec(),
        8_000i64.to_be_bytes().to_vec(),
    ]
    .concat();
    bot.on_packet(46, &money, now, &mut out).unwrap();
    bot.on_packet(1195, &packet(quest), now, &mut out).unwrap();
    out.clear();
    (bot, out, now)
}
/// Starts `action` and answers the c2s/13 with Hương Lão's first menu: c2s/57 of line 2 goes out.
fn to_daily_menu(bot: &mut Bot, out: &mut Vec<Out>, now: Instant, action: DailyAction) {
    bot.smith(SmithTask::Daily { action }, now, out);
    assert_eq!(sent(out, 13), [HUONG_LAO], "{:?}", lines(out));
    out.clear();
    bot.on_packet(57, &packet("s2c/57 Hương Lão"), now, out)
        .unwrap();
    assert_eq!(sent(out, 57), [line57(2)], "Nhiệm vụ hàng ngày");
    out.clear();
}
/// After the line: Hương Lão is talked to again, and his first menu ends the task with `end`.
fn ends_after_reset(bot: &mut Bot, out: &mut Vec<Out>, now: Instant, end: &str) {
    assert_eq!(
        sent(out, 13),
        [HUONG_LAO],
        "talked to again: {:?}",
        lines(out)
    );
    assert!(bot.snapshot().smith.unwrap().done.is_none());
    out.clear();
    bot.on_packet(57, &packet("s2c/57 Hương Lão"), now, out)
        .unwrap();
    assert!(sent(out, 57).is_empty(), "nothing picked on his first menu");
    assert!(
        lines(out).contains(&(LogKind::Quest, end)),
        "{:?}",
        lines(out)
    );
    assert!(bot.snapshot().smith.unwrap().done.is_some());
}

#[test]
fn the_g1_and_np1_packets_read_as_the_ts_side_reads_them() {
    let all = v();
    let quests = all["daily"]["quests"].as_array().unwrap();
    assert_eq!(quests.len(), 6);
    for c in quests {
        let key = c["key"].as_str().unwrap();
        let e = &c["expected"];
        let d = mail::daily_quest(&hex(c["hex"].as_str().unwrap())).unwrap();
        assert_eq!(
            e["kind"].as_i64(),
            Some(match &d {
                Daily::None => 0,
                Daily::Quest(_) => 1,
                Daily::Done { .. } => 2,
                Daily::Progress { .. } => 3,
            }),
            "{key}"
        );
        match &d {
            Daily::Quest(q) => {
                let q2 = &e["quest"];
                assert_eq!(q2["id"].as_i64(), Some(q.id as i64), "{key}");
                assert_eq!(q2["name"].as_str(), Some(q.name.as_str()), "{key}");
                assert_eq!(q2["template"].as_str(), Some(q.template.as_str()), "{key}");
                assert_eq!(q2["progress"].as_i64(), Some(q.progress as i64), "{key}");
                assert_eq!(q2["target"].as_i64(), Some(q.target as i64), "{key}");
                assert_eq!(c["text"].as_str(), Some(q.text().as_str()), "{key}");
            }
            Daily::Done { name, rewards } => {
                assert_eq!(e["done"]["name"].as_str(), Some(name.as_str()), "{key}");
                let r: Vec<&str> = (e["done"]["rewards"].as_array().unwrap().iter())
                    .map(|r| r.as_str().unwrap())
                    .collect();
                assert_eq!(r, *rewards, "{key}");
            }
            Daily::Progress { progress, target } => {
                assert_eq!(e["progress"].as_i64(), Some(*progress as i64), "{key}");
                assert_eq!(e["target"].as_i64(), Some(*target as i64), "{key}");
            }
            Daily::None => assert!(e["quest"].is_null(), "{key}"),
        }
    }
    // Kind 3 moves the progress of the quest held, and nothing when none is held (dailyAfter).
    let held = match mail::daily_quest(&packet("s2c/1195 113 Nhặt xu")).unwrap() {
        Daily::Quest(q) => q,
        d => panic!("{d:?}"),
    };
    let moved = mail::daily_quest(&packet("s2c/1195 tiến độ 218/2100")).unwrap();
    let after = mail::daily_after(Some(&held), &moved).unwrap();
    assert_eq!(after.text(), "Thu thập 218/2100 xu khóa từ đánh quái");
    assert_eq!(mail::daily_after(None, &moved), None);

    let menus = all["daily"]["menus"].as_array().unwrap();
    assert_eq!(menus.len(), 5);
    for c in menus {
        let key = c["key"].as_str().unwrap();
        let m = world::npc_menu(&hex(c["hex"].as_str().unwrap())).unwrap();
        let taken =
            mail::daily_taken(&m.text).map(|(t, m)| serde_json::json!({ "taken": t, "max": m }));
        assert_eq!(taken.unwrap_or(Value::Null), c["taken"], "{key}");
        let options: Vec<Value> = (m.options.iter())
            .map(|(o, l)| serde_json::json!([o, l]))
            .collect();
        assert_eq!(Value::from(options), c["options"], "{key}");
    }
    assert!(
        mail::is_daily_accept("Nhận nhiệm vụ") && !mail::is_daily_accept("Nhận nhiệm vụ hàng ngày")
    );
    assert!(
        mail::is_daily_cancel("Hủy nhiệm vụ hiện tại")
            && mail::is_daily_complete("Hoàn thành nhiệm vụ")
    );
    assert!(mail::is_daily_accepted(
        "Nhận nhiệm vụ hàng ngày thành công."
    ));
}

#[test]
fn the_quest_held_and_its_progress_with_one_line_when_it_is_done() {
    let (mut bot, mut out, now) = ttuananh("s2c/1195 113 Nhặt xu");
    let d = bot.snapshot().daily;
    assert!(d.known);
    let q = d.quest.unwrap();
    assert_eq!(
        (q.id, q.name.as_str(), q.progress, q.target),
        (113, "Nhặt xu", 0, 2050)
    );
    // A pickup of Xu khóa moves it (kind 3); nothing in the log until the target.
    bot.on_packet(1195, &packet("s2c/1195 tiến độ 218/2100"), now, &mut out)
        .unwrap();
    assert_eq!(bot.snapshot().daily.quest.unwrap().progress, 218);
    assert!(lines(&out).is_empty());
    let done = Writer::new().u8(3).i32(2100).i32(2100).build();
    bot.on_packet(1195, &done, now, &mut out).unwrap();
    assert_eq!(
        lines(&out),
        [(
            LogKind::Quest,
            "Nhiệm vụ ngày Nhặt xu đã đủ 2100/2100: về Hương Lão (Làng Thanh Khê) chọn Hoàn thành nhiệm vụ"
        )]
    );
    out.clear();
    bot.on_packet(1195, &done, now, &mut out).unwrap();
    assert!(lines(&out).is_empty(), "said once");
    // None held: before the first s2c/1195 the bot does not know; a progress then changes nothing.
    let (mut fresh, mut out, now) = (
        Bot::new(BotOptions::default(), Arc::new(Atlas::default())),
        vec![],
        Instant::now(),
    );
    assert!(!fresh.snapshot().daily.known);
    fresh
        .on_packet(1195, &packet("s2c/1195 tiến độ 218/2100"), now, &mut out)
        .unwrap();
    let d = fresh.snapshot().daily;
    assert!(!d.known && d.quest.is_none());
}

#[test]
fn xem_reads_how_many_were_taken_and_picks_nothing() {
    let (mut bot, mut out, now) = ttuananh("s2c/1195 không có");
    to_daily_menu(&mut bot, &mut out, now, DailyAction::Show);
    bot.on_packet(57, &packet("s2c/57 nhiệm vụ ngày 0/3 Nhận"), now, &mut out)
        .unwrap();
    assert!(sent(&out, 57).is_empty(), "Nhận is line 0 and runs at once");
    ends_after_reset(
        &mut bot,
        &mut out,
        now,
        "Xem nhiệm vụ ngày: không giữ nhiệm vụ nào; hôm nay đã nhận 0/3",
    );
    let d = bot.snapshot().daily;
    assert_eq!((d.taken, d.max), (Some(0), Some(3)));
    assert!(d.read_at.is_some());
}

#[test]
fn nhan_waits_past_its_notice_for_the_new_quest_as_in_g1() {
    let (mut bot, mut out, now) = ttuananh("s2c/1195 không có");
    to_daily_menu(&mut bot, &mut out, now, DailyAction::Accept);
    bot.on_packet(57, &packet("s2c/57 nhiệm vụ ngày 0/3 Nhận"), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 57), [line57(0)], "Nhận nhiệm vụ");
    out.clear();
    // G1: the notice, then s2c/1195 with the quest.
    bot.on_packet(
        1256,
        &packet("s2c/1256 Nhận nhiệm vụ thành công"),
        now,
        &mut out,
    )
    .unwrap();
    assert!(sent(&out, 13).is_empty(), "the quest is not in yet");
    assert!(bot.snapshot().smith.unwrap().done.is_none());
    out.clear();
    bot.on_packet(
        1195,
        &packet("s2c/1195 116 Sử dụng vật phẩm"),
        now,
        &mut out,
    )
    .unwrap();
    ends_after_reset(
        &mut bot,
        &mut out,
        now,
        "Nhận nhiệm vụ ngày: đã nhận Sử dụng vật phẩm (Sử dụng 0/3 vật phẩm trong trận đấu); hôm nay đã nhận 1/3",
    );
    let d = bot.snapshot().daily;
    assert_eq!(d.quest.unwrap().id, 116);
    assert_eq!(d.taken, Some(1));
}

#[test]
fn nhan_is_refused_while_one_is_held_or_three_were_taken() {
    // Held: refused before Hương Lão is talked to.
    let (mut bot, mut out, now) = ttuananh("s2c/1195 113 Nhặt xu");
    bot.smith(
        SmithTask::Daily {
            action: DailyAction::Accept,
        },
        now,
        &mut out,
    );
    assert!(sent(&out, 13).is_empty());
    assert_eq!(
        lines(&out),
        [(
            LogKind::Quest,
            "Chưa Nhận nhiệm vụ ngày: đang giữ nhiệm vụ Nhặt xu (Thu thập 0/2050 xu khóa từ đánh quái): hoàn thành hoặc hủy trước"
        )]
    );
    // The menu says another line 0 than Nhận (the quest dropped meanwhile on the phone, say): nothing picked.
    let (mut bot, mut out, now) = ttuananh("s2c/1195 không có");
    to_daily_menu(&mut bot, &mut out, now, DailyAction::Accept);
    bot.on_packet(57, &packet("s2c/57 nhiệm vụ ngày 1/3 Hủy"), now, &mut out)
        .unwrap();
    assert!(sent(&out, 57).is_empty());
    ends_after_reset(
        &mut bot,
        &mut out,
        now,
        "Nhận nhiệm vụ ngày: dòng 0 là \"Hủy nhiệm vụ hiện tại\"",
    );
    // 3/3 taken today.
    let full = Writer::new()
        .i32(1)
        .string("Hương Lão Trần Bá")
        .string("Hôm nay con đã nhận 3/3 nhiệm vụ hàng ngày.")
        .u8(0)
        .string("Nhận nhiệm vụ")
        .build();
    to_daily_menu(&mut bot, &mut out, now, DailyAction::Accept);
    bot.on_packet(57, &full, now, &mut out).unwrap();
    assert!(sent(&out, 57).is_empty());
    ends_after_reset(
        &mut bot,
        &mut out,
        now,
        "Nhận nhiệm vụ ngày: hôm nay đã nhận 3/3 nhiệm vụ",
    );
}

#[test]
fn huy_then_its_notice_comes_while_huong_lao_is_talked_to_again() {
    let (mut bot, mut out, now) = ttuananh("s2c/1195 113 Nhặt xu");
    to_daily_menu(&mut bot, &mut out, now, DailyAction::Cancel);
    bot.on_packet(57, &packet("s2c/57 nhiệm vụ ngày 1/3 Hủy"), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 57), [line57(0)], "Hủy nhiệm vụ hiện tại");
    out.clear();
    // G1: s2c/1195 empty first, then the notice.
    bot.on_packet(1195, &packet("s2c/1195 không có"), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 13), [HUONG_LAO]);
    bot.on_packet(
        1256,
        &packet("s2c/1256 Hủy nhiệm vụ thành công"),
        now,
        &mut out,
    )
    .unwrap();
    assert!(
        bot.snapshot().smith.unwrap().done.is_none(),
        "the notice ends nothing: {:?}",
        lines(&out)
    );
    ends_after_reset(
        &mut bot,
        &mut out,
        now,
        "Hủy nhiệm vụ ngày: đã hủy Nhặt xu (vẫn tính một lượt trong ngày)",
    );
    assert!(bot.snapshot().daily.quest.is_none());
}

#[test]
fn huy_and_hoan_thanh_ask_for_the_right_quest() {
    // Nothing held.
    let (mut bot, mut out, now) = ttuananh("s2c/1195 không có");
    for action in [DailyAction::Cancel, DailyAction::Complete] {
        bot.smith(SmithTask::Daily { action }, now, &mut out);
    }
    assert!(sent(&out, 13).is_empty());
    assert_eq!(
        lines(&out).iter().map(|l| l.1).collect::<Vec<_>>(),
        [
            "Chưa Hủy nhiệm vụ ngày: không giữ nhiệm vụ ngày nào",
            "Chưa Hoàn thành nhiệm vụ ngày: không giữ nhiệm vụ ngày nào"
        ]
    );
    // Not done yet: no Hoàn thành; done: no Hủy, which would throw the reward away.
    let (mut bot, mut out, now) = ttuananh("s2c/1195 113 Nhặt xu");
    bot.smith(
        SmithTask::Daily {
            action: DailyAction::Complete,
        },
        now,
        &mut out,
    );
    let (mut done, mut out2, now2) = ttuananh("s2c/1195 113 Nhặt xu 2100/2100");
    done.smith(
        SmithTask::Daily {
            action: DailyAction::Cancel,
        },
        now2,
        &mut out2,
    );
    assert!(sent(&out, 13).is_empty() && sent(&out2, 13).is_empty());
    assert!(logged(
        &out,
        "Chưa Hoàn thành nhiệm vụ ngày: Nhặt xu mới 0/2050: chưa xong"
    ));
    assert!(logged(
        &out2,
        "Chưa Hủy nhiệm vụ ngày: Nhặt xu đã đủ 2100/2100: Hoàn thành để nhận thưởng thay vì hủy"
    ));
}

#[test]
fn hoan_thanh_picks_its_line_and_reads_the_rewards_as_in_np1() {
    let (mut bot, mut out, now) = ttuananh("s2c/1195 113 Nhặt xu 2100/2100");
    to_daily_menu(&mut bot, &mut out, now, DailyAction::Complete);
    bot.on_packet(
        57,
        &packet("s2c/57 nhiệm vụ ngày 1/3 Hoàn thành"),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(sent(&out, 57), [line57(0)], "Hoàn thành nhiệm vụ");
    out.clear();
    // NP1: the EXP, the Xu khóa, then s2c/1195 kind 2; no notice.
    for (op, key) in [(10, "s2c/10 sau Hoàn thành"), (46, "s2c/46 sau Hoàn thành")] {
        bot.on_packet(op, &packet(key), now, &mut out).unwrap();
    }
    assert!(sent(&out, 13).is_empty());
    bot.on_packet(1195, &packet("s2c/1195 xong Nhặt xu"), now, &mut out)
        .unwrap();
    ends_after_reset(
        &mut bot,
        &mut out,
        now,
        "Hoàn thành nhiệm vụ ngày: xong Nhặt xu, nhận 727 kinh nghiệm, 590 xu khóa",
    );
    let d = bot.snapshot().daily;
    assert!(d.quest.is_none());
    let done = d.done.unwrap();
    assert_eq!((done.name.as_str(), done.rewards.len()), ("Nhặt xu", 2));
}

#[test]
fn a_refusal_or_silence_ends_the_task_after_huong_lao_is_talked_to_again() {
    let (mut bot, mut out, now) = ttuananh("s2c/1195 không có");
    to_daily_menu(&mut bot, &mut out, now, DailyAction::Accept);
    bot.on_packet(57, &packet("s2c/57 nhiệm vụ ngày 1/3 Nhận"), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 57), [line57(0)]);
    out.clear();
    bot.on_packet(1256, &notice("Không thể nhận thêm nhiệm vụ"), now, &mut out)
        .unwrap();
    ends_after_reset(
        &mut bot,
        &mut out,
        now,
        "Nhận nhiệm vụ ngày: Hương Lão từ chối: Không thể nhận thêm nhiệm vụ",
    );
    assert!(bot.snapshot().daily.quest.is_none());
    // No answer at all within 8 s: Hương Lão is talked to again all the same.
    to_daily_menu(&mut bot, &mut out, now, DailyAction::Accept);
    bot.on_packet(57, &packet("s2c/57 nhiệm vụ ngày 1/3 Nhận"), now, &mut out)
        .unwrap();
    out.clear();
    bot.on_timer(now + Duration::from_secs(9), &mut out);
    ends_after_reset(
        &mut bot,
        &mut out,
        now,
        "Nhận nhiệm vụ ngày: Hương Lão không trả lời sau 8 s",
    );
}

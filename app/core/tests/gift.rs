//! Mã quà tặng (14-npc.md#mã-quà-tặng) against src/protocol/mail.ts (`npm run export:rust`, vectors.json "gift"): what
//! the TS decoders read in the packets of G1, the bytes of c2s/1223, and Bot::redeem driven by those packets.
use cllt_core::atlas::Atlas;
use cllt_core::bot::{Bot, BotOptions, GiftMemory, ItemAct, Out};
use cllt_core::mail;
use cllt_core::protocol::Writer;
use cllt_core::requests::{build, Ctx};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

fn v() -> Value {
    serde_json::from_str(include_str!("vectors.json")).unwrap()
}
fn hex(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}
fn tohex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}
/// The captured packet of G1 under that key of test/fixtures-g1.ts ("s2c/1223 thành công").
fn g1(key: &str) -> Vec<u8> {
    let all = v();
    let case = all["gift"]["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["key"] == key)
        .unwrap_or_else(|| panic!("no G1 packet {key}"))
        .clone();
    hex(case["hex"].as_str().unwrap())
}
fn answer(ok: bool, text: &str) -> Vec<u8> {
    Writer::new().u8(ok as u8).string(text).build()
}
fn notice(text: &str) -> Vec<u8> {
    Writer::new().u8(1).string(text).build()
}
fn logged(out: &[Out], text: &str) -> bool {
    out.iter()
        .any(|o| matches!(o, Out::Log(_, t) if t.starts_with(text)))
}
fn lines(out: &[Out]) -> Vec<&str> {
    out.iter()
        .filter_map(|o| match o {
            Out::Log(_, t) => Some(t.as_str()),
            _ => None,
        })
        .collect()
}
fn sent(out: &[Out]) -> Vec<String> {
    out.iter()
        .filter_map(|o| match o {
            Out::Send(1223, p) => Some(tohex(p)),
            _ => None,
        })
        .collect()
}
/// "A" as c2s/1223 puts it on the wire.
fn wire(code: &str) -> String {
    tohex(&Writer::new().string(code).build())
}
fn bot() -> (Bot, Vec<Out>, Instant) {
    (
        Bot::new(BotOptions::default(), Arc::new(Atlas::default())),
        vec![],
        Instant::now(),
    )
}
fn codes(c: &[&str]) -> Vec<String> {
    c.iter().map(|s| s.to_string()).collect()
}

#[test]
fn the_g1_packets_read_and_the_codes_go_out_as_the_ts_side_has_them() {
    let all = v();
    let cases = all["gift"]["decoders"].as_array().unwrap();
    assert_eq!(cases.len(), 5);
    for case in cases {
        let p = hex(case["hex"].as_str().unwrap());
        let got = match case["fn"].as_str().unwrap() {
            "giftCodeResult" => serde_json::to_value(mail::gift_code_result(&p).unwrap()),
            "newMail" => serde_json::to_value(mail::new_mail(&p).unwrap()),
            other => panic!("no Rust decoder for {other}"),
        }
        .unwrap();
        assert_eq!(got, case["expected"], "{}", case["key"]);
    }
    for case in all["gift"]["requests"].as_array().unwrap() {
        let code = mail::normalize_code(case["typed"].as_str().unwrap()).unwrap();
        let ctx = Ctx {
            code: Some(&code),
            ..Ctx::default()
        };
        assert_eq!(
            tohex(&build(1223, &ctx).unwrap()),
            case["hex"],
            "{}",
            case["typed"]
        );
    }
    assert!(mail::normalize_code("   ").is_err());
    assert!(mail::normalize_code(&"A".repeat(33)).is_err());
    assert_eq!(
        mail::normalize_code(&"a".repeat(32)).unwrap(),
        "A".repeat(32)
    );
}

#[test]
fn a_good_code_waits_for_its_mail_then_the_next_goes_and_a_refusal_is_logged_once() {
    let (mut bot, mut out, now) = bot();
    // Typed as on the phone: the case and the spaces do not matter, a code twice goes once, an empty one not at all.
    bot.redeem(
        &codes(&["alphatest1", "  DENBU ", "ALPHATEST1", " "]),
        now,
        &mut out,
    );
    assert_eq!(
        lines(&out),
        ["Bắt đầu nhập 2 mã quà tặng: ALPHATEST1, DENBU"]
    );
    assert_eq!(sent(&out), [wire("ALPHATEST1")]);
    assert_eq!(
        sent(&out),
        ["0000000a414c5048415445535431"],
        "c2s/1223 of G1"
    );
    assert_eq!(bot.deadline(), Some(now + Duration::from_secs(8)));
    let run = bot.snap.gift.clone().unwrap();
    assert_eq!((run.id, run.codes.len(), run.done), (1, 2, None));
    assert_eq!(run.codes[1].ok, None);

    out.clear();
    bot.on_packet(1223, &g1("s2c/1223 thành công"), now, &mut out)
        .unwrap();
    assert_eq!(
        lines(&out),
        ["Xong mã ALPHATEST1: Nhập mã thành công, phần thưởng đã được gửi vào hộp thư"]
    );
    assert!(sent(&out).is_empty(), "the next code waits for the mail");
    out.clear();
    bot.on_packet(1222, &g1("s2c/1222 6273"), now, &mut out)
        .unwrap();
    bot.on_packet(1220, &[1], now, &mut out).unwrap();
    assert_eq!(
        lines(&out),
        ["Thư mới: Quà Alpha Test Ngày 1 (từ Hệ Thống)"]
    );
    let run = bot.snap.gift.clone().unwrap();
    assert_eq!(run.codes[0].ok, Some(true));
    assert_eq!(run.codes[0].mail.as_deref(), Some("Quà Alpha Test Ngày 1"));
    assert_eq!(run.doing, "Đợi rồi gửi mã DENBU");
    // 10 s between two codes: 1,5 s after a good one the server said "quá nhanh" (02/11).
    assert_eq!(bot.deadline(), Some(now + Duration::from_secs(10)));
    out.clear();
    bot.on_timer(now + Duration::from_secs(10), &mut out);
    assert_eq!(sent(&out), [wire("DENBU")]);

    out.clear();
    let later = now + Duration::from_secs(11);
    bot.on_packet(1223, &g1("s2c/1223 đã dùng"), later, &mut out)
        .unwrap();
    // The notice with the same words is the same refusal: not logged again; another notice is.
    bot.on_packet(
        1256,
        &notice("Nhân vật này đã dùng mã rồi"),
        later,
        &mut out,
    )
    .unwrap();
    bot.on_packet(
        1256,
        &notice("Thua trận, mất 66 kinh nghiệm"),
        later,
        &mut out,
    )
    .unwrap();
    assert_eq!(
        lines(&out),
        [
            "Mã DENBU bị từ chối: Nhân vật này đã dùng mã rồi",
            "Kết thúc nhập mã: đã gửi hết, 1 mã được, 1 mã bị từ chối",
            "Thua trận, mất 66 kinh nghiệm",
        ]
    );
    assert_eq!(bot.snapshot().gift_limits.wrong, 1);
    let run = bot.snap.gift.clone().unwrap();
    assert_eq!(
        run.done.as_deref(),
        Some("đã gửi hết, 1 mã được, 1 mã bị từ chối")
    );
    assert!(run.ended_at.is_some());
    assert_eq!(bot.deadline(), None);
}

#[test]
fn the_servers_lock_ends_the_run_and_no_code_goes_for_five_minutes() {
    let (mut bot, mut out, now) = bot();
    bot.redeem(&codes(&["SAIMA2038", "DENBU"]), now, &mut out);
    out.clear();
    bot.on_packet(1223, &g1("s2c/1223 quá nhanh"), now, &mut out)
        .unwrap();
    // Fewer than 10 refused in a row: the code went too soon (02/11), no lock. Not counted; its notice is not logged
    // again; the same code goes once more after 30 s.
    bot.on_packet(
        1256,
        &notice("Bạn nhập mã quá nhanh, vui lòng thử lại sau"),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(
        lines(&out),
        ["Mã SAIMA2038: server báo nhập quá nhanh, đợi 30 giây rồi gửi lại"]
    );
    assert!(sent(&out).is_empty());
    let limits = bot.snapshot().gift_limits;
    assert_eq!((limits.wrong, limits.locked_until), (0, None));
    assert_eq!(bot.deadline(), Some(now + Duration::from_secs(30)));
    let t = now + Duration::from_secs(30);
    out.clear();
    bot.on_timer(t, &mut out);
    assert_eq!(sent(&out), [wire("SAIMA2038")]);
    // Said again for it: the lock.
    out.clear();
    bot.on_packet(1223, &g1("s2c/1223 quá nhanh"), t, &mut out)
        .unwrap();
    assert_eq!(
        lines(&out),
        [
            "Mã SAIMA2038 bị từ chối: Bạn nhập mã quá nhanh, vui lòng thử lại sau",
            "Kết thúc nhập mã: server đang chặn nhập mã 5 phút, kể cả mã đúng; chưa gửi: DENBU",
        ]
    );
    assert!(bot.snapshot().gift_limits.locked_until.is_some());
    out.clear();
    bot.redeem(&codes(&["DENBU"]), t + Duration::from_secs(60), &mut out);
    assert_eq!(
        lines(&out),
        ["Chưa nhập mã: server đang chặn nhập mã, còn 4 phút 00 giây"]
    );
    assert!(sent(&out).is_empty());
    out.clear();
    bot.redeem(&codes(&["DENBU"]), t + Duration::from_secs(301), &mut out);
    assert_eq!(sent(&out), [wire("DENBU")]);
}

/// Manina3 on 02/11: ALPHATEST1 went through, ALPHATEST2 went 1,5 s later and the server said "quá nhanh". Now the
/// second code waits 10 s, and "quá nhanh" for it sends it again after 30 s instead of ending the run as a lock.
#[test]
fn quick_codes_wait_and_a_code_too_soon_goes_again() {
    let fresh = bot;
    let (mut bot, mut out, now) = fresh();
    bot.redeem(&codes(&["ALPHATEST1", "ALPHATEST2"]), now, &mut out);
    bot.on_packet(1223, &g1("s2c/1223 thành công"), now, &mut out)
        .unwrap();
    bot.on_packet(1222, &g1("s2c/1222 6273"), now, &mut out)
        .unwrap();
    out.clear();
    bot.on_timer(now + Duration::from_millis(1500), &mut out);
    assert!(sent(&out).is_empty(), "not 1,5 s after a good code");
    bot.on_timer(now + Duration::from_secs(10), &mut out);
    assert_eq!(sent(&out), [wire("ALPHATEST2")]);
    let t = now + Duration::from_secs(10);
    out.clear();
    bot.on_packet(1223, &g1("s2c/1223 quá nhanh"), t, &mut out)
        .unwrap();
    assert_eq!(
        bot.snap.gift.as_ref().map(|r| r.doing.as_str()),
        Some("Server báo nhập quá nhanh, đợi rồi gửi lại mã ALPHATEST2")
    );
    out.clear();
    bot.on_timer(t + Duration::from_secs(30), &mut out);
    assert_eq!(sent(&out), [wire("ALPHATEST2")]);
    out.clear();
    bot.on_packet(
        1223,
        &answer(
            true,
            "Nhập mã thành công, phần thưởng đã được gửi vào hộp thư",
        ),
        t + Duration::from_secs(30),
        &mut out,
    )
    .unwrap();
    assert!(logged(
        &out,
        "Xong mã ALPHATEST2: Nhập mã thành công, phần thưởng đã được gửi vào hộp thư"
    ));
    let run = bot.snap.gift.clone().unwrap();
    assert_eq!(
        run.codes.iter().map(|c| c.ok).collect::<Vec<_>>(),
        [Some(true), Some(true)]
    );
    assert_eq!(bot.snapshot().gift_limits.wrong, 0);

    // Dừng in that wait: the code is not sent again, and is said as not sent.
    let (mut stopped, mut out, now) = fresh();
    stopped.redeem(&codes(&["ALPHATEST2", "DENBU"]), now, &mut out);
    stopped
        .on_packet(1223, &g1("s2c/1223 quá nhanh"), now, &mut out)
        .unwrap();
    out.clear();
    stopped.stop(false, now, &mut out);
    assert!(
        logged(
            &out,
            "Kết thúc nhập mã: Đã dừng; chưa gửi: ALPHATEST2, DENBU"
        ),
        "{:?}",
        lines(&out)
    );
    out.clear();
    stopped.on_timer(now + Duration::from_secs(30), &mut out);
    assert!(sent(&out).is_empty());
}

#[test]
fn five_refused_in_a_row_stop_the_run_before_the_servers_ten() {
    let (mut bot, mut out, now) = bot();
    let all = ["A1", "A2", "A3", "A4", "A5", "A6", "A7"];
    bot.redeem(&codes(&all), now, &mut out);
    let mut t = now;
    for (k, code) in all.iter().enumerate().take(5) {
        assert_eq!(sent(&out), [wire(code)], "code {k}");
        out.clear();
        bot.on_packet(1223, &g1("s2c/1223 không tồn tại"), t, &mut out)
            .unwrap();
        if k < 4 {
            assert!(logged(
                &out,
                &format!("Mã {code} bị từ chối: Mã không tồn tại")
            ));
            out.clear();
            t += Duration::from_secs(10);
            bot.on_timer(t, &mut out);
        }
    }
    assert!(
        logged(
            &out,
            "Kết thúc nhập mã: 5 mã bị từ chối liền nhau, dừng trước khi bị chặn (sai 10 lần liền thì server chặn 5 phút); chưa gửi: A6, A7"
        ),
        "{:?}",
        lines(&out)
    );
    assert_eq!(bot.snapshot().gift_limits.wrong, 5);
    out.clear();
    bot.redeem(&codes(&["DENBU"]), t, &mut out);
    assert!(logged(
        &out,
        "Chưa nhập mã: đã có 5 mã bị từ chối liền nhau. Server chặn mọi mã 5 phút khi sai 10 lần liền, nên app dừng ở 5; muốn thử tiếp thì bấm Đếm lại từ 0"
    ));
    assert!(sent(&out).is_empty());
}

#[test]
fn a_good_code_starts_the_count_again() {
    let (mut bot, mut out, now) = bot();
    bot.redeem(&codes(&["A1", "A2", "A3"]), now, &mut out);
    bot.on_packet(1223, &answer(false, "Mã không tồn tại"), now, &mut out)
        .unwrap();
    bot.on_timer(now + Duration::from_secs(10), &mut out);
    bot.on_packet(1223, &answer(true, "Nhập mã thành công"), now, &mut out)
        .unwrap();
    assert_eq!(bot.snapshot().gift_limits.wrong, 0);
    // No mail in 0,5 s: the next code goes after the pause anyway.
    out.clear();
    bot.on_timer(now + Duration::from_secs(3), &mut out);
    assert!(sent(&out).is_empty());
    bot.on_timer(now + Duration::from_secs(13), &mut out);
    assert_eq!(sent(&out), [wire("A3")]);
}

#[test]
fn nothing_goes_for_a_bad_code_list_or_while_a_run_is_on() {
    let (mut bot, mut out, now) = bot();
    bot.redeem(&codes(&[" ", ""]), now, &mut out);
    bot.redeem(&codes(&["OK", &"X".repeat(33)]), now, &mut out);
    assert_eq!(
        lines(&out),
        [
            "Chưa nhập mã: chưa có mã nào".to_string(),
            format!("Chưa nhập mã: mã \"{}\" dài hơn 32 ký tự", "X".repeat(33)),
        ]
    );
    assert!(sent(&out).is_empty());
    bot.redeem(&codes(&["A1"]), now, &mut out);
    out.clear();
    bot.redeem(&codes(&["A2"]), now, &mut out);
    assert_eq!(
        lines(&out),
        ["Chưa nhập mã: đang nhập mã quà tặng, bấm Dừng trước"]
    );
    // Nor a fight, a quest run or a button of the bag while it runs.
    out.clear();
    bot.fight("Sói Xám", 1, 1, now, &mut out);
    bot.quest(1, None, now, &mut out);
    bot.item(ItemAct::Sort, now, &mut out);
    assert_eq!(
        lines(&out),
        [
            "Đang nhập mã quà tặng: bấm Dừng rồi mới đánh quái",
            "Đang nhập mã quà tặng: bấm Dừng rồi mới làm nhiệm vụ",
            "Chưa sắp xếp túi đồ: đang nhập mã quà tặng",
        ]
    );
    assert!(!out.iter().any(|o| matches!(o, Out::Send(..))));
    // Đếm lại từ 0 waits for the run to end.
    out.clear();
    bot.gift_reset(&mut out);
    assert_eq!(
        lines(&out),
        ["Chưa đếm lại: đang nhập mã quà tặng, bấm Dừng trước"]
    );
}

#[test]
fn silence_ends_the_run_and_dung_waits_for_the_answer_or_ends_in_the_pause() {
    let (mut bot, mut out, now) = bot();
    bot.redeem(&codes(&["A1", "A2"]), now, &mut out);
    out.clear();
    bot.on_timer(now + Duration::from_secs(8), &mut out);
    assert_eq!(
        lines(&out),
        ["Kết thúc nhập mã: server không trả lời mã A1 sau 8 s; chưa gửi: A2"]
    );

    // Dừng while the code waits: its answer still counts, then the run ends.
    out.clear();
    bot.redeem(&codes(&["B1", "B2"]), now, &mut out);
    bot.stop(false, now, &mut out);
    out.clear();
    bot.on_packet(1223, &answer(false, "Mã không tồn tại"), now, &mut out)
        .unwrap();
    assert_eq!(
        lines(&out),
        [
            "Mã B1 bị từ chối: Mã không tồn tại",
            "Kết thúc nhập mã: Đã dừng; chưa gửi: B2",
        ]
    );

    // Dừng in the pause: the next code is not sent.
    out.clear();
    bot.redeem(&codes(&["C1", "C2", "C3"]), now, &mut out);
    bot.on_packet(1223, &answer(true, "Nhập mã thành công"), now, &mut out)
        .unwrap();
    bot.on_timer(now + Duration::from_millis(500), &mut out);
    out.clear();
    bot.stop(false, now + Duration::from_millis(600), &mut out);
    assert_eq!(lines(&out), ["Kết thúc nhập mã: Đã dừng; chưa gửi: C2, C3"]);
    bot.on_timer(now + Duration::from_secs(3), &mut out);
    assert!(sent(&out).is_empty());
}

#[test]
fn an_answer_without_a_code_sent_is_only_logged() {
    let (mut bot, mut out, now) = bot();
    bot.on_packet(1223, &g1("s2c/1223 không tồn tại"), now, &mut out)
        .unwrap();
    assert_eq!(lines(&out), ["Mã quà tặng: Mã không tồn tại"]);
    assert!(bot.snap.gift.is_none());
}

#[test]
fn sending_points_at_the_code_waiting_for_its_answer() {
    let (mut bot, mut out, now) = bot();
    bot.redeem(&codes(&["A1", "A2"]), now, &mut out);
    assert_eq!(bot.snap.gift.as_ref().unwrap().sending, Some(0));
    bot.on_packet(1223, &answer(false, "Mã không tồn tại"), now, &mut out)
        .unwrap();
    assert_eq!(bot.snap.gift.as_ref().unwrap().sending, None);
    bot.on_timer(now + Duration::from_secs(10), &mut out);
    assert_eq!(bot.snap.gift.as_ref().unwrap().sending, Some(1));
    assert_eq!(bot.snapshot().gift_limits.max_wrong, 5);
}

#[test]
fn an_answer_after_the_8_s_still_counts_and_its_notice_is_not_logged_twice() {
    let (mut bot, mut out, now) = bot();
    bot.redeem(&codes(&["A1"]), now, &mut out);
    bot.on_timer(now + Duration::from_secs(8), &mut out);
    out.clear();
    let late = now + Duration::from_secs(9);
    bot.on_packet(1223, &answer(false, "Mã không tồn tại"), late, &mut out)
        .unwrap();
    bot.on_packet(1256, &notice("Mã không tồn tại"), late, &mut out)
        .unwrap();
    assert_eq!(lines(&out), ["Mã quà tặng: Mã không tồn tại"]);
    assert_eq!(bot.snapshot().gift_limits.wrong, 1);
}

#[test]
fn the_count_and_the_lock_outlive_the_session_until_dem_lai() {
    // Manager hands the same GiftMemory to every session of an account.
    let memory: Arc<Mutex<GiftMemory>> = Default::default();
    let session = || {
        Bot::new(
            BotOptions {
                gift: memory.clone(),
                ..BotOptions::default()
            },
            Arc::new(Atlas::default()),
        )
    };
    let (now, mut out) = (Instant::now(), vec![]);
    let mut first = session();
    first.redeem(&codes(&["A1"]), now, &mut out);
    // "Quá nhanh", and again for the same code 30 s later: the lock.
    first
        .on_packet(1223, &g1("s2c/1223 quá nhanh"), now, &mut out)
        .unwrap();
    let now = now + Duration::from_secs(30);
    first.on_timer(now, &mut out);
    first
        .on_packet(1223, &g1("s2c/1223 quá nhanh"), now, &mut out)
        .unwrap();
    // A new login during the lock: still refused.
    out.clear();
    let mut second = session();
    second.redeem(&codes(&["DENBU"]), now + Duration::from_secs(1), &mut out);
    assert!(logged(
        &out,
        "Chưa nhập mã: server đang chặn nhập mã, còn 4 phút 59 giây"
    ));
    assert!(second.snapshot().gift_limits.locked_until.is_some());

    // 5 refused in a row, then a new login: still at 5 until Đếm lại từ 0.
    memory.lock().unwrap().wrong = 5;
    out.clear();
    let mut third = session();
    let later = now + Duration::from_secs(301);
    third.redeem(&codes(&["DENBU"]), later, &mut out);
    assert!(logged(
        &out,
        "Chưa nhập mã: đã có 5 mã bị từ chối liền nhau."
    ));
    assert_eq!(third.snapshot().gift_limits.wrong, 5);
    // (gift_limits says the lock is over by the wall clock, which this test does not move.)
    out.clear();
    third.gift_reset(&mut out);
    assert_eq!(
        lines(&out),
        ["Đếm lại số mã bị từ chối liền nhau từ 0 (trước đó 5)"]
    );
    out.clear();
    third.redeem(&codes(&["DENBU"]), later, &mut out);
    assert_eq!(sent(&out), [wire("DENBU")]);
}

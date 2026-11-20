//! Đập hết of the Túi đồ tab (Bot::break_all): every egg of one bag slot broken one Dùng (c2s/84) after the
//! success notice of the one before, with EGG_GAP between; the end line adds up the Xu khóa spent and what came out.
//! The answer of one egg as tiheo1 had it on 20/11: s2c/46, "Bạn vừa nhận được 1 Kim Đan Dược", s2c/51, s2c/1187 kind 2,
//! "Đập Trứng Gà thành công, trừ 500 Xu khóa".
use cllt_core::atlas::Atlas;
use cllt_core::bot::{Bot, BotOptions, LogKind, Out};
use cllt_core::protocol::Writer;
use std::sync::Arc;
use std::time::Instant;

/// One bag record (0.0.2 layout): `quantity` of item `item_id` in `slot`, uuid "u<slot>".
fn record(w: Writer, slot: u8, item_id: i32, quantity: i32) -> Writer {
    w.u8(slot)
        .i32(item_id)
        .string(&format!("u{slot}"))
        .i32(0)
        .i32(-1)
        .i32(quantity)
        .u8(1)
        .u8(0xff)
        .i32(0)
        .u8(0)
        .u8(0)
        .u8(0)
}

/// 3 Trứng Gà (3) in slot 0 and a Búa Sửa Chữa (2) in slot 1 of a bag of `capacity`; `xu_khoa` Xu khóa.
fn egg_bot(capacity: i32, xu_khoa: i64) -> (Bot, Vec<Out>, Instant) {
    let mut bot = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let (now, mut out) = (Instant::now(), vec![]);
    let w = Writer::new().u8(1).i32(capacity).i32(2);
    let w = record(record(w, 0, 3, 3), 1, 2, 1);
    bot.on_packet(1187, &w.build(), now, &mut out).unwrap();
    bot.on_packet(46, &money(xu_khoa), now, &mut out).unwrap();
    (bot, vec![], now)
}

fn money(xu_khoa: i64) -> Vec<u8> {
    Writer::new()
        .string("update Xu")
        .i64(1_000)
        .i64(xu_khoa)
        .i64(0)
        .build()
}
fn notice(text: &str) -> Vec<u8> {
    Writer::new().u8(1).string(text).build()
}
fn left(slot: u8, n: i32) -> Vec<u8> {
    Writer::new().u8(2).u8(slot).i32(n).build()
}
fn uses(out: &[Out]) -> usize {
    out.iter().filter(|o| matches!(o, Out::Send(84, _))).count()
}
fn items(out: &[Out]) -> Vec<String> {
    out.iter()
        .filter_map(|o| match o {
            Out::Log(LogKind::Item, t) => Some(t.clone()),
            _ => None,
        })
        .collect()
}

/// The answer of one egg; `xu_khoa` is what s2c/46 says after it.
fn answer(
    bot: &mut Bot,
    gain: &str,
    eggs_left: i32,
    xu_khoa: i64,
    now: Instant,
    out: &mut Vec<Out>,
) {
    bot.on_packet(46, &money(xu_khoa), now, out).unwrap();
    bot.on_packet(
        1256,
        &notice(&format!("Bạn vừa nhận được {gain}")),
        now,
        out,
    )
    .unwrap();
    bot.on_packet(1187, &left(0, eggs_left), now, out).unwrap();
    bot.on_packet(
        1256,
        &notice("Đập Trứng Gà thành công, trừ 500 Xu khóa"),
        now,
        out,
    )
    .unwrap();
}

#[test]
fn dap_het_dap_tung_qua_sau_khi_qua_truoc_xong_va_cong_lai_do_nhan_duoc() {
    let (mut bot, mut out, now) = egg_bot(42, 10_000);
    bot.break_all(0, "u0", now, &mut out);
    assert_eq!(
        items(&out),
        ["Đập hết 3 Trứng Gà (ô túi 1): mỗi quả 500 Xu khóa, cần 3 ô trống"]
    );
    assert_eq!(
        out.last(),
        Some(&Out::Send(84, Writer::new().i32(0).build()))
    );
    assert_eq!(bot.snapshot().eggs.map(|e| (e.done, e.total)), Some((0, 3)));
    // Other item buttons and tasks wait while it runs.
    out.clear();
    bot.fight("Gà Điên", 1, 1, now, &mut out);
    assert!(!out.iter().any(|o| matches!(o, Out::Send(..))), "{out:?}");
    out.clear();
    answer(&mut bot, "1 Kim Đan Dược", 2, 9_500, now, &mut out);
    // No c2s/84 before EGG_GAP.
    assert_eq!(uses(&out), 0);
    let mut at = bot.deadline().expect("next egg");
    bot.on_timer(at, &mut out);
    assert_eq!(uses(&out), 1);
    answer(&mut bot, "252 Xu khóa", 1, 9_252, at, &mut out);
    at = bot.deadline().expect("next egg");
    bot.on_timer(at, &mut out);
    assert_eq!(uses(&out), 2);
    answer(&mut bot, "1 Kim Đan Dược", 0, 8_752, at, &mut out);
    at = bot.deadline().expect("end");
    out.clear();
    bot.on_timer(at, &mut out);
    assert_eq!(uses(&out), 0);
    assert_eq!(
        items(&out),
        ["Xong đập trứng: đã đập 3/3 Trứng Gà, tốn 1.500 Xu khóa; được Kim Đan Dược ×2, Xu khóa ×252"]
    );
    assert_eq!(bot.snapshot().eggs, None);
}

#[test]
fn dap_het_dung_khi_thieu_xu_khoa_thieu_o_trong_hay_server_tu_choi() {
    // Xu khóa for one egg only.
    let (mut bot, mut out, now) = egg_bot(42, 700);
    bot.break_all(0, "u0", now, &mut out);
    answer(&mut bot, "1 Búa Sửa Chữa", 2, 200, now, &mut out);
    out.clear();
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert_eq!(uses(&out), 0);
    assert_eq!(
        items(&out),
        ["Dừng đập trứng: thiếu Xu khóa (còn 200, mỗi quả 500); đã đập 1/3 Trứng Gà, tốn 500 Xu khóa; được Búa Sửa Chữa ×1"]
    );
    // A bag of 4 with 2 items: 2 free slots, 3 needed.
    let (mut bot, mut out, now) = egg_bot(4, 10_000);
    bot.break_all(0, "u0", now, &mut out);
    assert_eq!(uses(&out), 0);
    assert_eq!(
        items(&out).last().map(String::as_str),
        Some("Dừng đập trứng: túi chỉ còn 2 ô trống, cần 3; đã đập 0/3 Trứng Gà, tốn 0 Xu khóa")
    );
    // The server refuses.
    let (mut bot, mut out, now) = egg_bot(42, 10_000);
    bot.break_all(0, "u0", now, &mut out);
    out.clear();
    bot.on_packet(1256, &notice("Vật phẩm không đủ số lượng"), now, &mut out)
        .unwrap();
    assert_eq!(
        items(&out),
        ["Dừng đập trứng: server từ chối (Vật phẩm không đủ số lượng); đã đập 0/3 Trứng Gà, tốn 0 Xu khóa"]
    );
    assert_eq!(bot.deadline(), None);
}

#[test]
fn dap_het_dung_khi_bam_dung_hay_server_im_lang_va_chi_nhan_trung() {
    let (mut bot, mut out, now) = egg_bot(42, 10_000);
    // Not an egg, or another item by now.
    bot.break_all(1, "u1", now, &mut out);
    bot.break_all(0, "khác", now, &mut out);
    assert_eq!(
        items(&out),
        [
            "Chưa đập trứng: ô túi 2 không phải trứng",
            "Chưa đập trứng: ô túi 1 giờ là món khác, không phải món đã chọn"
        ]
    );
    assert_eq!(uses(&out), 0);
    // Dừng after the first egg's answer: no more c2s/84.
    bot.break_all(0, "u0", now, &mut out);
    answer(&mut bot, "1 Kim Đan Dược", 2, 9_500, now, &mut out);
    out.clear();
    bot.stop(false, now, &mut out);
    assert_eq!(
        items(&out),
        ["Dừng đập trứng: đã dừng; đã đập 1/3 Trứng Gà, tốn 500 Xu khóa; được Kim Đan Dược ×1"]
    );
    assert_eq!(bot.deadline(), None);
    // No answer within 5 s.
    bot.break_all(0, "u0", now, &mut out);
    out.clear();
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert_eq!(
        items(&out),
        ["Dừng đập trứng: server không trả lời sau 5 s; đã đập 0/2 Trứng Gà, tốn 0 Xu khóa"]
    );
}

/// `n` eggs of item `item_id` in slot 0 of a bag of 42; `xu` Xu and `xu_khoa` Xu khóa.
fn eggs_of(item_id: i32, n: i32, xu: i64, xu_khoa: i64) -> (Bot, Vec<Out>, Instant) {
    let mut bot = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let (now, mut out) = (Instant::now(), vec![]);
    let w = record(Writer::new().u8(1).i32(42).i32(1), 0, item_id, n);
    bot.on_packet(1187, &w.build(), now, &mut out).unwrap();
    let m = Writer::new()
        .string("update Xu")
        .i64(xu)
        .i64(xu_khoa)
        .i64(0)
        .build();
    bot.on_packet(46, &m, now, &mut out).unwrap();
    (bot, vec![], now)
}

#[test]
fn dap_het_trung_linh_dieu_tru_2000_xu_khoa_va_trung_than_ung_tru_xu() {
    // Trứng Linh Điểu (4): 2.000 Xu khóa each; the answer as in the app's log of 21/11.
    let (mut bot, mut out, now) = eggs_of(4, 2, 0, 5_000);
    bot.break_all(0, "u0", now, &mut out);
    assert_eq!(
        items(&out),
        ["Đập hết 2 Trứng Linh Điểu (ô túi 1): mỗi quả 2.000 Xu khóa, cần 3 ô trống"]
    );
    assert_eq!(uses(&out), 1);
    for (text, xu_khoa) in [
        ("Bạn vừa nhận được 1.708 Xu khóa", 3_000),
        ("Đập Trứng Linh Điểu thành công, trừ 2.000 Xu khóa", 3_000),
    ] {
        bot.on_packet(46, &money(xu_khoa), now, &mut out).unwrap();
        bot.on_packet(1256, &notice(text), now, &mut out).unwrap();
    }
    bot.on_packet(1187, &left(0, 1), now, &mut out).unwrap();
    out.clear();
    // 3.000 Xu khóa left (with the 1.708 got, as s2c/46 says): enough for the second.
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert_eq!(uses(&out), 1);
    bot.on_packet(
        1256,
        &notice("Bạn vừa nhận được 3 Búa Sửa Chữa"),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(
        1256,
        &notice("Đập Trứng Linh Điểu thành công, trừ 2.000 Xu khóa"),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(1187, &left(0, 0), now, &mut out).unwrap();
    out.clear();
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert_eq!(
        items(&out),
        ["Xong đập trứng: đã đập 2/2 Trứng Linh Điểu, tốn 4.000 Xu khóa; được Xu khóa ×1.708, Búa Sửa Chữa ×3"]
    );

    // Trứng Thần Ưng (5) is paid in Xu: plenty of Xu khóa does not do.
    let (mut bot, mut out, now) = eggs_of(5, 3, 4_000, 1_000_000);
    bot.break_all(0, "u0", now, &mut out);
    assert_eq!(uses(&out), 0);
    assert_eq!(
        items(&out),
        [
            "Đập hết 3 Trứng Thần Ưng (ô túi 1): mỗi quả 5.000 Xu, cần 3 ô trống",
            "Dừng đập trứng: thiếu Xu (còn 4.000, mỗi quả 5.000); đã đập 0/3 Trứng Thần Ưng, tốn 0 Xu"
        ]
    );
    let (mut bot, mut out, now) = eggs_of(5, 3, 20_000, 0);
    bot.break_all(0, "u0", now, &mut out);
    assert_eq!(uses(&out), 1);
}

//! Sử dụng of Tăng Kinh Nghiệm (U2, tiheo2, 20/11): the server answers c2s/84 with s2c/84 alone (the slot, what is left in
//! it, the timed effects). The app used to wait for nothing it knew: no "Đã dùng", the item still in the bag, the button
//! held for 5 s, and a second press got "Vật phẩm không đủ số lượng".
use cllt_core::atlas::Atlas;
use cllt_core::bot::{Bot, BotOptions, ItemAct, LogKind, Out};
use cllt_core::items::item_used;
use cllt_core::protocol::Writer;
use std::sync::Arc;
use std::time::Instant;

const USED: &str =
    "00000010000000000000010000000006616b6169746f000000010000000365663700030d400000000005265c00";

fn hex(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

/// A whole bag (s2c/1187 kind 1) of one item: `item_id` in `slot`.
fn bag(slot: u8, item_id: i32) -> Vec<u8> {
    Writer::new()
        .u8(1)
        .i32(42)
        .i32(1)
        .u8(slot)
        .i32(item_id)
        .string("4d2c1a52-0000-4000-8000-000000000007")
        .i32(0)
        .i32(-1)
        .i32(1)
        .u8(0)
        .u8(0xff)
        .i32(0)
        .u8(0)
        .u8(0)
        .u8(0)
        .build()
}

#[test]
fn s2c_84_reads_the_slot_and_the_x2_exp() {
    let u = item_used(&hex(USED)).unwrap();
    assert_eq!(
        (u.slot, u.left, u.field, u.name.as_str()),
        (16, 0, 256, "akaito")
    );
    assert_eq!(u.effects.len(), 1);
    assert_eq!(
        (
            u.effects[0].key.as_str(),
            u.effects[0].rate,
            u.effects[0].remaining_ms
        ),
        ("ef7", 200_000, 86_400_000)
    );
}

#[test]
fn dung_tang_kinh_nghiem_xong_ngay_khi_co_s2c_84() {
    let mut bot = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let (now, mut out) = (Instant::now(), vec![]);
    bot.on_packet(1187, &bag(16, 7), now, &mut out).unwrap();
    out.clear();
    bot.item(ItemAct::Use(16), now, &mut out);
    assert!(out.iter().any(|o| matches!(o, Out::Send(84, _))), "{out:?}");
    out.clear();
    bot.on_packet(84, &hex(USED), now, &mut out).unwrap();
    assert_eq!(
        out,
        [Out::Log(
            LogKind::Item,
            "Đã dùng Tăng Kinh Nghiệm: x2 EXP còn 24 giờ 00 phút".into()
        )]
    );
    let snap = bot.snapshot();
    assert!(snap.bag.unwrap().items.is_empty());
    assert_eq!(snap.boosts.len(), 1);
    // The button is free again at once, not after 5 s.
    out.clear();
    bot.item(ItemAct::Use(16), now, &mut out);
    assert_eq!(
        out,
        [Out::Log(
            LogKind::Item,
            "Không có món nào ở ô túi 17".into()
        )]
    );
}

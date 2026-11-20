//! Xóa nhiều of the Túi đồ tab (Bot::discard_many): gear of the bag only, thrown away one Vứt bỏ (c2s/1186 action 2)
//! after the s2c/83 of the one before; items that are not gear are left alone, a refusal stops the rest.
use cllt_core::atlas::Atlas;
use cllt_core::bot::{Bot, BotOptions, LogKind, Out};
use cllt_core::protocol::Writer;
use std::sync::Arc;
use std::time::Instant;

/// One item record of the bag (0.0.2 layout): `item_id` in `slot`, uuid "u<slot>".
fn record(w: Writer, slot: u8, item_id: i32) -> Writer {
    w.u8(slot)
        .i32(item_id)
        .string(&format!("u{slot}"))
        .i32(0)
        .i32(60)
        .i32(1)
        .u8(1)
        .u8(1)
        .i32(0)
        .u8(0)
        .u8(1)
        .u8(0)
}

/// Đao Đại Hiệp (246) in slot 0, Đá cấp 5 (415) in slot 1, Lam Dù (270) in slot 2.
fn bot() -> (Bot, Vec<Out>, Instant) {
    let mut bot = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let (now, mut out) = (Instant::now(), vec![]);
    let mut w = Writer::new().u8(1).i32(42).i32(3);
    for (slot, id) in [(0, 246), (1, 415), (2, 270)] {
        w = record(w, slot, id);
    }
    bot.on_packet(1187, &w.build(), now, &mut out).unwrap();
    (bot, vec![], now)
}

fn items(out: &[Out]) -> Vec<String> {
    out.iter()
        .filter_map(|o| match o {
            Out::Log(LogKind::Item, t) => Some(t.clone()),
            _ => None,
        })
        .collect()
}
fn discards(out: &[Out]) -> Vec<Vec<u8>> {
    out.iter()
        .filter_map(|o| match o {
            Out::Send(1186, p) => Some(p.clone()),
            _ => None,
        })
        .collect()
}
fn left(slot: i32) -> Vec<u8> {
    Writer::new().i32(slot).i32(0).build()
}

#[test]
fn xoa_nhieu_chi_vut_trang_bi_tung_mon_mot() {
    let (mut bot, mut out, now) = bot();
    let picked = vec![(0, "u0".into()), (1, "u1".into()), (2, "u2".into())];
    bot.discard_many(picked, now, &mut out);
    assert_eq!(
        items(&out),
        [
            "Bỏ qua ô túi 2: Đá cấp 5 không phải trang bị",
            "Xóa nhiều: vứt bỏ 2 trang bị",
            "Vứt Đao Đại Hiệp (ô túi 1)",
        ]
    );
    assert_eq!(discards(&out), [vec![2, 0, 0, 0, 0]]);
    out.clear();
    bot.on_packet(83, &left(0), now, &mut out).unwrap();
    assert_eq!(items(&out), ["Đã vứt Đao Đại Hiệp", "Vứt Lam Dù (ô túi 3)"]);
    assert_eq!(discards(&out), [vec![2, 0, 0, 0, 2]]);
    out.clear();
    bot.on_packet(83, &left(2), now, &mut out).unwrap();
    assert_eq!(
        items(&out),
        ["Đã vứt Lam Dù", "Xong xóa nhiều: đã vứt 2/2 trang bị"]
    );
    let bag = bot.snapshot().bag.unwrap();
    assert_eq!(
        bag.items.iter().map(|i| i.item_id).collect::<Vec<_>>(),
        [415]
    );
}

#[test]
fn xoa_nhieu_dung_khi_server_tu_choi() {
    let (mut bot, mut out, now) = bot();
    bot.discard_many(vec![(0, "u0".into()), (2, "u2".into())], now, &mut out);
    out.clear();
    bot.on_packet(83, &left(0), now, &mut out).unwrap();
    out.clear();
    let refused = Writer::new().u8(1).string("Không thể thực hiện").build();
    bot.on_packet(1256, &refused, now, &mut out).unwrap();
    assert_eq!(
        items(&out),
        ["Dừng xóa nhiều: server từ chối (Không thể thực hiện); đã vứt 1/2 trang bị"]
    );
    assert!(discards(&out).is_empty());
}

#[test]
fn xoa_nhieu_bo_qua_o_da_doi_mon() {
    let (mut bot, mut out, now) = bot();
    bot.discard_many(vec![(0, "khác".into()), (1, "u1".into())], now, &mut out);
    assert_eq!(
        items(&out),
        [
            "Bỏ qua ô túi 1: giờ là món khác, không phải món đã chọn",
            "Bỏ qua ô túi 2: Đá cấp 5 không phải trang bị",
            "Xóa nhiều: không có trang bị nào để vứt",
        ]
    );
    assert!(discards(&out).is_empty());
}

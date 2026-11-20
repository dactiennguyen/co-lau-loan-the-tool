//! A quest step whose boss the atlas puts in this map but this zone does not show: the run asks the zone list (c2s/1172)
//! at once and moves to the zone with the fewest players that is not full (c2s/1173), at most 30 zones (Bot::quest_zone;
//! 20/11, Thủ Lĩnh Sơn Tặc of M1 waited for in vain by four accounts). A boss of this zone that only left its tile
//! (s2c/1177 field 1) is waited for instead.
use cllt_core::atlas::{find_upwards, Atlas};
use cllt_core::bot::{Bot, BotOptions, LogKind, Out};
use cllt_core::protocol::Writer;
use std::sync::Arc;
use std::time::Instant;

fn quest_logs(out: &[Out]) -> Vec<String> {
    out.iter()
        .filter_map(|o| match o {
            Out::Log(LogKind::Quest, t) => Some(t.clone()),
            _ => None,
        })
        .collect()
}

#[test]
fn buoc_danh_boss_doi_khu_khi_khu_nay_khong_co_boss() {
    let atlas = Atlas::load(&find_upwards("data/maps.json").expect("data/maps.json"));
    let mut bot = Bot::new(BotOptions::default(), Arc::new(atlas));
    let (mut now, mut out) = (Instant::now(), vec![]);
    bot.on_packet(
        29,
        &Writer::new().string("akaito").string("M1").i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    // The mobs of zone 0, no boss pushed (no s2c/1177).
    let mobs = Writer::new()
        .string("M1")
        .u8(0)
        .string("mob10")
        .string("Gà Điên")
        .i32(1)
        .u8(4)
        .i32(1)
        .i32(1)
        .u8(0)
        .build();
    bot.on_packet(43, &mobs, now, &mut out).unwrap();
    let quest = Writer::new()
        .i32(11)
        .string("Diệt Sơn Tặc")
        .string("")
        .string("main")
        .i32(0)
        .i32(0)
        .i32(1)
        .i32(0)
        .string("Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc")
        .i32(0)
        .i32(500)
        .i32(-1)
        .build();
    bot.on_packet(39, &quest, now, &mut out).unwrap();
    out.clear();
    bot.quest(1, None, now, &mut out);
    // No wait: the zone list is asked at once.
    assert_eq!(quest_logs(&out), ["Bắt đầu: tự làm nhiệm vụ"]);
    assert!(
        out.iter().any(|o| matches!(o, Out::Send(1172, _))),
        "{out:?}"
    );
    // Zones 0 (here), 1 (30 players), 2 (5 players), 3 (full).
    let mut list = Writer::new().u8(4);
    for (zone, players, capacity) in [(0, 20, 50), (1, 30, 50), (2, 5, 50), (3, 50, 50)] {
        list = list.u8(zone).u8(0).u8(players).u8(capacity);
    }
    bot.on_packet(1172, &list.build(), now, &mut out).unwrap();
    now = bot.deadline().unwrap();
    out.clear();
    bot.on_timer(now, &mut out);
    assert!(
        out.iter().any(|o| matches!(o, Out::Send(1173, _))),
        "{out:?}"
    );
    assert_eq!(
        quest_logs(&out),
        ["Khu 0 không có Thủ Lĩnh Sơn Tặc, sang khu 2 tìm (1/30)"]
    );
    assert!(out
        .iter()
        .any(|o| matches!(o, Out::Log(LogKind::Travel, t) if t == "Sang khu 2")));
    // Zone 2: s2c/13 with the zone, its mobs, then its boss; the run challenges it (c2s/1178).
    bot.on_packet(
        13,
        &Writer::new().string("M1").i32(2).build(),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(43, &mobs, now, &mut out).unwrap();
    let boss = Writer::new()
        .string("M1")
        .u8(0)
        .string("mob86100201")
        .string("Thủ Lĩnh Sơn Tặc")
        .i32(11)
        .u8(0)
        .i32(9)
        .i32(1)
        .u8(1)
        .u8(1)
        .i32(89)
        .i32(13)
        .build();
    bot.on_packet(1177, &boss, now, &mut out).unwrap();
    out.clear();
    now = bot.deadline().unwrap();
    bot.on_timer(now, &mut out);
    assert!(
        out.iter().any(|o| matches!(o, Out::Send(1178, _))),
        "{out:?}"
    );
}

#[test]
fn boss_cua_khu_vua_roi_o_dung_thi_doi_tai_cho() {
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
    let mobs = Writer::new().string("M1").u8(0).build();
    bot.on_packet(43, &mobs, now, &mut out).unwrap();
    // The boss of zone 0 is pushed, then leaves its tile (s2c/1177 field 1): back after ~13 s.
    let boss = Writer::new()
        .string("M1")
        .u8(0)
        .string("mob86100001")
        .string("Thủ Lĩnh Sơn Tặc")
        .i32(11)
        .u8(0)
        .i32(9)
        .i32(1)
        .u8(1)
        .u8(1)
        .i32(89)
        .i32(13)
        .build();
    bot.on_packet(1177, &boss, now, &mut out).unwrap();
    let gone = Writer::new()
        .string("M1")
        .u8(1)
        .string("mob86100001")
        .build();
    bot.on_packet(1177, &gone, now, &mut out).unwrap();
    let quest = Writer::new()
        .i32(11)
        .string("Diệt Sơn Tặc")
        .string("")
        .string("main")
        .i32(0)
        .i32(0)
        .i32(1)
        .i32(0)
        .string("Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc")
        .i32(0)
        .i32(500)
        .i32(-1)
        .build();
    bot.on_packet(39, &quest, now, &mut out).unwrap();
    out.clear();
    bot.quest(1, None, now, &mut out);
    assert_eq!(
        quest_logs(&out),
        [
            "Bắt đầu: tự làm nhiệm vụ",
            "Chưa thấy Thủ Lĩnh Sơn Tặc, đợi 5 s (1/6)"
        ]
    );
    assert!(!out.iter().any(|o| matches!(o, Out::Send(1172, _))));
}

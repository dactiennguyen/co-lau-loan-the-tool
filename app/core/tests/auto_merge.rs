//! Tự gộp đá khi túi đầy (bot/merge.rs): a fight job with a full bag goes to Pháp sư on M1, merges its locked stones with
//! Xu khóa only, comes back to its map and zone and fights on; not before merge_every minutes since the last trip, not
//! without a set the Xu khóa pays for. Pháp sư's answers are those of J3 (`vectors.json` "npc"), the maps those of the
//! atlas (data/maps.json).
use cllt_core::atlas::{find_upwards, Atlas};
use cllt_core::bot::{Bot, BotOptions, FightSettings, ItemAct, Out, SmithTask};
use cllt_core::npc::{self, BagItem, MergeOptions};
use cllt_core::protocol::Writer;
use serde_json::Value;
use std::sync::Arc;
use std::time::{Duration, Instant};

mod common;
use common::{hex, logged, tohex, v};

fn notice(text: &str) -> Vec<u8> {
    Writer::new().u8(0).string(text).build()
}
/// c2s/13 through the portal of `from` with id `portal`.
fn portal(from: &str, portal: i32) -> String {
    tohex(&Writer::new().string(from).i32(portal).build())
}
fn sent(out: &[Out], op: i32) -> Vec<String> {
    out.iter()
        .filter_map(|o| match o {
            Out::Send(o, p) if *o == op => Some(tohex(p)),
            _ => None,
        })
        .collect()
}
/// A captured packet of the npc vectors: the first of decoder `f` whose expected value has `field` = `value`.
fn captured(f: &str, field: &str, value: Value) -> Vec<u8> {
    let all = v();
    let case = all["npc"]["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["fn"] == f && c["expected"][field] == value)
        .unwrap_or_else(|| panic!("no {f} with {field} = {value}"))
        .clone();
    hex(case["hex"].as_str().unwrap())
}
fn menu(lines: &[&str]) -> Vec<u8> {
    let mut w = Writer::new()
        .i32(lines.len() as i32)
        .string("Pháp sư")
        .string("Cậu muốn ta giúp việc gì.");
    for (i, l) in lines.iter().enumerate() {
        w = w.u8(i as u8).string(l);
    }
    w.build()
}
fn slot92(slot: i32, text: &str) -> Vec<u8> {
    Writer::new()
        .string("manina")
        .u8(0)
        .i32(slot)
        .i32(0)
        .i32(0)
        .string(text)
        .u8(1)
        .build()
}
/// s2c/42 of 54 slots holding (slot, item, field1) items; field1 0 is locked.
fn bag(items: &[(u8, i32, u8)]) -> Vec<u8> {
    let mut w = Writer::new()
        .string("manina")
        .i32(42)
        .i32(3)
        .u8(2)
        .i32(54)
        .i32(items.len() as i32);
    for &(slot, id, f1) in items {
        w = w
            .u8(slot)
            .i32(id)
            .string(&format!("uuid-{slot}"))
            .i32(0)
            .i32(-1)
            .i32(1)
            .u8(f1)
            .u8(255)
            .i32(0)
            .u8(0)
            .u8(0)
            .u8(0);
    }
    w.build()
}
/// A full bag: `stones` (slot, item, field1) and Trứng Gà in every other slot.
fn full(stones: &[(u8, i32, u8)]) -> Vec<(u8, i32, u8)> {
    (0..54u8)
        .map(|s| {
            stones
                .iter()
                .copied()
                .find(|x| x.0 == s)
                .unwrap_or((s, 3, 0))
        })
        .collect()
}
fn money(xu: i64, xu_khoa: i64) -> Vec<u8> {
    let w = Writer::new().string("update Xu").build();
    [
        w,
        xu.to_be_bytes().to_vec(),
        xu_khoa.to_be_bytes().to_vec(),
        0i64.to_be_bytes().to_vec(),
    ]
    .concat()
}
fn map_head(map_id: &str, name: &str, zone: u8) -> Vec<u8> {
    Writer::new()
        .u8(1)
        .string(map_id)
        .string(name)
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
/// Through a portal and its map: s2c/13, the head of s2c/11 in `zone`, s2c/43, then the timer that ends the trip.
fn arrive(bot: &mut Bot, out: &mut Vec<Out>, now: Instant, map_id: &str, name: &str, zone: u8) {
    let through = Writer::new().string(map_id).i32(0).u8(0).u8(0xff).build();
    bot.on_packet(13, &through, now, out).unwrap();
    bot.on_packet(11, &map_head(map_id, name, zone), now, out)
        .unwrap();
    bot.on_packet(43, &mobs_of(map_id), now, out).unwrap();
    bot.on_timer(bot.deadline().unwrap(), out);
}
const PHAP_SU: &str = "000000024d31000000a1";
/// c2s/15 of the job's challenge of Cóc Xanh.
const CHALLENGE: &str = "000000086d6f62363130303000";

/// manina on M2 zone 3 with Cóc Xanh around, `bag` and `xu_khoa`, Tự gộp đá khi túi đầy on (up to Max, 5 minutes).
fn manina(bag_items: &[(u8, i32, u8)], xu_khoa: i64) -> (Bot, Vec<Out>, Instant) {
    let atlas = Atlas::load(&find_upwards("data/maps.json").expect("data/maps.json"));
    let options = BotOptions {
        fight: FightSettings {
            auto_merge: true,
            ..FightSettings::default()
        },
        rest: Duration::from_secs(3),
        ..BotOptions::default()
    };
    let (mut bot, mut out, now) = (Bot::new(options, Arc::new(atlas)), vec![], Instant::now());
    bot.snap.name = "manina".into();
    bot.on_packet(11, &map_head("M2", "Trại Vân Sơn", 3), now, &mut out)
        .unwrap();
    bot.on_packet(43, &mobs_of("M2"), now, &mut out).unwrap();
    bot.on_packet(42, &bag(bag_items), now, &mut out).unwrap();
    bot.on_packet(46, &money(1_000_000, xu_khoa), now, &mut out)
        .unwrap();
    out.clear();
    (bot, out, now)
}

#[test]
fn a_full_bag_goes_to_phap_su_merges_comes_back_to_its_zone_and_fights_on() {
    // Four locked Đá cấp 1 in a full bag: one set, 2 Xu khóa, 3 slots freed.
    let stones = [(10, 411, 0), (11, 411, 0), (12, 411, 0), (13, 411, 0)];
    let (mut bot, mut out, now) = manina(&full(&stones), 7_370);
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    assert!(
        logged(&out, "Túi đầy (54/54): sang Làng Thanh Khê gộp đá tới Đá cấp 12 (Max), dự kiến 1 lần, tốn 2 Xu khóa, túi trống thêm 3 ô"),
        "{out:?}"
    );
    // To M1 through the portal of Làng Thanh Khê, not the challenge.
    assert_eq!(
        sent(&out, 13),
        [tohex(&Writer::new().string("M2").i32(1014).build())]
    );
    assert!(sent(&out, 15).is_empty(), "{out:?}");

    // On M1: Gộp đá at Pháp sư, the locked set into Luyện đá [Xu khóa].
    out.clear();
    arrive(&mut bot, &mut out, now, "M1", "Làng Thanh Khê", 0);
    assert!(logged(&out, "Gộp đá tới Đá cấp 12"), "{out:?}");
    assert_eq!(sent(&out, 13), [PHAP_SU]);
    out.clear();
    bot.on_packet(
        57,
        &menu(&["Nâng cấp", "Luyện đá", "Tách đá", "Chế tạo"]),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(
        57,
        &menu(&["Luyện đá [Xu khóa]", "Luyện đá [Xu]"]),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(
        sent(&out, 57),
        ["01000000024d31000000a1", "00000000024d31000000a1"]
    );
    bot.on_packet(
        99,
        &captured("craftWindow", "key", "abcd1002".into()),
        now,
        &mut out,
    )
    .unwrap();
    let text = "Luyện thành Đá cấp 2 Khóa\nCần: 2 Xu khóa (không đủ sẽ sử dụng cả Xu)\nTỉ lệ thành công: 100%";
    for slot in [10, 11, 12, 13] {
        bot.on_packet(92, &slot92(slot, text), now, &mut out)
            .unwrap();
    }
    assert_eq!(sent(&out, 91), ["00000000"], "{out:?}");
    bot.on_packet(
        93,
        &captured("stoneResult", "ok", true.into()),
        now,
        &mut out,
    )
    .unwrap();
    // The new bag, three slots freer: nothing more to merge, so back to Trại Vân Sơn.
    out.clear();
    let after: Vec<(u8, i32, u8)> = full(&[])
        .into_iter()
        .filter(|i| ![11, 12, 13].contains(&i.0))
        .map(|i| if i.0 == 10 { (10, 412, 0) } else { i })
        .collect();
    bot.on_packet(42, &bag(&after), now, &mut out).unwrap();
    assert!(
        logged(
            &out,
            "Gộp đá tới Đá cấp 12: đã gộp hết (1 lần, tốn 2 Xu khóa)"
        ),
        "{out:?}"
    );
    assert_eq!(
        sent(&out, 13),
        [tohex(&Writer::new().string("M1").i32(1015).build())]
    );
    assert!(sent(&out, 15).is_empty(), "{out:?}");

    // On M2 in zone 0, as a portal puts it: zone 3 again, then the job's next battle after its rest.
    out.clear();
    arrive(&mut bot, &mut out, now, "M2", "Trại Vân Sơn", 0);
    assert_eq!(sent(&out, 1173), ["03"], "{out:?}");
    assert!(sent(&out, 15).is_empty(), "{out:?}");
    out.clear();
    bot.on_packet(11, &map_head("M2", "Trại Vân Sơn", 3), now, &mut out)
        .unwrap();
    bot.on_packet(43, &mobs_of("M2"), now, &mut out).unwrap();
    assert!(
        logged(
            &out,
            "Đã về Trại Vân Sơn khu 3 sau khi gộp đá (1 lần): túi còn 3 ô trống, đánh tiếp"
        ),
        "{out:?}"
    );
    out.clear();
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert_eq!(sent(&out, 15), [CHALLENGE], "{out:?}");

    // Full again a minute later: not before 5 minutes since it came back, said once, and the job fights on.
    let later = now + Duration::from_secs(60);
    bot.stop(false, later, &mut out);
    bot.on_packet(42, &bag(&full(&stones)), later, &mut out)
        .unwrap();
    out.clear();
    bot.fight("Cóc Xanh", 5, 1, later, &mut out);
    assert!(
        logged(&out, "Túi đầy (54/54) nhưng chưa sang gộp đá: vừa sang gộp đá lần trước, còn 4 phút nữa mới sang lại (cách nhau ít nhất 5 phút); đánh tiếp"),
        "{out:?}"
    );
    assert_eq!(sent(&out, 15), [CHALLENGE]);
    assert!(sent(&out, 13).is_empty());
    // Past the 5 minutes, it goes again.
    let after5 = now + Duration::from_secs(5 * 60 + 1);
    bot.stop(false, after5, &mut out);
    out.clear();
    bot.fight("Cóc Xanh", 5, 1, after5, &mut out);
    assert!(
        logged(&out, "Túi đầy (54/54): sang Làng Thanh Khê"),
        "{out:?}"
    );
    assert!(sent(&out, 15).is_empty());

    // Dừng on the way: the trip is let go with the job.
    out.clear();
    bot.stop(false, after5, &mut out);
    assert!(
        logged(&out, "Kết thúc: thôi đi tới Làng Thanh Khê"),
        "{out:?}"
    );
}

#[test]
fn dung_at_phap_su_lets_the_trip_go_so_a_job_started_at_once_fights_where_it_is() {
    let stones = [(10, 411, 0), (11, 411, 0), (12, 411, 0), (13, 411, 0)];
    let (mut bot, mut out, now) = manina(&full(&stones), 7_370);
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    arrive(&mut bot, &mut out, now, "M1", "Làng Thanh Khê", 0);
    assert_eq!(sent(&out, 13).last().map(String::as_str), Some(PHAP_SU));
    // Dừng while Pháp sư is talked to, then a new job (Tự gộp đá off) before any packet comes.
    bot.stop(false, now, &mut out);
    bot.set_fight(FightSettings::default(), now, &mut out);
    out.clear();
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    assert_eq!(sent(&out, 15), [CHALLENGE], "{out:?}");
    // The next packet does not take the old trip on, back to Trại Vân Sơn.
    out.clear();
    bot.on_packet(43, &mobs_of("M1"), now, &mut out).unwrap();
    assert!(sent(&out, 13).is_empty(), "{out:?}");
}

#[test]
fn turned_off_on_the_way_it_comes_back_without_merging() {
    let stones = [(10, 411, 0), (11, 411, 0), (12, 411, 0), (13, 411, 0)];
    let (mut bot, mut out, now) = manina(&full(&stones), 7_370);
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    bot.set_fight(FightSettings::default(), now, &mut out);
    assert!(logged(&out, "Tắt tự gộp đá khi túi đầy"), "{out:?}");
    out.clear();
    arrive(&mut bot, &mut out, now, "M1", "Làng Thanh Khê", 0);
    assert!(
        logged(
            &out,
            "Đã tắt tự gộp đá khi túi đầy: không gộp, quay về Trại Vân Sơn khu 3"
        ),
        "{out:?}"
    );
    assert_eq!(sent(&out, 13), [portal("M1", 1015)], "not to Pháp sư");
}

#[test]
fn refused_by_phap_su_then_by_the_zone_it_says_so_and_fights_on_where_it_is() {
    let stones = [(10, 411, 0), (11, 411, 0), (12, 411, 0), (13, 411, 0)];
    let (mut bot, mut out, now) = manina(&full(&stones), 7_370);
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    arrive(&mut bot, &mut out, now, "M1", "Làng Thanh Khê", 0);
    // Pháp sư refuses: the way back starts on that notice, with no other packet or timer to come.
    out.clear();
    bot.on_packet(1256, &notice("Vật phẩm không thể sử dụng!"), now, &mut out)
        .unwrap();
    assert!(
        out.iter()
            .any(|o| matches!(o, Out::Log(_, t) if t.contains("Pháp sư từ chối"))),
        "{out:?}"
    );
    assert_eq!(sent(&out, 13), [portal("M1", 1015)], "{out:?}");
    // On Trại Vân Sơn in zone 0, and zone 3 refused: once more 10 s later, not on the packets meanwhile.
    out.clear();
    arrive(&mut bot, &mut out, now, "M2", "Trại Vân Sơn", 0);
    assert_eq!(sent(&out, 1173), ["03"], "{out:?}");
    out.clear();
    bot.on_packet(1256, &notice("Khu vực đã đầy"), now, &mut out)
        .unwrap();
    assert!(
        logged(&out, "Chưa về lại được khu 3: thử lại sau 10 s"),
        "{out:?}"
    );
    bot.on_packet(43, &mobs_of("M2"), now, &mut out).unwrap();
    assert!(
        sent(&out, 1173).is_empty() && sent(&out, 15).is_empty(),
        "{out:?}"
    );
    let later = now + Duration::from_secs(10);
    out.clear();
    bot.on_timer(later, &mut out);
    assert_eq!(sent(&out, 1173), ["03"], "{out:?}");
    // Refused again: the job fights on in zone 0, the line saying nothing was merged.
    out.clear();
    bot.on_packet(1256, &notice("Khu vực đã đầy"), later, &mut out)
        .unwrap();
    assert!(
        logged(&out, "Đã về Trại Vân Sơn khu 0 (không vào lại được khu 3), chưa gộp được bộ đá nào: túi còn 0 ô trống, đánh tiếp"),
        "{out:?}"
    );
    out.clear();
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert_eq!(sent(&out, 15), [CHALLENGE], "{out:?}");
    // The next full bag waits merge_every, said as a trip, not a merge.
    bot.stop(false, later, &mut out);
    out.clear();
    bot.fight(
        "Cóc Xanh",
        5,
        1,
        later + Duration::from_millis(500),
        &mut out,
    );
    assert!(
        logged(
            &out,
            "Túi đầy (54/54) nhưng chưa sang gộp đá: vừa sang gộp đá lần trước, còn 5 phút nữa"
        ),
        "{out:?}"
    );
}

#[test]
fn a_full_bag_without_a_set_or_the_xu_khoa_for_one_fights_on_and_says_why_once() {
    // No stone at all.
    let (mut bot, mut out, now) = manina(&full(&[]), 7_370);
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    assert!(
        logged(&out, "Túi đầy (54/54) nhưng chưa sang gộp đá: không có 4 viên đá khoá cùng cấp nào dưới Đá cấp 12 để gộp; đánh tiếp"),
        "{out:?}"
    );
    assert_eq!(sent(&out, 15), [CHALLENGE]);
    // Four unlocked Đá cấp 1 are not a set: they stay tradeable.
    let unlocked = [(10, 411, 1), (11, 411, 1), (12, 411, 1), (13, 411, 1)];
    let (mut bot, mut out, now) = manina(&full(&unlocked), 7_370);
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    assert!(
        logged(
            &out,
            "Túi đầy (54/54) nhưng chưa sang gộp đá: không có 4 viên đá khoá"
        ),
        "{out:?}"
    );
    // A locked set, but 1 Xu khóa for its 2: Xu are never used.
    let locked = [(10, 411, 0), (11, 411, 0), (12, 411, 0), (13, 411, 0)];
    let (mut bot, mut out, now) = manina(&full(&locked), 1);
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    assert!(
        logged(&out, "Túi đầy (54/54) nhưng chưa sang gộp đá: không đủ Xu khóa để gộp (bộ rẻ nhất cần 2, có 1); đánh tiếp"),
        "{out:?}"
    );
    assert_eq!(sent(&out, 15), [CHALLENGE]);
    assert!(sent(&out, 13).is_empty());
    // Said once a run: a new job says it again.
    out.clear();
    bot.stop(false, now, &mut out);
    out.clear();
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    assert!(
        logged(
            &out,
            "Túi đầy (54/54) nhưng chưa sang gộp đá: không đủ Xu khóa"
        ),
        "{out:?}"
    );
    // A map the atlas has no way to from M1: not left, the trip could not come back.
    let (mut bot, mut out, now) = manina(&full(&locked), 7_370);
    bot.on_packet(11, &map_head("M999", "Nơi lạ", 0), now, &mut out)
        .unwrap();
    bot.on_packet(43, &mobs_of("M999"), now, &mut out).unwrap();
    out.clear();
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    assert!(
        logged(&out, "Túi đầy (54/54) nhưng chưa sang gộp đá: chưa biết đường từ Làng Thanh Khê quay về Nơi lạ; đánh tiếp"),
        "{out:?}"
    );
    assert_eq!(sent(&out, 15), [CHALLENGE]);
    // A bag with room: nothing said, nothing done.
    let (mut bot, mut out, now) = manina(&locked, 7_370);
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    assert!(!logged(&out, "Túi đầy"), "{out:?}");
    assert_eq!(sent(&out, 15), [CHALLENGE]);
}

#[test]
fn merge_forecast_paid_takes_the_cheapest_sets_the_xu_khoa_pays_for() {
    let item = |slot: i32, item_id: i32, field1: u8| BagItem {
        slot,
        item_id,
        field0: 0,
        field1,
        quantity: 1,
    };
    // 16 locked Đá cấp 1: four sets into Đá cấp 2 (2 each), then those four into Đá cấp 3 (7).
    let bag: Vec<BagItem> = (0..16).map(|s| item(s, 411, 0)).collect();
    let o = MergeOptions {
        unlocked: false,
        xu_khoa_only: true,
        ..MergeOptions::default()
    };
    let all = npc::merge_forecast_paid(&bag, o, 1_000);
    assert_eq!((all.merges, all.xu_khoa, all.freed), (5, 15, 15));
    assert_eq!(
        all,
        npc::merge_forecast(&bag, o),
        "enough Xu khóa: as merge_forecast"
    );
    let some = npc::merge_forecast_paid(&bag, o, 10);
    assert_eq!(
        (some.merges, some.xu_khoa, some.freed),
        (4, 8, 12),
        "not the 7 of Đá cấp 3"
    );
    assert_eq!(npc::merge_forecast_paid(&bag, o, 1).merges, 0);
    let low = MergeOptions { up_to: 2, ..o };
    assert_eq!(
        npc::merge_forecast_paid(&bag, low, 1_000).merges,
        4,
        "up to Đá cấp 2"
    );
}

#[test]
fn xu_khoa_only_ends_the_run_before_a_set_the_xu_khoa_left_does_not_pay_for() {
    let locked = [(10, 411, 0), (11, 411, 0), (12, 411, 0), (13, 411, 0)];
    let (mut bot, mut out, now) = manina(&locked, 1);
    bot.on_packet(11, &map_head("M1", "Làng Thanh Khê", 0), now, &mut out)
        .unwrap();
    out.clear();
    let o = MergeOptions {
        unlocked: false,
        xu_khoa_only: true,
        ..MergeOptions::default()
    };
    bot.smith(SmithTask::Merge(o), now, &mut out);
    assert!(
        logged(
            &out,
            "Gộp đá tới Đá cấp 12: không đủ Xu khóa để luyện Đá cấp 2 (cần 2)"
        ),
        "{out:?}"
    );
    assert!(sent(&out, 13).is_empty(), "{out:?}");

    // The fee Pháp sư quotes above the Xu khóa, though merge_fee is paid: not pressed, whatever the Xu.
    let (mut bot, mut out, now) = manina(&locked, 5);
    bot.on_packet(11, &map_head("M1", "Làng Thanh Khê", 0), now, &mut out)
        .unwrap();
    bot.smith(SmithTask::Merge(o), now, &mut out);
    bot.on_packet(
        57,
        &menu(&["Nâng cấp", "Luyện đá", "Tách đá", "Chế tạo"]),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(
        57,
        &menu(&["Luyện đá [Xu khóa]", "Luyện đá [Xu]"]),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(
        99,
        &captured("craftWindow", "key", "abcd1002".into()),
        now,
        &mut out,
    )
    .unwrap();
    out.clear();
    let text = "Luyện thành Đá cấp 2 Khóa\nCần: 9 Xu khóa (không đủ sẽ sử dụng cả Xu)\nTỉ lệ thành công: 100%";
    for slot in [10, 11, 12, 13] {
        bot.on_packet(92, &slot92(slot, text), now, &mut out)
            .unwrap();
    }
    assert!(sent(&out, 91).is_empty(), "{out:?}");
    assert!(
        out.iter()
            .any(|o| matches!(o, Out::Log(_, t) if t.contains("không đủ Xu khóa (cần 9, có 5)"))),
        "{out:?}"
    );
}

/// A packet of the world decoders of `vectors.json`: the first of decoder `f`.
fn decoded(f: &str) -> Vec<u8> {
    let all = v();
    let case = all["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["fn"] == f)
        .unwrap_or_else(|| panic!("no {f}"))
        .clone();
    hex(case["hex"].as_str().unwrap())
}

#[test]
fn an_item_action_or_a_repair_never_answered_does_not_keep_phap_su_refusing_gop_da() {
    let stones = [(10, 411, 0), (11, 411, 0), (12, 411, 0), (13, 411, 0)];
    // Sắp xếp, never answered (no s2c/1187), 6 s before the job: Pháp sư waits 5 s at most for it, as the buttons of
    // Túi đồ do, so the trip merges instead of walking there and back for nothing every merge_every minutes.
    let (mut bot, mut out, now) = manina(&full(&stones), 7_370);
    bot.item(ItemAct::Sort, now, &mut out);
    assert_eq!(sent(&out, 1257).len(), 1, "{out:?}");
    let later = now + Duration::from_secs(6);
    out.clear();
    bot.fight("Cóc Xanh", 5, 1, later, &mut out);
    assert!(
        logged(&out, "Túi đầy (54/54): sang Làng Thanh Khê"),
        "{out:?}"
    );
    out.clear();
    arrive(&mut bot, &mut out, later, "M1", "Làng Thanh Khê", 0);
    assert!(logged(&out, "Gộp đá tới Đá cấp 12"), "{out:?}");
    assert_eq!(sent(&out, 13), [PHAP_SU], "{out:?}");

    // Tự sửa đồ: c2s/48 for the broken weapon, never answered. Dừng and Bắt đầu a second later give the repair up, and
    // its wait with it: the trip that sets off then merges.
    let mut items = full(&stones);
    items[20] = (20, 2, 0); // a Búa Sửa Chữa
    let (mut bot, mut out, now) = manina(&items, 7_370);
    let fight = FightSettings {
        auto_merge: true,
        repair: true,
        ..FightSettings::default()
    };
    bot.set_fight(fight, now, &mut out);
    bot.on_packet(37, &decoded("gearUpdate"), now, &mut out)
        .unwrap();
    out.clear();
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    assert_eq!(sent(&out, 48).len(), 1, "{out:?}");
    assert!(sent(&out, 13).is_empty(), "{out:?}");
    let later = now + Duration::from_secs(1);
    bot.stop(false, later, &mut out);
    out.clear();
    bot.fight("Cóc Xanh", 5, 1, later, &mut out);
    assert!(logged(&out, "Server không trả lời khi sửa "), "{out:?}");
    assert!(
        logged(&out, "Túi đầy (54/54): sang Làng Thanh Khê"),
        "{out:?}"
    );
    out.clear();
    arrive(&mut bot, &mut out, later, "M1", "Làng Thanh Khê", 0);
    assert!(logged(&out, "Gộp đá tới Đá cấp 12"), "{out:?}");
    assert_eq!(sent(&out, 13), [PHAP_SU], "{out:?}");
}

#[test]
fn a_full_bag_does_not_set_off_while_an_item_action_waits_for_its_answer() {
    // Sắp xếp just pressed: Pháp sư would refuse Gộp đá until its answer, so the job fights on, said once, and the trip
    // goes at a later battle.
    let stones = [(10, 411, 0), (11, 411, 0), (12, 411, 0), (13, 411, 0)];
    let (mut bot, mut out, now) = manina(&full(&stones), 7_370);
    bot.item(ItemAct::Sort, now, &mut out);
    out.clear();
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    assert!(
        logged(&out, "Túi đầy (54/54) nhưng chưa sang gộp đá: đang đợi server trả lời việc khác (mua, dùng hay sửa đồ); đánh tiếp"),
        "{out:?}"
    );
    assert_eq!(sent(&out, 15), [CHALLENGE], "{out:?}");
    assert!(sent(&out, 13).is_empty(), "{out:?}");
    // Its answer in: the next battle's turn goes to Pháp sư.
    let later = now + Duration::from_secs(6);
    bot.stop(false, later, &mut out);
    out.clear();
    bot.fight("Cóc Xanh", 5, 1, later, &mut out);
    assert!(
        logged(&out, "Túi đầy (54/54): sang Làng Thanh Khê"),
        "{out:?}"
    );
}

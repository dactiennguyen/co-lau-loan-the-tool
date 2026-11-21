//! The NPC shops and Pháp sư's windows against what src/protocol/npc.ts reads (`npm run export:rust`, vectors.json "npc"):
//! the captured packets of J1–J3, the texts of the windows, and the plans of Gộp đá and Nâng cấp on symap's bag.
use cllt_core::npc::{self, BagItem, MergeOptions};
use cllt_core::world;
use serde_json::Value;

#[test]
fn the_packets_of_the_windows_and_shops_read_as_the_ts_decoders_read_them() {
    let all = v();
    let cases = all["npc"]["decoders"].as_array().unwrap();
    assert!(cases.len() > 25);
    for case in cases {
        let (f, p) = (
            case["fn"].as_str().unwrap(),
            hex(case["hex"].as_str().unwrap()),
        );
        let got = match f {
            "serviceWindow" => serde_json::to_value(npc::service_window(&p).unwrap()),
            "craftWindow" => serde_json::to_value(npc::craft_window(&p).unwrap()),
            "serviceSlot" => serde_json::to_value(npc::service_slot(&p).unwrap()),
            "stoneSlot" => serde_json::to_value(npc::stone_slot(&p).unwrap()),
            "servicePreview" => serde_json::to_value(npc::service_preview(&p).unwrap()),
            "transmuteTarget" => serde_json::to_value(npc::transmute_target(&p).unwrap()),
            "serviceResult" => serde_json::to_value(npc::service_result(&p).unwrap()),
            "stoneResult" => serde_json::to_value(npc::stone_result(&p).unwrap()),
            "shopList" => serde_json::to_value(world::shop_list(&p).unwrap()),
            other => panic!("no Rust decoder for {other}"),
        }
        .unwrap();
        assert_eq!(got, case["expected"], "{f} {}", case["hex"]);
    }
}

#[test]
fn bua_che_tao_bang_tam_and_diem_nang_dong_read_as_the_ts_side() {
    let all = v();
    let o = &all["npc"]["o1"];
    let cases = o["decoders"].as_array().unwrap();
    assert_eq!(cases.len(), 20);
    for case in cases {
        let (f, p) = (
            case["fn"].as_str().unwrap(),
            hex(case["hex"].as_str().unwrap()),
        );
        let got = match f {
            "serviceWindow" => serde_json::to_value(npc::service_window(&p).unwrap()),
            "craftWindow" => serde_json::to_value(npc::craft_window(&p).unwrap()),
            "serviceSlot" => serde_json::to_value(npc::service_slot(&p).unwrap()),
            "craftSlot" => serde_json::to_value(npc::craft_slot(&p).unwrap()),
            "servicePreview" => serde_json::to_value(npc::service_preview(&p).unwrap()),
            "serviceResult" => serde_json::to_value(npc::service_result(&p).unwrap()),
            "stoneResult" => serde_json::to_value(npc::stone_result(&p).unwrap()),
            "npcMenu" => {
                let m = world::npc_menu(&p).unwrap();
                let options: Vec<Value> = (m.options.iter())
                    .map(|(o, l)| serde_json::json!({ "option": o, "label": l }))
                    .collect();
                Ok(serde_json::json!({ "npc": m.npc, "text": m.text, "options": options }))
            }
            other => panic!("no Rust decoder for {other}"),
        }
        .unwrap();
        assert_eq!(got, case["expected"], "{f} {}", case["key"]);
    }
    for case in o["recipes"].as_array().unwrap() {
        let options: Vec<(u8, String)> = (case["options"].as_array().unwrap().iter())
            .map(|x| {
                let option = x["option"].as_u64().unwrap() as u8;
                (option, x["label"].as_str().unwrap().to_string())
            })
            .collect();
        let got = npc::recipes(case["text"].as_str().unwrap(), &options);
        assert_eq!(
            serde_json::to_value(&got).unwrap(),
            case["expected"],
            "{}",
            case["key"]
        );
    }
    let book = cllt_core::items::book();
    for (name, id) in o["ids"].as_object().unwrap() {
        assert_eq!(book.material(name).map(i64::from), id.as_i64(), "{name}");
    }
    let ring = npc::recipes(
        o["recipes"][0]["text"].as_str().unwrap(),
        &(o["recipes"][0]["options"].as_array().unwrap().iter())
            .map(|x| {
                (
                    x["option"].as_u64().unwrap() as u8,
                    x["label"].as_str().unwrap().to_string(),
                )
            })
            .collect::<Vec<_>>(),
    );
    for case in o["materials"].as_array().unwrap() {
        let bag: Vec<BagItem> = serde_json::from_value(case["bag"].clone()).unwrap();
        let recipe = ring
            .iter()
            .find(|r| case["tier"].as_i64() == Some(i64::from(r.tier)))
            .unwrap();
        let (puts, missing) = npc::craft_materials(&bag, recipe, |n| book.material(n));
        let puts: Vec<Value> = (puts.iter())
            .map(|p| serde_json::json!({ "name": p.name, "count": p.count, "slot": p.item.slot }))
            .collect();
        assert_eq!(Value::from(puts), case["puts"], "{case}");
        assert_eq!(
            serde_json::to_value(missing).unwrap(),
            case["missing"],
            "{case}"
        );
    }
    for case in o["ice"].as_array().unwrap() {
        let text = case["text"].as_str().unwrap();
        assert_eq!(npc::ice_held(text), case["held"].as_i64(), "{text}");
    }
    for case in o["points"].as_array().unwrap() {
        let text = case["text"].as_str().unwrap();
        let got = serde_json::to_value(npc::points_text(text)).unwrap();
        assert_eq!(got, case["expected"], "{text}");
    }
    let charm_bag: Vec<BagItem> = serde_json::from_value(o["charmBag"].clone()).unwrap();
    for case in o["charms"].as_array().unwrap() {
        let level = case["level"].as_i64().unwrap() as i32;
        let got = (
            npc::fail_level(level),
            npc::charm_useful(level),
            npc::charm_for(&charm_bag, level).map(|i| i.slot),
        );
        let want = (
            case["failLevel"].as_i64().unwrap() as i32,
            case["charmUseful"].as_bool().unwrap(),
            case["charm"].as_i64().map(|s| s as i32),
        );
        assert_eq!(got, want, "+{level}");
    }
    for case in o["caps"].as_array().unwrap() {
        let (kind, level) = (
            case["type"].as_u64().unwrap() as u8,
            case["level"].as_i64().unwrap() as i32,
        );
        assert_eq!(
            i64::from(npc::item_cap(kind, level)),
            case["cap"].as_i64().unwrap(),
            "{case}"
        );
    }
    for r in o["requests"].as_array().unwrap() {
        let got = tohex(&npc::put_request(
            r["slot"].as_i64().unwrap() as i32,
            r["quantity"].as_i64().unwrap() as i32,
            r["kind"].as_i64().unwrap() as i32,
        ));
        assert_eq!(got, r["hex"], "{}", r["key"]);
        assert_eq!(got, r["phone"], "{}", r["key"]);
    }
}

#[test]
fn quote_reads_the_fee_lượng_odds_stone_and_gain_as_the_ts_side() {
    let all = v();
    for case in all["npc"]["quotes"].as_array().unwrap() {
        let text = case["text"].as_str().unwrap();
        assert_eq!(
            serde_json::to_value(npc::quote(text)).unwrap(),
            case["expected"],
            "{text}"
        );
    }
}

#[test]
fn gop_da_and_nang_cap_plan_what_the_ts_side_plans_on_symaps_bag() {
    let all = v();
    for case in all["npc"]["plans"].as_array().unwrap() {
        let bag: Vec<BagItem> = serde_json::from_value(case["bag"].clone()).unwrap();
        let opts: MergeOptions = serde_json::from_value(case["opts"].clone()).unwrap();
        assert_eq!(
            serde_json::to_value(npc::merge_plan(&bag, opts)).unwrap(),
            case["plan"],
            "{opts:?}"
        );
        assert_eq!(
            serde_json::to_value(npc::merge_forecast(&bag, opts)).unwrap(),
            case["forecast"],
            "{opts:?}"
        );
    }
    let bag: Vec<BagItem> = serde_json::from_value(all["npc"]["plans"][0]["bag"].clone()).unwrap();
    for case in all["npc"]["upgradeStones"].as_array().unwrap() {
        let slots: Vec<i32> = npc::upgrade_stones(&bag, case["unlocked"].as_bool().unwrap())
            .iter()
            .map(|i| i.slot)
            .collect();
        assert_eq!(serde_json::to_value(slots).unwrap(), case["slots"]);
    }
    // Stacked stones (ST1): one entry per stone, at most a window's worth of a stack.
    let stacked = &all["npc"]["upgradeStacked"];
    let bag: Vec<BagItem> = serde_json::from_value(stacked["bag"].clone()).unwrap();
    let slots: Vec<i32> = npc::upgrade_stones(&bag, true)
        .iter()
        .map(|i| i.slot)
        .collect();
    assert_eq!(serde_json::to_value(slots).unwrap(), stacked["slots"]);
    assert_eq!(
        tohex(&npc::put_request(45, 1, npc::PUT_ITEM)),
        all["npc"]["requests"]["put45"].as_str().unwrap()
    );
    assert_eq!(
        tohex(&npc::start_request()),
        all["npc"]["requests"]["start"].as_str().unwrap()
    );
}

#[test]
fn chuyen_hoa_finds_the_targets_and_the_cheapest_item_that_moves_the_level() {
    let book = cllt_core::items::book();
    let def = |id: i32| book.get(id).map(|d| (d.kind, d.level as i32));
    let item = |slot, item_id, field0| BagItem {
        slot,
        item_id,
        field0,
        field1: 0,
        quantity: 1,
    };
    // J3: Nhẫn Quỷ +1 (tier 51) moves to Anh Hùng Nhẫn +0 (tier 51), not to Nhẫn Trơn (tier 1) nor Giáp Đại Tướng.
    let bag = [
        item(42, 366, 1),
        item(50, 357, 0),
        item(15, 306, 0),
        item(45, 227, 0),
        item(26, 616, 0),
    ];
    let targets: Vec<i32> = npc::transmute_targets(&bag, &bag[0], def)
        .iter()
        .map(|i| i.slot)
        .collect();
    assert_eq!(targets, [50]);
    assert!(
        npc::transmute_targets(&bag, &bag[1], def).is_empty(),
        "a +0 item is no source"
    );
    assert_eq!(npc::transmute_item(&bag, 1).map(|i| i.slot), Some(26));
    assert_eq!(npc::transmute_item(&bag, 11), None);
    assert_eq!(
        [1, 21, 51, 101, 201].map(npc::upgrade_cap),
        [4, 8, 12, 16, 16]
    );
    assert_eq!(
        [2, 4, 5, 6, 7, 12].map(npc::merge_fee),
        [2, 26, 103, 410, 1639, 1677722]
    );
}

#[test]
fn requests_97_and_91_are_what_the_phone_sent() {
    use cllt_core::requests::{build, Ctx};
    let put = Ctx {
        slot: Some(45),
        ..Ctx::default()
    };
    assert_eq!(
        tohex(&build(97, &put).unwrap()),
        "0000000000000000000000002d00000001"
    );
    assert_eq!(tohex(&build(91, &Ctx::default()).unwrap()), "00000000");
}

// ---------------------------------------------------------------------------------------------------------------------
// The bot's tasks of Tiện ích, step by step against the answers of J3 (16-upgrade.md#j3).

use cllt_core::atlas::Atlas;
use cllt_core::bot::{Bot, BotOptions, Out, SmithTask};
use cllt_core::protocol::Writer;
use std::sync::Arc;
use std::time::{Duration, Instant};

mod common;
use common::{hex, logged, tohex, v};

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
fn menu(npc: &str, lines: &[&str]) -> Vec<u8> {
    let mut w = Writer::new()
        .i32(lines.len() as i32)
        .string(npc)
        .string("Cậu muốn ta giúp việc gì.");
    for (i, l) in lines.iter().enumerate() {
        w = w.u8(i as u8).string(l);
    }
    w.build()
}
fn root() -> Vec<u8> {
    menu("Pháp sư", &["Nâng cấp", "Luyện đá", "Tách đá", "Chế tạo"])
}
fn slot90(gear: bool, slot: i32, text: &str, ready: bool) -> Vec<u8> {
    Writer::new()
        .string("symap")
        .u8(0)
        .u8(gear as u8)
        .i32(slot)
        .i32(1)
        .i32(0)
        .i32(0)
        .string(text)
        .u8(ready as u8)
        .build()
}
fn slot92(slot: i32, text: &str, ready: bool) -> Vec<u8> {
    Writer::new()
        .string("symap")
        .u8(0)
        .i32(slot)
        .i32(0)
        .i32(0)
        .string(text)
        .u8(ready as u8)
        .build()
}
/// s2c/42 holding (slot, item, +level, field1) items.
fn bag(items: &[(u8, i32, i32, u8)]) -> Vec<u8> {
    let q: Vec<(u8, i32, i32, u8, i32)> =
        items.iter().map(|&(s, i, p, f)| (s, i, p, f, 1)).collect();
    bag_q(&q)
}
/// s2c/42 holding (slot, item, +level, field1, quantity) items: stacks of stones (ST1).
fn bag_q(items: &[(u8, i32, i32, u8, i32)]) -> Vec<u8> {
    let mut w = Writer::new()
        .string("test dong 1")
        .i32(42)
        .i32(3)
        .u8(2)
        .i32(54)
        .i32(items.len() as i32);
    for &(slot, id, plus, f1, quantity) in items {
        w = w
            .u8(slot)
            .i32(id)
            .string(&format!("uuid-{slot}"))
            .i32(plus)
            .i32(-1)
            .i32(quantity)
            .u8(f1)
            .u8(255)
            .i32(0)
            .u8(0)
            .u8(0)
            .u8(0);
    }
    w.build()
}
fn money(xu: i64, xu_khoa: i64, luong: i64) -> Vec<u8> {
    let w = Writer::new().string("update Xu").build();
    [
        w,
        xu.to_be_bytes().to_vec(),
        xu_khoa.to_be_bytes().to_vec(),
        luong.to_be_bytes().to_vec(),
    ]
    .concat()
}
fn notice(text: &str) -> Vec<u8> {
    Writer::new().u8(1).string(text).build()
}
/// symap on M1 with a bag and J2's money: 13.755.600 Xu, 7.952.514 Xu khóa, 16.675 Lượng.
fn symap(items: &[(u8, i32, i32, u8)]) -> (Bot, Vec<Out>, Instant) {
    let (mut bot, mut out, now) = (
        Bot::new(BotOptions::default(), Arc::new(Atlas::default())),
        vec![],
        Instant::now(),
    );
    bot.on_packet(
        29,
        &Writer::new().string("symap").string("M1").i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    // The name comes from s2c/9 at login; c2s/42 asks for the bag by it.
    bot.snap.name = "symap".into();
    bot.on_packet(42, &bag(items), now, &mut out).unwrap();
    bot.on_packet(46, &money(13_755_600, 7_952_514, 16_675), now, &mut out)
        .unwrap();
    out.clear();
    (bot, out, now)
}
const PHAP_SU: &str = "000000024d31000000a1";

#[test]
fn gop_da_luyen_each_set_of_four_then_plans_again_on_the_new_bag() {
    // 8 locked Đá cấp 5 and 2 unlocked Đá cấp 1.
    let stones: Vec<(u8, i32, i32, u8)> = [20, 24, 25, 26, 30, 31, 32, 33]
        .iter()
        .map(|&s| (s, 415, 0, 0))
        .chain([(16, 411, 0, 1), (17, 411, 0, 1)])
        .collect();
    let (mut bot, mut out, now) = symap(&stones);
    bot.smith(
        SmithTask::Merge(MergeOptions {
            up_to: 6,
            ..MergeOptions::default()
        }),
        now,
        &mut out,
    );
    assert!(logged(&out, "Gộp đá tới Đá cấp 6"), "{out:?}");
    assert_eq!(sent(&out, 13), [PHAP_SU]);
    out.clear();
    bot.on_packet(57, &root(), now, &mut out).unwrap();
    assert_eq!(sent(&out, 57), ["01000000024d31000000a1"], "Luyện đá");
    out.clear();
    bot.on_packet(
        57,
        &menu("Pháp sư", &["Luyện đá [Xu khóa]", "Luyện đá [Xu]"]),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(
        sent(&out, 57),
        ["00000000024d31000000a1"],
        "the locked set goes to [Xu khóa]"
    );
    out.clear();
    bot.on_packet(
        99,
        &captured("craftWindow", "key", "abcd1002".into()),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(
        sent(&out, 97),
        [tohex(&npc::put_request(20, 1, npc::PUT_ITEM))]
    );
    for (i, slot) in [24, 25, 26].into_iter().enumerate() {
        out.clear();
        let text = ["Cần chọn đá số lượng 2 đến 24", "Luyện thành Đá cấp 6 Khóa\nCần: 410 Xu khóa (không đủ sẽ sử dụng cả Xu)\nTỉ lệ thành công: 50%",
            "Luyện thành Đá cấp 6 Khóa\nCần: 410 Xu khóa (không đủ sẽ sử dụng cả Xu)\nTỉ lệ thành công: 75%"][i];
        bot.on_packet(92, &slot92(20, text, i > 0), now, &mut out)
            .unwrap();
        assert_eq!(
            sent(&out, 97),
            [tohex(&npc::put_request(slot, 1, npc::PUT_ITEM))]
        );
    }
    out.clear();
    bot.on_packet(92, &slot92(26, "Luyện thành Đá cấp 6 Khóa\nCần: 410 Xu khóa (không đủ sẽ sử dụng cả Xu)\nTỉ lệ thành công: 100%", true), now, &mut out).unwrap();
    assert!(
        logged(
            &out,
            "Bắt đầu: Luyện 4 Đá cấp 5 thành Đá cấp 6 (410 Xu khóa, tỉ lệ 100%)"
        ),
        "{out:?}"
    );
    assert_eq!(sent(&out, 91), ["00000000"]);
    // V1: the stone made in slot 20; the server sends no bag, so the bot asks for it.
    out.clear();
    bot.on_packet(
        93,
        &captured("stoneResult", "ok", true.into()),
        now,
        &mut out,
    )
    .unwrap();
    assert!(logged(&out, "Luyện thành công: Đá cấp 6"), "{out:?}");
    assert_eq!(
        sent(&out, 42),
        [tohex(&Writer::new().string("symap").build())]
    );
    let run = bot.snapshot().smith.unwrap();
    assert_eq!(
        (run.steps, run.ok, run.spent_xu_khoa, run.done),
        (1, 1, 410, None)
    );
    // The new bag: the next set of four.
    out.clear();
    let after: Vec<(u8, i32, i32, u8)> = [30, 31, 32, 33]
        .iter()
        .map(|&s| (s, 415, 0, 0))
        .chain([(20, 416, 0, 0), (16, 411, 0, 1), (17, 411, 0, 1)])
        .collect();
    bot.on_packet(42, &bag(&after), now, &mut out).unwrap();
    assert_eq!(sent(&out, 13), [PHAP_SU]);
    // Dừng between two steps ends it at once; the two unlocked Đá cấp 1 were never a set.
    out.clear();
    bot.stop(false, now, &mut out);
    assert!(
        logged(
            &out,
            "Gộp đá tới Đá cấp 6: Đã dừng (1 lần, tốn 410 Xu khóa)"
        ),
        "{out:?}"
    );
    assert_eq!(
        bot.snapshot().smith.unwrap().done.as_deref(),
        Some("Đã dừng")
    );
    assert_eq!(bot.deadline(), None);
}

#[test]
fn gop_one_row_luyen_one_set_of_that_level_and_lock_then_ends() {
    // 8 locked Đá cấp 5 and 4 unlocked Đá cấp 1: the Gộp button of the locked Đá cấp 5 row, one set.
    let stones: Vec<(u8, i32, i32, u8)> = [20, 24, 25, 26, 30, 31, 32, 33]
        .iter()
        .map(|&s| (s, 415, 0, 0))
        .chain([16, 17, 18, 19].map(|s| (s, 411, 0, 1)))
        .collect();
    let (mut bot, mut out, now) = symap(&stones);
    let one = MergeOptions {
        level: Some(5),
        locked: Some(true),
        sets: Some(1),
        ..MergeOptions::default()
    };
    let items: Vec<BagItem> = bot
        .snapshot()
        .bag
        .unwrap()
        .items
        .iter()
        .map(BagItem::from)
        .collect();
    let forecast = npc::merge_forecast(&items, one);
    assert_eq!(
        (forecast.merges, forecast.xu, forecast.xu_khoa),
        (1, 0, 410)
    );
    bot.smith(SmithTask::Merge(one), now, &mut out);
    assert!(
        logged(&out, "Gộp 4 Đá cấp 5 (khoá) thành 1 Đá cấp 6"),
        "{out:?}"
    );
    out.clear();
    bot.on_packet(57, &root(), now, &mut out).unwrap();
    bot.on_packet(
        57,
        &menu("Pháp sư", &["Luyện đá [Xu khóa]", "Luyện đá [Xu]"]),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(
        sent(&out, 57),
        ["01000000024d31000000a1", "00000000024d31000000a1"],
        "Luyện đá [Xu khóa], not the unlocked Đá cấp 1"
    );
    bot.on_packet(
        99,
        &captured("craftWindow", "key", "abcd1002".into()),
        now,
        &mut out,
    )
    .unwrap();
    for slot in [20, 24, 25] {
        bot.on_packet(92, &slot92(slot, "Luyện thành Đá cấp 6 Khóa\nCần: 410 Xu khóa (không đủ sẽ sử dụng cả Xu)\nTỉ lệ thành công: 75%", true), now, &mut out).unwrap();
    }
    out.clear();
    bot.on_packet(92, &slot92(26, "Luyện thành Đá cấp 6 Khóa\nCần: 410 Xu khóa (không đủ sẽ sử dụng cả Xu)\nTỉ lệ thành công: 100%", true), now, &mut out).unwrap();
    assert_eq!(sent(&out, 91), ["00000000"]);
    bot.on_packet(
        93,
        &captured("stoneResult", "ok", true.into()),
        now,
        &mut out,
    )
    .unwrap();
    // The new bag still has a set of locked Đá cấp 5 and four Đá cấp 1: one set was asked, so it ends.
    out.clear();
    let after: Vec<(u8, i32, i32, u8)> = [30, 31, 32, 33]
        .iter()
        .map(|&s| (s, 415, 0, 0))
        .chain([(20, 416, 0, 0)])
        .chain([16, 17, 18, 19].map(|s| (s, 411, 0, 1)))
        .collect();
    bot.on_packet(42, &bag(&after), now, &mut out).unwrap();
    assert!(sent(&out, 13).is_empty(), "{out:?}");
    assert!(
        logged(
            &out,
            "Gộp 4 Đá cấp 5 (khoá) thành 1 Đá cấp 6: đã gộp xong (1 lần, tốn 410 Xu khóa)"
        ),
        "{out:?}"
    );
    // A row without a set: refused at once, nothing sent.
    out.clear();
    let none = MergeOptions {
        level: Some(1),
        locked: Some(true),
        sets: Some(1),
        ..MergeOptions::default()
    };
    bot.smith(SmithTask::Merge(none), now, &mut out);
    assert!(
        logged(
            &out,
            "Gộp 4 Đá cấp 1 (khoá) thành 1 Đá cấp 2: không có 4 viên Đá cấp 1 (khoá) để gộp"
        ),
        "{out:?}"
    );
}

#[test]
fn nang_cap_puts_the_cheapest_stones_and_opens_the_window_again_without_a_stone_that_raised_nothing(
) {
    // Nhẫn Trơn +0 (tier 1), two unlocked Đá cấp 1, a Đá cấp 3 and a locked Đá cấp 4.
    let (mut bot, mut out, now) = symap(&[
        (15, 306, 0, 1),
        (16, 411, 0, 1),
        (17, 411, 0, 1),
        (29, 413, 0, 1),
        (34, 414, 0, 0),
    ]);
    let task = SmithTask::Upgrade {
        slot: 15,
        careful: false,
        rate: 100,
        to_level: 4,
        unlocked: true,
        quote: false,
        worn: false,
        charm: true,
        stones: vec![],
    };
    bot.smith(task, now, &mut out);
    let open = |bot: &mut Bot, out: &mut Vec<Out>| {
        bot.on_packet(57, &root(), now, out).unwrap();
        bot.on_packet(
            57,
            &menu(
                "Pháp sư",
                &[
                    "Nâng cấp [Thường]",
                    "Nâng cấp [Cẩn thận]",
                    "Chuyển hoá trang bị",
                ],
            ),
            now,
            out,
        )
        .unwrap();
        bot.on_packet(
            96,
            &captured("serviceWindow", "title", "Nâng cấp [thường]".into()),
            now,
            out,
        )
        .unwrap();
    };
    out.clear();
    open(&mut bot, &mut out);
    assert_eq!(
        sent(&out, 57),
        ["00000000024d31000000a1", "00000000024d31000000a1"]
    );
    assert_eq!(
        sent(&out, 97),
        [tohex(&npc::put_request(15, 1, npc::PUT_ITEM))],
        "the item first"
    );
    let price = |rate: i32| {
        format!(
            "Cần: 19 Xu khóa (không đủ sẽ sử dụng cả Xu)\nCần: 0 Lượng\nTỉ lệ thành công: {rate}%"
        )
    };
    // The odds after each stone, as P3/P4 of J2 measured them: 16, 33, 80 (the cap), then 80 again.
    let mut put = vec![];
    for (answer, next) in [
        (
            slot90(
                true,
                15,
                "Cần chọn trang bị và đá (có thể thêm bùa bảo vệ)",
                false,
            ),
            16,
        ),
        (slot90(false, 16, &price(16), true), 17),
        (slot90(false, 17, &price(33), true), 29),
        (slot90(false, 29, &price(80), true), 34),
    ] {
        out.clear();
        bot.on_packet(90, &answer, now, &mut out).unwrap();
        put.extend(sent(&out, 97));
        assert_eq!(
            sent(&out, 97),
            [tohex(&npc::put_request(next, 1, npc::PUT_ITEM))]
        );
    }
    // Đá cấp 4 raised nothing: the window opens again for the three stones before it, and nothing was pressed.
    out.clear();
    bot.on_packet(90, &slot90(false, 34, &price(80), true), now, &mut out)
        .unwrap();
    assert_eq!(
        (sent(&out, 13), sent(&out, 91).len()),
        (vec![PHAP_SU.to_string()], 0)
    );
    out.clear();
    open(&mut bot, &mut out);
    for (answer, next) in [
        (
            slot90(
                true,
                15,
                "Cần chọn trang bị và đá (có thể thêm bùa bảo vệ)",
                false,
            ),
            Some(16),
        ),
        (slot90(false, 16, &price(16), true), Some(17)),
        (slot90(false, 17, &price(33), true), Some(29)),
        (slot90(false, 29, &price(80), true), None),
    ] {
        out.clear();
        bot.on_packet(90, &answer, now, &mut out).unwrap();
        match next {
            Some(s) => assert_eq!(
                sent(&out, 97),
                [tohex(&npc::put_request(s, 1, npc::PUT_ITEM))]
            ),
            None => assert_eq!(sent(&out, 91), ["00000000"], "{out:?}"),
        }
    }
    assert!(
        logged(
            &out,
            "Bắt đầu: Nâng Nhẫn Trơn +0 lên +1 (19 Xu khóa, tỉ lệ 80%)"
        ),
        "{out:?}"
    );
    // X1: it failed; the ring stays +0 and the three stones are gone.
    out.clear();
    bot.on_packet(
        91,
        &captured("serviceResult", "ok", false.into()),
        now,
        &mut out,
    )
    .unwrap();
    assert!(
        logged(&out, "Nâng cấp thất bại: Nhẫn Trơn còn +0, mất 3 viên đá"),
        "{out:?}"
    );
    out.clear();
    bot.on_packet(42, &bag(&[(15, 306, 0, 1), (34, 414, 0, 0)]), now, &mut out)
        .unwrap();
    assert_eq!(
        sent(&out, 13),
        [PHAP_SU],
        "the next try, with the stone left"
    );
    out.clear();
    bot.stop(false, now, &mut out);
    let run = bot.snapshot().smith.unwrap();
    assert_eq!((run.steps, run.failed, run.spent_xu_khoa), (1, 1, 19));
}

#[test]
fn nang_cap_with_stones_picked_puts_exactly_those_and_presses_once() {
    // Nhẫn Trơn +0, two Đá cấp 1 and a locked Đá cấp 4 the player keeps.
    let (mut bot, mut out, now) = symap(&[
        (15, 306, 0, 1),
        (16, 411, 0, 1),
        (17, 411, 0, 1),
        (34, 414, 0, 0),
    ]);
    let picked = |stones: Vec<i32>| SmithTask::Upgrade {
        slot: 15,
        careful: false,
        rate: 100,
        to_level: 4,
        unlocked: false,
        quote: false,
        worn: false,
        charm: true,
        stones,
    };
    // More of a slot than it holds, or a slot without a stone: refused, nothing sent.
    bot.smith(picked(vec![34, 34]), now, &mut out);
    assert!(sent(&out, 13).is_empty(), "{out:?}");
    assert!(
        logged(
            &out,
            "Chưa Nâng cấp Nhẫn Trơn tới +4: ô túi 35 chỉ có 1 viên, đã chọn 2"
        ),
        "{out:?}"
    );
    out.clear();
    bot.smith(picked(vec![16, 15]), now, &mut out);
    assert!(
        logged(
            &out,
            "Chưa Nâng cấp Nhẫn Trơn tới +4: ô túi 16 không phải đá nâng cấp"
        ),
        "{out:?}"
    );
    // The two unlocked Đá cấp 1 (unlocked off), at 33% although 100% is asked: the player saw the odds.
    out.clear();
    bot.smith(picked(vec![16, 17]), now, &mut out);
    bot.on_packet(57, &root(), now, &mut out).unwrap();
    bot.on_packet(
        57,
        &menu(
            "Pháp sư",
            &[
                "Nâng cấp [Thường]",
                "Nâng cấp [Cẩn thận]",
                "Chuyển hoá trang bị",
            ],
        ),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(
        96,
        &captured("serviceWindow", "title", "Nâng cấp [thường]".into()),
        now,
        &mut out,
    )
    .unwrap();
    let price = |rate: i32| {
        format!(
            "Cần: 19 Xu khóa (không đủ sẽ sử dụng cả Xu)\nCần: 0 Lượng\nTỉ lệ thành công: {rate}%"
        )
    };
    let mut put = sent(&out, 97);
    for answer in [
        slot90(
            true,
            15,
            "Cần chọn trang bị và đá (có thể thêm bùa bảo vệ)",
            false,
        ),
        slot90(false, 16, &price(16), true),
    ] {
        out.clear();
        bot.on_packet(90, &answer, now, &mut out).unwrap();
        put.extend(sent(&out, 97));
    }
    assert_eq!(
        put,
        [15, 16, 17].map(|s| tohex(&npc::put_request(s, 1, npc::PUT_ITEM)))
    );
    out.clear();
    bot.on_packet(90, &slot90(false, 17, &price(33), true), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 91), ["00000000"], "{out:?}");
    assert_eq!(bot.snapshot().smith.unwrap().rates, [16, 33]);
    // It failed: the task ends on the next bag instead of trying again with other stones.
    out.clear();
    bot.on_packet(
        91,
        &captured("serviceResult", "ok", false.into()),
        now,
        &mut out,
    )
    .unwrap();
    out.clear();
    bot.on_packet(42, &bag(&[(15, 306, 0, 1), (34, 414, 0, 0)]), now, &mut out)
        .unwrap();
    assert!(sent(&out, 13).is_empty(), "{out:?}");
    assert!(
        logged(
            &out,
            "Nâng cấp Nhẫn Trơn tới +4: đã bấm với đá đã chọn; Nhẫn Trơn còn +0 (1 lần, tốn 19 Xu khóa)"
        ),
        "{out:?}"
    );
}

#[test]
fn nang_cap_out_of_stones_under_the_rate_presses_nothing() {
    // Nhẫn Trơn +0 and one Đá cấp 1: 16%, far under the 100% asked and under any cap of Thường.
    let (mut bot, mut out, now) = symap(&[(15, 306, 0, 1), (16, 411, 0, 1)]);
    bot.smith(
        SmithTask::Upgrade {
            slot: 15,
            careful: false,
            rate: 100,
            to_level: 4,
            unlocked: true,
            quote: false,
            worn: false,
            charm: true,
            stones: vec![],
        },
        now,
        &mut out,
    );
    bot.on_packet(57, &root(), now, &mut out).unwrap();
    bot.on_packet(
        57,
        &menu(
            "Pháp sư",
            &[
                "Nâng cấp [Thường]",
                "Nâng cấp [Cẩn thận]",
                "Chuyển hoá trang bị",
            ],
        ),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(
        96,
        &captured("serviceWindow", "title", "Nâng cấp [thường]".into()),
        now,
        &mut out,
    )
    .unwrap();
    let price = "Cần: 19 Xu khóa (không đủ sẽ sử dụng cả Xu)\nCần: 0 Lượng\nTỉ lệ thành công: 16%";
    for answer in [
        slot90(
            true,
            15,
            "Cần chọn trang bị và đá (có thể thêm bùa bảo vệ)",
            false,
        ),
        slot90(false, 16, price, true),
    ] {
        out.clear();
        bot.on_packet(90, &answer, now, &mut out).unwrap();
    }
    assert!(sent(&out, 91).is_empty(), "nothing pressed: {out:?}");
    assert!(
        logged(
            &out,
            "Nâng cấp Nhẫn Trơn tới +4: đặt hết 1 viên đá chỉ được 16%, chưa tới 100% muốn đạt; thêm đá hoặc hạ tỉ lệ"
        ),
        "{out:?}"
    );
    let run = bot.snapshot().smith.unwrap();
    assert_eq!((run.steps, run.spent_xu_khoa), (0, 0));
    assert!(run.done.is_some());
}

/// Nâng cấp [Thường] of Nhẫn Trơn up to +4 at `rate`, the window open and the ring put in: what comes after is the
/// answer to the first stone.
fn upgrade_window(items: &[(u8, i32, i32, u8)], rate: i32) -> (Bot, Vec<Out>, Instant) {
    let (mut bot, mut out, now) = symap(items);
    bot.smith(
        SmithTask::Upgrade {
            slot: 15,
            careful: false,
            rate,
            to_level: 4,
            unlocked: true,
            quote: false,
            worn: false,
            charm: true,
            stones: vec![],
        },
        now,
        &mut out,
    );
    open_upgrade(&mut bot, &mut out, now);
    (bot, out, now)
}

fn open_upgrade(bot: &mut Bot, out: &mut Vec<Out>, now: Instant) {
    bot.on_packet(57, &root(), now, out).unwrap();
    bot.on_packet(
        57,
        &menu(
            "Pháp sư",
            &[
                "Nâng cấp [Thường]",
                "Nâng cấp [Cẩn thận]",
                "Chuyển hoá trang bị",
            ],
        ),
        now,
        out,
    )
    .unwrap();
    bot.on_packet(
        96,
        &captured("serviceWindow", "title", "Nâng cấp [thường]".into()),
        now,
        out,
    )
    .unwrap();
    bot.on_packet(
        90,
        &slot90(
            true,
            15,
            "Cần chọn trang bị và đá (có thể thêm bùa bảo vệ)",
            false,
        ),
        now,
        out,
    )
    .unwrap();
}

fn odds(rate: i32) -> String {
    format!("Cần: 769 Xu khóa (không đủ sẽ sử dụng cả Xu)\nCần: 0 Lượng\nTỉ lệ thành công: {rate}%")
}

/// The server rounds the odds down to a whole percent, so at +5 and up a Đá cấp 1 adds less than 1%: two of them both say
/// 0%. That is no cap: the bot puts the next stone, and out of stones under the rate it presses nothing. It never opened
/// the window again for one stone and pressed at 0% (review of 02/11).
#[test]
fn nang_cap_low_stones_that_round_to_the_same_odds_are_no_cap() {
    let (mut bot, mut out, now) = upgrade_window(
        &[
            (15, 306, 0, 1),
            (16, 411, 0, 1),
            (17, 411, 0, 1),
            (18, 411, 0, 1),
        ],
        80,
    );
    for (slot, next) in [(16, Some(17)), (17, Some(18)), (18, None)] {
        out.clear();
        bot.on_packet(90, &slot90(false, slot, &odds(0), true), now, &mut out)
            .unwrap();
        match next {
            Some(s) => assert_eq!(
                sent(&out, 97),
                [tohex(&npc::put_request(s, 1, npc::PUT_ITEM))],
                "{out:?}"
            ),
            None => assert!(sent(&out, 97).is_empty(), "{out:?}"),
        }
        assert!(sent(&out, 91).is_empty(), "nothing pressed: {out:?}");
        assert!(sent(&out, 13).is_empty(), "no window again: {out:?}");
    }
    assert!(
        logged(
            &out,
            "Nâng cấp Nhẫn Trơn tới +4: đặt hết 3 viên đá chỉ được 0%, chưa tới 80% muốn đạt; thêm đá hoặc hạ tỉ lệ"
        ),
        "{out:?}"
    );
    let run = bot.snapshot().smith.unwrap();
    assert_eq!((run.steps, run.spent_xu_khoa), (0, 0));

    // A Đá cấp 3 after two that stayed at 1%: the odds reach the rate with all three, pressed without opening again.
    let (mut bot, mut out, now) = upgrade_window(
        &[
            (15, 306, 0, 1),
            (16, 411, 0, 1),
            (17, 411, 0, 1),
            (29, 413, 0, 1),
        ],
        80,
    );
    for (slot, rate) in [(16, 1), (17, 1), (29, 80)] {
        out.clear();
        bot.on_packet(90, &slot90(false, slot, &odds(rate), true), now, &mut out)
            .unwrap();
    }
    assert_eq!(sent(&out, 91), ["00000000"], "{out:?}");
    assert!(sent(&out, 13).is_empty(), "{out:?}");
}

/// The window opened again for the stones before the cap says lower odds than the first time: Bắt đầu is not pressed
/// under the rate asked, whatever put the stones in.
#[test]
fn nang_cap_never_presses_under_the_rate_unless_it_may_be_the_cap() {
    let (mut bot, mut out, now) = upgrade_window(
        &[
            (15, 306, 0, 1),
            (16, 411, 0, 1),
            (29, 413, 0, 1),
            (34, 414, 0, 0),
        ],
        100,
    );
    for (slot, rate) in [(16, 16), (29, 80), (34, 80)] {
        out.clear();
        bot.on_packet(90, &slot90(false, slot, &odds(rate), true), now, &mut out)
            .unwrap();
    }
    // 80% twice: the cap; the window opens again for the two stones before Đá cấp 4.
    assert_eq!(sent(&out, 13), [PHAP_SU.to_string()], "{out:?}");
    out.clear();
    open_upgrade(&mut bot, &mut out, now);
    for (slot, rate) in [(16, 16), (29, 70)] {
        out.clear();
        bot.on_packet(90, &slot90(false, slot, &odds(rate), true), now, &mut out)
            .unwrap();
    }
    assert!(sent(&out, 91).is_empty(), "{out:?}");
    assert!(
        logged(
            &out,
            "Nâng cấp Nhẫn Trơn tới +4: tỉ lệ chỉ 70%, chưa tới 100% muốn đạt; không bấm"
        ),
        "{out:?}"
    );
}

#[test]
fn hoi_gia_says_the_price_and_odds_and_presses_nothing() {
    let (mut bot, mut out, now) = symap(&[(42, 366, 0, 0), (35, 415, 0, 0), (36, 415, 0, 0)]);
    bot.smith(
        SmithTask::Upgrade {
            slot: 42,
            careful: true,
            rate: 100,
            to_level: 4,
            unlocked: true,
            quote: true,
            worn: false,
            charm: true,
            stones: vec![],
        },
        now,
        &mut out,
    );
    bot.on_packet(57, &root(), now, &mut out).unwrap();
    bot.on_packet(
        57,
        &menu(
            "Pháp sư",
            &[
                "Nâng cấp [Thường]",
                "Nâng cấp [Cẩn thận]",
                "Chuyển hoá trang bị",
            ],
        ),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(sent(&out, 57)[1], "01000000024d31000000a1", "Cẩn thận");
    bot.on_packet(
        96,
        &captured("serviceWindow", "title", "Nâng cấp [cẩn thận]".into()),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(
        90,
        &slot90(
            true,
            42,
            "Cần chọn trang bị và đá (có thể thêm bùa bảo vệ)",
            false,
        ),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(
        1258,
        &captured("servicePreview", "level", 1.into()),
        now,
        &mut out,
    )
    .unwrap();
    out.clear();
    bot.on_packet(
        90,
        &slot90(
            false,
            35,
            "Cần: 19 Xu khóa (không đủ sẽ sử dụng cả Xu)\nCần: 5 Lượng\nTỉ lệ thành công: 100%",
            true,
        ),
        now,
        &mut out,
    )
    .unwrap();
    assert!(logged(&out, "Hỏi giá nâng cấp [Cẩn thận] Nhẫn Quỷ: Nâng Nhẫn Quỷ +0 lên +1: 19 Xu khóa + 5 Lượng, tỉ lệ 100%"), "{out:?}");
    assert!(sent(&out, 91).is_empty() && sent(&out, 97).is_empty());
    let run = bot.snapshot().smith.unwrap();
    assert_eq!(
        (
            run.kind,
            run.quote.unwrap().luong,
            run.preview.is_some(),
            run.steps
        ),
        ("quote", 5, true, 0)
    );
}

#[test]
fn a_refusal_or_silence_ends_the_task_and_tach_da_reads_the_stones_it_gave() {
    let open = |bot: &mut Bot, out: &mut Vec<Out>, now| {
        bot.smith(SmithTask::Separate { slot: 45 }, now, out);
        bot.on_packet(57, &root(), now, out).unwrap();
        bot.on_packet(
            96,
            &captured("serviceWindow", "title", "Tách đá trang bị".into()),
            now,
            out,
        )
        .unwrap();
        bot.on_packet(
            90,
            &slot90(true, 45, "Nhận được: 2 Đá cấp 1, ", true),
            now,
            out,
        )
        .unwrap();
    };
    // W3 the first time: the bag was full, and Bắt đầu was refused.
    let (mut bot, mut out, now) = symap(&[(45, 227, 1, 0)]);
    open(&mut bot, &mut out, now);
    assert_eq!(sent(&out, 57), ["02000000024d31000000a1"]);
    assert!(
        logged(&out, "Bắt đầu: Đặt món vào Tách đá (miễn phí)"),
        "{out:?}"
    );
    out.clear();
    bot.on_packet(1256, &notice("Rương đồ không đủ ô trống"), now, &mut out)
        .unwrap();
    assert!(
        logged(
            &out,
            "Tách đá Giáp Đại Tướng: Pháp sư từ chối: Rương đồ không đủ ô trống"
        ),
        "{out:?}"
    );
    // With room: s2c/91 brings the armour at +0 and the two stones; the bag that follows ends it.
    open(&mut bot, &mut out, now);
    out.clear();
    let split = v()["npc"]["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| {
            c["fn"] == "serviceResult"
                && c["expected"]["received"]
                    .as_array()
                    .is_some_and(|r| r.len() == 2)
        })
        .map(|c| hex(c["hex"].as_str().unwrap()))
        .unwrap();
    bot.on_packet(91, &split, now, &mut out).unwrap();
    assert!(
        logged(&out, "Tách đá xong, nhận Đá cấp 1, Đá cấp 1"),
        "{out:?}"
    );
    bot.on_packet(
        42,
        &bag(&[(45, 227, 0, 0), (26, 411, 0, 0), (30, 411, 0, 0)]),
        now,
        &mut out,
    )
    .unwrap();
    assert!(
        logged(&out, "Tách đá Giáp Đại Tướng: đã tách xong (1 lần)"),
        "{out:?}"
    );
    let run = bot.snapshot().smith.unwrap();
    assert_eq!((run.ok, run.item.map(|i| i.field0)), (1, Some(0)));
    // A +0 item is refused before anything is sent; silence for 8 s ends a task.
    out.clear();
    bot.smith(SmithTask::Separate { slot: 45 }, now, &mut out);
    assert!(
        logged(
            &out,
            "Chưa Tách đá Giáp Đại Tướng: chỉ tách đá được món đã nâng cấp"
        ),
        "{out:?}"
    );
    bot.smith(
        SmithTask::Upgrade {
            slot: 45,
            careful: false,
            rate: 100,
            to_level: 4,
            unlocked: true,
            quote: true,
            worn: false,
            charm: true,
            stones: vec![],
        },
        now,
        &mut out,
    );
    out.clear();
    bot.on_timer(now + Duration::from_secs(9), &mut out);
    assert!(
        logged(
            &out,
            "Hỏi giá nâng cấp Giáp Đại Tướng: Pháp sư không trả lời sau 8 s"
        ),
        "{out:?}"
    );
    assert_eq!(bot.deadline(), None);
}

#[test]
fn doi_luong_talks_to_huong_lao_and_counts_each_exchange() {
    let (mut bot, mut out, now) = symap(&[]);
    bot.smith(
        SmithTask::Exchange {
            option: 1,
            times: 2,
        },
        now,
        &mut out,
    );
    assert!(logged(&out, "Đổi 100 Lượng lấy 110.000 Xu khóa"), "{out:?}");
    assert_eq!(sent(&out, 13), ["000000024d3100000066"]);
    for _ in 0..2 {
        out.clear();
        bot.on_packet(
            57,
            &menu(
                "Hương Lão Trần Bá",
                &[
                    "Mã quà tặng",
                    "Đổi lượng",
                    "Nhiệm vụ hàng ngày",
                    "Điểm năng động",
                ],
            ),
            now,
            &mut out,
        )
        .unwrap();
        assert_eq!(sent(&out, 57), ["01000000024d3100000066"]);
        out.clear();
        bot.on_packet(57, &captured_menu(), now, &mut out).unwrap();
        assert_eq!(sent(&out, 57), ["01000000024d3100000066"], "55.000 Xu khóa");
        out.clear();
        bot.on_packet(
            1256,
            &notice("Bạn vừa nhận được 55.000 Xu khóa"),
            now,
            &mut out,
        )
        .unwrap();
    }
    // The last menu was Đổi lượng, whose lines exchange at once: Hương Lão is talked to again before the task ends, so
    // the menu the server remembers is his first one (G1, NP1).
    assert_eq!(sent(&out, 13), ["000000024d3100000066"]);
    assert!(bot.snapshot().smith.unwrap().done.is_none());
    out.clear();
    let root = menu(
        "Hương Lão Trần Bá",
        &[
            "Mã quà tặng",
            "Đổi lượng",
            "Nhiệm vụ hàng ngày",
            "Điểm năng động",
        ],
    );
    bot.on_packet(57, &root, now, &mut out).unwrap();
    assert!(sent(&out, 57).is_empty());
    assert!(
        logged(
            &out,
            "Đổi 100 Lượng lấy 110.000 Xu khóa: đã đổi xong (2 lần, tốn 100 Lượng)"
        ),
        "{out:?}"
    );
    // Not enough Lượng, or not on M1: nothing is sent.
    out.clear();
    bot.smith(
        SmithTask::Exchange {
            option: 0,
            times: 400,
        },
        now,
        &mut out,
    );
    assert!(
        logged(
            &out,
            "Chưa Đổi 20000 Lượng lấy 20.000.000 Xu: không đủ Lượng"
        ),
        "{out:?}"
    );
    assert!(sent(&out, 13).is_empty());
}
fn captured_menu() -> Vec<u8> {
    menu(
        "Hương Lão Trần Bá",
        &["50 lượng nhận 50.000 Xu", "50 lượng nhận 55.000 Xu khóa"],
    )
}

#[test]
fn every_shop_opens_down_its_path_and_buys_for_xu_xu_khoa_or_luong() {
    let (mut bot, mut out, now) = symap(&[]);
    // Cửa hàng [Lượng]: line 2 of Lái Buôn.
    bot.open_shop_kind(8, now, &mut out);
    assert!(
        logged(&out, "Mở cửa hàng Lái Buôn (Cửa hàng [Lượng])"),
        "{out:?}"
    );
    out.clear();
    bot.on_packet(
        57,
        &menu("Lái Buôn", &["Vũ khí", "Dược phẩm", "Cửa hàng [Lượng]"]),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(sent(&out, 57), ["02000000024d310000006a"]);
    out.clear();
    bot.on_packet(1190, &captured("shopList", "kind", 8.into()), now, &mut out)
        .unwrap();
    assert!(
        logged(&out, "Cửa hàng Lái Buôn (Cửa hàng [Lượng]): 19 món"),
        "{out:?}"
    );
    out.clear();
    bot.buy(404, 1, now, &mut out);
    assert!(logged(&out, "Mua 1 Đá cấp 6 giá 2 Lượng"), "{out:?}");
    assert_eq!(sent(&out, 1190), ["000000019400000001"]);
    bot.on_packet(
        1256,
        &notice("Bạn vừa mua thành công! 1 Đá cấp 6"),
        now,
        &mut out,
    )
    .unwrap();
    // Nhẫn [Xu khóa] of Bà Tư Hạnh: lines 2 then 1.
    out.clear();
    bot.open_shop_kind(13, now, &mut out);
    assert_eq!(sent(&out, 13), ["000000024d3100000067"]);
    bot.on_packet(
        57,
        &menu("Bà Tư Hạnh", &["Nón", "Giáp", "Nhẫn"]),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(
        57,
        &menu("Bà Tư Hạnh", &["Nhẫn [Xu]", "Nhẫn [Xu khóa]"]),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(
        sent(&out, 57),
        ["02000000024d3100000067", "01000000024d3100000067"]
    );
    bot.on_packet(1190, &captured("shopList", "kind", 5.into()), now, &mut out)
        .unwrap();
    assert!(
        logged(&out, "Cửa hàng Bà Tư Hạnh (Nhẫn): 12 món"),
        "{out:?}"
    );
    assert_eq!(bot.snapshot().shop.unwrap().items[0].ranges.len(), 1);
    // A ring does not stack: more than one in a purchase is refused before it goes ("Số lượng không chính xác!").
    let ring = bot.snapshot().shop.unwrap().items[0].clone();
    let name = cllt_core::items::book()
        .get(ring.item_id)
        .unwrap()
        .name
        .clone();
    out.clear();
    bot.buy(ring.shop_id, 2, now, &mut out);
    assert!(
        logged(
            &out,
            &format!("Chưa mua {name}: món này không xếp chồng: mỗi lần mua 1 cái")
        ),
        "{out:?}"
    );
    assert!(sent(&out, 1190).is_empty());
}

/// One item record (12-skills-items.md#bản-ghi-vật-phẩm): slot, item, uuid, +level, field1.
fn record(w: Writer, slot: u8, id: i32, uuid: &str, plus: i32, f1: u8) -> Writer {
    w.u8(slot)
        .i32(id)
        .string(uuid)
        .i32(plus)
        .i32(-1)
        .i32(1)
        .u8(f1)
        .u8(255)
        .i32(0)
        .u8(0)
        .u8(0)
        .u8(0)
}
/// s2c/42 holding (slot, item, uuid, +level, field1) items.
fn bag_of(items: &[(u8, i32, &str, i32, u8)]) -> Vec<u8> {
    let mut w = Writer::new()
        .string("test dong 1")
        .i32(42)
        .i32(3)
        .u8(2)
        .i32(54)
        .i32(items.len() as i32);
    for &(slot, id, uuid, plus, f1) in items {
        w = record(w, slot, id, uuid, plus, f1);
    }
    w.build()
}
/// s2c/37, the 8 gear slots: (gear slot, item, uuid, +level) worn, the others empty.
fn gear_of(worn: &[(u8, i32, &str, i32)]) -> Vec<u8> {
    let mut w = Writer::new().i32(0).u8(0x40).string("symap").i32(8);
    for slot in 0..8u8 {
        w = match worn.iter().find(|g| g.0 == slot) {
            Some(&(_, id, uuid, plus)) => record(w, slot, id, uuid, plus, 0),
            None => w.u8(0xff),
        };
    }
    w.build()
}
fn worn_ring(rate: i32, to_level: i32) -> SmithTask {
    SmithTask::Upgrade {
        slot: 3,
        careful: false,
        rate,
        to_level,
        unlocked: false,
        quote: false,
        worn: true,
        charm: true,
        stones: vec![],
    }
}

#[test]
fn nang_cap_do_dang_mac_coi_ra_nang_roi_mac_lai() {
    // Nhẫn Trơn +0 worn in gear slot 3, a locked Đá cấp 5 in bag slot 15.
    let (mut bot, mut out, now) = symap(&[(15, 415, 0, 0)]);
    bot.on_packet(37, &gear_of(&[(3, 306, "ring", 0)]), now, &mut out)
        .unwrap();
    out.clear();
    bot.smith(worn_ring(80, 1), now, &mut out);
    assert!(
        logged(&out, "Nâng cấp Nhẫn Trơn (đang mặc) tới +1"),
        "{out:?}"
    );
    assert!(
        logged(&out, "Cởi Nhẫn Trơn (ô trang bị 3) ra túi để nâng cấp"),
        "{out:?}"
    );
    assert_eq!(sent(&out, 1186), ["0100000003"], "Cởi ra, gear slot 3");
    assert!(sent(&out, 13).is_empty(), "not to Pháp sư before it is off");

    // Taken off: s2c/37 without it, s2c/42 with it in bag slot 20.
    out.clear();
    bot.on_packet(37, &gear_of(&[]), now, &mut out).unwrap();
    bot.on_packet(
        42,
        &bag_of(&[(15, 415, "stone", 0, 0), (20, 306, "ring", 0, 0)]),
        now,
        &mut out,
    )
    .unwrap();
    assert!(logged(&out, "Đã cởi Nhẫn Trơn (ô túi 21)"), "{out:?}");
    assert_eq!(sent(&out, 13), [PHAP_SU]);

    // The window, the ring of bag slot 20, the stone (80%), Bắt đầu.
    out.clear();
    bot.on_packet(57, &root(), now, &mut out).unwrap();
    bot.on_packet(
        57,
        &menu(
            "Pháp sư",
            &[
                "Nâng cấp [Thường]",
                "Nâng cấp [Cẩn thận]",
                "Chuyển hoá trang bị",
            ],
        ),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(
        96,
        &captured("serviceWindow", "title", "Nâng cấp [thường]".into()),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(
        sent(&out, 97),
        [tohex(&npc::put_request(20, 1, npc::PUT_ITEM))]
    );
    let price = "Cần: 19 Xu khóa (không đủ sẽ sử dụng cả Xu)\nCần: 0 Lượng\nTỉ lệ thành công: 80%";
    for answer in [
        slot90(
            true,
            20,
            "Cần chọn trang bị và đá (có thể thêm bùa bảo vệ)",
            false,
        ),
        slot90(false, 15, price, true),
    ] {
        out.clear();
        bot.on_packet(90, &answer, now, &mut out).unwrap();
    }
    assert_eq!(sent(&out, 91), ["00000000"], "{out:?}");

    // It worked; the bag again: the ring +1 in slot 20, the stone gone. It is worn again.
    out.clear();
    bot.on_packet(
        91,
        &captured("serviceResult", "ok", true.into()),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(42, &bag_of(&[(20, 306, "ring", 1, 0)]), now, &mut out)
        .unwrap();
    assert!(logged(&out, "Mặc lại Nhẫn Trơn (ô túi 21)"), "{out:?}");
    assert_eq!(sent(&out, 1186), ["0000000014"], "Mặc, bag slot 20");
    assert!(
        bot.snapshot().smith.unwrap().done.is_none(),
        "not over before it is worn"
    );

    out.clear();
    bot.on_packet(37, &gear_of(&[(3, 306, "ring", 1)]), now, &mut out)
        .unwrap();
    bot.on_packet(42, &bag_of(&[]), now, &mut out).unwrap();
    assert!(
        logged(
            &out,
            "Nâng cấp Nhẫn Trơn (đang mặc) tới +1: Nhẫn Trơn đã +1; đã mặc lại Nhẫn Trơn (1 lần, tốn 19 Xu khóa)"
        ),
        "{out:?}"
    );
    let run = bot.snapshot().smith.unwrap();
    assert_eq!((run.steps, run.ok, run.spent_xu_khoa), (1, 1, 19));
    assert_eq!(bot.deadline(), None);
}

#[test]
fn nang_cap_do_dang_mac_tui_day_thi_khong_coi_va_dung_thi_van_mac_lai() {
    // A full bag (54 of 54): nothing is taken off.
    let full: Vec<(u8, i32, i32, u8)> = (0..54).map(|s| (s, 415, 0, 0)).collect();
    let (mut bot, mut out, now) = symap(&full);
    bot.on_packet(37, &gear_of(&[(3, 306, "ring", 0)]), now, &mut out)
        .unwrap();
    out.clear();
    bot.smith(worn_ring(100, 4), now, &mut out);
    assert!(
        logged(
            &out,
            "Chưa Nâng cấp Nhẫn Trơn (đang mặc) tới +4: túi đồ đầy: cần 1 ô trống để cởi món ra nâng cấp"
        ),
        "{out:?}"
    );
    assert!(sent(&out, 1186).is_empty());

    // Dừng while it is being taken off: once it is in the bag, it is worn again and the task ends.
    let (mut bot, mut out, now) = symap(&[(15, 415, 0, 0)]);
    bot.on_packet(37, &gear_of(&[(3, 306, "ring", 0)]), now, &mut out)
        .unwrap();
    bot.smith(worn_ring(100, 4), now, &mut out);
    out.clear();
    bot.stop(false, now, &mut out);
    assert!(
        sent(&out, 1186).is_empty(),
        "waits for the answer of Cởi ra"
    );
    bot.on_packet(37, &gear_of(&[]), now, &mut out).unwrap();
    bot.on_packet(
        42,
        &bag_of(&[(15, 415, "stone", 0, 0), (7, 306, "ring", 0, 0)]),
        now,
        &mut out,
    )
    .unwrap();
    assert!(sent(&out, 13).is_empty(), "not to Pháp sư after Dừng");
    assert_eq!(sent(&out, 1186), ["0000000007"], "Mặc, bag slot 7");
    out.clear();
    bot.on_packet(37, &gear_of(&[(3, 306, "ring", 0)]), now, &mut out)
        .unwrap();
    bot.on_packet(42, &bag_of(&[(15, 415, "stone", 0, 0)]), now, &mut out)
        .unwrap();
    assert!(
        logged(
            &out,
            "Nâng cấp Nhẫn Trơn (đang mặc) tới +4: Đã dừng; đã mặc lại Nhẫn Trơn"
        ),
        "{out:?}"
    );
}

/// From the bag after Cởi ra (the ring in bag slot 20, a Đá cấp 5 in 15) to Bắt đầu and its result: the bot then asks for
/// the bag (c2s/42, Stage::Refresh).
fn upgrade_ring_in_slot_20(bot: &mut Bot, out: &mut Vec<Out>, now: Instant) {
    bot.on_packet(57, &root(), now, out).unwrap();
    bot.on_packet(
        57,
        &menu(
            "Pháp sư",
            &[
                "Nâng cấp [Thường]",
                "Nâng cấp [Cẩn thận]",
                "Chuyển hoá trang bị",
            ],
        ),
        now,
        out,
    )
    .unwrap();
    bot.on_packet(
        96,
        &captured("serviceWindow", "title", "Nâng cấp [thường]".into()),
        now,
        out,
    )
    .unwrap();
    let price = "Cần: 19 Xu khóa (không đủ sẽ sử dụng cả Xu)\nCần: 0 Lượng\nTỉ lệ thành công: 80%";
    for answer in [
        slot90(
            true,
            20,
            "Cần chọn trang bị và đá (có thể thêm bùa bảo vệ)",
            false,
        ),
        slot90(false, 15, price, true),
    ] {
        bot.on_packet(90, &answer, now, out).unwrap();
    }
    bot.on_packet(91, &captured("serviceResult", "ok", false.into()), now, out)
        .unwrap();
}

#[test]
fn nang_cap_do_dang_mac_chi_tin_o_trang_bi_va_tui_that() {
    let (mut bot, mut out, now) = symap(&[(15, 415, 0, 0)]);
    bot.on_packet(37, &gear_of(&[(3, 306, "ring", 0)]), now, &mut out)
        .unwrap();
    bot.smith(worn_ring(80, 4), now, &mut out);

    // A notice while Cởi ra waits ends nothing; the gear and the bag of Cởi ra go on with the upgrade.
    out.clear();
    bot.on_packet(
        1256,
        &notice("Bạn vừa nhận được 137 Xu khóa"),
        now,
        &mut out,
    )
    .unwrap();
    assert!(bot.snapshot().smith.unwrap().done.is_none(), "{out:?}");
    bot.on_packet(37, &gear_of(&[]), now, &mut out).unwrap();
    assert!(
        sent(&out, 13).is_empty(),
        "the bag has not shown the ring yet"
    );
    bot.on_packet(
        42,
        &bag_of(&[(15, 415, "stone", 0, 0), (20, 306, "ring", 0, 0)]),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(sent(&out, 13), [PHAP_SU]);

    // Failed at 80%; Dừng while the bag of that press is on its way: Mặc goes out at once.
    out.clear();
    upgrade_ring_in_slot_20(&mut bot, &mut out, now);
    assert!(
        logged(&out, "Nâng cấp thất bại: Nhẫn Trơn còn +0"),
        "{out:?}"
    );
    out.clear();
    bot.stop(false, now, &mut out);
    assert_eq!(sent(&out, 1186), ["0000000014"], "Mặc, bag slot 20");
    // The bag of the press comes then, the ring still in it: that is no answer to Mặc.
    bot.on_packet(42, &bag_of(&[(20, 306, "ring", 0, 0)]), now, &mut out)
        .unwrap();
    assert!(bot.snapshot().smith.unwrap().done.is_none(), "{out:?}");
    // Mặc: the ring is back in gear slot 3.
    bot.on_packet(37, &gear_of(&[(3, 306, "ring", 0)]), now, &mut out)
        .unwrap();
    assert!(
        logged(
            &out,
            "Nâng cấp Nhẫn Trơn (đang mặc) tới +4: Đã dừng; đã mặc lại Nhẫn Trơn (1 lần, tốn 19 Xu khóa)"
        ),
        "{out:?}"
    );

    // Cởi ra refused: the ring never moves, and the task ends on the server's words after SMITH_WAIT.
    let (mut bot, mut out, now) = symap(&[(15, 415, 0, 0)]);
    bot.on_packet(37, &gear_of(&[(3, 306, "ring", 0)]), now, &mut out)
        .unwrap();
    bot.smith(worn_ring(80, 4), now, &mut out);
    bot.on_packet(1256, &notice("Không thể thực hiện"), now, &mut out)
        .unwrap();
    out.clear();
    bot.on_timer(now + Duration::from_secs(9), &mut out);
    assert!(
        logged(
            &out,
            "Nâng cấp Nhẫn Trơn (đang mặc) tới +4: không cởi được Nhẫn Trơn: Không thể thực hiện"
        ),
        "{out:?}"
    );
    assert!(
        sent(&out, 1186).is_empty(),
        "still worn: nothing to wear again"
    );
    assert_eq!(bot.deadline(), None);
}

// ---------------------------------------------------------------------------------------------------------------------
// Bùa bảo vệ, Chế tạo trang bị, Đổi Băng Tâm (the packets of O1) and Điểm năng động.

/// A packet of O1 under that key of test/fixtures-o1.ts ("s2c/57 Pháp sư").
fn o1(key: &str) -> Vec<u8> {
    let all = v();
    let case = all["npc"]["o1"]["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["key"] == key)
        .unwrap_or_else(|| panic!("no O1 packet {key}"))
        .clone();
    hex(case["hex"].as_str().unwrap())
}
/// c2s/97 as the phone sent it in O1 ("c2s/97 bùa").
fn o1_put(key: &str) -> String {
    let all = v();
    all["npc"]["o1"]["requests"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["key"] == key)
        .unwrap()["phone"]
        .as_str()
        .unwrap()
        .to_string()
}
/// s2c/42 holding (slot, item, +level, field1, quantity) items.
fn bag_n(items: &[(u8, i32, i32, u8, i32)]) -> Vec<u8> {
    let mut w = Writer::new()
        .string("test dong 1")
        .i32(42)
        .i32(3)
        .u8(2)
        .i32(54)
        .i32(items.len() as i32);
    for &(slot, id, plus, f1, quantity) in items {
        w = w
            .u8(slot)
            .i32(id)
            .string(&format!("uuid-{slot}-{id}"))
            .i32(plus)
            .i32(-1)
            .i32(quantity)
            .u8(f1)
            .u8(255)
            .i32(0)
            .u8(0)
            .u8(0)
            .u8(0);
    }
    w.build()
}
fn menu_text(npc: &str, text: &str, lines: &[&str]) -> Vec<u8> {
    let mut w = Writer::new()
        .i32(lines.len() as i32)
        .string(npc)
        .string(text);
    for (i, l) in lines.iter().enumerate() {
        w = w.u8(i as u8).string(l);
    }
    w.build()
}
/// c2s/57 of line `option` to `npc` (hex), on M1.
fn line57(option: u8, npc: i32) -> String {
    tohex(&Writer::new().u8(option).string("M1").i32(npc).build())
}
const HUONG_LAO: &str = "000000024d3100000066";
fn upgrade(slot: u8, careful: bool, rate: i32, to_level: i32, charm: bool) -> SmithTask {
    SmithTask::Upgrade {
        slot,
        careful,
        rate,
        to_level,
        unlocked: true,
        quote: false,
        worn: false,
        charm,
        stones: vec![],
    }
}

#[test]
fn nang_cap_tu_5_dat_bua_bao_ve_nhu_o1_roi_moi_dat_da() {
    // O1: Nhẫn Thái Cực +5 (tier 21, cap +8) in slot 19, Bùa bảo vệ sơ cấp ×4 in 20, two Đá cấp 5 in 22 and 23.
    let items = [
        (19, 333, 5, 0, 1),
        (20, 35, 0, 1, 4),
        (22, 415, 0, 0, 1),
        (23, 415, 0, 0, 1),
    ];
    let (mut bot, mut out, now) = symap(&[]);
    bot.on_packet(42, &bag_n(&items), now, &mut out).unwrap();
    out.clear();
    bot.smith(upgrade(19, true, 80, 6, true), now, &mut out);
    assert!(
        logged(&out, "Nâng cấp [Cẩn thận] Nhẫn Thái Cực tới +6"),
        "{out:?}"
    );
    assert_eq!(sent(&out, 13), [PHAP_SU]);
    out.clear();
    bot.on_packet(57, &o1("s2c/57 Pháp sư"), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 57), [line57(0, 161)], "Nâng cấp");
    out.clear();
    bot.on_packet(57, &o1("s2c/57 Nâng cấp"), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 57), [line57(1, 161)], "[Cẩn thận]");
    out.clear();
    bot.on_packet(
        96,
        &o1("s2c/96 Nâng cấp [cẩn thận] Ttuananh"),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(sent(&out, 97), [o1_put("c2s/97 nhẫn")], "the ring, kind 0");
    out.clear();
    bot.on_packet(90, &o1("s2c/90 nhẫn +5"), now, &mut out)
        .unwrap();
    bot.on_packet(1258, &o1("s2c/1258 nhẫn +5"), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 97), [o1_put("c2s/97 bùa")], "the charm, kind 1");
    out.clear();
    bot.on_packet(90, &o1("s2c/90 bùa +5→+6"), now, &mut out)
        .unwrap();
    assert_eq!(
        sent(&out, 97),
        [tohex(&npc::put_request(22, 1, npc::PUT_ITEM))],
        "then the cheapest stone; the charm's 0% is no stone's"
    );
    out.clear();
    bot.on_packet(90, &o1("s2c/90 đá +5→+6 lần 1"), now, &mut out)
        .unwrap();
    assert!(
        logged(
            &out,
            "Bắt đầu: Nâng Nhẫn Thái Cực +5 lên +6, có Bùa bảo vệ sơ cấp (2.910 Xu khóa + 10 Lượng, tỉ lệ 82%)"
        ),
        "{out:?}"
    );
    assert_eq!(sent(&out, 91), ["00000000"]);
    out.clear();
    bot.on_packet(91, &o1("s2c/91 bùa thành công +5→+6"), now, &mut out)
        .unwrap();
    assert!(
        logged(
            &out,
            "Nâng cấp thành công: Nhẫn Thái Cực +6 (mất 1 Bùa bảo vệ sơ cấp)"
        ),
        "{out:?}"
    );
    assert_eq!(sent(&out, 42).len(), 1);
    out.clear();
    let after = [(19, 333, 6, 0, 1), (20, 35, 0, 1, 3), (23, 415, 0, 0, 1)];
    bot.on_packet(42, &bag_n(&after), now, &mut out).unwrap();
    assert!(
        logged(
            &out,
            "Nâng cấp [Cẩn thận] Nhẫn Thái Cực tới +6: Nhẫn Thái Cực đã +6 (1 lần, tốn 2.910 Xu khóa, 10 Lượng)"
        ),
        "{out:?}"
    );
}

#[test]
fn nang_cap_tren_4_khong_bua_thi_tut_cap_va_dung_thieu_bua_thi_khong_bat_dau() {
    // +5 with charms asked for and none in the bag: nothing is sent.
    let (mut bot, mut out, now) = symap(&[(19, 333, 5, 0), (22, 415, 0, 0)]);
    bot.smith(upgrade(19, false, 80, 8, true), now, &mut out);
    assert!(sent(&out, 13).is_empty(), "{out:?}");
    assert!(
        logged(
            &out,
            "Nâng cấp Nhẫn Thái Cực tới +8: thất bại ở +5 sẽ tụt về +4: cần Bùa bảo vệ trong túi"
        ),
        "{out:?}"
    );
    // Without charms: said before, then a failure that drops the ring to +4 ends the task.
    out.clear();
    bot.smith(upgrade(19, false, 80, 8, false), now, &mut out);
    assert!(
        logged(
            &out,
            "Không dùng bùa: thất bại sẽ tụt Nhẫn Thái Cực từ +5 về +4"
        ),
        "{out:?}"
    );
    bot.on_packet(57, &o1("s2c/57 Pháp sư"), now, &mut out)
        .unwrap();
    bot.on_packet(57, &o1("s2c/57 Nâng cấp"), now, &mut out)
        .unwrap();
    bot.on_packet(96, &o1("s2c/96 Nâng cấp [thường] Ttuananh"), now, &mut out)
        .unwrap();
    out.clear();
    bot.on_packet(90, &o1("s2c/90 nhẫn +5"), now, &mut out)
        .unwrap();
    assert_eq!(
        sent(&out, 97),
        [tohex(&npc::put_request(22, 1, npc::PUT_ITEM))],
        "no charm: the stone next"
    );
    out.clear();
    bot.on_packet(90, &o1("s2c/90 đá +5→+6 lần 1"), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 91), ["00000000"]);
    bot.on_packet(
        91,
        &captured("serviceResult", "ok", false.into()),
        now,
        &mut out,
    )
    .unwrap();
    out.clear();
    bot.on_packet(42, &bag(&[(19, 333, 4, 0)]), now, &mut out)
        .unwrap();
    assert!(sent(&out, 13).is_empty(), "{out:?}");
    assert!(
        logged(
            &out,
            "Nâng cấp Nhẫn Thái Cực tới +8: Nhẫn Thái Cực tụt từ +5 về +4: thất bại không có bùa thì dừng"
        ),
        "{out:?}"
    );
    // With a charm the level stays (O1, +7 kept): the same level is tried again with the next charm.
    let items = [
        (19, 333, 7, 0, 1),
        (20, 35, 0, 1, 2),
        (22, 415, 0, 0, 1),
        (23, 415, 0, 0, 1),
    ];
    let (mut bot, mut out, now) = symap(&[]);
    bot.on_packet(42, &bag_n(&items), now, &mut out).unwrap();
    bot.smith(upgrade(19, true, 80, 8, true), now, &mut out);
    for key in ["s2c/57 Pháp sư", "s2c/57 Nâng cấp"] {
        bot.on_packet(57, &o1(key), now, &mut out).unwrap();
    }
    bot.on_packet(
        96,
        &o1("s2c/96 Nâng cấp [cẩn thận] Ttuananh"),
        now,
        &mut out,
    )
    .unwrap();
    for key in [
        "s2c/90 nhẫn +5",
        "s2c/90 bùa +5→+6",
        "s2c/90 đá +5→+6 lần 1",
    ] {
        bot.on_packet(90, &o1(key), now, &mut out).unwrap();
    }
    out.clear();
    bot.on_packet(91, &o1("s2c/91 bùa thất bại +7"), now, &mut out)
        .unwrap();
    assert!(
        logged(
            &out,
            "Nâng cấp thất bại: Nhẫn Thái Cực còn +7, mất 1 viên đá nhờ bùa, mất cả 1 Bùa bảo vệ sơ cấp"
        ),
        "{out:?}"
    );
    out.clear();
    let after = [(19, 333, 7, 0, 1), (20, 35, 0, 1, 1), (23, 415, 0, 0, 1)];
    bot.on_packet(42, &bag_n(&after), now, &mut out).unwrap();
    assert_eq!(sent(&out, 13), [PHAP_SU], "again at +7");
    assert!(bot.snapshot().smith.unwrap().done.is_none());
}

#[test]
fn che_tao_nhan_bac_i_nhu_o1_dat_ca_chong_nguyen_lieu() {
    // O1: Quặng Bậc 1 ×86 in slot 33, Linh Thạch Bậc 1 ×43 in 37; level 31.
    let items = [(33, 598, 0, 0, 86), (37, 610, 0, 0, 43)];
    let (mut bot, mut out, now) = symap(&[]);
    bot.on_packet(42, &bag_n(&items), now, &mut out).unwrap();
    bot.snap.level = 31;
    out.clear();
    bot.smith(
        SmithTask::Craft {
            kind: 3,
            tier: 1,
            times: 1,
        },
        now,
        &mut out,
    );
    assert!(logged(&out, "Chế tạo Nhẫn Bậc I"), "{out:?}");
    assert_eq!(sent(&out, 13), [PHAP_SU]);
    let path = [
        ("s2c/57 Pháp sư", 3),
        ("s2c/57 Chế tạo", 1),
        ("s2c/57 Chế tạo trang bị", 3),
        ("s2c/57 Nhẫn", 0),
    ];
    for (key, option) in path {
        out.clear();
        bot.on_packet(57, &o1(key), now, &mut out).unwrap();
        assert_eq!(sent(&out, 57), [line57(option, 161)], "{key}");
    }
    let read = &bot.snapshot().recipes;
    assert_eq!(
        (
            read.len(),
            read[0].name,
            read[0].recipes.len(),
            read[0].recipes[0].xu
        ),
        (1, "Nhẫn", 3, 2400)
    );
    out.clear();
    bot.on_packet(99, &o1("s2c/99 Chế tạo trang bị"), now, &mut out)
        .unwrap();
    assert_eq!(
        sent(&out, 97),
        [o1_put("c2s/97 Quặng")],
        "the whole stack, kind 1"
    );
    out.clear();
    bot.on_packet(92, &o1("s2c/92 Quặng"), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 97), [o1_put("c2s/97 Linh Thạch")]);
    out.clear();
    bot.on_packet(92, &o1("s2c/92 Linh Thạch sẵn sàng"), now, &mut out)
        .unwrap();
    assert!(
        logged(
            &out,
            "Bắt đầu: Chế tạo Nhẫn Bậc I (Quặng Bậc 1 24, Linh Thạch Bậc 1 24, 2.400 Xu) (2.400 Xu)"
        ),
        "{out:?}"
    );
    out.clear();
    bot.on_packet(93, &o1("s2c/93 Chế tạo"), now, &mut out)
        .unwrap();
    assert!(logged(&out, "Chế tạo thành công: Nhẫn Bậc I"), "{out:?}");
    // The notice of the item comes during the bag's wait: it ends nothing.
    bot.on_packet(
        1256,
        &notice("Bạn vừa nhận được Nhẫn Thái Cực"),
        now,
        &mut out,
    )
    .unwrap();
    out.clear();
    let after = [(33, 598, 0, 0, 62), (37, 610, 0, 0, 19), (12, 333, 0, 0, 1)];
    bot.on_packet(42, &bag_n(&after), now, &mut out).unwrap();
    assert!(
        logged(
            &out,
            "Chế tạo Nhẫn Bậc I: đã chế tạo Nhẫn Thái Cực (ô túi 13) (1 lần, tốn 2.400 Xu)"
        ),
        "{out:?}"
    );
    // Bậc II needs level 51 and materials the bag lacks: said, nothing picked.
    out.clear();
    bot.smith(
        SmithTask::Craft {
            kind: 3,
            tier: 2,
            times: 1,
        },
        now,
        &mut out,
    );
    for key in [
        "s2c/57 Pháp sư",
        "s2c/57 Chế tạo",
        "s2c/57 Chế tạo trang bị",
    ] {
        bot.on_packet(57, &o1(key), now, &mut out).unwrap();
    }
    out.clear();
    bot.on_packet(57, &o1("s2c/57 Nhẫn"), now, &mut out)
        .unwrap();
    assert!(sent(&out, 57).is_empty());
    assert!(
        logged(
            &out,
            "Chế tạo Nhẫn Bậc II: cần cấp 51, nhân vật cấp 31; thiếu Quặng Bậc 2 0/24; thiếu Linh Thạch Bậc 2 0/24"
        ),
        "{out:?}"
    );
}

/// One press of Chế tạo Nhẫn Bậc I with the packets of O1, from the menu of Nhẫn to the bag after it: `after`.
fn craft_one(bot: &mut Bot, after: &[(u8, i32, i32, u8, i32)], now: Instant) -> Vec<Out> {
    let mut out = vec![];
    for key in [
        "s2c/57 Pháp sư",
        "s2c/57 Chế tạo",
        "s2c/57 Chế tạo trang bị",
        "s2c/57 Nhẫn",
    ] {
        bot.on_packet(57, &o1(key), now, &mut out).unwrap();
    }
    for (op, key) in [
        (99, "s2c/99 Chế tạo trang bị"),
        (92, "s2c/92 Quặng"),
        (92, "s2c/92 Linh Thạch sẵn sàng"),
        (93, "s2c/93 Chế tạo"),
    ] {
        bot.on_packet(op, &o1(key), now, &mut out).unwrap();
    }
    out.clear();
    bot.on_packet(42, &bag_n(after), now, &mut out).unwrap();
    out
}

#[test]
fn che_tao_nhieu_mon_doc_lai_menu_moi_mon_va_dung_o_mon_thieu_nguyen_lieu() {
    // Enough for two Nhẫn Bậc I, not three: the third is not picked, and the end says the two made.
    let (mut bot, mut out, now) = symap(&[]);
    bot.on_packet(
        42,
        &bag_n(&[(33, 598, 0, 0, 86), (37, 610, 0, 0, 50)]),
        now,
        &mut out,
    )
    .unwrap();
    bot.snap.level = 31;
    out.clear();
    let task = SmithTask::Craft {
        kind: 3,
        tier: 1,
        times: 3,
    };
    bot.smith(task.clone(), now, &mut out);
    assert!(logged(&out, "Chế tạo 3 Nhẫn Bậc I"), "{out:?}");
    let first = [(33, 598, 0, 0, 62), (37, 610, 0, 0, 26), (12, 333, 0, 0, 1)];
    let out = craft_one(&mut bot, &first, now);
    assert_eq!(sent(&out, 13), [PHAP_SU], "the menu again for the second");
    let run = bot.snapshot().smith.unwrap();
    assert_eq!((run.steps, run.done), (1, None));
    assert_eq!(run.doing, "Món 2/3: đọc công thức ở Pháp sư");
    let second = [
        (33, 598, 0, 0, 38),
        (37, 610, 0, 0, 2),
        (12, 333, 0, 0, 1),
        (13, 333, 0, 0, 1),
    ];
    craft_one(&mut bot, &second, now);
    let mut out = vec![];
    for key in [
        "s2c/57 Pháp sư",
        "s2c/57 Chế tạo",
        "s2c/57 Chế tạo trang bị",
    ] {
        bot.on_packet(57, &o1(key), now, &mut out).unwrap();
    }
    out.clear();
    bot.on_packet(57, &o1("s2c/57 Nhẫn"), now, &mut out)
        .unwrap();
    assert!(sent(&out, 57).is_empty(), "the third lacks Linh Thạch");
    assert!(
        logged(
            &out,
            "Chế tạo 3 Nhẫn Bậc I: đã chế tạo Nhẫn Thái Cực (ô túi 13), Nhẫn Thái Cực (ô túi 14); món thứ 3 không chế được: thiếu Linh Thạch Bậc 1 2/24 (2 lần, tốn 4.800 Xu)"
        ),
        "{out:?}"
    );

    // Dừng between two items ends the run with the item made.
    let (mut bot, mut out, now) = symap(&[]);
    bot.on_packet(
        42,
        &bag_n(&[(33, 598, 0, 0, 86), (37, 610, 0, 0, 50)]),
        now,
        &mut out,
    )
    .unwrap();
    bot.snap.level = 31;
    bot.smith(task, now, &mut out);
    craft_one(&mut bot, &first, now);
    let mut out = vec![];
    bot.stop(false, now, &mut out);
    assert!(
        logged(
            &out,
            "Chế tạo 3 Nhẫn Bậc I: Đã dừng; đã chế tạo Nhẫn Thái Cực (ô túi 13) (1 lần, tốn 2.400 Xu)"
        ),
        "{out:?}"
    );
    assert!(sent(&out, 57).is_empty());

    // No item asked for: refused, nothing sent.
    let (mut bot, mut out, now) = symap(&[]);
    out.clear();
    bot.smith(
        SmithTask::Craft {
            kind: 3,
            tier: 1,
            times: 0,
        },
        now,
        &mut out,
    );
    assert!(sent(&out, 13).is_empty());
    assert!(
        logged(&out, "Chưa Chế tạo Nhẫn Bậc I: chế tạo ít nhất 1 món"),
        "{out:?}"
    );
}

#[test]
fn doi_bang_tam_roi_noi_lai_voi_phap_su_va_diem_nang_dong_chi_doc() {
    // O1: 8 Băng Tâm, one bottle.
    let (mut bot, mut out, now) = symap(&[]);
    bot.on_packet(42, &bag_n(&[(40, 21, 0, 1, 8)]), now, &mut out)
        .unwrap();
    out.clear();
    bot.smith(SmithTask::Ice { option: 0 }, now, &mut out);
    for (key, option) in [("s2c/57 Pháp sư", 3), ("s2c/57 Chế tạo", 3)] {
        out.clear();
        bot.on_packet(57, &o1(key), now, &mut out).unwrap();
        assert_eq!(sent(&out, 57), [line57(option, 161)], "{key}");
    }
    out.clear();
    bot.on_packet(57, &o1("s2c/57 Đổi Băng Tâm có 8"), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 57), [line57(0, 161)], "Đổi 1 bình");
    out.clear();
    bot.on_packet(
        1256,
        &notice("Đã đổi 8 Băng Tâm lấy 1 Bình Huyết Linh (Rỗng)"),
        now,
        &mut out,
    )
    .unwrap();
    // Its lines exchange at once: Pháp sư is talked to again before anything else.
    assert_eq!(sent(&out, 13), [PHAP_SU]);
    out.clear();
    bot.on_packet(57, &o1("s2c/57 Pháp sư"), now, &mut out)
        .unwrap();
    assert!(sent(&out, 57).is_empty());
    assert_eq!(sent(&out, 42).len(), 1);
    out.clear();
    bot.on_packet(42, &bag_n(&[(40, 16, 0, 1, 1)]), now, &mut out)
        .unwrap();
    assert!(
        logged(
            &out,
            "Đổi Băng Tâm lấy bình rỗng (1 bình): đã đổi; còn 0 Băng Tâm, có 1 Bình Huyết Linh (Rỗng) (1 lần)"
        ),
        "{out:?}"
    );
    // Five bottles from 8: said once the menu shows the count, and Pháp sư talked to again.
    bot.on_packet(42, &bag_n(&[(40, 21, 0, 1, 8)]), now, &mut out)
        .unwrap();
    out.clear();
    bot.smith(SmithTask::Ice { option: 1 }, now, &mut out);
    for key in ["s2c/57 Pháp sư", "s2c/57 Chế tạo"] {
        bot.on_packet(57, &o1(key), now, &mut out).unwrap();
    }
    out.clear();
    bot.on_packet(57, &o1("s2c/57 Đổi Băng Tâm có 8"), now, &mut out)
        .unwrap();
    assert!(sent(&out, 57).is_empty());
    assert_eq!(sent(&out, 13), [PHAP_SU]);
    out.clear();
    bot.on_packet(57, &o1("s2c/57 Pháp sư"), now, &mut out)
        .unwrap();
    assert!(
        logged(
            &out,
            "Đổi Băng Tâm lấy bình rỗng (5 bình): cần 40 Băng Tâm, có 8"
        ),
        "{out:?}"
    );

    // Điểm năng động: line 3 of Hương Lão, then Cách tính điểm, then his first menu again; nothing else is picked.
    out.clear();
    bot.smith(SmithTask::Points { rules: true }, now, &mut out);
    assert_eq!(sent(&out, 13), [HUONG_LAO]);
    let root = menu(
        "Hương Lão Trần Bá",
        &[
            "Mã quà tặng",
            "Đổi lượng",
            "Nhiệm vụ hàng ngày",
            "Điểm năng động",
        ],
    );
    out.clear();
    bot.on_packet(57, &root, now, &mut out).unwrap();
    assert_eq!(sent(&out, 57), [line57(3, 102)]);
    let text = "Điểm năng động tuần này: 12/100\nHạn mức đổi (cấp 31): 3.000 Xu, cần 3.300 Xu khóa\nTuần này còn 500/500 suất. Hết tuần lúc 00:00 thứ Hai.";
    out.clear();
    bot.on_packet(
        57,
        &menu_text(
            "Hương Lão Trần Bá",
            text,
            &["Đổi Xu", "Cách tính điểm", "Đóng"],
        ),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(
        sent(&out, 57),
        [line57(1, 102)],
        "Cách tính điểm, never Đổi Xu"
    );
    out.clear();
    let rules = Writer::new()
        .u8(0)
        .string("Đánh quái: 1 điểm mỗi trận thắng.")
        .build();
    bot.on_packet(0, &rules, now, &mut out).unwrap();
    assert_eq!(sent(&out, 13), [HUONG_LAO]);
    out.clear();
    bot.on_packet(57, &root, now, &mut out).unwrap();
    assert!(sent(&out, 57).is_empty());
    assert!(
        logged(
            &out,
            "Xem Điểm năng động: 12/100 điểm; đổi được 3.000 Xu (cần 3.300 Xu khóa); đã đọc Cách tính điểm"
        ),
        "{out:?}"
    );
    let p = bot.snapshot().points.unwrap();
    assert_eq!(
        (
            p.points.points,
            p.points.xu_khoa,
            p.points.slots_left,
            p.rules.is_some()
        ),
        (Some(12), Some(3300), Some(500), true)
    );
}

// ---------------------------------------------------------------------------------------------------------------------
// Stacked stones (ST1, 21/11): Đá cấp 1–12 stack to 999; c2s/97 kind 0 with quantity N puts N stones of one stack, and
// the same slot sent again adds one more.

/// symap on M1 with a bag of stacks.
fn symap_q(items: &[(u8, i32, i32, u8, i32)]) -> (Bot, Vec<Out>, Instant) {
    let (mut bot, mut out, now) = symap(&[]);
    bot.on_packet(42, &bag_q(items), now, &mut out).unwrap();
    out.clear();
    (bot, out, now)
}

fn open_merge(bot: &mut Bot, out: &mut Vec<Out>, now: Instant) {
    bot.on_packet(57, &root(), now, out).unwrap();
    bot.on_packet(
        57,
        &menu("Pháp sư", &["Luyện đá [Xu khóa]", "Luyện đá [Xu]"]),
        now,
        out,
    )
    .unwrap();
    bot.on_packet(
        99,
        &captured("craftWindow", "key", "abcd1002".into()),
        now,
        out,
    )
    .unwrap();
}

#[test]
fn gop_da_puts_four_of_one_stack_with_one_put_of_quantity_4() {
    // akaito's 37 locked Đá cấp 2 in slot 2.
    let (mut bot, mut out, now) = symap_q(&[(2, 412, 0, 0, 37)]);
    let o = MergeOptions {
        level: Some(2),
        sets: Some(1),
        ..MergeOptions::default()
    };
    bot.smith(SmithTask::Merge(o), now, &mut out);
    assert!(!logged(&out, "không có 4 viên"), "{out:?}");
    out.clear();
    open_merge(&mut bot, &mut out, now);
    assert_eq!(
        sent(&out, 97),
        [tohex(&npc::put_request(2, 4, npc::PUT_ITEM))],
        "one c2s/97 of quantity 4"
    );
    out.clear();
    let text = "Luyện thành Đá cấp 3 Khóa\nCần: 7 Xu khóa (không đủ sẽ sử dụng cả Xu)\nTỉ lệ thành công: 100%";
    bot.on_packet(92, &slot92(2, text, true), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 91), ["00000000"], "{out:?}");
}

#[test]
fn gop_da_in_a_full_bag_needs_a_slot_for_the_stone_made() {
    // 53 other items and 5 Đá cấp 2: four leave one, and no Đá cấp 3 to stack onto.
    let mut items: Vec<(u8, i32, i32, u8, i32)> = (3..56).map(|s| (s, 306, 0, 1, 1)).collect();
    items.push((2, 412, 0, 0, 5));
    let (mut bot, mut out, now) = symap_q(&items);
    let o = MergeOptions {
        level: Some(2),
        ..MergeOptions::default()
    };
    bot.smith(SmithTask::Merge(o), now, &mut out);
    assert!(
        logged(
            &out,
            "Gộp hết Đá cấp 2 lên Đá cấp 3: túi đầy: Đá cấp 3 luyện ra cần một ô trống"
        ),
        "{out:?}"
    );
    assert!(sent(&out, 13).is_empty(), "nothing sent");
    // With a stack of Đá cấp 3 to join, it goes.
    items[0] = (3, 413, 0, 0, 9);
    let (mut bot, mut out, now) = symap_q(&items);
    bot.smith(SmithTask::Merge(o), now, &mut out);
    assert_eq!(sent(&out, 13), [PHAP_SU], "{out:?}");
}

fn upgrade_task(rate: i32) -> SmithTask {
    SmithTask::Upgrade {
        slot: 15,
        careful: false,
        rate,
        to_level: 4,
        unlocked: true,
        quote: false,
        worn: false,
        charm: true,
        stones: vec![],
    }
}

#[test]
fn nang_cap_puts_the_same_stack_again_for_one_more_stone() {
    let (mut bot, mut out, now) =
        symap_q(&[(15, 306, 0, 1, 1), (2, 412, 0, 0, 37), (1, 413, 0, 0, 82)]);
    bot.smith(upgrade_task(80), now, &mut out);
    out.clear();
    open_upgrade(&mut bot, &mut out, now);
    let one = tohex(&npc::put_request(2, 1, npc::PUT_ITEM));
    assert_eq!(sent(&out, 97).last(), Some(&one), "a Đá cấp 2 first");
    out.clear();
    bot.on_packet(90, &slot90(false, 2, &odds(66), true), now, &mut out)
        .unwrap();
    assert_eq!(
        sent(&out, 97),
        [one],
        "the same stack again, not the Đá cấp 3"
    );
    out.clear();
    bot.on_packet(90, &slot90(false, 2, &odds(80), true), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 91), ["00000000"], "{out:?}");
}

#[test]
fn nang_cap_with_a_window_full_of_cheap_stones_opens_it_again_with_dearer_ones() {
    let (mut bot, mut out, now) =
        symap_q(&[(15, 306, 0, 1, 1), (2, 412, 0, 0, 37), (1, 413, 0, 0, 82)]);
    bot.smith(upgrade_task(100), now, &mut out);
    out.clear();
    open_upgrade(&mut bot, &mut out, now);
    // 18 Đá cấp 2, each 2% more, under 75: no cap, no 100%.
    for k in 1..=18 {
        out.clear();
        bot.on_packet(90, &slot90(false, 2, &odds(2 * k), true), now, &mut out)
            .unwrap();
        if k < 18 {
            assert_eq!(
                sent(&out, 97),
                [tohex(&npc::put_request(2, 1, npc::PUT_ITEM))]
            );
        }
    }
    assert!(
        logged(
            &out,
            "18 viên Đá cấp 2 chỉ được 36%, chưa tới 100%: mở lại cửa sổ với đá cấp cao hơn"
        ),
        "{out:?}"
    );
    assert_eq!(sent(&out, 13), [PHAP_SU], "the window again");
    assert!(sent(&out, 91).is_empty(), "nothing pressed");
    out.clear();
    open_upgrade(&mut bot, &mut out, now);
    assert_eq!(
        sent(&out, 97).last(),
        Some(&tohex(&npc::put_request(1, 1, npc::PUT_ITEM))),
        "Đá cấp 3 now"
    );
}

#[test]
fn nang_cap_thuong_stalled_under_75_says_it_is_the_cap_not_more_stones() {
    let (mut bot, mut out, now) =
        symap_q(&[(15, 306, 3, 1, 1), (2, 412, 0, 0, 2), (1, 413, 0, 0, 1)]);
    bot.smith(upgrade_task(100), now, &mut out);
    out.clear();
    open_upgrade(&mut bot, &mut out, now);
    for rate in [40, 65, 65] {
        out.clear();
        bot.on_packet(90, &slot90(false, 2, &odds(rate), true), now, &mut out)
            .unwrap();
    }
    assert!(
        logged(
            &out,
            "Nâng cấp Nhẫn Trơn tới +4: tỉ lệ dừng ở 65% dù thêm đá: có lẽ là trần của lần nâng +3 lên +4 ở chế độ Thường"
        ),
        "{out:?}"
    );
    assert!(sent(&out, 91).is_empty());
}

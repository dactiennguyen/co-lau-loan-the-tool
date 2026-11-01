//! The NPC shops and Pháp sư's windows against what src/protocol/npc.ts reads (`npm run export:rust`, vectors.json "npc"):
//! the captured packets of J1–J3, the texts of the windows, and the plans of Gộp đá and Nâng cấp on symap's bag.
use cllt_core::npc::{self, BagItem, MergeOptions};
use cllt_core::world;
use serde_json::Value;

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
    assert_eq!(
        tohex(&npc::put_request(45)),
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

fn logged(out: &[Out], text: &str) -> bool {
    out.iter()
        .any(|o| matches!(o, Out::Log(_, t) if t.starts_with(text)))
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
    let mut w = Writer::new()
        .string("test dong 1")
        .i32(42)
        .i32(3)
        .u8(2)
        .i32(54)
        .i32(items.len() as i32);
    for &(slot, id, plus, f1) in items {
        w = w
            .u8(slot)
            .i32(id)
            .string(&format!("uuid-{slot}"))
            .i32(plus)
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
            unlocked: true,
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
    assert_eq!(sent(&out, 97), [tohex(&npc::put_request(20))]);
    for (i, slot) in [24, 25, 26].into_iter().enumerate() {
        out.clear();
        let text = ["Cần chọn đá số lượng 2 đến 24", "Luyện thành Đá cấp 6 Khóa\nCần: 410 Xu khóa (không đủ sẽ sử dụng cả Xu)\nTỉ lệ thành công: 50%",
            "Luyện thành Đá cấp 6 Khóa\nCần: 410 Xu khóa (không đủ sẽ sử dụng cả Xu)\nTỉ lệ thành công: 75%"][i];
        bot.on_packet(92, &slot92(20, text, i > 0), now, &mut out)
            .unwrap();
        assert_eq!(sent(&out, 97), [tohex(&npc::put_request(slot))]);
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
        [tohex(&npc::put_request(15))],
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
        assert_eq!(sent(&out, 97), [tohex(&npc::put_request(next))]);
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
            Some(s) => assert_eq!(sent(&out, 97), [tohex(&npc::put_request(s))]),
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
    assert_eq!(sent(&out, 97), [tohex(&npc::put_request(20))]);
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

// The Rust core against the TypeScript side: vectors.json is written by `npm run export:rust` from test/fixtures.ts and
// what the TS decoders, request builders, battle replay and bestMove compute (src/cli/export-rust.ts).
use cllt_core::atlas::{find_upwards, Atlas, MapRecord};
use cllt_core::battle::{
    self, battle_result, best_move, legal_moves, settle, swap, Board, Fighter, Move, Strategy,
};
use cllt_core::bot::{
    duration_text, BattleRecord, BattleResult, BattleSource, Bot, BotOptions, CaptchaPrompt,
    CaptchaUi, FightSettings, ItemAct, LogKind, Out, Picked,
};
use cllt_core::potentials::StatPlan;
use cllt_core::protocol::*;
use cllt_core::quest::step_action;
use cllt_core::requests::{build, Ctx};
use cllt_core::runner::{Act, BattleEnd, BattleRunner, RunnerOptions, Turn};
use cllt_core::{items, skills, world};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Arc;
use std::time::{Duration, Instant};

mod common;
use common::{board, hex, logged, tohex, v};

#[test]
fn handshake_matches_capture() {
    let p = &v()["prelogin"];
    let seed = i32::from_be_bytes(hex(p["seed"].as_str().unwrap()).try_into().unwrap());
    assert_eq!(tohex(&handshake(seed)), p["handshake"].as_str().unwrap());
}

#[test]
fn server_frames_decode_under_any_fragmentation() {
    let p = &v()["prelogin"];
    let wire: Vec<u8> = p["received_chunks"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|c| hex(c.as_str().unwrap()))
        .collect();
    let want: Vec<(i64, String)> = p["decoded_receive"]
        .as_array()
        .unwrap()
        .iter()
        .map(|x| (x["op"].as_i64().unwrap(), x["hex"].as_str().unwrap().into()))
        .collect();
    for step in [1, 2, 7, 13, 17, 97, wire.len()] {
        let (mut proto, mut got) = (Protocol::default(), vec![]);
        for chunk in wire.chunks(step) {
            proto.push(chunk);
            while let Some(pk) = proto.next_packet().unwrap() {
                if pk.opcode == Some(-1) {
                    let k = session_key(&pk.payload).unwrap();
                    assert_eq!(tohex(&k), p["key"].as_str().unwrap());
                    proto.enable_key(k);
                }
                got.push((pk.opcode.unwrap() as i64, tohex(&pk.payload)));
            }
        }
        assert_eq!(got, want, "step {step}");
    }
}

#[test]
fn client_frames_match_capture() {
    let p = &v()["prelogin"];
    let key: [u8; 16] = hex(p["key"].as_str().unwrap()).try_into().unwrap();
    let mut proto = Protocol::default();
    for (i, pk) in p["decoded_send"].as_array().unwrap().iter().enumerate() {
        let op = pk["op"].as_i64().unwrap() as i32;
        if op == 1206 {
            proto.enable_key(key);
        }
        assert_eq!(
            tohex(&proto.encode(op, &hex(pk["hex"].as_str().unwrap())).unwrap()),
            p["sent_frames"][i].as_str().unwrap(),
            "frame {i}"
        );
    }
}

#[test]
fn password_and_login_match_native_vectors() {
    let all = v();
    for x in all["password"].as_array().unwrap() {
        let out = password_proof(
            &hex(x["challenge"].as_str().unwrap()),
            x["password"].as_str().unwrap(),
        )
        .unwrap();
        assert_eq!(tohex(&out), x["out"].as_str().unwrap(), "{x}");
    }
    for x in all["login"].as_array().unwrap() {
        let proof: Vec<u8> = x["input"]["proof"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| b.as_u64().unwrap() as u8)
            .collect();
        let got = login_payload(
            x["input"]["username"].as_str().unwrap(),
            &proof,
            x["input"]["serverId"].as_i64().unwrap() as i32,
        );
        assert_eq!(tohex(&got), x["data"].as_str().unwrap());
    }
}

#[test]
fn decoders_read_what_the_ts_decoders_read() {
    let all = v();
    for case in all["decoders"].as_array().unwrap() {
        let (f, p) = (
            case["fn"].as_str().unwrap(),
            hex(case["hex"].as_str().unwrap()),
        );
        let got = match f {
            "characterPrefix" => serde_json::to_value(character_prefix(&p).unwrap()),
            "characterProfile" => serde_json::to_value(character_profile(&p).unwrap()),
            "playersSnapshot" => serde_json::to_value(world::players_snapshot(&p).unwrap()),
            "playerRecord" => {
                serde_json::to_value(world::player_record(&mut Reader::new(&p)).unwrap())
            }
            "characterLocation" => serde_json::to_value(character_location(&p).unwrap()),
            "mapPrefix" => serde_json::to_value(map_prefix(&p).unwrap()),
            "mapData" => serde_json::to_value(world::map_data(&p).unwrap()),
            "mapGrid" => serde_json::to_value(world::map_grid(&p).unwrap()),
            "mapChange" => serde_json::to_value(world::map_change(&p).unwrap()),
            "zoneList" => serde_json::to_value(world::zone_list(&p).unwrap()),
            "mapEntities" => serde_json::to_value(world::map_entities(&p).unwrap()),
            "mapBoss" => serde_json::to_value(world::map_boss(&p).unwrap()),
            "notice" => serde_json::to_value(world::notice(&p).unwrap()),
            "characterStats" => serde_json::to_value(world::character_stats(&p).unwrap()),
            "battleSetup" => serde_json::to_value(battle::battle_setup(&p).unwrap()),
            "battleJoinAck" => serde_json::to_value(battle::battle_join_ack(&p).unwrap()),
            "turnState" => serde_json::to_value(battle::turn_state(&p).unwrap()),
            "battleResult19" => serde_json::to_value(battle_result(&p, 19).unwrap()),
            "battleResult20" => serde_json::to_value(battle_result(&p, 20).unwrap()),
            "timeoutResult" => serde_json::to_value(battle::timeout_result(&p).unwrap()),
            "questData" => serde_json::to_value(world::quest_data(&p).unwrap()),
            "questProgress" => serde_json::to_value(world::quest_progress(&p).unwrap()),
            "questComplete" => serde_json::to_value(world::quest_complete(&p).unwrap()),
            "duelInvite" => serde_json::to_value(world::duel_invite(&p).unwrap()),
            "characterExtra" => serde_json::to_value(items::character_extra(&p).unwrap()),
            "inventory" => serde_json::to_value(items::inventory(&p).unwrap()),
            "characterGear" => serde_json::to_value(items::character_gear(&p).unwrap()),
            "characterTail" => serde_json::to_value(items::character_tail(&p).unwrap()),
            "currencies" => serde_json::to_value(items::currencies(&p).unwrap()),
            "gearUpdate" => serde_json::to_value(items::gear_update(&p).unwrap()),
            "groundItemAdd" => {
                let g = items::ground_item_add(&p).unwrap();
                Ok(
                    json!({"mapId": g.map_id, "itemId": g.item.item_id, "uuid": g.item.uuid,
                    "quantity": g.item.quantity, "x": g.x, "y": g.y, "expiresAt": g.expires_at}),
                )
            }
            "groundItems" => Ok(json!(items::ground_items(&p)
                .unwrap()
                .iter()
                .map(|g| json!({"itemId": g.item.item_id, "uuid": g.item.uuid, "quantity": g.item.quantity,
                    "element": g.item.element, "x": g.x, "y": g.y, "expiresAt": g.expires_at}))
                .collect::<Vec<_>>())),
            "groundItemRemove" => {
                let (map_id, uuid) = items::ground_item_remove(&p).unwrap();
                Ok(json!({"mapId": map_id, "uuid": uuid}))
            }
            "bagSlot" => serde_json::to_value(items::bag_slot(&p).unwrap()),
            "skillTable" => serde_json::to_value(skills::skill_table(&p).unwrap()),
            "characterSkills" => serde_json::to_value(skills::character_skills(&p).unwrap()),
            other => panic!("no Rust decoder for {other}"),
        }
        .unwrap();
        assert_eq!(got, case["expected"], "{f} {}", case["hex"]);
    }
}

/// The buttons of the Túi đồ tab on manina's real gear and bag: Cởi ra and Sửa chữa send c2s/1186 and c2s/48 as the
/// phone did (P4), and the answers name the item in the log; what the server would refuse is not sent.
/// Vứt bỏ sends c2s/1186 action 2 as K3 did (02 00000004 for bag slot 4); s2c/83 says what is left in the slot. Sắp xếp
/// sends an empty c2s/1257 (I1) and logs the s2c/1187 that answers it. Both wait for their answer like the other buttons.
#[test]
fn vut_bo_and_sap_xep_send_what_the_phone_sent_and_follow_the_answers() {
    let all = v();
    let cases = all["decoders"].as_array().unwrap();
    let hex_of = |f: &str| {
        let case = cases.iter().find(|c| c["fn"] == f).unwrap();
        hex(case["hex"].as_str().unwrap())
    };
    let mut bot = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let (now, mut out) = (Instant::now(), vec![]);
    bot.on_packet(42, &hex_of("characterExtra"), now, &mut out)
        .unwrap();
    let bag = |bot: &Bot| -> Vec<(u8, i32, i32)> {
        let b = bot.snapshot().bag.unwrap();
        b.items
            .iter()
            .map(|i| (i.slot, i.item_id, i.quantity))
            .collect()
    };
    let lines = |out: &[Out]| -> Vec<String> {
        out.iter()
            .filter_map(|o| match o {
                Out::Log(LogKind::Item, t) => Some(t.clone()),
                _ => None,
            })
            .collect()
    };
    // Vứt bỏ the Đá cấp 5 of bag slot 5; Sắp xếp before the answer waits.
    out.clear();
    bot.item(ItemAct::Discard(5), now, &mut out);
    assert_eq!(sent(&out, 1186), Some("0200000005".into()));
    bot.item(ItemAct::Sort, now, &mut out);
    assert_eq!(sends(&out, 1257), 0);
    assert_eq!(
        lines(&out),
        [
            "Vứt Đá cấp 5 (ô túi 6)",
            "Chưa sắp xếp túi đồ: đang đợi server trả lời lần trước"
        ]
    );
    out.clear();
    let left = |slot: i32, n: i32| Writer::new().i32(slot).i32(n).build();
    bot.on_packet(83, &left(5, 0), now, &mut out).unwrap();
    assert_eq!(lines(&out), ["Đã vứt Đá cấp 5"]);
    assert!(bag(&bot).iter().all(|i| i.0 != 5));
    // s2c/83 of a potion used in a battle: the stack goes down, nothing is said.
    out.clear();
    bot.on_packet(83, &left(0, 3), now, &mut out).unwrap();
    assert_eq!((bag(&bot)[0], out.len()), ((0, 0, 3), 0));
    // A stack thrown away says how many.
    bot.item(ItemAct::Discard(0), now, &mut out);
    assert_eq!(lines(&out), ["Vứt Hoàn Linh Dược ×3 (ô túi 1)"]);
    bot.on_packet(83, &left(0, 0), now, &mut out).unwrap();
    // Sắp xếp: an empty c2s/1257, then the bag of s2c/1187 says it is done; a later s2c/1187 says nothing.
    out.clear();
    bot.item(ItemAct::Sort, now, &mut out);
    assert_eq!(sent(&out, 1257), Some(String::new()));
    bot.on_packet(1187, &hex_of("inventory"), now, &mut out)
        .unwrap();
    assert_eq!(lines(&out), ["Sắp xếp túi đồ", "Đã sắp xếp túi đồ (7 món)"]);
    out.clear();
    bot.on_packet(1187, &hex_of("inventory"), now, &mut out)
        .unwrap();
    assert!(out.is_empty(), "{out:?}");
    // In a battle neither goes out.
    let (mut bot, mut out, t, setup) = coc_xanh_bot();
    bot.on_packet(42, &hex_of("characterExtra"), t, &mut out)
        .unwrap();
    bot.fight("Cóc Xanh", 1, 1, t, &mut out);
    bot.on_packet(22, &setup, t, &mut out).unwrap();
    out.clear();
    bot.item(ItemAct::Sort, t, &mut out);
    bot.item(ItemAct::Discard(1), t, &mut out);
    assert_eq!((sends(&out, 1257), sends(&out, 1186)), (0, 0));
    assert_eq!(
        lines(&out),
        [
            "Chưa sắp xếp túi đồ: đang đánh, đợi hết trận",
            "Chưa vứt Đá cấp 2: đang đánh, đợi hết trận"
        ]
    );
}

#[test]
fn item_buttons_send_what_the_phone_sent_and_refuse_what_cannot_be_done() {
    let all = v();
    let cases = all["decoders"].as_array().unwrap();
    let hex_of = |f: &str, n: usize| {
        let case = cases.iter().filter(|c| c["fn"] == f).nth(n).unwrap();
        hex(case["hex"].as_str().unwrap())
    };
    let mut bot = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let (mut now, mut out) = (Instant::now(), vec![]);
    bot.on_packet(9, &hex_of("characterGear", 0), now, &mut out)
        .unwrap();
    bot.on_packet(42, &hex_of("characterExtra", 0), now, &mut out)
        .unwrap();
    let slot_of = |bot: &Bot, id: i32| {
        let bag = bot.snapshot().bag.unwrap();
        bag.items.iter().find(|i| i.item_id == id).unwrap().slot
    };
    let step = |bot: &mut Bot, act: ItemAct, now: Instant| {
        let mut out = vec![];
        bot.item(act, now, &mut out);
        out
    };
    let sends = |out: &[Out]| -> Vec<(i32, String)> {
        out.iter()
            .filter_map(|o| match o {
                Out::Send(op, p) => Some((*op, tohex(p))),
                _ => None,
            })
            .collect()
    };
    // Hoàn Linh Dược outside a battle, and a stone that is no gear: nothing goes out.
    let potion = slot_of(&bot, 0);
    let out1 = step(&mut bot, ItemAct::Use(potion), now);
    assert_eq!(sends(&out1), []);
    assert_eq!(
        out1,
        [Out::Log(
            LogKind::Item,
            "Chưa dùng Hoàn Linh Dược: bình chỉ dùng được trong trận".into()
        )]
    );
    let stone = slot_of(&bot, 412);
    assert_eq!(sends(&step(&mut bot, ItemAct::Equip(stone), now)), []);
    // Cởi ra the hat (gear slot 0), as the phone took off the pet with 01 00000005.
    assert_eq!(
        sends(&step(&mut bot, ItemAct::Unequip(0), now)),
        [(1186, "0100000000".to_string())]
    );
    // A second button before the answer waits for it.
    assert_eq!(sends(&step(&mut bot, ItemAct::Repair(2), now)), []);
    bot.on_packet(37, &hex_of("gearUpdate", 0), now, &mut out)
        .unwrap();
    out.clear();
    bot.on_packet(1186, &hex("00000001"), now, &mut out)
        .unwrap();
    assert_eq!(out, [Out::Log(LogKind::Item, "Đã cởi Nón Âu Lạc".into())]);
    // s2c/37 brought the new gear (symap's capture: the pet slot empty).
    assert!(bot.snapshot().gear[5].is_none() && bot.snapshot().gear[2].is_some());
    // Sửa chữa the weapon with the hammer of the bag: 00 00000002 as on the phone.
    bot.on_packet(9, &hex_of("characterGear", 0), now, &mut out)
        .unwrap();
    now += Duration::from_secs(1);
    assert_eq!(
        sends(&step(&mut bot, ItemAct::Repair(2), now)),
        [(48, "0000000002".to_string())]
    );
    out.clear();
    bot.on_packet(48, &hex("0000000002"), now, &mut out)
        .unwrap();
    assert_eq!(out, [Out::Log(LogKind::Item, "Đã sửa Rìu Âu Lạc".into())]);
    // Repaired to its full durability (60), as the phone showed, though no gear came with the answer.
    assert_eq!(
        bot.snapshot().gear[2].as_ref().map(|i| i.durability),
        Some(60)
    );
    // The bag after that repair has no hammer left.
    bot.on_packet(1187, &hex_of("inventory", 0), now, &mut out)
        .unwrap();
    let out2 = step(&mut bot, ItemAct::Repair(0), now);
    assert_eq!(sends(&out2), []);
    assert_eq!(
        out2,
        [Out::Log(
            LogKind::Item,
            "Chưa sửa Nón Âu Lạc: cần 1 Búa sửa chữa trong túi".into()
        )]
    );
    // Trang bị Nón Lá from its bag slot.
    let hat = slot_of(&bot, 48);
    assert_eq!(
        sends(&step(&mut bot, ItemAct::Equip(hat), now)),
        [(1186, format!("00{:08x}", hat))]
    );
}

/// The skill tree of s2c/30 and the levels of s2c/9 in the snapshot; Nâng cấp sends c2s/1191 only when the tab would
/// allow it, and s2c/10 kind 32 and s2c/1191 bring the new level and the points left.
#[test]
fn the_snapshot_holds_the_skills_and_nang_cap_sends_c2s_1191_when_it_can() {
    let all = v();
    let hex_of = |f: &str, kind: Option<i64>| {
        let case = all["decoders"].as_array().unwrap().iter().find(|c| {
            c["fn"] == f && kind.is_none_or(|k| c["expected"]["kind"].as_i64() == Some(k))
        });
        hex(case.unwrap()["hex"].as_str().unwrap())
    };
    let mut bot = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let (now, mut out) = (Instant::now(), vec![]);
    // manina at level 21 (E1): Hỏa Cầu Thuật level 1, 19 skill points.
    bot.on_packet(9, &hex_of("characterGear", None), now, &mut out)
        .unwrap();
    bot.on_packet(30, &hex_of("skillTable", None), now, &mut out)
        .unwrap();
    let s = bot.snapshot();
    assert_eq!(
        (s.skills.len(), s.skills[0].name.as_str()),
        (9, "Hỏa Cầu Thuật")
    );
    assert_eq!(
        (s.skill_levels.get(&1000), s.skill_points),
        (Some(&1), Some(19))
    );
    assert!(out.is_empty(), "{out:?}");
    let sent = |out: &[Out]| -> Vec<(i32, String)> {
        out.iter()
            .filter_map(|o| match o {
                Out::Send(op, p) => Some((*op, tohex(p))),
                _ => None,
            })
            .collect()
    };
    // Đại Lực Công needs level 32 and Hỏa Kiếm Thuật first: nothing goes out.
    bot.upgrade_skill(1002, now, &mut out);
    assert_eq!(sent(&out), []);
    assert_eq!(
        out,
        [Out::Log(
            LogKind::Character,
            "Chưa nâng Đại Lực Công: cần cấp 32, phải học Hỏa Kiếm Thuật".into()
        )]
    );
    out.clear();
    bot.upgrade_skill(1000, now, &mut out);
    assert_eq!(sent(&out), [(1191, "000003e800000001".to_string())]);
    // A second click before the answer waits for it.
    out.clear();
    bot.upgrade_skill(1001, now, &mut out);
    assert_eq!(sent(&out), []);
    bot.on_packet(10, &hex_of("characterStats", Some(32)), now, &mut out)
        .unwrap();
    out.clear();
    bot.on_packet(1191, &hex("0000004400000012"), now, &mut out)
        .unwrap();
    let s = bot.snapshot();
    assert_eq!(
        (s.skill_levels.get(&1000), s.skill_points),
        (Some(&2), Some(18))
    );
    assert_eq!(
        out,
        [Out::Log(
            LogKind::Character,
            "Đã nâng Hỏa Cầu Thuật lên cấp 2; còn 18 điểm kỹ năng".into()
        )]
    );
    out.clear();
    bot.upgrade_skill(1001, now, &mut out);
    assert_eq!(sent(&out), [(1191, "000003e900000001".to_string())]);
}

/// The bag, gear, money and s2c/9 tail cases on their own, so they report even while a decoder elsewhere in the list is
/// missing.
#[test]
fn bag_gear_and_money_read_what_the_ts_decoders_read() {
    let all = v();
    let mut seen = 0;
    for case in all["decoders"].as_array().unwrap() {
        let (f, p) = (
            case["fn"].as_str().unwrap(),
            hex(case["hex"].as_str().unwrap()),
        );
        let got = match f {
            "characterExtra" => serde_json::to_value(items::character_extra(&p).unwrap()),
            "inventory" => serde_json::to_value(items::inventory(&p).unwrap()),
            "characterGear" => serde_json::to_value(items::character_gear(&p).unwrap()),
            "characterTail" => serde_json::to_value(items::character_tail(&p).unwrap()),
            "currencies" => serde_json::to_value(items::currencies(&p).unwrap()),
            "gearUpdate" => serde_json::to_value(items::gear_update(&p).unwrap()),
            _ => continue,
        }
        .unwrap();
        assert_eq!(got, case["expected"], "{f} {}", case["hex"]);
        seen += 1;
    }
    // 11 of 0.0.2, 6 of 0.0.7 (test/fixtures-v007.ts: bag, gear, s2c/37 on and off), 1 of the server of 22/11
    // (test/fixtures-v111.ts: s2c/9 with the character's code).
    assert_eq!(seen, 18);
}

/// The x2 EXP of Tăng Kinh Nghiệm comes in the s2c/9 tail with the time it has left: the snapshot keeps when it ends and
/// the log says it at login. manina has none.
#[test]
fn the_x2_exp_of_the_s2c_9_tail_ends_when_its_time_runs_out() {
    let all = v();
    let tails: Vec<Vec<u8>> = all["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| c["fn"] == "characterTail")
        .map(|c| hex(c["hex"].as_str().unwrap()))
        .collect();
    let mut bot = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let (now, mut out) = (Instant::now(), vec![]);
    let before = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    bot.on_packet(9, &tails[0], now, &mut out).unwrap();
    let boosts = bot.snapshot().boosts;
    assert_eq!(boosts.len(), 1);
    let b = &boosts[0];
    assert_eq!(
        (b.key.as_str(), b.rate, b.label()),
        ("ef7", 200_000, "x2 EXP".into())
    );
    // 13257567 ms left (P4) from the moment it came.
    assert!(
        (before + 13_257_567..before + 13_257_567 + 5_000).contains(&b.until),
        "{}",
        b.until
    );
    assert!(logged(&out, "Đang có x2 EXP, còn 3 giờ 40 phút"), "{out:?}");
    out.clear();
    bot.on_packet(9, &tails[1], now, &mut out).unwrap();
    assert!(bot.snapshot().boosts.is_empty());
    assert!(!logged(&out, "Đang có"), "{out:?}");
}

#[test]
fn the_snapshot_holds_the_gear_of_s2c_9_the_bag_and_the_money() {
    let all = v();
    let hex_of = |f: &str| {
        let case = all["decoders"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["fn"] == f);
        hex(case.unwrap()["hex"].as_str().unwrap())
    };
    let mut bot = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let (now, mut out) = (Instant::now(), vec![]);
    assert!(bot.snapshot().gear.is_empty() && bot.snapshot().bag.is_none());
    bot.on_packet(9, &hex_of("characterGear"), now, &mut out)
        .unwrap();
    let gear: Vec<_> = bot
        .snapshot()
        .gear
        .iter()
        .map(|g| g.as_ref().map(|i| (i.item_id, i.element, i.durability)))
        .collect();
    // Nón Âu Lạc (Lôi) and Rìu Âu Lạc (Hỏa), both worn out at that login.
    assert_eq!(
        gear,
        [
            Some((54, 2, 0)),
            None,
            Some((261, 1, 0)),
            None,
            None,
            None,
            None,
            None
        ]
    );
    bot.on_packet(42, &hex_of("characterExtra"), now, &mut out)
        .unwrap();
    let ids = |bot: &Bot| {
        bot.snapshot().bag.map(|b| {
            (
                b.capacity,
                b.items.iter().map(|i| i.item_id).collect::<Vec<_>>(),
            )
        })
    };
    assert_eq!(ids(&bot), Some((42, vec![0, 412, 147, 48, 306, 415, 2, 1])));
    // After the repair the hammer (2) is gone.
    bot.on_packet(1187, &hex_of("inventory"), now, &mut out)
        .unwrap();
    assert_eq!(ids(&bot), Some((42, vec![0, 412, 147, 48, 306, 415, 1])));
    bot.on_packet(46, &hex_of("currencies"), now, &mut out)
        .unwrap();
    let money = bot
        .snapshot()
        .currencies
        .map(|c| (c.xu, c.xu_khoa, c.luong));
    assert_eq!(money, Some((500, 7370, 0)));
    // A bag that does not read is logged, the one shown stays, and c2s/42 asks the whole bag again.
    assert!(out.is_empty());
    bot.on_packet(1187, &[1], now, &mut out).unwrap();
    assert_eq!(ids(&bot), Some((42, vec![0, 412, 147, 48, 306, 415, 1])));
    assert!(
        matches!(&out[..], [Out::Log(_, l), Out::Send(42, _)] if l.contains("s2c/1187 loại 1")),
        "{out:?}"
    );
}

#[test]
fn zone_players_follow_the_ts_list() {
    let mut zone = world::ZonePlayers::default();
    for step in v()["zone"].as_array().unwrap() {
        let opcode = step["opcode"].as_i64().unwrap() as i32;
        let changed = zone
            .on(opcode, &hex(step["hex"].as_str().unwrap()))
            .unwrap();
        assert_eq!(changed, step["changed"].as_bool().unwrap(), "s2c/{opcode}");
        let got: Vec<Value> = zone
            .list()
            .into_iter()
            .map(|n| json!([n.id, n.name, n.level]))
            .collect();
        assert_eq!(Value::from(got), step["players"], "s2c/{opcode}");
    }
}

#[test]
fn requests_match_build_request() {
    let all = v();
    for r in all["requests"].as_array().unwrap() {
        let c = &r["ctx"];
        let s = |k: &str| c[k].as_str();
        let i = |k: &str| c[k].as_i64().map(|x| x as i32);
        let mv = c["move"]
            .as_object()
            .map(|_| serde_json::from_value::<Move>(c["move"].clone()).unwrap());
        let ctx = Ctx {
            username: s("username"),
            server_id: i("serverId"),
            character_name: s("characterName"),
            map_id: s("mapId"),
            npc_id: i("npcId"),
            mob_id: s("mobId"),
            battle_uuid: s("battleUuid"),
            seq: i("seq"),
            skill: i("skill"),
            mv,
            stat: i("stat"),
            amount: i("amount"),
            element: i("element"),
            skill_id: i("skillId"),
            slot: i("slot"),
            action: i("action"),
            place: i("where"),
            zone: i("zone"),
            map_index: i("mapIndex"),
            challenge_flag: i("challengeFlag").map(|f| f as u8),
            uuid: s("uuid"),
            option: i("option"),
            ..Ctx::default()
        };
        let op = r["opcode"].as_i64().unwrap() as i32;
        assert_eq!(
            tohex(&build(op, &ctx).unwrap()),
            r["hex"].as_str().unwrap(),
            "c2s/{op}"
        );
    }
}

#[test]
fn captured_battles_replay_like_battle_ts() {
    let all = v();
    for b in all["battles"].as_array().unwrap() {
        let mut bd = board(&b["board"]);
        for (k, s) in b["steps"].as_array().unwrap().iter().enumerate() {
            if let Some(m) = s["move"].as_array() {
                let m: Vec<i32> = m.iter().map(|x| x.as_i64().unwrap() as i32).collect();
                swap(
                    &mut bd,
                    Move {
                        from: (m[0], m[1]),
                        to: (m[2], m[3]),
                    },
                );
            }
            let refill: Vec<i16> = s["refill"]
                .as_array()
                .unwrap()
                .iter()
                .map(|x| x.as_i64().unwrap() as i16)
                .collect();
            let cells: Vec<usize> = s["cells"].as_array().map_or(vec![], |c| {
                c.iter()
                    .map(|rc| (rc[0].as_u64().unwrap() * 8 + rc[1].as_u64().unwrap()) as usize)
                    .collect()
            });
            let o = settle(&mut bd, Some(&refill), &cells);
            let where_ = format!("{} step {k}", b["source"]);
            assert_eq!(bd, board(&s["board"]), "{where_}: board");
            assert_eq!(
                serde_json::to_value(&o.cleared).unwrap(),
                s["cleared"],
                "{where_}: cleared"
            );
            assert_eq!(
                (o.waves as i64, o.extra_turn),
                (
                    s["waves"].as_i64().unwrap(),
                    s["extraTurn"].as_bool().unwrap()
                ),
                "{where_}: waves, extra turn"
            );
            assert_eq!(o.refill_used, refill.len(), "{where_}: refill used");
        }
    }
}

fn side(v: &Value) -> Fighter {
    let f = |k: &str| v[k].as_f64().unwrap_or(f64::INFINITY); // null: HP not known yet (Infinity on the TS side)
    Fighter {
        hp: f("hp"),
        max_hp: f("maxHp"),
        s1: f("s1"),
        s2: f("s2"),
        sword: f("sword"),
        heart: f("heart"),
        yinyang: f("yinyang"),
        peach: f("peach"),
        skill_cost: f("skillCost"),
        skill_damage: f("skillDamage"),
        skill_mult: 1.0,
        hit_mult: 1.0,
    }
}

#[test]
fn best_move_picks_what_the_ts_search_picks() {
    let all = v();
    let cases = all["bestMoves"].as_array().unwrap();
    for (i, c) in cases.iter().enumerate() {
        let base = if c["strategy"] == "exp" {
            Strategy::exp()
        } else {
            Strategy::kill()
        };
        let s = Strategy {
            reply: c["reply"].as_f64().unwrap(),
            ..base
        };
        let pick = best_move(&board(&c["board"]), &side(&c["me"]), &side(&c["mob"]), &s);
        match pick {
            None => assert!(c["move"].is_null(), "position {i}: no move"),
            Some(p) => {
                assert_eq!(
                    serde_json::to_value(p.mv).unwrap(),
                    c["move"],
                    "position {i}: move"
                );
                assert_eq!(p.score, c["score"].as_f64().unwrap(), "position {i}: score");
            }
        }
    }
    assert!(cases.len() > 50);
}

#[test]
fn runner_learns_what_a_piece_does_for_the_mob() {
    let all = v();
    let setup = battle::Setup {
        me: "manina".into(),
        level: 19,
        hp: 174,
        max_hp: 174,
        uuid: "u".into(),
        board: board(&all["battles"][0]["board"]).to_vec(),
        turn_seconds: 30,
    };
    let mut runner = BattleRunner::new(&setup, "mob61000", RunnerOptions::default());
    let unit = |damage| battle::Unit {
        name: "mob61000".into(),
        damage,
        b: 0,
        hp: -1,
        s1: -1,
        s2: -1,
    };
    runner.learn_mob(&unit(33), &[(0, 3)], false);
    assert_eq!(runner.mob.sword, (8.0 * 6.0 + 33.0) / 9.0); // prior 8 as six pieces, then three swords for 33
    runner.mob.s1 = 30.0;
    runner.learn_mob(&unit(59), &[], true);
    assert_eq!(
        (runner.mob.skill_damage, runner.mob.skill_cost),
        ((40.0 + 59.0) / 2.0, 30.0)
    );
}

#[test]
fn runner_joins_steps_for_the_mob_plays_a_legal_move_and_ends() {
    let all = v();
    let packet = |name: &str| {
        hex(all["decoders"]
            .as_array()
            .unwrap()
            .iter()
            .find(|d| {
                d["fn"] == "turnState"
                    && d["expected"]["playerTurn"] == json!(if name == "own" { 1 } else { 0 })
            })
            .unwrap()["hex"]
            .as_str()
            .unwrap())
    };
    let b = board(&all["battles"][0]["board"]);
    let setup = battle::Setup {
        me: "manina".into(),
        level: 3,
        hp: 130,
        max_hp: 130,
        uuid: "u".into(),
        board: b.to_vec(),
        turn_seconds: 30,
    };
    let (mut runner, mut acts, now) = (
        BattleRunner::new(&setup, "mob872604", RunnerOptions::default()),
        vec![],
        Instant::now(),
    );
    runner.start(&mut acts);
    assert_eq!(
        acts.pop(),
        Some(Act::Send(18, Writer::new().string("u").build()))
    );
    runner
        .on_packet(18, &hex("000000000000"), now, &mut acts)
        .unwrap();
    assert_eq!(
        acts.pop(),
        Some(Act::Send(14, Writer::new().string("u").i32(0).build()))
    );
    runner
        .on_packet(24, &packet("mob"), now, &mut acts)
        .unwrap();
    assert_eq!(
        acts.pop(),
        Some(Act::Send(14, Writer::new().string("u").i32(4).build()))
    );
    runner
        .on_packet(24, &packet("own"), now, &mut acts)
        .unwrap();
    let Some(Act::Send(19, p)) = acts.pop() else {
        panic!("no swap")
    };
    let mut r = Reader::new(&p);
    r.string().unwrap();
    r.i32().unwrap();
    let m = Move {
        from: (r.i32().unwrap() - 2, r.i32().unwrap() - 2),
        to: (r.i32().unwrap() - 2, r.i32().unwrap() - 2),
    };
    assert!(legal_moves(&b).contains(&m));
    let end = Writer::new()
        .i32(2)
        .i32(0)
        .i32(0)
        .i32(2)
        .i32(2)
        .i32(2)
        .i32(3)
        .i32(1)
        .bytes(&[])
        .u8(1)
        .string("mob872604")
        .i32(29)
        .u8(0)
        .i32(0)
        .i32(-1)
        .i32(-1)
        .u8(0)
        .u8(0)
        .u8(0)
        .u8(1)
        .string("manina")
        .u8(1)
        .u8(1)
        .i32(8)
        .i32(4)
        .build();
    assert!(runner.on_packet(19, &end, now, &mut acts).unwrap());
    let expected = BattleEnd {
        won: true,
        actor: "manina".into(),
        exp: Some(8),
        coin: Some(4),
        my_turns: 1,
        hp: 130.0,
        mob_id: "mob872604".into(),
        damage: 0,
    };
    assert_eq!(acts.pop(), Some(Act::End(expected)));
    assert!(!runner.on_packet(1262, &[], now, &mut acts).unwrap());
    assert_eq!(runner.deadline(), None);
}

/// s2c/19 of a swap and its `refill`; `units` are (name, damage, hp, s1, s2), -1 for unchanged.
fn swap_result(
    seq: i32,
    mv: &[i32],
    refill: &[u8],
    units: &[(&str, i32, i32, i32, i32)],
    actor: &str,
    extra_turn: bool,
) -> Vec<u8> {
    let mut w = Writer::new().i32(seq).i32(0).i32(0);
    for v in mv {
        w = w.i32(v + 2);
    }
    w = w
        .i32(1)
        .bytes(refill)
        .u8(0)
        .u8(0)
        .u8(0)
        .u8(0)
        .u8(units.len() as u8);
    for &(name, damage, hp, s1, s2) in units {
        w = w.string(name).i32(damage).u8(0).i32(hp).i32(s1).i32(s2);
    }
    w.u8(0)
        .u8(extra_turn as u8)
        .u8(0)
        .u8((actor == "manina") as u8)
        .string(actor)
        .u8(0)
        .build()
}

#[test]
fn runner_tells_what_each_result_did() {
    let all = v();
    let b = &all["battles"][0];
    let steps = b["steps"].as_array().unwrap();
    let step = |k: usize| {
        let mv: Vec<i32> = steps[k]["move"]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| x.as_i64().unwrap() as i32)
            .collect();
        let refill: Vec<u8> = steps[k]["refill"]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| x.as_u64().unwrap() as u8)
            .collect();
        (mv, refill)
    };
    let setup = battle::Setup {
        me: "manina".into(),
        level: 3,
        hp: 120,
        max_hp: 130,
        uuid: "u".into(),
        board: board(&b["board"]).to_vec(),
        turn_seconds: 30,
    };
    let (mut runner, mut acts, now) = (
        BattleRunner::new(&setup, "mob872604", RunnerOptions::default()),
        vec![],
        Instant::now(),
    );
    // B1 step 0: own swap eating 4 peaches and 3 drops, then another turn.
    let (mv, refill) = step(0);
    let own = swap_result(
        3,
        &mv,
        &refill,
        &[("manina", -1, -1, -1, 20)],
        "manina",
        true,
    );
    runner.on_packet(19, &own, now, &mut acts).unwrap();
    assert_eq!(
        runner.last,
        Some(Turn {
            n: 1,
            mine: true,
            eaten: vec![(3, 4), (4, 3)],
            s2: 20,
            hp: [120, 130],
            extra_turn: true,
            ..Turn::default()
        })
    );
    // Step 1 played by the mob: it hits for 14 and shows its HP, whose max is that HP as nothing hit it yet.
    let (mv, refill) = step(1);
    let units = [("mob872604", 14, 90, -1, 22), ("manina", -1, 106, -1, -1)];
    let mob = swap_result(4, &mv, &refill, &units, "mob872604", false);
    runner.on_packet(19, &mob, now, &mut acts).unwrap();
    assert_eq!(
        runner.last,
        Some(Turn {
            n: 2,
            eaten: vec![(3, 4)],
            damage: 14,
            s2: 22,
            hp: [106, 130],
            mob_hp: Some([90, 90]),
            ..Turn::default()
        })
    );
    assert!(!acts
        .iter()
        .any(|a| matches!(a, Act::Log(t) if t.starts_with("Bàn cờ lệch"))));
}

/// s2c/24: turn `seq`, own or the mob's.
fn turn_of(seq: i32, own: bool) -> Vec<u8> {
    Writer::new().i32(seq).i32(0).u8(own as u8).u8(0).build()
}
fn acts_sent(acts: &[Act]) -> Vec<i32> {
    acts.iter()
        .filter_map(|a| match a {
            Act::Send(op, _) => Some(*op),
            _ => None,
        })
        .collect()
}

#[test]
fn runner_plays_a_turn_once_when_its_s2c_24_comes_late_or_a_skill_answer_is_awaited() {
    let all = v();
    let b = &all["battles"][0];
    let step0 = &b["steps"][0];
    let ints = |k: &str| -> Vec<i32> {
        step0[k]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| x.as_i64().unwrap() as i32)
            .collect()
    };
    let refill: Vec<u8> = ints("refill").iter().map(|&x| x as u8).collect();
    let setup = battle::Setup {
        me: "manina".into(),
        level: 3,
        hp: 120,
        max_hp: 130,
        uuid: "u".into(),
        board: board(&b["board"]).to_vec(),
        turn_seconds: 30,
    };
    let now = Instant::now();
    // B1 step 0, an own swap with another turn after it, and no s2c/24 in 2 s: the turn is played on the timer. Its
    // s2c/24, half a second later, is not played again; the mob's turn of the same seq still is, as the server says so.
    let own = swap_result(
        3,
        &ints("move"),
        &refill,
        &[("manina", -1, -1, -1, 20)],
        "manina",
        true,
    );
    let (mut runner, mut acts) = (
        BattleRunner::new(&setup, "mob872604", RunnerOptions::default()),
        vec![],
    );
    runner.on_packet(19, &own, now, &mut acts).unwrap();
    let inferred = now + Duration::from_secs(2);
    assert_eq!(runner.deadline(), Some(inferred));
    runner.on_timer(inferred, &mut acts);
    assert_eq!(acts_sent(&acts), [19]);
    let late = inferred + Duration::from_millis(500);
    assert!(runner
        .on_packet(24, &turn_of(3, true), late, &mut acts)
        .unwrap());
    assert_eq!(acts_sent(&acts), [19], "no second c2s/19 for turn 3");
    assert_eq!(runner.turns, 1);
    runner
        .on_packet(24, &turn_of(3, false), late, &mut acts)
        .unwrap();
    assert_eq!(acts_sent(&acts), [19, 14]);

    // Hỏa Cầu Thuật waiting for its answer: the same turn again sends no second c2s/20; without an answer in 3 s, the
    // swap goes, once.
    let options = RunnerOptions {
        skill: Some(cllt_core::runner::Skill { id: 1000, cost: 25 }),
        ..RunnerOptions::default()
    };
    let (mut runner, mut acts) = (BattleRunner::new(&setup, "mob872604", options), vec![]);
    runner.me.s1 = 30.0;
    runner
        .on_packet(24, &turn_of(4, true), now, &mut acts)
        .unwrap();
    assert_eq!(acts_sent(&acts), [20]);
    runner
        .on_packet(24, &turn_of(4, true), now, &mut acts)
        .unwrap();
    assert_eq!(acts_sent(&acts), [20], "no second c2s/20 for turn 4");
    runner.on_timer(now + Duration::from_secs(3), &mut acts);
    assert_eq!(acts_sent(&acts), [20, 19]);
    assert_eq!(runner.deadline(), None);
}

#[test]
fn damage_dealt_stops_at_the_largest_i32_instead_of_overflowing() {
    let all = v();
    let b = &all["battles"][0];
    let step0 = &b["steps"][0];
    let ints = |k: &str| -> Vec<i32> {
        step0[k]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| x.as_i64().unwrap() as i32)
            .collect()
    };
    let refill: Vec<u8> = ints("refill").iter().map(|&x| x as u8).collect();
    let setup = battle::Setup {
        me: "manina".into(),
        level: 3,
        hp: 120,
        max_hp: 130,
        uuid: "u".into(),
        board: board(&b["board"]).to_vec(),
        turn_seconds: 30,
    };
    let (mut runner, mut acts, now) = (
        BattleRunner::new(&setup, "mob872604", RunnerOptions::default()),
        vec![],
        Instant::now(),
    );
    // B1 step 0 twice, each saying it dealt i32::MAX (the second does not match the board: a line, nothing more).
    for seq in [3, 5] {
        let hit = swap_result(
            seq,
            &ints("move"),
            &refill,
            &[("manina", i32::MAX, -1, -1, -1)],
            "manina",
            false,
        );
        runner.on_packet(19, &hit, now, &mut acts).unwrap();
    }
    assert_eq!(runner.damage, i32::MAX);
}

/// s2c/1177 of a boss in the layout of world.ts (field 0 at a tile, field 1 gone).
fn boss(field: u8) -> Vec<u8> {
    if field == 1 {
        return Writer::new()
            .string("M1")
            .u8(1)
            .string("mob86100001")
            .build();
    }
    Writer::new()
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
        .i32(85)
        .i32(5)
        .build()
}

#[test]
fn fight_job_challenges_a_boss_with_1178_waits_while_it_moves_and_goes_on_after_losing() {
    let (mut bot, mut out, now) = (
        Bot::new(
            BotOptions {
                rest: Duration::from_secs(60),
                ..BotOptions::default()
            },
            Arc::new(Atlas::default()),
        ),
        vec![],
        Instant::now(),
    );
    bot.on_packet(
        29,
        &Writer::new().string("manina").string("M1").i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(
        43,
        &Writer::new()
            .string("M1")
            .u8(3)
            .string("mob10")
            .string("Gà Điên")
            .i32(1)
            .u8(0)
            .i32(6)
            .i32(1)
            .u8(0)
            .build(),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(1177, &boss(0), now, &mut out).unwrap();
    let t = bot.targets();
    assert_eq!(
        (t[0].name.as_str(), t[0].boss, t[1].name.as_str(), t[1].boss),
        ("Thủ Lĩnh Sơn Tặc", true, "Gà Điên", false)
    );
    bot.fight("Thủ Lĩnh Sơn Tặc", 3, 1, now, &mut out);
    assert!(out.contains(&Out::Send(
        1178,
        Writer::new().string("mob86100001").i32(0).build()
    )));
    out.clear();
    // The boss leaves its tile; no answer to the challenge in 8 s: the job waits for it instead of giving up.
    bot.on_packet(1177, &boss(1), now, &mut out).unwrap();
    bot.on_timer(now + Duration::from_secs(9), &mut out);
    assert!(matches!(out.last(), Some(Out::Log(_, t)) if t.contains("đang đổi chỗ")));
    assert!(!out.iter().any(|o| matches!(o, Out::Send(..))));
    bot.on_packet(1177, &boss(0), now, &mut out).unwrap();
    bot.on_timer(now + Duration::from_secs(15), &mut out);
    assert!(matches!(out.last(), Some(Out::Send(1178, _))));
    assert_eq!(bot.snap.job.as_ref().unwrap().fights, 2);
}

#[test]
fn targets_carry_the_element_of_s2c_43_and_say_which_give_no_exp() {
    let (mut bot, mut out, now) = (
        Bot::new(BotOptions::default(), Arc::new(Atlas::default())),
        vec![],
        Instant::now(),
    );
    bot.on_packet(
        29,
        &Writer::new().string("symap").string("M8").i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    // The kinds of M8 (B8, 02/11) with their a: 2 Lôi, 4 Thủy, 0 Hỏa.
    let mut mobs = Writer::new().string("M8").u8(3);
    for (id, name, level, a) in [
        ("mob221800", "Gà Trống Yêu Tinh", 68, 2),
        ("mob183000", "Voi Mập", 56, 4),
        ("mob200", "Gà Lửa", 61, 0),
    ] {
        mobs = mobs
            .string(id)
            .string(name)
            .i32(level)
            .u8(a)
            .i32(9)
            .i32(1)
            .u8(0);
    }
    bot.on_packet(43, &mobs.build(), now, &mut out).unwrap();
    // Tướng Thiết Kích of s2c/1177 at the login of B8: level 65, a = 2.
    let boss = Writer::new()
        .string("M8")
        .u8(0)
        .string("mob101100007")
        .string("Tướng Thiết Kích")
        .i32(65)
        .u8(2)
        .i32(9)
        .i32(1)
        .u8(1)
        .u8(1)
        .i32(9)
        .i32(16)
        .build();
    bot.on_packet(1177, &boss, now, &mut out).unwrap();
    let row = |bot: &Bot, name: &str| {
        let t = bot.targets().into_iter().find(|t| t.name == name).unwrap();
        (t.element, t.no_exp, t.here)
    };
    // Level not known yet: nothing is marked.
    assert_eq!(row(&bot, "Voi Mập"), (Some(4), false, true));
    // symap at level 86: more than 20 levels above Voi Mập (30), Gà Lửa (25) and the boss (21), not Gà Trống (18).
    bot.snap.level = 86;
    assert_eq!(row(&bot, "Gà Trống Yêu Tinh"), (Some(2), false, true));
    assert_eq!(row(&bot, "Voi Mập"), (Some(4), true, true));
    assert_eq!(row(&bot, "Gà Lửa"), (Some(1), true, true));
    assert_eq!(row(&bot, "Tướng Thiết Kích"), (Some(2), true, true));
    // At level 85 the boss is 20 below: it still gives EXP.
    bot.snap.level = 85;
    assert!(!row(&bot, "Tướng Thiết Kích").1);
    // Off its tile it stays in the list with the element it had.
    bot.on_packet(
        1177,
        &Writer::new()
            .string("M8")
            .u8(1)
            .string("mob101100007")
            .build(),
        now,
        &mut out,
    )
    .unwrap();
    assert_eq!(row(&bot, "Tướng Thiết Kích"), (Some(2), false, false));
}

/// A bot on M2 with one Cóc Xanh (mob61000) in the zone, and the s2c/22 that opens a battle against it.
fn coc_xanh_bot() -> (Bot, Vec<Out>, Instant, Vec<u8>) {
    let all = v();
    let setup = hex(all["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["fn"] == "battleSetup")
        .unwrap()["hex"]
        .as_str()
        .unwrap()); // mob61000
    let (mut bot, mut out, now) = (
        Bot::new(BotOptions::default(), Arc::new(Atlas::default())),
        vec![],
        Instant::now(),
    );
    bot.on_packet(
        29,
        &Writer::new().string("manina").string("M2").i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(
        43,
        &Writer::new()
            .string("M2")
            .u8(3)
            .string("mob61000")
            .string("Cóc Xanh")
            .i32(13)
            .u8(0)
            .i32(6)
            .i32(1)
            .u8(0)
            .build(),
        now,
        &mut out,
    )
    .unwrap();
    (bot, out, now, setup)
}

/// s2c/19 ending the battle against mob61000 with a loss; without refill, so without the reshuffle byte and the 3 after it.
fn lost_battle() -> Vec<u8> {
    Writer::new()
        .i32(2)
        .i32(0)
        .i32(0)
        .i32(2)
        .i32(2)
        .i32(2)
        .i32(3)
        .i32(1)
        .bytes(&[])
        .u8(1)
        .string("manina")
        .i32(40)
        .u8(0)
        .i32(0)
        .i32(-1)
        .i32(-1)
        .u8(0)
        .u8(0)
        .u8(0)
        .u8(0)
        .string("mob61000")
        .u8(1)
        .u8(0)
        .i32(0)
        .i32(0)
        .build()
}

#[test]
fn fight_job_against_a_mob_stops_at_max_losses_and_a_missing_mob_ends_it() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    assert!(out.contains(&Out::Send(
        15,
        Writer::new().string("mob61000").u8(1).build()
    )));
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    assert!(matches!(out.last(), Some(Out::Send(18, _))));
    assert_eq!(
        bot.snapshot().battle.map(|b| b.mob_name),
        Some("Cóc Xanh".to_string())
    );
    let lost = lost_battle();
    bot.on_packet(19, &lost, now, &mut out).unwrap();
    let job = bot.snap.job.clone().unwrap();
    assert_eq!(
        (job.fights, job.losses, job.done.as_deref()),
        (1, 1, Some("Thua 1 trận"))
    );
    assert_eq!(bot.deadline(), None);
    bot.on_packet(43, &Writer::new().string("M2").u8(3).build(), now, &mut out)
        .unwrap();
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    assert_eq!(
        bot.snap.job.as_ref().unwrap().done.as_deref(),
        Some("Không thấy Cóc Xanh ở khu này")
    );
}

/// "Lượt thua còn lại" changed during a job: Thua tối đa 10 with one loss leaves 9; set to 1, the next loss ends the job.
/// Once it has ended, a change does nothing.
#[test]
fn losses_left_changed_during_a_fight_job_ends_it_after_that_many_more_losses() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.fight("Cóc Xanh", 5, 10, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    bot.on_packet(19, &lost_battle(), now, &mut out).unwrap();
    let job = bot.snap.job.clone().unwrap();
    assert_eq!((job.losses, job.max_losses, job.done), (1, 10, None));
    out.clear();
    bot.set_losses_left(1, &mut out);
    assert!(
        logged(&out, "Còn 1 lượt thua nữa thì dừng đánh Cóc Xanh"),
        "{out:?}"
    );
    assert_eq!(bot.snap.job.as_ref().unwrap().max_losses, 2);
    let t = bot.deadline().unwrap();
    bot.on_timer(t, &mut out);
    bot.on_packet(22, &setup, t, &mut out).unwrap();
    bot.on_packet(19, &lost_battle(), t, &mut out).unwrap();
    assert_eq!(
        bot.snap.job.as_ref().unwrap().done.as_deref(),
        Some("Thua 2 trận")
    );
    out.clear();
    bot.set_losses_left(5, &mut out);
    assert!(out.is_empty(), "{out:?}");
    assert_eq!(bot.snap.job.as_ref().unwrap().max_losses, 2);
}

#[test]
fn the_snapshot_keeps_the_result_that_ended_a_battle_until_the_next_one_opens() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.fight("Cóc Xanh", 2, 1, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    assert_eq!(bot.snapshot().turn, None);
    bot.on_packet(19, &won_battle(), now, &mut out).unwrap();
    let (snap, start_hp) = (bot.snapshot(), 150);
    assert_eq!(snap.battle, None);
    let turn = snap.turn.expect("the last result");
    // won_battle() has no unit for the mob that moved: the damage is the HP manina lost.
    assert_eq!(
        (turn.foe.as_str(), turn.mine, turn.end, turn.hp, turn.damage),
        ("Cóc Xanh", false, true, [0, 180], start_hp)
    );
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert!(bot.snapshot().turn.is_some());
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    assert_eq!(bot.snapshot().turn, None);
}

#[test]
fn a_battle_line_says_how_long_it_took_and_the_job_so_far_and_when_it_ended() {
    assert_eq!(duration_text(Duration::from_secs(45)), "45 giây");
    assert_eq!(duration_text(Duration::from_secs(65)), "1 phút 05 giây");
    assert_eq!(duration_text(Duration::from_secs(3723)), "1 giờ 02 phút");
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    // The job starts, its battle opens 10 s later and ends 65 s after that.
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    bot.on_packet(22, &setup, now + Duration::from_secs(10), &mut out)
        .unwrap();
    out.clear();
    bot.on_packet(19, &lost_battle(), now + Duration::from_secs(75), &mut out)
        .unwrap();
    let logs: Vec<&str> = out
        .iter()
        .filter_map(|o| match o {
            Out::Log(_, t) => Some(t.as_str()),
            _ => None,
        })
        .collect();
    assert!(
        logs.iter().any(|t| t.starts_with("Trận 1: thua, ")
            && t.contains(" lượt trong 1 phút 05 giây, gây ")
            && t.ends_with("; đã chạy 1 phút 15 giây")),
        "{logs:?}"
    );
    assert!(
        logs.iter()
            .any(|t| t.starts_with("Kết thúc: Thua 1 trận (") && t.contains(", trong ")),
        "{logs:?}"
    );
    let job = bot.snap.job.unwrap();
    assert!(job
        .ended_at
        .is_some_and(|end| end >= job.started_at && job.started_at > 0));
}

#[test]
fn a_job_started_mid_battle_does_not_count_that_battle_or_challenge_twice() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    let challenges = |out: &[Out]| out.iter().filter(|o| matches!(o, Out::Send(15, _))).count();
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    // A second click while the challenge waits for s2c/22 sends no second challenge.
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    assert_eq!(challenges(&out), 1);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    // A new job while the battle runs: nothing is sent until the battle ends.
    bot.fight("Cóc Xanh", 3, 1, now, &mut out);
    assert_eq!(challenges(&out), 1);
    bot.on_packet(19, &lost_battle(), now, &mut out).unwrap();
    let job = bot.snap.job.clone().unwrap();
    assert_eq!(
        (job.count, job.fights, job.losses, job.done),
        (3, 0, 0, None)
    );
    assert!(out.contains(&Out::Log(
        LogKind::Battle,
        "Trận của việc trước: thua, +0 EXP".into()
    )));
    // After the rest, the new job challenges.
    let later = bot.deadline().expect("rest timer");
    bot.on_timer(later, &mut out);
    assert_eq!(challenges(&out), 2);
    assert_eq!(bot.snap.job.unwrap().fights, 1);
}

/// coc_xanh_bot() with a second kind of mob in the zone: Cua Càng (mob62000).
fn two_mob_bot() -> (Bot, Vec<Out>, Instant, Vec<u8>) {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    let mob = |w: Writer, id: &str, name: &str, level| {
        w.string(id)
            .string(name)
            .i32(level)
            .u8(0)
            .i32(6)
            .i32(1)
            .u8(0)
    };
    let mobs = mob(
        mob(Writer::new().string("M2").u8(3), "mob61000", "Cóc Xanh", 13),
        "mob62000",
        "Cua Càng",
        15,
    );
    bot.on_packet(43, &mobs.build(), now, &mut out).unwrap();
    (bot, out, now, setup)
}
fn sends(out: &[Out], op: i32) -> usize {
    out.iter()
        .filter(|o| matches!(o, Out::Send(o, _) if *o == op))
        .count()
}

#[test]
fn a_late_setup_counts_for_the_job_whose_challenge_it_answers() {
    let (mut bot, mut out, now, setup) = two_mob_bot();
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    // Replaced while its challenge waits: the new job challenges once that one times out.
    bot.fight("Cua Càng", 5, 1, now, &mut out);
    bot.on_timer(now + Duration::from_secs(9), &mut out);
    assert!(out.contains(&Out::Send(
        15,
        Writer::new().string("mob62000").u8(1).build()
    )));
    // Then the battle of the first challenge (mob61000) opens after all: played out, counted for the first job only.
    bot.on_packet(22, &setup, now + Duration::from_secs(10), &mut out)
        .unwrap();
    assert!(matches!(out.last(), Some(Out::Send(18, _))));
    assert!(out.iter().any(
        |o| matches!(o, Out::Log(_, t) if t.starts_with("Trận với Cóc Xanh từ thách đấu trước"))
    ));
    bot.on_packet(19, &lost_battle(), now + Duration::from_secs(20), &mut out)
        .unwrap();
    let job = bot.snap.job.clone().unwrap();
    assert_eq!(
        (job.target.as_str(), job.fights, job.losses, job.done),
        ("Cua Càng", 1, 0, None)
    );
    assert!(out.contains(&Out::Log(
        LogKind::Battle,
        "Trận của việc trước: thua, +0 EXP".into()
    )));
}

#[test]
fn a_setup_after_stop_is_played_out_and_one_nobody_asked_for_is_not() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    // No challenge sent: nothing is played.
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    assert_eq!(sends(&out, 18), 0);
    assert!(out.contains(&Out::Log(
        LogKind::Battle,
        "Có trận không do app mở; bỏ qua".into()
    )));
    // Stop while the challenge waits: the server opens that battle anyway, and an idle one would be lost.
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    bot.stop(false, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    assert_eq!(sends(&out, 18), 1);
    bot.on_packet(19, &lost_battle(), now, &mut out).unwrap();
    let job = bot.snap.job.clone().unwrap();
    assert_eq!(
        (job.fights, job.losses, job.done.as_deref()),
        (1, 1, Some("Đã dừng"))
    );
    assert_eq!(bot.deadline(), None);
    // The challenge is answered: a second setup has none left.
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    assert_eq!(sends(&out, 18), 1);
}

#[test]
fn a_second_setup_does_not_replace_the_battle_in_progress() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.fight("Cóc Xanh", 5, 1, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    let turns = bot.snapshot().battle.unwrap().turns;
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    assert!(out.contains(&Out::Log(
        LogKind::Battle,
        "Server mở thêm một trận khi trận trước chưa xong; bỏ qua".into()
    )));
    assert_eq!(
        (sends(&out, 18), bot.snapshot().battle.unwrap().turns),
        (1, turns)
    );
}

#[test]
fn a_map_that_does_not_read_stops_the_quest_run_and_leaves_the_atlas_alone() {
    let (mut bot, mut out, now, _) = coc_xanh_bot();
    bot.on_packet(39, &quest9(3, 14), now, &mut out).unwrap();
    bot.quest(1, None, now, &mut out);
    // The head of s2c/11 reads, its NPCs and portals do not.
    let broken = Writer::new()
        .u8(1)
        .string("M3")
        .string("Rừng Trúc")
        .u8(0)
        .i32(64)
        .i32(320)
        .build();
    bot.on_packet(11, &broken, now, &mut out).unwrap();
    assert!(out.iter().any(
        |o| matches!(o, Out::Log(_, t) if t.starts_with("Không đọc được NPC và cổng của Rừng Trúc"))
    ));
    assert_eq!(
        bot.snap.quest_run.as_ref().unwrap().done.as_deref(),
        Some("Không đọc được NPC và cổng của map này")
    );
    assert!(bot.snap.places.is_empty() && !bot.atlas().maps.contains_key("M3"));
    assert_eq!(bot.snap.map_name, "Rừng Trúc");
}

/// The bot of quest replay `name` of vectors.json after its first `until` steps (packets, and the start of the run),
/// with the time they all came at.
fn replay_to(name: &str, until: usize) -> (Bot, Vec<Out>, Instant) {
    let all = v();
    let s = all["questReplays"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["name"] == name)
        .unwrap_or_else(|| panic!("no replay {name}"));
    let atlas = match &s["atlas"] {
        Value::Null => Atlas::default(),
        a => serde_json::from_value(a.clone()).unwrap(),
    };
    let (mut bot, mut out, now) = (
        Bot::new(BotOptions::default(), Arc::new(atlas)),
        vec![],
        Instant::now(),
    );
    for step in &s["steps"].as_array().unwrap()[..until] {
        match step["packet"].as_array() {
            Some(p) => bot
                .on_packet(
                    p[0].as_i64().unwrap() as i32,
                    &hex(p[1].as_str().unwrap()),
                    now,
                    &mut out,
                )
                .unwrap(),
            None => bot.quest(1, None, now, &mut out),
        }
    }
    (bot, out, now)
}

#[test]
fn a_portal_whose_new_map_does_not_come_or_read_stops_the_quest_run_8_s_after_c2s_13() {
    // After s2c/13 (which clears the portal's timer): an s2c/11 of a kind not read, so no c2s/43 goes, or an s2c/43 that
    // does not read. Nothing else would wake the run, left on "Qua cổng …" with every other button refused.
    let name = "an NPC in another map: through the portal the quest names";
    let cases: [(usize, i32, Vec<u8>); 2] = [
        (6, 11, vec![0]),
        (7, 43, Writer::new().string("M2").build()),
    ];
    for (until, op, payload) in cases {
        let (mut bot, mut out, now) = replay_to(name, until);
        let doing = bot.snap.quest_run.as_ref().unwrap().doing.clone();
        let portal = doing.strip_prefix("Qua cổng ").expect(&doing).to_string();
        let _ = bot.on_packet(op, &payload, now, &mut out);
        let at = now + Duration::from_secs(8);
        assert_eq!(bot.deadline(), Some(at), "s2c/{op}");
        out.clear();
        bot.on_timer(at, &mut out);
        assert!(
            out.contains(&Out::Log(
                LogKind::Travel,
                format!("Server không gửi map mới sau cổng {portal} trong 8 s")
            )),
            "s2c/{op}: {out:?}"
        );
        assert_eq!(
            bot.snap.quest_run.as_ref().unwrap().done,
            Some(format!("Không vào được map sau cổng {portal}")),
            "s2c/{op}"
        );
        assert_eq!(bot.deadline(), None, "s2c/{op}");
        // Nothing waits any more: a fight job may start.
        out.clear();
        bot.fight("Cóc Xanh", 1, 1, at, &mut out);
        assert!(logged(&out, "Bắt đầu: đánh Cóc Xanh 1 lần"), "{out:?}");
    }
    // The portal that does lead on is not cut short: the map in time, the run goes on and nothing fires 8 s later.
    let (mut bot, mut out, now) = replay_to(name, 8);
    assert!(bot.snap.quest_run.as_ref().unwrap().done.is_none());
    assert_eq!(bot.deadline(), Some(now + Duration::from_secs(2)));
    out.clear();
    bot.on_timer(now + Duration::from_secs(2), &mut out);
    assert!(!logged(&out, "Server không gửi map mới"), "{out:?}");
}

#[test]
fn step_actions_read_what_step_action_reads() {
    for c in v()["stepActions"].as_array().unwrap() {
        let text = c["text"].as_str().unwrap();
        let got = step_action(
            text,
            c["npcId"].as_i64().unwrap() as i32,
            c["param"].as_i64().unwrap() as i32,
        );
        assert_eq!(serde_json::to_value(got).unwrap(), c["action"], "{text}");
    }
}

#[test]
fn numbers_of_the_server_at_the_ends_of_their_range_do_not_overflow() {
    // A step's param at i32::MAX names M2147483648, as the TS side would.
    assert_eq!(
        serde_json::to_value(step_action("Đến Cửu Phong", -1, i32::MAX)).unwrap(),
        json!({ "kind": "visit", "place": "Cửu Phong", "mapId": "M2147483648" })
    );
    let (mut bot, mut out, now, _) = coc_xanh_bot();
    // s2c/39 at step i32::MAX: its line counts from 1 without overflowing.
    bot.on_packet(39, &quest9(i32::MAX, 0), now, &mut out)
        .unwrap();
    assert_eq!(bot.snap.quest.as_ref().unwrap().current, i32::MAX);
    assert!(
        logged(&out, "Nhiệm vụ 9: Thử Sức Tân Binh; bước 2147483648/5: "),
        "{out:?}"
    );
    // s2c/1184 with an item whose end is i64::MIN, or i64::MAX: taken as expired, or as just fallen.
    for expires_at in [i64::MIN, i64::MAX] {
        let ground = Writer::new()
            .string("M2")
            .i32(1)
            .u8(0xfe)
            .i32(3)
            .string("uuid-1")
            .i32(0)
            .i32(-1)
            .i32(1)
            .u8(0)
            .u8(0xff)
            .i32(0)
            .u8(0)
            .u8(0)
            .u8(0)
            .i32(1400)
            .i32(640)
            .i64(expires_at)
            .build();
        bot.on_packet(1184, &ground, now, &mut out).unwrap();
    }
}

/// The map test of a route case: a map with that NPC, that mob or boss, or that id.
fn wanted(w: &Value) -> impl Fn(&MapRecord) -> bool {
    let w = w.clone();
    move |m: &MapRecord| match (w["npc"].as_i64(), w["mob"].as_str(), w["map"].as_str()) {
        (Some(npc), _, _) => m.places.iter().any(|p| p.kind == 2 && p.id as i64 == npc),
        (_, Some(mob), _) => {
            m.mobs.iter().any(|k| k.name == mob) || m.bosses.iter().any(|b| b.name == mob)
        }
        (_, _, map) => Some(m.map_id.as_str()) == map,
    }
}
fn ids(v: &Value) -> HashSet<i32> {
    v.as_array()
        .unwrap()
        .iter()
        .map(|x| x.as_i64().unwrap() as i32)
        .collect()
}

#[test]
fn atlas_finds_the_way_atlas_ts_finds() {
    let all = v();
    let a = &all["atlas"];
    // The scan S1, then the same maps with the world map and Lạc Cốc (maps above the character's level left out).
    for a in [a, &a["gate"]] {
        atlas_cases(a);
    }
    let atlas: Atlas = serde_json::from_value(a["atlas"].clone()).unwrap();
    for d in a["destinations"].as_array().unwrap() {
        let got = atlas.destination(
            d["id"].as_i64().unwrap() as i32,
            d["name"].as_str().unwrap(),
            d["from"].as_str().unwrap(),
        );
        assert_eq!(got.as_deref(), d["mapId"].as_str(), "destination {d}");
    }
}

/// route and portals_of on the atlas of an atlasCases group of export-rust.ts.
fn atlas_cases(a: &Value) {
    let atlas: Atlas = serde_json::from_value(a["atlas"].clone()).unwrap();
    for r in a["routes"].as_array().unwrap() {
        let got = atlas
            .route(
                r["from"].as_str().unwrap(),
                &wanted(&r["wanted"]),
                r["level"].as_i64().unwrap() as i32,
                &ids(&r["skip"]),
            )
            .map(|p| p.id as i64);
        assert_eq!(got, r["portal"].as_i64(), "route {r}");
    }
    for c in a["portalsOf"].as_array().unwrap() {
        let got: Vec<i64> = atlas
            .portals_of(
                c["mapId"].as_str().unwrap(),
                c["level"].as_i64().unwrap() as i32,
                &HashSet::new(),
            )
            .iter()
            .map(|p| p.id as i64)
            .collect();
        assert_eq!(Value::from(got), c["portals"], "portalsOf {c}");
    }
}

#[test]
fn quest_run_sends_what_quest_bot_sends() {
    // Every replay runs, and the names of those that failed come at the end: one not ported yet hides no other.
    let (all, mut failed) = (v(), vec![]);
    for s in all["questReplays"].as_array().unwrap() {
        let name = s["name"].as_str().unwrap();
        let replay = std::panic::catch_unwind(|| quest_replay(s, name));
        if replay.is_err() {
            failed.push(name);
        }
    }
    assert!(failed.is_empty(), "replays that failed: {failed:?}");
}

fn quest_replay(s: &Value, name: &str) {
    {
        let atlas = match &s["atlas"] {
            Value::Null => Atlas::default(),
            a => serde_json::from_value(a.clone()).unwrap(),
        };
        let mut bot = Bot::new(BotOptions::default(), Arc::new(atlas));
        let mut now = Instant::now();
        for (i, step) in s["steps"].as_array().unwrap().iter().enumerate() {
            let mut out = vec![];
            if let Some(p) = step["packet"].as_array() {
                let op = p[0].as_i64().unwrap() as i32;
                bot.on_packet(op, &hex(p[1].as_str().unwrap()), now, &mut out)
                    .unwrap();
            } else if step["start"] == true {
                // `stats` in TS: QuestBotOptions.stats, the stat plan of the run.
                let plan = match &step["stats"] {
                    Value::String(s) if s == "auto" => Some(StatPlan::Auto),
                    Value::Array(w) => Some(StatPlan::Weights(std::array::from_fn(|i| {
                        w[i].as_u64().unwrap() as u32
                    }))),
                    _ => None,
                };
                if plan.is_some() {
                    bot.set_stats(plan, now, &mut out);
                }
                // `once` in TS: ▶ on the step current at the start.
                let only = (step["once"] == true).then(|| {
                    let q = bot.snap.quest.as_ref().unwrap();
                    (q.id, q.current)
                });
                bot.quest(1, only, now, &mut out);
            } else {
                // `next` in TS: the decision of the timer the bot left pending.
                now = bot
                    .deadline()
                    .unwrap_or_else(|| panic!("{name}, step {i}: no timer pending"));
                bot.on_timer(now, &mut out);
            }
            let sent: Vec<Value> = out
                .iter()
                .filter_map(|o| match o {
                    Out::Send(op, p) => Some(json!([op, tohex(p)])),
                    _ => None,
                })
                .collect();
            assert_eq!(Value::from(sent), step["sent"], "{name}, step {i}: sent");
            let stopped = bot
                .snap
                .quest_run
                .as_ref()
                .is_some_and(|r| r.done.is_some());
            assert_eq!(stopped, step["stopped"], "{name}, step {i}: stopped");
            assert_eq!(
                bot.snap.quest.as_ref().map(|q| q.current as i64),
                step["current"].as_i64(),
                "{name}, step {i}: current step"
            );
        }
        assert_eq!(
            serde_json::to_value(&bot.atlas().portals).unwrap(),
            s["portals"],
            "{name}: portals"
        );
    }
}

/// s2c/39 of quest 9 at the given step and progress (10-quests.md: Sói Xám 15/15, Cóc Xanh 14/15 after Q20).
fn quest9(current: i32, progress: i32) -> Vec<u8> {
    let steps = [
        ("Đạt cấp độ 11", 11, 1, -1),
        ("Nói chuyện với Võ Quan Đinh Mộc", 141, 1, 141),
        ("Tiêu diệt Sói Xám", 4, 15, -1),
        ("Tiêu diệt Cóc Xanh", 5, 15, -1),
        ("Báo cáo với Võ Quan Đinh Mộc", 141, 1, 141),
    ];
    let mut w = Writer::new()
        .i32(9)
        .string("Thử Sức Tân Binh")
        .string("")
        .string("main")
        .i32(current)
        .i32(progress)
        .i32(steps.len() as i32);
    for (i, (text, param, required, npc)) in steps.into_iter().enumerate() {
        w = w
            .i32(i as i32)
            .string(text)
            .i32(param)
            .i32(required)
            .i32(npc);
    }
    w.build()
}
/// lost_battle() won: +142 EXP, +18 xu.
fn won_battle() -> Vec<u8> {
    let lost = lost_battle();
    let mut won = lost[..lost.len() - 10].to_vec();
    won.extend(Writer::new().u8(1).u8(1).i32(142).i32(18).build());
    won
}

#[test]
fn quest_run_counts_a_won_kill_then_goes_on_to_the_report() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.on_packet(39, &quest9(3, 14), now, &mut out).unwrap();
    bot.quest(1, None, now, &mut out);
    assert_eq!(
        out.last(),
        Some(&Out::Send(
            15,
            Writer::new().string("mob61000").u8(1).build()
        ))
    );
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    bot.on_packet(19, &won_battle(), now, &mut out).unwrap();
    let run = bot.snap.quest_run.clone().unwrap();
    assert_eq!(
        (run.fights, run.wins, run.exp, run.coin, run.done),
        (1, 1, 142, 18, None)
    );
    assert_eq!(bot.snap.quest.as_ref().unwrap().progress, 15);
    let later = bot.deadline().expect("rest timer");
    bot.on_timer(later, &mut out);
    assert_eq!(
        out.last(),
        Some(&Out::Send(13, Writer::new().string("M2").i32(141).build()))
    );
    assert_eq!(bot.snap.quest.unwrap().current, 4);
}

#[test]
fn one_step_ends_when_its_kill_count_is_reached_and_refuses_a_step_already_past() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.on_packet(39, &quest9(3, 14), now, &mut out).unwrap();
    // ▶ on "Tiêu diệt Sói Xám", done before: refused, nothing sent, a run that has ended for the UI.
    let sent = out.len();
    bot.quest(1, Some((9, 2)), now, &mut out);
    let refused = bot.snap.quest_run.clone().unwrap();
    assert_eq!(
        (
            refused.id,
            refused.step,
            refused.step_done,
            refused.done.as_deref()
        ),
        (
            1,
            Some(2),
            false,
            Some("Bước đó không còn là bước đang làm")
        )
    );
    // Step 3 of another quest, as when the UI still shows quest 8 after s2c/39 of quest 9: refused too.
    bot.quest(1, Some((8, 3)), now, &mut out);
    let other = bot.snap.quest_run.clone().unwrap();
    assert_eq!((other.id, other.done.is_some()), (2, true));
    assert!(!out[sent..].iter().any(|o| matches!(o, Out::Send(..))));
    // ▶ on "Tiêu diệt Cóc Xanh" (14/15): one won battle, then it ends instead of going to the report.
    bot.quest(1, Some((9, 3)), now, &mut out);
    assert_eq!(
        out.last(),
        Some(&Out::Send(
            15,
            Writer::new().string("mob61000").u8(1).build()
        ))
    );
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    bot.on_packet(19, &won_battle(), now, &mut out).unwrap();
    let sent = out.len();
    let later = bot.deadline().expect("rest timer");
    bot.on_timer(later, &mut out);
    assert!(!out[sent..].iter().any(|o| matches!(o, Out::Send(..))));
    let run = bot.snap.quest_run.clone().unwrap();
    assert_eq!(
        (
            run.id,
            run.step,
            run.step_done,
            run.wins,
            run.done.as_deref()
        ),
        (
            3,
            Some(3),
            true,
            1,
            Some("Xong bước \"Tiêu diệt Cóc Xanh\"")
        )
    );
    assert_eq!(bot.snap.quest.as_ref().unwrap().current, 4);
    assert_eq!(bot.deadline(), None);
}

#[test]
fn quest_run_does_not_count_a_loss_and_stops_at_max_losses_or_on_stop() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.on_packet(39, &quest9(3, 14), now, &mut out).unwrap();
    bot.quest(1, None, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    bot.on_packet(19, &lost_battle(), now, &mut out).unwrap();
    assert_eq!(bot.snap.quest.as_ref().unwrap().progress, 14);
    let run = bot.snap.quest_run.clone().unwrap();
    assert_eq!((run.losses, run.done.as_deref()), (1, Some("Thua 1 trận")));
    assert_eq!(bot.deadline(), None);
    // One task at a time: a fight job is refused while a quest run goes on, and the other way round.
    bot.quest(2, None, now, &mut out);
    out.clear();
    bot.fight("Cóc Xanh", 1, 1, now, &mut out);
    assert_eq!(
        out,
        [Out::Log(
            LogKind::Battle,
            "Đang tự làm nhiệm vụ: bấm Dừng rồi mới đánh quái".into()
        )]
    );
    assert_eq!(bot.snap.quest_run.as_ref().unwrap().done, None);
    assert_eq!(bot.snap.job, None);
    bot.stop(false, now, &mut out);
    bot.fight("Cóc Xanh", 1, 1, now, &mut out);
    out.clear();
    bot.quest(2, None, now, &mut out);
    assert_eq!(
        out,
        [Out::Log(
            LogKind::Quest,
            "Đang đánh quái: bấm Dừng rồi mới làm nhiệm vụ".into()
        )]
    );
    assert_eq!(bot.snap.job.as_ref().unwrap().done, None);
    assert_eq!(
        bot.snap.quest_run.as_ref().unwrap().done.as_deref(),
        Some("Đã dừng")
    );
}

/// s2c/39 of quest 12 at N1 (wangpt, 31/10): step 3 is "Tỷ thí với Võ Quan Đinh Mộc" (87, 1, NPC 141).
const QUEST12: &str = "0000000c000000164b69e1babf6d205468e1bbad20416e682048c3b96e67000000b0536175206e6869e1bb8175207468e1bbad207468c3a163682c206e67c6b0c6a16920c491c3a3207468752068c3ba742073e1bbb1206368c3ba20c3bd2063e1bba7612063c3a163206368e1bb8920687579207175c3a26e20c491e1bb99692e2048c3a379206368e1bba96e67206d696e682062e1baa36e207468c3a26e2074726f6e67207472e1baad6e2074e1bbb7207468c3ad2076e1bb9b692056c3b5205175616e20c490696e68204de1bb99632e000000046d61696e0000000200000000000000040000000000000015c490e1baa1742063e1baa57020c491e1bb992031380000001200000001ffffffff000000010000001f47e1bab770205472e1baa169204368e1bba7205068e1baa16d2048c3b96e670000007f000000010000007f000000020000002454e1bbb7207468c3ad2076e1bb9b692056c3b5205175616e20c490696e68204de1bb996300000057000000010000008d000000030000002942c3a16f2063c3a16f2076e1bb9b69205472e1baa169204368e1bba7205068e1baa16d2048c3b96e670000007f000000010000007f";
/// s2c/57 of N1, after c2s/13 ("M2", 141): "Cậu đã sẵn sàng chiến đấu chưa." with 0 Đồng ý, 1 Từ chối.
const DUEL_DIALOG: &str = "000000020000001456c3b5205175616e20c490696e68204de1bb99630000002c43e1baad7520c491c3a32073e1bab56e2073c3a06e6720636869e1babf6e20c491e1baa575206368c6b0612e000000000ac490e1bb936e6720c3bd010000000b54e1bbab206368e1bb9169";

/// s2c/1180 of N3, after Đồng ý: the duel's mob, mob880 "Võ Quan Đinh Mộc" cấp 20.
const DUEL_INVITE: &str = "000000024d320000008d000000066d6f623838300000001456c3b5205175616e20c490696e68204de1bb996300000014000000000600000001000200000000";

/// coc_xanh_bot at step 3 of quest 12, and its s2c/22 with the block of the duel's mob (mob880) in place of Cóc Xanh's.
fn duel_bot() -> (Bot, Vec<Out>, Instant, Vec<u8>) {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.on_packet(39, &hex(QUEST12), now, &mut out).unwrap();
    let cut = Writer::new().string("mob61000").string("Cóc Xanh").build();
    let at = setup.windows(cut.len()).position(|w| w == cut).unwrap();
    let mut duel = setup[..at].to_vec();
    duel.extend(
        Writer::new()
            .string("mob880")
            .string("Võ Quan Đinh Mộc")
            .build(),
    );
    duel.extend(&setup[at + cut.len()..]);
    (bot, out, now, duel)
}

#[test]
fn a_talk_step_answered_by_a_dialog_says_dong_y_challenges_the_duel_s_mob_and_plays_it_as_its_battle(
) {
    let (mut bot, mut out, now, duel) = duel_bot();
    let talk = Out::Send(13, Writer::new().string("M2").i32(141).build());
    bot.quest(1, None, now, &mut out);
    assert_eq!(out.last(), Some(&talk));
    bot.on_packet(57, &hex(DUEL_DIALOG), now, &mut out).unwrap();
    assert_eq!(
        out.last(),
        Some(&Out::Send(
            57,
            Writer::new().u8(0).string("M2").i32(141).build()
        ))
    );
    let said = |out: &[Out], line: &str| {
        out.iter()
            .any(|o| matches!(o, Out::Log(_, text) if text == line))
    };
    assert!(said(
        &out,
        "Võ Quan Đinh Mộc: Cậu đã sẵn sàng chiến đấu chưa. → Đồng ý"
    ));
    // s2c/1180 names the duel's mob; the bot challenges it with c2s/1181 as the game does (N3).
    bot.on_packet(1180, &hex(DUEL_INVITE), now, &mut out)
        .unwrap();
    assert_eq!(
        out.last(),
        Some(&Out::Send(
            1181,
            Writer::new().string("mob880").i32(0).i32(141).build()
        ))
    );
    assert!(said(
        &out,
        "Trận 1: tỷ thí với Võ Quan Đinh Mộc cấp 20 (mob880)"
    ));
    // The mob is in no list of the map: the battle view and the record name it from the invite.
    bot.on_packet(22, &duel, now, &mut out).unwrap();
    assert_eq!(
        bot.snapshot().battle.map(|b| b.mob_name).as_deref(),
        Some("Võ Quan Đinh Mộc")
    );
    bot.on_packet(19, &won_battle(), now, &mut out).unwrap();
    let record = out
        .iter()
        .find_map(|o| match o {
            Out::Battle(r) => Some(r.clone()),
            _ => None,
        })
        .unwrap();
    assert_eq!(
        (
            record.mob_id.as_str(),
            record.mob_name.as_str(),
            record.mob_level
        ),
        ("mob880", "Võ Quan Đinh Mộc", 20)
    );
    let run = bot.snap.quest_run.clone().unwrap();
    assert_eq!((run.fights, run.wins, run.done), (1, 1, None));
    // The server's s2c/34 moves the step on, not the battle.
    assert_eq!(bot.snap.quest.as_ref().unwrap().current, 2);
    let reply = Writer::new()
        .i32(0)
        .string("subtask 1")
        .i32(12)
        .string("Khá lắm!")
        .build();
    bot.on_packet(34, &reply, now, &mut out).unwrap();
    assert_eq!(bot.snap.quest.as_ref().unwrap().current, 3);
    let later = bot.deadline().expect("next step timer");
    bot.on_timer(later, &mut out);
    assert_eq!(
        out.last(),
        Some(&Out::Send(13, Writer::new().string("M2").i32(127).build()))
    );
}

#[test]
fn a_dialog_without_dong_y_no_invite_or_a_fourth_duel_that_never_opened_ends_the_run() {
    let (mut bot, mut out, now, _) = duel_bot();
    let talk = Out::Send(13, Writer::new().string("M2").i32(141).build());
    let yes = Out::Send(57, Writer::new().u8(0).string("M2").i32(141).build());
    let challenge = Out::Send(1181, Writer::new().string("mob880").i32(0).i32(141).build());
    bot.quest(1, None, now, &mut out);
    let asked = Writer::new()
        .i32(1)
        .string("Võ Quan Đinh Mộc")
        .string("Ngươi muốn gì?")
        .u8(0)
        .string("Rời đi")
        .build();
    bot.on_packet(57, &asked, now, &mut out).unwrap();
    assert!(!out.contains(&yes));
    assert_eq!(
        bot.snap.quest_run.clone().unwrap().done.as_deref(),
        Some("Võ Quan Đinh Mộc hỏi \"Ngươi muốn gì?\" (Rời đi): bot chưa biết chọn dòng nào")
    );
    // Đồng ý that s2c/1180 does not answer within 8 s.
    bot.quest(1, None, now, &mut out);
    bot.on_packet(57, &hex(DUEL_DIALOG), now, &mut out).unwrap();
    assert_eq!(out.last(), Some(&yes));
    bot.on_timer(bot.deadline().expect("invite timer"), &mut out);
    assert_eq!(
        bot.snap.quest_run.clone().unwrap().done.as_deref(),
        Some("Server không gửi trận tỷ thí sau Đồng ý")
    );
    // A duel the server never opens: 8 s after c2s/1181 the bot talks again, and the fourth dialog ends the run.
    bot.quest(1, None, now, &mut out);
    let mut at = now;
    for _ in 0..3 {
        bot.on_packet(57, &hex(DUEL_DIALOG), at, &mut out).unwrap();
        assert_eq!(out.last(), Some(&yes));
        bot.on_packet(1180, &hex(DUEL_INVITE), at, &mut out)
            .unwrap();
        assert_eq!(out.last(), Some(&challenge));
        at = bot.deadline().expect("challenge timer");
        bot.on_timer(at, &mut out);
        assert_eq!(out.last(), Some(&talk));
    }
    bot.on_packet(57, &hex(DUEL_DIALOG), at, &mut out).unwrap();
    let run = bot.snap.quest_run.clone().unwrap();
    assert_eq!(
        (run.fights, run.done.as_deref()),
        (
            3,
            Some("Đã tỷ thí với Võ Quan Đinh Mộc 3 lần mà bước vẫn chưa sang")
        )
    );
}

/// s2c/10 kind 8 with the potential points left (P1).
fn points_left(left: i32) -> Vec<u8> {
    Writer::new()
        .i32(8)
        .string("manina")
        .i32(left)
        .i32(16)
        .i32(0)
        .i32(21)
        .string("421")
        .string("125")
        .build()
}

fn stat_point(stat: i32) -> Out {
    Out::Send(10, Writer::new().i32(stat).i32(1).build())
}

#[test]
fn the_stat_plan_spends_points_while_idle_and_between_battles_and_plus_one_waits_for_the_battle() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.on_packet(10, &points_left(3), now, &mut out).unwrap();
    out.clear();
    // "Cộng +1" without a plan: that point only.
    bot.add_stat(3, &mut out);
    assert_eq!(out.last(), Some(&stat_point(3)));
    bot.on_packet(10, &points_left(2), now, &mut out).unwrap();
    assert_eq!(bot.deadline(), None);
    // A plan set while nothing runs spends at once, one point per answer.
    out.clear();
    bot.set_stats(Some(StatPlan::Weights([0, 0, 1, 0])), now, &mut out);
    assert_eq!(out.last(), Some(&stat_point(2)));
    bot.on_packet(10, &points_left(1), now, &mut out).unwrap();
    out.clear();
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert_eq!(out.last(), Some(&stat_point(2)));
    bot.on_packet(10, &points_left(0), now, &mut out).unwrap();
    out.clear();
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert_eq!(
        out,
        [Out::Log(
            LogKind::Character,
            "Đã tự cộng điểm tiềm năng: Thân pháp +2; còn 0".into()
        )]
    );
    // Points of a level up during a fight job wait for the battle to end, and so does "Cộng +1".
    bot.fight("Cóc Xanh", 2, 1, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    out.clear();
    bot.add_stat(0, &mut out);
    assert_eq!(
        out,
        [Out::Log(
            LogKind::Character,
            "Chưa cộng Cường lực: đang đánh, đợi hết trận".into()
        )]
    );
    bot.on_packet(10, &points_left(4), now, &mut out).unwrap();
    bot.on_packet(19, &won_battle(), now, &mut out).unwrap();
    out.clear();
    let rest = bot.deadline().unwrap();
    bot.on_timer(rest, &mut out);
    assert_eq!(out.last(), Some(&stat_point(2)));
    // A point the server does not answer ends the plan's spending and the job.
    let silence = bot.deadline().unwrap();
    assert_eq!(silence, rest + Duration::from_secs(8));
    bot.on_timer(silence, &mut out);
    assert_eq!(
        bot.snap.job.as_ref().unwrap().done.as_deref(),
        Some("Server không trả lời khi cộng điểm tiềm năng")
    );
    bot.on_packet(10, &points_left(4), now, &mut out).unwrap();
    assert_eq!(bot.deadline(), None);
}

#[test]
fn an_answer_that_spends_no_potential_point_stops_the_plan_and_the_job_fights_on() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.on_packet(10, &points_left(0), now, &mut out).unwrap();
    bot.set_stats(Some(StatPlan::Weights([0, 0, 1, 0])), now, &mut out);
    bot.fight("Cóc Xanh", 3, 3, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    // Two points of a level up in the battle, spent once it is over.
    bot.on_packet(10, &points_left(2), now, &mut out).unwrap();
    bot.on_packet(19, &won_battle(), now, &mut out).unwrap();
    out.clear();
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert_eq!(out.last(), Some(&stat_point(2)));
    // The server answers with the points unchanged: one line, and the job's next battle instead of c2s/10 every 250 ms.
    out.clear();
    bot.on_packet(10, &points_left(2), now, &mut out).unwrap();
    assert_eq!(
        out,
        [Out::Log(
            LogKind::Character,
            "Server không cộng điểm tiềm năng (vẫn còn 2 điểm); thôi tự cộng điểm".into()
        )]
    );
    out.clear();
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert_eq!((sends(&out, 10), sends(&out, 15)), (0, 1), "{out:?}");
    // Points that come later are not spent either, until the plan is set again.
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    bot.on_packet(10, &points_left(3), now, &mut out).unwrap();
    bot.on_packet(19, &won_battle(), now, &mut out).unwrap();
    out.clear();
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert_eq!((sends(&out, 10), sends(&out, 15)), (0, 1), "{out:?}");
    bot.stop(false, now, &mut out);
    out.clear();
    bot.set_stats(Some(StatPlan::Weights([0, 0, 1, 0])), now, &mut out);
    assert_eq!(out.last(), Some(&stat_point(2)));
}

#[test]
fn auto_needs_the_element_and_the_stat_step_follows_the_plan() {
    let (mut bot, mut out, now, _) = coc_xanh_bot();
    bot.on_packet(10, &points_left(2), now, &mut out).unwrap();
    out.clear();
    bot.set_stats(Some(StatPlan::Auto), now, &mut out);
    assert!(out.contains(&Out::Log(
        LogKind::Character,
        "Chưa biết chỉ số chính của hệ này: không tự cộng điểm tiềm năng".into()
    )));
    assert!(!out.iter().any(|o| matches!(o, Out::Send(..))));
}

#[test]
fn stop_with_surrender_leaves_like_the_games_dau_hang_and_plays_on_without_an_answer() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    let uuid = battle::battle_setup(&setup).unwrap().uuid;
    bot.on_packet(39, &quest9(3, 14), now, &mut out).unwrap();
    bot.quest(1, Some((9, 3)), now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    let at = out.len();
    bot.stop(true, now, &mut out);
    assert_eq!(
        bot.snap.quest_run.as_ref().unwrap().done.as_deref(),
        Some("Đã dừng và đầu hàng trận đang đánh")
    );
    let sent: Vec<&Out> = out[at..]
        .iter()
        .filter(|o| matches!(o, Out::Send(..)))
        .collect();
    assert_eq!(
        sent,
        [
            // The zone stood in, and -1: this bot never got the s2c/11 of M2 (06-map-mobs.md#c2s-11).
            &Out::Send(11, Writer::new().string("M2").u8(0).i32(-1).build()),
            &Out::Send(40, Writer::new().string(&uuid).build()),
        ]
    );
    // The map answers that c2s/11: c2s/43 follows, as in the game, and the battle is not over until s2c/1214.
    let map = Writer::new()
        .u8(1)
        .string("M2")
        .string("Trại Vân Sơn")
        .u8(1)
        .i32(64)
        .i32(320)
        .build();
    bot.on_packet(11, &map, now, &mut out).unwrap();
    assert_eq!(
        out.last(),
        Some(&Out::Send(43, Writer::new().string("M2").build()))
    );
    assert!(bot.snapshot().battle.is_some());
    // A fight started while the surrender waits goes on once the battle is left.
    bot.fight("Cóc Xanh", 1, 1, now, &mut out);
    bot.on_packet(1214, &[], now, &mut out).unwrap();
    assert!(bot.snapshot().battle.is_none());
    assert!(out.contains(&Out::Log(LogKind::Battle, "Đã rời trận (s2c/1214)".into())));
    let next = bot.deadline().expect("next");
    bot.on_timer(next, &mut out);
    assert_eq!(
        out.last(),
        Some(&Out::Send(
            15,
            Writer::new().string("mob61000").u8(1).build()
        ))
    );

    // Unanswered: the mob's turn that came meanwhile is played after 8 s (c2s/14 with its seq), and a late s2c/1214
    // still ends the battle, since the server took the surrender after all.
    let all = v();
    let mob_turn = all["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["fn"] == "turnState" && d["expected"]["playerTurn"] == json!(0))
        .unwrap()
        .clone();
    let seq = mob_turn["expected"]["seq"].as_i64().unwrap() as i32;
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.fight("Cóc Xanh", 1, 1, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    bot.stop(true, now, &mut out);
    assert!(bot.snapshot().battle.unwrap().leaving);
    bot.on_packet(24, &hex(mob_turn["hex"].as_str().unwrap()), now, &mut out)
        .unwrap();
    assert_eq!(sends(&out, 14), 0);
    let later = bot.deadline().expect("leave wait");
    assert_eq!(later - now, Duration::from_secs(8));
    bot.on_timer(later, &mut out);
    assert!(out.contains(&Out::Log(
        LogKind::Battle,
        "Server chưa nhận đầu hàng sau 8 s; đánh tiếp trận".into()
    )));
    assert_eq!(
        out.last(),
        Some(&Out::Send(14, Writer::new().string(&uuid).i32(seq).build()))
    );
    assert!(!bot.snapshot().battle.unwrap().leaving);
    bot.on_packet(1214, &[], now, &mut out).unwrap();
    assert!(bot.snapshot().battle.is_none());
}

fn sent(out: &[Out], op: i32) -> Option<String> {
    out.iter().find_map(|o| match o {
        Out::Send(o, p) if *o == op => Some(tohex(p)),
        _ => None,
    })
}
/// The head of s2c/11 for `map_id` in `zone`; its NPCs and portals do not read, which leaves the atlas as it is.
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

#[test]
fn khu_vuc_lists_the_zones_and_c2s_1173_follows_s2c_13_to_the_map_and_mobs_of_that_zone() {
    let (mut bot, mut out, now, _) = coc_xanh_bot();
    // M2 loaded at the login, as in every session.
    bot.on_packet(11, &map_head("M2", "Trại Vân Sơn", 0), now, &mut out)
        .unwrap();
    out.clear();
    bot.list_zones(&mut out);
    assert_eq!(sent(&out, 1172).as_deref(), Some(""));
    // Zone 0 with 16 of 20 (where the character is), 4 empty, 5 full.
    let zones = Writer::new()
        .u8(3)
        .u8(0)
        .u8(2)
        .u8(16)
        .u8(20)
        .u8(4)
        .u8(0)
        .u8(0)
        .u8(20)
        .u8(5)
        .u8(2)
        .u8(20)
        .u8(20)
        .build();
    bot.on_packet(1172, &zones, now, &mut out).unwrap();
    assert_eq!(bot.snapshot().zones.map(|z| z.len()), Some(3));
    for (zone, why) in [
        (0, "đang ở khu 0"),
        (7, "không có khu 7"),
        (5, "khu đã đầy (20/20)"),
    ] {
        out.clear();
        bot.change_zone(zone, now, &mut out);
        assert!(
            logged(&out, &format!("Chưa sang khu {zone}: {why}")),
            "{out:?}"
        );
        assert_eq!(sends(&out, 1173), 0);
    }
    out.clear();
    bot.change_zone(4, now, &mut out);
    assert_eq!(sent(&out, 1173).as_deref(), Some("04"));
    assert_eq!(bot.snapshot().moving.as_deref(), Some("Sang khu 4"));
    bot.fight("Cóc Xanh", 1, 1, now, &mut out);
    assert!(logged(&out, "Đang đổi chỗ: đợi tới nơi rồi mới đánh quái"));
    // Z1: s2c/13 in the long form with the zone last, then c2s/11 of zone 4 with the index of M2 (1, loaded since the
    // login), as the game 1.1.1 asks it ("M11" 01 0000000a).
    out.clear();
    bot.on_packet(13, &hex("000000024d32000000010004"), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 11).as_deref(), Some("000000024d320400000001"));
    out.clear();
    bot.on_packet(11, &map_head("M2", "Trại Vân Sơn", 4), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 43).as_deref(), Some("000000024d32"));
    assert_eq!(bot.snapshot().zones, None);
    out.clear();
    bot.on_packet(43, &mobs_of("M2"), now, &mut out).unwrap();
    assert!(logged(&out, "Đã sang khu 4 của Trại Vân Sơn: 1 con quái"));
    let s = bot.snapshot();
    assert_eq!((s.zone, s.moving, bot.deadline()), (4, None, None));
    // Unanswered, the change is let go after 8 s.
    out.clear();
    bot.change_zone(0, now, &mut out);
    bot.on_timer(now + Duration::from_secs(8), &mut out);
    assert!(logged(&out, "Server không trả lời khi sang khu 0 sau 8 s"));
    assert_eq!(bot.snapshot().moving, None);
}

#[test]
fn doi_map_walks_the_portals_of_the_atlas_and_ends_on_the_map_or_when_no_way_is_left() {
    let atlas = Atlas::load(&find_upwards("data/maps.json").expect("data/maps.json"));
    let (mut bot, mut out, now) = (
        Bot::new(BotOptions::default(), Arc::new(atlas)),
        vec![],
        Instant::now(),
    );
    bot.on_packet(
        29,
        &Writer::new().string("manina").string("M2").i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    let choice = |bot: &Bot, id: &str| {
        bot.snapshot()
            .maps
            .into_iter()
            .find(|m| m.map_id == id)
            .map(|m| (m.hops, m.need))
    };
    // Level not known yet (no s2c/10): no map is left out for it, Cửu Phong three portals away behind Hồng Giang.
    assert_eq!(choice(&bot, "M10"), Some((Some(3), None)));
    // The kinds of mobs and bosses of each map, for the Tự đánh list of a zone without any: none in Rìa Hồng Giang.
    let mobs = |bot: &Bot, id: &str| {
        let m = bot
            .snapshot()
            .maps
            .into_iter()
            .find(|m| m.map_id == id)
            .unwrap();
        m.mobs
            .iter()
            .map(|k| (k.name.clone(), k.level, k.boss))
            .collect::<Vec<_>>()
    };
    assert!(mobs(&bot, "M25").is_empty());
    let m4 = mobs(&bot, "M4");
    assert!(m4.contains(&("Huyết Lang".into(), 40, false)), "{m4:?}");
    assert!(m4.contains(&("Tướng Xích Vũ".into(), 35, true)), "{m4:?}");
    // s2c/10 kind 2: level 22.
    let level = (0..10).fold(Writer::new().i32(2).string("manina").i32(22), |w, _| {
        w.i32(0)
    });
    bot.on_packet(10, &level.build(), now, &mut out).unwrap();
    // From M2: M1 and M25 one portal away, Hồng Giang two. Cửu Phong is shown 30 on the world map and Lạc Cốc's portal
    // asked for 40 (S1, kept when a level 42 went through in S2): no way to either.
    assert_eq!(
        ["M2", "M1", "M25", "M4", "M10", "M5"].map(|id| choice(&bot, id)),
        [
            Some((Some(0), None)),
            Some((Some(1), None)),
            Some((Some(1), None)),
            Some((Some(2), None)),
            Some((None, Some(30))),
            Some((None, Some(40)))
        ]
    );
    bot.go_to("M2", now, &mut out);
    assert!(logged(&out, "Chưa đi tới Trại Vân Sơn: đang ở map này"));
    bot.go_to("M10", now, &mut out);
    assert!(logged(&out, "Chưa đi tới Cửu Phong: cần cấp 30"));
    out.clear();
    bot.go_to("M1", now, &mut out);
    // c2s/13 (M2, portal 1014 Làng Thanh Khê), then the map the portal led to.
    let portal = Writer::new().string("M2").i32(1014).build();
    assert_eq!(sent(&out, 13), Some(tohex(&portal)));
    assert_eq!(
        bot.snapshot().moving.as_deref(),
        Some("Đi tới Làng Thanh Khê")
    );
    let through = Writer::new().string("M1").i32(0).u8(0).u8(0xff).build();
    out.clear();
    bot.on_packet(13, &through, now, &mut out).unwrap();
    assert_eq!(sent(&out, 11).as_deref(), Some("000000024d31ffffffffff"));
    bot.on_packet(11, &map_head("M1", "Làng Thanh Khê", 0), now, &mut out)
        .unwrap();
    bot.on_packet(43, &mobs_of("M1"), now, &mut out).unwrap();
    assert!(logged(
        &out,
        "Đã tới Làng Thanh Khê qua cổng Làng Thanh Khê"
    ));
    out.clear();
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert!(logged(&out, "Kết thúc: đã tới Làng Thanh Khê"), "{out:?}");
    assert_eq!(bot.snapshot().moving, None);
    // M25 is two portals away (Vân Sơn, then Rìa Hồng Giang); the server refuses the first one.
    out.clear();
    bot.go_to("M25", now, &mut out);
    let portal = Writer::new().string("M1").i32(1015).build();
    assert_eq!(sent(&out, 13), Some(tohex(&portal)));
    let refusal = Writer::new()
        .u8(1)
        .string("Bạn cần hoàn thành nhiệm vụ trước khi tới đây")
        .build();
    bot.on_packet(1256, &refusal, now, &mut out).unwrap();
    out.clear();
    bot.on_timer(bot.deadline().unwrap(), &mut out);
    assert!(
        logged(&out, "Kết thúc: không còn đường tới Rìa Hồng Giang"),
        "{out:?}"
    );
    assert_eq!((bot.snapshot().moving, bot.deadline()), (None, None));
}

#[test]
fn mua_xong_quay_ve_cho_cu_walks_back_to_the_map_and_zone_the_shop_trip_started_from() {
    let atlas = Atlas::load(&find_upwards("data/maps.json").expect("data/maps.json"));
    let (mut bot, mut out, now) = (
        Bot::new(BotOptions::default(), Arc::new(atlas)),
        vec![],
        Instant::now(),
    );
    // Through a portal and its map: s2c/13, the head of s2c/11 in `zone`, s2c/43, then the timer that ends the trip.
    let arrive = |bot: &mut Bot, out: &mut Vec<Out>, map_id: &str, name: &str, zone: u8| {
        let through = Writer::new().string(map_id).i32(0).u8(0).u8(0xff).build();
        bot.on_packet(13, &through, now, out).unwrap();
        bot.on_packet(11, &map_head(map_id, name, zone), now, out)
            .unwrap();
        bot.on_packet(43, &mobs_of(map_id), now, out).unwrap();
        bot.on_timer(bot.deadline().unwrap(), out);
    };
    bot.on_packet(11, &map_head("M2", "Trại Vân Sơn", 3), now, &mut out)
        .unwrap();
    out.clear();
    bot.go_to_shop(true, now, &mut out);
    assert!(
        logged(&out, "Mua xong sẽ quay về Trại Vân Sơn khu 3"),
        "{out:?}"
    );
    let portal = Writer::new().string("M2").i32(1014).build();
    assert_eq!(sent(&out, 13), Some(tohex(&portal)));
    assert_eq!(
        bot.snapshot().back_to.as_deref(),
        Some("Trại Vân Sơn khu 3")
    );
    out.clear();
    arrive(&mut bot, &mut out, "M1", "Làng Thanh Khê", 0);
    assert!(logged(&out, "Kết thúc: đã tới Làng Thanh Khê"), "{out:?}");
    // Still shopping: nothing until the dialog is closed.
    assert_eq!(sent(&out, 13), None);
    out.clear();
    bot.shop_closed(now, &mut out);
    assert!(
        logged(&out, "Quay về Trại Vân Sơn khu 3 sau khi mua"),
        "{out:?}"
    );
    let portal = Writer::new().string("M1").i32(1015).build();
    assert_eq!(sent(&out, 13), Some(tohex(&portal)));
    assert_eq!(bot.snapshot().back_to, None);
    // On M2 again, in zone 0 as a portal puts it: c2s/1173 back to zone 3, as the Khu vực panel does.
    out.clear();
    arrive(&mut bot, &mut out, "M2", "Trại Vân Sơn", 0);
    assert!(logged(&out, "Kết thúc: đã tới Trại Vân Sơn"), "{out:?}");
    assert_eq!(sent(&out, 1173).as_deref(), Some("03"));
    assert_eq!(bot.snapshot().moving.as_deref(), Some("Sang khu 3"));

    // Closed while the trip to the shop is under way: the bot goes back once it got there.
    let (mut bot, mut out) = (
        Bot::new(
            BotOptions::default(),
            Arc::new(Atlas::load(&find_upwards("data/maps.json").unwrap())),
        ),
        vec![],
    );
    bot.on_packet(11, &map_head("M2", "Trại Vân Sơn", 0), now, &mut out)
        .unwrap();
    bot.go_to_shop(true, now, &mut out);
    out.clear();
    bot.shop_closed(now, &mut out);
    assert!(out.is_empty(), "{out:?}");
    arrive(&mut bot, &mut out, "M1", "Làng Thanh Khê", 0);
    assert!(
        logged(&out, "Quay về Trại Vân Sơn khu 0 sau khi mua"),
        "{out:?}"
    );
    out.clear();
    arrive(&mut bot, &mut out, "M2", "Trại Vân Sơn", 0);
    assert!(logged(&out, "Kết thúc: đã tới Trại Vân Sơn"), "{out:?}");
    assert_eq!(sent(&out, 1173), None, "already in its zone");

    // With the box off nothing is kept, and closing the dialog sends nothing.
    let (mut bot, mut out) = (
        Bot::new(
            BotOptions::default(),
            Arc::new(Atlas::load(&find_upwards("data/maps.json").unwrap())),
        ),
        vec![],
    );
    bot.on_packet(11, &map_head("M2", "Trại Vân Sơn", 0), now, &mut out)
        .unwrap();
    bot.go_to_shop(false, now, &mut out);
    assert!(!logged(&out, "Mua xong sẽ quay về"), "{out:?}");
    arrive(&mut bot, &mut out, "M1", "Làng Thanh Khê", 0);
    out.clear();
    bot.shop_closed(now, &mut out);
    assert!(out.is_empty(), "{out:?}");
    assert_eq!(bot.snapshot().back_to, None);
}

fn records(out: &[Out]) -> Vec<BattleRecord> {
    out.iter()
        .filter_map(|o| match o {
            Out::Battle(r) => Some(r.as_ref().clone()),
            _ => None,
        })
        .collect()
}

#[test]
fn every_battle_that_ends_leaves_a_record_for_the_history_of_the_account() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    let opened = battle::battle_setup(&setup).unwrap();
    bot.fight("Cóc Xanh", 5, 3, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    out.clear();
    bot.on_packet(19, &won_battle(), now + Duration::from_secs(30), &mut out)
        .unwrap();
    let r = records(&out);
    assert_eq!(r.len(), 1, "{out:?}");
    let r = &r[0];
    assert_eq!(
        (r.mob_id.as_str(), r.mob_name.as_str(), r.mob_level, r.boss),
        ("mob61000", "Cóc Xanh", 13, false)
    );
    assert_eq!(
        (r.source, r.result, r.map_id.as_str(), r.hp_before),
        (BattleSource::Fight, BattleResult::Won, "M2", opened.hp)
    );
    assert!(r.started_at > 0 && r.ended_at >= r.started_at);
    assert!(out
        .iter()
        .any(|o| matches!(o, Out::Log(LogKind::Battle, t) if t.starts_with("Trận 1: thắng"))));

    // A quest step's battle, left with Đầu hàng: result Left, no EXP.
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.on_packet(39, &quest9(3, 14), now, &mut out).unwrap();
    bot.quest(1, Some((9, 3)), now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    bot.stop(true, now, &mut out);
    out.clear();
    bot.on_packet(1214, &[], now, &mut out).unwrap();
    let r = records(&out);
    assert_eq!(
        r.iter()
            .map(|r| (r.source, r.result, r.exp, r.mob_name.as_str()))
            .collect::<Vec<_>>(),
        [(BattleSource::Quest, BattleResult::Left, 0, "Cóc Xanh")]
    );
}

/// Lái Buôn's menu (s2c/57) and Dược phẩm shop (s2c/1190) of P5, as npcMenu and shopList of src/protocol/world.ts read them.
const LAI_BUON_MENU: &str = "000000030000000a4cc3a169204275c3b46e00000030e1bb9e206368e1bb972074612063c3b32072e1baa574206e6869e1bb8175206dc3b36e20c491e1bb932074e1bb91742e000000000856c5a9206b68c3ad010000000e44c6b0e1bba363207068e1baa96d020000001643e1bbad612068c3a06e67205b4cc6b0e1bba36e675d";
const LAI_BUON_SHOP: &str = "060000000c56e1baad74205068e1baa96d000000080000000000000000000000006dffffffff0000000101ff000000000000000000000000000100000001000000006dffffffff0000000101ff0000000000000000000000000002000000020000000049ffffffff0000000101ff0000000000000000000000000004000000000100000078ffffffff0000000100ff0000000000000000000000000005000000010100000078ffffffff0000000100ff0000000000000000000000000006000000020100000050ffffffff0000000100ff000000000000000000000000019f000000100000000fa0ffffffff0000000101ff00000000000000000000000001e70000001500000001f4ffffffff0000000101ff00000000000000000000";

#[test]
fn lai_buon_s_menu_and_shop_read_as_the_ts_decoders_read_them() {
    let menu = world::npc_menu(&hex(LAI_BUON_MENU)).unwrap();
    assert_eq!(
        (menu.npc.as_str(), menu.text.as_str()),
        ("Lái Buôn", "Ở chỗ ta có rất nhiều món đồ tốt.")
    );
    assert_eq!(
        menu.options,
        [
            (0, "Vũ khí".to_string()),
            (1, "Dược phẩm".to_string()),
            (2, "Cửa hàng [Lượng]".to_string())
        ]
    );
    let shop = world::shop_list(&hex(LAI_BUON_SHOP)).unwrap();
    assert_eq!((shop.kind, shop.title.as_str()), (6, "Vật Phẩm"));
    let lines: Vec<_> = shop
        .items
        .iter()
        .map(|i| (i.shop_id, i.item_id, i.currency, i.price))
        .collect();
    assert_eq!(
        lines,
        [
            (0, 0, 0, 109),
            (1, 1, 0, 109),
            (2, 2, 0, 73),
            (4, 0, 1, 120),
            (5, 1, 1, 120),
            (6, 2, 1, 80),
            (415, 16, 0, 4000),
            (487, 21, 0, 500)
        ]
    );
    // c2s/57 and c2s/1190 as buildRequest builds them (P5: Dược phẩm; slot 0, then slot 4).
    let ctx = |option, shop_id| Ctx {
        option,
        shop_id,
        map_id: Some("M1"),
        npc_id: Some(106),
        quantity: Some(1),
        ..Ctx::default()
    };
    assert_eq!(
        tohex(&build(57, &ctx(Some(1), None)).unwrap()),
        "01000000024d310000006a"
    );
    assert_eq!(
        tohex(&build(1190, &ctx(None, Some(0))).unwrap()),
        "000000000000000001"
    );
    assert_eq!(
        tohex(&build(1190, &ctx(None, Some(4))).unwrap()),
        "000000000400000001"
    );
}

/// B1 (manina, 31/10): Lái Buôn answers c2s/13 anywhere on M1 and "Không thể thực hiện" from another map; the purchase
/// of 1 Búa Sửa Chữa for 80 Xu khóa sent c2s/1190 (0, 6, 1) and got "Bạn vừa mua thành công! 1 Búa Sửa Chữa".
#[test]
fn the_shop_opens_on_m1_and_buys_a_line_the_money_pays_for() {
    let (mut bot, mut out, now, _) = coc_xanh_bot();
    out.clear();
    bot.open_shop(now, &mut out);
    assert!(
        logged(
            &out,
            "Chưa mở cửa hàng: Lái Buôn ở Làng Thanh Khê (M1), hãy sang M1 trước"
        ),
        "{out:?}"
    );
    assert_eq!(sends(&out, 13), 0);
    // On M1 (zone 1) with B1's money: 500 Xu, 8517 Xu khóa.
    bot.on_packet(13, &hex("000000024d31000000010001"), now, &mut out)
        .unwrap();
    let money = hex(concat!(
        "00000009757064617465205875",
        "00000000000001f4",
        "0000000000002145",
        "0000000000000000"
    ));
    bot.on_packet(46, &money, now, &mut out).unwrap();
    out.clear();
    bot.buy(6, 1, now, &mut out);
    assert!(logged(&out, "Chưa mua ô 6: mở cửa hàng trước"), "{out:?}");
    // A menu that comes unasked opens nothing.
    bot.on_packet(57, &hex(LAI_BUON_MENU), now, &mut out)
        .unwrap();
    assert_eq!(sends(&out, 57), 0);
    bot.open_shop(now, &mut out);
    assert!(logged(&out, "Mở cửa hàng Lái Buôn (Dược phẩm)"));
    assert_eq!(sent(&out, 13).as_deref(), Some("000000024d310000006a"));
    bot.open_shop(now, &mut out);
    assert!(logged(&out, "Chưa mở cửa hàng: đang đợi Lái Buôn trả lời"));
    out.clear();
    bot.on_packet(57, &hex(LAI_BUON_MENU), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 57).as_deref(), Some("01000000024d310000006a"));
    out.clear();
    bot.on_packet(1190, &hex(LAI_BUON_SHOP), now, &mut out)
        .unwrap();
    assert!(logged(&out, "Cửa hàng Lái Buôn: 8 món"), "{out:?}");
    assert_eq!(bot.snapshot().shop.map(|s| s.items.len()), Some(8));
    assert_eq!(bot.deadline(), None);
    for (shop_id, quantity, why) in [
        (3, 1, "Chưa mua ô 3: cửa hàng không có ô này"),
        (6, 0, "Chưa mua Búa Sửa Chữa: số lượng phải từ 1 trở lên"),
        // No upper bound on the count: 200 is refused for the money only.
        (
            6,
            200,
            "Chưa mua Búa Sửa Chữa: không đủ Xu khóa (cần 16000, có 8517)",
        ),
        (2, 7, "Chưa mua Búa Sửa Chữa: không đủ Xu (cần 511, có 500)"),
    ] {
        out.clear();
        bot.buy(shop_id, quantity, now, &mut out);
        assert!(logged(&out, why), "{out:?}");
        assert_eq!(sends(&out, 1190), 0);
    }
    out.clear();
    bot.buy(6, 1, now, &mut out);
    assert!(logged(&out, "Mua 1 Búa Sửa Chữa giá 80 Xu khóa"), "{out:?}");
    assert_eq!(sent(&out, 1190).as_deref(), Some("000000000600000001"));
    bot.buy(6, 1, now, &mut out);
    assert!(logged(
        &out,
        "Chưa mua Búa Sửa Chữa: đang đợi Lái Buôn trả lời"
    ));
    assert_eq!(sends(&out, 1190), 1);
    out.clear();
    let bought = Writer::new()
        .u8(1)
        .string("Bạn vừa mua thành công! 1 Búa Sửa Chữa")
        .build();
    bot.on_packet(1256, &bought, now, &mut out).unwrap();
    assert!(
        logged(&out, "Đã mua 1 Búa Sửa Chữa (80 Xu khóa)"),
        "{out:?}"
    );
    // Refused by the server, or unanswered for 8 s.
    out.clear();
    bot.buy(2, 1, now, &mut out);
    let short = Writer::new()
        .u8(1)
        .string("Không đủ Xu để thực hiện")
        .build();
    bot.on_packet(1256, &short, now, &mut out).unwrap();
    assert!(logged(
        &out,
        "Chưa mua được Búa Sửa Chữa: Không đủ Xu để thực hiện"
    ));
    out.clear();
    bot.open_shop(now, &mut out);
    bot.on_timer(now + Duration::from_secs(8), &mut out);
    assert!(logged(&out, "Lái Buôn không trả lời sau 8 s"), "{out:?}");
    bot.open_shop(now, &mut out);
    let refused = Writer::new().u8(1).string("Không thể thực hiện").build();
    bot.on_packet(1256, &refused, now, &mut out).unwrap();
    assert!(logged(
        &out,
        "Không mở được cửa hàng Lái Buôn: Không thể thực hiện"
    ));
    // Leaving M1 closes the shop.
    bot.on_packet(13, &hex("000000024d32000000010000"), now, &mut out)
        .unwrap();
    assert_eq!(bot.snapshot().shop, None);
}

#[test]
fn s2c_36_reads_the_durability_of_the_8_gear_slots_as_gear_durability_does() {
    // B1 (the hat alone at 49), G2 (hat, armour, broken weapon) and Q2's 20 bytes (05-battle.md#s2c-36).
    let b1 = items::gear_durability(&hex("000000080000000031ffffffffffffff")).unwrap();
    assert_eq!(b1, [Some(49), None, None, None, None, None, None, None]);
    let g2 = items::gear_durability(&hex(concat!(
        "00000008",
        "0000000037",
        "010000003c",
        "0200000000",
        "ffffffffff"
    )))
    .unwrap();
    assert_eq!(
        g2,
        [Some(55), Some(60), Some(0), None, None, None, None, None]
    );
    let q2 = items::gear_durability(&hex("000000080000000027ff0200000032ffffffffff")).unwrap();
    assert_eq!(q2, [Some(39), None, Some(50), None, None, None, None, None]);
    assert!(items::gear_durability(&hex("000000080000000031ffffffffff")).is_err());
}

/// The gear of s2c/9 (Nón Âu Lạc and Rìu Âu Lạc both at 0/60) and the bag of s2c/42 (one Búa Sửa Chữa), from the
/// vectors, on the Cóc Xanh bot.
fn broken_gear_bot(fight: FightSettings) -> (Bot, Vec<Out>, Instant, Vec<u8>) {
    let all = v();
    let cases = all["decoders"].as_array().unwrap();
    let hex_of = |f: &str| {
        hex(cases.iter().find(|c| c["fn"] == f).unwrap()["hex"]
            .as_str()
            .unwrap())
    };
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.set_fight(fight, now, &mut out);
    bot.on_packet(9, &hex_of("characterGear"), now, &mut out)
        .unwrap();
    bot.on_packet(42, &hex_of("characterExtra"), now, &mut out)
        .unwrap();
    (bot, out, now, setup)
}

#[test]
fn tu_sua_do_repairs_broken_gear_with_the_hammers_of_the_bag_before_the_next_battle() {
    // Off: the job challenges at once, broken gear or not.
    let (mut bot, mut out, now, _) = broken_gear_bot(FightSettings::default());
    out.clear();
    bot.fight("Cóc Xanh", 1, 1, now, &mut out);
    assert_eq!((sends(&out, 48), sends(&out, 15)), (0, 1), "{out:?}");
    // On, but Sửa was just pressed by hand: that answer is awaited, the job does not send a second repair.
    let (mut bot, mut out, now, _) = broken_gear_bot(FightSettings {
        repair: true,
        ..FightSettings::default()
    });
    bot.item(ItemAct::Repair(2), now, &mut out);
    out.clear();
    bot.fight("Cóc Xanh", 1, 1, now, &mut out);
    assert_eq!((sends(&out, 48), sends(&out, 15)), (0, 1), "{out:?}");

    let (mut bot, mut out, now, setup) = broken_gear_bot(FightSettings {
        repair: true,
        ..FightSettings::default()
    });
    assert!(logged(&out, "Bật tự sửa đồ"), "{out:?}");
    out.clear();
    bot.fight("Cóc Xanh", 1, 1, now, &mut out);
    // The hat first (c2s/48 00 00000000, as on the phone), with the one hammer; no challenge yet.
    assert!(
        logged(
            &out,
            "Tự sửa Nón Âu Lạc (độ bền 0/60, ô trang bị 0); còn 0 búa sau lần này"
        ),
        "{out:?}"
    );
    assert_eq!(sent(&out, 48).as_deref(), Some("0000000000"));
    assert_eq!(sends(&out, 15), 0);
    assert_eq!(bot.deadline(), Some(now + Duration::from_secs(5)));
    // The hand buttons wait for it as for one of theirs.
    out.clear();
    bot.item(ItemAct::Repair(2), now, &mut out);
    assert_eq!(sends(&out, 48), 0);
    // s2c/1187 (the hammer gone), then s2c/48: repaired, and the job goes on half a second later.
    let all = v();
    let cases = all["decoders"].as_array().unwrap();
    let bag = hex(
        cases.iter().find(|c| c["fn"] == "inventory").unwrap()["hex"]
            .as_str()
            .unwrap(),
    );
    bot.on_packet(1187, &bag, now, &mut out).unwrap();
    out.clear();
    bot.on_packet(48, &hex("0000000000"), now, &mut out)
        .unwrap();
    assert!(logged(&out, "Đã sửa Nón Âu Lạc"), "{out:?}");
    assert_eq!(
        bot.snapshot().gear[0].as_ref().map(|i| i.durability),
        Some(60)
    );
    let at = bot.deadline().unwrap();
    assert_eq!(at, now + Duration::from_millis(500));
    // The weapon is broken too, and no hammer is left: said once, and the battle goes ahead.
    out.clear();
    bot.on_timer(at, &mut out);
    assert!(
        logged(
            &out,
            "Rìu Âu Lạc đang hỏng (độ bền 0/60) nhưng túi hết Búa Sửa Chữa: đánh tiếp với món hỏng"
        ),
        "{out:?}"
    );
    assert_eq!((sends(&out, 48), sends(&out, 15)), (0, 1));
    bot.on_packet(22, &setup, at, &mut out).unwrap();
    out.clear();
    bot.on_packet(19, &won_battle(), at, &mut out).unwrap();
    // s2c/36 after the battle: the hat worn down to 0 this time, the weapon still at 0.
    bot.on_packet(
        36,
        &hex("000000080000000000ff0200000000ffffffffff"),
        at,
        &mut out,
    )
    .unwrap();
    assert!(logged(&out, "Nón Âu Lạc đã hỏng (độ bền 0/60)"), "{out:?}");
    assert!(!logged(&out, "Rìu Âu Lạc đã hỏng"));
    let gear = bot.snapshot().gear;
    assert_eq!(
        (
            gear[0].as_ref().map(|i| i.durability),
            gear[2].as_ref().map(|i| i.durability)
        ),
        (Some(0), Some(0))
    );

    // A new job with a hammer again: the server refuses the hat ("Không thể thực hiện"), the weapon goes unanswered;
    // each is left for the rest of the run and the job goes on.
    bot.on_packet(
        42,
        &hex(
            cases.iter().find(|c| c["fn"] == "characterExtra").unwrap()["hex"]
                .as_str()
                .unwrap(),
        ),
        at,
        &mut out,
    )
    .unwrap();
    let mut t = at + Duration::from_secs(10);
    out.clear();
    bot.fight("Cóc Xanh", 1, 1, t, &mut out);
    assert_eq!(sent(&out, 48).as_deref(), Some("0000000000"));
    out.clear();
    let refused = Writer::new().u8(1).string("Không thể thực hiện").build();
    bot.on_packet(1256, &refused, t, &mut out).unwrap();
    assert!(
        logged(
            &out,
            "Không sửa được Nón Âu Lạc: Không thể thực hiện; đánh tiếp với món hỏng"
        ),
        "{out:?}"
    );
    t = bot.deadline().unwrap();
    out.clear();
    bot.on_timer(t, &mut out);
    assert_eq!(sent(&out, 48).as_deref(), Some("0000000002"), "{out:?}");
    t = bot.deadline().unwrap();
    out.clear();
    bot.on_timer(t, &mut out);
    assert!(
        logged(
            &out,
            "Server không trả lời khi sửa Rìu Âu Lạc sau 5 s; đánh tiếp với món hỏng"
        ),
        "{out:?}"
    );
    assert_eq!((sends(&out, 48), sends(&out, 15)), (0, 1));

    // Turned off from the UI.
    out.clear();
    bot.set_fight(FightSettings::default(), now, &mut out);
    assert!(logged(&out, "Tắt tự sửa đồ"));
}

/// The last battle of a fight job ends it before its drops are picked up: they still count in that job. Answers that come
/// out of order go to the item they name.
#[test]
fn tu_nhat_do_counts_the_drops_of_the_last_battle_in_the_job_it_ended() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.fight("Cóc Xanh", 1, 1, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    let end = now + Duration::from_secs(1);
    bot.on_packet(1182, &drop_packet("stone", 412, 1), end, &mut out)
        .unwrap();
    bot.on_packet(1182, &drop_packet("gold", 41, 80), end, &mut out)
        .unwrap();
    bot.on_packet(1182, &drop_packet("more-gold", 41, 40), end, &mut out)
        .unwrap();
    bot.on_packet(19, &won_battle(), end, &mut out).unwrap();
    // As the server ends every battle (05-battle): the battle data goes out with it.
    bot.on_packet(1214, &[], end, &mut out).unwrap();
    assert!(bot.snapshot().job.unwrap().done.is_some());
    for i in 1..3 {
        bot.on_timer(end + Duration::from_millis(200) * i, &mut out);
    }
    assert_eq!(sends(&out, 1188), 3, "{out:?}");
    let notice = |text: &str| Writer::new().u8(0).string(text).build();
    out.clear();
    let at = end + Duration::from_millis(500);
    for text in [
        "Bạn vừa nhận được 40 Xu khóa",
        "Bạn vừa nhận được Đá cấp 2",
        "Bạn vừa nhận được 80 Xu khóa",
    ] {
        bot.on_packet(1256, &notice(text), at, &mut out).unwrap();
    }
    let picked: Vec<(i32, i64)> = out
        .iter()
        .filter_map(|o| match o {
            Out::Pickup(p) => Some((p.item.item_id, p.item.quantity)),
            _ => None,
        })
        .collect();
    assert_eq!(picked, [(41, 40), (412, 1), (41, 80)]);
    assert_eq!(out.len(), 3, "{out:?}");
    assert_eq!(
        bot.snapshot().job.unwrap().picked,
        [Picked::of(41, 120), Picked::of(412, 1),]
    );
}

/// s2c/1182 of an item fallen in M1, as the server writes it (13-drops-items.md#đồ-trên-đất).
fn drop_packet(uuid: &str, item_id: i32, quantity: i32) -> Vec<u8> {
    drop_in("M1", uuid, item_id, quantity, 0xff)
}
/// drop_packet in `map`, of element `element` (0xff for an item that is not gear).
fn drop_in(map: &str, uuid: &str, item_id: i32, quantity: i32, element: u8) -> Vec<u8> {
    Writer::new()
        .string(map)
        .u8(0xfe)
        .i32(item_id)
        .string(uuid)
        .i32(0)
        .i32(-1)
        .i32(quantity)
        .u8(0)
        .u8(element)
        .i32(0)
        .u8(0)
        .u8(0)
        .u8(0)
        .i32(1400)
        .i32(640)
        .i32(417)
        .i32(0)
        .build()
}

/// Tự nhặt đồ (13-drops-items.md#g2), on by default: after a won battle the bot sends c2s/1188 for the items fallen within
/// 300 ms of its end, before it or after, one every 200 ms; a stranger's older item, a lost battle, or the setting off
/// pick nothing. What was picked up goes to the history and to the job (no log line: the app shows it under the battle's),
/// a refusal is a Vật phẩm line, s2c/51 puts the item in the bag.
#[test]
fn tu_nhat_do_picks_up_the_own_drops_of_a_won_battle_one_every_200_ms() {
    let all = v();
    let cases = all["decoders"].as_array().unwrap();
    let hex_of = |f: &str, n: usize| {
        hex(cases.iter().filter(|c| c["fn"] == f).nth(n).unwrap()["hex"]
            .as_str()
            .unwrap())
    };
    let (gold, ring) = (hex_of("groundItemAdd", 0), hex_of("groundItemAdd", 1));
    let gold_uuid = "f573bf90-942b-48d1-b466-4552dfa4f7cb";
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    assert!(FightSettings::default().pickup);
    bot.on_packet(42, &hex_of("characterExtra", 0), now, &mut out)
        .unwrap();
    bot.fight("Cóc Xanh", 3, 3, now, &mut out);
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    // A stranger's item a second before the end, then the Xu khóa of G2 in the same read as the won end.
    bot.on_packet(1182, &drop_packet("stranger", 412, 1), now, &mut out)
        .unwrap();
    let end = now + Duration::from_secs(1);
    bot.on_packet(1182, &gold, end, &mut out).unwrap();
    out.clear();
    bot.on_packet(19, &won_battle(), end, &mut out).unwrap();
    // As the server ends every battle (05-battle): the battle data goes out with it.
    bot.on_packet(1214, &[], end, &mut out).unwrap();
    let request = |uuid: &str| tohex(&Writer::new().string(uuid).build());
    assert_eq!(sends(&out, 1188), 1, "{out:?}");
    assert_eq!(sent(&out, 1188), Some(request(gold_uuid)));
    assert!(!logged(&out, "Nhặt"), "{out:?}");
    let battle = out
        .iter()
        .find_map(|o| match o {
            Out::Battle(r) => Some(r.as_ref().clone()),
            _ => None,
        })
        .unwrap();
    // The ring comes 100 ms after the end: picked too, 200 ms after the first; one 400 ms after is not.
    out.clear();
    bot.on_packet(1182, &ring, end + Duration::from_millis(100), &mut out)
        .unwrap();
    assert_eq!(sends(&out, 1188), 0);
    let gap = bot.deadline().unwrap();
    assert_eq!(gap, end + Duration::from_millis(200));
    bot.on_timer(gap, &mut out);
    assert_eq!(
        sent(&out, 1188),
        Some(request("fdcdeddb-5213-4b53-b67b-8a82ed08815d"))
    );
    out.clear();
    bot.on_packet(
        1182,
        &drop_packet("late", 41, 50),
        end + Duration::from_millis(400),
        &mut out,
    )
    .unwrap();
    bot.on_timer(end + Duration::from_millis(400), &mut out);
    assert_eq!(sends(&out, 1188), 0, "{out:?}");
    // The answers: the Xu khóa received goes to the history and to the job, the refusal is a Vật phẩm line. 2 s later a
    // notice is the server's again.
    let notice = |text: &str| Writer::new().u8(0).string(text).build();
    out.clear();
    let at = end + Duration::from_millis(230);
    bot.on_packet(1256, &notice("Bạn vừa nhận được 123 Xu khóa"), at, &mut out)
        .unwrap();
    bot.on_packet(
        1256,
        &notice("Không thể nhặt vật phẩm của người khác"),
        at,
        &mut out,
    )
    .unwrap();
    let gold_item = Picked::of(41, 123);
    let Out::Pickup(record) = &out[0] else {
        panic!("{out:?}")
    };
    assert_eq!(
        (
            &record.character,
            record.battle_at,
            record.mob_name.as_str(),
            &record.map_name,
            record.source,
            &record.item
        ),
        (
            &battle.character,
            battle.ended_at,
            "Cóc Xanh",
            &battle.map_name,
            BattleSource::Fight,
            &gold_item
        )
    );
    assert_eq!(
        out[1],
        Out::Log(
            LogKind::Item,
            "Không nhặt được Nhẫn Hào Kiệt: Không thể nhặt vật phẩm của người khác".into()
        )
    );
    assert_eq!(out.len(), 2);
    assert_eq!(bot.snapshot().job.unwrap().picked, [gold_item]);
    // Sử dụng pressed meanwhile on the hammer of bag slot 6 waits for its own answer: its refusal is not the pickup's.
    out.clear();
    bot.item(ItemAct::Use(6), at, &mut out);
    assert_eq!(sends(&out, 84), 1, "{out:?}");
    out.clear();
    bot.on_packet(1256, &notice("Vật phẩm không thể sử dụng!"), at, &mut out)
        .unwrap();
    assert_eq!(
        out,
        [Out::Log(
            LogKind::Server,
            "Vật phẩm không thể sử dụng!".into()
        )]
    );
    out.clear();
    bot.on_packet(
        1256,
        &notice("Server bảo trì"),
        end + Duration::from_secs(3),
        &mut out,
    )
    .unwrap();
    assert_eq!(out, [Out::Log(LogKind::Server, "Server bảo trì".into())]);
    // s2c/51: the stone of K3 lands in bag slot 6, which held the hammer.
    bot.on_packet(51, &hex_of("bagSlot", 0), at, &mut out)
        .unwrap();
    let bag = bot.snapshot().bag.unwrap();
    assert_eq!(
        bag.items.iter().find(|i| i.slot == 6).map(|i| i.item_id),
        Some(412)
    );
    assert_eq!(bag.items.len(), 8);

    // A lost battle picks nothing, nor a won one with the setting off.
    let t = end + Duration::from_secs(5);
    bot.on_timer(bot.deadline().unwrap().max(t), &mut out);
    bot.on_packet(22, &setup, t, &mut out).unwrap();
    bot.on_packet(1182, &drop_packet("after-a-loss", 41, 80), t, &mut out)
        .unwrap();
    out.clear();
    bot.on_packet(19, &lost_battle(), t, &mut out).unwrap();
    assert_eq!(sends(&out, 1188), 0, "{out:?}");
    bot.set_fight(
        FightSettings {
            repair: false,
            pickup: false,
            ..FightSettings::default()
        },
        now,
        &mut out,
    );
    assert!(logged(&out, "Tắt tự nhặt đồ"));
    let t = t + Duration::from_secs(5);
    bot.on_timer(bot.deadline().unwrap().max(t), &mut out);
    bot.on_packet(22, &setup, t, &mut out).unwrap();
    bot.on_packet(1182, &drop_packet("off", 41, 80), t, &mut out)
        .unwrap();
    out.clear();
    bot.on_packet(19, &won_battle(), t, &mut out).unwrap();
    assert_eq!(sends(&out, 1188), 0, "{out:?}");
}

/// A button of the Túi đồ tab waits ITEM_WAIT (5 s) for its answer. One older than that, never answered, no longer takes
/// a notice from a pickup: "Hành trang đã đầy" after a c2s/1188 is the pickup's (bot/waits.rs, owns_next_notice).
#[test]
fn an_item_action_left_unanswered_for_5_s_does_not_take_the_answer_of_a_pickup() {
    let all = v();
    let cases = all["decoders"].as_array().unwrap();
    let hex_of = |f: &str, n: usize| {
        hex(cases.iter().filter(|c| c["fn"] == f).nth(n).unwrap()["hex"]
            .as_str()
            .unwrap())
    };
    let notice = |text: &str| Writer::new().u8(0).string(text).build();
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.on_packet(42, &hex_of("characterExtra", 0), now, &mut out)
        .unwrap();
    // Sử dụng on the hammer of bag slot 6; the server never answers it.
    bot.item(ItemAct::Use(6), now, &mut out);
    assert_eq!(sends(&out, 84), 1, "{out:?}");
    let start = now + Duration::from_secs(1);
    bot.fight("Cóc Xanh", 3, 3, start, &mut out);
    bot.on_packet(22, &setup, start, &mut out).unwrap();
    let end = now + Duration::from_secs(6);
    bot.on_packet(1182, &hex_of("groundItemAdd", 0), end, &mut out)
        .unwrap();
    out.clear();
    bot.on_packet(19, &won_battle(), end, &mut out).unwrap();
    assert_eq!(sends(&out, 1188), 1, "{out:?}");
    out.clear();
    let at = end + Duration::from_millis(100);
    bot.on_packet(1256, &notice("Hành trang đã đầy"), at, &mut out)
        .unwrap();
    assert!(
        logged(&out, "Không nhặt được"),
        "the notice is the pickup's: {out:?}"
    );
    assert!(!out.contains(&Out::Log(LogKind::Server, "Hành trang đã đầy".into())));
}

/// Lưu dữ liệu trận (battle_record.rs, 07-auto-battle.md#ghi-trận): a battle goes out as one Out::BattleData at its
/// s2c/1214: the header with the mob's element from its s2c/22 block, the packets both ways, the turn notes, the result.
#[test]
fn luu_du_lieu_tran_keeps_a_battle_with_its_header_packets_notes_and_result() {
    use std::io::Read;
    let (mut bot, mut out, now, old) = coc_xanh_bot();
    // s2c/22 in the layout of 07-auto-battle.md#s2c22-641-byte (manina Hỏa, Cóc Xanh Thủy), with the captured board.
    let mut setup = Writer::new()
        .u8(1)
        .u8(0)
        .string("manina")
        .string("manina")
        .u8(0)
        .u8(0)
        .u8(1)
        .i32(21)
        .i32(0)
        .u8(0)
        .i32(150)
        .i32(180)
        .string("mob61000")
        .string("Cóc Xanh")
        .u8(1)
        .u8(0)
        .u8(4)
        .i32(13)
        .i32(100_000)
        .u8(0)
        .i32(249)
        .i32(249)
        .string("3f1c2a9e-6b1d-4c55-9a27-0d3e4b5c6d7e")
        .i32(64)
        .build();
    setup.extend_from_slice(&old[old.len() - 66..]);
    // manina's s2c/9: the gear of the header, each item with its cường hoá.
    let character = v()["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["fn"] == "characterGear")
        .unwrap()["hex"]
        .as_str()
        .unwrap()
        .to_string();
    bot.on_packet(9, &hex(&character), now, &mut out).unwrap();
    // Two battles: the second's header says what came before it.
    bot.fight("Cóc Xanh", 2, 1, now, &mut out);
    out.clear();
    // The session hands every packet it sends to the bot (session.rs).
    let step = |bot: &mut Bot, op: i32, payload: &[u8], at: Instant, out: &mut Vec<Out>| {
        let from = out.len();
        bot.on_packet(op, payload, at, out).unwrap();
        for o in &out[from..] {
            if let Out::Send(op, p) = o {
                bot.record_sent(*op, p, at);
            }
        }
    };
    step(&mut bot, 22, &setup, now, &mut out);
    step(&mut bot, 18, &hex("000000000000"), now, &mut out);
    let end = now + Duration::from_secs(1);
    step(&mut bot, 19, &won_battle(), end, &mut out);
    assert!(
        !out.iter().any(|o| matches!(o, Out::BattleData(_))),
        "waits for s2c/1214"
    );
    let mut durability = Writer::new().i32(8).build(); // 8 empty gear slots
    durability.extend_from_slice(&[0xff; 8]);
    step(&mut bot, 36, &durability, end, &mut out);
    step(&mut bot, 1214, &[], end, &mut out);
    let data: Vec<_> = out
        .iter()
        .filter_map(|o| match o {
            Out::BattleData(d) => Some(d.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(data.len(), 1);
    let d = &data[0];
    assert_eq!(
        (d.uuid.as_str(), d.format),
        ("3f1c2a9e-6b1d-4c55-9a27-0d3e4b5c6d7e", 1)
    );
    let mut text = String::new();
    flate2::read::GzDecoder::new(&d.packets[..])
        .read_to_string(&mut text)
        .unwrap();
    let lines: Vec<Value> = text
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    let h = &lines[0];
    assert!(
        text.starts_with(r#"{"kind":"header","format":1,"at":""#),
        "{text}"
    );
    assert_eq!(
        (
            &h["bot"],
            &h["character"],
            &h["hp"],
            &h["map"],
            &h["play"]["source"]
        ),
        (
            &json!("app"),
            &json!("manina"),
            &json!(150),
            &json!("M2"),
            &json!("fight")
        )
    );
    assert_eq!(
        h["mob"],
        json!({ "id": "mob61000", "name": "Cóc Xanh", "level": 13, "element": 4, "elementName": "Thủy", "hp": 249, "maxHp": 249, "boss": false })
    );
    let kinds: Vec<String> = lines[1..]
        .iter()
        .map(|l| match l {
            Value::Array(a) => a[1].as_str().unwrap().to_string(),
            _ => l
                .get("note")
                .or(l.get("kind"))
                .unwrap()
                .as_str()
                .unwrap()
                .to_string(),
        })
        .collect();
    assert_eq!(
        kinds,
        [
            "s2c/22",
            "c2s/18",
            "s2c/18",
            "c2s/14",
            "s2c/19",
            "estimates",
            "end",
            "s2c/36",
            "s2c/1214"
        ]
    );
    // What the battle taught the bot, as the TS bot's `estimates` note; the app's log no longer shows it.
    let learnt = lines.iter().find(|l| l["note"] == "estimates").unwrap();
    assert_eq!(learnt["mobId"], "mob61000", "{learnt}");
    assert!(
        learnt["me"]["sword"].is_number() && learnt["mob"]["sword"].is_number(),
        "{learnt}"
    );
    let result = lines.iter().find(|l| l["kind"] == "end").unwrap();
    assert_eq!(
        (&result["won"], &result["ms"]),
        (&json!(true), &json!(1000))
    );
    // The first battle of the session has none before it; a turn note has both sides' nội lực and sức mạnh.
    assert_eq!(
        h["before"],
        json!({ "session": 1, "restMs": null, "last": null })
    );
    let gear = h["gear"].as_array().unwrap();
    assert!(
        !gear.is_empty() && gear.iter().all(|g| g["plus"].is_i64()),
        "{gear:?}"
    );

    // After the rest, the next challenge and its battle: `before` holds the first one's end.
    out.clear();
    let next = bot.deadline().expect("the rest before the next challenge");
    bot.on_timer(next, &mut out);
    assert_eq!(sends(&out, 15), 1, "the next challenge");
    step(&mut bot, 22, &setup, next, &mut out);
    step(&mut bot, 18, &hex("000000000000"), next, &mut out);
    let end = next + Duration::from_secs(1);
    step(&mut bot, 19, &won_battle(), end, &mut out);
    step(&mut bot, 36, &durability, end, &mut out);
    step(&mut bot, 1214, &[], end, &mut out);
    let second = out
        .iter()
        .find_map(|o| match o {
            Out::BattleData(d) => Some(d.clone()),
            _ => None,
        })
        .expect("the second battle's data");
    let mut text = String::new();
    flate2::read::GzDecoder::new(&second.packets[..])
        .read_to_string(&mut text)
        .unwrap();
    let h: Value = serde_json::from_str(text.lines().next().unwrap()).unwrap();
    let before = &h["before"];
    assert_eq!(
        (
            &before["session"],
            &before["last"]["won"],
            &before["last"]["maxHp"],
            &before["last"]["mob"]
        ),
        (&json!(2), &json!(true), &json!(180), &json!("mob61000")),
        "{before}"
    );
    assert!(
        before["restMs"].is_u64() && before["last"]["hp"].is_i64(),
        "{before}"
    );
}

/// v1 is kept beside v3 (BotOptions::algorithm, `cllt fight --algo=v1`): on the same first own turn v1 sends the Q20
/// `kill` move of runner.rs as before v3, v3 its own pick, and the battle data says which one played, with a turn note.
#[test]
fn v1_is_kept_beside_v3_and_the_battle_data_names_the_algorithm() {
    use cllt_core::bot::Algorithm;
    use std::io::Read;
    let all = v();
    let decoder = |name: &str, pick: &dyn Fn(&Value) -> bool| {
        hex(all["decoders"]
            .as_array()
            .unwrap()
            .iter()
            .find(|d| d["fn"] == name && pick(&d["expected"]))
            .unwrap()["hex"]
            .as_str()
            .unwrap())
    };
    let setup = decoder("battleSetup", &|_| true);
    let own = decoder("turnState", &|e| e["playerTurn"] == json!(1));
    let s = battle::battle_setup(&setup).unwrap();
    let mut board: Board = [battle::UNKNOWN; battle::N * battle::N];
    for (i, &x) in s.board.iter().enumerate() {
        board[i] = x;
    }
    // runner.rs as v1 starts: own fighter without a skill, the unknown mob, the `kill` search.
    let me = battle::fighter(s.hp as f64, s.max_hp as f64);
    let kill = battle::best_move(&board, &me, &battle::unknown_mob(), &Strategy::kill()).unwrap();
    let seq = battle::turn_state(&own).unwrap().seq;
    let expected = build(
        19,
        &Ctx {
            battle_uuid: Some(&s.uuid),
            seq: Some(seq),
            mv: Some(kill.mv),
            ..Ctx::default()
        },
    )
    .unwrap();
    for algorithm in [Algorithm::V1, Algorithm::V3] {
        let options = BotOptions {
            algorithm,
            ..BotOptions::default()
        };
        let (mut bot, mut out, now) = (
            Bot::new(options, Arc::new(Atlas::default())),
            vec![],
            Instant::now(),
        );
        let feed = |bot: &mut Bot, op: i32, p: &[u8], out: &mut Vec<Out>| {
            let from = out.len();
            bot.on_packet(op, p, now, out).unwrap();
            for o in &out[from..] {
                if let Out::Send(op, p) = o {
                    bot.record_sent(*op, p, now);
                }
            }
        };
        feed(
            &mut bot,
            29,
            &Writer::new().string("manina").string("M2").i32(0).build(),
            &mut out,
        );
        let mobs = Writer::new()
            .string("M2")
            .u8(3)
            .string("mob61000")
            .string("Cóc Xanh")
            .i32(13)
            .u8(0)
            .i32(6)
            .i32(1)
            .u8(0)
            .build();
        feed(&mut bot, 43, &mobs, &mut out);
        bot.fight("Cóc Xanh", 1, 1, now, &mut out);
        feed(&mut bot, 22, &setup, &mut out);
        feed(&mut bot, 18, &hex("000000000000"), &mut out);
        out.clear();
        feed(&mut bot, 24, &own, &mut out);
        let swap: Vec<&Vec<u8>> = out
            .iter()
            .filter_map(|o| match o {
                Out::Send(19, p) => Some(p),
                _ => None,
            })
            .collect();
        assert_eq!(swap.len(), 1, "{algorithm:?}: {out:?}");
        if algorithm == Algorithm::V1 {
            assert_eq!(swap[0], &expected, "v1 plays the kill move of runner.rs");
        }
        feed(&mut bot, 19, &won_battle(), &mut out);
        feed(&mut bot, 1214, &[], &mut out);
        let data = out
            .iter()
            .find_map(|o| match o {
                Out::BattleData(d) => Some(d.clone()),
                _ => None,
            })
            .expect("battle data");
        let mut text = String::new();
        flate2::read::GzDecoder::new(&data.packets[..])
            .read_to_string(&mut text)
            .unwrap();
        let lines: Vec<Value> = text
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        let play = &lines[0]["play"];
        assert_eq!(play["algorithm"], json!(algorithm.key()));
        let (model, memory) = match algorithm {
            Algorithm::V1 => ("best", Value::Null),
            Algorithm::V3 => ("odds", json!({})),
        };
        assert_eq!(
            (&play["strategy"]["mobModel"], &lines[0]["memory"]),
            (&json!(model), &memory)
        );
        let turn = lines
            .iter()
            .find(|l| l["note"] == "turn")
            .expect("turn note");
        assert_eq!(
            (&turn["seq"], &turn["pick"]),
            (&json!(seq), &json!("swap")),
            "{algorithm:?}"
        );
        // v3 notes both sides' nội lực and sức mạnh on each own turn, for the value of yin-yang and peaches.
        if algorithm == Algorithm::V3 {
            assert!(
                ["stat1", "stat2", "mobStat1", "mobStat2"]
                    .iter()
                    .all(|k| turn[k].is_number()),
                "{turn}"
            );
        }
    }
}

/// flag2 of s2c/9 is the gender, as `gender` of the item table: manina (A2 and level 21) 0, the second account 1.
/// Mặc refuses gear of the other gender before anything goes out ("Trang bị không phù hợp" from the server otherwise),
/// with the words of items::misfit; gear for both, and any gear while the gender is not known, goes out.
#[test]
fn mac_refuses_gear_of_the_other_gender_and_s2c_1187_kind_4_adds_one_item() {
    let all = v();
    let cases = all["decoders"].as_array().unwrap();
    let profiles: Vec<Vec<u8>> = cases
        .iter()
        .filter(|c| c["fn"] == "characterProfile")
        .map(|c| hex(c["hex"].as_str().unwrap()))
        .collect();
    let genders: Vec<u8> = profiles
        .iter()
        .map(|p| character_prefix(p).unwrap().gender)
        .collect();
    assert_eq!(genders, [0, 0, 1]);
    assert_eq!(
        items::misfit(1, Some(0)).as_deref(),
        Some("đồ nữ, nhân vật là nam")
    );
    assert_eq!(
        items::misfit(0, Some(1)).as_deref(),
        Some("đồ nam, nhân vật là nữ")
    );
    assert_eq!(items::misfit(2, Some(1)), None);
    assert_eq!(items::misfit(0, None), None);
    assert_eq!(items::book().get(200).map(|d| d.gender), Some(1));
    assert_eq!(items::book().get(149).map(|d| d.gender), Some(0));

    let hex_of = |f: &str, n: usize| {
        hex(cases.iter().filter(|c| c["fn"] == f).nth(n).unwrap()["hex"]
            .as_str()
            .unwrap())
    };
    let mut bot = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let (now, mut out) = (Instant::now(), vec![]);
    bot.on_packet(9, &hex_of("characterGear", 0), now, &mut out)
        .unwrap();
    bot.on_packet(42, &hex_of("characterExtra", 0), now, &mut out)
        .unwrap();
    assert_eq!(bot.snapshot().gender, Some(0));
    let before = bot.snapshot().bag.unwrap();

    // s2c/1187 kind 4 of O1 (Nhẫn Thái Cực in slot 19), then the same record made Giáp Tiên Phong nữ (200) in slot 20:
    // each joins the bag, which keeps its other items and its capacity.
    let ring = hex_of("inventory", 1);
    assert_eq!(ring[0], items::BAG_ADD);
    let armour: Vec<u8> = [&[4u8, 20][..], &200i32.to_be_bytes(), &ring[6..]].concat();
    out.clear();
    bot.on_packet(1187, &ring, now, &mut out).unwrap();
    bot.on_packet(1187, &armour, now, &mut out).unwrap();
    assert!(out.is_empty(), "{out:?}");
    let bag = bot.snapshot().bag.unwrap();
    assert_eq!(
        (bag.capacity, bag.items.len()),
        (before.capacity, before.items.len() + 2)
    );
    let at = |slot: u8| bag.items.iter().find(|i| i.slot == slot).map(|i| i.item_id);
    assert_eq!((at(19), at(20)), (Some(333), Some(200)));

    let mut step = |act: ItemAct| {
        let mut out = vec![];
        bot.item(act, now, &mut out);
        out
    };
    let refused = step(ItemAct::Equip(20));
    assert_eq!(
        refused,
        [Out::Log(
            LogKind::Item,
            "Chưa mặc Giáp Tiên Phong: đồ nữ, nhân vật là nam".into()
        )]
    );
    // A ring is for both: it goes out.
    assert_eq!(sends(&step(ItemAct::Equip(19)), 1186), 1);
}

/// A s2c/1187 that does not read (after Đập Trứng Gà: 5 to 8 bytes, its kind not 1 or 4) is a Log lỗi line, and c2s/42
/// asks the whole bag again; the s2c/42 that answers is the bag.
#[test]
fn a_bag_update_that_does_not_read_asks_the_whole_bag_again() {
    let all = v();
    let cases = all["decoders"].as_array().unwrap();
    let extra = hex(
        cases.iter().find(|c| c["fn"] == "characterExtra").unwrap()["hex"]
            .as_str()
            .unwrap(),
    );
    let mut bot = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let (now, mut out) = (Instant::now(), vec![]);
    bot.on_packet(
        29,
        &Writer::new().string("manina").string("M2").i32(0).build(),
        now,
        &mut out,
    )
    .unwrap();
    bot.on_packet(42, &extra, now, &mut out).unwrap();
    let mut sname = Writer::new()
        .u8(1)
        .u8(1)
        .string("manina")
        .i32(155)
        .string("manina");
    sname = sname.u8(1).u8(0).i32(21).i32(100).i32(120);
    bot.on_packet(9, &sname.build(), now, &mut out).unwrap();
    out.clear();
    bot.on_packet(1187, &[3, 8, 0, 0, 0, 1], now, &mut out)
        .unwrap();
    assert!(
        logged(&out, "Không đọc được túi đồ (s2c/1187 loại 3): "),
        "{out:?}"
    );
    assert!(cllt_core::net::is_fault(match &out[0] {
        Out::Log(_, t) => t,
        o => panic!("{o:?}"),
    }));
    assert_eq!(
        sent(&out, 42),
        Some(tohex(
            &build(
                42,
                &Ctx {
                    character_name: Some("manina"),
                    ..Ctx::default()
                }
            )
            .unwrap()
        ))
    );
    // The bag of before stays until s2c/42 brings the new one.
    assert!(bot.snapshot().bag.is_some());
}

/// Đập Trứng Gà (Log lỗi of 02/11, manina3): s2c/1187 kind 2 is what is left in one bag slot. The rest of the bag stays,
/// none left empties the slot, and nothing is logged or asked again. Before any bag is known it leaves the bag unknown.
#[test]
fn s2c_1187_kind_2_sets_what_is_left_in_one_slot() {
    let all = v();
    let cases = all["decoders"].as_array().unwrap();
    let hex_of = |f: &str, n: usize| {
        hex(cases.iter().filter(|c| c["fn"] == f).nth(n).unwrap()["hex"]
            .as_str()
            .unwrap())
    };
    let egg = items::inventory(&hex_of("inventory", 2)).unwrap();
    assert_eq!(
        (egg.kind, egg.capacity, egg.items.len(), egg.left),
        (
            items::BAG_LEFT,
            -1,
            0,
            Some(items::SlotLeft {
                slot: 32,
                quantity: 2
            })
        )
    );
    assert!(!egg.is_whole());
    let mut fresh = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let (now, mut out) = (Instant::now(), vec![]);
    fresh
        .on_packet(1187, &hex_of("inventory", 2), now, &mut out)
        .unwrap();
    assert!(fresh.snapshot().bag.is_none());

    let mut bot = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    bot.on_packet(42, &hex_of("characterExtra", 0), now, &mut out)
        .unwrap();
    let before = bot.snapshot().bag.unwrap();
    let slot = before.items.last().unwrap().slot;
    out.clear();
    bot.on_packet(1187, &[2, slot, 0, 0, 0, 5], now, &mut out)
        .unwrap();
    assert!(out.is_empty(), "{out:?}");
    let after = bot.snapshot().bag.unwrap();
    assert_eq!(
        (after.capacity, after.items.len()),
        (before.capacity, before.items.len())
    );
    assert_eq!(
        after
            .items
            .iter()
            .find(|i| i.slot == slot)
            .map(|i| i.quantity),
        Some(5)
    );
    bot.on_packet(1187, &[2, slot, 0, 0, 0, 0], now, &mut out)
        .unwrap();
    let empty = bot.snapshot().bag.unwrap();
    assert_eq!(empty.items.len(), before.items.len() - 1);
    assert!(empty.items.iter().all(|i| i.slot != slot));
}

/// Nhặt cả đồ người khác, on by default (13-drops-items.md#k3): after a won battle, once its own drops are asked for,
/// the items others left on the zone's ground 18 s ago or more are picked up too, oldest first, money always and the
/// rest while the bag has a free slot; a younger one waits. What came is a Vật phẩm line of its own and counts in the
/// job, never in the drops of the mob (no Out::Pickup). An item refused as too young waits 18 s more; one gone, or of
/// another zone, is not asked for again. The ground of a zone entered (s2c/1184) is aged from when its items expire.
/// Off, only the own drops are picked up. Chỉ nhặt trang bị đúng hệ, on by default: gear of another element stays.
#[test]
fn nhat_ca_do_nguoi_khac_picks_up_what_others_left_once_anyone_may() {
    let all = v();
    let cases = all["decoders"].as_array().unwrap();
    let hex_of = |f: &str| {
        hex(cases.iter().find(|c| c["fn"] == f).unwrap()["hex"]
            .as_str()
            .unwrap())
    };
    let settings = FightSettings::default();
    assert!(settings.pickup_others && settings.pickup_own_element);
    let request = |uuid: &str| tohex(&Writer::new().string(uuid).build());
    let picked = |out: &[Out]| -> Vec<String> {
        out.iter()
            .filter_map(|o| match o {
                Out::Send(1188, p) => Some(tohex(p)),
                _ => None,
            })
            .collect()
    };
    // Every c2s/1188 of a won battle at `end`, the timer run until the queue is empty. The challenge of that battle goes
    // out first, once the rest after the one before is over.
    let win = |bot: &mut Bot, setup: &[u8], end: Instant| -> Vec<Out> {
        let mut out = vec![];
        while let Some(d) = bot.deadline().filter(|d| *d <= end) {
            bot.on_timer(d, &mut out);
            if out.iter().any(|o| matches!(o, Out::Send(15, _))) {
                break;
            }
        }
        bot.on_packet(22, setup, end, &mut out).unwrap();
        out.clear();
        bot.on_packet(19, &won_battle(), end, &mut out).unwrap();
        let mut t = end;
        while let Some(next) = bot
            .deadline()
            .filter(|d| *d <= end + Duration::from_secs(2))
        {
            t = next.max(t);
            bot.on_timer(t, &mut out);
        }
        out
    };
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.on_packet(42, &hex_of("characterExtra"), now, &mut out)
        .unwrap();
    bot.fight("Cóc Xanh", 50, 50, now, &mut out);
    // Others' Đá cấp 2 and Xu khóa at 0 s, a stone in another map, a Giáp Tiên Phong at 10 s; the own Xu khóa at the end, 20 s.
    for (map, uuid, id, n, at) in [
        ("M2", "da", 412, 1, 0),
        ("M2", "xu", 41, 300, 0),
        ("M1", "m1", 412, 1, 0),
        ("M2", "giap", 200, 1, 10),
    ] {
        let t = now + Duration::from_secs(at);
        bot.on_packet(1182, &drop_in(map, uuid, id, n, 0xff), t, &mut out)
            .unwrap();
    }
    let end = now + Duration::from_secs(20);
    bot.on_packet(1182, &drop_in("M2", "own", 41, 50, 0xff), end, &mut out)
        .unwrap();
    let out = win(&mut bot, &setup, end);
    assert_eq!(
        picked(&out),
        [request("own"), request("da"), request("xu")],
        "{out:?}"
    );
    let notice = |text: &str| Writer::new().u8(0).string(text).build();
    let mut out = vec![];
    let at = end + Duration::from_millis(500);
    for text in [
        "Bạn vừa nhận được 50 Xu khóa",
        "Bạn vừa nhận được Đá cấp 2",
        "Bạn vừa nhận được 300 Xu khóa",
    ] {
        bot.on_packet(1256, &notice(text), at, &mut out).unwrap();
    }
    let pickups = out.iter().filter(|o| matches!(o, Out::Pickup(_))).count();
    assert_eq!(pickups, 1, "only the own one is a drop of the mob: {out:?}");
    assert!(
        logged(&out, "Nhặt được đồ người khác bỏ lại: Đá cấp 2"),
        "{out:?}"
    );
    assert!(
        logged(&out, "Nhặt được đồ người khác bỏ lại: Xu khóa ×300"),
        "{out:?}"
    );
    let job = bot.snapshot().job.unwrap().picked;
    assert_eq!(job, [Picked::of(41, 350), Picked::of(412, 1)]);
    for uuid in ["da", "xu", "own"] {
        bot.on_packet(
            1183,
            &Writer::new().string("M2").string(uuid).build(),
            at,
            &mut out,
        )
        .unwrap();
    }
    // The Giáp, 30 s old at the next win, is refused as another's all the same: asked again 18 s later, not before.
    let end = now + Duration::from_secs(40);
    let out = win(&mut bot, &setup, end);
    assert_eq!(picked(&out), [request("giap")], "{out:?}");
    let mut out = vec![];
    bot.on_packet(
        1256,
        &notice("Không thể nhặt vật phẩm của người khác"),
        end,
        &mut out,
    )
    .unwrap();
    assert!(
        logged(
            &out,
            "Không nhặt được Giáp Tiên Phong: Không thể nhặt vật phẩm của người khác"
        ),
        "{out:?}"
    );
    let out = win(&mut bot, &setup, end + Duration::from_secs(10));
    assert!(picked(&out).is_empty(), "{out:?}");
    let out = win(&mut bot, &setup, end + Duration::from_secs(20));
    assert_eq!(picked(&out), [request("giap")], "{out:?}");

    // A full bag takes only money; with the setting off nothing of others is asked for.
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.on_packet(42, &hex_of("characterExtra"), now, &mut out)
        .unwrap();
    let held = bot.snapshot().bag.unwrap().items.len() as i32;
    bot.snap.bag.as_mut().unwrap().capacity = held;
    bot.fight("Cóc Xanh", 50, 50, now, &mut out);
    for (uuid, id, n) in [("da", 412, 1), ("xu", 41, 300)] {
        bot.on_packet(1182, &drop_in("M2", uuid, id, n, 0xff), now, &mut out)
            .unwrap();
    }
    let out = win(&mut bot, &setup, now + Duration::from_secs(20));
    assert_eq!(picked(&out), [request("xu")], "{out:?}");
    // One free slot goes to the own stone, sent at once: another's stone waits.
    let gone = Writer::new().string("M2").string("xu").build();
    bot.on_packet(1183, &gone, now, &mut vec![]).unwrap();
    bot.snap.bag.as_mut().unwrap().capacity = held + 1;
    let end = now + Duration::from_secs(25);
    bot.on_packet(1182, &drop_in("M2", "own", 412, 1, 0xff), end, &mut vec![])
        .unwrap();
    let out = win(&mut bot, &setup, end);
    assert_eq!(picked(&out), [request("own")], "{out:?}");
    let mut out = vec![];
    bot.set_fight(
        FightSettings {
            pickup_others: false,
            ..FightSettings::default()
        },
        now,
        &mut out,
    );
    assert!(
        logged(&out, "Tắt nhặt đồ người khác: chỉ nhặt đồ của mình"),
        "{out:?}"
    );
    bot.snap.bag.as_mut().unwrap().capacity = held + 10;
    let out = win(&mut bot, &setup, now + Duration::from_secs(35));
    assert!(picked(&out).is_empty(), "{out:?}");

    // The ground of the zone entered: the four items of M1's s2c/1184 (here in M2) expired long ago, so all are old.
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.on_packet(42, &hex_of("characterExtra"), now, &mut out)
        .unwrap();
    bot.fight("Cóc Xanh", 50, 50, now, &mut out);
    let mut ground = hex_of("groundItems");
    assert_eq!(&ground[..6], &[0, 0, 0, 2, b'M', b'1']);
    ground[5] = b'2';
    bot.on_packet(1184, &ground, now, &mut out).unwrap();
    let out = win(&mut bot, &setup, now + Duration::from_secs(1));
    assert_eq!(picked(&out).len(), 4, "{out:?}");

    // Chỉ nhặt trang bị đúng hệ: manina Hỏa leaves a Lôi ring, takes a Hỏa one and a stone.
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.on_packet(42, &hex_of("characterExtra"), now, &mut out)
        .unwrap();
    bot.snap.element = Some(1);
    // On by default: turned off, then on again.
    bot.set_fight(
        FightSettings {
            pickup_own_element: false,
            ..FightSettings::default()
        },
        now,
        &mut out,
    );
    bot.set_fight(
        FightSettings {
            pickup_own_element: true,
            ..FightSettings::default()
        },
        now,
        &mut out,
    );
    assert!(logged(
        &out,
        "Bật chỉ nhặt trang bị đúng hệ: trang bị khác hệ nhân vật sẽ để lại dưới đất"
    ));
    bot.fight("Cóc Xanh", 50, 50, now, &mut out);
    let end = now + Duration::from_secs(1);
    for (uuid, id, element) in [("loi", 312, 2), ("hoa", 312, 1), ("da", 412, 0xff)] {
        bot.on_packet(1182, &drop_in("M2", uuid, id, 1, element), end, &mut out)
            .unwrap();
    }
    let out = win(&mut bot, &setup, end);
    assert_eq!(picked(&out), [request("hoa"), request("da")], "{out:?}");
    assert!(
        logged(&out, "Bỏ qua Nhẫn Hào Kiệt: đồ hệ Lôi, nhân vật hệ Hỏa"),
        "{out:?}"
    );

    // Nhặt loại đồ, all four ticked by default: only Xu ticked, the Xu khóa is picked up, a stone, a ring and a
    // Huyết Châu (399) stay on the ground, each said once.
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.on_packet(42, &hex_of("characterExtra"), now, &mut out)
        .unwrap();
    let only_coins = FightSettings {
        pickup_stones: false,
        pickup_gear: false,
        pickup_misc: false,
        ..FightSettings::default()
    };
    assert!(FightSettings::default().pickup_coins && FightSettings::default().pickup_misc);
    bot.set_fight(only_coins, now, &mut out);
    assert!(logged(&out, "Nhặt loại đồ: chỉ nhặt Xu"), "{out:?}");
    bot.fight("Cóc Xanh", 50, 50, now, &mut out);
    let end = now + Duration::from_secs(1);
    for (uuid, id, element) in [
        ("xu", 41, 0xff),
        ("da", 412, 0xff),
        ("nhan", 312, 1),
        ("khac", 399, 0xff),
    ] {
        bot.on_packet(1182, &drop_in("M2", uuid, id, 1, element), end, &mut out)
            .unwrap();
    }
    let out = win(&mut bot, &setup, end);
    assert_eq!(picked(&out), [request("xu")], "{out:?}");
    assert!(
        logged(&out, "Bỏ qua Đá cấp 2: đá, loại này không được chọn nhặt"),
        "{out:?}"
    );
    assert!(
        logged(
            &out,
            "Bỏ qua Nhẫn Hào Kiệt: trang bị, loại này không được chọn nhặt"
        ),
        "{out:?}"
    );
    assert!(
        logged(
            &out,
            "Bỏ qua Huyết Châu: đồ khác, loại này không được chọn nhặt"
        ),
        "{out:?}"
    );

    // Phẩm chất trang bị nhặt, all four ticked by default: unticked Thường and Hiếm, a Hiếm ring stays on the ground,
    // a Quý one is picked up, and so is a stone, which is not gear (its field4 0 is not Thường).
    assert_eq!(FightSettings::default().qualities(), [true; 4]);
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    bot.on_packet(42, &hex_of("characterExtra"), now, &mut out)
        .unwrap();
    bot.set_fight(
        FightSettings {
            pickup_common: false,
            pickup_rare: false,
            ..FightSettings::default()
        },
        now,
        &mut out,
    );
    assert!(
        logged(
            &out,
            "Phẩm chất trang bị nhặt: chỉ nhặt trang bị Quý, Sử Thi"
        ),
        "{out:?}"
    );
    bot.fight("Cóc Xanh", 50, 50, now, &mut out);
    let end = now + Duration::from_secs(1);
    for (uuid, id, element, quality) in [
        ("hiem", 312, 1, 1),
        ("quy", 312, 1, 2),
        ("da", 412, 0xff, 0),
    ] {
        bot.on_packet(1182, &gear_drop(uuid, id, element, quality), end, &mut out)
            .unwrap();
    }
    let out = win(&mut bot, &setup, end);
    assert_eq!(picked(&out), [request("quy"), request("da")], "{out:?}");
    assert!(
        logged(
            &out,
            "Bỏ qua Nhẫn Hào Kiệt: trang bị Hiếm, phẩm chất này không được chọn nhặt"
        ),
        "{out:?}"
    );
    let mut out = vec![];
    bot.set_fight(FightSettings::default(), now, &mut out);
    assert!(
        logged(&out, "Phẩm chất trang bị nhặt: nhặt trang bị mọi phẩm chất"),
        "{out:?}"
    );
}

/// drop_in in M2 with the quality `quality` in field4 of the item record (items::quality_name).
fn gear_drop(uuid: &str, item_id: i32, element: u8, quality: u8) -> Vec<u8> {
    let mut p = drop_in("M2", uuid, item_id, 1, element);
    // string map ("M2"), u8 slot, i32 id, string uuid, 3 × i32, u8 field1, u8 element, i32 field2, u8 field3, then
    // field4; a string is an i32 length and its bytes.
    let at = (4 + 2) + 1 + 4 + (4 + uuid.len()) + 12 + 1 + 1 + 4 + 1;
    assert_eq!(
        (p[at - 6], p[at]),
        (element, 0),
        "the element byte, then field4"
    );
    p[at] = quality;
    p
}

/// Nhặt cả đồ khác giới tính, on by default: Tự nhặt đồ picks up Giáp Tiên Phong nữ for manina too. Off, gear the
/// character cannot wear stays on the ground, said once; gear for it and the rest are picked up as before.
#[test]
fn tu_nhat_do_leaves_gear_of_the_other_gender_when_told() {
    assert!(!FightSettings::default().pickup_other_gender);
    let all = v();
    let cases = all["decoders"].as_array().unwrap();
    let profile = hex(
        cases.iter().find(|c| c["fn"] == "characterGear").unwrap()["hex"]
            .as_str()
            .unwrap(),
    );
    let run = |other: bool| {
        let (mut bot, mut out, now, setup) = coc_xanh_bot();
        bot.on_packet(9, &profile, now, &mut out).unwrap();
        bot.set_fight(
            FightSettings {
                pickup_other_gender: other,
                ..FightSettings::default()
            },
            now,
            &mut out,
        );
        bot.fight("Cóc Xanh", 3, 3, now, &mut out);
        bot.on_packet(22, &setup, now, &mut out).unwrap();
        let end = now + Duration::from_secs(1);
        bot.on_packet(1182, &drop_packet("nu", 200, 1), end, &mut out)
            .unwrap();
        bot.on_packet(1182, &drop_packet("nam", 149, 1), end, &mut out)
            .unwrap();
        out.clear();
        bot.on_packet(19, &won_battle(), end, &mut out).unwrap();
        let mut all = out.clone();
        let mut t = end;
        while let Some(next) = bot
            .deadline()
            .filter(|d| *d <= end + Duration::from_secs(1))
        {
            t = next.max(t);
            out.clear();
            bot.on_timer(t, &mut out);
            all.extend(out.clone());
        }
        all
    };
    let request = |uuid: &str| tohex(&Writer::new().string(uuid).build());
    let picked = |out: &[Out]| -> Vec<String> {
        out.iter()
            .filter_map(|o| match o {
                Out::Send(1188, p) => Some(tohex(p)),
                _ => None,
            })
            .collect()
    };
    let on = run(true);
    assert_eq!(picked(&on), [request("nu"), request("nam")], "{on:?}");
    let off = run(false);
    assert!(
        logged(&off, "Bỏ qua Giáp Tiên Phong: đồ nữ, nhân vật là nam"),
        "{off:?}"
    );
    assert_eq!(picked(&off), [request("nam")], "{off:?}");
}

/// "Ngươi cần gì ở châu này?" with Thông tin châu and Nói chuyện, the menu Tướng phe Thiết Hổ (NPC 145) answered the c2s/13
/// of step 2 of quest 22 with on 20/11 (manina2, manina3, tiheo2), here for the duel NPC of quest 12.
fn chau_menu() -> Vec<u8> {
    Writer::new()
        .i32(2)
        .string("Võ Quan Đinh Mộc")
        .string("Ngươi cần gì ở châu này?")
        .u8(0)
        .string("Thông tin châu")
        .u8(1)
        .string("Nói chuyện")
        .build()
}

#[test]
fn a_menu_with_noi_chuyen_and_no_dong_y_gets_noi_chuyen_once_then_the_duel_s_dong_y() {
    let (mut bot, mut out, now, _) = duel_bot();
    bot.quest(1, None, now, &mut out);
    bot.on_packet(57, &chau_menu(), now, &mut out).unwrap();
    assert_eq!(
        out.last(),
        Some(&Out::Send(
            57,
            Writer::new().u8(1).string("M2").i32(141).build()
        ))
    );
    assert!(out.iter().any(|o| matches!(o, Out::Log(LogKind::Quest, t)
        if t == "Võ Quan Đinh Mộc: Ngươi cần gì ở châu này? → Nói chuyện")));
    // Nói chuyện opens the step's dialog: Đồng ý as before.
    bot.on_packet(57, &hex(DUEL_DIALOG), now, &mut out).unwrap();
    assert_eq!(
        out.last(),
        Some(&Out::Send(
            57,
            Writer::new().u8(0).string("M2").i32(141).build()
        ))
    );
    assert_eq!(bot.snap.quest_run.clone().unwrap().done, None);
}

#[test]
fn the_same_menu_after_noi_chuyen_or_no_answer_to_it_ends_the_run() {
    let (mut bot, mut out, now, _) = duel_bot();
    bot.quest(1, None, now, &mut out);
    bot.on_packet(57, &chau_menu(), now, &mut out).unwrap();
    bot.on_packet(57, &chau_menu(), now, &mut out).unwrap();
    assert_eq!(
        bot.snap.quest_run.clone().unwrap().done.as_deref(),
        Some("Võ Quan Đinh Mộc hỏi \"Ngươi cần gì ở châu này?\" (Thông tin châu, Nói chuyện): bot chưa biết chọn dòng nào")
    );
    // A new run talks again (c2s/13), so Nói chuyện may be taken again; no answer within 8 s ends the run.
    bot.quest(1, None, now, &mut out);
    bot.on_packet(57, &chau_menu(), now, &mut out).unwrap();
    assert_eq!(
        out.last(),
        Some(&Out::Send(
            57,
            Writer::new().u8(1).string("M2").i32(141).build()
        ))
    );
    bot.on_timer(bot.deadline().expect("talk timer"), &mut out);
    assert_eq!(
        bot.snap.quest_run.clone().unwrap().done.as_deref(),
        Some("NPC không trả lời sau Nói chuyện")
    );
}

/// The zone M2 with the mobs (id, name, level) as s2c/43 lists them (layout of coc_xanh_bot).
fn zone_of(mobs: &[(&str, &str, i32)]) -> Vec<u8> {
    let mut w = Writer::new().string("M2").u8(mobs.len() as u8);
    for (id, name, level) in mobs {
        w = w
            .string(id)
            .string(name)
            .i32(*level)
            .u8(0)
            .i32(6)
            .i32(1)
            .u8(0);
    }
    w.build()
}

/// A job on a mob more than NO_EXP_GAP levels below the character (no EXP any more): the mob Gợi ý quái would farm takes
/// over, said once; without one worth it, the job ends and says why.
#[test]
fn a_mob_that_gives_no_exp_any_more_gives_way_to_the_one_to_farm() {
    let (mut bot, mut out, now, _) = coc_xanh_bot();
    bot.on_packet(
        43,
        &zone_of(&[("mob61000", "Cóc Xanh", 13), ("mob90000", "Cóc Tía", 35)]),
        now,
        &mut out,
    )
    .unwrap();
    bot.snap.level = 40;
    bot.snap.max_hp = 900;
    bot.snap.combat = Some([320, 80, 0, 0, 0]);
    bot.snap.element = Some(1);
    out.clear();
    bot.fight("Cóc Xanh", 5, 5, now, &mut out);
    let switched = out.iter().find_map(|o| match o {
        Out::Log(LogKind::Battle, t) if t.contains("đánh không còn EXP: đổi sang") => {
            Some(t.clone())
        }
        _ => None,
    });
    let switched = switched.unwrap_or_else(|| panic!("{out:?}"));
    assert!(
        switched.starts_with("Cóc Xanh cấp 13 kém nhân vật cấp 40 tới 27 cấp, đánh không còn EXP: đổi sang Cóc Tía cấp 35 (ước "),
        "{switched}"
    );
    assert_eq!(bot.snap.job.as_ref().unwrap().target, "Cóc Tía");
    assert!(
        logged(&out, "Trận 1/5: thách đấu Cóc Tía cấp 35 (mob90000)"),
        "{out:?}"
    );

    // Only mobs far below: the job ends.
    let (mut bot, mut out, now, _) = coc_xanh_bot();
    bot.snap.level = 40;
    bot.snap.max_hp = 900;
    bot.snap.combat = Some([320, 80, 0, 0, 0]);
    out.clear();
    bot.fight("Cóc Xanh", 5, 5, now, &mut out);
    assert!(
        out.iter().any(|o| matches!(o, Out::Log(LogKind::Battle, t) if t.starts_with("Kết thúc: Cóc Xanh cấp 13 kém nhân vật cấp 40 tới 27 cấp, đánh không còn EXP, và khu này không có quái nào"))),
        "{out:?}"
    );
    assert_eq!(sends(&out, 15), 0);
}

/// Xác nhận người chơi (02-login.md#captcha, LG1): the challenge goes to the app with its picture and holds the job;
/// the answer goes out byte for byte as the game's of LG1; the verdict passed lets the job fight; the time over, or the
/// server's "Chưa xác nhận người chơi", ends it.
#[test]
fn a_captcha_holds_the_job_until_the_user_passes_it() {
    let png = vec![0x89, b'P', b'N', b'G'];
    let id = 0x907a332a_u32 as i32;
    let challenge = |id: i32| {
        let mut p = Writer::new().u8(0).i32(id).build();
        p.extend_from_slice(&60u16.to_be_bytes());
        p.push(3);
        p.extend(Writer::new().bytes(&png).build());
        p
    };
    let (mut bot, mut out, now, _) = coc_xanh_bot();
    bot.on_packet(1283, &challenge(id), now, &mut out).unwrap();
    assert!(
        out.contains(&Out::Captcha(CaptchaUi::Show(Box::new(CaptchaPrompt {
            id,
            png: png.clone(),
            seconds: 60,
            tries: 3
        }))))
    );
    out.clear();
    bot.fight("Cóc Xanh", 5, 5, now, &mut out);
    assert_eq!(sends(&out, 15), 0, "{out:?}");
    assert!(
        logged(
            &out,
            "Đợi xác nhận người chơi (captcha trong app) rồi mới đánh tiếp"
        ),
        "{out:?}"
    );
    // The answer of LG1: (198, 168), (524, 163), (83, 341).
    out.clear();
    bot.captcha_answer(id, &[(198, 168), (524, 163), (83, 341)], &mut out);
    assert_eq!(
        sent(&out, 1283).as_deref(),
        Some("00907a332a0300c600a8020c00a300530155")
    );
    // Outside the picture, or for another captcha: nothing goes out.
    out.clear();
    bot.captcha_answer(id, &[(640, 10)], &mut out);
    bot.captcha_answer(id + 1, &[(10, 10)], &mut out);
    assert_eq!(sends(&out, 1283), 0);
    // Passed: the window closes and the job fights.
    out.clear();
    let verdict = hex("01907a332a00000000001858c3a163206e68e1baad6e207468c3a06e682063c3b46e67");
    bot.on_packet(1283, &verdict, now, &mut out).unwrap();
    assert!(out.contains(&Out::Captcha(CaptchaUi::Verdict {
        passed: true,
        text: "Xác nhận thành công".into()
    })));
    assert!(logged(&out, "Captcha: Xác nhận thành công"), "{out:?}");
    assert_eq!(sends(&out, 15), 1, "{out:?}");

    // The time over: the window closes and the job ends.
    let (mut bot, mut out, now, _) = coc_xanh_bot();
    bot.on_packet(1283, &challenge(7), now, &mut out).unwrap();
    bot.fight("Cóc Xanh", 5, 5, now, &mut out);
    assert_eq!(bot.deadline(), Some(now + Duration::from_secs(60)));
    out.clear();
    bot.on_timer(now + Duration::from_secs(60), &mut out);
    assert!(out.contains(&Out::Captcha(CaptchaUi::Close)), "{out:?}");
    assert!(bot
        .snap
        .job
        .as_ref()
        .unwrap()
        .done
        .as_deref()
        .unwrap()
        .starts_with("Chưa xác nhận người chơi"));

    // No captcha waiting and the server says the player is not verified: the job ends.
    let (mut bot, mut out, now, _) = coc_xanh_bot();
    bot.fight("Cóc Xanh", 5, 5, now, &mut out);
    let notice = Writer::new()
        .u8(0)
        .string("Chưa xác nhận người chơi, trận này không có thưởng")
        .build();
    bot.on_packet(1256, &notice, now, &mut out).unwrap();
    assert!(bot
        .snap
        .job
        .as_ref()
        .unwrap()
        .done
        .as_deref()
        .unwrap()
        .starts_with("Chưa xác nhận người chơi"));
    // Not verified, a new fight job or quest run is refused: the battles would give nothing until a new login.
    out.clear();
    bot.fight("Cóc Xanh", 5, 5, now, &mut out);
    bot.quest(1, None, now, &mut out);
    assert_eq!(sends(&out, 15), 0, "{out:?}");
    assert!(
        out.iter().any(
            |o| matches!(o, Out::Log(_, t) if t.starts_with("Chưa đánh: Chưa xác nhận người chơi"))
        ),
        "{out:?}"
    );
    assert!(
        out.iter().any(|o| matches!(o, Out::Log(_, t) if t.starts_with("Chưa làm nhiệm vụ: Chưa xác nhận người chơi"))),
        "{out:?}"
    );
}

/// s2c/1283 type 2 (u8 2; i32 id, 5 bytes: kakami, minika, susimi 25/11 10:52–10:53): the server closes a captcha left
/// unanswered during play. The window closes and the job ends, as with its time over; for one already gone, a line only.
#[test]
fn the_server_closing_a_captcha_ends_the_job_as_its_time_over() {
    let mut challenge = Writer::new().u8(0).i32(0x756948a4).build();
    challenge.extend_from_slice(&60u16.to_be_bytes());
    challenge.push(3);
    challenge.extend(Writer::new().bytes(&[0x89, b'P']).build());
    let (mut bot, mut out, now, _) = coc_xanh_bot();
    bot.fight("Cóc Xanh", 5, 5, now, &mut out);
    bot.on_packet(1283, &challenge, now, &mut out).unwrap();
    out.clear();
    bot.on_packet(1283, &hex("02756948a4"), now, &mut out)
        .unwrap();
    assert!(out.contains(&Out::Captcha(CaptchaUi::Close)), "{out:?}");
    assert!(logged(&out, "Server đóng captcha chưa giải: trận đánh không có thưởng tới khi xác nhận; đăng nhập lại để vào lại"), "{out:?}");
    assert!(bot
        .snap
        .job
        .as_ref()
        .unwrap()
        .done
        .as_deref()
        .unwrap()
        .starts_with("Chưa xác nhận người chơi"));
    // Already gone (its time over first): said, nothing else.
    out.clear();
    bot.on_packet(1283, &hex("02756948a4"), now, &mut out)
        .unwrap();
    assert_eq!(
        out,
        vec![Out::Log(
            LogKind::Server,
            "Server đóng captcha đã hết giờ".into()
        )]
    );
}

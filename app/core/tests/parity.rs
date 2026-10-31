// The Rust core against the TypeScript side: vectors.json is written by `npm run export:rust` from test/fixtures.ts and
// what the TS decoders, request builders, battle replay and bestMove compute (src/export-rust.ts).
use cllt_core::atlas::{find_upwards, Atlas, MapRecord};
use cllt_core::battle::{
    self, battle_result, best_move, legal_moves, settle, swap, Board, Fighter, Move, Strategy, N,
};
use cllt_core::bot::{
    duration_text, BattleRecord, BattleResult, BattleSource, Bot, BotOptions, FightSettings,
    ItemAct, LogKind, Out,
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
fn board(v: &Value) -> Board {
    let mut b = [0i16; N * N];
    for (i, x) in v.as_array().unwrap().iter().enumerate() {
        b[i] = x.as_i64().unwrap() as i16;
    }
    b
}

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
            "characterExtra" => serde_json::to_value(items::character_extra(&p).unwrap()),
            "inventory" => serde_json::to_value(items::inventory(&p).unwrap()),
            "characterGear" => serde_json::to_value(items::character_gear(&p).unwrap()),
            "currencies" => serde_json::to_value(items::currencies(&p).unwrap()),
            "gearUpdate" => serde_json::to_value(items::gear_update(&p).unwrap()),
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

/// The bag, gear and money cases on their own, so they report even while a decoder elsewhere in the list is missing.
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
            "currencies" => serde_json::to_value(items::currencies(&p).unwrap()),
            "gearUpdate" => serde_json::to_value(items::gear_update(&p).unwrap()),
            _ => continue,
        }
        .unwrap();
        assert_eq!(got, case["expected"], "{f} {}", case["hex"]);
        seen += 1;
    }
    assert_eq!(seen, 7);
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
    // A bag that does not read is logged, and the one shown stays.
    assert!(out.is_empty());
    bot.on_packet(1187, &[1], now, &mut out).unwrap();
    assert_eq!(ids(&bot), Some((42, vec![0, 412, 147, 48, 306, 415, 1])));
    assert!(
        matches!(&out[..], [Out::Log(_, l)] if l.contains("s2c/1187")),
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
        .u8(0)
        .u8(0)
        .u8(0)
        .u8(0)
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

/// s2c/19 ending the battle against mob61000 with a loss.
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
        .u8(0)
        .u8(0)
        .u8(0)
        .u8(0)
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
        Writer::new().string("mob61000").u8(0).build()
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
        Writer::new().string("mob62000").u8(0).build()
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

#[test]
fn step_actions_read_what_step_action_reads() {
    for c in v()["stepActions"].as_array().unwrap() {
        let text = c["text"].as_str().unwrap();
        let got = step_action(text, c["npcId"].as_i64().unwrap() as i32);
        assert_eq!(serde_json::to_value(got).unwrap(), c["action"], "{text}");
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
    for d in a["destinations"].as_array().unwrap() {
        let got = atlas.destination(
            d["id"].as_i64().unwrap() as i32,
            d["name"].as_str().unwrap(),
            d["from"].as_str().unwrap(),
        );
        assert_eq!(got.as_deref(), d["mapId"].as_str(), "destination {d}");
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
            Writer::new().string("mob61000").u8(0).build()
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
            Writer::new().string("mob61000").u8(0).build()
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
            &Out::Send(11, Writer::new().string("M2").u8(0xff).i32(-1).build()),
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
            Writer::new().string("mob61000").u8(0).build()
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

fn logged(out: &[Out], text: &str) -> bool {
    out.iter()
        .any(|o| matches!(o, Out::Log(_, t) if t.starts_with(text)))
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
    // Z1: s2c/13 in the long form with the zone last, then c2s/11 of zone 4 as the phone asked it in B2.
    out.clear();
    bot.on_packet(13, &hex("000000024d32000000010004"), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out, 11).as_deref(), Some("000000024d320400000000"));
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
    let hops = |bot: &Bot, id: &str| {
        bot.snapshot()
            .maps
            .into_iter()
            .find(|m| m.map_id == id)
            .and_then(|m| m.hops)
    };
    // From M2: M1 and M25 one portal away; Cửu Phong only behind Hồng Giang, which the atlas has no way through.
    assert_eq!(
        ["M2", "M1", "M25", "M10"].map(|id| hops(&bot, id)),
        [Some(0), Some(1), Some(1), None]
    );
    bot.go_to("M2", now, &mut out);
    assert!(logged(&out, "Chưa đi tới Trại Vân Sơn: đang ở map này"));
    bot.go_to("M10", now, &mut out);
    assert!(logged(
        &out,
        "Chưa đi tới Cửu Phong: chưa biết đường qua cổng tới đó"
    ));
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

/// Lái Buôn's menu (s2c/57) and Dược phẩm shop (s2c/1190) of P5, as npcMenu and shopList of src/world.ts read them.
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
        (6, 0, "Chưa mua Búa Sửa Chữa: số lượng phải từ 1 tới 99"),
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
    bot.set_fight(fight, &mut out);
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
    let (mut bot, mut out, now, _) = broken_gear_bot(FightSettings { repair: true });
    bot.item(ItemAct::Repair(2), now, &mut out);
    out.clear();
    bot.fight("Cóc Xanh", 1, 1, now, &mut out);
    assert_eq!((sends(&out, 48), sends(&out, 15)), (0, 1), "{out:?}");

    let (mut bot, mut out, now, setup) = broken_gear_bot(FightSettings { repair: true });
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
    bot.set_fight(FightSettings::default(), &mut out);
    assert!(logged(&out, "Tắt tự sửa đồ"));
}

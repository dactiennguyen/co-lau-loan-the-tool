// The Rust core against the TypeScript side: vectors.json is written by `npm run export:rust` from test/fixtures.ts and
// what the TS decoders, request builders, battle replay and bestMove compute (src/export-rust.ts).
use cllt_core::atlas::{Atlas, MapRecord};
use cllt_core::battle::{
    self, battle_result, best_move, legal_moves, settle, swap, Board, Fighter, Move, Strategy, N,
};
use cllt_core::bot::{Bot, BotOptions, Out};
use cllt_core::potentials::StatPlan;
use cllt_core::protocol::*;
use cllt_core::quest::step_action;
use cllt_core::requests::{build, Ctx};
use cllt_core::runner::{Act, BattleEnd, BattleRunner, RunnerOptions, Turn};
use cllt_core::world;
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
            other => panic!("no Rust decoder for {other}"),
        }
        .unwrap();
        assert_eq!(got, case["expected"], "{f} {}", case["hex"]);
    }
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
    assert!(matches!(out.last(), Some(Out::Log(t)) if t.contains("đang đổi chỗ")));
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
    assert!(out.contains(&Out::Log("Trận của việc trước: thua, +0 EXP".into())));
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
        |o| matches!(o, Out::Log(t) if t.starts_with("Trận với Cóc Xanh từ thách đấu trước"))
    ));
    bot.on_packet(19, &lost_battle(), now + Duration::from_secs(20), &mut out)
        .unwrap();
    let job = bot.snap.job.clone().unwrap();
    assert_eq!(
        (job.target.as_str(), job.fights, job.losses, job.done),
        ("Cua Càng", 1, 0, None)
    );
    assert!(out.contains(&Out::Log("Trận của việc trước: thua, +0 EXP".into())));
}

#[test]
fn a_setup_after_stop_is_played_out_and_one_nobody_asked_for_is_not() {
    let (mut bot, mut out, now, setup) = coc_xanh_bot();
    // No challenge sent: nothing is played.
    bot.on_packet(22, &setup, now, &mut out).unwrap();
    assert_eq!(sends(&out, 18), 0);
    assert!(out.contains(&Out::Log("Có trận không do app mở; bỏ qua".into())));
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
        |o| matches!(o, Out::Log(t) if t.starts_with("Không đọc được NPC và cổng của Rừng Trúc"))
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
                    Out::Log(_) => None,
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
    assert!(out.contains(&Out::Log("Đã rời trận (s2c/1214)".into())));
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

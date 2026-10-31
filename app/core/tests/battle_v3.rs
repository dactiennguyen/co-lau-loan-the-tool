// The battle algorithm v3 of the Rust core against the TypeScript side (07-auto-battle.md#thuật-toán-v2,
// #chọn-hành-động): `battleV3` of vectors.json, written by `npm run export:rust` (battleV3 of src/export-rust.ts), holds
// what skillEffect, mobMoveOdds, answerValue, bestMove (win, farm), castSkill, destroyPatterns and bestAction compute;
// the runner and bot tests below play the cases of test/battle-actions.test.ts and test/battle.test.ts. What depends on
// Math.exp is written rounded (HP to 1e-6, the mob's odds to 1e-9) so that the file is the same when CI exports it on
// x86, where V8's exp can be a last bit away from arm64; on the machine of the port it matched to the bit.
use cllt_core::atlas::Atlas;
use cllt_core::battle::{
    self, answer_value, battle_item_result, battle_result, best_move, cast_skill, mob_block,
    mob_move_odds, Board, Fighter, MobBlock, MobModel, Strategy, N, UNKNOWN,
};
use cllt_core::battle_actions::{
    best_action, destroy_patterns, learnt_skills, skill_effect, skill_worth, sword_prior, Action,
    ActionOptions, Buffs, Potion, SkillEffect, Stat,
};
use cllt_core::bot::{Algorithm, Bot, BotOptions, Out};
use cllt_core::protocol::{Reader, Writer};
use cllt_core::requests::{build, Ctx};
use cllt_core::runner::{Act, Skill};
use cllt_core::runner_v3::{BattleRunner, Memory, RunnerOptions};
use cllt_core::skills::SkillDef;
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

fn all() -> Value {
    serde_json::from_str(include_str!("vectors.json")).unwrap()
}
fn v3() -> Value {
    all()["battleV3"].take()
}
fn trees() -> Value {
    serde_json::from_str::<Value>(include_str!("../../../data/skills.json")).unwrap()["trees"]
        .take()
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
/// `got` is the number the TS side wrote rounded to `grid`.
fn near(got: f64, want: &Value, grid: f64) -> bool {
    (got - want.as_f64().unwrap()).abs() <= grid
}
const HP: f64 = 1e-6;
const ODDS: f64 = 1e-9;
fn board(v: &Value) -> Board {
    let mut b = [0i16; N * N];
    for (i, x) in v.as_array().unwrap().iter().enumerate() {
        b[i] = x.as_i64().unwrap() as i16;
    }
    b
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
fn strategy(v: &Value) -> Strategy {
    Strategy {
        extra_turn: v["extraTurn"].as_f64().unwrap(),
        reply: v["reply"].as_f64().unwrap(),
        bonus: v["bonus"]
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, x)| (k.parse().unwrap(), x.as_f64().unwrap()))
            .collect(),
        mob_model: match v["mobModel"].as_str() {
            Some("odds") => MobModel::Odds,
            _ => MobModel::Best,
        },
        lookahead: v["lookahead"].as_f64().unwrap_or(0.0),
    }
}
/// A skill of data/skills.json at a level, as skillEffect reads it.
fn effect(id: i32, level: i32) -> SkillEffect {
    let trees = trees();
    let k = trees
        .as_object()
        .unwrap()
        .values()
        .flat_map(|t| t.as_array().unwrap())
        .find(|k| k["id"] == id)
        .unwrap();
    let l = &k["levels"][level as usize - 1];
    skill_effect(
        id,
        level,
        l["description"].as_str().unwrap(),
        l["mana"].as_i64().unwrap() as i32,
        k["name"].as_str(),
    )
}
fn pairs(v: &Value) -> Vec<(i32, i32)> {
    v.as_array()
        .unwrap()
        .iter()
        .map(|p| (p[0].as_i64().unwrap() as i32, p[1].as_i64().unwrap() as i32))
        .collect()
}
/// JSON equality with numbers compared as numbers (1 and 1.0 alike).
fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Array(x), Value::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(x, y)| same(x, y))
        }
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| same(v, w)))
        }
        _ => a == b,
    }
}

#[test]
fn skill_effect_reads_the_540_descriptions_as_the_ts_side_does() {
    let (v, trees) = (v3(), trees());
    let expected = v["effects"].as_array().unwrap();
    let mut n = 0;
    for k in trees
        .as_object()
        .unwrap()
        .values()
        .flat_map(|t| t.as_array().unwrap())
    {
        for l in k["levels"].as_array().unwrap() {
            let e = skill_effect(
                k["id"].as_i64().unwrap() as i32,
                l["level"].as_i64().unwrap() as i32,
                l["description"].as_str().unwrap(),
                l["mana"].as_i64().unwrap() as i32,
                k["name"].as_str(),
            );
            let got = serde_json::to_value(&e).unwrap();
            assert!(same(&got, &expected[n]), "{got} != {}", expected[n]);
            assert_ne!(e.kind, cllt_core::battle_actions::EffectKind::Unknown);
            n += 1;
        }
    }
    assert_eq!((n, expected.len()), (540, 540));
    let b = effect(1002, 1);
    assert_eq!(
        (b.buff.map(|f| (f.stat, f.amount, f.turns)), b.keep_turn),
        (Some((Stat::Attack, 7, 5)), Some(1.0))
    );
}

#[test]
fn mob_move_odds_and_answer_value_match_the_ts_side() {
    let v = v3();
    for c in v["odds"].as_array().unwrap() {
        let got = mob_move_odds(&board(&c["board"]));
        let want = c["moves"].as_array().unwrap();
        assert_eq!(got.len(), want.len());
        for (g, w) in got.iter().zip(want) {
            assert_eq!(serde_json::to_value(g.mv).unwrap(), w["move"]);
            assert!(
                near(g.p, &w["p"], ODDS),
                "p of {:?}: {} != {}",
                g.mv,
                g.p,
                w["p"]
            );
            assert_eq!(
                serde_json::to_value(&g.outcome.cleared).unwrap(),
                w["cleared"]
            );
            assert_eq!(g.outcome.extra_turn, w["extraTurn"].as_bool().unwrap());
        }
    }
    for (i, c) in v["answers"].as_array().unwrap().iter().enumerate() {
        let (b, me, mob) = (board(&c["board"]), side(&c["me"]), side(&c["mob"]));
        let best = answer_value(&b, &mob, &me, &Strategy::kill());
        let odds = answer_value(&b, &mob, &me, &Strategy::win());
        assert!(near(best, &c["best"], HP), "position {i}: best {best}");
        assert!(near(odds, &c["odds"], HP), "position {i}: odds {odds}");
    }
}

#[test]
fn best_move_with_win_and_farm_picks_what_the_ts_search_picks() {
    for (i, c) in v3()["moves"].as_array().unwrap().iter().enumerate() {
        let s = strategy(&c["strategy"]);
        let pick = best_move(&board(&c["board"]), &side(&c["me"]), &side(&c["mob"]), &s);
        match pick {
            None => assert!(c["move"].is_null(), "position {i}: no move"),
            Some(p) => {
                assert_eq!(
                    serde_json::to_value(p.mv).unwrap(),
                    c["move"],
                    "position {i}"
                );
                assert!(near(p.score, &c["score"], HP), "position {i}: {}", p.score);
            }
        }
    }
}

#[test]
fn cast_skill_decides_as_the_ts_side() {
    for c in v3()["casts"].as_array().unwrap() {
        let (b, me, mob) = (board(&c["board"]), side(&c["me"]), side(&c["mob"]));
        let s = strategy(&c["strategy"]);
        for x in c["cases"].as_array().unwrap() {
            let swap = x[0].as_f64();
            assert_eq!(
                cast_skill(&b, &me, &mob, &s, swap),
                x[1].as_bool().unwrap(),
                "swap {swap:?}, me {me:?}, mob {mob:?}"
            );
        }
    }
}

#[test]
fn destroy_patterns_learnt_skills_and_priors_match() {
    let v = v3();
    for c in v["patterns"].as_array().unwrap() {
        let e = effect(
            c["id"].as_i64().unwrap() as i32,
            c["level"].as_i64().unwrap() as i32,
        );
        let mut x = c["seed"].as_u64().unwrap();
        let mut lcg = || {
            x = (x * 16807) % 2147483647;
            x as f64 / 2147483647.0
        };
        let got = destroy_patterns(&e, &mut lcg, 3);
        assert_eq!(
            serde_json::to_value(&got).unwrap(),
            c["patterns"],
            "{} {}",
            e.id,
            e.level
        );
    }
    for c in v["learnt"].as_array().unwrap() {
        let tree: Vec<SkillDef> =
            serde_json::from_value(trees()[c["element"].as_str().unwrap()].take()).unwrap();
        let levels: BTreeMap<i32, i32> = pairs(&c["levels"]).into_iter().collect();
        let got: Vec<Value> = learnt_skills(&tree, &levels)
            .iter()
            .map(|e| serde_json::json!([e.id, e.level, e.kind, e.cost]))
            .collect();
        assert_eq!(Value::Array(got), c["skills"]);
    }
    for p in v["priors"].as_array().unwrap() {
        let (a, l) = (p[0].as_i64().unwrap() as i32, p[1].as_i64().unwrap() as i32);
        assert_eq!(sword_prior(a, l), p[2].as_f64().unwrap());
    }
    for c in v["worths"].as_array().unwrap() {
        let skills: Vec<SkillEffect> = pairs(&c["skills"])
            .into_iter()
            .map(|(i, l)| effect(i, l))
            .collect();
        let (damage, cost) = skill_worth(c["sword"].as_f64().unwrap(), &skills);
        assert_eq!(
            (damage, cost),
            (
                c["worth"]["skillDamage"].as_f64().unwrap(),
                c["worth"]["skillCost"].as_f64().unwrap()
            )
        );
    }
}

/// Every replayed position with a set of learnt skills, potions and buffs, and the decisions of
/// test/battle-actions.test.ts: the same actions in the same order, the same pick, the same scores.
#[test]
fn best_action_picks_and_scores_what_the_ts_side_does() {
    let mut cases = 0;
    for (i, c) in v3()["actions"].as_array().unwrap().iter().enumerate() {
        let name = c["name"]
            .as_str()
            .map_or(format!("position {i}"), String::from);
        let skills: Vec<SkillEffect> = pairs(&c["skills"])
            .into_iter()
            .map(|(id, l)| effect(id, l))
            .collect();
        let potions: Vec<Potion> = c["potions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| Potion {
                slot: p["slot"].as_i64().unwrap() as i32,
                item_id: p["itemId"].as_i64().unwrap() as i32,
                quantity: p["quantity"].as_i64().unwrap() as i32,
            })
            .collect();
        let turns = |k: &str| c["buffs"][k].as_i64().unwrap_or(0) as i32;
        let o = ActionOptions {
            skills: &skills,
            potions: &potions,
            potion_cost: c["potionCost"].as_f64().unwrap_or(f64::INFINITY),
            spend: c["spend"].as_f64().unwrap_or(1.0),
            buffs: Buffs {
                attack: turns("attack"),
                defense: turns("defense"),
                dodge: turns("dodge"),
            },
            ..ActionOptions::default()
        };
        let mut me = side(&c["me"]);
        (me.skill_damage, me.skill_cost) = skill_worth(me.sword, &skills);
        assert_eq!(me, side(&c["me"]), "{name}: skill worth");
        let got = best_action(
            &board(&c["board"]),
            &me,
            &side(&c["mob"]),
            &strategy(&c["strategy"]),
            &o,
        );
        let want = c["all"].as_array().unwrap();
        let labels = |v: Vec<&str>| v.join(", ");
        assert_eq!(
            labels(got.iter().map(|a| a.label.as_str()).collect()),
            labels(want.iter().map(|a| a["label"].as_str().unwrap()).collect()),
            "{name}: actions, best first"
        );
        for (g, w) in got.iter().zip(want) {
            assert!(
                near(g.score, &w["score"], HP),
                "{name}: {} {} != {}",
                g.label,
                g.score,
                w["score"]
            );
            match (g.action, &w["action"]) {
                (Action::Swap(m), a) => {
                    assert_eq!(serde_json::to_value(m).unwrap(), a["move"], "{name}")
                }
                (Action::Skill(id), a) => assert_eq!(id as i64, a["id"].as_i64().unwrap()),
                (Action::Item { slot, item_id }, a) => {
                    assert_eq!(
                        (slot as i64, item_id as i64),
                        (a["slot"].as_i64().unwrap(), a["itemId"].as_i64().unwrap())
                    )
                }
            }
        }
        cases += 1;
    }
    assert_eq!(cases, 69);
}

#[test]
fn heal_and_potion_results_the_mob_block_and_c2s_44_read_and_build_as_the_ts_side() {
    let v = v3();
    let heal = &v["healResult"];
    let got = battle_result(&hex(heal["hex"].as_str().unwrap()), 20).unwrap();
    assert_eq!(serde_json::to_value(&got).unwrap(), heal["expected"]);
    assert_eq!(
        (got.skill, got.refill.len(), got.units[0].hp),
        (Some(4001), 0, 34)
    );
    let item = &v["itemResult"];
    let got = battle_item_result(&hex(item["hex"].as_str().unwrap())).unwrap();
    assert_eq!(serde_json::to_value(&got).unwrap(), item["expected"]);
    for c in v["mobBlocks"].as_array().unwrap() {
        let got = mob_block(&hex(c["hex"].as_str().unwrap()), c["id"].as_str().unwrap());
        assert_eq!(serde_json::to_value(&got).unwrap(), c["expected"]);
    }
    let r = &v["request44"];
    let ctx = Ctx {
        battle_uuid: r["ctx"]["battleUuid"].as_str(),
        slot: Some(4),
        ..Ctx::default()
    };
    assert_eq!(tohex(&build(44, &ctx).unwrap()), r["hex"].as_str().unwrap());
}

// The runner with the learnt skills, as the runner tests of test/battle-actions.test.ts.

/// Two moves on a board of unknown cells: three drops at the top and three swords lower down.
fn two_moves() -> Board {
    let mut b = [UNKNOWN; N * N];
    for (r, c, v) in [
        (0, 0, 4),
        (0, 1, 4),
        (0, 2, 2),
        (1, 2, 4),
        (5, 0, 0),
        (5, 1, 0),
        (5, 2, 1),
        (6, 2, 0),
    ] {
        b[r * N + c] = v;
    }
    b
}
fn setup(me: &str, level: i32, hp: i32, max_hp: i32, b: Board) -> battle::Setup {
    battle::Setup {
        me: me.into(),
        level,
        hp,
        max_hp,
        uuid: "u".into(),
        board: b.to_vec(),
        turn_seconds: 30,
    }
}
fn packet(name: &str) -> Vec<u8> {
    let all = all();
    let want = if name == "own" { 1 } else { 0 };
    hex(all["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["fn"] == "turnState" && d["expected"]["playerTurn"] == want)
        .unwrap()["hex"]
        .as_str()
        .unwrap())
}
fn chi_huy() -> Option<MobBlock> {
    Some(MobBlock {
        name: "Chỉ Huy Sơn Tặc".into(),
        element: 2,
        level: 10,
        hp: 202,
        max_hp: 202,
    })
}
/// The skill (c2s/20), slot (c2s/44) or nothing of the last request sent.
fn last_sent(acts: &[Act]) -> Option<(i32, i32)> {
    acts.iter().rev().find_map(|a| match a {
        Act::Send(op, p) => {
            let mut r = Reader::new(p);
            r.string().unwrap();
            let x = match op {
                20 => (r.i32().unwrap(), r.i32().unwrap()).1,
                44 => (r.i32().unwrap(), r.i32().unwrap()).1,
                _ => 0,
            };
            Some((*op, x))
        }
        _ => None,
    })
}
fn logs(acts: &[Act]) -> Vec<&str> {
    acts.iter()
        .filter_map(|a| match a {
            Act::Log(t) => Some(t.as_str()),
            _ => None,
        })
        .collect()
}

#[test]
fn runner_with_the_learnt_skills_heals_when_low_and_says_why() {
    let options = RunnerOptions {
        skills: Some(vec![effect(4000, 2), effect(4001, 1)]),
        strategy: Strategy::win(),
        attack: Some(23),
        level: 16,
        mob: chi_huy(),
        ..RunnerOptions::default()
    };
    let mut runner = BattleRunner::new(
        &setup("Ttuananh", 16, 40, 150, two_moves()),
        "mob872600",
        options,
    );
    assert_eq!(runner.me.sword, 25.0 / 3.0);
    assert_eq!((runner.mob.hp, runner.mob.max_hp), (202.0, 202.0));
    (runner.me.s1, runner.mob.s1, runner.mob.skill_damage) = (50.0, 30.0, 43.0);
    let (mut acts, now) = (vec![], Instant::now());
    runner
        .on_packet(24, &packet("own"), now, &mut acts)
        .unwrap();
    assert_eq!(last_sent(&acts), Some((20, 4001)));
    let line = logs(&acts)[0];
    assert!(
        line.contains("chọn Hàn Lưu Thánh Thủy (Hàn Lưu Thánh Thủy"),
        "{line}"
    );
    assert!(
        line.contains("Băng Tiễn Thuật")
            && line.contains("đổi viên")
            && line.contains("HP quái 202"),
        "{line}"
    );
}

#[test]
fn a_potion_without_answer_is_not_tried_again_and_own_sword_is_kept_per_kind_of_mob() {
    let memory = Memory::default();
    let options = RunnerOptions {
        skills: Some(vec![effect(4000, 2), effect(4001, 1)]),
        potions: vec![Potion {
            slot: 8,
            item_id: 0,
            quantity: 1,
        }],
        potion_cost: Some(300.0),
        strategy: Strategy::win(),
        attack: Some(23),
        level: 16,
        mob: chi_huy(),
        memory: Arc::clone(&memory),
        ..RunnerOptions::default()
    };
    let make = |mob_id: &str, o: &RunnerOptions| {
        BattleRunner::new(
            &setup("Ttuananh", 16, 40, 150, two_moves()),
            mob_id,
            o.clone(),
        )
    };
    let mut runner = make("mob872600", &options);
    (runner.mob.s1, runner.mob.skill_damage) = (30.0, 43.0);
    let (mut acts, now) = (vec![], Instant::now());
    runner
        .on_packet(24, &packet("own"), now, &mut acts)
        .unwrap();
    assert_eq!(
        last_sent(&acts),
        Some((44, 8)),
        "no nội lực for the heal: the potion"
    );
    assert_eq!(runner.deadline(), Some(now + Duration::from_secs(3)));
    runner.on_timer(now + Duration::from_secs(3), &mut acts);
    assert_eq!(
        last_sent(&acts).map(|s| s.0),
        Some(19),
        "no answer: the swap"
    );
    assert!(logs(&acts)
        .iter()
        .any(|l| l.starts_with("Bình ở ô 8 không được trả lời ở lượt")));
    runner
        .on_packet(24, &packet("own"), now, &mut acts)
        .unwrap();
    assert_eq!(
        last_sent(&acts).map(|s| s.0),
        Some(19),
        "the slot is taken as empty"
    );
    assert_eq!(runner.potions()[0].quantity, 0);
    let unit = battle::Unit {
        name: "Ttuananh".into(),
        damage: 22,
        b: 0,
        hp: -1,
        s1: -1,
        s2: -1,
    };
    runner.learn_me(&unit, &[(0, 3)], false);
    let keys: Vec<String> = memory.lock().unwrap().keys().cloned().collect();
    assert_eq!(keys, ["me>Chỉ Huy Sơn Tặc.sword"]);
    assert_eq!(
        make("mob872601", &options).me.sword,
        (25.0 / 3.0 * 6.0 + 22.0) / 9.0,
        "the same kind: what was learnt"
    );
    let other = RunnerOptions {
        mob: Some(MobBlock {
            name: "Sơn Tặc".into(),
            element: 1,
            level: 9,
            hp: 248,
            max_hp: 248,
        }),
        ..options.clone()
    };
    assert_eq!(
        make("mob42000", &other).me.sword,
        25.0 / 3.0,
        "another kind: the prior from Tấn công"
    );
}

#[test]
fn the_mobs_hp_comes_from_s2c_22_and_one_battle_starts_the_next() {
    let memory = Memory::default();
    let coc = |name: &str| RunnerOptions {
        mob: Some(MobBlock {
            name: name.into(),
            element: 4,
            level: 13,
            hp: 249,
            max_hp: 249,
        }),
        memory: Arc::clone(&memory),
        ..RunnerOptions::default()
    };
    let b = board(&all()["battles"][0]["board"]);
    let mut first = BattleRunner::new(
        &setup("manina", 21, 238, 238, b),
        "mob61000",
        coc("Cóc Xanh"),
    );
    assert_eq!(
        (first.mob.hp, first.mob.max_hp, first.me.yinyang),
        (249.0, 249.0, 2.0)
    );
    let unit = battle::Unit {
        name: "mob61000".into(),
        damage: 33,
        b: 0,
        hp: -1,
        s1: -1,
        s2: -1,
    };
    first.learn_mob(&unit, &[(0, 3)], false);
    let next = BattleRunner::new(
        &setup("manina", 21, 238, 238, b),
        "mob61001",
        coc("Cóc Xanh"),
    );
    assert_eq!(next.mob.sword, (8.0 * 6.0 + 33.0) / 9.0);
    let keys: Vec<String> = memory.lock().unwrap().keys().cloned().collect();
    assert_eq!(keys, ["Cóc Xanh.sword"]);
    let wolf = BattleRunner::new(
        &setup("manina", 21, 238, 238, b),
        "mob42100",
        coc("Sói Xám"),
    );
    assert_eq!(
        wolf.mob.sword, 8.0,
        "another kind of mob starts from the prior"
    );
}

#[test]
fn s2c_44_sets_the_hp_and_counts_the_potion_down() {
    let options = RunnerOptions {
        skills: Some(vec![]),
        potions: vec![Potion {
            slot: 4,
            item_id: 0,
            quantity: 2,
        }],
        ..RunnerOptions::default()
    };
    let b = board(&all()["battles"][0]["board"]);
    let mut runner = BattleRunner::new(&setup("Ttuananh", 15, 31, 145, b), "mob42017", options);
    let (mut acts, now) = (vec![], Instant::now());
    let item = hex(v3()["itemResult"]["hex"].as_str().unwrap());
    assert!(runner.on_packet(44, &item, now, &mut acts).unwrap());
    assert_eq!((runner.me.hp, runner.potions()[0].quantity), (67.0, 1));
    assert_eq!(
        logs(&acts),
        ["Đã dùng Hoàn Linh Dược (ô 4) ở lượt 1, còn 1"]
    );
}

#[test]
fn without_the_skill_table_the_one_skill_is_cast_when_cast_skill_says_so() {
    let options = |hp| RunnerOptions {
        skill: Some(Skill { id: 1000, cost: 25 }),
        strategy: Strategy::win(),
        mob: Some(MobBlock {
            name: "Cóc Xanh".into(),
            element: 4,
            level: 13,
            hp,
            max_hp: 249,
        }),
        ..RunnerOptions::default()
    };
    let now = Instant::now();
    for (hp, s1, op) in [(20, 25.0, 20), (20, 24.0, 19), (249, 50.0, 20)] {
        let mut runner = BattleRunner::new(
            &setup("manina", 21, 180, 180, two_moves()),
            "mob61000",
            options(hp),
        );
        runner.me.s1 = s1;
        let mut acts = vec![];
        runner
            .on_packet(24, &packet("own"), now, &mut acts)
            .unwrap();
        assert_eq!(
            last_sent(&acts).map(|s| s.0),
            Some(op),
            "mob HP {hp}, nội lực {s1}"
        );
        assert!(logs(&acts).is_empty(), "v2 logs no choice");
    }
}

/// s2c/20 of own skill `skill` that destroys nothing: units unchanged.
fn own_skill_result(seq: i32, skill: i32) -> Vec<u8> {
    Writer::new()
        .i32(seq)
        .i32(0)
        .i32(0)
        .i32(skill)
        .i32(0)
        .i32(0)
        .i32(0)
        .i32(0)
        .bytes(&[])
        .u8(1)
        .string("Ttuananh")
        .i32(-1)
        .u8(0)
        .i32(-1)
        .i32(-1)
        .i32(-1)
        .u8(0)
        .u8(1)
        .u8(0)
        .u8(1)
        .string("Ttuananh")
        .u8(0)
        .build()
}

#[test]
fn a_buff_is_not_cast_again_while_it_lasts() {
    let options = RunnerOptions {
        skills: Some(vec![effect(1002, 1)]),
        strategy: Strategy::win(),
        mob: chi_huy(),
        ..RunnerOptions::default()
    };
    let mut runner = BattleRunner::new(
        &setup("Ttuananh", 16, 150, 150, two_moves()),
        "mob872600",
        options,
    );
    (runner.me.s1, runner.me.sword) = (75.0, 12.0);
    let (mut acts, now) = (vec![], Instant::now());
    runner
        .on_packet(24, &packet("own"), now, &mut acts)
        .unwrap();
    assert_eq!(last_sent(&acts), Some((20, 1002)));
    runner
        .on_packet(20, &own_skill_result(5, 1002), now, &mut acts)
        .unwrap();
    assert_eq!((runner.skills_cast, runner.board), (1, two_moves()));
    for _ in 0..2 {
        runner
            .on_packet(24, &packet("own"), now, &mut acts)
            .unwrap();
        assert_eq!(
            last_sent(&acts).map(|s| s.0),
            Some(19),
            "Đại Lực Công lasts 5 turns, 3 of them own"
        );
    }
    runner
        .on_packet(24, &packet("own"), now, &mut acts)
        .unwrap();
    assert_eq!(last_sent(&acts), Some((20, 1002)), "over: cast again");
}

// The bot fills the runner from what it knows: the skill tree and levels, the bag, Tấn công and level.

fn decoder(name: &str, pick: impl Fn(&Value) -> bool) -> Vec<u8> {
    let all = all();
    hex(all["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["fn"] == name && pick(&d["expected"]))
        .unwrap()["hex"]
        .as_str()
        .unwrap())
}
/// manina (s2c/9 at level 21: Hỏa Cầu Thuật 1, Tấn công 32) on M2 with one Cóc Xanh, the bag of E1 (Hoàn Linh Dược ×4 in
/// slot 0, Kim Đan Dược in slot 7), with or without the s2c/30 tree, in battle up to its first own turn.
fn manina_turn(options: BotOptions, tree: bool) -> Vec<Out> {
    let (mut bot, mut out, now) = (
        Bot::new(options, Arc::new(Atlas::default())),
        vec![],
        Instant::now(),
    );
    let feed = |bot: &mut Bot, op: i32, p: &[u8], out: &mut Vec<Out>| {
        bot.on_packet(op, p, now, out).unwrap()
    };
    feed(
        &mut bot,
        9,
        &decoder("characterProfile", |e| e["level"] == 21),
        &mut out,
    );
    if tree {
        feed(&mut bot, 30, &decoder("skillTable", |_| true), &mut out);
    }
    feed(&mut bot, 42, &decoder("characterExtra", |_| true), &mut out);
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
    feed(&mut bot, 22, &decoder("battleSetup", |_| true), &mut out);
    feed(&mut bot, 18, &hex("000000000000"), &mut out);
    out.clear();
    feed(&mut bot, 24, &packet("own"), &mut out);
    out
}

#[test]
fn the_bot_plays_v3_with_the_skill_table_and_the_bag_and_v2_without_the_table() {
    // The app plays v3, whose runner searches with Strategy::win (runner_options); v1 keeps its `kill`.
    assert_eq!(
        (
            BotOptions::default().algorithm,
            BotOptions::default().strategy
        ),
        (Algorithm::V3, Strategy::kill())
    );
    let potions = BotOptions {
        potion_cost: Some(-1000.0),
        ..BotOptions::default()
    };
    let out = manina_turn(potions.clone(), true);
    let sent: Vec<&Vec<u8>> = out
        .iter()
        .filter_map(|o| match o {
            Out::Send(44, p) => Some(p),
            _ => None,
        })
        .collect();
    assert_eq!(sent.len(), 1, "{out:?}");
    let mut r = Reader::new(sent[0]);
    r.string().unwrap();
    r.i32().unwrap();
    // Kim Đan Dược: 25 nội lực at what Hỏa Cầu Thuật makes of it (W 12 from Tấn công 32 at level 21) beat the 30 HP.
    assert_eq!(r.i32().unwrap(), 7);
    assert!(
        out.iter()
            .any(|o| matches!(o, Out::Log(_, t) if t.starts_with("Lượt 1: chọn Kim Đan Dược"))),
        "{out:?}"
    );
    let out = manina_turn(potions, false);
    assert!(
        out.iter().any(|o| matches!(o, Out::Send(19, _)))
            && !out.iter().any(|o| matches!(o, Out::Send(44, _))),
        "{out:?}"
    );
}

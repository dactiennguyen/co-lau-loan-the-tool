//! Battle algorithm v3 of the app: the port of BattleRunner (src/battle/battle-runner.ts) as the TS bot plays it since v3.
//! One battle over a live session, s2c/22 setup → c2s/18 join → s2c/18 → c2s/14 seq 0 → { s2c/19|20 result; s2c/24 turn
//! → c2s/19 own swap | c2s/14 mob step } until a result carries end=1. Without I/O, as runner.rs, whose types it shares:
//! runner.rs stays the v1 of the app (Q20 `kill`, the account's skill as soon as nội lực pays for it), kept for
//! comparison (BotOptions::algorithm, `cllt fight --algo=v1`).
//!
//! Own turns (07-auto-battle.md#chọn-hành-động): with the learnt skills, best_action of battle_actions.rs (v3) picks
//! among the swaps, the skills the nội lực pays for and the potions; without them, best_move and cast_skill for the one
//! skill of RunnerOptions.skill (v2).
use crate::battle::{
    apply_result, battle_item_result, battle_join_ack, battle_result, best_move, cast_skill,
    fighter, timeout_result, turn_state, unknown_mob, BattleResult, Board, Fighter, MobBlock, Move,
    Outcome, Setup, Strategy, Unit, N, UNKNOWN,
};
use crate::battle_actions::{
    best_action, potion_effect, skill_worth, sword_prior, Action, ActionOptions, Buffs, Potion,
    SkillEffect,
};
use crate::battle_view::{frame, BattleEvent};
use crate::protocol::Result;
use crate::requests::{build, Ctx};
use crate::runner::{desync_line, Act, BattleEnd, Skill, Turn};
use serde_json::{json, Value};

/// A score to a tenth, as the turn notes of the TS bot write it.
fn round1(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Running sums of what battles learnt, kept by the session from battle to battle (BattleIo.memory): keys
/// `me.<value>`, `me><mob name>.sword` and `<mob name>.<value>`, values (total, pieces).
pub type Memory = Arc<Mutex<HashMap<String, (f64, f64)>>>;
fn lock(m: &Memory) -> std::sync::MutexGuard<'_, HashMap<String, (f64, f64)>> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Debug, Clone)]
pub struct RunnerOptions {
    /// Own skill to cast (c2s/20) when cast_skill says so; without an answer in 3 s the turn falls back to a swap. Only
    /// without `skills`.
    pub skill: Option<Skill>,
    /// The learnt skills (battle_actions::learnt_skills): with them every own turn is chosen by best_action among the
    /// swaps, these skills and `potions` (v3).
    pub skills: Option<Vec<SkillEffect>>,
    /// Potions of the bag for best_action; the runner counts down what it uses.
    pub potions: Vec<Potion>,
    /// What a potion without its own cost share costs in HP (ActionOptions::potion_cost); None, the default, never uses
    /// one.
    pub potion_cost: Option<f64>,
    /// Own Tấn công (combat[0] of s2c/9) and level: damage per sword before the first hit, unless memory has it.
    pub attack: Option<i32>,
    pub level: i32,
    /// The mob block of s2c/22 (battle::mob_block): its HP is known from the first move instead of after its first hit.
    pub mob: Option<MobBlock>,
    /// What the earlier battles of the session learnt; the runner adds to it.
    pub memory: Memory,
    pub strategy: Strategy,
    /// Pause between own swaps in a timed battle.
    pub timed_move: Duration,
    /// Chờ trước mỗi lượt đi (FightSettings::turn_pause): every own action waits this long after its turn came, zero to
    /// act at once; in a timed battle the pause between swaps is the longer of it and `timed_move`. With `turn_random`
    /// (Thời gian ngẫu nhiên) each wait lasts from it to twice it.
    pub turn_delay: Duration,
    pub turn_random: bool,
}
impl Default for RunnerOptions {
    fn default() -> Self {
        Self {
            skill: None,
            skills: None,
            potions: vec![],
            potion_cost: None,
            attack: None,
            level: 0,
            mob: None,
            memory: Memory::default(),
            strategy: Strategy::kill(),
            timed_move: Duration::from_millis(1000),
            turn_delay: Duration::ZERO,
            turn_random: false,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Side {
    Me,
    Mob,
}
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Key {
    Sword,
    Heart,
    Yinyang,
    Peach,
    SkillDamage,
    SkillCost,
}
fn get(f: &Fighter, k: Key) -> f64 {
    match k {
        Key::Sword => f.sword,
        Key::Heart => f.heart,
        Key::Yinyang => f.yinyang,
        Key::Peach => f.peach,
        Key::SkillDamage => f.skill_damage,
        Key::SkillCost => f.skill_cost,
    }
}
fn set(f: &mut Fighter, k: Key, v: f64) {
    match k {
        Key::Sword => f.sword = v,
        Key::Heart => f.heart = v,
        Key::Yinyang => f.yinyang = v,
        Key::Peach => f.peach = v,
        Key::SkillDamage => f.skill_damage = v,
        Key::SkillCost => f.skill_cost = v,
    }
}
impl Key {
    const ALL: [Key; 6] = [
        Key::Sword,
        Key::Heart,
        Key::Yinyang,
        Key::Peach,
        Key::SkillDamage,
        Key::SkillCost,
    ];
    /// The name in the memory keys, as the field of Fighter in battle.ts.
    fn name(self) -> &'static str {
        match self {
            Key::Sword => "sword",
            Key::Heart => "heart",
            Key::Yinyang => "yinyang",
            Key::Peach => "peach",
            Key::SkillDamage => "skillDamage",
            Key::SkillCost => "skillCost",
        }
    }
}

enum Wake {
    TimedMove(i32),
    Infer(i32, bool),
}

/// What an own turn waits for: the answer to a skill (c2s/20) or to an item of a bag slot (c2s/44).
#[derive(Debug, Clone, Copy, PartialEq)]
enum Waiting {
    Skill(i32),
    Item(i32),
}
/// Without an answer by `at` the turn `seq` falls back to the swap picked with it.
#[derive(Debug, Clone, Copy)]
struct Wait {
    at: Instant,
    seq: i32,
    what: Waiting,
    fallback: Option<Move>,
}

pub struct BattleRunner {
    pub uuid: String,
    pub name: String,
    pub mob_id: String,
    pub board: Board,
    pub me: Fighter,
    pub mob: Fighter,
    pub turns: u32,
    pub skills_cast: u32,
    pub damage: i32,
    /// The board stopped matching the server's: "Bàn cờ lệch" is logged once, until a reshuffle sends the board again.
    desynced: bool,
    /// s2c/18 timed 1: no turns; the mob hits on a ~30 s timer and the player may swap any time.
    pub timed: bool,
    /// Set by leave() until the session sees the battle end or gives up on it (resume): no move is sent, a result still
    /// counts.
    pub leaving: bool,
    /// leave() was called in this battle: a late s2c/1214 still means the server took the surrender.
    pub surrendered: bool,
    /// The last turn passed over while leaving (seq, own turn), for resume().
    missed: Option<(i32, bool)>,
    /// The latest result, for the status of the battle.
    pub last: Option<Turn>,
    /// For the battle window: what changed since the Bot last took them (Runner::take_views).
    pub views: Vec<crate::battle_view::BattleEvent>,
    /// The one skill of RunnerOptions.skill got no answer in this battle.
    skill_refused: bool,
    /// Learnt skills that got no answer in this battle, and the own turns left of each buff cast.
    refused: HashSet<i32>,
    buffs: Buffs,
    /// The potions of RunnerOptions, counted down as they are used.
    potions: Vec<Potion>,
    /// Memory key of the mob's values: its name in s2c/22, else its id. Own damage per sword depends on the mob too
    /// (Tiheo2: 8 against Sơn Tặc, 7.33 against Chỉ Huy Sơn Tặc, A1), so it is kept as `me><mob key>.sword`.
    mob_key: String,
    options: RunnerOptions,
    /// Without an answer to c2s/20 or c2s/44 in 3 s the turn falls back to a swap.
    skill_wait: Option<Wait>,
    /// Next own swap of a timed battle, an own turn waiting for Chờ trước mỗi lượt đi, or the turn inferred 2 s after a
    /// result whose s2c/24 did not come.
    turn_wait: Option<(Instant, Wake)>,
    /// The turn (seq, own) the inferred turn played: its s2c/24, come late, is not played again.
    inferred: Option<(i32, bool)>,
    /// Thời gian ngẫu nhiên of Chờ trước mỗi lượt đi.
    jitter: crate::delay::Jitter,
}

impl BattleRunner {
    /// Priors are the measured values of 07-auto-battle.md: 2 nội lực per own yin-yang, the mob's skill at 25 nội lực
    /// for 4 swords + 11, own damage per sword from Tấn công and level; then what earlier battles of the session learnt.
    pub fn new(setup: &Setup, mob_id: &str, options: RunnerOptions) -> Self {
        let mut board = [UNKNOWN; N * N];
        for (i, &v) in setup.board.iter().take(N * N).enumerate() {
            board[i] = v;
        }
        let mut me = Fighter {
            skill_cost: options.skill.map_or(0.0, |s| s.cost as f64),
            yinyang: 2.0,
            ..fighter(setup.hp as f64, setup.max_hp as f64)
        };
        if let Some(attack) = options.attack {
            me.sword = sword_prior(attack, options.level);
        }
        let mut mob = Fighter {
            skill_cost: 25.0,
            skill_damage: 4.0 * 8.0 + 11.0,
            ..unknown_mob()
        };
        if let Some(m) = &options.mob {
            (mob.hp, mob.max_hp) = (m.hp as f64, m.max_hp as f64);
        }
        let mob_key = options
            .mob
            .as_ref()
            .map_or_else(|| mob_id.to_string(), |m| m.name.clone());
        for (id, &(sum, n)) in lock(&options.memory).iter() {
            let Some((who, key)) = id.rsplit_once('.') else {
                continue;
            };
            let Some(key) = Key::ALL.into_iter().find(|k| k.name() == key) else {
                continue;
            };
            let f = if who == "me" || who == format!("me>{mob_key}") {
                &mut me
            } else if who == mob_key {
                &mut mob
            } else {
                continue;
            };
            // Own damage per sword is kept per kind of mob only.
            if who != "me" || key != Key::Sword {
                set(f, key, sum / n);
            }
        }
        let potions = options.potions.clone();
        Self {
            uuid: setup.uuid.clone(),
            name: setup.me.clone(),
            mob_id: mob_id.to_string(),
            board,
            me,
            mob,
            turns: 0,
            skills_cast: 0,
            damage: 0,
            desynced: false,
            timed: false,
            leaving: false,
            surrendered: false,
            missed: None,
            last: None,
            views: vec![],
            skill_refused: false,
            refused: HashSet::new(),
            buffs: Buffs::default(),
            potions,
            mob_key,
            options,
            skill_wait: None,
            turn_wait: None,
            inferred: None,
            jitter: crate::delay::Jitter::default(),
        }
    }

    /// Chờ trước mỗi lượt đi changed in Cài đặt đánh during the battle: the turns from the next one wait the new time; a
    /// turn waiting already keeps its time.
    pub fn set_turn_delay(&mut self, delay: Duration, random: bool) {
        (self.options.turn_delay, self.options.turn_random) = (delay, random);
    }

    /// Chờ trước mỗi lượt đi as it is now: zero while off.
    fn pause(&mut self) -> Duration {
        self.jitter
            .wait(self.options.turn_delay, self.options.turn_random)
    }

    /// An own turn came (s2c/24, s2c/18 of a timed battle, inferred, or given back by resume): played at once, or after
    /// Chờ trước mỗi lượt đi, through the timer of turn_wait.
    fn own_turn(&mut self, seq: i32, now: Instant, out: &mut Vec<Act>) {
        match self.pause() {
            d if d.is_zero() => self.my_move(seq, now, out),
            d => self.turn_wait = Some((now + d, Wake::TimedMove(seq))),
        }
    }

    /// Potions left of those RunnerOptions gave.
    pub fn potions(&self) -> &[Potion] {
        &self.potions
    }
    /// None of the potion `item_id` is used for the rest of the battle (its setting was turned off).
    pub fn drop_potions(&mut self, item_id: i32) {
        for p in self.potions.iter_mut().filter(|p| p.item_id == item_id) {
            p.quantity = 0;
        }
    }

    fn send(&self, out: &mut Vec<Act>, opcode: i32, ctx: Ctx) {
        let ctx = Ctx {
            battle_uuid: Some(&self.uuid),
            ..ctx
        };
        out.push(match build(opcode, &ctx) {
            Ok(payload) => Act::Send(opcode, payload),
            Err(e) => Act::Log(crate::requests::unbuilt(opcode, &e)),
        });
    }

    pub fn start(&self, out: &mut Vec<Act>) {
        self.send(out, 18, Ctx::default());
    }

    /// Surrenders as the game's "Đầu hàng" → OK does (06-map-mobs): c2s/11 for the map, then c2s/40. The session reads
    /// the server's answer; clearing `leaving` plays on from the next turn (s2c/24, or s2c/21 in a timed battle).
    pub fn leave(&mut self, map_id: &str, out: &mut Vec<Act>) {
        // An own turn of a turn battle waiting for Chờ trước mỗi lượt đi is the turn passed over: resume() plays it.
        let waiting = match self.turn_wait {
            Some((_, Wake::TimedMove(seq))) if !self.timed => Some((seq, true)),
            _ => None,
        };
        (self.skill_wait, self.turn_wait, self.missed) = (None, None, waiting);
        (self.leaving, self.surrendered) = (true, true);
        let map = Ctx {
            map_id: Some(map_id),
            ..Ctx::default()
        };
        self.send(out, 11, map);
        self.send(out, 40, Ctx::default());
    }

    /// Gives up a surrender the server did not take: plays the turn passed over while leaving, if one came.
    pub fn resume(&mut self, now: Instant, out: &mut Vec<Act>) {
        self.leaving = false;
        // At once, without Chờ trước mỗi lượt đi: the turn has waited for the surrender already.
        match self.missed.take() {
            Some((seq, true)) => self.my_move(seq, now, out),
            Some((seq, false)) => self.step(seq, out),
            None => {}
        }
    }

    pub fn deadline(&self) -> Option<Instant> {
        [
            self.skill_wait.as_ref().map(|w| w.at),
            self.turn_wait.as_ref().map(|w| w.0),
        ]
        .into_iter()
        .flatten()
        .min()
    }

    pub fn on_timer(&mut self, now: Instant, out: &mut Vec<Act>) {
        if let Some(w) = self.skill_wait.filter(|w| w.at <= now) {
            self.skill_wait = None;
            let seq = w.seq;
            match w.what {
                // Not tried again in this battle.
                Waiting::Skill(id) => {
                    self.refused.insert(id);
                    if self.options.skill.is_some_and(|k| k.id == id) {
                        self.skill_refused = true;
                    }
                    out.push(Act::Log(format!(
                        "{} không được trả lời ở lượt {seq}, chuyển sang đổi viên",
                        self.skill_name(id)
                    )));
                }
                // The slot is taken as empty for the rest of the battle.
                Waiting::Item(slot) => {
                    for p in self.potions.iter_mut().filter(|p| p.slot == slot) {
                        p.quantity = 0;
                    }
                    out.push(Act::Log(format!(
                        "Bình ở ô {slot} không được trả lời ở lượt {seq}, chuyển sang đổi viên"
                    )));
                }
            }
            self.swap_move(seq, w.fallback, out);
        }
        if self.turn_wait.as_ref().is_some_and(|w| w.0 <= now) {
            match self.turn_wait.take().unwrap().1 {
                Wake::TimedMove(seq) => self.my_move(seq, now, out),
                Wake::Infer(seq, mine) => {
                    self.inferred = Some((seq, mine));
                    if mine {
                        self.own_turn(seq, now, out)
                    } else {
                        self.step(seq, out)
                    }
                }
            }
        }
    }

    /// The s2c/24 of a turn already taken: the one the inferred turn played (s2c/24 more than 2 s late), or an own turn
    /// while the answer to its skill or potion is awaited. Playing it would send a second c2s/19, c2s/20 or c2s/44 for
    /// the same turn, a second potion before the first is counted.
    fn played(&self, seq: i32, mine: bool) -> bool {
        self.inferred == Some((seq, mine)) || (mine && self.skill_wait.is_some())
    }

    /// Returns false for packets that are not part of the battle.
    pub fn on_packet(
        &mut self,
        opcode: i32,
        payload: &[u8],
        now: Instant,
        out: &mut Vec<Act>,
    ) -> Result<bool> {
        match opcode {
            18 => {
                self.timed = battle_join_ack(payload)?.timed == 1;
                // The mob moves first in a turn battle; in a timed one the player moves at will.
                self.views.push(BattleEvent::Turn {
                    seq: 0,
                    mine: self.timed,
                    timed: self.timed,
                });
                if self.leaving {
                    self.missed = Some((0, self.timed));
                } else if self.timed {
                    self.own_turn(0, now, out)
                } else {
                    self.step(0, out)
                }
            }
            24 => {
                let t = turn_state(payload)?;
                // Left as it is: the turn after it may be inferred already.
                if self.played(t.seq, t.player_turn == 1) {
                    return Ok(true);
                }
                // The s2c/24 again of the own turn waiting for Chờ trước mỗi lượt đi: it keeps its time.
                let waiting = matches!(self.turn_wait, Some((_, Wake::TimedMove(s))) if s == t.seq);
                if waiting && t.player_turn == 1 && !self.timed {
                    return Ok(true);
                }
                self.turn_wait = None;
                self.views.push(BattleEvent::Turn {
                    seq: t.seq,
                    mine: t.player_turn == 1,
                    timed: self.timed,
                });
                if self.leaving {
                    self.missed = Some((t.seq, t.player_turn == 1));
                } else if t.player_turn == 1 {
                    self.own_turn(t.seq, now, out)
                } else {
                    self.step(t.seq, out)
                }
            }
            19 | 20 => self.on_result(battle_result(payload, opcode)?, now, out),
            21 => self.on_result(timeout_result(payload)?, now, out),
            // An item of the bag used in battle: the unit line carries the new HP.
            44 => {
                let x = battle_item_result(payload)?;
                let p = self.potions.iter_mut().find(|p| p.slot == x.slot);
                let name = p
                    .as_ref()
                    .and_then(|p| potion_effect(p.item_id))
                    .map_or("vật phẩm", |e| e.name);
                // What the battle may still drink of it (Bot::battle_potions), not what the bag holds. Never below 0: an
                // answer late after the slot was taken as empty (no answer in time, or its setting turned off).
                let left = p.map(|p| {
                    p.quantity = (p.quantity - 1).max(0);
                    format!(", trận này còn được dùng {}", p.quantity)
                });
                out.push(Act::Log(format!(
                    "Đã dùng {name} (ô {}) ở lượt {}{}",
                    x.slot,
                    x.seq,
                    left.unwrap_or_default()
                )));
                self.on_result(x.into_result(), now, out)
            }
            _ => return Ok(false),
        }
        Ok(true)
    }

    fn step(&self, seq: i32, out: &mut Vec<Act>) {
        self.send(
            out,
            14,
            Ctx {
                seq: Some(seq),
                ..Ctx::default()
            },
        );
    }

    /// The search settings: in a timed battle the mob hits on a timer and never moves pieces, so there is nothing to
    /// answer and no turn to keep.
    fn strategy(&self) -> Strategy {
        let s = self.options.strategy.clone();
        match self.timed {
            true => Strategy {
                reply: 0.0,
                extra_turn: 0.0,
                lookahead: 0.0,
                ..s
            },
            false => s,
        }
    }

    fn my_move(&mut self, seq: i32, now: Instant, out: &mut Vec<Act>) {
        if self.options.skills.is_some() {
            return self.choose_action(seq, now, out);
        }
        let s = self.strategy();
        let pick = best_move(&self.board, &self.me, &self.mob, &s);
        let (score, fallback) = (pick.as_ref().map(|p| p.score), pick.map(|p| p.mv));
        let cast = self.options.skill.filter(|_| {
            !self.skill_refused && cast_skill(&self.board, &self.me, &self.mob, &s, score)
        });
        let scores: Vec<Value> = score
            .map(|x| json!(["swap", round1(x)]))
            .into_iter()
            .collect();
        let pick = cast.map_or_else(|| "swap".to_string(), |k| format!("skill {}", k.id));
        let mob_hp = Some(self.mob.hp).filter(|v| v.is_finite());
        out.push(Act::Note(
            "turn",
            json!({ "seq": seq, "pick": pick, "hp": self.me.hp, "stat1": self.me.s1, "stat2": self.me.s2, "mobHp": mob_hp, "mobStat1": self.mob.s1, "mobStat2": self.mob.s2, "scores": scores }),
        ));
        match cast {
            Some(k) => self.cast_own(seq, k.id, fallback, now, out),
            None => self.swap_move(seq, fallback, out),
        }
    }

    /// best_action over the swaps, the skills the nội lực pays for and the potions (chooseAction of battle-runner.ts).
    fn choose_action(&mut self, seq: i32, now: Instant, out: &mut Vec<Act>) {
        let s = self.strategy();
        let skills: Vec<SkillEffect> = self
            .options
            .skills
            .iter()
            .flatten()
            .filter(|e| !self.refused.contains(&e.id))
            .cloned()
            .collect();
        self.buffs.tick();
        (self.me.skill_damage, self.me.skill_cost) = skill_worth(self.me.sword, &skills);
        let all = best_action(
            &self.board,
            &self.me,
            &self.mob,
            &s,
            &ActionOptions {
                skills: &skills,
                potions: &self.potions,
                potion_cost: self.options.potion_cost.unwrap_or(f64::INFINITY),
                buffs: self.buffs,
                ..ActionOptions::default()
            },
        );
        let fallback = all.iter().find_map(|a| match a.action {
            Action::Swap(m) => Some(m),
            _ => None,
        });
        // Every own turn into the battle data (battle_record.rs): the pick and the three best actions, as the TS bot.
        let scores: Vec<Value> = all
            .iter()
            .take(3)
            .map(|a| json!([a.label, round1(a.score)]))
            .collect();
        let mob_hp = Some(self.mob.hp).filter(|v| v.is_finite());
        out.push(Act::Note(
            "turn",
            json!({ "seq": seq, "pick": all.first().map(|a| a.label.clone()), "hp": self.me.hp, "stat1": self.me.s1, "stat2": self.me.s2, "mobHp": mob_hp, "mobStat1": self.mob.s1, "mobStat2": self.mob.s2, "scores": scores }),
        ));
        // Why it cast, healed or swapped stays in the battle data only: the log shows what happened in the game.
        match all.first().map(|a| a.action) {
            Some(Action::Skill(id)) => self.cast_own(seq, id, fallback, now, out),
            Some(Action::Item { slot, .. }) => self.use_item(seq, slot, fallback, now, out),
            _ => self.swap_move(seq, fallback, out),
        }
    }

    fn skill_name(&self, id: i32) -> String {
        self.options
            .skills
            .iter()
            .flatten()
            .find(|e| e.id == id)
            .and_then(|e| e.name.clone())
            .unwrap_or_else(|| format!("Kỹ năng {id}"))
    }

    fn cast_own(
        &mut self,
        seq: i32,
        id: i32,
        fallback: Option<Move>,
        now: Instant,
        out: &mut Vec<Act>,
    ) {
        let ctx = Ctx {
            seq: Some(seq),
            skill: Some(id),
            ..Ctx::default()
        };
        self.send(out, 20, ctx);
        self.skill_wait = Some(Wait {
            at: now + Duration::from_secs(3),
            seq,
            what: Waiting::Skill(id),
            fallback,
        });
    }
    fn use_item(
        &mut self,
        seq: i32,
        slot: i32,
        fallback: Option<Move>,
        now: Instant,
        out: &mut Vec<Act>,
    ) {
        let ctx = Ctx {
            slot: Some(slot),
            ..Ctx::default()
        };
        self.send(out, 44, ctx);
        self.skill_wait = Some(Wait {
            at: now + Duration::from_secs(3),
            seq,
            what: Waiting::Item(slot),
            fallback,
        });
    }

    fn swap_move(&mut self, seq: i32, mv: Option<Move>, out: &mut Vec<Act>) {
        let Some(mv) = mv else {
            out.push(Act::Log(format!("Không còn nước đi ở lượt {seq}")));
            return;
        };
        self.turns += 1;
        self.send(
            out,
            19,
            Ctx {
                seq: Some(seq),
                mv: Some(mv),
                ..Ctx::default()
            },
        );
    }

    fn side(&mut self, s: Side) -> &mut Fighter {
        match s {
            Side::Me => &mut self.me,
            Side::Mob => &mut self.mob,
        }
    }

    fn on_result(&mut self, x: BattleResult, now: Instant, out: &mut Vec<Act>) {
        self.skill_wait = None;
        self.turn_wait = None;
        let skill = x.skill.is_some();
        if skill && x.actor == self.name {
            self.skills_cast += 1;
            let buff = self
                .options
                .skills
                .iter()
                .flatten()
                .find(|e| Some(e.id) == x.skill)
                .and_then(|e| e.buff);
            if let Some(b) = buff {
                self.buffs.set(b.stat, (b.turns as f64 / 2.0).ceil() as i32);
            }
        }
        // Hỏa Kiếm Thuật turns its cells into Kiếm lửa; the effect of a mob's skill is not known.
        let fire = self
            .options
            .skills
            .iter()
            .flatten()
            .find(|e| skill && x.actor == self.name && Some(e.id) == x.skill)
            .map(|e| e.fire.is_some());
        let before_board = self.board;
        let applied = apply_result(&mut self.board, &x, fire);
        let fire_used = applied.fire;
        if applied.desync && !self.desynced {
            out.push(Act::Log(desync_line(&x, &self.name)));
        }
        self.desynced |= applied.desync;
        let o = applied.outcome;
        if let Some(b) = &x.new_board {
            for (i, &v) in b.iter().take(N * N).enumerate() {
                self.board[i] = v;
            }
            self.desynced = false;
        }
        let side = if x.actor == self.name {
            Side::Me
        } else {
            Side::Mob
        };
        let before = (self.me, self.mob);
        if let Some(unit) = x.units.iter().find(|u| u.name == x.actor) {
            self.learn_from(side, unit, &o, skill);
            if side == Side::Me && unit.damage > 0 {
                self.damage = self.damage.saturating_add(unit.damage);
            }
        }
        for u in &x.units {
            let s = if u.name == self.name {
                Side::Me
            } else if u.name == self.mob_id {
                Side::Mob
            } else {
                continue;
            };
            let damage = self.damage as f64;
            let f = self.side(s);
            // The mob's HP shows up after its first hit; its max is that plus the damage dealt so far.
            if u.hp >= 0 {
                if s == Side::Mob && f.max_hp.is_infinite() {
                    f.max_hp = u.hp as f64 + damage;
                }
                f.hp = u.hp as f64;
                f.max_hp = f.max_hp.max(u.hp as f64);
            }
            if u.s1 >= 0 {
                f.s1 = u.s1 as f64;
            }
            if u.s2 >= 0 {
                f.s2 = u.s2 as f64;
            }
        }
        self.last = Some(self.turn(&x, side, &o, before));
        if let Some(t) = &self.last {
            let v = frame(
                &before_board,
                &x,
                fire_used,
                &self.board,
                t,
                &self.me,
                &self.mob,
            );
            self.views.push(v);
        }
        if !x.end && self.leaving {
            let again = self.timed || (x.actor == self.name) == x.extra_turn;
            self.missed = Some((x.seq, again));
            return;
        }
        if !x.end {
            self.turn_wait = Some(if self.timed {
                let pause = self.options.timed_move.max(self.pause());
                (now + pause, Wake::TimedMove(x.seq))
            } else {
                let again = (x.actor == self.name) == x.extra_turn;
                (now + Duration::from_secs(2), Wake::Infer(x.seq, again))
            });
            return;
        }
        // What the battle taught it, into the battle data as the TS bot's `estimates` (07-auto-battle.md#ghi-trận).
        let learnt = |f: &Fighter| {
            json!({ "sword": round1(f.sword), "heart": round1(f.heart), "yinyang": round1(f.yinyang), "peach": round1(f.peach),
                "skillCost": round1(f.skill_cost), "skillDamage": round1(f.skill_damage) })
        };
        let mob_max_hp = Some(self.mob.max_hp).filter(|v| v.is_finite());
        out.push(Act::Note(
            "estimates",
            json!({ "mobId": self.mob_id, "mobMaxHp": mob_max_hp, "me": learnt(&self.me), "mob": learnt(&self.mob) }),
        ));
        let won = x.reward.as_ref().map_or(x.actor == self.name, |w| w.won);
        out.push(Act::End(BattleEnd {
            won,
            actor: x.actor.clone(),
            exp: x.reward.as_ref().map(|w| w.exp),
            coin: x.reward.as_ref().map(|w| w.coin),
            my_turns: self.turns,
            hp: self.me.hp,
            mob_id: self.mob_id.clone(),
            damage: self.damage,
        }));
    }

    /// What `x` did, from both sides as they were `before` it (own, mob's) and as they are now.
    fn turn(&self, x: &BattleResult, side: Side, o: &Outcome, before: (Fighter, Fighter)) -> Turn {
        let hp = |f: Fighter| {
            Some([f.hp, f.max_hp])
                .filter(|v| v.iter().all(|x| x.is_finite()))
                .map(|v| v.map(|x| x.round() as i32))
        };
        let ((was, other_was), (after, other)) = match side {
            Side::Me => (before, (self.me, self.mob)),
            Side::Mob => ((before.1, before.0), (self.mob, self.me)),
        };
        let change = |now: f64, was: f64| {
            if now.is_finite() && was.is_finite() {
                (now - was).round() as i32
            } else {
                0
            }
        };
        Turn {
            n: self.last.as_ref().map_or(0, |t| t.n) + 1,
            mine: side == Side::Me,
            foe: String::new(),
            skill: x.skill,
            eaten: o
                .cleared
                .iter()
                .filter(|(_, &n)| n > 0)
                .map(|(&k, &n)| (k, n))
                .collect(),
            // The actor's unit carries the damage it dealt; without one, the HP the other side lost.
            damage: x
                .units
                .iter()
                .find(|u| u.name == x.actor && u.damage >= 0)
                .map_or_else(|| (-change(other.hp, other_was.hp)).max(0), |u| u.damage),
            heal: change(after.hp, was.hp).max(0),
            s1: change(after.s1, was.s1),
            s2: change(after.s2, was.s2),
            hp: hp(self.me).unwrap_or_default(),
            mob_hp: hp(self.mob),
            extra_turn: x.extra_turn,
            end: x.end,
        }
    }

    /// What the actor's pieces did in this result, read before its unit updates the state (learnFrom of battle-runner.ts):
    /// damage per sword (dodges included, doubled hits left out), HP per heart (unless capped at the max), stat1 per
    /// yin-yang, stat2 per peach, and the damage of a skill (its cost stays at the 25 nội lực every side was seen paying).
    fn learn_from(&mut self, side: Side, u: &Unit, o: &Outcome, skill: bool) {
        let f = *self.side(side);
        if skill {
            if u.damage >= 0 {
                self.learn(side, Key::SkillDamage, u.damage as f64, 1.0);
            }
            return;
        }
        let (hp, s1, s2) = (u.hp as f64, u.s1 as f64, u.s2 as f64);
        if o.n(0) > 0.0 && u.damage >= 0 && f.s2 < 100.0 {
            self.learn(side, Key::Sword, u.damage as f64, o.n(0));
        }
        if o.n(1) > 0.0 && u.hp >= 0 && hp < f.max_hp && f.hp.is_finite() {
            self.learn(side, Key::Heart, hp - f.hp, o.n(1));
        }
        if o.n(2) > 0.0 && s1 >= f.s1 {
            self.learn(side, Key::Yinyang, s1 - f.s1, o.n(2));
        }
        if o.n(3) > 0.0 && u.s2 >= 0 && u.s2 < 100 && f.s2 < 100.0 {
            self.learn(side, Key::Peach, s2 - f.s2, o.n(3));
        }
    }
    /// Adds `total` over `pieces` to the running sum behind a value, seeded with the value as `prior` pieces, and kept in
    /// the session's memory under `me.<key>`, `me><mob key>.sword` or `<mob key>.<key>`.
    fn learn(&mut self, side: Side, key: Key, total: f64, pieces: f64) {
        let who = match side {
            Side::Me if key == Key::Sword => format!("me>{}", self.mob_key),
            Side::Me => "me".into(),
            Side::Mob => self.mob_key.clone(),
        };
        let prior = if matches!(key, Key::SkillDamage | Key::SkillCost) {
            1.0
        } else {
            6.0
        };
        let current = get(self.side(side), key);
        let value = {
            let mut seen = lock(&self.options.memory);
            let id = format!("{who}.{}", key.name());
            let (sum, n) = *seen.get(&id).unwrap_or(&(current * prior, prior));
            seen.insert(id, (sum + total, n + pieces));
            (sum + total) / (n + pieces)
        };
        set(self.side(side), key, value);
    }

    /// For tests: the learnt values of the mob after `units` of one result.
    pub fn learn_mob(&mut self, unit: &Unit, cleared: &[(i16, u32)], skill: bool) {
        let o = Outcome {
            cleared: cleared.iter().copied().collect(),
            ..Outcome::default()
        };
        self.learn_from(Side::Mob, unit, &o, skill);
    }
    /// For tests: the same for own values.
    pub fn learn_me(&mut self, unit: &Unit, cleared: &[(i16, u32)], skill: bool) {
        let o = Outcome {
            cleared: cleared.iter().copied().collect(),
            ..Outcome::default()
        };
        self.learn_from(Side::Me, unit, &o, skill);
    }
}

/// Which runner plays the battles of a Bot (BotOptions::algorithm): v3 in the app; v1 is runner.rs as the app played
/// before v3, kept for comparison (`cllt fight --algo=v1`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Algorithm {
    V1,
    #[default]
    V3,
}
impl Algorithm {
    pub fn key(self) -> &'static str {
        match self {
            Algorithm::V1 => "v1",
            Algorithm::V3 => "v3",
        }
    }
}

/// The battle being played, by either runner: what the Bot asks of it.
pub enum Runner {
    V1(Box<crate::runner::BattleRunner>),
    V3(Box<BattleRunner>),
}

macro_rules! both {
    ($self:ident, $r:ident => $e:expr) => {
        match $self {
            Runner::V1($r) => $e,
            Runner::V3($r) => $e,
        }
    };
}

impl Runner {
    pub fn algorithm(&self) -> Algorithm {
        match self {
            Runner::V1(_) => Algorithm::V1,
            Runner::V3(_) => Algorithm::V3,
        }
    }
    pub fn start(&self, out: &mut Vec<Act>) {
        both!(self, r => r.start(out))
    }
    pub fn leave(&mut self, map_id: &str, out: &mut Vec<Act>) {
        both!(self, r => r.leave(map_id, out))
    }
    pub fn resume(&mut self, now: Instant, out: &mut Vec<Act>) {
        both!(self, r => r.resume(now, out))
    }
    pub fn deadline(&self) -> Option<Instant> {
        both!(self, r => r.deadline())
    }
    pub fn on_timer(&mut self, now: Instant, out: &mut Vec<Act>) {
        both!(self, r => r.on_timer(now, out))
    }
    pub fn on_packet(
        &mut self,
        opcode: i32,
        payload: &[u8],
        now: Instant,
        out: &mut Vec<Act>,
    ) -> Result<bool> {
        both!(self, r => r.on_packet(opcode, payload, now, out))
    }
    pub fn mob_id(&self) -> &str {
        both!(self, r => &r.mob_id)
    }
    pub fn me(&self) -> &Fighter {
        both!(self, r => &r.me)
    }
    pub fn mob(&self) -> &Fighter {
        both!(self, r => &r.mob)
    }
    pub fn turns(&self) -> u32 {
        both!(self, r => r.turns)
    }
    pub fn timed(&self) -> bool {
        both!(self, r => r.timed)
    }
    pub fn leaving(&self) -> bool {
        both!(self, r => r.leaving)
    }
    pub fn surrendered(&self) -> bool {
        both!(self, r => r.surrendered)
    }
    pub fn last(&self) -> Option<&Turn> {
        both!(self, r => r.last.as_ref())
    }
    /// What the battle window has not been told yet (battle_view.rs), oldest first.
    pub fn take_views(&mut self) -> Vec<BattleEvent> {
        both!(self, r => std::mem::take(&mut r.views))
    }
    pub fn board(&self) -> &crate::battle::Board {
        both!(self, r => &r.board)
    }
    /// The potions the battle may still drink; v1 drinks none.
    pub fn potions(&self) -> &[Potion] {
        match self {
            Runner::V1(_) => &[],
            Runner::V3(r) => r.potions(),
        }
    }
    /// A kind of potion turned off mid-battle (v3 only).
    pub fn drop_potions(&mut self, id: i32) {
        if let Runner::V3(r) = self {
            r.drop_potions(id);
        }
    }
    /// Chờ trước mỗi lượt đi changed mid-battle (v3 only).
    pub fn set_turn_delay(&mut self, delay: Duration, random: bool) {
        if let Runner::V3(r) = self {
            r.set_turn_delay(delay, random);
        }
    }
}

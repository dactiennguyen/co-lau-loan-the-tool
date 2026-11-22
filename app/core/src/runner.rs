//! Port of BattleRunner (src/battle/battle-runner.ts): one battle over a live session. s2c/22 setup → c2s/18 join → s2c/18 →
//! c2s/14 seq 0 → { s2c/19|20 result; s2c/24 turn → c2s/19 own swap | c2s/14 mob step } until a result carries end=1.
//! Without I/O: packets and the clock come in, actions go out, and `deadline()` says when `on_timer` is due.
use crate::battle::{
    apply_result, battle_join_ack, battle_result, best_move, fighter, timeout_result, turn_state,
    unknown_mob, BattleResult, Board, Fighter, Outcome, Setup, Strategy, Unit, N, UNKNOWN,
};
use crate::battle_view::{frame, BattleEvent};
use crate::protocol::Result;
use crate::requests::{build, Ctx};
use std::collections::HashMap;
use std::time::{Duration, Instant};

/// The line of the first result the board stops matching (a fault, net::is_fault, so Log lỗi keeps the packets before
/// it): the turn, and whose swap, skill or turn it was.
pub(crate) fn desync_line(x: &BattleResult, me: &str) -> String {
    let who = if x.actor == me {
        "của mình"
    } else {
        "của quái"
    };
    let what = match (x.skill, x.mv) {
        (Some(id), _) => format!("kỹ năng {id}"),
        (None, Some(_)) => "nước đổi chỗ".into(),
        (None, None) => "lượt".into(),
    };
    format!("Bàn cờ lệch với server ở lượt {}, sau {what} {who}", x.seq)
}

#[derive(Debug, Clone, PartialEq)]
pub enum Act {
    Send(i32, Vec<u8>),
    Log(String),
    /// For the battle data only (battle_record.rs), not the log: what an own turn picked and why ("turn").
    Note(&'static str, serde_json::Value),
    End(BattleEnd),
}

#[derive(Debug, Clone, PartialEq)]
pub struct BattleEnd {
    pub won: bool,
    pub actor: String,
    pub exp: Option<i32>,
    pub coin: Option<i32>,
    pub my_turns: u32,
    pub hp: f64,
    pub mob_id: String,
    /// Damage dealt to the mob in this battle (what a boss step counts).
    pub damage: i32,
}

/// What one result (s2c/19, 20, 21) did: the desktop shows the last one under the log line its battle opened on.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    /// Results of the battle so far, this one included.
    pub n: u32,
    /// The player moved, else the mob.
    pub mine: bool,
    /// Name of the mob; the Bot fills it in (the runner knows its id only).
    pub foe: String,
    /// Skill cast (s2c/20).
    pub skill: Option<i32>,
    /// Pieces eaten (`battle::kind`: 0 sword, 1 heart, 2 yin-yang, 3 peach, 4 drop, 5 star, 70 gold), kinds ascending.
    pub eaten: Vec<(i16, u32)>,
    /// Damage dealt to the other side.
    pub damage: i32,
    /// HP the actor gained.
    pub heal: i32,
    /// Changes of the actor's nội lực (s1) and sức mạnh (s2).
    pub s1: i32,
    pub s2: i32,
    /// Own HP and max HP after it.
    pub hp: [i32; 2],
    /// The mob's, once a result showed its HP. Its max is that HP plus the damage dealt before it (on_result).
    pub mob_hp: Option<[i32; 2]>,
    pub extra_turn: bool,
    pub end: bool,
}

/// Own skill to cast (c2s/20) once own stat1 reaches `cost`; `1000:25` is Hỏa Cầu Thuật.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Skill {
    pub id: i32,
    pub cost: i32,
}

#[derive(Debug, Clone)]
pub struct RunnerOptions {
    pub skill: Option<Skill>,
    pub strategy: Strategy,
    /// Pause between own swaps in a timed battle.
    pub timed_move: Duration,
    /// Whether the second swap of a battle opened with timed 1 waits at least human::TURN_OR_TIMED for an s2c/24 that
    /// shows a turn battle: every mob battle since c2s/15 flag 1; never Bạch Hổ's, whose boss is always timed and whose
    /// waits are its window's (0 by default).
    pub wait_for_turns: bool,
}
impl Default for RunnerOptions {
    fn default() -> Self {
        Self {
            skill: None,
            strategy: Strategy::kill(),
            timed_move: Duration::from_millis(1000),
            wait_for_turns: true,
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

enum Wake {
    TimedMove(i32),
    Infer(i32, bool),
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
    skill_refused: bool,
    /// Running sums behind each learnt value: (total, pieces), seeded with the default as `prior` pieces.
    seen: HashMap<(Side, Key), (f64, f64)>,
    options: RunnerOptions,
    /// Without an answer to c2s/20 in 3 s the turn falls back to a swap.
    skill_wait: Option<(Instant, i32)>,
    /// Next own swap of a timed battle, or the turn inferred 2 s after a result whose s2c/24 did not come.
    turn_wait: Option<(Instant, Wake)>,
    /// The turn (seq, own) the inferred turn played: its s2c/24, come late, is not played again.
    inferred: Option<(i32, bool)>,
}

impl BattleRunner {
    pub fn new(setup: &Setup, mob_id: &str, options: RunnerOptions) -> Self {
        let mut board = [UNKNOWN; N * N];
        for (i, &v) in setup.board.iter().take(N * N).enumerate() {
            board[i] = v;
        }
        let me = Fighter {
            skill_cost: options.skill.map_or(0.0, |s| s.cost as f64),
            ..fighter(setup.hp as f64, setup.max_hp as f64)
        };
        Self {
            uuid: setup.uuid.clone(),
            name: setup.me.clone(),
            mob_id: mob_id.to_string(),
            board,
            me,
            mob: unknown_mob(),
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
            seen: HashMap::new(),
            options,
            skill_wait: None,
            turn_wait: None,
            inferred: None,
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

    /// Surrenders as the game's "Đầu hàng" → OK does (06-map-mobs): c2s/11 for the map (`map`: the zone stood in and the
    /// map's index, game 1.1.1), then c2s/40. The session reads the server's answer; clearing `leaving` plays on from the
    /// next turn (s2c/24, or s2c/21 in a timed battle).
    pub fn leave(&mut self, map: Ctx, out: &mut Vec<Act>) {
        (self.skill_wait, self.turn_wait, self.missed) = (None, None, None);
        (self.leaving, self.surrendered) = (true, true);
        self.send(out, 11, map);
        self.send(out, 40, Ctx::default());
    }

    /// Gives up a surrender the server did not take: plays the turn passed over while leaving, if one came.
    pub fn resume(&mut self, now: Instant, out: &mut Vec<Act>) {
        self.leaving = false;
        match self.missed.take() {
            Some((seq, true)) => self.my_move(seq, now, out),
            Some((seq, false)) => self.step(seq, out),
            None => {}
        }
    }

    pub fn deadline(&self) -> Option<Instant> {
        [
            self.skill_wait.as_ref().map(|w| w.0),
            self.turn_wait.as_ref().map(|w| w.0),
        ]
        .into_iter()
        .flatten()
        .min()
    }

    pub fn on_timer(&mut self, now: Instant, out: &mut Vec<Act>) {
        if let Some((at, seq)) = self.skill_wait {
            if at <= now {
                self.skill_wait = None;
                self.skill_refused = true;
                out.push(Act::Log(format!(
                    "Kỹ năng không được trả lời ở lượt {seq}, chuyển sang đổi viên"
                )));
                self.swap_move(seq, out);
            }
        }
        if self.turn_wait.as_ref().is_some_and(|w| w.0 <= now) {
            match self.turn_wait.take().unwrap().1 {
                Wake::TimedMove(seq) => self.my_move(seq, now, out),
                Wake::Infer(seq, mine) => {
                    self.inferred = Some((seq, mine));
                    if mine {
                        self.my_move(seq, now, out)
                    } else {
                        self.step(seq, out)
                    }
                }
            }
        }
    }

    /// The s2c/24 of a turn already taken: the one the inferred turn played (s2c/24 more than 2 s late), or an own turn
    /// while the answer to its skill is awaited. Playing it would send a second c2s/19 or c2s/20 for the same turn.
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
                    self.my_move(0, now, out)
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
                // A battle opened with timed 1 that sends turns is a turn battle with the player first (game 1.1.1;
                // runner_v3): no swap on a timer from here.
                self.timed = false;
                self.turn_wait = None;
                self.views.push(BattleEvent::Turn {
                    seq: t.seq,
                    mine: t.player_turn == 1,
                    timed: self.timed,
                });
                if self.leaving {
                    self.missed = Some((t.seq, t.player_turn == 1));
                } else if t.player_turn == 1 {
                    self.my_move(t.seq, now, out)
                } else {
                    self.step(t.seq, out)
                }
            }
            19 | 20 => self.on_result(battle_result(payload, opcode)?, now, out),
            21 => self.on_result(timeout_result(payload)?, now, out),
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

    fn my_move(&mut self, seq: i32, now: Instant, out: &mut Vec<Act>) {
        if let Some(skill) = self
            .options
            .skill
            .filter(|s| !self.skill_refused && self.me.s1 >= s.cost as f64)
        {
            out.push(Act::Note(
                "turn",
                serde_json::json!({ "seq": seq, "pick": format!("skill {}", skill.id), "stat1": self.me.s1 }),
            ));
            self.send(
                out,
                20,
                Ctx {
                    seq: Some(seq),
                    skill: Some(skill.id),
                    ..Ctx::default()
                },
            );
            self.skill_wait = Some((now + Duration::from_secs(3), seq));
            return;
        }
        self.swap_move(seq, out);
    }

    fn swap_move(&mut self, seq: i32, out: &mut Vec<Act>) {
        // In a timed battle the mob hits on a timer and never moves pieces: nothing to answer.
        let s = if self.timed {
            Strategy {
                reply: 0.0,
                ..self.options.strategy.clone()
            }
        } else {
            self.options.strategy.clone()
        };
        let Some(pick) = best_move(&self.board, &self.me, &self.mob, &s) else {
            out.push(Act::Log(format!("Không còn nước đi ở lượt {seq}")));
            return;
        };
        out.push(Act::Note(
            "turn",
            serde_json::json!({ "seq": seq, "pick": "swap", "scores": [["swap", (pick.score * 10.0).round() / 10.0]] }),
        ));
        self.turns += 1;
        self.send(
            out,
            19,
            Ctx {
                seq: Some(seq),
                mv: Some(pick.mv),
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
        }
        // v2 does not read skill effects: Kiếm lửa when only it fits the refill (apply_result).
        let fire = None;
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
                // Until an s2c/24 shows a turn battle, the second swap waits for it a little longer.
                let pause = match self.options.wait_for_turns && x.seq <= 1 {
                    true => self.options.timed_move.max(crate::human::TURN_OR_TIMED),
                    false => self.options.timed_move,
                };
                (now + pause, Wake::TimedMove(x.seq))
            } else {
                let again = (x.actor == self.name) == x.extra_turn;
                (now + Duration::from_secs(2), Wake::Infer(x.seq, again))
            });
            return;
        }
        let r = |v: f64| (v * 10.0).round() / 10.0;
        out.push(Act::Log(format!(
            "Ước lượng: kiếm {} / {} sát thương mỗi viên, HP quái tối đa {}",
            r(self.me.sword),
            r(self.mob.sword),
            if self.mob.max_hp.is_finite() {
                self.mob.max_hp.to_string()
            } else {
                "?".into()
            }
        )));
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

    /// What the actor's pieces did in this result, read before its unit updates the state (learnFrom of battle-runner.ts).
    fn learn_from(&mut self, side: Side, u: &Unit, o: &Outcome, skill: bool) {
        let f = *self.side(side);
        if skill {
            if u.damage >= 0 {
                self.learn(side, Key::SkillDamage, u.damage as f64, 1.0);
            }
            if side == Side::Mob {
                self.learn(side, Key::SkillCost, f.s1, 1.0);
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
    fn learn(&mut self, side: Side, key: Key, total: f64, pieces: f64) {
        let prior = if matches!(key, Key::SkillDamage | Key::SkillCost) {
            1.0
        } else {
            6.0
        };
        let current = get(self.side(side), key);
        let (sum, n) = *self
            .seen
            .get(&(side, key))
            .unwrap_or(&(current * prior, prior));
        self.seen.insert((side, key), (sum + total, n + pieces));
        set(self.side(side), key, (sum + total) / (n + pieces));
    }

    /// For tests: the learnt values of the mob after `units` of one result.
    pub fn learn_mob(&mut self, unit: &Unit, cleared: &[(i16, u32)], skill: bool) {
        let o = Outcome {
            cleared: cleared.iter().copied().collect(),
            ..Outcome::default()
        };
        self.learn_from(Side::Mob, unit, &o, skill);
    }
}

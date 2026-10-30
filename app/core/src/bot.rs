//! What one logged-in account knows and does: the character, map, mobs and current quest from the world packets, and
//! one of two jobs. A fight job ("đánh X N lần") follows QuestBot --farm of src/quest.ts: c2s/15 for a mob, c2s/1178 for
//! a boss of s2c/1177, 8 s for s2c/22, 6 × 5 s of waiting while a boss changes tiles, 3 s of rest between battles, and
//! losses (except to a boss) up to `max_losses`. A quest run ("Tự làm nhiệm vụ") is QuestBot itself: it plays the steps
//! of s2c/39 it knows (talk with c2s/13, kill, boss damage, level, a stat point) and walks through portals when the NPC
//! or mob of a step is in another map. Without I/O, like BattleRunner.
use crate::atlas::{Atlas, MapRecord, Portal};
use crate::battle::{battle_setup, Strategy};
use crate::protocol::{
    character_location, character_prefix, character_profile, map_prefix, Reader, Writer,
};
use crate::quest::{step_action, StepAction};
use crate::requests::{build, Ctx};
use crate::runner::{Act, BattleEnd, BattleRunner, RunnerOptions, Skill};
use crate::world::{
    character_stats, map_boss, map_change, map_data, map_entities, notice, quest_complete,
    quest_data, quest_progress, Mob, Nearby, Place, Quest, ZonePlayers,
};
use std::collections::HashSet;
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq)]
pub enum Out {
    Send(i32, Vec<u8>),
    Log(String),
}

#[derive(Debug, Clone)]
pub struct BotOptions {
    pub skill: Option<Skill>,
    pub strategy: Strategy,
    pub timed_move: Duration,
    pub rest: Duration,
}
impl Default for BotOptions {
    fn default() -> Self {
        Self {
            skill: None,
            strategy: Strategy::kill(),
            timed_move: Duration::from_millis(1000),
            rest: Duration::from_secs(3),
        }
    }
}

/// A mob kind of the current map, as offered in the target list.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub name: String,
    pub level: i32,
    pub boss: bool,
    /// Seen in the current zone right now (a boss changing tiles is not).
    pub here: bool,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub target: String,
    pub count: u32,
    pub max_losses: u32,
    pub fights: u32,
    pub wins: u32,
    pub losses: u32,
    pub damage: i64,
    pub exp: i64,
    pub coin: i64,
    /// Why the job ended; None while it runs.
    pub done: Option<String>,
}

/// "Tự làm nhiệm vụ", or ▶ on one step: the quest run and what it has done so far.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestRun {
    /// Number of the job or run in this session, so the UI tells a new run from the one before.
    pub id: u32,
    /// The step played alone (▶ on it), as its index in the quest; None for the whole quest.
    pub step: Option<i32>,
    /// The step played alone was done: the run ended because the quest moved past it.
    pub step_done: bool,
    pub max_losses: u32,
    pub fights: u32,
    pub wins: u32,
    pub losses: u32,
    pub exp: i64,
    pub coin: i64,
    /// Quests handed in during the run (s2c/35).
    pub completed: u32,
    /// What the bot does for the current step.
    pub doing: String,
    /// Why the run ended; None while it runs.
    pub done: Option<String>,
}

/// A boss of this zone and the tile (column, row) it was last seen on; `moving` between s2c/1177 field 1 and field 0.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BossTile {
    pub id: String,
    pub name: String,
    pub level: i32,
    pub col: i32,
    pub row: i32,
    pub moving: bool,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleView {
    pub mob_id: String,
    pub mob_name: String,
    pub hp: f64,
    pub max_hp: f64,
    pub mob_hp: Option<f64>,
    pub mob_max_hp: Option<f64>,
    pub turns: u32,
    pub timed: bool,
}

/// Everything the UI shows for one account.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Snapshot {
    pub name: String,
    pub level: i32,
    pub hp: i32,
    pub max_hp: i32,
    /// From the tail of s2c/9 at login, then s2c/10 kind 4 after every battle or level up.
    pub exp: Option<i32>,
    pub level_exp: Option<[i32; 2]>,
    pub coin: Option<i32>,
    /// Potential stats (s2c/9, s2c/10 kind 2); [0] is Cường lực.
    pub stats: Vec<i32>,
    /// Attack, defence, then probably accuracy, dodge, critical (s2c/9, extra[1..5] of s2c/10 kind 4).
    pub combat: Option<[i32; 5]>,
    /// Points left to spend (s2c/9, s2c/10 kind 8).
    pub stat_points: Option<i32>,
    pub skill_points: Option<i32>,
    pub map_id: String,
    pub map_name: String,
    pub zone: i32,
    /// Where the character stands, in server units (s2c/11; tiles of 32).
    pub x: i32,
    pub y: i32,
    /// NPCs and portals of the current map.
    pub places: Vec<Place>,
    pub bosses: Vec<BossTile>,
    /// The other players of the zone, highest level first.
    pub players: Vec<Nearby>,
    /// The last s2c/1263 did not read (a player record this decoder does not know): `players` is not the whole zone.
    pub players_unread: bool,
    pub targets: Vec<Target>,
    pub job: Option<Job>,
    /// The current main quest (s2c/39), with the step and progress the bot has seen since.
    pub quest: Option<Quest>,
    pub quest_run: Option<QuestRun>,
    pub battle: Option<BattleView>,
}

/// A challenge (c2s/15, c2s/1178) not answered by s2c/22 yet: the mob, and the job or quest run that sent it.
struct Challenge {
    mob_id: String,
    seq: u32,
    at: Instant,
}
/// A challenge left unanswered this long is taken as refused: no battle opens that late.
const CHALLENGE_KEPT: Duration = Duration::from_secs(60);

enum Wake {
    Next,
    ChallengeTimeout,
    /// A talk, stat point or portal the server did not answer in 8 s, or a level step it did not advance: the quest run
    /// stops with this reason.
    Silence(&'static str),
}

pub struct Bot {
    pub snap: Snapshot,
    mobs: Vec<Mob>,
    /// Ids of the bosses of s2c/1177.
    bosses: HashSet<String>,
    /// Bosses of s2c/1177 by map (name, level), kept while they change tiles, as recordBoss keeps them in the TS atlas.
    seen_bosses: Vec<(String, String, i32)>,
    zone: ZonePlayers,
    /// data/maps.json and what this session has seen since.
    atlas: Atlas,
    options: BotOptions,
    battle: Option<BattleRunner>,
    target: Option<Mob>,
    waits: u32,
    timer: Option<(Instant, Wake)>,
    /// Job each challenge and battle belongs to, so a battle of a replaced job is not counted in the new one.
    job_seq: u32,
    /// Unanswered challenges, oldest first. One that timed out or was sent before Stop stays: its battle may open late.
    challenges: Vec<Challenge>,
    battle_seq: u32,
    /// The portal of the quest run's c2s/13 until s2c/43 of the new map; `hops` counts portals taken for the current
    /// step; `refused` holds the portals the server refused in this run.
    travelling: Option<(i32, String)>,
    hops: u32,
    refused: HashSet<i32>,
    /// A talk or stat-point step is answered by s2c/34 alone.
    awaiting_reply: bool,
    /// The step of a run that plays one: quest id, step index, its text (`playing` of QuestBot with `once`).
    playing: Option<(i32, i32, String)>,
    /// Quest runs started in this session (QuestRun::id).
    runs: u32,
}

impl Bot {
    pub fn new(options: BotOptions, atlas: Arc<Atlas>) -> Self {
        Self {
            snap: Snapshot::default(),
            mobs: vec![],
            bosses: HashSet::new(),
            seen_bosses: vec![],
            zone: ZonePlayers::default(),
            atlas: (*atlas).clone(),
            options,
            battle: None,
            target: None,
            waits: 0,
            timer: None,
            job_seq: 0,
            challenges: vec![],
            battle_seq: 0,
            travelling: None,
            hops: 0,
            refused: HashSet::new(),
            awaiting_reply: false,
            playing: None,
            runs: 0,
        }
    }

    pub fn atlas(&self) -> &Atlas {
        &self.atlas
    }
    fn job_running(&self) -> bool {
        self.snap.job.as_ref().is_some_and(|j| j.done.is_none())
    }
    fn quest_running(&self) -> bool {
        self.snap
            .quest_run
            .as_ref()
            .is_some_and(|r| r.done.is_none())
    }

    pub fn snapshot(&self) -> Snapshot {
        let mut s = self.snap.clone();
        s.targets = self.targets();
        s.players = self.zone.list();
        s.battle = self.battle.as_ref().map(|b| BattleView {
            mob_id: b.mob_id.clone(),
            mob_name: self
                .mobs
                .iter()
                .find(|m| m.id == b.mob_id)
                .map_or_else(|| b.mob_id.clone(), |m| m.name.clone()),
            hp: b.me.hp,
            max_hp: b.me.max_hp,
            mob_hp: Some(b.mob.hp).filter(|v| v.is_finite()),
            mob_max_hp: Some(b.mob.max_hp).filter(|v| v.is_finite()),
            turns: b.turns,
            timed: b.timed,
        });
        s
    }

    /// Bosses of the current map: seen in this session, or in data/maps.json.
    fn map_bosses(&self) -> Vec<(String, i32)> {
        let map = &self.snap.map_id;
        let mut out: Vec<(String, i32)> = self
            .seen_bosses
            .iter()
            .filter(|b| &b.0 == map)
            .map(|b| (b.1.clone(), b.2))
            .collect();
        for k in self.atlas.bosses(map) {
            if !out.iter().any(|b| b.0 == k.name) {
                out.push((k.name.clone(), k.level));
            }
        }
        out
    }

    /// Mob kinds of this zone, plus the bosses of this map changing tiles; bosses first, then the strongest.
    pub fn targets(&self) -> Vec<Target> {
        let mut out: Vec<Target> = vec![];
        for m in &self.mobs {
            if !out.iter().any(|t| t.name == m.name) {
                out.push(Target {
                    name: m.name.clone(),
                    level: m.level,
                    boss: self.bosses.contains(&m.id),
                    here: true,
                });
            }
        }
        for (name, level) in self.map_bosses() {
            match out.iter_mut().find(|t| t.name == name) {
                Some(t) => t.boss = true,
                None => out.push(Target {
                    name,
                    level,
                    boss: true,
                    here: false,
                }),
            }
        }
        out.sort_by(|a, b| b.boss.cmp(&a.boss).then(b.level.cmp(&a.level)));
        out
    }

    fn is_boss(&self, name: &str) -> bool {
        self.mobs
            .iter()
            .any(|m| m.name == name && self.bosses.contains(&m.id))
            || self.map_bosses().iter().any(|b| b.0 == name)
    }

    pub fn deadline(&self) -> Option<Instant> {
        [
            self.timer.as_ref().map(|t| t.0),
            self.battle.as_ref().and_then(|b| b.deadline()),
        ]
        .into_iter()
        .flatten()
        .min()
    }

    pub fn on_timer(&mut self, now: Instant, out: &mut Vec<Out>) {
        if let Some(b) = &mut self.battle {
            if b.deadline().is_some_and(|d| d <= now) {
                let mut acts = vec![];
                b.on_timer(now, &mut acts);
                self.apply(acts, now, out);
            }
        }
        if self.timer.as_ref().is_some_and(|t| t.0 <= now) {
            match self.timer.take().unwrap().1 {
                Wake::Next => self.next(now, out),
                Wake::ChallengeTimeout => {
                    if self.battle.is_none() {
                        out.push(Out::Log(format!(
                            "Server không mở trận với {} sau 8 s",
                            self.target.as_ref().map_or("?", |m| &m.name)
                        )));
                        self.next(now, out);
                    }
                }
                Wake::Silence(reason) => self.finish_quest(reason, out),
            }
        }
    }

    /// Starts a fight job. A job already running is replaced: its battle in progress, or a challenge still waiting for
    /// s2c/22, ends first and is not counted in the new job.
    pub fn fight(
        &mut self,
        target: &str,
        count: u32,
        max_losses: u32,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        if self.quest_running() {
            self.finish_quest("Đã chuyển sang việc đánh quái", out);
        }
        self.snap.job = Some(Job {
            target: target.into(),
            count,
            max_losses,
            fights: 0,
            wins: 0,
            losses: 0,
            damage: 0,
            exp: 0,
            coin: 0,
            done: None,
        });
        self.waits = 0;
        self.job_seq += 1;
        out.push(Out::Log(format!("Bắt đầu: đánh {target} {count} lần")));
        let challenging = matches!(self.timer, Some((_, Wake::ChallengeTimeout)));
        if self.battle.is_none() && !challenging {
            self.next(now, out);
        }
    }
    /// Starts "Tự làm nhiệm vụ" on the current quest, replacing a fight job or quest run as `fight` replaces one. With
    /// `step` = (quest id, step index), ▶ on a step, it plays only that step and ends once the quest moves past it. A step
    /// that is not the current one of that quest, as when the UI was a moment behind, is refused without sending anything:
    /// with nothing running, by a run that has already ended, for the UI to show.
    pub fn quest(
        &mut self,
        max_losses: u32,
        step: Option<(i32, i32)>,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        let playing = step.and_then(|(id, i)| {
            let q = self
                .snap
                .quest
                .as_ref()
                .filter(|q| q.id == id && q.current == i)?;
            Some((id, i, q.steps.get(i as usize)?.text.clone()))
        });
        let index = step.map(|(_, i)| i);
        if let (Some(i), None) = (index, &playing) {
            let reason = "Bước đó không còn là bước đang làm";
            out.push(Out::Log(format!("Không làm bước {}: {reason}", i + 1)));
            if !self.quest_running() && !self.job_running() {
                self.snap.quest_run = Some(self.new_run(max_losses, index, Some(reason.into())));
            }
            return;
        }
        if self.job_running() {
            self.finish("Đã chuyển sang tự làm nhiệm vụ", out);
        }
        if self.quest_running() {
            self.finish_quest("Đã bắt đầu lần chạy mới", out);
        }
        self.snap.quest_run = Some(self.new_run(max_losses, index, None));
        (self.waits, self.hops, self.travelling, self.awaiting_reply) = (0, 0, None, false);
        self.refused.clear();
        self.job_seq += 1;
        out.push(Out::Log(match &playing {
            Some((_, _, text)) => format!("Bắt đầu: làm bước \"{text}\""),
            None => "Bắt đầu: tự làm nhiệm vụ".into(),
        }));
        self.playing = playing;
        let challenging = matches!(self.timer, Some((_, Wake::ChallengeTimeout)));
        if self.battle.is_none() && !challenging {
            self.next(now, out);
        }
    }
    fn new_run(&mut self, max_losses: u32, step: Option<i32>, done: Option<String>) -> QuestRun {
        self.runs += 1;
        QuestRun {
            id: self.runs,
            step,
            step_done: false,
            max_losses,
            fights: 0,
            wins: 0,
            losses: 0,
            exp: 0,
            coin: 0,
            completed: 0,
            doing: String::new(),
            done,
        }
    }
    /// Ends the job or quest run after the battle in progress (a battle cannot be left).
    pub fn stop(&mut self, out: &mut Vec<Out>) {
        let reason = if self.battle.is_some() {
            "Đã dừng; trận đang đánh vẫn tiếp tục tới hết"
        } else {
            "Đã dừng"
        };
        if self.job_running() {
            self.timer = None;
            self.finish(reason, out);
        }
        if self.quest_running() {
            self.finish_quest(reason, out);
        }
    }

    fn finish_quest(&mut self, reason: &str, out: &mut Vec<Out>) {
        if !matches!(self.timer, Some((_, Wake::ChallengeTimeout))) {
            self.timer = None;
        }
        (self.travelling, self.awaiting_reply) = (None, false);
        let what = match self.playing.take() {
            Some(_) => "làm bước",
            None => "tự làm nhiệm vụ",
        };
        if let Some(r) = &mut self.snap.quest_run {
            r.done = Some(reason.into());
            out.push(Out::Log(format!(
                "Kết thúc {what}: {reason} ({} thắng, {} thua, +{} EXP, +{} xu, xong {} nhiệm vụ)",
                r.wins, r.losses, r.exp, r.coin, r.completed
            )));
        }
    }

    fn finish(&mut self, reason: &str, out: &mut Vec<Out>) {
        if let Some(j) = &mut self.snap.job {
            j.done = Some(reason.into());
            out.push(Out::Log(format!(
                "Kết thúc: {reason} ({} thắng, {} thua, +{} EXP, +{} xu)",
                j.wins, j.losses, j.exp, j.coin
            )));
        }
    }

    fn send(out: &mut Vec<Out>, opcode: i32, ctx: Ctx) {
        out.push(Out::Send(opcode, build(opcode, &ctx).expect("request")));
    }

    fn next(&mut self, now: Instant, out: &mut Vec<Out>) {
        if self.battle.is_some() {
            return;
        }
        if self.quest_running() {
            return self.quest_next(now, out);
        }
        let Some(job) = self.snap.job.clone().filter(|j| j.done.is_none()) else {
            return;
        };
        if job.fights >= job.count {
            return self.finish(&format!("Đã đánh đủ {} trận", job.count), out);
        }
        let targets: Vec<Mob> = self
            .mobs
            .iter()
            .filter(|m| m.name == job.target)
            .cloned()
            .collect();
        let boss = self.is_boss(&job.target);
        if targets.is_empty() && boss && self.waits < 6 {
            self.waits += 1;
            out.push(Out::Log(format!(
                "{} đang đổi chỗ, đợi 5 s ({}/6)",
                job.target, self.waits
            )));
            self.timer = Some((now + Duration::from_secs(5), Wake::Next));
            return;
        }
        self.waits = 0;
        if targets.is_empty() {
            return self.finish(&format!("Không thấy {} ở khu này", job.target), out);
        }
        let mob = targets[job.fights as usize % targets.len()].clone();
        let opcode = if boss { 1178 } else { 15 };
        let j = self.snap.job.as_mut().unwrap();
        j.fights += 1;
        out.push(Out::Log(format!(
            "Trận {}/{}: thách đấu {} cấp {} ({})",
            j.fights, j.count, mob.name, mob.level, mob.id
        )));
        Self::send(
            out,
            opcode,
            Ctx {
                mob_id: Some(&mob.id),
                ..Ctx::default()
            },
        );
        self.challenged(mob, now);
    }

    /// Keeps the challenge until its s2c/22 and waits 8 s for it.
    fn challenged(&mut self, mob: Mob, now: Instant) {
        self.challenges
            .retain(|c| now.duration_since(c.at) < CHALLENGE_KEPT);
        self.challenges.push(Challenge {
            mob_id: mob.id.clone(),
            seq: self.job_seq,
            at: now,
        });
        self.target = Some(mob);
        self.timer = Some((now + Duration::from_secs(8), Wake::ChallengeTimeout));
    }

    fn apply(&mut self, acts: Vec<Act>, now: Instant, out: &mut Vec<Out>) {
        for a in acts {
            match a {
                Act::Send(op, p) => out.push(Out::Send(op, p)),
                Act::Log(text) => out.push(Out::Log(text)),
                Act::End(end) => self.on_battle_end(end, now, out),
            }
        }
    }

    fn on_battle_end(&mut self, end: BattleEnd, now: Instant, out: &mut Vec<Out>) {
        self.battle = None;
        self.snap.hp = end.hp as i32;
        let boss = self.bosses.contains(&end.mob_id);
        if self.battle_seq != self.job_seq {
            out.push(Out::Log(format!(
                "Trận của việc trước: {}, +{} EXP",
                if end.won { "thắng" } else { "thua" },
                end.exp.unwrap_or(0)
            )));
            if self.job_running() || self.quest_running() {
                self.timer = Some((now + self.options.rest, Wake::Next));
            }
            return;
        }
        if self.snap.quest_run.is_some() && !self.job_running() {
            return self.quest_battle_end(&end, boss, now, out);
        }
        let Some(j) = &mut self.snap.job else { return };
        if end.won {
            j.wins += 1
        } else {
            j.losses += 1
        }
        j.damage += end.damage as i64;
        j.exp += end.exp.unwrap_or(0) as i64;
        j.coin += end.coin.unwrap_or(0) as i64;
        out.push(Out::Log(format!(
            "Trận {}: {}, {} lượt, gây {} sát thương, +{} EXP, +{} xu",
            j.fights,
            if end.won { "thắng" } else { "thua" },
            end.my_turns,
            end.damage,
            end.exp.unwrap_or(0),
            end.coin.unwrap_or(0)
        )));
        if j.done.is_some() {
            return;
        }
        // A loss costs EXP but refills HP; a boss keeps its HP between battles and a loss to it costs nothing.
        if !end.won && !boss && j.losses >= j.max_losses {
            let n = j.losses;
            return self.finish(&format!("Thua {n} trận"), out);
        }
        if j.fights >= j.count {
            let n = j.count;
            return self.finish(&format!("Đã đánh đủ {n} trận"), out);
        }
        self.timer = Some((now + self.options.rest, Wake::Next));
    }

    /// Every packet of the session goes through here, from the first one of the login on.
    pub fn on_packet(
        &mut self,
        opcode: i32,
        payload: &[u8],
        now: Instant,
        out: &mut Vec<Out>,
    ) -> crate::protocol::Result<()> {
        if let Some(b) = &mut self.battle {
            let mut acts = vec![];
            if b.on_packet(opcode, payload, now, &mut acts)? {
                self.apply(acts, now, out);
                return Ok(());
            }
        }
        let s = &mut self.snap;
        match opcode {
            9 => {
                let c = character_prefix(payload)?;
                (s.name, s.level, s.hp, s.max_hp) = (c.name, c.level, c.hp, c.max_hp);
                // The tail layout comes from two captures; without it EXP and stats wait for s2c/10.
                match character_profile(payload) {
                    Ok(p) => {
                        (s.x, s.y) = (p.x, p.y);
                        (s.exp, s.level_exp, s.coin) =
                            (Some(p.exp), Some(p.level_exp), Some(p.coin));
                        (s.stats, s.combat) = (p.stats, Some(p.combat));
                        (s.stat_points, s.skill_points) =
                            (Some(p.stat_points), Some(p.skill_points));
                    }
                    Err(e) => out.push(Out::Log(format!("Không đọc được phần sau của s2c/9: {e}"))),
                }
            }
            29 => s.map_id = character_location(payload)?.map_id,
            11 if payload.first() == Some(&1) => {
                let m = map_prefix(payload)?;
                (s.map_id, s.map_name, s.zone, s.x, s.y) =
                    (m.map_id, m.name, m.area as i32, m.x, m.y);
                s.bosses.clear();
                self.zone.clear();
                // NPCs and portals. A map this decoder cannot read leaves them unknown, not an empty map in the atlas;
                // the quest run, which talks to NPCs and takes portals, stops there. A fight job needs only the mobs.
                match map_data(payload) {
                    Ok(d) => {
                        self.snap.places = d.places;
                        self.atlas.record_map(
                            &self.snap.map_id,
                            &self.snap.map_name,
                            &self.snap.places,
                        );
                    }
                    Err(e) => {
                        self.snap.places.clear();
                        out.push(Out::Log(format!(
                            "Không đọc được NPC và cổng của {} (s2c/11): {e}",
                            self.snap.map_name
                        )));
                        if self.quest_running() {
                            self.finish_quest("Không đọc được NPC và cổng của map này", out);
                        }
                    }
                }
                // Through a portal: the client asks for the mobs of the new map next (B5).
                if self.travelling.is_some() {
                    let map_id = self.snap.map_id.clone();
                    Self::send(
                        out,
                        43,
                        Ctx {
                            map_id: Some(&map_id),
                            ..Ctx::default()
                        },
                    );
                }
            }
            13 => {
                let c = map_change(payload)?;
                s.map_id = c.map_id.clone();
                if let Some(z) = c.zone {
                    s.zone = z;
                }
                if let Some((id, name)) = self.travelling.clone() {
                    self.timer = None;
                    out.push(Out::Log(format!("Qua cổng {name}: sang {}", c.map_id)));
                    self.atlas.record_portal(
                        id,
                        Portal {
                            name,
                            map_id: Some(c.map_id.clone()),
                            ..Portal::default()
                        },
                    );
                    Self::send(
                        out,
                        11,
                        Ctx {
                            map_id: Some(&c.map_id),
                            ..Ctx::default()
                        },
                    );
                }
            }
            43 => {
                let d = map_entities(payload)?;
                self.atlas.record_mobs(&d.map_id, self.snap.zone, &d.mobs);
                self.mobs = d.mobs;
                if let Some((_, via)) = self.travelling.take() {
                    out.push(Out::Log(format!(
                        "Đã tới {} qua cổng {via}",
                        self.snap.map_name
                    )));
                    self.timer = Some((now + Duration::from_secs(2), Wake::Next));
                }
            }
            1263 => {
                // Until a snapshot reads, the players of the zone are unknown rather than none.
                let read = self.zone.on(opcode, payload);
                self.snap.players_unread = read.is_err();
                read?;
            }
            1167 | 1170 | 1253 => {
                self.zone.on(opcode, payload)?;
            }
            1177 => {
                let b = map_boss(payload)?;
                if let Some(gone) = b.gone {
                    self.mobs.retain(|m| m.id != gone);
                    self.snap
                        .bosses
                        .iter_mut()
                        .filter(|t| t.id == gone)
                        .for_each(|t| t.moving = true);
                } else if let Some(mob) = b.mob {
                    let [col, row] = b.tile.unwrap_or_default();
                    self.atlas
                        .record_boss(&b.map_id, self.snap.zone, &mob, [col, row]);
                    let at = BossTile {
                        id: mob.id.clone(),
                        name: mob.name.clone(),
                        level: mob.level,
                        col,
                        row,
                        moving: false,
                    };
                    match self.snap.bosses.iter_mut().find(|t| t.id == mob.id) {
                        Some(t) => *t = at,
                        None => self.snap.bosses.push(at),
                    }
                    self.bosses.insert(mob.id.clone());
                    if !self
                        .seen_bosses
                        .iter()
                        .any(|s| s.0 == b.map_id && s.1 == mob.name)
                    {
                        self.seen_bosses
                            .push((b.map_id.clone(), mob.name.clone(), mob.level));
                    }
                    if !self.mobs.iter().any(|m| m.id == mob.id) {
                        self.mobs.push(mob);
                    }
                }
            }
            10 => {
                let st = character_stats(payload)?;
                if let Some(l) = st.level {
                    if l != s.level && s.level != 0 {
                        out.push(Out::Log(format!("Lên cấp {l}")));
                    }
                    s.level = l;
                }
                if let (Some(hp), Some(max)) = (st.hp, st.max_hp) {
                    (s.hp, s.max_hp) = (hp, max);
                }
                if st.exp.is_some() {
                    (s.exp, s.level_exp, s.coin) = (st.exp, st.level_exp, st.coin);
                }
                if let Some(extra) = st.extra.filter(|e| e.len() == 6) {
                    s.combat = extra[1..].try_into().ok();
                }
                if let Some(stats) = st.stats {
                    s.stats = stats;
                }
                if st.stat_points.is_some() {
                    s.stat_points = st.stat_points;
                    s.skill_points = st.fields.as_ref().and_then(|f| f.first().copied());
                }
            }
            1256 => {
                let text = notice(payload)?;
                out.push(Out::Log(text.clone()));
                // A portal the character may not enter: "Bạn phải đạt cấp 40 mới vào được Lạc Cốc" (Q15) or "Bạn cần hoàn
                // thành nhiệm vụ trước khi tới đây" (S1); travel() then leaves it out.
                if let Some((id, name)) = self.travelling.take() {
                    self.atlas.record_refusal(id, &name, &text);
                    self.refused.insert(id);
                    self.timer = Some((now + Duration::from_secs(1), Wake::Next));
                }
            }
            39 => {
                let q = quest_data(payload)?;
                let before = self.snap.quest.as_ref().map(|q| (q.id, q.current));
                let step = q
                    .steps
                    .get(q.current.max(0) as usize)
                    .map_or("", |s| &s.text);
                out.push(Out::Log(format!(
                    "Nhiệm vụ {}: {}; bước {}/{}: {step}",
                    q.id,
                    q.title,
                    q.current + 1,
                    q.steps.len()
                )));
                let changed = before != Some((q.id, q.current));
                self.snap.quest = Some(q);
                self.awaiting_reply = false;
                if self.quest_running() && self.battle.is_none() && changed {
                    self.timer = Some((now + Duration::from_millis(1500), Wake::Next));
                }
            }
            34 => {
                let p = quest_progress(payload)?;
                if !p.text.is_empty() {
                    out.push(Out::Log(format!(
                        "NPC: {}",
                        p.text.chars().take(160).collect::<String>()
                    )));
                }
                // A talk step is answered by s2c/34 alone (no new s2c/39), so the step is advanced here (L1 capture).
                if self.awaiting_reply
                    && self.snap.quest.as_ref().is_some_and(|q| q.id == p.quest_id)
                {
                    self.awaiting_reply = false;
                    self.advance("Server đã trả lời", out);
                }
                if self.quest_running() && self.battle.is_none() {
                    self.timer = Some((now + Duration::from_millis(1500), Wake::Next));
                }
            }
            // The server's count for the current step, right after each battle that counts (kills, or boss damage).
            1201 => {
                let progress = Reader::new(payload).i32()?;
                if let Some(q) = &mut self.snap.quest {
                    q.progress = progress;
                }
            }
            35 => {
                let c = quest_complete(payload)?;
                out.push(Out::Log(format!(
                    "Xong nhiệm vụ {}: {}",
                    c.title,
                    c.rewards.join(", ")
                )));
                if let Some(r) = self.snap.quest_run.as_mut().filter(|r| r.done.is_none()) {
                    r.completed += 1;
                }
            }
            // s2c/0: i8 flag; string text. s2c/5: u8 kind; i32 × 4; string text (empty in the boot notice).
            0 | 5 => {
                let mut r = Reader::new(payload);
                let text = r
                    .take(if opcode == 0 { 1 } else { 17 })
                    .and_then(|_| r.string())
                    .unwrap_or_default();
                if !text.is_empty() {
                    out.push(Out::Log(format!("Server: {text}")));
                }
            }
            // Gear durability, after every battle; inside a battle it means the server ended it.
            36 => {
                if self.battle.take().is_some() {
                    out.push(Out::Log("Server đã huỷ trận".into()));
                    self.timer = Some((now + Duration::from_secs(2), Wake::Next));
                }
            }
            22 => self.on_setup(payload, now, out)?,
            _ => {}
        }
        Ok(())
    }

    fn on_setup(
        &mut self,
        payload: &[u8],
        now: Instant,
        out: &mut Vec<Out>,
    ) -> crate::protocol::Result<()> {
        // A battle cannot be left, so the bot never plays two at once or drops the one it plays.
        if self.battle.is_some() {
            out.push(Out::Log(
                "Server mở thêm một trận khi trận trước chưa xong; bỏ qua".into(),
            ));
            return Ok(());
        }
        let setup = battle_setup(payload)?;
        // The mob block of s2c/22 starts with the length-prefixed mob id: it tells which challenge this answers (the last
        // one when no id matches). One sent before Stop, before the job was replaced, or that timed out may open late.
        // The server has opened that battle and it cannot be left (an idle turn passes after 34 s while the mob hits), so
        // it is played, and counts for the job that sent it. A setup with no challenge of this session is not.
        let has = |id: &str| {
            let needle = Writer::new().string(id).build();
            payload.windows(needle.len()).any(|w| w == needle)
        };
        self.challenges
            .retain(|c| now.duration_since(c.at) < CHALLENGE_KEPT);
        let Some(i) = self
            .challenges
            .iter()
            .rposition(|c| has(&c.mob_id))
            .or(self.challenges.len().checked_sub(1))
        else {
            out.push(Out::Log("Có trận không do app mở; bỏ qua".into()));
            return Ok(());
        };
        let Challenge { mob_id, seq, .. } = self.challenges.remove(i);
        self.timer = None;
        self.battle_seq = seq;
        if seq != self.job_seq || !(self.job_running() || self.quest_running()) {
            let name = self
                .mobs
                .iter()
                .find(|m| m.id == mob_id)
                .map_or(mob_id.as_str(), |m| &m.name);
            out.push(Out::Log(format!(
                "Trận với {name} từ thách đấu trước mới mở: vẫn đánh cho xong vì không rời trận được"
            )));
        }
        (self.snap.hp, self.snap.max_hp) = (setup.hp, setup.max_hp);
        let runner = BattleRunner::new(
            &setup,
            &mob_id,
            RunnerOptions {
                skill: self.options.skill,
                strategy: self.options.strategy.clone(),
                timed_move: self.options.timed_move,
            },
        );
        let mut acts = vec![];
        runner.start(&mut acts);
        self.battle = Some(runner);
        self.apply(acts, now, out);
        Ok(())
    }
}

/// The quest run: next(), elsewhere(), travel(), fight() and onBattleEnd() of QuestBot in src/quest.ts.
impl Bot {
    fn doing(&mut self, text: String) {
        if let Some(r) = &mut self.snap.quest_run {
            r.doing = text;
        }
    }

    fn advance(&mut self, reason: &str, out: &mut Vec<Out>) {
        let Some(q) = &mut self.snap.quest else {
            return;
        };
        (q.current, q.progress) = (q.current + 1, 0);
        self.hops = 0;
        let next = q.steps.get(q.current as usize).map(|s| s.text.as_str());
        out.push(Out::Log(format!(
            "{reason}; bước tiếp: {}",
            next.unwrap_or("(hết)")
        )));
    }

    /// Decides the next action from the current quest step.
    fn quest_next(&mut self, now: Instant, out: &mut Vec<Out>) {
        // The step moves on after the NPC reply (s2c/34), a new s2c/39, or the kill count or damage reached just below. It
        // is done once the quest is past it or a new quest came after the report; a quest moving back has not been seen.
        if let Some((id, i, text)) = self.playing.clone() {
            let at = self.snap.quest.as_ref().map(|q| (q.id, q.current));
            if at != Some((id, i)) {
                let done = at.is_some_and(|(q, current)| q != id || current > i);
                if let Some(r) = &mut self.snap.quest_run {
                    r.step_done = done;
                }
                let reason = match done {
                    true => format!("Xong bước \"{text}\""),
                    false => format!("Nhiệm vụ không còn ở bước \"{text}\""),
                };
                return self.finish_quest(&reason, out);
            }
        }
        let Some(q) = self.snap.quest.clone() else {
            return self.finish_quest("Chưa có nhiệm vụ nào", out);
        };
        let Some(step) = q.steps.get(q.current.max(0) as usize).cloned() else {
            return self.finish_quest("Không còn bước nhiệm vụ nào để làm", out);
        };
        let action = step_action(&step.text, step.npc_id);
        let reached = match &action {
            StepAction::Kill { .. } => q.progress >= step.required,
            StepAction::Damage { amount, .. } => q.progress >= *amount,
            _ => false,
        };
        if reached {
            self.advance(&format!("Xong \"{}\"", step.text), out);
            return self.quest_next(now, out);
        }
        if self.elsewhere(&action, &q, &step.text, now, out) {
            return;
        }
        let named = |mob: &str| -> Vec<Mob> {
            self.mobs
                .iter()
                .filter(|m| m.name == mob)
                .cloned()
                .collect()
        };
        match action {
            StepAction::Kill { mob } => {
                let targets = named(&mob);
                let doing = format!("Đánh {mob} ({}/{})", q.progress, step.required);
                self.quest_fight(targets, doing, 15, now, out)
            }
            // The boss of s2c/1177 ignores c2s/15; the game challenges it with c2s/1178 (B4).
            StepAction::Damage { mob, amount } => {
                let targets = named(&mob);
                let doing = format!("Đánh boss {mob} ({}/{amount} sát thương)", q.progress);
                self.quest_fight(targets, doing, 1178, now, out)
            }
            StepAction::Level { level } if self.snap.level < level => {
                let targets = self.grind_targets();
                let doing = format!(
                    "Cày cấp {}/{level}: {}",
                    self.snap.level,
                    targets.first().map_or("?", |m| &m.name)
                );
                self.quest_fight(targets, doing, 15, now, out)
            }
            StepAction::Level { .. } => {
                self.timer = Some((
                    now + Duration::from_secs(8),
                    Wake::Silence("Đã đủ cấp nhưng server chưa sang bước sau"),
                ));
            }
            StepAction::Stat => {
                self.doing("Cộng 1 điểm tiềm năng vào Cường lực".into());
                out.push(Out::Log("Cộng 1 điểm tiềm năng vào Cường lực".into()));
                let ctx = Ctx {
                    stat: Some(0),
                    amount: Some(1),
                    ..Ctx::default()
                };
                self.ask(
                    10,
                    ctx,
                    "Server không trả lời khi cộng điểm tiềm năng",
                    now,
                    out,
                )
            }
            StepAction::Talk { npc_id } => {
                let map_id = self.snap.map_id.clone();
                self.doing(step.text.clone());
                out.push(Out::Log(format!("{} (NPC {npc_id})", step.text)));
                let ctx = Ctx {
                    map_id: Some(&map_id),
                    npc_id: Some(npc_id),
                    ..Ctx::default()
                };
                self.ask(13, ctx, "NPC không trả lời", now, out)
            }
            StepAction::Unknown => {
                let reason = format!("Bot chưa biết làm bước \"{}\"", step.text);
                self.finish_quest(&reason, out)
            }
        }
    }

    /// Sends a talk or stat-point request; s2c/34 or s2c/39 must answer within 8 s.
    fn ask(
        &mut self,
        opcode: i32,
        ctx: Ctx,
        silence: &'static str,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        self.awaiting_reply = true;
        Self::send(out, opcode, ctx);
        self.timer = Some((now + Duration::from_secs(8), Wake::Silence(silence)));
    }

    /// True when the mob or NPC of the step is not in this map and the bot waits for it or travels.
    fn elsewhere(
        &mut self,
        action: &StepAction,
        q: &Quest,
        reason: &str,
        now: Instant,
        out: &mut Vec<Out>,
    ) -> bool {
        if let Some(mob) = action.mob() {
            if !self.mobs.iter().any(|m| m.name == mob) {
                let has = |m: &MapRecord| {
                    m.mobs.iter().any(|k| k.name == mob) || m.bosses.iter().any(|b| b.name == mob)
                };
                // A mob the atlas puts in this map, like a boss between its s2c/1177 field 1 and field 0 (~13 s), is
                // waited for here (6 × 5 s), never searched elsewhere.
                if !self.atlas.maps.get(&self.snap.map_id).is_some_and(has) {
                    return self.travel(q, reason, &has, now, out);
                }
                if self.waits >= 6 {
                    return false;
                }
                self.waits += 1;
                self.doing(format!("Đợi {mob} ({}/6)", self.waits));
                out.push(Out::Log(format!(
                    "Chưa thấy {mob}, đợi 5 s ({}/6)",
                    self.waits
                )));
                self.timer = Some((now + Duration::from_secs(5), Wake::Next));
                return true;
            }
        }
        if let StepAction::Talk { npc_id } = *action {
            let npc = |p: &Place| p.kind == 2 && p.id == npc_id;
            if !self.snap.places.is_empty() && !self.snap.places.iter().any(npc) {
                return self.travel(
                    q,
                    reason,
                    &|m: &MapRecord| m.places.iter().any(npc),
                    now,
                    out,
                );
            }
        }
        false
    }

    /// Walks through a portal of s2c/11 (c2s/13 with its id, B5): the first of the shortest known way to a map where
    /// `wanted` holds, else one the quest names ("Tìm Đến Vân Sơn") towards a map not seen yet, else any towards a map not
    /// seen yet. Portals refused in this run are left out; at most 6 for a step.
    fn travel(
        &mut self,
        q: &Quest,
        reason: &str,
        wanted: &dyn Fn(&MapRecord) -> bool,
        now: Instant,
        out: &mut Vec<Out>,
    ) -> bool {
        let (map_id, level) = (self.snap.map_id.clone(), self.snap.level);
        let step = q
            .steps
            .get(q.current.max(0) as usize)
            .map_or("", |s| &s.text);
        let text = format!("{} {} {step}", q.title, q.description);
        let fresh: Vec<&Place> = self
            .atlas
            .portals_of(&map_id, level, &self.refused)
            .into_iter()
            .filter(|p| self.atlas.destination(p.id, &p.name, &map_id).is_none())
            .collect();
        let portal = self
            .atlas
            .route(&map_id, wanted, level, &self.refused)
            .or_else(|| {
                fresh
                    .iter()
                    .find(|p| text.contains(&p.name))
                    .map(|p| (*p).clone())
            })
            .or_else(|| fresh.first().map(|p| (*p).clone()));
        let Some(portal) = portal.filter(|_| self.hops < 6) else {
            return false;
        };
        self.hops += 1;
        self.travelling = Some((portal.id, portal.name.clone()));
        self.doing(format!("Qua cổng {}", portal.name));
        out.push(Out::Log(format!(
            "{reason}: không ở {map_id}, qua cổng {} ({}/6)",
            portal.name, self.hops
        )));
        Self::send(
            out,
            13,
            Ctx {
                map_id: Some(&map_id),
                npc_id: Some(portal.id),
                ..Ctx::default()
            },
        );
        self.timer = Some((
            now + Duration::from_secs(8),
            Wake::Silence("Cổng không trả lời"),
        ));
        true
    }

    /// Mobs to fight while waiting for a level: the strongest kind not above own level that is not a boss.
    fn grind_targets(&self) -> Vec<Mob> {
        let mut best: Option<&Mob> = None;
        for m in &self.mobs {
            if m.level <= self.snap.level
                && !self.bosses.contains(&m.id)
                && best.is_none_or(|b| m.level > b.level)
            {
                best = Some(m);
            }
        }
        let name = best.map(|m| m.name.clone());
        self.mobs
            .iter()
            .filter(|m| Some(&m.name) == name.as_ref())
            .cloned()
            .collect()
    }

    fn quest_fight(
        &mut self,
        targets: Vec<Mob>,
        doing: String,
        opcode: i32,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        self.waits = 0;
        if targets.is_empty() {
            return self.finish_quest("Không thấy quái của bước này ở khu này", out);
        }
        let Some(r) = &mut self.snap.quest_run else {
            return;
        };
        let mob = targets[r.fights as usize % targets.len()].clone();
        r.fights += 1;
        r.doing = doing;
        out.push(Out::Log(format!(
            "Trận {}: thách đấu {} cấp {} ({})",
            r.fights, mob.name, mob.level, mob.id
        )));
        Self::send(
            out,
            opcode,
            Ctx {
                mob_id: Some(&mob.id),
                ..Ctx::default()
            },
        );
        self.challenged(mob, now);
    }

    /// Counts a battle of the quest run. The local count is replaced by the server's s2c/1201 a few ms later. A boss is
    /// not expected to fall: its damage counts won or lost, and a loss to it does not stop the run.
    fn quest_battle_end(&mut self, end: &BattleEnd, boss: bool, now: Instant, out: &mut Vec<Out>) {
        let Some(r) = &mut self.snap.quest_run else {
            return;
        };
        if end.won {
            r.wins += 1
        } else {
            r.losses += 1
        }
        r.exp += end.exp.unwrap_or(0) as i64;
        r.coin += end.coin.unwrap_or(0) as i64;
        let (losses, max_losses) = (r.losses, r.max_losses);
        out.push(Out::Log(format!(
            "Trận {}: {}, {} lượt, gây {} sát thương, +{} EXP, +{} xu",
            r.fights,
            if end.won { "thắng" } else { "thua" },
            end.my_turns,
            end.damage,
            end.exp.unwrap_or(0),
            end.coin.unwrap_or(0)
        )));
        let name = self
            .mobs
            .iter()
            .find(|m| m.id == end.mob_id)
            .map(|m| m.name.clone());
        if let Some(q) = &mut self.snap.quest {
            if let Some(step) = q.steps.get(q.current.max(0) as usize) {
                let action = step_action(&step.text, step.npc_id);
                if action.mob().is_some() && action.mob() == name.as_deref() {
                    match action {
                        StepAction::Damage { amount, .. } => {
                            q.progress += end.damage;
                            out.push(Out::Log(format!(
                                "Sát thương lên boss: {}/{amount}",
                                q.progress
                            )));
                        }
                        StepAction::Kill { .. } if end.won => {
                            q.progress += 1;
                            out.push(Out::Log(format!(
                                "Đã diệt {}/{}",
                                q.progress, step.required
                            )));
                        }
                        _ => {}
                    }
                }
            }
        }
        if !end.won && boss {
            out.push(Out::Log("Thua boss: không mất EXP, vẫn đánh tiếp".into()));
        }
        if !end.won && !boss && losses >= max_losses {
            return self.finish_quest(&format!("Thua {losses} trận"), out);
        }
        self.timer = Some((now + self.options.rest, Wake::Next));
    }
}

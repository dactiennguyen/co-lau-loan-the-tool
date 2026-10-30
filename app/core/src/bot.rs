//! What one logged-in account knows and does: the character, map and mobs from the world packets, and a fight job
//! ("đánh X N lần") that follows QuestBot --farm of src/quest.ts: c2s/15 for a mob, c2s/1178 for a boss of s2c/1177,
//! 8 s for s2c/22, 6 × 5 s of waiting while a boss changes tiles, 3 s of rest between battles, and losses (except to a
//! boss) up to `max_losses`. Without I/O, like BattleRunner.
use crate::atlas::Atlas;
use crate::battle::{battle_setup, Strategy};
use crate::protocol::{
    character_location, character_prefix, character_profile, map_prefix, Reader, Writer,
};
use crate::requests::{build, Ctx};
use crate::runner::{Act, BattleEnd, BattleRunner, RunnerOptions, Skill};
use crate::world::{
    character_stats, map_boss, map_change, map_data, map_entities, notice, Mob, Nearby, Place,
    ZonePlayers,
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
    pub targets: Vec<Target>,
    pub job: Option<Job>,
    pub battle: Option<BattleView>,
}

enum Wake {
    Next,
    ChallengeTimeout,
}

pub struct Bot {
    pub snap: Snapshot,
    mobs: Vec<Mob>,
    /// Ids of the bosses of s2c/1177.
    bosses: HashSet<String>,
    /// Bosses of s2c/1177 by map (name, level), kept while they change tiles, as recordBoss keeps them in the TS atlas.
    seen_bosses: Vec<(String, String, i32)>,
    zone: ZonePlayers,
    atlas: Arc<Atlas>,
    options: BotOptions,
    battle: Option<BattleRunner>,
    target: Option<Mob>,
    waits: u32,
    timer: Option<(Instant, Wake)>,
    /// Job each challenge and battle belongs to, so a battle of a replaced job is not counted in the new one.
    job_seq: u32,
    challenge_seq: u32,
    battle_seq: u32,
}

impl Bot {
    pub fn new(options: BotOptions, atlas: Arc<Atlas>) -> Self {
        Self {
            snap: Snapshot::default(),
            mobs: vec![],
            bosses: HashSet::new(),
            seen_bosses: vec![],
            zone: ZonePlayers::default(),
            atlas,
            options,
            battle: None,
            target: None,
            waits: 0,
            timer: None,
            job_seq: 0,
            challenge_seq: 0,
            battle_seq: 0,
        }
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
    /// Ends the job after the battle in progress (a battle cannot be left).
    pub fn stop(&mut self, out: &mut Vec<Out>) {
        if self.snap.job.as_ref().is_some_and(|j| j.done.is_none()) {
            self.timer = None;
            self.finish(
                if self.battle.is_some() {
                    "Đã dừng; trận đang đánh vẫn tiếp tục tới hết"
                } else {
                    "Đã dừng"
                },
                out,
            );
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
        self.target = Some(mob);
        self.challenge_seq = self.job_seq;
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
            if self.snap.job.as_ref().is_some_and(|j| j.done.is_none()) {
                self.timer = Some((now + self.options.rest, Wake::Next));
            }
            return;
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
                s.places = map_data(payload).map(|d| d.places).unwrap_or_default();
                s.bosses.clear();
                self.zone.clear();
            }
            13 => {
                let c = map_change(payload)?;
                s.map_id = c.map_id;
                if let Some(z) = c.zone {
                    s.zone = z;
                }
            }
            43 => self.mobs = map_entities(payload)?.mobs,
            1263 | 1167 | 1170 | 1253 => {
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
            1256 => out.push(Out::Log(notice(payload)?)),
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
        if self.snap.job.is_none() {
            out.push(Out::Log("Có trận không do app mở; bỏ qua".into()));
            return Ok(());
        }
        self.timer = None;
        self.battle_seq = self.challenge_seq;
        let setup = battle_setup(payload)?;
        // The mob block of s2c/22 starts with the length-prefixed mob id; a late setup may answer an earlier challenge.
        let has = |id: &str| {
            let needle = Writer::new().string(id).build();
            payload.windows(needle.len()).any(|w| w == needle)
        };
        let mob_id = self
            .mobs
            .iter()
            .find(|m| has(&m.id))
            .map(|m| m.id.clone())
            .or_else(|| self.target.as_ref().map(|m| m.id.clone()))
            .unwrap_or_else(|| "?".into());
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

//! Đánh quái: the fight job ("đánh X N lần"), the challenge and its s2c/22, Đầu hàng, and the end of every battle.
use super::*;

impl Bot {
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
        // One task at a time: the quest run has to be stopped first (and the other way round in quest()).
        if self.quest_running() {
            return out.push(Out::Log(
                LogKind::Battle,
                "Đang tự làm nhiệm vụ: bấm Dừng rồi mới đánh quái".into(),
            ));
        }
        if self.moving() {
            return out.push(Out::Log(
                LogKind::Battle,
                "Đang đổi chỗ: đợi tới nơi rồi mới đánh quái".into(),
            ));
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
            started_at: epoch_ms(),
            ended_at: None,
        });
        self.run_started = now;
        self.waits = 0;
        self.job_seq += 1;
        (self.repair_failed, self.repair_warned) = (HashSet::new(), false);
        out.push(Out::Log(
            LogKind::Battle,
            format!("Bắt đầu: đánh {target} {count} lần"),
        ));
        let challenging = matches!(self.timer, Some((_, Wake::ChallengeTimeout)));
        if self.battle.is_none() && !challenging {
            self.next(now, out);
        }
    }

    /// Leaves the battle in progress (BattleRunner::leave). s2c/1214 (every capture) or s2c/36 then ends it; without
    /// either in 8 s it is played on (`surrender` of QuestBot).
    pub(super) fn surrender(&mut self, now: Instant, out: &mut Vec<Out>) {
        let map_id = self.snap.map_id.clone();
        let Some(b) = self.battle.as_mut().filter(|b| !b.leaving) else {
            return;
        };
        let mut acts = vec![];
        b.leave(&map_id, &mut acts);
        let mob = b.mob_id.clone();
        let name = self
            .mobs
            .iter()
            .find(|m| m.id == mob)
            .map_or(mob.as_str(), |m| &m.name);
        out.push(Out::Log(
            LogKind::Battle,
            format!("Đầu hàng trận với {name}"),
        ));
        self.reload_map = true;
        self.leave_until = Some(now + Duration::from_secs(8));
        self.apply(acts, now, out);
    }

    /// The battle surrendered is over: s2c/1214 or s2c/36 after c2s/40, even later than the 8 s wait (the server took it
    /// then). A job or quest run started meanwhile goes on. False when this battle was never surrendered.
    pub(super) fn left(&mut self, by: i32, now: Instant, out: &mut Vec<Out>) -> bool {
        if !self.battle.as_ref().is_some_and(|b| b.surrendered) {
            return false;
        }
        if let Some(b) = &self.battle {
            let damage = match (b.mob.max_hp - b.mob.hp).max(0.0) {
                d if d.is_finite() => d as i32,
                _ => 0,
            };
            let mut record = self.record(&b.mob_id, BattleResult::Left, b.turns, damage, 0, 0);
            record.hp_after = b.me.hp as i32;
            out.push(Out::Battle(record));
        }
        (self.battle, self.leave_until) = (None, None);
        out.push(Out::Log(LogKind::Battle, format!("Đã rời trận (s2c/{by})")));
        if self.job_running() || self.quest_running() {
            self.timer = Some((now + Duration::from_secs(2), Wake::Next));
        }
        true
    }

    pub(super) fn finish(&mut self, reason: &str, out: &mut Vec<Out>) {
        if let Some(j) = &mut self.snap.job {
            let end = epoch_ms();
            (j.done, j.ended_at) = (Some(reason.into()), Some(end));
            out.push(Out::Log(
                LogKind::Battle,
                format!(
                    "Kết thúc: {reason} ({} thắng, {} thua, +{} EXP, +{} xu, trong {})",
                    j.wins,
                    j.losses,
                    j.exp,
                    j.coin,
                    duration_text(Duration::from_millis(end.saturating_sub(j.started_at)))
                ),
            ));
        }
    }

    pub(super) fn next(&mut self, now: Instant, out: &mut Vec<Out>) {
        if self.battle.is_some() || self.allotting {
            return;
        }
        if self.trip.is_some() {
            return self.trip_next(now, out);
        }
        // Before the next battle, or the next step of the quest run, a broken worn item is repaired first.
        if (self.quest_running() || self.job_running()) && self.auto_repair(now, out) {
            return;
        }
        if self.quest_running() {
            return self.quest_next(now, out);
        }
        // Between the battles of a job, or with nothing to do, the stat plan spends the points there are first.
        if self.allot(now, out) {
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
            out.push(Out::Log(
                LogKind::Battle,
                format!("{} đang đổi chỗ, đợi 5 s ({}/6)", job.target, self.waits),
            ));
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
        out.push(Out::Log(
            LogKind::Battle,
            format!(
                "Trận {}/{}: thách đấu {} cấp {} ({})",
                j.fights, j.count, mob.name, mob.level, mob.id
            ),
        ));
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
    pub(super) fn challenged(&mut self, mob: Mob, now: Instant) {
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

    pub(super) fn on_battle_end(&mut self, end: BattleEnd, now: Instant, out: &mut Vec<Out>) {
        if end.won && self.fight.pickup {
            self.loot(now, out);
        }
        // The result that ended it reaches no snapshot with the battle on: the snapshot keeps it until the next battle.
        self.snap.turn = self.battle.take().and_then(|b| self.turn_of(&b));
        self.snap.hp = end.hp as i32;
        let boss = self.bosses.contains(&end.mob_id);
        out.push(Out::Battle(self.record(
            &end.mob_id,
            match end.won {
                true => BattleResult::Won,
                false => BattleResult::Lost,
            },
            end.my_turns,
            end.damage,
            end.exp.unwrap_or(0),
            end.coin.unwrap_or(0),
        )));
        if self.battle_seq != self.job_seq {
            out.push(Out::Log(
                LogKind::Battle,
                format!(
                    "Trận của việc trước: {}, +{} EXP",
                    if end.won { "thắng" } else { "thua" },
                    end.exp.unwrap_or(0)
                ),
            ));
            if self.job_running() || self.quest_running() {
                self.timer = Some((now + self.options.rest, Wake::Next));
            }
            return;
        }
        if self.snap.quest_run.is_some() && !self.job_running() {
            return self.quest_battle_end(&end, boss, now, out);
        }
        let took = duration_text(now.saturating_duration_since(self.battle_started));
        let ran = duration_text(now.saturating_duration_since(self.run_started));
        let Some(j) = &mut self.snap.job else { return };
        if end.won {
            j.wins += 1
        } else {
            j.losses += 1
        }
        j.damage += end.damage as i64;
        j.exp += end.exp.unwrap_or(0) as i64;
        j.coin += end.coin.unwrap_or(0) as i64;
        out.push(Out::Log(
            LogKind::Battle,
            format!(
                "Trận {}: {}, {} lượt trong {}, gây {} sát thương, +{} EXP, +{} xu; đã chạy {}",
                j.fights,
                if end.won { "thắng" } else { "thua" },
                end.my_turns,
                took,
                end.damage,
                end.exp.unwrap_or(0),
                end.coin.unwrap_or(0),
                ran
            ),
        ));
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

    pub(super) fn on_setup(
        &mut self,
        payload: &[u8],
        now: Instant,
        out: &mut Vec<Out>,
    ) -> crate::protocol::Result<()> {
        // A battle cannot be left, so the bot never plays two at once or drops the one it plays.
        if self.battle.is_some() {
            out.push(Out::Log(
                LogKind::Battle,
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
            out.push(Out::Log(
                LogKind::Battle,
                "Có trận không do app mở; bỏ qua".into(),
            ));
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
            out.push(Out::Log(LogKind::Battle, format!(
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
        (self.battle, self.snap.turn) = (Some(runner), None);
        self.battle_started = now;
        // As on_battle_end counts it: the quest run's unless a fight job runs; a challenge of an earlier job is neither.
        self.battle_source = if seq != self.job_seq {
            BattleSource::Other
        } else if self.job_running() {
            BattleSource::Fight
        } else if self.quest_running() {
            BattleSource::Quest
        } else {
            BattleSource::Other
        };
        (self.battle_at, self.battle_hp) = (epoch_ms(), setup.hp);
        self.apply(acts, now, out);
        Ok(())
    }
}

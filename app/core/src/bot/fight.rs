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
        if self.smith.is_some() {
            return out.push(Out::Log(
                LogKind::Battle,
                "Đang làm việc ở Pháp sư hay Hương Lão: bấm Dừng rồi mới đánh quái".into(),
            ));
        }
        if self.gift.is_some() {
            return out.push(Out::Log(
                LogKind::Battle,
                "Đang nhập mã quà tặng: bấm Dừng rồi mới đánh quái".into(),
            ));
        }
        if self.mail_changing() {
            return out.push(Out::Log(
                LogKind::Battle,
                "Đang nhận hay xoá thư: đợi xong rồi mới đánh quái".into(),
            ));
        }
        if self.market_changing() {
            return out.push(Out::Log(
                LogKind::Battle,
                "Đang mua bán ở Chợ trời: đợi xong rồi mới đánh quái".into(),
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
            picked: vec![],
            done: None,
            started_at: epoch_ms(),
            ended_at: None,
        });
        self.run_started = now;
        self.waits = 0;
        self.job_seq += 1;
        (self.repair_failed, self.repair_warned) = (HashSet::new(), false);
        // A trip of Tự gộp đá of the job before is not this job's.
        (self.potions_kept, self.merge_said, self.merge_trip) = ([false; 2], None, None);
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
        let Some(b) = self.battle.as_mut().filter(|b| !b.leaving()) else {
            return;
        };
        let mut acts = vec![];
        b.leave(&map_id, &mut acts);
        let mob = b.mob_id().to_string();
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
        if !self.battle.as_ref().is_some_and(|b| b.surrendered()) {
            return false;
        }
        if let Some(b) = &self.battle {
            let damage = match (b.mob().max_hp - b.mob().hp).max(0.0) {
                d if d.is_finite() => d as i32,
                _ => 0,
            };
            let mut record = self.record(b.mob_id(), BattleResult::Left, b.turns(), damage, 0, 0);
            record.hp_after = b.me().hp as i32;
            self.remember_battle(&record);
            out.push(Out::Battle(record));
        }
        self.record_end(serde_json::json!({ "left": format!("s2c/{by}") }), now);
        Self::battle_end(EndKind::Left, None, None, out);
        (self.battle, self.leave_until) = (None, None);
        out.push(Out::Log(LogKind::Battle, format!("Đã rời trận (s2c/{by})")));
        if self.job_running() || self.quest_running() {
            self.timer = Some((now + Duration::from_secs(2), Wake::Next));
        }
        true
    }

    pub(super) fn finish(&mut self, reason: &str, out: &mut Vec<Out>) {
        // Its trip of Tự gộp đá ends with it (Dừng): a job or quest run started next does not wait for it nor take it on.
        self.merge_trip = None;
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
        if self.battle.is_some() || self.allotting.is_some() || self.skilling.is_some() {
            return;
        }
        if self.trip.is_some() {
            return self.trip_next(now, out);
        }
        // A trip of Tự gộp đá khi túi đầy goes on by itself (merge_step) and calls the next battle once back.
        if self.merge_trip.is_some() {
            return;
        }
        // Before the next battle, or the next step of the quest run, a broken worn item is repaired first.
        if (self.quest_running() || self.job_running()) && self.auto_repair(now, out) {
            return;
        }
        if self.quest_running() {
            return self.quest_next(now, out);
        }
        // Between the battles of a job, or with nothing to do, the stat plan and Tự cộng kỹ năng spend the points there
        // are first.
        if self.allot(now, out) || self.auto_skill(now, out) {
            return;
        }
        let Some(job) = self.snap.job.clone().filter(|j| j.done.is_none()) else {
            return;
        };
        if job.fights >= job.count {
            return self.finish(&format!("Đã đánh đủ {} trận", job.count), out);
        }
        // A full bag: to Pháp sư first, when Tự gộp đá khi túi đầy may go.
        if self.auto_merge(now, out) {
            return;
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
        let kind = if end.won { EndKind::Won } else { EndKind::Lost };
        Self::battle_end(kind, end.exp, end.coin, out);
        // The result that ended it reaches no snapshot with the battle on: the snapshot keeps it until the next battle.
        self.snap.turn = self.battle.take().and_then(|b| self.turn_of(&b));
        self.snap.hp = end.hp as i32;
        self.record_end(
            serde_json::json!({
                "won": end.won, "actor": end.actor, "exp": end.exp, "coin": end.coin, "myTurns": end.my_turns,
                "hp": end.hp, "damage": end.damage,
            }),
            now,
        );
        let boss = self.bosses.contains(&end.mob_id);
        let record = self.record(
            &end.mob_id,
            match end.won {
                true => BattleResult::Won,
                false => BattleResult::Lost,
            },
            end.my_turns,
            end.damage,
            end.exp.unwrap_or(0),
            end.coin.unwrap_or(0),
        );
        if end.won && self.fight.pickup {
            self.loot(&record, now, out);
        }
        self.remember_battle(&record);
        out.push(Out::Battle(record));
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
        let runner = match self.options.algorithm {
            Algorithm::V1 => Runner::V1(Box::new(BattleRunner::new(
                &setup,
                &mob_id,
                RunnerOptions {
                    skill: self.options.skill,
                    strategy: self.options.strategy.clone(),
                    timed_move: self.options.timed_move,
                },
            ))),
            Algorithm::V3 => {
                let potions = self.battle_potions(out);
                Runner::V3(Box::new(crate::runner_v3::BattleRunner::new(
                    &setup,
                    &mob_id,
                    self.runner_options(mob_block(payload, &mob_id), potions),
                )))
            }
        };
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
        self.battles_started += 1;
        // Before apply: its c2s/18 goes into the data through record_sent.
        self.record_start(payload, &setup.uuid, &mob_id, now, out);
        out.push(Out::BattleEvent(Box::new(BattleEvent::Open(Box::new(
            self.battle_open(&setup, payload, &mob_id),
        )))));
        self.apply(acts, now, out);
        Ok(())
    }

    /// The battle window's first event of a battle: the board of s2c/22, both sides, the mob's sprite.
    fn battle_open(&self, setup: &Setup, payload: &[u8], mob_id: &str) -> battle_view::Open {
        let block = mob_block(payload, mob_id);
        let known = self.mobs.iter().find(|m| m.id == mob_id);
        battle_view::Open {
            board: setup.board.clone(),
            me: battle_view::Side {
                name: setup.me.clone(),
                level: setup.level,
                element: self.snap.element,
                gauge: Gauge {
                    hp: Some(setup.hp),
                    max_hp: Some(setup.max_hp),
                    ..Gauge::default()
                },
            },
            mob: battle_view::Side {
                name: block
                    .as_ref()
                    .map(|b| b.name.clone())
                    .or_else(|| known.map(|m| m.name.clone()))
                    .unwrap_or_else(|| mob_id.to_string()),
                level: block
                    .as_ref()
                    .map(|b| b.level)
                    .or(known.map(|m| m.level))
                    .unwrap_or(0),
                element: block
                    .as_ref()
                    .map(|b| b.element as i32)
                    .or_else(|| known.and_then(|m| m.element())),
                gauge: Gauge {
                    hp: block.as_ref().map(|b| b.hp),
                    max_hp: block.as_ref().map(|b| b.max_hp),
                    ..Gauge::default()
                },
            },
            mob_id: mob_id.to_string(),
            sprite: block.as_ref().map(|b| b.sprite),
            boss: self.bosses.contains(mob_id),
            turn_seconds: setup.turn_seconds,
        }
    }

    pub(super) fn battle_end(
        kind: EndKind,
        exp: Option<i32>,
        coin: Option<i32>,
        out: &mut Vec<Out>,
    ) {
        out.push(Out::BattleEvent(Box::new(BattleEvent::End(
            battle_view::End {
                result: kind,
                exp,
                coin,
            },
        ))));
    }

    /// The potions the v3 battle under way may still drink (Dùng bình máu, Dùng bình mana), counted down as they go;
    /// none outside a battle.
    pub fn potions_left(&self) -> &[crate::battle_actions::Potion] {
        match &self.battle {
            Some(crate::runner_v3::Runner::V3(r)) => r.potions(),
            _ => &[],
        }
    }

    /// The potions the battle about to start may use (battle_potions of Dùng bình máu and Dùng bình mana). A kind turned
    /// on that the bag holds no more of than it keeps is said once a run: none is ever bought.
    fn battle_potions(&mut self, out: &mut Vec<Out>) -> Vec<crate::battle_actions::Potion> {
        let bag = bag_stacks(self.snap.bag.as_ref());
        let potions = battle_potions(&self.fight, bag.iter().copied());
        // A bag not read yet is not an empty one: nothing to say.
        if self.snap.bag.is_none() {
            return potions;
        }
        for id in [0, 1] {
            let Some((_, keep)) = self.fight.potion_rule(id) else {
                continue;
            };
            let none = !potions.iter().any(|p| p.item_id == id);
            if none && !self.potions_kept[id as usize] {
                let held: i64 = bag.iter().filter(|p| p.1 == id).map(|p| p.2 as i64).sum();
                let name = crate::battle_actions::potion_effect(id).map_or("bình", |e| e.name);
                out.push(Out::Log(
                    LogKind::Battle,
                    format!("Không dùng {name} nữa: túi còn {held}, giữ lại {keep} (không tự mua)"),
                ));
            }
            self.potions_kept[id as usize] = none;
        }
        potions
    }

    /// What a v3 battle plays with (onSetup and battleSkills of QuestBot): the learnt skills of the s2c/30 tree at their
    /// levels, only the account's skill when it names one, and `potions` (battle_potions), for best_action; without the
    /// tree, v2 with the account's skill. Tấn công and level give the damage per sword before the first hit, the mob
    /// block of s2c/22 its HP, and the memory what the earlier battles of the session learnt.
    fn runner_options(
        &self,
        mob: Option<crate::battle::MobBlock>,
        potions: Vec<crate::battle_actions::Potion>,
    ) -> crate::runner_v3::RunnerOptions {
        use crate::battle_actions::learnt_skills;
        let s = &self.snap;
        let skills = (!s.skills.is_empty()).then(|| {
            let learnt = learnt_skills(&s.skills, &s.skill_levels);
            match self.options.skill {
                Some(k) => learnt.into_iter().filter(|e| e.id == k.id).collect(),
                None => learnt,
            }
        });
        crate::runner_v3::RunnerOptions {
            skill: self.options.skill,
            skills,
            potions,
            potion_cost: self.options.potion_cost,
            attack: s.combat.map(|c| c[0]),
            level: s.level,
            mob,
            memory: Arc::clone(&self.battle_memory),
            strategy: Strategy::win(),
            timed_move: self.options.timed_move,
        }
    }
}

/// Cost share of Dùng bình máu: a Hoàn Linh Dược costs own max HP, so best_action drinks one only when the mob's answer
/// could otherwise end the battle, at about 15–20% HP at every level (07-auto-battle.md#bình-máu-và-mana).
pub const HP_POTION_SHARE: f64 = 1.0;
/// Cost share of Dùng bình mana: a Kim Đan Dược is drunk when the skills its 25 nội lực pay for are worth more than this
/// share of own max HP, which with skills to cast is nearly every battle.
pub const MP_POTION_SHARE: f64 = 0.17;

/// The stacks of `bag` as battle_potions takes them, (slot, item id, quantity) in slot order: a slot updated on its own
/// (s2c/1187 kind 4, bag_after) is at the end of Bag.items.
pub fn bag_stacks(bag: Option<&crate::items::Bag>) -> Vec<(i32, i32, i32)> {
    let mut stacks: Vec<(i32, i32, i32)> = (bag.iter())
        .flat_map(|b| &b.items)
        .map(|i| (i.slot as i32, i.item_id, i.quantity))
        .collect();
    stacks.sort_by_key(|s| s.0);
    stacks
}

/// The potions a battle may use, of `bag` (slot, item id, quantity, in slot order: bag_stacks): of each kind Dùng bình
/// máu or Dùng bình mana turns on, at most its max a battle and never so many that fewer than it keeps are left, from
/// the first slot holding it on; each at its cost share.
pub fn battle_potions(
    fight: &FightSettings,
    bag: impl IntoIterator<Item = (i32, i32, i32)>,
) -> Vec<crate::battle_actions::Potion> {
    let bag: Vec<(i32, i32, i32)> = bag.into_iter().filter(|p| p.2 > 0).collect();
    let mut out = vec![];
    for (id, share) in [(0, HP_POTION_SHARE), (1, MP_POTION_SHARE)] {
        let Some((max, keep)) = fight.potion_rule(id) else {
            continue;
        };
        let held: i64 = bag.iter().filter(|p| p.1 == id).map(|p| p.2 as i64).sum();
        let mut left = (held - keep as i64).clamp(0, max as i64) as i32;
        for &(slot, _, quantity) in bag.iter().filter(|p| p.1 == id) {
            if left == 0 {
                break;
            }
            let n = quantity.min(left);
            out.push(crate::battle_actions::Potion {
                slot,
                item_id: id,
                quantity: n,
                cost_share: Some(share),
            });
            left -= n;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn battle_potions_keep_and_cap() {
        let on = FightSettings {
            hp_potion: true,
            mp_potion: true,
            ..FightSettings::default()
        };
        // Off by default: none.
        assert!(battle_potions(&FightSettings::default(), [(3, 0, 50), (4, 1, 50)]).is_empty());
        // 1 Hoàn Linh and 2 Kim Đan a battle, from the first slot; an empty slot and other items are skipped.
        let p = battle_potions(
            &on,
            [(2, 0, 0), (3, 0, 40), (5, 7, 9), (4, 1, 1), (6, 1, 40)],
        );
        let got: Vec<_> = p
            .iter()
            .map(|p| (p.slot, p.item_id, p.quantity, p.cost_share))
            .collect();
        assert_eq!(
            got,
            [
                (3, 0, 1, Some(HP_POTION_SHARE)),
                (4, 1, 1, Some(MP_POTION_SHARE)),
                (6, 1, 1, Some(MP_POTION_SHARE))
            ]
        );
        // Never below what is kept: 31 Hoàn Linh leave 1, 30 none; 31 Kim Đan leave 1 of the 2.
        assert_eq!(
            battle_potions(&on, [(3, 0, 31), (4, 1, 31)])
                .iter()
                .map(|p| p.quantity)
                .collect::<Vec<_>>(),
            [1, 1]
        );
        assert!(battle_potions(&on, [(3, 0, 30), (4, 1, 12)]).is_empty());
        let mine = FightSettings {
            hp_potion_max: 3,
            hp_potion_keep: 0,
            ..on
        };
        assert_eq!(
            battle_potions(&mine, [(3, 0, 2)])
                .iter()
                .map(|p| p.quantity)
                .collect::<Vec<_>>(),
            [2]
        );
        // 0 a battle is off; more than POTION_MAX is POTION_MAX.
        let edited = FightSettings {
            hp_potion_max: 0,
            mp_potion_max: 500,
            mp_potion_keep: 0,
            ..on
        };
        assert_eq!(edited.potion_rule(0), None);
        assert_eq!(edited.potion_rule(1), Some((POTION_MAX, 0)));
        assert_eq!(
            battle_potions(&edited, [(3, 0, 99), (4, 1, 99)])
                .iter()
                .map(|p| (p.item_id, p.quantity))
                .collect::<Vec<_>>(),
            [(1, POTION_MAX as i32)]
        );
    }
}

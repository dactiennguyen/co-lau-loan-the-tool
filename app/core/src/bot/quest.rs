//! Tự làm nhiệm vụ: the quest run, its steps and the trips between maps it takes.
use super::*;

/// The line of a duel's dialog that takes it (N1: 0 "Đồng ý", 1 "Từ chối").
const DUEL_YES: &str = "Đồng ý";

impl Bot {
    /// Starts "Tự làm nhiệm vụ" on the current quest, replacing a quest run; refused while a fight job runs. With
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
        if self.job_running() {
            return out.push(Out::Log(
                LogKind::Quest,
                "Đang đánh quái: bấm Dừng rồi mới làm nhiệm vụ".into(),
            ));
        }
        if self.moving() {
            return out.push(Out::Log(
                LogKind::Quest,
                "Đang đổi chỗ: đợi tới nơi rồi mới làm nhiệm vụ".into(),
            ));
        }
        if self.smith.is_some() {
            return out.push(Out::Log(
                LogKind::Quest,
                "Đang làm việc ở Pháp sư hay Hương Lão: bấm Dừng rồi mới làm nhiệm vụ".into(),
            ));
        }
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
            out.push(Out::Log(
                LogKind::Quest,
                format!("Không làm bước {}: {reason}", i + 1),
            ));
            if !self.quest_running() {
                self.snap.quest_run = Some(self.new_run(max_losses, index, Some(reason.into())));
            }
            return;
        }
        if self.quest_running() {
            self.finish_quest("Đã bắt đầu lần chạy mới", out);
        }
        self.snap.quest_run = Some(self.new_run(max_losses, index, None));
        self.run_started = now;
        (self.waits, self.hops, self.travelling, self.awaiting_reply) = (0, 0, None, false);
        self.duels = 0;
        self.refused.clear();
        self.job_seq += 1;
        (self.repair_failed, self.repair_warned) = (HashSet::new(), false);
        out.push(Out::Log(
            LogKind::Quest,
            match &playing {
                Some((_, _, text)) => format!("Bắt đầu: làm bước \"{text}\""),
                None => "Bắt đầu: tự làm nhiệm vụ".into(),
            },
        ));
        self.playing = playing;
        let challenging = matches!(self.timer, Some((_, Wake::ChallengeTimeout)));
        if self.battle.is_none() && !challenging {
            self.next(now, out);
        }
    }

    pub(super) fn new_run(
        &mut self,
        max_losses: u32,
        step: Option<i32>,
        done: Option<String>,
    ) -> QuestRun {
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
            picked: vec![],
            doing: String::new(),
            ended_at: done.is_some().then(epoch_ms),
            done,
            started_at: epoch_ms(),
        }
    }

    pub(super) fn finish_quest(&mut self, reason: &str, out: &mut Vec<Out>) {
        if !matches!(self.timer, Some((_, Wake::ChallengeTimeout))) {
            self.timer = None;
        }
        (self.travelling, self.awaiting_reply) = (None, false);
        let what = match self.playing.take() {
            Some(_) => "làm bước",
            None => "tự làm nhiệm vụ",
        };
        if let Some(r) = &mut self.snap.quest_run {
            let end = epoch_ms();
            (r.done, r.ended_at) = (Some(reason.into()), Some(end));
            out.push(Out::Log(LogKind::Quest, format!(
                "Kết thúc {what}: {reason} ({} thắng, {} thua, +{} EXP, +{} xu, xong {} nhiệm vụ, trong {})",
                r.wins,
                r.losses,
                r.exp,
                r.coin,
                r.completed,
                duration_text(Duration::from_millis(end.saturating_sub(r.started_at)))
            )));
        }
    }
}

/// The quest run: next(), elsewhere(), travel(), fight() and onBattleEnd() of QuestBot in src/bot/quest.ts.
impl Bot {
    pub(super) fn doing(&mut self, text: String) {
        if let Some(r) = &mut self.snap.quest_run {
            r.doing = text;
        }
    }

    pub(super) fn advance(&mut self, reason: &str, out: &mut Vec<Out>) {
        let Some(q) = &mut self.snap.quest else {
            return;
        };
        (q.current, q.progress) = (q.current + 1, 0);
        (self.hops, self.duels) = (0, 0);
        let next = q.steps.get(q.current as usize).map(|s| s.text.as_str());
        out.push(Out::Log(
            LogKind::Quest,
            format!("{reason}; bước tiếp: {}", next.unwrap_or("(hết)")),
        ));
    }

    /// Decides the next action from the current quest step.
    pub(super) fn quest_next(&mut self, now: Instant, out: &mut Vec<Out>) {
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
        let action = step_action(&step.text, step.npc_id, step.param);
        let reached = match &action {
            StepAction::Kill { .. } => q.progress >= step.required,
            StepAction::Damage { amount, .. } => q.progress >= *amount,
            _ => false,
        };
        if reached {
            self.advance(&format!("Xong \"{}\"", step.text), out);
            return self.quest_next(now, out);
        }
        if !matches!(action, StepAction::Stat) && self.allot(now, out) {
            return;
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
            // By the stat plan when there is one, else into Cường lực.
            StepAction::Stat => {
                let stat = match self.plan_weights() {
                    Some(w) => {
                        let s = next_stat(&w, &self.given);
                        self.given[s] += 1;
                        s
                    }
                    None => 0,
                };
                let text = format!("Cộng 1 điểm tiềm năng vào {}", POTENTIALS[stat].0);
                self.doing(text.clone());
                out.push(Out::Log(LogKind::Character, text));
                let ctx = Ctx {
                    stat: Some(stat as i32),
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
            StepAction::Skill => self.upgrade(None, now, out),
            StepAction::Talk { npc_id } => {
                let map_id = self.snap.map_id.clone();
                self.doing(step.text.clone());
                out.push(Out::Log(
                    LogKind::Quest,
                    format!("{} (NPC {npc_id})", step.text),
                ));
                let ctx = Ctx {
                    map_id: Some(&map_id),
                    npc_id: Some(npc_id),
                    ..Ctx::default()
                };
                self.ask(13, ctx, "NPC không trả lời", now, out)
            }
            StepAction::Visit { place, map_id } => {
                self.visit(&q, &step.text, &place, &map_id, now, out)
            }
            StepAction::Unknown => {
                let reason = format!("Bot chưa biết làm bước \"{}\"", step.text);
                self.finish_quest(&reason, out)
            }
        }
    }

    /// Sends a talk or stat-point request; s2c/34 or s2c/39 must answer within 8 s.
    pub(super) fn ask(
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

    /// s2c/57 to a talk step's c2s/13: the NPC asks instead of answering with s2c/34. "Tỷ thí với Võ Quan Đinh Mộc" asks
    /// "Cậu đã sẵn sàng chiến đấu chưa." with 0 Đồng ý and 1 Từ chối (N1); Đồng ý (c2s/57) is answered by s2c/1180, the mob
    /// of the duel (duel). A dialog without Đồng ý ends the run, and so does a fourth duel for the same step, or no s2c/1180
    /// within 8 s. ← dialog() of quest.ts.
    pub(super) fn npc_dialog(&mut self, menu: NpcMenu, now: Instant, out: &mut Vec<Out>) {
        let step = self
            .snap
            .quest
            .as_ref()
            .and_then(|q| q.steps.get(q.current.max(0) as usize).cloned());
        let Some(step) = step.filter(|s| s.npc_id >= 0) else {
            return;
        };
        let Some(&(option, _)) = menu.options.iter().find(|o| o.1 == DUEL_YES) else {
            let options: Vec<&str> = menu.options.iter().map(|o| o.1.as_str()).collect();
            let reason = format!(
                "{} hỏi \"{}\" ({}): bot chưa biết chọn dòng nào",
                menu.npc,
                menu.text,
                options.join(", ")
            );
            return self.finish_quest(&reason, out);
        };
        if self.duels >= 3 {
            let reason = format!("Đã tỷ thí với {} 3 lần mà bước vẫn chưa sang", menu.npc);
            return self.finish_quest(&reason, out);
        }
        self.duels += 1;
        self.doing(step.text.clone());
        out.push(Out::Log(
            LogKind::Quest,
            format!("{}: {} → {DUEL_YES}", menu.npc, menu.text),
        ));
        let map_id = self.snap.map_id.clone();
        let ctx = Ctx {
            option: Some(option as i32),
            map_id: Some(&map_id),
            npc_id: Some(step.npc_id),
            ..Ctx::default()
        };
        Self::send(out, 57, ctx);
        self.timer = Some((
            now + Duration::from_secs(8),
            Wake::Silence("Server không gửi trận tỷ thí sau Đồng ý"),
        ));
    }

    /// s2c/1180 after Đồng ý: the mob of the duel (mob880 "Võ Quan Đinh Mộc" cấp 20, N2), for the NPC of the current step.
    /// Challenged at once with c2s/1181 (mobId, 0, npcId) as the game does (N3), and fought as the step's battle; the s2c/34
    /// that comes with the end of a won one moves the step on (N4). ← invite() of quest.ts.
    pub(super) fn duel(&mut self, invite: DuelInvite, now: Instant, out: &mut Vec<Out>) {
        let npc = self
            .snap
            .quest
            .as_ref()
            .and_then(|q| q.steps.get(q.current.max(0) as usize))
            .map(|s| s.npc_id);
        if npc != Some(invite.npc_id) {
            return;
        }
        let Some(r) = &mut self.snap.quest_run else {
            return;
        };
        r.fights += 1;
        let mob = invite.mob;
        out.push(Out::Log(
            LogKind::Battle,
            format!(
                "Trận {}: tỷ thí với {} cấp {} ({})",
                r.fights, mob.name, mob.level, mob.id
            ),
        ));
        let ctx = Ctx {
            mob_id: Some(&mob.id),
            npc_id: Some(invite.npc_id),
            ..Ctx::default()
        };
        Self::send(out, 1181, ctx);
        self.challenged(mob, now);
    }

    /// True when the mob or NPC of the step is not in this map and the bot waits for it or travels.
    pub(super) fn elsewhere(
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
                out.push(Out::Log(
                    LogKind::Quest,
                    format!("Chưa thấy {mob}, đợi 5 s ({}/6)", self.waits),
                ));
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
    pub(super) fn travel(
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
        portal.is_some_and(|p| self.through(p, reason, now, out))
    }

    /// c2s/13 with the id of a portal of this map; s2c/13 or the refusal s2c/1256 must answer within 8 s. At most 6 for a
    /// step.
    pub(super) fn through(
        &mut self,
        portal: Place,
        reason: &str,
        now: Instant,
        out: &mut Vec<Out>,
    ) -> bool {
        if self.hops >= 6 {
            return false;
        }
        let map_id = self.snap.map_id.clone();
        self.hops += 1;
        self.travelling = Some((portal.id, portal.name.clone()));
        self.doing(format!("Qua cổng {}", portal.name));
        out.push(Out::Log(
            LogKind::Travel,
            format!(
                "{reason}: không ở {map_id}, qua cổng {} ({}/6)",
                portal.name, self.hops
            ),
        ));
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

    /// "Trinh sát Thành Hồng Giang": walks into the map of the step (M4 for param 3) through the portal named after it
    /// ("Hồng Giang" in M25) or one that led there before, else towards a map that has such a portal. The s2c/34 that comes
    /// as that map is entered moves the step on (N5), so the last portal waits for a reply as a talk does. ← visit() of
    /// quest.ts.
    pub(super) fn visit(
        &mut self,
        q: &Quest,
        text: &str,
        place: &str,
        map_id: &str,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        if self.snap.map_id == map_id {
            let reason = format!("Đã ở {place} mà server chưa sang bước \"{text}\"");
            return self.finish_quest(&reason, out);
        }
        let led: HashSet<i32> = (self.atlas.portals.iter())
            .filter(|(_, p)| p.map_id.as_deref() == Some(map_id))
            .filter_map(|(id, _)| id.parse().ok())
            .collect();
        let door = |p: &Place| p.kind == 0 && (p.name == place || led.contains(&p.id));
        let here = self.snap.places.iter().find(|p| door(p)).cloned();
        if let Some(p) = here.as_ref().filter(|p| self.refused.contains(&p.id)) {
            let reason = format!("Không vào được {place}: cổng {} ({}) từ chối", p.name, p.id);
            return self.finish_quest(&reason, out);
        }
        let direct = here.is_some();
        let gone = match here {
            Some(p) => self.through(p, text, now, out),
            None => {
                let wanted = |m: &MapRecord| m.map_id == map_id || m.places.iter().any(door);
                self.travel(q, text, &wanted, now, out)
            }
        };
        if !gone {
            return self.finish_quest(&format!("Không biết đường tới {place}"), out);
        }
        self.awaiting_reply = direct;
    }

    /// Mobs to fight while waiting for a level: the strongest kind not above own level that is not a boss.
    pub(super) fn grind_targets(&self) -> Vec<Mob> {
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

    pub(super) fn quest_fight(
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
        out.push(Out::Log(
            LogKind::Battle,
            format!(
                "Trận {}: thách đấu {} cấp {} ({})",
                r.fights, mob.name, mob.level, mob.id
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

    /// Counts a battle of the quest run. The local count is replaced by the server's s2c/1201 a few ms later. A boss is
    /// not expected to fall: its damage counts won or lost, and a loss to it does not stop the run.
    pub(super) fn quest_battle_end(
        &mut self,
        end: &BattleEnd,
        boss: bool,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        let took = duration_text(now.saturating_duration_since(self.battle_started));
        let ran = duration_text(now.saturating_duration_since(self.run_started));
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
        out.push(Out::Log(
            LogKind::Battle,
            format!(
                "Trận {}: {}, {} lượt trong {}, gây {} sát thương, +{} EXP, +{} xu; đã chạy {}",
                r.fights,
                if end.won { "thắng" } else { "thua" },
                end.my_turns,
                took,
                end.damage,
                end.exp.unwrap_or(0),
                end.coin.unwrap_or(0),
                ran
            ),
        ));
        let name = self
            .mobs
            .iter()
            .find(|m| m.id == end.mob_id)
            .map(|m| m.name.clone());
        if let Some(q) = &mut self.snap.quest {
            if let Some(step) = q.steps.get(q.current.max(0) as usize) {
                let action = step_action(&step.text, step.npc_id, step.param);
                if action.mob().is_some() && action.mob() == name.as_deref() {
                    match action {
                        StepAction::Damage { amount, .. } => {
                            q.progress += end.damage;
                            out.push(Out::Log(
                                LogKind::Quest,
                                format!("Sát thương lên boss: {}/{amount}", q.progress),
                            ));
                        }
                        StepAction::Kill { .. } if end.won => {
                            q.progress += 1;
                            out.push(Out::Log(
                                LogKind::Quest,
                                format!("Đã diệt {}/{}", q.progress, step.required),
                            ));
                        }
                        _ => {}
                    }
                }
            }
        }
        if !end.won && boss {
            out.push(Out::Log(
                LogKind::Battle,
                "Thua boss: không mất EXP, vẫn đánh tiếp".into(),
            ));
        }
        if !end.won && !boss && losses >= max_losses {
            return self.finish_quest(&format!("Thua {losses} trận"), out);
        }
        self.timer = Some((now + self.options.rest, Wake::Next));
    }
}

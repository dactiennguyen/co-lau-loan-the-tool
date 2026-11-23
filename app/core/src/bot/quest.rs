//! Tự làm nhiệm vụ: the quest run, its steps and the trips between maps it takes.
use super::*;

/// The line of a duel's dialog that takes it (N1: 0 "Đồng ý", 1 "Từ chối").
const DUEL_YES: &str = "Đồng ý";
/// The line of a menu that comes before the step's own dialog ("Ngươi cần gì ở châu này?" of Tướng phe Thiết Hổ: Thông tin
/// châu, Nói chuyện; 20/11).
const TALK: &str = "Nói chuyện";

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
        if self.gift.is_some() {
            return out.push(Out::Log(
                LogKind::Quest,
                "Đang nhập mã quà tặng: bấm Dừng rồi mới làm nhiệm vụ".into(),
            ));
        }
        if self.mail_changing() {
            return out.push(Out::Log(
                LogKind::Quest,
                "Đang nhận, gửi hay xoá thư: đợi xong rồi mới làm nhiệm vụ".into(),
            ));
        }
        if self.market_changing() {
            return out.push(Out::Log(
                LogKind::Quest,
                "Đang mua bán ở Chợ trời: đợi xong rồi mới làm nhiệm vụ".into(),
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
        (self.zone_tries, self.zone_list_asked) = (vec![], false);
        self.duels = 0;
        self.refused.clear();
        self.job_seq += 1;
        self.reset_pace();
        (self.repair_failed, self.repair_warned) = (HashSet::new(), false);
        self.potions_kept = [false; 2];
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
        // The deadline of a portal of the run goes with it (through); a trip or a zone change keeps its own.
        if self.travelling.take().is_some() && self.trip.is_none() && self.zoning.is_none() {
            self.move_until = None;
        }
        self.awaiting_reply = false;
        (self.step_ready, self.break_until, self.snap.break_until) = (false, None, None);
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

/// How many zones a quest step tries for its mob before it gives up (quest_zone), and for its boss: a zone without the
/// boss is left at once, so more of them are tried.
const QUEST_ZONE_TRIES: usize = 5;
const QUEST_BOSS_ZONE_TRIES: usize = 30;

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
        (q.current, q.progress) = (q.current.saturating_add(1), 0);
        (self.hops, self.duels) = (0, 0);
        (self.zone_tries, self.zone_list_asked) = (vec![], false);
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
        if !matches!(action, StepAction::Skill) && self.auto_skill(now, out) {
            return;
        }
        // Chờ giữa các bước nhiệm vụ before a portal, a talk or a point; a battle here waits Chờ giữa các trận instead.
        if !self.fights_here(&action) && self.step_hold(now) {
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
            // The boss of s2c/1177 ignores c2s/15; the game challenges it with c2s/1178 (B4). A kill step can name one
            // too: "Đánh bại Tướng Thiết Kích" of quest 28 (B8).
            StepAction::Kill { mob } => {
                let targets = named(&mob);
                let doing = format!("Đánh {mob} ({}/{})", q.progress, step.required);
                let opcode = if self.is_boss(&mob) { 1178 } else { 15 };
                self.quest_fight(targets, doing, opcode, now, out)
            }
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
            // No point left (spent before the quest asked for one, e.g. by Tự cộng điểm before this quest came): the server
            // ignores c2s/10 and the run stopped on its silence ("Server không trả lời khi cộng điểm tiềm năng", 20/11).
            // Battles bring a level, and the level the points.
            StepAction::Stat if self.snap.stat_points == Some(0) => {
                let targets = self.grind_targets();
                let doing = format!(
                    "Hết điểm tiềm năng cho bước \"{}\": cày tới khi lên cấp ({})",
                    step.text,
                    targets.first().map_or("?", |m| &m.name)
                );
                self.quest_fight(targets, doing, 15, now, out)
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
                self.talked = false;
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
                // The words and the three numbers of s2c/39, so a new kind of step can be added from the log alone.
                let reason = format!(
                    "Bot chưa biết làm bước \"{}\" (thamSố {}, cần {}, npcId {})",
                    step.text, step.param, step.required, step.npc_id
                );
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
    /// within 8 s. A menu with Nói chuyện and no Đồng ý ("Ngươi cần gì ở châu này?" of Tướng phe Thiết Hổ, NPC 145, step 2
    /// of quest 22: Thông tin châu, Nói chuyện; manina2, manina3, tiheo2 on 20/11) gets Nói chuyện once per c2s/13, as the
    /// way to the step's own dialog. ← dialog() of quest.ts.
    pub(super) fn npc_dialog(&mut self, menu: NpcMenu, now: Instant, out: &mut Vec<Out>) {
        let step = self
            .snap
            .quest
            .as_ref()
            .and_then(|q| q.steps.get(q.current.max(0) as usize).cloned());
        let Some(step) = step.filter(|s| s.npc_id >= 0) else {
            return;
        };
        let yes = menu.options.iter().find(|o| o.1 == DUEL_YES);
        let talk = menu.options.iter().find(|o| o.1 == TALK);
        if let (None, Some(&(option, _)), false) = (yes, talk, self.talked) {
            self.talked = true;
            out.push(Out::Log(
                LogKind::Quest,
                format!("{}: {} → {TALK}", menu.npc, menu.text),
            ));
            let map_id = self.snap.map_id.clone();
            let gap = self.reply57(option, &map_id, step.npc_id, now, out);
            self.timer = Some((
                now + gap + Duration::from_secs(8),
                Wake::Silence("NPC không trả lời sau Nói chuyện"),
            ));
            return;
        }
        let Some(&(option, _)) = yes else {
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
        let gap = self.reply57(option, &map_id, step.npc_id, now, out);
        self.timer = Some((
            now + gap + Duration::from_secs(8),
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
                // A mob the atlas puts in this map is waited for here (6 × 5 s), then looked for in other zones. A boss
                // is looked for in another zone at once, unless this zone's boss only left its tile (s2c/1177 field 1,
                // back after ~13 s): each zone has its own, and one beaten by others is not back for long.
                let map = self.atlas.maps.get(&self.snap.map_id);
                if !map.is_some_and(has) {
                    return self.travel(q, reason, &has, now, out);
                }
                let boss = map.is_some_and(|m| m.bosses.iter().any(|b| b.name == mob));
                let moving = self.snap.bosses.iter().any(|b| b.name == mob && b.moving);
                if self.waits >= 6 || (boss && !moving) {
                    return self.quest_zone(mob, boss, now, out);
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

    /// The mob of the step is in this map by the atlas but not in this zone after 6 × 5 s, or its boss is not in this
    /// zone (at once, `boss`): another zone of the map, as the Khu vực panel would (c2s/1173). Every zone has its own boss
    /// (mob86100001 in zone 0, mob86100801 in zone 8 for Thủ Lĩnh Sơn Tặc of M1), and in a busy zone it may have just been
    /// beaten by others (20/11, four accounts waited for it in vain). The zone with the fewest players of the list
    /// (s2c/1172, asked in each zone), not full and not left yet for this step; at most QUEST_ZONE_TRIES zones
    /// (QUEST_BOSS_ZONE_TRIES for a boss). True while a zone change or the list is awaited.
    fn quest_zone(&mut self, mob: &str, boss: bool, now: Instant, out: &mut Vec<Out>) -> bool {
        let tries = match boss {
            true => QUEST_BOSS_ZONE_TRIES,
            false => QUEST_ZONE_TRIES,
        };
        if !self.quest_running() || self.zone_tries.len() >= tries {
            return false;
        }
        let Some(zones) = self.snap.zones.clone() else {
            if self.zone_list_asked {
                return false;
            }
            self.zone_list_asked = true;
            self.list_zones(out);
            self.timer = Some((now + Duration::from_secs(2), Wake::Next));
            return true;
        };
        let here = self.snap.zone;
        let next = zones
            .iter()
            .filter(|z| z.zone != here && !self.zone_tries.contains(&z.zone))
            .filter(|z| z.players < z.capacity)
            .min_by_key(|z| (z.players, z.zone))
            .map(|z| z.zone);
        let Some(zone) = next else {
            return false;
        };
        self.zone_tries.push(here);
        let n = self.zone_tries.len();
        let text = match self.waits {
            0 => format!("Khu {here} không có {mob}, sang khu {zone} tìm ({n}/{tries})"),
            _ => {
                format!("Không thấy {mob} ở khu {here} sau 30 s, sang khu {zone} tìm ({n}/{tries})")
            }
        };
        out.push(Out::Log(LogKind::Quest, text));
        self.doing(format!("Sang khu {zone} tìm {mob}"));
        if !self.zone_to(zone, true, now, out) {
            return false;
        }
        // s2c/11 of the new zone clears the list: it is asked again there, with fresh player counts.
        (self.waits, self.zone_list_asked) = (0, false);
        true
    }

    /// Walks through a portal of s2c/11 (c2s/13 with its id, B5): the first of the shortest known way to a map where
    /// `wanted` holds; with none, a jump through Bản đồ thế giới to a map with such a way (world_way: out of Hang Bạch
    /// Hổ, whose portals the atlas lacks); else one the quest names ("Tìm Đến Vân Sơn") towards a map not seen yet, else
    /// any towards a map not seen yet. Portals refused in this run are left out; at most 6 for a step, the jump one.
    pub(super) fn travel(
        &mut self,
        q: &Quest,
        reason: &str,
        wanted: &dyn Fn(&MapRecord) -> bool,
        now: Instant,
        out: &mut Vec<Out>,
    ) -> bool {
        // A jump through Bản đồ thế giới under way: the step goes on once it is there (warp_arrived).
        if self.warp.is_some() {
            return true;
        }
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
        let routed = self.atlas.route(&map_id, wanted, level, &self.refused);
        if routed.is_none() && self.hops < 6 {
            if let Some((via, _)) = self.world_way(wanted) {
                let name = self
                    .atlas
                    .maps
                    .get(&via)
                    .map_or(via.clone(), |m| m.name.clone());
                out.push(Out::Log(
                    LogKind::Travel,
                    format!("{reason}: không có đường qua cổng từ {map_id}, qua Bản đồ thế giới tới {name}"),
                ));
                self.hops += 1;
                self.doing(format!("Qua Bản đồ thế giới tới {name}"));
                return self.warp_to(&via, &name, None, now, out);
            }
        }
        let portal = routed
            .or_else(|| {
                fresh
                    .iter()
                    .find(|p| text.contains(&p.name))
                    .map(|p| (*p).clone())
            })
            .or_else(|| fresh.first().map(|p| (*p).clone()));
        portal.is_some_and(|p| self.through(p, reason, now, out))
    }

    /// c2s/13 with the id of a portal of this map; s2c/13 or the refusal s2c/1256 must answer within 8 s, and the new map
    /// (s2c/43 after its s2c/11) must be in within the same 8 s: s2c/13 clears the timer, so `move_until` holds that
    /// deadline, as for a trip (on_timer). At most 6 for a step.
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
        self.move_until = Some(now + Duration::from_secs(8));
        true
    }

    /// "Trinh sát Thành Hồng Giang", "Đến Cửu Phong": walks into the map of the step (M4 for param 3, M10 for 9) through
    /// the portal named after it ("Hồng Giang" in M25) or one that led there before, else towards a map that has such a
    /// portal. The s2c/34 that comes as that map is entered moves the step on (N5), so the last portal waits for a reply as
    /// a talk does. The map of a param is known from two steps only: when the atlas names it otherwise than the step, it
    /// stops rather than walk to the wrong map. ← visit() of quest.ts.
    pub(super) fn visit(
        &mut self,
        q: &Quest,
        text: &str,
        place: &str,
        map_id: &str,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        if let Some(known) = self.atlas.maps.get(map_id).filter(|m| m.name != place) {
            let reason = format!(
                "Bước \"{text}\": thamSố chỉ tới {map_id} ({}), không phải {place}; bot không tự đi",
                known.name
            );
            return self.finish_quest(&reason, out);
        }
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
            let reason = match self.zone_tries.len() {
                0 => "Không thấy quái của bước này ở khu này".to_string(),
                n => format!("Không thấy quái của bước này ở {} khu đã tìm", n + 1),
            };
            return self.finish_quest(&reason, out);
        }
        if self.walking(now) {
            return;
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
                            q.progress = q.progress.saturating_add(end.damage);
                            out.push(Out::Log(
                                LogKind::Quest,
                                format!("Sát thương lên boss: {}/{amount}", q.progress),
                            ));
                        }
                        StepAction::Kill { .. } if end.won => {
                            q.progress = q.progress.saturating_add(1);
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
        self.timer = Some((now + self.rest_after_battle(), Wake::Next));
    }
}

//! Chỉ số and kỹ năng: the stat plan, "Cộng +1", and the skill levels (c2s/10, c2s/1191).
use super::*;

/// Potential points: the stat plan (--stats of QuestBot) and "Cộng +1" on one stat.
impl Bot {
    /// The game has let the character in (net/session.rs): the stat plan spends what points there are.
    pub fn on_ready(&mut self, now: Instant, out: &mut Vec<Out>) {
        if self.stat_plan.is_some() && self.idle() {
            self.next(now, out);
        }
    }

    /// Sets how potential points are spent on their own, None for not at all. With nothing running they go out now; a
    /// job or quest run spends them between battles.
    pub fn set_stats(&mut self, plan: Option<StatPlan>, now: Instant, out: &mut Vec<Out>) {
        (self.stat_plan, self.given, self.spent) = (plan, [0; 4], [0; 4]);
        (self.allot_failed, self.plan_warned) = (false, false);
        out.push(Out::Log(
            LogKind::Character,
            match plan {
                None => "Thôi tự cộng điểm tiềm năng".into(),
                Some(StatPlan::Auto) => "Tự cộng điểm tiềm năng vào chỉ số chính của hệ".into(),
                Some(StatPlan::Weights(w)) => format!(
                    "Tự cộng điểm tiềm năng theo tỉ lệ {}",
                    Self::by_stat(&w, ", ", |n| format!(" {n}"))
                ),
            },
        ));
        if self.idle() {
            self.next(now, out);
        }
    }

    /// "Cộng +1" on the stat of c2s/10 index `stat`: one point now. Not in a battle, nor while the plan waits for an
    /// answer.
    pub fn add_stat(&mut self, stat: usize, out: &mut Vec<Out>) {
        let Some(&(name, _)) = POTENTIALS.get(stat) else {
            return;
        };
        let refused = if self.battle.is_some() {
            Some("đang đánh, đợi hết trận")
        } else if self.allotting {
            Some("bot đang tự cộng điểm")
        } else if self.snap.stat_points.unwrap_or(0) <= 0 {
            Some("hết điểm tiềm năng")
        } else {
            None
        };
        if let Some(why) = refused {
            return out.push(Out::Log(
                LogKind::Character,
                format!("Chưa cộng {name}: {why}"),
            ));
        }
        out.push(Out::Log(
            LogKind::Character,
            format!("Cộng 1 điểm tiềm năng vào {name}"),
        ));
        let ctx = Ctx {
            stat: Some(stat as i32),
            amount: Some(1),
            ..Ctx::default()
        };
        Self::send(out, 10, ctx);
    }

    /// No battle, job, quest run or timer: what `next` would do is the stat plan only.
    pub(super) fn idle(&self) -> bool {
        self.battle.is_none()
            && self.timer.is_none()
            && !self.job_running()
            && !self.quest_running()
    }

    pub(super) fn plan_weights(&self) -> Option<[u32; 4]> {
        self.stat_plan?.weights(self.snap.element)
    }

    /// `values` by c2s/10 index as "Cường lực 3, Thân pháp 1", leaving out the zeros.
    pub(super) fn by_stat(values: &[u32; 4], sep: &str, show: impl Fn(u32) -> String) -> String {
        let parts: Vec<String> = (0..4)
            .filter(|&i| values[i] > 0)
            .map(|i| format!("{}{}", POTENTIALS[i].0, show(values[i])))
            .collect();
        parts.join(sep)
    }

    /// s2c/10 kind 8, the points left. It comes last of the three that answer c2s/10 (P1), so a point of the plan goes
    /// on to the next in 250 ms; points that came with a level while nothing runs go out the same way.
    pub(super) fn points_changed(&mut self, now: Instant) {
        if self.allotting {
            self.allotting = false;
            self.timer = Some((now + Duration::from_millis(250), Wake::Next));
        } else if self.stat_plan.is_some() && !self.allot_failed && self.idle() {
            self.timer = Some((now + Duration::from_millis(250), Wake::Next));
        }
    }

    /// One point of the stat plan (allot of QuestBot): c2s/10 (stat, 1), the next once s2c/10 kind 8 answers it, so
    /// points go out between battles only. Points for the "Nâng điểm tiềm năng" steps still ahead in the quest are kept
    /// for them. True when a point was sent.
    pub(super) fn allot(&mut self, now: Instant, out: &mut Vec<Out>) -> bool {
        if self.allot_failed {
            return false;
        }
        let Some(weights) = self.plan_weights() else {
            if self.stat_plan.is_some() && !self.plan_warned {
                self.plan_warned = true;
                out.push(Out::Log(
                    LogKind::Character,
                    "Chưa biết chỉ số chính của hệ này: không tự cộng điểm tiềm năng".into(),
                ));
            }
            return false;
        };
        let keep = self.snap.quest.as_ref().map_or(0, |q| {
            q.steps
                .iter()
                .skip(q.current.max(0) as usize)
                .filter(|s| matches!(step_action(&s.text, s.npc_id), StepAction::Stat))
                .count() as i32
        });
        let left = self.snap.stat_points.unwrap_or(0);
        if left <= keep {
            if self.spent.iter().any(|&n| n > 0) {
                let kept = match keep {
                    0 => String::new(),
                    n => format!(", chừa {n} cho bước \"Nâng điểm tiềm năng\""),
                };
                out.push(Out::Log(
                    LogKind::Character,
                    format!(
                        "Đã tự cộng điểm tiềm năng: {}; còn {left}{kept}",
                        Self::by_stat(&self.spent, ", ", |n| format!(" +{n}"))
                    ),
                ));
                self.spent = [0; 4];
            }
            return false;
        }
        if self.spent.iter().all(|&n| n == 0) {
            out.push(Out::Log(
                LogKind::Character,
                format!("Tự cộng {} điểm tiềm năng", left - keep),
            ));
        }
        let stat = next_stat(&weights, &self.given);
        self.given[stat] += 1;
        self.spent[stat] += 1;
        self.allotting = true;
        let ctx = Ctx {
            stat: Some(stat as i32),
            amount: Some(1),
            ..Ctx::default()
        };
        Self::send(out, 10, ctx);
        self.timer = Some((now + Duration::from_secs(8), Wake::StatSilence));
        true
    }
}

/// Skill levels: the quest step "Sử dụng điểm kỹ năng" and Nâng cấp of the Kỹ năng tab, both c2s/1191 (id, 1).
impl Bot {
    /// Nâng cấp on skill `id`: one level now, when the tab would allow it. Not in a battle, nor while another c2s/1191
    /// waits for its answer.
    pub fn upgrade_skill(&mut self, id: i32, now: Instant, out: &mut Vec<Out>) {
        if self.snap.skills.iter().all(|k| k.id != id) {
            return out.push(Out::Log(
                LogKind::Character,
                format!("Chưa nâng kỹ năng {id}: không có trong cây"),
            ));
        }
        self.upgrade(Some(id), now, out);
    }

    /// c2s/1191 (id, 1) for skill `id`, or for the step the first skill of the s2c/30 tree that can take a level now (for
    /// a new character the root: Hỏa Cầu Thuật 1000, Băng Tiễn Thuật 4000).
    pub(super) fn upgrade(&mut self, id: Option<i32>, now: Instant, out: &mut Vec<Out>) {
        let step = id.is_none();
        let skills = Arc::clone(&self.snap.skills);
        let points = self.snap.skill_points.unwrap_or(0);
        let nodes = skill_tree(&skills, &self.snap.skill_levels, self.snap.level, points);
        let node = match id {
            Some(id) => nodes.iter().find(|n| n.skill.id == id),
            None => nodes.iter().find(|n| n.blockers.is_empty()),
        };
        let Some(node) = node else {
            let reason = match skills.is_empty() {
                true => "Chưa nhận cây kỹ năng (s2c/30)".to_string(),
                false => format!(
                    "Không kỹ năng nào lên cấp được lúc này (cấp {}, {points} điểm kỹ năng)",
                    self.snap.level
                ),
            };
            return self.finish_quest(&reason, out);
        };
        let (name, level) = (node.skill.name.clone(), node.level + 1);
        let pending = self
            .upgrading
            .as_ref()
            .is_some_and(|u| now < u.at + Duration::from_secs(8));
        let refused = if !step && self.battle.is_some() {
            Some("đang đánh, đợi hết trận".to_string())
        } else if !step && pending {
            Some("đang đợi server trả lời lần nâng trước".to_string())
        } else if !node.blockers.is_empty() {
            Some(node.blockers.join(", "))
        } else {
            None
        };
        if let Some(why) = refused {
            return out.push(Out::Log(
                LogKind::Character,
                format!("Chưa nâng {name}: {why}"),
            ));
        }
        let cost = node.next.map_or(0, |n| n.cost);
        let text = format!("Nâng {name} lên cấp {level}");
        out.push(Out::Log(
            LogKind::Character,
            format!("{text} ({cost} điểm kỹ năng)"),
        ));
        self.upgrading = Some(Upgrade {
            id: node.skill.id,
            name,
            at: now,
            step,
        });
        let ctx = Ctx {
            skill_id: Some(node.skill.id),
            amount: Some(1),
            ..Ctx::default()
        };
        if step {
            self.doing(text);
            self.ask(1191, ctx, "Server không trả lời khi nâng kỹ năng", now, out);
        } else {
            Self::send(out, 1191, ctx);
        }
    }
}

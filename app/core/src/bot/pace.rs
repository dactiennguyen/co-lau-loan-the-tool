//! Thời gian chờ of Cài đặt đánh (FightSettings): Chờ giữa các trận, Chờ giữa các bước nhiệm vụ and Nghỉ giải lao, each
//! from its time to twice it with Thời gian ngẫu nhiên. Chờ trước mỗi lượt đi is the battle's own
//! (RunnerOptions::turn_delay of runner_v3.rs). The short waits say nothing in the log; a break does.
use super::*;

impl Bot {
    /// `base`, or from it to twice it with Thời gian ngẫu nhiên.
    fn pause(&mut self, base: Duration) -> Duration {
        self.jitter.wait(base, self.fight.delay_random)
    }

    /// The end of a battle: Chờ giữa các trận counts from it, and one of the fight job or quest run on (`counted`) is one
    /// more toward Nghỉ giải lao.
    pub(super) fn battle_over(&mut self, counted: bool, now: Instant) {
        self.battle_ended = Some(now);
        if counted {
            self.since_break = self.since_break.saturating_add(1);
        }
        // Đi lại như người chơi: without the human pace no map reload (and no s2c/43) follows a battle, so the walk
        // between two battles starts here; with it, the s2c/43 of the reload starts it.
        if !self.human.on() {
            self.wander_step(now);
        }
    }

    /// Chờ giữa các trận: from the end of a battle of the fight job or quest run to the next challenge, its own time
    /// while it is on, else BotOptions::rest (3 s) as before.
    pub(super) fn rest_after_battle(&mut self) -> Duration {
        match self.fight.mob_delay {
            true => self.pause(Duration::from_secs(self.fight.mob_delay_seconds() as u64)),
            false => self.options.rest,
        }
    }

    /// Chờ giữa các trận shorter than BotOptions::rest: the items of others still to ask for after the last battle go
    /// first, until BotOptions::rest after its end at most, as without it (a battle opened drops them, pick_next). True
    /// when the next challenge waits for them.
    pub(super) fn wait_for_pickups(&mut self, now: Instant) -> bool {
        let Some(ended) = self.battle_ended.filter(|_| self.fight.mob_delay) else {
            return false;
        };
        if now >= ended + self.options.rest || !self.to_pick.iter().any(|f| f.other) {
            return false;
        }
        self.timer = Some((now + PICK_GAP, Wake::Next));
        true
    }

    /// Nghỉ giải lao before the next thing of the fight job or quest run: after break_every battles of it, break_minutes
    /// (up to twice it with Thời gian ngẫu nhiên). True while the break lasts; its end says so and lets the run go on.
    pub(super) fn take_break(&mut self, now: Instant, out: &mut Vec<Out>) -> bool {
        let kind = match self.quest_running() {
            true => LogKind::Quest,
            false => LogKind::Battle,
        };
        if let Some(until) = self.break_until {
            if now < until {
                // Called early by an answer or a packet: the break keeps its end.
                self.timer = Some((until, Wake::Next));
                return true;
            }
            self.end_break();
            let what = match kind {
                LogKind::Quest => "làm nhiệm vụ tiếp",
                _ => "đánh tiếp",
            };
            out.push(Out::Log(kind, format!("Hết giờ nghỉ giải lao, {what}")));
            return false;
        }
        if !self.fight.rest_break || self.since_break < self.fight.break_battles() {
            return false;
        }
        let battles = std::mem::take(&mut self.since_break);
        let d = self.pause(Duration::from_secs(self.fight.break_mins() as u64 * 60));
        self.break_until = Some(now + d);
        self.snap.break_until = Some(epoch_ms() + d.as_millis() as u64);
        self.timer = Some((now + d, Wake::Next));
        self.doing("Nghỉ giải lao".into());
        out.push(Out::Log(
            kind,
            format!("Nghỉ giải lao {} sau {battles} trận", duration_text(d)),
        ));
        true
    }

    /// No break under way any more: it is over, or the run ended or started again.
    pub(super) fn end_break(&mut self) {
        (self.break_until, self.snap.break_until) = (None, None);
    }

    /// A fight job or quest run starts: Nghỉ giải lao counts its battles from 0, and nothing waits from the run before.
    pub(super) fn reset_pace(&mut self) {
        self.since_break = 0;
        self.step_ready = false;
        self.end_break();
    }

    /// Whether the next thing of the quest step `action` is a battle in this map (Chờ giữa các trận waits before it)
    /// rather than a portal, a talk or a point (Chờ giữa các bước nhiệm vụ). A mob the atlas puts in this map is waited
    /// for here (elsewhere), so it counts as here.
    pub(super) fn fights_here(&self, action: &StepAction) -> bool {
        if let StepAction::Level { level } = action {
            return self.snap.level < *level;
        }
        action.mob().is_some_and(|mob| {
            self.mobs.iter().any(|m| m.name == mob)
                || self.atlas.maps.get(&self.snap.map_id).is_some_and(|m| {
                    m.mobs.iter().any(|k| k.name == mob) || m.bosses.iter().any(|b| b.name == mob)
                })
        })
    }

    /// Cài đặt đánh saved (set_fight, before `self.fight` takes `new`): a line for each wait turned on or off or given
    /// another time. Chờ trước mỗi lượt đi reaches the battle under way; Nghỉ giải lao turned off ends a break at once.
    pub(super) fn pace_changed(&mut self, new: &FightSettings, now: Instant, out: &mut Vec<Out>) {
        let old = self.fight;
        let rest = self.options.rest.as_secs();
        let mob = |f: &FightSettings| (f.mob_delay, f.mob_delay_seconds());
        if mob(new) != mob(&old) && (new.mob_delay || old.mob_delay) {
            out.push(Out::Log(
                LogKind::Battle,
                match new.mob_delay {
                    true => format!(
                        "Chờ giữa các trận: nghỉ {} s sau mỗi trận thay cho {rest} s",
                        new.mob_delay_seconds()
                    ),
                    false => format!("Tắt chờ giữa các trận: nghỉ {rest} s sau mỗi trận như trước"),
                },
            ));
        }
        let turn = |f: &FightSettings| (f.turn_delay, f.turn_delay_seconds());
        if turn(new) != turn(&old) && (new.turn_delay || old.turn_delay) {
            out.push(Out::Log(
                LogKind::Battle,
                match new.turn_delay {
                    true => format!(
                        "Chờ trước mỗi lượt đi: {} s trước mỗi nước đi, kỹ năng hay bình trong trận",
                        new.turn_delay_seconds().text()
                    ),
                    false => "Tắt chờ trước mỗi lượt đi: đi ngay khi tới lượt".into(),
                },
            ));
        }
        let step = |f: &FightSettings| (f.step_delay, f.step_delay_seconds());
        if step(new) != step(&old) && (new.step_delay || old.step_delay) {
            out.push(Out::Log(
                LogKind::Quest,
                match new.step_delay {
                    true => format!(
                        "Chờ giữa các bước nhiệm vụ: {} s trước mỗi việc không phải trận (qua cổng, nói chuyện với NPC, cộng điểm)",
                        new.step_delay_seconds()
                    ),
                    false => "Tắt chờ giữa các bước nhiệm vụ".into(),
                },
            ));
        }
        let rest_break = |f: &FightSettings| (f.rest_break, f.break_battles(), f.break_mins());
        if rest_break(new) != rest_break(&old) && (new.rest_break || old.rest_break) {
            out.push(Out::Log(
                LogKind::Battle,
                match new.rest_break {
                    true => format!(
                        "Nghỉ giải lao: nghỉ {} phút sau mỗi {} trận",
                        new.break_mins(),
                        new.break_battles()
                    ),
                    false if self.break_until.is_some() => {
                        "Tắt nghỉ giải lao: thôi nghỉ, chạy tiếp ngay".into()
                    }
                    false => "Tắt nghỉ giải lao".into(),
                },
            ));
            if !new.rest_break && self.break_until.is_some() {
                self.end_break();
                self.timer = Some((now, Wake::Next));
            }
        }
        if new.delay_random != old.delay_random {
            out.push(Out::Log(
                LogKind::Battle,
                match new.delay_random {
                    true => "Bật thời gian ngẫu nhiên: mỗi lần chờ đang bật kéo dài từ số đã đặt tới gấp đôi",
                    false => "Tắt thời gian ngẫu nhiên: chờ đúng số đã đặt",
                }
                .into(),
            ));
        }
        if new.human_pace != old.human_pace {
            out.push(Out::Log(
                LogKind::Battle,
                match new.human_pace {
                    true => "Bật nhịp như người chơi: chờ như game thật trước khi thách đấu, mỗi nước đi, sau trận và với NPC",
                    false => "Tắt nhịp như người chơi: đánh nhanh như trước",
                }
                .into(),
            ));
            self.set_human(new.human_pace);
        }
        if new.wander != old.wander {
            out.push(Out::Log(
                LogKind::Battle,
                match new.wander {
                    true => "Bật đi lại như người chơi: rơi xuống đất sau khi vào map, đi vài bước trên bục đang đứng trước khi thách đấu",
                    false => "Tắt đi lại như người chơi: đứng yên như trước",
                }
                .into(),
            ));
            if !new.wander {
                self.wander_stop();
            }
        }
        if (new.turn_pause(), new.delay_random) != (old.turn_pause(), old.delay_random) {
            // `self.fight` is still the old one here: the new wait is `new`'s (none in Bạch Hổ, its waits are its own).
            let bach_ho = self.bach_ho_on();
            let pause = if bach_ho {
                Duration::ZERO
            } else {
                new.turn_pause()
            };
            let random = new.delay_random && !bach_ho;
            if let Some(r) = self.battle.as_mut() {
                r.set_turn_delay(pause, random);
            }
        }
    }

    /// Chờ giữa các bước nhiệm vụ before a thing of the quest run that is not a battle: true while it waits (Wake::Step
    /// calls the run again); the call after the wait does the thing. A call during the wait (an answer, a packet) keeps
    /// the wait as it is.
    pub(super) fn step_hold(&mut self, now: Instant) -> bool {
        if !self.fight.step_delay {
            return false;
        }
        if std::mem::take(&mut self.step_ready) {
            return false;
        }
        if !matches!(self.timer, Some((_, Wake::Step))) {
            let d = self.pause(Duration::from_secs(self.fight.step_delay_seconds() as u64));
            self.timer = Some((now + d, Wake::Step));
        }
        true
    }
}

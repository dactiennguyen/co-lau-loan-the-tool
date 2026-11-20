//! Tự điểm danh và nhận quà (Phúc lợi, docs/app/events/18-players-checkin.md, docs/integration/nodejs/welfare.md) ←
//! WelfareBot of src/bot/welfare.ts: Điểm danh, Quà online and Quà thăng cấp, from anywhere in the world (PL1). A run
//! reads the three events as the client does when the tab opens (c2s/1236, once a session, then c2s/1239), then takes
//! what is due: c2s/1232 (event, 0) when today is not checked, c2s/1232 (event, milestone) for a milestone of the month
//! reached (not measured), c2s/1233 (event) when Quà online or Quà thăng cấp has a milestone reached. Gifts go straight
//! into the bag and the purse.
//!
//! With FightSettings::auto_welfare a run goes on its own: at login, at the check-in's reset (00:00), while a milestone
//! of Quà online is ahead (when its minutes should be there, every WELFARE_AGAIN at the soonest), on a level that reaches
//! a milestone of Quà thăng cấp, and WELFARE_AGAIN after one that left something due (a full bag, no answer). "Nhận ngay"
//! (Bot::welfare) runs one whether it is on or not.
//!
//! A run waits for nothing the others wait for: its answers have opcodes of their own, and its notices ("Đã nhận 4 phần
//! thưởng", "Không có phần thưởng nào để nhận", "Hôm nay bạn đã điểm danh") are taken in packets.rs before a pickup or a
//! portal could take them for theirs. So it is not in Wait: a quest run's portal or zone goes on meanwhile.
use super::*;
use crate::welfare::{
    self, CheckinResult, EventDefinition, EventProgress, CHECKIN, LEVEL_UP, ONLINE_DAILY, READY,
    TAKEN, WELFARE_KEYS,
};

/// How long a packet of a run waits for its answer (they took about 100 ms in PL1).
const WELFARE_WAIT: Duration = Duration::from_secs(8);
/// The soonest an automatic run goes again after one, and how long one that could not start waits to try again.
pub(super) const WELFARE_AGAIN: Duration = Duration::from_secs(10 * 60);
const WELFARE_RETRY: Duration = Duration::from_secs(30);
/// After the check-in's reset, the run waits this much more: the server's day may turn a little after.
const AFTER_RESET: Duration = Duration::from_secs(60);
/// The first automatic run of a session, after login.
const AFTER_LOGIN: Duration = Duration::from_secs(3);

/// What a run waits for.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Step {
    /// s2c/1236 of the key.
    Definition(&'static str),
    /// s2c/1239 of the key.
    Progress(&'static str),
    /// s2c/1232 of Điểm danh (milestone 0) or of a milestone of the month.
    Checkin(i64),
    /// s2c/1239 of the key after c2s/1233, its notice before it.
    Claim(&'static str),
}

/// Something due: Điểm danh (CHECKIN, milestone 0), a milestone of the month (CHECKIN, its id), Quà online or Quà
/// thăng cấp (their key, every milestone reached at once).
#[derive(Debug, Clone, Copy, PartialEq)]
struct Due {
    key: &'static str,
    milestone: i64,
}

/// The run under way.
pub(super) struct WelfareRun {
    step: Step,
    pub(super) until: Instant,
    /// The keys still to read, then what is due still to take.
    keys: VecDeque<&'static str>,
    todo: VecDeque<Due>,
    /// The notice of the claim under way, and the ids of the milestones it takes (for their gifts in the line).
    notice: Option<String>,
    taking: Vec<i64>,
    /// "Nhận ngay": says even that nothing is due.
    manual: bool,
    /// The lines of what was taken or refused, for the tab.
    said: Vec<String>,
}

/// "25.000 Xu khóa, Hoàn Linh Dược ×10": the money of a list of items, then the items, the records of one item together
/// (Hòm thư's mails and the gifts of Phúc lợi).
pub(super) fn gift_list(items: &[ItemRecord]) -> String {
    // Xu, Xu khóa, Lượng (items 40, 41, 42), each added up.
    let mut money: Vec<(i32, i64)> = vec![];
    let mut picked: Vec<Picked> = vec![];
    for i in items {
        match crate::mail::money_item(i.item_id) {
            Some(_) => match money.iter_mut().find(|m| m.0 == i.item_id) {
                Some(m) => m.1 += i.quantity as i64,
                None => money.push((i.item_id, i.quantity as i64)),
            },
            None => add_picked(&mut picked, &Picked::of(i.item_id, i.quantity as i64)),
        }
    }
    money
        .into_iter()
        .filter_map(|(id, n)| {
            let m = crate::mail::money_item(id)?;
            Some(format!("{} {}", smith::grouped(n), m.name()))
        })
        .chain(picked.iter().map(Picked::label))
        .collect::<Vec<_>>()
        .join(", ")
}

/// ms since 1970 → an Instant, as far from `now` as from the clock now.
fn instant_of(ms: i64, now: Instant) -> Instant {
    let wall = epoch_ms() as i64;
    match ms > wall {
        true => now + Duration::from_millis((ms - wall) as u64),
        false => now,
    }
}

impl Bot {
    /// "Nhận ngay" of the Phúc lợi window: one run now, Tự điểm danh và nhận quà on or not. Refused, with the reason in the
    /// log, in a battle, while a run is under way, while the character moves or works at an NPC, and while something
    /// waits for its own notice.
    pub fn welfare(&mut self, now: Instant, out: &mut Vec<Out>) {
        match self.welfare_blocked(now) {
            Some(why) => self.welfare_said(format!("Chưa nhận quà Phúc lợi: {why}"), out),
            None => self.welfare_start(true, now, out),
        }
    }

    /// Tự điểm danh và nhận quà turned on (a run soon) or off (no more on its own; a run under way ends as it goes).
    pub(super) fn welfare_switched(&mut self, on: bool, now: Instant, out: &mut Vec<Out>) {
        out.push(Out::Log(
            LogKind::Item,
            match on {
                true => "Bật tự điểm danh và nhận quà: mỗi ngày tự điểm danh, nhận quà online khi đủ phút, quà thăng cấp khi lên cấp".into(),
                false => "Tắt tự điểm danh và nhận quà".into(),
            },
        ));
        self.welfare_at = on.then(|| now + Duration::from_secs(1));
    }

    /// The game let the character in: the first automatic run soon after.
    pub(super) fn welfare_login(&mut self, now: Instant) {
        if self.fight.auto_welfare {
            self.welfare_at = Some(now + AFTER_LOGIN);
        }
    }

    /// A level that reaches a milestone of Quà thăng cấp not reached before: a run soon, when it is on.
    pub(super) fn welfare_level(&mut self, now: Instant) {
        let level = self.snap.level;
        let reached = self
            .welfare_progress
            .get(LEVEL_UP)
            .zip(self.welfare_definitions.get(LEVEL_UP))
            .is_none_or(|(p, d)| {
                p.milestones.iter().any(|m| {
                    m.state == welfare::LOCKED
                        && d.milestones.iter().any(|x| x.id == m.id && x.need <= level)
                })
            });
        if self.fight.auto_welfare && reached {
            let soon = now + Duration::from_secs(2);
            self.welfare_at = Some(self.welfare_at.map_or(soon, |t| t.min(soon)));
        }
    }

    /// Why a run may not go now.
    fn welfare_blocked(&self, now: Instant) -> Option<String> {
        if self.battle.is_some() {
            return Some("đang đánh, đợi hết trận".into());
        }
        if self.welfare.is_some() {
            return Some("đang nhận quà Phúc lợi, đợi server trả lời".into());
        }
        if let Some(why) = self.busy_but(true) {
            return Some(why.into());
        }
        self.notice_awaited(now)
            .then(|| "đang đợi server trả lời việc khác, thử lại sau ít giây".into())
    }

    fn welfare_start(&mut self, manual: bool, now: Instant, out: &mut Vec<Out>) {
        self.welfare_at = None;
        self.welfare = Some(WelfareRun {
            step: Step::Definition(CHECKIN),
            until: now,
            keys: WELFARE_KEYS.into_iter().collect(),
            todo: VecDeque::new(),
            notice: None,
            taking: vec![],
            manual,
            said: vec![],
        });
        self.snap.welfare.doing = Some("Đang xem Phúc lợi…".into());
        self.welfare_read_next(now, out);
    }

    fn welfare_send(&mut self, step: Step, now: Instant, out: &mut Vec<Out>) {
        let Some(run) = self.welfare.as_mut() else {
            return;
        };
        (run.step, run.until, run.notice) = (step, now + WELFARE_WAIT, None);
        let (op, ctx) = match step {
            Step::Definition(key) => (
                1236,
                Ctx {
                    key: Some(key),
                    ..Ctx::default()
                },
            ),
            Step::Progress(key) => (
                1239,
                Ctx {
                    key: Some(key),
                    ..Ctx::default()
                },
            ),
            Step::Checkin(milestone) => (
                1232,
                Ctx {
                    event: self.welfare_event(CHECKIN),
                    milestone: Some(milestone),
                    ..Ctx::default()
                },
            ),
            Step::Claim(key) => (
                1233,
                Ctx {
                    event: self.welfare_event(key),
                    ..Ctx::default()
                },
            ),
        };
        Self::send(out, op, ctx);
    }

    /// The event's number, from its definition (64, 21, 65 in PL1).
    fn welfare_event(&self, key: &str) -> Option<i64> {
        self.welfare_definitions.get(key).map(|d| d.event)
    }

    /// The definition of the next key (once a session) or its progress; once all are read, what is due.
    fn welfare_read_next(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some(next) = self.welfare.as_ref().map(|r| r.keys.front().copied()) else {
            return;
        };
        let Some(key) = next else {
            let due = self.welfare_due();
            if let Some(run) = self.welfare.as_mut() {
                run.todo = due.into();
            }
            return self.welfare_claim_next(now, out);
        };
        let step = match self.welfare_definitions.contains_key(key) {
            true => {
                if let Some(run) = self.welfare.as_mut() {
                    run.keys.pop_front();
                }
                Step::Progress(key)
            }
            false => Step::Definition(key),
        };
        self.welfare_send(step, now, out);
    }

    /// What the progress says is due, in the order the TS bot takes it.
    fn welfare_due(&self) -> Vec<Due> {
        let mut due = vec![];
        if let Some(p) = self.welfare_progress.get(CHECKIN) {
            if p.checkin.is_some_and(|c| !c.checked_today) {
                due.push(Due {
                    key: CHECKIN,
                    milestone: 0,
                });
            }
            due.extend(p.ready().into_iter().map(|milestone| Due {
                key: CHECKIN,
                milestone,
            }));
        }
        for key in [ONLINE_DAILY, LEVEL_UP] {
            if self
                .welfare_progress
                .get(key)
                .is_some_and(|p| !p.ready().is_empty())
            {
                due.push(Due { key, milestone: 0 });
            }
        }
        due
    }

    /// "Điểm danh", "Mốc 7 ngày", "Quà online", "Quà thăng cấp".
    fn welfare_label(&self, due: Due) -> String {
        match (due.key, due.milestone) {
            (CHECKIN, 0) => "Điểm danh".into(),
            (CHECKIN, id) => {
                let need = self.welfare_milestone(CHECKIN, id).map(|m| m.need);
                format!(
                    "Mốc {} ngày",
                    need.map_or_else(|| id.to_string(), |n| n.to_string())
                )
            }
            (ONLINE_DAILY, _) => "Quà online".into(),
            _ => "Quà thăng cấp".into(),
        }
    }

    fn welfare_milestone(&self, key: &str, id: i64) -> Option<&welfare::Milestone> {
        self.welfare_definitions
            .get(key)?
            .milestones
            .iter()
            .find(|m| m.id == id)
    }

    /// The gifts a claim brings, for the room in the bag: Điểm danh, the one of the ten that needs the most; the others,
    /// those of the milestones it takes.
    fn welfare_gifts(&self, due: Due) -> Vec<Vec<ItemRecord>> {
        let Some(d) = self.welfare_definitions.get(due.key) else {
            return vec![];
        };
        match (due.key, due.milestone) {
            (CHECKIN, 0) => d.daily.iter().map(|g| vec![g.item.clone()]).collect(),
            (CHECKIN, id) => vec![self
                .welfare_milestone(CHECKIN, id)
                .map_or_else(Vec::new, |m| m.gifts.clone())],
            (key, _) => {
                let ready = self
                    .welfare_progress
                    .get(key)
                    .map_or_else(Vec::new, |p| p.ready());
                vec![d
                    .milestones
                    .iter()
                    .filter(|m| ready.contains(&m.id))
                    .flat_map(|m| m.gifts.clone())
                    .collect()]
            }
        }
    }

    /// The next claim due, after checking the bag has room for it; once none is left, the run ends.
    fn welfare_claim_next(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some(due) = self.welfare.as_mut().and_then(|r| r.todo.pop_front()) else {
            return self.welfare_end(now, out);
        };
        let label = self.welfare_label(due);
        let (need, free) = match &self.snap.bag {
            Some(bag) => (
                self.welfare_gifts(due)
                    .iter()
                    .map(|g| crate::mail::slots_for(g, &bag.items))
                    .max()
                    .unwrap_or(0),
                (bag.capacity - bag.items.len() as i32).max(0) as u32,
            ),
            None => (0, 0),
        };
        if self.snap.bag.is_none() || need > free {
            let why = match self.snap.bag {
                None => "chưa đọc được túi đồ".to_string(),
                Some(_) => format!("cần {need} ô trống, túi còn {free}"),
            };
            self.welfare_line(format!("Chưa nhận {label}: {why}"), out);
            return self.welfare_claim_next(now, out);
        }
        let taking = match due.key {
            CHECKIN => vec![due.milestone],
            key => self
                .welfare_progress
                .get(key)
                .map_or_else(Vec::new, |p| p.ready()),
        };
        if let Some(run) = self.welfare.as_mut() {
            run.taking = taking;
        }
        self.snap.welfare.doing = Some(format!("Đang nhận {label}…"));
        let step = match due.key {
            CHECKIN => Step::Checkin(due.milestone),
            key => Step::Claim(key),
        };
        self.welfare_send(step, now, out);
    }

    /// A line of the run: in the log and kept for the window.
    fn welfare_line(&mut self, line: String, out: &mut Vec<Out>) {
        if let Some(run) = self.welfare.as_mut() {
            run.said.push(line.clone());
        }
        out.push(Out::Log(LogKind::Item, format!("Phúc lợi: {line}")));
    }

    /// A line said outside a run (a refusal of Nhận ngay): in the log and on the window.
    fn welfare_said(&mut self, line: String, out: &mut Vec<Out>) {
        let w = &mut self.snap.welfare;
        (w.last, w.last_at) = (Some(line.clone()), Some(epoch_ms()));
        out.push(Out::Log(LogKind::Item, line));
    }

    /// The run ends: what it did goes on the window (Nhận ngay says even that nothing was due), and the next automatic
    /// run is set.
    fn welfare_end(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some(run) = self.welfare.take() else {
            return;
        };
        self.snap.welfare.doing = None;
        if !run.said.is_empty() {
            let w = &mut self.snap.welfare;
            (w.last, w.last_at) = (Some(run.said.join("; ")), Some(epoch_ms()));
        } else if run.manual {
            self.welfare_said(
                "Phúc lợi: không có gì để nhận (đã điểm danh, quà online và quà thăng cấp đã nhận hết mốc tới được)".into(),
                out,
            );
        }
        self.welfare_view();
        self.welfare_at = Some(self.welfare_next(now));
    }

    /// When the next automatic run goes: the soonest of the check-in's reset (WELFARE_AGAIN while today is not checked
    /// or the reset is past), the minutes of the next milestone of Quà online (WELFARE_AGAIN at the soonest), and WELFARE_AGAIN while
    /// something reached is not taken; an hour when nothing is known.
    fn welfare_next(&self, now: Instant) -> Instant {
        let again = now + WELFARE_AGAIN;
        let mut next: Vec<Instant> = vec![];
        match self.welfare_progress.get(CHECKIN).and_then(|p| p.checkin) {
            // A reset already past while the server still says checked (a clock off, a progress read before 00:00):
            // WELFARE_AGAIN, not a run every minute.
            Some(c) if c.checked_today => next.push(match instant_of(c.reset_ms, now) {
                t if t > now => t + AFTER_RESET,
                _ => again,
            }),
            Some(_) => next.push(again),
            None => {}
        }
        if let Some(p) = self.welfare_progress.get(ONLINE_DAILY) {
            let needs = self.welfare_definitions.get(ONLINE_DAILY);
            let ahead = p
                .milestones
                .iter()
                .filter(|m| m.state == welfare::LOCKED)
                .filter_map(|m| needs?.milestones.iter().find(|x| x.id == m.id))
                .map(|m| m.need)
                .min();
            if let Some(need) = ahead {
                let minutes = (need - p.progress).max(0) as u64 + 1;
                next.push(now + Duration::from_secs(minutes * 60).max(WELFARE_AGAIN));
            }
        }
        if self
            .welfare_progress
            .values()
            .any(|p| !p.ready().is_empty())
        {
            next.push(again);
        }
        next.into_iter()
            .min()
            .unwrap_or(now + Duration::from_secs(3600))
    }

    /// s2c/1236: kept for the session; the run asks its progress next.
    pub(super) fn welfare_definition(
        &mut self,
        d: EventDefinition,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        let key = d.key.clone();
        self.welfare_definitions.insert(key.clone(), d);
        self.welfare_view();
        let step = self.welfare.as_ref().map(|r| r.step);
        if let Some(Step::Definition(k)) =
            step.filter(|s| matches!(s, Step::Definition(k) if *k == key))
        {
            if let Some(run) = self.welfare.as_mut() {
                run.keys.pop_front();
            }
            self.welfare_send(Step::Progress(k), now, out);
        }
    }

    /// s2c/1239: the progress of an event, asked or after a claim (and its refusal); the claim under way ends with it.
    pub(super) fn welfare_progress(&mut self, p: EventProgress, now: Instant, out: &mut Vec<Out>) {
        let key = p.key.clone();
        let before = self.welfare_progress.insert(key.clone(), p);
        self.welfare_view();
        let Some(step) = self.welfare.as_ref().map(|r| r.step) else {
            return;
        };
        match step {
            Step::Progress(k) if k == key => self.welfare_read_next(now, out),
            Step::Claim(k) if k == key => {
                let run = self.welfare.as_mut().unwrap();
                let (notice, taking) = (run.notice.take(), std::mem::take(&mut run.taking));
                let label = self.welfare_label(Due {
                    key: k,
                    milestone: 0,
                });
                let now_taken: Vec<i64> = self.welfare_progress[k]
                    .milestones
                    .iter()
                    .filter(|m| m.state == TAKEN && taking.contains(&m.id))
                    .filter(|m| {
                        before.as_ref().is_none_or(|b| {
                            b.milestones
                                .iter()
                                .any(|x| x.id == m.id && x.state != TAKEN)
                        })
                    })
                    .map(|m| m.id)
                    .collect();
                let gifts: Vec<ItemRecord> = now_taken
                    .iter()
                    .filter_map(|id| self.welfare_milestone(k, *id))
                    .flat_map(|m| m.gifts.clone())
                    .collect();
                // "Không có phần thưởng nào để nhận": taken elsewhere meanwhile (the phone), whatever the states say now.
                let refused = notice.as_deref().is_some_and(welfare::is_nothing_due);
                let line = match (notice, now_taken.is_empty() || refused) {
                    (Some(n), false) => format!("{label}: {n} ({})", gift_list(&gifts)),
                    (None, false) => format!("{label}: đã nhận {}", gift_list(&gifts)),
                    (Some(n), true) => format!("Chưa nhận {label}: {n}"),
                    (None, true) => format!("Chưa nhận {label}: server không nhận"),
                };
                self.welfare_line(line, out);
                self.welfare_claim_next(now, out);
            }
            _ => {}
        }
    }

    /// s2c/1232: the answer to Điểm danh or to a milestone of the month. A refusal comes with a notice of the same words
    /// after it, which is not logged twice (welfare_notice).
    pub(super) fn welfare_checkin(&mut self, r: CheckinResult, now: Instant, out: &mut Vec<Out>) {
        if r.ok && r.milestone == 0 {
            self.snap.welfare.today_gift = r.text.split_once(": nhận ").map(|(_, g)| g.to_string());
        }
        if !r.ok {
            self.welfare_echo = Some((r.text.clone(), now));
        }
        let Some(Step::Checkin(m)) = self.welfare.as_ref().map(|w| w.step) else {
            return;
        };
        if m != r.milestone {
            return;
        }
        let label = self.welfare_label(Due {
            key: CHECKIN,
            milestone: m,
        });
        let line = match (r.ok, m) {
            (true, 0) => r.text.clone(),
            (true, _) => {
                let gifts = self
                    .welfare_milestone(CHECKIN, m)
                    .map_or_else(Vec::new, |x| x.gifts.clone());
                format!("{label}: {} ({})", r.text, gift_list(&gifts))
            }
            (false, _) => format!("Chưa nhận {label}: {}", r.text),
        };
        self.welfare_line(line, out);
        self.welfare_claim_next(now, out);
    }

    /// s2c/1256 that belongs to Phúc lợi, taken here before a pickup or a portal could take it for theirs (true): the
    /// notice of the claim under way ("Đã nhận 4 phần thưởng", "Không có phần thưởng nào để nhận"), logged as the server's;
    /// the echo of a refused Điểm danh, not logged again.
    pub(super) fn welfare_notice(&mut self, text: &str, now: Instant, out: &mut Vec<Out>) -> bool {
        if let Some((echo, at)) = &self.welfare_echo {
            if echo == text && now < *at + WELFARE_WAIT {
                self.welfare_echo = None;
                return true;
            }
        }
        let Some(run) = self.welfare.as_mut() else {
            return false;
        };
        let ours = match run.step {
            Step::Claim(_) => {
                welfare::claimed_gifts(text).is_some() || welfare::is_nothing_due(text)
            }
            Step::Checkin(_) => welfare::is_checked_already(text),
            _ => false,
        };
        if ours {
            run.notice = Some(text.to_string());
            out.push(Out::Log(LogKind::Server, text.to_string()));
        }
        ours
    }

    /// s2c/1279: the red dots of Phúc lợi (at login, after a claim).
    pub(super) fn welfare_dots(&mut self, mask: i32) {
        self.snap.welfare.dots = Some(mask);
        self.welfare_view();
    }

    /// A packet of the run waited WELFARE_WAIT: a read gives the run up, a claim goes on with the next. An automatic run
    /// that could not start tries again WELFARE_RETRY later.
    pub(super) fn welfare_timer(&mut self, now: Instant, out: &mut Vec<Out>) {
        if let Some(step) = self
            .welfare
            .as_ref()
            .filter(|w| w.until <= now)
            .map(|w| w.step)
        {
            let secs = WELFARE_WAIT.as_secs();
            match step {
                Step::Definition(_) | Step::Progress(_) => {
                    self.welfare_line(
                        format!("server không trả lời sau {secs} s, thôi lần này"),
                        out,
                    );
                    if let Some(run) = self.welfare.as_mut() {
                        (run.keys, run.todo) = (VecDeque::new(), VecDeque::new());
                    }
                    self.welfare_end(now, out);
                }
                Step::Checkin(m) => {
                    let label = self.welfare_label(Due {
                        key: CHECKIN,
                        milestone: m,
                    });
                    self.welfare_line(
                        format!("Chưa nhận {label}: server không trả lời sau {secs} s"),
                        out,
                    );
                    self.welfare_claim_next(now, out);
                }
                Step::Claim(k) => {
                    let label = self.welfare_label(Due {
                        key: k,
                        milestone: 0,
                    });
                    self.welfare_line(
                        format!("Chưa nhận {label}: server không trả lời sau {secs} s"),
                        out,
                    );
                    self.welfare_claim_next(now, out);
                }
            }
        }
        if self.fight.auto_welfare && self.welfare_at.is_some_and(|t| t <= now) {
            match self.welfare_blocked(now) {
                Some(_) => self.welfare_at = Some(now + WELFARE_RETRY),
                None => self.welfare_start(false, now, out),
            }
        }
    }

    pub(super) fn welfare_deadline(&self) -> Option<Instant> {
        let auto = self.welfare_at.filter(|_| self.fight.auto_welfare);
        [self.welfare.as_ref().map(|w| w.until), auto]
            .into_iter()
            .flatten()
            .min()
    }

    /// Snapshot.welfare from what the server said last: the three events, their milestones with their gifts, and whether
    /// something is due (a red dot, today not checked, a milestone reached).
    fn welfare_view(&mut self) {
        let event = |key: &str| -> Option<WelfareEvent> {
            let p = self.welfare_progress.get(key)?;
            let d = self.welfare_definitions.get(key);
            Some(WelfareEvent {
                title: d.map_or_else(String::new, |d| d.title.clone()),
                period: p.period.clone(),
                progress: p.progress,
                milestones: p
                    .milestones
                    .iter()
                    .map(|m| {
                        let def = d.and_then(|d| d.milestones.iter().find(|x| x.id == m.id));
                        WelfareMilestone {
                            id: m.id,
                            need: def.map_or(0, |x| x.need),
                            state: m.state,
                            gifts: def.map_or_else(String::new, |x| gift_list(&x.gifts)),
                        }
                    })
                    .collect(),
            })
        };
        let (checkin, online, level) = (event(CHECKIN), event(ONLINE_DAILY), event(LEVEL_UP));
        let day = self.welfare_progress.get(CHECKIN).and_then(|p| p.checkin);
        let daily = self
            .welfare_definitions
            .get(CHECKIN)
            .map_or_else(Vec::new, |d| {
                d.daily
                    .iter()
                    .map(|g| gift_list(std::slice::from_ref(&g.item)))
                    .collect()
            });
        let w = &mut self.snap.welfare;
        let ready = [&checkin, &online, &level]
            .into_iter()
            .flatten()
            .any(|e| e.milestones.iter().any(|m| m.state == READY));
        w.known = checkin.is_some() || online.is_some() || level.is_some();
        w.checked_today = day.map(|c| c.checked_today);
        w.day = day.map(|c| c.day);
        w.days_in_month = day.map(|c| c.days_in_month);
        w.days = day.map(|c| c.days());
        (w.checkin, w.online, w.level, w.daily) = (checkin, online, level, daily);
        let dots = w.dots.is_some_and(|m| m != 0);
        w.due = match w.known {
            true => ready || w.checked_today == Some(false),
            false => dots,
        };
    }
}

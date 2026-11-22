//! Nhịp như người chơi (human.rs, BotOptions::human): the requests the game sends a moment after the packet they follow,
//! held until then (c2s/11 after s2c/13, c2s/43 after s2c/11, c2s/57 after an NPC's dialog), and the reload of the map
//! after every battle but Bạch Hổ's (05-battle.md#sau-trận): c2s/11 (the map, the zone stood in, its index) 2.4–4.7 s
//! after the end, c2s/43 0.3–0.8 s after its s2c/11, and only then the pickups and the next challenge.
use super::*;
use crate::human;

/// A request held for its human gap, and what follows once it went.
pub(super) struct Deferred {
    pub at: Instant,
    pub opcode: i32,
    pub payload: Vec<u8>,
    pub then: Then,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Then {
    Nothing,
    /// The c2s/11 of the reload went: its s2c/11 is awaited.
    ReloadAsked,
    /// The c2s/43 of the reload went: the pickups and the next challenge may go.
    Reloaded,
}
/// The reload under way: until when its s2c/11 is awaited once c2s/11 went.
pub(super) struct Reload {
    pub map_until: Option<Instant>,
}
/// How long the reload waits for its s2c/11 before the bot goes on without it.
const RELOAD_WAIT: Duration = Duration::from_secs(8);

impl Bot {
    /// Nhịp như người chơi turned on or off while the session runs: the next waits are drawn (or none) from now on; a
    /// battle under way keeps its pace, the next takes the new one. Off, the walk to the mob is dropped; a request
    /// already held or a reload under way still ends as it began.
    pub(super) fn set_human(&mut self, on: bool) {
        self.human = match on {
            true => crate::human::Human::new(),
            false => crate::human::Human::Off,
        };
        if !on {
            self.walk_until = None;
        }
    }
    /// `opcode` with `ctx` after `gap`, at once for none (Human::Off or Zero); `then` once it went.
    pub(super) fn send_after(
        &mut self,
        gap: Duration,
        opcode: i32,
        ctx: Ctx,
        then: Then,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        let payload = match build(opcode, &ctx) {
            Ok(p) => p,
            Err(e) => {
                return out.push(Out::Log(
                    LogKind::Connection,
                    crate::requests::unbuilt(opcode, &e),
                ))
            }
        };
        if gap.is_zero() {
            out.push(Out::Send(opcode, payload));
            return self.then(then, now, out);
        }
        self.deferred.push(Deferred {
            at: now + gap,
            opcode,
            payload,
            then,
        });
    }

    /// When the next held request goes, or the reload stops waiting for its map.
    pub(super) fn human_deadline(&self) -> Option<Instant> {
        let held = self.deferred.iter().map(|d| d.at).min();
        let map = self.reload.as_ref().and_then(|r| r.map_until);
        held.into_iter().chain(map).min()
    }

    /// The held requests whose gap is over, in the order they were held; a reload whose s2c/11 never came goes on.
    pub(super) fn human_timer(&mut self, now: Instant, out: &mut Vec<Out>) {
        while let Some(i) = self.deferred.iter().position(|d| d.at <= now) {
            let d = self.deferred.remove(i);
            out.push(Out::Send(d.opcode, d.payload));
            self.then(d.then, now, out);
        }
        if (self.reload.as_ref()).is_some_and(|r| r.map_until.is_some_and(|t| t <= now)) {
            out.push(Out::Log(
                LogKind::Travel,
                format!(
                    "Server không gửi lại map sau trận trong {} s; đánh tiếp",
                    RELOAD_WAIT.as_secs()
                ),
            ));
            self.reloaded(now, out);
        }
    }

    fn then(&mut self, then: Then, now: Instant, out: &mut Vec<Out>) {
        match then {
            Then::Nothing => {}
            Then::ReloadAsked => {
                if let Some(r) = self.reload.as_mut() {
                    r.map_until = Some(now + RELOAD_WAIT);
                }
            }
            Then::Reloaded => self.reloaded(now, out),
        }
    }

    /// The end of a battle that is not Bạch Hổ's, with BotOptions::human: c2s/11 of the map stood in after
    /// RELOAD_AFTER_BATTLE. Pickups (pick) and the next thing (next) wait for the reload.
    pub(super) fn reload_after_battle(&mut self, now: Instant, out: &mut Vec<Out>) {
        if !self.human.on() || self.bach_ho_on() {
            return;
        }
        self.reload = Some(Reload { map_until: None });
        let map_id = self.snap.map_id.clone();
        let ctx = Ctx {
            map_id: Some(&map_id),
            zone: Some(self.snap.zone),
            map_index: Some(self.maps.map_index(&map_id)),
            ..Ctx::default()
        };
        let gap = self.human.pick(human::RELOAD_AFTER_BATTLE);
        self.send_after(gap, 11, ctx, Then::ReloadAsked, now, out);
    }

    /// s2c/11 of the map: the reload's (true), whose c2s/43 then goes after ENTITIES_AFTER_RELOAD.
    pub(super) fn reload_map_came(&mut self, now: Instant, out: &mut Vec<Out>) -> bool {
        let Some(r) = self.reload.as_mut().filter(|r| r.map_until.is_some()) else {
            return false;
        };
        r.map_until = None;
        let map_id = self.snap.map_id.clone();
        let ctx = Ctx {
            map_id: Some(&map_id),
            ..Ctx::default()
        };
        let gap = self.human.pick(human::ENTITIES_AFTER_RELOAD);
        self.send_after(gap, 43, ctx, Then::Reloaded, now, out);
        true
    }

    /// The reload is over: the drops queued meanwhile go one every PICK_GAP, and the job or quest run goes on after them,
    /// not before the wait it set at the battle's end.
    fn reloaded(&mut self, now: Instant, out: &mut Vec<Out>) {
        if self.reload.take().is_none() {
            return;
        }
        if !self.to_pick.is_empty() && self.pick_at.is_none() {
            self.pick_next(now, out);
        }
        if !(self.job_running() || self.quest_running() || self.trip.is_some()) {
            return;
        }
        let after_picks = now + PICK_GAP * (self.to_pick.len() as u32 + 1);
        match self.timer {
            None => self.timer = Some((after_picks, Wake::Next)),
            Some((at, Wake::Next)) if at < after_picks => {
                self.timer = Some((after_picks, Wake::Next))
            }
            _ => {}
        }
    }

    /// c2s/57, a line of an NPC's dialog, after the time a player reads it (NPC_REPLY); returns that time, which the
    /// wait for the answer adds.
    pub(super) fn reply57(
        &mut self,
        option: u8,
        map_id: &str,
        npc_id: i32,
        now: Instant,
        out: &mut Vec<Out>,
    ) -> Duration {
        let gap = self.human.pick(human::NPC_REPLY);
        let ctx = Ctx {
            option: Some(option as i32),
            map_id: Some(map_id),
            npc_id: Some(npc_id),
            ..Ctx::default()
        };
        self.send_after(gap, 57, ctx, Then::Nothing, now, out);
        gap
    }

    /// The wait in a map before the next portal of a trip or quest run: PORTAL_AFTER_ARRIVAL, 2 s without the human pace.
    pub(super) fn arrival_gap(&mut self) -> Duration {
        match self.human.on() {
            true => self.human.pick(human::PORTAL_AFTER_ARRIVAL),
            false => Duration::from_secs(2),
        }
    }
}

//! Đi lại như người chơi (FightSettings::wander, off unless turned on; walk.rs for the shapes, MV1 of
//! 06-map-mobs.md#toạ-độ-và-di-chuyển): c2s/1169 as the game sends them, which the bot never did before 23/11/2026, so
//! the character stood in the air at the y of s2c/11 for everyone around.
//! - After each map load (s2c/11), the fall to the ground, 0.9–1.3 s after it as the game's (with its c2s/43).
//! - When the mobs of the map come (s2c/43), and at the end of each battle when Nhịp như người chơi is off (no reload
//!   then), most times (7 in 10) a walk of 24–160 units on the platform stood on; the next challenge waits for it to
//!   end (walk_until, as the walk of Nhịp như người chơi). A platform narrower than 3
//!   tiles, or a spot that is no flat ground (a slope), gets no walk.
//! - Nothing goes in a battle, on the way through a portal or into a zone, nor in Bạch Hổ; a challenge drops the moves
//!   not sent yet.
use super::*;
use crate::walk::{self, Grid, Step};

/// After s2c/11, the game's fall began 1.1 s later (MV1); a walk starts this long after the mobs came or the moves
/// before it; the challenge waits this long after the walk's last packet (ms).
const FALL_AFTER: (i32, i32) = (900, 1300);
const WALK_AFTER: (i32, i32) = (300, 1200);
const AFTER_WALK: (i32, i32) = (200, 700);
/// Out of 10 arrivals of the mobs, how many get a walk.
const WALK_ODDS: i32 = 7;

impl Bot {
    fn wander_on(&self) -> bool {
        self.fight.wander && !self.bach_ho_on()
    }

    fn wander_pick(&mut self) -> impl FnMut(i32, i32) -> i32 + '_ {
        |lo, hi| self.jitter.pick(lo, hi)
    }

    /// Where the character will stand once the moves queued are sent.
    fn wander_end(&self) -> (i32, i32) {
        self.moves
            .back()
            .map_or((self.snap.x, self.snap.y), |(_, s)| (s.x, s.y))
    }

    fn wander_queue(&mut self, start: Instant, steps: Vec<Step>) -> Option<Instant> {
        let last = steps.last().map(|s| start + Duration::from_millis(s.at));
        self.moves.extend(
            steps
                .into_iter()
                .map(|s| (start + Duration::from_millis(s.at), s)),
        );
        last
    }

    /// s2c/11 of a map: its grid is kept (none for a map whose grid does not read), the moves of the map before are
    /// dropped, and the fall to the ground is queued.
    pub(super) fn wander_map_loaded(&mut self, grid: Option<crate::world::MapGrid>, now: Instant) {
        self.moves.clear();
        self.grid = grid.map(|g| Grid {
            rows: g.rows,
            cols: g.cols,
            tiles: g.tiles,
        });
        if !self.wander_on() {
            return;
        }
        let Some(g) = self.grid.clone() else {
            return;
        };
        let (x, y, right) = (self.snap.x, self.snap.y, self.facing_right);
        let steps = walk::plan_fall(&g, x, y, right, self.wander_pick());
        let start =
            now + Duration::from_millis(self.jitter.pick(FALL_AFTER.0, FALL_AFTER.1) as u64);
        self.wander_queue(start, steps);
    }

    /// s2c/43, or a battle over without the human pace: a walk on the platform, most times, which the next challenge
    /// waits for.
    pub(super) fn wander_step(&mut self, now: Instant) {
        if !self.wander_on() || self.battle.is_some() || self.jitter.pick(1, 10) > WALK_ODDS {
            return;
        }
        let Some(g) = self.grid.clone() else {
            return;
        };
        let (x, y) = self.wander_end();
        let steps = walk::plan_walk(&g, x, y, self.wander_pick());
        if steps.is_empty() {
            return;
        }
        let after = self.moves.back().map_or(now, |(t, _)| *t).max(now);
        let start =
            after + Duration::from_millis(self.jitter.pick(WALK_AFTER.0, WALK_AFTER.1) as u64);
        if let Some(end) = self.wander_queue(start, steps) {
            let free =
                end + Duration::from_millis(self.jitter.pick(AFTER_WALK.0, AFTER_WALK.1) as u64);
            self.walk_until = Some(self.walk_until.map_or(free, |w| w.max(free)));
        }
    }

    /// The moves not sent yet are dropped: a challenge, a battle, a portal or a zone, Đi lại turned off.
    pub(super) fn wander_stop(&mut self) {
        self.moves.clear();
    }

    pub(super) fn wander_deadline(&self) -> Option<Instant> {
        self.moves.front().map(|(t, _)| *t)
    }

    /// Sends the moves whose time came, and keeps where the character stands.
    pub(super) fn wander_timer(&mut self, now: Instant, out: &mut Vec<Out>) {
        if self.battle.is_some() || self.travelling.is_some() || self.zoning.is_some() {
            return self.wander_stop();
        }
        while self.moves.front().is_some_and(|(t, _)| *t <= now) {
            let (_, s) = self.moves.pop_front().unwrap();
            if s.flags != walk::NONE {
                self.facing_right = s.flags == walk::RIGHT;
            }
            (self.snap.x, self.snap.y) = (s.x, s.y);
            out.push(Out::Send(1169, s.bytes()));
        }
    }
}

//! Đi lại như người chơi (MV1, 23/11/2026, game 1.1.1; 06-map-mobs.md#toạ-độ-và-di-chuyển) ← src/protocol/walk.ts: the
//! character's own moves as c2s/1169, shaped as the phone sent them, on the one platform it stands on.
//! - c2s/1169 = i32 x; i32 y; i32 state; 5 flag bytes (2 left, 3 right), server units (tiles of 32), the feet's y.
//! - Running: a packet every 105–145 ms, ~230 units a second; on arriving, two packets of state 0 at once.
//! - On a map load the game falls from the y of s2c/11 to the ground (state 6, up to ~48 units a packet), then state 0.
//! - Where one stands is in the drawn layer of s2c/11 (layer 1): a tile drawn with nothing drawn above it. Layer 3 is
//!   not collision. Slopes are tiles too and their ids are not told apart yet, so a walk keeps to one row of tiles.
use crate::protocol::Writer;

pub const STAND: i32 = 0;
pub const RUN: i32 = 1;
pub const FALL: i32 = 6;
/// Units a second while running, and the gap between two packets (ms).
pub const SPEED: i32 = 230;
pub const GAP: (i32, i32) = (105, 145);
/// Falling: the speed at the first packet, what it gains a second, its top (units a second).
const FALL_START: f64 = 120.0;
const FALL_GAIN: f64 = 2000.0;
const FALL_MAX: f64 = 400.0;
/// Kept from either end of a platform; the narrowest platform walked on (both in units).
pub const MARGIN: i32 = 12;
pub const MIN_RUN: i32 = 96;
/// A walk goes this far at least and at most (units).
pub const STEP: (i32, i32) = (24, 160);

pub const RIGHT: [u8; 5] = [0, 0, 0, 1, 0];
pub const LEFT: [u8; 5] = [0, 0, 1, 0, 0];
pub const NONE: [u8; 5] = [0; 5];

/// The drawn layer of s2c/11 (world::MapGrid::tiles), `rows` × `cols`, row by row from the top.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Grid {
    pub rows: usize,
    pub cols: usize,
    pub tiles: Vec<u8>,
}
impl Grid {
    fn drawn(&self, r: i64, c: i64) -> bool {
        r >= 0
            && c >= 0
            && (r as usize) < self.rows
            && (c as usize) < self.cols
            && self.tiles[r as usize * self.cols + c as usize] != 0
    }
    /// A tile one can stand on: drawn, with nothing drawn above it.
    pub fn standable(&self, r: i64, c: i64) -> bool {
        self.drawn(r, c) && !self.drawn(r - 1, c)
    }
    /// The row of the ground under (x, y), from the row of y down: the first standable tile of that column.
    pub fn ground_row(&self, x: i32, y: i32) -> Option<i64> {
        let c = x.div_euclid(32) as i64;
        if c < 0 || c as usize >= self.cols {
            return None;
        }
        (y.div_euclid(32).max(0) as i64..self.rows as i64).find(|&r| self.standable(r, c))
    }
    /// The x range one can walk on along row `r` from the column of `x`: the standable tiles side by side, less MARGIN
    /// at either end; None when narrower than MIN_RUN.
    pub fn platform(&self, r: i64, x: i32) -> Option<(i32, i32)> {
        let (mut lo, mut hi) = (x.div_euclid(32) as i64, x.div_euclid(32) as i64);
        if !self.standable(r, lo) {
            return None;
        }
        while self.standable(r, lo - 1) {
            lo -= 1;
        }
        while self.standable(r, hi + 1) {
            hi += 1;
        }
        let (from, to) = (lo as i32 * 32, (hi as i32 + 1) * 32);
        (to - from >= MIN_RUN).then_some((from + MARGIN, to - MARGIN))
    }
}

/// One c2s/1169, `at` ms after the first of its plan.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Step {
    pub at: u64,
    pub x: i32,
    pub y: i32,
    pub state: i32,
    pub flags: [u8; 5],
}
impl Step {
    /// c2s/1169.
    pub fn bytes(&self) -> Vec<u8> {
        let mut w = Writer::new().i32(self.x).i32(self.y).i32(self.state);
        for f in self.flags {
            w = w.u8(f);
        }
        w.build()
    }
}

/// The fall from (x, y) to the ground, as the game after a map load (planFall); none when standing on it already or no
/// ground is under. `pick(lo, hi)` gives a whole number from lo to hi.
pub fn plan_fall(
    g: &Grid,
    x: i32,
    y: i32,
    right: bool,
    mut pick: impl FnMut(i32, i32) -> i32,
) -> Vec<Step> {
    let Some(r) = g.ground_row(x, y) else {
        return vec![];
    };
    let ground = r as i32 * 32;
    if ground <= y {
        return vec![];
    }
    let mut steps = vec![Step {
        at: 0,
        x,
        y,
        state: FALL,
        flags: NONE,
    }];
    let (mut at, mut v, mut now) = (0u64, FALL_START, y);
    while now < ground {
        let gap = pick(GAP.0, GAP.1);
        at += gap as u64;
        v = (v + FALL_GAIN * gap as f64 / 1000.0).min(FALL_MAX);
        now = (now + (v * gap as f64 / 1000.0).round() as i32).min(ground);
        let landed = now >= ground;
        steps.push(Step {
            at,
            x,
            y: now,
            state: if landed { STAND } else { FALL },
            flags: match (landed, right) {
                (false, _) => NONE,
                (true, true) => RIGHT,
                (true, false) => LEFT,
            },
        });
    }
    steps
}

/// A walk on the platform under (x, y) to a spot `pick` chooses (STEP away, inside it), then the two packets of
/// standing (planWalk); none when (x, y) is not on the ground or the platform is too narrow.
pub fn plan_walk(g: &Grid, x: i32, y: i32, mut pick: impl FnMut(i32, i32) -> i32) -> Vec<Step> {
    if y.rem_euclid(32) != 0 {
        return vec![];
    }
    let Some((from, to)) = g.platform((y / 32) as i64, x) else {
        return vec![];
    };
    if x < from || x > to {
        return vec![];
    }
    let room = [to - x, x - from];
    let ways = [room[0] >= STEP.0, room[1] >= STEP.0];
    if !ways[0] && !ways[1] {
        return vec![];
    }
    let right = ways[0] && (!ways[1] || pick(0, 1) == 1);
    let space = if right { room[0] } else { room[1] };
    let far = pick(STEP.0, STEP.1.min(space).max(STEP.0));
    let (target, flags) = match right {
        true => (x + far, RIGHT),
        false => (x - far, LEFT),
    };
    let (mut steps, mut at, mut now) = (vec![], 0u64, x);
    while now != target {
        steps.push(Step {
            at,
            x: now,
            y,
            state: RUN,
            flags,
        });
        let gap = pick(GAP.0, GAP.1);
        at += gap as u64;
        let d = (SPEED as f64 * gap as f64 / 1000.0).round() as i32;
        now = match right {
            true => (now + d).min(target),
            false => (now - d).max(target),
        };
    }
    let stand = Step {
        at,
        x: now,
        y,
        state: STAND,
        flags,
    };
    steps.extend([stand, stand]);
    steps
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The slice of M1 of test/walk.test.ts: the platform 35 36 39 at row 13, columns 17–19, a cliff in column 16 drawn
    /// from row 6 to 13, a floor at row 15.
    fn m1() -> Grid {
        let (rows, cols) = (16, 24);
        let mut tiles = vec![0u8; rows * cols];
        let mut put = |r: usize, c: usize, v: u8| tiles[r * cols + c] = v;
        for (i, v) in [46, 47, 48, 7, 31, 26, 119, 27].into_iter().enumerate() {
            put(6 + i, 16, v);
        }
        put(13, 17, 35);
        put(13, 18, 36);
        put(13, 19, 39);
        for c in 0..cols {
            put(15, c, 7);
        }
        Grid { rows, cols, tiles }
    }

    #[test]
    fn the_ground_and_the_platform_as_mv1_fell_from_593_5_to_416() {
        let g = m1();
        assert_eq!(g.ground_row(593, 5), Some(13));
        assert_eq!(g.platform(13, 600), Some((544 + MARGIN, 640 - MARGIN)));
        assert_eq!(g.ground_row(16 * 32 + 5, 5), Some(6));
    }

    #[test]
    fn the_fall_ends_standing_and_a_walk_stays_on_the_platform() {
        let g = m1();
        let fall = plan_fall(&g, 593, 5, true, |lo, hi| 120.clamp(lo, hi));
        let last = fall.last().unwrap();
        assert_eq!((last.y, last.state, last.flags), (416, STAND, RIGHT));
        assert!(fall
            .windows(2)
            .all(|w| w[1].y > w[0].y && w[1].y - w[0].y <= 48));
        assert!(plan_fall(&g, 593, 416, true, |lo, _| lo).is_empty());
        let mut calls = 0;
        let walk = plan_walk(&g, 560, 416, |lo, hi| {
            calls += 1;
            (if calls == 1 { 60 } else { 120 }).clamp(lo, hi)
        });
        assert_eq!(walk.last().unwrap().x, 620);
        assert!(walk
            .iter()
            .all(|s| (556..=628).contains(&s.x) && s.y == 416));
        assert_eq!(
            walk[walk.len() - 2..]
                .iter()
                .map(|s| s.state)
                .collect::<Vec<_>>(),
            [STAND, STAND]
        );
        assert!(plan_walk(&g, 560, 400, |lo, _| lo).is_empty());
        let hex: String = walk[0].bytes().iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "00000230000001a0000000010000000100");
    }
}

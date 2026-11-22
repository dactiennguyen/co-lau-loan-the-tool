//! Human pace (docs/app/events/02-login.md#nhịp-như-người-chơi), as src/net/human.ts: the gaps the real game 1.1.1 leaves
//! between a packet of the server and its own answer, measured with Frida on 22/11. Every wait the session, the Bot and
//! the v3 battle runner add to look like the game comes from here; Bạch Hổ keeps its own pace (BachHoPace).
use crate::delay::Jitter;
use std::time::Duration;

/// A wait in ms, from the first number to the second.
pub type Range = (u64, u64);

/// c2s/1 every 2 s until s2c/4, then the first ~25 s after s2c/4 and every 30 s in the world, battles included
/// (30.00–30.8 s measured).
pub const HEARTBEAT_LOGIN: Duration = Duration::from_secs(2);
pub const HEARTBEAT_FIRST: Duration = Duration::from_secs(25);
pub const HEARTBEAT_WORLD: Duration = Duration::from_secs(30);
/// s2c/1209 → c2s/5.
pub const NOTICE_AFTER_FLAG: Range = (400, 700);
/// c2s/5 → c2s/2 (counted from c2s/5, whose answer comes in ~30 ms).
pub const GATE_AFTER_NOTICE: Range = (1300, 2500);
/// s2c/30 → c2s/42.
pub const PROFILE_AFTER_SKILLS: Range = (100, 350);
/// s2c/29 → c2s/11 at login.
pub const MAP_AFTER_LOCATION: Range = (300, 400);
/// s2c/11 → c2s/43 on every map entry: login, portal, zone change.
pub const ENTITIES_AFTER_MAP: Range = (400, 1200);
/// s2c/13 → c2s/11 after a portal or a zone change.
pub const MAP_AFTER_PORTAL: Range = (300, 400);
/// From the arrival in a map to the next portal of a trip.
pub const PORTAL_AFTER_ARRIVAL: Range = (2000, 4000);
/// The end of a normal battle (s2c/1214) → c2s/11 that reloads the map.
pub const RELOAD_AFTER_BATTLE: Range = (2400, 4700);
/// s2c/11 of that reload → c2s/43.
pub const ENTITIES_AFTER_RELOAD: Range = (300, 800);
/// s2c/1214 after Đầu hàng → c2s/43 (~0.6 s).
pub const ENTITIES_AFTER_SURRENDER: Range = (500, 700);
/// s2c/22 → c2s/18.
pub const JOIN_AFTER_SETUP: Range = (1100, 1600);
/// The mob's turn (s2c/24) → c2s/14 while the board still falls from our move's cascades.
pub const STEP_AFTER_CASCADE: Range = (1000, 2000);
/// The mob's turn → c2s/14 otherwise, as after a turn ended by the clock.
pub const STEP_AFTER_TIMEOUT: Range = (10, 40);
/// An own move never goes sooner than this after its turn came (Chờ trước mỗi lượt đi when longer).
pub const OWN_MOVE_MIN: Duration = Duration::from_millis(1200);
/// s2c/24 of an own turn → the own move, spread as a player's (game: bh2 median 2.6 s, 1.15 s at the quickest; by hand
/// 4.6–5.9 s); Chờ trước mỗi lượt đi when longer.
pub const OWN_MOVE: Range = (1200, 2600);
/// s2c/18 of a battle the player opens (timed 1: every challenge with c2s/15 flag 1 in 1.1.1) → the first own move:
/// the player looks at the board first (game: 22 s by hand, Bạch Hổ 1.15 s at the quickest).
pub const FIRST_MOVE: Range = (1200, 2600);
/// The mobs of the map known (s2c/43 at login, after a portal, a zone change or the reload after a battle) → c2s/15: the
/// walk to the mob (game: a burst of c2s/1169 right before c2s/15, the next battle 4–26 s after c2s/43).
pub const CHALLENGE_AFTER_ENTITIES: Range = (1500, 4000);
/// A battle of timed 1 shows it is a turn battle with its first s2c/24, ~0.7 s after the first move's s2c/19; until then
/// one that may still be timed (Sơn Tặc, Bạch Hổ: never an s2c/24) waits at least this for its second swap.
pub const TURN_OR_TIMED: Duration = Duration::from_millis(2500);
/// s2c/57 (an NPC's dialog) → c2s/57 (game 4–23 s; shorter so quests do not drag).
pub const NPC_REPLY: Range = (1500, 4000);

/// How the waits are drawn.
#[derive(Debug, Clone, Default)]
pub enum Human {
    /// None of these waits, and no map reload after a battle: the bot as before 22/11. The default, which the tests
    /// build; the session sets Human::new() (net/session.rs).
    #[default]
    Off,
    /// The game's order of packets without the waits (tests).
    Zero,
    /// Each wait spread over its range.
    Random(Jitter),
}

impl Human {
    /// Waits seeded from the clock, as the game's.
    pub fn new() -> Self {
        Human::Random(Jitter::default())
    }
    /// The same waits for the same seed (tests).
    pub fn seeded(seed: u64) -> Self {
        Human::Random(Jitter::new(seed))
    }
    /// The same kind of pace with its own numbers (the v3 battle's, apart from the Bot's).
    pub fn fork(&mut self) -> Self {
        match self {
            Human::Random(j) => Human::Random(j.fork()),
            Human::Zero => Human::Zero,
            Human::Off => Human::Off,
        }
    }
    /// False: no wait and no reload after a battle.
    pub fn on(&self) -> bool {
        !matches!(self, Human::Off)
    }
    /// A wait of `range`; none Off or Zero.
    pub fn pick(&mut self, (lo, hi): Range) -> Duration {
        match self {
            Human::Random(j) => j.between(lo, hi),
            _ => Duration::ZERO,
        }
    }
}

/// When the next c2s/1 goes after the one just sent (or the key exchange): every HEARTBEAT_LOGIN until s2c/4, the
/// first in the world HEARTBEAT_FIRST after s2c/4, then every HEARTBEAT_WORLD (heartbeatDelay of src/net/human.ts).
pub fn heartbeat_delay(in_world: bool, first: bool) -> Duration {
    match (in_world, first) {
        (false, _) => HEARTBEAT_LOGIN,
        (true, true) => HEARTBEAT_FIRST,
        (true, false) => HEARTBEAT_WORLD,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_wait_falls_in_its_range_and_off_or_zero_waits_nothing() {
        let mut h = Human::seeded(9);
        for r in [
            RELOAD_AFTER_BATTLE,
            ENTITIES_AFTER_MAP,
            NPC_REPLY,
            STEP_AFTER_TIMEOUT,
        ] {
            let waits: Vec<u64> = (0..300).map(|_| h.pick(r).as_millis() as u64).collect();
            assert!(waits.iter().all(|w| (r.0..=r.1).contains(w)), "{r:?}");
            let (lo, hi) = (waits.iter().min().unwrap(), waits.iter().max().unwrap());
            assert!(hi - lo > (r.1 - r.0) / 2, "spread over {r:?}");
        }
        assert_eq!(Human::Zero.pick(NPC_REPLY), Duration::ZERO);
        assert_eq!(Human::Off.pick(NPC_REPLY), Duration::ZERO);
        assert!(Human::Zero.on() && !Human::Off.on() && Human::new().on());
    }

    #[test]
    fn the_heartbeat_beats_every_2_s_until_s2c_4_then_25_s_and_every_30_s() {
        assert_eq!(heartbeat_delay(false, true), Duration::from_secs(2));
        assert_eq!(heartbeat_delay(false, false), Duration::from_secs(2));
        assert_eq!(heartbeat_delay(true, true), Duration::from_secs(25));
        assert_eq!(heartbeat_delay(true, false), Duration::from_secs(30));
    }
}

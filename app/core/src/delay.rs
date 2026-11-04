//! Thời gian ngẫu nhiên of Cài đặt đánh (FightSettings::delay_random): a wait that is on lasts from its time to twice it.
//! A small xorshift, so the core needs no random crate; its numbers only spread waits, nothing depends on them.
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone)]
pub struct Jitter(u64);

impl Jitter {
    /// The same numbers for the same seed (tests).
    pub fn new(seed: u64) -> Self {
        // xorshift never leaves 0.
        Self(seed.max(1))
    }

    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    /// `base`, or with `random` a time from `base` to twice it, to the millisecond.
    pub fn wait(&mut self, base: Duration, random: bool) -> Duration {
        if !random || base.is_zero() {
            return base;
        }
        let ms = base.as_millis() as u64;
        base + Duration::from_millis(self.next() % (ms + 1))
    }
}

impl Default for Jitter {
    /// Seeded from the clock: two sessions started together still get different numbers from their own addresses.
    fn default() -> Self {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos() as u64);
        let place = &nanos as *const u64 as u64;
        Self::new(nanos ^ place.rotate_left(32))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_random_wait_lasts_from_its_time_to_twice_it_and_one_not_random_its_time() {
        let mut j = Jitter::new(42);
        let base = Duration::from_secs(1);
        let waits: Vec<Duration> = (0..500).map(|_| j.wait(base, true)).collect();
        assert!(waits.iter().all(|w| (base..=base * 2).contains(w)));
        // Spread over the range, not stuck at one end.
        assert!(waits.iter().any(|w| *w < Duration::from_millis(1300)));
        assert!(waits.iter().any(|w| *w > Duration::from_millis(1700)));
        assert_eq!(j.wait(base, false), base);
        assert_eq!(j.wait(Duration::ZERO, true), Duration::ZERO);
        // The same seed, the same waits.
        let mut a = Jitter::new(7);
        let mut b = Jitter::new(7);
        assert_eq!(a.wait(base, true), b.wait(base, true));
    }
}

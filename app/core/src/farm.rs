//! Gợi ý quái (docs/app/events/07-auto-battle.md#gợi-ý-quái): how much EXP an hour a mob of the zone is worth to a
//! character and how often it would lose, from the character's own recent battles with it, else from the stats of both
//! sides (data/mob-stats.json, fitted on 12.657 battles of 12 accounts, 21/11).
//!
//! The estimate from the stats:
//! - a 3-sword hit is Tấn công × (1 + 1,75% × level gap) × 200 / (200 + P.Thủ of the side hit) (F2), W a third of it;
//! - losses: logistic in ln(mob HP × mob W / (own max HP × own W)), its intercept by element (skills weigh more for Lôi
//!   and Thủy) plus a shift of the mob's own (`lossBias`: its skill and moves); off by 4,2 points on average over 411
//!   (account, level, mob) groups, each account guessed from the others' battles;
//! - seconds of a battle: a base plus a share of the swords the mob's HP takes, by element; off by 10–19%;
//! - EXP of a win: the mob's base less 1,4% for each level the character is above it.
//!
//! It picked the best mob of 7 of 9 accounts that fought two or more at one level, and was off by a median of 11% in
//! EXP an hour.
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::OnceLock;

/// A mob kind as fitted from the battles: level, max HP, Tấn công, P.Thủ and the EXP of a win at its own level.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct MobStat {
    pub level: i32,
    pub hp: f64,
    pub attack: f64,
    pub defence: f64,
    pub exp: f64,
    /// What the stats miss of the mob (its skill, its moves) as a shift of the loss model, fitted with it.
    #[serde(default, rename = "lossBias")]
    pub loss_bias: f64,
}

/// data/mob-stats.json, by mob name.
pub fn mob_stats() -> &'static HashMap<String, MobStat> {
    static BOOK: OnceLock<HashMap<String, MobStat>> = OnceLock::new();
    BOOK.get_or_init(|| {
        serde_json::from_str(include_str!("../../../data/mob-stats.json"))
            .expect("data/mob-stats.json reads")
    })
}

/// What the estimate needs of the character: level, Tấn công and P.Thủ (combat[0], combat[1] of s2c/9), max HP, element.
#[derive(Debug, Clone, Copy)]
pub struct Me {
    pub level: i32,
    pub attack: i32,
    pub defence: i32,
    pub max_hp: i32,
    pub element: Option<i32>,
}

/// Change of a hit for each level the attacker is above the side hit (F2).
const LEVEL_STEP: f64 = 0.0175;
/// The EXP of a win falls by this share for each level the character is above the mob.
const EXP_STEP: f64 = 0.014;
/// Seconds between two battles, as measured in the app (the gap after a result).
pub const GAP_S: f64 = 4.5;
/// Battles of the account with a mob from which its own numbers alone count; fewer mix with the estimate, by their share.
pub const HISTORY_FULL: u32 = 15;
const LOSS_SLOPE: f64 = 1.581;

/// W of a side: a third of its 3-sword hit.
fn sword(attack: f64, from: i32, to: i32, defence: f64) -> f64 {
    (attack * (1.0 + LEVEL_STEP * f64::from(from - to)) * 200.0 / (200.0 + defence.max(0.0)) / 3.0)
        .max(1.0)
}
/// Intercept of the loss model and (base, seconds per sword of the mob's HP) of the battle time, by element.
fn by_element(element: Option<i32>) -> (f64, f64, f64) {
    match element {
        Some(2) => (-1.785, 12.87, 0.744),
        Some(4) => (-1.483, 6.07, 0.528),
        _ => (-0.951, 8.41, 1.187),
    }
}

/// EXP of a win against `mob` for a character of `level`.
pub fn exp_per_win(mob: &MobStat, level: i32) -> f64 {
    mob.exp * (1.0 - EXP_STEP * f64::from(level - mob.level)).max(0.3)
}

/// EXP an hour and the share of battles lost.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Estimate {
    pub exp_per_hour: f64,
    pub loss: f64,
}

/// Mob kinds whose level differs from the table's by more than this are another kind of the same name: no estimate.
const LEVEL_SLACK: i32 = 2;

/// The estimate from the stats of both sides; None for a mob the table lacks (or has at another level) or a character
/// not read yet.
pub fn estimate(me: &Me, name: &str, level: i32) -> Option<Estimate> {
    let mob = mob_stats()
        .get(name)
        .filter(|m| (m.level - level).abs() <= LEVEL_SLACK)?;
    if me.level <= 0 || me.attack <= 0 || me.max_hp <= 0 {
        return None;
    }
    let mine = sword(f64::from(me.attack), me.level, mob.level, mob.defence);
    let theirs = sword(mob.attack, mob.level, me.level, f64::from(me.defence));
    let (a, base, per_sword) = by_element(me.element);
    let x = (mob.hp * theirs / (f64::from(me.max_hp) * mine)).ln();
    let loss = 1.0 / (1.0 + (-(a + mob.loss_bias + LOSS_SLOPE * x)).exp());
    let seconds = base + per_sword * mob.hp / mine + GAP_S;
    Some(Estimate {
        exp_per_hour: (1.0 - loss) * exp_per_win(mob, me.level) * 3600.0 / seconds,
        loss,
    })
}

/// The account's own battles with one mob (cllt.db, the last days, at about its level): how many, lost, EXP, seconds.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Tally {
    pub battles: u32,
    pub losses: u32,
    pub exp: i64,
    pub seconds: f64,
}
impl Tally {
    pub fn add(&mut self, won: bool, exp: i32, seconds: f64) {
        self.battles += 1;
        self.losses += u32::from(!won);
        self.exp += i64::from(exp);
        self.seconds += seconds;
    }
    fn estimate(&self) -> Option<Estimate> {
        (self.battles > 0).then(|| Estimate {
            exp_per_hour: self.exp as f64 * 3600.0
                / (self.seconds + f64::from(self.battles) * GAP_S).max(1.0),
            loss: f64::from(self.losses) / f64::from(self.battles),
        })
    }
}

/// Where the numbers of a hint come from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FarmSource {
    /// Own battles alone (HISTORY_FULL or more).
    Battles,
    /// Own battles mixed with the estimate.
    Mixed,
    /// The stats alone.
    Stats,
}

/// What the list of mobs shows of one: EXP an hour, losses in %, the own battles counted, and whether it is the one to
/// farm (`best`, set by mark_best).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FarmHint {
    pub exp_per_hour: u32,
    pub loss: u8,
    pub battles: u32,
    pub source: FarmSource,
    pub best: bool,
}

/// The hint of a mob: its own battles weigh by their number up to HISTORY_FULL, the estimate the rest. None with neither.
pub fn hint(est: Option<Estimate>, tally: &Tally) -> Option<FarmHint> {
    let own = tally.estimate();
    let w = (f64::from(tally.battles) / f64::from(HISTORY_FULL)).min(1.0);
    let (e, source) = match (own, est) {
        (Some(o), _) if w >= 1.0 => (o, FarmSource::Battles),
        (Some(o), Some(s)) => (
            Estimate {
                exp_per_hour: w * o.exp_per_hour + (1.0 - w) * s.exp_per_hour,
                loss: w * o.loss + (1.0 - w) * s.loss,
            },
            FarmSource::Mixed,
        ),
        // A few battles and no estimate: not enough to say.
        (Some(o), None) if tally.battles >= 5 => (o, FarmSource::Battles),
        (_, Some(s)) => (s, FarmSource::Stats),
        _ => return None,
    };
    Some(FarmHint {
        exp_per_hour: e.exp_per_hour.max(0.0).round() as u32,
        loss: (100.0 * e.loss).round().clamp(0.0, 100.0) as u8,
        battles: tally.battles,
        source,
        best: false,
    })
}

/// Losses at or above this share (%) mark a mob as hard, and keep it from being the one to farm.
pub const HARD_LOSS: u8 = 30;

/// Marks the hint with the most EXP an hour among those losing under HARD_LOSS as the one to farm.
pub fn mark_best(hints: &mut [Option<FarmHint>]) {
    let best = hints
        .iter()
        .enumerate()
        .filter_map(|(i, h)| {
            h.filter(|h| h.loss < HARD_LOSS && h.exp_per_hour > 0)
                .map(|h| (i, h.exp_per_hour))
        })
        .max_by_key(|&(_, e)| e)
        .map(|(i, _)| i);
    if let Some(h) = best.and_then(|i| hints[i].as_mut()) {
        h.best = true;
    }
}

/// A battle of the account as the hints count it: the character's level, the mob, won, EXP, seconds it lasted.
#[derive(Debug, Clone, PartialEq)]
pub struct FarmBattle {
    pub level: i32,
    pub mob: String,
    pub won: bool,
    pub exp: i32,
    pub seconds: f64,
}

/// Days of battles read from cllt.db at start; the battles of the session are added as they end.
pub const BOOK_DAYS: u64 = 14;
/// Battles kept per account, the oldest dropped first.
pub const BOOK_MAX: usize = 5000;
/// Battles fought at most this many levels below the current one still count.
pub const LEVELS_BACK: i32 = 3;

/// The recent battles of one account against mobs (bosses left out), oldest first.
#[derive(Debug, Clone, Default)]
pub struct FarmBook {
    battles: VecDeque<FarmBattle>,
}
impl FarmBook {
    pub fn push(&mut self, b: FarmBattle) {
        if self.battles.len() >= BOOK_MAX {
            self.battles.pop_front();
        }
        self.battles.push_back(b);
    }
    pub fn len(&self) -> usize {
        self.battles.len()
    }
    pub fn is_empty(&self) -> bool {
        self.battles.is_empty()
    }
    /// The battles with `mob` from LEVELS_BACK below `level` up.
    pub fn tally(&self, mob: &str, level: i32) -> Tally {
        let mut t = Tally::default();
        for b in self
            .battles
            .iter()
            .filter(|b| b.mob == mob && b.level >= level - LEVELS_BACK)
        {
            t.add(b.won, b.exp, b.seconds);
        }
        t
    }
}

/// A mob of the list: name, whether it is a boss, whether it gives no EXP (too far below).
pub struct Candidate<'a> {
    pub name: &'a str,
    pub level: i32,
    pub boss: bool,
    pub no_exp: bool,
}

/// The hints of the list of mobs for a character of `level`, the one to farm marked; none for a boss or a mob that
/// gives no EXP. Without `me` (stats not read yet) only the own battles count.
pub fn hints(
    me: Option<&Me>,
    level: i32,
    book: &FarmBook,
    list: &[Candidate],
) -> Vec<Option<FarmHint>> {
    let mut out: Vec<Option<FarmHint>> = list
        .iter()
        .map(|c| match c.boss || c.no_exp {
            true => None,
            false => hint(
                me.and_then(|m| estimate(m, c.name, c.level)),
                &book.tally(c.name, level),
            ),
        })
        .collect();
    mark_best(&mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn me(level: i32, attack: i32, defence: i32, max_hp: i32, element: i32) -> Me {
        Me {
            level,
            attack,
            defence,
            max_hp,
            element: Some(element),
        }
    }

    #[test]
    fn table_reads() {
        let b = mob_stats();
        assert!(b.len() >= 20);
        assert_eq!(b["Cá Sấu"].level, 31);
    }

    /// A Lôi character of level 35 (Tấn công 138, P.Thủ 83, 234 HP): Cá Sấu loses far more than Chim Điên, which is the
    /// one to farm (as 287 battles of such a character said: 35% against 1–9%).
    #[test]
    fn hard_mob_and_best() {
        let m = me(35, 138, 83, 234, 2);
        let ca = estimate(&m, "Cá Sấu", 31).unwrap();
        let chim = estimate(&m, "Chim Điên", 25).unwrap();
        assert!(ca.loss > 0.25 && chim.loss < 0.15, "{ca:?} {chim:?}");
        let mut hints = vec![
            hint(Some(ca), &Tally::default()),
            hint(Some(chim), &Tally::default()),
            None,
        ];
        mark_best(&mut hints);
        assert!(hints[1].unwrap().best && !hints[0].unwrap().best);
    }

    #[test]
    fn own_battles_take_over() {
        let est = Estimate {
            exp_per_hour: 10_000.0,
            loss: 0.5,
        };
        let mut t = Tally::default();
        for _ in 0..HISTORY_FULL {
            t.add(true, 100, 15.5);
        }
        let h = hint(Some(est), &t).unwrap();
        assert_eq!(
            (h.source, h.loss, h.exp_per_hour),
            (FarmSource::Battles, 0, 18_000)
        );
        let mut few = Tally::default();
        few.add(false, 0, 20.0);
        let h = hint(Some(est), &few).unwrap();
        assert_eq!(h.source, FarmSource::Mixed);
        assert!(h.loss > 50);
        assert_eq!(hint(None, &few), None);
        assert_eq!(hint(None, &Tally::default()), None);
    }

    #[test]
    fn unknown_mob_or_character() {
        assert_eq!(estimate(&me(30, 100, 20, 300, 1), "Không Có", 30), None);
        // Same name, another level: another kind.
        assert_eq!(estimate(&me(40, 150, 30, 400, 1), "Cá Sấu", 45), None);
        assert_eq!(estimate(&me(0, 0, 0, 0, 1), "Cá Sấu", 31), None);
    }

    #[test]
    fn book_counts_recent_levels_and_skips_bosses() {
        let mut book = FarmBook::default();
        let b = |level: i32, mob: &str, won: bool| FarmBattle {
            level,
            mob: mob.into(),
            won,
            exp: if won { 300 } else { 0 },
            seconds: 20.0,
        };
        for _ in 0..20 {
            book.push(b(35, "Cá Sấu", false));
            book.push(b(35, "Chim Điên", true));
        }
        book.push(b(20, "Chim Điên", false)); // too far below: not counted
        assert_eq!(book.tally("Chim Điên", 35).losses, 0);
        let m = me(35, 138, 83, 234, 2);
        let c = |name, level, boss, no_exp| Candidate {
            name,
            level,
            boss,
            no_exp,
        };
        let list = [
            c("Tướng", 35, true, false),
            c("Cá Sấu", 31, false, false),
            c("Chim Điên", 25, false, false),
            c("Heo Mọi", 7, false, true),
        ];
        let h = hints(Some(&m), 35, &book, &list);
        assert_eq!(h[0], None);
        assert_eq!(h[3], None);
        let (ca, chim) = (h[1].unwrap(), h[2].unwrap());
        assert_eq!(
            (ca.loss, ca.source, ca.best),
            (100, FarmSource::Battles, false)
        );
        assert!(chim.best && chim.loss == 0);
        // Stats not read yet: own battles still say something, at the character's level (the level-20 loss left out).
        let own = hints(None, 35, &book, &list);
        assert!(own[2].unwrap().best && own[2].unwrap().loss == 0);
    }

    /// A hard mob, even the richest, is never the one to farm.
    #[test]
    fn hard_is_not_best() {
        let h = |e: u32, loss: u8| {
            Some(FarmHint {
                exp_per_hour: e,
                loss,
                battles: 0,
                source: FarmSource::Stats,
                best: false,
            })
        };
        let mut hints = vec![h(90_000, 40), h(50_000, 5)];
        mark_best(&mut hints);
        assert!(!hints[0].unwrap().best && hints[1].unwrap().best);
    }
}

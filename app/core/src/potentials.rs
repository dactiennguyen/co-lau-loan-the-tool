//! Potential points (docs/app/events/12-skills-items.md#điểm-tiềm-năng): POTENTIALS, MAIN_STAT, statPlan and nextStat of
//! the TS side (src/world.ts, src/quest.ts). A point goes out as c2s/10 (stat, 1), as the game's "Cộng +1" sends it (P1).
use serde::{Deserialize, Serialize};

/// The four potential stats by c2s/10 index (the + buttons of the character panel row by row): name, and the slot of
/// their value in `stats` of s2c/9 and s2c/10 kind 2, which list Thân Pháp before Nội Lực. Measured: Cường Lực 0 (L1),
/// Thân Pháp 2 into slot 1 (P1); Nội Lực 1 follows from the panel order, Thể Lực grows by one a level in slot 3.
pub const POTENTIALS: [(&str, usize); 4] = [
    ("Cường lực", 0),
    ("Nội lực", 2),
    ("Thân pháp", 1),
    ("Thể lực", 3),
];

/// The stat that raises attack for an element (field01 of s2c/9), by c2s/10 index, from the in-game handbook: Hỏa
/// Cường Lực, Thủy Nội Lực. Lôi (Thân Pháp) has no known field01.
pub fn main_stat(element: i32) -> Option<usize> {
    match element {
        1 => Some(0),
        4 => Some(1),
        _ => None,
    }
}

/// How the bot spends potential points on its own (`--stats` of quest-run): the main stat of the element, or weights by
/// c2s/10 index. In accounts.json as "auto" or {"weights": [3, 0, 1, 0]}.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StatPlan {
    Auto,
    Weights([u32; 4]),
}
impl StatPlan {
    /// The weights by c2s/10 index; None for Auto with an element of no known main stat, or weights all 0.
    pub fn weights(self, element: Option<i32>) -> Option<[u32; 4]> {
        let w = match self {
            Self::Auto => {
                let main = main_stat(element?)?;
                std::array::from_fn(|i| u32::from(i == main))
            }
            Self::Weights(w) => w,
        };
        w.iter().any(|&x| x > 0).then_some(w)
    }
}

/// The stat furthest behind its weight among the points `given` so far; on a tie the lower c2s/10 index.
pub fn next_stat(weights: &[u32; 4], given: &[u32; 4]) -> usize {
    let behind = |i: usize| (given[i] + 1) as f64 / weights[i] as f64;
    (0..4)
        .filter(|&i| weights[i] > 0)
        .reduce(|best, i| if behind(i) < behind(best) { i } else { best })
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_raises_the_main_stat_and_weights_take_turns() {
        assert_eq!(StatPlan::Auto.weights(Some(4)), Some([0, 1, 0, 0]));
        assert_eq!(StatPlan::Auto.weights(Some(2)), None);
        assert_eq!(StatPlan::Weights([0; 4]).weights(Some(1)), None);
        let w = [1, 0, 1, 0];
        let mut given = [0; 4];
        let order: Vec<usize> = (0..4)
            .map(|_| {
                let s = next_stat(&w, &given);
                given[s] += 1;
                s
            })
            .collect();
        assert_eq!(order, [0, 2, 0, 2]);
        assert_eq!(next_stat(&[3, 0, 1, 0], &[2, 0, 0, 0]), 0);
        assert_eq!(next_stat(&[3, 0, 1, 0], &[3, 0, 0, 0]), 2);
    }

    #[test]
    fn a_plan_reads_as_accounts_json_writes_it() {
        assert_eq!(serde_json::to_string(&StatPlan::Auto).unwrap(), "\"auto\"");
        let w: StatPlan = serde_json::from_str("{\"weights\":[3,0,1,0]}").unwrap();
        assert_eq!(w, StatPlan::Weights([3, 0, 1, 0]));
    }
}

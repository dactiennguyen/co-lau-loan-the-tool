//! Skills (docs/app/events/12-skills-items.md#bảng-kỹ-năng, #tab-kỹ-năng): the tree of s2c/30 (skillTable of
//! src/world.ts), the skill list of the s2c/9 tail (characterSkills of src/protocol.ts), and the Kỹ năng tab as the game
//! draws it (src/skills.ts): the 9 boxes on the tree background, what Nâng cấp needs, the detail panel text.
use crate::protocol::{character_profile_end, Reader, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// One level of a skill: the skill points it costs, the character level it needs, the nội lực it uses (25 = 1 thành).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillLevel {
    pub level: i32,
    pub description: String,
    pub cost: i32,
    pub required_level: i32,
    pub mana: i32,
}

/// One skill of the tree: `prerequisite` the skill to learn first, -1 for none. data/skills.json holds the three trees in
/// this shape (`npm run skills -- --trees`). Eq lets the snapshot compare its shared tree by pointer first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillDef {
    pub id: i32,
    pub name: String,
    pub prerequisite: i32,
    pub levels: Vec<SkillLevel>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SkillTable {
    pub skills: Vec<SkillDef>,
}
/// s2c/30 answering c2s/30 (u8 element) at login: the 9 skills of that element, every level with what it needs.
pub fn skill_table(p: &[u8]) -> Result<SkillTable> {
    let mut r = Reader::new(p);
    let mut skills = vec![];
    for _ in 0..r.i32()?.max(0) {
        let (id, name, prerequisite) = (r.i32()?, r.string()?, r.i32()?);
        let levels = (0..r.i32()?.max(0))
            .map(|_| {
                Ok(SkillLevel {
                    level: r.i32()?,
                    description: r.string()?,
                    cost: r.i32()?,
                    required_level: r.i32()?,
                    mana: r.i32()?,
                })
            })
            .collect::<Result<_>>()?;
        skills.push(SkillDef {
            id,
            name,
            prerequisite,
            levels,
        });
    }
    r.finish(SkillTable { skills }, "s2c/30")
}

/// A skill of the s2c/9 tail: its level (0 = not learned) and the nội lực it uses; `flag` is not understood (0xff seen).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CharacterSkill {
    pub id: i32,
    pub level: i32,
    pub mana: i32,
    pub flag: u8,
}
pub(crate) fn skill_list(r: &mut Reader) -> Result<Vec<CharacterSkill>> {
    (0..r.i32()?.max(0))
        .map(|_| {
            Ok(CharacterSkill {
                id: r.i32()?,
                level: r.i32()?,
                mana: r.i32()?,
                flag: r.u8()?,
            })
        })
        .collect()
}
/// The skill list right after x, y in the s2c/9 tail: every skill of the character's tree, ids 1000 × element + 0…8.
pub fn character_skills(p: &[u8]) -> Result<Vec<CharacterSkill>> {
    let mut r = Reader::new(p);
    r.take(character_profile_end(p)?)?;
    skill_list(&mut r)
}

/// A box of the tree background `assets/x1/skill/tree-skill` (288 × 347, boxes of 60 × 60): its top left corner, the
/// branch and how far down it is. Box i holds skill 1000 × element + i.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct SkillBox {
    pub x: i32,
    pub y: i32,
    pub branch: &'static str,
    pub depth: u8,
}
pub const TREE_WIDTH: i32 = 288;
pub const TREE_HEIGHT: i32 = 347;
pub const BOX_SIZE: i32 = 60;
/// The root on top, 3 → 4 → 5 down the left, 1 → 2 down the middle (lower, between the rows of the sides), 6 → 7 → 8
/// down the right (screenshot of E1).
pub const BOXES: [SkillBox; 9] = [
    place(114, 0, "gốc", 0),
    place(114, 155, "giữa", 1),
    place(114, 243, "giữa", 2),
    place(0, 111, "trái", 1),
    place(0, 199, "trái", 2),
    place(0, 287, "trái", 3),
    place(227, 111, "phải", 1),
    place(227, 199, "phải", 2),
    place(227, 287, "phải", 3),
];
const fn place(x: i32, y: i32, branch: &'static str, depth: u8) -> SkillBox {
    SkillBox {
        x,
        y,
        branch,
        depth,
    }
}
/// Nội lực of one "thành": the panel shows a skill that uses 25 as "1 thành nội lực".
pub const THANH: i32 = 25;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Prerequisite {
    pub id: i32,
    pub name: String,
    pub learned: bool,
}

/// One skill of the tab: its box, the level the character has, and why Nâng cấp cannot take the next level now (empty
/// when it can).
#[derive(Debug, Clone, PartialEq)]
pub struct SkillNode<'a> {
    pub skill: &'a SkillDef,
    pub index: i32,
    /// None for an index the background has no box for.
    pub place: Option<SkillBox>,
    pub level: i32,
    pub prerequisite: Option<Prerequisite>,
    /// The level the character has, and the one Nâng cấp would give (None at the top level).
    pub current: Option<&'a SkillLevel>,
    pub next: Option<&'a SkillLevel>,
    pub blockers: Vec<String>,
}

/// One node per skill of the tree, in the order of s2c/30 (the root first). `levels` by skill id (s2c/9 tail, then s2c/10
/// kind 32); `level` and `points` the character's level and skill points.
pub fn skill_tree<'a>(
    skills: &'a [SkillDef],
    levels: &BTreeMap<i32, i32>,
    level: i32,
    points: i32,
) -> Vec<SkillNode<'a>> {
    let have = |id: i32| levels.get(&id).copied().unwrap_or(0);
    skills
        .iter()
        .map(|skill| {
            let (index, lv) = (skill.id % 1000, have(skill.id));
            let next = skill.levels.get(lv.max(0) as usize);
            let prerequisite = (skill.prerequisite >= 0).then(|| Prerequisite {
                id: skill.prerequisite,
                name: skills
                    .iter()
                    .find(|k| k.id == skill.prerequisite)
                    .map_or_else(|| format!("#{}", skill.prerequisite), |k| k.name.clone()),
                learned: have(skill.prerequisite) > 0,
            });
            let blockers = match next {
                None => vec!["đã tối đa".to_string()],
                Some(n) => {
                    let mut b = vec![];
                    if n.required_level > level {
                        b.push(format!("cần cấp {}", n.required_level));
                    }
                    if let Some(p) = prerequisite.as_ref().filter(|p| !p.learned) {
                        b.push(format!("phải học {}", p.name));
                    }
                    if n.cost > points {
                        b.push(format!("thiếu điểm kỹ năng (cần {}, còn {points})", n.cost));
                    }
                    b
                }
            };
            SkillNode {
                skill,
                index,
                place: BOXES.get(index.max(0) as usize).copied(),
                level: lv,
                prerequisite,
                current: (lv > 0)
                    .then(|| skill.levels.get(lv as usize - 1))
                    .flatten(),
                next,
                blockers,
            }
        })
        .collect()
}

impl SkillNode<'_> {
    pub fn max_level(&self) -> usize {
        self.skill.levels.len()
    }

    /// "1003 Liệt Hỏa Chi Kiếm 0/20 (trái 1): học được, 2 điểm" or "… (trái 2): cần cấp 32, phải học Liệt Hỏa Chi Kiếm",
    /// as skillLine of src/skills.ts (npm run skills).
    pub fn line(&self) -> String {
        let place = match self.place {
            Some(b) if b.depth > 0 => format!("{} {}", b.branch, b.depth),
            Some(b) => b.branch.to_string(),
            None => format!("ô {}", self.index),
        };
        let state = match (&self.blockers[..], self.next) {
            ([], Some(n)) => format!(
                "{} được, {} điểm",
                if self.level > 0 {
                    format!("lên cấp {}", self.level + 1)
                } else {
                    "học".into()
                },
                n.cost
            ),
            (b, _) => b.join(", "),
        };
        format!(
            "{} {} {}/{} ({place}): {state}",
            self.skill.id,
            self.skill.name,
            self.level,
            self.max_level()
        )
    }

    /// The detail panel on the right of the tab, line by line as the game writes it.
    pub fn panel(&self) -> Vec<String> {
        // As the TS division: 2 for 50, 1.2 for 30.
        let mana = |l: &SkillLevel| {
            format!(
                "- Tiêu hao nội lực: {} thành nội lực",
                l.mana as f64 / THANH as f64
            )
        };
        let mut lines = vec![
            self.skill.name.clone(),
            format!("Cấp tối đa: {}", self.max_level()),
        ];
        if let Some(c) = self.current {
            lines.extend([
                format!("Cấp hiện tại: {}", c.level),
                c.description.clone(),
                mana(c),
            ]);
        }
        let Some(n) = self.next else {
            return lines;
        };
        lines.push(match self.current {
            Some(_) => format!("Cấp kế tiếp: {}", n.level),
            None => "Chưa học".into(),
        });
        lines.extend([
            n.description.clone(),
            mana(n),
            "Điều kiện để học".into(),
            format!("+ Nhân vật đạt cấp: {}", n.required_level),
        ]);
        if let Some(p) = &self.prerequisite {
            lines.push(format!("+ Phải học: {}", p.name));
        }
        lines.push(format!("+ Tiêu hao: {} điểm kỹ năng", n.cost));
        lines
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree() -> Vec<SkillDef> {
        let level = |l: i32, cost: i32, first: i32| SkillLevel {
            level: l,
            description: format!("cấp {l}"),
            cost,
            required_level: first + 5 * (l - 1),
            mana: 25 * cost,
        };
        vec![
            SkillDef {
                id: 1000,
                name: "Hỏa Cầu Thuật".into(),
                prerequisite: -1,
                levels: (1..=2).map(|l| level(l, 1, 2)).collect(),
            },
            SkillDef {
                id: 1003,
                name: "Liệt Hỏa Chi Kiếm".into(),
                prerequisite: 1000,
                levels: (1..=2).map(|l| level(l, 2, 10)).collect(),
            },
        ]
    }

    #[test]
    fn the_tree_says_what_nang_cap_needs_and_writes_the_panel_as_the_game() {
        let skills = tree();
        let nodes = skill_tree(&skills, &BTreeMap::new(), 5, 1);
        assert_eq!(nodes[0].blockers, Vec::<String>::new());
        assert_eq!(
            nodes[1].blockers,
            [
                "cần cấp 10",
                "phải học Hỏa Cầu Thuật",
                "thiếu điểm kỹ năng (cần 2, còn 1)"
            ]
        );
        assert_eq!(
            (nodes[1].index, nodes[1].place.unwrap().branch),
            (3, "trái")
        );
        assert_eq!(
            nodes[0].line(),
            "1000 Hỏa Cầu Thuật 0/2 (gốc): học được, 1 điểm"
        );
        assert_eq!(
            nodes[1].line(),
            "1003 Liệt Hỏa Chi Kiếm 0/2 (trái 1): cần cấp 10, phải học Hỏa Cầu Thuật, thiếu điểm kỹ năng (cần 2, còn 1)"
        );
        assert_eq!(
            nodes[1].panel(),
            [
                "Liệt Hỏa Chi Kiếm",
                "Cấp tối đa: 2",
                "Chưa học",
                "cấp 1",
                "- Tiêu hao nội lực: 2 thành nội lực",
                "Điều kiện để học",
                "+ Nhân vật đạt cấp: 10",
                "+ Phải học: Hỏa Cầu Thuật",
                "+ Tiêu hao: 2 điểm kỹ năng"
            ]
        );
        let top = skill_tree(&skills, &BTreeMap::from([(1000, 2)]), 21, 9);
        assert_eq!(top[0].blockers, ["đã tối đa"]);
        assert_eq!(
            top[0].panel(),
            [
                "Hỏa Cầu Thuật",
                "Cấp tối đa: 2",
                "Cấp hiện tại: 2",
                "cấp 2",
                "- Tiêu hao nội lực: 1 thành nội lực"
            ]
        );
        assert_eq!(top[1].blockers, Vec::<String>::new());
    }
}

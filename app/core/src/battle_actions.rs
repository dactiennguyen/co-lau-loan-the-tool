//! Port of src/battle-actions.ts (docs/app/events/07-auto-battle.md#chọn-hành-động, v3): every own action of a turn on
//! one scale, in HP. The swaps of best_move, each learnt skill the nội lực pays for, and each potion of the bag. A skill's
//! effect is read from its description in s2c/30 (12-skills-items.md#bảng-kỹ-năng); its value comes from the damage
//! formula and the measurements of A1:
//! - damage skill: W × (3 + swords it clears) × 2 at full power + K, K lost one cast in seven;
//! - a piece a skill destroys counts three times, the pieces falling into runs after it once;
//! - Hàn Lưu Thánh Thủy heals ⌊pct × max HP⌋; Hoàn Linh Dược ⌊25% max HP⌋; Kim Đan Dược +25 nội lực;
//! - a skill or a potion ends the turn like a swap, unless a run ≥4 falls after it or the skill says it keeps the turn.
//!
//! tests/parity.rs checks best_action against what bestAction of the TS side picks and scores (`npm run export:rust`).
//! Floating point follows the TS side step by step, and destroy patterns come from the same seeded generator, so the
//! picks are the same.
use crate::battle::{
    answer_value, best_move, best_next, move_value, settle, Board, Fighter, Move, Outcome,
    Strategy, N,
};
use crate::skills::SkillDef;
use serde::Serialize;
use std::collections::BTreeMap;

/// What a description says the skill is: the kind decides how it is valued; Unknown is never cast.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EffectKind {
    Damage,
    Heal,
    Buff,
    Sap,
    Fire,
    Unknown,
}

/// The stat a buff raises.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stat {
    Attack,
    Defense,
    Dodge,
}

/// "phá hủy (từ min đến) max vùng HxW".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Areas {
    pub min: u32,
    pub max: u32,
    pub h: u32,
    pub w: u32,
}
/// From `min` to `max` pieces.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Span {
    pub min: u32,
    pub max: u32,
}
/// "có P% cơ hội hấp thu N sinh lực".
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Drain {
    pub chance: f64,
    pub hp: u32,
}
/// "có P% cơ hội làm đối phương bị giảm N lực phòng thủ trong T lượt".
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Weaken {
    pub chance: f64,
    pub amount: u32,
    pub turns: u32,
}
/// "Tăng N lực tấn công / lực phòng thủ / né tránh … trong T lượt".
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Buff {
    pub stat: Stat,
    pub amount: u32,
    pub turns: u32,
}

/// One level of a skill as its description in s2c/30 states it (SkillEffect of battle-actions.ts). The 14 kinds of
/// description of the three trees are all read.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEffect {
    pub id: i32,
    pub level: i32,
    /// The nội lực it uses.
    pub cost: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub kind: EffectKind,
    /// "gây N sát thương": K of the damage formula.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub areas: Option<Areas>,
    /// "phá hủy ngẫu nhiên từ a đến b quân cờ".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub random: Option<Span>,
    /// "phá hủy N hàng ngang / dọc".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rows: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cols: Option<u32>,
    /// "Phục hồi N% sinh lực": the share of max HP healed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heal: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drain: Option<Drain>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weaken: Option<Weaken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buff: Option<Buff>,
    /// "Triệt tiêu N% năng lượng của kẻ thù": the share of the mob's nội lực taken.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sap: Option<f64>,
    /// "Biến từ a đến b quân cờ thành kiếm lửa".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fire: Option<Span>,
    /// Chance the skill keeps the turn: 1 for "Được đi tiếp", P for "có P% cơ hội đi tiếp".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keep_turn: Option<f64>,
}

/// A piece of a description pattern: text, or a number (`(\d+)` of the TS regex).
#[derive(Clone, Copy)]
enum Tok {
    T(&'static str),
    D,
}
use Tok::{D, T};

/// The numbers of `pat` matched at byte `at` of `d`, and where the match ends. Every text after a number starts with
/// something else than a digit, so taking all the digits is what the regex does.
fn match_at(d: &str, mut at: usize, pat: &[Tok]) -> Option<(Vec<u32>, usize)> {
    let mut nums = vec![];
    for t in pat {
        match t {
            T(s) => {
                if !d[at..].starts_with(s) {
                    return None;
                }
                at += s.len();
            }
            D => {
                let n = d[at..].bytes().take_while(u8::is_ascii_digit).count();
                nums.push(d[at..at + n].parse().ok()?);
                at += n;
            }
        }
    }
    Some((nums, at))
}
/// The leftmost match of `pat` in `d`, as String.match of a regex without flags.
fn search(d: &str, pat: &[Tok]) -> Option<Vec<u32>> {
    d.char_indices()
        .find_map(|(i, _)| match_at(d, i, pat))
        .map(|m| m.0)
}
/// `Tăng (\d+) <stat>.* (\d+) lượt`: the leftmost "Tăng N <stat>", then the last " T lượt" after it (the greedy `.*`).
fn search_buff(d: &str, stat: &'static str) -> Option<(u32, u32)> {
    d.char_indices().find_map(|(i, _)| {
        let (n, end) = match_at(d, i, &[T("Tăng "), D, T(stat)])?;
        let turns = d[end..]
            .char_indices()
            .rev()
            .find_map(|(j, _)| match_at(d, end + j, &[T(" "), D, T(" lượt")]))?;
        Some((n[0], turns.0[0]))
    })
}

/// skillEffect of battle-actions.ts: what one level of a skill does, from its description.
pub fn skill_effect(
    id: i32,
    level: i32,
    description: &str,
    cost: i32,
    name: Option<&str>,
) -> SkillEffect {
    let d = description;
    let mut e = SkillEffect {
        id,
        level,
        cost,
        name: name.map(String::from),
        kind: EffectKind::Unknown,
        damage: None,
        areas: None,
        random: None,
        rows: None,
        cols: None,
        heal: None,
        drain: None,
        weaken: None,
        buff: None,
        sap: None,
        fire: None,
        keep_turn: None,
    };
    let pct = |x: u32| x as f64 / 100.0;
    if let Some(x) = search(d, &[T("gây "), D, T(" sát thương")]) {
        (e.damage, e.kind) = (Some(x[0]), EffectKind::Damage);
    }
    let from_to = [
        T("phá hủy từ "),
        D,
        T(" đến "),
        D,
        T(" vùng "),
        D,
        T("x"),
        D,
    ];
    if let Some(x) = search(d, &from_to) {
        e.areas = Some(Areas {
            min: x[0],
            max: x[1],
            h: x[2],
            w: x[3],
        });
    } else if let Some(x) = search(d, &[T("phá hủy "), D, T(" vùng "), D, T("x"), D]) {
        e.areas = Some(Areas {
            min: x[0],
            max: x[0],
            h: x[1],
            w: x[2],
        });
    }
    let random = [T("phá hủy ngẫu nhiên từ "), D, T(" đến "), D, T(" quân")];
    if let Some(x) = search(d, &random) {
        e.random = Some(Span {
            min: x[0],
            max: x[1],
        });
    }
    if let Some(x) = search(d, &[T("phá hủy "), D, T(" hàng ngang")]) {
        e.rows = Some(x[0]);
    }
    if let Some(x) = search(d, &[T("phá hủy "), D, T(" hàng dọc")]) {
        e.cols = Some(x[0]);
    }
    if let Some(x) = search(d, &[D, T("% cơ hội hấp thu "), D, T(" sinh lực")]) {
        e.drain = Some(Drain {
            chance: pct(x[0]),
            hp: x[1],
        });
    }
    let weaken = [
        D,
        T("% cơ hội làm đối phương bị giảm "),
        D,
        T(" lực phòng thủ trong "),
        D,
        T(" lượt"),
    ];
    if let Some(x) = search(d, &weaken) {
        e.weaken = Some(Weaken {
            chance: pct(x[0]),
            amount: x[1],
            turns: x[2],
        });
    }
    if let Some(x) = search(d, &[T("Phục hồi "), D, T("% sinh lực")]) {
        (e.heal, e.kind) = (Some(pct(x[0])), EffectKind::Heal);
    }
    for (text, stat) in [
        (" lực tấn công", Stat::Attack),
        (" lực phòng thủ", Stat::Defense),
        (" né tránh", Stat::Dodge),
    ] {
        if let Some((amount, turns)) = search_buff(d, text) {
            e.buff = Some(Buff {
                stat,
                amount,
                turns,
            });
            e.kind = EffectKind::Buff;
        }
    }
    if let Some(x) = search(d, &[T("Triệt tiêu "), D, T("% năng lượng")]) {
        (e.sap, e.kind) = (Some(pct(x[0])), EffectKind::Sap);
    }
    let fire = [
        T("Biến từ "),
        D,
        T(" đến "),
        D,
        T(" quân cờ thành kiếm lửa, và có "),
        D,
        T("% cơ hội đi tiếp"),
    ];
    if let Some(x) = search(d, &fire) {
        e.fire = Some(Span {
            min: x[0],
            max: x[1],
        });
        (e.keep_turn, e.kind) = (Some(pct(x[2])), EffectKind::Fire);
    }
    if d.contains("Được đi tiếp") {
        e.keep_turn = Some(1.0);
    }
    e
}

/// The learnt skills of a tree (s2c/30) at their levels (s2c/9 tail, s2c/10 kind 32); its nội lực is the cost.
pub fn learnt_skills(tree: &[SkillDef], levels: &BTreeMap<i32, i32>) -> Vec<SkillEffect> {
    tree.iter()
        .filter_map(|k| {
            let at = *levels.get(&k.id).unwrap_or(&0);
            let l = k.levels.get(usize::try_from(at).ok()?.checked_sub(1)?)?;
            Some(skill_effect(
                k.id,
                at,
                &l.description,
                l.mana,
                Some(&k.name),
            ))
        })
        .collect()
}

/// A potion of the bag: its bag slot (c2s/44), item id and how many may still be used; `cost_share`, what one costs as
/// a share of own max HP, at most what it gives plus POTION_MARGIN, over ActionOptions::potion_cost (the app: Hoàn Linh
/// Dược at 1, Kim Đan Dược at 0.17, so the rule holds at every level, 07-auto-battle.md#bình-máu-và-mana).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Potion {
    pub slot: i32,
    pub item_id: i32,
    pub quantity: i32,
    pub cost_share: Option<f64>,
}
/// POTION_MARGIN of battle-actions.ts: the most a potion of its own cost share costs over what it gives, a fifth of the
/// 1e4 of a death, so a potion that saves the battle one time in five is drunk at any max HP. The share alone outgrows
/// the 1e4 from about 5000 HP on, and then a potion would never be drunk.
pub const POTION_MARGIN: f64 = 2000.0;
/// What a potion does in battle (A1): Hoàn Linh Dược (item 0) heals ⌊25% max HP⌋, Kim Đan Dược (item 1) gives 25 nội
/// lực. 0 where it does not.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PotionEffect {
    pub name: &'static str,
    pub hp: f64,
    pub s1: f64,
}
/// POTIONS of battle-actions.ts.
pub fn potion_effect(item_id: i32) -> Option<PotionEffect> {
    match item_id {
        0 => Some(PotionEffect {
            name: "Hoàn Linh Dược",
            hp: 0.25,
            s1: 0.0,
        }),
        1 => Some(PotionEffect {
            name: "Kim Đan Dược",
            hp: 0.0,
            s1: 25.0,
        }),
        _ => None,
    }
}

/// Share of casts that keep K (17 of 128 lost it).
const KEEP_K: f64 = 6.0 / 7.0;
/// Swords taken per own turn and per mob turn (Cóc Xanh, simulator and live), for buffs.
const OWN_SWORDS: f64 = 1.0;
const MOB_SWORDS: f64 = 0.42;
/// Share of the worth of the nội lực a skill spends that is charged to it (SPEND of battle-actions.ts): a skill kept
/// for a later turn deals the same damage then, so it is worth casting now only for what the turn adds.
pub const SPEND: f64 = 1.0;

/// `x || 0` and `!x` of the TS side: 0 and NaN are falsy.
fn falsy(x: f64) -> bool {
    x == 0.0 || x.is_nan()
}
/// Math.min of two numbers: NaN when either is.
fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else {
        a.min(b)
    }
}

/// Expected damage of a damage skill before it sees the board: 3 swords plus about one it clears, plus K.
pub fn skill_damage(e: &SkillEffect, sword: f64) -> f64 {
    match e.kind {
        EffectKind::Damage => sword * 4.0 + e.damage.unwrap_or(0) as f64 * KEEP_K,
        _ => 0.0,
    }
}

/// The best damage per nội lực among `skills`, as (Fighter.skill_damage, Fighter.skill_cost): what a yin-yang piece is
/// worth. (0, 0) without a damage skill.
pub fn skill_worth(sword: f64, skills: &[SkillEffect]) -> (f64, f64) {
    let mut best = (0.0, 0.0);
    for e in skills {
        if e.kind == EffectKind::Damage
            && (falsy(best.1) || skill_damage(e, sword) / e.cost as f64 > best.0 / best.1)
        {
            best = (skill_damage(e, sword), e.cost as f64);
        }
    }
    best
}

/// Damage per sword before any is seen, from the stats (A1): a hit of 3 swords ≈ Tấn công + ⌊level / 2⌋ − 6.
pub fn sword_prior(attack: i32, level: i32) -> f64 {
    f64::max(
        1.0,
        (attack as f64 + (level as f64 / 2.0).floor() - 6.0) / 3.0,
    )
}

/// An own action: a swap, a skill by id (c2s/20), or an item of a bag slot (c2s/44).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Action {
    Swap(Move),
    Skill(i32),
    Item { slot: i32, item_id: i32 },
}
/// An action with its score in HP, labelled as the TS side does ("swap", "skill 4000", "item 0").
#[derive(Debug, Clone, PartialEq)]
pub struct Scored {
    pub action: Action,
    pub score: f64,
    pub label: String,
}

/// Own turns left of the buffs cast: not cast again while they last.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Buffs {
    pub attack: i32,
    pub defense: i32,
    pub dodge: i32,
}
impl Buffs {
    pub fn get(&self, s: Stat) -> i32 {
        match s {
            Stat::Attack => self.attack,
            Stat::Defense => self.defense,
            Stat::Dodge => self.dodge,
        }
    }
    pub fn set(&mut self, s: Stat, turns: i32) {
        match s {
            Stat::Attack => self.attack = turns,
            Stat::Defense => self.defense = turns,
            Stat::Dodge => self.dodge = turns,
        }
    }
    /// One own turn passed.
    pub fn tick(&mut self) {
        for t in [&mut self.attack, &mut self.defense, &mut self.dodge] {
            *t = (*t - 1).max(0);
        }
    }
}

/// ActionOptions of battle-actions.ts.
#[derive(Debug, Clone)]
pub struct ActionOptions<'a> {
    /// Learnt skills (learnt_skills); those the nội lực does not pay for are skipped.
    pub skills: &'a [SkillEffect],
    pub potions: &'a [Potion],
    /// What one potion costs in HP, unless it has its own cost_share: infinite (the default) never uses one.
    pub potion_cost: f64,
    /// Share of the worth of the nội lực a skill spends that is charged to it (SPEND).
    pub spend: f64,
    /// Destroy patterns tried per skill.
    pub samples: usize,
    pub buffs: Buffs,
}
impl Default for ActionOptions<'_> {
    fn default() -> Self {
        Self {
            skills: &[],
            potions: &[],
            potion_cost: f64::INFINITY,
            spend: SPEND,
            samples: 16,
            buffs: Buffs::default(),
        }
    }
}

/// bestAction of battle-actions.ts: the best swap, every skill `me` can pay for and every potion, best first (a stable
/// sort, so a tie keeps the swap, then the skills in order, then the potions).
pub fn best_action(
    b: &Board,
    me: &Fighter,
    mob: &Fighter,
    s: &Strategy,
    o: &ActionOptions,
) -> Vec<Scored> {
    let mut all = vec![];
    let pick = best_move(b, me, mob, s);
    let per_s1 = if falsy(me.skill_cost) {
        0.0
    } else {
        me.skill_damage / me.skill_cost
    };
    if let Some(p) = &pick {
        all.push(Scored {
            action: Action::Swap(p.mv),
            score: p.score,
            label: "swap".into(),
        });
    }
    // A timed battle casts only its plan skill of those that deal damage, as soon as it is paid for unless a swap kills;
    // a heal, buff or sap skill is weighed as in any battle (the mob still hits on its clock, and no potion is drunk).
    let plan = if s.timed { plan_skill(o.skills) } else { None };
    let castable: Vec<&SkillEffect> = o
        .skills
        .iter()
        .filter(|e| {
            e.kind != EffectKind::Unknown
                && me.s1 >= e.cost as f64
                && e.buff.is_none_or(|f| o.buffs.get(f.stat) <= 0)
                && plan.is_none_or(|p| {
                    std::ptr::eq(p, *e) || !matches!(e.kind, EffectKind::Damage | EffectKind::Fire)
                })
        })
        .collect();
    // The nội lực spent is charged (SPEND), but not when the bar is too full for the cheapest skill to be cast later
    // without losing what comes in meanwhile, nor in a timed battle. The same for every skill.
    let cheapest = castable
        .iter()
        .map(|e| e.cost as f64)
        .fold(f64::INFINITY, f64::min);
    let charged = !falsy(s.reply) && me.s1 + cheapest <= 100.0;
    let swap_score = pick.as_ref().map_or(0.0, |p| p.score);
    for e in castable {
        let cost_per_s1 = if charged { per_s1 * o.spend } else { 0.0 };
        let v = skill_score(b, e, me, mob, s, cost_per_s1, per_s1, o, swap_score);
        let swap = pick.as_ref().map_or(f64::NEG_INFINITY, |p| p.score);
        all.push(Scored {
            action: Action::Skill(e.id),
            score: if plan.is_some_and(|p| std::ptr::eq(p, e)) && swap < 1e4 {
                v.max(swap + 1.0)
            } else {
                v
            },
            label: format!("skill {}", e.id),
        });
    }
    // No potion in a timed battle (reply 0): the mob's clock hits are not scored, so neither is the death a potion saves
    // from.
    let potions = if falsy(s.reply) { &[][..] } else { o.potions };
    for p in potions {
        let Some(fx) = potion_effect(p.item_id) else {
            continue;
        };
        if p.quantity <= 0 {
            continue;
        }
        let hp = if falsy(fx.hp) {
            0.0
        } else {
            js_min(me.max_hp - me.hp, (fx.hp * me.max_hp).floor())
        };
        let s1 = if falsy(fx.s1) {
            0.0
        } else {
            js_min(100.0 - me.s1, fx.s1)
        };
        let gain = hp + s1 * per_s1;
        let cost = p.cost_share.map_or(o.potion_cost, |k| {
            js_min(k * me.max_hp, gain + POTION_MARGIN)
        });
        if (falsy(hp) && falsy(s1)) || cost == f64::INFINITY {
            continue;
        }
        let after = Fighter {
            hp: me.hp + hp,
            s1: me.s1 + s1,
            ..*me
        };
        all.push(Scored {
            action: Action::Item {
                slot: p.slot,
                item_id: p.item_id,
            },
            score: gain - cost - s.reply * answer_value(b, mob, &after, s),
            label: format!("item {}", p.item_id),
        });
    }
    all.sort_by(|x, y| {
        y.score
            .partial_cmp(&x.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    all
}

/// The one skill a timed battle casts, as soon as the nội lực pays for it: one that turns pieces into Kiếm lửa (Hỏa Kiếm
/// Thuật), else the cheapest damage skill (Hỏa Cầu, Xích Lôi Công, Băng Tiễn Thuật). In the Bạch Hổ simulator (21/11, the
/// nine characters of that night's run, nội lực 2.06 and 5.5 a yin-yang) holding for Hỏa Kiếm dealt 26–92% more than
/// v3, the cheapest damage skill 12–19% more (Lôi, Thủy, Hỏa without it), Thiên Hỏa Kích, Bách Lôi Uy Vũ, Tuyết Sơn Áp
/// Đỉnh less but for one Lôi build, the plain damage skills (1003, 1004, 2003, 4003) and 1007, 4007 less than v3.
/// planSkill of battle-actions.ts.
pub fn plan_skill(skills: &[SkillEffect]) -> Option<&SkillEffect> {
    skills
        .iter()
        .find(|e| e.kind == EffectKind::Fire)
        .or_else(|| {
            skills
                .iter()
                .filter(|e| e.kind == EffectKind::Damage)
                .min_by_key(|e| (e.cost, e.id))
        })
}

/// `s` with its extra turn left out: an own move after one that keeps the turn.
fn flat(s: &Strategy) -> Strategy {
    Strategy {
        extra_turn: 0.0,
        ..s.clone()
    }
}

/// The average over destroy patterns of what the skill is worth now: its damage (1e4 × the chance it kills), the HP and
/// nội lực of the pieces it clears, less its cost at `cost_per_s1` a point and the mob's answer on the board it leaves.
/// A skill that keeps the turn is worth its effect plus the best swap still to come.
#[allow(clippy::too_many_arguments)]
fn skill_score(
    b: &Board,
    e: &SkillEffect,
    me: &Fighter,
    mob: &Fighter,
    s: &Strategy,
    cost_per_s1: f64,
    per_s1: f64,
    o: &ActionOptions,
    swap_score: f64,
) -> f64 {
    let full = me.s2 >= 100.0;
    let charge = e.cost as f64 * cost_per_s1;
    if matches!(e.kind, EffectKind::Buff | EffectKind::Sap) {
        let turns = e.buff.map_or(0, |f| f.turns) as f64 / 2.0;
        let swords_off = e.buff.map_or(0, |f| f.amount) as f64 / 3.0;
        let v = match (e.buff.map(|f| f.stat), e.sap) {
            (Some(Stat::Attack), _) => {
                swords_off * OWN_SWORDS * turns * if full { 2.0 } else { 1.0 }
            }
            (Some(Stat::Defense), _) => swords_off * MOB_SWORDS * turns,
            (_, Some(sap)) if !falsy(sap) => {
                let worth = if falsy(mob.skill_cost) {
                    0.0
                } else {
                    mob.skill_damage / mob.skill_cost
                };
                mob.s1 * sap * worth
            }
            _ => 0.0,
        };
        let keep = e.keep_turn.unwrap_or(0.0);
        let after = match e.sap.filter(|&x| !falsy(x)) {
            Some(sap) => Fighter {
                s1: mob.s1 * (1.0 - sap),
                ..*mob
            },
            None => *mob,
        };
        let me_after = Fighter {
            s1: me.s1 - e.cost as f64,
            ..*me
        };
        return v - charge + keep * swap_score
            - (1.0 - keep) * s.reply * answer_value(b, &after, &me_after, s);
    }
    let seed = (board_hash(b) ^ e.id) as u32;
    let mut rnd = Mulberry32(seed);
    let samples = destroy_patterns(e, &mut || rnd.next(), o.samples);
    let mut total = 0.0;
    for removed in &samples {
        let mut t = *b;
        if e.fire.is_some() {
            total += fire_value(&mut t, removed, e, me, mob, s) - charge;
            continue;
        }
        let out = if removed.is_empty() {
            Outcome::default()
        } else {
            settle(&mut t, None, removed)
        };
        // A heart, yin-yang or peach the skill destroys counts once, as one cleared in a run (game 1.1.0: 5468 casts of
        // 20–21/11 fit once, 5 fit three times; before it, 2/11, three times).
        let n = |k: i16| out.n(k);
        let (mut damage, mut kill) = (0.0, 0.0);
        if e.kind == EffectKind::Damage {
            let least = me.sword * (3.0 + out.n(0)) * if full { 2.0 } else { 1.0 };
            let k = e.damage.unwrap_or(0) as f64;
            damage = least + k * KEEP_K;
            kill = if least >= mob.hp {
                1.0
            } else if least + k >= mob.hp {
                KEEP_K
            } else {
                0.0
            };
        }
        let missing = me.max_hp - me.hp;
        let heal = e.heal.filter(|&x| !falsy(x));
        let healed = js_min(
            if falsy(missing) { 0.0 } else { missing },
            n(1) * me.heart
                + heal.map_or(0.0, |x| (x * me.max_hp).floor())
                + e.drain.map_or(0.0, |d| d.chance * d.hp as f64),
        );
        let s1 = n(2) * me.yinyang;
        let s2 = if full {
            0.0
        } else {
            js_min(100.0 - me.s2, n(3) * me.peach)
        };
        let mut v = damage + healed + s1 * per_s1 + s2 / 100.0 * 3.0 * me.sword - charge;
        for (&piece, &c) in &out.cleared {
            v += s.bonus.iter().find(|x| x.0 == piece).map_or(0.0, |x| x.1) * c as f64;
        }
        if let Some(w) = e.weaken {
            v += w.chance * w.amount as f64 / 3.0 * OWN_SWORDS * w.turns as f64 / 2.0;
        }
        let me_after = Fighter {
            hp: me.hp + healed,
            s1: me.s1 - e.cost as f64 + s1,
            s2: if full { 0.0 } else { me.s2 + s2 },
            ..*me
        };
        let mob_after = Fighter {
            hp: mob.hp - damage,
            ..*mob
        };
        if out.extra_turn || e.keep_turn == Some(1.0) {
            v += if falsy(s.lookahead) {
                s.extra_turn
            } else {
                s.lookahead * best_next(&t, &me_after, &mob_after, &flat(s))
            };
        } else {
            v -= s.reply * answer_value(&t, &mob_after, &me_after, s);
        }
        total += kill * 1e4 + (1.0 - kill) * v;
    }
    total / samples.len() as f64
}

/// Hỏa Kiếm Thuật: the chosen pieces turn into Kiếm lửa (code 10) and the runs that makes fall as after a swap; the turn
/// is kept with the stated chance. Seen 5 times (symap 02/11): runs fall at once, as here; the server picks the pieces,
/// so they are guessed here.
fn fire_value(
    t: &mut Board,
    cells: &[usize],
    e: &SkillEffect,
    me: &Fighter,
    mob: &Fighter,
    s: &Strategy,
) -> f64 {
    for &i in cells {
        t[i] = 10;
    }
    let out = settle(t, None, &[]);
    let v = move_value(&out, me, mob, &flat(s), &s.bonus);
    if v >= 1e4 {
        return v;
    }
    let keep = if out.extra_turn {
        1.0
    } else {
        e.keep_turn.unwrap_or(0.0)
    };
    let hit = out.n(0) * me.sword * if me.s2 >= 100.0 { 2.0 } else { 1.0 };
    let me_after = Fighter {
        s1: me.s1 - e.cost as f64,
        ..*me
    };
    let mob_after = Fighter {
        hp: mob.hp - hit,
        ..*mob
    };
    v + keep * best_next(t, &me_after, &mob_after, &flat(s))
        - (1.0 - keep) * s.reply * answer_value(t, &mob_after, &me_after, s)
}

/// Cell sets a skill may destroy (destroyPatterns of battle-actions.ts): random placements of its areas, cells, rows or
/// columns, `n` of them; one empty set for a skill that destroys nothing. Areas may overlap.
pub fn destroy_patterns(
    e: &SkillEffect,
    rnd: &mut dyn FnMut() -> f64,
    n: usize,
) -> Vec<Vec<usize>> {
    let nonzero = |x: Option<u32>| x.filter(|&v| v != 0);
    let (rows, cols) = (nonzero(e.rows), nonzero(e.cols));
    if e.areas.is_none()
        && e.random.is_none()
        && rows.is_none()
        && cols.is_none()
        && e.fire.is_none()
    {
        return vec![vec![]];
    }
    let between = |rnd: &mut dyn FnMut() -> f64, min: u32, max: u32| {
        min as i64 + (rnd() * (max as f64 - min as f64 + 1.0)).floor() as i64
    };
    // The first `count` of a shuffle of 0..of (count never exceeds `of` with the skills of the game).
    let pick = |rnd: &mut dyn FnMut() -> f64, count: i64, of: usize| {
        let mut all: Vec<usize> = (0..of).collect();
        let count = count.clamp(0, of as i64) as usize;
        for i in 0..count {
            let j = i + (rnd() * (of - i) as f64).floor() as usize;
            all.swap(i, j);
        }
        all.truncate(count);
        all
    };
    let mut one = || -> Vec<usize> {
        if let Some(a) = e.areas {
            let (mut seen, mut cells) = ([false; N * N], vec![]);
            let mut k = between(rnd, a.min, a.max);
            while k > 0 {
                let r0 = (rnd() * (N as f64 - a.h as f64 + 1.0)).floor() as i64;
                let c0 = (rnd() * (N as f64 - a.w as f64 + 1.0)).floor() as i64;
                for r in 0..a.h as i64 {
                    for c in 0..a.w as i64 {
                        let i = (r0 + r) * N as i64 + c0 + c;
                        if (0..(N * N) as i64).contains(&i) && !seen[i as usize] {
                            seen[i as usize] = true;
                            cells.push(i as usize);
                        }
                    }
                }
                k -= 1;
            }
            return cells;
        }
        if let Some(x) = e.random {
            let count = between(rnd, x.min, x.max).min((N * N) as i64);
            return pick(rnd, count, N * N);
        }
        if let Some(rows) = rows {
            return pick(rnd, (rows as i64).min(N as i64), N)
                .into_iter()
                .flat_map(|r| (0..N).map(move |c| r * N + c))
                .collect();
        }
        if let Some(cols) = cols {
            return pick(rnd, (cols as i64).min(N as i64), N)
                .into_iter()
                .flat_map(|c| (0..N).map(move |r| r * N + c))
                .collect();
        }
        if let Some(f) = e.fire {
            let count = between(rnd, f.min, f.max);
            return pick(rnd, count, N * N);
        }
        vec![]
    };
    (0..n).map(|_| one()).collect()
}

/// The hash of the board the destroy patterns are seeded with (FNV-1a over v + 3, as Math.imul on the TS side).
pub fn board_hash(b: &Board) -> i32 {
    let mut h: u32 = 0x811c_9dc5;
    for &v in b {
        h = (h ^ (v as i32 + 3) as u32).wrapping_mul(0x0100_0193);
    }
    h as i32
}

/// mulberry32, the generator of the TS side: the same seed gives the same numbers in [0, 1).
pub struct Mulberry32(pub u32);
impl Mulberry32 {
    #[allow(clippy::should_implement_trait)]
    pub fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6d2b_79f5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        (t ^ (t >> 14)) as f64 / 4_294_967_296.0
    }
}

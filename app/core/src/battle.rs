//! Port of src/battle/battle.ts (docs/app/events/07-auto-battle.md): the 8×8 board, cascades, legal moves, the HP-value move
//! search, and the battle packets of docs/app/events/05-battle.md. tests/parity.rs checks every function against what
//! the TS code computes on the captured battles (`npm run export:rust`).
use crate::protocol::{Reader, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const N: usize = 8;
pub const EMPTY: i16 = -1;
pub const UNKNOWN: i16 = -2;
pub const GOLD: i16 = 0x46;
pub type Board = [i16; N * N];

/// Swap of two cells, (row, column) each.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Move {
    pub from: (i32, i32),
    pub to: (i32, i32),
}

/// Pieces cleared by kind, cascade waves, extra turn, refill pieces used.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Outcome {
    pub cleared: BTreeMap<i16, u32>,
    pub waves: u32,
    pub extra_turn: bool,
    pub refill_used: usize,
}
impl Outcome {
    pub fn n(&self, piece: i16) -> f64 {
        *self.cleared.get(&piece).unwrap_or(&0) as f64
    }
}

/// Codes 10..69 are special pieces ("Kiếm lửa") of kind code % 10.
pub fn kind(v: i16) -> i16 {
    if (10..GOLD).contains(&v) {
        v % 10
    } else {
        v
    }
}
fn special(v: i16) -> bool {
    (10..GOLD).contains(&v)
}

pub struct Run {
    pub piece: i16,
    pub cells: Vec<usize>,
}
/// Runs of ≥3 in rows and columns, and every cell they clear (special pieces blast their 3×3 neighbourhood).
pub fn find_runs(b: &Board) -> ([bool; N * N], usize, Vec<Run>) {
    let at = |r: usize, c: usize| {
        let v = b[r * N + c];
        if v < 0 {
            v
        } else {
            kind(v)
        }
    };
    let (mut cells, mut runs) = ([false; N * N], vec![]);
    for r in 0..N {
        for c in 0..N {
            let v = at(r, c);
            if v < 0 {
                continue;
            }
            let mut k = 1;
            while c + k < N && at(r, c + k) == v {
                k += 1;
            }
            if k >= 3 && (c == 0 || at(r, c - 1) != v) {
                runs.push(Run {
                    piece: v,
                    cells: (0..k).map(|i| r * N + c + i).collect(),
                });
            }
            k = 1;
            while r + k < N && at(r + k, c) == v {
                k += 1;
            }
            if k >= 3 && (r == 0 || at(r - 1, c) != v) {
                runs.push(Run {
                    piece: v,
                    cells: (0..k).map(|i| (r + i) * N + c).collect(),
                });
            }
        }
    }
    for run in &runs {
        for &i in &run.cells {
            cells[i] = true;
        }
    }
    let count = blast(b, &mut cells);
    (cells, count, runs)
}

/// Adds the 3×3 neighbourhood of every special piece among `cells`, chaining through other specials; returns the count.
fn blast(b: &Board, cells: &mut [bool; N * N]) -> usize {
    let mut pending: Vec<usize> = (0..N * N).filter(|&i| cells[i] && special(b[i])).collect();
    while let Some(i) = pending.pop() {
        let (r0, c0) = ((i / N) as i32, (i % N) as i32);
        for r in r0 - 1..=r0 + 1 {
            for c in c0 - 1..=c0 + 1 {
                if r < 0 || r >= N as i32 || c < 0 || c >= N as i32 {
                    continue;
                }
                let j = r as usize * N + c as usize;
                if cells[j] || b[j] < 0 {
                    continue;
                }
                cells[j] = true;
                if special(b[j]) {
                    pending.push(j);
                }
            }
        }
    }
    cells.iter().filter(|&&x| x).count()
}

/// Gravity, then fill holes column by column left→right, bottom→top, from `refill` (UNKNOWN when it runs out).
fn collapse(b: &mut Board, refill: Option<&[i16]>, start: usize) -> usize {
    for c in 0..N {
        let mut w = N as i32 - 1;
        for r in (0..N).rev() {
            if b[r * N + c] != EMPTY {
                b[w as usize * N + c] = b[r * N + c];
                w -= 1;
            }
        }
        while w >= 0 {
            b[w as usize * N + c] = EMPTY;
            w -= 1;
        }
    }
    let mut used = start;
    for c in 0..N {
        for r in (0..N).rev() {
            if b[r * N + c] == EMPTY {
                b[r * N + c] = match refill {
                    Some(f) if used < f.len() => {
                        used += 1;
                        f[used - 1]
                    }
                    _ => UNKNOWN,
                };
            }
        }
    }
    used
}

/// Clears `removed` (a skill's cells) and then every cascade, in place. With refill None new cells are UNKNOWN.
pub fn settle(b: &mut Board, refill: Option<&[i16]>, removed: &[usize]) -> Outcome {
    let mut o = Outcome::default();
    if !removed.is_empty() {
        let mut cells = [false; N * N];
        for &i in removed {
            cells[i] = true;
        }
        blast(b, &mut cells);
        for i in (0..N * N).filter(|&i| cells[i]) {
            *o.cleared.entry(kind(b[i])).or_default() += 1;
            b[i] = EMPTY;
        }
        o.refill_used = collapse(b, refill, o.refill_used);
    }
    loop {
        let (cells, count, runs) = find_runs(b);
        if count == 0 {
            break;
        }
        let crossing = runs.iter().enumerate().any(|(i, x)| {
            runs.iter()
                .skip(i + 1)
                .any(|y| x.piece == y.piece && x.cells.iter().any(|c| y.cells.contains(c)))
        });
        if runs.iter().any(|x| x.cells.len() >= 4) || crossing {
            o.extra_turn = true;
        }
        o.waves += 1;
        for i in (0..N * N).filter(|&i| cells[i]) {
            *o.cleared.entry(kind(b[i])).or_default() += 1;
            b[i] = EMPTY;
        }
        o.refill_used = collapse(b, refill, o.refill_used);
    }
    o
}

pub fn swap(b: &mut Board, m: Move) {
    let i = m.from.0 as usize * N + m.from.1 as usize;
    let j = m.to.0 as usize * N + m.to.1 as usize;
    b.swap(i, j);
}

pub fn legal_moves(b: &Board) -> Vec<Move> {
    let mut out = vec![];
    for r in 0..N {
        for c in 0..N {
            for (dr, dc) in [(0, 1), (1, 0)] {
                let (r2, c2) = (r + dr, c + dc);
                if r2 >= N || c2 >= N {
                    continue;
                }
                let (x, y) = (b[r * N + c], b[r2 * N + c2]);
                if x < 0 || y < 0 || kind(x) == kind(y) {
                    continue;
                }
                let m = Move {
                    from: (r as i32, c as i32),
                    to: (r2 as i32, c2 as i32),
                };
                let mut t = *b;
                swap(&mut t, m);
                if find_runs(&t).1 > 0 {
                    out.push(m);
                }
            }
        }
    }
    out
}

/// One side as the move search sees it (Fighter of battle.ts): HP, stat1 (nội lực), stat2 (power), and what one piece
/// is worth to it. BattleRunner replaces the defaults with what it sees.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Fighter {
    pub hp: f64,
    pub max_hp: f64,
    pub s1: f64,
    pub s2: f64,
    pub sword: f64,
    pub heart: f64,
    pub yinyang: f64,
    pub peach: f64,
    pub skill_cost: f64,
    pub skill_damage: f64,
}
pub fn fighter(hp: f64, max_hp: f64) -> Fighter {
    Fighter {
        hp,
        max_hp,
        s1: 0.0,
        s2: 0.0,
        sword: 10.0,
        heart: 5.5,
        yinyang: 1.2,
        peach: 4.4,
        skill_cost: 25.0,
        skill_damage: 60.0,
    }
}
/// A mob before anything is known of it: HP unknown, Sói Xám and Cóc Xanh averaged.
pub fn unknown_mob() -> Fighter {
    Fighter {
        sword: 8.0,
        heart: 6.0,
        yinyang: 3.0,
        peach: 5.0,
        skill_cost: 30.0,
        skill_damage: 40.0,
        ..fighter(f64::INFINITY, f64::INFINITY)
    }
}

/// How the mob's answer is valued: its move worth most to it (`Best`, Q20), or its average move as MOB_AI says it plays
/// (`Odds`, v2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum MobModel {
    #[default]
    Best,
    Odds,
}

/// extra_turn: worth of keeping the turn; reply: share of the opponent's answer subtracted (0 in a timed battle);
/// bonus: worth of own EXP and coin pieces; mob_model: how that answer is valued; lookahead: a move that keeps the turn
/// is worth this share of the best own move after it, in place of the flat extra_turn (0: none). Strategy of battle.ts.
#[derive(Debug, Clone, PartialEq)]
pub struct Strategy {
    pub extra_turn: f64,
    pub reply: f64,
    pub bonus: Vec<(i16, f64)>,
    pub mob_model: MobModel,
    pub lookahead: f64,
}
impl Strategy {
    /// Ends battles soonest (Q20).
    pub fn kill() -> Self {
        Self {
            extra_turn: 10.0,
            reply: 1.0,
            bonus: vec![],
            mob_model: MobModel::Best,
            lookahead: 0.0,
        }
    }
    /// Also collects drops, stars and gold (Q20).
    pub fn exp() -> Self {
        Self {
            bonus: vec![(4, 2.0), (5, 4.0), (GOLD, 1.0)],
            ..Self::kill()
        }
    }
    /// `kill` with the mob as it really plays (MOB_AI) and a look at the move after an extra turn (v2,
    /// 07-auto-battle.md#thuật-toán-v2): the app's default.
    pub fn win() -> Self {
        Self {
            mob_model: MobModel::Odds,
            lookahead: 1.0,
            ..Self::kill()
        }
    }
    /// `exp` played as `win`.
    pub fn farm() -> Self {
        Self {
            mob_model: MobModel::Odds,
            lookahead: 1.0,
            ..Self::exp()
        }
    }
    /// STRATEGIES of battle.ts by name.
    pub fn named(name: &str) -> Option<Self> {
        match name {
            "kill" => Some(Self::kill()),
            "exp" => Some(Self::exp()),
            "win" => Some(Self::win()),
            "farm" => Some(Self::farm()),
            _ => None,
        }
    }
}

/// How the server's mob picks its swap (MOB_AI of battle.ts, 07-auto-battle.md#cách-quái-chọn-nước): P(move) ∝
/// exp(Σ weight × feature) over its legal moves. With the nội lực for its skill it casts half the time.
pub mod mob_ai {
    /// Weight of each piece of the first wave, by kind.
    pub const PIECE: [(i16, f64); 7] = [
        (0, 0.379),
        (1, 0.412),
        (2, 0.255),
        (3, 0.163),
        (4, -0.068),
        (5, -0.054),
        (super::GOLD, -0.028),
    ];
    pub const CASCADE: f64 = -0.014;
    pub const EXTRA_TURN: f64 = 1.485;
    pub const FIRST_FOUND: f64 = 1.024;
    pub const CAST: f64 = 0.5;
}

/// Math.exp as V8 computes it on the machine the vectors come from (fdlibm's exp of src/base/ieee754.cc, its polynomial
/// fused as clang builds it for arm64): the mob's odds then have the bits of the TS side, so a near tie is broken the
/// same way. Checked against Node on 200 000 values.
pub fn js_exp(x: f64) -> f64 {
    // The constants of fdlibm by their IEEE words.
    const fn w(bits: u64) -> f64 {
        f64::from_bits(bits)
    }
    const HALF: [f64; 2] = [0.5, -0.5];
    const O_THRESHOLD: f64 = w(0x4086_2e42_fefa_39ef);
    const U_THRESHOLD: f64 = w(0xc087_4910_d52d_3051);
    const LN2_HI: [f64; 2] = [w(0x3fe6_2e42_fee0_0000), w(0xbfe6_2e42_fee0_0000)];
    const LN2_LO: [f64; 2] = [w(0x3dea_39ef_3579_3c76), w(0xbdea_39ef_3579_3c76)];
    const INVLN2: f64 = w(0x3ff7_1547_652b_82fe);
    const P1: f64 = w(0x3fc5_5555_5555_553e);
    const P2: f64 = w(0xbf66_c16c_16be_bd93);
    const P3: f64 = w(0x3f11_566a_af25_de2c);
    const P4: f64 = w(0xbebb_bd41_c5d2_6bf1);
    const P5: f64 = w(0x3e66_3769_72be_a4d0);
    const HUGE: f64 = 1.0e300;
    const TWOM1000: f64 = w(0x0170_0000_0000_0000);
    const TWO1023: f64 = w(0x7fe0_0000_0000_0000);
    let bits = x.to_bits();
    let mut hx = (bits >> 32) as u32;
    let xsb = ((hx >> 31) & 1) as usize;
    hx &= 0x7fff_ffff;
    if hx >= 0x4086_2e42 {
        if hx >= 0x7ff0_0000 {
            if ((hx & 0xf_ffff) | bits as u32) != 0 {
                return x + x;
            }
            return if xsb == 0 { x } else { 0.0 };
        }
        if x > O_THRESHOLD {
            return HUGE * HUGE;
        }
        if x < U_THRESHOLD {
            return TWOM1000 * TWOM1000;
        }
    }
    let (mut x, mut hi, mut lo, mut k) = (x, 0.0, 0.0, 0i32);
    if hx > 0x3fd6_2e42 {
        if hx < 0x3ff0_a2b2 {
            // V8 returns E for exp(1), which the reduction below would get a bit wrong.
            if x == 1.0 {
                return std::f64::consts::E;
            }
            hi = x - LN2_HI[xsb];
            lo = LN2_LO[xsb];
            k = 1 - 2 * xsb as i32;
        } else {
            k = (INVLN2 * x + HALF[xsb]) as i32;
            let t = k as f64;
            hi = x - t * LN2_HI[0];
            lo = t * LN2_LO[0];
        }
        x = hi - lo;
    } else if hx < 0x3e30_0000 && HUGE + x > 1.0 {
        return 1.0 + x;
    }
    let t = x * x;
    let high = if k >= -1021 {
        0x3ff0_0000 + (k << 20)
    } else {
        0x3ff0_0000 + ((k + 1000) << 20)
    };
    let twopk = f64::from_bits(((high as u32) as u64) << 32);
    let c = (-t).mul_add(
        t.mul_add(t.mul_add(t.mul_add(t.mul_add(P5, P4), P3), P2), P1),
        x,
    );
    if k == 0 {
        return 1.0 - ((x * c) / (c - 2.0) - x);
    }
    let y = 1.0 - ((lo - (x * c) / (2.0 - c)) - hi);
    if k >= -1021 {
        if k == 1024 {
            return y * 2.0 * TWO1023;
        }
        y * twopk
    } else {
        y * twopk * TWOM1000
    }
}

/// The cells of the first wave in the order the Set of findRuns holds them: runs in scan order, then the blasts. Sums
/// over them add up in the order of the TS side.
fn first_wave(b: &Board) -> Vec<usize> {
    let (_, _, runs) = find_runs(b);
    let (mut seen, mut cells) = ([false; N * N], vec![]);
    for &i in runs.iter().flat_map(|r| &r.cells) {
        if !seen[i] {
            seen[i] = true;
            cells.push(i);
        }
    }
    let mut pending: Vec<usize> = cells.iter().copied().filter(|&i| special(b[i])).collect();
    while let Some(i) = pending.pop() {
        let (r0, c0) = ((i / N) as i32, (i % N) as i32);
        for r in r0 - 1..=r0 + 1 {
            for c in c0 - 1..=c0 + 1 {
                if r < 0 || r >= N as i32 || c < 0 || c >= N as i32 {
                    continue;
                }
                let j = r as usize * N + c as usize;
                if seen[j] || b[j] < 0 {
                    continue;
                }
                seen[j] = true;
                cells.push(j);
                if special(b[j]) {
                    pending.push(j);
                }
            }
        }
    }
    cells
}

/// One legal move of the mob, the share of the time it plays it (MOB_AI) and what it clears on the known cells.
#[derive(Debug, Clone, PartialEq)]
pub struct MobMove {
    pub mv: Move,
    pub p: f64,
    pub outcome: Outcome,
}
/// mobMoveOdds of battle.ts: the moves are scanned by rows, columns, down before right; the first legal one gets
/// FIRST_FOUND.
pub fn mob_move_odds(b: &Board) -> Vec<MobMove> {
    let mut out: Vec<MobMove> = vec![];
    let mut total = 0.0;
    for r in 0..N {
        for c in 0..N {
            for (dr, dc) in [(1, 0), (0, 1)] {
                let (r2, c2) = (r + dr, c + dc);
                if r2 >= N || c2 >= N {
                    continue;
                }
                let (i, j) = (r * N + c, r2 * N + c2);
                if b[i] < 0 || b[j] < 0 || kind(b[i]) == kind(b[j]) {
                    continue;
                }
                let mv = Move {
                    from: (r as i32, c as i32),
                    to: (r2 as i32, c2 as i32),
                };
                let mut t = *b;
                swap(&mut t, mv);
                let first = first_wave(&t);
                if first.is_empty() {
                    continue;
                }
                let mut x = if out.is_empty() {
                    mob_ai::FIRST_FOUND
                } else {
                    0.0
                };
                for &k in &first {
                    let piece = kind(t[k]);
                    x += mob_ai::PIECE
                        .iter()
                        .find(|p| p.0 == piece)
                        .map_or(0.0, |p| p.1);
                }
                let outcome = settle(&mut t, None, &[]);
                let cleared: u32 = outcome.cleared.values().sum();
                x += (cleared as f64 - first.len() as f64) * mob_ai::CASCADE
                    + if outcome.extra_turn {
                        mob_ai::EXTRA_TURN
                    } else {
                        0.0
                    };
                let p = js_exp(x);
                total += p;
                out.push(MobMove { mv, p, outcome });
            }
        }
    }
    for m in &mut out {
        m.p /= total;
    }
    out
}

/// What the mob's answer on `t` (its turn) is worth to it: its best move (`Best`), or the average under MOB_AI with its
/// skill in place of a swap half the time once it has the nội lực (`Odds`). answerValue of battle.ts.
pub fn answer_value(t: &Board, mob: &Fighter, me: &Fighter, s: &Strategy) -> f64 {
    let mut v = 0.0f64;
    if s.mob_model != MobModel::Odds {
        for r in legal_moves(t) {
            let mut u = *t;
            swap(&mut u, r);
            v = v.max(move_value(&settle(&mut u, None, &[]), mob, me, s, &[]));
        }
        return v;
    }
    for a in mob_move_odds(t) {
        v += a.p * move_value(&a.outcome, mob, me, s, &[]);
    }
    if mob.skill_cost != 0.0 && mob.s1 >= mob.skill_cost {
        let skill = if mob.skill_damage >= me.hp {
            1e4
        } else {
            mob.skill_damage
        };
        v = mob_ai::CAST * skill + (1.0 - mob_ai::CAST) * v;
    }
    v
}

fn sword_damage(o: &Outcome, f: &Fighter) -> f64 {
    o.n(0) * f.sword * if f.s2 >= 100.0 { 2.0 } else { 1.0 }
}
/// HP swing of an outcome for `actor` against `target`, as moveValue of battle.ts. A killing move is worth 1e4.
pub fn move_value(
    o: &Outcome,
    actor: &Fighter,
    target: &Fighter,
    s: &Strategy,
    bonus: &[(i16, f64)],
) -> f64 {
    let damage = sword_damage(o, actor);
    if damage >= target.hp {
        return 1e4;
    }
    // `maxHp - hp || 0` of the TS side: an unknown HP (Infinity - Infinity) counts as full.
    let missing = actor.max_hp - actor.hp;
    let missing = if missing.is_nan() || missing == 0.0 {
        0.0
    } else {
        missing
    };
    let mut v = damage
        + f64::min(o.n(1) * actor.heart, missing)
        + if o.extra_turn { s.extra_turn } else { 0.0 };
    if actor.skill_cost != 0.0 {
        v += o.n(2) * actor.yinyang * actor.skill_damage / actor.skill_cost;
    }
    if actor.s2 < 100.0 {
        v += f64::min(100.0 - actor.s2, o.n(3) * actor.peach) / 100.0 * 3.0 * actor.sword;
    }
    for (&piece, &n) in &o.cleared {
        v += bonus.iter().find(|b| b.0 == piece).map_or(0.0, |b| b.1) * n as f64;
    }
    v
}

pub struct Pick {
    pub mv: Move,
    pub score: f64,
    pub outcome: Outcome,
}
/// Two plies on the known pieces, as bestMove of battle.ts: own value of each move, minus `reply` × the mob's answer on
/// the board it leaves (answer_value), valued with own HP after the heal and the mob's HP after the hit. A move that keeps
/// the turn is not answered; with `lookahead` it is worth that share of the best own move after it instead of the flat
/// extra_turn.
pub fn best_move(b: &Board, me: &Fighter, mob: &Fighter, s: &Strategy) -> Option<Pick> {
    let flat;
    let own = if s.lookahead != 0.0 {
        flat = Strategy {
            extra_turn: 0.0,
            ..s.clone()
        };
        &flat
    } else {
        s
    };
    let mut best: Option<Pick> = None;
    for m in legal_moves(b) {
        let mut t = *b;
        swap(&mut t, m);
        let o = settle(&mut t, None, &[]);
        let mut score = move_value(&o, me, mob, own, &s.bonus);
        if score < 1e4 {
            let me_after = Fighter {
                hp: f64::min(me.max_hp, me.hp + o.n(1) * me.heart),
                ..*me
            };
            let mob_after = Fighter {
                hp: mob.hp - sword_damage(&o, me),
                ..*mob
            };
            if o.extra_turn && s.lookahead != 0.0 {
                score += s.lookahead * best_next(&t, &me_after, &mob_after, own);
            } else if !o.extra_turn && s.reply != 0.0 {
                score -= s.reply * answer_value(&t, &mob_after, &me_after, s);
            }
        }
        if best.as_ref().is_none_or(|p| score > p.score) {
            best = Some(Pick {
                mv: m,
                score,
                outcome: o,
            });
        }
    }
    best
}

/// The best own move on `t` without anything after it, valued with `s` (its extra_turn already left out by the caller)
/// and its bonus: what keeping the turn is worth with lookahead.
pub(crate) fn best_next(t: &Board, me: &Fighter, mob: &Fighter, s: &Strategy) -> f64 {
    let mut next = 0.0f64;
    for m in legal_moves(t) {
        let mut u = *t;
        swap(&mut u, m);
        next = next.max(move_value(&settle(&mut u, None, &[]), me, mob, s, &s.bonus));
    }
    next
}

/// castSkill of battle.ts: whether to cast the one own skill now rather than play `swap_score` (best_move's best, None
/// without a legal swap). Cast when the least damage (3 swords) kills, when nội lực piles up to twice the cost, or when the
/// average damage less the mob's answer on the board as it stands beats the swap. Only without the skill table; with it
/// battle_actions::best_action decides.
pub fn cast_skill(
    b: &Board,
    me: &Fighter,
    mob: &Fighter,
    s: &Strategy,
    swap_score: Option<f64>,
) -> bool {
    if me.skill_cost == 0.0 || me.skill_cost.is_nan() || me.s1 < me.skill_cost {
        return false;
    }
    let full = me.s2 >= 100.0;
    let least = 3.0 * me.sword * if full { 2.0 } else { 1.0 };
    let damage = me.skill_damage + if full { 4.0 * me.sword } else { 0.0 };
    let Some(swap_score) = swap_score else {
        return true;
    };
    if least >= mob.hp || me.s1 >= 2.0 * me.skill_cost {
        return true;
    }
    let score = if damage >= mob.hp {
        0.85e4
    } else {
        let after = Fighter {
            hp: mob.hp - damage,
            ..*mob
        };
        damage - s.reply * answer_value(b, &after, me, s)
    };
    score >= swap_score
}

/// The cells a skill that destroys `removed` clears before the board falls: those cells and the 3×3 blast of every Kiếm
/// lửa among them (blastCells of battle.ts).
pub fn blast_cells(b: &Board, removed: &[usize]) -> [bool; N * N] {
    let mut cells = [false; N * N];
    for &i in removed {
        cells[i] = true;
    }
    blast(b, &mut cells);
    cells
}

/// The mob block of s2c/22 (mobBlock of src/battle/battle.ts): `string id; string name; u8; u8; u8 element; i32 level;
/// i32 sprite; u8; i32 hp; i32 maxHp`. The element byte is 1 Hỏa, 2 Lôi, 4 Thủy as for items (07-auto-battle.md#s2c22-641-byte);
/// `sprite` is the mob's sprite sheet, Báo Đen 100600, Tướng Thiết Kích 101050 (06-map-mobs.md#tấm-ảnh-của-quái).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobBlock {
    pub name: String,
    pub element: u8,
    pub level: i32,
    pub sprite: i32,
    pub hp: i32,
    pub max_hp: i32,
}
/// mobBlock of battle.ts: the block found by its length-prefixed id. None when the id is not in the packet (or its block
/// does not read).
pub fn mob_block(p: &[u8], mob_id: &str) -> Option<MobBlock> {
    let id = mob_id.as_bytes();
    let find =
        |from: usize| (from..=p.len().checked_sub(id.len())?).find(|&i| &p[i..i + id.len()] == id);
    let mut at = find(0);
    // As the loop of the TS side: it stops at the first match too close to the start for a length prefix.
    while let Some(i) = at.filter(|&i| i >= 4) {
        let len = i32::from_be_bytes([p[i - 4], p[i - 3], p[i - 2], p[i - 1]]);
        if len == id.len() as i32 {
            let mut r = Reader::new(&p[i - 4..]);
            let block = (|| -> Result<MobBlock> {
                r.string()?;
                let name = r.string()?;
                r.take(2)?;
                let element = r.u8()?;
                let level = r.i32()?;
                let sprite = r.i32()?;
                r.u8()?;
                Ok(MobBlock {
                    name,
                    element,
                    level,
                    sprite,
                    hp: r.i32()?,
                    max_hp: r.i32()?,
                })
            })();
            return block.ok();
        }
        at = find(i + 1);
    }
    None
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Setup {
    pub me: String,
    pub level: i32,
    pub hp: i32,
    pub max_hp: i32,
    pub uuid: String,
    pub board: Vec<i16>,
    pub turn_seconds: u8,
}
/// s2c/22: the head of the player block and the tail (uuid, board, turn seconds).
pub fn battle_setup(p: &[u8]) -> Result<Setup> {
    let mut r = Reader::new(p);
    r.u8()?;
    r.u8()?;
    let me = r.string()?;
    r.string()?;
    r.take(3)?;
    let level = r.i32()?;
    r.i32()?;
    r.u8()?;
    let (hp, max_hp) = (r.i32()?, r.i32()?);
    let tail = 4 + 36 + 4 + N * N + 2;
    if p.len() < r.offset + tail {
        return crate::protocol::err("PAYLOAD_SCHEMA", "s2c/22 shorter than its tail");
    }
    let mut t = Reader::new(&p[p.len() - tail..]);
    let uuid = t.string()?;
    t.i32()?;
    let board = t.take(N * N)?.iter().map(|&v| v as i16).collect();
    Ok(Setup {
        me,
        level,
        hp,
        max_hp,
        uuid,
        board,
        turn_seconds: t.u8()?,
    })
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinAck {
    pub field0: i32,
    /// 1: no turns, the mob hits on a ~30 s timer (s2c/21).
    pub timed: u8,
    pub field5: u8,
}
/// s2c/18
pub fn battle_join_ack(p: &[u8]) -> Result<JoinAck> {
    let mut r = Reader::new(p);
    Ok(JoinAck {
        field0: r.i32()?,
        timed: r.u8()?,
        field5: r.u8()?,
    })
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    pub seq: i32,
    pub field: i32,
    pub player_turn: u8,
    pub field9: u8,
}
/// s2c/24
pub fn turn_state(p: &[u8]) -> Result<Turn> {
    let mut r = Reader::new(p);
    Ok(Turn {
        seq: r.i32()?,
        field: r.i32()?,
        player_turn: r.u8()?,
        field9: r.u8()?,
    })
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Unit {
    pub name: String,
    pub damage: i32,
    pub b: u8,
    pub hp: i32,
    pub s1: i32,
    pub s2: i32,
}
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Reward {
    pub won: bool,
    pub exp: i32,
    pub coin: i32,
}
/// s2c/19 (swap), s2c/20 (skill), s2c/21 (timed hit).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleResult {
    pub seq: i32,
    #[serde(rename = "move", skip_serializing_if = "Option::is_none")]
    pub mv: Option<Move>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skill: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub targets: Option<Vec<i32>>,
    /// Cells a skill destroyed, row * 8 + column.
    pub cells: Vec<i32>,
    pub refill: Vec<i16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_board: Option<Vec<i16>>,
    pub units: Vec<Unit>,
    pub extra_turn: bool,
    pub actor: String,
    pub end: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reward: Option<Reward>,
}
pub fn battle_result(p: &[u8], opcode: i32) -> Result<BattleResult> {
    let mut r = Reader::new(p);
    let seq = r.i32()?;
    r.i32()?;
    r.i32()?;
    fn cell_list(r: &mut Reader) -> Result<Vec<i32>> {
        let n = r.i32()?.max(0);
        (0..n)
            .map(|_| Ok((r.i32()? - 2) * N as i32 + (r.i32()? - 2)))
            .collect()
    }
    let (mut mv, mut skill, mut targets, mut cells) = (None, None, None, vec![]);
    if opcode == 19 {
        mv = Some(Move {
            from: (r.i32()? - 2, r.i32()? - 2),
            to: (r.i32()? - 2, r.i32()? - 2),
        });
    } else {
        skill = Some(r.i32()?);
        r.i32()?;
        targets = Some(cell_list(&mut r)?);
        cells = cell_list(&mut r)?;
    }
    r.i32()?;
    let refill: Vec<i16> = r.bytes()?.iter().map(|&v| v as i16).collect();
    // u8 1 + i32 64 + 64 bytes when the server reshuffled the board after the move (no move left), then 3 bytes. A result
    // without refill (Hàn Lưu Thánh Thủy 4001 heals and destroys nothing, A1) has neither, like s2c/44.
    let new_board = if !refill.is_empty() && r.u8()? == 1 {
        Some(r.bytes()?.iter().map(|&v| v as i16).collect())
    } else {
        None
    };
    if !refill.is_empty() {
        r.take(3)?;
    }
    let (units, extra_turn, actor, end, reward) = result_tail(&mut r)?;
    Ok(BattleResult {
        seq,
        mv,
        skill,
        targets,
        cells,
        refill,
        new_board,
        units,
        extra_turn,
        actor,
        end,
        reward,
    })
}
/// s2c/44 after c2s/44 (an item of the bag used in battle, P5): like s2c/19 without the reshuffle flag and the 3 bytes
/// before the units; the unit line carries the new HP. battleItemResult of battle.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemResult {
    pub seq: i32,
    pub a: i32,
    /// The bag slot used.
    pub slot: i32,
    pub refill: Vec<i16>,
    pub units: Vec<Unit>,
    pub extra_turn: bool,
    pub actor: String,
    pub end: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reward: Option<Reward>,
}
impl ItemResult {
    /// As a result of the board: nothing moved, nothing destroyed.
    pub fn into_result(self) -> BattleResult {
        BattleResult {
            seq: self.seq,
            mv: None,
            skill: None,
            targets: None,
            cells: vec![],
            refill: self.refill,
            new_board: None,
            units: self.units,
            extra_turn: self.extra_turn,
            actor: self.actor,
            end: self.end,
            reward: self.reward,
        }
    }
}
pub fn battle_item_result(p: &[u8]) -> Result<ItemResult> {
    let mut r = Reader::new(p);
    let seq = r.i32()?;
    r.i32()?;
    r.i32()?;
    let (a, slot) = (r.i32()?, r.i32()?);
    r.i32()?;
    let refill = r.bytes()?.iter().map(|&v| v as i16).collect();
    let (units, extra_turn, actor, end, reward) = result_tail(&mut r)?;
    Ok(ItemResult {
        seq,
        a,
        slot,
        refill,
        units,
        extra_turn,
        actor,
        end,
        reward,
    })
}
pub fn timeout_result(p: &[u8]) -> Result<BattleResult> {
    let mut r = Reader::new(p);
    let seq = r.i32()?;
    r.i32()?;
    r.i32()?;
    let (units, extra_turn, actor, end, reward) = result_tail(&mut r)?;
    Ok(BattleResult {
        seq,
        mv: None,
        skill: None,
        targets: None,
        cells: vec![],
        refill: vec![],
        new_board: None,
        units,
        extra_turn,
        actor,
        end,
        reward,
    })
}
type Tail = (Vec<Unit>, bool, String, bool, Option<Reward>);
fn result_tail(r: &mut Reader) -> Result<Tail> {
    let mut units = vec![];
    for _ in 0..r.u8()? {
        units.push(Unit {
            name: r.string()?,
            damage: r.i32()?,
            b: r.u8()?,
            hp: r.i32()?,
            s1: r.i32()?,
            s2: r.i32()?,
        });
    }
    let flags = r.take(4)?;
    let extra_turn = flags[1] == 1;
    let (actor, end) = (r.string()?, r.u8()? == 1);
    let reward = if end {
        Some(Reward {
            won: r.u8()? == 1,
            exp: r.i32()?,
            coin: r.i32()?,
        })
    } else {
        None
    };
    Ok((units, extra_turn, actor, end, reward))
}

#[cfg(test)]
mod tests {
    use super::js_exp;

    /// Math.exp of Node 22 on macOS arm64 (the machine the vectors come from), by IEEE bits: the first four are where
    /// fdlibm without the fused polynomial is a bit off, as on x86. 200 000 values were checked this way.
    #[test]
    fn js_exp_gives_the_bits_of_math_exp() {
        for (x, y) in [
            (0xbff0_1a35_5800_0000u64, 0x3fd7_64e4_cfda_1d99u64),
            (0xc005_4a71_4000_0000, 0x3fb1_e1f2_9a5c_93d4),
            (0x4012_1532_2a00_0000, 0x4056_f996_ce22_bb41),
            (0xc003_0ea5_4000_0000, 0x3fb7_a45c_7a12_15b5),
            (0x3ff0_624d_d2f1_a9fc, 0x4006_4644_31ca_d486),
            (0x4004_126e_978d_4fdf, 0x4028_95d3_c46a_3346),
            (0x3fe0_0000_0000_0000, 0x3ffa_6129_8e1e_069c),
            (0xbfb1_6872_b020_c49c, 0x3fed_e576_387e_b514),
            (0x3ff0_0000_0000_0000, 0x4005_bf0a_8b14_5769),
            (0x4085_e000_0000_0000, 0x7f0d_945d_f4f8_ec8e),
        ] {
            let x = f64::from_bits(x);
            assert_eq!(js_exp(x).to_bits(), y, "exp({x})");
        }
        assert_eq!(js_exp(f64::NEG_INFINITY), 0.0);
        assert!(js_exp(f64::NAN).is_nan());
    }
}

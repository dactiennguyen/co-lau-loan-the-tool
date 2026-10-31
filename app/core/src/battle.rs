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

/// extra_turn: worth of keeping the turn; reply: share of the opponent's best answer subtracted (0 in a timed battle);
/// bonus: worth of own EXP and coin pieces.
#[derive(Debug, Clone, PartialEq)]
pub struct Strategy {
    pub extra_turn: f64,
    pub reply: f64,
    pub bonus: Vec<(i16, f64)>,
}
impl Strategy {
    /// Ends battles soonest.
    pub fn kill() -> Self {
        Self {
            extra_turn: 10.0,
            reply: 1.0,
            bonus: vec![],
        }
    }
    /// Also collects drops, stars and gold.
    pub fn exp() -> Self {
        Self {
            extra_turn: 10.0,
            reply: 1.0,
            bonus: vec![(4, 2.0), (5, 4.0), (GOLD, 1.0)],
        }
    }
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
/// Two plies on the known pieces, as bestMove of battle.ts.
pub fn best_move(b: &Board, me: &Fighter, mob: &Fighter, s: &Strategy) -> Option<Pick> {
    let mut best: Option<Pick> = None;
    for m in legal_moves(b) {
        let mut t = *b;
        swap(&mut t, m);
        let o = settle(&mut t, None, &[]);
        let mut score = move_value(&o, me, mob, s, &s.bonus);
        if score < 1e4 && !o.extra_turn && s.reply != 0.0 {
            let me_after = Fighter {
                hp: f64::min(me.max_hp, me.hp + o.n(1) * me.heart),
                ..*me
            };
            let mob_after = Fighter {
                hp: mob.hp - sword_damage(&o, me),
                ..*mob
            };
            let mut reply = 0.0f64;
            for r in legal_moves(&t) {
                let mut u = t;
                swap(&mut u, r);
                reply = reply.max(move_value(
                    &settle(&mut u, None, &[]),
                    &mob_after,
                    &me_after,
                    s,
                    &[],
                ));
            }
            score -= s.reply * reply;
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
    let refill = r.bytes()?.iter().map(|&v| v as i16).collect();
    let new_board = if r.u8()? == 1 {
        Some(r.bytes()?.iter().map(|&v| v as i16).collect())
    } else {
        None
    };
    r.take(3)?;
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

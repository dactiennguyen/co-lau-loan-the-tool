//! What the battle window of the desktop draws (docs/integration/rust/features.md#cửa-sổ-trận): the battle as it goes,
//! one event per change. The runners push Turn and Move (BattleRunner::views), the Bot adds Open and End
//! (Bot::on_packet sends them out as Out::BattleEvent).
use crate::battle::{frames, skill_cells, BattleResult, Board, Fighter, Reward, Wave, N};
use crate::runner::Turn;
use serde::Serialize;
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BattleEvent {
    /// s2c/22: the battle opened.
    Open(Box<Open>),
    /// s2c/18 or s2c/24: a turn starts (`seq`), the player's or the mob's; a timed battle has no turns.
    #[serde(rename_all = "camelCase")]
    Turn { seq: i32, mine: bool, timed: bool },
    /// A result: s2c/19 (a swap), s2c/20 (a skill), s2c/21 (a timed hit), s2c/44 (an item of the bag).
    Move(Box<Frame>),
    /// The battle is over.
    End(End),
}

/// HP, nội lực (s1) and sức mạnh (s2) of one side; the mob's HP is not known before a result shows it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gauge {
    pub hp: Option<i32>,
    pub max_hp: Option<i32>,
    pub s1: i32,
    pub s2: i32,
}
impl Gauge {
    pub fn of(f: &Fighter) -> Self {
        let n = |v: f64| v.is_finite().then(|| v.round() as i32);
        Self {
            hp: n(f.hp),
            max_hp: n(f.max_hp),
            s1: n(f.s1).unwrap_or(0),
            s2: n(f.s2).unwrap_or(0),
        }
    }
}

/// One side as the battle opens.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Side {
    pub name: String,
    pub level: i32,
    /// 1 Hỏa, 2 Lôi, 4 Thủy.
    pub element: Option<i32>,
    pub gauge: Gauge,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Open {
    pub board: Vec<i16>,
    pub me: Side,
    pub mob: Side,
    pub mob_id: String,
    /// The mob's sprite sheet (MobBlock::sprite).
    pub sprite: Option<i32>,
    pub boss: bool,
    /// Seconds of a turn (s2c/22).
    pub turn_seconds: u8,
}

/// One result: the board before it, the swap or the skill's cells, each wave of the fall, the board after (a
/// reshuffle of the server, `new_board`, replaces it), and both sides after it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Frame {
    pub seq: i32,
    pub turn: Turn,
    pub before: Vec<i16>,
    /// The two cells of the swap, row * 8 + column.
    pub swap: Option<[usize; 2]>,
    /// The cells of a skill.
    pub cells: Vec<usize>,
    /// The skill turned its cells into Kiếm lửa instead of destroying them.
    pub fire: bool,
    pub waves: Vec<Wave>,
    pub board: Vec<i16>,
    pub reshuffled: bool,
    pub me: Gauge,
    pub mob: Gauge,
    pub reward: Option<Reward>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EndKind {
    Won,
    Lost,
    /// Đầu hàng, or left while the bot stopped (Bot::left).
    Left,
    /// s2c/36 with no surrender: the server cancelled it.
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct End {
    /// Not `kind`: the tag of BattleEvent is.
    pub result: EndKind,
    pub exp: Option<i32>,
    pub coin: Option<i32>,
}

/// The Move of result `x` on `before`, the board the runner had: `fire` as apply_result chose it, `after` the board the
/// runner has now (with the reshuffle), `turn` what the runner made of it, `me` and `mob` the sides now.
pub fn frame(
    before: &Board,
    x: &BattleResult,
    fire: bool,
    after: &Board,
    turn: &Turn,
    me: &Fighter,
    mob: &Fighter,
) -> BattleEvent {
    let cells = skill_cells(x);
    let (waves, _) = frames(before, x.mv, &cells, &x.refill, fire);
    let at = |(r, c): (i32, i32)| (r * N as i32 + c) as usize;
    BattleEvent::Move(Box::new(Frame {
        seq: x.seq,
        turn: turn.clone(),
        before: before.to_vec(),
        swap: x.mv.map(|m| [at(m.from), at(m.to)]),
        cells,
        fire,
        waves,
        board: after.to_vec(),
        reshuffled: x.new_board.is_some(),
        me: Gauge::of(me),
        mob: Gauge::of(mob),
        reward: x.reward.clone(),
    }))
}

/// A battle recorded for the battle window (app/core/tests/fixtures/battle-*.json): the mob (s2c/43 names it to the
/// Bot) and the s2c packets of the battle with their ms.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct Recorded {
    pub mob: RecordedMob,
    /// [ms, "s2c/19", hex].
    pub packets: Vec<(u64, String, String)>,
}
#[derive(Debug, Clone, serde::Deserialize)]
pub struct RecordedMob {
    pub id: String,
    pub name: String,
    pub level: i32,
    /// 1 Hỏa, 2 Lôi, 4 Thủy.
    pub element: i32,
}

/// The battle fed to a Bot as it came: the map and its mob, a challenge, then every packet at its ms. Returns the events
/// of the battle window with the ms they came at, for the browser preview of the window (sample.rs) and its test.
pub fn replay(battle: &Recorded) -> Result<Vec<(u64, BattleEvent)>, String> {
    use crate::bot::{Bot, BotOptions, Out};
    use crate::protocol::Writer;
    let mut bot = Bot::new(
        BotOptions::default(),
        Arc::new(crate::atlas::Atlas::default()),
    );
    let (t0, mut out) = (Instant::now(), vec![]);
    let read = |e: crate::protocol::ProtocolError| e.to_string();
    bot.on_packet(
        29,
        &Writer::new().string("").string("M0").i32(0).build(),
        t0,
        &mut out,
    )
    .map_err(read)?;
    // a of s2c/43: 0 Hỏa, 2 Lôi, 4 Thủy (Mob::element).
    let a = if battle.mob.element == 1 {
        0
    } else {
        battle.mob.element as u8
    };
    let m = &battle.mob;
    let mobs = Writer::new()
        .string("M0")
        .u8(0)
        .string(&m.id)
        .string(&m.name)
        .i32(m.level)
        .u8(a)
        .i32(9)
        .i32(1)
        .u8(0)
        .build();
    bot.on_packet(43, &mobs, t0, &mut out).map_err(read)?;
    bot.fight(&m.name, 1, 1, t0, &mut out);
    out.clear();
    let mut events = vec![];
    for (ms, op, hex) in &battle.packets {
        let op: i32 = op
            .strip_prefix("s2c/")
            .and_then(|n| n.parse().ok())
            .ok_or_else(|| format!("not an s2c packet: {op}"))?;
        let bytes = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(hex.get(i..i + 2).unwrap_or("zz"), 16))
            .collect::<Result<Vec<u8>, _>>()
            .map_err(|e| e.to_string())?;
        bot.on_packet(op, &bytes, t0 + Duration::from_millis(*ms), &mut out)
            .map_err(read)?;
        for o in out.drain(..) {
            if let Out::BattleEvent(e) = o {
                events.push((*ms, *e));
            }
        }
    }
    Ok(events)
}

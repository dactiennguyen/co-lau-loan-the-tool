//! battle::frames, the waves the battle window draws (battle_view.rs): played wave by wave as the window plays them, they
//! leave the board settle and apply_result leave and clear the same pieces, on every result of the captured battles and
//! of the Hỏa Kiếm Thuật casts (Kiếm lửa).
use cllt_core::battle::{
    apply_result, battle_result, frames, kind, settle, skill_cells, swap, Board, Move, Wave, EMPTY,
    FIRE, N,
};
use cllt_core::battle_view::{replay as replay_battle, BattleEvent, EndKind, Recorded};
use serde_json::Value;
use std::collections::BTreeMap;

mod common;
use common::{board, hex};

fn all() -> Value {
    serde_json::from_str(include_str!("vectors.json")).unwrap()
}
/// The waves played as BattleWindow.tsx plays them: the swap, Kiếm lửa, then for each wave its cleared cells, its falls
/// in order (none lands on a piece) and its new pieces (each fills a hole); no hole is left after a wave.
fn replay(
    before: &Board,
    mv: Option<Move>,
    cells: &[usize],
    fire: bool,
    waves: &[Wave],
) -> (Board, BTreeMap<i16, u32>) {
    let mut b = *before;
    if let Some(m) = mv {
        swap(&mut b, m);
    }
    if fire {
        for &c in cells {
            b[c] = FIRE;
        }
    }
    let mut cleared = BTreeMap::new();
    for w in waves {
        for &i in &w.cleared {
            assert_ne!(b[i], EMPTY, "cleared twice: {i}");
            *cleared.entry(kind(b[i])).or_default() += 1;
            b[i] = EMPTY;
        }
        for &(from, to) in &w.falls {
            assert!(
                to > from && to % N == from % N,
                "a fall goes down its column: {from} → {to}"
            );
            assert_eq!(b[to], EMPTY, "fell onto a piece: {from} → {to}");
            (b[to], b[from]) = (b[from], EMPTY);
        }
        for &(i, p) in &w.filled {
            assert_eq!(b[i], EMPTY, "filled a cell with a piece: {i}");
            b[i] = p;
        }
        assert!(!b.contains(&EMPTY), "a hole after a wave");
    }
    (b, cleared)
}

#[test]
fn frames_play_every_result_of_the_captured_battles_as_settle_does() {
    let (mut results, mut waves_seen) = (0, 0);
    for battle in all()["battles"].as_array().unwrap() {
        let mut bd = board(&battle["board"]);
        for (k, s) in battle["steps"].as_array().unwrap().iter().enumerate() {
            let where_ = format!("{} step {k}", battle["source"]);
            let mv = s["move"].as_array().map(|m| {
                let m: Vec<i32> = m.iter().map(|x| x.as_i64().unwrap() as i32).collect();
                Move {
                    from: (m[0], m[1]),
                    to: (m[2], m[3]),
                }
            });
            let refill: Vec<i16> = s["refill"]
                .as_array()
                .unwrap()
                .iter()
                .map(|x| x.as_i64().unwrap() as i16)
                .collect();
            let cells: Vec<usize> = s["cells"].as_array().map_or(vec![], |c| {
                c.iter()
                    .map(|rc| (rc[0].as_u64().unwrap() * 8 + rc[1].as_u64().unwrap()) as usize)
                    .collect()
            });
            let before = bd;
            if let Some(m) = mv {
                swap(&mut bd, m);
            }
            let o = settle(&mut bd, Some(&refill), &cells);
            let (waves, end) = frames(&before, mv, &cells, &refill, false);
            assert_eq!(end, bd, "{where_}: board");
            assert_eq!(
                waves.len() as u32,
                o.waves + u32::from(!cells.is_empty()),
                "{where_}: waves (a skill's cells are one more)"
            );
            let (played, cleared) = replay(&before, mv, &cells, false, &waves);
            assert_eq!(played, end, "{where_}: played");
            assert_eq!(cleared, o.cleared, "{where_}: cleared");
            let filled: usize = waves.iter().map(|w| w.filled.len()).sum();
            assert_eq!(filled, o.refill_used, "{where_}: refill used");
            results += 1;
            waves_seen += waves.len();
        }
    }
    assert!(
        results >= 50 && waves_seen > results,
        "{results} results, {waves_seen} waves"
    );
}

#[test]
fn frames_turn_the_cells_of_hoa_kiem_thuat_into_kiem_lua_as_apply_result_chose() {
    let casts = all()["battleV3"]["fireCasts"].clone();
    let mut fires = 0;
    for c in casts.as_array().unwrap() {
        for fire in [Some(true), None, Some(false)] {
            let mut b = board(&c["board"]);
            let mut packets = vec![(20, hex(c["cast"].as_str().unwrap()))];
            for h in c["next"].as_array().unwrap() {
                packets.push((19, hex(h.as_str().unwrap())));
            }
            for (i, (op, p)) in packets.into_iter().enumerate() {
                let where_ = format!("{} {fire:?} result {i}", c["source"]);
                let x = battle_result(&p, op).unwrap();
                let before = b;
                let a = apply_result(&mut b, &x, if i == 0 { fire } else { None });
                let cells = skill_cells(&x);
                let (waves, end) = frames(&before, x.mv, &cells, &x.refill, a.fire);
                assert!(x.new_board.is_none(), "{where_}");
                assert_eq!(end, b, "{where_}: board");
                let (played, cleared) = replay(&before, x.mv, &cells, a.fire, &waves);
                assert_eq!(played, end, "{where_}: played");
                assert_eq!(cleared, a.outcome.cleared, "{where_}: cleared");
                fires += usize::from(a.fire);
            }
        }
    }
    assert!(fires > 0, "no cast turned its cells into Kiếm lửa");
}

#[test]
fn a_recorded_battle_fed_to_the_bot_gives_the_battle_window_one_board_from_open_to_end() {
    let battle: Recorded =
        serde_json::from_str(include_str!("fixtures/battle-hoa-hau.json")).unwrap();
    let count = |op: &str| battle.packets.iter().filter(|p| p.1 == op).count();
    let events: Vec<BattleEvent> = replay_battle(&battle)
        .unwrap()
        .into_iter()
        .map(|(_, e)| e)
        .collect();
    let BattleEvent::Open(open) = &events[0] else {
        panic!("first: {:?}", events[0]);
    };
    assert_eq!(
        (
            open.me.name.as_str(),
            open.mob.name.as_str(),
            open.mob.level,
            open.mob.element
        ),
        ("manina", "Hỏa Hầu", 29, Some(1))
    );
    assert_eq!(
        (open.sprite, open.boss, open.turn_seconds),
        (Some(100090), false, 30)
    );
    assert_eq!(open.mob.gauge.max_hp, Some(766));
    let turns = events
        .iter()
        .filter(|e| matches!(e, BattleEvent::Turn { .. }))
        .count();
    assert_eq!(turns, count("s2c/18") + count("s2c/24"));
    // The board goes on from move to move: each starts where the one before left it, and its waves lead to its board.
    let mut board: Board = open.board.clone().try_into().unwrap();
    let mut moves = vec![];
    for e in &events {
        let BattleEvent::Move(f) = e else { continue };
        assert_eq!(f.before, board.to_vec(), "move {}: before", f.turn.n);
        let mv = f.swap.map(|[a, b]| Move {
            from: ((a / N) as i32, (a % N) as i32),
            to: ((b / N) as i32, (b % N) as i32),
        });
        let (played, _) = replay(&board, mv, &f.cells, f.fire, &f.waves);
        assert!(
            f.reshuffled || played.to_vec() == f.board,
            "move {}: waves",
            f.turn.n
        );
        board = f.board.clone().try_into().unwrap();
        moves.push(f);
    }
    assert_eq!(moves.len(), count("s2c/19") + count("s2c/20"));
    assert!(
        moves
            .iter()
            .any(|f| f.turn.skill == Some(1000) && !f.cells.is_empty()),
        "Hỏa Cầu Thuật"
    );
    assert!(moves.iter().any(|f| f.waves.len() >= 6), "a long cascade");
    assert!(moves.iter().any(|f| f.turn.extra_turn), "an extra turn");
    assert!(moves.iter().any(|f| f.turn.mine) && moves.iter().any(|f| !f.turn.mine));
    let last = moves.last().unwrap();
    assert!(last.turn.end && last.reward.as_ref().is_some_and(|r| r.won));
    assert_eq!(last.mob.hp, Some(0));
    let BattleEvent::End(end) = events.last().unwrap() else {
        panic!("last: {:?}", events.last());
    };
    assert_eq!(end.result, EndKind::Won);
    assert!(end.exp.is_some_and(|x| x > 0));
}

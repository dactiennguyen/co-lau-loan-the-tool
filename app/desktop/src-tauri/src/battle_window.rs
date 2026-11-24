// The battle window of an account (docs/integration/rust/features.md#cửa-sổ-trận): a second window, labelled
// battle-<id>, that draws its battle as it goes for OBS. The bot sends what happens (cllt_core::battle_view); the App
// keeps the battle on or the last one (BattleState) for a window opened in the middle, and queues each event for the
// flusher, which sends it to that window only, in order. Each message is numbered (`rev`), and the state keeps the number
// of the last one it took: a window opened in the middle loads the state, then drops the messages it already holds.
use crate::app::Shared;
use cllt_core::battle_view::{BattleEvent, End, Gauge, Open};
use cllt_core::bot::{add_picked, Picked};
use cllt_core::runner::Turn;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, State};
#[cfg(desktop)]
use tauri::{Manager as _, WebviewUrl, WebviewWindowBuilder};

/// The label of the battle window of account `id`; capabilities/default.json lets "battle-*" listen to events.
pub fn label(id: u64) -> String {
    format!("battle-{id}")
}

/// What the battle window shows, as the events left it: the battle opened, the board and both sides after the last
/// result, whose turn, how it ended, what Tự nhặt đồ picked up after it.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleState {
    pub open: Option<Open>,
    pub board: Vec<i16>,
    pub me: Gauge,
    pub mob: Gauge,
    /// The seq of the turn on, whether it is the player's, whether the battle is timed.
    pub turn: Option<(i32, bool, bool)>,
    pub last: Option<Turn>,
    pub end: Option<End>,
    pub picked: Vec<Picked>,
    /// `ended_at` of the battle (BattleRecord), which its pickups name.
    #[serde(skip)]
    pub ended_at: Option<u64>,
    /// The number of the last message to the window that changed this state (App::send_battle_window). The App counts
    /// them for all accounts, so they only rise while it runs. The state is changed before its message is sent, so a
    /// window may get one it loaded already, before the state reply or just after: it drops those up to this number.
    pub rev: u64,
}
impl BattleState {
    pub fn apply(&mut self, e: &BattleEvent) {
        match e {
            BattleEvent::Open(o) => {
                *self = Self {
                    board: o.board.clone(),
                    me: o.me.gauge,
                    mob: o.mob.gauge,
                    open: Some((**o).clone()),
                    ..Self::default()
                };
            }
            BattleEvent::Turn { seq, mine, timed } => self.turn = Some((*seq, *mine, *timed)),
            BattleEvent::Move(f) => {
                self.board = f.board.clone();
                (self.me, self.mob) = (f.me, f.mob);
                self.last = Some(f.turn.clone());
            }
            BattleEvent::End(end) => (self.end, self.turn) = (Some(*end), None),
        }
    }

    /// An item picked up after the battle shown: added to its list, which goes to the window whole.
    pub fn pick(&mut self, battle_at: u64, item: &Picked) -> Option<Vec<Picked>> {
        (self.ended_at == Some(battle_at)).then(|| {
            add_picked(&mut self.picked, item);
            self.picked.clone()
        })
    }
}

/// One message to a battle window, on the event "battle": a BattleEvent (kind open, turn, move, end), or the items
/// picked up after the battle (kind picked). It goes with its number, `rev` (BattleState::rev).
#[derive(Debug, Clone)]
pub enum WindowMsg {
    Event(Box<BattleEvent>),
    Picked(Vec<Picked>),
}
impl WindowMsg {
    pub fn payload(&self, rev: u64) -> Value {
        let mut payload = match self {
            WindowMsg::Event(e) => serde_json::to_value(e).unwrap_or_else(|_| json!({})),
            WindowMsg::Picked(p) => json!({ "kind": "picked", "picked": p }),
        };
        payload["rev"] = rev.into();
        payload
    }
}

#[tauri::command]
pub fn battle_state(shared: State<Shared>, id: u64) -> Option<BattleState> {
    shared.with(|app| app.battle_state(id))
}

/// Opens the battle window of account `id`, or brings it to the front. `on_top` keeps it above other windows; `chroma`
/// gives it the green of a chroma key until the page paints its own (BattleWindow.tsx keeps both in localStorage).
/// Async: a window built in a synchronous command deadlocks on Windows (WebviewWindowBuilder::new, "Known issues").
#[tauri::command]
pub async fn open_battle_window(
    app: AppHandle,
    shared: State<'_, Shared>,
    id: u64,
    on_top: bool,
    chroma: bool,
) -> Result<(), String> {
    // Android has one window only.
    #[cfg(mobile)]
    {
        let _ = (app, shared, id, on_top, chroma);
        Err("Cửa sổ trận chỉ có trên máy tính".into())
    }
    #[cfg(desktop)]
    open_desktop(app, shared, id, on_top, chroma)
}

#[cfg(desktop)]
fn open_desktop(
    app: AppHandle,
    shared: State<'_, Shared>,
    id: u64,
    on_top: bool,
    chroma: bool,
) -> Result<(), String> {
    let label = label(id);
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.unminimize();
        let _ = w.show();
        return w.set_focus().map_err(|e| e.to_string());
    }
    let who = shared
        .with(|a| a.account_label(id))
        .ok_or_else(|| format!("Không có nick {id}"))?;
    let background = if chroma {
        tauri::window::Color(0, 255, 0, 255)
    } else {
        tauri::window::Color(15, 15, 35, 255)
    };
    WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App(format!("index.html?battle={id}").into()),
    )
    .title(format!("Trận đấu – {who}"))
    .inner_size(480.0, 720.0)
    .min_inner_size(300.0, 420.0)
    .always_on_top(on_top)
    .background_color(background)
    .build()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use cllt_core::battle_view::EndKind;

    #[test]
    fn a_new_battle_clears_the_last_one_and_pickups_go_to_the_battle_they_fell_from() {
        let mut s = BattleState::default();
        let open = |board: i16| {
            BattleEvent::Open(Box::new(Open {
                board: vec![board; 64],
                ..Open::default()
            }))
        };
        s.apply(&open(1));
        s.apply(&BattleEvent::Turn {
            seq: 3,
            mine: true,
            timed: false,
        });
        s.apply(&BattleEvent::End(End {
            result: EndKind::Won,
            exp: Some(256),
            coin: Some(14),
        }));
        assert_eq!(
            (s.turn, s.end.map(|e| e.result)),
            (None, Some(EndKind::Won))
        );
        s.ended_at = Some(1_000);
        let coins = Picked::of(41, 236);
        assert_eq!(s.pick(999, &coins), None, "another battle's");
        assert_eq!(s.pick(1_000, &coins).map(|p| p.len()), Some(1));
        assert_eq!(s.pick(1_000, &coins).map(|p| p[0].quantity), Some(472));
        s.apply(&open(2));
        assert!(s.end.is_none() && s.picked.is_empty() && s.ended_at.is_none());
        assert_eq!(s.board, vec![2; 64]);
        let picked = WindowMsg::Picked(vec![coins]).payload(7);
        assert_eq!(
            (&picked["kind"], &picked["rev"]),
            (&json!("picked"), &json!(7))
        );
        let turn = WindowMsg::Event(Box::new(BattleEvent::Turn {
            seq: 4,
            mine: false,
            timed: true,
        }))
        .payload(8);
        assert_eq!(
            turn,
            json!({ "kind": "turn", "seq": 4, "mine": false, "timed": true, "rev": 8 })
        );
    }
}

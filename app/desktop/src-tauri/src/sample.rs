// Sample accounts for --sample and --dump-sample: no network, nothing read from disk. The character of the first one is
// the profile s2c/9 gave at the read-only login of 30/10/2026 (docs/app/user-data.md); other players' names are made up.
use crate::app::{App, Entry};
use crate::view::{self, LogLine};
use cllt_core::accounts::Account;
use cllt_core::bot::{BattleView, BossTile, QuestRun, Snapshot, Target};
use cllt_core::net::ConnState;
use cllt_core::world::{Nearby, Quest, QuestStep};
use serde_json::json;
use std::path::Path;

fn account(label: &str, username: &str) -> Account {
    Account {
        label: label.into(),
        username: username.into(),
        password: String::new(),
        server_id: 24,
        skill: None,
    }
}

/// Steps as s2c/39 sends them: (text, param, required, npc id).
fn quest(
    id: i32,
    title: &str,
    current: i32,
    progress: i32,
    steps: &[(&str, i32, i32, i32)],
) -> Quest {
    Quest {
        id,
        title: title.into(),
        description: String::new(),
        kind: "main".into(),
        current,
        progress,
        steps: steps
            .iter()
            .enumerate()
            .map(|(i, &(text, param, required, npc_id))| QuestStep {
                index: i as i32,
                text: text.into(),
                param,
                required,
                npc_id,
            })
            .collect(),
    }
}

fn main_character() -> Snapshot {
    let target = |name: &str, level, boss, here| Target {
        name: name.into(),
        level,
        boss,
        here,
    };
    let boss = |id: &str, name: &str, moving| BossTile {
        id: id.into(),
        name: name.into(),
        level: 21,
        col: 0,
        row: 0,
        moving,
    };
    let player = |id, name: &str, level| Nearby {
        id,
        name: name.into(),
        level,
    };
    Snapshot {
        name: "manina".into(),
        level: 21,
        hp: 132,
        max_hp: 180,
        exp: Some(14238),
        level_exp: Some([13841, 15882]),
        coin: Some(2664),
        stats: vec![32, 10, 10, 30, 0, 0, 0, 0, 0, 0],
        combat: Some([32, 5, 30, 20, 6]),
        stat_points: Some(68),
        skill_points: Some(19),
        map_id: "M2".into(),
        map_name: "Trại Vân Sơn".into(),
        zone: 1,
        x: 2784,
        y: 864,
        bosses: vec![
            boss("mob89100102", "Hào Trưởng phía Bắc", false),
            boss("mob90100103", "Hào Trưởng phía Nam", true),
        ],
        players: vec![
            player(1, "LongVuong", 25),
            player(2, "TieuYen", 24),
            player(3, "BachHo", 22),
            player(4, "HoaMi", 22),
            player(5, "ThietDiep", 19),
            player(6, "anhkhoa99", 18),
            player(7, "MocLan", 18),
            player(8, "SongTu", 18),
        ],
        targets: vec![
            target("Hào Trưởng phía Bắc", 21, true, true),
            target("Hào Trưởng phía Nam", 21, true, false),
            target("Kẻ Quấy Phá", 20, false, true),
            target("Cua Càng", 15, false, true),
            target("Cóc Xanh", 13, false, true),
        ],
        // Quest 9 where Q20 left it (docs/app/events/10-quests.md).
        quest: Some(quest(
            9,
            "Thử Sức Tân Binh",
            3,
            14,
            &[
                ("Đạt cấp độ 11", 11, 1, -1),
                ("Nói chuyện với Võ Quan Đinh Mộc", 141, 1, 141),
                ("Tiêu diệt Sói Xám", 4, 15, -1),
                ("Tiêu diệt Cóc Xanh", 5, 15, -1),
                ("Báo cáo với Võ Quan Đinh Mộc", 141, 1, 141),
            ],
        )),
        quest_run: Some(QuestRun {
            id: 1,
            step: Some(3),
            step_done: false,
            max_losses: 1,
            fights: 3,
            wins: 2,
            losses: 0,
            exp: 284,
            coin: 36,
            completed: 0,
            doing: "Đánh Cóc Xanh (14/15)".into(),
            done: None,
        }),
        battle: Some(BattleView {
            mob_id: "mob61000".into(),
            mob_name: "Cóc Xanh".into(),
            hp: 132.0,
            max_hp: 180.0,
            mob_hp: Some(96.0),
            mob_max_hp: Some(249.0),
            turns: 7,
            timed: false,
            leaving: false,
        }),
        ..Snapshot::default()
    }
}

pub fn entries() -> Vec<Entry> {
    let mut main = Entry::new(0, account("Nick chính", "manina"));
    (main.state, main.snap, main.since) = (ConnState::Online, main_character(), "17:40".into());
    let lines = [
        "Đã vào game",
        "Nhiệm vụ 9: Thử Sức Tân Binh; bước 4/5: Tiêu diệt Cóc Xanh",
        "Bắt đầu: tự làm nhiệm vụ",
        "Trận 1: thách đấu Cóc Xanh cấp 13 (mob61000)",
        "Trận 1: thắng, 22 lượt, gây 249 sát thương, +142 EXP, +18 xu",
        "Đã diệt 13/15",
        "Trận 2: thách đấu Cóc Xanh cấp 13 (mob61006)",
        "Trận 2: thắng, 19 lượt, gây 249 sát thương, +142 EXP, +18 xu",
        "Đã diệt 14/15",
        "Trận 3: thách đấu Cóc Xanh cấp 13 (mob61000)",
    ];
    for (i, text) in lines.iter().enumerate() {
        main.push(LogLine::new(format!("17:4{i}:0{i}"), text));
    }

    let mut second = Entry::new(1, account("Nick phụ", "kiemkhach"));
    second.state = ConnState::Online;
    second.since = "17:42".into();
    second.snap = Snapshot {
        name: "kiemkhach".into(),
        level: 15,
        hp: 120,
        max_hp: 160,
        exp: Some(5120),
        level_exp: Some([4600, 5900]),
        coin: Some(860),
        stats: vec![26, 10, 10, 24, 0, 0, 0, 0, 0, 0],
        combat: Some([26, 9, 30, 20, 6]),
        stat_points: Some(46),
        skill_points: Some(13),
        map_id: "M1".into(),
        map_name: "Làng Thanh Khê".into(),
        zone: 0,
        x: 932,
        y: 544,
        players: vec![Nearby {
            id: 9,
            name: "CoLau".into(),
            level: 11,
        }],
        quest: Some(quest(
            4,
            "Ruộng Dưa Bị Tàn Phá",
            2,
            6,
            &[
                ("Đạt cấp độ 4", 4, 1, -1),
                ("Nói chuyện với Bà Tư Hạnh", 103, 1, 103),
                ("Tiêu diệt Heo Mọi", 1, 10, -1),
                ("Báo cáo với Bà Tư Hạnh", 103, 1, 103),
            ],
        )),
        ..Snapshot::default()
    };

    let mut third = Entry::new(2, account("", "thanhvan"));
    third.state = ConnState::Error("Server từ chối: tài khoản đang đăng nhập ở nơi khác".into());
    let mut fourth = Entry::new(3, account("Nick farm", "loclau"));
    fourth.state = ConnState::Connecting;
    vec![main, second, third, fourth]
}

pub fn fill(app: &mut App) {
    entries().into_iter().for_each(|e| app.push(e));
}

/// The sample as the UI receives it: the reply of `state` and the log of each account.
pub fn dump(out: &Path) -> Result<(), String> {
    let entries = entries();
    let logs: serde_json::Map<String, serde_json::Value> = entries
        .iter()
        .map(|e| (e.id.to_string(), json!(e.log)))
        .collect();
    let views: Vec<_> = entries.iter().map(view::account).collect();
    let body = json!({
        "rev": 0,
        "accounts": views,
        "accountsError": null,
        "logs": logs,
    });
    std::fs::write(
        out,
        serde_json::to_string_pretty(&body).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

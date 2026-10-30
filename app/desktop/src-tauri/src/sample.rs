// Sample accounts for --sample and --dump-sample: no network, nothing read from disk. The character of the first one is
// the profile s2c/9 gave at the read-only login of 30/10/2026 (docs/app/user-data.md); other players' names are made up.
use crate::app::{App, Entry};
use crate::view::{self, LogLine};
use cllt_core::accounts::Account;
use cllt_core::bot::{BattleView, BossTile, Job, Snapshot, Target};
use cllt_core::net::ConnState;
use cllt_core::world::Nearby;
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
        job: Some(Job {
            target: "Hào Trưởng phía Bắc".into(),
            count: 5,
            max_losses: 1,
            fights: 2,
            wins: 1,
            losses: 1,
            damage: 520,
            exp: 36,
            coin: 12,
            done: None,
        }),
        battle: Some(BattleView {
            mob_id: "mob89100102".into(),
            mob_name: "Hào Trưởng phía Bắc".into(),
            hp: 132.0,
            max_hp: 180.0,
            mob_hp: Some(2210.0),
            mob_max_hp: Some(3000.0),
            turns: 7,
            timed: false,
        }),
        ..Snapshot::default()
    }
}

pub fn entries() -> Vec<Entry> {
    let mut main = Entry::new(0, account("Nick chính", "manina"), false);
    (main.state, main.snap, main.since) = (ConnState::Online, main_character(), "17:40".into());
    let lines = [
        "Đã vào game",
        "Bắt đầu: đánh Hào Trưởng phía Bắc 5 lần",
        "Trận 1/5: thách đấu Hào Trưởng phía Bắc cấp 21 (mob89100102)",
        "Trận 1: thắng, 14 lượt, gây 310 sát thương, +36 EXP, +12 xu",
        "Trận 2/5: thách đấu Hào Trưởng phía Bắc cấp 21 (mob89100102)",
        "Trận 2: thua, 18 lượt, gây 210 sát thương, +0 EXP, +0 xu",
        "Trận 3/5: thách đấu Hào Trưởng phía Bắc cấp 21 (mob89100102)",
    ];
    for (i, text) in lines.iter().enumerate() {
        main.log
            .push_back(LogLine::new(format!("17:4{i}:0{i}"), text));
    }

    let mut second = Entry::new(1, account("Nick phụ", "kiemkhach"), false);
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
        ..Snapshot::default()
    };

    let mut third = Entry::new(2, account("", "thanhvan"), false);
    third.state = ConnState::Error("Server từ chối: tài khoản đang đăng nhập ở nơi khác".into());
    let mut fourth = Entry::new(3, account("Nick farm", "loclau"), false);
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
        "accounts": views,
        "accountsPath": "app/accounts.json",
        "accountsError": null,
        "logs": logs,
    });
    std::fs::write(
        out,
        serde_json::to_string_pretty(&body).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

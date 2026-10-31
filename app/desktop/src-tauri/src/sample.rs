// Sample accounts for --sample and --dump-sample: no network, nothing read from disk. The character of the first one is
// the profile s2c/9 gave at the read-only login of 30/10/2026 (docs/app/user-data.md); other players' names are made up.
use crate::app::{App, Entry};
use crate::view::{self, LogLine};
use cllt_core::accounts::Account;
use cllt_core::bot::{BattleView, BossTile, Job, QuestRun, Snapshot, Target};
use cllt_core::items::{Bag, Currencies, ItemRecord, ItemStat};
use cllt_core::net::ConnState;
use cllt_core::potentials::StatPlan;
use cllt_core::proxy::{Proxy, ProxyKind};
use cllt_core::runner::Turn;
use cllt_core::skills::SkillDef;
use cllt_core::world::{Nearby, Quest, QuestStep};
use serde_json::json;
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Arc;

fn account(label: &str, username: &str) -> Account {
    Account {
        label: label.into(),
        username: username.into(),
        password: String::new(),
        server_id: 24,
        skill: None,
        stats: None,
        proxy: None,
    }
}

/// A made-up proxy (documentation addresses of RFC 5737).
fn proxy(enabled: bool, kind: ProxyKind, host: &str, port: u16, username: &str) -> Option<Proxy> {
    Some(Proxy {
        enabled,
        kind,
        host: host.into(),
        port,
        username: username.into(),
        password: if username.is_empty() { "" } else { "x" }.into(),
    })
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

/// An item record as the server sends it; `element` 0xff for plain items.
fn item(
    slot: u8,
    item_id: i32,
    durability: i32,
    quantity: i32,
    element: u8,
    stats: &[(i32, i32)],
) -> ItemRecord {
    ItemRecord {
        slot,
        item_id,
        uuid: format!("sample-{slot}-{item_id}"),
        field0: 0,
        durability,
        quantity,
        field1: 0,
        element,
        field2: 0,
        field3: 0,
        field4: u8::from(durability >= 0),
        stats: stats
            .iter()
            .map(|&(stat, value)| ItemStat { stat, value })
            .collect(),
    }
}

/// manina's gear after the repair of E2 (12-skills-items.md#đồ-của-manina-e1-e2-popup-ngày-3110): the hat at 55/60, the
/// axe still broken.
fn manina_gear() -> Vec<Option<ItemRecord>> {
    let mut gear = vec![None; 8];
    gear[0] = Some(item(0, 54, 55, 1, 2, &[(6, 4), (9, 58)]));
    gear[2] = Some(item(2, 261, 0, 1, 1, &[(5, 8), (2, 10)]));
    gear
}

/// manina's bag after the repair: the hammer of slot 6 used up.
fn manina_bag() -> Vec<ItemRecord> {
    vec![
        item(0, 0, -1, 4, 0xff, &[]),
        item(1, 412, -1, 1, 0xff, &[]),
        item(2, 147, 60, 1, 1, &[(6, 7), (3, 5)]),
        item(3, 48, 60, 1, 1, &[(6, 5), (9, 66)]),
        item(4, 306, 60, 1, 1, &[(5, 9), (8, 1)]),
        item(5, 415, -1, 1, 0xff, &[]),
        item(7, 1, -1, 1, 0xff, &[]),
    ]
}

/// The skill tree of an element as s2c/30 sends it, from data/skills.json (built in), with the levels of `levels`.
fn skills(element: &str, levels: &[(i32, i32)]) -> (Arc<Vec<SkillDef>>, BTreeMap<i32, i32>) {
    let all: serde_json::Value = serde_json::from_str(include_str!("../../../../data/skills.json"))
        .expect("data/skills.json reads");
    let tree: Vec<SkillDef> =
        serde_json::from_value(all["trees"][element].clone()).expect("a tree of data/skills.json");
    let mut have: BTreeMap<i32, i32> = tree.iter().map(|k| (k.id, 0)).collect();
    have.extend(levels.iter().copied());
    (Arc::new(tree), have)
}

fn main_character() -> Snapshot {
    // Hỏa Cầu Thuật level 1, as at that login.
    let (skills, skill_levels) = skills("1", &[(1000, 1)]);
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
        element: Some(1),
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
            started_at: ago(12 * 60 + 34),
            ended_at: None,
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
        turn: Some(live_turn()),
        gear: manina_gear(),
        bag: Some(Bag {
            kind: 1,
            capacity: 42,
            items: manina_bag(),
        }),
        currencies: Some(Currencies {
            label: "update Xu".into(),
            xu: 500,
            xu_khoa: 7370,
            luong: 0,
        }),
        skills,
        skill_levels,
        ..Snapshot::default()
    }
}

/// The wall clock `secs` ago, in ms since 1970 (Job::started_at).
fn ago(secs: u64) -> u64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    now.saturating_sub(std::time::Duration::from_secs(secs))
        .as_millis() as u64
}

/// Cóc Xanh's latest move in the battle of main_character().
fn live_turn() -> Turn {
    Turn {
        n: 14,
        foe: "Cóc Xanh".into(),
        eaten: vec![(0, 3), (2, 3)],
        damage: 18,
        s1: 8,
        hp: [132, 180],
        mob_hp: Some([96, 249]),
        ..Turn::default()
    }
}

/// The last move of a battle that the player won.
fn final_turn(n: u32, eaten: Vec<(i16, u32)>, damage: i32, s2: i32, hp: i32) -> Turn {
    Turn {
        n,
        mine: true,
        foe: "Cóc Xanh".into(),
        eaten,
        damage,
        s2,
        hp: [hp, 180],
        mob_hp: Some([0, 249]),
        end: true,
        ..Turn::default()
    }
}

pub fn entries() -> Vec<Entry> {
    let mut main = Entry::new(0, account("Nick chính", "manina"));
    main.account.stats = Some(StatPlan::Weights([3, 0, 1, 0]));
    (main.state, main.snap, main.since) = (ConnState::Online, main_character(), "17:40".into());
    let lines = [
        ("Đã vào game", None),
        (
            "Nhiệm vụ 9: Thử Sức Tân Binh; bước 4/5: Tiêu diệt Cóc Xanh",
            None,
        ),
        ("Bắt đầu: tự làm nhiệm vụ", None),
        (
            "Trận 1: thách đấu Cóc Xanh cấp 13 (mob61000)",
            Some(final_turn(43, vec![(0, 4), (5, 1)], 41, 0, 118)),
        ),
        (
            "Trận 1: thắng, 22 lượt, gây 249 sát thương, +142 EXP, +18 xu",
            None,
        ),
        ("Đã diệt 13/15", None),
        (
            "Trận 2: thách đấu Cóc Xanh cấp 13 (mob61006)",
            Some(final_turn(37, vec![(0, 3), (3, 3)], 35, 15, 151)),
        ),
        (
            "Trận 2: thắng, 19 lượt, gây 249 sát thương, +142 EXP, +18 xu",
            None,
        ),
        ("Đã diệt 14/15", None),
        (
            "Trận 3: thách đấu Cóc Xanh cấp 13 (mob61000)",
            Some(live_turn()),
        ),
    ];
    for (i, (text, turn)) in lines.into_iter().enumerate() {
        let line = LogLine::new(format!("17:4{i}:0{i}"), text);
        main.push(LogLine { turn, ..line });
    }

    let mut second = Entry::new(1, account("Nick phụ", "kiemkhach"));
    second.account.stats = Some(StatPlan::Auto);
    second.account.proxy = proxy(true, ProxyKind::Socks5, "203.0.113.7", 1080, "bot2");
    second.state = ConnState::Online;
    second.since = "17:42".into();
    // The Thủy tree: Băng Tiễn Thuật 3, Hàn Lưu Thánh Thủy 1.
    let thuy = skills("4", &[(4000, 3), (4001, 1)]);
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
        element: Some(4),
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
        job: Some(Job {
            target: "Heo Mọi".into(),
            count: 5,
            max_losses: 1,
            fights: 5,
            wins: 5,
            losses: 0,
            damage: 1150,
            exp: 460,
            coin: 60,
            done: Some("Đã đánh đủ 5 trận".into()),
            started_at: ago(40 * 60),
            ended_at: Some(ago(40 * 60 - 462)),
        }),
        skills: thuy.0,
        skill_levels: thuy.1,
        ..Snapshot::default()
    };

    let mut third = Entry::new(2, account("", "thanhvan"));
    third.state = ConnState::Error("Server từ chối: tài khoản đang đăng nhập ở nơi khác".into());
    third.account.proxy = proxy(false, ProxyKind::Http, "198.51.100.20", 8080, "");
    let mut fourth = Entry::new(3, account("Nick farm", "loclau"));
    fourth.account.proxy = proxy(true, ProxyKind::Http, "198.51.100.21", 3128, "farm");
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

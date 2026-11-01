// Sample accounts for --sample and --dump-sample: no network, nothing read from disk. The character of the first one is
// the profile s2c/9 gave at the read-only login of 30/10/2026 (docs/app/user-data.md); other players' names are made up.
use crate::app::{App, Entry};
use crate::store::{BattleFilter, Store};
use crate::view::{self, LogLine};
use cllt_core::accounts::Account;
use cllt_core::bot::{
    BattleRecord, BattleResult, BattleSource, BattleView, Boost, BossTile, CraftRecipes, GiftCode,
    GiftLimits, GiftRun, Job, LogKind, Mailbox, MapChoice, MapMob, MarketState, Picked,
    PickupRecord, PointsRead, QuestRun, SmithRun, Snapshot, Target,
};
use cllt_core::items::{Bag, Currencies, ItemRecord, ItemStat};
use cllt_core::mail::{MailBody, MailHeader};
use cllt_core::market::{MarketListing, MarketPage, MarketStat, MarketTab, MarketTabs};
use cllt_core::net::ConnState;
use cllt_core::npc;
use cllt_core::potentials::StatPlan;
use cllt_core::proxy::{Proxy, ProxyKind};
use cllt_core::runner::Turn;
use cllt_core::skills::SkillDef;
use cllt_core::world::{Nearby, Quest, QuestStep, Zone};
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
        fight: Default::default(),
        fight_targets: Default::default(),
        proxy: None,
        algorithm: Default::default(),
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

/// The mailbox of Ttuananh in G1 (14-npc.md#hòm-thư): the four gift mails, Đền bù taken, Ngày 1 opened and not taken.
fn g1_mailbox() -> Mailbox {
    let header = |id: i64, title: &str, read: bool, taken: bool, mins: u64| MailHeader {
        id,
        kind: 1,
        title: title.into(),
        sender: "Hệ Thống".into(),
        read,
        gift: true,
        taken,
        sent_at: ago(mins * 60) as i64,
        last: 0,
    };
    // The items of a mail: slot 0xff; `field1` 1 unlocked, 0 locked.
    let goods = |list: &[(i32, i32, u8)]| -> Vec<ItemRecord> {
        list.iter()
            .map(|&(item_id, quantity, field1)| ItemRecord {
                slot: 0xff,
                field1,
                ..item(0xff, item_id, -1, quantity, 0xff, &[])
            })
            .collect()
    };
    let body = |id: i64, title: &str, body: &str, taken: bool, items: &[(i32, i32, u8)]| MailBody {
        id,
        title: title.into(),
        body: body.into(),
        sender: "Hệ Thống".into(),
        taken,
        items: goods(items),
    };
    Mailbox {
        mails: Some(vec![
            header(6280, "Quà Đền bù AlphaTest", true, true, 7),
            header(6278, "Quà Alpha Test", false, false, 7),
            header(6273, "Quà Alpha Test Ngày 1", true, false, 8),
            header(5118, "Quà đạt cấp 20", false, false, 16 * 60),
        ]),
        opened: vec![
            body(
                6280,
                "Quà Đền bù AlphaTest",
                "Cảm ơn Sứ Quân đã chịu khó chờ đợi",
                true,
                &[(40, 5_000_000, 1), (42, 10_000, 1), (41, 5_000_000, 1)],
            ),
            body(
                6273,
                "Quà Alpha Test Ngày 1",
                "Chào mừng Sứ Quân",
                false,
                &[
                    (41, 1_000_000, 1),
                    (7, 1, 0),
                    (415, 1, 0),
                    (2, 10, 0),
                    (0, 10, 0),
                    (1, 10, 0),
                    (415, 1, 0),
                    (415, 1, 0),
                ],
            ),
        ],
        unread: Some(true),
        doing: None,
        busy_with: None,
        changing: false,
        last: Some(
            "Xong nhận thư \"Quà Đền bù AlphaTest\": 5.000.000 Xu, 10.000 Lượng, 5.000.000 Xu khóa"
                .into(),
        ),
    }
}

/// Chợ trời as CT1 read it (14-npc.md#ngọc-nga): the nine tabs and part of Vật Phẩm Khác page 4 with a weapon of Vũ
/// Khí, the sellers renamed; one Slime of the character's own on sale. The ends made up around the real ones.
fn ct1_market() -> MarketState {
    let now = ago(0) as i64;
    let listing = |uuid: &str,
                   item_id: i32,
                   seller: &str,
                   quality: i32,
                   price: i32,
                   hours: i64,
                   stats: &[(i32, i32)]| {
        MarketListing {
            item_id,
            item_id2: item_id,
            uuid: uuid.into(),
            seller: seller.into(),
            durability: if quality > 0 { 60 } else { -1 },
            field0: 0,
            quality,
            expires_at: now + hours * 3_600_000 + 17 * 60_000,
            currency: 0,
            price,
            field2: 0,
            quantity: 1,
            field1: 1,
            stats: stats
                .iter()
                .map(|&(stat, value)| MarketStat {
                    stat,
                    value,
                    value2: value,
                })
                .collect(),
        }
    };
    let names = [
        ("Vũ Khí", 169),
        ("Nón Nam", 102),
        ("Nón Nữ", 9),
        ("Giáp Nam", 50),
        ("Giáp Nữ", 9),
        ("Nhẫn", 77),
        ("Vật Phẩm Khác", 139),
        ("Đá Quý", 16),
        ("Vật Dụng", 23),
    ];
    MarketState {
        tabs: Some(MarketTabs {
            tabs: names
                .iter()
                .enumerate()
                .map(|(tab, &(name, listings))| MarketTab {
                    tab: tab as i32,
                    name: name.into(),
                    listings,
                })
                .collect(),
            rules: "Phí đăng bán 1.000 Xu, bán trong 24 giờ, phí chợ 5% khi bán được. Tiền bán được và vật phẩm hết hạn gửi về hộp thư.".into(),
            fee: 1000,
            a: 1000,
            hours: 24,
            b: 1000,
            max_price: 100_000_000,
        }),
        page: Some(MarketPage {
            tabs: 9,
            tab: 6,
            tab_name: "Vật Phẩm Khác".into(),
            pages: 7,
            page: 4,
            listings: vec![
                listing("s-1", 424, "Người bán 1", 0, 88_888, 21, &[(1, 18)]),
                listing("s-2", 423, "Người bán 1", 0, 88_888, 21, &[(4, 13)]),
                listing("s-3", 423, "Người bán 2", 0, 1_000, 18, &[(4, 16)]),
                listing("s-4", 426, "Người bán 2", 0, 100_000, 18, &[(2, 18)]),
                listing("s-5", 425, "Người bán 2", 0, 555_555, 9, &[(3, 15)]),
                listing("s-6", 299, "Người bán 3", 3, 3_333_333, 2, &[(5, 44), (2, 23), (4, 20)]),
            ],
        }),
        mine: Some(MarketPage {
            tabs: 0,
            tab: -1,
            tab_name: String::new(),
            pages: 1,
            page: 1,
            listings: vec![listing("s-mine", 423, "kiemkhach", 0, 1_000_000, 20, &[(4, 16)])],
        }),
        doing: None,
        busy_with: None,
        changing: false,
        last: Some("Xong mua Thú cưng Slime (1.000 Xu)".into()),
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

/// kiemkhach's bag for Tiện ích: stones of several levels, locked or not, a ring at +1 and spare gear at +0.
fn kiemkhach_bag() -> Vec<ItemRecord> {
    let with = |mut i: ItemRecord, plus: i32, locked: bool| {
        (i.field0, i.field1) = (plus, if locked { 0 } else { 1 });
        i
    };
    let mut bag = vec![
        with(item(0, 306, 60, 1, 4, &[(5, 6), (8, 2)]), 1, true),
        with(item(1, 318, 60, 1, 4, &[(5, 7)]), 0, false),
        with(item(2, 48, 60, 1, 4, &[(6, 4), (9, 60)]), 0, true),
        with(item(3, 616, -1, 1, 0xff, &[]), 0, false),
    ];
    for (k, (id, locked)) in [
        (411, false),
        (411, false),
        (412, true),
        (414, true),
        (414, true),
        (414, true),
        (414, true),
        (415, true),
        (415, true),
        (415, true),
        (415, true),
        (415, true),
    ]
    .into_iter()
    .enumerate()
    {
        bag.push(with(item(4 + k as u8, id, -1, 1, 0xff, &[]), 0, locked));
    }
    bag
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

/// 100 zones of 20, with `players` in those listed; load as the game colours it (Z1: 16 is red).
fn zones(players: &[(i32, i32)]) -> Vec<Zone> {
    (0..100)
        .map(|zone| {
            let n = players.iter().find(|p| p.0 == zone).map_or(0, |p| p.1);
            Zone {
                zone,
                load: match n {
                    0..8 => 0,
                    8..15 => 1,
                    _ => 2,
                },
                players: n,
                capacity: 20,
            }
        })
        .collect()
}

fn map(id: &str, name: &str, level: i32, hops: Option<u32>) -> MapChoice {
    // The kinds of mobs of data/maps.json (M25 has none).
    let mobs: &[(&str, i32)] = match id {
        "M1" => &[
            ("Gà Điên", 1),
            ("Heo Mọi", 7),
            ("Kẻ Gây Rối", 7),
            ("Sơn Tặc", 9),
        ],
        "M2" => &[
            ("Kẻ Quấy Phá", 20),
            ("Cua Càng", 15),
            ("Cóc Xanh", 13),
            ("Sói Xám", 11),
        ],
        "M10" => &[
            ("Heo Lửa", 46),
            ("Thỏ Xanh", 53),
            ("Thỏ Hồng", 39),
            ("Huyết Lang", 40),
        ],
        _ => &[],
    };
    MapChoice {
        map_id: id.into(),
        name: name.into(),
        level: Some(level),
        hops,
        // The sample character is level 21: one level less than the world map shows still gets in.
        need: (level - 1 > 21).then_some(level),
        mobs: mobs
            .iter()
            .map(|&(name, level)| MapMob {
                name: name.into(),
                level,
                boss: false,
            })
            .collect(),
    }
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
        // Khu vực of M2 as Z1 saw it, and the maps of data/maps.json from there.
        zones: Some(zones(&[
            (0, 16),
            (1, 3),
            (2, 1),
            (3, 1),
            (5, 4),
            (6, 1),
            (16, 1),
            (23, 1),
        ])),
        maps: vec![
            map("M2", "Trại Vân Sơn", 10, Some(0)),
            map("M1", "Làng Thanh Khê", 0, Some(1)),
            map("M25", "Rìa Hồng Giang", 20, Some(1)),
            map("M10", "Cửu Phong", 30, None),
        ],
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
            picked: vec![Picked::of(41, 431), Picked::of(412, 1)],
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
        // The x2 EXP star of symap's capture (P4), with the time it had left.
        boosts: vec![Boost {
            key: "ef7".into(),
            rate: 200_000,
            until: ago(0) + 13_257_567,
        }],
        // Chế tạo trang bị: the Nhẫn of O1, read ten minutes ago; Điểm năng động as G1 read it.
        recipes: vec![CraftRecipes {
            kind: 3,
            name: "Nhẫn",
            recipes: npc::recipes(
                "Chế tạo Nhẫn cần:\nBậc I: Quặng Bậc 1 x24, Linh Thạch Bậc 1 x24, 2.400 Xu\nBậc II: Quặng Bậc 2 x24, Linh Thạch Bậc 2 x24, 26.500 Xu\nBậc III: Quặng Bậc 3 x24, Linh Thạch Bậc 3 x24, 90.000 Xu",
                &[
                    (0, "Bậc I (Lv 21)".into()),
                    (1, "Bậc II (Lv 51)".into()),
                    (2, "Bậc III (Lv 101)".into()),
                ],
            ),
            read_at: ago(600),
        }],
        points: Some({
            let text = "Điểm năng động tuần này: 12/100\nHạn mức đổi (cấp 31): 3.000 Xu, cần 3.300 Xu khóa\nTuần này còn 500/500 suất. Hết tuần lúc 00:00 thứ Hai.";
            PointsRead {
                points: npc::points_text(text),
                text: text.into(),
                rules: None,
                read_at: ago(1200),
            }
        }),
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
            "Trận 1: thắng, 22 lượt trong 41 giây, gây 249 sát thương, +142 EXP, +18 xu; đã chạy 48 giây",
            None,
        ),
        ("Đã diệt 13/15", None),
        (
            "Trận 2: thách đấu Cóc Xanh cấp 13 (mob61006)",
            Some(final_turn(37, vec![(0, 3), (3, 3)], 35, 15, 151)),
        ),
        (
            "Trận 2: thắng, 19 lượt trong 35 giây, gây 249 sát thương, +142 EXP, +18 xu; đã chạy 1 phút 30 giây",
            None,
        ),
        ("Đã diệt 14/15", None),
        (
            "Trận 3: thách đấu Cóc Xanh cấp 13 (mob61000)",
            Some(live_turn()),
        ),
    ];
    for (i, (text, turn)) in lines.into_iter().enumerate() {
        let kind = match text {
            t if t.starts_with("Trận") => LogKind::Battle,
            "Đã vào game" => LogKind::Connection,
            _ => LogKind::Quest,
        };
        // The won battle with Đã nhặt under it.
        let picked = match text.starts_with("Trận 2: thắng") {
            true => vec![Picked::of(41, 236), Picked::of(413, 1)],
            false => vec![],
        };
        let line = LogLine {
            time: format!("17:4{i}:0{i}"),
            turn,
            picked,
            ..LogLine::new(ago(600 - i as u64 * 60), kind, text)
        };
        main.push(line);
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
            picked: vec![Picked::of(41, 402), Picked::of(3, 1)],
            done: Some("Đã đánh đủ 5 trận".into()),
            started_at: ago(40 * 60),
            ended_at: Some(ago(40 * 60 - 462)),
        }),
        skills: thuy.0,
        skill_levels: thuy.1,
        bag: Some(Bag {
            kind: 1,
            capacity: 42,
            items: kiemkhach_bag(),
        }),
        currencies: Some(Currencies {
            label: "update Xu".into(),
            xu: 13_400,
            xu_khoa: 52_310,
            luong: 120,
        }),
        smith: Some(SmithRun {
            id: 1,
            kind: "merge",
            title: "Gộp đá tới Đá cấp 12".into(),
            doing: String::new(),
            steps: 2,
            ok: 2,
            failed: 0,
            quote: None,
            preview: None,
            item: None,
            worn: false,
            spent_xu: 0,
            spent_xu_khoa: 820,
            spent_luong: 0,
            done: Some("đã gộp hết".into()),
            started_at: ago(5 * 60),
            ended_at: Some(ago(5 * 60 - 3)),
        }),
        // The codes of G1 (14-npc.md#mã-quà-tặng), as Tiheo2 got them.
        gift: Some(GiftRun {
            id: 1,
            codes: [
                (
                    "ALPHATEST1",
                    true,
                    "Nhập mã thành công, phần thưởng đã được gửi vào hộp thư",
                    Some("Quà Alpha Test Ngày 1"),
                ),
                (
                    "DENBU",
                    true,
                    "Nhập mã thành công, phần thưởng đã được gửi vào hộp thư",
                    Some("Quà Đền bù AlphaTest"),
                ),
                ("SAIMA2026", false, "Mã không tồn tại", None),
            ]
            .into_iter()
            .map(|(code, ok, text, mail)| GiftCode {
                code: code.into(),
                ok: Some(ok),
                text: text.into(),
                mail: mail.map(String::from),
            })
            .collect(),
            doing: "đã gửi hết, 2 mã được, 1 mã bị từ chối".into(),
            sending: None,
            done: Some("đã gửi hết, 2 mã được, 1 mã bị từ chối".into()),
            started_at: ago(2 * 60),
            ended_at: Some(ago(2 * 60 - 5)),
        }),
        gift_limits: GiftLimits {
            wrong: 1,
            ..GiftLimits::default()
        },
        mailbox: g1_mailbox(),
        market: ct1_market(),
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
    match store() {
        Ok(s) => app.set_store(Arc::new(s)),
        Err(e) => eprintln!("{e}"),
    }
}

/// A week of battles of the first account (username manina) in an in-memory cllt.db, for Thống kê: a run of ten a day,
/// one every few minutes, at level 19 six days ago up to 21 now. Cóc Xanh of the fight job won but for one loss in
/// eight, Kẻ Quấy Phá (on Hồng Giang) lost one in three, Sói Xám and a boss of the quest run, one battle left with Đầu
/// hàng; Xu khóa after half the battles won, now and then a stone, a ring or an egg.
fn store() -> Result<Store, String> {
    let s = Store::memory().map_err(|e| e.to_string())?;
    let battle = |i: u64, mob: &str, level: i32, boss: bool, source, result| {
        let ended_at = ago((i / 10) * 86_400 + (i % 10) * 200 + 120);
        let won = result == BattleResult::Won;
        let (map_id, map_name) = if mob == "Kẻ Quấy Phá" {
            ("M3", "Hồng Giang")
        } else {
            ("M2", "Trại Vân Sơn")
        };
        BattleRecord {
            character: "manina".into(),
            level: 21 - (i / 25) as i32,
            started_at: ended_at - 25_000 - (i % 7) * 4_000,
            ended_at,
            map_id: map_id.into(),
            map_name: map_name.into(),
            zone: (i % 3) as i32,
            mob_id: format!("mob{}", 61_000 + i % 5),
            mob_name: mob.into(),
            mob_level: level,
            boss,
            source,
            result,
            turns: 9 + (i % 9) as u32,
            damage: if won { 249 } else { 120 + (i % 80) as i32 },
            hp_before: 238,
            hp_after: if won { 238 - (i % 60) as i32 } else { 0 },
            max_hp: 238,
            exp: if won { level * 4 } else { 0 },
            coin: if won { level / 2 } else { 0 },
        }
    };
    use BattleResult::*;
    use BattleSource::*;
    for i in (0..60).rev() {
        let b = match i % 10 {
            0..=4 => battle(
                i,
                "Cóc Xanh",
                13,
                false,
                Fight,
                if i % 8 == 3 { Lost } else { Won },
            ),
            5 | 6 => battle(
                i,
                "Kẻ Quấy Phá",
                20,
                false,
                Fight,
                if i % 3 == 0 { Lost } else { Won },
            ),
            7 | 8 => battle(i, "Sói Xám", 11, false, Quest, Won),
            _ if i == 29 => battle(i, "Sơn Tặc", 9, false, Fight, Left),
            _ => battle(
                i,
                "Hào Trưởng phía Bắc",
                21,
                true,
                Quest,
                if i % 20 == 9 { Won } else { Lost },
            ),
        };
        s.add_battle("manina", &b).map_err(|e| e.to_string())?;
        if b.result != Won {
            continue;
        }
        let drops = [
            (i % 2 == 0, 41, "Xu khóa", 205 + (i % 45) as i64),
            (i % 5 == 1, 412, "Đá cấp 2", 1),
            (i % 11 == 3, 413, "Đá cấp 3", 1),
            (i % 17 == 6, 312, "Nhẫn Hào Kiệt", 1),
            (i % 13 == 7, 3, "Trứng Gà", 1),
        ];
        for (_, item_id, name, quantity) in drops.into_iter().filter(|d| d.0) {
            let p = PickupRecord {
                character: b.character.clone(),
                at: b.ended_at + 40,
                battle_at: b.ended_at,
                map_name: b.map_name.clone(),
                mob_name: b.mob_name.clone(),
                source: b.source,
                item: Picked {
                    name: name.into(),
                    ..Picked::of(item_id, quantity)
                },
            };
            s.add_pickup("manina", &p).map_err(|e| e.to_string())?;
        }
    }
    Ok(s)
}

/// The sample as the UI receives it: the reply of `state` and the log of each account.
pub fn dump(out: &Path) -> Result<(), String> {
    let entries = entries();
    let logs: serde_json::Map<String, serde_json::Value> = entries
        .iter()
        .map(|e| (e.id.to_string(), json!(e.log)))
        .collect();
    let views: Vec<_> = entries.iter().map(view::account).collect();
    // The Thống kê modal of the first account: what battle_stats and battle_history answer with no filter.
    let s = store()?;
    let all = BattleFilter {
        username: "manina",
        since: None,
        source: None,
    };
    let body = json!({
        "rev": 0,
        "accounts": views,
        "accountsError": null,
        "logs": logs,
        "battleStats": s.stats(all).map_err(|e| e.to_string())?,
        "battleHistory": s.battles(all, None, 30).map_err(|e| e.to_string())?,
    });
    std::fs::write(
        out,
        serde_json::to_string_pretty(&body).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

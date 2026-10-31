// What the web UI (ui/) is told about each account: built from its session snapshot, sent as JSON with the "accounts"
// event and the `state` command. Field names are camelCase on the JavaScript side.
use crate::app::Entry;
use cllt_core::bot::{BattleView, BossTile, Job, QuestRun, Target};
use cllt_core::items::{book, Bag, Currencies, ItemRecord};
use cllt_core::net::ConnState;
use cllt_core::potentials::StatPlan;
use cllt_core::proxy::{Proxy, ProxyKind};
use cllt_core::runner::Turn;
use cllt_core::world::{Nearby, Quest};
use serde::Serialize;

/// Colour of a log line in the UI (LogLine.tone).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum LogTone {
    Normal = 0,
    Good = 1,
    Bad = 2,
    Accent = 3,
}
impl LogTone {
    pub fn of(text: &str) -> Self {
        if text.starts_with("Lỗi")
            || text.starts_with("Thua")
            || text.contains(": thua")
            || text.contains("từ chối")
        {
            Self::Bad
        } else if text.contains(": thắng") || text.starts_with("Xong") {
            Self::Good
        } else if ["Bắt đầu", "Kết thúc", "Đã vào game", "Nhiệm vụ "]
            .iter()
            .any(|p| text.starts_with(p))
        {
            Self::Accent
        } else {
            Self::Normal
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LogLine {
    /// Number of the line in the log of its account, from 1 (Entry::push).
    pub seq: u64,
    pub time: String,
    pub text: String,
    pub tone: u8,
    /// On the line a battle opened on: the battle's latest result, sent again with each one (App::on_event).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn: Option<Turn>,
}
impl LogLine {
    pub fn new(time: String, text: &str) -> Self {
        Self {
            seq: 0,
            time,
            text: text.into(),
            tone: LogTone::of(text) as u8,
            turn: None,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountView<'a> {
    pub id: u64,
    /// The label, else the username.
    pub label: &'a str,
    pub username: &'a str,
    /// The label as typed in, empty when none (the edit form starts from it).
    pub own_label: &'a str,
    pub server_id: i32,
    /// 0 offline, 1 connecting, 2 online, 3 fighting, 4 error
    pub status: u8,
    pub status_text: &'static str,
    pub error: &'a str,
    /// Time of day the session entered the game.
    pub since: &'a str,
    /// How potential points are spent on their own (accounts.json).
    pub stat_plan: Option<StatPlan>,
    /// The proxy saved for the account, on or off.
    pub proxy: Option<ProxyView<'a>>,
    /// What the session knows about the character; None until it is in the game.
    pub character: Option<CharacterView<'a>>,
}

/// The account's proxy without its password (the edit form asks for that with `account_secrets`).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyView<'a> {
    pub enabled: bool,
    pub kind: ProxyKind,
    pub host: &'a str,
    pub port: u16,
    pub username: &'a str,
    pub has_password: bool,
    /// "socks5 1.2.3.4:1080", for the card and the sidebar.
    pub label: String,
}
impl<'a> ProxyView<'a> {
    fn of(p: &'a Proxy) -> Self {
        Self {
            enabled: p.enabled,
            kind: p.kind,
            host: &p.host,
            port: p.port,
            username: &p.username,
            has_password: !p.password.is_empty(),
            label: p.label(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterView<'a> {
    pub name: &'a str,
    pub level: i32,
    pub hp: i32,
    pub max_hp: i32,
    pub exp: Option<i32>,
    pub level_exp: Option<[i32; 2]>,
    pub coin: Option<i32>,
    /// Potential stats; [0] is Cường lực (docs/app/user-data.md).
    pub stats: &'a [i32],
    /// Attack, defence, then probably accuracy, dodge, critical.
    pub combat: Option<[i32; 5]>,
    pub stat_points: Option<i32>,
    pub skill_points: Option<i32>,
    /// field01 of s2c/9: 1 Hỏa, 4 Thủy.
    pub element: Option<i32>,
    pub map_id: &'a str,
    pub map_name: &'a str,
    pub zone: i32,
    pub x: i32,
    pub y: i32,
    /// The other players of the zone, highest level first.
    pub players: &'a [Nearby],
    /// False when the last s2c/1263 did not read: `players` is not the whole zone.
    pub players_known: bool,
    pub bosses: &'a [BossTile],
    pub targets: &'a [Target],
    pub job: Option<&'a Job>,
    /// The current main quest (s2c/39) with the step and progress seen since.
    pub quest: Option<&'a Quest>,
    pub quest_run: Option<&'a QuestRun>,
    pub battle: Option<&'a BattleView>,
    /// The 8 gear slots (s2c/9 at login), None where empty; empty until then.
    pub gear: Vec<Option<ItemView>>,
    /// The bag (s2c/42, s2c/1187); None until it came.
    pub bag: Option<BagView>,
    /// Xu, Xu khoá, Lượng (s2c/46). Vàng is `coin`.
    pub currencies: Option<&'a Currencies>,
}

/// One item as the UI draws it: its record in the bag or a gear slot, named from data/items.json (items::book). An
/// item the table lacks keeps its id as name and has no icon.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemView {
    pub slot: u8,
    pub id: i32,
    pub name: String,
    /// data/icons/i<icon>.webp
    pub icon: Option<i32>,
    /// Type of the table: 0 hat, 1 armour, 2 weapon, 3 ring … (13-drops-items.md#bảng-vật-phẩm), and its name.
    pub kind: Option<u8>,
    pub kind_name: Option<&'static str>,
    pub desc: &'static str,
    /// 1 Hỏa, 2 Lôi, 4 Thủy, with its name; None for plain items.
    pub element: Option<u8>,
    pub element_name: Option<&'static str>,
    pub quantity: i32,
    /// Stacks in a slot (Hoàn Linh Dược ×4): the game draws the quantity of those, even 1.
    pub stacks: bool,
    /// Now and most, for items that wear out.
    pub durability: Option<[i32; 2]>,
    /// Level to wear it, for gear.
    pub level: Option<u8>,
    /// "+4 phòng thủ", "+58 sinh lực"
    pub stats: Vec<String>,
}
impl ItemView {
    pub fn of(i: &ItemRecord) -> Self {
        let b = book();
        let def = b.get(i.item_id);
        let element = (i.element != 0xff).then_some(i.element);
        ItemView {
            slot: i.slot,
            id: i.item_id,
            name: def.map_or_else(|| format!("#{}", i.item_id), |d| d.name.clone()),
            icon: def.map(|d| d.icon).filter(|&n| n >= 0),
            kind: def.map(|d| d.kind),
            kind_name: def.and_then(|d| b.type_name(d.kind)),
            desc: def.map_or("", |d| d.desc.as_str()),
            element,
            element_name: element.and_then(|e| b.element_name(e)),
            quantity: i.quantity,
            stacks: def.is_some_and(|d| d.stack > 1),
            durability: (i.durability >= 0).then(|| {
                [
                    i.durability,
                    def.map_or(0, |d| d.durability).max(i.durability),
                ]
            }),
            level: def.filter(|d| d.kind <= 4).map(|d| d.level),
            stats: i.stats.iter().map(|s| b.stat(s)).collect(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct BagView {
    pub capacity: i32,
    pub items: Vec<ItemView>,
}
impl BagView {
    fn of(b: &Bag) -> Self {
        Self {
            capacity: b.capacity,
            items: b.items.iter().map(ItemView::of).collect(),
        }
    }
}

fn status(e: &Entry) -> (u8, &'static str) {
    let running = e.snap.job.as_ref().is_some_and(|j| j.done.is_none());
    let questing = e.snap.quest_run.as_ref().is_some_and(|r| r.done.is_none());
    match &e.state {
        ConnState::Offline => (0, "Ngoại tuyến"),
        ConnState::Connecting => (1, "Đang kết nối"),
        ConnState::Online if questing => (3, "Làm nhiệm vụ"),
        ConnState::Online if e.snap.battle.is_some() || running => (3, "Đang đánh"),
        ConnState::Online => (2, "Trực tuyến"),
        ConnState::Error(_) => (4, "Lỗi"),
    }
}

pub fn account(e: &Entry) -> AccountView<'_> {
    let s = &e.snap;
    let (status, status_text) = status(e);
    AccountView {
        id: e.id,
        label: match e.account.label.is_empty() {
            true => &e.account.username,
            false => &e.account.label,
        },
        username: &e.account.username,
        own_label: &e.account.label,
        server_id: e.account.server_id,
        status,
        status_text,
        error: match &e.state {
            ConnState::Error(m) => m,
            _ => "",
        },
        since: &e.since,
        stat_plan: e.account.stats,
        proxy: e.account.proxy.as_ref().map(ProxyView::of),
        character: (e.state == ConnState::Online && !s.name.is_empty()).then(|| CharacterView {
            name: &s.name,
            level: s.level,
            hp: s.hp,
            max_hp: s.max_hp,
            exp: s.exp,
            level_exp: s.level_exp,
            coin: s.coin,
            stats: &s.stats,
            combat: s.combat,
            stat_points: s.stat_points,
            skill_points: s.skill_points,
            element: s.element,
            map_id: &s.map_id,
            map_name: &s.map_name,
            zone: s.zone,
            x: s.x,
            y: s.y,
            players: &s.players,
            players_known: !s.players_unread,
            bosses: &s.bosses,
            targets: &s.targets,
            job: s.job.as_ref(),
            quest: s.quest.as_ref(),
            quest_run: s.quest_run.as_ref(),
            battle: s.battle.as_ref(),
            gear: s
                .gear
                .iter()
                .map(|g| g.as_ref().map(ItemView::of))
                .collect(),
            bag: s.bag.as_ref().map(BagView::of),
            currencies: s.currencies.as_ref(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::{ItemView, LogTone};
    use cllt_core::items::{ItemRecord, ItemStat};

    fn record(
        item_id: i32,
        durability: i32,
        quantity: i32,
        element: u8,
        stats: &[(i32, i32)],
    ) -> ItemRecord {
        ItemRecord {
            slot: 0,
            item_id,
            uuid: String::new(),
            field0: 0,
            durability,
            quantity,
            field1: 0,
            element,
            field2: 0,
            field3: 0,
            field4: 1,
            stats: stats
                .iter()
                .map(|&(stat, value)| ItemStat { stat, value })
                .collect(),
        }
    }

    #[test]
    fn an_item_is_named_from_the_table_with_its_icon_element_durability_and_stats() {
        let hat = ItemView::of(&record(54, 55, 1, 2, &[(6, 4), (9, 58)]));
        assert_eq!(
            (
                hat.name.as_str(),
                hat.icon,
                hat.kind_name,
                hat.element_name,
                hat.durability,
                hat.level,
                hat.stacks
            ),
            (
                "Nón Âu Lạc",
                Some(48),
                Some("Nón"),
                Some("Lôi"),
                Some([55, 60]),
                Some(1),
                false
            )
        );
        assert_eq!(hat.stats, ["+4 phòng thủ", "+58 sinh lực"]);
        let potion = ItemView::of(&record(0, -1, 4, 0xff, &[]));
        assert_eq!(
            (
                potion.name.as_str(),
                potion.element,
                potion.durability,
                potion.level,
                potion.stacks,
                potion.quantity
            ),
            ("Hoàn Linh Dược", None, None, None, true, 4)
        );
        assert_eq!(potion.desc, "Bơm 30% sinh lực");
        let unknown = ItemView::of(&record(9999, -1, 1, 0xff, &[(6, 1)]));
        assert_eq!(
            (unknown.name.as_str(), unknown.icon, unknown.kind),
            ("#9999", None, None)
        );
    }

    #[test]
    fn log_tone_follows_the_bot_lines() {
        assert_eq!(
            LogTone::of("Trận 3: thắng, 21 lượt, gây 234 sát thương, +92 EXP, +12 xu"),
            LogTone::Good
        );
        assert_eq!(
            LogTone::of("Trận 2: thua, 18 lượt, gây 210 sát thương, +0 EXP, +0 xu"),
            LogTone::Bad
        );
        assert_eq!(
            LogTone::of("Lỗi: Server từ chối: tài khoản đang đăng nhập"),
            LogTone::Bad
        );
        assert_eq!(LogTone::of("Bắt đầu: đánh Heo Mọi 1 lần"), LogTone::Accent);
        assert_eq!(
            LogTone::of("Xong nhiệm vụ Thử Sức Tân Binh: 1190 kinh nghiệm"),
            LogTone::Good
        );
        assert_eq!(
            LogTone::of("Nhiệm vụ 9: Thử Sức Tân Binh; bước 4/5: Tiêu diệt Cóc Xanh"),
            LogTone::Accent
        );
        assert_eq!(
            LogTone::of("Trận 1/1: thách đấu Heo Mọi cấp 7 (mob22600)"),
            LogTone::Normal
        );
    }
}

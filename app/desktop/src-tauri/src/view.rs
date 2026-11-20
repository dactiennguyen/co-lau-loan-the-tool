// What the web UI (ui/) is told about each account: built from its session snapshot, sent as JSON with the "accounts"
// event and the `state` command. Field names are camelCase on the JavaScript side.
use crate::app::Entry;
use crate::store::StoredLog;
use cllt_core::bot::{
    BattleView, Boost, BossTile, CraftRecipes, DailyState, EggRun, FightSettings, GiftLimits,
    GiftRun, Job, LogKind, Mailbox, MapChoice, MarketState, Picked, PointsRead, QuestRun, SmithRun,
    Target, WelfareState,
};
use cllt_core::items::{book, Bag, Currencies, ItemRecord, ItemStat};
use cllt_core::mail::{self, MailBody, MailHeader, Money};
use cllt_core::market::{self, MarketListing, MarketPage, MarketTabs};
use cllt_core::net::ConnState;
use cllt_core::npc::{self, Quote};
use cllt_core::potentials::StatPlan;
use cllt_core::proxy::{Proxy, ProxyKind};
use cllt_core::runner::Turn;
use cllt_core::skills::{skill_tree, Prerequisite, SkillBox, SkillLevel};
use cllt_core::world::{Nearby, Quest, ShopList, Zone};
use serde::Serialize;
use std::collections::BTreeMap;

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
        // A fault Log lỗi keeps (a packet that does not read, a server or NPC silent) is red too.
        if text.starts_with("Lỗi")
            || cllt_core::net::is_fault(text)
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
    /// Row of the line in cllt.db, the cursor for older lines; None without the database.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
    /// ms since 1970; `time` is what the card shows of it.
    pub at: u64,
    pub time: String,
    pub kind: LogKind,
    pub text: String,
    pub tone: u8,
    /// On the line a battle opened on: the battle's latest result, sent again with each one (App::on_event).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn: Option<Turn>,
    /// On the line of a won battle ("Trận 3: thắng …"): what Tự nhặt đồ picked up after it, sent again with each item.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub picked: Vec<Picked>,
}
impl LogLine {
    pub fn new(at: u64, kind: LogKind, text: &str) -> Self {
        Self {
            seq: 0,
            id: None,
            at,
            time: time_of(at),
            kind,
            text: text.into(),
            tone: LogTone::of(text) as u8,
            turn: None,
            picked: vec![],
        }
    }
    /// A line of an earlier session, from cllt.db.
    pub fn stored(l: &StoredLog) -> Self {
        Self {
            id: Some(l.id),
            tone: l.tone,
            picked: l.picked.clone(),
            ..Self::new(l.at, l.kind, &l.text)
        }
    }
}

/// "12:30:05" for today, "30/10 12:30" for another day, in local time.
pub fn time_of(at: u64) -> String {
    use chrono::{Local, TimeZone};
    let Some(t) = Local.timestamp_millis_opt(at as i64).single() else {
        return String::new();
    };
    match t.date_naive() == Local::now().date_naive() {
        true => t.format("%H:%M:%S").to_string(),
        false => t.format("%d/%m %H:%M").to_string(),
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
    /// Cài đặt đánh (accounts.json).
    pub fight_settings: FightSettings,
    /// The target last chosen in the Đánh quái tab on each map (accounts.json).
    pub fight_targets: &'a BTreeMap<String, String>,
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
    /// The IP it went out with in this session (Event::ProxyIp), for the badge of the character card.
    pub ip: Option<&'a str>,
}
impl<'a> ProxyView<'a> {
    fn of(p: &'a Proxy, ip: Option<&'a str>) -> Self {
        Self {
            ip,
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
    /// flag2 of s2c/9: 0 nam, 1 nữ; gear of the other one cannot be worn (ItemView::gender).
    pub gender: Option<u8>,
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
    /// Nghỉ giải lao of Cài đặt đánh: when the break of the fight job or quest run on ends (ms since 1970).
    pub break_until: Option<u64>,
    pub battle: Option<&'a BattleView>,
    /// Timed effects at login, such as x2 EXP, each with its end.
    pub boosts: &'a [Boost],
    /// The gear slots (s2c/9 at login: 8, or 10 with Giày and Dây chuyền since the game 1.1.0), None where empty; empty
    /// until then.
    pub gear: Vec<Option<ItemView>>,
    /// The bag (s2c/42, s2c/1187); None until it came.
    pub bag: Option<BagView>,
    /// Xu, Xu khoá, Lượng (s2c/46). Vàng is `coin`.
    pub currencies: Option<&'a Currencies>,
    /// The Kỹ năng tab: the tree of s2c/30 with the character's levels; empty until s2c/30 came.
    pub skills: Vec<SkillView<'a>>,
    /// The zones of the map and their players (s2c/1172) as last asked; None until asked.
    pub zones: Option<&'a [Zone]>,
    /// A zone change or a trip to another map under way ("Sang khu 4").
    pub moving: Option<&'a str>,
    /// Where the bot walks back to once the Cửa hàng is closed ("Hồng Giang khu 3").
    pub back_to: Option<&'a str>,
    /// The maps of the atlas, nearest first, with the portals to take.
    pub maps: &'a [MapChoice],
    /// The shop s2c/1190 last listed (Tiện ích, Mua búa); None until opened, and again once off M1.
    pub shop: Option<ShopView<'a>>,
    /// The work of Pháp sư or Hương Lão under way or last done (Tiện ích).
    pub smith: Option<SmithView<'a>>,
    /// Chế tạo trang bị: the recipes of each item kind read so far.
    pub recipes: &'a [CraftRecipes],
    /// Điểm năng động of Hương Lão as last read.
    pub points: Option<&'a PointsRead>,
    /// Nhiệm vụ hàng ngày: the quest held and how many were taken today.
    pub daily: &'a DailyState,
    /// Phúc lợi: Điểm danh, Quà online, Quà thăng cấp, the run under way and the last one's words.
    pub welfare: &'a WelfareState,
    /// Mã quà tặng under way or last done (Tiện ích).
    pub gift: Option<&'a GiftRun>,
    /// Đập hết under way (Túi đồ).
    pub eggs: Option<&'a EggRun>,
    /// Codes refused in a row, how many the bot allows, and the server's lock on codes.
    pub gift_limits: &'a GiftLimits,
    /// Hòm thư (Tiện ích): the list, the mails opened, the task under way.
    pub mailbox: MailboxView<'a>,
    /// Chợ trời (Tiện ích): the tabs, the page read last, Đang bán, the task under way.
    pub market: MarketView<'a>,
}

/// Chợ trời for its tab: s2c/116 (tabs, fee, hours, highest price), the page of a tab last read, Đang bán, the task
/// under way (what, about which uuid, whether it keeps the character busy) and the line the last one ended with.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketView<'a> {
    pub tabs: Option<&'a MarketTabs>,
    pub page: Option<MarketPageView<'a>>,
    pub mine: Option<MarketPageView<'a>>,
    pub doing: Option<&'a str>,
    pub busy_with: Option<&'a str>,
    pub changing: bool,
    pub last: Option<&'a str>,
}
impl<'a> MarketView<'a> {
    pub fn of(m: &'a MarketState) -> Self {
        Self {
            tabs: m.tabs.as_ref(),
            page: m.page.as_ref().map(MarketPageView::of),
            mine: m.mine.as_ref().map(MarketPageView::of),
            doing: m.doing.as_deref(),
            busy_with: m.busy_with.as_deref(),
            changing: m.changing,
            last: m.last.as_deref(),
        }
    }
}

/// A page of s2c/1192: tab -1 for Đang bán.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketPageView<'a> {
    pub tab: i32,
    pub tab_name: &'a str,
    pub pages: i32,
    pub page: i32,
    pub listings: Vec<ListingView<'a>>,
}
impl<'a> MarketPageView<'a> {
    fn of(p: &'a MarketPage) -> Self {
        Self {
            tab: p.tab,
            tab_name: &p.tab_name,
            pages: p.pages,
            page: p.page,
            listings: p.listings.iter().map(ListingView::of).collect(),
        }
    }
}

/// One listing: its uuid on the market, the item drawn as the bag draws it (name, icon, stats, level, durability), the
/// quality (1 Hiếm, 3 Sử Thi), who sells it, the price in Xu (`currency` 0) and when it ends (ms since 1970).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListingView<'a> {
    pub uuid: &'a str,
    pub item: ItemView,
    pub quality: i32,
    pub quality_name: Option<&'static str>,
    pub seller: &'a str,
    pub price: i32,
    pub currency: u8,
    pub expires_at: i64,
}
impl<'a> ListingView<'a> {
    fn of(l: &'a MarketListing) -> Self {
        let record = ItemRecord {
            slot: 0,
            item_id: l.item_id,
            uuid: l.uuid.clone(),
            field0: l.field0,
            durability: l.durability,
            quantity: l.quantity,
            field1: l.field1,
            element: 0xff,
            field2: l.field2,
            field3: 0,
            field4: 0,
            field5: None,
            stats: l
                .stats
                .iter()
                .map(|s| ItemStat {
                    stat: s.stat,
                    value: s.value,
                })
                .collect(),
        };
        Self {
            uuid: &l.uuid,
            item: ItemView::of(&record),
            quality: l.quality,
            quality_name: market::quality_name(l.quality),
            seller: &l.seller,
            price: l.price,
            currency: l.currency,
            expires_at: l.expires_at,
        }
    }
}

/// Mailbox for the Hòm thư tab: the list as last listed (null until listed), the mails opened with their items drawn as
/// the bag draws them, whether a mail is not read yet (s2c/1220), the task under way and the line the last one ended with.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailboxView<'a> {
    pub mails: Option<&'a [MailHeader]>,
    pub opened: Vec<MailBodyView<'a>>,
    pub unread: Option<bool>,
    pub doing: Option<&'a str>,
    /// The mail the task under way is about.
    pub busy_with: Option<i64>,
    /// The task under way is Nhận, Nhận hết or Xóa: the character counts as busy.
    pub changing: bool,
    pub last: Option<&'a str>,
}
impl<'a> MailboxView<'a> {
    pub fn of(m: &'a Mailbox, bag: Option<&Bag>) -> Self {
        Self {
            mails: m.mails.as_deref(),
            opened: m.opened.iter().map(|o| MailBodyView::of(o, bag)).collect(),
            unread: m.unread,
            doing: m.doing.as_deref(),
            busy_with: m.busy_with,
            changing: m.changing,
            last: m.last.as_deref(),
        }
    }
}

/// A mail opened (s2c/1216): its words, the money in it (items #40–#42), its other items, and the bag slots those need
/// now (mail::slots_for, as Bot::mail checks before Nhận).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailBodyView<'a> {
    pub id: i64,
    pub title: &'a str,
    pub body: &'a str,
    pub sender: &'a str,
    pub taken: bool,
    pub xu: i64,
    pub xu_khoa: i64,
    pub luong: i64,
    pub items: Vec<ItemView>,
    pub slots: u32,
}
impl<'a> MailBodyView<'a> {
    fn of(m: &'a MailBody, bag: Option<&Bag>) -> Self {
        let sum = |money: Money| {
            m.items
                .iter()
                .filter(|i| mail::money_item(i.item_id) == Some(money))
                .map(|i| i.quantity as i64)
                .sum()
        };
        Self {
            id: m.id,
            title: &m.title,
            body: &m.body,
            sender: &m.sender,
            taken: m.taken,
            xu: sum(Money::Xu),
            xu_khoa: sum(Money::XuKhoa),
            luong: sum(Money::Luong),
            items: m
                .items
                .iter()
                .filter(|i| mail::money_item(i.item_id).is_none())
                .map(ItemView::of)
                .collect(),
            slots: mail::slots_for(&m.items, bag.map_or(&[], |b| &b.items)),
        }
    }
}

/// SmithRun with its items named and drawn as the bag draws them.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmithView<'a> {
    pub id: u32,
    pub kind: &'static str,
    pub title: &'a str,
    pub doing: &'a str,
    pub steps: u32,
    pub ok: u32,
    pub failed: u32,
    pub quote: Option<&'a Quote>,
    pub preview: Option<ItemView>,
    pub item: Option<ItemView>,
    pub worn: bool,
    pub spent_xu: i64,
    pub spent_xu_khoa: i64,
    pub spent_luong: i64,
    pub done: Option<&'a str>,
    pub started_at: u64,
    pub ended_at: Option<u64>,
}
impl<'a> SmithView<'a> {
    pub fn of(r: &'a SmithRun) -> Self {
        Self {
            id: r.id,
            kind: r.kind,
            title: &r.title,
            doing: &r.doing,
            steps: r.steps,
            ok: r.ok,
            failed: r.failed,
            quote: r.quote.as_ref(),
            preview: r.preview.as_ref().map(ItemView::of),
            item: r.item.as_ref().map(ItemView::of),
            worn: r.worn,
            spent_xu: r.spent_xu,
            spent_xu_khoa: r.spent_xu_khoa,
            spent_luong: r.spent_luong,
            done: r.done.as_deref(),
            started_at: r.started_at,
            ended_at: r.ended_at,
        }
    }
}

/// A shop of Tiện ích: each line named from data/items.json, with its price and money.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopView<'a> {
    /// Which of npc::SHOPS (the first byte of s2c/1190).
    pub kind: u8,
    pub title: &'a str,
    /// Who sells it: Lái Buôn, Bà Tư Hạnh.
    pub npc: &'static str,
    pub items: Vec<ShopLineView>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopLineView {
    /// What c2s/1190 buys.
    pub shop_id: i32,
    pub item_id: i32,
    pub name: String,
    pub icon: Option<i32>,
    pub desc: &'static str,
    /// 0 Xu, 1 Xu khóa, 2 Lượng.
    pub currency: u8,
    pub price: i32,
    /// Type of the item (0 hat, 1 armour, 2 weapon, 3 ring…) and the level to wear it, for gear.
    pub kind: Option<u8>,
    pub level: Option<u8>,
    /// The main stat gear rolls when bought: "sức tấn công 5–9".
    pub ranges: Vec<String>,
    /// Bought for Xu khóa, the item is trade-locked (15-shops.md#khoá).
    pub locks: bool,
}
impl<'a> ShopView<'a> {
    pub fn of(s: &'a ShopList) -> Self {
        let b = book();
        ShopView {
            kind: s.kind,
            title: &s.title,
            npc: npc::shop_of(s.kind).map_or("Lái Buôn", |d| npc::npc_name(d.npc_id)),
            items: s
                .items
                .iter()
                .map(|l| {
                    let def = b.get(l.item_id);
                    ShopLineView {
                        shop_id: l.shop_id,
                        item_id: l.item_id,
                        name: def.map_or_else(|| format!("#{}", l.item_id), |d| d.name.clone()),
                        icon: def.map(|d| d.icon).filter(|&n| n >= 0),
                        desc: def.map_or("", |d| d.desc.as_str()),
                        currency: l.currency,
                        price: l.price,
                        kind: def.map(|d| d.kind),
                        level: def.filter(|d| d.kind <= 9).map(|d| d.level),
                        ranges: l
                            .ranges
                            .iter()
                            .map(|r| {
                                let name = b.stat_name(r.stat);
                                format!("{name} {}–{}", r.min, r.max)
                            })
                            .collect(),
                        locks: l.flag == 0,
                    }
                })
                .collect(),
        }
    }
}

/// One skill of the Kỹ năng tab (skills::skill_tree): its box on the tree background, the level the character has, the
/// level Nâng cấp would give and why it cannot now.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillView<'a> {
    pub id: i32,
    pub name: &'a str,
    /// Top left corner on the background (288 × 347, boxes of 60); None for an index it has no box for.
    pub place: Option<SkillBox>,
    pub level: i32,
    pub max_level: usize,
    pub prerequisite: Option<Prerequisite>,
    pub current: Option<&'a SkillLevel>,
    /// None at the top level.
    pub next: Option<&'a SkillLevel>,
    /// Empty when Nâng cấp can take the next level now.
    pub blockers: Vec<String>,
    /// The game's detail panel, line by line.
    pub panel: Vec<String>,
}

/// One item as the UI draws it: its record in the bag or a gear slot, named from data/items.json (items::book). An
/// item the table lacks keeps its id as name and has no icon.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemView {
    pub slot: u8,
    pub id: i32,
    /// The server's id of this one item: the same in the bag and in a gear slot (Nâng cấp of a worn item follows it).
    pub uuid: String,
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
    /// Who can wear it: 0 nam, 1 nữ (items::GENDER_*); None when both can, as weapons, rings and every item that is no
    /// gear.
    pub gender: Option<u8>,
    /// "+4 phòng thủ", "+58 sinh lực"
    pub stats: Vec<String>,
    /// Cường hoá: +0 … +16 (field0 of the record).
    pub plus: i32,
    /// Trade-locked (field1 0: bought for Xu khóa, worn, upgraded; 15-shops.md#khoá).
    pub locked: bool,
}
impl ItemView {
    pub fn of(i: &ItemRecord) -> Self {
        let b = book();
        let def = b.get(i.item_id);
        let element = (i.element != 0xff).then_some(i.element);
        ItemView {
            slot: i.slot,
            id: i.item_id,
            uuid: i.uuid.clone(),
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
            level: def.filter(|d| d.kind <= 9).map(|d| d.level),
            gender: def
                .map(|d| d.gender)
                .filter(|&g| g != cllt_core::items::GENDER_BOTH),
            stats: i.stats.iter().map(|s| b.stat(s)).collect(),
            plus: i.field0,
            locked: i.field1 == 0,
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
        fight_settings: e.account.fight,
        fight_targets: &e.account.fight_targets,
        proxy: e
            .account
            .proxy
            .as_ref()
            .map(|p| ProxyView::of(p, e.proxy_ip.as_deref())),
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
            gender: s.gender,
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
            break_until: s.break_until,
            battle: s.battle.as_ref(),
            boosts: &s.boosts,
            gear: s
                .gear
                .iter()
                .map(|g| g.as_ref().map(ItemView::of))
                .collect(),
            bag: s.bag.as_ref().map(BagView::of),
            currencies: s.currencies.as_ref(),
            skills: skill_tree(
                &s.skills,
                &s.skill_levels,
                s.level,
                s.skill_points.unwrap_or(0),
            )
            .into_iter()
            .map(|n| SkillView {
                id: n.skill.id,
                name: &n.skill.name,
                place: n.place,
                level: n.level,
                max_level: n.max_level(),
                panel: n.panel(),
                prerequisite: n.prerequisite,
                current: n.current,
                next: n.next,
                blockers: n.blockers,
            })
            .collect(),
            zones: s.zones.as_deref(),
            shop: s.shop.as_ref().map(ShopView::of),
            smith: s.smith.as_ref().map(SmithView::of),
            recipes: &s.recipes,
            points: s.points.as_ref(),
            daily: &s.daily,
            welfare: &s.welfare,
            gift: s.gift.as_ref(),
            eggs: s.eggs.as_ref(),
            gift_limits: &s.gift_limits,
            mailbox: MailboxView::of(&s.mailbox, s.bag.as_ref()),
            market: MarketView::of(&s.market),
            moving: s.moving.as_deref(),
            back_to: s.back_to.as_deref(),
            maps: &s.maps,
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
            field5: None,
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
        assert_eq!(
            LogTone::of("Bàn cờ lệch với server ở lượt 7, sau kỹ năng 1001 của mình"),
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

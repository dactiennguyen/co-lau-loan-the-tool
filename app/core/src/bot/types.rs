//! What the bot shows and sends out: its outputs (Out, LogKind, BattleRecord), its options and Cài đặt đánh, and the
//! Snapshot of the account for the UI.
use super::*;

#[derive(Debug, Clone, PartialEq)]
pub enum Out {
    Send(i32, Vec<u8>),
    Log(LogKind, String),
    /// A battle that ended, for the history of the account (BattleRecord).
    Battle(Box<BattleRecord>),
    /// An item Tự nhặt đồ picked up, for the history of the account (PickupRecord).
    Pickup(Box<PickupRecord>),
    /// Lưu dữ liệu trận: the packets of a battle with what both sides were (battle_record.rs), for cllt.db.
    BattleData(Box<BattleData>),
}

/// What a log line is about, for the filters of the Nhật ký card. docs/integration/rust/features.md#nhật-ký-và-thống-kê
/// lists every kind with examples: a new kind, or a new kind of line, goes in that table too.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LogKind {
    /// Login, logout, proxy, the connection lost or refused.
    Connection,
    /// Challenges, battle results, surrender, the fight job.
    Battle,
    /// Quests and their steps, NPC lines, the quest run.
    Quest,
    /// Portals, zones, maps.
    Travel,
    /// Level, potential points, skills.
    Character,
    /// Gear, bag, items used, money.
    Item,
    /// What the server says (s2c/1256; s2c/0 and s2c/5 while playing).
    Server,
}
impl LogKind {
    pub const ALL: [LogKind; 7] = [
        LogKind::Connection,
        LogKind::Battle,
        LogKind::Quest,
        LogKind::Travel,
        LogKind::Character,
        LogKind::Item,
        LogKind::Server,
    ];
    /// The key in cllt.db and in the UI.
    pub fn key(self) -> &'static str {
        match self {
            LogKind::Connection => "connection",
            LogKind::Battle => "battle",
            LogKind::Quest => "quest",
            LogKind::Travel => "travel",
            LogKind::Character => "character",
            LogKind::Item => "item",
            LogKind::Server => "server",
        }
    }
    pub fn from_key(key: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|k| k.key() == key)
    }
    /// The name the Nhật ký filters show.
    pub fn label(self) -> &'static str {
        match self {
            LogKind::Connection => "Kết nối",
            LogKind::Battle => "Trận",
            LogKind::Quest => "Nhiệm vụ",
            LogKind::Travel => "Di chuyển",
            LogKind::Character => "Nhân vật",
            LogKind::Item => "Vật phẩm",
            LogKind::Server => "Server",
        }
    }
}

/// What the battle was played for: the fight job, the quest run, or neither (a challenge of a job since replaced or
/// stopped, played out because a battle cannot be left).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BattleSource {
    Fight,
    Quest,
    Other,
}
impl BattleSource {
    pub fn key(self) -> &'static str {
        match self {
            BattleSource::Fight => "fight",
            BattleSource::Quest => "quest",
            BattleSource::Other => "other",
        }
    }
    pub fn from_key(key: &str) -> Option<Self> {
        [Self::Fight, Self::Quest, Self::Other]
            .into_iter()
            .find(|s| s.key() == key)
    }
}

/// How a battle ended: won, lost, or left (Đầu hàng, s2c/1214 or s2c/36 after c2s/40).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BattleResult {
    Won,
    Lost,
    Left,
}
impl BattleResult {
    pub fn key(self) -> &'static str {
        match self {
            BattleResult::Won => "won",
            BattleResult::Lost => "lost",
            BattleResult::Left => "left",
        }
    }
    pub fn from_key(key: &str) -> Option<Self> {
        [Self::Won, Self::Lost, Self::Left]
            .into_iter()
            .find(|r| r.key() == key)
    }
}

/// One battle for the history of the account (the Thống kê modal): who, where, against what, and what it brought.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleRecord {
    pub character: String,
    /// The character's level when the battle ended.
    pub level: i32,
    /// When s2c/22 opened it and when it ended, in ms since 1970.
    pub started_at: u64,
    pub ended_at: u64,
    pub map_id: String,
    pub map_name: String,
    pub zone: i32,
    pub mob_id: String,
    pub mob_name: String,
    /// 0 when the mob was not in the zone list (a boss that changed tiles).
    pub mob_level: i32,
    pub boss: bool,
    pub source: BattleSource,
    pub result: BattleResult,
    /// The player's own moves.
    pub turns: u32,
    /// Damage dealt to the mob.
    pub damage: i32,
    /// HP when it opened and when it ended, of `max_hp`.
    pub hp_before: i32,
    pub hp_after: i32,
    pub max_hp: i32,
    pub exp: i32,
    pub coin: i32,
}

/// An item Tự nhặt đồ picked up (the server said "Bạn vừa nhận được …"), for the Thống kê modal: what, how many, and the
/// battle it fell from.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickupRecord {
    pub character: String,
    /// When the server said it, in ms since 1970.
    pub at: u64,
    /// `ended_at` of the battle (BattleRecord) it fell from.
    pub battle_at: u64,
    pub map_name: String,
    pub mob_name: String,
    pub source: BattleSource,
    #[serde(flatten)]
    pub item: Picked,
}

/// Some of an item picked up: its id in the item table (items.rs), its name there, and how many (the Xu khóa of a pile;
/// 1 for gear); for the UI, its icon there (data/icons/i<icon>.webp).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Picked {
    pub item_id: i32,
    pub name: String,
    pub quantity: i64,
    pub icon: Option<i32>,
}
impl Picked {
    /// `quantity` of the item `item_id`, named and drawn as the item table has it ("#9999" for one it lacks).
    pub fn of(item_id: i32, quantity: i64) -> Self {
        let def = crate::items::book().get(item_id);
        Self {
            item_id,
            name: def.map_or_else(|| format!("#{item_id}"), |d| d.name.clone()),
            quantity,
            icon: def.map(|d| d.icon).filter(|&n| n >= 0),
        }
    }

    /// "Xu khóa ×236", "Đá cấp 2".
    pub fn label(&self) -> String {
        match self.quantity {
            q if q > 1 => format!("{} ×{q}", self.name),
            _ => self.name.clone(),
        }
    }
}

/// Adds `item` to some items picked up (of a run, of a battle's log line), to its own entry when they have one.
pub fn add_picked(list: &mut Vec<Picked>, item: &Picked) {
    match list.iter_mut().find(|p| p.item_id == item.item_id) {
        Some(p) => p.quantity += item.quantity,
        None => list.push(item.clone()),
    }
}

#[derive(Debug, Clone)]
pub struct BotOptions {
    /// The battle algorithm: v3 (runner_v3.rs) in the app; v1 (runner.rs, as the app played before v3) only for
    /// comparison, `cllt fight --algo=v1`.
    pub algorithm: Algorithm,
    /// The account's skill (accounts.json): v1 casts it as soon as nội lực pays for it; v3 with the skill tree casts no
    /// other learnt skill, without the tree it casts it when cast_skill says so (v2).
    pub skill: Option<Skill>,
    /// The move search of v1 (Q20 `kill`). v3 plays Strategy::win(): the mob as it really plays and a look past an
    /// extra turn (07-auto-battle.md#thuật-toán-v2).
    pub strategy: Strategy,
    /// v3: what one potion of the bag costs in HP for best_action; None (the default) never uses one.
    pub potion_cost: Option<f64>,
    pub timed_move: Duration,
    pub rest: Duration,
    /// How potential points are spent on their own (Bot::set_stats).
    pub stats: Option<StatPlan>,
    /// Cài đặt đánh (Bot::set_fight).
    pub fight: FightSettings,
    /// Lưu dữ liệu trận, of the app's Cài đặt, the same for every account: every battle goes out as Out::BattleData
    /// (battle_record.rs, Bot::set_record).
    pub record: bool,
    /// Mã quà tặng: codes refused in a row and the server's lock, shared by the sessions of the account so a new login
    /// does not forget them (Manager keeps one per username).
    pub gift: Arc<Mutex<GiftMemory>>,
}
impl Default for BotOptions {
    fn default() -> Self {
        Self {
            algorithm: Algorithm::default(),
            skill: None,
            strategy: Strategy::kill(),
            potion_cost: None,
            timed_move: Duration::from_millis(1000),
            rest: Duration::from_secs(3),
            stats: None,
            fight: FightSettings::default(),
            record: true,
            gift: Arc::default(),
        }
    }
}

/// Cài đặt đánh of an account (accounts.json): what the bot does on its own around the battles it plays, and the numbers
/// last chosen in the Đánh quái and Nhiệm vụ tabs, which the tabs offer again.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FightSettings {
    /// Tự sửa đồ: a worn item at durability 0 is repaired with a Búa Sửa Chữa of the bag before the next battle of a
    /// fight job or quest run (Bot::auto_repair). Hammers are never bought for it.
    #[serde(default)]
    pub repair: bool,
    /// Tự nhặt đồ, on unless turned off: the own drops of every won battle are picked up (Bot::loot).
    #[serde(default = "on")]
    pub pickup: bool,
    /// Số trận and Thua tối đa of the Đánh quái tab. The job gets its own numbers with Command::Fight; these only fill the
    /// tab again.
    #[serde(default = "five")]
    pub fight_count: u32,
    #[serde(default = "one")]
    pub fight_losses: u32,
    /// Thua tối đa of the Nhiệm vụ tab, likewise.
    #[serde(default = "one")]
    pub quest_losses: u32,
    /// Tự cộng kỹ năng, off unless turned on (the Kỹ năng modal): skill points go one level at a time to the skill of the
    /// lowest level of those that can take one now, unlearnt ones first, between battles and with nothing running
    /// (Bot::auto_skill).
    #[serde(default)]
    pub auto_skills: bool,
}
fn on() -> bool {
    true
}
fn one() -> u32 {
    1
}
fn five() -> u32 {
    5
}
impl Default for FightSettings {
    fn default() -> Self {
        Self {
            repair: false,
            pickup: true,
            fight_count: five(),
            fight_losses: one(),
            quest_losses: one(),
            auto_skills: false,
        }
    }
}
impl FightSettings {
    pub fn is_default(&self) -> bool {
        *self == Self::default()
    }
}

/// A mob kind of the current map, as offered in the target list.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub name: String,
    pub level: i32,
    pub boss: bool,
    /// Seen in the current zone right now (a boss changing tiles is not).
    pub here: bool,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub target: String,
    pub count: u32,
    pub max_losses: u32,
    pub fights: u32,
    pub wins: u32,
    pub losses: u32,
    pub damage: i64,
    pub exp: i64,
    pub coin: i64,
    /// What Tự nhặt đồ picked up after the job's battles, by item, first picked first. The drops of the last battle
    /// come just after the job ended.
    pub picked: Vec<Picked>,
    /// Why the job ended; None while it runs.
    pub done: Option<String>,
    /// When it started and ended, in ms since 1970: the UI shows the time it took, live while it runs.
    pub started_at: u64,
    pub ended_at: Option<u64>,
}

/// "Tự làm nhiệm vụ", or ▶ on one step: the quest run and what it has done so far.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestRun {
    /// Number of the job or run in this session, so the UI tells a new run from the one before.
    pub id: u32,
    /// The step played alone (▶ on it), as its index in the quest; None for the whole quest.
    pub step: Option<i32>,
    /// The step played alone was done: the run ended because the quest moved past it.
    pub step_done: bool,
    pub max_losses: u32,
    pub fights: u32,
    pub wins: u32,
    pub losses: u32,
    pub exp: i64,
    pub coin: i64,
    /// Quests handed in during the run (s2c/35).
    pub completed: u32,
    /// What Tự nhặt đồ picked up after the run's battles, as for Job.
    pub picked: Vec<Picked>,
    /// What the bot does for the current step.
    pub doing: String,
    /// Why the run ended; None while it runs.
    pub done: Option<String>,
    /// When it started and ended, in ms since 1970, as for Job.
    pub started_at: u64,
    pub ended_at: Option<u64>,
}

/// What Tiện ích asks of Pháp sư or Hương Lão (Bot::smith, 16-upgrade.md#tính-năng). Each press of Bắt đầu
/// costs money or items; the UI asks before sending any but `Upgrade` with `quote`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SmithTask {
    /// Gộp đá: every set of 4 stones of a level at 100%, again on the stones made, up to Đá cấp `up_to`; unlocked
    /// stones too with `unlocked` (in Luyện đá [Xu], paid in Xu).
    Merge(MergeOptions),
    /// Nâng cấp the item of bag slot `slot` up to +`to_level` (npc::SAFE_LEVEL at most until Bùa is measured), each level
    /// with the cheapest stones that bring the odds to `rate` %, or as far as they go; [Cẩn thận] with `careful`. With
    /// `quote` only the price and odds of the next level are asked: nothing is pressed or spent. With `worn`, `slot` is a
    /// gear slot: the game's window takes items of the bag only (J1), so the item is taken off first (c2s/1186) and worn
    /// again once the task ends, however it ends.
    Upgrade {
        slot: u8,
        careful: bool,
        rate: i32,
        to_level: i32,
        unlocked: bool,
        quote: bool,
        worn: bool,
    },
    /// Tách đá of the item of bag slot `slot`.
    Separate { slot: u8 },
    /// Chuyển hoá from bag slot `source` to bag slot `target`, with the cheapest Chuyển hoá item of the bag.
    Transmute { source: u8, target: u8 },
    /// Đổi lượng: `times` × 50 Lượng for 50.000 Xu (option 0) or 55.000 Xu khóa (option 1).
    Exchange { option: u8, times: u32 },
}

/// The work of Pháp sư or Hương Lão under way or last done, for Tiện ích.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmithRun {
    /// Number of the run in this session, so the UI tells a new one from the one before.
    pub id: u32,
    /// "merge", "upgrade", "quote", "separate", "transmute" or "exchange".
    pub kind: &'static str,
    /// "Gộp đá tới Đá cấp 6", "Nâng cấp Nhẫn Trơn tới +4".
    pub title: String,
    /// What it does now, or did last.
    pub doing: String,
    /// Presses of Bắt đầu (exchanges for Đổi lượng), and how many went well or failed.
    pub steps: u32,
    pub ok: u32,
    pub failed: u32,
    /// The price and odds the window said last (s2c/90, s2c/92).
    pub quote: Option<Quote>,
    /// Nâng cấp: the item one level up (s2c/1258), and the item as it is now.
    pub preview: Option<ItemRecord>,
    pub item: Option<ItemRecord>,
    /// Nâng cấp of a worn item: it is taken off for the task and worn again after, so while it runs it is in the bag.
    pub worn: bool,
    /// What the presses cost in all.
    pub spent_xu: i64,
    pub spent_xu_khoa: i64,
    pub spent_luong: i64,
    /// Why it ended; None while it runs.
    pub done: Option<String>,
    pub started_at: u64,
    pub ended_at: Option<u64>,
}

/// Mã quà tặng under way or last done (Bot::redeem), for Tiện ích.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GiftRun {
    /// Number of the run in this session, so the UI tells a new one from the one before.
    pub id: u32,
    /// The codes as they go out (trimmed, upper case, each once), in order.
    pub codes: Vec<GiftCode>,
    /// The code (index in `codes`) waiting for the server's answer, if one is.
    pub sending: Option<usize>,
    /// What it does now, or did last.
    pub doing: String,
    /// Why it ended; None while it runs.
    pub done: Option<String>,
    pub started_at: u64,
    pub ended_at: Option<u64>,
}
/// The server's lock on gift codes as the app knows it, kept across the sessions of an account (Manager keeps one per
/// username, BotOptions::gift): codes refused in a row (0 again after a good code, or Đếm lại từ 0), and until when the
/// server blocks every code (the instant, and the same in ms since 1970).
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct GiftMemory {
    pub wrong: u32,
    pub locked: Option<(Instant, u64)>,
}
/// GiftMemory for the UI (Snapshot::gift_limits, filled by snapshot()): codes refused in a row, how many the bot allows
/// (GIFT_MAX_WRONG), and until when the server blocks every code (ms since 1970), None once that is past.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GiftLimits {
    pub wrong: u32,
    pub max_wrong: u32,
    pub locked_until: Option<u64>,
}
impl Default for GiftLimits {
    fn default() -> Self {
        Self {
            wrong: 0,
            max_wrong: super::gift::GIFT_MAX_WRONG,
            locked_until: None,
        }
    }
}
/// One code of a GiftRun: `ok` None until s2c/1223 answers it, then the server's words, and the title of the mail a
/// good code brings (s2c/1222).
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GiftCode {
    pub code: String,
    pub ok: Option<bool>,
    pub text: String,
    pub mail: Option<String>,
}

/// What the Hòm thư tab asks (Bot::mail). Each is one packet but Xóa, which sends one c2s/1219 per mail. There is no Xóa
/// hết: c2s/1221 deletes the gifts not taken too (mail::DELETE_ALL).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MailTask {
    /// c2s/1215: the list.
    List,
    /// c2s/1216: what a mail says and holds. The server marks it read.
    Open(i64),
    /// c2s/1217: the gift of one mail, once the bag has the room for it (opened first when it was not yet).
    Claim(i64),
    /// c2s/1218: every gift that fits; the server leaves out the mails it has no room for.
    ClaimAll,
    /// c2s/1219 for each of these mails, one by one: only mails whose gift is taken, or that had none.
    Delete(Vec<i64>),
}

/// What the Chợ trời tab asks (Bot::market). Mua, Đăng bán, Thu hồi and Gia hạn cost money or move an item; the UI asks
/// before each.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MarketTask {
    /// c2s/116 for the tabs, then c2s/1192 for page `page` of tab `tab`: the window as the toolbar button opens it.
    Open { tab: i32, page: i32 },
    /// c2s/1192: page `page` of tab `tab` (0–8), or of Đang bán (market::MARKET_MINE_TAB).
    Page { tab: i32, page: i32 },
    /// c2s/115: the listing `uuid` of the page last read, which must still cost `price` Xu.
    Buy { uuid: String, price: i32 },
    /// c2s/112 kind 1: one of the item of bag slot `slot`, at `price` Xu.
    Sell { slot: u8, price: i64 },
    /// c2s/113: the listing `uuid` of Đang bán back to the bag.
    Withdraw(String),
    /// c2s/112 kind 2: 24 more hours on the listing `uuid` of Đang bán, for the fee.
    Extend(String),
}

/// Chợ trời as the app knows it (Bot::market, bot/market.rs), for the Chợ trời tab of Tiện ích.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MarketState {
    /// s2c/116: the tabs with their listing counts, the fee, the hours on sale, the highest price; None until opened.
    pub tabs: Option<MarketTabs>,
    /// The page of a tab last read, and Đang bán as last read (also after Đăng bán and Gia hạn).
    pub page: Option<MarketPage>,
    pub mine: Option<MarketPage>,
    /// What the task under way does ("Đang mua Thú cưng Slime…"); None when none is.
    pub doing: Option<String>,
    /// The listing (uuid) or bag item (uuid) the task under way is about.
    pub busy_with: Option<String>,
    /// The task under way is Mua, Đăng bán, Thu hồi or Gia hạn, which keeps the character busy (Bot::market_changing);
    /// filled by snapshot().
    pub changing: bool,
    /// The line the last of those ended with, as in the log ("Xong mua …", "Chưa mua được …").
    pub last: Option<String>,
}

/// The mailbox as the app knows it (Bot::mail, mailbox.rs), for the Hòm thư tab of Tiện ích.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Mailbox {
    /// s2c/1215 as last listed, newest first, with the mails come since (s2c/1222) and those deleted taken out; None
    /// until listed in this session.
    pub mails: Option<Vec<MailHeader>>,
    /// The mails opened in this session (s2c/1216), of those still listed.
    pub opened: Vec<MailBody>,
    /// s2c/1220: whether a mail is not read yet; None until the server said.
    pub unread: Option<bool>,
    /// What the task under way does ("Đang nhận thư Quà Alpha Test"); None when none is.
    pub doing: Option<String>,
    /// The mail the task under way is about (c2s/1216, c2s/1217, c2s/1219), if one is.
    pub busy_with: Option<i64>,
    /// The task under way is Nhận, Nhận hết or Xóa, which keeps the character busy (Bot::mail_changing); filled by
    /// snapshot().
    pub changing: bool,
    /// The line the last task ended with, as in the log ("Xong nhận thư …", "Chưa nhận thư …").
    pub last: Option<String>,
}

/// A map of the atlas for "Đổi map": the level the world map asks for, and how many portals away it is.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapChoice {
    pub map_id: String,
    pub name: String,
    /// c2s/11 "M99"; None for a map the world list does not have.
    pub level: Option<i32>,
    /// Portals on the shortest known way: 0 for the map the character is on, None when no known way leads there.
    pub hops: Option<u32>,
    /// The level the character lacks to enter it (Atlas::needs_level); no way leads there then.
    pub need: Option<i32>,
}

/// A boss of this zone and the tile (column, row) it was last seen on; `moving` between s2c/1177 field 1 and field 0.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BossTile {
    pub id: String,
    pub name: String,
    pub level: i32,
    pub col: i32,
    pub row: i32,
    pub moving: bool,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleView {
    pub mob_id: String,
    pub mob_name: String,
    pub hp: f64,
    pub max_hp: f64,
    pub mob_hp: Option<f64>,
    pub mob_max_hp: Option<f64>,
    pub turns: u32,
    pub timed: bool,
    /// A surrender waits for the server (Bot::stop with `surrender`).
    pub leaving: bool,
}

/// A timed effect on the character, from the s2c/9 tail: "ef7" at rate 200000 is the x2 EXP of Tăng Kinh Nghiệm. It ends
/// at `until` (ms since 1970), offline or not.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Boost {
    pub key: String,
    /// In 1/100000: 200000 doubles the EXP.
    pub rate: i32,
    pub until: u64,
}
impl Boost {
    /// "x2 EXP" for the effect of Tăng Kinh Nghiệm; the key for an effect not known yet.
    pub fn label(&self) -> String {
        match self.key.as_str() {
            "ef7" => format!("x{} EXP", self.rate as f64 / 100_000.0),
            key => format!("hiệu ứng {key}"),
        }
    }
}

/// Everything the UI shows for one account.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Snapshot {
    pub name: String,
    pub level: i32,
    pub hp: i32,
    pub max_hp: i32,
    /// From the tail of s2c/9 at login, then s2c/10 kind 4 after every battle or level up.
    pub exp: Option<i32>,
    pub level_exp: Option<[i32; 2]>,
    pub coin: Option<i32>,
    /// Potential stats (s2c/9, s2c/10 kind 2); [0] is Cường lực.
    pub stats: Vec<i32>,
    /// Attack, defence, then probably accuracy, dodge, critical (s2c/9, extra[1..5] of s2c/10 kind 4).
    pub combat: Option<[i32; 5]>,
    /// The element, field01 of s2c/9: 1 Hỏa, 4 Thủy (potentials::main_stat).
    pub element: Option<i32>,
    /// Points left to spend (s2c/9, s2c/10 kind 8).
    pub stat_points: Option<i32>,
    pub skill_points: Option<i32>,
    pub map_id: String,
    pub map_name: String,
    pub zone: i32,
    /// The zones of the map and their players (s2c/1172) as last asked; None until asked, and again after s2c/11.
    pub zones: Option<Vec<Zone>>,
    /// A zone change or a trip to another map under way, as the UI says it ("Sang khu 4", "Đi tới Rìa Hồng Giang").
    pub moving: Option<String>,
    /// Where the bot walks back to once the Cửa hàng is closed ("Hồng Giang khu 3"; Bot::go_to_shop); filled by
    /// snapshot().
    pub back_to: Option<String>,
    /// The maps of the atlas, nearest first, with the portals to take (Bot::maps); filled by snapshot().
    pub maps: Vec<MapChoice>,
    /// Where the character stands, in server units (s2c/11; tiles of 32).
    pub x: i32,
    pub y: i32,
    /// NPCs and portals of the current map.
    pub places: Vec<Place>,
    pub bosses: Vec<BossTile>,
    /// The other players of the zone, highest level first.
    pub players: Vec<Nearby>,
    /// The last s2c/1263 did not read (a player record this decoder does not know): `players` is not the whole zone.
    pub players_unread: bool,
    pub targets: Vec<Target>,
    pub job: Option<Job>,
    /// The current main quest (s2c/39), with the step and progress the bot has seen since.
    pub quest: Option<Quest>,
    pub quest_run: Option<QuestRun>,
    pub battle: Option<BattleView>,
    /// The latest result of the battle on, or of the battle just over until the next one opens.
    pub turn: Option<Turn>,
    /// The 8 gear slots of s2c/9 at login, None where empty; no other packet is known to change them.
    pub gear: Vec<Option<ItemRecord>>,
    /// The bag: s2c/42 at login, then every s2c/1187.
    pub bag: Option<Bag>,
    /// Xu, Xu khoá, Lượng (s2c/46 at login and when they change).
    pub currencies: Option<Currencies>,
    /// The skill tree of the character's element (s2c/30 at login), shared by every snapshot.
    pub skills: Arc<Vec<SkillDef>>,
    /// The level of each skill by id: the s2c/9 tail, then s2c/10 kind 32 after every c2s/1191.
    pub skill_levels: BTreeMap<i32, i32>,
    /// The shop s2c/1190 last listed (open_shop, open_shop_kind; `kind` says which of npc::SHOPS), until the character
    /// leaves M1.
    pub shop: Option<ShopList>,
    /// The work of Pháp sư or Hương Lão under way or last done (Bot::smith).
    pub smith: Option<SmithRun>,
    /// Mã quà tặng under way or last done (Bot::redeem).
    pub gift: Option<GiftRun>,
    /// The codes refused in a row and the server's lock, from GiftMemory; filled by snapshot().
    pub gift_limits: GiftLimits,
    /// Hòm thư (Bot::mail).
    pub mailbox: Mailbox,
    /// Chợ trời (Bot::market).
    pub market: MarketState,
    /// Timed effects at login (the s2c/9 tail), such as x2 EXP; no packet is known yet to update them in the session.
    pub boosts: Vec<Boost>,
}

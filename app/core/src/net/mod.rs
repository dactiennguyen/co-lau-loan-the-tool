//! One TCP session per account over tokio: the login of FLOW in src/net/client.ts with the gaps of the game (human.rs),
//! heartbeat c2s/1 every 2 s from the key exchange to s2c/4 and every 30 s in the world, then the Bot with its commands and
//! timers. Manager runs one session per account on a shared runtime.
//! An account with a proxy turned on connects through it (proxy.rs); the game protocol is the same inside the tunnel.
use crate::accounts::Account;
use crate::atlas::Atlas;
use crate::battle_record::BattleData;
use crate::bot::{
    BachHoPace, BattleRecord, Bot, BotOptions, FightSettings, GiftMemory, ItemAct, LogKind,
    MailTask, MarketTask, Out, PickupRecord, SmithTask, Snapshot,
};
use crate::opcodes::{HOST, PORT};
use crate::potentials::StatPlan;
use crate::protocol::{
    character_location, character_prefix, handshake, map_prefix, session_key, Protocol, Reader,
};
use crate::proxy::{open_tunnel, Proxy};
use crate::requests::{build, Ctx};
use crate::world::map_entities;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::time::{sleep_until, timeout, Instant};

#[derive(Debug, Clone, PartialEq)]
pub enum Command {
    Fight {
        target: String,
        count: u32,
        max_losses: u32,
    },
    /// "Tự làm nhiệm vụ" on the current main quest; with `step` = (quest id, step index), ▶ on that step: only it, which
    /// must be the current one of that quest.
    Quest {
        max_losses: u32,
        step: Option<(i32, i32)>,
    },
    /// Ends the job or quest run; `surrender` also leaves a battle in progress (Bot::stop), else it is played out.
    Stop {
        surrender: bool,
    },
    /// How potential points are spent on their own, None for not at all (Bot::set_stats).
    Stats(Option<StatPlan>),
    /// Cài đặt đánh (Bot::set_fight).
    FightSettings(FightSettings),
    /// Lưu dữ liệu trận of the app's Cài đặt (Bot::set_record).
    Record(bool),
    /// "Lượt thua còn lại" of the fight job or quest run going on (Bot::set_losses_left).
    LossesLeft(u32),
    /// "Cộng +1" on the potential of that c2s/10 index (Bot::add_stat).
    AddStat(usize),
    /// Nâng cấp on the skill of that id (Bot::upgrade_skill).
    UpgradeSkill(i32),
    /// A button of the item detail: wear, take off, use, repair (Bot::item).
    Item(ItemAct),
    /// Command::Item for the one item the window showed, by its uuid: refused when its slot holds another item by now
    /// (Bot::item_of).
    ItemOf(ItemAct, String),
    /// Xóa nhiều of the Túi đồ tab: throw away these bag items (slot, uuid), gear only, one after the other
    /// (Bot::discard_many).
    DiscardMany(Vec<(u8, String)>),
    /// Đập hết of the Túi đồ tab: every Trứng Gà of this bag slot (slot, uuid), one after the other (Bot::break_all).
    BreakAll(u8, String),
    /// "Nhận ngay" of the Phúc lợi window: Điểm danh, Quà online and Quà thăng cấp now (Bot::welfare).
    Welfare,
    /// Bảng xếp hạng: read tab `0`–6 (Bot::ranking).
    Ranking(u8),
    /// The zones of the map and their players (Bot::list_zones).
    ListZones,
    /// Another zone of the map (Bot::change_zone).
    ChangeZone(i32),
    /// Another map, through the portals of the atlas (Bot::go_to).
    GoTo(String),
    /// "Đi tới Làng Thanh Khê" of the Cửa hàng; with `back`, walk back where it started once the dialog closes
    /// (Bot::go_to_shop).
    ShopTrip {
        back: bool,
    },
    /// The Cửa hàng dialog closed (Bot::shop_closed).
    ShopClosed,
    /// The Dược phẩm shop of Lái Buôn (Bot::open_shop).
    OpenShop,
    /// One of the 14 shops of npc::SHOPS by its kind (Bot::open_shop_kind).
    OpenShopKind(u8),
    /// A task of Pháp sư or Hương Lão of Tiện ích (Bot::smith).
    Smith(SmithTask),
    /// Buys a line of that shop: its shop id and how many (Bot::buy).
    Buy {
        shop_id: i32,
        quantity: i32,
    },
    /// Mã quà tặng: the codes as typed, sent one by one (Bot::redeem).
    Gift(Vec<String>),
    /// Đếm lại từ 0 of the codes refused in a row (Bot::gift_reset).
    GiftReset,
    /// A task of the Hòm thư tab (Bot::mail).
    Mail(MailTask),
    /// A task of the Chợ trời tab (Bot::market).
    Market(MarketTask),
    /// Bạch Hổ of its window: try to get into the boss's battle from `from_ms` until `until_ms`, ms since 1970
    /// (Bot::bach_ho).
    BachHo {
        from_ms: u64,
        until_ms: u64,
        pace: BachHoPace,
    },
    /// Dừng of the Bạch Hổ window (Bot::bach_ho_stop).
    BachHoStop,
    /// Quay về chỗ cũ: back where Bạch Hổ took the character from (Bot::go_back).
    GoBack,
    /// Báo lỗi with the note of the user: the session answers with Event::Fault, its last packets and commands.
    Report(String),
    Logout,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ConnState {
    Offline,
    Connecting,
    Online,
    Error(String),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    State(ConnState),
    Snapshot(Box<Snapshot>),
    Log(LogKind, String),
    /// A battle that ended (Out::Battle), for the history of the account.
    Battle(Box<BattleRecord>),
    /// An item Tự nhặt đồ picked up (Out::Pickup), likewise.
    Pickup(Box<PickupRecord>),
    /// The packets of a battle and what both sides were (Out::BattleData), for battle_data of cllt.db.
    BattleData(Box<BattleData>),
    /// For the battle window of the account (Out::BattleEvent).
    BattleEvent(Box<crate::battle_view::BattleEvent>),
    /// A fault of the session or a Báo lỗi, with what went in and out before it (trace.rs), for Log lỗi. Comes after
    /// the log line or the state it is about.
    Fault(Box<Fault>),
    /// The IP a proxy goes out with (connect::proxy_exit_ip), soon after the session connected through it.
    ProxyIp(String),
}

/// The game server the sessions connect to: plays1.colauloanthe.vn:1688, as the game's config says, unless the app's Cài
/// đặt names another (Manager::set_server).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct Server {
    pub host: String,
    pub port: u16,
}
impl Default for Server {
    fn default() -> Self {
        Self {
            host: HOST.into(),
            port: PORT,
        }
    }
}
impl Server {
    fn addr(&self) -> (&str, u16) {
        (&self.host, self.port)
    }
}

type Emit = Arc<dyn Fn(Event) + Send + Sync>;
type Error = String;
const STEP: Duration = Duration::from_secs(8);
/// In the game, how long the server may send nothing (it answers the heartbeat, every 30 s there as the game 1.1.1 beats)
/// before the connection is taken as gone (session.rs): two beats missed and some. Shorter in the tests, still over
/// their heartbeat.
#[cfg(not(test))]
const SILENT: Duration = Duration::from_secs(70);
#[cfg(test)]
const SILENT: Duration = Duration::from_secs(3);
/// The heartbeat of human::heartbeat_delay is this many times faster in the tests: 1 s in the world, under SILENT.
#[cfg(not(test))]
const BEAT_SCALE: u32 = 1;
#[cfg(test)]
const BEAT_SCALE: u32 = 30;
/// After s2c/43, how long to wait for s2c/1263: a zone with no other player sends none (M25, 31/10; snapshotWaitMs of
/// src/net/client.ts).
const PLAYERS_WAIT: Duration = Duration::from_millis(1500);

mod connect;
mod manager;
mod session;
#[cfg(test)]
mod tests;
mod trace;

pub use connect::{check_proxy, proxy_exit_ip};
pub use manager::Manager;
pub use session::run;
pub use trace::{is_fault, Fault, Traced};

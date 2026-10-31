//! What one logged-in account knows and does: the character, map, mobs and current quest from the world packets, and
//! one of two jobs. A fight job ("đánh X N lần") follows QuestBot --farm of src/quest.ts: c2s/15 for a mob, c2s/1178 for
//! a boss of s2c/1177, 8 s for s2c/22, 6 × 5 s of waiting while a boss changes tiles, 3 s of rest between battles, and
//! losses (except to a boss) up to `max_losses`. A quest run ("Tự làm nhiệm vụ") is QuestBot itself: it plays the steps
//! of s2c/39 it knows (talk with c2s/13, kill, boss damage, level, a stat point, a skill level) and walks through portals
//! when the NPC or mob of a step is in another map. Without I/O, like BattleRunner.
use crate::atlas::{Atlas, MapRecord, Portal};
use crate::battle::{battle_setup, Strategy};
use crate::items::{
    bag_slot, book, character_extra, character_gear, currencies, gear_durability, gear_update,
    ground_item_add, ground_item_remove, inventory, Bag, Currencies, ItemRecord,
};
use crate::potentials::{next_stat, StatPlan, POTENTIALS};
use crate::protocol::{
    character_location, character_prefix, character_profile, map_prefix, Reader, Writer,
};
use crate::quest::{step_action, StepAction};
use crate::requests::{build, Ctx};
use crate::runner::{Act, BattleEnd, BattleRunner, RunnerOptions, Skill, Turn};
use crate::skills::{character_skills, skill_table, skill_tree, SkillDef};
use crate::world::{
    character_stats, map_boss, map_change, map_data, map_entities, notice, npc_menu,
    quest_complete, quest_data, quest_progress, shop_list, zone_list, Mob, Nearby, Place, Quest,
    ShopList, Zone, ZonePlayers,
};
use std::collections::{BTreeMap, HashSet, VecDeque};
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq)]
pub enum Out {
    Send(i32, Vec<u8>),
    Log(LogKind, String),
    /// A battle that ended, for the history of the account (BattleRecord).
    Battle(Box<BattleRecord>),
}

/// What a log line is about, for the filters of the Nhật ký card. docs/integration/rust/README.md#nhật-ký-và-thống-kê
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

/// One battle for the history of the account (the Thống kê tab): who, where, against what, and what it brought.
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

#[derive(Debug, Clone)]
pub struct BotOptions {
    pub skill: Option<Skill>,
    pub strategy: Strategy,
    pub timed_move: Duration,
    pub rest: Duration,
    /// How potential points are spent on their own (Bot::set_stats).
    pub stats: Option<StatPlan>,
    /// Cài đặt đánh (Bot::set_fight).
    pub fight: FightSettings,
}
impl Default for BotOptions {
    fn default() -> Self {
        Self {
            skill: None,
            strategy: Strategy::kill(),
            timed_move: Duration::from_millis(1000),
            rest: Duration::from_secs(3),
            stats: None,
            fight: FightSettings::default(),
        }
    }
}

/// Cài đặt đánh of an account (accounts.json): what the bot does on its own around the battles it plays.
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
}
fn on() -> bool {
    true
}
impl Default for FightSettings {
    fn default() -> Self {
        Self {
            repair: false,
            pickup: true,
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
    /// What the bot does for the current step.
    pub doing: String,
    /// Why the run ended; None while it runs.
    pub done: Option<String>,
    /// When it started and ended, in ms since 1970, as for Job.
    pub started_at: u64,
    pub ended_at: Option<u64>,
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
    /// The Dược phẩm shop of Lái Buôn as s2c/1190 last listed it (open_shop), until the character leaves M1.
    pub shop: Option<ShopList>,
}

/// Wall-clock ms since 1970, for the start and end of a job or quest run.
fn epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// "45 giây", "3 phút 05 giây", "1 giờ 02 phút".
pub fn duration_text(d: Duration) -> String {
    let s = d.as_secs();
    match s {
        0..60 => format!("{s} giây"),
        60..3600 => format!("{} phút {:02} giây", s / 60, s % 60),
        _ => format!("{} giờ {:02} phút", s / 3600, s / 60 % 60),
    }
}

/// A challenge (c2s/15, c2s/1178) not answered by s2c/22 yet: the mob, and the job or quest run that sent it.
struct Challenge {
    mob_id: String,
    seq: u32,
    at: Instant,
}
/// A challenge left unanswered this long is taken as refused: no battle opens that late.
const CHALLENGE_KEPT: Duration = Duration::from_secs(60);

/// A button of the item detail (12-skills-items.md#c2s-1186): Trang bị the item of a bag slot, Cởi ra the one of a gear
/// slot, Sử dụng a bag slot, Sửa chữa a gear slot.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ItemAct {
    Equip(u8),
    Unequip(u8),
    Use(u8),
    Repair(u8),
}
/// Item of the Búa Sửa Chữa that each repair takes.
const HAMMER: i32 = 2;
/// The type of Hoàn Linh Dược and Kim Đan Dược: the server refuses them outside a battle (P4).
const POTION: u8 = 20;
/// How long Tự sửa đồ waits for s2c/48 before the run goes on without the repair (the answer took 40 ms in E2).
const REPAIR_WAIT: Duration = Duration::from_secs(5);
/// Tự nhặt đồ (13-drops-items.md#g2): items fallen in the map are kept DROPS_KEPT; those within LOOT of the end of a won
/// battle, before it or after, are its own drops. One c2s/1188 every PICK_GAP; a s2c/1256 within PICK_ANSWER of the last
/// one is its answer.
const DROPS_KEPT: Duration = Duration::from_secs(2);
const LOOT: Duration = Duration::from_millis(300);
const PICK_GAP: Duration = Duration::from_millis(200);
const PICK_ANSWER: Duration = Duration::from_secs(2);

/// Lái Buôn (NPC 106 of M1) and the line of his menu that opens the Dược phẩm shop (12-skills-items.md#c2s-1190). The
/// server answers c2s/13 to him from anywhere on M1, and "Không thể thực hiện" from another map (B1).
const SELLER: (&str, i32) = ("M1", 106);
const SELLER_MENU: &str = "Dược phẩm";
/// How long a step of the shop waits for the server.
const SHOP_WAIT: Duration = Duration::from_secs(8);
/// Most items one c2s/1190 asks for.
pub const MAX_BUY: i32 = 99;

/// Where the shop stands: c2s/13 waits for s2c/57, c2s/57 for s2c/1190, c2s/1190 for the notice of the purchase.
#[derive(Debug, Clone)]
enum Shopping {
    Talk,
    Menu,
    Buy {
        name: String,
        quantity: i32,
        cost: String,
    },
}

/// An item action waiting for its answer (s2c/1186, s2c/48, or a notice), and the item's name for the log.
struct ItemWait {
    act: ItemAct,
    name: String,
    at: Instant,
}

/// A c2s/1191 waiting for s2c/1191: the skill, when it went out, and whether the quest step "Sử dụng điểm kỹ năng" sent
/// it (Nâng cấp in the UI does too).
struct Upgrade {
    id: i32,
    name: String,
    at: Instant,
    step: bool,
}

enum Wake {
    Next,
    ChallengeTimeout,
    /// A talk, stat point or portal the server did not answer in 8 s, or a level step it did not advance: the quest run
    /// stops with this reason.
    Silence(&'static str),
    /// A point of the stat plan the server did not answer in 8 s.
    StatSilence,
}

pub struct Bot {
    pub snap: Snapshot,
    mobs: Vec<Mob>,
    /// Ids of the bosses of s2c/1177.
    bosses: HashSet<String>,
    /// Bosses of s2c/1177 by map (name, level), kept while they change tiles, as recordBoss keeps them in the TS atlas.
    seen_bosses: Vec<(String, String, i32)>,
    zone: ZonePlayers,
    /// data/maps.json and what this session has seen since.
    atlas: Atlas,
    options: BotOptions,
    battle: Option<BattleRunner>,
    target: Option<Mob>,
    waits: u32,
    timer: Option<(Instant, Wake)>,
    /// Job each challenge and battle belongs to, so a battle of a replaced job is not counted in the new one.
    job_seq: u32,
    /// Unanswered challenges, oldest first. One that timed out or was sent before Stop stays: its battle may open late.
    challenges: Vec<Challenge>,
    battle_seq: u32,
    /// The portal of the quest run's c2s/13 until s2c/43 of the new map; `hops` counts portals taken for the current
    /// step; `refused` holds the portals the server refused in this run.
    travelling: Option<(i32, String)>,
    hops: u32,
    refused: HashSet<i32>,
    /// A talk or stat-point step is answered by s2c/34 alone.
    awaiting_reply: bool,
    /// The step of a run that plays one: quest id, step index, its text (`playing` of QuestBot with `once`).
    playing: Option<(i32, i32, String)>,
    /// Quest runs started in this session (QuestRun::id).
    runs: u32,
    /// The map asked with c2s/40 (c2s/11) still to answer with c2s/43 when it comes, as the game does after Đầu hàng.
    reload_map: bool,
    /// Until when a surrender waits for s2c/1214 or s2c/36 before the battle is played on. Its own deadline, so a job
    /// started or stopped meanwhile cannot clear it.
    leave_until: Option<Instant>,
    /// When the battle on, or the last one, opened (s2c/22): its result line says how long it took.
    battle_started: Instant,
    /// When the fight job or quest run started: each result line says how long it has run.
    run_started: Instant,
    /// The battle on, for its BattleRecord: when it opened (ms since 1970), what it is played for, the HP it opened with.
    battle_at: u64,
    battle_source: BattleSource,
    battle_hp: i32,
    /// How potential points are spent on their own (set_stats). `given` counts the points it gave each stat (c2s/10
    /// index) since it was set, `spent` those since the last summary; `allotting` while its c2s/10 waits for s2c/10 kind
    /// 8, `allot_failed` once one went unanswered, until the plan is set again.
    stat_plan: Option<StatPlan>,
    given: [u32; 4],
    spent: [u32; 4],
    allotting: bool,
    allot_failed: bool,
    plan_warned: bool,
    upgrading: Option<Upgrade>,
    item_wait: Option<ItemWait>,
    /// The zone of c2s/1173 until s2c/43 of it (change_zone).
    zoning: Option<i32>,
    /// "Đổi map": the map (id, name) the bot walks to through portals (go_to), until it is there.
    trip: Option<(String, String)>,
    /// Until when the zone change, or the portal of the trip, waits for the server.
    move_until: Option<Instant>,
    /// The step of the shop waiting for the server, and until when.
    shopping: Option<(Shopping, Instant)>,
    fight: FightSettings,
    /// The gear slot and item name of the repair auto_repair sent, until s2c/48 or a notice answers it. `repair_failed`
    /// holds the slots the server did not repair in this run, `repair_warned` whether the run said it has no hammer.
    repairing: Option<(u8, String)>,
    repair_failed: HashSet<u8>,
    repair_warned: bool,
    /// Tự nhặt đồ: the items fallen in the last DROPS_KEPT (uuid, name, when); until when a won battle's drops are still
    /// coming; the ones waiting for their c2s/1188, and when the next may go; the uuids asked since the last won battle;
    /// when the last c2s/1188 went.
    drops: Vec<(String, String, Instant)>,
    loot_until: Option<Instant>,
    to_pick: VecDeque<(String, String)>,
    pick_at: Option<Instant>,
    asked: HashSet<String>,
    picked_at: Option<Instant>,
}

impl Bot {
    pub fn new(options: BotOptions, atlas: Arc<Atlas>) -> Self {
        let (stat_plan, fight) = (options.stats, options.fight);
        Self {
            snap: Snapshot::default(),
            mobs: vec![],
            bosses: HashSet::new(),
            seen_bosses: vec![],
            zone: ZonePlayers::default(),
            atlas: (*atlas).clone(),
            options,
            battle: None,
            target: None,
            waits: 0,
            timer: None,
            job_seq: 0,
            challenges: vec![],
            battle_seq: 0,
            travelling: None,
            hops: 0,
            refused: HashSet::new(),
            awaiting_reply: false,
            playing: None,
            runs: 0,
            reload_map: false,
            leave_until: None,
            battle_started: Instant::now(),
            run_started: Instant::now(),
            battle_at: 0,
            battle_source: BattleSource::Other,
            battle_hp: 0,
            stat_plan,
            given: [0; 4],
            spent: [0; 4],
            allotting: false,
            allot_failed: false,
            plan_warned: false,
            upgrading: None,
            item_wait: None,
            zoning: None,
            trip: None,
            move_until: None,
            shopping: None,
            fight,
            repairing: None,
            repair_failed: HashSet::new(),
            repair_warned: false,
            drops: vec![],
            loot_until: None,
            to_pick: VecDeque::new(),
            pick_at: None,
            asked: HashSet::new(),
            picked_at: None,
        }
    }

    pub fn atlas(&self) -> &Atlas {
        &self.atlas
    }
    fn job_running(&self) -> bool {
        self.snap.job.as_ref().is_some_and(|j| j.done.is_none())
    }
    fn quest_running(&self) -> bool {
        self.snap
            .quest_run
            .as_ref()
            .is_some_and(|r| r.done.is_none())
    }

    pub fn snapshot(&self) -> Snapshot {
        let mut s = self.snap.clone();
        s.targets = self.targets();
        s.players = self.zone.list();
        s.maps = self.maps();
        if let Some(b) = &self.battle {
            s.turn = self.turn_of(b);
        }
        s.battle = self.battle.as_ref().map(|b| BattleView {
            mob_id: b.mob_id.clone(),
            mob_name: self.mob_name(&b.mob_id),
            hp: b.me.hp,
            max_hp: b.me.max_hp,
            mob_hp: Some(b.mob.hp).filter(|v| v.is_finite()),
            mob_max_hp: Some(b.mob.max_hp).filter(|v| v.is_finite()),
            turns: b.turns,
            timed: b.timed,
            leaving: b.leaving,
        });
        s
    }

    /// The battle against `mob_id` that just ended, for the history (Out::Battle). A boss that changed tiles is not in
    /// the zone list any more: its name and level come from the atlas, which keeps its id by zone.
    fn record(
        &self,
        mob_id: &str,
        result: BattleResult,
        turns: u32,
        damage: i32,
        exp: i32,
        coin: i32,
    ) -> Box<BattleRecord> {
        let known = self
            .mobs
            .iter()
            .find(|m| m.id == mob_id)
            .map(|m| (m.name.clone(), m.level))
            .or_else(|| {
                self.atlas
                    .bosses(&self.snap.map_id)
                    .iter()
                    .find(|b| b.ids.values().any(|i| i == mob_id))
                    .map(|b| (b.name.clone(), b.level))
            });
        let (mob_name, mob_level) = known.unwrap_or_else(|| (mob_id.to_string(), 0));
        Box::new(BattleRecord {
            character: self.snap.name.clone(),
            level: self.snap.level,
            started_at: self.battle_at,
            ended_at: epoch_ms(),
            map_id: self.snap.map_id.clone(),
            map_name: self.snap.map_name.clone(),
            zone: self.snap.zone,
            mob_id: mob_id.to_string(),
            boss: self.bosses.contains(mob_id) || self.is_boss(&mob_name),
            mob_name,
            mob_level,
            source: self.battle_source,
            result,
            turns,
            damage,
            hp_before: self.battle_hp,
            hp_after: self.snap.hp,
            max_hp: self.snap.max_hp,
            exp,
            coin,
        })
    }

    fn mob_name(&self, id: &str) -> String {
        self.mobs
            .iter()
            .find(|m| m.id == id)
            .map_or_else(|| id.to_string(), |m| m.name.clone())
    }

    /// The last result of `b`, with the mob's name.
    fn turn_of(&self, b: &BattleRunner) -> Option<Turn> {
        let foe = self.mob_name(&b.mob_id);
        b.last.clone().map(|t| Turn { foe, ..t })
    }

    /// Bosses of the current map: seen in this session, or in data/maps.json.
    fn map_bosses(&self) -> Vec<(String, i32)> {
        let map = &self.snap.map_id;
        let mut out: Vec<(String, i32)> = self
            .seen_bosses
            .iter()
            .filter(|b| &b.0 == map)
            .map(|b| (b.1.clone(), b.2))
            .collect();
        for k in self.atlas.bosses(map) {
            if !out.iter().any(|b| b.0 == k.name) {
                out.push((k.name.clone(), k.level));
            }
        }
        out
    }

    /// Mob kinds of this zone, plus the bosses of this map changing tiles; bosses first, then the strongest.
    pub fn targets(&self) -> Vec<Target> {
        let mut out: Vec<Target> = vec![];
        for m in &self.mobs {
            if !out.iter().any(|t| t.name == m.name) {
                out.push(Target {
                    name: m.name.clone(),
                    level: m.level,
                    boss: self.bosses.contains(&m.id),
                    here: true,
                });
            }
        }
        for (name, level) in self.map_bosses() {
            match out.iter_mut().find(|t| t.name == name) {
                Some(t) => t.boss = true,
                None => out.push(Target {
                    name,
                    level,
                    boss: true,
                    here: false,
                }),
            }
        }
        out.sort_by(|a, b| b.boss.cmp(&a.boss).then(b.level.cmp(&a.level)));
        out
    }

    fn is_boss(&self, name: &str) -> bool {
        self.mobs
            .iter()
            .any(|m| m.name == name && self.bosses.contains(&m.id))
            || self.map_bosses().iter().any(|b| b.0 == name)
    }

    pub fn deadline(&self) -> Option<Instant> {
        [
            self.timer.as_ref().map(|t| t.0),
            self.battle.as_ref().and_then(|b| b.deadline()),
            self.leave_until,
            self.move_until,
            self.shopping.as_ref().map(|s| s.1),
            self.pick_at,
        ]
        .into_iter()
        .flatten()
        .min()
    }

    pub fn on_timer(&mut self, now: Instant, out: &mut Vec<Out>) {
        if let Some(b) = &mut self.battle {
            if b.deadline().is_some_and(|d| d <= now) {
                let mut acts = vec![];
                b.on_timer(now, &mut acts);
                self.apply(acts, now, out);
            }
        }
        if self.timer.as_ref().is_some_and(|t| t.0 <= now) {
            match self.timer.take().unwrap().1 {
                Wake::Next => self.next(now, out),
                Wake::ChallengeTimeout => {
                    if self.battle.is_none() {
                        out.push(Out::Log(
                            LogKind::Battle,
                            format!(
                                "Server không mở trận với {} sau 8 s",
                                self.target.as_ref().map_or("?", |m| &m.name)
                            ),
                        ));
                        self.next(now, out);
                    }
                }
                Wake::Silence(reason) => self.finish_quest(reason, out),
                Wake::StatSilence => {
                    (self.allotting, self.allot_failed) = (false, true);
                    let reason = "Server không trả lời khi cộng điểm tiềm năng";
                    out.push(Out::Log(
                        LogKind::Character,
                        format!("{reason}; thôi tự cộng điểm"),
                    ));
                    if self.quest_running() {
                        self.finish_quest(reason, out);
                    } else if self.job_running() {
                        self.finish(reason, out);
                    }
                }
            }
        }
        if self.pick_at.is_some_and(|t| t <= now) {
            self.pick_next(now, out);
        }
        if self.shopping.as_ref().is_some_and(|s| s.1 <= now) {
            self.shopping = None;
            out.push(Out::Log(
                LogKind::Item,
                format!("Lái Buôn không trả lời sau {} s", SHOP_WAIT.as_secs()),
            ));
        }
        if self.move_until.is_some_and(|t| t <= now) {
            (self.move_until, self.snap.moving) = (None, None);
            if let Some(z) = self.zoning.take() {
                out.push(Out::Log(
                    LogKind::Travel,
                    format!("Server không trả lời khi sang khu {z} sau 8 s"),
                ));
            }
            if let Some((_, name)) = self.trip.take() {
                self.travelling = None;
                out.push(Out::Log(
                    LogKind::Travel,
                    format!("Kết thúc: cổng không trả lời sau 8 s, thôi đi tới {name}"),
                ));
            }
        }
        if self.leave_until.is_some_and(|t| t <= now) {
            self.leave_until = None;
            if let Some(b) = self.battle.as_mut().filter(|b| b.leaving) {
                let mut acts = vec![];
                b.resume(now, &mut acts);
                out.push(Out::Log(
                    LogKind::Battle,
                    "Server chưa nhận đầu hàng sau 8 s; đánh tiếp trận".into(),
                ));
                self.apply(acts, now, out);
            }
        }
    }

    /// Starts a fight job. A job already running is replaced: its battle in progress, or a challenge still waiting for
    /// s2c/22, ends first and is not counted in the new job.
    pub fn fight(
        &mut self,
        target: &str,
        count: u32,
        max_losses: u32,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        // One task at a time: the quest run has to be stopped first (and the other way round in quest()).
        if self.quest_running() {
            return out.push(Out::Log(
                LogKind::Battle,
                "Đang tự làm nhiệm vụ: bấm Dừng rồi mới đánh quái".into(),
            ));
        }
        if self.moving() {
            return out.push(Out::Log(
                LogKind::Battle,
                "Đang đổi chỗ: đợi tới nơi rồi mới đánh quái".into(),
            ));
        }
        self.snap.job = Some(Job {
            target: target.into(),
            count,
            max_losses,
            fights: 0,
            wins: 0,
            losses: 0,
            damage: 0,
            exp: 0,
            coin: 0,
            done: None,
            started_at: epoch_ms(),
            ended_at: None,
        });
        self.run_started = now;
        self.waits = 0;
        self.job_seq += 1;
        (self.repair_failed, self.repair_warned) = (HashSet::new(), false);
        out.push(Out::Log(
            LogKind::Battle,
            format!("Bắt đầu: đánh {target} {count} lần"),
        ));
        let challenging = matches!(self.timer, Some((_, Wake::ChallengeTimeout)));
        if self.battle.is_none() && !challenging {
            self.next(now, out);
        }
    }
    /// Starts "Tự làm nhiệm vụ" on the current quest, replacing a quest run; refused while a fight job runs. With
    /// `step` = (quest id, step index), ▶ on a step, it plays only that step and ends once the quest moves past it. A step
    /// that is not the current one of that quest, as when the UI was a moment behind, is refused without sending anything:
    /// with nothing running, by a run that has already ended, for the UI to show.
    pub fn quest(
        &mut self,
        max_losses: u32,
        step: Option<(i32, i32)>,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        if self.job_running() {
            return out.push(Out::Log(
                LogKind::Quest,
                "Đang đánh quái: bấm Dừng rồi mới làm nhiệm vụ".into(),
            ));
        }
        if self.moving() {
            return out.push(Out::Log(
                LogKind::Quest,
                "Đang đổi chỗ: đợi tới nơi rồi mới làm nhiệm vụ".into(),
            ));
        }
        let playing = step.and_then(|(id, i)| {
            let q = self
                .snap
                .quest
                .as_ref()
                .filter(|q| q.id == id && q.current == i)?;
            Some((id, i, q.steps.get(i as usize)?.text.clone()))
        });
        let index = step.map(|(_, i)| i);
        if let (Some(i), None) = (index, &playing) {
            let reason = "Bước đó không còn là bước đang làm";
            out.push(Out::Log(
                LogKind::Quest,
                format!("Không làm bước {}: {reason}", i + 1),
            ));
            if !self.quest_running() {
                self.snap.quest_run = Some(self.new_run(max_losses, index, Some(reason.into())));
            }
            return;
        }
        if self.quest_running() {
            self.finish_quest("Đã bắt đầu lần chạy mới", out);
        }
        self.snap.quest_run = Some(self.new_run(max_losses, index, None));
        self.run_started = now;
        (self.waits, self.hops, self.travelling, self.awaiting_reply) = (0, 0, None, false);
        self.refused.clear();
        self.job_seq += 1;
        (self.repair_failed, self.repair_warned) = (HashSet::new(), false);
        out.push(Out::Log(
            LogKind::Quest,
            match &playing {
                Some((_, _, text)) => format!("Bắt đầu: làm bước \"{text}\""),
                None => "Bắt đầu: tự làm nhiệm vụ".into(),
            },
        ));
        self.playing = playing;
        let challenging = matches!(self.timer, Some((_, Wake::ChallengeTimeout)));
        if self.battle.is_none() && !challenging {
            self.next(now, out);
        }
    }
    fn new_run(&mut self, max_losses: u32, step: Option<i32>, done: Option<String>) -> QuestRun {
        self.runs += 1;
        QuestRun {
            id: self.runs,
            step,
            step_done: false,
            max_losses,
            fights: 0,
            wins: 0,
            losses: 0,
            exp: 0,
            coin: 0,
            completed: 0,
            doing: String::new(),
            ended_at: done.is_some().then(epoch_ms),
            done,
            started_at: epoch_ms(),
        }
    }
    /// Ends the job or quest run. A battle in progress is played out, or with `surrender` left as the game's Đầu hàng
    /// does, which costs EXP ("Rời trận, mất 29 kinh nghiệm" in B3); a battle played out after an earlier Stop can be
    /// left this way too.
    pub fn stop(&mut self, surrender: bool, now: Instant, out: &mut Vec<Out>) {
        let reason = match (&self.battle, surrender) {
            (Some(_), true) => "Đã dừng và đầu hàng trận đang đánh",
            (Some(_), false) => "Đã dừng; trận đang đánh vẫn tiếp tục tới hết",
            (None, _) => "Đã dừng",
        };
        if self.job_running() {
            self.timer = None;
            self.finish(reason, out);
        }
        if self.quest_running() {
            self.finish_quest(reason, out);
        }
        // A portal already taken is followed to its map; no other is taken.
        if let Some((_, name)) = self.trip.take() {
            self.snap.moving = None;
            out.push(Out::Log(
                LogKind::Travel,
                format!("Kết thúc: thôi đi tới {name}"),
            ));
        }
        if surrender {
            self.surrender(now, out);
        }
    }

    /// Leaves the battle in progress (BattleRunner::leave). s2c/1214 (every capture) or s2c/36 then ends it; without
    /// either in 8 s it is played on (`surrender` of QuestBot).
    fn surrender(&mut self, now: Instant, out: &mut Vec<Out>) {
        let map_id = self.snap.map_id.clone();
        let Some(b) = self.battle.as_mut().filter(|b| !b.leaving) else {
            return;
        };
        let mut acts = vec![];
        b.leave(&map_id, &mut acts);
        let mob = b.mob_id.clone();
        let name = self
            .mobs
            .iter()
            .find(|m| m.id == mob)
            .map_or(mob.as_str(), |m| &m.name);
        out.push(Out::Log(
            LogKind::Battle,
            format!("Đầu hàng trận với {name}"),
        ));
        self.reload_map = true;
        self.leave_until = Some(now + Duration::from_secs(8));
        self.apply(acts, now, out);
    }

    /// The battle surrendered is over: s2c/1214 or s2c/36 after c2s/40, even later than the 8 s wait (the server took it
    /// then). A job or quest run started meanwhile goes on. False when this battle was never surrendered.
    fn left(&mut self, by: i32, now: Instant, out: &mut Vec<Out>) -> bool {
        if !self.battle.as_ref().is_some_and(|b| b.surrendered) {
            return false;
        }
        if let Some(b) = &self.battle {
            let damage = match (b.mob.max_hp - b.mob.hp).max(0.0) {
                d if d.is_finite() => d as i32,
                _ => 0,
            };
            let mut record = self.record(&b.mob_id, BattleResult::Left, b.turns, damage, 0, 0);
            record.hp_after = b.me.hp as i32;
            out.push(Out::Battle(record));
        }
        (self.battle, self.leave_until) = (None, None);
        out.push(Out::Log(LogKind::Battle, format!("Đã rời trận (s2c/{by})")));
        if self.job_running() || self.quest_running() {
            self.timer = Some((now + Duration::from_secs(2), Wake::Next));
        }
        true
    }

    fn finish_quest(&mut self, reason: &str, out: &mut Vec<Out>) {
        if !matches!(self.timer, Some((_, Wake::ChallengeTimeout))) {
            self.timer = None;
        }
        (self.travelling, self.awaiting_reply) = (None, false);
        let what = match self.playing.take() {
            Some(_) => "làm bước",
            None => "tự làm nhiệm vụ",
        };
        if let Some(r) = &mut self.snap.quest_run {
            let end = epoch_ms();
            (r.done, r.ended_at) = (Some(reason.into()), Some(end));
            out.push(Out::Log(LogKind::Quest, format!(
                "Kết thúc {what}: {reason} ({} thắng, {} thua, +{} EXP, +{} xu, xong {} nhiệm vụ, trong {})",
                r.wins,
                r.losses,
                r.exp,
                r.coin,
                r.completed,
                duration_text(Duration::from_millis(end.saturating_sub(r.started_at)))
            )));
        }
    }

    fn finish(&mut self, reason: &str, out: &mut Vec<Out>) {
        if let Some(j) = &mut self.snap.job {
            let end = epoch_ms();
            (j.done, j.ended_at) = (Some(reason.into()), Some(end));
            out.push(Out::Log(
                LogKind::Battle,
                format!(
                    "Kết thúc: {reason} ({} thắng, {} thua, +{} EXP, +{} xu, trong {})",
                    j.wins,
                    j.losses,
                    j.exp,
                    j.coin,
                    duration_text(Duration::from_millis(end.saturating_sub(j.started_at)))
                ),
            ));
        }
    }

    fn send(out: &mut Vec<Out>, opcode: i32, ctx: Ctx) {
        out.push(Out::Send(opcode, build(opcode, &ctx).expect("request")));
    }

    fn next(&mut self, now: Instant, out: &mut Vec<Out>) {
        if self.battle.is_some() || self.allotting {
            return;
        }
        if self.trip.is_some() {
            return self.trip_next(now, out);
        }
        // Before the next battle, or the next step of the quest run, a broken worn item is repaired first.
        if (self.quest_running() || self.job_running()) && self.auto_repair(now, out) {
            return;
        }
        if self.quest_running() {
            return self.quest_next(now, out);
        }
        // Between the battles of a job, or with nothing to do, the stat plan spends the points there are first.
        if self.allot(now, out) {
            return;
        }
        let Some(job) = self.snap.job.clone().filter(|j| j.done.is_none()) else {
            return;
        };
        if job.fights >= job.count {
            return self.finish(&format!("Đã đánh đủ {} trận", job.count), out);
        }
        let targets: Vec<Mob> = self
            .mobs
            .iter()
            .filter(|m| m.name == job.target)
            .cloned()
            .collect();
        let boss = self.is_boss(&job.target);
        if targets.is_empty() && boss && self.waits < 6 {
            self.waits += 1;
            out.push(Out::Log(
                LogKind::Battle,
                format!("{} đang đổi chỗ, đợi 5 s ({}/6)", job.target, self.waits),
            ));
            self.timer = Some((now + Duration::from_secs(5), Wake::Next));
            return;
        }
        self.waits = 0;
        if targets.is_empty() {
            return self.finish(&format!("Không thấy {} ở khu này", job.target), out);
        }
        let mob = targets[job.fights as usize % targets.len()].clone();
        let opcode = if boss { 1178 } else { 15 };
        let j = self.snap.job.as_mut().unwrap();
        j.fights += 1;
        out.push(Out::Log(
            LogKind::Battle,
            format!(
                "Trận {}/{}: thách đấu {} cấp {} ({})",
                j.fights, j.count, mob.name, mob.level, mob.id
            ),
        ));
        Self::send(
            out,
            opcode,
            Ctx {
                mob_id: Some(&mob.id),
                ..Ctx::default()
            },
        );
        self.challenged(mob, now);
    }

    /// Keeps the challenge until its s2c/22 and waits 8 s for it.
    fn challenged(&mut self, mob: Mob, now: Instant) {
        self.challenges
            .retain(|c| now.duration_since(c.at) < CHALLENGE_KEPT);
        self.challenges.push(Challenge {
            mob_id: mob.id.clone(),
            seq: self.job_seq,
            at: now,
        });
        self.target = Some(mob);
        self.timer = Some((now + Duration::from_secs(8), Wake::ChallengeTimeout));
    }

    fn apply(&mut self, acts: Vec<Act>, now: Instant, out: &mut Vec<Out>) {
        for a in acts {
            match a {
                Act::Send(op, p) => out.push(Out::Send(op, p)),
                Act::Log(text) => out.push(Out::Log(LogKind::Battle, text)),
                Act::End(end) => self.on_battle_end(end, now, out),
            }
        }
    }

    fn on_battle_end(&mut self, end: BattleEnd, now: Instant, out: &mut Vec<Out>) {
        if end.won && self.fight.pickup {
            self.loot(now, out);
        }
        // The result that ended it reaches no snapshot with the battle on: the snapshot keeps it until the next battle.
        self.snap.turn = self.battle.take().and_then(|b| self.turn_of(&b));
        self.snap.hp = end.hp as i32;
        let boss = self.bosses.contains(&end.mob_id);
        out.push(Out::Battle(self.record(
            &end.mob_id,
            match end.won {
                true => BattleResult::Won,
                false => BattleResult::Lost,
            },
            end.my_turns,
            end.damage,
            end.exp.unwrap_or(0),
            end.coin.unwrap_or(0),
        )));
        if self.battle_seq != self.job_seq {
            out.push(Out::Log(
                LogKind::Battle,
                format!(
                    "Trận của việc trước: {}, +{} EXP",
                    if end.won { "thắng" } else { "thua" },
                    end.exp.unwrap_or(0)
                ),
            ));
            if self.job_running() || self.quest_running() {
                self.timer = Some((now + self.options.rest, Wake::Next));
            }
            return;
        }
        if self.snap.quest_run.is_some() && !self.job_running() {
            return self.quest_battle_end(&end, boss, now, out);
        }
        let took = duration_text(now.saturating_duration_since(self.battle_started));
        let ran = duration_text(now.saturating_duration_since(self.run_started));
        let Some(j) = &mut self.snap.job else { return };
        if end.won {
            j.wins += 1
        } else {
            j.losses += 1
        }
        j.damage += end.damage as i64;
        j.exp += end.exp.unwrap_or(0) as i64;
        j.coin += end.coin.unwrap_or(0) as i64;
        out.push(Out::Log(
            LogKind::Battle,
            format!(
                "Trận {}: {}, {} lượt trong {}, gây {} sát thương, +{} EXP, +{} xu; đã chạy {}",
                j.fights,
                if end.won { "thắng" } else { "thua" },
                end.my_turns,
                took,
                end.damage,
                end.exp.unwrap_or(0),
                end.coin.unwrap_or(0),
                ran
            ),
        ));
        if j.done.is_some() {
            return;
        }
        // A loss costs EXP but refills HP; a boss keeps its HP between battles and a loss to it costs nothing.
        if !end.won && !boss && j.losses >= j.max_losses {
            let n = j.losses;
            return self.finish(&format!("Thua {n} trận"), out);
        }
        if j.fights >= j.count {
            let n = j.count;
            return self.finish(&format!("Đã đánh đủ {n} trận"), out);
        }
        self.timer = Some((now + self.options.rest, Wake::Next));
    }

    /// Every packet of the session goes through here, from the first one of the login on.
    pub fn on_packet(
        &mut self,
        opcode: i32,
        payload: &[u8],
        now: Instant,
        out: &mut Vec<Out>,
    ) -> crate::protocol::Result<()> {
        if let Some(b) = &mut self.battle {
            let mut acts = vec![];
            if b.on_packet(opcode, payload, now, &mut acts)? {
                self.apply(acts, now, out);
                return Ok(());
            }
        }
        let s = &mut self.snap;
        match opcode {
            9 => {
                let c = character_prefix(payload)?;
                (s.name, s.level, s.hp, s.max_hp) = (c.name, c.level, c.hp, c.max_hp);
                s.element = Some(c.field01 as i32);
                // The tail layout comes from two captures; without it EXP and stats wait for s2c/10.
                match character_profile(payload) {
                    Ok(p) => {
                        (s.x, s.y) = (p.x, p.y);
                        (s.exp, s.level_exp, s.coin) =
                            (Some(p.exp), Some(p.level_exp), Some(p.coin));
                        (s.stats, s.combat) = (p.stats, Some(p.combat));
                        (s.stat_points, s.skill_points) =
                            (Some(p.stat_points), Some(p.skill_points));
                    }
                    Err(e) => out.push(Out::Log(
                        LogKind::Character,
                        format!("Không đọc được phần sau của s2c/9: {e}"),
                    )),
                }
                match character_gear(payload) {
                    Ok(g) => s.gear = g,
                    Err(e) => out.push(Out::Log(
                        LogKind::Item,
                        format!("Không đọc được trang bị trong s2c/9: {e}"),
                    )),
                }
                match character_skills(payload) {
                    Ok(k) => s.skill_levels = k.iter().map(|k| (k.id, k.level)).collect(),
                    Err(e) => out.push(Out::Log(
                        LogKind::Character,
                        format!("Không đọc được kỹ năng trong s2c/9: {e}"),
                    )),
                }
            }
            30 => match skill_table(payload) {
                Ok(t) => s.skills = Arc::new(t.skills),
                Err(e) => out.push(Out::Log(
                    LogKind::Character,
                    format!("Không đọc được cây kỹ năng (s2c/30): {e}"),
                )),
            },
            // Answer to c2s/1191, after s2c/10 kind 32 (E1): the points left. The quest step moves on with s2c/34 or s2c/39
            // as for a stat point; without either the run stops rather than spend another point.
            1191 => {
                let mut r = Reader::new(payload);
                let (stat_points, skill_points) = (r.i32()?, r.i32()?);
                (s.stat_points, s.skill_points) = (Some(stat_points), Some(skill_points));
                if let Some(u) = self.upgrading.take() {
                    let level = s.skill_levels.get(&u.id).copied().unwrap_or(0);
                    out.push(Out::Log(
                        LogKind::Character,
                        format!(
                            "Đã nâng {} lên cấp {level}; còn {skill_points} điểm kỹ năng",
                            u.name
                        ),
                    ));
                    if u.step && self.awaiting_reply {
                        self.timer = Some((
                            now + Duration::from_secs(8),
                            Wake::Silence("Đã dùng điểm kỹ năng nhưng server chưa sang bước sau"),
                        ));
                    }
                }
            }
            // The bag and the money are shown, never acted on: one that does not read is logged and left as it was.
            42 => match character_extra(payload) {
                Ok(x) => s.bag = Some(x.bag),
                Err(e) => out.push(Out::Log(
                    LogKind::Item,
                    format!("Không đọc được túi đồ (s2c/42): {e}"),
                )),
            },
            // An item picked up went to the bag (s2c/51, K3): that slot, without a whole new bag.
            51 => match bag_slot(payload) {
                Ok(item) => {
                    if let Some(b) = s.bag.as_mut() {
                        b.items.retain(|i| i.slot != item.slot);
                        b.items.push(item);
                        b.items.sort_by_key(|i| i.slot);
                    }
                }
                Err(e) => out.push(Out::Log(
                    LogKind::Item,
                    format!("Không đọc được ô túi vừa nhận đồ (s2c/51): {e}"),
                )),
            },
            // An item fell in the map, anyone's: kept a moment, as a won battle's own drops come just before its end.
            1182 => {
                let g = ground_item_add(payload)?;
                let def = book().get(g.item.item_id);
                let name = def.map_or_else(|| format!("#{}", g.item.item_id), |d| d.name.clone());
                let name = match g.item.quantity {
                    q if q > 1 => format!("{name} ×{q}"),
                    _ => name,
                };
                self.drops
                    .retain(|d| now.saturating_duration_since(d.2) < DROPS_KEPT);
                self.drops.push((g.item.uuid.clone(), name.clone(), now));
                if self.loot_until.is_some_and(|t| now < t) {
                    self.pick(g.item.uuid, name, now, out);
                }
            }
            // An item left the ground (picked up, or expired): it is not asked for again.
            1183 => {
                let (_, uuid) = ground_item_remove(payload)?;
                self.drops.retain(|d| d.0 != uuid);
            }
            1187 => match inventory(payload) {
                Ok(b) => s.bag = Some(b),
                Err(e) => out.push(Out::Log(
                    LogKind::Item,
                    format!("Không đọc được túi đồ (s2c/1187): {e}"),
                )),
            },
            // The gear after Trang bị or Cởi ra; s2c/42 brings the bag, s2c/1186 the action.
            37 => match gear_update(payload) {
                Ok(g) => s.gear = g.gear,
                Err(e) => out.push(Out::Log(
                    LogKind::Item,
                    format!("Không đọc được trang bị (s2c/37): {e}"),
                )),
            },
            1186 | 48 => {
                let done = match (opcode, self.item_wait.as_ref().map(|w| w.act)) {
                    (1186, Some(ItemAct::Equip(_))) => Some("Đã mặc"),
                    (1186, Some(ItemAct::Unequip(_))) => Some("Đã cởi"),
                    (48, Some(ItemAct::Repair(_))) => Some("Đã sửa"),
                    _ => None,
                };
                if let (Some(done), Some(w)) = (done, self.item_wait.take()) {
                    out.push(Out::Log(LogKind::Item, format!("{done} {}", w.name)));
                    // The server sends no gear after a repair; it brings the item to its full durability (P4: 0/60 →
                    // 60/60), so the gear shown is not left broken until the next login.
                    if let ItemAct::Repair(slot) = w.act {
                        if let Some(Some(i)) = s.gear.get_mut(slot as usize) {
                            if let Some(d) = book().get(i.item_id) {
                                i.durability = i.durability.max(d.durability);
                            }
                        }
                    }
                }
                // The repair of Tự sửa đồ: the run goes on.
                if opcode == 48 && self.repairing.take().is_some() {
                    self.timer = Some((now + Duration::from_millis(500), Wake::Next));
                }
            }
            46 => match currencies(payload) {
                Ok(c) => s.currencies = Some(c),
                Err(e) => out.push(Out::Log(
                    LogKind::Item,
                    format!("Không đọc được tiền (s2c/46): {e}"),
                )),
            },
            29 => s.map_id = character_location(payload)?.map_id,
            11 if payload.first() == Some(&1) => {
                let m = map_prefix(payload)?;
                (s.map_id, s.map_name, s.zone, s.x, s.y) =
                    (m.map_id, m.name, m.area as i32, m.x, m.y);
                s.zones = None;
                s.bosses.clear();
                self.zone.clear();
                // NPCs and portals. A map this decoder cannot read leaves them unknown, not an empty map in the atlas;
                // the quest run, which talks to NPCs and takes portals, stops there. A fight job needs only the mobs.
                match map_data(payload) {
                    Ok(d) => {
                        self.snap.places = d.places;
                        self.atlas.record_map(
                            &self.snap.map_id,
                            &self.snap.map_name,
                            &self.snap.places,
                        );
                    }
                    Err(e) => {
                        self.snap.places.clear();
                        out.push(Out::Log(
                            LogKind::Travel,
                            format!(
                                "Không đọc được NPC và cổng của {} (s2c/11): {e}",
                                self.snap.map_name
                            ),
                        ));
                        if self.quest_running() {
                            self.finish_quest("Không đọc được NPC và cổng của map này", out);
                        }
                    }
                }
                // Through a portal the client asks for the mobs of the new map next (B5), and after Đầu hàng for those of
                // the map it asked with c2s/40 (06-map-mobs). That map answers our c2s/11: it does not end the battle.
                let reload = std::mem::take(&mut self.reload_map);
                if self.travelling.is_some() || self.zoning.is_some() || reload {
                    let map_id = self.snap.map_id.clone();
                    Self::send(
                        out,
                        43,
                        Ctx {
                            map_id: Some(&map_id),
                            ..Ctx::default()
                        },
                    );
                }
            }
            13 => {
                let c = map_change(payload)?;
                if c.map_id != s.map_id {
                    s.shop = None;
                }
                s.map_id = c.map_id.clone();
                if let Some(z) = c.zone {
                    s.zone = z;
                }
                if let (None, Some(z)) = (&self.travelling, self.zoning) {
                    // The answer to c2s/1173: ask the map of that zone as the app does (B2, Z1).
                    let zone = c.zone.unwrap_or(z);
                    Self::send(
                        out,
                        11,
                        Ctx {
                            map_id: Some(&c.map_id),
                            zone: Some(zone),
                            ..Ctx::default()
                        },
                    );
                }
                if let Some((id, name)) = self.travelling.clone() {
                    self.timer = None;
                    out.push(Out::Log(
                        LogKind::Travel,
                        format!("Qua cổng {name}: sang {}", c.map_id),
                    ));
                    self.atlas.record_portal(
                        id,
                        Portal {
                            name,
                            map_id: Some(c.map_id.clone()),
                            ..Portal::default()
                        },
                    );
                    Self::send(
                        out,
                        11,
                        Ctx {
                            map_id: Some(&c.map_id),
                            ..Ctx::default()
                        },
                    );
                }
            }
            43 => {
                let d = map_entities(payload)?;
                self.atlas.record_mobs(&d.map_id, self.snap.zone, &d.mobs);
                self.mobs = d.mobs;
                if let Some((_, via)) = self.travelling.take() {
                    out.push(Out::Log(
                        LogKind::Travel,
                        format!("Đã tới {} qua cổng {via}", self.snap.map_name),
                    ));
                    self.move_until = None;
                    self.timer = Some((now + Duration::from_secs(2), Wake::Next));
                }
                if let Some(z) = self.zoning.take() {
                    (self.move_until, self.snap.moving) = (None, None);
                    out.push(Out::Log(
                        LogKind::Travel,
                        format!(
                            "Đã sang khu {z} của {}: {} con quái",
                            self.snap.map_name,
                            self.mobs.len()
                        ),
                    ));
                }
            }
            1263 => {
                // Until a snapshot reads, the players of the zone are unknown rather than none.
                let read = self.zone.on(opcode, payload);
                self.snap.players_unread = read.is_err();
                read?;
            }
            1167 | 1170 | 1253 => {
                self.zone.on(opcode, payload)?;
            }
            1177 => {
                let b = map_boss(payload)?;
                if let Some(gone) = b.gone {
                    self.mobs.retain(|m| m.id != gone);
                    self.snap
                        .bosses
                        .iter_mut()
                        .filter(|t| t.id == gone)
                        .for_each(|t| t.moving = true);
                } else if let Some(mob) = b.mob {
                    let [col, row] = b.tile.unwrap_or_default();
                    self.atlas
                        .record_boss(&b.map_id, self.snap.zone, &mob, [col, row]);
                    let at = BossTile {
                        id: mob.id.clone(),
                        name: mob.name.clone(),
                        level: mob.level,
                        col,
                        row,
                        moving: false,
                    };
                    match self.snap.bosses.iter_mut().find(|t| t.id == mob.id) {
                        Some(t) => *t = at,
                        None => self.snap.bosses.push(at),
                    }
                    self.bosses.insert(mob.id.clone());
                    if !self
                        .seen_bosses
                        .iter()
                        .any(|s| s.0 == b.map_id && s.1 == mob.name)
                    {
                        self.seen_bosses
                            .push((b.map_id.clone(), mob.name.clone(), mob.level));
                    }
                    if !self.mobs.iter().any(|m| m.id == mob.id) {
                        self.mobs.push(mob);
                    }
                }
            }
            10 => {
                let st = character_stats(payload)?;
                if let Some(l) = st.level {
                    if l != s.level && s.level != 0 {
                        out.push(Out::Log(LogKind::Character, format!("Lên cấp {l}")));
                    }
                    s.level = l;
                }
                if let (Some(hp), Some(max)) = (st.hp, st.max_hp) {
                    (s.hp, s.max_hp) = (hp, max);
                }
                if st.exp.is_some() {
                    (s.exp, s.level_exp, s.coin) = (st.exp, st.level_exp, st.coin);
                }
                if let Some(extra) = st.extra.filter(|e| e.len() == 6) {
                    s.combat = extra[1..].try_into().ok();
                }
                if let Some(stats) = st.stats {
                    s.stats = stats;
                }
                if let Some(skills) = &st.skills {
                    s.skill_levels
                        .extend(skills.iter().map(|k| (k.id, k.level)));
                }
                if st.stat_points.is_some() {
                    s.stat_points = st.stat_points;
                    s.skill_points = st.fields.as_ref().and_then(|f| f.first().copied());
                    self.points_changed(now);
                }
            }
            1172 => self.snap.zones = Some(zone_list(payload)?.zones),
            // Lái Buôn's menu after c2s/13 (open_shop): Dược phẩm opens the shop.
            57 => {
                let menu = npc_menu(payload)?;
                if matches!(self.shopping, Some((Shopping::Talk, _))) {
                    match menu.options.iter().find(|o| o.1 == SELLER_MENU) {
                        Some(&(option, _)) => {
                            Self::send(
                                out,
                                57,
                                Ctx {
                                    option: Some(option as i32),
                                    map_id: Some(SELLER.0),
                                    npc_id: Some(SELLER.1),
                                    ..Ctx::default()
                                },
                            );
                            self.shopping = Some((Shopping::Menu, now + SHOP_WAIT));
                        }
                        None => {
                            self.shopping = None;
                            out.push(Out::Log(
                                LogKind::Item,
                                format!("{} không có dòng {SELLER_MENU}", menu.npc),
                            ));
                        }
                    }
                }
            }
            1190 => {
                let shop = shop_list(payload)?;
                if matches!(self.shopping, Some((Shopping::Menu, _))) {
                    self.shopping = None;
                    out.push(Out::Log(
                        LogKind::Item,
                        format!("Cửa hàng Lái Buôn: {} món", shop.items.len()),
                    ));
                }
                self.snap.shop = Some(shop);
            }
            1256 => {
                let text = notice(payload)?;
                // The answer to c2s/1188 ("Bạn vừa nhận được 137 Xu khóa", "Không thể nhặt vật phẩm của người khác"),
                // also when it comes during a portal trip: it is not that portal's refusal (13-drops-items.md#g2). While
                // something else waits for its own s2c/1256 (a portal, a purchase, an item action such as Tự sửa đồ, a
                // zone), only a line about the pickup is taken for its answer.
                let picking = self.picked_at.is_some_and(|t| now < t + PICK_ANSWER);
                let about = text.contains("nhặt") || text.contains("nhận được");
                let waiting = self.travelling.is_some()
                    || self.shopping.is_some()
                    || self.item_wait.is_some()
                    || self.zoning.is_some();
                if picking && (about || !waiting) {
                    out.push(Out::Log(
                        LogKind::Item,
                        match text.contains("nhận được") {
                            true => text,
                            false => format!("Không nhặt được: {text}"),
                        },
                    ));
                    return Ok(());
                }
                out.push(Out::Log(LogKind::Server, text.clone()));
                // The purchase ("Bạn vừa mua thành công! 1 Búa Sửa Chữa", "Không đủ Xu để thực hiện"), or c2s/13 to Lái
                // Buôn refused ("Không thể thực hiện" from another map, B1).
                match self.shopping.take().map(|s| s.0) {
                    Some(Shopping::Buy {
                        name,
                        quantity,
                        cost,
                    }) => {
                        let line = match text.contains("thành công") {
                            true => format!("Đã mua {quantity} {name} ({cost})"),
                            false => format!("Chưa mua được {name}: {text}"),
                        };
                        out.push(Out::Log(LogKind::Item, line));
                    }
                    Some(_) => out.push(Out::Log(
                        LogKind::Item,
                        format!("Không mở được cửa hàng Lái Buôn: {text}"),
                    )),
                    None => {}
                }
                // The answer to Sử dụng ("Vật phẩm không thể sử dụng!") or a refusal of another item action.
                self.item_wait = None;
                if let Some((slot, name)) = self.repairing.take() {
                    self.repair_failed.insert(slot);
                    out.push(Out::Log(
                        LogKind::Item,
                        format!("Không sửa được {name}: {text}; đánh tiếp với món hỏng"),
                    ));
                    self.timer = Some((now + Duration::from_secs(1), Wake::Next));
                }
                // A portal the character may not enter: "Bạn phải đạt cấp 40 mới vào được Lạc Cốc" (Q15) or "Bạn cần hoàn
                // thành nhiệm vụ trước khi tới đây" (S1); travel() then leaves it out.
                if let Some((id, name)) = self.travelling.take() {
                    self.atlas.record_refusal(id, &name, &text);
                    self.refused.insert(id);
                    self.move_until = None;
                    self.timer = Some((now + Duration::from_secs(1), Wake::Next));
                }
                if let Some(z) = self.zoning.take() {
                    (self.move_until, self.snap.moving) = (None, None);
                    out.push(Out::Log(LogKind::Travel, format!("Chưa sang khu {z}")));
                }
            }
            39 => {
                let q = quest_data(payload)?;
                let before = self.snap.quest.as_ref().map(|q| (q.id, q.current));
                let step = q
                    .steps
                    .get(q.current.max(0) as usize)
                    .map_or("", |s| &s.text);
                out.push(Out::Log(
                    LogKind::Quest,
                    format!(
                        "Nhiệm vụ {}: {}; bước {}/{}: {step}",
                        q.id,
                        q.title,
                        q.current + 1,
                        q.steps.len()
                    ),
                ));
                let changed = before != Some((q.id, q.current));
                self.snap.quest = Some(q);
                self.awaiting_reply = false;
                if self.quest_running() && self.battle.is_none() && changed {
                    self.timer = Some((now + Duration::from_millis(1500), Wake::Next));
                }
            }
            34 => {
                let p = quest_progress(payload)?;
                if !p.text.is_empty() {
                    out.push(Out::Log(
                        LogKind::Quest,
                        format!("NPC: {}", p.text.chars().take(160).collect::<String>()),
                    ));
                }
                // A talk step is answered by s2c/34 alone (no new s2c/39), so the step is advanced here (L1 capture).
                if self.awaiting_reply
                    && self.snap.quest.as_ref().is_some_and(|q| q.id == p.quest_id)
                {
                    self.awaiting_reply = false;
                    self.advance("Server đã trả lời", out);
                }
                if self.quest_running() && self.battle.is_none() {
                    self.timer = Some((now + Duration::from_millis(1500), Wake::Next));
                }
            }
            // The server's count for the current step, right after each battle that counts (kills, or boss damage).
            1201 => {
                let progress = Reader::new(payload).i32()?;
                if let Some(q) = &mut self.snap.quest {
                    q.progress = progress;
                }
            }
            35 => {
                let c = quest_complete(payload)?;
                out.push(Out::Log(
                    LogKind::Quest,
                    format!("Xong nhiệm vụ {}: {}", c.title, c.rewards.join(", ")),
                ));
                if let Some(r) = self.snap.quest_run.as_mut().filter(|r| r.done.is_none()) {
                    r.completed += 1;
                }
            }
            // s2c/0: i8 flag; string text. s2c/5: u8 kind; i32 × 4; string text (empty in the boot notice).
            0 | 5 => {
                let mut r = Reader::new(payload);
                let text = r
                    .take(if opcode == 0 { 1 } else { 17 })
                    .and_then(|_| r.string())
                    .unwrap_or_default();
                if !text.is_empty() {
                    out.push(Out::Log(LogKind::Server, format!("Server: {text}")));
                }
            }
            // Gear durability, after every battle; inside a battle it means the server ended it.
            36 => {
                if self.left(36, now, out) {
                } else if self.battle.take().is_some() {
                    out.push(Out::Log(LogKind::Battle, "Server đã huỷ trận".into()));
                    self.timer = Some((now + Duration::from_secs(2), Wake::Next));
                }
                match gear_durability(payload) {
                    Ok(slots) => self.wear(&slots, out),
                    Err(e) => out.push(Out::Log(
                        LogKind::Item,
                        format!("Không đọc được độ bền trang bị (s2c/36): {e}"),
                    )),
                }
            }
            // Empty, at the end of a battle and after c2s/40 (05-battle).
            1214 => {
                self.left(1214, now, out);
            }
            22 => self.on_setup(payload, now, out)?,
            _ => {}
        }
        Ok(())
    }

    fn on_setup(
        &mut self,
        payload: &[u8],
        now: Instant,
        out: &mut Vec<Out>,
    ) -> crate::protocol::Result<()> {
        // A battle cannot be left, so the bot never plays two at once or drops the one it plays.
        if self.battle.is_some() {
            out.push(Out::Log(
                LogKind::Battle,
                "Server mở thêm một trận khi trận trước chưa xong; bỏ qua".into(),
            ));
            return Ok(());
        }
        let setup = battle_setup(payload)?;
        // The mob block of s2c/22 starts with the length-prefixed mob id: it tells which challenge this answers (the last
        // one when no id matches). One sent before Stop, before the job was replaced, or that timed out may open late.
        // The server has opened that battle and it cannot be left (an idle turn passes after 34 s while the mob hits), so
        // it is played, and counts for the job that sent it. A setup with no challenge of this session is not.
        let has = |id: &str| {
            let needle = Writer::new().string(id).build();
            payload.windows(needle.len()).any(|w| w == needle)
        };
        self.challenges
            .retain(|c| now.duration_since(c.at) < CHALLENGE_KEPT);
        let Some(i) = self
            .challenges
            .iter()
            .rposition(|c| has(&c.mob_id))
            .or(self.challenges.len().checked_sub(1))
        else {
            out.push(Out::Log(
                LogKind::Battle,
                "Có trận không do app mở; bỏ qua".into(),
            ));
            return Ok(());
        };
        let Challenge { mob_id, seq, .. } = self.challenges.remove(i);
        self.timer = None;
        self.battle_seq = seq;
        if seq != self.job_seq || !(self.job_running() || self.quest_running()) {
            let name = self
                .mobs
                .iter()
                .find(|m| m.id == mob_id)
                .map_or(mob_id.as_str(), |m| &m.name);
            out.push(Out::Log(LogKind::Battle, format!(
                "Trận với {name} từ thách đấu trước mới mở: vẫn đánh cho xong vì không rời trận được"
            )));
        }
        (self.snap.hp, self.snap.max_hp) = (setup.hp, setup.max_hp);
        let runner = BattleRunner::new(
            &setup,
            &mob_id,
            RunnerOptions {
                skill: self.options.skill,
                strategy: self.options.strategy.clone(),
                timed_move: self.options.timed_move,
            },
        );
        let mut acts = vec![];
        runner.start(&mut acts);
        (self.battle, self.snap.turn) = (Some(runner), None);
        self.battle_started = now;
        // As on_battle_end counts it: the quest run's unless a fight job runs; a challenge of an earlier job is neither.
        self.battle_source = if seq != self.job_seq {
            BattleSource::Other
        } else if self.job_running() {
            BattleSource::Fight
        } else if self.quest_running() {
            BattleSource::Quest
        } else {
            BattleSource::Other
        };
        (self.battle_at, self.battle_hp) = (epoch_ms(), setup.hp);
        self.apply(acts, now, out);
        Ok(())
    }
}

/// The quest run: next(), elsewhere(), travel(), fight() and onBattleEnd() of QuestBot in src/quest.ts.
impl Bot {
    fn doing(&mut self, text: String) {
        if let Some(r) = &mut self.snap.quest_run {
            r.doing = text;
        }
    }

    fn advance(&mut self, reason: &str, out: &mut Vec<Out>) {
        let Some(q) = &mut self.snap.quest else {
            return;
        };
        (q.current, q.progress) = (q.current + 1, 0);
        self.hops = 0;
        let next = q.steps.get(q.current as usize).map(|s| s.text.as_str());
        out.push(Out::Log(
            LogKind::Quest,
            format!("{reason}; bước tiếp: {}", next.unwrap_or("(hết)")),
        ));
    }

    /// Decides the next action from the current quest step.
    fn quest_next(&mut self, now: Instant, out: &mut Vec<Out>) {
        // The step moves on after the NPC reply (s2c/34), a new s2c/39, or the kill count or damage reached just below. It
        // is done once the quest is past it or a new quest came after the report; a quest moving back has not been seen.
        if let Some((id, i, text)) = self.playing.clone() {
            let at = self.snap.quest.as_ref().map(|q| (q.id, q.current));
            if at != Some((id, i)) {
                let done = at.is_some_and(|(q, current)| q != id || current > i);
                if let Some(r) = &mut self.snap.quest_run {
                    r.step_done = done;
                }
                let reason = match done {
                    true => format!("Xong bước \"{text}\""),
                    false => format!("Nhiệm vụ không còn ở bước \"{text}\""),
                };
                return self.finish_quest(&reason, out);
            }
        }
        let Some(q) = self.snap.quest.clone() else {
            return self.finish_quest("Chưa có nhiệm vụ nào", out);
        };
        let Some(step) = q.steps.get(q.current.max(0) as usize).cloned() else {
            return self.finish_quest("Không còn bước nhiệm vụ nào để làm", out);
        };
        let action = step_action(&step.text, step.npc_id);
        let reached = match &action {
            StepAction::Kill { .. } => q.progress >= step.required,
            StepAction::Damage { amount, .. } => q.progress >= *amount,
            _ => false,
        };
        if reached {
            self.advance(&format!("Xong \"{}\"", step.text), out);
            return self.quest_next(now, out);
        }
        if !matches!(action, StepAction::Stat) && self.allot(now, out) {
            return;
        }
        if self.elsewhere(&action, &q, &step.text, now, out) {
            return;
        }
        let named = |mob: &str| -> Vec<Mob> {
            self.mobs
                .iter()
                .filter(|m| m.name == mob)
                .cloned()
                .collect()
        };
        match action {
            StepAction::Kill { mob } => {
                let targets = named(&mob);
                let doing = format!("Đánh {mob} ({}/{})", q.progress, step.required);
                self.quest_fight(targets, doing, 15, now, out)
            }
            // The boss of s2c/1177 ignores c2s/15; the game challenges it with c2s/1178 (B4).
            StepAction::Damage { mob, amount } => {
                let targets = named(&mob);
                let doing = format!("Đánh boss {mob} ({}/{amount} sát thương)", q.progress);
                self.quest_fight(targets, doing, 1178, now, out)
            }
            StepAction::Level { level } if self.snap.level < level => {
                let targets = self.grind_targets();
                let doing = format!(
                    "Cày cấp {}/{level}: {}",
                    self.snap.level,
                    targets.first().map_or("?", |m| &m.name)
                );
                self.quest_fight(targets, doing, 15, now, out)
            }
            StepAction::Level { .. } => {
                self.timer = Some((
                    now + Duration::from_secs(8),
                    Wake::Silence("Đã đủ cấp nhưng server chưa sang bước sau"),
                ));
            }
            // By the stat plan when there is one, else into Cường lực.
            StepAction::Stat => {
                let stat = match self.plan_weights() {
                    Some(w) => {
                        let s = next_stat(&w, &self.given);
                        self.given[s] += 1;
                        s
                    }
                    None => 0,
                };
                let text = format!("Cộng 1 điểm tiềm năng vào {}", POTENTIALS[stat].0);
                self.doing(text.clone());
                out.push(Out::Log(LogKind::Character, text));
                let ctx = Ctx {
                    stat: Some(stat as i32),
                    amount: Some(1),
                    ..Ctx::default()
                };
                self.ask(
                    10,
                    ctx,
                    "Server không trả lời khi cộng điểm tiềm năng",
                    now,
                    out,
                )
            }
            StepAction::Skill => self.upgrade(None, now, out),
            StepAction::Talk { npc_id } => {
                let map_id = self.snap.map_id.clone();
                self.doing(step.text.clone());
                out.push(Out::Log(
                    LogKind::Quest,
                    format!("{} (NPC {npc_id})", step.text),
                ));
                let ctx = Ctx {
                    map_id: Some(&map_id),
                    npc_id: Some(npc_id),
                    ..Ctx::default()
                };
                self.ask(13, ctx, "NPC không trả lời", now, out)
            }
            StepAction::Unknown => {
                let reason = format!("Bot chưa biết làm bước \"{}\"", step.text);
                self.finish_quest(&reason, out)
            }
        }
    }

    /// Sends a talk or stat-point request; s2c/34 or s2c/39 must answer within 8 s.
    fn ask(
        &mut self,
        opcode: i32,
        ctx: Ctx,
        silence: &'static str,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        self.awaiting_reply = true;
        Self::send(out, opcode, ctx);
        self.timer = Some((now + Duration::from_secs(8), Wake::Silence(silence)));
    }

    /// True when the mob or NPC of the step is not in this map and the bot waits for it or travels.
    fn elsewhere(
        &mut self,
        action: &StepAction,
        q: &Quest,
        reason: &str,
        now: Instant,
        out: &mut Vec<Out>,
    ) -> bool {
        if let Some(mob) = action.mob() {
            if !self.mobs.iter().any(|m| m.name == mob) {
                let has = |m: &MapRecord| {
                    m.mobs.iter().any(|k| k.name == mob) || m.bosses.iter().any(|b| b.name == mob)
                };
                // A mob the atlas puts in this map, like a boss between its s2c/1177 field 1 and field 0 (~13 s), is
                // waited for here (6 × 5 s), never searched elsewhere.
                if !self.atlas.maps.get(&self.snap.map_id).is_some_and(has) {
                    return self.travel(q, reason, &has, now, out);
                }
                if self.waits >= 6 {
                    return false;
                }
                self.waits += 1;
                self.doing(format!("Đợi {mob} ({}/6)", self.waits));
                out.push(Out::Log(
                    LogKind::Quest,
                    format!("Chưa thấy {mob}, đợi 5 s ({}/6)", self.waits),
                ));
                self.timer = Some((now + Duration::from_secs(5), Wake::Next));
                return true;
            }
        }
        if let StepAction::Talk { npc_id } = *action {
            let npc = |p: &Place| p.kind == 2 && p.id == npc_id;
            if !self.snap.places.is_empty() && !self.snap.places.iter().any(npc) {
                return self.travel(
                    q,
                    reason,
                    &|m: &MapRecord| m.places.iter().any(npc),
                    now,
                    out,
                );
            }
        }
        false
    }

    /// Walks through a portal of s2c/11 (c2s/13 with its id, B5): the first of the shortest known way to a map where
    /// `wanted` holds, else one the quest names ("Tìm Đến Vân Sơn") towards a map not seen yet, else any towards a map not
    /// seen yet. Portals refused in this run are left out; at most 6 for a step.
    fn travel(
        &mut self,
        q: &Quest,
        reason: &str,
        wanted: &dyn Fn(&MapRecord) -> bool,
        now: Instant,
        out: &mut Vec<Out>,
    ) -> bool {
        let (map_id, level) = (self.snap.map_id.clone(), self.snap.level);
        let step = q
            .steps
            .get(q.current.max(0) as usize)
            .map_or("", |s| &s.text);
        let text = format!("{} {} {step}", q.title, q.description);
        let fresh: Vec<&Place> = self
            .atlas
            .portals_of(&map_id, level, &self.refused)
            .into_iter()
            .filter(|p| self.atlas.destination(p.id, &p.name, &map_id).is_none())
            .collect();
        let portal = self
            .atlas
            .route(&map_id, wanted, level, &self.refused)
            .or_else(|| {
                fresh
                    .iter()
                    .find(|p| text.contains(&p.name))
                    .map(|p| (*p).clone())
            })
            .or_else(|| fresh.first().map(|p| (*p).clone()));
        let Some(portal) = portal.filter(|_| self.hops < 6) else {
            return false;
        };
        self.hops += 1;
        self.travelling = Some((portal.id, portal.name.clone()));
        self.doing(format!("Qua cổng {}", portal.name));
        out.push(Out::Log(
            LogKind::Travel,
            format!(
                "{reason}: không ở {map_id}, qua cổng {} ({}/6)",
                portal.name, self.hops
            ),
        ));
        Self::send(
            out,
            13,
            Ctx {
                map_id: Some(&map_id),
                npc_id: Some(portal.id),
                ..Ctx::default()
            },
        );
        self.timer = Some((
            now + Duration::from_secs(8),
            Wake::Silence("Cổng không trả lời"),
        ));
        true
    }

    /// Mobs to fight while waiting for a level: the strongest kind not above own level that is not a boss.
    fn grind_targets(&self) -> Vec<Mob> {
        let mut best: Option<&Mob> = None;
        for m in &self.mobs {
            if m.level <= self.snap.level
                && !self.bosses.contains(&m.id)
                && best.is_none_or(|b| m.level > b.level)
            {
                best = Some(m);
            }
        }
        let name = best.map(|m| m.name.clone());
        self.mobs
            .iter()
            .filter(|m| Some(&m.name) == name.as_ref())
            .cloned()
            .collect()
    }

    fn quest_fight(
        &mut self,
        targets: Vec<Mob>,
        doing: String,
        opcode: i32,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        self.waits = 0;
        if targets.is_empty() {
            return self.finish_quest("Không thấy quái của bước này ở khu này", out);
        }
        let Some(r) = &mut self.snap.quest_run else {
            return;
        };
        let mob = targets[r.fights as usize % targets.len()].clone();
        r.fights += 1;
        r.doing = doing;
        out.push(Out::Log(
            LogKind::Battle,
            format!(
                "Trận {}: thách đấu {} cấp {} ({})",
                r.fights, mob.name, mob.level, mob.id
            ),
        ));
        Self::send(
            out,
            opcode,
            Ctx {
                mob_id: Some(&mob.id),
                ..Ctx::default()
            },
        );
        self.challenged(mob, now);
    }

    /// Counts a battle of the quest run. The local count is replaced by the server's s2c/1201 a few ms later. A boss is
    /// not expected to fall: its damage counts won or lost, and a loss to it does not stop the run.
    fn quest_battle_end(&mut self, end: &BattleEnd, boss: bool, now: Instant, out: &mut Vec<Out>) {
        let took = duration_text(now.saturating_duration_since(self.battle_started));
        let ran = duration_text(now.saturating_duration_since(self.run_started));
        let Some(r) = &mut self.snap.quest_run else {
            return;
        };
        if end.won {
            r.wins += 1
        } else {
            r.losses += 1
        }
        r.exp += end.exp.unwrap_or(0) as i64;
        r.coin += end.coin.unwrap_or(0) as i64;
        let (losses, max_losses) = (r.losses, r.max_losses);
        out.push(Out::Log(
            LogKind::Battle,
            format!(
                "Trận {}: {}, {} lượt trong {}, gây {} sát thương, +{} EXP, +{} xu; đã chạy {}",
                r.fights,
                if end.won { "thắng" } else { "thua" },
                end.my_turns,
                took,
                end.damage,
                end.exp.unwrap_or(0),
                end.coin.unwrap_or(0),
                ran
            ),
        ));
        let name = self
            .mobs
            .iter()
            .find(|m| m.id == end.mob_id)
            .map(|m| m.name.clone());
        if let Some(q) = &mut self.snap.quest {
            if let Some(step) = q.steps.get(q.current.max(0) as usize) {
                let action = step_action(&step.text, step.npc_id);
                if action.mob().is_some() && action.mob() == name.as_deref() {
                    match action {
                        StepAction::Damage { amount, .. } => {
                            q.progress += end.damage;
                            out.push(Out::Log(
                                LogKind::Quest,
                                format!("Sát thương lên boss: {}/{amount}", q.progress),
                            ));
                        }
                        StepAction::Kill { .. } if end.won => {
                            q.progress += 1;
                            out.push(Out::Log(
                                LogKind::Quest,
                                format!("Đã diệt {}/{}", q.progress, step.required),
                            ));
                        }
                        _ => {}
                    }
                }
            }
        }
        if !end.won && boss {
            out.push(Out::Log(
                LogKind::Battle,
                "Thua boss: không mất EXP, vẫn đánh tiếp".into(),
            ));
        }
        if !end.won && !boss && losses >= max_losses {
            return self.finish_quest(&format!("Thua {losses} trận"), out);
        }
        self.timer = Some((now + self.options.rest, Wake::Next));
    }
}

/// Potential points: the stat plan (--stats of QuestBot) and "Cộng +1" on one stat.
impl Bot {
    /// The game has let the character in (net.rs): the stat plan spends what points there are.
    pub fn on_ready(&mut self, now: Instant, out: &mut Vec<Out>) {
        if self.stat_plan.is_some() && self.idle() {
            self.next(now, out);
        }
    }

    /// Sets how potential points are spent on their own, None for not at all. With nothing running they go out now; a
    /// job or quest run spends them between battles.
    pub fn set_stats(&mut self, plan: Option<StatPlan>, now: Instant, out: &mut Vec<Out>) {
        (self.stat_plan, self.given, self.spent) = (plan, [0; 4], [0; 4]);
        (self.allot_failed, self.plan_warned) = (false, false);
        out.push(Out::Log(
            LogKind::Character,
            match plan {
                None => "Thôi tự cộng điểm tiềm năng".into(),
                Some(StatPlan::Auto) => "Tự cộng điểm tiềm năng vào chỉ số chính của hệ".into(),
                Some(StatPlan::Weights(w)) => format!(
                    "Tự cộng điểm tiềm năng theo tỉ lệ {}",
                    Self::by_stat(&w, ", ", |n| format!(" {n}"))
                ),
            },
        ));
        if self.idle() {
            self.next(now, out);
        }
    }

    /// "Cộng +1" on the stat of c2s/10 index `stat`: one point now. Not in a battle, nor while the plan waits for an
    /// answer.
    pub fn add_stat(&mut self, stat: usize, out: &mut Vec<Out>) {
        let Some(&(name, _)) = POTENTIALS.get(stat) else {
            return;
        };
        let refused = if self.battle.is_some() {
            Some("đang đánh, đợi hết trận")
        } else if self.allotting {
            Some("bot đang tự cộng điểm")
        } else if self.snap.stat_points.unwrap_or(0) <= 0 {
            Some("hết điểm tiềm năng")
        } else {
            None
        };
        if let Some(why) = refused {
            return out.push(Out::Log(
                LogKind::Character,
                format!("Chưa cộng {name}: {why}"),
            ));
        }
        out.push(Out::Log(
            LogKind::Character,
            format!("Cộng 1 điểm tiềm năng vào {name}"),
        ));
        let ctx = Ctx {
            stat: Some(stat as i32),
            amount: Some(1),
            ..Ctx::default()
        };
        Self::send(out, 10, ctx);
    }

    /// No battle, job, quest run or timer: what `next` would do is the stat plan only.
    fn idle(&self) -> bool {
        self.battle.is_none()
            && self.timer.is_none()
            && !self.job_running()
            && !self.quest_running()
    }

    fn plan_weights(&self) -> Option<[u32; 4]> {
        self.stat_plan?.weights(self.snap.element)
    }

    /// `values` by c2s/10 index as "Cường lực 3, Thân pháp 1", leaving out the zeros.
    fn by_stat(values: &[u32; 4], sep: &str, show: impl Fn(u32) -> String) -> String {
        let parts: Vec<String> = (0..4)
            .filter(|&i| values[i] > 0)
            .map(|i| format!("{}{}", POTENTIALS[i].0, show(values[i])))
            .collect();
        parts.join(sep)
    }

    /// s2c/10 kind 8, the points left. It comes last of the three that answer c2s/10 (P1), so a point of the plan goes
    /// on to the next in 250 ms; points that came with a level while nothing runs go out the same way.
    fn points_changed(&mut self, now: Instant) {
        if self.allotting {
            self.allotting = false;
            self.timer = Some((now + Duration::from_millis(250), Wake::Next));
        } else if self.stat_plan.is_some() && !self.allot_failed && self.idle() {
            self.timer = Some((now + Duration::from_millis(250), Wake::Next));
        }
    }

    /// One point of the stat plan (allot of QuestBot): c2s/10 (stat, 1), the next once s2c/10 kind 8 answers it, so
    /// points go out between battles only. Points for the "Nâng điểm tiềm năng" steps still ahead in the quest are kept
    /// for them. True when a point was sent.
    fn allot(&mut self, now: Instant, out: &mut Vec<Out>) -> bool {
        if self.allot_failed {
            return false;
        }
        let Some(weights) = self.plan_weights() else {
            if self.stat_plan.is_some() && !self.plan_warned {
                self.plan_warned = true;
                out.push(Out::Log(
                    LogKind::Character,
                    "Chưa biết chỉ số chính của hệ này: không tự cộng điểm tiềm năng".into(),
                ));
            }
            return false;
        };
        let keep = self.snap.quest.as_ref().map_or(0, |q| {
            q.steps
                .iter()
                .skip(q.current.max(0) as usize)
                .filter(|s| matches!(step_action(&s.text, s.npc_id), StepAction::Stat))
                .count() as i32
        });
        let left = self.snap.stat_points.unwrap_or(0);
        if left <= keep {
            if self.spent.iter().any(|&n| n > 0) {
                let kept = match keep {
                    0 => String::new(),
                    n => format!(", chừa {n} cho bước \"Nâng điểm tiềm năng\""),
                };
                out.push(Out::Log(
                    LogKind::Character,
                    format!(
                        "Đã tự cộng điểm tiềm năng: {}; còn {left}{kept}",
                        Self::by_stat(&self.spent, ", ", |n| format!(" +{n}"))
                    ),
                ));
                self.spent = [0; 4];
            }
            return false;
        }
        if self.spent.iter().all(|&n| n == 0) {
            out.push(Out::Log(
                LogKind::Character,
                format!("Tự cộng {} điểm tiềm năng", left - keep),
            ));
        }
        let stat = next_stat(&weights, &self.given);
        self.given[stat] += 1;
        self.spent[stat] += 1;
        self.allotting = true;
        let ctx = Ctx {
            stat: Some(stat as i32),
            amount: Some(1),
            ..Ctx::default()
        };
        Self::send(out, 10, ctx);
        self.timer = Some((now + Duration::from_secs(8), Wake::StatSilence));
        true
    }
}

/// Skill levels: the quest step "Sử dụng điểm kỹ năng" and Nâng cấp of the Kỹ năng tab, both c2s/1191 (id, 1).
impl Bot {
    /// Nâng cấp on skill `id`: one level now, when the tab would allow it. Not in a battle, nor while another c2s/1191
    /// waits for its answer.
    pub fn upgrade_skill(&mut self, id: i32, now: Instant, out: &mut Vec<Out>) {
        if self.snap.skills.iter().all(|k| k.id != id) {
            return out.push(Out::Log(
                LogKind::Character,
                format!("Chưa nâng kỹ năng {id}: không có trong cây"),
            ));
        }
        self.upgrade(Some(id), now, out);
    }

    /// c2s/1191 (id, 1) for skill `id`, or for the step the first skill of the s2c/30 tree that can take a level now (for
    /// a new character the root: Hỏa Cầu Thuật 1000, Băng Tiễn Thuật 4000).
    fn upgrade(&mut self, id: Option<i32>, now: Instant, out: &mut Vec<Out>) {
        let step = id.is_none();
        let skills = Arc::clone(&self.snap.skills);
        let points = self.snap.skill_points.unwrap_or(0);
        let nodes = skill_tree(&skills, &self.snap.skill_levels, self.snap.level, points);
        let node = match id {
            Some(id) => nodes.iter().find(|n| n.skill.id == id),
            None => nodes.iter().find(|n| n.blockers.is_empty()),
        };
        let Some(node) = node else {
            let reason = match skills.is_empty() {
                true => "Chưa nhận cây kỹ năng (s2c/30)".to_string(),
                false => format!(
                    "Không kỹ năng nào lên cấp được lúc này (cấp {}, {points} điểm kỹ năng)",
                    self.snap.level
                ),
            };
            return self.finish_quest(&reason, out);
        };
        let (name, level) = (node.skill.name.clone(), node.level + 1);
        let pending = self
            .upgrading
            .as_ref()
            .is_some_and(|u| now < u.at + Duration::from_secs(8));
        let refused = if !step && self.battle.is_some() {
            Some("đang đánh, đợi hết trận".to_string())
        } else if !step && pending {
            Some("đang đợi server trả lời lần nâng trước".to_string())
        } else if !node.blockers.is_empty() {
            Some(node.blockers.join(", "))
        } else {
            None
        };
        if let Some(why) = refused {
            return out.push(Out::Log(
                LogKind::Character,
                format!("Chưa nâng {name}: {why}"),
            ));
        }
        let cost = node.next.map_or(0, |n| n.cost);
        let text = format!("Nâng {name} lên cấp {level}");
        out.push(Out::Log(
            LogKind::Character,
            format!("{text} ({cost} điểm kỹ năng)"),
        ));
        self.upgrading = Some(Upgrade {
            id: node.skill.id,
            name,
            at: now,
            step,
        });
        let ctx = Ctx {
            skill_id: Some(node.skill.id),
            amount: Some(1),
            ..Ctx::default()
        };
        if step {
            self.doing(text);
            self.ask(1191, ctx, "Server không trả lời khi nâng kỹ năng", now, out);
        } else {
            Self::send(out, 1191, ctx);
        }
    }
}

/// Item actions of the Túi đồ tab (12-skills-items.md#c2s-1186): c2s/1186 to wear or take off, c2s/84 to use, c2s/48 to
/// repair. The server answers with s2c/37 and s2c/42 (gear and bag), s2c/1186, s2c/48, or a notice.
impl Bot {
    /// One button of the item detail. Refused, with the reason in the log and nothing sent, in a battle, while the last
    /// action waits for its answer (5 s), or when the item cannot take it: a potion outside a battle, a repair without
    /// a hammer, an item taken off into a full bag.
    pub fn item(&mut self, act: ItemAct, now: Instant, out: &mut Vec<Out>) {
        let (slot, worn) = match act {
            ItemAct::Equip(s) | ItemAct::Use(s) => (s, false),
            ItemAct::Unequip(s) | ItemAct::Repair(s) => (s, true),
        };
        let bag = self.snap.bag.as_ref();
        let item = match worn {
            true => self.snap.gear.get(slot as usize).and_then(Option::as_ref),
            false => bag.and_then(|b| b.items.iter().find(|i| i.slot == slot)),
        };
        let place = match worn {
            true => format!("ô trang bị {slot}"),
            false => format!("ô túi {}", slot as u32 + 1),
        };
        let Some(item) = item else {
            return out.push(Out::Log(
                LogKind::Item,
                format!("Không có món nào ở {place}"),
            ));
        };
        let def = book().get(item.item_id);
        let name = def.map_or_else(|| format!("#{}", item.item_id), |d| d.name.clone());
        let kind = def.map(|d| d.kind);
        let most = def.map_or(0, |d| d.durability);
        let pending = self
            .item_wait
            .as_ref()
            .is_some_and(|w| now < w.at + Duration::from_secs(5));
        let full = bag.is_some_and(|b| b.items.len() as i32 >= b.capacity);
        let hammer = bag.is_some_and(|b| b.items.iter().any(|i| i.item_id == HAMMER));
        let refused = if self.battle.is_some() {
            Some("đang đánh, đợi hết trận")
        } else if pending {
            Some("đang đợi server trả lời lần trước")
        } else {
            match act {
                ItemAct::Equip(_) if kind.is_some_and(|k| k > 7) => Some("không phải trang bị"),
                ItemAct::Unequip(_) if full => Some("túi đồ đã đầy"),
                ItemAct::Use(_) if kind == Some(POTION) => Some("bình chỉ dùng được trong trận"),
                ItemAct::Use(_) if kind.is_some_and(|k| k <= 7) => Some("là trang bị, hãy mặc"),
                ItemAct::Repair(_) if item.durability < 0 => Some("món này không có độ bền"),
                ItemAct::Repair(_) if item.durability >= most => Some("độ bền còn đầy"),
                ItemAct::Repair(_) if !hammer => Some("cần 1 Búa sửa chữa trong túi"),
                _ => None,
            }
        };
        let verb = match act {
            ItemAct::Equip(_) => "Mặc",
            ItemAct::Unequip(_) => "Cởi",
            ItemAct::Use(_) => "Dùng",
            ItemAct::Repair(_) => "Sửa",
        };
        if let Some(why) = refused {
            return out.push(Out::Log(
                LogKind::Item,
                format!("Chưa {} {name}: {why}", verb.to_lowercase()),
            ));
        }
        out.push(Out::Log(LogKind::Item, format!("{verb} {name} ({place})")));
        let ctx = match act {
            ItemAct::Equip(_) | ItemAct::Unequip(_) => Ctx {
                action: Some(matches!(act, ItemAct::Unequip(_)) as i32),
                slot: Some(slot as i32),
                ..Ctx::default()
            },
            ItemAct::Use(_) | ItemAct::Repair(_) => Ctx {
                slot: Some(slot as i32),
                place: Some(0),
                ..Ctx::default()
            },
        };
        let opcode = match act {
            ItemAct::Equip(_) | ItemAct::Unequip(_) => 1186,
            ItemAct::Use(_) => 84,
            ItemAct::Repair(_) => 48,
        };
        Self::send(out, opcode, ctx);
        self.item_wait = Some(ItemWait { act, name, at: now });
    }

    /// Cài đặt đánh, from the UI (accounts.json keeps it). It counts from the next battle of a run.
    pub fn set_fight(&mut self, settings: FightSettings, out: &mut Vec<Out>) {
        if settings == self.fight {
            return;
        }
        if settings.repair != self.fight.repair {
            out.push(Out::Log(
                LogKind::Item,
                match settings.repair {
                    true => "Bật tự sửa đồ: món đang mặc bị hỏng sẽ được sửa bằng búa trong túi trước trận sau",
                    false => "Tắt tự sửa đồ",
                }
                .into(),
            ));
            (self.repair_failed, self.repair_warned) = (HashSet::new(), false);
        }
        if settings.pickup != self.fight.pickup {
            out.push(Out::Log(
                LogKind::Item,
                match settings.pickup {
                    true => "Bật tự nhặt đồ: đồ của mình rơi sau mỗi trận thắng sẽ được nhặt",
                    false => "Tắt tự nhặt đồ",
                }
                .into(),
            ));
        }
        self.fight = settings;
    }

    /// Tự nhặt đồ, at the end of a won battle (13-drops-items.md#g2): its own drops came just before the end, in the same
    /// read, and a few may come just after, so every item fallen within LOOT of it, before or after, is picked up with
    /// c2s/1188 from where the character stands; the server does not check the distance. A stranger's item in that window
    /// is refused for its first 16 s ("Không thể nhặt vật phẩm của người khác"), which costs nothing.
    fn loot(&mut self, now: Instant, out: &mut Vec<Out>) {
        self.loot_until = Some(now + LOOT);
        self.asked.clear();
        let own: Vec<(String, String)> = self
            .drops
            .iter()
            .filter(|d| now.saturating_duration_since(d.2) <= LOOT)
            .map(|d| (d.0.clone(), d.1.clone()))
            .collect();
        for (uuid, name) in own {
            self.pick(uuid, name, now, out);
        }
    }
    /// Queues an item for c2s/1188, once; one goes out every PICK_GAP.
    fn pick(&mut self, uuid: String, name: String, now: Instant, out: &mut Vec<Out>) {
        if self.asked.contains(&uuid) || self.to_pick.iter().any(|p| p.0 == uuid) {
            return;
        }
        self.to_pick.push_back((uuid, name));
        if self.pick_at.is_none() {
            self.pick_next(now, out);
        }
    }
    fn pick_next(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some((uuid, _)) = self.to_pick.pop_front() else {
            self.pick_at = None;
            return;
        };
        Self::send(
            out,
            1188,
            Ctx {
                uuid: Some(&uuid),
                ..Ctx::default()
            },
        );
        self.asked.insert(uuid);
        (self.picked_at, self.pick_at) = (Some(now), Some(now + PICK_GAP));
    }

    /// s2c/36 after a battle: the durability of each worn item. One that just reached 0 is said in the log, as it adds
    /// nothing until it is repaired (10-quests.md#kết-quả-q3-q4).
    fn wear(&mut self, slots: &[Option<i32>], out: &mut Vec<Out>) {
        for (slot, durability) in slots.iter().enumerate() {
            let (Some(d), Some(Some(item))) = (*durability, self.snap.gear.get_mut(slot)) else {
                continue;
            };
            if d == 0 && item.durability > 0 {
                let def = book().get(item.item_id);
                let name = def.map_or_else(|| format!("#{}", item.item_id), |d| d.name.clone());
                let most = def.map_or(0, |d| d.durability);
                out.push(Out::Log(
                    LogKind::Item,
                    format!("{name} đã hỏng (độ bền 0/{most})"),
                ));
            }
            item.durability = d;
        }
    }

    /// Tự sửa đồ (FightSettings::repair), from next() between the battles of a fight job or quest run: the first worn
    /// item at durability 0 is repaired with a Búa Sửa Chữa of the bag (c2s/48), and the run goes on once s2c/48 answers,
    /// or REPAIR_WAIT later. An item the server did not repair is left for the rest of the run; without a hammer the run
    /// goes on with the item broken, said once per run. Nothing goes out while a button of the Túi đồ tab waits for its
    /// answer: that one may be the same repair. True while the repair waits for its answer.
    fn auto_repair(&mut self, now: Instant, out: &mut Vec<Out>) -> bool {
        if let Some((slot, name)) = self.repairing.take() {
            self.repair_failed.insert(slot);
            out.push(Out::Log(
                LogKind::Item,
                format!(
                    "Server không trả lời khi sửa {name} sau {} s; đánh tiếp với món hỏng",
                    REPAIR_WAIT.as_secs()
                ),
            ));
        }
        if self
            .item_wait
            .as_ref()
            .is_some_and(|w| now < w.at + Duration::from_secs(5))
        {
            return false;
        }
        let broken = self.snap.gear.iter().enumerate().find_map(|(slot, g)| {
            let item = g.as_ref()?;
            let def = book().get(item.item_id)?;
            (item.durability == 0
                && def.durability > 0
                && !self.repair_failed.contains(&(slot as u8)))
            .then(|| (slot as u8, def.name.clone(), def.durability))
        });
        let Some((slot, name, most)) = broken.filter(|_| self.fight.repair) else {
            return false;
        };
        let hammers: i32 = self.snap.bag.as_ref().map_or(0, |b| {
            b.items
                .iter()
                .filter(|i| i.item_id == HAMMER)
                .map(|i| i.quantity.max(1))
                .sum()
        });
        if hammers == 0 {
            if !self.repair_warned {
                self.repair_warned = true;
                out.push(Out::Log(
                    LogKind::Item,
                    format!("{name} đang hỏng (độ bền 0/{most}) nhưng túi hết Búa Sửa Chữa: đánh tiếp với món hỏng"),
                ));
            }
            return false;
        }
        out.push(Out::Log(
            LogKind::Item,
            format!(
                "Tự sửa {name} (độ bền 0/{most}, ô trang bị {slot}); còn {} búa sau lần này",
                hammers - 1
            ),
        ));
        let ctx = Ctx {
            slot: Some(slot as i32),
            place: Some(0),
            ..Ctx::default()
        };
        Self::send(out, 48, ctx);
        self.item_wait = Some(ItemWait {
            act: ItemAct::Repair(slot),
            name: name.clone(),
            at: now,
        });
        self.repairing = Some((slot, name));
        self.timer = Some((now + REPAIR_WAIT, Wake::Next));
        true
    }
}

/// The Dược phẩm shop of Lái Buôn (12-skills-items.md#c2s-1190): c2s/13 to him, c2s/57 for Dược phẩm, and s2c/1190 lists
/// it; c2s/1190 buys a line, and the server answers with a notice, then the bag (s2c/42) and the money (s2c/46).
impl Bot {
    /// Why the shop cannot be used now: busy, a step of it waiting, or away from M1.
    fn shop_refusal(&self) -> Option<String> {
        self.busy().map(String::from).or_else(|| {
            if self.shopping.is_some() {
                Some("đang đợi Lái Buôn trả lời".into())
            } else if self.snap.map_id != SELLER.0 {
                Some("Lái Buôn ở Làng Thanh Khê (M1), hãy sang M1 trước".into())
            } else {
                None
            }
        })
    }

    /// Opens the shop: c2s/13 to Lái Buôn, then c2s/57 when his menu comes. Refused, with the reason in the log and
    /// nothing sent, while busy, while a step of the shop waits, and away from M1.
    pub fn open_shop(&mut self, now: Instant, out: &mut Vec<Out>) {
        if let Some(why) = self.shop_refusal() {
            return out.push(Out::Log(LogKind::Item, format!("Chưa mở cửa hàng: {why}")));
        }
        out.push(Out::Log(
            LogKind::Item,
            format!("Mở cửa hàng Lái Buôn ({SELLER_MENU})"),
        ));
        Self::send(
            out,
            13,
            Ctx {
                map_id: Some(SELLER.0),
                npc_id: Some(SELLER.1),
                ..Ctx::default()
            },
        );
        self.shopping = Some((Shopping::Talk, now + SHOP_WAIT));
    }

    /// Buys `quantity` of the shop line `shop_id` (c2s/1190). Refused as open_shop is, and before the shop is open, for
    /// a line it does not have, a count outside 1..=MAX_BUY, or without the money for it.
    pub fn buy(&mut self, shop_id: i32, quantity: i32, now: Instant, out: &mut Vec<Out>) {
        let line = self
            .snap
            .shop
            .as_ref()
            .and_then(|s| s.items.iter().find(|i| i.shop_id == shop_id))
            .cloned();
        let name = line.as_ref().map_or_else(
            || format!("ô {shop_id}"),
            |l| {
                book()
                    .get(l.item_id)
                    .map_or_else(|| format!("#{}", l.item_id), |d| d.name.clone())
            },
        );
        let locked = line.as_ref().is_some_and(|l| l.currency == 1);
        let money = if locked { "Xu khóa" } else { "Xu" };
        let cost = line
            .as_ref()
            .map_or(0, |l| l.price as i64 * quantity as i64);
        let have = self
            .snap
            .currencies
            .as_ref()
            .map(|c| if locked { c.xu_khoa } else { c.xu });
        let why = self.shop_refusal().or_else(|| {
            if self.snap.shop.is_none() {
                Some("mở cửa hàng trước".into())
            } else if line.is_none() {
                Some("cửa hàng không có ô này".into())
            } else if !(1..=MAX_BUY).contains(&quantity) {
                Some(format!("số lượng phải từ 1 tới {MAX_BUY}"))
            } else {
                have.filter(|&h| cost > h)
                    .map(|h| format!("không đủ {money} (cần {cost}, có {h})"))
            }
        });
        if let Some(why) = why {
            return out.push(Out::Log(LogKind::Item, format!("Chưa mua {name}: {why}")));
        }
        let cost = format!("{cost} {money}");
        out.push(Out::Log(
            LogKind::Item,
            format!("Mua {quantity} {name} giá {cost}"),
        ));
        Self::send(
            out,
            1190,
            Ctx {
                shop_id: Some(shop_id),
                quantity: Some(quantity),
                ..Ctx::default()
            },
        );
        self.shopping = Some((
            Shopping::Buy {
                name,
                quantity,
                cost,
            },
            now + SHOP_WAIT,
        ));
    }
}

/// Khu vực and Đổi map of the Vị trí card: c2s/1172 and c2s/1173 for the zones of the map
/// (06-map-mobs.md#đổi-khu-vực-trong-cùng-map), c2s/13 through the portals of the atlas for another map (10-quests.md#cổng).
impl Bot {
    /// A zone change or a trip under way.
    fn moving(&self) -> bool {
        self.zoning.is_some() || self.trip.is_some()
    }

    /// Why the character cannot move now: a battle, a job, a quest run, or a move under way.
    fn busy(&self) -> Option<&'static str> {
        if self.battle.is_some() {
            Some("đang đánh, đợi hết trận")
        } else if self.job_running() {
            Some("đang tự đánh quái, bấm Dừng trước")
        } else if self.quest_running() {
            Some("đang tự làm nhiệm vụ, bấm Dừng trước")
        } else if self.moving() || self.travelling.is_some() {
            Some("đang đổi chỗ")
        } else {
            None
        }
    }

    /// The maps of the atlas, nearest first, then those no known way leads to.
    fn maps(&self) -> Vec<MapChoice> {
        let hops = self
            .atlas
            .hops(&self.snap.map_id, self.snap.level, &self.refused);
        let mut out: Vec<MapChoice> = self
            .atlas
            .maps
            .iter()
            .map(|(id, m)| MapChoice {
                map_id: id.clone(),
                name: m.name.clone(),
                level: self
                    .atlas
                    .world
                    .iter()
                    .find(|w| &w.map_id == id)
                    .map(|w| w.level),
                hops: hops.get(id).copied(),
            })
            .collect();
        out.sort_by_key(|m| m.hops.unwrap_or(u32::MAX));
        out
    }

    /// Asks the zones of the map and their players (c2s/1172); s2c/1172 fills `zones`.
    pub fn list_zones(&mut self, out: &mut Vec<Out>) {
        Self::send(out, 1172, Ctx::default());
    }

    /// Moves to another zone of the map as the Khu vực panel does: c2s/1173, s2c/13 with the zone, c2s/11 of that zone,
    /// s2c/11, c2s/43, s2c/43 (Z1). Refused, with the reason in the log and nothing sent, while busy, for the zone the
    /// character is in, and for a zone the last list does not have or shows full. The server puts the character back in
    /// zone 0 at the next login.
    pub fn change_zone(&mut self, zone: i32, now: Instant, out: &mut Vec<Out>) {
        let listed = self.snap.zones.as_ref();
        let found = listed.and_then(|l| l.iter().find(|z| z.zone == zone));
        let why = self.busy().map(String::from).or_else(|| {
            if zone == self.snap.zone {
                Some(format!("đang ở khu {zone}"))
            } else if !(0..=255).contains(&zone) || (listed.is_some() && found.is_none()) {
                Some(format!("không có khu {zone}"))
            } else {
                found
                    .filter(|z| z.players >= z.capacity)
                    .map(|z| format!("khu đã đầy ({}/{})", z.players, z.capacity))
            }
        });
        if let Some(why) = why {
            return out.push(Out::Log(
                LogKind::Travel,
                format!("Chưa sang khu {zone}: {why}"),
            ));
        }
        out.push(Out::Log(LogKind::Travel, format!("Sang khu {zone}")));
        Self::send(
            out,
            1173,
            Ctx {
                zone: Some(zone),
                ..Ctx::default()
            },
        );
        self.zoning = Some(zone);
        self.snap.moving = Some(format!("Sang khu {zone}"));
        self.move_until = Some(now + Duration::from_secs(8));
    }

    /// "Đổi map": walks through portals (c2s/13 with the portal id, B5) to the map by the shortest way the atlas knows,
    /// at most 6 portals, a portal the server refuses left out. Refused while busy, for the map the character is on, and
    /// for one no known way leads to.
    pub fn go_to(&mut self, map_id: &str, now: Instant, out: &mut Vec<Out>) {
        let name = self
            .atlas
            .maps
            .get(map_id)
            .map_or_else(|| map_id.to_string(), |m| m.name.clone());
        let why = self.busy().map(String::from).or_else(|| {
            let ways = self
                .atlas
                .hops(&self.snap.map_id, self.snap.level, &HashSet::new());
            if map_id == self.snap.map_id {
                Some("đang ở map này".into())
            } else if !ways.contains_key(map_id) {
                Some("chưa biết đường qua cổng tới đó".into())
            } else {
                None
            }
        });
        if let Some(why) = why {
            return out.push(Out::Log(
                LogKind::Travel,
                format!("Chưa đi tới {name}: {why}"),
            ));
        }
        out.push(Out::Log(
            LogKind::Travel,
            format!("Bắt đầu: đi tới {name} ({map_id})"),
        ));
        (self.trip, self.hops) = (Some((map_id.to_string(), name)), 0);
        self.refused.clear();
        self.trip_next(now, out);
    }

    /// The next portal of the trip, or its end: on the map, past 6 portals, or no known way left.
    fn trip_next(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some((to, name)) = self.trip.clone() else {
            return;
        };
        let here = self.snap.map_id.clone();
        let portal = self.atlas.route(
            &here,
            &|m: &MapRecord| m.map_id == to,
            self.snap.level,
            &self.refused,
        );
        let end = if here == to {
            Some(format!("đã tới {name}"))
        } else if self.hops >= 6 {
            Some(format!("qua 6 cổng vẫn chưa tới {name}"))
        } else if portal.is_none() {
            Some(format!("không còn đường tới {name}"))
        } else {
            None
        };
        if let Some(end) = end {
            (self.trip, self.snap.moving, self.move_until) = (None, None, None);
            return out.push(Out::Log(LogKind::Travel, format!("Kết thúc: {end}")));
        }
        let portal = portal.unwrap();
        self.hops += 1;
        self.travelling = Some((portal.id, portal.name.clone()));
        self.snap.moving = Some(format!("Đi tới {name}"));
        out.push(Out::Log(
            LogKind::Travel,
            format!("Qua cổng {} ({}/6)", portal.name, self.hops),
        ));
        Self::send(
            out,
            13,
            Ctx {
                map_id: Some(&here),
                npc_id: Some(portal.id),
                ..Ctx::default()
            },
        );
        self.move_until = Some(now + Duration::from_secs(8));
    }
}

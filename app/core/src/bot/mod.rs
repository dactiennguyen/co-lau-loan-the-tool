//! What one logged-in account knows and does: the character, map, mobs and current quest from the world packets, and
//! one of two jobs. A fight job ("đánh X N lần") follows QuestBot --farm of src/bot/quest.ts: c2s/15 for a mob, c2s/1178 for
//! a boss of s2c/1177, 8 s for s2c/22, 6 × 5 s of waiting while a boss changes tiles, 3 s of rest between battles, and
//! losses (except to a boss) up to `max_losses`. A quest run ("Tự làm nhiệm vụ") is QuestBot itself: it plays the steps
//! of s2c/39 it knows (talk with c2s/13, kill, boss damage, level, a stat point, a skill level) and walks through portals
//! when the NPC or mob of a step is in another map. Without I/O, like BattleRunner.
use crate::atlas::{Atlas, MapRecord, Portal};
use crate::battle::{battle_setup, mob_block, Setup, Strategy};
use crate::battle_record::{BattleData, Recorder};
use crate::battle_view::{self, BattleEvent, EndKind, Gauge};
use crate::items::{
    bag_after, bag_slot, book, character_extra, character_gear, character_tail, currencies,
    gear_durability, gear_update, ground_item_add, ground_item_remove, ground_items, inventory,
    item_used, Bag, Currencies, ItemRecord, SlotLeft,
};
use crate::mail::{MailBody, MailHeader};
use crate::market::{MarketPage, MarketTabs};
use crate::npc::{
    self, craft_window, merge_plan, quote, service_preview, service_result, service_slot,
    service_window, stone_result, transmute_item, transmute_target, upgrade_stones, BagItem,
    MergeOptions, Quote, WindowKind,
};
use crate::potentials::{next_stat, StatPlan, POTENTIALS};
use crate::protocol::{
    character_location, character_prefix, character_profile, map_prefix, Reader, Writer,
};
use crate::quest::{step_action, StepAction};
use crate::requests::{build, Ctx};
use crate::runner::{Act, BattleEnd, BattleRunner, RunnerOptions, Skill, Turn};
pub use crate::runner_v3::Algorithm;
use crate::runner_v3::{Memory, Runner};
use crate::skills::{character_skills, skill_table, skill_tree, SkillDef};
use crate::world::{
    character_stats, duel_invite, map_boss, map_change, map_data, map_entities, notice, npc_menu,
    quest_complete, quest_data, quest_progress, shop_list, zone_list, DuelInvite, Mob, Nearby,
    NpcMenu, Place, Quest, ShopList, Zone, ZonePlayers,
};
use std::collections::{BTreeMap, HashSet, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

mod bachho;
pub use bachho::bach_ho_result;
mod daily;
mod eggs;
mod fight;
mod gift;
mod items;
mod mailbox;
mod market;
mod merge;
mod pace;
mod packets;
mod quest;
mod ranking;
mod record;
mod reload;
mod shop;
mod smith;
mod stats;
mod travel;
mod types;
mod waits;
mod wander;
mod welfare;
pub use fight::{HP_POTION_SHARE, MP_POTION_SHARE};
pub use types::*;

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
/// A battle without a packet of its own this long is left (Đầu hàng) so the job goes on: every turn has a clock of 30 s
/// that the server ends with s2c/21 or s2c/24, so a battle this quiet is stuck (2.2.5: a swap in the mob's turn left
/// battles hanging for 40 minutes).
const BATTLE_SILENT: Duration = Duration::from_secs(90);
/// Cẩm nang: a mob more than 20 levels below the character gives no EXP, Xu or drops. Measured on 02/11: won battles 15–18
/// levels below gave EXP, 21 and more none (cllt.db of the app, symap and the others).
pub const NO_EXP_GAP: i32 = 20;

/// A button of the item detail (12-skills-items.md#c2s-1186): Trang bị the item of a bag slot, Cởi ra the one of a gear
/// slot, Sử dụng a bag slot, Sửa chữa a gear slot, Vứt bỏ a bag slot; and Sắp xếp under the bag (c2s/1257).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ItemAct {
    Equip(u8),
    Unequip(u8),
    Use(u8),
    Discard(u8),
    Sort,
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
/// Nhặt cả đồ người khác (13-drops-items.md#k3): the server keeps an item for whoever dropped it 16–17 s, so another's is
/// asked for from OTHERS_AGE after it fell, at most OTHERS_PER_WIN after a won battle (one every PICK_GAP, within the rest
/// before the next). An item lies GROUND_LIFE in all, which gives the age of those already there on entering a zone.
const OTHERS_AGE: Duration = Duration::from_secs(18);
const OTHERS_PER_WIN: usize = 8;
const GROUND_LIFE: Duration = Duration::from_secs(601);

/// An item fallen in the map (s2c/1182, s2c/1184), for Tự nhặt đồ: its uuid on the ground, what it is and how many, its
/// element (0xff for an item that is not gear) and quality (field4, items::quality_name), when it fell, and whether it
/// is another's (Nhặt cả đồ người khác).
#[derive(Debug, Clone)]
struct Fallen {
    uuid: String,
    item: Picked,
    element: u8,
    quality: u8,
    at: Instant,
    other: bool,
}
impl Fallen {
    fn of(item: &ItemRecord, at: Instant, other: bool) -> Self {
        Self {
            uuid: item.uuid.clone(),
            item: Picked::of(item.item_id, item.quantity.max(1) as i64),
            element: item.element,
            quality: item.field4,
            at,
            other,
        }
    }
}
/// The won battle whose drops Tự nhặt đồ picks up, for the PickupRecord of each.
#[derive(Debug, Clone)]
struct LootFrom {
    battle_at: u64,
    map_name: String,
    mob_name: String,
    source: BattleSource,
}

/// Lái Buôn (NPC 106 of M1) and the line of his menu that opens the Dược phẩm shop (12-skills-items.md#c2s-1190). The
/// server answers c2s/13 to him from anywhere on M1, and "Không thể thực hiện" from another map (B1).
const SELLER: (&str, i32) = ("M1", 106);
/// The Dược phẩm shop (npc::SHOPS), opened by open_shop.
const SELLER_KIND: u8 = 6;
/// How long a step of the shop waits for the server.
const SHOP_WAIT: Duration = Duration::from_secs(8);

/// Mua xong quay về chỗ cũ: the map (id, name) and zone the trip to Lái Buôn started from (go_to_shop), and whether
/// the Cửa hàng dialog was closed since (shop_closed), after which the bot walks back there (walk_back).
#[derive(Debug, Clone)]
struct ShopBack {
    map_id: String,
    name: String,
    zone: i32,
    closed: bool,
}

/// Where the shop stands: c2s/13 waits for s2c/57, c2s/57 for the next menu (s2c/57) while lines of the shop's path are
/// `left`, then for s2c/1190; c2s/1190 waits for the notice of the purchase. `npc` names the seller for the log.
#[derive(Debug, Clone)]
enum Shopping {
    Talk {
        npc: i32,
        left: Vec<u8>,
    },
    Menu {
        npc: i32,
        left: Vec<u8>,
    },
    Buy {
        name: String,
        quantity: i32,
        cost: String,
    },
}

/// An item action waiting for its answer (s2c/1186, s2c/48, s2c/83 for Vứt bỏ, s2c/1187 for Sắp xếp, or a notice), and
/// the item's name for the log.
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
    /// A level of Tự cộng kỹ năng the server did not answer in 8 s.
    SkillSilence,
    /// Chờ giữa các bước nhiệm vụ is over: the quest run does what it waited to do (Bot::step_hold).
    Step,
}

pub struct Bot {
    pub snap: Snapshot,
    mobs: Vec<Mob>,
    /// Ids of the bosses of s2c/1177.
    bosses: HashSet<String>,
    /// Bosses of s2c/1177 by map (name, level), kept while they change tiles, as recordBoss keeps them in the TS atlas.
    seen_bosses: Vec<(String, String, i32, Option<i32>)>,
    zone: ZonePlayers,
    /// data/maps.json and what this session has seen since.
    atlas: Atlas,
    options: BotOptions,
    battle: Option<Runner>,
    /// What the v3 battles of this session taught about each side (BattleIo.memory of the TS side).
    battle_memory: Memory,
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
    /// The zones the quest run left for the current step because its mob or boss was not there (quest_zone), and
    /// whether the zone list was asked in this zone.
    zone_tries: Vec<i32>,
    zone_list_asked: bool,
    /// A talk or stat-point step is answered by s2c/34 alone.
    awaiting_reply: bool,
    /// Duels taken for the current talk step (Đồng ý in its s2c/57, npc_dialog); a fourth ends the run.
    duels: u32,
    /// Nói chuyện chosen in the dialog of this c2s/13 (a menu before the step's own, npc_dialog); a second menu without
    /// Đồng ý after it ends the run.
    talked: bool,
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
    /// Battles opened in this session, and how the last one ended: the `before` of the next battle data (record.rs).
    battles_started: u32,
    last_battle: Option<record::LastBattle>,
    /// Lưu dữ liệu trận: the lines of the battle on, from its s2c/22 until s2c/1214 after its end, or the first packet or
    /// timer past END_WAIT after it (record_received). Not a deadline of its own, so it never moves a job's timers.
    recorder: Option<Recorder>,
    /// How potential points are spent on their own (set_stats). `given` counts the points it gave each stat (c2s/10
    /// index) since it was set, `spent` those since the last summary; `allotting`, the potential points when its c2s/10
    /// went, while it waits for s2c/10 kind 8; `allot_failed` once one went unanswered or spent no point, until the plan
    /// is set again.
    stat_plan: Option<StatPlan>,
    given: [u32; 4],
    spent: [u32; 4],
    allotting: Option<i32>,
    allot_failed: bool,
    plan_warned: bool,
    /// Tự cộng kỹ năng (FightSettings::auto_skills): `skilling`, the skill points when its c2s/1191 went, while it waits
    /// for s2c/1191; `skills_failed` once one went unanswered or spent no point, until it is turned on again.
    skilling: Option<i32>,
    skills_failed: bool,
    upgrading: Option<Upgrade>,
    item_wait: Option<ItemWait>,
    /// Xóa nhiều: the gear of the bag still to throw away (slot, uuid), and how many were asked and thrown so far (0, 0
    /// when none runs).
    discards: VecDeque<(u8, String)>,
    discard_count: (usize, usize),
    /// Đập hết (bot/eggs.rs): the egg under way; its count and gains are snap.eggs.
    eggs: Option<eggs::EggStep>,
    /// Bạch Hổ (bot/bachho.rs): the run under way; its figures are snap.bach_ho.
    bach_ho: Option<bachho::State>,
    /// The c2s/1275 sent by Bạch Hổ whose answers are not in yet, oldest first (the server answers in order): true when
    /// the run asked (after a battle, at its end), false for a quiet peek during a battle (bachho.rs).
    bach_ho_asks: VecDeque<bool>,
    /// A jump through Bản đồ thế giới under way (Bạch Hổ, Quay về chỗ cũ).
    warp: Option<bachho::Warp>,
    /// The zone of c2s/1173 until s2c/43 of it (change_zone).
    zoning: Option<i32>,
    /// "Đổi map": the map (id, name) the bot walks to through portals (go_to), until it is there.
    trip: Option<(String, String)>,
    /// The zone to change to once the trip ends on its map: the zone the trip to the shop started from (walk_back).
    zone_after: Option<i32>,
    /// Where to walk back to after the shop (go_to_shop, walk_back).
    shop_back: Option<ShopBack>,
    /// Until when the zone change, or the portal of the trip, waits for the server.
    move_until: Option<Instant>,
    /// The step of the shop waiting for the server, and until when.
    shopping: Option<(Shopping, Instant)>,
    /// The task of Pháp sư or Hương Lão under way (smith.rs), and how many were started in this session.
    smith: Option<smith::Smith>,
    smith_runs: u32,
    /// Mã quà tặng (gift.rs): the run under way, how many were started in this session, and the words of the last
    /// refusal with when it came, so its s2c/1256 is not logged twice. The codes refused in a row and the server's lock
    /// are in BotOptions::gift, which outlives the session.
    gift: Option<gift::Gift>,
    gift_runs: u32,
    gift_echo: Option<(String, Instant)>,
    /// Hòm thư (mailbox.rs): the task under way, waiting for the server. What the mailbox holds is in Snapshot.mailbox.
    mail: Option<mailbox::MailWait>,
    /// Chợ trời (bot/market.rs): the task under way, waiting for the server. What the market showed is in
    /// Snapshot.market.
    market: Option<market::MarketWait>,
    /// Phúc lợi (bot/welfare.rs): the run under way; the definitions (once a session) and progress the server sent, by
    /// key; when the next automatic run goes (Tự điểm danh và nhận quà); a refused Điểm danh's words, whose notice
    /// follows.
    welfare: Option<welfare::WelfareRun>,
    welfare_definitions: BTreeMap<String, crate::welfare::EventDefinition>,
    welfare_progress: BTreeMap<String, crate::welfare::EventProgress>,
    welfare_at: Option<Instant>,
    welfare_echo: Option<(String, Instant)>,
    fight: FightSettings,
    /// The gear slot and item name of the repair auto_repair sent, until s2c/48 or a notice answers it. `repair_failed`
    /// holds the slots the server did not repair in this run, `repair_warned` whether the run said it has no hammer.
    repairing: Option<(u8, String)>,
    repair_failed: HashSet<u8>,
    repair_warned: bool,
    /// Dùng bình máu, Dùng bình mana: whether the run said the bag is down to what it keeps of Hoàn Linh Dược, of Kim
    /// Đan Dược (Bot::battle_potions), so it says it once.
    potions_kept: [bool; 2],
    /// Tự gộp đá khi túi đầy (merge.rs): the trip under way, when the last one came back (merge_every counts from it,
    /// for the session), and the reason a full bag did not go said last, so it is said once.
    merge_trip: Option<merge::MergeTrip>,
    merge_back_at: Option<Instant>,
    merge_said: Option<&'static str>,
    /// Tự nhặt đồ: the items fallen in the last DROPS_KEPT; until when a won battle's drops are still coming, and that
    /// battle; the ones waiting for their c2s/1188, and when the next may go; the uuids asked since the last won battle;
    /// when the last c2s/1188 went; the ones it sent that the server has not answered yet, oldest first.
    drops: Vec<Fallen>,
    /// Nhặt cả đồ người khác: the items lying on the ground of the zone (s2c/1184, s2c/1182 less s2c/1183), anyone's.
    ground: Vec<Fallen>,
    loot_until: Option<Instant>,
    loot_from: Option<LootFrom>,
    to_pick: VecDeque<Fallen>,
    pick_at: Option<Instant>,
    asked: HashSet<String>,
    picked_at: Option<Instant>,
    unanswered: VecDeque<Fallen>,
    /// Thời gian chờ (pace.rs): Thời gian ngẫu nhiên; the battles of the fight job or quest run on since it started or
    /// since its last Nghỉ giải lao, and when the break under way ends; whether the wait of Chờ giữa các bước nhiệm vụ is
    /// over for the thing the quest run does next; when the last battle ended (Chờ giữa các trận lets the items of
    /// others be picked up until BotOptions::rest after it).
    jitter: crate::delay::Jitter,
    since_break: u32,
    break_until: Option<Instant>,
    step_ready: bool,
    battle_ended: Option<Instant>,
    /// Nhịp như người chơi (reload.rs): the maps loaded in this session for the index of c2s/11, the pace of
    /// BotOptions::human, the requests held for their gap, and the reload of the map after a battle under way.
    maps: crate::world::MapLoads,
    human: crate::human::Human,
    deferred: Vec<reload::Deferred>,
    reload: Option<reload::Reload>,
    /// No challenge before it: the walk to the mob after the mobs of the map came (human::CHALLENGE_AFTER_ENTITIES).
    walk_until: Option<Instant>,
    /// When the battle under way last had a packet of its own (or opened): BATTLE_SILENT after it, it is left.
    battle_heard: Option<Instant>,
    /// Đi lại như người chơi (wander.rs): the drawn layer of the map stood on (s2c/11), the c2s/1169 still to go with
    /// their time, and the way the character faces.
    grid: Option<crate::walk::Grid>,
    moves: VecDeque<(Instant, crate::walk::Step)>,
    facing_right: bool,
}

impl Bot {
    pub fn new(options: BotOptions, atlas: Arc<Atlas>) -> Self {
        let (stat_plan, fight, human) = (options.stats, options.fight, options.human.clone());
        Self {
            snap: Snapshot::default(),
            mobs: vec![],
            bosses: HashSet::new(),
            seen_bosses: vec![],
            zone: ZonePlayers::default(),
            atlas: (*atlas).clone(),
            options,
            battle: None,
            battle_memory: Memory::default(),
            target: None,
            waits: 0,
            timer: None,
            job_seq: 0,
            challenges: vec![],
            battle_seq: 0,
            travelling: None,
            hops: 0,
            zone_tries: vec![],
            zone_list_asked: false,
            refused: HashSet::new(),
            awaiting_reply: false,
            duels: 0,
            talked: false,
            playing: None,
            runs: 0,
            reload_map: false,
            leave_until: None,
            battle_started: Instant::now(),
            run_started: Instant::now(),
            battle_at: 0,
            battle_source: BattleSource::Other,
            battle_hp: 0,
            battles_started: 0,
            last_battle: None,
            recorder: None,
            stat_plan,
            given: [0; 4],
            spent: [0; 4],
            allotting: None,
            allot_failed: false,
            skilling: None,
            skills_failed: false,
            plan_warned: false,
            upgrading: None,
            item_wait: None,
            discards: VecDeque::new(),
            discard_count: (0, 0),
            eggs: None,
            bach_ho: None,
            bach_ho_asks: VecDeque::new(),
            warp: None,
            zoning: None,
            trip: None,
            zone_after: None,
            shop_back: None,
            move_until: None,
            shopping: None,
            smith: None,
            smith_runs: 0,
            gift: None,
            gift_runs: 0,
            gift_echo: None,
            mail: None,
            market: None,
            welfare: None,
            welfare_definitions: BTreeMap::new(),
            welfare_progress: BTreeMap::new(),
            welfare_at: None,
            welfare_echo: None,
            fight,
            repairing: None,
            repair_failed: HashSet::new(),
            repair_warned: false,
            potions_kept: [false; 2],
            merge_trip: None,
            merge_back_at: None,
            merge_said: None,
            drops: vec![],
            ground: vec![],
            loot_until: None,
            loot_from: None,
            to_pick: VecDeque::new(),
            pick_at: None,
            asked: HashSet::new(),
            picked_at: None,
            unanswered: VecDeque::new(),
            jitter: crate::delay::Jitter::default(),
            since_break: 0,
            break_until: None,
            step_ready: false,
            battle_ended: None,
            maps: crate::world::MapLoads::default(),
            human,
            deferred: vec![],
            reload: None,
            walk_until: None,
            battle_heard: None,
            grid: None,
            moves: VecDeque::new(),
            facing_right: true,
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
        s.back_to = self
            .shop_back
            .as_ref()
            .map(|b| format!("{} khu {}", b.name, b.zone));
        s.gift_limits = self.gift_limits();
        s.mailbox.changing = self.mail_changing();
        s.market.changing = self.market_changing();
        if let Some(b) = &self.battle {
            s.turn = self.turn_of(b);
        }
        s.battle = self.battle.as_ref().map(|b| BattleView {
            mob_id: b.mob_id().to_string(),
            mob_name: self.mob_name(b.mob_id()),
            hp: b.me().hp,
            max_hp: b.me().max_hp,
            mob_hp: Some(b.mob().hp).filter(|v| v.is_finite()),
            mob_max_hp: Some(b.mob().max_hp).filter(|v| v.is_finite()),
            turns: b.turns(),
            timed: b.timed(),
            leaving: b.leaving(),
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
            })
            // The mob of a duel (s2c/1180) is in no mob list: it is the target.
            .or_else(|| {
                self.target
                    .as_ref()
                    .filter(|t| t.id == mob_id)
                    .map(|t| (t.name.clone(), t.level))
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
            // The mob of a duel (s2c/1180) is in no mob list: it is the target, as in `record`.
            .or_else(|| self.target.as_ref().filter(|t| t.id == id))
            .map_or_else(|| id.to_string(), |m| m.name.clone())
    }

    /// The last result of `b`, with the mob's name.
    fn turn_of(&self, b: &Runner) -> Option<Turn> {
        let foe = self.mob_name(b.mob_id());
        b.last().cloned().map(|t| Turn { foe, ..t })
    }

    /// Bosses of the current map, with their element when seen: seen in this session, or in data/maps.json.
    fn map_bosses(&self) -> Vec<(String, i32, Option<i32>)> {
        let map = &self.snap.map_id;
        let mut out: Vec<(String, i32, Option<i32>)> = self
            .seen_bosses
            .iter()
            .filter(|b| &b.0 == map)
            .map(|b| (b.1.clone(), b.2, b.3))
            .collect();
        for k in self.atlas.bosses(map) {
            if !out.iter().any(|b| b.0 == k.name) {
                out.push((k.name.clone(), k.level, None));
            }
        }
        out
    }

    /// A mob of `level` gives no EXP, Xu or drops to this character (NO_EXP_GAP); false before the level is known.
    fn no_exp(&self, level: i32) -> bool {
        self.snap.level > 0 && self.snap.level - level > NO_EXP_GAP
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
                    element: m.element(),
                    no_exp: self.no_exp(m.level),
                });
            }
        }
        for (name, level, element) in self.map_bosses() {
            match out.iter_mut().find(|t| t.name == name) {
                Some(t) => t.boss = true,
                None => out.push(Target {
                    no_exp: self.no_exp(level),
                    name,
                    level,
                    boss: true,
                    here: false,
                    element,
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
            self.smith.as_ref().map(|s| s.until),
            self.gift.as_ref().map(|g| g.until),
            self.mail.as_ref().map(|m| m.until),
            self.market.as_ref().map(|m| m.until),
            self.pick_at,
            self.egg_deadline(),
            self.welfare_deadline(),
            self.human_deadline(),
            self.wander_deadline(),
            self.battle
                .as_ref()
                .filter(|b| !b.leaving())
                .and(self.battle_heard)
                .map(|t| t + BATTLE_SILENT),
        ]
        .into_iter()
        .flatten()
        .min()
    }

    pub fn on_timer(&mut self, now: Instant, out: &mut Vec<Out>) {
        self.record_overdue(now, out);
        if let Some(b) = &mut self.battle {
            if b.deadline().is_some_and(|d| d <= now) {
                let mut acts = vec![];
                b.on_timer(now, &mut acts);
                out.extend(
                    b.take_views()
                        .into_iter()
                        .map(|v| Out::BattleEvent(Box::new(v))),
                );
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
                    (self.allotting, self.allot_failed) = (None, true);
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
                // The run goes on without it: a skill level is not worth stopping a job or a quest for.
                Wake::SkillSilence => {
                    (self.skilling, self.skills_failed) = (None, true);
                    out.push(Out::Log(
                        LogKind::Character,
                        "Server không trả lời khi tự cộng kỹ năng; thôi tự cộng tới lần bật sau"
                            .into(),
                    ));
                    self.next(now, out);
                }
                Wake::Step => {
                    self.step_ready = true;
                    self.next(now, out);
                }
            }
        }
        if self.pick_at.is_some_and(|t| t <= now) {
            self.pick_next(now, out);
        }
        if self.shopping.as_ref().is_some_and(|s| s.1 <= now) {
            let who = self.shop_npc();
            self.shopping = None;
            out.push(Out::Log(
                LogKind::Item,
                format!("{who} không trả lời sau {} s", SHOP_WAIT.as_secs()),
            ));
        }
        self.smith_timer(now, out);
        self.egg_timer(now, out);
        self.gift_timer(now, out);
        self.mail_timer(now, out);
        self.wander_timer(now, out);
        self.market_timer(now, out);
        self.welfare_timer(now, out);
        if self.move_until.is_some_and(|t| t <= now) {
            (self.move_until, self.snap.moving) = (None, None);
            self.warp_timeout(now, out);
            if let Some(z) = self.zoning.take() {
                out.push(Out::Log(
                    LogKind::Travel,
                    format!("Server không trả lời khi sang khu {z} sau 8 s"),
                ));
                if self.quest_running() {
                    self.timer = Some((now + Duration::from_secs(1), Wake::Next));
                }
            }
            if let Some((_, name)) = self.trip.take() {
                (self.travelling, self.zone_after) = (None, None);
                out.push(Out::Log(
                    LogKind::Travel,
                    format!("Kết thúc: cổng không trả lời sau 8 s, thôi đi tới {name}"),
                ));
            } else if let Some((_, name)) = self.travelling.take() {
                // A portal of the quest run (through): s2c/13 came and cleared its timer, but the new map did not
                // follow, or its s2c/11 or s2c/43 did not read. Nothing else would wake the run, still "Qua cổng …".
                out.push(Out::Log(
                    LogKind::Travel,
                    format!("Server không gửi map mới sau cổng {name} trong 8 s"),
                ));
                if self.quest_running() {
                    self.finish_quest(&format!("Không vào được map sau cổng {name}"), out);
                }
                // Bạch Hổ's portal into the cave: tried again.
                if self.bach_ho_on() {
                    self.timer = Some((now + Duration::from_secs(5), Wake::Next));
                }
            }
        }
        if self.leave_until.is_some_and(|t| t <= now) {
            self.leave_until = None;
            if let Some(b) = self.battle.as_mut().filter(|b| b.leaving()) {
                let mut acts = vec![];
                b.resume(now, &mut acts);
                out.push(Out::Log(
                    LogKind::Battle,
                    "Server chưa nhận đầu hàng sau 8 s; đánh tiếp trận".into(),
                ));
                self.apply(acts, now, out);
            }
        }
        self.human_timer(now, out);
        self.battle_silent(now, out);
        self.walk_back(now, out);
        self.merge_step(now, out);
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
            (self.snap.moving, self.zone_after) = (None, None);
            out.push(Out::Log(
                LogKind::Travel,
                format!("Kết thúc: thôi đi tới {name}"),
            ));
        }
        self.bach_ho_stop(out);
        self.smith_stop(now, out);
        self.egg_stop(out);
        self.gift_stop(out);
        self.mail_stop();
        if surrender {
            self.surrender(now, out);
        }
    }

    /// "Lượt thua còn lại" changed while a fight job or quest run goes on: it ends after `left` more losses (at least
    /// one), as if its Thua tối đa were that many above the losses so far. The saved Thua tối đa of the tab stays.
    pub fn set_losses_left(&mut self, left: u32, out: &mut Vec<Out>) {
        let left = left.max(1);
        if let Some(j) = self.snap.job.as_mut().filter(|j| j.done.is_none()) {
            j.max_losses = j.losses + left;
            let text = format!("Còn {left} lượt thua nữa thì dừng đánh {}", j.target);
            out.push(Out::Log(LogKind::Battle, text));
        } else if let Some(r) = self.snap.quest_run.as_mut().filter(|r| r.done.is_none()) {
            r.max_losses = r.losses + left;
            let text = format!("Còn {left} lượt thua nữa thì dừng làm nhiệm vụ");
            out.push(Out::Log(LogKind::Quest, text));
        }
    }

    /// A request out, or the fault line of one that could not be built (requests::unbuilt): its answer never comes, and
    /// the timeouts of what waited for it take over.
    fn send(out: &mut Vec<Out>, opcode: i32, ctx: Ctx) {
        out.push(match build(opcode, &ctx) {
            Ok(payload) => Out::Send(opcode, payload),
            Err(e) => Out::Log(LogKind::Connection, crate::requests::unbuilt(opcode, &e)),
        });
    }

    fn apply(&mut self, acts: Vec<Act>, now: Instant, out: &mut Vec<Out>) {
        for a in acts {
            match a {
                Act::Send(op, p) => out.push(Out::Send(op, p)),
                Act::Log(text) => out.push(Out::Log(LogKind::Battle, text)),
                Act::Note(note, fields) => {
                    if let Some(r) = &mut self.recorder {
                        r.note(note, fields, now);
                    }
                }
                Act::End(end) => self.on_battle_end(end, now, out),
            }
        }
    }
}

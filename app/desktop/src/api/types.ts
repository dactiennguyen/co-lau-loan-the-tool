// What Rust sends: AccountView and CharacterView of src-tauri/src/view.rs (serde camelCase) and the cllt-core types they
// embed. Keep both sides in step.

/** 0 offline, 1 connecting, 2 online, 3 fighting, 4 error */
export type Status = 0 | 1 | 2 | 3 | 4;

/** 0 normal, 1 good (a win), 2 bad (a loss, an error), 3 accent (start, end, entered the game) */
export type Tone = 0 | 1 | 2 | 3;

export interface LogLine {
  /** Number of the line in the log of its account, from 1; 0 for a line of cllt.db asked with logHistory. */
  seq: number;
  /** Row in cllt.db, the cursor for older lines; absent without the database. */
  id?: number;
  /** ms since 1970; `time` is what the card shows of it ("12:30:05" today, "30/10 12:30" another day). */
  at: number;
  time: string;
  kind: LogKind;
  text: string;
  tone: Tone;
  /** On the line a battle opened on: its latest result. The line comes again with each new one. */
  turn?: Turn;
  /** On the line of a won battle ("Trận 3: thắng …"): what Tự nhặt đồ picked up after it. The line comes again with each
   * item. */
  picked?: Picked[];
}

/** Where the update of the app stands (UpdateState of src-tauri's update.rs). */
export type UpdateState =
  /** This copy does not update itself (tauri dev, the portable exe, --sample), and why. */
  | { state: "off"; reason: string }
  | { state: "idle" }
  | { state: "checking" }
  /** Nothing newer at `checkedAt` (ms since 1970). */
  | { state: "latest"; checkedAt: number }
  | { state: "downloading"; version: string; notes: string; got: number; total: number | null }
  /** Downloaded and verified: installed when the app quits, or at once with Khởi động lại. */
  | { state: "ready"; version: string; notes: string }
  | { state: "installing"; version: string }
  | { state: "failed"; message: string; checkedAt: number };

/** Tự cập nhật: the version running, then where its update stands. */
export type UpdateView = { current: string } & UpdateState;

/** Key (license.rs): the key kept, its middle hidden ("" without one), and where it stands. Anything but "valid" and
 * "off" covers the window (LicenseGate) and no account logs in. */
export type LicenseView = { key: string } & (
  | { state: "off" }
  | { state: "missing" }
  | { state: "checking" }
  | { state: "valid"; expiresAt: number; maxAccounts: number; activatedAt: number; checkedAt: number }
  | { state: "refused"; code: string; message: string }
  | { state: "unreachable"; message: string }
);

/** What a log line is about (LogKind of cllt-core's bot/types.rs); game/logKinds.ts names them. */
export type LogKind = "connection" | "battle" | "quest" | "travel" | "character" | "item" | "server";

/** What a battle was played for, and how it ended (bot/types.rs). */
export type BattleSource = "fight" | "quest" | "other";
export type BattleResult = "won" | "lost" | "left";

/** One battle of the history (BattleRecord of bot/types.rs, with its row in cllt.db). */
export interface StoredBattle {
  id: number;
  character: string;
  level: number;
  startedAt: number;
  endedAt: number;
  mapId: string;
  mapName: string;
  zone: number;
  mobId: string;
  mobName: string;
  /** 0 when unknown. */
  mobLevel: number;
  boss: boolean;
  source: BattleSource;
  result: BattleResult;
  turns: number;
  damage: number;
  hpBefore: number;
  hpAfter: number;
  maxHp: number;
  exp: number;
  coin: number;
  /** What Tự nhặt đồ picked up after it. */
  picked: PickedItem[];
}

/** Some of an item Tự nhặt đồ picked up (Picked of cllt-core): how many, and its icon in data/icons. */
export interface Picked {
  itemId: number;
  name: string;
  quantity: number;
  icon: number | null;
}

/** An item picked up after some battles: the quantities summed, and how many times (PickedItem of store.rs). */
export interface PickedItem extends Picked {
  times: number;
}

/** Sums over some battles (store.rs); `ms` is the time spent in them. */
export interface Totals {
  battles: number;
  won: number;
  lost: number;
  left: number;
  exp: number;
  coin: number;
  damage: number;
  turns: number;
  ms: number;
}

export interface MobTotals extends Totals {
  mobName: string;
  mobLevel: number;
  boss: boolean;
  mapName: string;
}

/** The totals of one map, or of the battles that ended in one hour ("2026-11-01 13", local time) (GroupTotals of store.rs). */
export interface GroupTotals extends Totals {
  key: string;
}

export interface SourceTotals extends Totals {
  source: BattleSource;
}

/** The battles that ended at one level (LevelTotals of store.rs). */
export interface LevelTotals extends Totals {
  level: number;
  /** When the level was reached (the end of its first battle kept), ms since 1970; null when it may be older. */
  reachedAt: number | null;
}

/** Wins in a row: the longest, and the run at the end (`last` battles in a row with `lastResult`). */
export interface Streak {
  best: number;
  last: number;
  lastResult: BattleResult | null;
}

/**
 * Thống kê (StatsModal): totals, then each mob and map, most battles first, then each item picked up, most times first;
 * each hour (oldest first), map and source (most battles first) and level (lowest first, of every source); the streaks,
 * the time the bot was at it, the HP the wins cost, the closest win and the last losses (BattleStats of store.rs).
 */
export interface BattleStats extends Totals {
  mobs: MobTotals[];
  picked: PickedItem[];
  hours: GroupTotals[];
  maps: GroupTotals[];
  sources: SourceTotals[];
  levels: LevelTotals[];
  streak: Streak;
  /** The battles and the waits between them shorter than 10 minutes (RUN_GAP_MS). */
  runMs: number;
  /** HP the wins cost, summed. */
  wonHpLost: number;
  closest: StoredBattle | null;
  /** The last losses, newest first, at most 5. */
  losses: StoredBattle[];
}

/** What one result of a battle did (Turn of cllt-core's runner.rs). */
export interface Turn {
  /** Results of the battle so far, both sides, this one included. */
  n: number;
  /** The player moved, else the mob. */
  mine: boolean;
  /** Name of the mob. */
  foe: string;
  /** Skill cast. */
  skill: number | null;
  /** [kind, count], kinds ascending: 0 sword, 1 heart, 2 yin-yang, 3 peach, 4 drop, 5 star, 70 gold. */
  eaten: [number, number][];
  /** Damage dealt to the other side. */
  damage: number;
  /** HP the actor gained. */
  heal: number;
  /** Changes of the actor's nội lực and sức mạnh. */
  s1: number;
  s2: number;
  /** Own [HP, max HP] after it. */
  hp: [number, number];
  /** The mob's, once a result showed its HP. */
  mobHp: [number, number] | null;
  extraTurn: boolean;
  end: boolean;
}

/** Another player of the zone. */
export interface Nearby {
  id: number;
  name: string;
  level: number;
}

export interface BossTile {
  id: string;
  name: string;
  level: number;
  col: number;
  row: number;
  /** Changing tiles (s2c/1177 field 1). */
  moving: boolean;
}

export interface Target {
  name: string;
  level: number;
  boss: boolean;
  /** In the zone right now (a boss changing tiles is not). */
  here: boolean;
  /** 1 Hỏa, 2 Lôi, 4 Thủy (Mob::element, from s2c/43 or s2c/1177); null for a boss only the atlas names. */
  element: number | null;
  /** More than 20 levels below the character (NO_EXP_GAP of bot/mod.rs): no EXP, Xu or drops. */
  noExp: boolean;
  /** Gợi ý quái (cllt_core::farm): null for a boss, a mob that gives no EXP, or one with neither stats nor battles. */
  farm: FarmHint | null;
}

/** How a mob of the list pays to farm: from the account's own battles with it at about its level, else the stats. */
export interface FarmHint {
  expPerHour: number;
  /** Battles lost, %. */
  loss: number;
  /** Own battles counted (15 or more: they alone). */
  battles: number;
  source: "battles" | "mixed" | "stats";
  /** The one to farm: most EXP an hour among those losing under 30%. */
  best: boolean;
}

export interface Job {
  target: string;
  count: number;
  maxLosses: number;
  fights: number;
  wins: number;
  losses: number;
  damage: number;
  exp: number;
  coin: number;
  /** What Tự nhặt đồ picked up after its battles, by item; the last battle's come just after the job ended. */
  picked: Picked[];
  /** Why the job ended; null while it runs. */
  done: string | null;
  /** When it started and ended, in ms since 1970. */
  startedAt: number;
  endedAt: number | null;
}

export interface Battle {
  mobId: string;
  mobName: string;
  hp: number;
  maxHp: number;
  mobHp: number | null;
  mobMaxHp: number | null;
  turns: number;
  timed: boolean;
  /** A surrender waits for the server (up to 8 s, then the battle is played on). */
  leaving: boolean;
}

/** A step of the current quest, as s2c/39 sends it. */
export interface QuestStep {
  index: number;
  text: string;
  /** Level of "Đạt cấp độ", NPC of a talk step, mob kind of a kill step. */
  param: number;
  /** Kills, or boss damage, the step asks for. */
  required: number;
  npcId: number;
}

/** The current main quest (s2c/39), the only one the server sends. */
export interface Quest {
  id: number;
  title: string;
  description: string;
  type: string;
  /** Position in `steps` of the step being played. */
  current: number;
  /** Kills, or boss damage, of the current step. */
  progress: number;
  steps: QuestStep[];
}

/** "Tự làm nhiệm vụ", or ▶ on one step, and what it has done so far. */
export interface QuestRun {
  /** Number of the run in this session: a new id is a new run. */
  id: number;
  /** The step played alone, as its index in `Quest.steps`; null for the whole quest. */
  step: number | null;
  /** The step played alone was done: the run ended because the quest moved past it. */
  stepDone: boolean;
  maxLosses: number;
  fights: number;
  wins: number;
  losses: number;
  exp: number;
  coin: number;
  /** Quests handed in during the run. */
  completed: number;
  /** What Tự nhặt đồ picked up after its battles, as for Job. */
  picked: Picked[];
  /** What the bot does for the current step. */
  doing: string;
  /** Why the run ended; null while it runs. */
  done: string | null;
  /** When it started and ended, in ms since 1970. */
  startedAt: number;
  endedAt: number | null;
}

/** Attack, defence, accuracy, dodge, critical (the last three labels are inferred: docs/app/user-data.md). */
export type Combat = [number, number, number, number, number];

/** A timed effect at login (Boost of cllt-core, the s2c/9 tail): "ef7" at rate 200000 is the x2 EXP of Tăng Kinh
 * Nghiệm. */
export interface Boost {
  key: string;
  /** In 1/100000: 200000 doubles the EXP. */
  rate: number;
  /** When it ends, in ms since 1970, offline or not. */
  until: number;
}

export interface Character {
  name: string;
  /** field01 of s2c/9: 1 Hỏa, 4 Thủy. */
  element: number | null;
  /** flag2 of s2c/9: 0 nam, 1 nữ (game/gender.ts); null until s2c/9 came. */
  gender: number | null;
  level: number;
  hp: number;
  maxHp: number;
  exp: number | null;
  levelExp: [number, number] | null;
  /** Vàng: the gold bar of the Bản thân panel (gold pieces won in battles), turned into Xu khoá at 10.000. */
  coin: number | null;
  /** Potential stats; [0] is Cường lực. */
  stats: number[];
  combat: Combat | null;
  statPoints: number | null;
  skillPoints: number | null;
  mapId: string;
  mapName: string;
  zone: number;
  x: number;
  y: number;
  /** The other players of the zone, highest level first. */
  players: Nearby[];
  /** False when the last s2c/1263 did not read: `players` is not the whole zone. */
  playersKnown: boolean;
  bosses: BossTile[];
  targets: Target[];
  job: Job | null;
  quest: Quest | null;
  questRun: QuestRun | null;
  /** Nghỉ giải lao: when the break of the fight job or quest run on ends (ms since 1970); null when there is none. */
  breakUntil: number | null;
  battle: Battle | null;
  /** Timed effects at login, such as x2 EXP; no packet is known yet to update them in the session. */
  boosts: Boost[];
  /** The 8 gear slots, null where empty; empty until s2c/9 came. */
  gear: (Item | null)[];
  /** The bag; null until s2c/42 came. */
  bag: BagContents | null;
  /** Xu, Xu khoá, Lượng (s2c/46). */
  currencies: Currencies | null;
  /** The Kỹ năng tab: the tree of s2c/30 with the levels; empty until s2c/30 came. */
  skills: Skill[];
  /** The zones of the map and their players (s2c/1172) as last asked; null until asked, and after each map or zone. */
  zones: Zone[] | null;
  /** A zone change or a trip to another map under way ("Sang khu 4", "Đi tới Rìa Hồng Giang"). */
  moving: string | null;
  /** Where the bot walks back to once Tiện ích is closed ("Hồng Giang khu 3"), after "Mua xong quay về chỗ cũ". */
  backTo: string | null;
  /** The maps of the atlas, nearest first, with the portals to take. */
  maps: MapChoice[];
  /** The shop s2c/1190 last listed (`kind` says which); null again off M1. */
  shop: Shop | null;
  /** The work of Pháp sư or Hương Lão under way or last done (Tiện ích). */
  smith: SmithRun | null;
  /** Chế tạo trang bị: the recipes of each item kind read so far (Xem công thức). */
  recipes: CraftRecipes[];
  /** Điểm năng động of Hương Lão as last read. */
  points: PointsRead | null;
  /** Nhiệm vụ hàng ngày: the quest held and how many were taken today. */
  daily: DailyState;
  /** Phúc lợi: Điểm danh, Quà online, Quà thăng cấp (the Phúc lợi window of the Tiền tile). */
  welfare: WelfareState;
  /** Mã quà tặng under way or last done (Tiện ích). */
  gift: GiftRun | null;
  /** Đập hết under way (Túi đồ); null once it ends, its end line in the log. */
  eggs: EggRun | null;
  /** Bạch Hổ under way or last done (BachHoModal); null before any. */
  bachHo: BachHoRun | null;
  /** Where Bạch Hổ took the character from, for Quay về chỗ cũ; null once back. */
  backPoint: BackPoint | null;
  /** Codes refused in a row, and the server's lock on codes; kept across the logins of the app's run. */
  giftLimits: GiftLimits;
  /** Hòm thư (Tiện ích): the list, the mails opened, the task under way. */
  mailbox: Mailbox;
  /** Chợ trời (Tiện ích): the tabs, the page read last, Đang bán, the task under way. */
  market: Market;
}

/** Chợ trời as the app knows it (MarketView of view.rs). */
export interface Market {
  /** s2c/116: the tabs with their listing counts, the fee, the hours on sale, the highest price; null until opened. */
  tabs: MarketTabs | null;
  /** The page of a tab read last, and Đang bán as read last. */
  page: MarketPage | null;
  mine: MarketPage | null;
  /** What the task under way does ("Đang mua Thú cưng Slime…"); null when none is. */
  doing: string | null;
  /** The listing or bag item (uuid) the task under way is about. */
  busyWith: string | null;
  /** The task under way is Mua, Đăng bán, Thu hồi or Gia hạn: the character counts as busy until the server answers. */
  changing: boolean;
  /** The line the last of those ended with, as in the log. */
  last: string | null;
  /** Gợi ý giá: the prices of one item on sale by others, as far as read; null before any. */
  prices: MarketPrices | null;
}
/** What the market asks for an item (MarketPrices of bot/types.rs): listings found, how many they hold, the cheapest
 * and dearest by the price of one (`unit`, rounded down); `done` once every page was read, `atMs` when. */
export interface MarketPrices {
  itemId: number;
  name: string;
  listings: number;
  quantity: number;
  cheapest: PriceSeen | null;
  dearest: PriceSeen | null;
  pages: number;
  done: boolean;
  atMs: number;
}
export interface PriceSeen {
  unit: number;
  price: number;
  quantity: number;
  seller: string;
}
export interface MarketTabs {
  tabs: { tab: number; name: string; listings: number }[];
  rules: string;
  /** Xu to list (and to extend), the hours on sale, the highest price. */
  fee: number;
  hours: number;
  maxPrice: number;
  /** Two numbers of s2c/1191 not known yet (1000 each, core/src/market.rs); not shown. */
  a: number;
  b: number;
}
/** A page of s2c/1192; tab -1 is Đang bán. */
export interface MarketPage {
  tab: number;
  tabName: string;
  pages: number;
  page: number;
  listings: Listing[];
}
/** One item on sale: the item drawn as the bag draws it, its quality (1 Hiếm, 3 Sử Thi), seller, price in Xu, end. */
export interface Listing {
  uuid: string;
  item: Item;
  quality: number;
  qualityName: string | null;
  seller: string;
  price: number;
  currency: number;
  /** When it leaves the market, in ms since 1970. */
  expiresAt: number;
}

/** The mailbox as the app knows it (MailboxView of view.rs). */
export interface Mailbox {
  /** The list as last listed, newest first, with the mails come since; null until listed in this session. */
  mails: MailHeader[] | null;
  /** The mails opened in this session, of those still listed. */
  opened: MailBody[];
  /** Whether a mail is not read yet (s2c/1220); null until the server said. */
  unread: boolean | null;
  /** What the task under way does ("Đang nhận thư …"); null when none is. */
  doing: string | null;
  /** The mail the task under way is about. */
  busyWith: number | null;
  /** The task under way is Nhận, Nhận hết or Xóa: the character counts as busy until the server answers. */
  changing: boolean;
  /** The line the last task ended with, as in the log ("Xong nhận thư …", "Chưa nhận thư …"). */
  last: string | null;
}

/** One mail of the list (s2c/1215, s2c/1222). */
export interface MailHeader {
  id: number;
  kind: number;
  title: string;
  sender: string;
  read: boolean;
  /** It holds a gift, and whether that was taken. */
  gift: boolean;
  taken: boolean;
  /** When it was sent, in ms since 1970 (server time). */
  sentAt: number;
  last: number;
}

/** A mail opened (s2c/1216): its words, its money, its other items, and the bag slots those need now. */
export interface MailBody {
  id: number;
  title: string;
  body: string;
  sender: string;
  taken: boolean;
  xu: number;
  xuKhoa: number;
  luong: number;
  items: Item[];
  slots: number;
}

/** Bạch Hổ (Bot::bach_ho): from when to when it tries (ms since 1970), what it does now, the tries, battles, wins and
 * damage; `done` the words it ended with. */
export interface BachHoRun {
  fromMs: number;
  untilMs: number;
  doing: string;
  tries: number;
  battles: number;
  wins: number;
  damage: number;
  /** Where the character stands in Kết quả Bạch Hổ (s2c/1275): "Bậc 2 (cấp 60+), hạng 4, 31.000 sát thương". */
  standing: string | null;
  done: string | null;
}

/** A map and zone Quay về chỗ cũ goes back to. */
export interface BackPoint {
  mapId: string;
  mapName: string;
  zone: number;
}

/** Đập hết (Bot::break_all): the stack's bag slot, the eggs broken of how many, the fee spent and what came out. */
export interface EggRun {
  slot: number;
  name: string;
  total: number;
  done: number;
  spent: number;
  /** What the fee is paid in: "Xu khóa" (Trứng Gà, Linh Điểu) or "Xu" (Thần Ưng and above). */
  currency: string;
  got: { name: string; count: number }[];
}

/** The server's lock on gift codes as the app knows it (GiftMemory of the Rust core). */
export interface GiftLimits {
  /** Codes refused in a row (0 again after a good code, or Đếm lại từ 0). */
  wrong: number;
  /** How many the app allows before it stops sending (the server blocks every code for 5 minutes at 10). */
  maxWrong: number;
  /** Until when the server blocks every code (ms since 1970), after "Bạn nhập mã quá nhanh…"; null once past. */
  lockedUntil: number | null;
}

/** Mã quà tặng under way or last done (Bot::redeem). */
export interface GiftRun {
  id: number;
  /** The codes as they go out (trimmed, upper case, each once), in order. */
  codes: GiftCode[];
  /** The code (index in `codes`) waiting for the server's answer, if one is. */
  sending: number | null;
  doing: string;
  /** Why it ended; null while it runs. */
  done: string | null;
  startedAt: number;
  endedAt: number | null;
}
/** One code: `ok` null until the server answers it, then its words, and the title of the mail a good code brings. */
export interface GiftCode {
  code: string;
  ok: boolean | null;
  text: string;
  mail: string | null;
}

/** A shop as s2c/1190 lists it (ShopView of view.rs): `kind` is one of the 14 shops (15-shops.md). */
export interface Shop {
  kind: number;
  title: string;
  /** Who sells it: Lái Buôn, Bà Tư Hạnh. */
  npc: string;
  items: ShopLine[];
}

/** One line of a shop: `shopId` is what Mua sends, not the item id; the same item is sold for Xu, Xu khóa or Lượng. */
export interface ShopLine {
  shopId: number;
  itemId: number;
  name: string;
  icon?: number | null;
  desc: string;
  /** 0 Xu, 1 Xu khóa, 2 Lượng. */
  currency: 0 | 1 | 2;
  price: number;
  /** Type (0 hat, 1 armour, 2 weapon, 3 ring) and the level to wear it, for gear. */
  kind: number | null;
  level: number | null;
  /** The main stat gear rolls when bought: "sức tấn công 5–9". */
  ranges: string[];
  /** Bought for Xu khóa, the item is trade-locked. */
  locks: boolean;
  /** How many one bag slot holds: the most one purchase buys; 1 (gear) is bought one at a time. */
  stack: number;
}

/** What a window of Pháp sư said last (npc::quote): the fee and its money, Lượng, the odds, the stone Luyện đá makes,
 * what Tách đá gives back. */
export interface Quote {
  fee: { amount: number; money: "xu" | "xuKhoa" } | null;
  luong: number;
  rate: number | null;
  stone: { level: number; locked: boolean } | null;
  gain: { quantity: number; name: string }[];
}

/** A tier of an item kind of Chế tạo trang bị, as Pháp sư's menu says it (npc::Recipe). */
export interface Recipe {
  tier: number;
  option: number;
  /** The character level it needs. */
  level: number;
  materials: { name: string; count: number }[];
  xu: number;
}
export interface CraftRecipes {
  kind: number;
  name: string;
  recipes: Recipe[];
  readAt: number;
}
/** Điểm năng động (npc::ActivityPoints): the points of the week out of `need`, the exchange limit at `level`, the
 * places left this week; a number is missing when Hương Lão's words did not have it. */
export interface PointsRead {
  points?: number;
  need?: number;
  level?: number;
  xu?: number;
  xuKhoa?: number;
  slotsLeft?: number;
  slots?: number;
  text: string;
  /** Cách tính điểm, when asked. */
  rules: string | null;
  readAt: number;
}

/** A daily quest of Hương Lão (mail::DailyQuest): `template` has %d where the progress goes. */
export interface DailyQuest {
  id: number;
  name: string;
  template: string;
  progress: number;
  target: number;
}
/** Phúc lợi as the server said it last (WelfareState of bot/types.rs): Điểm danh, Quà online, Quà thăng cấp with their
 * milestones, whether something is due, the run under way and what the last one did. */
export interface WelfareState {
  /** The progress of an event came: false until the first run of the session. */
  known: boolean;
  /** s2c/1279: a bit per tab of Phúc lợi with a gift to take (bit 0 Online, 3 Điểm danh). */
  dots: number | null;
  /** Something to take: today not checked or a milestone reached; before any run, the red dots. */
  due: boolean;
  checkedToday: boolean | null;
  day: number | null;
  daysInMonth: number | null;
  /** The days of the month checked. */
  days: number[] | null;
  /** The gift today when the bot checked in this session ("1 Đá cấp 6"). */
  todayGift: string | null;
  /** The ten gifts of the day, one drawn at random. */
  daily: string[];
  checkin: WelfareEvent | null;
  online: WelfareEvent | null;
  level: WelfareEvent | null;
  /** "Đang nhận Quà online…" while a run goes. */
  doing: string | null;
  /** What the last run did, or why Nhận ngay did not go, and when (ms since 1970). */
  last: string | null;
  lastAt: number | null;
}
/** An event of Phúc lợi: progress is days checked, minutes online today, or the level. */
export interface WelfareEvent {
  title: string;
  period: string;
  progress: number;
  milestones: WelfareMilestone[];
}
/** A milestone: what it needs (days, minutes, level), its state (0 not reached, 1 to take, 2 taken), its gifts. */
export interface WelfareMilestone {
  id: number;
  need: number;
  state: number;
  gifts: string;
}

/** Nhiệm vụ hàng ngày (DailyState of bot/types.rs): the quest held as s2c/1195 says it (`known` once the server said, at
 * login), how many were taken today as Hương Lão's menu said last, and the last one done. */
export interface DailyState {
  known: boolean;
  quest: DailyQuest | null;
  taken: number | null;
  max: number | null;
  readAt: number | null;
  done: { name: string; rewards: string[]; at: number } | null;
}
/** What Nhiệm vụ hàng ngày does at Hương Lão (SmithTask::Daily). */
export type DailyAction = "show" | "accept" | "cancel" | "complete";

/** The work of Pháp sư or Hương Lão under way or last done (SmithView of view.rs). */
export interface SmithRun {
  id: number;
  kind: "merge" | "upgrade" | "quote" | "separate" | "transmute" | "exchange" | "recipes" | "craft" | "ice" | "points" | "daily";
  title: string;
  doing: string;
  steps: number;
  ok: number;
  failed: number;
  quote: Quote | null;
  /** Nâng cấp: the odds after each stone put in, in order; a stone that raised nothing was wasted. */
  rates: number[];
  /** Nâng cấp: the item one level up, and the item as it is now. */
  preview: Item | null;
  item: Item | null;
  /** Nâng cấp of a worn item: taken off for the task (so in the bag while it runs), worn again after. */
  worn: boolean;
  spentXu: number;
  spentXuKhoa: number;
  spentLuong: number;
  /** Why it ended; null while it runs. */
  done: string | null;
  startedAt: number;
  endedAt: number | null;
}

/** What Gộp đá would do on the bag (npc::merge_forecast). */
/** Options of Gộp đá (npc::MergeOptions): up to Đá cấp `upTo`, unlocked stones too with `unlocked`; the Gộp button of a
 * row gives `level` (only that level, one level up), `locked` (only that lock) and `sets` (the most merges). */
export interface MergeOptions {
  upTo?: number;
  unlocked?: boolean;
  level?: number;
  locked?: boolean;
  sets?: number;
}
export interface MergeForecast {
  merges: number;
  xu: number;
  xuKhoa: number;
  freed: number;
  made: { level: number; locked: boolean; count: number }[];
}

/** One zone of s2c/1172: `load` 0, 1, 2 as the game colours it (2 red), players of `capacity` (20). */
export interface Zone {
  zone: number;
  load: number;
  players: number;
  capacity: number;
}

/** A map of the atlas for "Đổi map". */
export interface MapChoice {
  mapId: string;
  name: string;
  /** The level the world map asks for; null when the world list lacks the map. */
  level: number | null;
  /** Portals on the shortest known way: 0 for the map the character is on, null when no known way leads there. With
   * `warp`, the jump through Bản đồ thế giới counts as one. */
  hops: number | null;
  /** No known portal way from here (Hang Bạch Hổ): the way starts with a jump through Bản đồ thế giới. */
  warp: boolean;
  /** The level the character lacks to enter it; no way leads there then. */
  need: number | null;
  /** The kinds of mobs and the bosses the atlas saw there; empty for a map with none (M25 Rìa Hồng Giang). */
  mobs: { name: string; level: number; boss: boolean }[];
}

/** One level of a skill (s2c/30): skill points, character level, nội lực (25 = 1 thành). */
export interface SkillLevel {
  level: number;
  description: string;
  cost: number;
  requiredLevel: number;
  mana: number;
}

/** SkillView of view.rs: one skill of the tree with the character's level. */
export interface Skill {
  id: number;
  name: string;
  /** Top left corner on the tree background (288 × 347, boxes of 60); null when it has no box. */
  place: { x: number; y: number; branch: string; depth: number } | null;
  level: number;
  maxLevel: number;
  prerequisite: { id: number; name: string; learned: boolean } | null;
  current: SkillLevel | null;
  /** null at the top level. */
  next: SkillLevel | null;
  /** Why Nâng cấp cannot take the next level now; empty when it can. */
  blockers: string[];
  /** The game's detail panel, line by line. */
  panel: string[];
}

/** ItemView of view.rs: an item of the bag or a gear slot, named from data/items.json. */
export interface Item {
  /** Its slot in the bag, or the gear slot. */
  slot: number;
  id: number;
  /** The server's id of this one item, the same in the bag and in a gear slot. */
  uuid: string;
  name: string;
  /** data/icons/i<icon>.webp; null when the table lacks the item. */
  icon: number | null;
  /** 0 hat, 1 armour, 2 weapon, 3 ring, 4 wings… and its name. */
  kind: number | null;
  kindName: string | null;
  desc: string;
  /** 1 Hỏa, 2 Lôi, 4 Thủy; null for plain items. */
  element: number | null;
  elementName: string | null;
  quantity: number;
  /** Stacks in a slot: the quantity is drawn, even 1. */
  stacks: boolean;
  /** Now and most, for items that wear out. */
  durability: [number, number] | null;
  /** Level to wear it, for gear. */
  level: number | null;
  /** Who can wear it: 0 nam, 1 nữ; null when both can (weapons, rings, everything that is no gear). */
  gender: number | null;
  stats: string[];
  /** Cường hoá: +0 … +16. */
  plus: number;
  /** Trade-locked: bought for Xu khóa, worn, or upgraded (15-shops.md#khoá). */
  locked: boolean;
  /** Phẩm chất of gear: 0 Thường, 1 Hiếm, 2 Quý, 3 Sử Thi (field4); 0 for everything else. */
  quality: number;
  qualityName: string | null;
}

/** A button of the item detail: wear, use or throw away (discard) the item of a bag slot, take off or repair the one of a
 * gear slot; "sort" is Sắp xếp of the bag. */
export type ItemAction = "equip" | "unequip" | "use" | "repair" | "discard" | "sort";

export interface BagContents {
  capacity: number;
  items: Item[];
}

export interface Currencies {
  /** The words of s2c/46 before the numbers ("update Xu"); not shown. */
  label: string;
  xu: number;
  xuKhoa: number;
  luong: number;
}

export interface Account {
  id: number;
  /** The label, else the username. */
  label: string;
  username: string;
  /** The label as typed in, empty when none. */
  ownLabel: string;
  serverId: number;
  status: Status;
  statusText: string;
  error: string;
  /** Time of day the session entered the game. */
  since: string;
  /** How potential points are spent on their own (accounts.json); null for not at all. */
  statPlan: StatPlan | null;
  /** Cài đặt đánh (accounts.json). */
  fightSettings: FightSettings;
  /** The target last chosen in the Đánh quái tab on each map, mapId → name (accounts.json). */
  fightTargets: Record<string, string>;
  /** The proxy saved for the account, on or off; null when none. */
  proxy: ProxyInfo | null;
  /** Null until the session is in the game. */
  character: Character | null;
}

export type ProxyKind = "socks5" | "http";

/** ProxyView of view.rs: the saved proxy without its password. */
export interface ProxyInfo {
  enabled: boolean;
  kind: ProxyKind;
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
  /** "socks5 1.2.3.4:1080" */
  label: string;
  /** The IP it went out with in this session (asked through it after login); null until known or when offline. */
  ip: string | null;
}

/** StatPlan of cllt-core's potentials.rs: the main stat of the element, or weights by c2s/10 index (Cường lực, Nội lực,
 * Thân pháp, Thể lực). */
export type StatPlan = "auto" | { weights: [number, number, number, number] };

/** FightSettings of cllt-core's bot/types.rs: what the bot does on its own around the battles it plays. */
export interface FightSettings {
  /** Tự sửa đồ: a worn item at durability 0 is repaired with a Búa Sửa Chữa of the bag; none is ever bought for it. */
  repair: boolean;
  /** Tự nhặt đồ, on unless turned off: the own drops of every won battle are picked up. */
  pickup: boolean;
  /** Nhặt cả đồ khác giới tính, on unless turned off: Tự nhặt đồ also picks up gear the character cannot wear (to
   * sell); off, such gear stays on the ground. */
  pickupOtherGender: boolean;
  /** Nhặt cả đồ người khác, on unless turned off: after each won battle Tự nhặt đồ also picks up what others left on
   * the ground of the zone, from 18 s after it fell (when the server lets anyone have it), while the bag has room. */
  pickupOthers: boolean;
  /** Chỉ nhặt trang bị đúng hệ, off unless turned on: gear of another element than the character's stays on the
   * ground. */
  pickupOwnElement: boolean;
  /** Phẩm chất trang bị nhặt, all four ticked unless unticked: Tự nhặt đồ picks up gear of the qualities ticked
   * (Thường, Hiếm, Quý, Sử Thi); gear of another stays on the ground. Items that are not gear are always picked up. */
  pickupCommon: boolean;
  pickupRare: boolean;
  pickupPrecious: boolean;
  pickupEpic: boolean;
  /** Dùng bình máu, off unless turned on: a battle may drink Hoàn Linh Dược when about to die, at most hpPotionMax a
   * battle and never below hpPotionKeep in the bag; none is bought. Dùng bình mana likewise for Kim Đan Dược, when the
   * skills need nội lực. */
  hpPotion: boolean;
  hpPotionMax: number;
  hpPotionKeep: number;
  mpPotion: boolean;
  mpPotionMax: number;
  mpPotionKeep: number;
  /** Tự gộp đá khi túi đầy, off unless turned on: a fight job with a full bag goes to Pháp sư (M1), merges the locked
   * stones up to Đá cấp mergeUpTo (12, Max, by default) with Xu khóa only, as much as the Xu khóa pays for, and comes
   * back; at most once every mergeEvery minutes (5). */
  autoMerge: boolean;
  mergeUpTo: number;
  mergeEvery: number;
  /** Thời gian chờ, every one off unless turned on. Chờ giữa các trận: mobDelaySecs (1–60) from the end of a battle to
   * the next challenge, instead of 3 s. Chờ trước mỗi lượt đi: every own action of a battle waits turnDelaySecs (0.5–10, in half seconds).
   * Chờ giữa các bước nhiệm vụ: stepDelaySecs (1–30) before each thing of a quest run that is not a battle. Nghỉ giải
   * lao: breakMinutes (1–120) after every breakEvery battles (1–1000). Thời gian ngẫu nhiên: each wait that is on lasts
   * from its time to twice it. */
  mobDelay: boolean;
  mobDelaySecs: number;
  turnDelay: boolean;
  turnDelaySecs: number;
  stepDelay: boolean;
  stepDelaySecs: number;
  restBreak: boolean;
  breakEvery: number;
  breakMinutes: number;
  delayRandom: boolean;
  /** Thời gian chờ got its defaults (every wait on, from 1.1.14): src-tauri gives them once to an account without it. */
  waitsSet: boolean;
  /** Số trận and Thua tối đa last chosen in the Đánh quái tab, and Thua tối đa of the Nhiệm vụ tab (useFightSetting). */
  fightCount: number;
  fightLosses: number;
  questLosses: number;
  /** Tự cộng kỹ năng, off unless turned on (the Kỹ năng modal): points go to the skill of the lowest level that can take
   * one, unlearnt ones first, between battles and with nothing running. */
  autoSkills: boolean;
  /** Tự điểm danh và nhận quà, off unless turned on (the Phúc lợi window of the Tiền tile): Điểm danh once a day, Quà
   * online when its minutes are there, Quà thăng cấp on a level that reaches one, with or without a job running. */
  autoWelfare: boolean;
}

/** Settings of settings.rs: the Cài đặt of the app, the same for every account. */
export interface Settings {
  /** Where the sessions connect from their next login; plays1.colauloanthe.vn:1688 by default. */
  server: { host: string; port: number };
  /** Lưu dữ liệu trận: every battle of every account into battle_data of cllt.db. */
  record: boolean;
  /** The close button of the window: ask (Đóng cửa sổ), hide it in the tray with the accounts still playing, or quit. */
  onClose: OnClose;
  /** Thông báo of the system when a fight job or quest run ends by itself, and when it ends for losses (notify.rs). */
  notifyDone: boolean;
  notifyLost: boolean;
}

/** OnClose of settings.rs. */
export type OnClose = "ask" | "tray" | "quit";

/** SettingsView of settings.rs: what Cài đặt opens with. */
export interface SettingsView {
  settings: Settings;
  /** What Mặc định puts back. */
  defaults: Settings;
  /** What Lưu dữ liệu trận has kept; null without cllt.db. */
  battleData: { battles: number; bytes: number } | null;
}

/** Exported of settings.rs: the file Xuất dữ liệu trận wrote. */
export interface Exported {
  path: string;
  battles: number;
  bytes: number;
}

/** Lưu file of Xuất JSON (backup.rs): the cllt-accounts-<time>.json written to Downloads. */
export interface SavedAccounts {
  path: string;
  accounts: number;
}

/** One account of the JSON of Nhập, before anything is saved; its password never comes back, only whether it has one. */
export interface PreviewAccount {
  label: string;
  username: string;
  serverId: number;
  password: boolean;
  proxy: boolean;
  /** The account of the list with this username on this server: replaced with Ghi đè, else skipped. */
  existing: number | null;
  /** An earlier account of the JSON logs in the same: this one is skipped. */
  repeated: boolean;
}

export interface ImportPreview {
  accounts: PreviewAccount[];
  /** The JSON has the Cài đặt of the app. */
  settings: boolean;
}

/** What Nhập did. */
export interface Imported {
  added: number;
  replaced: number;
  skipped: number;
  settings: boolean;
}

/** Where a Log lỗi comes from: a line of the bot, the error that ended a session, Báo lỗi, or the UI. */
export type FaultSource = "bot" | "connection" | "report" | "ui";

/** A Log lỗi as the Cài đặt tab lists it (store.rs FaultRow). */
export interface FaultRow {
  id: number;
  /** ms since 1970. */
  at: number;
  /** The account's username, null for the UI. */
  username: string | null;
  source: FaultSource;
  text: string;
}

/** Log lỗi: how many, the bytes of their reports, the newest first. */
export interface FaultList {
  count: number;
  bytes: number;
  recent: FaultRow[];
}

/** Xuất log lỗi: the file written. */
export interface ExportedFaults {
  path: string;
  faults: number;
  bytes: number;
}

export interface AppState {
  /** Count of changes the reply was read at; an update with a count not above it is older. */
  rev: number;
  accounts: Account[];
  /** Why accounts.json could not be read; the app then never writes it. */
  accountsError: string | null;
}

/** The "accounts" event: the accounts that changed, as they were at `rev`. */
export interface AccountsUpdate {
  rev: number;
  accounts: Account[];
  /** Every account id in order, when one was added or removed. */
  ids: number[] | null;
}

/** The add and edit form; an empty password when editing keeps the saved one. */
export interface AccountForm {
  username: string;
  password: string;
  serverId: number;
  label: string;
  proxy: ProxyForm;
}

/** The passwords of an account, for the edit form only (account_secrets of commands.rs). */
export interface Secrets {
  password: string;
  /** Empty when the account has no proxy or a proxy without one. */
  proxyPassword: string;
}

/** The proxy part of the form (ProxyForm of commands.rs): off with no host saves no proxy. An empty password with the
 * saved username keeps the saved password. */
export interface ProxyForm {
  enabled: boolean;
  kind: ProxyKind;
  host: string;
  port: number;
  username: string;
  password: string;
}

/** HP, nội lực (s1) and sức mạnh (s2) of one side in the battle window; the mob's HP is not known before a result
 * shows it (cllt_core::battle_view::Gauge). */
export interface Gauge {
  hp: number | null;
  maxHp: number | null;
  s1: number;
  s2: number;
}

export interface BattleSide {
  name: string;
  level: number;
  /** 1 Hỏa, 2 Lôi, 4 Thủy. */
  element: number | null;
  gauge: Gauge;
}

/** s2c/22: the board (64 pieces, row by row) and both sides as the battle opens. */
export interface BattleOpen {
  board: number[];
  me: BattleSide;
  mob: BattleSide;
  mobId: string;
  /** The mob's sprite sheet, 100000 + 10 n: its icon is data/icons/mobs/<n>.webp. */
  sprite: number | null;
  boss: boolean;
  turnSeconds: number;
}

/** One step of a fall: cells cleared, pieces that fell [from, to], new pieces [cell, piece] (-2 when not known). */
export interface Wave {
  cleared: number[];
  falls: [number, number][];
  filled: [number, number][];
}

/** One result: the board before it, the swap or the skill's cells, each wave, the board after it. */
export interface BattleFrame {
  seq: number;
  turn: Turn;
  before: number[];
  swap: [number, number] | null;
  cells: number[];
  /** Hỏa Kiếm Thuật turned the cells into Kiếm lửa (piece 10) instead of destroying them. */
  fire: boolean;
  waves: Wave[];
  board: number[];
  reshuffled: boolean;
  me: Gauge;
  mob: Gauge;
  reward: { won: boolean; exp: number; coin: number } | null;
}

export type BattleEndKind = "won" | "lost" | "left" | "cancelled";

export interface BattleEnd {
  result: BattleEndKind;
  exp: number | null;
  coin: number | null;
}

/** What a message of the event "battle" to a battle window says (src-tauri/src/battle_window.rs). */
export type BattleBody =
  | ({ kind: "open" } & BattleOpen)
  | { kind: "turn"; seq: number; mine: boolean; timed: boolean }
  | ({ kind: "move" } & BattleFrame)
  | ({ kind: "end" } & BattleEnd)
  | { kind: "picked"; picked: Picked[] };
/** A message of the event "battle" with its number: the app counts them for all accounts, so they only rise. */
export type BattleMsg = BattleBody & { rev: number };

/** What a battle window shows when it opens in the middle of a battle (battle_state). */
export interface BattleState {
  open: BattleOpen | null;
  board: number[];
  me: Gauge;
  mob: Gauge;
  /** [seq, the player's turn, timed]. */
  turn: [number, boolean, boolean] | null;
  last: Turn | null;
  end: BattleEnd | null;
  picked: Picked[];
  /** The number of the last message that changed it: a window that loaded it drops the messages up to it. */
  rev: number;
}

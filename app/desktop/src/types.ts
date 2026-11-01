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

/** What a log line is about (LogKind of cllt-core's bot/types.rs); logKinds.ts names them. */
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

/** The Thống kê tab: totals, then each mob and map, most battles first, then each item picked up, most times first. */
export interface BattleStats extends Totals {
  mobs: MobTotals[];
  picked: PickedItem[];
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
  /** Where the bot walks back to once the Cửa hàng is closed ("Hồng Giang khu 3"), after "Mua xong quay về chỗ cũ". */
  backTo: string | null;
  /** The maps of the atlas, nearest first, with the portals to take. */
  maps: MapChoice[];
  /** The Dược phẩm shop of Lái Buôn (s2c/1190) once opened; null again off M1. */
  shop: Shop | null;
}

/** A shop as s2c/1190 lists it (ShopView of view.rs). */
export interface Shop {
  title: string;
  items: ShopLine[];
}

/** One line of a shop: `shopId` is what Mua sends, not the item id; the same item is sold for Xu and for Xu khóa. */
export interface ShopLine {
  shopId: number;
  itemId: number;
  name: string;
  icon?: number | null;
  desc: string;
  /** 0 Xu, 1 Xu khóa. */
  currency: 0 | 1;
  price: number;
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
  /** Portals on the shortest known way: 0 for the map the character is on, null when no known way leads there. */
  hops: number | null;
  /** The level the character lacks to enter it; no way leads there then. */
  need: number | null;
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
  stats: string[];
}

/** A button of the item detail: wear, use or throw away (discard) the item of a bag slot, take off or repair the one of a
 * gear slot; "sort" is Sắp xếp of the bag. */
export type ItemAction = "equip" | "unequip" | "use" | "repair" | "discard" | "sort";

export interface BagContents {
  capacity: number;
  items: Item[];
}

export interface Currencies {
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
  /** Số trận and Thua tối đa last chosen in the Đánh quái tab, and Thua tối đa of the Nhiệm vụ tab (useFightSetting). */
  fightCount: number;
  fightLosses: number;
  questLosses: number;
}

/** Settings of settings.rs: the Cài đặt of the app, the same for every account. */
export interface Settings {
  /** Where the sessions connect from their next login; play.colauloanthe.vn:1688 by default. */
  server: { host: string; port: number };
  /** Lưu dữ liệu trận: every battle of every account into battle_data of cllt.db. */
  record: boolean;
}

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

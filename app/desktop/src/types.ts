// What Rust sends: AccountView and CharacterView of src-tauri/src/view.rs (serde camelCase) and the cllt-core types they
// embed. Keep both sides in step.

/** 0 offline, 1 connecting, 2 online, 3 fighting, 4 error */
export type Status = 0 | 1 | 2 | 3 | 4;

/** 0 normal, 1 good (a win), 2 bad (a loss, an error), 3 accent (start, end, entered the game) */
export type Tone = 0 | 1 | 2 | 3;

export interface LogLine {
  /** Number of the line in the log of its account, from 1. */
  seq: number;
  time: string;
  text: string;
  tone: Tone;
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
  /** Why the job ended; null while it runs. */
  done: string | null;
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
  /** What the bot does for the current step. */
  doing: string;
  /** Why the run ended; null while it runs. */
  done: string | null;
}

/** Attack, defence, accuracy, dodge, critical (the last three labels are inferred: docs/app/user-data.md). */
export type Combat = [number, number, number, number, number];

export interface Character {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  exp: number | null;
  levelExp: [number, number] | null;
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
  /** Null until the session is in the game. */
  character: Character | null;
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
}

// What Rust sends: AccountView and CharacterView of src-tauri/src/view.rs (serde camelCase) and the cllt-core types they
// embed. Keep both sides in step.

/** 0 offline, 1 connecting, 2 online, 3 fighting, 4 error */
export type Status = 0 | 1 | 2 | 3 | 4;

/** 0 normal, 1 good (a win), 2 bad (a loss, an error), 3 accent (start, end, entered the game) */
export type Tone = 0 | 1 | 2 | 3;

export interface LogLine {
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
  bosses: BossTile[];
  targets: Target[];
  job: Job | null;
  battle: Battle | null;
}

export interface Account {
  id: number;
  label: string;
  username: string;
  status: Status;
  statusText: string;
  error: string;
  /** Time of day the session entered the game. */
  since: string;
  /** Null until the session is in the game. */
  character: Character | null;
}

export interface AppState {
  accounts: Account[];
  accountsPath: string;
  /** Why accounts.json could not be read; the app then never writes it. */
  accountsError: string | null;
}

export interface NewAccount {
  username: string;
  password: string;
  serverId: number;
  label: string;
}

// The commands and events of src-tauri (commands.rs, app.rs). In a plain browser (`npm run dev` without Tauri) the UI
// shows public/sample.json, written by `npm run sample`, and the commands do nothing: enough to work on the design.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AccountForm,
  AccountsUpdate,
  AppState,
  BattleSource,
  BattleStats,
  ItemAction,
  LogKind,
  LogLine,
  ProxyForm,
  Secrets,
  StatPlan,
  StoredBattle,
} from "./types";

export interface LogEvent {
  id: number;
  line: LogLine;
}

/** A step of a quest: the quest id and the step's position in `Quest.steps`. */
export type QuestStepRef = [quest: number, at: number];

export interface Api {
  state(): Promise<AppState>;
  logs(id: number): Promise<LogLine[]>;
  login(id: number): Promise<void>;
  logout(id: number): Promise<void>;
  loginAll(): Promise<void>;
  logoutAll(): Promise<void>;
  fight(id: number, target: string, count: number, maxLosses: number): Promise<void>;
  /** "Tự làm nhiệm vụ" on the current main quest; with `step`, ▶ on that step: only it, which must be the current one of
   * that quest. */
  quest(id: number, maxLosses: number, step?: QuestStepRef): Promise<void>;
  /** Dừng; with `surrender`, a battle in progress is left as the game's Đầu hàng does instead of played out. */
  stop(id: number, surrender?: boolean): Promise<void>;
  /** Saves how potential points are spent on their own (null: not at all); the session spends what it can at once.
   * Rejects with a message to show. */
  setStats(id: number, plan: StatPlan | null): Promise<void>;
  /** "Cộng +1" on the potential of that c2s/10 index. */
  addStat(id: number, stat: number): Promise<void>;
  /** Nâng cấp: one level of that skill (c2s/1191). */
  upgradeSkill(id: number, skill: number): Promise<void>;
  /** A button of the item detail: wear or use the item of a bag slot, take off or repair the one of a gear slot. */
  itemAction(id: number, action: ItemAction, slot: number): Promise<void>;
  /** Khu vực: asks the zones of the map and their players again (c2s/1172). */
  listZones(id: number): Promise<void>;
  /** Another zone of the map (c2s/1173); the log tells how it went. */
  changeZone(id: number, zone: number): Promise<void>;
  /** Another map, through the portals of the atlas; the log tells how it went. */
  goToMap(id: number, mapId: string): Promise<void>;
  /** Older lines of the Nhật ký from cllt.db, oldest first: before row `before`, of `kinds` (all when empty), only the
   * red ones with `bad`. Empty without the database. */
  logHistory(id: number, before: number | null, kinds: LogKind[], bad: boolean, limit: number): Promise<LogLine[]>;
  /** Thống kê: battles ended since `since` (ms since 1970, all when null), of one source or all; null without the
   * database. */
  battleStats(id: number, since: number | null, source: BattleSource | null): Promise<BattleStats | null>;
  /** Thống kê: the battles themselves, newest first, before row `before`. */
  battleHistory(id: number, since: number | null, source: BattleSource | null, before: number | null, limit: number): Promise<StoredBattle[]>;
  /** Resolves to the id of the new account; rejects with a message to show. */
  addAccount(account: AccountForm): Promise<number>;
  /** An empty password keeps the saved one; rejects with a message to show. */
  updateAccount(id: number, account: AccountForm): Promise<void>;
  /** Rejects with a message to show (a session, or accounts.json that cannot be written); the account then stays. */
  removeAccount(id: number): Promise<void>;
  /** Reaches the game server through the proxy (on or off) and resolves to the time it took in ms; rejects with why
   * not. With `id`, an empty password is the one saved for that account. */
  testProxy(proxy: ProxyForm, id?: number): Promise<number>;
  /** The saved passwords of the account, which Sửa nick fills in; nothing else sends them. */
  accountSecrets(id: number): Promise<Secrets>;
  onAccounts(handler: (update: AccountsUpdate) => void): Promise<UnlistenFn>;
  /** The lines logged since the last event, of every account. */
  onLog(handler: (events: LogEvent[]) => void): Promise<UnlistenFn>;
}

const tauri: Api = {
  state: () => invoke("state"),
  logs: (id) => invoke("logs", { id }),
  login: (id) => invoke("login", { id }),
  logout: (id) => invoke("logout", { id }),
  loginAll: () => invoke("login_all"),
  logoutAll: () => invoke("logout_all"),
  fight: (id, target, count, maxLosses) => invoke("fight", { id, target, count, maxLosses }),
  quest: (id, maxLosses, step) => invoke("quest", { id, maxLosses, step: step ?? null }),
  stop: (id, surrender) => invoke("stop", { id, surrender: surrender ?? false }),
  setStats: (id, plan) => invoke("set_stats", { id, plan }),
  addStat: (id, stat) => invoke("add_stat", { id, stat }),
  upgradeSkill: (id, skill) => invoke("upgrade_skill", { id, skill }),
  itemAction: (id, action, slot) => invoke("item_action", { id, action, slot }),
  listZones: (id) => invoke("list_zones", { id }),
  changeZone: (id, zone) => invoke("change_zone", { id, zone }),
  goToMap: (id, mapId) => invoke("go_to_map", { id, mapId }),
  logHistory: (id, before, kinds, bad, limit) => invoke("log_history", { id, before, kinds, bad, limit }),
  battleStats: (id, since, source) => invoke("battle_stats", { id, since, source }),
  battleHistory: (id, since, source, before, limit) => invoke("battle_history", { id, since, source, before, limit }),
  addAccount: (a) => invoke("add_account", { ...a }),
  updateAccount: (id, a) => invoke("update_account", { id, ...a }),
  removeAccount: (id) => invoke("remove_account", { id }),
  testProxy: (proxy, id) => invoke("test_proxy", { proxy, id: id ?? null }),
  accountSecrets: (id) => invoke("account_secrets", { id }),
  onAccounts: (handler) => listen<AccountsUpdate>("accounts", (e) => handler(e.payload)),
  onLog: (handler) => listen<LogEvent[]>("log", (e) => handler(e.payload)),
};

interface Sample extends AppState {
  logs: Record<string, LogLine[]>;
  /** What battle_stats and battle_history answer for the first account, with no filter. */
  battleStats?: BattleStats;
  battleHistory?: StoredBattle[];
}

let sample: Promise<Sample> | undefined;
const loadSample = () =>
  (sample ??= fetch(`${import.meta.env.BASE_URL}sample.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Sample>) : Promise.reject(new Error(r.statusText))))
    .catch((): Sample => ({ rev: 0, accounts: [], accountsError: null, logs: {} })));
const nothing = async () => {};

const preview: Api = {
  state: () => loadSample(),
  logs: async (id) => (await loadSample()).logs[String(id)] ?? [],
  login: nothing,
  logout: nothing,
  loginAll: nothing,
  logoutAll: nothing,
  fight: nothing,
  quest: nothing,
  stop: nothing,
  setStats: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu lựa chọn")),
  addStat: nothing,
  upgradeSkill: nothing,
  itemAction: nothing,
  listZones: nothing,
  changeZone: nothing,
  goToMap: nothing,
  logHistory: async () => [],
  battleStats: async () => (await loadSample()).battleStats ?? null,
  battleHistory: async (_id, _since, _source, before) => (before == null ? ((await loadSample()).battleHistory ?? []) : []),
  addAccount: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu nick")),
  updateAccount: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu nick")),
  removeAccount: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không xoá nick")),
  testProxy: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không kiểm tra được proxy")),
  accountSecrets: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không có mật khẩu")),
  onAccounts: async () => () => {},
  onLog: async () => () => {},
};

export const api: Api = isTauri() ? tauri : preview;

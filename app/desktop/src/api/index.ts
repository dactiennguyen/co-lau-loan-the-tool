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
  FightSettings,
  ItemAction,
  LogKind,
  LogLine,
  MergeForecast,
  ProxyForm,
  Exported,
  Secrets,
  Settings,
  SettingsView,
  StatPlan,
  StoredBattle,
  UpdateView,
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
  /** Saves the Cài đặt đánh of the account; its session follows it from the next battle. Rejects with a message to show. */
  setFight(id: number, settings: FightSettings): Promise<void>;
  /** Saves the target the Đánh quái tab chose on a map, which it chooses again back there. Rejects with a message. */
  setFightTarget(id: number, mapId: string, target: string): Promise<void>;
  /** "Thua còn lại" of the fight job or quest run going on: it ends after that many more losses. */
  setLossesLeft(id: number, left: number): Promise<void>;
  /** "Cộng +1" on the potential of that c2s/10 index. */
  addStat(id: number, stat: number): Promise<void>;
  /** Nâng cấp: one level of that skill (c2s/1191). */
  upgradeSkill(id: number, skill: number): Promise<void>;
  /** A button of the item detail: wear, use or throw away (discard) the item of a bag slot, take off or repair the one of
   * a gear slot; "sort" is Sắp xếp of the bag, `slot` unused. */
  itemAction(id: number, action: ItemAction, slot: number): Promise<void>;
  /** Khu vực: asks the zones of the map and their players again (c2s/1172). */
  listZones(id: number): Promise<void>;
  /** Another zone of the map (c2s/1173); the log tells how it went. */
  changeZone(id: number, zone: number): Promise<void>;
  /** Another map, through the portals of the atlas; the log tells how it went. */
  goToMap(id: number, mapId: string): Promise<void>;
  /** Tiện ích: "Đi tới Làng Thanh Khê"; with `back` the bot walks back to where it started once the dialog closes. */
  shopTrip(id: number, back: boolean): Promise<void>;
  /** Tiện ích: the dialog closed; after a trip with `back` the bot walks back. */
  shopClosed(id: number): Promise<void>;
  /** Tiện ích: opens the Dược phẩm shop of Lái Buôn (on M1); the account's `shop` then lists it. */
  openShop(id: number): Promise<void>;
  /** Mua: `quantity` of the shop line `shopId`; the log tells how it went. */
  buy(id: number, shopId: number, quantity: number): Promise<void>;
  /** Tiện ích, Mua: opens shop `kind` of the 14 (on M1); the account's `shop` then lists it. */
  openShopKind(id: number, kind: number): Promise<void>;
  /** Gộp đá: every set of 4 stones of a level at 100%, up to Đá cấp `upTo`; unlocked stones too with `unlocked`. */
  smithMerge(id: number, upTo: number, unlocked: boolean): Promise<void>;
  /** What Gộp đá would do on the bag as it is now; null without a bag. */
  mergeForecast(id: number, upTo: number, unlocked: boolean): Promise<MergeForecast | null>;
  /** Nâng cấp the item of bag slot `slot` up to +`toLevel`, stones up to `rate` % each level; `quote` only asks the price. */
  /** `worn`: `slot` is a gear slot; the bot takes the item off, upgrades it and wears it again. */
  smithUpgrade(id: number, slot: number, careful: boolean, rate: number, toLevel: number, unlocked: boolean, quote: boolean, worn: boolean): Promise<void>;
  /** Tách đá of the item of bag slot `slot`. */
  smithSeparate(id: number, slot: number): Promise<void>;
  /** Chuyển hoá from bag slot `source` to bag slot `target`. */
  smithTransmute(id: number, source: number, target: number): Promise<void>;
  /** The bag slots Chuyển hoá may move the level of bag slot `source` to. */
  transmuteTargets(id: number, source: number): Promise<number[]>;
  /** Đổi lượng: `times` × 50 Lượng for 50.000 Xu (option 0) or 55.000 Xu khóa (option 1). */
  exchangeLuong(id: number, option: number, times: number): Promise<void>;
  /** Mã quà tặng: the codes as typed, sent one by one from wherever the character stands; rewards go to the mailbox. */
  redeemCodes(id: number, codes: string[]): Promise<void>;
  /** Mã quà tặng, Đếm lại từ 0: forgets the codes refused in a row (the server's lock stays). */
  resetGiftCount(id: number): Promise<void>;
  /** Hòm thư, from wherever the character stands: the list. */
  mailList(id: number): Promise<void>;
  /** Hòm thư: what a mail says and holds; the server marks it read. */
  mailOpen(id: number, mail: number): Promise<void>;
  /** Hòm thư, Nhận: the gift of one mail, once the bag has the room. */
  mailClaim(id: number, mail: number): Promise<void>;
  /** Hòm thư, Nhận hết: every gift that fits. */
  mailClaimAll(id: number): Promise<void>;
  /** Hòm thư, Xóa: these mails, only those whose gift is taken or that had none. There is no Xóa hết. */
  mailDelete(id: number, mails: number[]): Promise<void>;
  /** Older lines of the Nhật ký from cllt.db, oldest first: before row `before`, of `kinds` (all when empty), only the
   * red ones with `bad`. Empty without the database. */
  logHistory(id: number, before: number | null, kinds: LogKind[], bad: boolean, limit: number): Promise<LogLine[]>;
  /** Thống kê: battles ended since `since` (ms since 1970, all when null), of one source or all; null without the
   * database. */
  battleStats(id: number, since: number | null, source: BattleSource | null): Promise<BattleStats | null>;
  /** Thống kê: the battles themselves, newest first, before row `before`. */
  battleHistory(id: number, since: number | null, source: BattleSource | null, before: number | null, limit: number): Promise<StoredBattle[]>;
  /** Tự cập nhật: the version running and where its update stands. */
  updateStatus(): Promise<UpdateView>;
  /** Kiểm tra cập nhật now; a newer version is downloaded, and the "update" event tells how it went. */
  checkUpdate(): Promise<void>;
  /** Khởi động lại để cập nhật: logs every account out, installs the update and opens the new version; rejects with a
   * message to show. */
  installUpdate(): Promise<void>;
  onUpdate(handler: (update: UpdateView) => void): Promise<UnlistenFn>;
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
  /** Cài đặt of the app, their defaults, and what Lưu dữ liệu trận has kept. */
  settings(): Promise<SettingsView>;
  /** Saves the Cài đặt: the game server counts from the next login, Lưu dữ liệu trận at once. Rejects with a message
   * to show. */
  setSettings(settings: Settings): Promise<void>;
  /** Xuất dữ liệu trận: every saved battle into a new cllt-battles-<time>.db in Downloads; rejects with a message to
   * show. */
  exportBattles(): Promise<Exported>;
  /** The file of an export, selected in Finder or Explorer. */
  revealExport(path: string): Promise<void>;
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
  setFight: (id, settings) => invoke("set_fight", { id, settings }),
  setFightTarget: (id, mapId, target) => invoke("set_fight_target", { id, mapId, target }),
  setLossesLeft: (id, left) => invoke("set_losses_left", { id, left }),
  addStat: (id, stat) => invoke("add_stat", { id, stat }),
  upgradeSkill: (id, skill) => invoke("upgrade_skill", { id, skill }),
  itemAction: (id, action, slot) => invoke("item_action", { id, action, slot }),
  listZones: (id) => invoke("list_zones", { id }),
  changeZone: (id, zone) => invoke("change_zone", { id, zone }),
  goToMap: (id, mapId) => invoke("go_to_map", { id, mapId }),
  shopTrip: (id, back) => invoke("shop_trip", { id, back }),
  shopClosed: (id) => invoke("shop_closed", { id }),
  openShop: (id) => invoke("open_shop", { id }),
  buy: (id, shopId, quantity) => invoke("buy", { id, shopId, quantity }),
  openShopKind: (id, kind) => invoke("open_shop_kind", { id, kind }),
  smithMerge: (id, upTo, unlocked) => invoke("smith_merge", { id, upTo, unlocked }),
  mergeForecast: (id, upTo, unlocked) => invoke("merge_forecast", { id, upTo, unlocked }),
  smithUpgrade: (id, slot, careful, rate, toLevel, unlocked, quote, worn) =>
    invoke("smith_upgrade", { id, slot, careful, rate, toLevel, unlocked, quote, worn }),
  smithSeparate: (id, slot) => invoke("smith_separate", { id, slot }),
  smithTransmute: (id, source, target) => invoke("smith_transmute", { id, source, target }),
  transmuteTargets: (id, source) => invoke("transmute_targets", { id, source }),
  exchangeLuong: (id, option, times) => invoke("exchange_luong", { id, option, times }),
  redeemCodes: (id, codes) => invoke("redeem_codes", { id, codes }),
  resetGiftCount: (id) => invoke("reset_gift_count", { id }),
  mailList: (id) => invoke("mail_list", { id }),
  mailOpen: (id, mail) => invoke("mail_open", { id, mail }),
  mailClaim: (id, mail) => invoke("mail_claim", { id, mail }),
  mailClaimAll: (id) => invoke("mail_claim_all", { id }),
  mailDelete: (id, mails) => invoke("mail_delete", { id, mails }),
  logHistory: (id, before, kinds, bad, limit) => invoke("log_history", { id, before, kinds, bad, limit }),
  battleStats: (id, since, source) => invoke("battle_stats", { id, since, source }),
  battleHistory: (id, since, source, before, limit) => invoke("battle_history", { id, since, source, before, limit }),
  addAccount: (a) => invoke("add_account", { ...a }),
  updateAccount: (id, a) => invoke("update_account", { id, ...a }),
  removeAccount: (id) => invoke("remove_account", { id }),
  testProxy: (proxy, id) => invoke("test_proxy", { proxy, id: id ?? null }),
  accountSecrets: (id) => invoke("account_secrets", { id }),
  settings: () => invoke("settings"),
  setSettings: (settings) => invoke("set_settings", { settings }),
  exportBattles: () => invoke("export_battles"),
  revealExport: (path) => invoke("reveal_export", { path }),
  onAccounts: (handler) => listen<AccountsUpdate>("accounts", (e) => handler(e.payload)),
  onLog: (handler) => listen<LogEvent[]>("log", (e) => handler(e.payload)),
  updateStatus: () => invoke("update_status"),
  checkUpdate: () => invoke("check_update"),
  installUpdate: () => invoke("install_update"),
  onUpdate: (handler) => listen<UpdateView>("update", (e) => handler(e.payload)),
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
  setFight: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu lựa chọn")),
  setFightTarget: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu lựa chọn")),
  setLossesLeft: nothing,
  addStat: nothing,
  upgradeSkill: nothing,
  itemAction: nothing,
  listZones: nothing,
  changeZone: nothing,
  goToMap: nothing,
  shopTrip: nothing,
  shopClosed: nothing,
  openShop: nothing,
  buy: nothing,
  openShopKind: nothing,
  smithMerge: nothing,
  mergeForecast: async () => null,
  smithUpgrade: nothing,
  smithSeparate: nothing,
  smithTransmute: nothing,
  transmuteTargets: async () => [],
  exchangeLuong: nothing,
  redeemCodes: nothing,
  resetGiftCount: nothing,
  mailList: nothing,
  mailOpen: nothing,
  mailClaim: nothing,
  mailClaimAll: nothing,
  mailDelete: nothing,
  logHistory: async () => [],
  battleStats: async () => (await loadSample()).battleStats ?? null,
  battleHistory: async (_id, _since, _source, before) => (before == null ? ((await loadSample()).battleHistory ?? []) : []),
  addAccount: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu nick")),
  updateAccount: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu nick")),
  removeAccount: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không xoá nick")),
  testProxy: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không kiểm tra được proxy")),
  accountSecrets: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không có mật khẩu")),
  settings: async () => {
    const defaults = { server: { host: "play.colauloanthe.vn", port: 1688 }, record: true };
    return { settings: defaults, defaults, battleData: { battles: 1284, bytes: 5_712_384 } };
  },
  setSettings: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu cài đặt")),
  exportBattles: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không xuất được dữ liệu trận")),
  revealExport: nothing,
  onAccounts: async () => () => {},
  onLog: async () => () => {},
  updateStatus: async () => ({ current: "0.2.0", state: "off", reason: "bản xem thử trong trình duyệt" }),
  checkUpdate: nothing,
  installUpdate: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không cập nhật")),
  onUpdate: async () => () => {},
};

export const api: Api = isTauri() ? tauri : preview;

// The commands and events of src-tauri (commands.rs, app.rs). In a plain browser (`npm run dev` without Tauri) the UI
// shows public/sample.json, written by `npm run sample`, and the commands do nothing: enough to work on the design.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type {
  AccountForm,
  BattleBody,
  BattleMsg,
  BattleState,
  AccountsUpdate,
  AppState,
  BattleSource,
  BattleStats,
  DailyAction,
  FightSettings,
  ItemAction,
  LogKind,
  LogLine,
  MergeForecast,
  MergeOptions,
  ProxyForm,
  Exported,
  ImportPreview,
  Imported,
  SavedAccounts,
  ExportedFaults,
  FaultList,
  Secrets,
  OnClose,
  Settings,
  SettingsView,
  StatPlan,
  StoredBattle,
  UpdateView,
  LicenseView,
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
  /** Only the settings changed: src-tauri lays them over the account's settings as they are then (Shared::set_fight),
   * so two tabs saving at once do not undo each other. */
  setFight(id: number, settings: Partial<FightSettings>): Promise<void>;
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
  /** `uuid`: the item shown, so the bot does nothing when the slot holds another item by now. */
  itemAction(id: number, action: ItemAction, slot: number, uuid?: string): Promise<void>;
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
  /** Gộp đá: sets of 4 stones of a level at 100%, up to Đá cấp `upTo` (unlocked stones too with `unlocked`); or only `level`
   * and `locked`, at most `sets` merges (the Gộp button of a row). */
  smithMerge(id: number, options: MergeOptions): Promise<void>;
  /** What Gộp đá would do with these options on the bag as it is now; null without a bag. */
  mergeForecast(id: number, options: MergeOptions): Promise<MergeForecast | null>;
  /** Nâng cấp the item of bag slot `slot` up to +`toLevel`, stones up to `rate` % each level; `quote` only asks the price. */
  /** `worn`: `slot` is a gear slot; the bot takes the item off, upgrades it and wears it again. */
  smithUpgrade(
    id: number,
    slot: number,
    careful: boolean,
    rate: number,
    toLevel: number,
    unlocked: boolean,
    quote: boolean,
    worn: boolean,
    charm: boolean,
  ): Promise<void>;
  /** Chế tạo trang bị: the recipes of item kind `kind` (0 Nón, 1 Áo, 2 Vũ khí, 3 Nhẫn), or with `tier` make `times`
   * items of that tier, one after another (1 when left out). */
  smithCraft(id: number, kind: number, tier: number | null, times?: number): Promise<void>;
  /** Đổi Băng Tâm lấy bình rỗng: line `option` (0 one bottle, 1 five, 2 all). */
  smithIce(id: number, option: number): Promise<void>;
  /** Điểm năng động of Hương Lão, reading only; Cách tính điểm too with `rules`. */
  elderPoints(id: number, rules: boolean): Promise<void>;
  /** Nhiệm vụ hàng ngày of Hương Lão: read how many were taken today, or Nhận, Hủy, Hoàn thành. */
  elderDaily(id: number, action: DailyAction): Promise<void>;
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
  /** Chợ trời, from wherever the character stands: the tabs, then page `page` of tab `tab` (-1 for Đang bán). */
  marketOpen(id: number, tab: number, page: number): Promise<void>;
  /** Chợ trời: page `page` of tab `tab` (-1 for Đang bán); also Làm mới. */
  marketPage(id: number, tab: number, page: number): Promise<void>;
  /** Chợ trời, Mua: the listing `uuid` of the page shown, at `price` Xu as shown. */
  marketBuy(id: number, uuid: string, price: number): Promise<void>;
  /** Chợ trời, Đăng bán: one of the item of bag slot `slot` at `price` Xu; the fee is taken at once. */
  marketSell(id: number, slot: number, price: number, uuid?: string): Promise<void>;
  /** Chợ trời, Thu hồi: the listing `uuid` of Đang bán back to the bag. */
  marketWithdraw(id: number, uuid: string): Promise<void>;
  /** Chợ trời, Gia hạn: 24 more hours on the listing `uuid` of Đang bán, for the fee. */
  marketExtend(id: number, uuid: string): Promise<void>;
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
  /** Key: the key kept and where it stands; the "license" event brings each change. */
  licenseStatus(): Promise<LicenseView>;
  /** Kích hoạt: the server checks the key with this machine; rejects with its reason. */
  activateLicense(key: string): Promise<LicenseView>;
  /** Thử lại: the key kept is checked again now. */
  recheckLicense(): Promise<LicenseView>;
  onLicense(handler: (license: LicenseView) => void): Promise<UnlistenFn>;
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
  /** Xoá dữ liệu trận: every saved battle of every account; how many went. Rejects with a message to show. */
  clearBattles(): Promise<number>;
  /** Gửi thử of Cài đặt → Thông báo: one notification now; rejects with a message to show. */
  testNotification(): Promise<void>;
  /** The file of an export, selected in Finder or Explorer. */
  revealExport(path: string): Promise<void>;
  /** Xuất JSON: the accounts `ids` with their passwords, and the Cài đặt of the app when `settings` (backup.rs). */
  exportAccounts(ids: number[], settings: boolean): Promise<string>;
  /** Lưu file of Xuất JSON: the same JSON into a new cllt-accounts-<time>.json in Downloads, readable by its owner only. */
  saveAccounts(ids: number[], settings: boolean): Promise<SavedAccounts>;
  /** Nhập JSON before anything is saved: each account, whether the list has it, whether it has a password; rejects
   * with what is wrong with the JSON. */
  previewImport(text: string): Promise<ImportPreview>;
  /** Nhập: adds the new accounts, replaces those the list has when `replace`, applies the Cài đặt of the JSON when
   * `settings`; rejects with a message to show. */
  importAccounts(text: string, replace: boolean, settings: boolean): Promise<Imported>;
  /** Báo lỗi: the note of the user, kept in Log lỗi with the account's last log lines, commands and packets. */
  reportFault(id: number, note: string): Promise<void>;
  /** An error of the UI, kept in Log lỗi. */
  reportUiError(text: string, detail: string): Promise<void>;
  /** Log lỗi for the Cài đặt tab. */
  faults(): Promise<FaultList>;
  /** Xuất log lỗi: every Log lỗi into a new cllt-errors-<time>.json in Downloads; rejects with a message to show. */
  exportFaults(): Promise<ExportedFaults>;
  /** Xoá log lỗi: how many went. */
  clearFaults(): Promise<number>;
  /** Đóng cửa sổ: Thu nhỏ vào khay ("tray") or Thoát ứng dụng ("quit"), kept as what the close button does from now on
   * when `remember`. Rejects with a message to show when that cannot be saved; nothing happens then. */
  closeWindow(action: Exclude<OnClose, "ask">, remember: boolean): Promise<void>;
  /** The close button was pressed and Cài đặt says to ask: show Đóng cửa sổ. */
  onCloseAsked(handler: () => void): Promise<UnlistenFn>;
  onAccounts(handler: (update: AccountsUpdate) => void): Promise<UnlistenFn>;
  /** The lines logged since the last event, of every account. */
  onLog(handler: (events: LogEvent[]) => void): Promise<UnlistenFn>;
  /** What the battle window of account `id` shows now (battle_window.rs); null for no account of that id. */
  battleState(id: number): Promise<BattleState | null>;
  /** Opens the battle window of account `id`, or brings it to the front. */
  openBattleWindow(id: number, onTop: boolean, chroma: boolean): Promise<void>;
  /** The messages to the battle window this page is, in order. Only this window's: the app sends each to its own. */
  onBattle(handler: (msg: BattleMsg) => void): Promise<UnlistenFn>;
  /** Luôn trên cùng of the window this page is. */
  setOnTop(onTop: boolean): Promise<void>;
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
  itemAction: (id, action, slot, uuid) => invoke("item_action", { id, action, slot, uuid: uuid ?? null }),
  listZones: (id) => invoke("list_zones", { id }),
  changeZone: (id, zone) => invoke("change_zone", { id, zone }),
  goToMap: (id, mapId) => invoke("go_to_map", { id, mapId }),
  shopTrip: (id, back) => invoke("shop_trip", { id, back }),
  shopClosed: (id) => invoke("shop_closed", { id }),
  openShop: (id) => invoke("open_shop", { id }),
  buy: (id, shopId, quantity) => invoke("buy", { id, shopId, quantity }),
  openShopKind: (id, kind) => invoke("open_shop_kind", { id, kind }),
  smithMerge: (id, options) => invoke("smith_merge", { id, options }),
  mergeForecast: (id, options) => invoke("merge_forecast", { id, options }),
  smithUpgrade: (id, slot, careful, rate, toLevel, unlocked, quote, worn, charm) =>
    invoke("smith_upgrade", { id, slot, careful, rate, toLevel, unlocked, quote, worn, charm }),
  smithCraft: (id, kind, tier, times = 1) => invoke("smith_craft", { id, kind, tier, times }),
  smithIce: (id, option) => invoke("smith_ice", { id, option }),
  elderPoints: (id, rules) => invoke("elder_points", { id, rules }),
  elderDaily: (id, action) => invoke("elder_daily", { id, action }),
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
  marketOpen: (id, tab, page) => invoke("market_open", { id, tab, page }),
  marketPage: (id, tab, page) => invoke("market_page", { id, tab, page }),
  marketBuy: (id, uuid, price) => invoke("market_buy", { id, uuid, price }),
  marketSell: (id, slot, price, uuid) => invoke("market_sell", { id, slot, price, uuid: uuid ?? null }),
  marketWithdraw: (id, uuid) => invoke("market_withdraw", { id, uuid }),
  marketExtend: (id, uuid) => invoke("market_extend", { id, uuid }),
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
  clearBattles: () => invoke("clear_battles"),
  testNotification: () => invoke("test_notification"),
  revealExport: (path) => invoke("reveal_export", { path }),
  exportAccounts: (ids, settings) => invoke("export_accounts", { ids, settings }),
  saveAccounts: (ids, settings) => invoke("save_accounts", { ids, settings }),
  previewImport: (text) => invoke("preview_import", { text }),
  importAccounts: (text, replace, settings) => invoke("import_accounts", { text, replace, settings }),
  reportFault: (id, note) => invoke("report_fault", { id, note }),
  reportUiError: (text, detail) => invoke("report_ui_error", { text, detail }),
  faults: () => invoke("faults"),
  exportFaults: () => invoke("export_faults"),
  clearFaults: () => invoke("clear_faults"),
  closeWindow: (action, remember) => invoke("close_window", { action, remember }),
  onCloseAsked: (handler) => listen("close-asked", () => handler()),
  onAccounts: (handler) => listen<AccountsUpdate>("accounts", (e) => handler(e.payload)),
  onLog: (handler) => listen<LogEvent[]>("log", (e) => handler(e.payload)),
  battleState: (id) => invoke("battle_state", { id }),
  openBattleWindow: (id, onTop, chroma) => invoke("open_battle_window", { id, onTop, chroma }),
  // The listen of the window, not the global one: that hears the "battle" of every battle window.
  onBattle: (handler) => getCurrentWebviewWindow().listen<BattleMsg>("battle", (e) => handler(e.payload)),
  setOnTop: (onTop) => getCurrentWebviewWindow().setAlwaysOnTop(onTop),
  updateStatus: () => invoke("update_status"),
  checkUpdate: () => invoke("check_update"),
  installUpdate: () => invoke("install_update"),
  onUpdate: (handler) => listen<UpdateView>("update", (e) => handler(e.payload)),
  licenseStatus: () => invoke("license_status"),
  activateLicense: (key) => invoke("activate_license", { key }),
  recheckLicense: () => invoke("recheck_license"),
  onLicense: (handler) => listen<LicenseView>("license", (e) => handler(e.payload)),
};

/** public/sample.json; scripts/check-sample.mjs checks it against this type. */
export interface Sample extends AppState {
  logs: Record<string, LogLine[]>;
  /** What battle_stats and battle_history answer for the first account, with no filter. */
  battleStats?: BattleStats;
  battleHistory?: StoredBattle[];
  /** The battle window of `?battle=0`: a recorded battle, each message with the ms it came at (sample.rs). */
  battleReplay?: { ms: number; event: BattleBody }[];
}

let sample: Promise<Sample> | undefined;
const loadSample = () =>
  (sample ??= fetch(`${import.meta.env.BASE_URL}sample.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Sample>) : Promise.reject(new Error(r.statusText))))
    .catch((): Sample => ({ rev: 0, accounts: [], accountsError: null, logs: {} })));
const nothing = async () => {};

const validLicense = (key: string): LicenseView => ({
  key: key || "CLLT-AB12-…-GH78",
  state: "valid",
  expiresAt: Date.now() + 3650 * 86_400_000,
  maxAccounts: 100,
  activatedAt: Date.now(),
  checkedAt: Date.now(),
});
let previewLicense: LicenseView = ((state) => {
  switch (state) {
    case "missing":
    case "checking":
      return { key: state === "checking" ? "CLLT-AB12-…-GH78" : "", state };
    case "refused":
      return { key: "CLLT-AB12-…-GH78", state, code: "expired", message: "Key đã hết hạn ngày 01/11/2026" };
    case "unreachable":
      return { key: "CLLT-AB12-…-GH78", state, message: "Không kết nối được server kiểm tra key: error sending request" };
    case "valid":
      return validLicense("");
    default:
      return { key: "", state: "off" };
  }
})(typeof location === "undefined" ? null : new URLSearchParams(location.search).get("license"));
const licenseListeners = new Set<(l: LicenseView) => void>();

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
  smithCraft: nothing,
  smithIce: nothing,
  elderPoints: nothing,
  elderDaily: nothing,
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
  marketOpen: nothing,
  marketPage: nothing,
  marketBuy: nothing,
  marketSell: nothing,
  marketWithdraw: nothing,
  marketExtend: nothing,
  logHistory: async () => [],
  battleStats: async () => (await loadSample()).battleStats ?? null,
  battleHistory: async (_id, _since, _source, before) => (before == null ? ((await loadSample()).battleHistory ?? []) : []),
  addAccount: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu nick")),
  updateAccount: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu nick")),
  removeAccount: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không xoá nick")),
  testProxy: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không kiểm tra được proxy")),
  accountSecrets: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không có mật khẩu")),
  settings: async () => {
    const defaults: Settings = {
      server: { host: "plays1.colauloanthe.vn", port: 1688 },
      record: true,
      onClose: "ask",
      notifyDone: true,
      notifyLost: true,
    };
    return { settings: defaults, defaults, battleData: { battles: 1284, bytes: 5_712_384 } };
  },
  setSettings: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu cài đặt")),
  exportBattles: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không xuất được dữ liệu trận")),
  clearBattles: async () => 1284,
  testNotification: async () => {},
  revealExport: nothing,
  // The sample accounts without passwords, and a rough reading of a JSON against them: enough to see both dialogs.
  exportAccounts: async (ids, settings) => {
    const accounts = (await loadSample()).accounts.filter((a) => ids.includes(a.id)).map((a) => ({ label: a.ownLabel, username: a.username, password: "", serverId: a.serverId }));
    return JSON.stringify({ app: "Co Lau Tool", format: 1, exportedAt: new Date().toISOString(), accounts, ...(settings && { settings: {} }) }, null, 2);
  },
  saveAccounts: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu file")),
  previewImport: async (text) => {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new Error(`JSON không hợp lệ: ${err instanceof Error ? err.message : err}`);
    }
    const o = json as { accounts?: unknown; settings?: unknown; username?: unknown };
    const list = (Array.isArray(json) ? json : Array.isArray(o.accounts) ? o.accounts : o.username ? [json] : []) as Record<string, any>[];
    if (!list.length) throw new Error("Không thấy nick nào");
    const have = (await loadSample()).accounts;
    const key = (a: Record<string, any>) => `${a.serverId ?? 24}/${String(a.username ?? "").toLowerCase()}`;
    return {
      settings: !!o.settings,
      accounts: list.map((a, i) => ({
        label: a.label ?? "", username: a.username ?? "", serverId: a.serverId ?? 24, password: !!a.password, proxy: !!a.proxy?.enabled,
        existing: have.find((h) => key(h) === key(a))?.id ?? null, repeated: list.slice(0, i).some((b) => key(b) === key(a)),
      })),
    };
  },
  importAccounts: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không nhập nick")),
  reportFault: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu log lỗi")),
  reportUiError: nothing,
  faults: async () => ({
    count: 3,
    bytes: 48_213,
    recent: [
      { id: 3, at: Date.now() - 60_000, username: "manina2", source: "report", text: "Dùng Trứng Gà: túi vẫn còn trứng, bấm lại thì báo Vật phẩm không đủ số lượng" },
      { id: 2, at: Date.now() - 65_000, username: "manina2", source: "bot", text: "Không đọc được túi đồ (s2c/1187): PAYLOAD_SCHEMA: Invalid field length 4 at 5" },
      { id: 1, at: Date.now() - 3_600_000, username: "wangpt", source: "connection", text: "Lỗi: Server đã đóng kết nối" },
    ],
  }),
  exportFaults: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không xuất được log lỗi")),
  clearFaults: async () => 0,
  closeWindow: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không có khay")),
  onCloseAsked: async () => () => {},
  onAccounts: async () => () => {},
  onLog: async () => () => {},
  updateStatus: async () => ({ current: "0.2.0", state: "off", reason: "bản xem thử trong trình duyệt" }),
  checkUpdate: nothing,
  installUpdate: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không cập nhật")),
  onUpdate: async () => () => {},
  // ?license=missing (or refused, unreachable, checking, valid) shows the key screen in the preview; Kích hoạt takes
  // any key but "sai".
  licenseStatus: async () => previewLicense,
  activateLicense: async (key) => {
    if (key.trim().toLowerCase() === "sai") throw new Error("Key không đúng");
    previewLicense = validLicense(key.trim().toUpperCase());
    licenseListeners.forEach((h) => h(previewLicense));
    return previewLicense;
  },
  recheckLicense: async () => previewLicense,
  onLicense: async (handler) => {
    licenseListeners.add(handler);
    return () => licenseListeners.delete(handler);
  },
  battleState: async () => null,
  openBattleWindow: async (id) => {
    window.open(`${location.pathname}?battle=${id}`, "_blank");
  },
  onBattle: async (handler) => replayBattle(handler),
  setOnTop: nothing,
};

/** The recorded battle of the sample played as it came, again and again: 2 s before it opens, 5 s after it ends. */
async function replayBattle(handler: (msg: BattleMsg) => void): Promise<UnlistenFn> {
  const events = (await loadSample()).battleReplay ?? [];
  const timers: number[] = [];
  const last = events[events.length - 1]?.ms ?? 0;
  let rev = 0;
  const play = () => {
    for (const e of events) timers.push(window.setTimeout(() => handler({ ...e.event, rev: ++rev }), 2000 + e.ms));
    timers.push(window.setTimeout(play, 2000 + last + 5000));
  };
  if (events.length) play();
  return () => timers.forEach((t) => window.clearTimeout(t));
}

export const api: Api = isTauri() ? tauri : preview;

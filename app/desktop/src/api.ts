// The commands and events of src-tauri (commands.rs, app.rs). In a plain browser (`npm run dev` without Tauri) the UI
// shows public/sample.json, written by `npm run sample`, and the commands do nothing: enough to work on the design.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AccountForm, AccountsUpdate, AppState, LogLine } from "./types";

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
  stop(id: number): Promise<void>;
  /** Resolves to the id of the new account; rejects with a message to show. */
  addAccount(account: AccountForm): Promise<number>;
  /** An empty password keeps the saved one; rejects with a message to show. */
  updateAccount(id: number, account: AccountForm): Promise<void>;
  /** Rejects with a message to show (a session, or accounts.json that cannot be written); the account then stays. */
  removeAccount(id: number): Promise<void>;
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
  stop: (id) => invoke("stop", { id }),
  addAccount: (a) => invoke("add_account", { ...a }),
  updateAccount: (id, a) => invoke("update_account", { id, ...a }),
  removeAccount: (id) => invoke("remove_account", { id }),
  onAccounts: (handler) => listen<AccountsUpdate>("accounts", (e) => handler(e.payload)),
  onLog: (handler) => listen<LogEvent[]>("log", (e) => handler(e.payload)),
};

interface Sample extends AppState {
  logs: Record<string, LogLine[]>;
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
  addAccount: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu nick")),
  updateAccount: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu nick")),
  removeAccount: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không xoá nick")),
  onAccounts: async () => () => {},
  onLog: async () => () => {},
};

export const api: Api = isTauri() ? tauri : preview;

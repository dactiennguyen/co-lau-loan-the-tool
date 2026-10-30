// The commands and events of src-tauri (commands.rs, app.rs). In a plain browser (`npm run dev` without Tauri) the UI
// shows public/sample.json, written by `npm run sample`, and the commands do nothing: enough to work on the design.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Account, AppState, LogLine, NewAccount } from "./types";

export interface LogEvent {
  id: number;
  line: LogLine;
}

export interface Api {
  state(): Promise<AppState>;
  logs(id: number): Promise<LogLine[]>;
  login(id: number): Promise<void>;
  logout(id: number): Promise<void>;
  loginAll(): Promise<void>;
  logoutAll(): Promise<void>;
  fight(id: number, target: string, count: number, maxLosses: number): Promise<void>;
  stop(id: number): Promise<void>;
  /** Resolves to the id of the new account; rejects with a message to show. */
  addAccount(account: NewAccount): Promise<number>;
  removeAccount(id: number): Promise<void>;
  onAccounts(handler: (accounts: Account[]) => void): Promise<UnlistenFn>;
  onLog(handler: (event: LogEvent) => void): Promise<UnlistenFn>;
}

const tauri: Api = {
  state: () => invoke("state"),
  logs: (id) => invoke("logs", { id }),
  login: (id) => invoke("login", { id }),
  logout: (id) => invoke("logout", { id }),
  loginAll: () => invoke("login_all"),
  logoutAll: () => invoke("logout_all"),
  fight: (id, target, count, maxLosses) => invoke("fight", { id, target, count, maxLosses }),
  stop: (id) => invoke("stop", { id }),
  addAccount: (a) => invoke("add_account", { ...a }),
  removeAccount: (id) => invoke("remove_account", { id }),
  onAccounts: (handler) => listen<Account[]>("accounts", (e) => handler(e.payload)),
  onLog: (handler) => listen<LogEvent>("log", (e) => handler(e.payload)),
};

interface Sample extends AppState {
  logs: Record<string, LogLine[]>;
}

let sample: Promise<Sample> | undefined;
const loadSample = () =>
  (sample ??= fetch(`${import.meta.env.BASE_URL}sample.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Sample>) : Promise.reject(new Error(r.statusText))))
    .catch((): Sample => ({ accounts: [], accountsPath: "app/accounts.json", accountsError: null, logs: {} })));
const nothing = async () => {};

const preview: Api = {
  state: () => loadSample(),
  logs: async (id) => (await loadSample()).logs[String(id)] ?? [],
  login: nothing,
  logout: nothing,
  loginAll: nothing,
  logoutAll: nothing,
  fight: nothing,
  stop: nothing,
  addAccount: () => Promise.reject(new Error("Bản xem thử trong trình duyệt không lưu nick")),
  removeAccount: nothing,
  onAccounts: async () => () => {},
  onLog: async () => () => {},
};

export const api: Api = isTauri() ? tauri : preview;

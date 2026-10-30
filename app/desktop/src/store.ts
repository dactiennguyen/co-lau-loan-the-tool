// The UI's state in one zustand store: the accounts src-tauri sends (kept by revision, updates.ts), the account the
// user picked, the dialog that is open and the log of the selected account. hooks.ts fills it from the Tauri events;
// components read what they need with a selector, so an update re-renders only what shows the changed part.
// Short-lived state of one view (the open tab, a menu's position, a form) stays in that view.
import { create } from "zustand";
import type { Account, AccountsUpdate, AppState, LogLine } from "./types";
import { accountsOf, append, merge, type Accounts } from "./updates";

export type Dialog = { kind: "add" } | { kind: "edit"; id: number } | { kind: "remove"; id: number };

export interface Store extends Accounts {
  /** Why accounts.json could not be read; the app then never writes it. */
  accountsError: string | null;
  /** The reply of `state` is in. */
  ready: boolean;
  /** The account the user picked (selectedId falls back to the first while it does not exist). */
  chosen: number | null;
  dialog: Dialog | null;
  /** The log of one account, tagged with it, so another account's lines never show while the new ones load. */
  log: { id: number | null; lines: LogLine[] };

  /** The `state` reply, with the updates that came while it was on its way. */
  loaded: (s: AppState, early: AccountsUpdate[]) => void;
  updated: (u: AccountsUpdate) => void;
  logLoaded: (id: number | null, lines: LogLine[]) => void;
  logged: (id: number, lines: LogLine[]) => void;
  select: (id: number) => void;
  open: (dialog: Dialog) => void;
  close: () => void;
}

export const useStore = create<Store>()((set) => ({
  rev: 0,
  order: [],
  byId: {},
  accountsError: null,
  ready: false,
  chosen: null,
  dialog: null,
  log: { id: null, lines: [] },

  loaded: (s, early) => set({ ...early.reduce(merge, accountsOf(s)), accountsError: s.accountsError, ready: true }),
  updated: (u) => set((s) => merge(s, u)),
  logLoaded: (id, lines) => set({ log: { id, lines } }),
  logged: (id, lines) => set((s) => (s.log.id === id ? { log: { id, lines: append(s.log.lines, lines) } } : s)),
  select: (id) => set({ chosen: id }),
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));

const NO_LINES: LogLine[] = [];

/** The selected account's id: the chosen one while it exists, else the first account. */
export const selectedId = (s: Store) => (s.chosen != null && s.byId[s.chosen] ? s.chosen : (s.order[0] ?? null));
export const selectedAccount = (s: Store): Account | undefined => {
  const id = selectedId(s);
  return id == null ? undefined : s.byId[id];
};
/** The log of the selected account; none while it loads. */
export const selectedLog = (s: Store) => (s.log.id === selectedId(s) ? s.log.lines : NO_LINES);
/** Accounts in the game (online or fighting). */
export const inGame = (s: Store) => s.order.filter((id) => s.byId[id].status === 2 || s.byId[id].status === 3).length;

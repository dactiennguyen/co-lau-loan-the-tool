// The UI's state in one zustand store: the accounts src-tauri sends (kept by revision, sync.ts), the account the
// user picked, the dialog that is open, the log of the selected account and the toasts the updates brought
// (toasts.ts). hooks/useSync.ts fills it from the Tauri events; components read what they need with a selector, so
// an update re-renders only what shows the changed part.
// Short-lived state of one view (the open tab, a menu's position, a form) stays in that view.
import { create } from "zustand";
import { addToasts, errorToasts, questToasts, updateToast, type ToastInput, type ToastItem } from "./toasts";
import type { Account, AccountsUpdate, AppState, LicenseView, LogLine, UpdateView } from "@/api/types";
import type { ShopSub } from "@/views/shop/ShopModal";
import { accountsOf, append, merge, type Accounts } from "./sync";
import { recalled, remember } from "@/utils/remember";

export type Dialog =
  | { kind: "add" }
  | { kind: "edit"; id: number }
  | { kind: "remove"; id: number }
  /** Dừng while a battle is on: play it out or surrender. */
  | { kind: "stop"; id: number }
  /** How potential points are spent on their own. */
  | { kind: "stats"; id: number }
  /** Kỹ năng (SkillsModal): the skill tree, Nâng cấp and Tự cộng. */
  | { kind: "skills"; id: number }
  /** Thống kê (StatsModal): the battle history of the account, opened from its header. */
  | { kind: "battles"; id: number }
  /** Đổi khu / map of the Vị trí card. */
  | { kind: "place"; id: number }
  /** Tiện ích (ShopModal): the 14 shops, Pháp sư, Hương Lão; with the item to pick first in Dược phẩm (Mua búa: 2), or
   * the sub-tab to open on (Nhiệm vụ ngày). */
  | { kind: "shop"; id: number; item?: number; sub?: ShopSub }
  /** Khởi động lại để cập nhật while accounts are in the game. */
  | { kind: "update" }
  /** Cài đặt of the app: game server, Lưu and Xuất dữ liệu trận, what closing the window does. */
  | { kind: "settings" }
  /** Nhập / Xuất JSON of the Tài khoản list (backup.rs), in two tabs: accounts pasted or read from a file, shown before
   * they are added; the accounts with their passwords, copied or saved to a file. */
  | { kind: "accountsJson" }
  /** Báo lỗi of the Nhật ký card. */
  | { kind: "report"; id: number }
  /** Đóng cửa sổ: the close button was pressed and Cài đặt says to ask; `back` is the dialog it took the place of. */
  | { kind: "close"; back: Dialog | null };

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
  /** Xoá màn hình of the Nhật ký, by account: the lines up to this seq are hidden (the log itself keeps them), until
   * Hiện lại or the app starts again. */
  logCleared: Record<number, number>;
  /** Oldest first; none for what the `state` reply already shows. */
  toasts: ToastItem[];
  /** The HP of the battle on is shown under the job and quest run summaries (Chi tiết); kept in localStorage. */
  battleDetails: boolean;
  /** Tự cập nhật (update.rs); null until the app answered. */
  update: UpdateView | null;
  /** Key (license.rs); null until the app answered. */
  license: LicenseView | null;

  /** The `state` reply, with the updates that came while it was on its way. */
  loaded: (s: AppState, early: AccountsUpdate[]) => void;
  updated: (u: AccountsUpdate) => void;
  logLoaded: (id: number | null, lines: LogLine[]) => void;
  logged: (id: number, lines: LogLine[]) => void;
  /** Hides the lines of account `id` up to seq `upTo` from the Nhật ký; null shows them again. */
  clearLog: (id: number, upTo: number | null) => void;
  select: (id: number) => void;
  open: (dialog: Dialog) => void;
  close: () => void;
  dismiss: (toast: number) => void;
  /** A toast of the UI itself (Báo lỗi saved). */
  toast: (toast: ToastInput) => void;
  toggleBattleDetails: () => void;
  /** A new state of the update; a download that just finished brings a toast. */
  updateChanged: (update: UpdateView) => void;
  licenseChanged: (license: LicenseView) => void;
}

const DETAILS = "battleDetails";

export const useStore = create<Store>()((set) => ({
  rev: 0,
  order: [],
  byId: {},
  accountsError: null,
  ready: false,
  chosen: null,
  dialog: null,
  log: { id: null, lines: [] },
  logCleared: {},
  toasts: [],
  battleDetails: recalled(DETAILS) === "1",
  update: null,
  license: null,

  loaded: (s, early) => set({ ...early.reduce(merge, accountsOf(s)), accountsError: s.accountsError, ready: true }),
  updated: (u) =>
    set((s) => {
      const next = merge(s, u);
      const more = next === s ? [] : [...questToasts(s.byId, u.accounts), ...errorToasts(s.byId, u.accounts)];
      return more.length ? { ...next, toasts: addToasts(s.toasts, more) } : next;
    }),
  logLoaded: (id, lines) => set({ log: { id, lines } }),
  logged: (id, lines) => set((s) => (s.log.id === id ? { log: { id, lines: append(s.log.lines, lines) } } : s)),
  clearLog: (id, upTo) =>
    set((s) => {
      const { [id]: _, ...rest } = s.logCleared;
      return { logCleared: upTo == null ? rest : { ...rest, [id]: upTo } };
    }),
  select: (id) => set({ chosen: id }),
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
  dismiss: (toast) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== toast) })),
  toast: (toast) => set((s) => ({ toasts: addToasts(s.toasts, [toast]) })),
  toggleBattleDetails: () =>
    set((s) => {
      remember(DETAILS, s.battleDetails ? "0" : "1");
      return { battleDetails: !s.battleDetails };
    }),
  updateChanged: (update) =>
    set((s) =>
      update.state === "ready" && s.update?.state === "downloading"
        ? { update, toasts: addToasts(s.toasts, [updateToast(update.version)]) }
        : { update },
    ),
  licenseChanged: (license) => set({ license }),
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

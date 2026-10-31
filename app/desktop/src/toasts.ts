// The toasts an "accounts" update brings: a quest run that started and one that ended (▶ on a step, or "Tự làm nhiệm
// vụ"), told apart from the run shown before by its id, or cut off when the account left the game; and an account that
// fell into an error. Without React, like
// updates.ts; store.ts keeps the list and components/Toast.tsx shows each one.
import type { Account } from "./types";

export type ToastTone = "info" | "good" | "warn";

export interface ToastInput {
  tone: ToastTone;
  /** The account it is about. */
  title: string;
  text: string;
}

export interface ToastItem extends ToastInput {
  id: number;
}

/** Toasts on screen at most; the oldest leave first. */
export const MAX_TOASTS = 4;

/** What the accounts of an update started or ended, against the same accounts before it. */
export function questToasts(before: Record<number, Account>, after: Account[]): ToastInput[] {
  const out: ToastInput[] = [];
  for (const a of after) {
    const run = a.character?.questRun;
    const prev = before[a.id]?.character?.questRun;
    // Out of the game (logout, lost connection, error): the session and its run are gone, so they end here.
    if (!run) {
      if (prev && prev.done == null) out.push({ tone: "warn", title: a.label, text: `Bot dừng: ${a.error || a.statusText}` });
      continue;
    }
    const fresh = prev?.id !== run.id;
    if (fresh && run.done == null) {
      const step = run.step != null ? a.character?.quest?.steps[run.step]?.text : undefined;
      out.push({ tone: "info", title: a.label, text: step ? `Bắt đầu làm bước "${step}"` : "Bắt đầu tự làm nhiệm vụ" });
    }
    // A run may end before the UI saw it run: a step refused, or a kill count already reached.
    if (run.done != null && (fresh || prev?.done == null)) {
      out.push({ tone: run.stepDone ? "good" : "warn", title: a.label, text: run.done });
    }
  }
  return out;
}

/** An account that fell into an error: a login refused, a proxy that does not reach the game server, a lost
 * connection. One whose quest run it cut off has its toast from questToasts already. */
export function errorToasts(before: Record<number, Account>, after: Account[]): ToastInput[] {
  return after
    .filter((a) => {
      const prev = before[a.id];
      const running = prev?.character?.questRun != null && prev.character.questRun.done == null;
      return a.status === 4 && prev != null && prev.status !== 4 && !running;
    })
    .map((a) => ({ tone: "warn", title: a.label, text: `Lỗi: ${a.error}` }));
}

let lastId = 0;

/** `more` after `list`, each with a new id, to the last MAX_TOASTS. */
export function addToasts(list: ToastItem[], more: ToastInput[]): ToastItem[] {
  return [...list, ...more.map((t) => ({ ...t, id: ++lastId }))].slice(-MAX_TOASTS);
}

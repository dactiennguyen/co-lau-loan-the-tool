// How the UI keeps up with src-tauri/src/app.rs, without React or the store: listen before loading, and drop what is
// older than what is shown. store.ts keeps the result; hooks.ts runs the listeners.
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { Account, AccountsUpdate, AppState, LogLine } from "./types";

/** Lines of log kept per account, as in src-tauri/src/app.rs. */
export const LOG_LINES = 500;

/**
 * Listens first, then loads, so nothing sent in between is lost: `apply` gets what was loaded with the events that came
 * while it loaded, and `onEvent` every event after that. Returns the cleanup of an effect.
 */
export function listenThenLoad<T, R>(
  listen: (handler: (event: T) => void) => Promise<UnlistenFn>,
  load: () => Promise<R>,
  apply: (loaded: R, early: T[]) => void,
  onEvent: (event: T) => void,
): () => void {
  let live = true;
  let stop: UnlistenFn | undefined;
  let early: T[] | null = [];
  listen((event) => {
    if (early) early.push(event);
    else if (live) onEvent(event);
  }).then(async (unlisten) => {
    if (!live) return unlisten();
    stop = unlisten;
    const loaded = await load();
    if (!live) return;
    const queued = early ?? [];
    early = null;
    apply(loaded, queued);
  });
  return () => {
    live = false;
    stop?.();
  };
}

/** The accounts as the UI keeps them: their ids in order, each account by id, and the revision they were read at. */
export interface Accounts {
  rev: number;
  order: number[];
  byId: Record<number, Account>;
}

/** The accounts of the `state` reply. */
export function accountsOf(s: AppState): Accounts {
  return { rev: s.rev ?? 0, order: s.accounts.map((a) => a.id), byId: Object.fromEntries(s.accounts.map((a) => [a.id, a])) };
}

/**
 * `u` on top of `s`, or `s` itself when it is as new already. Accounts `u` does not carry stay the same objects, and the
 * order stays the same array unless `u` changes it, so what shows them does not render again.
 */
export function merge<S extends Accounts>(s: S, u: AccountsUpdate): S | Accounts {
  if (u.rev <= s.rev) return s;
  const byId = { ...s.byId };
  for (const a of u.accounts) byId[a.id] = a;
  if (u.ids) for (const id of s.order) if (!u.ids.includes(id)) delete byId[id];
  return { rev: u.rev, order: u.ids ?? s.order, byId };
}

/**
 * `more` after `lines`, to the last LOG_LINES. Line numbers only grow, without gaps; a number that comes again is a line
 * that changed (a new result of its battle) and takes the place of the one before.
 */
export function append(lines: LogLine[], more: LogLine[]): LogLine[] {
  const first = lines.length ? lines[0].seq : 1;
  const last = lines.length ? lines[lines.length - 1].seq : 0;
  let out = lines;
  const fresh: LogLine[] = [];
  for (const l of more) {
    if (l.seq > last) {
      const i = fresh.findIndex((f) => f.seq === l.seq);
      if (i >= 0) fresh[i] = l;
      else fresh.push(l);
    } else if (out[l.seq - first]?.seq === l.seq) {
      if (out === lines) out = [...lines];
      out[l.seq - first] = l;
    }
  }
  return fresh.length ? [...out, ...fresh].slice(-LOG_LINES) : out;
}

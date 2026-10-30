// How the UI keeps up with src-tauri/src/app.rs without React: listen before loading, and drop what is older than what
// is shown. hooks.ts wraps these in effects.
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

/** `u` on top of `s` unless `s` is as new already. Accounts `u` does not carry stay the same objects, so their cards skip rendering. */
export function merge(s: AppState, u: AccountsUpdate): AppState {
  if (u.rev <= s.rev) return s;
  const changed = new Map(u.accounts.map((a) => [a.id, a]));
  const shown = new Map(s.accounts.map((a) => [a.id, a]));
  const ids = u.ids ?? s.accounts.map((a) => a.id);
  const accounts = ids.map((id) => changed.get(id) ?? shown.get(id)).filter((a): a is Account => !!a);
  return { ...s, rev: u.rev, accounts };
}

/** `more` after `lines` without the ones `lines` has (line numbers only grow), to the last LOG_LINES. */
export function append(lines: LogLine[], more: LogLine[]): LogLine[] {
  const last = lines.length ? lines[lines.length - 1].seq : 0;
  const fresh = more.filter((l) => l.seq > last);
  return fresh.length ? [...lines, ...fresh].slice(-LOG_LINES) : lines;
}

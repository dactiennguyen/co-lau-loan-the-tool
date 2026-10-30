import { useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { api } from "./api";
import type { AppState, LogLine } from "./types";

/** Lines of log kept per account, as in src-tauri/src/app.rs. */
const LOG_LINES = 500;

/** Subscribes while mounted; `subscribe` resolves to its unlisten function. */
function useSubscription(subscribe: () => Promise<UnlistenFn>, deps: unknown[]) {
  useEffect(() => {
    let live = true;
    let stop: UnlistenFn | undefined;
    subscribe().then((u) => (live ? (stop = u) : u()));
    return () => {
      live = false;
      stop?.();
    };
  }, deps);
}

/** Every account, kept current by the "accounts" event. */
export function useAppState() {
  const [state, setState] = useState<AppState>({ accounts: [], accountsPath: "", accountsError: null });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api.state().then((s) => {
      setState(s);
      setReady(true);
    });
  }, []);
  useSubscription(() => api.onAccounts((accounts) => setState((s) => ({ ...s, accounts }))), []);
  return { ...state, ready };
}

/** The log of one account: what it has so far, then each "log" event for it. */
export function useLog(id: number | null) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const current = useRef(id);
  current.current = id;
  useEffect(() => {
    setLines([]);
    if (id == null) return;
    api.logs(id).then((fetched) => {
      if (current.current !== id) return;
      // Lines that came as events while the reply was on its way: keep those the reply does not have.
      setLines((live) => {
        const tail = fetched.slice(-live.length);
        const fresh = live.filter((l) => !tail.some((f) => f.time === l.time && f.text === l.text));
        return [...fetched, ...fresh].slice(-LOG_LINES);
      });
    });
  }, [id]);
  useSubscription(
    () =>
      api.onLog((e) => {
        if (e.id === current.current) setLines((l) => [...l.slice(-(LOG_LINES - 1)), e.line]);
      }),
    [],
  );
  return lines;
}

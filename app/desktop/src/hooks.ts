import { useEffect, useState } from "react";
import { api } from "./api";
import type { AppState, LogLine } from "./types";
import { append, listenThenLoad, merge } from "./updates";

/** Every account: the reply of `state`, then each "accounts" update newer than what is shown. */
export function useAppState() {
  const [state, setState] = useState<AppState>({ rev: 0, accounts: [], accountsError: null });
  const [ready, setReady] = useState(false);
  useEffect(
    () =>
      listenThenLoad(
        api.onAccounts,
        api.state,
        // Updates that came while the reply was on its way: merge drops those the reply already has.
        (s, early) => {
          setState(early.reduce(merge, s));
          setReady(true);
        },
        (u) => setState((s) => merge(s, u)),
      ),
    [],
  );
  return { ...state, ready };
}

/** The log of one account: what it has so far, then each "log" line for it. */
export function useLog(id: number | null) {
  // Tagged with its account, so another account's lines never show while the new ones load.
  const [log, setLog] = useState<{ id: number | null; lines: LogLine[] }>({ id: null, lines: [] });
  useEffect(
    () =>
      listenThenLoad(
        (handler: (lines: LogLine[]) => void) => api.onLog((events) => handler(events.filter((e) => e.id === id).map((e) => e.line))),
        () => (id == null ? Promise.resolve([]) : api.logs(id)),
        (fetched, early) => setLog({ id, lines: append(fetched, early.flat()) }),
        (mine) => mine.length > 0 && setLog((l) => (l.id === id ? { id, lines: append(l.lines, mine) } : l)),
      ),
    [id],
  );
  return log.id === id ? log.lines : [];
}

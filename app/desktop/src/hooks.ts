import { useEffect } from "react";
import { api } from "./api";
import { selectedId, useStore } from "./store";
import type { LogLine } from "./types";
import { append, listenThenLoad } from "./updates";

/** Keeps the store in step with src-tauri: every account, then the log of the selected one. Mounted once, in App. */
export function useSync() {
  useEffect(() => {
    const { loaded, updated } = useStore.getState();
    return listenThenLoad(api.onAccounts, api.state, loaded, updated);
  }, []);
  const id = useStore(selectedId);
  useEffect(() => {
    const { logLoaded, logged } = useStore.getState();
    return listenThenLoad(
      (handler: (lines: LogLine[]) => void) => api.onLog((events) => handler(events.filter((e) => e.id === id).map((e) => e.line))),
      () => (id == null ? Promise.resolve([]) : api.logs(id)),
      (fetched, early) => logLoaded(id, append(fetched, early.flat())),
      (mine) => id != null && mine.length > 0 && logged(id, mine),
    );
  }, [id]);
}

import { useEffect } from "react";
import { api } from "@/api";
import { selectedId, useStore } from "@/store";
import type { LogLine } from "@/api/types";
import { append, listenThenLoad } from "@/store/sync";

/** Keeps the store in step with src-tauri: every account, the log of the selected one, the update of the app and
 * the key of the app.
 * Mounted once, in App. */
export function useSync() {
  useEffect(() => {
    const { loaded, updated } = useStore.getState();
    return listenThenLoad(api.onAccounts, api.state, loaded, updated);
  }, []);
  useEffect(() => {
    const { updateChanged } = useStore.getState();
    // An event newer than the answer of update_status wins.
    return listenThenLoad(api.onUpdate, api.updateStatus, (now, early) => updateChanged(early[early.length - 1] ?? now), updateChanged);
  }, []);
  useEffect(() => {
    const { licenseChanged } = useStore.getState();
    return listenThenLoad(api.onLicense, api.licenseStatus, (now, early) => licenseChanged(early[early.length - 1] ?? now), licenseChanged);
  }, []);
  useEffect(() => {
    // The close button of the window asks first (tray.rs), in place of the dialog open, which comes back after.
    const off = api.onCloseAsked(() => {
      const { dialog, open } = useStore.getState();
      if (dialog?.kind !== "close") open({ kind: "close", back: dialog });
    });
    return () => void off.then((unlisten) => unlisten());
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

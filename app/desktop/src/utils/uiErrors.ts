// Log lỗi of the UI: an exception or a rejected promise nobody caught goes to cllt.db (report_ui_error) with its stack,
// the same message at most once a minute, so a render that fails in a loop does not fill the 500 kept.
import { api } from "@/api";

const AGAIN_MS = 60_000;
const told = new Map<string, number>();

function tell(text: string, detail: string) {
  const now = Date.now();
  if (now - (told.get(text) ?? 0) < AGAIN_MS) return;
  told.set(text, now);
  api.reportUiError(text, detail).catch(() => {});
}

const describe = (reason: unknown) =>
  reason instanceof Error ? { text: `${reason.name}: ${reason.message}`, detail: reason.stack ?? "" } : { text: String(reason), detail: "" };

/** Listens on the window for the errors nobody caught; once, at start. */
export function catchUiErrors() {
  window.addEventListener("error", (e) => {
    const { text, detail } = e.error != null ? describe(e.error) : { text: e.message, detail: "" };
    tell(text || "Lỗi giao diện", detail || `${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const { text, detail } = describe(e.reason);
    tell(`Promise không ai bắt: ${text}`, detail);
  });
}

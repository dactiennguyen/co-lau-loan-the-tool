import { useEffect, useRef } from "react";
import { PHONE_QUERY } from "@/utils/platform";

// The Back of Android (and of a phone's browser) on a phone: what is open closes, the topmost first (a dialog, then the
// screen of an account back to the list), instead of leaving the app. Each open thing pushes one history entry and Back
// pops it. One closed by its own button leaves its entry, marked closed: the next Back passes over it to the next one
// still open, and stops at the first entry of the app when none is (it never goes back past the app). The history is
// never moved from a cleanup, which React may run twice in a row.
const stack: { close: () => void; open: boolean }[] = [];
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const top = stack.pop();
    if (!top) return;
    if (top.open) {
      top.open = false;
      top.close();
    } else if (stack.length > 0) {
      // A closed one: on to the next entry, which the next popstate handles.
      history.back();
    }
  });
}

/** While `open` on a phone, Back calls `close` (the latest one given). */
export function useBack(open: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open || !window.matchMedia(PHONE_QUERY).matches) return;
    const entry = { close: () => latest.current(), open: true };
    stack.push(entry);
    history.pushState({ back: stack.length }, "");
    return () => {
      entry.open = false;
    };
  }, [open]);
}

import { useSyncExternalStore } from "react";
import { PHONE_QUERY } from "@/utils/platform";

const media = () => (typeof window === "undefined" ? null : window.matchMedia(PHONE_QUERY));
const subscribe = (changed: () => void) => {
  const m = media();
  m?.addEventListener("change", changed);
  return () => m?.removeEventListener("change", changed);
};

/** Whether the window is as narrow as a phone (PHONE_QUERY), again on each change of its width. */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => media()?.matches ?? false, () => false);
}

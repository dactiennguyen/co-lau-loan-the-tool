import { useCallback, useState } from "react";
import { recalled, remember } from "@/utils/remember";

/** An open/closed choice kept under `key` (utils/remember.ts: "1" open, "0" closed), the same for every account;
 * closed until opened once, and closed for good when the storage cannot be read. */
export function useRememberedToggle(key: string): [boolean, () => void] {
  const [open, setOpen] = useState(() => recalled(key) === "1");
  const toggle = useCallback(
    () =>
      setOpen((was) => {
        remember(key, was ? "0" : "1");
        return !was;
      }),
    [key],
  );
  return [open, toggle];
}

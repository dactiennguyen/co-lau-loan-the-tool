import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Account, FightSettings } from "./types";

/** The numbers of Cài đặt đánh that the Đánh quái and Nhiệm vụ tabs offer again. */
type Key = "fightCount" | "fightLosses" | "questLosses";

/** How long after the last change a number is saved: a typed number changes on every key. */
const QUIET = 500;

/**
 * One number of the account's Cài đặt đánh (FightSettings of cllt-core) that a tab lets the user change: it shows at
 * once, and is saved to accounts.json QUIET ms after the last change, with the account's other settings as they are
 * then. A change still waiting is saved when the tab closes. A save that fails (the browser preview saves nothing)
 * leaves the number as chosen for as long as the tab is open.
 */
export function useFightSetting(account: Account, key: Key): [number, (v: number) => void] {
  const [value, setValue] = useState(account.fightSettings[key]);
  const latest = useRef(account);
  latest.current = account;
  const pending = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const send = () => {
    const v = pending.current;
    pending.current = null;
    const a = latest.current;
    if (v == null || v === a.fightSettings[key]) return;
    const next: FightSettings = { ...a.fightSettings, [key]: v };
    api.setFight(a.id, next).catch(() => {});
  };
  // On close only: send reads refs, so the first one is enough.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      send();
    },
    [],
  );
  const set = (v: number) => {
    setValue(v);
    pending.current = v;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(send, QUIET);
  };
  return [value, set];
}

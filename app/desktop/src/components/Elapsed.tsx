import { useEffect, useState } from "react";
import { clock } from "@/utils/format";
import { Icon } from "./Icon";

/** Time from `from` to `to` (ms since 1970) as "4:05" or "1:02:03" by a clock; while `to` is null it counts up every second. */
export function Elapsed({ from, to }: { from: number; to: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (to != null) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [to]);
  const secs = Math.max(0, Math.floor(((to ?? now) - from) / 1000));
  return (
    <span className="inline-flex items-center gap-[3px] align-[-1px] text-fg-2" title="Tổng thời gian">
      <Icon name="clock" size={11} />
      <time className="px text-[10.5px]" dateTime={`PT${secs}S`}>
        {clock(secs)}
      </time>
    </span>
  );
}

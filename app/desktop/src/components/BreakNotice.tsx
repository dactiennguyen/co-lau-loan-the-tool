import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { clock, timeOfDay } from "@/utils/format";

/**
 * Nghỉ giải lao of Cài đặt đánh under way (Character.breakUntil): when the fight job or quest run goes on, and how long
 * is left, counted down each second, so a run on its break does not look stuck. Nothing once the break is over.
 */
export function BreakNotice({ until, what }: { until: number | null; what: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until == null) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [until]);
  if (until == null) return null;
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return (
    <div className="flex items-center gap-1.5 text-11 text-coin" role="status">
      <Icon name="clock" size={12} />
      <span>
        Đang nghỉ giải lao, {what} lúc {timeOfDay(until)} (còn <span className="px">{clock(left)}</span>)
      </span>
    </div>
  );
}

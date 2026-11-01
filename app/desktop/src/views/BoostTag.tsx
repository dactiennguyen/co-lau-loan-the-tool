import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { clock } from "@/utils/format";
import type { Boost } from "@/api/types";

/** "x2 EXP" for the effect of Tăng Kinh Nghiệm (Boost::label of cllt-core); the key for one not known yet. */
export const boostLabel = (b: Boost) => (b.key === "ef7" ? `x${b.rate / 100_000} EXP` : `Hiệu ứng ${b.key}`);

/**
 * A timed effect of the character, such as the x2 EXP star of the game's HUD: its name and the time left, counting down
 * each second; nothing once it ran out. The time is the one the server gave at login, which runs down offline too.
 */
export function BoostTag({ boost }: { boost: Boost }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  const left = Math.floor((boost.until - now) / 1000);
  if (left <= 0) return null;
  const label = boostLabel(boost);
  const from = boost.key === "ef7" ? " của Tăng Kinh Nghiệm" : "";
  // Beside the element tag of the hero card: in the colour of EXP, its time left in pixel digits.
  return (
    <span
      className="inline-flex items-center gap-1 h-5 px-1.5 py-0 border border-exp text-10 font-extrabold tracking-[0.04em] text-exp whitespace-nowrap"
      title={`${label}${from}: còn ${clock(left)}, tính cả lúc không đăng nhập (theo lúc vào game)`}
    >
      <Icon name="star" size={11} />
      {label}
      <time className="px text-10 font-semibold text-fg-2" dateTime={`PT${left}S`}>
        {clock(left)}
      </time>
    </span>
  );
}

import type { CSSProperties } from "react";
import { clamp01 } from "../format";
import "./Bar.css";

/** Segmented progress bar, `value` 0..1, its blocks in the colour `fill` (a tokens.css colour); `label` names it. */
export function Bar({ value, fill = "var(--primary)", thin, label }: { value: number; fill?: string; thin?: boolean; label?: string }) {
  return (
    <div
      className={`bar${thin ? " bar--thin" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamp01(value) * 100)}
    >
      <div className="bar__fill" style={{ width: `${clamp01(value) * 100}%`, "--fill": fill } as CSSProperties} />
    </div>
  );
}

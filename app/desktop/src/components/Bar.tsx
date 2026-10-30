import { clamp01 } from "../format";
import "./Bar.css";

/** Progress bar, `value` 0..1, filled with a gradient (tokens.css --grad-*). */
export function Bar({ value, fill = "var(--grad-primary)", thin }: { value: number; fill?: string; thin?: boolean }) {
  return (
    <div className={`bar${thin ? " bar--thin" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamp01(value) * 100)}>
      <div className="bar__fill" style={{ width: `${clamp01(value) * 100}%`, background: fill }} />
    </div>
  );
}

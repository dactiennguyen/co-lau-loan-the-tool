import type { CSSProperties, ReactNode } from "react";
import "./Badge.css";

/** Small pixel tag (LV 21, BOSS) on a `tone` background; keep its text ASCII, the pixel face has no Vietnamese marks. */
export function Badge({ tone = "var(--primary)", children }: { tone?: string; children: ReactNode }) {
  return (
    <span className="badge" style={{ "--tone": tone } as CSSProperties}>
      {children}
    </span>
  );
}

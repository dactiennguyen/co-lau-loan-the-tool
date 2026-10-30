import type { ReactNode } from "react";
import "./Badge.css";

/** Small label (a level, BOSS) tinted with `tone`. */
export function Badge({ tone = "var(--primary-2)", children }: { tone?: string; children: ReactNode }) {
  return (
    <span className="badge" style={{ color: tone }}>
      {children}
    </span>
  );
}

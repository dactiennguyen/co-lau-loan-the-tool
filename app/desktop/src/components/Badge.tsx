import type { CSSProperties, ReactNode } from "react";
import { cn } from "../cn";

/** Small pixel tag (LV 21, BOSS): `tone` background, dark text; keep its text ASCII, the pixel face has no Vietnamese marks. */
export function Badge({ tone = "var(--primary)", className, children }: { tone?: string; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-4 px-[5px] bg-(--tone) text-ink font-pixel font-normal text-11 leading-none whitespace-nowrap shadow-[inset_-2px_-2px_0_rgb(0_0_0/0.25)]",
        className,
      )}
      style={{ "--tone": tone } as CSSProperties}
    >
      {children}
    </span>
  );
}

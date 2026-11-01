import type { CSSProperties } from "react";
import { cn } from "@/utils/cn";
import { clamp01 } from "@/utils/format";

/**
 * Segmented progress bar, `value` 0..1: 6 px blocks with 2 px gaps on a dark well, in the colour `fill` (a tokens.css
 * colour); `label` names it.
 */
export function Bar({
  value,
  fill = "var(--primary)",
  thin,
  label,
  className,
}: {
  value: number;
  fill?: string;
  thin?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("h-2.5 p-0.5 bg-ink", thin && "h-2", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamp01(value) * 100)}
    >
      <div
        className="h-full bg-[image:repeating-linear-gradient(90deg,var(--fill,var(--primary))_0_6px,transparent_6px_8px)] transition-[width] duration-(--slow) ease-step"
        style={{ width: `${clamp01(value) * 100}%`, "--fill": fill } as CSSProperties}
      />
    </div>
  );
}

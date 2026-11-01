import type { CSSProperties } from "react";
import { cn } from "@/utils/cn";

/**
 * A small toggle of a filter row ("Trận", "7 ngày"), in the UI face so Vietnamese marks show: outlined in its `tone` on
 * hover, filled when on.
 */
export function FilterChip({
  on,
  onClick,
  tone = "var(--primary)",
  children,
}: {
  on: boolean;
  onClick: () => void;
  tone?: string;
  children: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "h-[22px] px-2 py-0 bg-bg-2 border border-line font-ui font-bold text-11 leading-none text-fg-2 whitespace-nowrap cursor-pointer",
        "hover:border-(--fchip) hover:text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1",
        on && "bg-(--fchip) border-(--fchip) text-ink",
      )}
      style={{ "--fchip": tone } as CSSProperties}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

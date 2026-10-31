import type { CSSProperties } from "react";
import "./FilterChip.css";

/** A small toggle of a filter row ("Trận", "7 ngày"), in the UI face so Vietnamese marks show; `tone` colours it. */
export function FilterChip({
  on,
  onClick,
  tone,
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
      className={on ? "fchip fchip--on" : "fchip"}
      style={tone ? ({ "--fchip": tone } as CSSProperties) : undefined}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

import type { CSSProperties } from "react";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { PIECES } from "@/views/TurnStatus";
import { FIRE, type Piece } from "./useBattle";

const N = 8;
/** Codes 10..69 are special pieces of kind code % 10 (battle.rs kind): Kiếm lửa is 10. */
const special = (v: number) => v >= 10 && v < 70;
const kindOf = (v: number) => (special(v) ? v % 10 : v);

/** One piece: its tile in the colour of its kind and its icon; Kiếm lửa burns, an unknown piece is a "?". */
function Face({ v, phase }: { v: number; phase: Piece["phase"] }) {
  const p = PIECES[kindOf(v)];
  return (
    <span
      className={cn(
        "absolute inset-[6%] grid place-items-center bevel-sm",
        p ? cn(p.tone, "bg-[color-mix(in_srgb,var(--piece)_26%,var(--ink))] text-(--piece) shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--piece)_60%,transparent)]") : "bg-card-2 text-fg-3",
        special(v) && "animate-burn shadow-[0_0_10px_2px_var(--hp),inset_0_0_0_2px_var(--hp)]",
        phase === "pop" && "animate-pop",
        phase === "flash" && "animate-flash",
      )}
    >
      {p ? <Icon name={v === FIRE ? "flame" : p.icon} size={22} className="w-[58%] h-[58%]" /> : <b className="px text-13">?</b>}
    </span>
  );
}

/**
 * The 8×8 board of the battle window. Each piece sits at its cell by a transform, so when its cell changes it slides
 * there in `dur` ms (a swap, a fall); a new piece starts `lift` rows above and drops in. The board clips what is above it.
 */
export function Board({ pieces, dur, swap, dim }: { pieces: Piece[]; dur: number; swap: [number, number] | null; dim?: boolean }) {
  return (
    <div
      className={cn("relative w-full aspect-square overflow-hidden bg-ink notch", dim && "[&>*]:opacity-40")}
      style={{ "--dur": `${dur}ms` } as CSSProperties}
      role="img"
      aria-label="Bàn cờ"
    >
      {/* The cells, a checker of two darks. Dimmed before and after a battle with the pieces, never the board's own
          dark: it stays opaque, so the green of Nền xanh never shows through it. */}
      <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 transition-opacity duration-(--slow)">
        {Array.from({ length: N * N }, (_, i) => (
          <span key={i} className={cn((Math.floor(i / N) + i) % 2 ? "bg-bg-2" : "bg-card", swap?.includes(i) && "bg-card-2")} />
        ))}
      </div>
      {pieces.map((p) => (
        <span
          key={p.id}
          className={cn("absolute left-0 top-0 w-[12.5%] h-[12.5%]", p.phase !== "enter" && "transition-[transform,opacity] duration-(--dur) ease-in")}
          style={{ transform: `translate(${(p.cell % N) * 100}%, ${(Math.floor(p.cell / N) - p.lift) * 100}%)` }}
        >
          <Face v={p.v} phase={p.phase} />
        </span>
      ))}
    </div>
  );
}

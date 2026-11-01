import { useRef, useState } from "react";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  /** No upper bound when left out (up to DIGITS digits typed). */
  max?: number;
  label: string;
}

/** The − and + of the plate. */
const STEP =
  "h-[26px] border-0 bg-card-2 text-fg font-pixel font-normal text-13 leading-none cursor-pointer bevel-sm enabled:hover:bg-line " +
  "disabled:opacity-35 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2";

/** Digits typed at most without a max: well within the u32 of cllt-core. */
const DIGITS = 6;

/**
 * Integer with − and + buttons, also typed in: digits only, each one passed on at once within min and max (so a button
 * clicked right after typing gets the number), and the field shows the kept value again on Enter or when left. ↑ and ↓
 * step it; Escape drops what was typed. Enter does not submit the form around it.
 */
export function Stepper({ value, onChange, min = 1, max = Infinity, label }: Props) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const digits = max === Infinity ? DIGITS : String(max).length;
  const set = (v: number) => onChange(clamp(v));
  const [draft, setDraft] = useState<string | null>(null);
  // The number is selected on focus, so typing replaces it; the mouseup of the click that focused would undo that.
  const focusing = useRef(false);
  const type = (text: string) => {
    const typed = text.replace(/\D/g, "").slice(0, digits);
    setDraft(typed);
    if (typed) set(Number(typed));
  };
  const shown = draft ?? String(value);
  return (
    <div
      className="inline-grid grid-cols-[26px_auto_26px] items-center h-[30px] p-0 bg-ink border-2 border-ink notch-sm"
      role="group"
      aria-label={label}
    >
      <button type="button" className={STEP} aria-label={`Giảm ${label}`} disabled={value <= min} onClick={() => set(value - 1)}>
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={shown}
        // A well in the plate that lights up while it has the focus.
        className={
          "h-[26px] p-0 border-0 bg-transparent text-center font-pixel font-normal text-13 leading-none text-primary cursor-text hover:bg-bg-2 " +
          "focus:outline-none focus:bg-bg-2 focus:shadow-[inset_0_0_0_2px_var(--ring)] selection:bg-primary selection:text-ink"
        }
        // Wider with a longer number, so every digit stays in sight.
        style={{ width: `max(56px, ${shown.length + 2}ch)` }}
        onChange={(e) => type(e.target.value)}
        onFocus={(e) => {
          e.target.select();
          focusing.current = true;
        }}
        onMouseUp={(e) => {
          if (focusing.current) e.preventDefault();
          focusing.current = false;
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          focusing.current = false;
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            setDraft(null);
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            setDraft(null);
            set(value + (e.key === "ArrowUp" ? 1 : -1));
          }
        }}
      />
      <button type="button" className={STEP} aria-label={`Tăng ${label}`} disabled={value >= max} onClick={() => set(value + 1)}>
        +
      </button>
    </div>
  );
}

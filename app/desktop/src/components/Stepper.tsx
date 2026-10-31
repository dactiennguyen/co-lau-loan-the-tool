import { useRef, useState } from "react";
import "./Stepper.css";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
}

/**
 * Integer with − and + buttons, also typed in: digits only, each one passed on at once within min and max (so a button
 * clicked right after typing gets the number), and the field shows the kept value again on Enter or when left. ↑ and ↓
 * step it; Escape drops what was typed. Enter does not submit the form around it.
 */
export function Stepper({ value, onChange, min = 1, max = 999, label }: Props) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const set = (v: number) => onChange(clamp(v));
  const [draft, setDraft] = useState<string | null>(null);
  // The number is selected on focus, so typing replaces it; the mouseup of the click that focused would undo that.
  const focusing = useRef(false);
  const type = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, String(max).length);
    setDraft(digits);
    if (digits) set(Number(digits));
  };
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Giảm ${label}`} disabled={value <= min} onClick={() => set(value - 1)}>
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={draft ?? String(value)}
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
      <button type="button" aria-label={`Tăng ${label}`} disabled={value >= max} onClick={() => set(value + 1)}>
        +
      </button>
    </div>
  );
}

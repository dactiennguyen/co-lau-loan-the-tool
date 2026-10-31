import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./Hint.css";

interface Props {
  /** Name of the "?" for screen readers, as "Tự sửa đồ là gì?". */
  label: string;
  /** Id of the bubble, for a control it also describes (aria-describedby). */
  id: string;
  children: ReactNode;
}

/** Room the bubble needs under the "?"; with less, it opens above. */
const ROOM = 140;

/**
 * A small "?" that shows `children` in a bubble while the pointer is over it or the bubble, or while it has the focus;
 * Escape, a scroll or leaving hides it. The bubble lives in <body> at a fixed place by the "?", so the clip-path and
 * scrolling of a card cannot cut it. Placed outside any <label>, so a click on it toggles nothing.
 */
export function Hint({ label, id, children }: Props) {
  const mark = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [at, setAt] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const show = () => {
    window.clearTimeout(timer.current);
    const r = mark.current?.getBoundingClientRect();
    if (!r) return;
    const up = r.bottom + ROOM > window.innerHeight;
    setAt({ left: Math.max(8, Math.min(r.left - 6, window.innerWidth - 316)), top: up ? r.top - 8 : r.bottom + 8, up });
  };
  // A short grace, so the pointer can cross from the "?" onto the bubble.
  const hide = (now = false) => {
    window.clearTimeout(timer.current);
    if (now) setAt(null);
    else timer.current = window.setTimeout(() => setAt(null), 150);
  };
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [at]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <>
      <button
        ref={mark}
        type="button"
        className={`hint${at ? " is-open" : ""}`}
        aria-label={label}
        aria-describedby={id}
        onMouseEnter={show}
        onMouseLeave={() => hide()}
        onFocus={show}
        onBlur={() => hide(true)}
        onKeyDown={(e) => e.key === "Escape" && hide(true)}
      >
        ?
      </button>
      {createPortal(
        <span
          role="tooltip"
          id={id}
          className={`hint__bubble${at ? " is-open" : ""}${at?.up ? " is-up" : ""}`}
          style={at ? { left: at.left, top: at.top } : undefined}
          onMouseEnter={() => window.clearTimeout(timer.current)}
          onMouseLeave={() => hide()}
        >
          {children}
        </span>,
        document.body,
      )}
    </>
  );
}

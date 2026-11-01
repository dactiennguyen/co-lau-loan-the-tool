import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn";

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
 * scrolling of a card cannot cut it; inside a modal <dialog> it lives in that dialog, as the top layer would cover
 * <body>. Placed outside any <label>, so a click on it toggles nothing.
 */
export function Hint({ label, id, children }: Props) {
  const mark = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [at, setAt] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setHost(mark.current?.closest("dialog") ?? document.body), []);
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
        className={cn(
          // A square "?" in the pixel frame, quieter than the text beside it until pointed at.
          "flex-none grid place-items-center size-[18px] p-0 border-0 notch-sm bg-card-2 text-fg-3 font-pixel font-normal text-11 leading-none cursor-help bevel-sm",
          "hover:bg-line hover:text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
          at && "bg-line text-fg",
        )}
        aria-label={label}
        aria-describedby={id}
        onMouseEnter={show}
        onMouseLeave={() => hide()}
        onFocus={show}
        onBlur={() => hide(true)}
        onKeyDown={(e) => {
          // Escape closes the bubble first; in a modal it would close the modal too.
          if (e.key === "Escape" && at) {
            e.preventDefault();
            e.stopPropagation();
            hide(true);
          }
        }}
      >
        ?
      </button>
      {host &&
        createPortal(
        <span
          role="tooltip"
          id={id}
          // Under the "?" (above it when up); it shows in two steps, as the rest of the app moves. Hidden, it stays in the
          // page for aria-describedby.
          className={cn(
            "fixed z-60 left-0 top-0 w-max max-w-[300px] px-2.5 py-2 bg-ink shadow-[inset_0_0_0_2px_var(--line-strong),3px_3px_0_rgb(0_0_0/0.35)]",
            "text-fg-2 text-[11.5px] font-medium leading-[1.5] invisible opacity-0 pointer-events-none",
            at?.up && "[transform:translateY(-100%)]",
            at && "visible opacity-100 pointer-events-auto transition-opacity duration-120 ease-[steps(2,jump-none)] motion-reduce:transition-none",
          )}
          style={at ? { left: at.left, top: at.top } : undefined}
          onMouseEnter={() => window.clearTimeout(timer.current)}
          onMouseLeave={() => hide()}
        >
          {children}
        </span>,
        host,
      )}
    </>
  );
}

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";

interface Props {
  /** The frame of the button that opened it: the panel opens under it, and a press on it is not "elsewhere". */
  anchor: RefObject<HTMLElement | null>;
  /** Name of the panel for screen readers. */
  label: string;
  /** Closes it; `refocus` after Escape, so the focus goes back to the button. Keep it stable (useCallback). */
  onClose: (refocus: boolean) => void;
  /** On the panel: its width, its height. */
  className?: string;
  children: ReactNode;
}

/**
 * A panel a button opens by a click (Xung quanh, the legend of Túi đồ), drawn on the body as Menu so no clipped frame
 * hides it: under the button, or above when there is no room, and kept on screen. A press or a wheel turn elsewhere,
 * Escape, resizing or leaving the window closes it; inside, the panel scrolls.
 */
export function Popover({ anchor, label, onClose, className, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const el = panel.current;
    if (!a || !el) return;
    const { width, height } = el.getBoundingClientRect();
    setAt({
      left: Math.max(4, Math.min(a.left, innerWidth - width - 4)),
      top: a.bottom + height + 6 <= innerHeight ? a.bottom + 4 : Math.max(4, a.top - height - 4),
    });
  }, [anchor]);
  useEffect(() => {
    const away = (e: Event) => panel.current?.contains(e.target as Node) || anchor.current?.contains(e.target as Node) || onClose(false);
    const close = () => onClose(false);
    const keys = (e: KeyboardEvent) => e.key === "Escape" && onClose(true);
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("wheel", away, { capture: true, passive: true });
    document.addEventListener("keydown", keys);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("wheel", away, true);
      document.removeEventListener("keydown", keys);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      className={cn("fixed z-50 flex flex-col gap-2 p-2.5 bg-card border-2 border-line-strong notch-sm bevel-sm", className)}
      style={at ?? { left: -9999, top: 0 }}
    >
      {children}
    </div>,
    document.body,
  );
}

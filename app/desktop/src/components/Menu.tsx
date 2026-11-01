import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn";
import { Icon, type IconName } from "./Icon";

export interface MenuItem {
  label: string;
  icon: IconName;
  onSelect: () => void;
  disabled?: boolean;
  /** Why it is disabled, shown under its label. */
  hint?: string;
  danger?: boolean;
  /** A line above it. */
  separated?: boolean;
}

interface Props {
  /** Where it opens, in window coordinates; it moves in when that would put it off screen. */
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
  onClose: () => void;
}

/**
 * Context menu, a pixel panel over everything with one row per item, drawn on the body so no clipped frame hides it. Arrow keys, Home and End move; Enter picks; Escape gives
 * focus back to what opened it. A click or a wheel turn elsewhere, resizing or leaving the window closes it; a scroll
 * the page does by itself (a log line coming in, the quest list following its step) does not.
 */
export function Menu({ x, y, label, items, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const [at, setAt] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = menu.current!;
    opener.current ??= document.activeElement;
    const { width, height } = el.getBoundingClientRect();
    setAt({ left: Math.max(4, Math.min(x, innerWidth - width - 4)), top: Math.max(4, Math.min(y, innerHeight - height - 4)) });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);
  useEffect(() => {
    const away = (e: Event) => menu.current?.contains(e.target as Node) || onClose();
    const close = () => onClose();
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("wheel", away, { capture: true, passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("wheel", away, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      onClose();
      if (e.key === "Escape") (opener.current as HTMLElement | null)?.focus?.();
      return;
    }
    const buttons = [...menu.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = ({ ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: buttons.length - 1 } as Record<string, number>)[e.key];
    if (next === undefined || buttons.length === 0) return;
    e.preventDefault();
    buttons[(next + buttons.length) % buttons.length].focus();
  };
  return createPortal(
    <div
      ref={menu}
      className="fixed z-50 min-w-[184px] grid p-1 bg-card border-2 border-line-strong notch-sm bevel-sm"
      role="menu"
      aria-label={label}
      style={at}
      onKeyDown={keys}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <Fragment key={item.label}>
          {item.separated && <div className="h-0.5 mx-0.5 my-1 bg-line" role="separator" />}
          <button
            type="button"
            role="menuitem"
            className={cn(
              "grid grid-cols-[14px_1fr] items-center gap-x-2 min-h-7 px-2 py-1 border-0 bg-transparent text-fg text-12 font-semibold text-left cursor-pointer [&_svg]:text-fg-3",
              "enabled:hover:bg-card-2 focus-visible:outline-none focus-visible:bg-card-2 focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] disabled:cursor-default disabled:text-fg-3",
              item.danger && "enabled:text-danger enabled:[&_svg]:text-danger",
            )}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            <Icon name={item.icon} size={13} />
            <span>{item.label}</span>
            {item.disabled && item.hint && <small className="col-start-2 text-10 font-medium text-fg-3">{item.hint}</small>}
          </button>
        </Fragment>
      ))}
    </div>,
    document.body,
  );
}

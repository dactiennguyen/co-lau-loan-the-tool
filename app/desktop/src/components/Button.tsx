import type { ButtonHTMLAttributes } from "react";
import { cn } from "../cn";
import { Icon, type IconName } from "./Icon";

export type ButtonKind = "primary" | "tonal" | "outline" | "ghost" | "danger" | "glass";

/** Each kind's face; all but ghost brighten under the pointer. */
const KIND: Record<ButtonKind, string> = {
  primary: "bg-primary text-on-primary shadow-[inset_-2px_-2px_0_var(--primary-shade)] enabled:hover:brightness-112",
  tonal: "bg-card-2 text-fg enabled:hover:brightness-112",
  outline: "bg-bg-2 text-fg enabled:hover:brightness-112",
  ghost: "bg-transparent border-transparent text-fg-2 shadow-none enabled:hover:bg-card-2 enabled:hover:text-fg",
  danger: "bg-accent-deep text-fg shadow-[inset_-2px_-2px_0_#6a3533] enabled:hover:brightness-112",
  glass: "bg-bg-2 text-fg enabled:hover:brightness-112",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: ButtonKind;
  icon?: IconName;
  small?: boolean;
  /** Full width of the parent. */
  block?: boolean;
}

/**
 * Text button in the small notched frame, with an optional leading icon; with no children it is a square icon button
 * and needs `aria-label`. It sinks a pixel while pressed; the clip would hide an outline drawn outside, so focus is
 * drawn inside the border.
 */
export function Button({ kind = "tonal", icon, small, block, className, children, type = "button", ...rest }: Props) {
  const classes = cn(
    "inline-flex items-center justify-center gap-1.5 h-8 px-3 py-0 border-2 border-ink notch-sm font-extrabold text-12 whitespace-nowrap cursor-pointer bevel-sm",
    "transition-[filter,transform] duration-(--fast) ease-step disabled:cursor-default disabled:opacity-45",
    "enabled:active:[transform:translateY(1px)] enabled:active:[box-shadow:none]",
    "focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-5",
    KIND[kind],
    small && "h-[26px] px-2.5 text-11",
    !children && (small ? "w-[26px] px-0" : "w-8 px-0"),
    block && "w-full",
    className,
  );
  return (
    <button type={type} className={classes} title={rest["aria-label"]} {...rest}>
      {icon && <Icon name={icon} size={small ? 13 : 15} />}
      {children && <span>{children}</span>}
    </button>
  );
}

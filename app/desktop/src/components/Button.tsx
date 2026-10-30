import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import "./Button.css";

export type ButtonKind = "primary" | "tonal" | "outline" | "ghost" | "danger" | "glass";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: ButtonKind;
  icon?: IconName;
  small?: boolean;
  /** Full width of the parent. */
  block?: boolean;
}

/** Text button with an optional leading icon; with no children it is an icon button and needs `aria-label`. */
export function Button({ kind = "tonal", icon, small, block, className, children, type = "button", ...rest }: Props) {
  const classes = ["btn", `btn--${kind}`, small && "btn--small", block && "btn--block", !children && "btn--icon", className];
  return (
    <button type={type} className={classes.filter(Boolean).join(" ")} title={rest["aria-label"]} {...rest}>
      {icon && <Icon name={icon} size={small ? 15 : 17} />}
      {children && <span>{children}</span>}
    </button>
  );
}

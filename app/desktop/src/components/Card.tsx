import type { ReactNode } from "react";
import { cn } from "../cn";
import { Icon, type IconName } from "./Icon";

interface Props {
  title: string;
  icon?: IconName;
  /** Colour of the icon tile. */
  tone?: string;
  subtitle?: ReactNode;
  /** Right side of the header. */
  aside?: ReactNode;
  /** On the frame; its colour is var(--frame), the line colour unless a view sets it. */
  className?: string;
  /** On the body under the header, a column by default. */
  bodyClassName?: string;
  children: ReactNode;
}

/** Notched surface with a header (icon tile, title, subtitle, aside) and a body that fills the rest. */
export function Card({ title, icon, tone = "var(--primary)", subtitle, aside, className, bodyClassName, children }: Props) {
  return (
    <section
      className={cn(
        "flex flex-col min-h-0 p-3 gap-2.5 bg-card border-[length:var(--px)] border-[color:var(--frame,var(--line))] notch bevel",
        className,
      )}
    >
      <header className="flex items-center gap-2.5 min-h-[26px]">
        {icon && (
          <span
            className="flex-none grid place-items-center size-[26px] bg-ink shadow-[inset_-2px_-2px_0_rgb(255_255_255/0.05)]"
            style={{ color: tone }}
          >
            <Icon name={icon} size={14} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-extrabold text-12 leading-[1.2] tracking-[0.06em] uppercase text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 mb-0 text-11 text-fg-3 truncate">{subtitle}</p>}
        </div>
        {aside}
      </header>
      <div className={cn("flex-1 min-h-0 flex flex-col gap-2.5", bodyClassName)}>{children}</div>
    </section>
  );
}

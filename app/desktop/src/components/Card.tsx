import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import "./Card.css";

interface Props {
  title: string;
  icon?: IconName;
  /** Colour of the icon tile. */
  tone?: string;
  subtitle?: ReactNode;
  /** Right side of the header. */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Surface with a header (icon tile, title, subtitle, aside) and a body that fills the rest. */
export function Card({ title, icon, tone = "var(--primary)", subtitle, aside, className, children }: Props) {
  return (
    <section className={`card${className ? ` ${className}` : ""}`}>
      <header className="card__head">
        {icon && (
          <span className="card__icon" style={{ color: tone }}>
            <Icon name={icon} size={14} />
          </span>
        )}
        <div className="card__titles">
          <h2 className="card__title">{title}</h2>
          {subtitle && <p className="card__subtitle">{subtitle}</p>}
        </div>
        {aside}
      </header>
      <div className="card__body">{children}</div>
    </section>
  );
}

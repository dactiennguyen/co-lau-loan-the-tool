import type { ReactNode } from "react";
import { Hint } from "./Hint";
import { Icon, type IconName } from "./Icon";
import "./SettingRow.css";

interface Props {
  id: string;
  on: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
  icon: IconName;
  title: string;
  /** What the setting does, behind its "?". */
  hint: string;
  /** What the bot or the app sees for it, beside the name. */
  children?: ReactNode;
}

/** One setting on one dark row: the box, its name and the space up to Bật/Tắt toggle it; the "?" between them only
 * explains. */
export function SettingRow({ id, on, disabled, onChange, icon, title, hint, children }: Props) {
  return (
    <div className={`setting${on ? " setting--on" : ""}`}>
      <div className="setting__row">
        <input id={id} type="checkbox" checked={on} disabled={disabled} aria-describedby={`${id}-hint`} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id} className="setting__pick">
          <span className="setting__box" aria-hidden="true">
            <Icon name="check" size={12} />
          </span>
          <span className="setting__icon" aria-hidden="true">
            <Icon name={icon} size={14} />
          </span>
          <span className="setting__title">{title}</span>
        </label>
        <Hint label={`${title} là gì?`} id={`${id}-hint`}>
          {hint}
        </Hint>
        {children && <span className="setting__facts">{children}</span>}
        <label htmlFor={id} className="setting__state" aria-hidden="true">
          {on ? "Bật" : "Tắt"}
        </label>
      </div>
    </div>
  );
}

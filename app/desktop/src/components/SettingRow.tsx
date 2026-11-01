import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Hint } from "./Hint";
import { Icon, type IconName } from "./Icon";

/** One thing the bot sees for a setting, in its facts (`bad` red): an icon, words, a figure. */
export const SETTING_FACT = "inline-flex items-center gap-1.5 text-fg-2 whitespace-nowrap [&_svg]:text-fg-3 [&_b]:text-13 [&_b]:text-points";
export const SETTING_FACT_BAD = "text-danger [&_svg]:text-danger";

interface Props {
  id: string;
  on: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
  icon: IconName;
  title: string;
  /** What the setting does, behind its "?". */
  hint: string;
  /** What the bot or the app sees for it, beside the name (SETTING_FACT). */
  children?: ReactNode;
}

/**
 * One setting on one dark row: a pixel box, the icon, the name and its "?", what the bot sees for it, Bật/Tắt; the card
 * or dialog stacks them. The box, its name and the space up to Bật/Tắt toggle it; the "?" between them only explains. A
 * setting that is on gets a green edge, as the proxy of the account form does.
 */
export function SettingRow({ id, on, disabled, onChange, icon, title, hint, children }: Props) {
  return (
    <div className={cn("@container grid bg-ink", on && "shadow-[inset_3px_0_0_var(--good)]")}>
      <div className="group/row flex flex-wrap items-center gap-x-1.5 gap-y-0 px-3 hover:bg-bg-2">
        <input
          id={id}
          type="checkbox"
          className="absolute opacity-0 w-px h-px"
          checked={on}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={id} className="flex items-center gap-2.5 py-2.5 cursor-pointer">
          <span
            className={cn(
              "grid place-items-center size-[18px] group-has-[input:focus-visible]/row:outline-2 group-has-[input:focus-visible]/row:outline-ring group-has-[input:focus-visible]/row:outline-offset-2",
              on ? "text-ink bg-good shadow-[inset_-2px_-2px_0_var(--good-shade)]" : "text-transparent bg-bg-2 shadow-[inset_0_0_0_2px_var(--line-strong)]",
              disabled && "opacity-60",
            )}
            aria-hidden="true"
          >
            <Icon name="check" size={12} />
          </span>
          <span className={cn("grid place-items-center size-[26px] text-fg-2 bg-card", on && "text-ink bg-good bevel-sm")} aria-hidden="true">
            <Icon name={icon} size={14} />
          </span>
          <span className="text-13 font-extrabold text-fg">{title}</span>
        </label>
        <Hint label={`${title} là gì?`} id={`${id}-hint`}>
          {hint}
        </Hint>
        {/* After a rule; on a line of their own under the name when the card is narrow, Bật/Tắt left on the first line. */}
        {children && (
          <span
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 ml-2.5 py-1.5 pl-3 min-w-0 border-l-2 border-bg-2 text-[11.5px]",
              "[@container(max-width:620px)]:order-1 [@container(max-width:620px)]:basis-full [@container(max-width:620px)]:ml-0 [@container(max-width:620px)]:pt-1.5 [@container(max-width:620px)]:pb-2 [@container(max-width:620px)]:pl-16 [@container(max-width:620px)]:border-l-0 [@container(max-width:620px)]:border-t-2",
            )}
          >
            {children}
          </span>
        )}
        {/* Bật/Tắt at the right; the row's empty middle is part of it, so a click there toggles too. */}
        <label
          htmlFor={id}
          className={cn(
            "flex-1 self-stretch flex items-center justify-end font-display font-extrabold text-[10.5px] leading-none tracking-[0.06em] uppercase text-fg-3 cursor-pointer",
            on && "text-good",
          )}
          aria-hidden="true"
        >
          {on ? "Bật" : "Tắt"}
        </label>
      </div>
    </div>
  );
}

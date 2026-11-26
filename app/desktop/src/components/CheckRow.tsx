import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Icon } from "./Icon";

/** A pixel check box like the setting rows: the input hidden, the box after it green when on. */
export const CHECK_BOX =
  "grid place-items-center flex-none size-4 touch:size-6 text-transparent bg-bg-2 shadow-[inset_0_0_0_2px_var(--line-strong)] " +
  "peer-checked:text-ink peer-checked:bg-good peer-checked:shadow-[inset_-2px_-2px_0_var(--good-shade)] " +
  "peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-focus-visible:outline-offset-2";

/** A check box with its text as one label: a click anywhere on the line toggles it. */
export function CheckRow({ checked, onChange, disabled, className, children }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("relative inline-flex items-center gap-1.5 text-12 text-fg-2 cursor-pointer hover:text-fg has-disabled:opacity-60 has-disabled:cursor-default", className)}>
      <input className="peer absolute opacity-0 w-px h-px" type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={CHECK_BOX} aria-hidden="true">
        <Icon name="check" size={11} />
      </span>
      {children}
    </label>
  );
}

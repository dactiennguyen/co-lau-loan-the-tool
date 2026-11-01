import type { ReactNode } from "react";
import { Bar } from "./Bar";
import { Icon, type IconName } from "./Icon";

interface StatProps {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  icon: IconName;
  /** Colour of the icon tile and the bar blocks (tokens.css). */
  fill: string;
  /** 0..1; no bar when undefined. */
  progress?: number;
}

/** One figure of a StatTile; a view that fills one itself uses it too. The second and later ones get a dashed line on
 * their left. */
export const STAT = "flex-[1_1_0] flex flex-col gap-1 min-w-0 [&+&]:pl-3 [&+&]:[border-left:var(--px)_dashed_var(--line)]";

/** The icon tile and label heading a figure; `aside` goes at the right end. */
export function StatTop({ label, icon, fill, aside }: { label: string; icon: IconName; fill: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="grid flex-none place-items-center size-6 text-ink bevel-sm" style={{ background: fill }}>
        <Icon name={icon} size={15} />
      </span>
      <span className="text-11 font-extrabold tracking-[0.08em] uppercase text-fg-3">{label}</span>
      {aside && <span className="ml-auto min-w-0 text-11 text-fg-3 truncate">{aside}</span>}
    </div>
  );
}

/** One headline figure: icon tile, label, value, caption, and a bar. */
export function Stat({ label, value, caption, icon, fill, progress }: StatProps) {
  return (
    <div className={STAT}>
      <StatTop label={label} icon={icon} fill={fill} />
      <div className="mt-0.5 font-pixel font-normal text-16 leading-[1.15] text-fg truncate [&_small]:font-ui [&_small]:font-semibold [&_small]:text-12 [&_small]:leading-none [&_small]:text-fg-3">
        {value}
      </div>
      <div className="text-11 text-fg-2 truncate">{caption ?? " "}</div>
      {progress !== undefined && <Bar value={progress} fill={fill} label={label} />}
    </div>
  );
}

/** The notched frame of one or more figures side by side, a dashed line between them. */
export function StatTile({ children }: { children: ReactNode }) {
  return <div className="flex gap-3 min-w-0 py-2 px-2.5 bg-card border-[length:var(--px)] border-line notch bevel">{children}</div>;
}

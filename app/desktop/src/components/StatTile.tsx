import type { ReactNode } from "react";
import { Bar } from "./Bar";
import { Icon, type IconName } from "./Icon";
import "./StatTile.css";

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

/** The icon tile and label heading a figure; `aside` goes at the right end. */
export function StatTop({ label, icon, fill, aside }: { label: string; icon: IconName; fill: string; aside?: ReactNode }) {
  return (
    <div className="stat__top">
      <span className="stat__icon" style={{ background: fill }}>
        <Icon name={icon} size={15} />
      </span>
      <span className="stat__label">{label}</span>
      {aside && <span className="stat__aside">{aside}</span>}
    </div>
  );
}

/** One headline figure: icon tile, label, value, caption, and a bar. */
export function Stat({ label, value, caption, icon, fill, progress }: StatProps) {
  return (
    <div className="stat">
      <StatTop label={label} icon={icon} fill={fill} />
      <div className="stat__value">{value}</div>
      <div className="stat__caption">{caption ?? " "}</div>
      {progress !== undefined && <Bar value={progress} fill={fill} label={label} />}
    </div>
  );
}

/** The notched frame of one or more figures side by side, a dashed line between them. */
export function StatTile({ children }: { children: ReactNode }) {
  return <div className="tile">{children}</div>;
}

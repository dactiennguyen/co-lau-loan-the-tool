import type { ReactNode } from "react";
import { Bar } from "./Bar";
import { Icon, type IconName } from "./Icon";
import "./StatTile.css";

interface Props {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  icon: IconName;
  /** Gradient of the icon tile and the bar (tokens.css --grad-*). */
  fill: string;
  /** 0..1; no bar when undefined. */
  progress?: number;
}

/** One headline figure: icon tile, label, value, caption, and a bar. */
export function StatTile({ label, value, caption, icon, fill, progress }: Props) {
  return (
    <div className="tile">
      <div className="tile__top">
        <span className="tile__icon" style={{ background: fill }}>
          <Icon name={icon} size={18} />
        </span>
        <span className="tile__label">{label}</span>
      </div>
      <div className="tile__value">{value}</div>
      <div className="tile__caption">{caption ?? " "}</div>
      {progress !== undefined && <Bar value={progress} fill={fill} />}
    </div>
  );
}

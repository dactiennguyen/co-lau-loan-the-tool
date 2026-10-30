import { StatTile } from "../components/StatTile";
import { levelProgress, num, pct } from "../format";
import type { Character } from "../types";
import "./MetricRow.css";

/** HP, EXP of the level, coins, and the points left to spend; dashes until the character is in the game. */
export function MetricRow({ character: c }: { character: Character | null }) {
  const level = c && levelProgress(c);
  return (
    <div className="metrics">
      <StatTile
        label="HP"
        icon="heart"
        fill="var(--hp)"
        value={c ? <>{num(c.hp)} <small>/ {num(c.maxHp)}</small></> : "—"}
        caption={c ? (c.battle ? "trong trận" : "hồi đầy sau mỗi trận") : undefined}
        progress={c ? c.hp / Math.max(1, c.maxHp) : 0}
      />
      <StatTile
        label="EXP"
        icon="star"
        fill="var(--exp)"
        value={c ? <>{num(c.exp)} {level && <small>/ {num(level.next)}</small>}</> : "—"}
        caption={level && c ? `${pct(level.part)} · còn ${num(level.left)} lên cấp ${c.level + 1}` : undefined}
        progress={level?.part ?? 0}
      />
      <StatTile label="Xu" icon="coin" fill="var(--coin)" value={num(c?.coin)} caption={c ? "tiền thưởng các trận" : undefined} />
      <StatTile
        label="Tiềm năng"
        icon="gem"
        fill="var(--points)"
        value={c?.statPoints != null ? <>{num(c.statPoints)} <small>điểm</small></> : "—"}
        caption={c?.skillPoints != null ? `${num(c.skillPoints)} điểm kỹ năng chưa dùng` : undefined}
      />
    </div>
  );
}

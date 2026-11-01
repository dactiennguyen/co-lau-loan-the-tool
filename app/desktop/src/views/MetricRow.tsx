import { Bar } from "../components/Bar";
import { STAT, Stat, StatTile, StatTop } from "../components/StatTile";
import { levelProgress, num, pct } from "../format";
import type { Character } from "../types";
import "./MetricRow.css";

/** Vàng turns into 10.000 Xu khoá when the bar is full (Cẩm nang). */
const GOLD_BAR = 10000;

/** What each currency of s2c/46 is for (Cẩm nang). */
const MONEY = [
  { key: "xu", label: "Xu", use: "Chợ trời, góp quân lương" },
  { key: "xuKhoa", label: "Xu khoá", use: "cửa hàng NPC, cường hoá; Vàng đủ 10.000 thì thành Xu khoá" },
  { key: "luong", label: "Lượng", use: "tiền nạp" },
] as const;

/** Two tiles: HP and EXP of the level; the money, Vàng (coin of s2c/9) with Xu, Xu khoá and Lượng (s2c/46). Dashes until
 * the character is in the game. The points left to spend are in StatsCard. */
export function MetricRow({ character: c }: { character: Character | null }) {
  const level = c && levelProgress(c);
  const gold = c?.coin;
  return (
    <div className="metrics">
      <StatTile>
        <Stat
          label="HP"
          icon="heart"
          fill="var(--hp)"
          value={c ? <>{num(c.hp)} <small>/ {num(c.maxHp)}</small></> : "—"}
          caption={c ? (c.battle ? "trong trận" : "hồi đầy sau mỗi trận") : undefined}
          progress={c ? c.hp / Math.max(1, c.maxHp) : 0}
        />
        <Stat
          label="EXP"
          icon="star"
          fill="var(--exp)"
          value={c ? <>{num(c.exp)} {level && <small>/ {num(level.next)}</small>}</> : "—"}
          caption={level && c ? `${pct(level.part)} · còn ${num(level.left)} lên cấp ${c.level + 1}` : undefined}
          progress={level?.part ?? 0}
        />
      </StatTile>
      <StatTile>
        <div className={STAT}>
          <StatTop label="Tiền" icon="wallet" fill="var(--coin)" aside={`Vàng đủ ${num(GOLD_BAR)} thì thành Xu khoá`} />
          <dl className="money">
            <div title={`Vàng: đủ ${num(GOLD_BAR)} thì thành ${num(GOLD_BAR)} Xu khoá`}>
              <dt>Vàng</dt>
              <dd className="px">{gold != null ? <>{num(gold)} <small>/ {num(GOLD_BAR)}</small></> : "—"}</dd>
              <dd className="money__bar">
                <Bar value={gold != null ? gold / GOLD_BAR : 0} fill="var(--coin)" label="Vàng tới 10.000" />
              </dd>
            </div>
            {MONEY.map((m) => (
              <div key={m.key} title={`${m.label}: ${m.use}`}>
                <dt>{m.label}</dt>
                <dd className="px">{c?.currencies ? num(c.currencies[m.key]) : "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
      </StatTile>
    </div>
  );
}

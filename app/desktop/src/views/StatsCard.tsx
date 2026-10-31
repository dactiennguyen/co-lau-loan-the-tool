import { Bar } from "../components/Bar";
import { Card } from "../components/Card";
import { Icon, type IconName } from "../components/Icon";
import { num } from "../format";
import type { Character } from "../types";
import "./StatsCard.css";

// Labels of the game's character panel, in the order of `combat` and `stats`; both measured against the panel by the
// P1 capture (docs/app/user-data.md). c2s/10 numbers the potentials in another order (12-skills-items.md).
const COMBAT: { label: string; icon: IconName; tone: string }[] = [
  { label: "Tấn công", icon: "sword", tone: "var(--c-attack)" },
  { label: "Phòng thủ", icon: "shield", tone: "var(--c-defence)" },
  { label: "Chính xác", icon: "crosshair", tone: "var(--c-accuracy)" },
  { label: "Né tránh", icon: "wind", tone: "var(--c-dodge)" },
  { label: "Chí mạng", icon: "flame", tone: "var(--c-critical)" },
];
const POTENTIALS = ["Cường lực", "Thân pháp", "Nội lực", "Thể lực"];

/** Combat stats, then the potential stats with the points left to spend on them (s2c/9, s2c/10 kind 8) and the skill
 * points left. Spending them is not in the app yet (c2s/10 is known for Cường lực only, docs/app/events/12-skills-items.md). */
export function StatsCard({ character: c }: { character: Character | null }) {
  // Bars against the strongest of the five, so they show the build rather than a scale the game does not give.
  const top = Math.max(1, ...(c?.combat ?? []));
  return (
    <Card title="Chỉ số" icon="bolt" tone="var(--coin)" subtitle={c ? "Chiến đấu và tiềm năng" : "Đăng nhập để xem chỉ số"}>
      <ul className="combat">
        {COMBAT.map((s, i) => (
          <li key={s.label}>
            <span className="combat__icon" style={{ color: s.tone }}>
              <Icon name={s.icon} size={14} />
            </span>
            <span className="combat__label">{s.label}</span>
            <span className="combat__bar">
              <Bar value={(c?.combat?.[i] ?? 0) / top} fill={s.tone} thin />
            </span>
            <span className="combat__value px">{num(c?.combat?.[i])}</span>
          </li>
        ))}
      </ul>
      <div className="potentials__head">
        <span className="potentials__title">
          <Icon name="gem" size={13} />
          Tiềm năng
        </span>
        <span className="potentials__left">
          {c?.statPoints != null ? (
            <>
              <b className="px">{num(c.statPoints)}</b> điểm chưa cộng
            </>
          ) : (
            "—"
          )}
        </span>
      </div>
      <div className="potentials">
        {POTENTIALS.map((label, i) => (
          <div key={label} className="potential">
            <span className="potential__value px">{num(c?.stats[i])}</span>
            <span className="potential__label">{label}</span>
          </div>
        ))}
      </div>
      {c?.skillPoints != null && (
        <p className="potentials__skills">
          <b className="px">{num(c.skillPoints)}</b> điểm kỹ năng chưa dùng
        </p>
      )}
    </Card>
  );
}

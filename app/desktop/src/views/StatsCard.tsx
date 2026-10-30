import { Card } from "../components/Card";
import { Icon, type IconName } from "../components/Icon";
import { num } from "../format";
import type { Character } from "../types";
import "./StatsCard.css";

// Labels of the character panel strings of the game; the order of the last three combat stats and of the potentials
// after Cường lực is inferred (docs/app/user-data.md).
const COMBAT: { label: string; icon: IconName; tone: string }[] = [
  { label: "Tấn công", icon: "sword", tone: "var(--c-attack)" },
  { label: "Phòng thủ", icon: "shield", tone: "var(--c-defence)" },
  { label: "Chính xác", icon: "crosshair", tone: "var(--c-accuracy)" },
  { label: "Né tránh", icon: "wind", tone: "var(--c-dodge)" },
  { label: "Chí mạng", icon: "flame", tone: "var(--c-critical)" },
];
const POTENTIALS = ["Cường lực", "Thân pháp", "Nội lực", "Thể lực"];
const INFERRED = "Nhãn suy từ chuỗi giao diện của game; xem docs/app/user-data.md";

/** Combat stats and potential stats of the character. */
export function StatsCard({ character: c }: { character: Character | null }) {
  return (
    <Card title="Chỉ số" icon="bolt" tone="var(--coin)" subtitle={c ? "Chiến đấu và tiềm năng" : "Đăng nhập để xem chỉ số"}>
      <ul className="combat">
        {COMBAT.map((s, i) => (
          <li key={s.label} title={i >= 2 ? INFERRED : undefined}>
            <span className="combat__icon" style={{ color: s.tone }}>
              <Icon name={s.icon} size={16} />
            </span>
            <span className="combat__label">{s.label}</span>
            <span className="combat__value">{num(c?.combat?.[i])}</span>
          </li>
        ))}
      </ul>
      <div className="potentials">
        {POTENTIALS.map((label, i) => (
          <div key={label} className="potential" title={i >= 1 ? INFERRED : undefined}>
            <span className="potential__value">{num(c?.stats[i])}</span>
            <span className="potential__label">{label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

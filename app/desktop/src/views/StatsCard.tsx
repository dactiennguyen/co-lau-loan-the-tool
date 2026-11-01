import { Bar } from "../components/Bar";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ELEMENT_ICON, ELEMENT_NAME } from "../components/ElementTag";
import { Icon, type IconName } from "../components/Icon";
import { num } from "../format";
import { mainStat, planText, POTENTIALS } from "../potentials";
import type { Account } from "../types";
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
interface Props {
  account: Account;
  /** "Cộng +1" on the potential of that c2s/10 index. */
  onAdd: (stat: number) => void;
  /** Opens the choice of how points are spent on their own. */
  onPlan: () => void;
  /** Opens the Kỹ năng modal. */
  onSkills: () => void;
}

/** Combat stats, then the potential stats with the points left to spend on them (s2c/9, s2c/10 kind 8) and a + on each;
 * the gear after Tiềm năng opens how the bot spends them on its own, lit while it does. The main stat of the element
 * (Hỏa Cường lực, Thủy Nội lực, Lôi Thân pháp) is framed and lit in the element's colour, so a point does not go to
 * another one by mistake. Kỹ năng, top right, opens the skill tree in a modal; it shows the skill points not spent yet
 * (none at 0), and is lit while Tự cộng spends them. */
export function StatsCard({ account, onAdd, onPlan, onSkills }: Props) {
  const c = account.character;
  // A point goes out between battles only, as Bot::add_stat requires.
  const canAdd = account.status >= 2 && account.status <= 3 && (c?.statPoints ?? 0) > 0 && !c?.battle;
  // Bars against the strongest of the five, so they show the build rather than a scale the game does not give.
  const top = Math.max(1, ...(c?.combat ?? []));
  const plan = `Tự cộng điểm: ${planText(account.statPlan, c?.element)}`;
  const element = c?.element ?? null;
  const main = mainStat(element);
  const elementName = element != null ? ELEMENT_NAME[element] : undefined;
  const skillPoints = c?.skillPoints ?? 0;
  const auto = account.fightSettings.autoSkills;
  const skills = (
    <Button
      kind="outline"
      small
      icon="star"
      className={`stats__skills${auto ? " is-on" : ""}`}
      aria-label={`Kỹ năng${skillPoints > 0 ? `: ${num(skillPoints)} điểm chưa cộng` : ""}${auto ? ", đang tự cộng" : ""}`}
      aria-haspopup="dialog"
      onClick={onSkills}
    >
      Kỹ năng
      {skillPoints > 0 && <b className="stats__badge px">{num(skillPoints)}</b>}
    </Button>
  );
  return (
    <Card title="Chỉ số" icon="bolt" tone="var(--coin)" subtitle={c ? undefined : "Đăng nhập để xem chỉ số"} aside={skills}>
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
        <Button
          kind="ghost"
          small
          icon="settings"
          className={`potentials__plan${account.statPlan ? " is-on" : ""}`}
          aria-label={plan}
          aria-haspopup="dialog"
          onClick={onPlan}
        />
        <span className="potentials__left">
          {c?.statPoints != null ? (
            <>
              <b className="px">{num(c.statPoints)}</b> điểm
            </>
          ) : (
            "—"
          )}
        </span>
      </div>
      <div className="potentials">
        {POTENTIALS.map((p, i) => {
          // Without an element whose main stat is known, the four look alike.
          const kind = main == null ? "" : p.index === main ? ` potential--main el--${element}` : " potential--other";
          return (
            <div key={p.name} className={`potential${kind}`}>
              {p.index === main && element != null && (
                <span className="potential__mark" title={`Chỉ số chính của hệ ${elementName}`}>
                  <Icon name={ELEMENT_ICON[element]} size={10} />
                </span>
              )}
              <span className="potential__value px">{num(c?.stats[i])}</span>
              <span className="potential__label">{p.name}</span>
              <Button
                kind="tonal"
                small
                icon="plus"
                className="potential__add"
                aria-label={
                  p.index === main
                    ? `Cộng 1 điểm vào ${p.name}, chỉ số chính của hệ ${elementName}`
                    : `Cộng 1 điểm vào ${p.name}`
                }
                {...(main != null &&
                  p.index !== main && { title: `Cộng 1 điểm vào ${p.name} (không phải chỉ số chính của hệ ${elementName})` })}
                disabled={!canAdd}
                onClick={() => onAdd(p.index)}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

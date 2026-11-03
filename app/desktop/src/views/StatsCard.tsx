import { useEffect, useState } from "react";
import { cn } from "@/utils/cn";
import { Bar } from "@/components/Bar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ELEMENT_ICON, ELEMENT_NAME, elementVar } from "@/components/ElementTag";
import { Icon, type IconName } from "@/components/Icon";
import { num } from "@/utils/format";
import { mainStat, planText, POTENTIALS } from "@/game/potentials";
import { useStore } from "@/store";
import type { Account } from "@/api/types";

/** A "+" the server has not answered in this long is let go, and the buttons come back (as Nâng cấp of SkillsModal). */
const ANSWER_MS = 8000;

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
  /** "Cộng +1" on the potential of that c2s/10 index; a rejection lets the buttons come back. */
  onAdd: (stat: number) => Promise<void> | void;
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
  // The points left when the last "+" went out: the four wait until s2c/10 kind 8 changes them, the command fails or
  // ANSWER_MS goes by, so a double click spends one point, not two (Bot::add_stat sends each one it gets).
  const [sent, setSent] = useState<number | null>(null);
  const points = c?.statPoints ?? null;
  useEffect(() => {
    if (sent == null) return;
    if (points !== sent) {
      setSent(null);
      return;
    }
    const t = setTimeout(() => setSent(null), ANSWER_MS);
    return () => clearTimeout(t);
  }, [sent, points]);
  const waiting = sent != null && points === sent;
  const add = (stat: number) => {
    setSent(points);
    Promise.resolve(onAdd(stat)).catch((err: unknown) => {
      setSent(null);
      useStore.getState().toast({ tone: "warn", title: account.label, text: `Không cộng được điểm: ${err instanceof Error ? err.message : String(err)}` });
    });
  };
  // A point goes out between battles only, as Bot::add_stat requires, and one at a time.
  const canAdd = account.status >= 2 && account.status <= 3 && (points ?? 0) > 0 && !c?.battle && !waiting;
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
      // Lit green while Tự cộng spends the points.
      className={cn("ml-auto", auto && "border-good text-good")}
      aria-label={`Kỹ năng${skillPoints > 0 ? `: ${num(skillPoints)} điểm chưa cộng` : ""}${auto ? ", đang tự cộng" : ""}`}
      aria-haspopup="dialog"
      onClick={onSkills}
    >
      Kỹ năng
      {/* The skill points not spent yet, in a gold badge. */}
      {skillPoints > 0 && (
        <b className="px inline-grid place-items-center min-w-4 h-4 ml-0.5 px-1 py-0 bg-primary text-ink text-10 leading-none">{num(skillPoints)}</b>
      )}
    </Button>
  );
  return (
    <Card title="Chỉ số" icon="bolt" tone="var(--coin)" subtitle={c ? undefined : "Đăng nhập để xem chỉ số"} aside={skills}>
      <ul className="grid gap-1">
        {COMBAT.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5 py-[3px] pr-1.5 pl-[3px] bg-bg-2">
            <span className="grid place-items-center size-[22px] bg-ink" style={{ color: s.tone }}>
              <Icon name={s.icon} size={14} />
            </span>
            <span className="flex-none w-[66px] text-12 font-semibold text-fg-2">{s.label}</span>
            <span className="flex-1 min-w-5">
              <Bar value={(c?.combat?.[i] ?? 0) / top} fill={s.tone} thin />
            </span>
            <span className="px flex-none min-w-[26px] text-right text-13 text-fg">{num(c?.combat?.[i])}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="inline-flex items-center gap-1.5 font-display font-extrabold text-[10.5px] leading-[1.2] tracking-[0.06em] uppercase text-fg-2">
          <Icon name="gem" size={13} className="text-points" />
          Tiềm năng
        </span>
        {/* Tự cộng điểm, after the title: grey while off; it lights up in the colour of the points while the bot spends
            them on its own. */}
        <Button
          kind="ghost"
          small
          icon="settings"
          className={cn("w-[22px] h-[22px]", account.statPlan && "text-points bg-ink shadow-[inset_0_0_0_2px_var(--points)]")}
          aria-label={plan}
          aria-haspopup="dialog"
          onClick={onPlan}
        />
        <span className="ml-auto text-[11.5px] font-semibold text-fg-2 whitespace-nowrap">
          {c?.statPoints != null ? (
            <>
              <b className="px text-14 text-points">{num(c.statPoints)}</b> điểm
            </>
          ) : (
            "—"
          )}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 narrow:grid-cols-2">
        {POTENTIALS.map((p, i) => {
          // Without an element whose main stat is known, the four look alike. The main stat of the element (mainStat of
          // game/potentials.ts; --el from elementVar) is framed and tinted in the element's colour, the element's icon in the
          // corner. The tint sits behind the content (isolation), so the + keeps its own colour.
          const isMain = main != null && p.index === main;
          return (
            <div
              key={p.name}
              className={cn(
                "relative grid justify-items-center gap-0.5 pt-1.5 px-1 pb-1 bg-ink",
                isMain &&
                  "isolate shadow-[inset_0_0_0_2px_var(--el)] before:content-[''] before:absolute before:inset-0 before:z-[-1] before:bg-(--el) before:opacity-14",
                isMain && elementVar(element),
              )}
            >
              {p.index === main && element != null && (
                <span className="absolute top-1 left-[5px] flex text-(--el)" title={`Chỉ số chính của hệ ${elementName}`}>
                  <Icon name={ELEMENT_ICON[element]} size={10} />
                </span>
              )}
              <span className="px text-14 leading-[1.1] text-points">{num(c?.stats[i])}</span>
              <span className={cn("text-10 text-fg-3 whitespace-nowrap", isMain && "font-extrabold text-(--el)")}>{p.name}</span>
              {/* "Cộng +1" under the label: one click, one point (Bot::add_stat). */}
              <Button
                kind="tonal"
                small
                icon="plus"
                className={cn(
                  "h-5 w-full mt-[3px]",
                  // The main stat's in the element's colour; the others' dimmed until pointed at.
                  main != null && p.index === main && "bg-(--el) text-ink brightness-108 enabled:hover:brightness-122",
                  main != null && p.index !== main && "enabled:opacity-55 enabled:hover:opacity-100 enabled:focus-visible:opacity-100",
                )}
                aria-label={
                  p.index === main
                    ? `Cộng 1 điểm vào ${p.name}, chỉ số chính của hệ ${elementName}`
                    : `Cộng 1 điểm vào ${p.name}`
                }
                {...(main != null &&
                  p.index !== main && { title: `Cộng 1 điểm vào ${p.name} (không phải chỉ số chính của hệ ${elementName})` })}
                disabled={!canAdd}
                aria-busy={waiting || undefined}
                onClick={() => add(p.index)}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

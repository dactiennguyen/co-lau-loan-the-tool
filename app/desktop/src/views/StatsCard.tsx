import { useEffect, useId, useState } from "react";
import { cn } from "@/utils/cn";
import { Bar } from "@/components/Bar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DetailsToggle } from "@/components/DetailsToggle";
import { ELEMENT_ICON, ELEMENT_NAME, elementVar } from "@/components/ElementTag";
import { Icon, type IconName } from "@/components/Icon";
import { num } from "@/utils/format";
import { mainStat, planText, POTENTIALS } from "@/game/potentials";
import { useStore } from "@/store";
import { recalled, remember } from "@/utils/remember";
import type { Account } from "@/api/types";

/** Chi tiết of the card open or closed, the same for every account (localStorage). */
const OPEN_KEY = "stats.open";

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
      className={cn("flex-none", auto && "border-good text-good")}
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
  // Closed (the default): a line of the five combat figures and a line of the four potentials with their +, as tall as
  // the money tiles beside it. Chi tiết opens the bars and the large potential boxes under the header.
  const [open, setOpen] = useState(() => recalled(OPEN_KEY) === "1");
  const details = useId();
  const toggle = () => {
    remember(OPEN_KEY, open ? "0" : "1");
    setOpen(!open);
  };
  // Tự cộng điểm: grey while off; it lights up in the colour of the points while the bot spends them on its own.
  const planButton = (
    <Button
      kind="ghost"
      small
      icon="settings"
      className={cn("flex-none w-[22px] h-[22px]", account.statPlan && "text-points bg-ink shadow-[inset_0_0_0_2px_var(--points)]")}
      aria-label={plan}
      aria-haspopup="dialog"
      onClick={onPlan}
    />
  );
  const pointsLeft = (
    <span className="text-[11.5px] font-semibold text-fg-2 whitespace-nowrap">
      {c?.statPoints != null ? (
        <>
          <b className="px text-14 text-points">{num(c.statPoints)}</b> điểm
        </>
      ) : (
        "—"
      )}
    </span>
  );
  // "Cộng +1" of a potential: one click, one point (Bot::add_stat). The main stat's in the element's colour; the others'
  // dimmed until pointed at.
  const plus = (p: (typeof POTENTIALS)[number], className: string) => {
    const isMain = main != null && p.index === main;
    return (
      <Button
        kind="tonal"
        small
        icon="plus"
        className={cn(
          className,
          isMain && "bg-(--el) text-ink brightness-108 enabled:hover:brightness-122",
          main != null && !isMain && "enabled:opacity-55 enabled:hover:opacity-100 enabled:focus-visible:opacity-100",
        )}
        aria-label={isMain ? `Cộng 1 điểm vào ${p.name}, chỉ số chính của hệ ${elementName}` : `Cộng 1 điểm vào ${p.name}`}
        {...(main != null && !isMain && { title: `Cộng 1 điểm vào ${p.name} (không phải chỉ số chính của hệ ${elementName})` })}
        disabled={!canAdd}
        aria-busy={waiting || undefined}
        onClick={() => add(p.index)}
      />
    );
  };
  // The main stat of the element (mainStat of game/potentials.ts; --el from elementVar) is framed and tinted in the
  // element's colour, its icon in the corner. The tint sits behind the content (isolation), so the + keeps its colour.
  const mainFrame = (isMain: boolean) =>
    isMain &&
    cn(
      "isolate shadow-[inset_0_0_0_2px_var(--el)] before:content-[''] before:absolute before:inset-0 before:z-[-1] before:bg-(--el) before:opacity-14",
      elementVar(element),
    );
  return (
    <Card
      title="Chỉ số"
      icon="bolt"
      tone="var(--coin)"
      subtitle={c ? undefined : "Đăng nhập để xem chỉ số"}
      aside={
        <div className="flex items-center gap-2 ml-auto">
          {!open && (
            <span className="inline-flex items-center gap-1" title="Điểm tiềm năng chưa cộng">
              {pointsLeft}
              {planButton}
            </span>
          )}
          <DetailsToggle open={open} onToggle={toggle} controls={details} />
          {skills}
        </div>
      }
      className="p-2.5 gap-2"
      bodyClassName={open ? "grid grid-cols-[minmax(190px,1fr)_minmax(220px,1.1fr)] items-start gap-3" : "grid gap-1.5"}
    >
      <div id={details} className="contents">
        {open ? (
          <>
            <ul className="grid gap-[3px] m-0 p-0 list-none">
              {COMBAT.map((s, i) => (
                <li key={s.label} className="flex items-center gap-1.5 py-px pr-1.5 pl-px bg-bg-2">
                  <span className="grid place-items-center size-[18px] bg-ink" style={{ color: s.tone }}>
                    <Icon name={s.icon} size={12} />
                  </span>
                  <span className="flex-none w-[66px] text-12 font-semibold text-fg-2">{s.label}</span>
                  <span className="flex-1 min-w-5">
                    <Bar value={(c?.combat?.[i] ?? 0) / top} fill={s.tone} thin />
                  </span>
                  <span className="px flex-none min-w-[26px] text-right text-13 text-fg">{num(c?.combat?.[i])}</span>
                </li>
              ))}
            </ul>
            <div className="grid gap-1.5 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 font-display font-extrabold text-[10.5px] leading-[1.2] tracking-[0.06em] uppercase text-fg-2">
                  <Icon name="gem" size={13} className="text-points" />
                  Tiềm năng
                </span>
                {planButton}
                <span className="ml-auto">{pointsLeft}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {POTENTIALS.map((p, i) => {
                  const isMain = main != null && p.index === main;
                  return (
                    <div key={p.name} className={cn("relative grid justify-items-center gap-0.5 pt-1.5 px-1 pb-1 bg-ink", mainFrame(isMain))}>
                      {isMain && element != null && (
                        <span className="absolute top-1 left-[5px] flex text-(--el)" title={`Chỉ số chính của hệ ${elementName}`}>
                          <Icon name={ELEMENT_ICON[element]} size={10} />
                        </span>
                      )}
                      <span className="px text-14 leading-[1.1] text-points">{num(c?.stats[i])}</span>
                      <span className={cn("text-10 text-fg-3 whitespace-nowrap", isMain && "font-extrabold text-(--el)")}>{p.name}</span>
                      {plus(p, "h-5 w-full mt-[3px]")}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* The five combat figures: icon and number, the name on hover. */}
            <ul className="grid grid-cols-5 gap-1 m-0 p-0 list-none">
              {COMBAT.map((s, i) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between gap-1 h-[22px] pl-px pr-1.5 bg-bg-2 min-w-0"
                  title={s.label}
                  aria-label={`${s.label} ${num(c?.combat?.[i])}`}
                >
                  <span className="grid flex-none place-items-center size-[18px] bg-ink" style={{ color: s.tone }}>
                    <Icon name={s.icon} size={12} />
                  </span>
                  <span className="px text-13 text-fg truncate">{num(c?.combat?.[i])}</span>
                </li>
              ))}
            </ul>
            {/* The four potentials: name, number and their +. */}
            <div className="grid grid-cols-4 gap-1">
              {POTENTIALS.map((p, i) => {
                const isMain = main != null && p.index === main;
                return (
                  <div
                    key={p.name}
                    className={cn("relative flex items-center gap-1 h-[24px] pl-1.5 pr-0.5 bg-ink min-w-0", mainFrame(isMain))}
                    title={isMain ? `${p.name}: chỉ số chính của hệ ${elementName}` : p.name}
                  >
                    <span className={cn("flex-1 min-w-0 truncate text-10 text-fg-3", isMain && "font-extrabold text-(--el)")}>{p.name}</span>
                    <span className="px flex-none text-13 text-points">{num(c?.stats[i])}</span>
                    {plus(p, "flex-none w-5 h-5")}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

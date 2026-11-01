import { Fragment, type ReactNode } from "react";
import { cn } from "../cn";
import { Bar } from "../components/Bar";
import { Icon, type IconName } from "../components/Icon";
import { num } from "../format";
import type { Turn } from "../types";

/** The board's pieces by kind (docs/app/events/05-battle.md); `tone` sets the chip's colour (--piece). */
const PIECES: Record<number, { name: string; icon: IconName; tone: string }> = {
  0: { name: "kiếm", icon: "sword", tone: "[--piece:var(--piece-sword)]" },
  1: { name: "tim", icon: "heart", tone: "[--piece:var(--piece-heart)]" },
  2: { name: "âm dương", icon: "yinyang", tone: "[--piece:var(--piece-yinyang)]" },
  3: { name: "đào", icon: "peach", tone: "[--piece:var(--piece-peach)]" },
  4: { name: "giọt nước", icon: "drop", tone: "[--piece:var(--piece-drop)]" },
  5: { name: "sao", icon: "star", tone: "[--piece:var(--piece-star)]" },
  70: { name: "vàng", icon: "coin", tone: "[--piece:var(--piece-gold)]" },
};

/** "thêm lượt", "hết trận": a small outlined tag after the move. */
const TAG = "inline-block ml-1.5 px-1 py-0 border border-line text-[9.5px] font-bold leading-[1.5] text-fg-3 uppercase tracking-[0.04em]";

const signed = (n: number) => (n > 0 ? `+${num(n)}` : `−${num(-n)}`);

/** HP of one side after the result: name, bar, HP/max; "?" until the mob's HP is known. */
function Hp({ who, hp, fill }: { who: string; hp: [number, number] | null; fill: string }) {
  return (
    <span
      className="grid grid-cols-[52px_minmax(0,1fr)_50px] items-center gap-[5px] text-10 leading-[1.2]"
      title={hp ? `${who}: ${num(hp[0])}/${num(hp[1])} máu` : `${who}: chưa biết máu`}
    >
      <span className="truncate text-fg-3">{who}</span>
      <Bar value={hp ? hp[0] / Math.max(1, hp[1]) : 0} fill={fill} thin label={`Máu ${who}`} />
      <b className="text-[9.5px] font-normal text-right text-fg-2 px">{hp ? `${num(hp[0])}/${num(hp[1])}` : "?"}</b>
    </span>
  );
}

/**
 * The latest result of a battle, under the log line the battle opened on: who moved, the pieces eaten, what that did,
 * and both sides' HP after it on the right. `live` while the battle is on.
 */
export function TurnStatus({ turn: t, live }: { turn: Turn; live: boolean }) {
  const effects: ReactNode[] = [];
  if (t.damage > 0) {
    effects.push(
      <span className="text-hp font-semibold">
        {t.mine ? t.foe : "bạn"} −{num(t.damage)} máu
      </span>,
    );
  }
  if (t.heal > 0) effects.push(<span className="text-good font-semibold">{t.mine ? "bạn" : t.foe} +{num(t.heal)} máu</span>);
  if (t.s1) effects.push(`nội lực ${signed(t.s1)}`);
  if (t.s2) effects.push(`sức mạnh ${signed(t.s2)}`);
  // A skill's pieces are the ones it broke; they count for the caster as if eaten.
  const verb = t.skill != null ? `dùng kỹ năng ${t.skill}${t.eaten.length ? ", phá" : ""}` : t.eaten.length ? "ăn" : "đánh";
  return (
    // A stripe of the side that moved (--side: own green, the mob's red, as its HP bar), the move's number, the move in
    // words with the pieces as coloured chips, then both sides' HP on the right.
    <div
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1.5 mt-px mb-0.5 px-1.5 py-px shadow-[inset_2px_0_0_var(--side)] bg-bg-2 text-11 leading-[1.6] text-fg-2",
        t.mine ? "[--side:var(--good)]" : "[--side:var(--hp)]",
      )}
    >
      <span
        className={cn(
          "min-w-[22px] text-[9.5px] text-fg-3 px",
          // While the battle is on, a blinking light of the side before the number.
          live &&
            "before:content-[''] before:inline-block before:size-[5px] before:mr-1 before:align-[1px] before:bg-(--side) before:animate-blink",
        )}
        title={`Nước thứ ${t.n} của trận, tính cả hai bên${live ? "; trận đang đánh" : ""}`}
      >
        #{t.n}
      </span>
      {/* A new result mounts a new body, which flashes; the bars stay and slide to the new HP. */}
      <span className={cn("min-w-0", live && "animate-turn-in")} key={t.n}>
        <b className="font-bold text-fg">{t.mine ? "Bạn" : t.foe}</b> {verb}
        {t.eaten.map(([kind, n]) => {
          const p = PIECES[kind];
          return (
            <span
              key={kind}
              className={cn(
                "inline-flex items-center gap-[3px] ml-1 px-1 py-0 bg-ink text-(--piece) font-semibold whitespace-nowrap",
                p?.tone ?? "[--piece:var(--fg-2)]",
              )}
            >
              {p && <Icon name={p.icon} size={11} className="self-center" />}
              <b className="text-10 font-normal px">{n}</b> {p?.name ?? `viên ${kind}`}
            </span>
          );
        })}
        {effects.length > 0 && (
          <>
            <span className="text-fg-3" aria-hidden="true">
              {" → "}
            </span>
            {effects.map((e, i) => (
              <Fragment key={i}>
                {i > 0 && ", "}
                <span className="whitespace-nowrap">{e}</span>
              </Fragment>
            ))}
          </>
        )}
        {t.extraTurn && !t.end && <span className={TAG}>thêm lượt</span>}
        {t.end && <span className={cn(TAG, "border-primary-shade text-primary")}>hết trận</span>}
      </span>
      <span className="grid gap-[3px] w-[178px] py-0.5 pr-0 pl-2 border-l border-l-line">
        <Hp who="Bạn" hp={t.hp} fill="var(--good)" />
        <Hp who={t.foe} hp={t.mobHp} fill="var(--hp)" />
      </span>
    </div>
  );
}

import { Fragment, type ReactNode } from "react";
import { Bar } from "../components/Bar";
import { Icon, type IconName } from "../components/Icon";
import { num } from "../format";
import type { Turn } from "../types";
import "./TurnStatus.css";

/** The board's pieces by kind (docs/app/events/05-battle.md); the class sets the colour. */
const PIECES: Record<number, { name: string; icon: IconName; cls: string }> = {
  0: { name: "kiếm", icon: "sword", cls: "sword" },
  1: { name: "tim", icon: "heart", cls: "heart" },
  2: { name: "âm dương", icon: "yinyang", cls: "yinyang" },
  3: { name: "đào", icon: "peach", cls: "peach" },
  4: { name: "giọt nước", icon: "drop", cls: "drop" },
  5: { name: "sao", icon: "star", cls: "star" },
  70: { name: "vàng", icon: "coin", cls: "gold" },
};

const signed = (n: number) => (n > 0 ? `+${num(n)}` : `−${num(-n)}`);

/** HP of one side after the result: name, bar, HP/max; "?" until the mob's HP is known. */
function Hp({ who, hp, fill }: { who: string; hp: [number, number] | null; fill: string }) {
  return (
    <span className="turn__side" title={hp ? `${who}: ${num(hp[0])}/${num(hp[1])} máu` : `${who}: chưa biết máu`}>
      <span className="turn__who">{who}</span>
      <Bar value={hp ? hp[0] / Math.max(1, hp[1]) : 0} fill={fill} thin label={`Máu ${who}`} />
      <b className="px">{hp ? `${num(hp[0])}/${num(hp[1])}` : "?"}</b>
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
      <span className="turn__hit">
        {t.mine ? t.foe : "bạn"} −{num(t.damage)} máu
      </span>,
    );
  }
  if (t.heal > 0) effects.push(<span className="turn__heal">{t.mine ? "bạn" : t.foe} +{num(t.heal)} máu</span>);
  if (t.s1) effects.push(`nội lực ${signed(t.s1)}`);
  if (t.s2) effects.push(`sức mạnh ${signed(t.s2)}`);
  // A skill's pieces are the ones it broke; they count for the caster as if eaten.
  const verb = t.skill != null ? `dùng kỹ năng ${t.skill}${t.eaten.length ? ", phá" : ""}` : t.eaten.length ? "ăn" : "đánh";
  return (
    <div className={`turn turn--${t.mine ? "mine" : "foe"}${live ? " turn--live" : ""}`}>
      <span className="turn__n px" title={`Nước thứ ${t.n} của trận, tính cả hai bên${live ? "; trận đang đánh" : ""}`}>
        #{t.n}
      </span>
      {/* A new result mounts a new body, which flashes; the bars stay and slide to the new HP. */}
      <span className="turn__body" key={t.n}>
        <b className="turn__actor">{t.mine ? "Bạn" : t.foe}</b> {verb}
        {t.eaten.map(([kind, n]) => {
          const p = PIECES[kind];
          return (
            <span key={kind} className={`piece piece--${p?.cls ?? "other"}`}>
              {p && <Icon name={p.icon} size={11} />}
              <b className="px">{n}</b> {p?.name ?? `viên ${kind}`}
            </span>
          );
        })}
        {effects.length > 0 && (
          <>
            <span className="turn__arrow" aria-hidden="true">
              {" → "}
            </span>
            {effects.map((e, i) => (
              <Fragment key={i}>
                {i > 0 && ", "}
                <span className="turn__fx">{e}</span>
              </Fragment>
            ))}
          </>
        )}
        {t.extraTurn && !t.end && <span className="turn__tag">thêm lượt</span>}
        {t.end && <span className="turn__tag turn__tag--end">hết trận</span>}
      </span>
      <span className="turn__hp">
        <Hp who="Bạn" hp={t.hp} fill="var(--good)" />
        <Hp who={t.foe} hp={t.mobHp} fill="var(--hp)" />
      </span>
    </div>
  );
}

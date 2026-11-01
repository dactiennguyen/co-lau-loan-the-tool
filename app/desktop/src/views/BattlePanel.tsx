import { Bar } from "@/components/Bar";
import { num } from "@/utils/format";
import type { Battle } from "@/api/types";

/** A side: the name (cut short) and HP/max over the bar. */
const SIDE = "grid grid-cols-[1fr_auto] gap-y-1 gap-x-2 text-11 min-w-0";

/** The battle on: own HP against the mob's ("?" until a hit shows it), and own moves so far. In the fight job and in a
 * quest run's fights alike. */
export function BattlePanel({ battle, id }: { battle: Battle; id?: string }) {
  const mobKnown = battle.mobHp != null && !!battle.mobMaxHp;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] [align-items:end] gap-2.5" id={id}>
      <div className={SIDE}>
        <span className="text-fg-2 truncate">Bạn</span>
        <b className="text-11 font-normal px">
          {num(Math.round(battle.hp))}/{num(Math.round(battle.maxHp))}
        </b>
        <Bar value={battle.hp / Math.max(1, battle.maxHp)} fill="var(--hp)" thin label="Máu của bạn" className="col-span-full" />
      </div>
      <span className="grid justify-items-center text-13 text-accent px">
        VS
        {/* In the UI face, with its own figures: not the tabular ones of the pixel VS (normal-nums). */}
        <small className="font-ui font-semibold text-10 leading-[1.4] normal-nums text-fg-3">lượt {battle.turns}</small>
      </span>
      <div className={SIDE}>
        <span className="text-fg-2 truncate" title={battle.mobName}>{battle.mobName}</span>
        <b className="text-11 font-normal px">{mobKnown ? `${num(Math.round(battle.mobHp!))}/${num(Math.round(battle.mobMaxHp!))}` : "?"}</b>
        <Bar value={mobKnown ? battle.mobHp! / battle.mobMaxHp! : 0} fill="var(--accent)" thin label={`Máu của ${battle.mobName}`} className="col-span-full" />
      </div>
    </div>
  );
}

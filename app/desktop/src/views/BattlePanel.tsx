import { Bar } from "../components/Bar";
import { num } from "../format";
import type { Battle } from "../types";
import "./BattlePanel.css";

/** The battle on: own HP against the mob's ("?" until a hit shows it), and own moves so far. In the fight job and in a
 * quest run's fights alike. */
export function BattlePanel({ battle, id }: { battle: Battle; id?: string }) {
  const mobKnown = battle.mobHp != null && !!battle.mobMaxHp;
  return (
    <div className="battle" id={id}>
      <div className="battle__side">
        <span>Bạn</span>
        <b className="px">
          {num(Math.round(battle.hp))}/{num(Math.round(battle.maxHp))}
        </b>
        <Bar value={battle.hp / Math.max(1, battle.maxHp)} fill="var(--hp)" thin label="Máu của bạn" className="col-span-full" />
      </div>
      <span className="battle__vs px">
        VS
        <small>lượt {battle.turns}</small>
      </span>
      <div className="battle__side">
        <span title={battle.mobName}>{battle.mobName}</span>
        <b className="px">{mobKnown ? `${num(Math.round(battle.mobHp!))}/${num(Math.round(battle.mobMaxHp!))}` : "?"}</b>
        <Bar value={mobKnown ? battle.mobHp! / battle.mobMaxHp! : 0} fill="var(--accent)" thin label={`Máu của ${battle.mobName}`} className="col-span-full" />
      </div>
    </div>
  );
}

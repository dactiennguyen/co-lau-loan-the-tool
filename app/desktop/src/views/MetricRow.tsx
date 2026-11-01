import { Bar } from "../components/Bar";
import { STAT, Stat, StatTile, StatTop } from "../components/StatTile";
import { levelProgress, num, pct } from "../format";
import type { Character } from "../types";

/** Vàng turns into 10.000 Xu khoá when the bar is full (Cẩm nang). */
const GOLD_BAR = 10000;

/** What each currency of s2c/46 is for (Cẩm nang). */
const MONEY = [
  { key: "xu", label: "Xu", use: "Chợ trời, góp quân lương" },
  { key: "xuKhoa", label: "Xu khoá", use: "cửa hàng NPC, cường hoá; Vàng đủ 10.000 thì thành Xu khoá" },
  { key: "luong", label: "Lượng", use: "tiền nạp" },
] as const;

/** One amount of money, over its name (dt, order 2): the pixel face of .px, without its tabular figures (the font
 * shorthand of the amounts reset them). */
const AMOUNT = "px order-1 m-0 font-pixel font-normal text-16 leading-[1.15] normal-nums text-coin whitespace-nowrap";
const NAME = "order-2 text-11 text-fg-2 whitespace-nowrap";
const CURRENCY = "flex flex-col gap-1 min-w-0";

/** Two tiles: HP and EXP of the level; the money, Vàng (coin of s2c/9) with Xu, Xu khoá and Lượng (s2c/46). Dashes until
 * the character is in the game. The points left to spend are in StatsCard. */
export function MetricRow({ character: c }: { character: Character | null }) {
  const level = c && levelProgress(c);
  const gold = c?.coin;
  return (
    <div className="grid grid-cols-2 gap-3">
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
          {/* The money: Vàng with its bar to 10.000, then Xu, Xu khoá, Lượng; each value over its name, as the other figures
              sit over their caption. Big amounts wrap to a second line rather than cut. */}
          <dl className="flex flex-wrap justify-between gap-y-1.5 gap-x-3 mt-0.5 mb-0 min-w-0">
            <div className={CURRENCY} title={`Vàng: đủ ${num(GOLD_BAR)} thì thành ${num(GOLD_BAR)} Xu khoá`}>
              <dt className={NAME}>Vàng</dt>
              <dd className={AMOUNT}>
                {gold != null ? (
                  <>
                    {num(gold)} <small className="font-ui font-semibold text-12 leading-none text-fg-3">/ {num(GOLD_BAR)}</small>
                  </>
                ) : (
                  "—"
                )}
              </dd>
              <dd className="order-3 m-0 font-pixel font-normal text-16 leading-[1.15] text-coin whitespace-nowrap">
                <Bar value={gold != null ? gold / GOLD_BAR : 0} fill="var(--coin)" label="Vàng tới 10.000" />
              </dd>
            </div>
            {MONEY.map((m) => (
              <div key={m.key} className={CURRENCY} title={`${m.label}: ${m.use}`}>
                <dt className={NAME}>{m.label}</dt>
                <dd className={AMOUNT}>{c?.currencies ? num(c.currencies[m.key]) : "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
      </StatTile>
    </div>
  );
}

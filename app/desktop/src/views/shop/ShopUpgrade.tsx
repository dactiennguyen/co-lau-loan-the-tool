import { useEffect, useId, useState } from "react";
import { api } from "@/api";
import { cn } from "@/utils/cn";
import { Button } from "@/components/Button";
import { FilterChip } from "@/components/FilterChip";
import { Hint } from "@/components/Hint";
import { Icon } from "@/components/Icon";
import { Stepper } from "@/components/Stepper";
import { num } from "@/utils/format";
import { itemIcon } from "@/game/itemIcons";
import { CHARMS, charmUseful, failLevel, isGear, itemCap, SAFE_LEVEL, stoneCounts, stoneLevel, TRANSMUTE_ITEMS } from "@/game/shops";
import type { Item } from "@/api/types";
import { SHOP, type ShopContext } from "./ShopModal";
import { ItemChip, Stone, STONES } from "./Stone";
import { UpgradeWindow } from "./UpgradeWindow";

/** A part of the item picked: Tách đá, Chuyển hoá. */
const PART = "grid [align-content:start] justify-items-start gap-1.5 px-2.5 py-2 bg-bg-2 border-2 border-line";

/**
 * Nâng cấp (16-upgrade.md#nâng-cấp): a piece of gear of the bag, Thường or Cẩn thận (+5 Lượng, odds ×1,5), the odds to
 * aim for and the level to reach. Hỏi giá asks Pháp sư the price and odds of the next level and presses nothing. Nâng
 * cấp puts the cheapest stones one by one until the odds are reached, as the server takes every stone put in, and goes
 * on level by level up to the level chosen, the cap of the item at most. Below +4 a failure keeps the level; from +5 it
 * drops to +4, +8, +12 or +14 unless a Bùa bảo vệ is in (O1), which Dùng Bùa bảo vệ puts on those presses. Tách đá and
 * Chuyển hoá work on the same item. Gear worn is listed too: the game's window takes items of the bag only, so the bot takes it
 * off, upgrades it and wears it again (SmithTask::Upgrade `worn`). Every press asks once more.
 */
export function ShopUpgrade({ account, why, ask, track }: ShopContext) {
  const c = account.character!;
  // The gear worn and the gear of the bag; an item is followed by its uuid, as a worn one goes to the bag and back.
  const isWorn = (i: Item) => c.gear.some((g) => g?.uuid === i.uuid);
  const gear = [...c.gear.filter((g): g is Item => g != null && isGear(g)), ...(c.bag?.items ?? []).filter(isGear)].sort(
    (a, b) => b.plus - a.plus || (b.level ?? 0) - (a.level ?? 0),
  );
  const [picked, setPicked] = useState<string | null>(null);
  const item = gear.find((i) => i.uuid === picked) ?? null;
  // While the bot upgrades a worn item, the item is in the bag: the task says it is the worn one all the same.
  const run = c.smith;
  const upgrading = run != null && run.done == null && run.worn && run.item?.uuid === item?.uuid;
  const worn = item != null && (isWorn(item) || upgrading);
  const full = c.bag != null && c.bag.items.length >= c.bag.capacity;
  const wornWhy = worn && full ? "Túi đầy: cần 1 ô trống để cởi món ra nâng cấp." : null;
  // Tự chọn đá (the game's window, one level with the stones picked) or the bot up to a level (stones it picks).
  const [mode, setMode] = useState<"pick" | "bot">("pick");
  const [careful, setCareful] = useState(false);
  const [rate, setRate] = useState(100);
  const [unlocked, setUnlocked] = useState(false);
  const [charm, setCharm] = useState(true);
  const cap = item ? itemCap(item) : 0;
  const top = cap;
  const [toLevel, setToLevel] = useState(1);
  useEffect(() => {
    if (item) setToLevel(Math.min(top, item.plus + 1));
  }, [item?.uuid, item?.plus, top]); // eslint-disable-line react-hooks/exhaustive-deps

  const stones = (c.bag?.items ?? []).filter((i) => stoneLevel(i.id) && (unlocked || i.locked));
  const stoneCount = stones.reduce((n, i) => n + Math.max(1, i.quantity), 0);
  // The stones by level, as the bot will put them: the cheapest first.
  const stoneRow = stoneCounts(c.bag?.items ?? [])
    .map(([locked, free], level): [number, number] => [level, locked + (unlocked ? free : 0)])
    .filter(([level, n]) => level > 0 && n > 0);
  const mine = run && item && run.item?.uuid === item.uuid ? run : null;
  // Bùa bảo vệ: the levels of the run a failure would drop, the charm each needs, and those of the bag.
  const risky = item ? Array.from({ length: Math.max(0, toLevel - item.plus) }, (_, k) => item.plus + k).filter(charmUseful) : [];
  const charms = CHARMS.map((ch) => ({
    ...ch,
    count: (c.bag?.items ?? []).filter((i) => i.id === ch.id).reduce((n, i) => n + i.quantity, 0),
  }));
  const lacking = risky.filter((level) => !charms.some((ch) => ch.upTo > level && ch.count > 0));

  // Chuyển hoá: the targets the bot accepts, and the item that moves this level.
  const [targets, setTargets] = useState<number[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    if (item && item.plus > 0 && !worn) api.transmuteTargets(account.id, item.slot).then((t) => live && setTargets(t));
    else setTargets([]);
    setTarget(null);
    return () => {
      live = false;
    };
  }, [account.id, item?.uuid, item?.slot, item?.plus, worn]); // eslint-disable-line react-hooks/exhaustive-deps
  const stuff = item ? TRANSMUTE_ITEMS.find((t) => t.upTo >= item.plus && c.bag?.items.some((i) => i.id === t.id)) : undefined;
  const stuffItem = stuff ? c.bag?.items.find((i) => i.id === stuff.id) : undefined;
  const byslot = (s: number) => c.bag?.items.find((i) => i.slot === s);
  const hint = useId();

  return (
    // The gear, the options, Pháp sư's price, and Tách đá, Chuyển hoá.
    <div className={SHOP.tab}>
      <div className={SHOP.lead}>
        <b className={SHOP.leadTitle}>Chọn món cần nâng</b>
        <Hint label="Nâng cấp là gì?" id={`${hint}-what`}>
          Pháp sư nâng món lên từng cấp (+1, +2…) bằng đá và Xu khóa. Tỉ lệ thành công theo tổng sức của đá đặt vào. Thành công
          thì chỉ số tăng (khoảng 20% chỉ số chính) và món bị khoá giao dịch; thất bại thì mất đá và phí, dưới +4 không tụt cấp.
          Cửa sổ của game chỉ nhận món trong túi, nên với đồ đang mặc bot tự cởi ra túi (cần 1 ô trống), nâng, rồi mặc lại.
        </Hint>
      </div>
      {gear.length === 0 ? (
        <p className={SHOP.note}>Không có Nón, Áo, Vũ khí, Nhẫn hay Cánh nào, trong túi hay đang mặc.</p>
      ) : (
        <div className={SHOP.list} role="radiogroup" aria-label="Món nâng cấp">
          {gear.map((i) => (
            <GearRow key={i.uuid} item={i} worn={isWorn(i)} on={i.uuid === picked} onPick={() => setPicked(i.uuid)} />
          ))}
        </div>
      )}
      {item && (
        <>
          <div className={SHOP.chips} role="group" aria-label="Cách nâng">
            <FilterChip on={mode === "pick"} onClick={() => setMode("pick")}>
              Tự chọn đá (như game)
            </FilterChip>
            <FilterChip on={mode === "bot"} onClick={() => setMode("bot")}>
              Bot tự nâng nhiều cấp
            </FilterChip>
            <Hint label="Tự chọn đá khác Bot tự nâng thế nào?" id={`${hint}-way`}>
              Tự chọn đá giống cửa sổ trong game: bạn đặt từng viên đá vào 18 ô, xem phí và tỉ lệ Pháp sư báo, rồi bấm Bắt đầu để
              nâng 1 cấp. Bot tự nâng thì bot tự chọn đá rẻ nhất tới tỉ lệ muốn đạt, và nâng liền nhiều cấp tới cấp bạn chọn.
            </Hint>
          </div>
          <div className={SHOP.opts}>
            <div className={SHOP.chips} role="group" aria-label="Kiểu nâng cấp">
              <FilterChip on={!careful} onClick={() => setCareful(false)}>
                Thường
              </FilterChip>
              <FilterChip on={careful} tone="var(--coin)" onClick={() => setCareful(true)}>
                Cẩn thận (+5 Lượng)
              </FilterChip>
              <Hint label="Thường hay Cẩn thận?" id={`${hint}-mode`}>
                Cẩn thận tốn thêm 5 Lượng mỗi lần bấm, đổi lại tỉ lệ ×1,5 (tối đa 100%). Thường bị chặn ở trần: 80% khi +0→+1, 75%
                khi +1→+2. Phí Xu khóa như nhau. Muốn chắc 100% thì chọn Cẩn thận.
              </Hint>
            </div>
            {mode === "bot" && (
              <>
                <label className={SHOP.opt}>
                  Tỉ lệ muốn đạt
                  <Stepper value={rate} onChange={setRate} min={1} max={100} label="tỉ lệ %" />%
                </label>
                <Hint label="Tỉ lệ muốn đạt là gì?" id={`${hint}-rate`}>
                  Bot đặt từng viên đá, rẻ nhất trước, tới khi tỉ lệ Pháp sư báo đạt mức này thì bấm Bắt đầu. Đá đặt vào đều mất kể cả
                  viên thừa, nên bot không đặt dư. Tỉ lệ chạm trần của Thường (80% ở +0→+1, 75% ở +1→+2) thì bot bấm ở trần. Đặt hết đá
                  mà tỉ lệ vẫn thấp hơn mức này thì bot dừng, không bấm, không tốn gì.
                </Hint>
                <label className={SHOP.opt}>
                  Nâng tới +
                  <Stepper value={toLevel} onChange={setToLevel} min={Math.min(top, item.plus + 1)} max={top} label="cấp muốn đạt" />
                </label>
                <Hint label="Nâng tới + là gì?" id={`${hint}-to`}>
                  Bot nâng từng cấp một tới cấp này. Dưới +{SAFE_LEVEL}, hay có bùa, thất bại giữ cấp nên bot thử lại đúng cấp đó với đá mới,
                  cho tới khi đạt, hết đá, hết bùa hay hết tiền; bấm Dừng để thôi giữa chừng. Trần theo bậc món: bậc 1 tới +4, bậc 21 tới
                  +8, bậc 51 tới +12, bậc 101 và Cánh tới +16.
                </Hint>
              </>
            )}
            <label className={SHOP.check}>
              <input className={SHOP.checkInput} type="checkbox" checked={charm} onChange={(e) => setCharm(e.target.checked)} />
              <span className={SHOP.checkBox} aria-hidden="true">
                <Icon name="check" size={11} />
              </span>
              Dùng Bùa bảo vệ
            </label>
            <Hint label="Bùa bảo vệ là gì?" id={`${hint}-charm`}>
              Từ +5, thất bại làm món tụt về +4 (từ +9 về +8, +13 về +12, +15 về +14). Có bùa thì giữ cấp, nhưng bùa mất cả khi
              thành công lẫn thất bại. Chọn mục này thì mỗi lần bấm ở các cấp đó bot đặt 1 bùa thấp nhất còn bảo vệ được (sơ cấp
              tới +8, trung cấp tới +12, cao cấp tới +14, siêu cấp tới +16); hết bùa thì dừng trước khi bấm. Bỏ chọn thì nâng không
              bùa, và thất bại đầu tiên làm tụt cấp thì bot dừng.
            </Hint>
            {mode === "bot" && (
              <>
                <label className={SHOP.check}>
                  <input className={SHOP.checkInput} type="checkbox" checked={unlocked} onChange={(e) => setUnlocked(e.target.checked)} />
                  <span className={SHOP.checkBox} aria-hidden="true">
                    <Icon name="check" size={11} />
                  </span>
                  Dùng cả đá chưa khoá
                </label>
                <Hint label="Dùng cả đá chưa khoá là gì?" id={`${hint}-unlocked`}>
                  Mặc định bot chỉ đặt đá đã khoá (đá rơi từ quái, đá Tách đá trả về). Chọn thì dùng cả đá chưa khoá (mua bằng Lượng, bán
                  được), nhưng đá đã khoá vẫn được đặt trước.
                </Hint>
              </>
            )}
          </div>
          {mode === "pick" && (
            <UpgradeWindow
              account={account}
              why={why}
              ask={ask}
              track={track}
              item={item}
              worn={worn}
              wornWhy={wornWhy}
              careful={careful}
              charm={charm}
              cap={cap}
            />
          )}
          {mode === "bot" && (
            <>
              <div className={STONES} role="group" aria-label="Đá dùng được, rẻ nhất trước">
                {stoneRow.length === 0 ? (
                  <span className={SHOP.note}>Không có đá {unlocked ? "" : "đã khoá "}nào trong túi.</span>
                ) : (
                  stoneRow.map(([level, n]) => <Stone key={level} level={level} count={n} short chip />)
                )}
              </div>
              <p className={SHOP.note}>
                {item.name} +{item.plus} · cấp mặc {item.level} · trần +{cap} · {stoneCount} viên đá dùng được. Bot đặt đá rẻ nhất trước, dừng
                khi đủ tỉ lệ hoặc tỉ lệ không tăng nữa (server lấy hết đá đã đặt); hết đá mà chưa đủ tỉ lệ thì không bấm.
              </p>
              {risky.length > 0 && (
                <p className={cn(SHOP.note, charm && lacking.length > 0 && "text-danger")}>
                  {charm
                    ? `Bùa: mỗi lần bấm ở +${risky.join(", +")} dùng 1 bùa. Túi có: ${
                        charms.filter((ch) => ch.count > 0).map((ch) => `${ch.count} Bùa bảo vệ ${ch.name}`).join(", ") || "không có bùa"
                      }.${lacking.length ? ` Thiếu bùa cho +${lacking.join(", +")}: bot sẽ dừng trước cấp đó.` : ""}`
                    : `Không dùng bùa: thất bại ở +${risky[0]} sẽ tụt về +${failLevel(risky[0])} và bot dừng.`}
                </p>
              )}
              {mine?.quote && (
                <div className="grid gap-0.5 px-2.5 py-2 text-12 text-fg bg-bg-2 border-l-3 border-l-primary">
                  <span>
                    Pháp sư báo: {mine.quote.fee ? `${num(mine.quote.fee.amount)} ${mine.quote.fee.money === "xu" ? "Xu" : "Xu khóa"}` : "miễn phí"}
                    {mine.quote.luong > 0 && ` + ${mine.quote.luong} Lượng`}
                    {mine.quote.rate != null && ` · tỉ lệ ${mine.quote.rate}%`}
                  </span>
                  {mine.preview && (
                    <span className="text-11 text-s-online">
                      +{mine.preview.plus}: <Stats stats={mine.preview.stats} />
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                <Button
                  kind="outline"
                  icon="eye"
                  disabled={!!why || !!wornWhy || item.plus >= cap || stones.length === 0}
                  onClick={() => {
                    track();
                    api.smithUpgrade(account.id, item.slot, careful, rate, item.plus + 1, unlocked, true, worn, charm);
                  }}
                >
                  {worn ? "Hỏi giá (miễn phí; cởi ra rồi mặc lại)" : "Hỏi giá (miễn phí)"}
                </Button>
                <Button
                  kind="primary"
                  icon="hammer"
                  disabled={!!why || !!wornWhy || item.plus >= top || stones.length === 0}
                  onClick={() =>
                    ask({
                      title: `Nâng cấp ${item.name}`,
                      message: `Nâng ${item.name} từ +${item.plus} tới +${toLevel}${careful ? " (Cẩn thận, mỗi lần +5 Lượng)" : ""}, mỗi lần đặt đá tới tỉ lệ ${rate}% hoặc tới trần. Mỗi lần nâng tốn đá và Xu khóa, thất bại thì mất cả hai; thành công thì món bị khoá giao dịch.${risky.length ? (charm ? ` Ở +${risky.join(", +")} mỗi lần bấm dùng 1 Bùa bảo vệ (mất cả khi thành công), thất bại thì giữ cấp và bot thử lại.` : ` Không dùng bùa: thất bại ở +${risky[0]} sẽ tụt về +${failLevel(risky[0])} và bot dừng.`) : " Dưới +4 thất bại không tụt cấp."}${worn ? " Món đang mặc: bot cởi ra túi trước, xong (hay dừng giữa chừng) thì mặc lại." : ""}`,
                      confirm: "Nâng cấp",
                      icon: "hammer",
                      run: () => api.smithUpgrade(account.id, item.slot, careful, rate, toLevel, unlocked, false, worn, charm),
                    })
                  }
                >
                  Nâng cấp
                </Button>
                <Hint label="Hỏi giá khác Nâng cấp thế nào?" id={`${hint}-quote`}>
                  Hỏi giá mở cửa sổ Nâng cấp, đặt đá để xem phí và tỉ lệ Pháp sư báo cho cấp sau, rồi đóng lại: không bấm Bắt đầu nên
                  không tốn gì. Nâng cấp làm thật, tốn đá và Xu khóa (Cẩn thận thêm Lượng); app hỏi lại một lần trước khi bắt đầu. Với
                  đồ đang mặc, cả hai đều cởi món ra túi trước (cần 1 ô trống) rồi mặc lại sau, vì cửa sổ chỉ nhận món trong túi.
                </Hint>
              </div>
            </>
          )}
          {worn && (
            <p className={SHOP.note}>
              Đang mặc: bot cởi {item.name} ra túi, nâng, rồi mặc lại vào ô cũ; xong, lỗi hay bấm Dừng đều mặc lại.
              {item.plus > 0 && " Tách đá và Chuyển hoá thì cởi món ra túi trước."}
            </p>
          )}
          {wornWhy && <p className={SHOP.why}>{wornWhy}</p>}
          {item.plus > 0 && !worn && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5">
              <div className={PART}>
                <div className={SHOP.lead}>
                  <b className={SHOP.leadTitle}>Tách đá</b>
                  <Hint label="Tách đá là gì?" id={`${hint}-separate`}>
                    Món về +0, chỉ số về như lúc +0, và nhận lại vài viên đá cấp thấp (đã khoá). Số đá trả theo cấp của món, không theo
                    đá đã dùng: Giáp +1 nâng bằng một Đá cấp 5 chỉ trả 2 Đá cấp 1. Không tốn tiền, nhưng túi phải đủ ô trống cho đá trả về.
                  </Hint>
                </div>
                <span className={SHOP.note}>Món về +0, nhận lại vài viên đá cấp thấp (J3: +1 trả 2 Đá cấp 1). Miễn phí, cần đủ ô trống.</span>
                <Button
                  kind="outline"
                  small
                  icon="refresh"
                  disabled={!!why}
                  onClick={() =>
                    ask({
                      title: `Tách đá ${item.name}`,
                      message: `${item.name} +${item.plus} sẽ về +0 và trả lại đá; không lấy lại được cấp cũ.`,
                      confirm: "Tách đá",
                      icon: "refresh",
                      run: () => api.smithSeparate(account.id, item.slot),
                    })
                  }
                >
                  Tách đá
                </Button>
              </div>
              <div className={PART}>
                <div className={SHOP.lead}>
                  <b className={SHOP.leadTitle}>Chuyển hoá</b>
                  <Hint label="Chuyển hoá là gì?" id={`${hint}-transmute`}>
                    Chuyển cấp + của món này sang một món +0 cùng loại, bậc bằng hoặc cao hơn, ví dụ khi đổi sang đồ bậc cao mà không muốn
                    nâng lại. Luôn thành công, không tốn Xu; mất 1 vật phẩm Chuyển hoá: sơ cấp (tới +10, 30 Lượng), trung cấp (tới +13, 150
                    Lượng), cao cấp (tới +16, 500 Lượng). Món này về +0, món đích lên đúng cấp và bị khoá giao dịch.
                  </Hint>
                </div>
                <span className={SHOP.note}>
                  Chuyển +{item.plus} sang món +0 cùng loại, bậc bằng hoặc cao hơn; món này về +0, món đích bị khoá. Miễn phí, mỗi lần 1 vật phẩm
                  Chuyển hoá ({stuff ? "có trong túi" : "túi chưa có: mua ở Cửa hàng [Lượng]"}).
                </span>
                {stuffItem && <ItemChip url={itemIcon(stuffItem.icon)} name={`Sẽ dùng: ${stuffItem.name}`} />}
                {targets.length === 0 ? (
                  <span className={SHOP.note}>Túi không có món đích hợp lệ.</span>
                ) : (
                  <div className={SHOP.list} role="radiogroup" aria-label="Món đích">
                    {targets.map((s) => {
                      const t = byslot(s);
                      return t ? <GearRow key={s} item={t} worn={false} on={s === target} onPick={() => setTarget(s)} /> : null;
                    })}
                  </div>
                )}
                <Button
                  kind="outline"
                  small
                  icon="swap"
                  disabled={!!why || target == null || !stuff}
                  onClick={() => {
                    const t = target != null ? byslot(target) : undefined;
                    if (!t) return;
                    ask({
                      title: "Chuyển hoá trang bị",
                      message: `${t.name} lên +${item.plus} và bị khoá giao dịch; ${item.name} về +0. Dùng 1 vật phẩm Chuyển hoá.`,
                      confirm: "Chuyển hoá",
                      icon: "swap",
                      run: () => api.smithTransmute(account.id, item.slot, t.slot),
                    });
                  }}
                >
                  Chuyển hoá
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GearRow({ item, worn, on, onPick }: { item: Item; worn: boolean; on: boolean; onPick: () => void }) {
  const icon = itemIcon(item.icon);
  return (
    <button type="button" role="radio" aria-checked={on} className={cn(SHOP.line, on && SHOP.lineOn)} onClick={onPick}>
      <span className={SHOP.lineIcon}>{icon && <img className={SHOP.lineImg} src={icon} alt="" />}</span>
      <span className={SHOP.lineName}>
        <b className={SHOP.lineTitle}>
          {item.name} <span className="ml-1 text-10 text-primary px">+{item.plus}</span>
        </b>
        {/* The level and the stats stand out of the grey line: the level blue, the numbers green (as the item detail). */}
        <small className={SHOP.lineSub}>
          {item.kindName} · <b className="font-bold text-exp">cấp {item.level}</b> · <Stats stats={item.stats} />
        </small>
      </span>
      <span className={SHOP.linePrice}>
        {/* A worn item, on a line of its own. */}
        {worn && <b className="block text-[10.5px] font-semibold text-primary">đang mặc</b>}
        {item.locked ? "khoá" : "chưa khoá"}
      </span>
    </button>
  );
}

/** The stats of a piece of gear ("+16 sức tấn công"), the numbers green as in the item detail, the names plain. */
function Stats({ stats }: { stats: string[] }) {
  return stats.map((s, i) => {
    const [, value, name] = /^([+-]?[\d.,]+%?)\s*(.*)$/.exec(s) ?? [s, "", s];
    return (
      <span key={i}>
        {i > 0 && ", "}
        {value ? (
          <>
            <b className="font-bold text-good">{value}</b> {name}
          </>
        ) : (
          s
        )}
      </span>
    );
  });
}

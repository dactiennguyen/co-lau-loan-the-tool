import { useEffect, useId, useState } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { FilterChip } from "../components/FilterChip";
import { Hint } from "../components/Hint";
import { Icon } from "../components/Icon";
import { Stepper } from "../components/Stepper";
import { num } from "../format";
import { itemIcon } from "../itemIcons";
import { isGear, SAFE_LEVEL, stoneCounts, stoneLevel, TRANSMUTE_ITEMS, upgradeCap } from "../shops";
import type { Item } from "../types";
import type { ShopContext } from "./ShopModal";
import { ItemChip, Stone } from "./Stone";

/**
 * Nâng cấp (16-upgrade.md#nâng-cấp): a piece of gear of the bag, Thường or Cẩn thận (+5 Lượng, odds ×1,5), the odds to
 * aim for and the level to reach. Hỏi giá asks Pháp sư the price and odds of the next level and presses nothing. Nâng
 * cấp puts the cheapest stones one by one until the odds are reached, as the server takes every stone put in, and goes
 * on level by level up to +4 (below it a failure keeps the level; Bùa bảo vệ is not measured yet). Tách đá and Chuyển
 * hoá work on the same item. Every press asks once more.
 */
export function ShopUpgrade({ account, why, ask, track }: ShopContext) {
  const c = account.character!;
  const gear = (c.bag?.items ?? []).filter(isGear).sort((a, b) => b.plus - a.plus || (b.level ?? 0) - (a.level ?? 0));
  const [slot, setSlot] = useState<number | null>(null);
  const item = gear.find((i) => i.slot === slot) ?? null;
  const [careful, setCareful] = useState(false);
  const [rate, setRate] = useState(100);
  const [unlocked, setUnlocked] = useState(false);
  const cap = item ? upgradeCap(item.level ?? 1) : 0;
  const top = Math.min(cap, SAFE_LEVEL);
  const [toLevel, setToLevel] = useState(1);
  useEffect(() => {
    if (item) setToLevel(Math.min(top, item.plus + 1));
  }, [item?.slot, item?.plus, top]); // eslint-disable-line react-hooks/exhaustive-deps

  const stones = (c.bag?.items ?? []).filter((i) => stoneLevel(i.id) && (unlocked || i.locked));
  // The stones by level, as the bot will put them: the cheapest first.
  const stoneRow = stoneCounts(c.bag?.items ?? [])
    .map(([locked, free], level): [number, number] => [level, locked + (unlocked ? free : 0)])
    .filter(([level, n]) => level > 0 && n > 0);
  const run = c.smith;
  const mine = run && item && run.item?.slot === item.slot ? run : null;

  // Chuyển hoá: the targets the bot accepts, and the item that moves this level.
  const [targets, setTargets] = useState<number[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    if (item && item.plus > 0) api.transmuteTargets(account.id, item.slot).then((t) => live && setTargets(t));
    else setTargets([]);
    setTarget(null);
    return () => {
      live = false;
    };
  }, [account.id, item?.slot, item?.plus]); // eslint-disable-line react-hooks/exhaustive-deps
  const stuff = item ? TRANSMUTE_ITEMS.find((t) => t.upTo >= item.plus && c.bag?.items.some((i) => i.id === t.id)) : undefined;
  const stuffItem = stuff ? c.bag?.items.find((i) => i.id === stuff.id) : undefined;
  const byslot = (s: number) => c.bag?.items.find((i) => i.slot === s);
  const hint = useId();

  return (
    <div className="sup">
      <div className="shoptab__lead">
        <b>Chọn món cần nâng</b>
        <Hint label="Nâng cấp là gì?" id={`${hint}-what`}>
          Pháp sư nâng món lên từng cấp (+1, +2…) bằng đá và Xu khóa. Tỉ lệ thành công theo tổng sức của đá đặt vào. Thành công
          thì chỉ số tăng (khoảng 20% chỉ số chính) và món bị khoá giao dịch; thất bại thì mất đá và phí, dưới +4 không tụt cấp.
          Chỉ món trong túi: đồ đang mặc phải cởi ra trước.
        </Hint>
      </div>
      {gear.length === 0 ? (
        <p className="shoptab__note">Túi không có Nón, Áo, Vũ khí, Nhẫn hay Cánh nào. Đồ đang mặc phải cởi ra túi mới nâng được.</p>
      ) : (
        <div className="sup__gear" role="radiogroup" aria-label="Món nâng cấp">
          {gear.map((i) => (
            <GearRow key={i.slot} item={i} on={i.slot === slot} onPick={() => setSlot(i.slot)} />
          ))}
        </div>
      )}
      {item && (
        <>
          <div className="sup__opts">
            <div className="sbuy__filters" role="group" aria-label="Kiểu nâng cấp">
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
            <label className="smerge__opt">
              Tỉ lệ muốn đạt
              <Stepper value={rate} onChange={setRate} min={1} max={100} label="tỉ lệ %" />%
            </label>
            <Hint label="Tỉ lệ muốn đạt là gì?" id={`${hint}-rate`}>
              Bot đặt từng viên đá, rẻ nhất trước, tới khi tỉ lệ Pháp sư báo đạt mức này thì bấm Bắt đầu. Đá đặt vào đều mất kể cả
              viên thừa, nên bot không đặt dư. Tỉ lệ chạm trần của Thường (80% ở +0→+1, 75% ở +1→+2) thì bot bấm ở trần. Đặt hết đá
              mà tỉ lệ vẫn thấp hơn mức này thì bot dừng, không bấm, không tốn gì.
            </Hint>
            <label className="smerge__opt">
              Nâng tới +
              <Stepper value={toLevel} onChange={setToLevel} min={Math.min(top, item.plus + 1)} max={top} label="cấp muốn đạt" />
            </label>
            <Hint label="Nâng tới + là gì?" id={`${hint}-to`}>
              Bot nâng từng cấp một tới cấp này. Thất bại thì thử lại đúng cấp đó với đá mới, cho tới khi đạt, hết đá hay hết tiền;
              bấm Dừng để thôi giữa chừng. Tạm chỉ tới +{SAFE_LEVEL}: từ +5 thất bại sẽ tụt cấp và cần Bùa bảo vệ (chưa làm). Trần
              theo bậc món: bậc 1 tới +4, bậc 21 tới +8, bậc 51 tới +12, bậc 101 tới +16.
            </Hint>
            <label className="shoptab__check">
              <input type="checkbox" checked={unlocked} onChange={(e) => setUnlocked(e.target.checked)} />
              <span className="shoptab__box" aria-hidden="true">
                <Icon name="check" size={11} />
              </span>
              Dùng cả đá chưa khoá
            </label>
            <Hint label="Dùng cả đá chưa khoá là gì?" id={`${hint}-unlocked`}>
              Mặc định bot chỉ đặt đá đã khoá (đá rơi từ quái, đá Tách đá trả về). Chọn thì dùng cả đá chưa khoá (mua bằng Lượng, bán
              được), nhưng đá đã khoá vẫn được đặt trước.
            </Hint>
          </div>
          <div className="stones" role="group" aria-label="Đá dùng được, rẻ nhất trước">
            {stoneRow.length === 0 ? (
              <span className="shoptab__note">Không có đá {unlocked ? "" : "đã khoá "}nào trong túi.</span>
            ) : (
              stoneRow.map(([level, n]) => <Stone key={level} level={level} count={n} short />)
            )}
          </div>
          <p className="shoptab__note">
            {item.name} +{item.plus} · cấp mặc {item.level} · trần +{cap} · {stones.length} viên đá dùng được. Bot đặt đá rẻ nhất trước, dừng
            khi đủ tỉ lệ hoặc tỉ lệ không tăng nữa (server lấy hết đá đã đặt); hết đá mà chưa đủ tỉ lệ thì không bấm.
            Tạm chỉ nâng tới +{SAFE_LEVEL}: dưới +4 thất bại không tụt cấp.
          </p>
          {mine?.quote && (
            <div className="sup__quote">
              <span>
                Pháp sư báo: {mine.quote.fee ? `${num(mine.quote.fee.amount)} ${mine.quote.fee.money === "xu" ? "Xu" : "Xu khóa"}` : "miễn phí"}
                {mine.quote.luong > 0 && ` + ${mine.quote.luong} Lượng`}
                {mine.quote.rate != null && ` · tỉ lệ ${mine.quote.rate}%`}
              </span>
              {mine.preview && (
                <span className="sup__preview">
                  +{mine.preview.plus}: {mine.preview.stats.join(", ")}
                </span>
              )}
            </div>
          )}
          <div className="sup__btns">
            <Button
              kind="outline"
              icon="eye"
              disabled={!!why || item.plus >= cap || stones.length === 0}
              onClick={() => {
                track();
                api.smithUpgrade(account.id, item.slot, careful, rate, item.plus + 1, unlocked, true);
              }}
            >
              Hỏi giá (miễn phí)
            </Button>
            <Button
              kind="primary"
              icon="hammer"
              disabled={!!why || item.plus >= top || stones.length === 0}
              onClick={() =>
                ask({
                  title: `Nâng cấp ${item.name}`,
                  message: `Nâng ${item.name} từ +${item.plus} tới +${toLevel}${careful ? " (Cẩn thận, mỗi lần +5 Lượng)" : ""}, mỗi lần đặt đá tới tỉ lệ ${rate}% hoặc tới trần. Mỗi lần nâng tốn đá và Xu khóa, thất bại thì mất cả hai nhưng không tụt cấp dưới +4; thành công thì món bị khoá giao dịch.`,
                  confirm: "Nâng cấp",
                  icon: "hammer",
                  run: () => api.smithUpgrade(account.id, item.slot, careful, rate, toLevel, unlocked, false),
                })
              }
            >
              Nâng cấp
            </Button>
            <Hint label="Hỏi giá khác Nâng cấp thế nào?" id={`${hint}-quote`}>
              Hỏi giá mở cửa sổ Nâng cấp, đặt đá để xem phí và tỉ lệ Pháp sư báo cho cấp sau, rồi đóng lại: không bấm Bắt đầu nên
              không tốn gì. Nâng cấp làm thật, tốn đá và Xu khóa (Cẩn thận thêm Lượng); app hỏi lại một lần trước khi bắt đầu.
            </Hint>
          </div>
          {item.plus > 0 && (
            <div className="sup__more">
              <div className="sup__part">
                <div className="shoptab__lead">
                  <b>Tách đá</b>
                  <Hint label="Tách đá là gì?" id={`${hint}-separate`}>
                    Món về +0, chỉ số về như lúc +0, và nhận lại vài viên đá cấp thấp (đã khoá). Số đá trả theo cấp của món, không theo
                    đá đã dùng: Giáp +1 nâng bằng một Đá cấp 5 chỉ trả 2 Đá cấp 1. Không tốn tiền, nhưng túi phải đủ ô trống cho đá trả về.
                  </Hint>
                </div>
                <span className="shoptab__note">Món về +0, nhận lại vài viên đá cấp thấp (J3: +1 trả 2 Đá cấp 1). Miễn phí, cần đủ ô trống.</span>
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
              <div className="sup__part">
                <div className="shoptab__lead">
                  <b>Chuyển hoá</b>
                  <Hint label="Chuyển hoá là gì?" id={`${hint}-transmute`}>
                    Chuyển cấp + của món này sang một món +0 cùng loại, bậc bằng hoặc cao hơn, ví dụ khi đổi sang đồ bậc cao mà không muốn
                    nâng lại. Luôn thành công, không tốn Xu; mất 1 vật phẩm Chuyển hoá: sơ cấp (tới +10, 30 Lượng), trung cấp (tới +13, 150
                    Lượng), cao cấp (tới +16, 500 Lượng). Món này về +0, món đích lên đúng cấp và bị khoá giao dịch.
                  </Hint>
                </div>
                <span className="shoptab__note">
                  Chuyển +{item.plus} sang món +0 cùng loại, bậc bằng hoặc cao hơn; món này về +0, món đích bị khoá. Miễn phí, mỗi lần 1 vật phẩm
                  Chuyển hoá ({stuff ? "có trong túi" : "túi chưa có: mua ở Cửa hàng [Lượng]"}).
                </span>
                {stuffItem && <ItemChip url={itemIcon(stuffItem.icon)} name={`Sẽ dùng: ${stuffItem.name}`} />}
                {targets.length === 0 ? (
                  <span className="shoptab__note">Túi không có món đích hợp lệ.</span>
                ) : (
                  <div className="sup__gear" role="radiogroup" aria-label="Món đích">
                    {targets.map((s) => {
                      const t = byslot(s);
                      return t ? <GearRow key={s} item={t} on={s === target} onPick={() => setTarget(s)} /> : null;
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
      <p className="shoptab__todo">
        Chưa làm: Bùa bảo vệ và nâng trên +{SAFE_LEVEL} (chưa đo được cấp nào server nhận bùa), Chế tạo trang bị theo công thức.
      </p>
    </div>
  );
}

function GearRow({ item, on, onPick }: { item: Item; on: boolean; onPick: () => void }) {
  const icon = itemIcon(item.icon);
  return (
    <button type="button" role="radio" aria-checked={on} className={on ? "sline sline--on" : "sline"} onClick={onPick}>
      <span className="sline__icon">{icon && <img src={icon} alt="" />}</span>
      <span className="sline__name">
        <b>
          {item.name} <span className="sline__plus px">+{item.plus}</span>
        </b>
        <small>
          {item.kindName} · cấp {item.level} · {item.stats.join(", ")}
        </small>
      </span>
      <span className="sline__price">{item.locked ? "khoá" : "chưa khoá"}</span>
    </button>
  );
}

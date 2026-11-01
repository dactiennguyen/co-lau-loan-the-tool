import { useEffect, useId, useState } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { Hint } from "../components/Hint";
import { Icon } from "../components/Icon";
import { Stepper } from "../components/Stepper";
import { num } from "../format";
import { recalled, remember } from "../remember";
import { stoneLevel } from "../shops";
import type { MergeForecast } from "../types";
import type { ShopContext } from "./ShopModal";

const UP_TO = "shop.mergeUpTo";
const UNLOCKED = "shop.mergeUnlocked";

/**
 * Gộp đá (16-upgrade.md#luyện-đá): the stones of the bag by level, locked and not, and what Luyện đá would make of them:
 * only sets of 4 of a level, which make one of the next at 100% and lose nothing, again on the stones made, up to the
 * level chosen. Unlocked stones go to Luyện đá [Xu] and are paid in Xu, so the stone made stays tradeable. The total
 * fee is asked once more before the bot starts.
 */
export function ShopMerge({ account, why, ask }: ShopContext) {
  const c = account.character!;
  const [upTo, setUpTo] = useState(() => Number(recalled(UP_TO)) || 12);
  const [unlocked, setUnlocked] = useState(() => recalled(UNLOCKED) !== "0");
  const [forecast, setForecast] = useState<MergeForecast | null>(null);
  const hint = useId();
  const bag = c.bag;
  const stamp = bag ? bag.items.map((i) => `${i.slot}:${i.id}:${i.locked}`).join(",") : "";
  useEffect(() => {
    let live = true;
    api.mergeForecast(account.id, upTo, unlocked).then((f) => live && setForecast(f));
    return () => {
      live = false;
    };
  }, [account.id, upTo, unlocked, stamp]);

  // Stones by level: [locked, unlocked].
  const counts = Array.from({ length: 13 }, () => [0, 0]);
  for (const i of bag?.items ?? []) {
    const level = stoneLevel(i.id);
    if (level) counts[level][i.locked ? 0 : 1] += 1;
  }
  const levels = counts.map((n, level) => ({ level, locked: n[0], unlocked: n[1] })).filter((r) => r.level && r.locked + r.unlocked);
  const money = c.currencies;
  const short = !!forecast && !!money && (forecast.xu > money.xu || forecast.xuKhoa + forecast.xu > money.xuKhoa + money.xu);
  const made = forecast?.made.map((m) => `${m.count} Đá cấp ${m.level}${m.locked ? " (khoá)" : ""}`).join(", ");
  const fee = [forecast?.xuKhoa ? `${num(forecast.xuKhoa)} Xu khóa` : null, forecast?.xu ? `${num(forecast.xu)} Xu` : null]
    .filter(Boolean)
    .join(" + ");

  return (
    <div className="smerge">
      <div className="shoptab__lead">
        <b>Gộp đá</b>
        <Hint label="Gộp đá là gì?" id={`${hint}-what`}>
          Luyện đá ở Pháp sư: 4 viên cùng cấp thành 1 viên cấp trên, chắc chắn 100%, không mất viên nào. Khi nâng cấp, 1 Đá cấp k
          có sức bằng 4 Đá cấp k−1, nên gộp không làm mất sức nâng, chỉ tốn phí; mỗi lần gộp túi trống thêm 3 ô. Nhưng server lấy
          hết đá đặt vào, nên đá cấp thấp lại vừa khít cho lần nâng thấp: chỉ nên gộp tới cấp cần dùng.
        </Hint>
      </div>
      {levels.length === 0 ? (
        <p className="shoptab__note">Túi không có đá nâng cấp (Đá cấp 1–12).</p>
      ) : (
        <table className="smerge__table">
          <thead>
            <tr>
              <th scope="col">Đá</th>
              <th scope="col">Khoá</th>
              <th scope="col">Chưa khoá</th>
              <th scope="col">Bộ 4 viên</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((r) => (
              <tr key={r.level}>
                <th scope="row">Đá cấp {r.level}</th>
                <td className="px">{r.locked || "—"}</td>
                <td className="px">{r.unlocked || "—"}</td>
                <td className="px">{Math.floor(r.locked / 4) + (unlocked ? Math.floor(r.unlocked / 4) : 0) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="smerge__opts">
        <label className="smerge__opt">
          Gộp tới Đá cấp
          <Stepper
            value={upTo}
            onChange={(v) => {
              setUpTo(v);
              remember(UP_TO, String(v));
            }}
            min={2}
            max={12}
            label="cấp đá cao nhất"
          />
        </label>
        <Hint label="Gộp tới Đá cấp là gì?" id={`${hint}-upto`}>
          Cấp đá cao nhất muốn ra. Bot gộp từ cấp thấp lên, đá vừa ra đủ 4 viên thì gộp tiếp, tới cấp này thì thôi. Phí mỗi lần
          theo cấp đá ra, gấp 4 mỗi cấp: Đá cấp 5 là 103, Đá cấp 6 là 410, Đá cấp 7 là 1.639, Đá cấp 8 khoảng 6.554 Xu khóa.
        </Hint>
        <label className="shoptab__check">
          <input
            type="checkbox"
            checked={unlocked}
            onChange={(e) => {
              setUnlocked(e.target.checked);
              remember(UNLOCKED, e.target.checked ? "1" : "0");
            }}
          />
          <span className="shoptab__box" aria-hidden="true">
            <Icon name="check" size={11} />
          </span>
          Gộp cả đá chưa khoá (Luyện đá [Xu], trả bằng Xu, đá ra vẫn chưa khoá)
        </label>
        <Hint label="Đá chưa khoá là gì?" id={`${hint}-unlocked`}>
          Đá rơi từ quái và đá Tách đá trả về đều đã khoá. Đá mua bằng Lượng thì chưa khoá, bán hay đưa người khác được. Bot không
          trộn hai loại: đá chưa khoá gộp ở Luyện đá [Xu], trả bằng Xu, nên đá ra vẫn chưa khoá. Bỏ chọn thì chỉ gộp đá đã khoá.
        </Hint>
      </div>
      <p className="smerge__plan" role="status">
        {forecast == null
          ? "…"
          : forecast.merges === 0
            ? "Không có bộ 4 viên cùng cấp và cùng khoá nào để gộp."
            : `Sẽ luyện ${forecast.merges} lần, tốn ${fee}, túi trống thêm ${forecast.freed} ô. Ra: ${made}.`}
      </p>
      <p className="shoptab__note">
        Chỉ gộp bộ 4 viên cùng cấp: tỉ lệ 100%, không mất đá. 4 viên cấp k thành 1 viên cấp k+1; phí theo cấp đá ra (Đá cấp 6:
        410, Đá cấp 7: 1.639 Xu khóa). Server không cho luyện khi tỉ lệ từ 40% trở xuống.
      </p>
      {short && <p className="shoptab__why">Không đủ tiền cho cả lượt gộp; bot dừng ở lần thiếu tiền.</p>}
      <Button
        kind="primary"
        icon="gem"
        disabled={!!why || !forecast || forecast.merges === 0}
        onClick={() =>
          forecast &&
          ask({
            title: "Gộp đá",
            message: `Luyện ${forecast.merges} lần, tốn ${fee}. Ra: ${made}. Mỗi lần dùng 4 viên cùng cấp, tỉ lệ 100%.`,
            confirm: "Gộp đá",
            icon: "gem",
            run: () => api.smithMerge(account.id, upTo, unlocked),
          })
        }
      >
        Gộp đá
      </Button>
    </div>
  );
}

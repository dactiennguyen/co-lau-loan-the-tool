import { useId, useState } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { FilterChip } from "../components/FilterChip";
import { Hint } from "../components/Hint";
import { Stepper } from "../components/Stepper";
import { num } from "../format";
import { SHOP, type ShopContext } from "./ShopModal";

const LUONG = 50;
const OPTIONS = [
  { option: 0, label: "50.000 Xu", xu: 50_000, xuKhoa: 0 },
  { option: 1, label: "55.000 Xu khóa", xu: 0, xuKhoa: 55_000 },
];

/**
 * Đổi lượng of Hương Lão (15-shops.md#đổi-lượng): 50 Lượng for 50.000 Xu or 55.000 Xu khóa, as many times as chosen. The
 * server exchanges as soon as the line is picked, without asking again, so the tab asks once more.
 */
export function ShopExchange({ account, why, ask }: ShopContext) {
  const c = account.character!;
  const [option, setOption] = useState(1);
  const [times, setTimes] = useState(1);
  const luong = c.currencies?.luong ?? 0;
  const most = Math.max(1, Math.floor(luong / LUONG));
  const o = OPTIONS[option];
  const gives = o.xu ? `${num(o.xu * times)} Xu` : `${num(o.xuKhoa * times)} Xu khóa`;
  const short = luong < LUONG * times;
  const hint = useId();
  return (
    <div className={SHOP.tab}>
      <p className={SHOP.note}>
        Hương Lão Trần Bá → Đổi lượng. Đang có <b className="px text-fg">{num(luong)}</b> Lượng. Xu đổi được ở Chợ trời; Xu khóa trả phí cường hoá và mua ở NPC.
      </p>
      <div className={SHOP.chips} role="group" aria-label="Đổi lấy">
        {OPTIONS.map((x) => (
          <FilterChip key={x.option} on={option === x.option} tone={x.xuKhoa ? "var(--coin)" : undefined} onClick={() => setOption(x.option)}>
            {`50 Lượng → ${x.label}`}
          </FilterChip>
        ))}
        <Hint label="Nên đổi lấy Xu hay Xu khóa?" id={`${hint}-pick`}>
          Xu khóa được nhiều hơn 10% (55.000 so với 50.000) nhưng chỉ dùng ở NPC: mua đồ cửa hàng, trả phí nâng cấp và gộp đá; đồ
          mua bằng Xu khóa bị khoá. Xu dùng được ở Chợ trời và Luyện đá [Xu]. Hương Lão đổi ngay khi chọn, không hỏi lại, và
          không đổi ngược được.
        </Hint>
      </div>
      <div className={SHOP.buy}>
        <span className={SHOP.buyWhat}>Số lần</span>
        <Stepper value={times} onChange={setTimes} min={1} max={most} label="số lần đổi" />
        <span className={short ? SHOP.costShort : undefined}>
          = <b className={SHOP.costFig}>{num(LUONG * times)}</b> Lượng → {gives}
        </span>
        <Button
          kind="primary"
          icon="coin"
          disabled={!!why || short}
          onClick={() =>
            ask({
              title: "Đổi lượng",
              message: `Đổi ${num(LUONG * times)} Lượng lấy ${gives} ở Hương Lão (${times} lần). Hương Lão đổi ngay, không hỏi lại.`,
              confirm: "Đổi",
              icon: "coin",
              run: () => api.exchangeLuong(account.id, option, times),
            })
          }
        >
          Đổi
        </Button>
      </div>
    </div>
  );
}

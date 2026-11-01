import { useId, useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/Button";
import { FilterChip } from "@/components/FilterChip";
import { Hint } from "@/components/Hint";
import { Stepper } from "@/components/Stepper";
import { num } from "@/utils/format";
import type { PointsRead } from "@/api/types";
import { SHOP, type ShopContext } from "./ShopModal";

const LUONG = 50;
const OPTIONS = [
  { option: 0, label: "50.000 Xu", xu: 50_000, xuKhoa: 0 },
  { option: 1, label: "55.000 Xu khóa", xu: 0, xuKhoa: 55_000 },
];

/** "21:04". */
const clock = (ms: number) => new Date(ms).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/**
 * Đổi lượng of Hương Lão (15-shops.md#đổi-lượng): 50 Lượng for 50.000 Xu or 55.000 Xu khóa, as many times as chosen. The
 * server exchanges as soon as the line is picked, without asking again, so the tab asks once more. Below it his Điểm
 * năng động (14-npc.md#điểm-năng-động), read only: Đổi Xu at 100 points is not measured and is never picked.
 */
export function ShopExchange({ account, why, ask, track }: ShopContext) {
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
      <Points
        points={c.points}
        why={why}
        hint={hint}
        read={(rules) => {
          track();
          api.elderPoints(account.id, rules);
        }}
      />
    </div>
  );
}

/** Điểm năng động as Hương Lão said it last, and the buttons that ask him again. */
function Points({ points: p, why, read, hint }: { points: PointsRead | null; why: string | null; read: (rules: boolean) => void; hint: string }) {
  return (
    <div className="grid gap-2 mt-1 px-2.5 py-2 bg-bg-2/40 border-2 border-line">
      <div className={SHOP.lead}>
        <b className={SHOP.leadTitle}>Điểm năng động</b>
        <Hint label="Điểm năng động là gì?" id={`${hint}-points`}>
          Điểm của tuần ở Hương Lão, hết tuần lúc 00:00 thứ Hai. Đủ 100 điểm thì đổi được một số Xu theo cấp, trả bằng Xu khóa
          (cấp 31: 3.000 Xu cần 3.300 Xu khóa). App chỉ đọc: Đổi Xu chưa đo nên chưa làm, và bot không bấm Đóng (trên máy nút
          này làm game kẹt). Đọc xong bot nói chuyện lại với Hương Lão để menu Đổi Xu không còn là menu server nhớ.
        </Hint>
      </div>
      {p ? (
        <p className={SHOP.note}>
          Tuần này <b className="px text-fg">{p.points ?? "?"}</b>/{p.need ?? 100} điểm
          {p.xu != null && (
            <>
              {" "}
              · đổi được <b className="px text-fg">{num(p.xu)}</b> Xu (cần {num(p.xuKhoa ?? 0)} Xu khóa, cấp {p.level})
            </>
          )}
          {p.slotsLeft != null && ` · còn ${num(p.slotsLeft)}/${num(p.slots ?? 0)} suất`} · đọc lúc {clock(p.readAt)}
        </p>
      ) : (
        <p className={SHOP.note}>Chưa xem. Hương Lão ở Làng Thanh Khê, như Đổi lượng.</p>
      )}
      {p?.rules && <p className="m-0 text-11 text-fg-2 whitespace-pre-line">{p.rules}</p>}
      <div className={SHOP.chips}>
        <Button small kind="outline" icon="eye" disabled={!!why} onClick={() => read(false)}>
          Xem điểm (miễn phí)
        </Button>
        <Button small kind="outline" icon="scroll" disabled={!!why} onClick={() => read(true)}>
          Xem cả Cách tính điểm
        </Button>
      </div>
    </div>
  );
}

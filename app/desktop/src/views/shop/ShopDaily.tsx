import { useId } from "react";
import { api } from "@/api";
import { cn } from "@/utils/cn";
import { Bar } from "@/components/Bar";
import { Button } from "@/components/Button";
import { Hint } from "@/components/Hint";
import { num, timeOfDay } from "@/utils/format";
import { dailyDone, dailyText } from "@/game/daily";
import type { DailyAction } from "@/api/types";
import { SHOP, type ShopContext } from "./ShopModal";

/**
 * Nhiệm vụ hàng ngày of Hương Lão (14-npc.md#nhiệm-vụ-hàng-ngày): the quest held as the server says it (s2c/1195, at login
 * and whenever it moves), how many were taken today as his menu said last, and Xem, Nhận, Hủy, Hoàn thành
 * (SmithTask::Daily). His lines run at once, without asking, so the three that change something ask once more; the bot
 * reads the menu again before it picks one, and talks to him again after, so the menu the server remembers is his first.
 */
export function ShopDaily({ account, why, ask, track }: ShopContext) {
  const c = account.character!;
  const d = c.daily;
  const q = d.quest;
  const done = !!q && dailyDone(q);
  const hint = useId();
  const run = (action: DailyAction) => api.elderDaily(account.id, action);
  const today = d.taken != null ? ` (hôm nay đã nhận ${d.taken}/${d.max ?? 3} lúc ${timeOfDay(d.readAt ?? 0)})` : "";

  return (
    <div className={SHOP.tab}>
      <div className={SHOP.lead}>
        <b className={SHOP.leadTitle}>Nhiệm vụ hàng ngày</b>
        <Hint label="Nhiệm vụ hàng ngày là gì?" id={`${hint}-what`}>
          Hương Lão giao mỗi ngày tối đa 3 nhiệm vụ, mỗi lần giữ một, ví dụ Nhặt xu: thu thập Xu khóa khi đánh quái (quái thấp hơn
          quá 20 cấp không rơi gì nên không tính). Đủ tiến độ thì về Hương Lão chọn Hoàn thành nhiệm vụ để nhận kinh nghiệm và Xu
          khóa. Hủy thì mất tiến độ và vẫn tính một lượt trong ngày. Tiến độ cập nhật mỗi khi server báo, kể cả lúc Tự đánh hay Tự
          làm nhiệm vụ; bot chưa tự đi làm nhiệm vụ ngày.
        </Hint>
      </div>

      {!d.known ? (
        <p className={SHOP.note}>Server chưa gửi nhiệm vụ ngày của nick.</p>
      ) : q ? (
        <div className="grid gap-1.5 px-2.5 py-2 bg-bg-2 border-2 border-line">
          <div className="flex items-baseline justify-between gap-2.5">
            <b className="text-13 text-fg">{q.name}</b>
            <span className={cn("px text-12", done ? "text-good" : "text-fg-2")}>
              {num(q.progress)}/{num(q.target)}
            </span>
          </div>
          <Bar value={q.progress / Math.max(1, q.target)} fill={done ? "var(--good)" : "var(--primary)"} thin label={`Tiến độ ${q.name}`} />
          <span className="text-11 text-fg-2">
            {dailyText(q)}
            {done && <b className="text-good"> · đã đủ, chọn Hoàn thành nhiệm vụ</b>}
          </span>
        </div>
      ) : (
        <p className={SHOP.note}>Không giữ nhiệm vụ ngày nào.</p>
      )}
      <p className={SHOP.note}>
        {d.taken != null ? (
          <>
            Hôm nay đã nhận <b className="px text-fg">{d.taken}/{d.max ?? 3}</b> nhiệm vụ, theo lần xem lúc {timeOfDay(d.readAt ?? 0)}.
          </>
        ) : (
          "Chưa xem số lượt đã nhận hôm nay: bấm Xem ở Hương Lão."
        )}
        {d.done && (
          <>
            {" "}
            Xong gần nhất lúc {timeOfDay(d.done.at)}: {d.done.name}
            {d.done.rewards.length > 0 && `, nhận ${d.done.rewards.join(", ")}`}.
          </>
        )}
      </p>

      <div className={SHOP.chips}>
        <Button
          small
          kind="outline"
          icon="eye"
          disabled={!!why}
          onClick={() => {
            track();
            run("show");
          }}
        >
          Xem ở Hương Lão (miễn phí)
        </Button>
        <Button
          small
          kind="primary"
          icon="plus"
          disabled={!!why || !d.known || !!q}
          title={q ? "Đang giữ một nhiệm vụ: hoàn thành hoặc hủy trước" : undefined}
          onClick={() =>
            ask({
              title: "Nhận nhiệm vụ ngày",
              message: `Hương Lão giao một nhiệm vụ mới ngay khi chọn dòng, không hỏi lại. Mỗi ngày nhận tối đa 3 nhiệm vụ${today}; bot xem lại menu và không nhận khi đã đủ.`,
              confirm: "Nhận nhiệm vụ",
              icon: "plus",
              run: () => run("accept"),
            })
          }
        >
          Nhận nhiệm vụ
        </Button>
        <Button
          small
          kind="primary"
          icon="check"
          disabled={!!why || !q || !done}
          title={q && !done ? `${q.name} mới ${num(q.progress)}/${num(q.target)}` : undefined}
          onClick={() =>
            q &&
            ask({
              title: "Hoàn thành nhiệm vụ ngày",
              message: `Trả ${q.name} (${dailyText(q)}) cho Hương Lão để nhận thưởng: kinh nghiệm và Xu khóa.`,
              confirm: "Hoàn thành",
              icon: "check",
              run: () => run("complete"),
            })
          }
        >
          Hoàn thành nhiệm vụ
        </Button>
        <Button
          small
          kind="danger"
          icon="close"
          disabled={!!why || !q || done}
          title={done ? "Nhiệm vụ đã đủ: Hoàn thành để nhận thưởng thay vì hủy" : undefined}
          onClick={() =>
            q &&
            ask({
              title: "Hủy nhiệm vụ ngày",
              message: `Hủy ${q.name} (${dailyText(q)})? Tiến độ mất hết, và nhiệm vụ đã hủy vẫn tính một lượt trong 3 lượt của ngày.`,
              confirm: "Hủy nhiệm vụ",
              icon: "close",
              run: () => run("cancel"),
            })
          }
        >
          Hủy nhiệm vụ
        </Button>
      </div>
    </div>
  );
}

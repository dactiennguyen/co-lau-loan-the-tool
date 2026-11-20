import { useEffect, useId, useState } from "react";
import { api } from "@/api";
import { cn } from "@/utils/cn";
import { Button } from "@/components/Button";
import { CheckRow } from "@/components/CheckRow";
import { DIALOG, Dialog } from "@/components/Dialog";
import { Hint } from "@/components/Hint";
import { Icon } from "@/components/Icon";
import { num, timeOfDay } from "@/utils/format";
import type { Account, FightSettings, WelfareEvent, WelfareMilestone } from "@/api/types";

/** A milestone's state in words and colour: not reached, to take, taken. */
const STATE = [
  { word: "chưa đủ", tone: "text-fg-3" },
  { word: "nhận được", tone: "text-coin" },
  { word: "đã nhận", tone: "text-good" },
];
/** A part of the window: its frame, heading and lines. */
const PART = "grid gap-1.5 px-3 py-2.5 bg-bg-2 border-2 border-line";
const HEAD = "flex flex-wrap items-baseline gap-x-2 gap-y-0.5";
const TITLE = "text-[12.5px] font-bold text-fg";
const NOTE = "text-12 text-fg-2 leading-[1.5]";

/**
 * Phúc lợi, a modal opened from the Tiền tile (18-players-checkin.md#điểm-danh, #quà-online): Tự điểm danh và nhận quà
 * (FightSettings.autoWelfare, off unless turned on; the bot runs on its own, bot/welfare.rs), Nhận ngay (one run now,
 * the switch on or not), and what the server said last of the three events: Điểm danh (today, the days of the month, the
 * milestones of 7/14/21/28 days), Quà online (minutes today, 30/60/120/180) and Quà thăng cấp (the next level), with the
 * words of the last run. The state comes with the first run of the session: Nhận ngay reads it even when nothing is due.
 */
export function WelfareModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const c = account.character;
  const w = c?.welfare;
  const hint = useId();
  // The switch: shown at once, saved to accounts.json; kept until the account comes back with it (as Tự cộng).
  const saved = account.fightSettings;
  const [saving, setSaving] = useState<FightSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (saving && saving.autoWelfare === saved.autoWelfare) setSaving(null);
  }, [saving, saved]);
  const settings = saving ?? saved;
  const setAuto = (autoWelfare: boolean) => {
    setSaving({ ...settings, autoWelfare });
    setError(null);
    api.setFight(account.id, { autoWelfare }).catch((err) => {
      setSaving(null);
      setError(String(err?.message ?? err));
    });
  };
  const why = !c ? "Nick chưa vào game." : c.battle ? "Đang đánh, đợi hết trận." : w?.doing ? w.doing : null;

  return (
    <Dialog
      title="Phúc lợi"
      subtitle={`${account.label} · Điểm danh, Quà online, Quà thăng cấp · quà vào thẳng túi`}
      className="w-[min(640px,94vw)] max-w-none"
      formClassName="max-h-[min(760px,92vh)] box-border grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2.5 px-5 py-4"
      onClose={onClose}
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="flex flex-wrap items-center gap-y-1.5 gap-x-2.5">
        <CheckRow checked={settings.autoWelfare} disabled={!!saving} onChange={setAuto} className="font-semibold">
          Tự điểm danh và nhận quà
        </CheckRow>
        <Hint label="Tự điểm danh và nhận quà là gì?" id={`${hint}-auto`}>
          Bật thì bot tự làm thay nút Phúc lợi của game: mỗi ngày tự điểm danh (sau 00:00), nhận quà online khi đủ 30, 60, 120,
          180 phút trong ngày, và nhận quà thăng cấp khi lên tới cấp có quà. Quà vào thẳng túi, không qua hòm thư. Bot chạy cả
          khi nick đứng yên hay đang tự đánh (giữa hai trận), không chạy giữa trận hay lúc đang đổi map. Túi không đủ chỗ thì
          bỏ qua lần đó và thử lại sau 10 phút. Mặc định tắt; lưu theo nick.
        </Hint>
        <Button kind="primary" small icon="gift" className="ml-auto" disabled={!!why} title={why ?? undefined} onClick={() => api.welfare(account.id)}>
          Nhận ngay
        </Button>
      </div>
      <div className="grid gap-1">
        {error && <p className={DIALOG.error}>{error}</p>}
        {why && <p className="text-12 text-fg-3">{why}</p>}
        {w?.last && (
          <p className={NOTE} role="status">
            {w.lastAt != null && <span className="text-fg-3">{timeOfDay(w.lastAt)} · </span>}
            {w.last}
          </p>
        )}
      </div>
      <div className="@container min-h-0 overflow-y-auto pr-1 scroll grid [align-content:start] gap-2">
        {!w?.known ? (
          <p className={NOTE}>
            {c
              ? `Chưa xem Phúc lợi trong lần đăng nhập này${w?.due ? " (game báo còn quà chưa nhận)" : ""}: bấm Nhận ngay, hay bật tự điểm danh và nhận quà.`
              : "Đăng nhập để xem Phúc lợi."}
          </p>
        ) : (
          <>
            <section className={PART} aria-label="Điểm danh">
              <div className={HEAD}>
                <Icon name="check" size={13} className="text-good" />
                <b className={TITLE}>Điểm danh</b>
                <span className={cn("text-12", w.checkedToday ? "text-good" : "text-coin")}>
                  {w.checkedToday ? "hôm nay đã điểm danh" : "hôm nay chưa điểm danh"}
                  {w.checkedToday && w.todayGift && `, được ${w.todayGift}`}
                </span>
                {w.checkin && (
                  <span className="ml-auto text-12 text-fg-2">
                    <b className="px text-fg">{w.days?.length ?? w.checkin.progress}</b>/{w.daysInMonth ?? 30} ngày tháng {w.checkin.period.slice(5)}
                  </span>
                )}
              </div>
              {w.daily.length > 0 && <p className={NOTE}>Mỗi ngày nhận ngẫu nhiên một trong: {w.daily.join(", ")}.</p>}
              {w.checkin && <Milestones event={w.checkin} unit="ngày" />}
            </section>
            {w.online && (
              <section className={PART} aria-label="Quà online">
                <div className={HEAD}>
                  <Icon name="clock" size={13} className="text-primary" />
                  <b className={TITLE}>Quà online</b>
                  <span className="ml-auto text-12 text-fg-2">
                    Hôm nay đã online <b className="px text-fg">{num(w.online.progress)}</b> phút
                  </span>
                </div>
                <Milestones event={w.online} unit="phút" />
              </section>
            )}
            {w.level && (
              <section className={PART} aria-label="Quà thăng cấp">
                <div className={HEAD}>
                  <Icon name="star" size={13} className="text-exp" />
                  <b className={TITLE}>Quà thăng cấp</b>
                  <span className="ml-auto text-12 text-fg-2">
                    <NextLevel event={w.level} />
                  </span>
                </div>
                <Milestones event={w.level} unit="cấp" before />
              </section>
            )}
          </>
        )}
      </div>
      <footer className={DIALOG.footer}>
        <Button onClick={onClose}>Đóng</Button>
      </footer>
    </Dialog>
  );
}

/** "Cấp 34 · mốc kế tiếp cấp 40: Tăng Kinh Nghiệm", or that every one is taken. */
function NextLevel({ event }: { event: WelfareEvent }) {
  const next = event.milestones.find((m) => m.state === 0);
  return (
    <>
      Cấp <b className="px text-fg">{event.progress}</b>
      {next ? ` · mốc kế tiếp cấp ${next.need}: ${next.gifts}` : " · đã nhận hết các mốc"}
    </>
  );
}

/** The milestones of an event, each a line: what it needs ("7 ngày", "Cấp 40"), its gifts, its state. */
function Milestones({ event, unit, before }: { event: WelfareEvent; unit: string; before?: boolean }) {
  return (
    <ul className="grid gap-0.5 m-0 p-0 list-none @min-[480px]:grid-cols-2 @min-[480px]:gap-x-3">
      {event.milestones.map((m: WelfareMilestone) => {
        const s = STATE[m.state] ?? STATE[0];
        return (
          <li key={m.id} className="flex items-baseline gap-2 min-w-0 text-12">
            <span className="flex-none w-[64px] text-fg">{before ? `Cấp ${m.need}` : `${num(m.need)} ${unit}`}</span>
            <span className="flex-1 min-w-0 truncate text-fg-2" title={m.gifts}>
              {m.gifts || "—"}
            </span>
            <span className={cn("flex-none text-11 font-semibold", s.tone)}>{s.word}</span>
          </li>
        );
      })}
    </ul>
  );
}

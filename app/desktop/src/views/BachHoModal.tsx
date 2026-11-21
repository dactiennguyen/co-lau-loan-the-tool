import { useEffect, useId, useState } from "react";
import { api } from "@/api";
import type { Account } from "@/api/types";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { CHECK_BOX } from "@/components/CheckRow";
import { Dialog } from "@/components/Dialog";
import { ELEMENT_ICON, ELEMENT_NAME, elementText } from "@/components/ElementTag";
import { FIELD } from "@/components/TextField";
import { Hint } from "@/components/Hint";
import { Icon } from "@/components/Icon";
import { Pill } from "@/components/Pill";
import { BACH_HO_HOUR, BACH_HO_LEVEL, minutesText, runWindow } from "@/game/bachHo";
import { useStore } from "@/store";
import { cn } from "@/utils/cn";
import { num } from "@/utils/format";
import { recalled, remember } from "@/utils/remember";

/** The accounts last picked, by id, and the two times last chosen: picked again next time. */
const PICKED_KEY = "bachHo.picked";
const FROM_KEY = "bachHo.from";
const UNTIL_KEY = "bachHo.until";
const DEFAULT_FROM = `${BACH_HO_HOUR}:00`;
const DEFAULT_UNTIL = `${BACH_HO_HOUR + 1}:00`;

const HEAD = "flex flex-wrap items-center gap-x-2 gap-y-1";
const TITLE = "text-[12.5px] font-bold text-fg";

/** The time now, every 5 s, for the countdown and the runs under way. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const inGame = (a: Account) => a.status === 2 || a.status === 3;
/** A run of Bạch Hổ under way on the account. */
const running = (a: Account) => !!a.character?.bachHo && !a.character.bachHo.done;

/** An account the boss may take: in the game (online or in a battle) and from level 30; else why not. */
function whyNot(a: Account): string | null {
  if (!inGame(a)) return "chưa vào game";
  const c = a.character;
  if (!c) return "đang vào game";
  if (c.level < BACH_HO_LEVEL) return `cấp ${c.level}, cần cấp ${BACH_HO_LEVEL}`;
  return null;
}

function readPicked(): Set<number> {
  try {
    return new Set((JSON.parse(recalled(PICKED_KEY) ?? "[]") as unknown[]).filter((x): x is number => typeof x === "number"));
  } catch {
    return new Set();
  }
}

/**
 * Bạch Hổ, a window of its own for every account (the sidebar's Bạch Hổ button). The time to start and to end (21:00 to
 * 22:00 by default, Vietnam time), the accounts in the game to send, picked with a tick (from level 30; the rest listed
 * with why, those not in the game with Đăng nhập), then Bắt đầu: each one waits for the start, goes to Hang Bạch Hổ
 * through Bản đồ thế giới and keeps trying to get into the boss's battle until the end (bot/bachho.rs). Each row says
 * what its account does, its tries, battles and damage, with Dừng, and Quay về chỗ cũ once it is over.
 */
export function BachHoModal({ onClose }: { onClose: () => void }) {
  const order = useStore((s) => s.order);
  const byId = useStore((s) => s.byId);
  const accounts = order.map((id) => byId[id]).filter(Boolean);
  const now = useNow();
  const hint = useId();
  const field = useId();
  const [picked, setPicked] = useState(readPicked);
  const [from, setFrom] = useState(() => recalled(FROM_KEY) ?? DEFAULT_FROM);
  const [until, setUntil] = useState(() => recalled(UNTIL_KEY) ?? DEFAULT_UNTIL);
  const keep = (next: Set<number>) => {
    setPicked(next);
    remember(PICKED_KEY, JSON.stringify([...next]));
  };
  const setTime = (which: "from" | "until", v: string) => {
    if (which === "from") setFrom(v);
    else setUntil(v);
    remember(which === "from" ? FROM_KEY : UNTIL_KEY, v);
  };

  const span = runWindow(from, until, now);
  const ready = accounts.filter((a) => !whyNot(a));
  const shown = accounts.filter(inGame);
  const notIn = accounts.filter((a) => !inGame(a));
  const busy = accounts.filter(running);
  const chosen = ready.filter((a) => picked.has(a.id) && !running(a));
  const all = ready.length > 0 && ready.every((a) => picked.has(a.id));
  const toggle = (id: number, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    keep(next);
  };
  const toggleAll = () => keep(all ? new Set([...picked].filter((id) => !ready.some((a) => a.id === id))) : new Set([...picked, ...ready.map((a) => a.id)]));
  const startWhy = !span ? "Giờ không hợp lệ" : chosen.length === 0 ? "Chọn ít nhất một nick chưa chạy" : null;
  const start = () => {
    if (!span || chosen.length === 0) return;
    void api.bachHoStart(
      chosen.map((a) => a.id),
      span.fromMs,
      span.untilMs,
    );
  };

  return (
    <Dialog
      title="Bạch Hổ Thống Lĩnh"
      subtitle={`Boss thế giới · Hang Bạch Hổ (M24) · game mở ${BACH_HO_HOUR}:00–${BACH_HO_HOUR}:59 mỗi ngày · từ cấp ${BACH_HO_LEVEL}`}
      className="w-[min(760px,94vw)] max-w-none"
      formClassName="max-h-[min(820px,92vh)] box-border grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2.5 px-5 py-4"
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
    >
      {/* When: the two times, the countdown to the start (or the time left). */}
      <section
        className={cn(
          "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 px-3 py-2.5 border-2",
          span?.open ? "border-danger bg-[color-mix(in_srgb,var(--danger)_14%,var(--bg-2))]" : "border-line bg-bg-2",
        )}
        aria-label="Giờ đánh"
      >
        <span
          className={cn(
            "grid place-items-center size-11 bevel-sm",
            span?.open ? "bg-danger text-ink animate-blink motion-reduce:animate-none" : "bg-ink text-coin",
          )}
          aria-hidden
        >
          <Icon name="crown" size={22} />
        </span>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <label htmlFor={`${field}-from`} className="text-12 text-fg-2">
            Bắt đầu lúc
          </label>
          <input id={`${field}-from`} type="time" className={cn(FIELD.input, "w-[104px] px")} value={from} onChange={(e) => setTime("from", e.target.value)} />
          <label htmlFor={`${field}-until`} className="text-12 text-fg-2">
            tới
          </label>
          <input id={`${field}-until`} type="time" className={cn(FIELD.input, "w-[104px] px")} value={until} onChange={(e) => setTime("until", e.target.value)} />
          <span className="text-12 text-fg-2" role="status">
            {!span ? (
              <span className="text-danger">giờ không hợp lệ</span>
            ) : span.open ? (
              <>
                <b className="text-danger">đang trong giờ</b>, còn <b className="px text-fg">{minutesText(span.leftMinutes)}</b>
              </>
            ) : (
              <>
                còn <b className="px text-coin">{minutesText(span.toStartMinutes)}</b> tới giờ bắt đầu
              </>
            )}
          </span>
        </div>
      </section>

      <div className={HEAD}>
        <Icon name="users" size={13} className="text-primary" />
        <b className={TITLE}>Chọn nick đánh</b>
        <span className="text-12 text-fg-2">
          <b className="px text-fg">{chosen.length}</b>/{ready.length} nick đủ điều kiện{busy.length > 0 && ` · ${busy.length} đang chạy`}
        </span>
        <Hint label="Bạch Hổ chạy thế nào?" id={`${hint}-how`}>
          Bấm Bắt đầu thì mỗi nick đã chọn dừng việc đang làm, nhớ chỗ đang đứng, rồi đợi tới giờ bắt đầu. Tới giờ, nick tự đi
          tới Hang Bạch Hổ qua Bản đồ thế giới (Cổng Luyện Ngục, cổng 1006) và cứ 5 giây thử vào trận với boss; vào được thì
          đánh, hết trận lại thử, tới giờ kết thúc thì thôi. Xong thì bấm Quay về để về đúng map và khu cũ. Mọi người cùng đánh
          một thanh máu, không có kinh nghiệm hay đồ rơi, thua không bị trừ kinh nghiệm; boss chết thì top 5 sát thương và
          người kết liễu nhận quà qua Hòm thư. Cách vào trận chưa đo thật: bot thách đấu boss như các boss khác.
        </Hint>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1.5 p-0 border-0 bg-transparent text-12 text-fg-2 cursor-pointer hover:text-fg disabled:opacity-50 disabled:cursor-default"
          disabled={ready.length === 0}
          aria-pressed={all}
          onClick={toggleAll}
        >
          <span className={cn(CHECK_BOX, all && "text-ink bg-good shadow-[inset_-2px_-2px_0_var(--good-shade)]")} aria-hidden>
            <Icon name="check" size={11} />
          </span>
          Chọn tất cả
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto pr-1 scroll grid [align-content:start] gap-2.5">
        {shown.length === 0 ? (
          <p className="text-12 text-fg-3">Chưa nick nào trong game: đăng nhập nick cấp {BACH_HO_LEVEL} trở lên để chọn.</p>
        ) : (
          <ul className="grid gap-1 m-0 p-0 list-none" aria-label="Nick đang trong game">
            {shown.map((a) => (
              <AccountRow key={a.id} account={a} why={whyNot(a)} on={picked.has(a.id)} onToggle={(on) => toggle(a.id, on)} />
            ))}
          </ul>
        )}
        {notIn.length > 0 && (
          <details className="group">
            <summary className="flex items-center gap-1.5 text-12 text-fg-3 cursor-pointer select-none hover:text-fg-2 list-none">
              <Icon name="chevron" size={11} className="-rotate-90 group-open:rotate-0" />
              Chưa vào game ({notIn.length})
            </summary>
            <ul className="grid gap-1 mt-1.5 m-0 p-0 list-none">
              {notIn.map((a) => (
                <li key={a.id} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 px-2 py-1 bg-bg-2 border-2 border-line opacity-80">
                  <Avatar name={a.username} status={a.status} size={22} />
                  <span className="truncate text-12 text-fg-2">{a.label}</span>
                  <Button small icon="login" disabled={a.status === 1} onClick={() => api.login(a.id)}>
                    Đăng nhập
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5">
        <p className="mr-auto basis-[280px] grow text-11 text-fg-3">
          {span?.open
            ? "Đang trong giờ: các nick đã chọn đi vào hang và thử vào trận ngay."
            : `Các nick đã chọn đợi tới ${from}, rồi tự đi vào hang và thử vào trận tới ${until}.`}
        </p>
        {busy.length > 0 && (
          <Button kind="danger" icon="stop" onClick={() => api.bachHoStop(busy.map((a) => a.id))}>
            Dừng tất cả ({busy.length})
          </Button>
        )}
        <Button onClick={onClose}>Đóng</Button>
        <Button kind="primary" type="submit" icon="play" disabled={!!startWhy} title={startWhy ?? undefined}>
          Bắt đầu{chosen.length ? ` · ${chosen.length} nick` : ""}
        </Button>
      </footer>
    </Dialog>
  );
}

/** One account in the game: its tick (off with why when it may not go), picture, name and level, element, where it is,
 * its status; under them, what its Bạch Hổ run does (tries, battles, damage) with Dừng, or Quay về chỗ cũ. */
function AccountRow({ account: a, why, on, onToggle }: { account: Account; why: string | null; on: boolean; onToggle: (on: boolean) => void }) {
  const c = a.character;
  const run = c?.bachHo ?? null;
  const live = running(a);
  const back = c?.backPoint ?? null;
  return (
    <li
      className={cn(
        "grid gap-1 px-2 py-1.5 bg-bg-2 border-2",
        live ? "border-danger" : why ? "border-line opacity-60" : on ? "border-good bg-[color-mix(in_srgb,var(--good)_10%,var(--bg-2))]" : "border-line",
      )}
    >
      <div className="grid grid-cols-[16px_32px_minmax(0,1fr)_auto] items-center gap-2.5">
        <label className={cn("grid place-items-center", why || live ? "cursor-default" : "cursor-pointer")}>
          <input
            className="peer absolute opacity-0 w-px h-px"
            type="checkbox"
            aria-label={`Chọn ${c?.name ?? a.label}`}
            checked={on && !why}
            disabled={!!why || live}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className={CHECK_BOX} aria-hidden>
            <Icon name="check" size={11} />
          </span>
        </label>
        <Avatar name={a.username} status={a.status} />
        <span className="grid gap-0.5 min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <b className="truncate text-13 text-fg">{c?.name ?? a.label}</b>
            {c?.element != null && ELEMENT_ICON[c.element] && (
              <span className={cn("shrink-0 inline-flex", elementText(c.element))} title={`Hệ ${ELEMENT_NAME[c.element]}`}>
                <Icon name={ELEMENT_ICON[c.element]} size={12} />
              </span>
            )}
            {c && <Badge className="shrink-0">LV {c.level}</Badge>}
          </span>
          <span className={cn("truncate text-11", why ? "text-danger" : "text-fg-3")}>
            {why ?? (c ? `${c.mapName} · Khu ${c.zone}${c.currencies ? ` · ${num(c.currencies.xu)} Xu` : ""}` : "")}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <Pill status={a.status} text={a.statusText} />
          {live ? (
            <Button small kind="danger" icon="stop" onClick={() => api.bachHoStop([a.id])}>
              Dừng
            </Button>
          ) : (
            back && (
              <Button small icon="swap" title={`Về ${back.mapName} khu ${back.zone}`} disabled={a.status === 3} onClick={() => api.goBack(a.id)}>
                Quay về
              </Button>
            )
          )}
        </span>
      </div>
      {run && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-[58px] text-11">
          <span className={cn("min-w-0 truncate", live ? "text-fg" : "text-fg-3")}>
            {live && <Icon name="refresh" size={11} className="inline mr-1 text-danger animate-spin motion-reduce:animate-none" />}
            {run.doing}
          </span>
          <span className="ml-auto text-fg-3 whitespace-nowrap">
            <b className="px text-fg">{run.tries}</b> lần thử · <b className="px text-fg">{run.battles}</b> trận · <b className="px text-coin">{num(run.damage)}</b> sát thương
          </span>
        </div>
      )}
    </li>
  );
}

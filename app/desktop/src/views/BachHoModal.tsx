import { useEffect, useId, useState } from "react";
import { api } from "@/api";
import type { Account, BachHoResult, BachHoTier } from "@/api/types";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Bar } from "@/components/Bar";
import { Button } from "@/components/Button";
import { CHECK_BOX } from "@/components/CheckRow";
import { Dialog } from "@/components/Dialog";
import { ELEMENT_ICON, ELEMENT_NAME, elementText } from "@/components/ElementTag";
import { FIELD } from "@/components/TextField";
import { Hint } from "@/components/Hint";
import { Icon } from "@/components/Icon";
import { Pill } from "@/components/Pill";
import { Stepper } from "@/components/Stepper";
import { Tabs } from "@/components/Tabs";
import { BACH_HO_HOUR, BACH_HO_LEVEL, BACH_HO_LOCKED, LEVEL_TABS, bachHoAllowed, type BachHoWaits, type LevelTab, levelTab, minutesText, runWindow, waitGroups } from "@/game/bachHo";
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
/** The run's own waits in seconds (not Cài đặt đánh's): between two swaps, and between a battle and the next try. */
const MOVE_KEY = "bachHo.moveSecs";
const REJOIN_KEY = "bachHo.rejoinSecs";
/** The waits of the accounts set on their own (id → waits), which they start with instead of the shared ones. */
const OWN_KEY = "bachHo.ownWaits";
/** The level tab last shown. */
const TAB_KEY = "bachHo.tab";
/** The longest of them, as cllt-core's BACH_HO_WAIT_MAX_MS. */
const WAIT_MAX = 10;
const isWait = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= WAIT_MAX;
/** A wait kept, 0 by default (and for anything not a number from 0 to WAIT_MAX). */
const recalledWait = (key: string) => {
  const n = Number(recalled(key) ?? 0);
  return isWait(n) ? n : 0;
};
/** The waits set on their own, those that are not two waits left out. */
function readOwnWaits(): Record<number, BachHoWaits> {
  try {
    const kept = JSON.parse(recalled(OWN_KEY) ?? "{}") as Record<string, unknown>;
    const own: Record<number, BachHoWaits> = {};
    for (const [id, w] of Object.entries(kept ?? {})) {
      const { move, rejoin } = (w ?? {}) as Partial<BachHoWaits>;
      if (isWait(move) && isWait(rejoin) && Number.isInteger(Number(id))) own[Number(id)] = { move, rejoin };
    }
    return own;
  } catch {
    return {};
  }
}
/** "0,5 s · 2 s": the two waits of an account set on its own. */
const waitsText = (w: BachHoWaits) => `${String(w.move).replace(".", ",")} s · ${String(w.rejoin).replace(".", ",")} s`;

const HEAD = "flex flex-wrap items-center gap-x-2 gap-y-1";
const TITLE = "text-[12.5px] font-bold text-fg";

/** The state of a Kết quả Bạch Hổ in words, as the game's box (sqtq.a). */
const STATE: Record<number, string> = { 0: "Đang diễn ra", 1: "Đã bị tiêu diệt", 2: "Đã tẩu thoát" };
/** The boss's HP in percent with one decimal: the server sends it per mille. */
const hpPercent = (r: BachHoResult) => (r.maxHp > 0 ? (Math.max(0, r.hp) * 100) / r.maxHp : 0);
/** "Cấp 51–100", "Cấp 151+" (a last tier ends at 0 or at 999). */
const levels = (t: BachHoTier) => (t.maxLevel <= 0 || t.maxLevel >= 999 || t.maxLevel < t.minLevel ? `Cấp ${t.minLevel}+` : `Cấp ${t.minLevel}–${t.maxLevel}`);
/** "21:00 21/11" of ms since 1970, Vietnam time. */
const clock = (ms: number) =>
  new Date(ms).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
/** "21/11" of ms since 1970, Vietnam time: the day of a session. */
const day = (ms: number) => new Date(ms).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" });
/** "12 s", "3 phút" ago. */
const ago = (ms: number, now: number) => {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} phút`;
};

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
  const allowed = useStore((s) => bachHoAllowed(s.license));
  // The key is checked again as the window opens: Bạch Hổ turned off or on by the admin is heard now, not within the hour.
  useEffect(() => {
    void api.recheckLicense();
  }, []);
  const [refused, setRefused] = useState<string | null>(null);
  const hint = useId();
  const field = useId();
  const [picked, setPicked] = useState(readPicked);
  const [from, setFrom] = useState(() => recalled(FROM_KEY) ?? DEFAULT_FROM);
  const [until, setUntil] = useState(() => recalled(UNTIL_KEY) ?? DEFAULT_UNTIL);
  const [moveSecs, setMoveSecs] = useState(() => recalledWait(MOVE_KEY));
  const [rejoinSecs, setRejoinSecs] = useState(() => recalledWait(REJOIN_KEY));
  const [ownWaits, setOwnWaits] = useState(readOwnWaits);
  const setOwn = (id: number, w: BachHoWaits | null) => {
    const next = { ...ownWaits };
    if (w) next[id] = w;
    else delete next[id];
    setOwnWaits(next);
    remember(OWN_KEY, JSON.stringify(next));
  };
  const setWait = (which: "move" | "rejoin", v: number) => {
    if (which === "move") setMoveSecs(v);
    else setRejoinSecs(v);
    remember(which === "move" ? MOVE_KEY : REJOIN_KEY, String(v));
  };
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
  // The level tabs: the one last shown, else the one with the most accounts in the game. One still loading (no
  // character yet) is listed in every tab.
  const tabOf = (a: Account) => (a.character ? levelTab(a.character.level) : null);
  const [tab, setTab] = useState<LevelTab>(() => {
    const kept = recalled(TAB_KEY);
    if (LEVEL_TABS.some((t) => t.key === kept)) return kept as LevelTab;
    const most = (k: LevelTab) => shown.filter((a) => tabOf(a) === k).length;
    return LEVEL_TABS.reduce((best, t) => (most(t.key) > most(best) ? t.key : best), LEVEL_TABS[0].key);
  });
  const pickTab = (k: LevelTab) => {
    setTab(k);
    remember(TAB_KEY, k);
  };
  const inTab = (a: Account) => tabOf(a) == null || tabOf(a) === tab;
  const shownHere = shown.filter(inTab);
  const readyHere = ready.filter(inTab);
  const all = readyHere.length > 0 && readyHere.every((a) => picked.has(a.id));
  // Ticked on the other tabs: Bắt đầu sends them too, so the head says so.
  const elsewhere = chosen.filter((a) => !inTab(a)).length;
  const toggle = (id: number, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    keep(next);
  };
  const toggleAll = () =>
    keep(all ? new Set([...picked].filter((id) => !readyHere.some((a) => a.id === id))) : new Set([...picked, ...readyHere.map((a) => a.id)]));
  const startWhy = !allowed ? BACH_HO_LOCKED : !span ? "Giờ không hợp lệ" : chosen.length === 0 ? "Chọn ít nhất một nick chưa chạy" : null;
  const start = () => {
    if (!allowed || !span || chosen.length === 0) return;
    setRefused(null);
    // One Bắt đầu for each pair of waits: the accounts set on their own with theirs, the rest with the shared ones.
    for (const g of waitGroups(
      chosen.map((a) => a.id),
      ownWaits,
      { move: moveSecs, rejoin: rejoinSecs },
    ))
      api.bachHoStart(g.ids, span.fromMs, span.untilMs, g.moveMs, g.rejoinMs).catch((e: unknown) => setRefused(String(e)));
  };

  return (
    <Dialog
      title="Bạch Hổ Thống Lĩnh"
      subtitle={`Boss thế giới · Hang Bạch Hổ (M24) · game mở ${BACH_HO_HOUR}:00–${BACH_HO_HOUR}:59 mỗi ngày · từ cấp ${BACH_HO_LEVEL}`}
      className="w-[min(760px,94vw)] max-w-none"
      // Rows: Dialog's own header, the times, the boss, the head of the list, the list (the one that scrolls), the footer.
      formClassName="max-h-[min(860px,94vh)] box-border grid-rows-[auto_auto_auto_auto_minmax(0,1fr)_auto] gap-2.5 px-5 py-4"
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
        <div className="col-start-2 mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-12 text-fg-2">
          <span>Chờ giữa các nước</span>
          <Stepper value={moveSecs} min={0} max={WAIT_MAX} step={0.1} label="số giây chờ giữa hai nước đi trong trận Bạch Hổ" onChange={(v) => setWait("move", v)} />
          <span>giây · Chờ vào trận lại</span>
          <Stepper value={rejoinSecs} min={0} max={WAIT_MAX} step={0.1} label="số giây chờ từ hết trận tới lần vào trận sau" onChange={(v) => setWait("rejoin", v)} />
          <span>giây</span>
          <Hint label="Thời gian chờ của Bạch Hổ là gì?" id={`${hint}-wait`}>
            Riêng cho Bạch Hổ, không dùng Thời gian chờ của Cài đặt đánh. Mặc định 0: mỗi nước vẫn đợi server trả lời nước trước rồi mới đi. Boss đánh mỗi 30 giây dù mình làm gì, nên đi
            càng nhanh càng nhiều sát thương. Đây là số chung; bấm nút đồng hồ ở dòng một nick để đặt riêng cho nick đó. Áp dụng cho lần Bắt đầu sau.
          </Hint>
        </div>
      </section>

      {/* One row of the grid: the notice of a key without Bạch Hổ (or the bot's refusal) above the boss. */}
      <div className="grid gap-2.5">
        {(!allowed || refused) && (
          <p className="flex items-center gap-2 m-0 px-3 py-2 border-2 border-danger bg-[color-mix(in_srgb,var(--danger)_12%,var(--bg-2))] text-12 text-fg" role="alert">
            <Icon name="lock" size={13} className="shrink-0 text-danger" />
            {refused ?? BACH_HO_LOCKED}
          </p>
        )}
        <BossPanel accounts={accounts} now={now} />
      </div>

      <div className="grid gap-2">
        <div className={HEAD}>
          <Icon name="users" size={13} className="text-primary" />
          <b className={TITLE}>Chọn nick đánh</b>
          <span className="text-12 text-fg-2">
            <b className="px text-fg">{chosen.length}</b>/{ready.length} nick đủ điều kiện{elsewhere > 0 && ` · ${elsewhere} đã chọn ở tab khác`}{busy.length > 0 && ` · ${busy.length} đang chạy`}
          </span>
          <Hint label="Bạch Hổ chạy thế nào?" id={`${hint}-how`}>
            Bấm Bắt đầu thì mỗi nick đã chọn dừng việc đang làm, nhớ chỗ đang đứng, rồi vào Hang Bạch Hổ ngay qua Bản đồ thế
            giới (Cổng Luyện Ngục, cổng 1006) và đứng trong hang đợi tới giờ bắt đầu và boss (21:00); boss vào hang là thách
            đấu ngay, như game. Mỗi trận là một mình nick đấu boss; thua thì hồi đầy máu, không mất phí, không có kinh nghiệm hay đồ
            rơi, rồi vào lại ngay. Mỗi trận trừ khoảng 1 độ bền mỗi món: món nào hỏng thì nick tự sửa bằng Búa Sửa Chữa trong túi
            trước trận sau, kể cả khi Tự sửa đồ tắt. Boss bị tiêu diệt thì phiên tự dừng; nick đủ ngưỡng sát thương của bậc mình
            nhận "Quà tham gia Bạch Hổ" trong Hòm thư (bot không tự nhận). Xong thì bấm Quay về để về đúng map và khu cũ.
          </Hint>
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1.5 p-0 border-0 bg-transparent text-12 text-fg-2 cursor-pointer hover:text-fg disabled:opacity-50 disabled:cursor-default"
            disabled={readyHere.length === 0}
            aria-pressed={all}
            title="Chọn hoặc bỏ mọi nick đủ điều kiện ở tab này"
            onClick={toggleAll}
          >
            <span className={cn(CHECK_BOX, all && "text-ink bg-good shadow-[inset_-2px_-2px_0_var(--good-shade)]")} aria-hidden>
              <Icon name="check" size={11} />
            </span>
            Chọn tất cả
          </button>
        </div>
        <Tabs<LevelTab>
          id={`${hint}-levels`}
          label="Nhóm cấp"
          value={tab}
          onChange={pickTab}
          tabs={LEVEL_TABS.map((t) => {
            const here = shown.filter((a) => tabOf(a) === t.key);
            return {
              key: t.key,
              label: `${t.label} (${here.length})`,
              icon: t.key === "low" ? "user" : t.key === "mid" ? "star" : "crown",
              busy: here.some(running),
              count: chosen.filter((a) => tabOf(a) === t.key).length,
              countLabel: "nick đã chọn",
            };
          })}
        />
      </div>

      <div className="min-h-0 overflow-y-auto pr-1 scroll grid [align-content:start] gap-2.5">
        {/* The panel of the level tabs (Tabs' ids); not TabPanel, whose row shrinks within this list. */}
        <div role="tabpanel" id={`${hint}-levels-panel`} aria-labelledby={`${hint}-levels-tab-${tab}`}>
          {shown.length === 0 ? (
            <p className="text-12 text-fg-3">Chưa nick nào trong game: đăng nhập nick cấp {BACH_HO_LEVEL} trở lên để chọn.</p>
          ) : shownHere.length === 0 ? (
            <p className="text-12 text-fg-3">Không có nick nào trong game ở nhóm cấp này.</p>
          ) : (
            <ul className="grid gap-1 m-0 p-0 list-none" aria-label="Nick đang trong game">
              {shownHere.map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  why={whyNot(a)}
                  on={picked.has(a.id)}
                  onToggle={(on) => toggle(a.id, on)}
                  own={ownWaits[a.id] ?? null}
                  shared={{ move: moveSecs, rejoin: rejoinSecs }}
                  onOwn={(w) => setOwn(a.id, w)}
                />
              ))}
            </ul>
          )}
        </div>
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
        {/* The note is in the "?" of the list too: a phone keeps the buttons on one line at the bottom. */}
        <p className="mr-auto basis-[280px] grow text-11 text-fg-3 phone:hidden">
          {span?.open
            ? "Đang trong giờ: các nick đã chọn đi vào hang và thử vào trận ngay."
            : `Các nick đã chọn vào hang ngay, đợi trong hang tới ${from}, rồi thử vào trận tới ${until}.`}
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
 * its status, the clock that opens its own waits; under them, its own waits when open, what its Bạch Hổ run does
 * (tries, battles, damage) with Dừng, or Quay về chỗ cũ. */
function AccountRow({
  account: a,
  why,
  on,
  onToggle,
  own,
  shared,
  onOwn,
}: {
  account: Account;
  why: string | null;
  on: boolean;
  onToggle: (on: boolean) => void;
  /** Its own waits, null when it starts with the shared ones. */
  own: BachHoWaits | null;
  shared: BachHoWaits;
  onOwn: (w: BachHoWaits | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const waits = own ?? shared;
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
        <label className={cn("relative grid place-items-center", why || live ? "cursor-default" : "cursor-pointer")}>
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
            {own && (
              <span className="shrink-0 inline-flex items-center gap-1 text-11 text-accent" title="Thời gian chờ riêng: giữa các nước · vào trận lại">
                <Icon name="clock" size={11} />
                <span className="px">{waitsText(own)}</span>
              </span>
            )}
          </span>
          <span className={cn("truncate text-11", why ? "text-danger" : "text-fg-3")}>
            {why ?? (c ? `${c.mapName} · Khu ${c.zone}${c.currencies ? ` · ${num(c.currencies.xu)} Xu` : ""}` : "")}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <Pill status={a.status} text={a.statusText} />
          <Button
            small
            icon="clock"
            aria-label={`Thời gian chờ riêng của ${c?.name ?? a.label}`}
            title="Thời gian chờ riêng của nick này"
            aria-expanded={open}
            aria-controls={panel}
            onClick={() => setOpen(!open)}
          />
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
      {open && (
        <div id={panel} className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pl-[58px] text-12 text-fg-2">
          <span>{own ? "Riêng nick này:" : "Đang dùng số chung:"} chờ giữa các nước</span>
          <Stepper value={waits.move} min={0} max={WAIT_MAX} step={0.1} label={`số giây chờ giữa hai nước của ${c?.name ?? a.label}`} onChange={(v) => onOwn({ ...waits, move: v })} />
          <span>giây · vào trận lại</span>
          <Stepper value={waits.rejoin} min={0} max={WAIT_MAX} step={0.1} label={`số giây chờ vào trận lại của ${c?.name ?? a.label}`} onChange={(v) => onOwn({ ...waits, rejoin: v })} />
          <span>giây</span>
          {own && (
            <Button small icon="refresh" onClick={() => onOwn(null)}>
              Dùng số chung
            </Button>
          )}
          {running(a) && <span className="basis-full text-11 text-fg-3">Đang chạy: số mới dùng từ lần Bắt đầu sau.</span>}
        </div>
      )}
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
      {c?.bachHoResult && <Standing result={c.bachHoResult} />}
    </li>
  );
}

/** Where the account stands in Kết quả Bạch Hổ: tier, rank, damage, and a bar to its tier's threshold (the gift of the
 * day's run goes to every character over it, BH2). Nothing before it fought. */
function Standing({ result: r }: { result: BachHoResult }) {
  if (r.ownTier <= 0 || r.ownRank <= 0) return null;
  const tier = r.tiers.find((t) => t.tier === r.ownTier);
  const threshold = tier?.threshold ?? 0;
  const share = threshold > 0 ? Math.min(1, r.ownDamage / threshold) : 1;
  // A result of an earlier day's session (the app stayed on) says its day, not to pass for today's.
  const old = r.sessionAt > 0 && day(r.sessionAt) !== day(Date.now()) ? day(r.sessionAt) : null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(80px,160px)] items-center gap-x-3 pl-[58px] text-11" title="Kết quả Bạch Hổ của game (s2c/1275)">
      <span className="min-w-0 truncate text-fg-2">
        <Icon name="crown" size={11} className="inline mr-1 text-coin" />
        {old && <span className="text-fg-3">Phiên {old} · </span>}
        Bậc <b className="px text-fg">{r.ownTier}</b>
        {tier && ` (${levels(tier)})`} · hạng <b className="px text-fg">{r.ownRank}</b>
        {tier && tier.players > 0 && `/${num(tier.players)}`} · <b className="px text-coin">{num(r.ownDamage)}</b>
        {threshold > 0 && ` / ${num(threshold)}`}{" "}
        {r.reached ? <b className="text-good">đủ ngưỡng nhận quà</b> : <span className="text-danger">chưa đủ ngưỡng</span>}
      </span>
      <Bar value={share} fill={r.reached ? "var(--good)" : "var(--coin)"} thin label={`${Math.round(share * 100)}% ngưỡng`} />
    </div>
  );
}

/** The boss of the day's run, from the freshest Kết quả Bạch Hổ of the accounts (the boss is the same for all): its
 * state and HP, who finished it, and each tier (levels, threshold, players) with its ranking, the accounts' own rows
 * marked. The bot asks it after each battle and on the boss's clock hits; nothing before any account asked. */
function BossPanel({ accounts, now }: { accounts: Account[]; now: number }) {
  const results = accounts.map((a) => a.character?.bachHoResult).filter((r): r is BachHoResult => !!r);
  const r = results.reduce<BachHoResult | null>((best, x) => (!best || x.readAtMs > best.readAtMs ? x : best), null);
  const mine = new Set(accounts.map((a) => a.character?.name).filter(Boolean));
  // The tiers of the accounts (marked ★); open first the tier of the account whose result is shown, else another's.
  const ownTiers = new Set(results.map((x) => x.ownTier).filter((t) => t > 0));
  const ownTier = r && r.ownTier > 0 ? r.ownTier : [...ownTiers][0];
  const [picked, setPicked] = useState<number | null>(null);
  if (!r) {
    return (
      <p className="m-0 px-3 py-2 text-12 text-fg-3 bg-bg-2 border-2 border-line">
        Chưa có Kết quả Bạch Hổ: nick đang chạy hỏi server sau mỗi trận và mỗi đòn của boss (khoảng 30 s).
      </p>
    );
  }
  const pct = hpPercent(r);
  const tier = r.tiers.find((t) => t.tier === (picked ?? ownTier)) ?? r.tiers.find((t) => t.players > 0) ?? r.tiers[0];
  const live = r.state === 0;
  return (
    <section className="grid gap-2 px-3 py-2.5 bg-bg-2 border-2 border-line" aria-label="Boss Bạch Hổ">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
        <span className="flex flex-wrap items-baseline gap-x-2 min-w-0">
          <b className={cn("text-13", r.state === 1 ? "text-good" : live ? "text-danger" : "text-fg")}>{STATE[r.state] ?? "Chưa có phiên nào"}</b>
          {r.sessionAt > 0 && <span className="text-11 text-fg-3">phiên {clock(r.sessionAt)}</span>}
        </span>
        <span className="text-11 text-fg-3 whitespace-nowrap" title="Lần cuối bot đọc Kết quả Bạch Hổ">
          cập nhật {ago(r.readAtMs, now)} trước
        </span>
        <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <Bar value={pct / 100} fill="var(--hp)" label={`Máu boss ${pct.toFixed(1)}%`} />
          <b className="px text-13 text-fg whitespace-nowrap">{pct.toFixed(1)}%</b>
        </div>
        {r.killerId > 0 && (
          <span className="col-span-2 text-12 text-fg-2">
            Kết liễu: <b className="text-fg">{r.killer}</b> (bậc {r.killerTier}) · <b className="px text-coin">{num(r.killerDamage)}</b> sát thương
          </span>
        )}
      </div>
      {r.tiers.length > 0 && (
        <div className="grid gap-1.5">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Bậc">
            {r.tiers.map((t) => (
              <button
                key={t.tier}
                type="button"
                aria-pressed={t.tier === tier?.tier}
                className={cn(
                  "px-2 py-0.5 border-2 text-11 font-bold cursor-pointer",
                  t.tier === tier?.tier ? "border-coin text-ink bg-coin" : "border-line text-fg-2 bg-ink hover:text-fg",
                )}
                onClick={() => setPicked(t.tier)}
              >
                Bậc {t.tier}
                {ownTiers.has(t.tier) && " ★"}
              </button>
            ))}
          </div>
          {tier && (
            <>
              <span className="text-11 text-fg-3">
                {levels(tier)} · ngưỡng <b className="px text-fg">{num(tier.threshold)}</b> · <b className="px text-fg">{num(tier.players)}</b> người
              </span>
              {tier.rows.length === 0 ? (
                <span className="text-11 text-fg-3">Chưa ai gây sát thương ở bậc này.</span>
              ) : (
                <ol className="grid gap-0.5 m-0 p-0 list-none max-h-[150px] overflow-y-auto scroll">
                  {tier.rows.map((row) => (
                    <li
                      key={row.rank}
                      className={cn(
                        "grid grid-cols-[24px_minmax(0,1fr)_auto_auto] items-center gap-2 px-1.5 py-0.5 text-12",
                        mine.has(row.name) ? "bg-[color-mix(in_srgb,var(--good)_18%,var(--bg-2))]" : row.rank <= 5 ? "bg-ink" : "",
                      )}
                    >
                      <b className={cn("px text-right", row.rank <= 3 ? "text-coin" : "text-fg-3")}>{row.rank}</b>
                      <span className="truncate text-fg">{row.name}</span>
                      <span className="text-11 text-fg-3">Lv {row.level}</span>
                      <b className="px text-right text-fg-2">{num(row.damage)}</b>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

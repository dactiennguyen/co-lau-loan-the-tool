import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { api } from "@/api";
import { cn } from "@/utils/cn";
import { Badge } from "@/components/Badge";
import { Bar } from "@/components/Bar";
import { Button } from "@/components/Button";
import { DIALOG, Dialog } from "@/components/Dialog";
import { FilterChip } from "@/components/FilterChip";
import { Icon, type IconName } from "@/components/Icon";
import { TabPanel, Tabs } from "@/components/Tabs";
import { levelProgress, num, pct } from "@/utils/format";
import { recalled, remember } from "@/utils/remember";
import type {
  Account,
  BattleResult,
  BattleSource,
  BattleStats,
  GroupTotals,
  LevelTotals,
  Picked,
  StoredBattle,
  Totals,
} from "@/api/types";
import { PickedIcon, pickedLabel } from "./LootRow";

type Range = "today" | "week" | "month" | "all";
const RANGES: { key: Range; label: string }[] = [
  { key: "today", label: "Hôm nay" },
  { key: "week", label: "7 ngày" },
  { key: "month", label: "30 ngày" },
  { key: "all", label: "Tất cả" },
];
const SOURCES: { key: BattleSource | null; label: string }[] = [
  { key: null, label: "Mọi trận" },
  { key: "fight", label: "Đánh quái" },
  { key: "quest", label: "Nhiệm vụ" },
];
const SOURCE_NAME: Record<BattleSource, string> = { fight: "Đánh quái", quest: "Nhiệm vụ", other: "Khác (trận đánh nốt)" };
const RESULT: Record<BattleResult, { label: string; tone: string }> = {
  won: { label: "Thắng", tone: "var(--s-online)" },
  lost: { label: "Thua", tone: "var(--danger)" },
  left: { label: "Rời trận", tone: "var(--fg-3)" },
};

type Sub = "overview" | "levels" | "where" | "loot" | "battles";
const SUBS: { key: Sub; label: string; icon: IconName }[] = [
  { key: "overview", label: "Tổng quan", icon: "chart" },
  { key: "levels", label: "Lên cấp", icon: "star" },
  { key: "where", label: "Quái & bản đồ", icon: "pin" },
  { key: "loot", label: "Đồ nhặt", icon: "gem" },
  { key: "battles", label: "Trận", icon: "sword" },
];
const SUB_KEY = "stats.sub";

type Measure = "exp" | "coin" | "battles";
const MEASURES: { key: Measure; label: string; tone: string }[] = [
  { key: "exp", label: "EXP", tone: "var(--exp)" },
  { key: "coin", label: "Xu", tone: "var(--coin)" },
  { key: "battles", label: "Trận", tone: "var(--fg-2)" },
];

const PAGE = 30;
const HOUR = 3_600_000;
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/* The classes of the parts. The body of the modal is the container of the queries (@container): at most 860 px wide, 3
   tiles a row and the closest win over the losses; at most 560 px, 2 tiles and a battle on two lines. Written as
   [@container(max-width:…)] for the same edge as max-width (@max-[860px] is width < 860px). */
/** Inside a part, a column of blocks that keep their height. */
const STACK = "flex flex-col gap-2.5 *:flex-none";
const H = "mt-1 mb-0 text-11 font-extrabold tracking-[0.06em] uppercase text-fg-2";
const NONE = "text-12 text-fg-3";
const WRAP = "overflow-x-auto";
const TABLE = "w-full border-collapse text-12";
/** A cell: figures on the right. */
const TD = "px-2 py-[5px] text-right whitespace-nowrap";
const TD_PX = `${TD} px`;
/** A column's name; the first, of the rows' names, on the left. */
const TH_COL =
  "px-2 py-[5px] text-right first:text-left whitespace-nowrap text-10 font-extrabold tracking-[0.04em] uppercase text-fg-3 border-b border-b-line";
/** A row's name, a line under it in <small> (TH_SUB). */
const TH_ROW = "grid gap-px px-2 py-[5px] text-left whitespace-nowrap font-bold text-fg";
const TH_SUB = "text-[10.5px] font-medium text-fg-3";
/** A row of a table's body, every other one on a dark plate. */
const TR = "odd:bg-ink";
/** A name with a tag (ĐANG, BOSS) or an icon. */
const WITH_TAG = "inline-flex items-center gap-1.5";
/** Tỉ lệ thắng: the figure, then a bar. */
const RATE = "inline-grid grid-cols-[40px_60px] items-center gap-1.5";
/** The battles and the losses, a row each on a dark plate. */
const LIST = "grid gap-0.5";
const ROW_TIME = "text-10 text-fg-3 px";
const MOB = "truncate font-bold text-fg";
const MOB_LEVEL = "text-10 font-medium text-fg-3";
/** Where and how a battle went; under the mob on a narrow body. */
const FACTS = "truncate text-fg-2 [@container(max-width:560px)]:col-[2/-1]";

/** The start of the range in ms since 1970, whole days with today one of them: local midnight of today for Hôm nay,
 * of 6 days ago for 7 ngày, of 29 days ago for 30 ngày; null for all. The chart then has a column per day of it. */
function since(range: Range) {
  if (range === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (range === "week" ? 6 : range === "month" ? 29 : 0));
  return d.getTime();
}

/** The first page asked again, laid over the rows shown: the newer battles on top, the rows it holds replaced (their
 * picks may have grown), the pages loaded with Xem thêm kept. */
function merge(old: StoredBattle[], page: StoredBattle[]) {
  const top = old[0]?.id ?? -Infinity;
  const byId = new Map(page.map((b) => [b.id, b]));
  return [...page.filter((b) => b.id > top), ...old.map((b) => byId.get(b.id) ?? b)];
}

/** "45 giây", "12 phút", "3 giờ 05 phút". */
function span(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} giây`;
  if (s < 3600) return `${Math.floor(s / 60)} phút`;
  if (s < 86_400) return `${Math.floor(s / 3600)} giờ ${String(Math.floor(s / 60) % 60).padStart(2, "0")} phút`;
  return `${Math.floor(s / 86_400)} ngày ${Math.floor(s / 3600) % 24} giờ`;
}

const rate = (t: Totals) => (t.battles ? t.won / t.battles : 0);
/** A sum over a time as so much an hour; a dash without the time. */
const perHour = (value: number, ms: number) => (ms > 0 ? num(Math.round((value * HOUR) / ms)) : "—");
const each = (value: number, n: number) => (n > 0 ? num(Math.round(value / n)) : "—");
const twoPlaces = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
/** 130.27 → "130", 0.17 → "0,17": an average of items, whole once it is large. */
const avg = (v: number) => (v >= 10 ? num(Math.round(v)) : twoPlaces.format(v));
/** Items in all, of a fight job's or quest run's picks: it grows with each pickup. */
const count = (picked: Picked[] | undefined) => (picked ?? []).reduce((n, p) => n + p.quantity, 0);
const two = (n: number) => String(n).padStart(2, "0");
/** "31/10 13:15", local time. */
function when(at: number) {
  const d = new Date(at);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
/** "2026-11-01", the local day as cllt.db groups the hours (strftime of store.rs). */
const dayKey = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

const EMPTY: Totals = { battles: 0, won: 0, lost: 0, left: 0, exp: 0, coin: 0, damage: 0, turns: 0, ms: 0 };
function plus(a: Totals, b: Totals): Totals {
  return {
    battles: a.battles + b.battles,
    won: a.won + b.won,
    lost: a.lost + b.lost,
    left: a.left + b.left,
    exp: a.exp + b.exp,
    coin: a.coin + b.coin,
    damage: a.damage + b.damage,
    turns: a.turns + b.turns,
    ms: a.ms + b.ms,
  };
}

/** A column of the chart: an hour of today, or a day. */
interface Slot {
  key: string;
  /** Under the column. */
  label: string;
  /** In the readout. */
  long: string;
  totals: Totals;
}

/** Hôm nay: each hour up to now. Else each day from the range's first (the first battle for Tất cả) to today, the days
 * without a battle included, so the gaps show. */
function slots(hours: GroupTotals[], range: Range): Slot[] {
  const byKey = new Map<string, Totals>();
  const now = new Date();
  if (range === "today") {
    hours.forEach((h) => byKey.set(h.key, h));
    const today = dayKey(now);
    return Array.from({ length: now.getHours() + 1 }, (_, h) => ({
      key: `${today} ${two(h)}`,
      label: `${h}h`,
      long: `${two(h)}:00–${two(h)}:59 hôm nay`,
      totals: byKey.get(`${today} ${two(h)}`) ?? EMPTY,
    }));
  }
  hours.forEach((h) => {
    const day = h.key.slice(0, 10);
    byKey.set(day, plus(byKey.get(day) ?? EMPTY, h));
  });
  const from = since(range) ?? (hours[0] ? new Date(`${hours[0].key.slice(0, 10)}T00:00`).getTime() : now.getTime());
  const out: Slot[] = [];
  for (let d = new Date(from); d.setHours(0, 0, 0, 0) <= now.getTime(); d.setDate(d.getDate() + 1)) {
    const key = dayKey(d);
    out.push({
      key,
      label: `${two(d.getDate())}/${two(d.getMonth() + 1)}`,
      long: `${WEEKDAY[d.getDay()]} ${two(d.getDate())}/${two(d.getMonth() + 1)}${key === dayKey(now) ? " (hôm nay)" : ""}`,
      totals: byKey.get(key) ?? EMPTY,
    });
  }
  return out;
}

/**
 * Thống kê, a modal opened from the header of the account (HeroCard): the battles of the account (by username, from
 * cllt.db) of a range and a source. Tổng quan: ten tiles (battles and win rate, EXP and Xu, the time in battles and the
 * bot's run, the rates an hour, the streaks, the HP a win costs), a chart by day (by hour for Hôm nay), the closest win
 * and the last losses. Lên cấp: when each level came, how long it took, and how long the next should take. Quái & bản
 * đồ: by source, map and mob. Đồ nhặt: the items Tự nhặt đồ picked up. Trận: the battles themselves, newest first.
 * Asked again when a battle of the account ends, and when an item is picked up after it.
 */
export function StatsModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const c = account.character;
  const [range, setRange] = useState<Range>("week");
  const [source, setSource] = useState<BattleSource | null>(null);
  const [sub, setSub] = useState<Sub>(() => SUBS.find((s) => s.key === recalled(SUB_KEY))?.key ?? "overview");
  const pick = (s: Sub) => {
    setSub(s);
    remember(SUB_KEY, s);
  };
  const tabs = useId();
  const [stats, setStats] = useState<BattleStats | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<StoredBattle[]>([]);
  const [end, setEnd] = useState(false);
  const [loading, setLoading] = useState(false);
  // The end of a battle, of any source: the battle of the account goes away (not its start: cllt.db has nothing new).
  const fighting = !!c?.battle;
  const [ends, setEnds] = useState(0);
  const was = useRef(fighting);
  useEffect(() => {
    if (was.current && !fighting) setEnds((n) => n + 1);
    was.current = fighting;
  }, [fighting]);
  // A battle that ends changes these, and an item picked up after it: the numbers are asked again then, a moment
  // later so the changes of one end come as one.
  const ended = `${c?.job?.fights ?? 0}-${c?.questRun?.fights ?? 0}-${ends}-${count(c?.job?.picked)}-${count(c?.questRun?.picked)}`;
  const filter = `${account.id}|${range}|${source}`;
  // The filter of the rows shown; bumped `era` when another one is asked, so a Xem thêm of the old one is dropped.
  const shown = useRef<string | null>(null);
  const era = useRef(0);
  // Bumped by each first page asked, so an answer to an earlier one is dropped.
  const asked = useRef(0);

  useEffect(() => {
    const fresh = shown.current !== filter;
    if (fresh) era.current++;
    const load = () => {
      const at = ++asked.current;
      const from = since(range);
      Promise.all([api.battleStats(account.id, from, source), api.battleHistory(account.id, from, source, null, PAGE)])
        .then(([s, h]) => {
          if (at !== asked.current) return;
          setStats(s);
          setError(null);
          if (fresh) {
            setHistory(h);
            setEnd(h.length < PAGE);
          } else setHistory((old) => merge(old, h));
          shown.current = filter;
        })
        .catch((err) => {
          if (at === asked.current) setError(String(err?.message ?? err));
        });
    };
    if (fresh) return load();
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [filter, ended]);
  useEffect(
    () => () => {
      asked.current++;
      era.current++;
    },
    [],
  );

  const more = async () => {
    const last = history[history.length - 1];
    if (!last || loading) return;
    const at = era.current;
    setLoading(true);
    try {
      const h = await api.battleHistory(account.id, since(range), source, last.id, PAGE);
      if (at !== era.current) return;
      setHistory((old) => [...old, ...h.filter((b) => b.id < (old[old.length - 1]?.id ?? Infinity))]);
      setEnd(h.length < PAGE);
    } catch (err) {
      if (at === era.current) setError(String((err as Error)?.message ?? err));
    } finally {
      setLoading(false);
    }
  };

  const t = stats;
  return (
    <Dialog
      title="Thống kê"
      subtitle={`${c?.name ?? account.label} · theo nick ${account.username}, từ lịch sử trận lưu trong cllt.db (90 ngày)`}
      className="w-[min(1120px,95vw)] h-[min(860px,94vh)] max-w-none max-h-none"
      formClassName="h-full box-border grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] gap-2.5 px-5 py-4"
      onClose={onClose}
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="flex flex-wrap justify-between gap-y-1.5 gap-x-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Khoảng thời gian">
          {RANGES.map((r) => (
            <FilterChip key={r.key} on={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Nguồn trận">
          {SOURCES.map((s) => (
            <FilterChip key={s.label} on={source === s.key} tone="var(--exp)" onClick={() => setSource(s.key)}>
              {s.label}
            </FilterChip>
          ))}
        </div>
      </div>
      <Tabs<Sub> id={tabs} label="Phần thống kê" value={sub} onChange={pick} tabs={SUBS} />
      {/* The filters and the sub-tabs stay, the body scrolls; the modal's height is fixed, so the sub-tabs do not make it
          jump. */}
      <div className="min-h-0 overflow-y-auto pr-1.5 @container scroll">
        <TabPanel id={tabs} value={sub} className="block">
          {error && <p className="mt-0 mb-2.5 text-12 text-danger">Không đọc được lịch sử trận: {error}</p>}
          {t === undefined ? (
            !error && <p className={NONE}>Đang tải…</p>
          ) : t === null ? (
            <p className={NONE}>Chưa có cơ sở dữ liệu cllt.db nên chưa có lịch sử trận.</p>
          ) : t.battles === 0 && !(sub === "levels" && t.levels.length > 0) ? (
            <p className={NONE}>Chưa có trận nào trong khoảng này.</p>
          ) : sub === "overview" ? (
            <Overview t={t} range={range} />
          ) : sub === "levels" ? (
            <Levels t={t} account={account} range={range} source={source} />
          ) : sub === "where" ? (
            <Where t={t} filtered={source != null} />
          ) : sub === "loot" ? (
            <Loot t={t} />
          ) : (
            <History history={history} end={end} loading={loading} onMore={more} />
          )}
        </TabPanel>
      </div>
      <footer className={DIALOG.footer}>
        <Button onClick={onClose}>Đóng</Button>
      </footer>
    </Dialog>
  );
}

/** "đang thắng 3 trận liền", from the run at the end. */
function streakNow({ last, lastResult }: BattleStats["streak"]) {
  if (!lastResult || last === 0) return "";
  if (lastResult === "won") return `đang thắng ${last} trận liền`;
  if (lastResult === "lost") return `đang thua ${last} trận liền`;
  return "trận cuối rời trận";
}

/** Tổng quan: the tiles, the chart, the closest win and the last losses. */
function Overview({ t, range }: { t: BattleStats; range: Range }) {
  return (
    <div className={STACK}>
      <dl className="grid grid-cols-5 gap-1.5 m-0 [@container(560px_<_width_<=_860px)]:grid-cols-3 [@container(max-width:560px)]:grid-cols-2">
        <Tile label="Trận" value={num(t.battles)}>
          <b className="text-s-online">{t.won} thắng</b> · <b className="text-danger">{t.lost} thua</b>
          {t.left > 0 && <> · {t.left} rời</>}
        </Tile>
        <Tile label="Tỉ lệ thắng" value={pct(rate(t))}>
          <Bar value={rate(t)} fill="var(--s-online)" thin label="Tỉ lệ thắng" />
        </Tile>
        <Tile label="EXP" value={`+${num(t.exp)}`}>
          {each(t.exp, t.battles)} mỗi trận
        </Tile>
        <Tile label="Xu" value={`+${num(t.coin)}`}>
          {each(t.coin, t.battles)} mỗi trận
        </Tile>
        <Tile label="Chuỗi thắng dài nhất" value={`${num(t.streak.best)} trận`}>
          {streakNow(t.streak) || "—"}
        </Tile>
        <Tile label="Thời gian đánh" value={span(t.ms)} text>
          {span(t.ms / t.battles)} mỗi trận
        </Tile>
        <Tile label="EXP mỗi giờ đánh" value={perHour(t.exp, t.ms)}>
          tính trên thời gian trong trận
        </Tile>
        <Tile label="Thời gian bot chạy" value={span(t.runMs)} text>
          trận và lúc chờ, đi giữa hai trận (dưới 10 phút)
        </Tile>
        <Tile label="Mỗi giờ bot chạy" value={`${perHour(t.exp, t.runMs)} EXP`}>
          {perHour(t.coin, t.runMs)} xu · {t.runMs > 0 ? avg((t.battles * HOUR) / t.runMs) : "—"} trận
        </Tile>
        <Tile label="Máu mất mỗi trận thắng" value={t.won > 0 ? num(Math.round(t.wonHpLost / t.won)) : "—"}>
          {t.turns > 0 ? `${num(Math.round(t.damage / t.turns))} sát thương mỗi lượt` : "—"}
        </Tile>
      </dl>

      <DayChart hours={t.hours} range={range} />

      {/* The closest win beside the last losses. */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 [@container(max-width:860px)]:grid-cols-[minmax(0,1fr)]">
        <section className="grid gap-1.5 [align-content:start] min-w-0">
          <h3 className={H}>Thắng sát nút nhất</h3>
          {t.closest ? (
            <p className="grid gap-[3px] m-0 px-2.5 py-2 bg-ink text-12 text-fg-2">
              <b className="text-fg">
                {t.closest.mobName}
                {t.closest.mobLevel > 0 && <small className="text-11 font-medium text-fg-3"> cấp {t.closest.mobLevel}</small>}
              </b>
              <span>
                còn <b className="text-danger px">{num(t.closest.hpAfter)}</b> / {num(t.closest.maxHp)} máu (
                {pct(t.closest.hpAfter / Math.max(1, t.closest.maxHp))}) sau {t.closest.turns} lượt
              </span>
              <small className="text-11 text-fg-3">
                {when(t.closest.endedAt)} · {t.closest.mapName} · khu {t.closest.zone}
              </small>
            </p>
          ) : (
            <p className={NONE}>Chưa thắng trận nào trong khoảng này.</p>
          )}
        </section>
        <section className="grid gap-1.5 [align-content:start] min-w-0">
          <h3 className={H}>Thua gần đây</h3>
          {t.losses.length === 0 ? (
            <p className={NONE}>Không thua trận nào trong khoảng này.</p>
          ) : (
            <ol className={LIST}>
              {t.losses.map((b) => (
                <li
                  key={b.id}
                  className="grid grid-cols-[82px_minmax(0,1fr)_minmax(0,1.6fr)] items-baseline gap-2.5 px-2 py-1 bg-ink text-12"
                >
                  <time className={ROW_TIME}>{when(b.endedAt)}</time>
                  <span className={MOB}>
                    {b.mobName}
                    {b.mobLevel > 0 && <small className={MOB_LEVEL}> cấp {b.mobLevel}</small>}
                  </span>
                  <span className={FACTS}>
                    {b.turns} lượt · gây {num(b.damage)} sát thương · {b.mapName}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, text, children }: { label: string; value: string; text?: boolean; children: ReactNode }) {
  return (
    <div className="grid gap-[3px] [align-content:start] min-w-0 px-2.5 py-2 bg-ink">
      <dt className="text-10 font-extrabold tracking-[0.06em] uppercase text-fg-3">{label}</dt>
      {/* A figure in the pixel face; words (a time) smaller, in the UI face. */}
      <dd className={cn("text-18 font-extrabold text-fg whitespace-nowrap", text ? "text-14 leading-[1.5]" : "px")}>{value}</dd>
      <small className="text-11 leading-[1.4] text-fg-2">{children}</small>
    </div>
  );
}

/**
 * EXP, Xu or battles by day (by hour for Hôm nay), one column each, the empty ones too. A column under the pointer or
 * the focus fills the readout over the chart; with none, the readout shows the last column. One series, so no legend:
 * the chips name it.
 */
function DayChart({ hours, range }: { hours: GroupTotals[]; range: Range }) {
  const [measure, setMeasure] = useState<Measure>("exp");
  const [hover, setHover] = useState<number | null>(null);
  const list = slots(hours, range);
  const value = (s: Slot) => s.totals[measure];
  const top = Math.max(1, ...list.map(value));
  const tone = MEASURES.find((m) => m.key === measure)!.tone;
  const shown = list[hover ?? list.length - 1];
  // A label under every column while they fit, else under one in `step`, and always the last.
  const step = Math.ceil(list.length / 12);
  const unit = measure === "exp" ? "EXP" : measure === "coin" ? "xu" : "trận";
  return (
    <section className="grid gap-1.5 px-3 py-2.5 bg-ink">
      <div className="flex flex-wrap items-center justify-between gap-y-1.5 gap-x-2.5">
        <h3 className={cn(H, "m-0")}>{range === "today" ? "Theo giờ, hôm nay" : "Theo ngày"}</h3>
        <div className="flex gap-1" role="group" aria-label="Số liệu của biểu đồ">
          {MEASURES.map((m) => (
            <FilterChip key={m.key} on={measure === m.key} tone={m.tone} onClick={() => setMeasure(m.key)}>
              {m.label}
            </FilterChip>
          ))}
        </div>
      </div>
      <p className="flex flex-wrap gap-y-0.5 gap-x-2 min-h-[18px] m-0 text-12 text-fg-2">
        {shown && (
          <>
            <b className="text-fg">{shown.long}</b>
            {shown.totals.battles === 0 ? (
              <span>không có trận</span>
            ) : (
              <span>
                {shown.totals.battles} trận · {shown.totals.won} thắng ({pct(rate(shown.totals))}) ·{" "}
                <b className="text-exp">+{num(shown.totals.exp)} EXP</b> · <b className="text-coin">+{num(shown.totals.coin)} xu</b> ·{" "}
                {span(shown.totals.ms)} trong trận
              </span>
            )}
          </>
        )}
      </p>
      {/* Columns at most 24 px, 2 px apart, from one baseline, in the colour of the measure (--dchart); a hairline at the
          top value, which the figure over it names. */}
      <div className="relative grid gap-1 pt-4" style={{ "--dchart": tone } as CSSProperties}>
        <span className="absolute top-0 left-0 text-10 text-fg-3 px" aria-hidden="true">
          {num(top)} {unit}
        </span>
        <div
          className="flex items-end gap-0.5 h-[140px] border-t border-t-line border-b border-b-line-strong"
          onMouseLeave={() => setHover(null)}
        >
          {list.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={cn(
                "flex flex-[1_1_0] items-end justify-center min-w-0 h-full p-0 bg-transparent [border:0] cursor-default hover:bg-[rgb(255_255_255/0.04)] focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
                i === hover && "bg-[rgb(255_255_255/0.04)]",
              )}
              aria-label={`${s.long}: ${num(value(s))} ${unit}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <span
                className={cn("w-full max-w-6 min-h-0 bg-(--dchart) rounded-t-[2px]", i === hover && "brightness-125")}
                style={{ height: `${(value(s) / top) * 100}%` }}
              />
            </button>
          ))}
        </div>
        <div className="flex gap-0.5" aria-hidden="true">
          {list.map((s, i) => (
            <span key={s.key} className="flex-[1_1_0] min-w-0 overflow-visible text-10 text-center whitespace-nowrap text-fg-3">
              {i % step === 0 || i === list.length - 1 ? s.label : ""}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Lên cấp: how long the next level should take, then each level, the highest first. */
function Levels({ t, account, range, source }: { t: BattleStats; account: Account; range: Range; source: BattleSource | null }) {
  const c = account.character;
  const level = c && levelProgress(c);
  const runRate = t.runMs > 0 ? (t.exp * HOUR) / t.runMs : 0;
  const now = Date.now();
  const rows = [...t.levels].reverse();
  // The rate is of the battles of the filter, the source too: said with it.
  const basis = RANGES.find((r) => r.key === range)!.label.toLowerCase() + (source ? `, chỉ ${SOURCE_NAME[source]}` : "");
  return (
    <div className={STACK}>
      {/* How long the next level should take. */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-ink border-l-3 border-l-exp text-[12.5px] leading-[1.5] text-fg-2">
        <Icon name="star" size={16} className="flex-none text-exp" />
        {!c || !level ? (
          <span>Đăng nhập để biết còn bao nhiêu EXP lên cấp kế.</span>
        ) : runRate <= 0 ? (
          <span>
            Cấp {c.level}: còn <b className="text-fg px">{num(level.left)}</b> EXP lên cấp {c.level + 1}. Chưa có EXP trong khoảng này để
            ước tính thời gian.
          </span>
        ) : (
          <span>
            Cấp {c.level}: còn <b className="text-fg px">{num(level.left)}</b> EXP lên cấp {c.level + 1}, khoảng{" "}
            <b className="text-fg">{span((level.left / runRate) * HOUR)}</b> bot chạy nữa, theo {num(Math.round(runRate))} EXP mỗi giờ chạy ({basis}).
          </span>
        )}
      </div>
      <div className={WRAP}>
        <table className={TABLE}>
          <thead>
            <tr>
              <th scope="col" className={TH_COL}>Cấp</th>
              <th scope="col" className={TH_COL}>Lên cấp lúc</th>
              <th scope="col" className={TH_COL}>Ở cấp này</th>
              <th scope="col" className={TH_COL}>Trận</th>
              <th scope="col" className={TH_COL}>Tỉ lệ thắng</th>
              <th scope="col" className={TH_COL}>EXP</th>
              <th scope="col" className={TH_COL}>EXP mỗi giờ đánh</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.level} className={TR}>
                <th scope="row" className={TH_ROW}>
                  <span className={WITH_TAG}>
                    Cấp {l.level}
                    {c?.level === l.level && <Badge tone="var(--exp)">ĐANG</Badge>}
                  </span>
                </th>
                <td className={TD}>{l.reachedAt != null ? when(l.reachedAt) : <small className="text-11 text-fg-3">trước lịch sử</small>}</td>
                <td className={TD}>{stay(l, t.levels, c?.level, now)}</td>
                <td className={TD_PX}>{num(l.battles)}</td>
                <td className={TD_PX}>{pct(rate(l))}</td>
                <td className={TD_PX}>+{num(l.exp)}</td>
                <td className={TD_PX}>{perHour(l.exp, l.ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-11 leading-[1.5] text-fg-3">
        Bảng theo mọi trận, kể cả khi lọc Đánh quái hay Nhiệm vụ: cấp là của nhân vật. Lên cấp lúc là lúc xong trận cuối cùng ở
        cấp dưới, tức trận mang EXP lên cấp (lên cấp nhờ thưởng nhiệm vụ thì là lúc đó hoặc muộn hơn); cấp đã có trước trận cũ
        nhất còn lưu thì không biết lúc lên.
      </p>
    </div>
  );
}

/** How long the character stayed at a level: to the next level reached, or to now for the level it is at. */
function stay(l: LevelTotals, all: LevelTotals[], current: number | undefined, now: number) {
  if (l.reachedAt == null) return "—";
  const next = all.find((x) => x.level > l.level && x.reachedAt != null);
  if (next) return span(next.reachedAt! - l.reachedAt);
  return current === l.level ? `${span(now - l.reachedAt)} (đang)` : "—";
}

/** One row of the tables by source and by map. */
function GroupRow({ name, sub, t }: { name: string; sub?: string; t: Totals }) {
  return (
    <tr className={TR}>
      <th scope="row" className={TH_ROW}>
        {name}
        {sub && <small className={TH_SUB}>{sub}</small>}
      </th>
      <td className={TD_PX}>{num(t.battles)}</td>
      <td className={TD}>
        <span className={RATE}>
          <span className="px">{pct(rate(t))}</span>
          <Bar value={rate(t)} fill="var(--s-online)" thin label={`Tỉ lệ thắng ${name}`} />
        </span>
      </td>
      <td className={TD_PX}>{each(t.exp, t.battles)}</td>
      <td className={TD_PX}>{each(t.coin, t.battles)}</td>
      <td className={TD}>{t.battles > 0 ? span(t.ms / t.battles) : "—"}</td>
      <td className={TD_PX}>{perHour(t.exp, t.ms)}</td>
    </tr>
  );
}

function GroupHead({ first }: { first: string }) {
  return (
    <thead>
      <tr>
        <th scope="col" className={TH_COL}>{first}</th>
        <th scope="col" className={TH_COL}>Trận</th>
        <th scope="col" className={TH_COL}>Tỉ lệ thắng</th>
        <th scope="col" className={TH_COL}>EXP/trận</th>
        <th scope="col" className={TH_COL}>Xu/trận</th>
        <th scope="col" className={TH_COL}>Thời gian/trận</th>
        <th scope="col" className={TH_COL}>EXP mỗi giờ đánh</th>
      </tr>
    </thead>
  );
}

/** Quái & bản đồ: by source (Đánh quái against Nhiệm vụ), by map, by mob. */
function Where({ t, filtered }: { t: BattleStats; filtered: boolean }) {
  return (
    <div className={STACK}>
      {!filtered && (
        <>
          <h3 className={H}>Theo nguồn</h3>
          <div className={WRAP}>
            <table className={TABLE}>
              <GroupHead first="Nguồn" />
              <tbody>
                {t.sources.map((s) => (
                  <GroupRow key={s.source} name={SOURCE_NAME[s.source]} t={s} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <h3 className={H}>Theo bản đồ</h3>
      <div className={WRAP}>
        <table className={TABLE}>
          <GroupHead first="Bản đồ" />
          <tbody>
            {t.maps.map((m) => (
              <GroupRow key={m.key} name={m.key} t={m} />
            ))}
          </tbody>
        </table>
      </div>
      <h3 className={H}>Theo quái</h3>
      <div className={WRAP}>
        <table className={TABLE}>
          <thead>
            <tr>
              <th scope="col" className={TH_COL}>Quái</th>
              <th scope="col" className={TH_COL}>Trận</th>
              <th scope="col" className={TH_COL}>Thắng</th>
              <th scope="col" className={TH_COL}>Tỉ lệ</th>
              <th scope="col" className={TH_COL}>Lượt</th>
              <th scope="col" className={TH_COL}>Thời gian</th>
              <th scope="col" className={TH_COL}>EXP/trận</th>
            </tr>
          </thead>
          <tbody>
            {t.mobs.map((m) => (
              <tr key={`${m.mobName}-${m.mobLevel}-${m.mapName}`} className={TR}>
                <th scope="row" className={TH_ROW}>
                  <span className={WITH_TAG}>
                    {m.mobName}
                    {m.boss && <Badge tone="var(--accent)">BOSS</Badge>}
                  </span>
                  <small className={TH_SUB}>
                    {m.mobLevel > 0 && `cấp ${m.mobLevel} · `}
                    {m.mapName}
                  </small>
                </th>
                <td className={TD_PX}>{m.battles}</td>
                <td className={TD_PX}>{m.won}</td>
                <td className={TD}>
                  <span className={RATE}>
                    <span className="px">{pct(rate(m))}</span>
                    <Bar value={rate(m)} fill="var(--s-online)" thin label={`Tỉ lệ thắng ${m.mobName}`} />
                  </span>
                </td>
                <td className={TD_PX}>{Math.round(m.turns / m.battles)}</td>
                <td className={TD}>{span(m.ms / m.battles)}</td>
                <td className={TD_PX}>{num(Math.round(m.exp / m.battles))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Đồ nhặt: each item Tự nhặt đồ picked up after these battles, most times first. */
function Loot({ t }: { t: BattleStats }) {
  if (t.picked.length === 0)
    return <p className={NONE}>Chưa nhặt được món nào sau các trận này (Tự nhặt đồ ở tab Cài đặt đánh).</p>;
  return (
    <div className={WRAP}>
      <table className={cn(TABLE, "max-w-[520px]")}>
        <thead>
          <tr>
            <th scope="col" className={TH_COL}>Món</th>
            <th scope="col" className={TH_COL}>Số lần nhặt</th>
            <th scope="col" className={TH_COL}>Tổng số</th>
            <th scope="col" className={TH_COL}>Mỗi trận thắng</th>
          </tr>
        </thead>
        <tbody>
          {t.picked.map((p) => (
            <tr key={p.itemId} className={TR}>
              <th scope="row" className={TH_ROW}>
                <span className={WITH_TAG}>
                  <PickedIcon icon={p.icon} />
                  {p.name}
                </span>
              </th>
              <td className={TD_PX}>{num(p.times)}</td>
              <td className={TD_PX}>{num(p.quantity)}</td>
              <td className={TD_PX}>{t.won > 0 ? avg(p.quantity / t.won) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Trận: the battles, newest first, with what each brought; Xem thêm asks for the next page. */
function History({ history, end, loading, onMore }: { history: StoredBattle[]; end: boolean; loading: boolean; onMore: () => void }) {
  return (
    <div className={STACK}>
      {/* The battles, a row each; the modal's body scrolls. */}
      <ol className={LIST}>
        {history.map((b) => (
          <li
            key={b.id}
            className="grid grid-cols-[82px_minmax(0,1.2fr)_minmax(0,1fr)_64px_minmax(0,1.6fr)] items-baseline gap-2.5 px-2 py-1 bg-ink text-12 [@container(max-width:560px)]:grid-cols-[74px_minmax(0,1fr)_56px]"
          >
            <time className={ROW_TIME}>{when(b.endedAt)}</time>
            <span className={MOB}>
              {b.mobName}
              {b.mobLevel > 0 && <small className={MOB_LEVEL}> cấp {b.mobLevel}</small>}
            </span>
            <span className={FACTS}>
              {b.mapName} · khu {b.zone}
            </span>
            <b className="text-[11.5px]" style={{ color: RESULT[b.result].tone }}>
              {RESULT[b.result].label}
            </b>
            <span className={FACTS}>
              {b.turns} lượt · {span(b.endedAt - b.startedAt)} · +{num(b.exp)} EXP · +{num(b.coin)} xu
            </span>
            {/* What the battle brought, on a line of its own under the rest. */}
            {b.picked.length > 0 && (
              <span className="col-[2/-1] flex flex-wrap items-center gap-y-0.5 gap-x-1 text-11 text-coin">
                Nhặt:{" "}
                {b.picked.map((p, i) => (
                  <span key={p.itemId} className="inline-flex items-center gap-[3px]">
                    {i > 0 && ", "}
                    <PickedIcon icon={p.icon} />
                    {pickedLabel(p)}
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ol>
      {!end && (
        <button
          type="button"
          className="self-center px-3.5 py-1 bg-transparent border border-dashed border-line font-ui font-semibold text-11 leading-[1.4] text-fg-2 cursor-pointer enabled:hover:border-exp enabled:hover:text-fg disabled:cursor-default disabled:opacity-60"
          disabled={loading}
          onClick={onMore}
        >
          {loading ? "Đang tải…" : "Xem thêm"}
        </button>
      )}
    </div>
  );
}

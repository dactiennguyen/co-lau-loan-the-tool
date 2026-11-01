import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { api } from "../api";
import { Badge } from "../components/Badge";
import { Bar } from "../components/Bar";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { FilterChip } from "../components/FilterChip";
import { Icon, type IconName } from "../components/Icon";
import { TabPanel, Tabs } from "../components/Tabs";
import { levelProgress, num, pct } from "../format";
import { recalled, remember } from "../remember";
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
} from "../types";
import { PickedIcon, pickedLabel } from "./LootRow";
import "./StatsModal.css";

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
      className="statsmodal"
      onClose={onClose}
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="bstats__filters">
        <div role="group" aria-label="Khoảng thời gian">
          {RANGES.map((r) => (
            <FilterChip key={r.key} on={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
            </FilterChip>
          ))}
        </div>
        <div role="group" aria-label="Nguồn trận">
          {SOURCES.map((s) => (
            <FilterChip key={s.label} on={source === s.key} tone="var(--exp)" onClick={() => setSource(s.key)}>
              {s.label}
            </FilterChip>
          ))}
        </div>
      </div>
      <Tabs<Sub> id={tabs} label="Phần thống kê" value={sub} onChange={pick} tabs={SUBS} />
      <div className="statsmodal__body scroll">
        <TabPanel id={tabs} value={sub}>
          {error && <p className="bstats__error">Không đọc được lịch sử trận: {error}</p>}
          {t === undefined ? (
            !error && <p className="bstats__none">Đang tải…</p>
          ) : t === null ? (
            <p className="bstats__none">Chưa có cơ sở dữ liệu cllt.db nên chưa có lịch sử trận.</p>
          ) : t.battles === 0 && !(sub === "levels" && t.levels.length > 0) ? (
            <p className="bstats__none">Chưa có trận nào trong khoảng này.</p>
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
      <footer>
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
    <div className="bstats__stack">
      <dl className="bstats__tiles">
        <Tile label="Trận" value={num(t.battles)}>
          <b className="win">{t.won} thắng</b> · <b className="loss">{t.lost} thua</b>
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

      <div className="bstats__pair">
        <section>
          <h3 className="bstats__h">Thắng sát nút nhất</h3>
          {t.closest ? (
            <p className="bstats__closest">
              <b>
                {t.closest.mobName}
                {t.closest.mobLevel > 0 && <small> cấp {t.closest.mobLevel}</small>}
              </b>
              <span>
                còn <b className="loss px">{num(t.closest.hpAfter)}</b> / {num(t.closest.maxHp)} máu (
                {pct(t.closest.hpAfter / Math.max(1, t.closest.maxHp))}) sau {t.closest.turns} lượt
              </span>
              <small>
                {when(t.closest.endedAt)} · {t.closest.mapName} · khu {t.closest.zone}
              </small>
            </p>
          ) : (
            <p className="bstats__none">Chưa thắng trận nào trong khoảng này.</p>
          )}
        </section>
        <section>
          <h3 className="bstats__h">Thua gần đây</h3>
          {t.losses.length === 0 ? (
            <p className="bstats__none">Không thua trận nào trong khoảng này.</p>
          ) : (
            <ol className="bstats__losses">
              {t.losses.map((b) => (
                <li key={b.id}>
                  <time className="px">{when(b.endedAt)}</time>
                  <span className="bstats__name">
                    {b.mobName}
                    {b.mobLevel > 0 && <small> cấp {b.mobLevel}</small>}
                  </span>
                  <span className="bstats__facts">
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
    <div>
      <dt>{label}</dt>
      <dd className={text ? undefined : "px"}>{value}</dd>
      <small>{children}</small>
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
    <section className="dchart">
      <div className="dchart__head">
        <h3 className="bstats__h">{range === "today" ? "Theo giờ, hôm nay" : "Theo ngày"}</h3>
        <div role="group" aria-label="Số liệu của biểu đồ">
          {MEASURES.map((m) => (
            <FilterChip key={m.key} on={measure === m.key} tone={m.tone} onClick={() => setMeasure(m.key)}>
              {m.label}
            </FilterChip>
          ))}
        </div>
      </div>
      <p className="dchart__readout">
        {shown && (
          <>
            <b>{shown.long}</b>
            {shown.totals.battles === 0 ? (
              <span>không có trận</span>
            ) : (
              <span>
                {shown.totals.battles} trận · {shown.totals.won} thắng ({pct(rate(shown.totals))}) ·{" "}
                <b className="dchart__exp">+{num(shown.totals.exp)} EXP</b> · <b className="dchart__coin">+{num(shown.totals.coin)} xu</b> ·{" "}
                {span(shown.totals.ms)} trong trận
              </span>
            )}
          </>
        )}
      </p>
      <div className="dchart__plot" style={{ "--dchart": tone } as CSSProperties}>
        <span className="dchart__max px" aria-hidden="true">
          {num(top)} {unit}
        </span>
        <div className="dchart__cols" onMouseLeave={() => setHover(null)}>
          {list.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={i === hover ? "dchart__col is-on" : "dchart__col"}
              aria-label={`${s.long}: ${num(value(s))} ${unit}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <span className="dchart__bar" style={{ height: `${(value(s) / top) * 100}%` }} />
            </button>
          ))}
        </div>
        <div className="dchart__labels" aria-hidden="true">
          {list.map((s, i) => (
            <span key={s.key}>{i % step === 0 || i === list.length - 1 ? s.label : ""}</span>
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
    <div className="bstats__stack">
      <div className="bstats__eta">
        <Icon name="star" size={16} />
        {!c || !level ? (
          <span>Đăng nhập để biết còn bao nhiêu EXP lên cấp kế.</span>
        ) : runRate <= 0 ? (
          <span>
            Cấp {c.level}: còn <b className="px">{num(level.left)}</b> EXP lên cấp {c.level + 1}. Chưa có EXP trong khoảng này để
            ước tính thời gian.
          </span>
        ) : (
          <span>
            Cấp {c.level}: còn <b className="px">{num(level.left)}</b> EXP lên cấp {c.level + 1}, khoảng{" "}
            <b>{span((level.left / runRate) * HOUR)}</b> bot chạy nữa, theo {num(Math.round(runRate))} EXP mỗi giờ chạy ({basis}).
          </span>
        )}
      </div>
      <div className="bstats__wrap">
        <table className="bstats__table">
          <thead>
            <tr>
              <th scope="col">Cấp</th>
              <th scope="col">Lên cấp lúc</th>
              <th scope="col">Ở cấp này</th>
              <th scope="col">Trận</th>
              <th scope="col">Tỉ lệ thắng</th>
              <th scope="col">EXP</th>
              <th scope="col">EXP mỗi giờ đánh</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.level}>
                <th scope="row">
                  <span className="bstats__mob">
                    Cấp {l.level}
                    {c?.level === l.level && <Badge tone="var(--exp)">ĐANG</Badge>}
                  </span>
                </th>
                <td>{l.reachedAt != null ? when(l.reachedAt) : <small className="bstats__dim">trước lịch sử</small>}</td>
                <td>{stay(l, t.levels, c?.level, now)}</td>
                <td className="px">{num(l.battles)}</td>
                <td className="px">{pct(rate(l))}</td>
                <td className="px">+{num(l.exp)}</td>
                <td className="px">{perHour(l.exp, l.ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="bstats__note">
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
    <tr>
      <th scope="row">
        {name}
        {sub && <small>{sub}</small>}
      </th>
      <td className="px">{num(t.battles)}</td>
      <td>
        <span className="bstats__rate">
          <span className="px">{pct(rate(t))}</span>
          <Bar value={rate(t)} fill="var(--s-online)" thin label={`Tỉ lệ thắng ${name}`} />
        </span>
      </td>
      <td className="px">{each(t.exp, t.battles)}</td>
      <td className="px">{each(t.coin, t.battles)}</td>
      <td>{t.battles > 0 ? span(t.ms / t.battles) : "—"}</td>
      <td className="px">{perHour(t.exp, t.ms)}</td>
    </tr>
  );
}

function GroupHead({ first }: { first: string }) {
  return (
    <thead>
      <tr>
        <th scope="col">{first}</th>
        <th scope="col">Trận</th>
        <th scope="col">Tỉ lệ thắng</th>
        <th scope="col">EXP/trận</th>
        <th scope="col">Xu/trận</th>
        <th scope="col">Thời gian/trận</th>
        <th scope="col">EXP mỗi giờ đánh</th>
      </tr>
    </thead>
  );
}

/** Quái & bản đồ: by source (Đánh quái against Nhiệm vụ), by map, by mob. */
function Where({ t, filtered }: { t: BattleStats; filtered: boolean }) {
  return (
    <div className="bstats__stack">
      {!filtered && (
        <>
          <h3 className="bstats__h">Theo nguồn</h3>
          <div className="bstats__wrap">
            <table className="bstats__table">
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
      <h3 className="bstats__h">Theo bản đồ</h3>
      <div className="bstats__wrap">
        <table className="bstats__table">
          <GroupHead first="Bản đồ" />
          <tbody>
            {t.maps.map((m) => (
              <GroupRow key={m.key} name={m.key} t={m} />
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="bstats__h">Theo quái</h3>
      <div className="bstats__wrap">
        <table className="bstats__table">
          <thead>
            <tr>
              <th scope="col">Quái</th>
              <th scope="col">Trận</th>
              <th scope="col">Thắng</th>
              <th scope="col">Tỉ lệ</th>
              <th scope="col">Lượt</th>
              <th scope="col">Thời gian</th>
              <th scope="col">EXP/trận</th>
            </tr>
          </thead>
          <tbody>
            {t.mobs.map((m) => (
              <tr key={`${m.mobName}-${m.mobLevel}-${m.mapName}`}>
                <th scope="row">
                  <span className="bstats__mob">
                    {m.mobName}
                    {m.boss && <Badge tone="var(--accent)">BOSS</Badge>}
                  </span>
                  <small>
                    {m.mobLevel > 0 && `cấp ${m.mobLevel} · `}
                    {m.mapName}
                  </small>
                </th>
                <td className="px">{m.battles}</td>
                <td className="px">{m.won}</td>
                <td>
                  <span className="bstats__rate">
                    <span className="px">{pct(rate(m))}</span>
                    <Bar value={rate(m)} fill="var(--s-online)" thin label={`Tỉ lệ thắng ${m.mobName}`} />
                  </span>
                </td>
                <td className="px">{Math.round(m.turns / m.battles)}</td>
                <td>{span(m.ms / m.battles)}</td>
                <td className="px">{num(Math.round(m.exp / m.battles))}</td>
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
    return <p className="bstats__none">Chưa nhặt được món nào sau các trận này (Tự nhặt đồ ở tab Cài đặt đánh).</p>;
  return (
    <div className="bstats__wrap">
      <table className="bstats__table bstats__loot">
        <thead>
          <tr>
            <th scope="col">Món</th>
            <th scope="col">Số lần nhặt</th>
            <th scope="col">Tổng số</th>
            <th scope="col">Mỗi trận thắng</th>
          </tr>
        </thead>
        <tbody>
          {t.picked.map((p) => (
            <tr key={p.itemId}>
              <th scope="row">
                <span className="bstats__item">
                  <PickedIcon icon={p.icon} />
                  {p.name}
                </span>
              </th>
              <td className="px">{num(p.times)}</td>
              <td className="px">{num(p.quantity)}</td>
              <td className="px">{t.won > 0 ? avg(p.quantity / t.won) : "—"}</td>
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
    <div className="bstats__stack">
      <ol className="bstats__list">
        {history.map((b) => (
          <li key={b.id}>
            <time className="px">{when(b.endedAt)}</time>
            <span className="bstats__name">
              {b.mobName}
              {b.mobLevel > 0 && <small> cấp {b.mobLevel}</small>}
            </span>
            <span className="bstats__where">
              {b.mapName} · khu {b.zone}
            </span>
            <b className="bstats__result" style={{ color: RESULT[b.result].tone }}>
              {RESULT[b.result].label}
            </b>
            <span className="bstats__facts">
              {b.turns} lượt · {span(b.endedAt - b.startedAt)} · +{num(b.exp)} EXP · +{num(b.coin)} xu
            </span>
            {b.picked.length > 0 && (
              <span className="bstats__picked">
                Nhặt:{" "}
                {b.picked.map((p, i) => (
                  <span key={p.itemId}>
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
        <button type="button" className="bstats__more" disabled={loading} onClick={onMore}>
          {loading ? "Đang tải…" : "Xem thêm"}
        </button>
      )}
    </div>
  );
}

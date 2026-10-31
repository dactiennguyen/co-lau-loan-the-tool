import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Badge } from "../components/Badge";
import { Bar } from "../components/Bar";
import { Card } from "../components/Card";
import { FilterChip } from "../components/FilterChip";
import { num, pct } from "../format";
import type { Account, BattleResult, BattleSource, BattleStats, StoredBattle, Totals } from "../types";
import "./BattleStatsCard.css";

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
const RESULT: Record<BattleResult, { label: string; tone: string }> = {
  won: { label: "Thắng", tone: "var(--s-online)" },
  lost: { label: "Thua", tone: "var(--danger)" },
  left: { label: "Rời trận", tone: "var(--fg-3)" },
};
const PAGE = 30;
const DAY = 86_400_000;

/** The start of the range in ms since 1970, local midnight for Hôm nay; null for all. */
function since(range: Range) {
  const now = Date.now();
  if (range === "today") return new Date().setHours(0, 0, 0, 0);
  if (range === "week") return now - 7 * DAY;
  if (range === "month") return now - 30 * DAY;
  return null;
}

/** "45 giây", "12 phút", "3 giờ 05 phút". */
function span(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} giây`;
  if (s < 3600) return `${Math.floor(s / 60)} phút`;
  return `${Math.floor(s / 3600)} giờ ${String(Math.floor(s / 60) % 60).padStart(2, "0")} phút`;
}

const rate = (t: Totals) => (t.battles ? t.won / t.battles : 0);
/** "31/10 13:15", local time. */
function when(at: number) {
  const d = new Date(at);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/**
 * Thống kê of the account (by username, from cllt.db): battles of a range and a source, their win rate, EXP and Xu,
 * the time in them; each mob with its own rate and averages; the battles themselves, newest first. Asked again when
 * a battle of the account ends.
 */
export function BattleStatsCard({ account }: { account: Account }) {
  const c = account.character;
  const [range, setRange] = useState<Range>("week");
  const [source, setSource] = useState<BattleSource | null>(null);
  const [stats, setStats] = useState<BattleStats | null | undefined>(undefined);
  const [history, setHistory] = useState<StoredBattle[]>([]);
  const [end, setEnd] = useState(false);
  const [loading, setLoading] = useState(false);
  // A battle that ends changes these: the numbers are asked again then.
  const ended = `${c?.job?.fights ?? 0}-${c?.questRun?.fights ?? 0}-${c?.battle ? 1 : 0}`;
  // Bumped by each new first page, so an answer to an earlier one, or a Xem thêm asked before it, is dropped.
  const asked = useRef(0);

  useEffect(() => {
    const at = ++asked.current;
    const from = since(range);
    Promise.all([api.battleStats(account.id, from, source), api.battleHistory(account.id, from, source, null, PAGE)]).then(
      ([s, h]) => {
        if (at !== asked.current) return;
        setStats(s);
        setHistory(h);
        setEnd(h.length < PAGE);
      },
    );
  }, [account.id, range, source, ended]);
  useEffect(
    () => () => {
      asked.current++;
    },
    [],
  );

  const more = async () => {
    const last = history[history.length - 1];
    if (!last || loading) return;
    const at = asked.current;
    setLoading(true);
    try {
      const h = await api.battleHistory(account.id, since(range), source, last.id, PAGE);
      if (at !== asked.current) return;
      setHistory((old) => [...old, ...h]);
      setEnd(h.length < PAGE);
    } finally {
      setLoading(false);
    }
  };

  const t = stats;
  return (
    <Card title="Thống kê" icon="chart" tone="var(--exp)" subtitle={`Theo nick ${account.username}`} className="bstats">
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

      {t === undefined ? (
        <p className="bstats__none">Đang tải…</p>
      ) : t === null ? (
        <p className="bstats__none">Chưa có cơ sở dữ liệu cllt.db nên chưa có lịch sử trận.</p>
      ) : t.battles === 0 ? (
        <p className="bstats__none">Chưa có trận nào trong khoảng này.</p>
      ) : (
        <>
          <dl className="bstats__tiles">
            <div>
              <dt>Trận</dt>
              <dd className="px">{num(t.battles)}</dd>
              <small>
                <b className="win">{t.won} thắng</b> · <b className="loss">{t.lost} thua</b>
                {t.left > 0 && <> · {t.left} rời</>}
              </small>
            </div>
            <div>
              <dt>Tỉ lệ thắng</dt>
              <dd className="px">{pct(rate(t))}</dd>
              <Bar value={rate(t)} fill="var(--s-online)" thin label="Tỉ lệ thắng" />
            </div>
            <div>
              <dt>EXP</dt>
              <dd className="px">+{num(t.exp)}</dd>
              <small>{num(Math.round(t.exp / t.battles))} mỗi trận</small>
            </div>
            <div>
              <dt>Xu</dt>
              <dd className="px">+{num(t.coin)}</dd>
              <small>{num(Math.round(t.coin / t.battles))} mỗi trận</small>
            </div>
            <div>
              <dt>Thời gian đánh</dt>
              <dd>{span(t.ms)}</dd>
              <small>{span(t.ms / t.battles)} mỗi trận</small>
            </div>
            <div>
              <dt>EXP mỗi giờ</dt>
              <dd className="px">{t.ms > 0 ? num(Math.round((t.exp * 3_600_000) / t.ms)) : "—"}</dd>
              <small>tính trên thời gian trong trận</small>
            </div>
          </dl>

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

          <h3 className="bstats__h">Trận gần đây</h3>
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
              </li>
            ))}
          </ol>
          {!end && (
            <button type="button" className="bstats__more" disabled={loading} onClick={more}>
              {loading ? "Đang tải…" : "Xem thêm"}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

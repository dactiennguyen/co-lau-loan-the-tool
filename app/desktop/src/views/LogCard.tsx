import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { FilterChip } from "../components/FilterChip";
import { LOG_KINDS, kindOf } from "../logKinds";
import { useStore } from "../store";
import type { LogKind, LogLine } from "../types";
import { LootRow } from "./LootRow";
import { TurnStatus } from "./TurnStatus";
import "./LogCard.css";

/** Lines asked from cllt.db at a time. */
const PAGE = 200;
const BAD = 2;

interface Props {
  /** The account, whose older lines come from cllt.db. */
  id: number;
  lines: LogLine[];
  fighting: boolean;
}

/**
 * What happened to the selected account, newest at the bottom; follows new lines while scrolled to the end. The line a
 * battle opened on shows the battle's latest result under it, live while `fighting`. Chips filter by kind (several at
 * once, none for all) and to the red lines; "Xem dòng cũ hơn" brings older lines of the filter from cllt.db. "Xoá màn
 * hình" only hides the lines on show (store.ts logCleared): the log and cllt.db keep them, and "Hiện lại" brings them back.
 */
export function LogCard({ id, lines, fighting }: Props) {
  const list = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);
  const clearedAt = useStore((s) => s.logCleared[id]);
  const clearLog = useStore((s) => s.clearLog);
  const [kinds, setKinds] = useState<LogKind[]>([]);
  const [bad, setBad] = useState(false);
  const [older, setOlder] = useState<LogLine[]>([]);
  const [end, setEnd] = useState(false);
  const [loading, setLoading] = useState(false);
  // How far the list was from its bottom before older lines went on top, to keep the lines read in place.
  const keep = useRef<number | null>(null);
  // Bumped when the filter changes, so a page asked under the old one is dropped.
  const asked = useRef(0);
  const prev = useRef(lines);

  useEffect(() => {
    asked.current++;
    setOlder([]);
    setEnd(false);
  }, [id, kinds, bad]);
  // The UI keeps the last 500 lines (updates.ts): with older lines on show, those that drop off the top go below them,
  // so the card never skips lines between the two.
  useEffect(() => {
    const was = prev.current;
    prev.current = lines;
    const first = lines.length ? lines[0].seq : Infinity;
    const dropped = was.filter((l) => l.seq < first && match(l));
    if (dropped.length) setOlder((o) => (o.length ? [...o, ...dropped] : o));
  }, [lines]);
  useEffect(() => {
    const el = list.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines, kinds, bad]);
  useLayoutEffect(() => {
    const el = list.current;
    if (el && keep.current != null) el.scrollTop = el.scrollHeight - keep.current;
    keep.current = null;
  }, [older]);

  const match = (l: LogLine) => (!kinds.length || kinds.includes(l.kind)) && (!bad || l.tone === BAD);
  // After Xoá màn hình, the lines up to then are hidden; older lines are not asked for while some are.
  const visible = clearedAt == null ? lines : lines.filter((l) => l.seq > clearedAt);
  const hidden = lines.length - visible.length;
  const shown = [...older, ...visible.filter(match)];
  // The oldest row the card has, matching or not: older lines start below it, so none comes twice.
  const ids = [...older, ...visible].flatMap((l) => (l.id == null ? [] : [l.id]));
  const cursor = ids.length ? Math.min(...ids) : null;

  let live = -1;
  for (let i = shown.length - 1; fighting && i >= 0; i--) {
    if (shown[i].turn) {
      live = shown[i].turn!.end ? -1 : i;
      break;
    }
  }
  const clear = () => {
    if (!lines.length) return;
    asked.current++;
    setOlder([]);
    setEnd(false);
    clearLog(id, lines[lines.length - 1].seq);
  };
  const toggle = (k: LogKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  const loadOlder = async () => {
    if (cursor == null || loading) return;
    const at = asked.current;
    setLoading(true);
    try {
      const got = await api.logHistory(id, cursor, kinds, bad, PAGE);
      if (at !== asked.current) return;
      const el = list.current;
      keep.current = el ? el.scrollHeight - el.scrollTop : null;
      setOlder((o) => [...got, ...o]);
      if (got.length < PAGE) setEnd(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title="Nhật ký"
      icon="list"
      tone="var(--exp)"
      aside={
        <span className="log__aside">
          <span className="log__count">
            <span className="px">{shown.length}</span> dòng
          </span>
          <Button
            kind="ghost"
            small
            icon="eraser"
            disabled={!older.length && !visible.length}
            onClick={clear}
            title="Ẩn các dòng đang hiện; nhật ký vẫn giữ nguyên, bấm Hiện lại để xem lại"
          >
            Xoá màn hình
          </Button>
        </span>
      }
      className="log-card"
    >
      <div className="log__filters" role="group" aria-label="Lọc nhật ký">
        <FilterChip
          on={!kinds.length && !bad}
          onClick={() => {
            setKinds([]);
            setBad(false);
          }}
        >
          Tất cả
        </FilterChip>
        {LOG_KINDS.map((k) => (
          <FilterChip key={k.kind} on={kinds.includes(k.kind)} tone={k.tone} onClick={() => toggle(k.kind)}>
            {k.label}
          </FilterChip>
        ))}
        <span className="log__sep" aria-hidden="true" />
        <FilterChip on={bad} tone="var(--danger)" onClick={() => setBad((b) => !b)}>
          Chỉ lỗi
        </FilterChip>
      </div>
      <ol
        ref={list}
        className="log scroll selectable"
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {hidden > 0 ? (
          <li className="log__more">
            <button type="button" onClick={() => clearLog(id, null)}>
              Đã xoá {hidden} dòng khỏi màn hình · Hiện lại
            </button>
          </li>
        ) : (
          cursor != null &&
          !end && (
            <li className="log__more">
              <button type="button" disabled={loading} onClick={loadOlder}>
                {loading ? "Đang tải…" : "Xem dòng cũ hơn"}
              </button>
            </li>
          )
        )}
        {shown.length === 0 && (
          <li className="log__empty">
            {visible.length ? "Không có dòng nào khớp bộ lọc." : hidden ? "Dòng mới sẽ hiện ở đây." : "Chưa có gì."}
          </li>
        )}
        {shown.map((l, i) => {
          const k = kindOf(l.kind);
          return (
            <li key={l.id != null ? `i${l.id}` : `s${l.seq}`} className={`tone-${l.tone}`}>
              <time className="px" dateTime={l.at ? new Date(l.at).toISOString() : undefined}>
                {l.time}
              </time>
              <span className="log__kind" style={{ "--kind": k.tone } as CSSProperties}>
                {k.label}
              </span>
              <div className="log__main">
                <span className="log__text">{l.text}</span>
                {l.turn && <TurnStatus turn={l.turn} live={i === live} />}
                {l.picked && <LootRow items={l.picked} />}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

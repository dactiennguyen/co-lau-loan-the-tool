import { useEffect, useRef } from "react";
import { Card } from "../components/Card";
import type { LogLine } from "../types";
import "./LogCard.css";

/** What happened to the selected account, newest at the bottom; follows new lines while scrolled to the end. */
export function LogCard({ lines }: { lines: LogLine[] }) {
  const list = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = list.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines]);
  return (
    <Card title="Nhật ký" icon="list" tone="var(--exp)" aside={<span className="log__count"><span className="px">{lines.length}</span> dòng</span>} className="log-card">
      <ol
        ref={list}
        className="log scroll selectable"
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {lines.length === 0 && <li className="log__empty">Chưa có gì.</li>}
        {lines.map((l, i) => (
          <li key={i} className={`tone-${l.tone}`}>
            <time className="px">{l.time}</time>
            <span>{l.text}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

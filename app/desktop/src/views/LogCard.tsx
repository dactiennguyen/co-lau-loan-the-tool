import { useEffect, useRef } from "react";
import { Card } from "../components/Card";
import type { LogLine } from "../types";
import { TurnStatus } from "./TurnStatus";
import "./LogCard.css";

/**
 * What happened to the selected account, newest at the bottom; follows new lines while scrolled to the end. The line a
 * battle opened on shows the battle's latest result under it, live while `fighting`.
 */
export function LogCard({ lines, fighting }: { lines: LogLine[]; fighting: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = list.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines]);
  let live = -1;
  for (let i = lines.length - 1; fighting && i >= 0; i--) {
    if (lines[i].turn) {
      live = lines[i].turn!.end ? -1 : i;
      break;
    }
  }
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
          <li key={l.seq} className={`tone-${l.tone}`}>
            <time className="px">{l.time}</time>
            <div className="log__main">
              <span className="log__text">{l.text}</span>
              {l.turn && <TurnStatus turn={l.turn} live={i === live} />}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/api";
import type { Account, RankRow, RankTab } from "@/api/types";
import { Button } from "@/components/Button";
import { FilterChip } from "@/components/FilterChip";
import { Icon } from "@/components/Icon";
import { Popover } from "@/components/Popover";
import { useStore } from "@/store";
import { cn } from "@/utils/cn";
import { num, timeOfDay } from "@/utils/format";
import { recalled, remember } from "@/utils/remember";

const TAB = "ranking.tab";
/** A tab read longer ago than this is asked again when the panel opens on it. */
const STALE_MS = 5 * 60_000;
/** A tab asked and not answered after this: the server refused it (it answers with s2c/1256 only). */
const QUIET_MS = 6000;
/** The tabs of RK1, until the server's list is in. */
const TABS: RankTab[] = [
  { tab: 0, title: "Cao thủ", column: "Cấp độ" },
  { tab: 1, title: "Sứ quân", column: "Cấp" },
  { tab: 2, title: "12 châu", column: "Cấp" },
  { tab: 3, title: "Cường hoá", column: "Tổng cấp" },
  { tab: 4, title: "Hỏa", column: "Cấp độ" },
  { tab: 5, title: "Lôi", column: "Cấp độ" },
  { tab: 6, title: "Thủy", column: "Cấp độ" },
];
/** Gold, silver and bronze for the first three, as the game's wings. */
const MEDAL = ["", "var(--coin)", "#c9ccd3", "#c98a5b"];

/** "23/11/2026 18:53", as the game's "Đạt lúc". */
function reached(ms: number) {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/**
 * Bảng xếp hạng as a small button beside Xung quanh (11-panels.md#s2c-1254, RK1): a cup; a click opens the game's ranking
 * in a panel under it. The seven tabs of the game (Cao thủ by level first), up to 100 rows each with the rank (the first
 * three in gold, silver and bronze), the name, when it was reached and the figure; the character's own row tinted and its
 * rank pinned at the bottom ("Bạn chưa có tên trong bảng" when not in it), the app's other characters marked. A tab is
 * read on opening when it was never read or is older than 5 minutes, and again with Làm mới; the tab picked is kept.
 */
export function RankingButton({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLSpanElement>(null);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.querySelector("button")?.focus();
  }, []);
  return (
    <>
      <span ref={button} className="inline-flex flex-none">
        <Button
          kind="outline"
          small
          icon="crown"
          className="flex-none w-[22px] h-[22px] text-coin"
          aria-label="Bảng xếp hạng"
          title="Bảng xếp hạng"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        />
      </span>
      {open && <RankingPanel account={account} anchor={button} onClose={close} />}
    </>
  );
}

function RankingPanel({
  account,
  anchor,
  onClose,
}: {
  account: Account;
  anchor: React.RefObject<HTMLSpanElement | null>;
  onClose: (refocus: boolean) => void;
}) {
  const c = account.character!;
  const ranking = c.ranking;
  const tabs = ranking.tabs.length ? ranking.tabs : TABS;
  const [tab, setTab] = useState(() => Math.min(6, Number(recalled(TAB)) || 0));
  const list = ranking.lists.find((l) => l.tab === tab);
  const waiting = ranking.asked === tab && ranking.askedAt != null;
  // Redrawn once a tab asked has waited QUIET_MS, to say it was refused.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => tick((n) => n + 1), QUIET_MS + 100);
    return () => clearTimeout(t);
  }, [waiting, ranking.askedAt]);
  const quiet = waiting && Date.now() - (ranking.askedAt ?? 0) > QUIET_MS;
  const read = useCallback((t: number) => void api.ranking(account.id, t), [account.id]);
  // A tab never read, or read long ago, is asked when it is shown.
  useEffect(() => {
    if (!list || Date.now() - list.readAt > STALE_MS) read(tab);
    // Only on opening and on a change of tab: the list arriving must not ask again.
  }, [tab]);

  const order = useStore((s) => s.order);
  const byId = useStore((s) => s.byId);
  const mine = useMemo(
    () => new Set(order.map((id) => byId[id]?.character?.name).filter((n): n is string => !!n && n !== c.name)),
    [order, byId, c.name],
  );
  const column = tabs.find((t) => t.tab === tab)?.column ?? "Cấp";
  const own = list?.own;

  return (
    <Popover anchor={anchor} label="Bảng xếp hạng" onClose={onClose} className="w-[380px] max-h-[min(560px,80vh)]">
      <header className="flex items-center gap-2">
        <span className="grid place-items-center size-[22px] bg-ink text-coin">
          <Icon name="crown" size={13} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-extrabold text-12 leading-[1.2] tracking-[0.06em] uppercase text-fg">Bảng xếp hạng</h2>
          <p className="m-0 text-11 text-fg-3 truncate">
            {waiting && !quiet ? "Đang đọc…" : list ? `Đọc lúc ${timeOfDay(list.readAt)}` : "Chưa đọc"}
          </p>
        </div>
        <Button kind="outline" small icon="refresh" disabled={waiting && !quiet} onClick={() => read(tab)}>
          Làm mới
        </Button>
      </header>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Tab xếp hạng">
        {tabs.map((t) => (
          <FilterChip
            key={t.tab}
            on={tab === t.tab}
            tone="var(--coin)"
            onClick={() => {
              setTab(t.tab);
              remember(TAB, String(t.tab));
            }}
          >
            {t.title}
          </FilterChip>
        ))}
      </div>
      {quiet && <p className="m-0 text-12 text-danger">Server không trả lời tab này (có thể tab chưa mở). Thử Làm mới.</p>}
      {!list ? (
        !quiet && <p className="m-0 text-12 text-fg-3">Đang đọc bảng xếp hạng…</p>
      ) : (
        <>
          <div className="grid grid-cols-[44px_minmax(0,1fr)_64px] gap-2 px-1.5 text-11 font-semibold text-fg-3">
            <span>Hạng</span>
            <span>Tên nhân vật</span>
            <span className="text-right">{column}</span>
          </div>
          <ol className="scroll flex-1 min-h-0 grid [align-content:start] gap-1 m-0 p-0 list-none" aria-label={`Xếp hạng ${column}`}>
            {list.rows.map((r) => (
              <Row key={`${r.rank}-${r.id}-${r.name}`} row={r} self={r.name === c.name} mine={mine.has(r.name)} />
            ))}
            {list.rows.length === 0 && <li className="text-12 text-fg-3">Bảng trống.</li>}
          </ol>
          <div className="flex items-center gap-2 px-2 py-1.5 bg-[color-mix(in_srgb,var(--coin)_18%,var(--bg-2))] border-2 border-coin text-12">
            {own && own.rank > 0 ? (
              <>
                <b className="px text-14 text-coin w-[40px]">{own.rank}</b>
                <span className="flex-1 min-w-0 truncate font-semibold text-fg">{c.name}</span>
                <span className="px text-12 text-fg">{num(own.level)}</span>
              </>
            ) : (
              <span className="flex-1 text-center text-fg-2">Bạn chưa có tên trong bảng</span>
            )}
          </div>
        </>
      )}
    </Popover>
  );
}

/** A row: the rank (a medal colour for the first three), the name over "Đạt lúc …", the figure. */
function Row({ row: r, self, mine }: { row: RankRow; self: boolean; mine: boolean }) {
  const medal = MEDAL[r.rank];
  return (
    <li
      className={cn(
        "grid grid-cols-[44px_minmax(0,1fr)_64px] items-center gap-2 py-1 px-1.5 bg-bg-2 hover:bg-card-2",
        self && "bg-[color-mix(in_srgb,var(--coin)_18%,var(--bg-2))]",
      )}
    >
      <span
        className={cn("px text-13 text-center", medal ? "grid place-items-center size-[24px] text-ink bevel-sm" : "text-fg")}
        style={medal ? { background: medal } : undefined}
      >
        {r.rank}
      </span>
      <span className="grid min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="select-text truncate text-12 font-semibold text-fg">{r.name}</span>
          {mine && <span className="flex-none px-1 text-10 leading-[1.4] text-ink bg-points">nick của bạn</span>}
        </span>
        {r.reachedAt ? <span className="text-10 text-fg-3">Đạt lúc {reached(r.reachedAt)}</span> : null}
      </span>
      <span className="px text-12 text-right text-fg">{num(r.level)}</span>
    </li>
  );
}

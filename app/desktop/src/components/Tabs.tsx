import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Icon, type IconName } from "./Icon";

export interface Tab<K extends string> {
  key: K;
  label: string;
  icon: IconName;
  /** A blinking light: something runs behind this tab. */
  busy?: boolean;
  /** A count beside the label (gifts not taken), with what it counts for screen readers; none at 0. */
  count?: number;
  countLabel?: string;
  /** Something needs a look (the bag is full): the tab blinks red, with this short word beside the label ("Đầy") and
   * `alertLabel` for screen readers. */
  alert?: string;
  alertLabel?: string;
}

const tabId = (id: string, key: string) => `${id}-tab-${key}`;
const panelId = (id: string) => `${id}-panel`;

/** A tab: the small notched frame, the selected one lighter with a gold line along its bottom. Labels never wrap: a bar
 * narrower than 600 px drops some padding, one narrower than 440 px the icons too, and it scrolls sideways when still
 * too narrow. */
const TAB =
  "relative inline-flex flex-none items-center gap-1.5 h-[30px] px-3 py-0 border-2 border-ink notch-sm bg-bg-2 text-fg-3 font-extrabold text-12 tracking-[0.04em] uppercase whitespace-nowrap cursor-pointer bevel-sm " +
  "[@container(max-width:600px)]:gap-1 [@container(max-width:600px)]:px-[7px] [@container(max-width:600px)]:tracking-[0.02em] hover:text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-5 " +
  "aria-selected:bg-card aria-selected:text-fg aria-selected:shadow-[inset_0_-3px_0_var(--primary)]";

/**
 * Tab buttons over one panel, as WAI-ARIA tabs: only the selected tab is in the tab order; arrow keys, Home and End pick
 * another and move focus to it. `id` ties them to the <TabPanel> that shows the panel of `value`.
 */
export function Tabs<K extends string>({
  id,
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  id: string;
  tabs: Tab<K>[];
  value: K;
  onChange: (k: K) => void;
  label: string;
  className?: string;
}) {
  const keys = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.key === value);
    const next = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 } as Record<string, number>)[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    onChange(tab.key);
    document.getElementById(tabId(id, tab.key))?.focus();
  };
  return (
    <div className={cn("@container flex gap-1.5 overflow-x-auto [scrollbar-width:none]", className)} role="tablist" aria-label={label} onKeyDown={keys}>
      {tabs.map((t) => (
        <button
          key={t.key}
          id={tabId(id, t.key)}
          type="button"
          role="tab"
          aria-selected={t.key === value}
          aria-controls={panelId(id)}
          tabIndex={t.key === value ? 0 : -1}
          className={cn(TAB, t.alert && "animate-alarm")}
          onClick={() => onChange(t.key)}
        >
          <Icon name={t.icon} size={14} className={cn("[@container(max-width:440px)]:hidden", t.alert && "text-danger")} />
          {t.label}
          {/* Something runs behind that tab. */}
          {t.busy && <i className="size-1.5 bg-s-fighting animate-blink" role="img" aria-label="đang chạy" />}
          {t.alert && (
            <span className="grid place-items-center h-4 px-1 bg-danger text-ink font-pixel font-normal text-10 leading-none tracking-normal" role="img" aria-label={t.alertLabel ?? t.alert}>
              {t.alert}
            </span>
          )}
          {!!t.count && (
            <span
              className="grid place-items-center min-w-4 h-4 px-1 bg-accent-deep text-fg font-pixel font-normal text-10 leading-none tracking-normal"
              aria-label={`${t.count} ${t.countLabel ?? ""}`.trim()}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** The one panel of the <Tabs> with the same `id`, labelled by the selected tab. By default it holds one card and passes
 * its row on to it: the card shrinks with the window and scrolls inside. */
export function TabPanel({ id, value, className, children }: { id: string; value: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("grid grid-rows-[minmax(0,1fr)] min-h-0", className)} role="tabpanel" id={panelId(id)} aria-labelledby={tabId(id, value)}>
      {children}
    </div>
  );
}

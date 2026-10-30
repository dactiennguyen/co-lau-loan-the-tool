import type { KeyboardEvent, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import "./Tabs.css";

export interface Tab<K extends string> {
  key: K;
  label: string;
  icon: IconName;
  /** A blinking light: something runs behind this tab. */
  busy?: boolean;
}

const tabId = (id: string, key: string) => `${id}-tab-${key}`;
const panelId = (id: string) => `${id}-panel`;

/**
 * Tab buttons over one panel, as WAI-ARIA tabs: only the selected tab is in the tab order; arrow keys, Home and End pick
 * another and move focus to it. `id` ties them to the <TabPanel> that shows the panel of `value`.
 */
export function Tabs<K extends string>({ id, tabs, value, onChange, label }: { id: string; tabs: Tab<K>[]; value: K; onChange: (k: K) => void; label: string }) {
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
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={keys}>
      {tabs.map((t) => (
        <button
          key={t.key}
          id={tabId(id, t.key)}
          type="button"
          role="tab"
          aria-selected={t.key === value}
          aria-controls={panelId(id)}
          tabIndex={t.key === value ? 0 : -1}
          onClick={() => onChange(t.key)}
        >
          <Icon name={t.icon} size={14} />
          {t.label}
          {t.busy && <i className="tabs__busy" role="img" aria-label="đang chạy" />}
        </button>
      ))}
    </div>
  );
}

/** The one panel of the <Tabs> with the same `id`, labelled by the selected tab. */
export function TabPanel({ id, value, children }: { id: string; value: string; children: ReactNode }) {
  return (
    <div className="tabs__panel" role="tabpanel" id={panelId(id)} aria-labelledby={tabId(id, value)}>
      {children}
    </div>
  );
}

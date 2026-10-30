import { useId, useState } from "react";
import { TabPanel, Tabs } from "../components/Tabs";
import type { Account, LogLine } from "../types";
import { FightCard, type FightChoice } from "./FightCard";
import { HeroCard } from "./HeroCard";
import { LogCard } from "./LogCard";
import { MetricRow } from "./MetricRow";
import { PlayersCard } from "./PlayersCard";
import { QuestCard } from "./QuestCard";
import { StatsCard } from "./StatsCard";
import "./AccountPage.css";

interface Props {
  account: Account;
  log: LogLine[];
  onLogin: () => void;
  onLogout: () => void;
  onRemove: () => void;
  onFight: (target: string, count: number, maxLosses: number) => void;
  onQuest: (maxLosses: number) => void;
  onStop: () => void;
}

type Task = "quest" | "fight";

/** Everything about the selected account. Mounted per account (key), so the tab and fight choice start fresh for each. */
export function AccountPage({ account, log, onLogin, onLogout, onRemove, onFight, onQuest, onStop }: Props) {
  const c = account.character;
  const [choice, setChoice] = useState<FightChoice>({ target: "", count: 5, losses: 1 });
  const [task, setTask] = useState<Task>("quest");
  const tabs = useId();
  const targets = c?.targets ?? [];
  // The chosen target, else the first one offered (bosses first, then the strongest).
  const target = targets.some((t) => t.name === choice.target) ? choice.target : (targets[0]?.name ?? "");
  return (
    <div className="page">
      <HeroCard account={account} onLogin={onLogin} onLogout={onLogout} onRemove={onRemove} />
      <MetricRow character={c} />
      <div className="page__columns">
        <div className="page__stack">
          <StatsCard character={c} />
          <PlayersCard character={c} />
        </div>
        <div className="page__stack page__stack--tasks">
          <Tabs<Task>
            id={tabs}
            label="Việc của nick"
            value={task}
            onChange={setTask}
            tabs={[
              { key: "quest", label: "Nhiệm vụ", icon: "scroll", busy: !!c?.questRun && c.questRun.done == null },
              { key: "fight", label: "Đánh quái", icon: "sword", busy: !!c?.job && c.job.done == null },
            ]}
          />
          <TabPanel id={tabs} value={task}>
            {task === "quest" ? (
              <QuestCard account={account} onStart={onQuest} onStop={onStop} />
            ) : (
              <FightCard
                account={account}
                choice={{ ...choice, target }}
                onChoice={setChoice}
                onStart={() => onFight(target, choice.count, choice.losses)}
                onStop={onStop}
              />
            )}
          </TabPanel>
          <LogCard lines={log} />
        </div>
      </div>
    </div>
  );
}

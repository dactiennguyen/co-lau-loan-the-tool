import { useId, useState } from "react";
import { api } from "../api";
import { TabPanel, Tabs } from "../components/Tabs";
import { selectedLog, useStore } from "../store";
import type { Account } from "../types";
import { FightCard, type FightChoice } from "./FightCard";
import { BattleStatsCard } from "./BattleStatsCard";
import { HeroCard } from "./HeroCard";
import { InventoryCard } from "./InventoryCard";
import { LogCard } from "./LogCard";
import { MetricRow } from "./MetricRow";
import { PlayersCard } from "./PlayersCard";
import { QuestCard } from "./QuestCard";
import { SkillsCard } from "./SkillsCard";
import { StatsCard } from "./StatsCard";
import "./AccountPage.css";

type Task = "quest" | "fight" | "bag" | "skills" | "stats";

/**
 * Everything about the selected account; its log comes from the store. Mounted per account (key), so the tab and fight
 * choice start fresh for each.
 */
export function AccountPage({ account }: { account: Account }) {
  const c = account.character;
  const id = account.id;
  const log = useStore(selectedLog);
  const open = useStore((s) => s.open);
  // During a battle Dừng asks whether to play it out or surrender; otherwise it stops at once.
  const onStop = () => (c?.battle ? open({ kind: "stop", id }) : api.stop(id));
  const [choice, setChoice] = useState<FightChoice>({ target: "", count: 5, losses: 1 });
  const [task, setTask] = useState<Task>("quest");
  const tabs = useId();
  const targets = c?.targets ?? [];
  // The chosen target, else the first one offered (bosses first, then the strongest).
  const target = targets.some((t) => t.name === choice.target) ? choice.target : (targets[0]?.name ?? "");
  return (
    <div className="page">
      <HeroCard
        account={account}
        onLogin={() => api.login(id)}
        onLogout={() => api.logout(id)}
        onRemove={() => open({ kind: "remove", id })}
        onPlace={() => open({ kind: "place", id })}
      />
      <MetricRow character={c} />
      <div className="page__columns">
        <div className="page__stack">
          <StatsCard account={account} onAdd={(stat) => api.addStat(id, stat)} onPlan={() => open({ kind: "stats", id })} />
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
              { key: "bag", label: "Túi đồ", icon: "gem" },
              { key: "skills", label: "Kỹ năng", icon: "bolt" },
              { key: "stats", label: "Thống kê", icon: "chart" },
            ]}
          />
          <TabPanel id={tabs} value={task}>
            {task === "quest" ? (
              <QuestCard account={account} onStart={(losses, step) => api.quest(id, losses, step)} onStop={onStop} />
            ) : task === "bag" ? (
              <InventoryCard account={account} onAction={(action, slot) => api.itemAction(id, action, slot)} />
            ) : task === "skills" ? (
              <SkillsCard account={account} onUpgrade={(skill) => api.upgradeSkill(id, skill)} />
            ) : task === "stats" ? (
              <BattleStatsCard account={account} />
            ) : (
              <FightCard
                account={account}
                choice={{ ...choice, target }}
                onChoice={setChoice}
                onStart={() => api.fight(id, target, choice.count, choice.losses)}
                onStop={onStop}
              />
            )}
          </TabPanel>
          <LogCard id={id} lines={log} fighting={!!c?.battle} />
        </div>
      </div>
    </div>
  );
}

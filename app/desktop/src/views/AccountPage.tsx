import { useId, useState } from "react";
import { api } from "../api";
import { TabPanel, Tabs } from "../components/Tabs";
import { recalled, remember } from "../remember";
import { selectedLog, useStore } from "../store";
import type { Account } from "../types";
import { useFightSetting } from "../useFightSetting";
import { FightCard, type FightChoice } from "./FightCard";
import { BattleStatsCard } from "./BattleStatsCard";
import { FightSettingsCard } from "./FightSettingsCard";
import { HeroCard } from "./HeroCard";
import { InventoryCard } from "./InventoryCard";
import { LogCard } from "./LogCard";
import { MetricRow } from "./MetricRow";
import { PlayersCard } from "./PlayersCard";
import { QuestCard } from "./QuestCard";
import { SkillsCard } from "./SkillsCard";
import { StatsCard } from "./StatsCard";
import "./AccountPage.css";

type Task = "quest" | "fight" | "settings" | "bag" | "skills" | "stats";
const TASKS: Task[] = ["quest", "fight", "settings", "bag", "skills", "stats"];
/** localStorage keys (remember.ts): the open tab of an account, and the tab last opened on any account. */
const tabKey = (id: number) => `tab.${id}`;
const LAST_TAB = "tab.last";

/** The tab the account had open, else the one last opened on any account, else Nhiệm vụ. */
function keptTask(id: number): Task {
  const kept = recalled(tabKey(id)) ?? recalled(LAST_TAB);
  return TASKS.find((t) => t === kept) ?? "quest";
}

/**
 * Everything about the selected account; its log comes from the store. Mounted per account (key). The open tab comes
 * back as last opened on that account (localStorage, remember.ts); the target chosen on each map, Số trận and Thua tối
 * đa come back from accounts.json (fightTargets, useFightSetting), so a switch of account, of map or a start of the app
 * keeps them.
 */
export function AccountPage({ account }: { account: Account }) {
  const c = account.character;
  const id = account.id;
  const log = useStore(selectedLog);
  const open = useStore((s) => s.open);
  // During a battle Dừng asks whether to play it out or surrender; otherwise it stops at once.
  const onStop = () => (c?.battle ? open({ kind: "stop", id }) : api.stop(id));
  // The target chosen on each map (mapId → name): back on a map, the tab offers what was chosen there. Shown at once,
  // saved to accounts.json; a save that fails (the browser preview saves nothing) keeps it while the page is open.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const mapId = c?.mapId ?? "";
  const [count, setCount] = useFightSetting(account, "fightCount");
  const [losses, setLosses] = useFightSetting(account, "fightLosses");
  const choice: FightChoice = { target: picked[mapId] ?? account.fightTargets[mapId] ?? "", count, losses };
  const setChoice = (next: FightChoice) => {
    if (next.target !== choice.target && mapId) {
      setPicked({ ...picked, [mapId]: next.target });
      api.setFightTarget(id, mapId, next.target).catch(() => {});
    }
    if (next.count !== count) setCount(next.count);
    if (next.losses !== losses) setLosses(next.losses);
  };
  const [task, setTaskState] = useState(() => keptTask(id));
  const setTask = (t: Task) => {
    setTaskState(t);
    remember(tabKey(id), t);
    remember(LAST_TAB, t);
  };
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
              { key: "settings", label: "Cài đặt", icon: "settings" },
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
            ) : task === "settings" ? (
              <FightSettingsCard account={account} />
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

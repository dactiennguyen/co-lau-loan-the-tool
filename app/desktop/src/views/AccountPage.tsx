import { useId, useState } from "react";
import { api } from "@/api";
import { TabPanel, Tabs } from "@/components/Tabs";
import { recalled, remember } from "@/utils/remember";
import { selectedLog, useStore } from "@/store";
import type { Account } from "@/api/types";
import { useFightSetting } from "@/hooks/useFightSetting";
import { FightCard, type FightChoice } from "./FightCard";
import { FightSettingsCard } from "./FightSettingsCard";
import { HeroCard } from "./HeroCard";
import { InventoryCard } from "./InventoryCard";
import { LogCard } from "./LogCard";
import { MetricRow } from "./MetricRow";
import { PlayersCard } from "./PlayersCard";
import { QuestCard } from "./QuestCard";
import { cn } from "@/utils/cn";
import { Button } from "@/components/Button";
import { StatsCard } from "./StatsCard";

// Kỹ năng is a modal of the Chỉ số card (SkillsModal), Thống kê one of the header (StatsModal); a tab kept as "skills"
// or "stats" opens Nhiệm vụ.
type Task = "quest" | "fight" | "settings" | "bag";
const TASKS: Task[] = ["quest", "fight", "settings", "bag"];
/** localStorage keys (utils/remember.ts): the open tab of an account, and the tab last opened on any account. */
const tabKey = (id: number) => `tab.${id}`;
const LAST_TAB = "tab.last";

/** The tab the account had open, else the one last opened on any account, else Nhiệm vụ. */
function keptTask(id: number): Task {
  const kept = recalled(tabKey(id)) ?? recalled(LAST_TAB);
  return TASKS.find((t) => t === kept) ?? "quest";
}

/**
 * Everything about the selected account; its log comes from the store. Mounted per account (key). The open tab comes
 * back as last opened on that account (localStorage, utils/remember.ts); the target chosen on each map, Số trận and Thua tối
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
  // As tall as the window, so the bottom cards take what is left (and scroll inside); below 800 px the page scrolls.
  // Narrow windows (up to 1120 px): the page grows with its cards and scrolls.
  return (
    <div className="grid grid-rows-[auto_auto_minmax(0,1fr)] gap-3 h-full min-h-[700px] narrow:h-auto narrow:min-h-full">
      <HeroCard
        account={account}
        onLogin={() => api.login(id)}
        onLogout={() => api.logout(id)}
        onRemove={() => open({ kind: "remove", id })}
        onPlace={() => open({ kind: "place", id })}
        onStats={() => open({ kind: "battles", id })}
      />
      <MetricRow character={c} />
      <div className="grid grid-cols-[minmax(240px,300px)_minmax(0,1fr)] gap-3 min-h-0 narrow:grid-cols-[minmax(220px,260px)_minmax(0,1fr)]">
        {/* The top card keeps its full height; the bottom one takes what is left, and the page scrolls when that is too
            little. */}
        <div className="grid grid-rows-[max-content_minmax(140px,1fr)] gap-3 min-h-0 narrow:grid-rows-[max-content_230px]">
          <StatsCard
            account={account}
            onAdd={(stat) => api.addStat(id, stat)}
            onPlan={() => open({ kind: "stats", id })}
            onSkills={() => open({ kind: "skills", id })}
          />
          <PlayersCard character={c} />
        </div>
        {/* Tabs, the quest or fight card (up to its full height, less when the window is short), the log. */}
        <div className="grid grid-rows-[max-content_minmax(0,max-content)_minmax(150px,1fr)] gap-2.5 min-h-0 narrow:grid-rows-[max-content_max-content_210px]">
          {/* The task tabs, and Tiện ích beside them. */}
          <div className="flex items-center gap-1.5 min-w-0">
            <Tabs<Task>
              className="flex-auto min-w-0"
              id={tabs}
              label="Việc của nick"
              value={task}
              onChange={setTask}
              tabs={[
                { key: "quest", label: "Nhiệm vụ", icon: "scroll", busy: !!c?.questRun && c.questRun.done == null },
                { key: "fight", label: "Đánh quái", icon: "sword", busy: !!c?.job && c.job.done == null },
                { key: "settings", label: "Cài đặt đánh", icon: "settings" },
                { key: "bag", label: "Túi đồ", icon: "gem" },
              ]}
            />
            {/* Tiện ích opens as a large modal: the 14 shops, Gộp đá, Nâng cấp, Đổi lượng, Hòm thư, Mã quà tặng (ShopModal). */}
            <Button
              kind="outline"
              small
              icon="grid"
              // A line of the fighting colour along its bottom while Pháp sư works or gift codes go out.
              className={cn(
                "flex-none",
                ((c?.smith && c.smith.done == null) || (c?.gift && c.gift.done == null)) && "shadow-[inset_0_-3px_0_var(--s-fighting)]",
              )}
              onClick={() => open({ kind: "shop", id })}
            >
              Tiện ích
              {/* A mail not read yet (s2c/1220), as the red mark of the game's Thư button. */}
              {c?.mailbox.unread && <i className="size-1.5 bg-danger" role="img" aria-label="có thư chưa đọc" />}
            </Button>
          </div>
          <TabPanel id={tabs} value={task}>
            {task === "quest" ? (
              <QuestCard account={account} onStart={(losses, step) => api.quest(id, losses, step)} onStop={onStop} />
            ) : task === "bag" ? (
              <InventoryCard account={account} onAction={(action, slot) => api.itemAction(id, action, slot)} />
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

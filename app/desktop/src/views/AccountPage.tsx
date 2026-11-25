import { useId, useState } from "react";
import { api } from "@/api";
import { TabPanel, Tabs } from "@/components/Tabs";
import { forget, recalled, remember } from "@/utils/remember";
import { QR_TAB, tabOwner } from "@/utils/qrPayload";
import { selectedLog, useStore } from "@/store";
import type { Account } from "@/api/types";
import { useFightSetting } from "@/hooks/useFightSetting";
import { CaptchaPanel, captchaShown } from "./CaptchaPanel";
import { FightCard, type FightChoice } from "./FightCard";
import { FightSettingsCard } from "./FightSettingsCard";
import { HeroCard } from "./HeroCard";
import { InventoryCard } from "./InventoryCard";
import { LogCard } from "./LogCard";
import { MetricRow } from "./MetricRow";
import { QuestCard } from "./QuestCard";
import { cn } from "@/utils/cn";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { StatsCard } from "./StatsCard";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { usePhone } from "@/hooks/usePhone";
import { isConnected } from "@/utils/format";
import type { IconName } from "@/components/Icon";

// Kỹ năng is a modal of the Chỉ số card (SkillsModal), Thống kê one of the header (StatsModal); a tab kept as "skills"
// or "stats" opens Nhiệm vụ.
type Task = "quest" | "fight" | "settings" | "bag";
const TASKS: Task[] = ["quest", "fight", "settings", "bag"];
/** localStorage keys (utils/remember.ts): the open tab of an account, and the tab last opened on any account. */
const tabKey = (id: number) => `tab.${id}`;
const LAST_TAB = "tab.last";
/** A phone's tabs at the bottom (PhoneAccount): Nhân vật (the hero, HP, EXP, money, Chỉ số) and Nhật ký besides the four
 * tasks, as one screen each; the one last opened is kept, for every account. */
type PhoneTab = Task | "char" | "log";
const PHONE_TABS: PhoneTab[] = ["char", "quest", "fight", "settings", "bag", "log"];
const PHONE_TAB = "tab.phone";

/** The tab kept for the account (QR nick shares it): its own, else the one last opened on any account; null when none. */
export const keptTabOf = (id: number) => recalled(tabKey(id)) ?? recalled(LAST_TAB);

/** The tab a QR nick brought for the account (QR_TAB, kept from then on as its own), else the tab it had open, else the
 * one last opened on any account, else Nhiệm vụ. */
function keptTask(id: number, owner: string): Task {
  const shared = TASKS.find((t) => t === recalled(QR_TAB + owner));
  if (shared) {
    forget(QR_TAB + owner);
    remember(tabKey(id), shared);
    return shared;
  }
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
  const bagFull = !!c?.bag && c.bag.capacity > 0 && c.bag.items.length >= c.bag.capacity;
  const id = account.id;
  const logLines = useStore(selectedLog);
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
  const [task, setTaskState] = useState(() => keptTask(id, tabOwner(account.username, account.serverId)));
  const setTask = (t: Task) => {
    setTaskState(t);
    remember(tabKey(id), t);
    remember(LAST_TAB, t);
  };
  const tabs = useId();
  const phone = usePhone();
  const [phoneTab, setPhoneTabState] = useState<PhoneTab>(() => PHONE_TABS.find((t) => t === recalled(PHONE_TAB)) ?? "quest");
  const setPhoneTab = (t: PhoneTab) => {
    setPhoneTabState(t);
    remember(PHONE_TAB, t);
  };
  const targets = c?.targets ?? [];
  // The chosen target, else the one Gợi ý quái says to farm, else the strongest mob, else the first (a boss).
  const target = targets.some((t) => t.name === choice.target)
    ? choice.target
    : (targets.find((t) => t.farm?.best) ?? targets.find((t) => !t.boss) ?? targets[0])?.name ?? "";
  const hero = (
    <HeroCard
      account={account}
      onLogin={() => api.login(id)}
      onLogout={() => api.logout(id)}
      onRemove={() => open({ kind: "remove", id })}
      onPlace={() => open({ kind: "place", id })}
      onStats={() => open({ kind: "battles", id })}
    />
  );
  const metrics = <MetricRow character={c} onWelfare={() => open({ kind: "welfare", id })} />;
  const stats = (
    <StatsCard
      account={account}
      onAdd={(stat) => api.addStat(id, stat)}
      onPlan={() => open({ kind: "stats", id })}
      onSkills={() => open({ kind: "skills", id })}
    />
  );
  const taskCard = (t: Task) =>
    t === "quest" ? (
      <QuestCard account={account} onStart={(losses, step) => api.quest(id, losses, step)} onStop={onStop} />
    ) : t === "bag" ? (
      <InventoryCard
        account={account}
        onAction={(action, slot, uuid) => api.itemAction(id, action, slot, uuid)}
        onDiscardMany={(items) => api.discardMany(id, items)}
        onBreakAll={(slot, uuid) => api.breakAll(id, slot, uuid)}
        onStop={onStop}
      />
    ) : t === "settings" ? (
      <FightSettingsCard account={account} />
    ) : (
      <FightCard
        account={account}
        choice={{ ...choice, target }}
        onChoice={setChoice}
        onStart={() => api.fight(id, target, choice.count, choice.losses)}
        onStop={onStop}
      />
    );
  const log = <LogCard id={id} lines={logLines} fighting={!!c?.battle} />;
  // Xác nhận người chơi: on this account's page only, above what it shows (CaptchaPanel), whatever tab is open.
  const captcha = <CaptchaPanel account={account} />;
  const shopBusy = (c?.smith && c.smith.done == null) || (c?.gift && c.gift.done == null);

  if (phone) {
    const busy: Partial<Record<PhoneTab, boolean>> = {
      quest: !!c?.questRun && c.questRun.done == null,
      fight: !!c?.job && c.job.done == null,
    };
    const items: { key: PhoneTab; label: string; icon: IconName; alert?: boolean }[] = [
      { key: "char", label: "Nhân vật", icon: "user" },
      { key: "quest", label: "Nhiệm vụ", icon: "scroll" },
      { key: "fight", label: "Đánh quái", icon: "sword" },
      { key: "settings", label: "Cài đặt", icon: "settings" },
      { key: "bag", label: "Túi đồ", icon: "gem", alert: bagFull },
      { key: "log", label: "Nhật ký", icon: "list" },
    ];
    return (
      <div className="grid grid-rows-[auto_minmax(0,1fr)_auto] h-full">
        <PhoneBar account={account} shopBusy={!!shopBusy} onShop={() => open({ kind: "shop", id })} />
        {/* The screen of the tab. */}
        {phoneTab === "log" && !captchaShown(account) ? (
          <div className="grid grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,1fr)] min-h-0 p-2.5">{log}</div>
        ) : (
          // One column as wide as the screen: an auto column would grow to a card's longest line and push it off the screen.
          <div className="min-h-0 overflow-y-auto scroll grid grid-cols-[minmax(0,1fr)] [align-content:start] gap-2.5 p-2.5">
            {captcha}
            {phoneTab === "log" ? (
              // Under the captcha the log scrolls with the page: it keeps a height of its own.
              <div className="grid grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,1fr)] h-[60vh]">{log}</div>
            ) : phoneTab === "char" ? (
              <>
                {hero}
                {metrics}
                {stats}
              </>
            ) : (
              taskCard(phoneTab)
            )}
          </div>
        )}
        {/* The tabs at the bottom, within reach of a thumb. */}
        <nav className="grid grid-cols-6 bg-bg-2 border-t-[length:var(--px)] border-t-ink" aria-label="Việc của nick">
          {items.map((t) => (
            <button
              key={t.key}
              type="button"
              className={cn(
                "relative grid justify-items-center content-center gap-0.5 h-14 px-0.5 border-0 bg-transparent text-fg-3 cursor-pointer",
                "aria-[current=page]:text-fg aria-[current=page]:bg-card aria-[current=page]:shadow-[inset_0_3px_0_var(--primary)]",
                t.alert && "text-danger animate-alarm",
              )}
              aria-current={phoneTab === t.key ? "page" : undefined}
              onClick={() => setPhoneTab(t.key)}
            >
              <Icon name={t.icon} size={18} />
              <span className="text-10 font-bold leading-none whitespace-nowrap">{t.label}</span>
              {busy[t.key] && <i className="absolute top-1.5 right-[calc(50%-16px)] size-1.5 bg-s-fighting animate-blink" role="img" aria-label="đang chạy" />}
            </button>
          ))}
        </nav>
      </div>
    );
  }

  // As tall as the window, so the bottom cards take what is left (and scroll inside); below 800 px the page scrolls.
  // Narrow windows (up to 1120 px): the page grows with its cards and scrolls.
  return (
    <div
      className={cn(
        "grid gap-3 h-full min-h-[700px] narrow:h-auto narrow:min-h-full",
        captchaShown(account) ? "grid-rows-[auto_auto_auto_minmax(0,1fr)]" : "grid-rows-[auto_auto_minmax(0,1fr)]",
      )}
    >
      {captcha}
      {hero}
      {/* Row 2: HP and EXP, the money, and Chỉ số beside them (under them in a narrow window), so the tabs and the log
          below take the whole width. */}
      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(450px,1fr)] gap-3 narrow:grid-cols-1">
        {metrics}
        {stats}
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
              // A full bag blinks: nothing more is picked up, bought or taken off until slots are freed.
              { key: "bag", label: "Túi đồ", icon: "gem", ...(bagFull && { alert: "Đầy", alertLabel: "túi đồ đã đầy" }) },
            ]}
          />
          {/* Tiện ích opens as a large modal: the 14 shops, Gộp đá, Nâng cấp, Đổi lượng, Hòm thư, Mã quà tặng (ShopModal). */}
          <Button
            kind="outline"
            small
            icon="grid"
            // A line of the fighting colour along its bottom while Pháp sư works or gift codes go out; blinking red as the
            // Túi đồ tab when full while a mail is not read yet (s2c/1220), until Hòm thư has them all read.
            className={cn(
              "flex-none",
              shopBusy && "shadow-[inset_0_-3px_0_var(--s-fighting)]",
              c?.mailbox.unread && "animate-alarm",
            )}
            title={c?.mailbox.unread ? "Có thư chưa đọc: mở Hòm thư trong Tiện ích" : undefined}
            onClick={() => open({ kind: "shop", id })}
          >
            Tiện ích
            {/* A mail not read yet, as the red mark of the game's Thư button. */}
            {c?.mailbox.unread && (
              <span className="inline-flex text-danger" role="img" aria-label="có thư chưa đọc">
                <Icon name="mail" size={13} />
              </span>
            )}
          </Button>
        </div>
        <TabPanel id={tabs} value={task}>
          {taskCard(task)}
        </TabPanel>
        {log}
      </div>
    </div>
  );
}

/** The top of an account's screen on a phone: back to the list, the picture, name, level and status, Đăng nhập or
 * Đăng xuất, and Tiện ích (its line along the bottom while Pháp sư works, red while a mail is not read). */
function PhoneBar({ account: a, shopBusy, onShop }: { account: Account; shopBusy: boolean; onShop: () => void }) {
  const c = a.character;
  const connected = isConnected(a.status);
  return (
    <header className="flex items-center gap-2 px-1.5 py-1.5 bg-bg-2 border-b-[length:var(--px)] border-b-ink">
      <Button kind="ghost" icon="chevron" aria-label="Danh sách nick" className="[&_svg]:rotate-90" onClick={useStore.getState().showList} />
      <Avatar name={a.username} status={a.status} size={30} />
      <div className="flex-1 min-w-0 grid">
        <span className="flex items-center gap-1.5 min-w-0">
          <b className="truncate text-14 text-fg">{c?.name ?? a.label}</b>
          {c && <Badge className="shrink-0">LV {c.level}</Badge>}
        </span>
        <span className="truncate text-11 text-fg-3">
          {a.statusText}
          {c ? ` · ${c.mapName} · Khu ${c.zone}` : ""}
        </span>
      </div>
      <Button
        kind={connected ? "ghost" : "primary"}
        icon={connected ? "logout" : "login"}
        aria-label={connected ? "Đăng xuất" : "Đăng nhập"}
        disabled={a.status === 1}
        onClick={() => (connected ? api.logout(a.id) : api.login(a.id))}
      />
      <Button
        kind="outline"
        icon="grid"
        aria-label={c?.mailbox.unread ? "Tiện ích (có thư chưa đọc)" : "Tiện ích"}
        className={cn(shopBusy && "shadow-[inset_0_-3px_0_var(--s-fighting)]", c?.mailbox.unread && "animate-alarm")}
        onClick={onShop}
      />
    </header>
  );
}

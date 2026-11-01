import { Badge } from "@/components/Badge";
import { Bar } from "@/components/Bar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DetailsToggle } from "@/components/DetailsToggle";
import { Elapsed } from "@/components/Elapsed";
import { Icon } from "@/components/Icon";
import { mobIcon } from "@/game/mobIcons";
import { Stepper } from "@/components/Stepper";
import { cn } from "@/utils/cn";
import { num } from "@/utils/format";
import { useStore } from "@/store";
import { api } from "@/api";
import type { Account, Character, MapChoice } from "@/api/types";
import { BattlePanel } from "./BattlePanel";
import { LootRow } from "./LootRow";
import { LOSSES_LEFT_HINT, LossesLeftField } from "./LossesLeftField";

/** The mob's own picture (npm run mobs) in the box of its row; the crown of a boss or the sword when there is none. */
function TargetIcon({ name, boss }: { name: string; boss: boolean }) {
  const src = mobIcon(name);
  if (!src) return <Icon name={boss ? "crown" : "sword"} size={13} />;
  return <img src={src} alt="" draggable={false} className="w-[22px] h-[22px] object-contain" />;
}

/** The kinds of mobs of a map to name for a character of `level`: the strongest not above it, up to three; the weakest
 * when all are above. */
function fitting(map: MapChoice, level: number) {
  const kinds = map.mobs.filter((k) => !k.boss);
  const fit = kinds.filter((k) => k.level <= level).sort((a, b) => b.level - a.level).slice(0, 3);
  return fit.length ? fit : kinds.sort((a, b) => a.level - b.level).slice(0, 1);
}

/** When the zone has no mob: whether the atlas says the map has none at all (M25 Rìa Hồng Giang), and the two nearest
 * maps a known way leads to, without a level missing, that have mobs. */
function elsewhere(c: Character) {
  const here = c.maps.find((m) => m.mapId === c.mapId);
  const none = !here || here.mobs.every((k) => k.boss);
  const near = c.maps.filter((m) => m.mapId !== c.mapId && m.hops != null && m.need == null && m.mobs.some((k) => !k.boss));
  return { none, near: none ? near.slice(0, 2) : [] };
}

/** The list when the zone has no mob: why, and where to go with Đi tới (Đổi map). */
function NoMobs({ account, busy }: { account: Account; busy: boolean }) {
  const c = account.character!;
  const { none, near } = elsewhere(c);
  return (
    <div className={cn(LIST, "gap-1.5 px-2 py-1.5")} role="status">
      <p className="m-0 text-12 text-fg-3">
        {none ? `${c.mapName} không có quái ở khu nào.` : "Không có quái ở khu này."}
        {near.length > 0 && " Map gần có quái:"}
      </p>
      {near.map((m) => (
        <div key={m.mapId} className="flex items-center gap-2 px-1.5 py-1 bg-bg-2">
          <span className="flex-1 min-w-0">
            <b className="text-12 text-fg">{m.name}</b>
            <span className="text-11 text-fg-3"> · {m.hops} cổng</span>
            <span className="block truncate text-11 text-fg-2">
              {fitting(m, c.level)
                .map((k) => `${k.name} ${k.level}`)
                .join(", ")}
            </span>
          </span>
          <Button small icon="swap" disabled={busy} title={`Đổi map tới ${m.name}`} onClick={() => void api.goToMap(account.id, m.mapId)}>
            Đi tới
          </Button>
        </div>
      ))}
    </div>
  );
}

/** In place of the Thua tối đa field of a fight job against a boss: "Thua boss không tính", as tall as the field. */
const LOSSES_LEFT = "inline-flex items-center gap-1 h-[30px] text-[11.5px] font-semibold text-fg-2 whitespace-nowrap [&_b]:text-13 [&_b]:text-danger";

/* narrow: (up to 1120 px, tailwind.css) puts the list over the controls, the controls two by two. */
/** The list of mobs and bosses beside the controls. */
const GRID = "grid grid-cols-[minmax(0,1fr)_208px] gap-2.5 narrow:grid-cols-[1fr]";
const LIST = "p-[3px] h-[150px] bg-ink flex flex-col gap-1 narrow:h-[120px] scroll";
/** A row of the list of mobs and bosses (also the one saying there is none). */
const TARGET = "flex-none flex items-center gap-2 h-[30px] py-0 pr-2 pl-[5px] border-2 border-transparent";
/** Số trận, Thua tối đa, the buttons. */
const CONTROLS =
  "grid [align-content:start] gap-2.5 narrow:grid-cols-[auto_minmax(0,1fr)] narrow:items-center narrow:gap-y-1.5 narrow:gap-x-3";
/** A row of the controls: its name and its field. */
const ROW = "flex items-center justify-between gap-1.5 narrow:justify-start";
const LABEL = "text-11 font-bold text-fg-2 whitespace-nowrap narrow:min-w-18";
/** The fight job, or the battle on without one. */
const JOB = "grid gap-2 p-2.5 bg-ink";
const JOB_HEAD = "flex items-center gap-2.5 text-11";
const JOB_TITLE = "min-w-0 font-extrabold text-12 truncate";

export interface FightChoice {
  target: string;
  count: number;
  losses: number;
}

interface Props {
  account: Account;
  choice: FightChoice;
  onChoice: (c: FightChoice) => void;
  onStart: () => void;
  onStop: () => void;
}

/** The fight job: a mob or boss of the zone, how many battles, how many losses to allow (typed in or stepped); start,
 * stop, progress, and the HP of the battle on under Chi tiết. */
export function FightCard({ account, choice, onChoice, onStart, onStop }: Props) {
  const c = account.character;
  const targets = c?.targets ?? [];
  const job = c?.job;
  const running = !!job && job.done == null;
  // Losses to a boss never end the job (Bot::on_battle_end).
  const bossJob = !!job && targets.some((t) => t.name === job.target && t.boss);
  // One task at a time: a quest run is stopped first (Bot::fight refuses too).
  const questing = !!c?.questRun && c.questRun.done == null;
  const battle = c?.battle;
  const details = useStore((s) => s.battleDetails);
  const toggle = useStore((s) => s.toggleBattleDetails);
  const set = (patch: Partial<FightChoice>) => onChoice({ ...choice, ...patch });
  return (
    <Card title="Tự đánh" icon="sword" tone="var(--accent)" subtitle="Quái và boss ở khu đang đứng">
      <div className={GRID}>
      {c && targets.length === 0 ? (
        <NoMobs account={account} busy={running || questing || !!battle} />
      ) : (
      <ul className={LIST} role="listbox" aria-label="Chọn quái hoặc boss">
        {targets.length === 0 && (
          <li className={cn(TARGET, "cursor-default text-fg-3 justify-center")}>Đăng nhập để thấy quái và boss</li>
        )}
        {targets.map((t) => (
          <li
            key={t.name}
            role="option"
            tabIndex={0}
            aria-selected={t.name === choice.target}
            className={cn(
              TARGET,
              "bg-bg-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
              // The one chosen keeps its colour under the pointer.
              t.name === choice.target ? "bg-card-2 border-primary" : "hover:bg-card",
            )}
            onClick={() => set({ target: t.name })}
            onKeyDown={(e) => e.key === "Enter" && set({ target: t.name })}
          >
            <span className={cn("grid place-items-center w-[22px] h-[22px] text-fg-2 bg-card", t.boss && "text-ink bg-accent bevel-sm")}>
              <TargetIcon name={t.name} boss={t.boss} />
            </span>
            <span className="flex-1 min-w-0 truncate text-12 font-bold">{t.name}</span>
            {!t.here && <span className="flex-none text-10 text-coin">đang đổi chỗ</span>}
            {t.boss && <Badge tone="var(--accent)">BOSS</Badge>}
            <span className="flex-none min-w-11 text-right text-11 text-fg-2 px">LV {t.level}</span>
          </li>
        ))}
      </ul>
      )}

      <div className={CONTROLS}>
        <div className={ROW}>
          <span className={LABEL}>Số trận</span>
          <Stepper label="số trận" max={999} value={choice.count} onChange={(count) => set({ count })} />
        </div>
        <div className={ROW}>
          {/* While the job goes on, the losses it may still take, changed in place (against a boss, which never ends it, a
              word instead); after Dừng Thua tối đa again, as saved. */}
          {running && bossJob ? (
            <span className={LOSSES_LEFT}>Thua boss không tính</span>
          ) : running ? (
            <>
              <span className={LABEL} title={LOSSES_LEFT_HINT}>
                Thua còn lại
              </span>
              <LossesLeftField id={account.id} max={job.maxLosses} losses={job.losses} />
            </>
          ) : (
            <>
              <span className={LABEL}>Thua tối đa</span>
              <Stepper label="số trận thua" value={choice.losses} onChange={(losses) => set({ losses })} />
            </>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button kind="primary" icon="play" className="flex-1" disabled={account.status !== 2 || !choice.target || questing} onClick={onStart}>
            Bắt đầu
          </Button>
          <Button kind="danger" icon="stop" className="flex-1" disabled={!running && !battle} onClick={onStop}>
            Dừng
          </Button>
        </div>
        {questing && <p className="text-[10.5px] text-primary">Đang tự làm nhiệm vụ: bấm Dừng ở tab Nhiệm vụ rồi mới đánh quái.</p>}
      </div>
      </div>

      {job && (
        <div className={JOB}>
          <div className={JOB_HEAD}>
            <span className={JOB_TITLE}>
              {job.target}: trận <span className="px">{job.fights}/{job.count}</span>
            </span>
            {battle && <DetailsToggle open={details} onToggle={toggle} controls="fight-battle" />}
            <span className="ml-auto text-fg-2 whitespace-nowrap">
              <b className="text-s-online">{job.wins} thắng</b> · <b className="text-danger">{job.losses} thua</b> · +{num(job.exp)} EXP · +{num(job.coin)} xu ·{" "}
              <Elapsed from={job.startedAt} to={job.endedAt} />
            </span>
          </div>
          <Bar value={job.fights / Math.max(1, job.count)} />
          <LootRow items={job.picked} />
          {job.done && <div className="text-11 text-coin">{job.done}</div>}
          {battle && details && <BattlePanel battle={battle} id="fight-battle" />}
        </div>
      )}
      {/* A battle with no fight job here: a quest run's, also one played out after Dừng. */}
      {!job && battle && (
        <div className={JOB}>
          <div className={JOB_HEAD}>
            <span className={JOB_TITLE}>Đang đánh {battle.mobName}</span>
            <DetailsToggle open={details} onToggle={toggle} controls="fight-battle" />
          </div>
          {details && <BattlePanel battle={battle} id="fight-battle" />}
        </div>
      )}
    </Card>
  );
}

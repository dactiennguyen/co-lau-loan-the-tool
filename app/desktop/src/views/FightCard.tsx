import { Badge } from "../components/Badge";
import { Bar } from "../components/Bar";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { DetailsToggle } from "../components/DetailsToggle";
import { Elapsed } from "../components/Elapsed";
import { Icon } from "../components/Icon";
import { Stepper } from "../components/Stepper";
import { num } from "../format";
import { useStore } from "../store";
import type { Account } from "../types";
import { BattlePanel } from "./BattlePanel";
import { LootRow } from "./LootRow";
import { LOSSES_LEFT_HINT, LossesLeftField } from "./LossesLeftField";
import "./FightCard.css";

/** In place of the Thua tối đa field of a fight job against a boss: "Thua boss không tính", as tall as the field. */
const LOSSES_LEFT = "inline-flex items-center gap-1 h-[30px] text-[11.5px] font-semibold text-fg-2 whitespace-nowrap [&_b]:text-13 [&_b]:text-danger";

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
    <Card title="Tự đánh" icon="sword" tone="var(--accent)" subtitle="Quái và boss ở khu đang đứng" className="fight">
      <div className="fight__grid">
      <ul className="targets scroll" role="listbox" aria-label="Chọn quái hoặc boss">
        {targets.length === 0 && <li className="targets__empty">{c ? "Không có quái ở khu này" : "Đăng nhập để thấy quái và boss"}</li>}
        {targets.map((t) => (
          <li
            key={t.name}
            role="option"
            tabIndex={0}
            aria-selected={t.name === choice.target}
            className={t.name === choice.target ? "is-active" : undefined}
            onClick={() => set({ target: t.name })}
            onKeyDown={(e) => e.key === "Enter" && set({ target: t.name })}
          >
            <span className={`targets__icon${t.boss ? " targets__icon--boss" : ""}`}>
              <Icon name={t.boss ? "crown" : "sword"} size={13} />
            </span>
            <span className="targets__name">{t.name}</span>
            {!t.here && <span className="targets__moving">đang đổi chỗ</span>}
            {t.boss && <Badge tone="var(--accent)">BOSS</Badge>}
            <span className="targets__level px">LV {t.level}</span>
          </li>
        ))}
      </ul>

      <div className="fight__controls">
        <div className="fight__row">
          <span className="fight__label">Số trận</span>
          <Stepper label="số trận" max={999} value={choice.count} onChange={(count) => set({ count })} />
        </div>
        <div className="fight__row">
          {/* While the job goes on, the losses it may still take, changed in place (against a boss, which never ends it, a
              word instead); after Dừng Thua tối đa again, as saved. */}
          {running && bossJob ? (
            <span className={LOSSES_LEFT}>Thua boss không tính</span>
          ) : running ? (
            <>
              <span className="fight__label" title={LOSSES_LEFT_HINT}>
                Thua còn lại
              </span>
              <LossesLeftField id={account.id} max={job.maxLosses} losses={job.losses} />
            </>
          ) : (
            <>
              <span className="fight__label">Thua tối đa</span>
              <Stepper label="số trận thua" value={choice.losses} onChange={(losses) => set({ losses })} />
            </>
          )}
        </div>
        <div className="fight__buttons">
          <Button kind="primary" icon="play" className="flex-1" disabled={account.status !== 2 || !choice.target || questing} onClick={onStart}>
            Bắt đầu
          </Button>
          <Button kind="danger" icon="stop" className="flex-1" disabled={!running && !battle} onClick={onStop}>
            Dừng
          </Button>
        </div>
        {questing && <p className="fight__busy">Đang tự làm nhiệm vụ: bấm Dừng ở tab Nhiệm vụ rồi mới đánh quái.</p>}
      </div>
      </div>

      {job && (
        <div className="job">
          <div className="job__head">
            <span className="job__title">
              {job.target}: trận <span className="px">{job.fights}/{job.count}</span>
            </span>
            {battle && <DetailsToggle open={details} onToggle={toggle} controls="fight-battle" />}
            <span className="job__score">
              <b className="win">{job.wins} thắng</b> · <b className="loss">{job.losses} thua</b> · +{num(job.exp)} EXP · +{num(job.coin)} xu ·{" "}
              <Elapsed from={job.startedAt} to={job.endedAt} />
            </span>
          </div>
          <Bar value={job.fights / Math.max(1, job.count)} />
          <LootRow items={job.picked} />
          {job.done && <div className="job__done">{job.done}</div>}
          {battle && details && <BattlePanel battle={battle} id="fight-battle" />}
        </div>
      )}
      {/* A battle with no fight job here: a quest run's, also one played out after Dừng. */}
      {!job && battle && (
        <div className="job">
          <div className="job__head">
            <span className="job__title">Đang đánh {battle.mobName}</span>
            <DetailsToggle open={details} onToggle={toggle} controls="fight-battle" />
          </div>
          {details && <BattlePanel battle={battle} id="fight-battle" />}
        </div>
      )}
    </Card>
  );
}

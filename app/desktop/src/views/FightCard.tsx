import { Badge } from "../components/Badge";
import { Bar } from "../components/Bar";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Chip } from "../components/Chip";
import { Icon } from "../components/Icon";
import { Stepper } from "../components/Stepper";
import { num } from "../format";
import type { Account } from "../types";
import "./FightCard.css";

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

/** The fight job: a mob or boss of the zone, how many battles, how many losses to allow; start, stop, progress. */
export function FightCard({ account, choice, onChoice, onStart, onStop }: Props) {
  const c = account.character;
  const targets = c?.targets ?? [];
  const job = c?.job;
  const running = !!job && job.done == null;
  const battle = c?.battle;
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
              <Icon name={t.boss ? "crown" : "sword"} size={15} />
            </span>
            <span className="targets__name">{t.name}</span>
            {!t.here && <span className="targets__moving">đang đổi chỗ</span>}
            {t.boss && <Badge tone="var(--accent)">BOSS</Badge>}
            <span className="targets__level">Cấp {t.level}</span>
          </li>
        ))}
      </ul>

      <div className="fight__controls">
        <div className="fight__row">
          <span className="fight__label">Số trận</span>
          <Stepper label="số trận" value={choice.count} onChange={(count) => set({ count })} />
        </div>
        <div className="fight__chips">
          {[5, 10, 20, 50].map((n) => (
            <Chip key={n} active={choice.count === n} onClick={() => set({ count: n })}>
              {n}
            </Chip>
          ))}
        </div>
        <div className="fight__row">
          <span className="fight__label">Thua tối đa</span>
          <Stepper label="số trận thua" max={99} value={choice.losses} onChange={(losses) => set({ losses })} />
        </div>
        <div className="fight__buttons">
          <Button kind="primary" icon="play" disabled={account.status !== 2 || !choice.target} onClick={onStart}>
            Bắt đầu
          </Button>
          <Button kind="danger" icon="stop" disabled={!running} onClick={onStop}>
            Dừng
          </Button>
        </div>
      </div>
      </div>

      {job && (
        <div className="job">
          <div className="job__head">
            <span className="job__title">
              {job.target}: trận {job.fights}/{job.count}
            </span>
            <span className="job__score">
              <b className="win">{job.wins} thắng</b> · <b className="loss">{job.losses} thua</b> · +{num(job.exp)} EXP · +{num(job.coin)} xu
            </span>
          </div>
          <Bar value={job.fights / Math.max(1, job.count)} />
          {job.done && <div className="job__done">{job.done}</div>}
          {battle && (
            <div className="battle">
              <div className="battle__side">
                <span>Bạn</span>
                <b>
                  {num(Math.round(battle.hp))}/{num(Math.round(battle.maxHp))}
                </b>
                <Bar value={battle.hp / Math.max(1, battle.maxHp)} fill="var(--grad-hp)" thin />
              </div>
              <span className="battle__vs">
                VS
                <small>lượt {battle.turns}</small>
              </span>
              <div className="battle__side">
                <span title={battle.mobName}>{battle.mobName}</span>
                <b>{battle.mobHp != null && battle.mobMaxHp ? `${num(Math.round(battle.mobHp))}/${num(Math.round(battle.mobMaxHp))}` : "?"}</b>
                <Bar value={battle.mobHp != null && battle.mobMaxHp ? battle.mobHp / battle.mobMaxHp : 0} fill="var(--grad-primary)" thin />
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

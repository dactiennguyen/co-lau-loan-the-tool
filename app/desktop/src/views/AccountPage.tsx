import { useState } from "react";
import type { Account, LogLine } from "../types";
import { FightCard, type FightChoice } from "./FightCard";
import { HeroCard } from "./HeroCard";
import { LogCard } from "./LogCard";
import { MetricRow } from "./MetricRow";
import { PlayersCard } from "./PlayersCard";
import { StatsCard } from "./StatsCard";
import "./AccountPage.css";

interface Props {
  account: Account;
  log: LogLine[];
  onLogin: () => void;
  onLogout: () => void;
  onRemove: () => void;
  onFight: (target: string, count: number, maxLosses: number) => void;
  onStop: () => void;
}

/** Everything about the selected account. Mounted per account (key), so the fight choice starts fresh for each. */
export function AccountPage({ account, log, onLogin, onLogout, onRemove, onFight, onStop }: Props) {
  const c = account.character;
  const [choice, setChoice] = useState<FightChoice>({ target: "", count: 5, losses: 1 });
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
        <div className="page__stack">
          <FightCard
            account={account}
            choice={{ ...choice, target }}
            onChoice={setChoice}
            onStart={() => onFight(target, choice.count, choice.losses)}
            onStop={onStop}
          />
          <LogCard lines={log} />
        </div>
      </div>
    </div>
  );
}

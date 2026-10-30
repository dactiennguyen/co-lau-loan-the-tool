import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { Bar } from "../components/Bar";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Pill } from "../components/Pill";
import { isConnected } from "../format";
import type { Account } from "../types";
import "./AccountCard.css";

interface Props {
  account: Account;
  active: boolean;
  onSelect: () => void;
  onLogin: () => void;
  onLogout: () => void;
}

/** One account in the sidebar: name, level, where it is (or the error), status, HP and players around, login/logout. */
export function AccountCard({ account: a, active, onSelect, onLogin, onLogout }: Props) {
  const c = a.character;
  const connected = isConnected(a.status);
  const line = a.status === 4 ? a.error : c ? `${c.mapName} · Khu ${c.zone}` : a.label !== a.username ? a.username : a.statusText;
  return (
    <div
      className={`acard${active ? " acard--active" : ""}`}
      role="button"
      tabIndex={0}
      aria-current={active}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect())}
    >
      <Avatar name={a.username} status={a.status} />
      <div className="acard__body">
        <div className="acard__top">
          <span className="acard__name">{c?.name ?? a.label}</span>
          {c && <Badge>Cấp {c.level}</Badge>}
        </div>
        <div className={`acard__line${a.status === 4 ? " acard__line--error" : ""}`} title={line}>
          {line}
        </div>
        <div className="acard__bottom">
          <Pill status={a.status} text={a.statusText} />
          {c && (
            <>
              <div className="acard__hp" title={`HP ${c.hp}/${c.maxHp}`}>
                <Bar value={c.hp / Math.max(1, c.maxHp)} fill="var(--grad-hp)" thin />
              </div>
              <span className="acard__people" title={`${c.players.length} người khác trong khu`}>
                <Icon name="users" size={13} />
                {c.players.length}
              </span>
            </>
          )}
        </div>
      </div>
      <Button
        kind={connected ? "ghost" : "tonal"}
        small
        icon={connected ? "logout" : "login"}
        aria-label={connected ? "Đăng xuất" : "Đăng nhập"}
        disabled={a.status === 1}
        onClick={(e) => {
          e.stopPropagation();
          if (connected) onLogout();
          else onLogin();
        }}
      />
    </div>
  );
}

import { memo, useId } from "react";
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
  onSelect: (id: number) => void;
  onLogin: (id: number) => void;
  onLogout: (id: number) => void;
  /** Right click, the menu key or Shift+F10: the account's menu at (x, y). */
  onMenu: (id: number, x: number, y: number) => void;
}

/**
 * One account in the sidebar: name, level, where it is (or the error), status, HP and players around, login/logout.
 * Two controls side by side, none inside another: the name is the button that selects (it carries the place and status
 * as its description), and login/logout. A click anywhere else on the card selects too, for the mouse.
 * Memoised: an update of one account leaves the others the same objects (hooks.ts), so only its card renders.
 */
export const AccountCard = memo(function AccountCard({ account: a, active, onSelect, onLogin, onLogout, onMenu }: Props) {
  const c = a.character;
  const connected = isConnected(a.status);
  const line = a.status === 4 ? a.error : c ? `${c.mapName} · Khu ${c.zone}` : a.label !== a.username ? a.username : a.statusText;
  const id = useId();
  return (
    <div
      className={`acard${active ? " acard--active" : ""}`}
      onClick={() => onSelect(a.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(a.id, e.clientX, e.clientY);
      }}
    >
      <Avatar name={a.username} status={a.status} />
      <div className="acard__body">
        <div className="acard__top">
          <button
            type="button"
            className="acard__select"
            aria-current={active || undefined}
            aria-describedby={`${id}line ${id}status`}
            onKeyDown={(e) => {
              if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                e.preventDefault();
                const r = e.currentTarget.closest(".acard")!.getBoundingClientRect();
                onMenu(a.id, r.left + 12, r.bottom - 6);
              }
            }}
          >
            {c?.name ?? a.label}
          </button>
          {c && <Badge>LV {c.level}</Badge>}
        </div>
        <div id={`${id}line`} className={`acard__line${a.status === 4 ? " acard__line--error" : ""}`} title={line}>
          {line}
        </div>
        <div className="acard__bottom">
          <Pill id={`${id}status`} status={a.status} text={a.statusText} />
          {c && (
            <>
              <div className="acard__hp" title={`HP ${c.hp}/${c.maxHp}`}>
                <Bar value={c.hp / Math.max(1, c.maxHp)} fill="var(--hp)" thin />
              </div>
              <span className="acard__people px" title={c.playersKnown ? `${c.players.length} người khác trong khu` : "Chưa đọc được danh sách người trong khu"}>
                <Icon name="users" size={12} />
                {c.playersKnown ? c.players.length : "?"}
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
          if (connected) onLogout(a.id);
          else onLogin(a.id);
        }}
      />
    </div>
  );
});

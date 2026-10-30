import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import type { Account } from "../types";
import { AccountCard } from "./AccountCard";
import "./Sidebar.css";

interface Props {
  accounts: Account[];
  /** accounts.json could not be read. */
  error: string | null;
  selected: number | null;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onLogin: (id: number) => void;
  onLogout: (id: number) => void;
  onLoginAll: () => void;
  onLogoutAll: () => void;
}

/** Brand, "Thêm nick", the accounts, and login/logout of every account. Its top strip drags the window. */
export function Sidebar({ accounts, error, selected, onSelect, onAdd, onLogin, onLogout, onLoginAll, onLogoutAll }: Props) {
  const inGame = accounts.filter((a) => a.status === 2 || a.status === 3).length;
  return (
    <aside className="sidebar">
      <div className="sidebar__drag" data-tauri-drag-region />
      <div className="brand">
        <span className="brand__logo">
          <Icon name="flag" size={22} />
        </span>
        <div>
          <div className="brand__name">Cờ Lau Loạn Thế</div>
          <div className="brand__summary">
            {accounts.length} nick · <b>{inGame}</b> đang trong game
          </div>
        </div>
      </div>
      <Button kind="primary" icon="plus" block onClick={onAdd}>
        Thêm nick
      </Button>
      {error && (
        <p className="sidebar__error selectable" role="alert">
          Không đọc được accounts.json, app sẽ không ghi đè file này. Sửa file rồi mở lại app. ({error})
        </p>
      )}
      <div className="sidebar__label">Tài khoản</div>
      <div className="sidebar__list scroll">
        {accounts.length === 0 && <p className="sidebar__empty">Chưa có nick nào.</p>}
        {accounts.map((a) => (
          <AccountCard
            key={a.id}
            account={a}
            active={a.id === selected}
            onSelect={() => onSelect(a.id)}
            onLogin={() => onLogin(a.id)}
            onLogout={() => onLogout(a.id)}
          />
        ))}
      </div>
      <div className="sidebar__footer">
        <Button kind="outline" icon="bolt" block disabled={accounts.length === 0} onClick={onLoginAll}>
          Đăng nhập tất cả
        </Button>
        <Button kind="outline" icon="logout" aria-label="Đăng xuất tất cả" disabled={accounts.length === 0} onClick={onLogoutAll} />
      </div>
    </aside>
  );
}

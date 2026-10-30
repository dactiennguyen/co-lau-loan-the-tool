import { useCallback, useState } from "react";
import { Button } from "../components/Button";
import { Menu, type MenuItem } from "../components/Menu";
import appIcon from "../../app-icon.png";
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
  onEdit: (id: number) => void;
  /** Asks first (App). */
  onRemove: (id: number) => void;
  onLoginAll: () => void;
  onLogoutAll: () => void;
}

type Actions = Pick<Props, "onLogin" | "onLogout" | "onEdit" | "onRemove">;

/** The menu of an account: log in, or log out (cancel while connecting); edit; remove once it has no session. */
function accountMenu(a: Account, { onLogin, onLogout, onEdit, onRemove }: Actions): MenuItem[] {
  const session = a.status >= 1 && a.status <= 3;
  return [
    a.status === 1
      ? { label: "Huỷ đăng nhập", icon: "close", onSelect: () => onLogout(a.id) }
      : session
        ? { label: "Đăng xuất", icon: "logout", onSelect: () => onLogout(a.id) }
        : { label: "Đăng nhập", icon: "login", onSelect: () => onLogin(a.id) },
    { label: "Sửa nick", icon: "pencil", onSelect: () => onEdit(a.id) },
    { label: "Xoá nick", icon: "trash", danger: true, separated: true, disabled: session, hint: "Đăng xuất trước", onSelect: () => onRemove(a.id) },
  ];
}

/** Brand, "Thêm nick", the accounts with their menus, and login/logout of every account. Its top strip drags the window. */
export function Sidebar({ accounts, error, selected, onSelect, onAdd, onLogin, onLogout, onEdit, onRemove, onLoginAll, onLogoutAll }: Props) {
  const inGame = accounts.filter((a) => a.status === 2 || a.status === 3).length;
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  // Stable, so the memoised cards do not render again for it; the account of the menu is selected too.
  const openMenu = useCallback(
    (id: number, x: number, y: number) => {
      onSelect(id);
      setMenu({ id, x, y });
    },
    [onSelect],
  );
  const closeMenu = useCallback(() => setMenu(null), []);
  const menuAccount = menu && accounts.find((a) => a.id === menu.id);
  return (
    <aside className="sidebar">
      <div className="sidebar__drag" data-tauri-drag-region />
      <div className="brand">
        <img className="brand__logo" src={appIcon} alt="" draggable={false} />
        <div>
          <div className="brand__name">colautool</div>
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
            onSelect={onSelect}
            onLogin={onLogin}
            onLogout={onLogout}
            onMenu={openMenu}
          />
        ))}
      </div>
      {menu && menuAccount && (
        <Menu x={menu.x} y={menu.y} label={`Nick ${menuAccount.label}`} items={accountMenu(menuAccount, { onLogin, onLogout, onEdit, onRemove })} onClose={closeMenu} />
      )}
      <div className="sidebar__footer">
        <Button kind="outline" icon="bolt" block disabled={accounts.length === 0} onClick={onLoginAll}>
          Đăng nhập tất cả
        </Button>
        <Button kind="outline" icon="logout" aria-label="Đăng xuất tất cả" disabled={accounts.length === 0} onClick={onLogoutAll} />
      </div>
    </aside>
  );
}

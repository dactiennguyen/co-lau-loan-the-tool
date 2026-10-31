import { useCallback, useState } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { Menu, type MenuItem } from "../components/Menu";
import appIcon from "../../app-icon.png";
import { inGame, useStore, type Dialog } from "../store";
import type { Account } from "../types";
import { AccountCard } from "./AccountCard";
import { UpdateBox } from "./UpdateBox";
import "./Sidebar.css";

/** The menu of an account: log in, or log out (cancel while connecting); edit; remove once it has no session. */
function accountMenu(a: Account, open: (d: Dialog) => void): MenuItem[] {
  const session = a.status >= 1 && a.status <= 3;
  return [
    a.status === 1
      ? { label: "Huỷ đăng nhập", icon: "close", onSelect: () => api.logout(a.id) }
      : session
        ? { label: "Đăng xuất", icon: "logout", onSelect: () => api.logout(a.id) }
        : { label: "Đăng nhập", icon: "login", onSelect: () => api.login(a.id) },
    { label: "Sửa nick", icon: "pencil", onSelect: () => open({ kind: "edit", id: a.id }) },
    { label: "Xoá nick", icon: "trash", danger: true, separated: true, disabled: session, hint: "Đăng xuất trước", onSelect: () => open({ kind: "remove", id: a.id }) },
  ];
}

/**
 * Brand, "Thêm nick", the accounts with their menus, the update of the app, and login/logout of every account. Its top
 * strip drags the window.
 * It re-renders when the order of the accounts or the count in the game changes; each card follows its own account.
 */
export function Sidebar() {
  const order = useStore((s) => s.order);
  const error = useStore((s) => s.accountsError);
  const playing = useStore(inGame);
  const { select, open } = useStore.getState();
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const menuAccount = useStore((s) => (menu ? s.byId[menu.id] : undefined));
  // Stable, so the memoised cards do not render again for it; the account of the menu is selected too.
  const openMenu = useCallback(
    (id: number, x: number, y: number) => {
      select(id);
      setMenu({ id, x, y });
    },
    [select],
  );
  const closeMenu = useCallback(() => setMenu(null), []);
  return (
    <aside className="sidebar">
      <div className="sidebar__drag" data-tauri-drag-region />
      <div className="brand">
        <img className="brand__logo" src={appIcon} alt="" draggable={false} />
        <div>
          <div className="brand__name">colautool</div>
          <div className="brand__summary">
            {order.length} nick · <b>{playing}</b> đang trong game
          </div>
        </div>
      </div>
      <Button kind="primary" icon="plus" block onClick={() => open({ kind: "add" })}>
        Thêm nick
      </Button>
      {error && (
        <p className="sidebar__error selectable" role="alert">
          Không đọc được accounts.json, app sẽ không ghi đè file này. Sửa file rồi mở lại app. ({error})
        </p>
      )}
      <div className="sidebar__label">Tài khoản</div>
      <div className="sidebar__list scroll">
        {order.length === 0 && <p className="sidebar__empty">Chưa có nick nào.</p>}
        {order.map((id) => (
          <AccountCard key={id} id={id} onMenu={openMenu} />
        ))}
      </div>
      {menu && menuAccount && (
        <Menu x={menu.x} y={menu.y} label={`Nick ${menuAccount.label}`} items={accountMenu(menuAccount, open)} onClose={closeMenu} />
      )}
      <UpdateBox />
      <div className="sidebar__footer">
        <Button kind="outline" icon="bolt" block disabled={order.length === 0} onClick={api.loginAll}>
          Đăng nhập tất cả
        </Button>
        <Button kind="outline" icon="logout" aria-label="Đăng xuất tất cả" disabled={order.length === 0} onClick={api.logoutAll} />
      </div>
    </aside>
  );
}

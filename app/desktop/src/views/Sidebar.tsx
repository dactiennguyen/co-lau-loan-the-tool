import { useCallback, useState } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { Menu, type MenuItem } from "../components/Menu";
import appIcon from "../../app-icon.png";
import { inGame, useStore, type Dialog } from "../store";
import type { Account } from "../types";
import { AccountCard } from "./AccountCard";
import { UpdateBox } from "./UpdateBox";

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
 * Brand with the Cài đặt of the app, "Thêm nick", the accounts with their menus, the update of the app, and login/logout of every account. Its top
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
    // The 40 px top leaves room for the macOS window buttons.
    <aside className="relative flex flex-col gap-3 min-h-0 pt-10 px-3 pb-3 bg-bg-2 border-r-[length:var(--px)] border-r-ink not-mac:pt-3">
      {/* No display class: the base layer of tailwind.css hides the drag strips outside macOS. */}
      <div className="absolute inset-x-0 top-0 h-9" data-tauri-drag-region />
      <div className="flex items-center gap-2.5">
        <img className="block shrink-0 size-[34px] object-contain" src={appIcon} alt="" draggable={false} />
        {/* The name with the Cài đặt button at the right of its line; the summary has the whole width under them. */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <div className="font-pixel font-bold text-15 leading-[1.2] uppercase">colautool</div>
            {/* Above the strip that drags the window, which covers the brand where the window has no room left for its
                buttons; the negative margin keeps the line as tall as the name. */}
            <Button kind="ghost" small icon="settings" aria-label="Cài đặt" className="relative z-1 shrink-0 -my-1.5 -mr-1" onClick={() => open({ kind: "settings" })} />
          </div>
          <div className="text-11 text-fg-3">
            {order.length} nick · <b className="text-s-online font-bold">{playing}</b> đang trong game
          </div>
        </div>
      </div>
      <Button kind="primary" icon="plus" block onClick={() => open({ kind: "add" })}>
        Thêm nick
      </Button>
      {error && (
        <p className="px-2.5 py-2 border-2 border-accent-deep bg-ink text-danger text-11 wrap-anywhere select-text" role="alert">
          Không đọc được accounts.json, app sẽ không ghi đè file này. Sửa file rồi mở lại app. ({error})
        </p>
      )}
      <div className="text-10 font-extrabold tracking-[0.1em] uppercase text-fg-3">Tài khoản</div>
      {/* One column as wide as the sidebar: an auto column would grow to a card's longest line and clip its button. */}
      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)] [align-content:start] gap-1.5 -mx-1 px-1 pb-1 scroll">
        {order.length === 0 && <p className="text-fg-3 text-12">Chưa có nick nào.</p>}
        {order.map((id) => (
          <AccountCard key={id} id={id} onMenu={openMenu} />
        ))}
      </div>
      {menu && menuAccount && (
        <Menu x={menu.x} y={menu.y} label={`Nick ${menuAccount.label}`} items={accountMenu(menuAccount, open)} onClose={closeMenu} />
      )}
      <UpdateBox />
      <div className="flex gap-1.5">
        <Button kind="outline" icon="bolt" block disabled={order.length === 0} onClick={api.loginAll}>
          Đăng nhập tất cả
        </Button>
        <Button kind="outline" icon="logout" aria-label="Đăng xuất tất cả" disabled={order.length === 0} onClick={api.logoutAll} />
      </div>
    </aside>
  );
}

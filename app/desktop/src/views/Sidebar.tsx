import { useCallback, useEffect, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@/api";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Menu, type MenuItem } from "@/components/Menu";
import { BACH_HO_LOCKED, bachHoAllowed, bachHoClock, minutesClock } from "@/game/bachHo";
import { cn } from "@/utils/cn";
import appIcon from "../../app-icon.png";
import { inGame, useStore, type Dialog, type Store } from "@/store";
import { logoutAllText, sessions } from "@/store/sessions";
import type { Account } from "@/api/types";
import { ConfirmDialog } from "@/views/dialogs/ConfirmDialog";
import { AccountCard } from "./AccountCard";

/** The accounts in the order `order`: shown at once, then written to accounts.json; put back with a toast when that
 * fails. */
function reorder(order: number[]) {
  const before = useStore.getState().order;
  useStore.setState({ order });
  api.reorderAccounts(order).catch((err) => {
    useStore.setState({ order: before });
    useStore.getState().toast({ tone: "warn", title: "Tài khoản", text: `Không lưu được thứ tự nick: ${err instanceof Error ? err.message : String(err)}` });
  });
}

/** The account `id` one place up (-1) or down (+1): the keyboard's way to what a drag does. */
function moveBy(id: number, by: -1 | 1) {
  const order = useStore.getState().order;
  const at = order.indexOf(id);
  if (at < 0 || at + by < 0 || at + by >= order.length) return;
  reorder(arrayMove(order, at, at + by));
}

/** The menu of an account: log in, or log out (cancel while connecting); edit; one place up or down; remove once it has
 * no session. */
function accountMenu(a: Account, open: (d: Dialog) => void, order: number[]): MenuItem[] {
  const session = a.status >= 1 && a.status <= 3;
  const at = order.indexOf(a.id);
  return [
    a.status === 1
      ? { label: "Huỷ đăng nhập", icon: "close", onSelect: () => api.logout(a.id) }
      : session
        ? { label: "Đăng xuất", icon: "logout", onSelect: () => api.logout(a.id) }
        : { label: "Đăng nhập", icon: "login", onSelect: () => api.login(a.id) },
    { label: "Sửa nick", icon: "pencil", onSelect: () => open({ kind: "edit", id: a.id }) },
    { label: "Chuyển lên", icon: "upload", separated: true, disabled: at <= 0, hint: "Đã ở đầu danh sách", onSelect: () => moveBy(a.id, -1) },
    { label: "Chuyển xuống", icon: "download", disabled: at < 0 || at >= order.length - 1, hint: "Đã ở cuối danh sách", onSelect: () => moveBy(a.id, 1) },
    { label: "Xoá nick", icon: "trash", danger: true, separated: true, disabled: session, hint: "Đăng xuất trước", onSelect: () => open({ kind: "remove", id: a.id }) },
  ];
}

/** The question of Đăng xuất tất cả for the accounts as they are; null when none has a session. */
const logoutQuestion = (s: Store) => logoutAllText(sessions(s.order.map((id) => s.byId[id])));

/** Đăng xuất tất cả asks first: how many accounts leave the game, and whose Tự đánh, quest run or battle it cuts short.
 * The counts follow the accounts while it is open. */
function LogoutAllDialog({ onClose }: { onClose: () => void }) {
  const question = useStore(logoutQuestion);
  return (
    <ConfirmDialog
      title="Đăng xuất tất cả"
      message={question ?? "Không nick nào còn trong game."}
      confirm="Đăng xuất tất cả"
      icon="logout"
      onConfirm={api.logoutAll}
      onClose={onClose}
    />
  );
}

/** Bạch Hổ: opens its window (BachHoModal), with the time to 21:00 at its right, or "Đang mở" in red while the cave is
 * open; its own clock, so the sidebar does not render again every minute. */
function BachHoButton({ onOpen }: { onOpen: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  const allowed = useStore((s) => bachHoAllowed(s.license));
  const clock = bachHoClock(now);
  const open = allowed && clock.phase === "open";
  return (
    <button
      type="button"
      className={cn(
        "relative flex items-center gap-2 h-[34px] px-2.5 border-2 notch-sm bevel-sm cursor-pointer text-left",
        "focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-4 hover:brightness-112",
        open ? "border-danger bg-[color-mix(in_srgb,var(--danger)_22%,var(--bg-2))]" : "border-line-strong bg-card",
      )}
      aria-haspopup="dialog"
      title={!allowed ? BACH_HO_LOCKED : open ? "Hang Bạch Hổ đang mở: chọn nick đi đánh" : "Bạch Hổ Thống Lĩnh: boss thế giới lúc 21:00"}
      onClick={onOpen}
    >
      <span className={cn("grid place-items-center size-5", open ? "text-danger animate-blink motion-reduce:animate-none" : "text-coin")} aria-hidden>
        <Icon name="crown" size={15} />
      </span>
      <span className="flex-1 min-w-0 whitespace-nowrap font-display font-extrabold text-12 uppercase tracking-[0.06em] text-fg">Bạch Hổ</span>
      {allowed ? (
        <span className={cn("shrink-0 whitespace-nowrap px text-11", open ? "text-danger" : "text-fg-2")}>{open ? "Đang mở" : `còn ${minutesClock(clock.minutes)}`}</span>
      ) : (
        <span className="shrink-0 inline-flex items-center gap-1 text-11 text-fg-3">
          <Icon name="lock" size={11} />
          Chưa mở
        </span>
      )}
    </button>
  );
}

/** A card of the sidebar that a drag moves (@dnd-kit/sortable): the whole card is the handle, from 6 px of movement on
 * (PointerSensor), so a click still selects and its buttons still work. Lifted, it is drawn above the others. */
function SortableCard({ id, onMenu }: { id: number; onMenu: (id: number, x: number, y: number) => void }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      className={isDragging ? "relative z-10 opacity-90 shadow-[0_6px_16px_rgb(0_0_0/0.45)] cursor-grabbing" : undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <AccountCard id={id} onMenu={onMenu} />
    </div>
  );
}

/**
 * Brand with the Cài đặt of the app, "Thêm nick", the accounts with their menus, Bạch Hổ, and login/logout of every account
 * (logout asks first while an account has a session). Its top strip drags the window.
 * It re-renders when the order of the accounts or the count in the game changes; each card follows its own account.
 */
export function Sidebar() {
  const order = useStore((s) => s.order);
  const error = useStore((s) => s.accountsError);
  const playing = useStore(inGame);
  const { open } = useStore.getState();
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const menuAccount = useStore((s) => (menu ? s.byId[menu.id] : undefined));
  // Stable, so the memoised cards do not render again for it; the account of the menu is selected too.
  const openMenu = useCallback((id: number, x: number, y: number) => {
    // Chosen, without leaving the list on a phone (select opens the account's screen there).
    useStore.setState({ chosen: id });
    setMenu({ id, x, y });
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);
  // Drag and drop of the accounts: the mouse only (Chuyển lên / Chuyển xuống in the menu for the keyboard), so Space and
  // Enter keep selecting and logging in.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const dropped = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = order.indexOf(Number(active.id)), to = order.indexOf(Number(over.id));
    if (from >= 0 && to >= 0) reorder(arrayMove(order, from, to));
  };
  // Đăng xuất tất cả cuts battles, jobs and quest runs short: it asks first, unless no account has a session to end.
  const [askLogout, setAskLogout] = useState(false);
  const logoutAll = () => {
    if (logoutQuestion(useStore.getState())) setAskLogout(true);
    else void api.logoutAll();
  };
  return (
    // The 40 px top leaves room for the macOS window buttons.
    <aside className="relative flex flex-col gap-3 min-h-0 pt-10 px-3 pb-3 bg-bg-2 border-r-[length:var(--px)] border-r-ink not-mac:pt-3 phone:pt-3 phone:border-r-0">
      {/* No display class: the base layer of tailwind.css hides the drag strips outside macOS. */}
      <div className="absolute inset-x-0 top-0 h-9" data-tauri-drag-region />
      <div className="flex items-center gap-2.5">
        {/* Under `npm run tauri dev` the icon and the name say DEV (tauri.dev.conf.json), not to be taken for the installed
            app running beside it. The dev server serves the DEV icon by its path; an import would put it in every build. */}
        <img className="block shrink-0 size-[34px] object-contain" src={import.meta.env.DEV ? "/app-icon-dev.png" : appIcon} alt="" draggable={false} />
        {/* The name with the Cài đặt button at the right of its line; the summary has the whole width under them. */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0 font-pixel font-bold text-15 leading-[1.2] uppercase whitespace-nowrap">
              Co Lau Tool
              {import.meta.env.DEV && (
                <span className="px-1 py-px text-10 leading-none text-ink bg-danger" title="Bản dev (npm run tauri dev)">
                  Dev
                </span>
              )}
            </div>
            {/* Above the strip that drags the window, which covers the brand where the window has no room left for its
                buttons; the negative margin keeps the line as tall as the name. */}
            <Button kind="ghost" small icon="settings" aria-label="Cài đặt" className="relative z-1 shrink-0 -my-1.5 -mr-1" onClick={() => open({ kind: "settings" })} />
          </div>
          <div className="text-11 text-fg-3">
            {order.length} nick · <b className="text-s-online font-bold">{playing}</b> đang trong game
          </div>
        </div>
      </div>
      {/* QR nick at the left of Thêm nick: the accounts and their settings in a QR, or one scanned (QrAccountsDialog). */}
      <div className="flex gap-2">
        <Button kind="outline" icon="qr" aria-label="QR nick: chia sẻ hoặc quét" title="QR nick: chia sẻ nick và cài đặt, hoặc quét QR" className="flex-none" onClick={() => open({ kind: "qr" })} />
        <Button kind="primary" icon="plus" block className="flex-1 min-w-0" onClick={() => open({ kind: "add" })}>
          Thêm nick
        </Button>
      </div>
      {error && (
        <p className="px-2.5 py-2 border-2 border-accent-deep bg-ink text-danger text-11 wrap-anywhere select-text" role="alert">
          Không đọc được accounts.json, app sẽ không ghi đè file này. Sửa file rồi mở lại app. ({error})
        </p>
      )}
      {/* Nhập / Xuất JSON of the accounts (backup.rs): one button at the far right of the heading, like Cài đặt above. */}
      <div className="flex items-center justify-between gap-1">
        <div className="text-10 font-extrabold tracking-[0.1em] uppercase text-fg-3">Tài khoản</div>
        <Button kind="ghost" small icon="inout" aria-label="Nhập / Xuất JSON" className="shrink-0 -my-1.5 -mr-1" onClick={() => open({ kind: "accountsJson" })} />
      </div>
      {/* One column as wide as the sidebar: an auto column would grow to a card's longest line and clip its button. */}
      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)] [align-content:start] gap-1.5 -mx-1 px-1 pb-1 scroll">
        {order.length === 0 && <p className="text-fg-3 text-12">Chưa có nick nào.</p>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={dropped}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {order.map((id) => (
              <SortableCard key={id} id={id} onMenu={openMenu} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      {menu && menuAccount && (
        <Menu x={menu.x} y={menu.y} label={`Nick ${menuAccount.label}`} items={accountMenu(menuAccount, open, order)} onClose={closeMenu} />
      )}
      <BachHoButton onOpen={() => open({ kind: "bachHo" })} />
      <div className="flex gap-1.5">
        <Button kind="outline" icon="bolt" block disabled={order.length === 0} onClick={api.loginAll}>
          Đăng nhập tất cả
        </Button>
        <Button kind="outline" icon="logout" aria-label="Đăng xuất tất cả" aria-haspopup="dialog" disabled={order.length === 0} onClick={logoutAll} />
      </div>
      {askLogout && <LogoutAllDialog onClose={() => setAskLogout(false)} />}
    </aside>
  );
}

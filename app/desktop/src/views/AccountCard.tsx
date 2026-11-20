import { memo, useId, useRef } from "react";
import { api } from "@/api";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Bar } from "@/components/Bar";
import { Button } from "@/components/Button";
import { ELEMENT_ICON, ELEMENT_NAME, elementText } from "@/components/ElementTag";
import { Icon } from "@/components/Icon";
import { Pill } from "@/components/Pill";
import { cn } from "@/utils/cn";
import { isConnected } from "@/utils/format";
import { selectedId, useStore } from "@/store";

interface Props {
  id: number;
  /** Right click, the menu key or Shift+F10: the account's menu at (x, y). */
  onMenu: (id: number, x: number, y: number) => void;
}

/**
 * One account in the sidebar: name, level, where it is (or the error), status, HP, its proxy when on, login/logout.
 * Two controls side by side, none inside another: the name is the button that selects (it carries the place and status
 * as its description), and login/logout. A click anywhere else on the card selects too, for the mouse. Login selects the
 * account as well, so its page shows while it logs in; logout leaves the selection as it is.
 * It reads its own account from the store: an update of another account leaves this one the same object, so only the
 * card of the account that changed renders (memo keeps the sidebar's renders from reaching it).
 */
export const AccountCard = memo(function AccountCard({ id: accountId, onMenu }: Props) {
  const a = useStore((s) => s.byId[accountId]);
  const active = useStore((s) => selectedId(s) === accountId);
  const select = useStore((s) => s.select);
  const id = useId();
  const card = useRef<HTMLDivElement>(null);
  // Removed in the same update that drops it from the sidebar's order.
  if (!a) return null;
  const c = a.character;
  const connected = isConnected(a.status);
  const line = a.status === 4 ? a.error : c ? `${c.mapName} · Khu ${c.zone}` : a.label !== a.username ? a.username : a.statusText;
  return (
    <div
      ref={card}
      className={cn(
        "relative flex items-start gap-2.5 p-2 bg-card border-2 border-line notch-sm bevel-sm cursor-pointer hover:bg-card-2",
        // The focus ring of the name (the select button) goes around the whole card where :has() works.
        "has-[>div_button:focus-visible]:outline-2 has-[>div_button:focus-visible]:outline-ring has-[>div_button:focus-visible]:-outline-offset-6",
        active && "bg-card-2 border-primary",
      )}
      onClick={() => select(a.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(a.id, e.clientX, e.clientY);
      }}
    >
      <Avatar name={a.username} status={a.status} />
      <div className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)] gap-1">
        {/* Login/logout sits in the corner beside the name, so the place and the status row below get the whole width. */}
        <div className="flex items-center gap-1 min-w-0 pr-[26px]">
          <button
            type="button"
            className={
              "min-w-0 p-0 border-0 bg-transparent truncate text-left font-display font-extrabold text-13 leading-[1.3] text-fg cursor-pointer " +
              "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 supports-[selector(:has(*))]:focus-visible:outline-none"
            }
            aria-current={active || undefined}
            aria-describedby={`${id}line ${id}status`}
            onKeyDown={(e) => {
              if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                e.preventDefault();
                const r = card.current!.getBoundingClientRect();
                onMenu(a.id, r.left + 12, r.bottom - 6);
              }
            }}
          >
            {c?.name ?? a.label}
          </button>
          {/* The character's element between the name and its level; the name is cut first. */}
          {c?.element != null && ELEMENT_ICON[c.element] && (
            <span className={cn("shrink-0 inline-flex", elementText(c.element))} title={`Hệ ${ELEMENT_NAME[c.element]}`} aria-label={`Hệ ${ELEMENT_NAME[c.element]}`} role="img">
              <Icon name={ELEMENT_ICON[c.element]} size={12} />
            </span>
          )}
          {c && <Badge className="shrink-0">LV {c.level}</Badge>}
        </div>
        <div id={`${id}line`} className={cn("text-11 text-fg-2 truncate", a.status === 4 && "text-danger")} title={line}>
          {line}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Pill id={`${id}status`} status={a.status} text={a.statusText} />
          {c && (
            <>
              <div className="flex-1 min-w-6" title={`HP ${c.hp}/${c.maxHp}`}>
                <Bar value={c.hp / Math.max(1, c.maxHp)} fill="var(--hp)" thin />
              </div>
            </>
          )}
          {/* The proxy the account connects through, only while it is on (no proxy, or one turned off: nothing); the
              players around are on the Người chơi card of its page. */}
          {a.proxy?.enabled && (
            <span
              className={cn("inline-flex items-center gap-[3px] text-10 font-bold uppercase tracking-[0.04em] text-good whitespace-nowrap", !c && "ml-auto")}
              title={`Kết nối qua proxy ${a.proxy.label}${a.proxy.ip ? `, ra ngoài bằng IP ${a.proxy.ip}` : ""}`}
            >
              <Icon name="shield" size={12} />
              {a.proxy.kind === "http" ? "HTTP" : "SOCKS5"}
            </span>
          )}
        </div>
      </div>
      <Button
        kind={connected ? "ghost" : "tonal"}
        small
        className="absolute top-[3px] right-[3px] z-1 w-6 h-6"
        icon={connected ? "logout" : "login"}
        aria-label={connected ? "Đăng xuất" : "Đăng nhập"}
        disabled={a.status === 1}
        onClick={(e) => {
          e.stopPropagation();
          if (connected) api.logout(a.id);
          else {
            select(a.id);
            api.login(a.id);
          }
        }}
      />
    </div>
  );
});

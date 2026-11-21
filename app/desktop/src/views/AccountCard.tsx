import { memo, useId, useRef, type ReactNode } from "react";
import { api } from "@/api";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Bar } from "@/components/Bar";
import { Button } from "@/components/Button";
import { ELEMENT_ICON, ELEMENT_NAME, elementText } from "@/components/ElementTag";
import { Icon } from "@/components/Icon";
import { Pill } from "@/components/Pill";
import { cn } from "@/utils/cn";
import { isConnected, levelProgress, num, pct } from "@/utils/format";
import { selectedId, useStore } from "@/store";
import { ProxyButton } from "./ProxyButton";

/** The share of the level from which it is about to go up (the ring cycles its colours). */
const NEAR = 0.9;
/** The colours of the ring along its way: red at the bottom right corner, then orange, yellow, green, cyan, blue, violet.
 * The way goes clockwise, as a conic gradient turns, from the bottom right corner (135deg). */
const RAINBOW_RING = "conic-gradient(from 135deg, #ff5f6d, #ffa53b, #ffe14d, #5fe07a, #3fd0ff, #6a7bff, #d46bff)";
/** The width of the ring. */
const RING = "3px";

/** How much of one side of the frame is drawn: each side is a quarter of the way. */
const side = (part: number, n: number) => `${Math.round(Math.min(1, Math.max(0, part * 4 - n)) * 1000) / 10}%`;

/**
 * EXP of the level as a 3px frame around the avatar, drawn along its edge: from the bottom right corner to the left, up the
 * left side, along the top and down the right side, the whole way round at the next level; the rest dim. Near the
 * next level the colours cycle. Without a character (`part` null) the avatar shows as it is.
 */
function LevelRing({ part, near, title, children }: { part: number | null; near: boolean; title?: string; children: ReactNode }) {
  if (part == null) return children;
  const black = "linear-gradient(#000,#000)";
  // One layer of the mask per side, each grown from where the way enters it.
  const mask = [
    `${black} right bottom / ${side(part, 0)} ${RING}`,
    `${black} left bottom / ${RING} ${side(part, 1)}`,
    `${black} left top / ${side(part, 2)} ${RING}`,
    `${black} right top / ${RING} ${side(part, 3)}`,
  ]
    .map((l) => `${l} no-repeat`)
    .join(", ");
  return (
    <span className="relative flex-none p-[3px] bg-line bevel-sm" title={title}>
      <span
        className={cn("absolute inset-0", near && "animate-hue motion-reduce:animate-none")}
        style={{ backgroundImage: RAINBOW_RING, mask, WebkitMask: mask }}
        aria-hidden
      />
      <span className="relative flex">{children}</span>
    </span>
  );
}

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
  const lv = c && levelProgress(c);
  // From NEAR of the level on, the ring cycles its colours: the level is about to go up.
  const near = !!lv && lv.part >= NEAR;
  const expTitle = lv && `EXP ${pct(lv.part)} cấp ${c.level}: còn ${num(lv.left)} EXP lên cấp ${c.level + 1}`;
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
      <LevelRing part={lv ? lv.part : null} near={near} title={expTitle ?? undefined}>
        <Avatar name={a.username} status={a.status} />
      </LevelRing>
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
            aria-describedby={`${id}line ${id}exp ${id}status`}
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
        {/* The place; the share of the level done is drawn by the ring around the avatar, and said to screen readers. */}
        <div id={`${id}line`} className={cn("min-w-0 text-11 text-fg-2 truncate", a.status === 4 && "text-danger")} title={line}>
          {line}
        </div>
        {expTitle && (
          <span id={`${id}exp`} className="sr-only">
            {expTitle}
          </span>
        )}
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
          {a.proxy?.enabled && <ProxyButton proxy={a.proxy} frameClassName={cn(!c && "ml-auto")} />}
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

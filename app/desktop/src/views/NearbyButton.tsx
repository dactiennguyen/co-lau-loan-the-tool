import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import type { Character } from "@/api/types";

/** Level tag colour against the own level: stronger players red, the same gold, weaker green. */
const levelTone = (level: number, own: number) =>
  level > own ? "var(--accent)" : level === own ? "var(--coin)" : "var(--s-online)";

/** Xung quanh as a small button after the map name: a people icon and how many others share the zone (s2c/1263, kept
 * current by 1167/1170/1253). A click opens the list in a panel under it, highest level first; a click elsewhere,
 * Escape, resizing or leaving the window closes it. */
export function NearbyButton({ character: c }: { character: Character }) {
  const [open, setOpen] = useState(false);
  // The frame of the button: where the panel opens, and what a press does not count as "elsewhere".
  const button = useRef<HTMLSpanElement>(null);
  const players = c.players;
  // Stable, so the panel's listeners stay put while the character updates with every packet.
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.querySelector("button")?.focus();
  }, []);
  const count = c.playersKnown ? String(players.length) : "?";
  const label = c.playersKnown
    ? `Xung quanh: ${players.length} người khác trong khu`
    : "Xung quanh: chưa đọc được danh sách (s2c/1263)";
  return (
    <>
      <span ref={button} className="inline-flex flex-none">
        <Button
          kind="outline"
          small
          icon="users"
          className="flex-none h-[22px] px-1.5 gap-1 text-points"
          aria-label={label}
          title={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="px text-12 leading-none">{count}</span>
        </Button>
      </span>
      {open && <NearbyPanel character={c} anchor={button} onClose={close} />}
    </>
  );
}

/** The list of Xung quanh, drawn on the body (as Menu) so no clipped frame hides it, under its button and kept on
 * screen. */
function NearbyPanel({
  character: c,
  anchor,
  onClose,
}: {
  character: Character;
  anchor: React.RefObject<HTMLSpanElement | null>;
  onClose: (refocus: boolean) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const el = panel.current;
    if (!a || !el) return;
    const { width, height } = el.getBoundingClientRect();
    setAt({
      left: Math.max(4, Math.min(a.left, innerWidth - width - 4)),
      top: a.bottom + height + 6 <= innerHeight ? a.bottom + 4 : Math.max(4, a.top - height - 4),
    });
  }, [anchor, c.players.length]);
  useEffect(() => {
    // The button toggles by itself: a press on it is not "elsewhere".
    const away = (e: Event) =>
      panel.current?.contains(e.target as Node) || anchor.current?.contains(e.target as Node) || onClose(false);
    const close = () => onClose(false);
    const keys = (e: KeyboardEvent) => e.key === "Escape" && onClose(true);
    document.addEventListener("pointerdown", away, true);
    // A wheel turn outside (the page scrolls away from the button) closes it too, as Menu; inside, the list scrolls.
    document.addEventListener("wheel", away, { capture: true, passive: true });
    document.addEventListener("keydown", keys);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("wheel", away, true);
      document.removeEventListener("keydown", keys);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [anchor, onClose]);
  const players = c.players;
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label="Xung quanh"
      className="fixed z-50 w-[260px] max-h-[min(380px,70vh)] flex flex-col gap-2 p-2.5 bg-card border-2 border-line-strong notch-sm bevel-sm"
      style={at ?? { left: -9999, top: 0 }}
    >
      <header className="flex items-center gap-2">
        <span className="grid place-items-center size-[22px] bg-ink text-points">
          <Icon name="users" size={13} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-extrabold text-12 leading-[1.2] tracking-[0.06em] uppercase text-fg">Xung quanh</h2>
          <p className="m-0 text-11 text-fg-3 truncate">
            {c.mapName} · Khu {c.zone}
          </p>
        </div>
        <span
          className="px grid place-items-center min-w-[26px] h-[22px] px-1.5 bg-points text-ink text-12 bevel-sm"
          title={c.playersKnown ? `${players.length + 1} người trong khu, tính cả bạn` : "Chưa đọc được danh sách (s2c/1263)"}
        >
          {c.playersKnown ? players.length : "?"}
        </span>
      </header>
      {!c.playersKnown && (
        <p className="m-0 text-fg-3 text-12">
          Không đọc được danh sách người chơi của khu (s2c/1263); dưới đây chỉ có người vào sau.
        </p>
      )}
      {c.playersKnown && players.length === 0 && <p className="m-0 text-fg-3 text-12">Chỉ có bạn ở khu này.</p>}
      {players.length > 0 && (
        <ul className="scroll flex-1 min-h-0 grid [align-content:start] gap-1 m-0 p-0 list-none">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-[3px] pr-1.5 pl-[3px] bg-bg-2 hover:bg-card-2">
              <Avatar name={p.name} size={22} />
              <span className="select-text flex-1 min-w-0 truncate text-12 font-semibold">{p.name}</span>
              <Badge tone={levelTone(p.level, c.level)}>LV {p.level}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body,
  );
}

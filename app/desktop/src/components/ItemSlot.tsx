import { itemIcon } from "@/game/itemIcons";
import { plusOf } from "@/game/shops";
import type { Item } from "@/api/types";
import { cn } from "@/utils/cn";
import { ELEMENT_ICON, elementText } from "./ElementTag";
import { Icon, type IconName } from "./Icon";

interface Props {
  item: Item | null;
  /** What the slot holds, for an empty gear slot and the label. */
  label: string;
  /** Drawn in an empty slot. */
  placeholder?: IconName;
  active?: boolean;
  /** Gear: a durability bar along the bottom. */
  wear?: boolean;
  onShow: (shown: boolean) => void;
  onPick: () => void;
  /** Chuột phải, or the Menu key and Shift+F10: the item's menu, opened at that point of the window. */
  onMenu?: (x: number, y: number) => void;
  /** On the square; its size is var(--size), 44 px unless set here ("[--size:46px]"). */
  className?: string;
}

/** The square: a dark well, the 96 × 96 icon drawn smaller. */
const SLOT =
  "relative grid place-items-center w-(--size) h-(--size) p-0 border-2 border-line bg-ink text-fg-3 cursor-pointer [--size:44px] " +
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1";
/** Quantity bottom right, cường hoá top right in gold (gear has no quantity and its wear bar runs along the bottom). */
const CORNER = "absolute right-px px-0.5 bg-[rgb(15_17_21/0.75)] text-10 font-normal leading-[1.3]";

/**
 * One square of the bag or the gear: the item's icon with its quantity (items that stack), element and cường hoá (+1 and
 * up) in the corners; a red tint when it is worn out. Hover or focus shows it in the detail strip; a click keeps it there; a right click opens
 * its menu.
 */
export function ItemSlot({ item, label, placeholder, active, wear, onShow, onPick, onMenu, className }: Props) {
  if (!item) {
    return (
      <span className={cn(SLOT, "cursor-default opacity-60", className)} title={`${label}: trống`}>
        {placeholder && <Icon name={placeholder} size={18} />}
      </span>
    );
  }
  const url = itemIcon(item.icon);
  const broken = item.durability != null && item.durability[0] <= 0;
  const qty = item.stacks ? ` ×${item.quantity}` : "";
  const plus = plusOf(item);
  return (
    <button
      type="button"
      className={cn(
        SLOT,
        "hover:border-line-strong hover:bg-bg-2",
        active && "border-primary shadow-[0_0_0_1px_var(--primary)]",
        // Worn out: a red frame and tint, the icon dimmed.
        broken && "border-accent-deep after:content-[''] after:absolute after:inset-0 after:bg-[rgb(205_122_114/0.22)] after:pointer-events-none",
        className,
      )}
      aria-label={`${label}: ${item.name}${plus ? ` +${plus}` : ""}${qty}${broken ? ", hỏng" : ""}`}
      aria-pressed={active}
      onMouseEnter={() => onShow(true)}
      onMouseLeave={() => onShow(false)}
      onFocus={() => onShow(true)}
      onBlur={() => onShow(false)}
      onClick={onPick}
      onContextMenu={(e) => {
        if (!onMenu) return;
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (!onMenu || !(e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        onMenu(r.left + 8, r.bottom - 4);
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className={cn(
            "w-[calc(var(--size)-8px)] h-[calc(var(--size)-8px)] [image-rendering:auto] pointer-events-none",
            broken && "[filter:grayscale(0.6)_brightness(0.7)]",
          )}
        />
      ) : (
        <span className="px text-9 text-fg-3">#{item.id}</span>
      )}
      {item.stacks && <b className={cn("px", CORNER, "bottom-0 text-fg")}>{item.quantity}</b>}
      {plus > 0 && (
        <b className={cn("px", CORNER, "top-0 text-primary")} aria-hidden="true">
          +{plus}
        </b>
      )}
      {item.element != null && ELEMENT_ICON[item.element] && (
        <span className={cn("absolute top-px left-px grid place-items-center size-[13px] bg-ink", elementText(item.element))} aria-hidden="true">
          <Icon name={ELEMENT_ICON[item.element]} size={9} />
        </span>
      )}
      {wear && item.durability && (
        <span className={cn("absolute left-[3px] right-[3px] bottom-0.5 h-[3px] bg-bg-2", broken && "bg-hp")} aria-hidden="true">
          <span className="block h-full bg-good" style={{ width: `${(100 * Math.max(0, item.durability[0])) / Math.max(1, item.durability[1])}%` }} />
        </span>
      )}
    </button>
  );
}

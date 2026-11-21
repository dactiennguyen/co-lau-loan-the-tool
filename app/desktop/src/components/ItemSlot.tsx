import { itemIcon } from "@/game/itemIcons";
import { QUALITY_TEXT } from "@/game/quality";
import { plusOf } from "@/game/shops";
import type { Item } from "@/api/types";
import { cn } from "@/utils/cn";
import { GENDER_ICON, GENDER_TEXT, GENDER_WORD, levelsShort } from "@/game/gender";
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
  /** Why the character cannot wear it (game/gender.ts misfit): the item dimmed, its gender sign red. */
  misfit?: string | null;
  /** Level of the character: gear above it has its level in red and is dimmed, as a misfit. */
  charLevel?: number | null;
  /** Xóa nhiều: picked for it (a check mark top left), or `locked` with the reason it cannot be picked (dimmed). */
  selected?: boolean;
  locked?: string | null;
  /** Xóa nhiều: gear worth throwing away lights up, of the other gender in cyan (it cannot be worn), of another element
   * in violet (no +5% of đúng hệ), apart from the red of a pick; picked, it keeps its glow around the red frame. */
  flag?: SlotFlag | null;
  onShow: (shown: boolean) => void;
  onPick: () => void;
  /** Chuột phải, or the Menu key and Shift+F10: the item's menu, opened at that point of the window. */
  onMenu?: (x: number, y: number) => void;
  /** On the square; its size is var(--size), 44 px unless set here ("[--size:46px]"). */
  className?: string;
}

export type SlotFlag = "gender" | "element";
/** The glow colour of a flag, as var(--glow), and its words for the aria-label. The icons fill their square, so the glow
 * is a ring and a blur around the frame, not a tint under the icon. */
export const FLAG_GLOW: Record<SlotFlag, string> = { gender: "[--glow:var(--piece-drop)]", element: "[--glow:var(--piece-yinyang)]" };
const FLAG_WORDS: Record<SlotFlag, string> = { gender: "khác giới tính", element: "khác hệ" };

/** The square: a dark well, the 96 × 96 icon drawn smaller. */
const SLOT =
  "relative grid place-items-center w-(--size) h-(--size) p-0 border-2 border-line bg-ink text-fg-3 cursor-pointer [--size:44px] " +
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1";
/** Quantity bottom right, cường hoá top right in gold, and the level of gear above 1 bottom right (gear has no quantity;
 * its level sits above its wear bar): the number alone, in the colour of the gear's quality (game/quality.ts), with a
 * red line under it while the character is below that level. */
const CORNER = "absolute right-px px-0.5 bg-[rgb(15_17_21/0.75)] text-10 font-normal leading-[1.3]";

/**
 * One square of the bag or the gear: the item's icon with its quantity (items that stack), element, cường hoá (+1 and
 * up) and đồ nam / nữ in the corners; a red tint when it is worn out, dimmed with a red sign when the character cannot
 * wear it. Hover or focus shows it in the detail strip; a click keeps it there; a right click opens its menu.
 */
export function ItemSlot({ item, label, placeholder, active, wear, misfit, charLevel, selected, locked, flag, onShow, onPick, onMenu, className }: Props) {
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
  const picked = (flag ? `, ${FLAG_WORDS[flag]}` : "") + (selected ? ", đã chọn để xóa" : locked ? `, ${locked}` : "");
  const plus = plusOf(item);
  const short = levelsShort(item, charLevel);
  return (
    <button
      type="button"
      className={cn(
        SLOT,
        "hover:border-line-strong hover:bg-bg-2",
        flag && FLAG_GLOW[flag],
        flag && "border-(--glow) shadow-[0_0_0_1px_var(--glow),0_0_12px_3px_var(--glow)]",
        active && "border-primary shadow-[0_0_0_1px_var(--primary)]",
        // Picked: a red frame and a red veil over the icon, the ring and glow of its flag kept around the frame.
        selected && "border-danger before:content-[''] before:absolute before:inset-0 before:bg-danger/25 before:pointer-events-none",
        selected && (flag ? "shadow-[0_0_0_2px_var(--glow),0_0_12px_3px_var(--glow)]" : "shadow-[0_0_0_1px_var(--danger)]"),
        locked && "opacity-40 cursor-not-allowed",
        // Worn out: a red frame and tint, the icon dimmed.
        broken && "border-accent-deep after:content-[''] after:absolute after:inset-0 after:bg-[rgb(205_122_114/0.22)] after:pointer-events-none",
        className,
      )}
      aria-label={`${label}: ${item.name}${plus ? ` +${plus}` : ""}${qty}${item.level != null ? `, cấp ${item.level}` : ""}${item.qualityName && item.quality > 0 ? `, ${item.qualityName}` : ""}${
        short ? `, thiếu ${short} cấp` : ""
      }${broken ? ", hỏng" : ""}${
        item.gender != null ? `, đồ ${GENDER_WORD[item.gender]}${misfit ? ", không mặc được" : ""}` : ""
      }${picked}`}
      aria-pressed={selected ?? active}
      title={locked ?? undefined}
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
            // A lit square (Xóa nhiều) is not dimmed for what lit it.
            (broken || (!flag && (misfit || short > 0))) && "[filter:grayscale(0.6)_brightness(0.7)]",
          )}
        />
      ) : (
        <span className="px text-9 text-fg-3">#{item.id}</span>
      )}
      {selected && (
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1] grid place-items-center size-[18px] bg-danger text-ink shadow-[0_0_0_2px_var(--ink)]"
          aria-hidden="true"
        >
          <Icon name="check" size={13} />
        </span>
      )}
      {item.stacks && <b className={cn("px", CORNER, "bottom-0 text-fg")}>{item.quantity}</b>}
      {item.level != null && item.level > 1 && !item.stacks && (
        <b
          className={cn(
            "px",
            CORNER,
            wear && item.durability ? "bottom-[6px]" : "bottom-0",
            QUALITY_TEXT[item.quality] ?? "text-fg",
            !!short && "underline decoration-danger decoration-2 underline-offset-1",
          )}
          aria-hidden="true"
        >
          {item.level}
        </b>
      )}
      {plus > 0 && (
        <b className={cn("px", CORNER, "top-0 text-primary")} aria-hidden="true">
          +{plus}
        </b>
      )}
      {item.element != null && ELEMENT_ICON[item.element] && (
        <span
          className={cn(
            "absolute top-px left-px grid place-items-center size-[13px] bg-ink",
            elementText(item.element),
            flag === "element" && "shadow-[inset_0_0_0_1px_var(--glow)]",
          )}
          aria-hidden="true"
        >
          <Icon name={ELEMENT_ICON[item.element]} size={9} />
        </span>
      )}
      {item.gender != null && GENDER_ICON[item.gender] && (
        <span
          className={cn(
            "absolute bottom-px left-px grid place-items-center size-[13px] bg-ink",
            misfit ? "text-danger shadow-[inset_0_0_0_1px_var(--danger)]" : GENDER_TEXT[item.gender],
          )}
          aria-hidden="true"
        >
          <Icon name={GENDER_ICON[item.gender]} size={10} />
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

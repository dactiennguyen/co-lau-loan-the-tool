import { itemIcon } from "../itemIcons";
import type { Item } from "../types";
import { ELEMENT_ICON } from "./ElementTag";
import { Icon, type IconName } from "./Icon";
import "./ItemSlot.css";

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
}

/**
 * One square of the bag or the gear: the item's icon with its quantity (items that stack) and element in the corners; a
 * red tint when it is worn out. Hover or focus shows it in the detail strip; a click keeps it there; a right click opens
 * its menu.
 */
export function ItemSlot({ item, label, placeholder, active, wear, onShow, onPick, onMenu }: Props) {
  if (!item) {
    return (
      <span className="slot slot--empty" title={`${label}: trống`}>
        {placeholder && <Icon name={placeholder} size={18} />}
      </span>
    );
  }
  const url = itemIcon(item.icon);
  const broken = item.durability != null && item.durability[0] <= 0;
  const qty = item.stacks ? ` ×${item.quantity}` : "";
  return (
    <button
      type="button"
      className={`slot${broken ? " slot--broken" : ""}${active ? " slot--active" : ""}`}
      aria-label={`${label}: ${item.name}${qty}${broken ? ", hỏng" : ""}`}
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
      {url ? <img src={url} alt="" draggable={false} /> : <span className="slot__id px">#{item.id}</span>}
      {item.stacks && <b className="slot__qty px">{item.quantity}</b>}
      {item.element != null && ELEMENT_ICON[item.element] && (
        <span className={`slot__el el el--${item.element}`} aria-hidden="true">
          <Icon name={ELEMENT_ICON[item.element]} size={9} />
        </span>
      )}
      {wear && item.durability && (
        <span className="slot__wear" aria-hidden="true">
          <span style={{ width: `${(100 * Math.max(0, item.durability[0])) / Math.max(1, item.durability[1])}%` }} />
        </span>
      )}
    </button>
  );
}

import { itemIcon } from "../itemIcons";
import { num } from "../format";
import type { Picked } from "../types";
import "./LootRow.css";

/** "Xu khóa ×431", "Đá cấp 2". */
export const pickedLabel = (p: Picked) => (p.quantity > 1 ? `${p.name} ×${num(p.quantity)}` : p.name);

/** A 16 px item icon, or nothing for an item without one. */
export function PickedIcon({ icon }: { icon: number | null }) {
  const url = itemIcon(icon);
  return url ? <img className="picked-icon" src={url} alt="" draggable={false} /> : null;
}

/**
 * "Đã nhặt" and what Tự nhặt đồ picked up in the fight job or quest run, or under the Nhật ký line of a won battle, each
 * item with its icon and quantity; nothing before the first item. The drops of a job's last battle come just after the
 * job ended.
 */
export function LootRow({ items }: { items: Picked[] }) {
  if (items.length === 0) return null;
  return (
    <div className="loot">
      <span className="loot__label">Đã nhặt</span>
      <ul className="loot__items">
        {items.map((p) => (
          <li key={p.itemId}>
            <PickedIcon icon={p.icon} />
            {p.name}
            {p.quantity > 1 && <b className="px">×{num(p.quantity)}</b>}
          </li>
        ))}
      </ul>
    </div>
  );
}

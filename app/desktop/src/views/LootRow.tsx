import { cn } from "../cn";
import { itemIcon } from "../itemIcons";
import { num } from "../format";
import type { Picked } from "../types";

/** "Xu khóa ×431", "Đá cấp 2". */
export const pickedLabel = (p: Picked) => (p.quantity > 1 ? `${p.name} ×${num(p.quantity)}` : p.name);

/** A 16 px item icon, or nothing for an item without one. */
export function PickedIcon({ icon }: { icon: number | null }) {
  const url = itemIcon(icon);
  return url ? <img className="size-4 flex-none self-center" src={url} alt="" draggable={false} /> : null;
}

/**
 * "Đã nhặt" and what Tự nhặt đồ picked up in the fight job or quest run, or under the Nhật ký line of a won battle, each
 * item with its icon and quantity, wrapping onto more lines when many; nothing before the first item. The drops of a
 * job's last battle come just after the job ended. `className` goes on the row, `itemClassName` on each item (the log's).
 */
export function LootRow({ items, className, itemClassName }: { items: Picked[]; className?: string; itemClassName?: string }) {
  if (items.length === 0) return null;
  return (
    <div className={cn("flex items-baseline gap-2.5 text-[11.5px]", className)}>
      <span className="flex-none text-10 font-extrabold tracking-[0.06em] uppercase text-fg-3">Đã nhặt</span>
      <ul className="flex flex-wrap gap-y-1 gap-x-3 min-w-0">
        {items.map((p) => (
          <li key={p.itemId} className={cn("inline-flex items-center gap-1 text-fg", itemClassName)}>
            <PickedIcon icon={p.icon} />
            {p.name}
            {p.quantity > 1 && <b className="text-coin px">×{num(p.quantity)}</b>}
          </li>
        ))}
      </ul>
    </div>
  );
}

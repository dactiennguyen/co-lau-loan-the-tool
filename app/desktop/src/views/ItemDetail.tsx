import { Icon } from "../components/Icon";
import { ELEMENT_ICON } from "../components/ElementTag";
import { num } from "../format";
import { itemIcon } from "../itemIcons";
import type { ReactNode } from "react";
import type { Item } from "../types";
import "./ItemDetail.css";

interface Props {
  item: Item | null;
  /** Where it is: "Đang mặc", "Túi đồ, ô 3". */
  where: string;
  /** Element of the character (field01 of s2c/9): an item of the same one gets +5 % to its stats (Cẩm nang). */
  element: number | null;
  /** The buttons for the item (Mặc, Cởi ra, Dùng, Sửa), at the right end. */
  actions?: ReactNode;
}

/** The item shown under the bag, as its popup in the game: icon, name, element, type, level, durability, stats, and the
 * popup's buttons. */
export function ItemDetail({ item, where, element, actions }: Props) {
  if (!item) {
    return <div className="detail detail--none">Rê chuột hay bấm vào một món để xem chi tiết.</div>;
  }
  const url = itemIcon(item.icon);
  const broken = item.durability != null && item.durability[0] <= 0;
  const facts = [
    item.kindName,
    item.level != null && `cấp ${item.level}`,
    item.stacks && `số lượng ${num(item.quantity)}`,
    where,
  ].filter(Boolean);
  return (
    <div className={`detail${actions ? " detail--act" : ""}`} aria-live="polite">
      <span className="detail__icon">{url ? <img src={url} alt="" /> : <span className="px">#{item.id}</span>}</span>
      <div className="detail__body">
        <div className="detail__name">
          <b>{item.name}</b>
          {item.element != null && item.elementName && (
            <span className={`detail__el el el--${item.element}`}>
              {ELEMENT_ICON[item.element] && <Icon name={ELEMENT_ICON[item.element]} size={11} />} {item.elementName}
            </span>
          )}
          {item.element != null && item.element === element && <span className="detail__tag">đúng hệ: +5% chỉ số</span>}
          <span className="detail__facts">{facts.join(" · ")}</span>
        </div>
        {(item.durability || item.stats.length > 0 || item.desc) && (
          <div className="detail__info">
            {item.durability && (
              <span className={`detail__wear${broken ? " detail__wear--broken" : ""}`}>
                Độ bền <b className="px">{num(item.durability[0])}/{num(item.durability[1])}</b>
                {broken && ", hỏng: chỉ số không tính, cần 1 Búa sửa chữa"}
              </span>
            )}
            {item.stats.length > 0 && (
              <ul className="detail__stats">
                {item.stats.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
            {item.desc && <p className="detail__desc">{item.desc}</p>}
          </div>
        )}
      </div>
      {actions}
    </div>
  );
}

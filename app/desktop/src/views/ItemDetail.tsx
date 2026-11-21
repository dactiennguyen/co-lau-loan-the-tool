import { cn } from "@/utils/cn";
import { QUALITY_TEXT } from "@/game/quality";
import { Icon } from "@/components/Icon";
import { ELEMENT_ICON, elementText } from "@/components/ElementTag";
import { num } from "@/utils/format";
import { itemIcon } from "@/game/itemIcons";
import { plusOf } from "@/game/shops";
import { GENDER_ICON, GENDER_TEXT, GENDER_WORD, levelsShort, misfit } from "@/game/gender";
import type { ReactNode } from "react";
import type { Item } from "@/api/types";

/** The shown item, a strip under the bag: the icon in a well on the left; then its name, element and facts on one line,
 * and the durability (red when worn out), the stats as chips and the description on the next. */
const STRIP = "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 min-h-[60px] py-1.5 px-2.5 bg-ink";
/** The line of the name, and the line of the durability, stats and description. */
const LINE = "flex flex-wrap items-center gap-y-[3px] gap-x-2";

interface Props {
  item: Item | null;
  /** Where it is: "Đang mặc", "Túi đồ, ô 3". */
  where: string;
  /** Element of the character (field01 of s2c/9): an item of the same one gets +5 % to its stats (Cẩm nang). */
  element: number | null;
  /** Gender of the character (flag2 of s2c/9): gear of the other one cannot be worn. */
  gender: number | null;
  /** Level of the character: the level to wear gear is green when it has it, red with what it lacks when not. */
  level: number | null;
  /** The buttons for the item (Mặc, Cởi ra, Dùng, Sửa), at the right end. */
  actions?: ReactNode;
}

/** The item shown under the bag, as its popup in the game: icon, name with its cường hoá ("Nhẫn Trơn +1"), element, type,
 * level, durability, stats, and the popup's buttons. */
export function ItemDetail({ item, where, element, gender, level, actions }: Props) {
  if (!item) {
    return <div className={cn(STRIP, "flex text-11 text-fg-3")}>Rê chuột hay bấm vào một món để xem chi tiết.</div>;
  }
  const url = itemIcon(item.icon);
  const broken = item.durability != null && item.durability[0] <= 0;
  const plus = plusOf(item);
  const short = levelsShort(item, level);
  const facts = [
    item.kindName,
    item.stacks && `số lượng ${num(item.quantity)}`,
    where,
  ].filter(Boolean);
  return (
    <div className={cn(STRIP, actions ? "grid-cols-[auto_minmax(0,1fr)_auto]" : null)} aria-live="polite">
      <span className="grid place-items-center w-[46px] h-[46px] bg-bg-2">
        {url ? <img src={url} alt="" className="w-[42px] h-[42px]" /> : <span className="px">#{item.id}</span>}
      </span>
      <div className="grid gap-1 min-w-0">
        <div className={LINE}>
          <b className="text-13 text-fg">
            {item.name}
            {plus > 0 && <span className="text-12 text-primary px"> +{plus}</span>}
          </b>
          {item.quality > 0 && item.qualityName && (
            <span className={cn("text-11 font-bold", QUALITY_TEXT[item.quality])}>{item.qualityName}</span>
          )}
          {item.locked && (
            <span
              className="inline-flex items-center gap-[3px] py-0 px-[5px] border border-line text-10 font-bold text-fg-3"
              title="Mua bằng Xu khóa, đã mặc hay đã nâng cấp: Chợ trời không nhận bán"
            >
              <Icon name="lock" size={10} /> Khoá giao dịch
            </span>
          )}
          {item.element != null && item.elementName && (
            <span className={cn("inline-flex items-center gap-[3px] text-11 font-bold", elementText(item.element))}>
              {ELEMENT_ICON[item.element] && <Icon name={ELEMENT_ICON[item.element]} size={11} />} {item.elementName}
            </span>
          )}
          {item.element != null && item.element === element && (
            <span className="py-0 px-[5px] border border-good-shade text-10 font-bold text-good">đúng hệ: +5% chỉ số</span>
          )}
          {item.gender != null && GENDER_ICON[item.gender] && (
            <span className={cn("inline-flex items-center gap-[3px] text-11 font-bold", GENDER_TEXT[item.gender])}>
              <Icon name={GENDER_ICON[item.gender]} size={11} /> Đồ {GENDER_WORD[item.gender]}
            </span>
          )}
          {misfit(item, gender) && (
            <span className="py-0 px-[5px] border border-danger text-10 font-bold text-danger">khác giới tính: không mặc được</span>
          )}
          {item.level != null && (
            <span
              className={cn(
                "py-0 px-[5px] border text-10 font-bold",
                short ? "border-danger text-danger" : level ? "border-good-shade text-good" : "border-line text-fg-2",
              )}
            >
              Cần cấp {item.level}
              {short > 0 && ` · thiếu ${short} cấp`}
            </span>
          )}
          <span className="text-11 text-fg-3">{facts.join(" · ")}</span>
        </div>
        {(item.durability || item.stats.length > 0 || item.desc) && (
          <div className={LINE}>
            {item.durability && (
              <span className={cn("text-11 text-fg-2", broken && "text-danger")}>
                Độ bền <b className={cn("text-[10.5px] font-normal text-fg px", broken && "text-danger")}>{num(item.durability[0])}/{num(item.durability[1])}</b>
                {broken && ", hỏng: chỉ số không tính, cần 1 Búa sửa chữa"}
              </span>
            )}
            {item.stats.length > 0 && (
              <ul className="contents">
                {item.stats.map((s, i) => (
                  <li key={i} className="py-px px-1.5 bg-bg-2 text-11 font-semibold text-good">
                    {s}
                  </li>
                ))}
              </ul>
            )}
            {item.desc && <p className="text-11 leading-[1.4] text-fg-2">{item.desc}</p>}
          </div>
        )}
      </div>
      {actions}
    </div>
  );
}

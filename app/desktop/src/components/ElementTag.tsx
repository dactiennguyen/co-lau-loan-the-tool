import { Icon, type IconName } from "./Icon";
import "./ElementTag.css";

/** Elements as the character (field01 of s2c/9), its skills (id / 1000) and items number them: 1 Hỏa, 2 Lôi, 4 Thủy. */
export const ELEMENT_NAME: Record<number, string> = { 1: "Hỏa", 2: "Lôi", 4: "Thủy" };
/** The game draws a flame and a bolt; Thủy gets a drop. */
export const ELEMENT_ICON: Record<number, IconName> = { 1: "flame", 2: "bolt", 4: "drop" };

/** "Hệ Hỏa" in the element's colour, with its icon; nothing for an element without a name. */
export function ElementTag({ element }: { element: number | null | undefined }) {
  const name = element != null ? ELEMENT_NAME[element] : undefined;
  if (!name) return null;
  return (
    <span className={`eltag el el--${element}`}>
      <Icon name={ELEMENT_ICON[element!]} size={11} /> Hệ {name}
    </span>
  );
}

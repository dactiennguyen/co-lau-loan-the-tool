import { cn } from "../cn";
import { Icon, type IconName } from "./Icon";

/** Elements as the character (field01 of s2c/9), its skills (id / 1000) and items number them: 1 Hỏa, 2 Lôi, 4 Thủy. */
export const ELEMENT_NAME: Record<number, string> = { 1: "Hỏa", 2: "Lôi", 4: "Thủy" };
/** The game draws a flame and a bolt; Thủy gets a drop. */
export const ELEMENT_ICON: Record<number, IconName> = { 1: "flame", 2: "bolt", 4: "drop" };
/** The colour of an element, Hỏa red, Lôi yellow, Thủy blue: as the text colour, and as var(--el) for a part that tints,
 * frames or fills itself with it. */
const ELEMENT_TONE: Record<number, { text: string; el: string }> = {
  1: { text: "text-hp", el: "[--el:var(--hp)]" },
  2: { text: "text-piece-star", el: "[--el:var(--piece-star)]" },
  4: { text: "text-exp", el: "[--el:var(--exp)]" },
};
export const elementText = (element: number | null | undefined) => (element != null ? (ELEMENT_TONE[element]?.text ?? "") : "");
export const elementVar = (element: number | null | undefined) => (element != null ? (ELEMENT_TONE[element]?.el ?? "") : "");

/** "Hệ Hỏa" in the element's colour, with its icon; nothing for an element without a name. */
export function ElementTag({ element, className }: { element: number | null | undefined; className?: string }) {
  const name = element != null ? ELEMENT_NAME[element] : undefined;
  if (!name) return null;
  return (
    <span className={cn("inline-flex items-center gap-[3px] text-11 font-bold whitespace-nowrap", elementText(element), className)}>
      <Icon name={ELEMENT_ICON[element!]} size={11} /> Hệ {name}
    </span>
  );
}

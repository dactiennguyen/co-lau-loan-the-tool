// Giới tính of gear and of the character, as cllt-core numbers them (items::GENDER_*): `gender` of the item table, and
// flag2 of s2c/9. Gear of the other gender cannot be worn: the server says "Trang bị không phù hợp", Bot::item refuses it
// first with the words of misfit.
import type { IconName } from "@/components/Icon";
import type { Item } from "@/api/types";
import { ELEMENT_NAME } from "@/components/ElementTag";

export const GENDER_WORD: Record<number, string> = { 0: "nam", 1: "nữ" };
export const GENDER_ICON: Record<number, IconName> = { 0: "male", 1: "female" };
/** Nam blue, nữ pink. */
export const GENDER_TEXT: Record<number, string> = { 0: "text-exp", 1: "text-piece-heart" };

/** Why a character of `gender` cannot wear `item` ("đồ nữ, nhân vật là nam", as items::misfit); null when it can, when
 * both can, or while the character's gender is not known. */
export function misfit(item: Pick<Item, "gender">, gender: number | null | undefined): string | null {
  if (item.gender == null || gender == null || !(gender in GENDER_WORD) || item.gender === gender) return null;
  return `đồ ${GENDER_WORD[item.gender]}, nhân vật là ${GENDER_WORD[gender]}`;
}

/** How many levels the character lacks to wear `item` (its `level` of the item table, gear only); 0 when it has enough
 * or while either level is not known. */
export function levelsShort(item: Pick<Item, "level">, level: number | null | undefined): number {
  if (item.level == null || level == null || level <= 0) return 0;
  return Math.max(0, item.level - level);
}

/** Gear of an element (1 Hỏa, 2 Lôi, 4 Thủy) that is not the character's: it can be worn, without the +5% of đúng hệ
 * (as items::off_element). False for an item without an element, or while the character's is not known. */
export function offElement(item: Pick<Item, "element">, element: number | null | undefined): boolean {
  return item.element != null && element != null && item.element in ELEMENT_NAME && element in ELEMENT_NAME && item.element !== element;
}

// The NPC services of Làng Thanh Khê as the Tiện ích modal offers them (npc.rs, docs/app/events/15-shops.md, 16-upgrade.md).
import { itemIcon } from "./itemIcons";
import { isGear, stoneLevel } from "./upgrade";
import type { Character, Item, Recipe } from "@/api/types";

// The rules of Nâng cấp live in upgrade.ts (the root tests import them); exported here too, as the views take them.
export { CHARMS, SAFE_LEVEL, TRANSMUTE_ITEMS, charmUseful, failLevel, isGear, itemCap, stoneLevel, upgradeCap } from "./upgrade";

/** Lái Buôn, Bà Tư Hạnh, Hương Lão and Pháp sư stand in Làng Thanh Khê; the server serves them only on that map (B1). */
export const NPC_MAP = "M1";

export type Category = "weapon" | "hat" | "armour" | "ring" | "potion" | "luong";
export type Money = 0 | 1;
export type Gender = "nam" | "nu";

/** The categories of the Mua tab, in the order shown; `gender` for those sold for men and women apart. */
export const CATEGORIES: { key: Category; label: string; npc: string; gear: boolean; gender: boolean }[] = [
  { key: "weapon", label: "Vũ khí", npc: "Lái Buôn", gear: true, gender: false },
  { key: "hat", label: "Nón", npc: "Bà Tư Hạnh", gear: true, gender: true },
  { key: "armour", label: "Giáp", npc: "Bà Tư Hạnh", gear: true, gender: true },
  { key: "ring", label: "Nhẫn", npc: "Bà Tư Hạnh", gear: true, gender: false },
  { key: "potion", label: "Dược phẩm", npc: "Lái Buôn", gear: false, gender: false },
  { key: "luong", label: "Cửa hàng [Lượng]", npc: "Lái Buôn", gear: false, gender: false },
];

/** The kind of the shop (the first byte of its s2c/1190) for a category, money and gender (npc::SHOPS). */
export function shopKind(category: Category, money: Money, gender: Gender): number {
  switch (category) {
    case "weapon":
      return money ? 7 : 0;
    case "hat":
      return gender === "nam" ? (money ? 9 : 1) : money ? 10 : 2;
    case "armour":
      return gender === "nam" ? (money ? 11 : 3) : money ? 12 : 4;
    case "ring":
      return money ? 13 : 5;
    case "potion":
      return 6;
    case "luong":
      return 8;
  }
}

export const MONEY = ["Xu", "Xu khóa", "Lượng"] as const;

/** The picture of Đá cấp `level`, also for a stone the bag does not hold yet: data/items.json gives items 411–422 the
 * icons 167–178 (data/icons/i167.webp…). */
export const stoneIcon = (level: number) => itemIcon(166 + level);
/** The stones of the bag by level (index 1–12): [locked, unlocked], stone by stone (they stack to 999 since 16/11). */
export function stoneCounts(items: Item[]): [number, number][] {
  const counts = Array.from({ length: 13 }, (): [number, number] => [0, 0]);
  for (const i of items) {
    const level = stoneLevel(i.id);
    if (level) counts[level][i.locked ? 0 : 1] += Math.max(1, i.quantity);
  }
  return counts;
}
/** Đổi Băng Tâm lấy bình rỗng: 8 Băng Tâm (21) for a Bình Huyết Linh (Rỗng) (16); lines 0 one, 1 five, 2 all. */
export const ICE = { iceId: 21, bottleId: 16, perBottle: 8 };
/** The item kinds of Chế tạo trang bị, by their line in its menu (npc::CRAFT_LABELS); also the item kind (0 hat, 1
 * armour, 2 weapon, 3 ring). */
export const CRAFT_KINDS = ["Nón", "Áo", "Vũ khí", "Nhẫn"];
/** The two materials each kind takes, in the order of its recipe (16-upgrade.md#chế-tạo, menus of J3). */
const CRAFT_MATERIALS = [
  ["Da", "Linh Thạch"],
  ["Da", "Gỗ"],
  ["Quặng", "Gỗ"],
  ["Quặng", "Linh Thạch"],
];
/** The tiers of Chế tạo trang bị: its line in the menu of a kind, the character level and the Xu it takes; each takes
 * 24 of both materials of that tier ("Quặng Bậc 2"), and makes gear of level 21, 51 or 101. */
export const CRAFT_TIERS = [
  { tier: 1, level: 21, xu: 2_400 },
  { tier: 2, level: 51, xu: 26_500 },
  { tier: 3, level: 101, xu: 90_000 },
];
/** The recipes of a kind as Pháp sư's menus said them (J3, O1), shown before any menu is read; a menu read
 * (Character.recipes, Xem ở Pháp sư) takes their place. The bot always reads the menu again before it makes one. */
export const knownRecipes = (kind: number): Recipe[] =>
  CRAFT_TIERS.map((t) => ({
    tier: t.tier,
    option: t.tier - 1,
    level: t.level,
    materials: (CRAFT_MATERIALS[kind] ?? []).map((m) => ({ name: `${m} Bậc ${t.tier}`, count: 24 })),
    xu: t.xu,
  }));
/** Da, Quặng, Gỗ, Linh Thạch Bậc 1–6 are items 592–597, 598–603, 604–609, 610–615, whose icons are 215…, 221…, 227…,
 * 233… (data/items.json); the picture of "Gỗ Bậc 2" also before the bag holds one. */
const MATERIAL_ICONS: Record<string, number> = { Da: 215, Quặng: 221, Gỗ: 227, "Linh Thạch": 233 };
export function materialIcon(name: string) {
  const m = /^(.+) Bậc (\d)$/.exec(name);
  const base = m ? MATERIAL_ICONS[m[1]] : undefined;
  return base == null ? undefined : itemIcon(base + Number(m![2]) - 1);
}
/** How the bag holds a material of a recipe: all of it, the largest stack, and whether the count is there. The game puts
 * one stack in the window (the whole of it, of which the server takes the count), and a locked stack does not join an
 * unlocked one, so 12 + 12 in two stacks is not 24. */
export function materialHeld(items: Item[], name: string, count: number) {
  const stacks = items.filter((i) => i.name === name);
  const total = stacks.reduce((n, i) => n + i.quantity, 0);
  const largest = stacks.reduce((n, i) => Math.max(n, i.quantity), 0);
  return { total, largest, stacks: stacks.length, enough: largest >= count, split: largest < count && total >= count };
}
/** "I", "II", … for the tiers of Chế tạo trang bị. */
export const roman = (tier: number) => ["?", "I", "II", "III", "IV", "V", "VI"][tier] ?? String(tier);
/** Cường hoá of a piece of gear, as the bag and the item detail draw it: 0 for +0 and for any other item, whose field0
 * is not a level. */
export const plusOf = (i: Item) => (isGear(i) ? Math.max(0, i.plus) : 0);

/** Why Pháp sư, Hương Lão or a shop cannot be used now; the bot refuses the same (Bot::busy, Bot::smith). */
export function busyReason(c: Character): string | null {
  if (c.battle) return "Đang đánh: đợi hết trận.";
  if (c.job && !c.job.done) return "Đang tự đánh quái: bấm Dừng trước.";
  if (c.questRun && !c.questRun.done) return "Đang tự làm nhiệm vụ: bấm Dừng trước.";
  if (c.moving) return `${c.moving}…`;
  if (c.smith && !c.smith.done) return "Đang làm việc với Pháp sư hay Hương Lão.";
  if (c.gift && !c.gift.done) return "Đang nhập mã quà tặng.";
  if (c.mailbox.changing) return "Đang nhận hay xoá thư.";
  if (c.market.changing) return "Đang mua bán ở Chợ trời.";
  return null;
}

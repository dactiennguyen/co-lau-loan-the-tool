// The NPC services of Làng Thanh Khê as the Cửa hàng tab offers them (npc.rs, docs/app/events/15-shops.md, 16-upgrade.md).
import type { Character, Item } from "./types";

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

/** Đá cấp 1–12 are items 411–422; 0 for any other item. */
export const stoneLevel = (id: number) => (id > 410 && id <= 422 ? id - 410 : 0);
/** Trần cường hoá of the Cẩm nang by the level to wear: tier 1 to +4, 21 to +8, 51 to +12, 101 and up to +16. */
export const upgradeCap = (level: number) => (level >= 101 ? 16 : level >= 51 ? 12 : level >= 21 ? 8 : 4);
/** Below +4 a failed Nâng cấp keeps the level; the app upgrades only that far until Bùa bảo vệ is measured. */
export const SAFE_LEVEL = 4;
/** Chuyển hoá trang bị sơ, trung, cao cấp: the level each moves up to. */
export const TRANSMUTE_ITEMS = [
  { id: 616, upTo: 10 },
  { id: 617, upTo: 13 },
  { id: 618, upTo: 16 },
];
/** The gear Pháp sư upgrades: Nón, Áo, Vũ khí, Nhẫn, Cánh. */
export const isGear = (i: Item) => i.kind != null && i.kind <= 4;

/** Why Pháp sư, Hương Lão or a shop cannot be used now; the bot refuses the same (Bot::busy, Bot::smith). */
export function busyReason(c: Character): string | null {
  if (c.battle) return "Đang đánh: đợi hết trận.";
  if (c.job && !c.job.done) return "Đang tự đánh quái: bấm Dừng trước.";
  if (c.questRun && !c.questRun.done) return "Đang tự làm nhiệm vụ: bấm Dừng trước.";
  if (c.moving) return `${c.moving}…`;
  if (c.smith && !c.smith.done) return "Đang làm việc với Pháp sư hay Hương Lão.";
  return null;
}

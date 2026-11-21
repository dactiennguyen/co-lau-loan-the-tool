// The rules of Nâng cấp at Pháp sư (docs/app/events/16-upgrade.md), apart from shops.ts so the root tests (node, which
// cannot run the import.meta.glob of itemIcons.ts nor resolve @/) can import them: only types go through @/. The same
// rules are in src/protocol/npc.ts (TS prototype) and core/src/npc.rs; test/upgrade-rules.test.ts checks the two TS ones
// agree. shops.ts exports them again, so the views import them from there as before.
import type { Item } from "@/api/types";

/** Đá cấp 1–12 are items 411–422; 0 for any other item. */
export const stoneLevel = (id: number) => (id > 410 && id <= 422 ? id - 410 : 0);
/** Trần cường hoá of the Cẩm nang by the level to wear: tier 1 to +4, 21 to +8, 51 to +12, 101 and up to +16. */
export const upgradeCap = (level: number) => (level >= 101 ? 16 : level >= 51 ? 12 : level >= 21 ? 8 : 4);
/** Trần cường hoá of an item: wings (kind 4) go to +16 whatever their level (npc::item_cap). */
export const itemCap = (i: Item) => (i.kind === 4 ? 16 : upgradeCap(i.level ?? 1));
/** Below +4 a failed Nâng cấp keeps the level. */
export const SAFE_LEVEL = 4;
/** Bùa bảo vệ sơ, trung, cao, siêu cấp and the highest level of the upgrade each protects (npc::CHARMS). */
export const CHARMS = [
  { id: 35, upTo: 8, name: "sơ cấp" },
  { id: 36, upTo: 12, name: "trung cấp" },
  { id: 37, upTo: 14, name: "cao cấp" },
  { id: 38, upTo: 16, name: "siêu cấp" },
];
/** The level of an item +`level` after a failed Nâng cấp without a charm: +4, +8, +12, +14 (npc::fail_level). */
export const failLevel = (level: number) => [4, 8, 12, 14].filter((m) => m <= level).pop() ?? level;
/** A failed Nâng cấp from +`level` loses levels (+5 to +7, +9 to +11, +13, +15): a charm is worth it. */
export const charmUseful = (level: number) => failLevel(level) < level;
/** Chuyển hoá trang bị sơ, trung, cao cấp: the level each moves up to. */
export const TRANSMUTE_ITEMS = [
  { id: 616, upTo: 10 },
  { id: 617, upTo: 13 },
  { id: 618, upTo: 16 },
];
/** The gear Pháp sư upgrades: Nón, Áo, Vũ khí, Nhẫn, Cánh (0–4), and Giày, Dây chuyền (8, 9) of the game 1.1.0
 * (npc::upgradable). */
export const isGear = (i: Item) => i.kind != null && (i.kind <= 4 || i.kind === 8 || i.kind === 9);

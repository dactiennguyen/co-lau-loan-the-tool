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

// Luyện tự chọn (16-upgrade.md#luyện-đá): any 2–24 stones of any levels in Luyện đá, as fuseQuote of src/protocol/npc.ts
// and npc::fuse_quote. Đá cấp k is worth 4^(k−1); the server aims at the lowest level T worth at least the stones, at
// ⌊100 × value / 4^(T−1)⌋ %, and lets Bắt đầu be pressed above 40% only. What a failure takes is not measured.

/** Đá cấp `level` in Đá cấp 1. */
export const stoneValue = (level: number) => 4 ** (level - 1);
/** The fee of Luyện đá for a stone of level `target`: ⌈0,4 × 4^(target−1)⌉. */
export const mergeFee = (target: number) => Math.ceil((2 * stoneValue(target)) / 5);
/** Stones Luyện đá takes at least and at most, and the lowest odds it lets be pressed. */
export const FUSE = { min: 2, max: 24, rate: 41 } as const;
export interface FuseQuote {
  count: number;
  value: number;
  target: number;
  rate: number;
  fee: number;
}
/** What Luyện đá makes of stones of these levels, one entry per stone: the stone it aims at, the odds and the fee. */
export function fuseQuote(levels: number[]): FuseQuote {
  const value = levels.reduce((n, l) => n + stoneValue(l), 0);
  let target = 1;
  while (stoneValue(target) < value) target++;
  return { count: levels.length, value, target, rate: Math.floor((100 * value) / stoneValue(target)), fee: mergeFee(target) };
}
/** Why Luyện đá would not press for this quote; null when it would. */
export function fuseWhy(q: FuseQuote): string | null {
  if (q.count < FUSE.min) return `Cần ít nhất ${FUSE.min} viên đá`;
  if (q.count > FUSE.max) return `Lò chỉ nhận ${FUSE.max} viên, đang chọn ${q.count}`;
  if (q.target > 12) return "Tổng vượt quá Đá cấp 12";
  if (q.rate < FUSE.rate) return `Tỉ lệ ${q.rate}%: game chỉ cho luyện khi trên 40%`;
  return null;
}
/** Few stones of `held` (stones by level, index 1–12) that make Đá cấp `target` at `rate` % at least: from the level
 * under the target down, the stones of a level that reach the odds when it has enough (without passing the target, so
 * the server aims at it), else all of that level and on to the next one down. How many of each level (index 0–12); null
 * when the stones held cannot, or need more than FUSE.max. */
export function fuseSuggest(held: number[], target: number, rate: number): number[] | null {
  if (target < 2 || target > 12) return null;
  const top = stoneValue(target);
  const take = Array<number>(13).fill(0);
  const need = Math.ceil((Math.min(100, Math.max(FUSE.rate, rate)) * top) / 100);
  let got = 0;
  for (let l = target - 1; l >= 1 && got < need; l--) {
    const has = held[l] ?? 0;
    const v = stoneValue(l);
    const up = Math.ceil((need - got) / v);
    take[l] = up <= has && got + up * v <= top ? up : Math.min(has, Math.floor((need - got) / v));
    got += take[l] * v;
  }
  if (got < need) return null;
  const q = fuseQuote(take.flatMap((n, l) => Array<number>(n).fill(l)));
  return q.target === target && !fuseWhy(q) ? take : null;
}

// The 14 shops of Lái Buôn (106) and Bà Tư Hạnh (103) in M1, and Hương Lão's Đổi lượng and Điểm năng động
// (docs/app/events/15-shops.md, docs/app/events/14-npc.md#hương-lão). Paths and labels as J1 read them: the second level
// puts the money on a line of its own ("Nón Nam\n[Xu]").

/** A line of an NPC menu: its code and the label it must have. */
export type MenuLine = readonly [option: number, label: RegExp];
export interface Shop {
  /** The first byte of s2c/1190. */
  code: number;
  npcId: number;
  path: readonly MenuLine[];
  /** The money of its lines: 0 Xu, 1 Xu khóa, 2 Lượng; Dược phẩm has lines of both Xu and Xu khóa. */
  currencies: readonly number[];
}
export const LAI_BUON = 106, BA_TU_HANH = 103;

const weapons: MenuLine = [0, /^Vũ khí$/];
const hats: MenuLine = [0, /^Nón$/], armour: MenuLine = [1, /^Giáp$/], rings: MenuLine = [2, /^Nhẫn$/];
const line = (option: number, name: string, money: 'Xu' | 'Xu khóa'): MenuLine => [option, new RegExp(`^${name}\\n\\[${money}\\]$`)];

export const SHOPS = {
  'vukhi-xu': { code: 0, npcId: LAI_BUON, path: [weapons, line(0, 'Vũ khí', 'Xu')], currencies: [0] },
  'vukhi-khoa': { code: 7, npcId: LAI_BUON, path: [weapons, line(1, 'Vũ khí', 'Xu khóa')], currencies: [1] },
  'duoc': { code: 6, npcId: LAI_BUON, path: [[1, /^Dược phẩm$/]], currencies: [0, 1] },
  'luong': { code: 8, npcId: LAI_BUON, path: [[2, /^Cửa hàng \[Lượng\]$/]], currencies: [2] },
  'non-nam-xu': { code: 1, npcId: BA_TU_HANH, path: [hats, line(0, 'Nón Nam', 'Xu')], currencies: [0] },
  'non-nu-xu': { code: 2, npcId: BA_TU_HANH, path: [hats, line(1, 'Nón Nữ', 'Xu')], currencies: [0] },
  'non-nam-khoa': { code: 9, npcId: BA_TU_HANH, path: [hats, line(2, 'Nón Nam', 'Xu khóa')], currencies: [1] },
  'non-nu-khoa': { code: 10, npcId: BA_TU_HANH, path: [hats, line(3, 'Nón Nữ', 'Xu khóa')], currencies: [1] },
  'giap-nam-xu': { code: 3, npcId: BA_TU_HANH, path: [armour, line(0, 'Giáp Nam', 'Xu')], currencies: [0] },
  'giap-nu-xu': { code: 4, npcId: BA_TU_HANH, path: [armour, line(1, 'Giáp Nữ', 'Xu')], currencies: [0] },
  'giap-nam-khoa': { code: 11, npcId: BA_TU_HANH, path: [armour, line(2, 'Giáp Nam', 'Xu khóa')], currencies: [1] },
  'giap-nu-khoa': { code: 12, npcId: BA_TU_HANH, path: [armour, line(3, 'Giáp Nữ', 'Xu khóa')], currencies: [1] },
  'nhan-xu': { code: 5, npcId: BA_TU_HANH, path: [rings, line(0, 'Nhẫn', 'Xu')], currencies: [0] },
  'nhan-khoa': { code: 13, npcId: BA_TU_HANH, path: [rings, line(1, 'Nhẫn', 'Xu khóa')], currencies: [1] },
} as const satisfies Record<string, Shop>;
export type ShopKey = keyof typeof SHOPS;
export const MONEY_NAMES = ['Xu', 'Xu khóa', 'Lượng'] as const;
/** The key of the money in s2c/46 (Holdings.money) for a currency of s2c/1190. */
export const MONEY_KEYS = ['xu', 'xuKhoa', 'luong'] as const;

/** Hương Lão (102 of M1): line 1 Đổi lượng → "Con muốn đổi gì." with the two lines below, each run at once on c2s/57
 * (J3, G1): s2c/46 (Lượng − 50), s2c/46 (+ the money), s2c/1256 "Bạn vừa nhận được …". */
export const EXCHANGE = {
  path: [[1, /^Đổi lượng$/]] as readonly MenuLine[],
  luong: 50,
  lines: {
    xu: [0, /^50 lượng nhận 50\.000 Xu$/] as MenuLine,
    khoa: [1, /^50 lượng nhận 55\.000 Xu khóa$/] as MenuLine,
  },
  gets: { xu: 50_000, khoa: 55_000 },
  done: /^Bạn vừa nhận được/,
};

/** Line 3 Điểm năng động of Hương Lão: its menu text (J1, G1). Đổi Xu at 100 points is not measured; Đóng (line 2) gets
 * no answer and leaves the phone's client waiting, so the bot never sends it. */
export const POINTS = { path: [[3, /^Điểm năng động$/]] as readonly MenuLine[], rules: [1, /^Cách tính điểm$/] as MenuLine };
const num = (s: string) => Number(s.replace(/\./g, ''));
/** "Điểm năng động tuần này: 54/100\nHạn mức đổi (cấp 79): 7.000 Xu, cần 7.700 Xu khóa\nTuần này còn 500/500 suất. …" */
export function pointsText(text: string) {
  const points = /tuần này: (\d+)\/(\d+)/.exec(text), limit = /Hạn mức đổi \(cấp (\d+)\): ([\d.]+) Xu, cần ([\d.]+) Xu khóa/.exec(text);
  const slots = /còn ([\d.]+)\/([\d.]+) suất/.exec(text);
  return {
    points: points ? Number(points[1]) : undefined, need: points ? Number(points[2]) : undefined,
    level: limit ? Number(limit[1]) : undefined, xu: limit ? num(limit[2]) : undefined, xuKhoa: limit ? num(limit[3]) : undefined,
    slotsLeft: slots ? num(slots[1]) : undefined, slots: slots ? num(slots[2]) : undefined,
  };
}

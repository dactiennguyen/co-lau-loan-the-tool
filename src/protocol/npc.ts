// NPC services of Làng Thanh Khê (M1): the 14 shops of Lái Buôn and Bà Tư Hạnh, Đổi lượng of Hương Lão, and the
// windows of Pháp sư (Nâng cấp [Thường] and [Cẩn thận], Chuyển hoá, Tách đá, Luyện đá). docs/app/events/15-shops.md,
// 16-upgrade.md. Each window answers every item put in (c2s/97) with the price and the odds; c2s/91 is Bắt đầu in all.
import { Reader, Writer } from './protocol.ts';
import { finish, itemRecord } from './world.ts';

export type ItemRecord = ReturnType<typeof itemRecord>;
/** The fields of a bag item the plans below read. */
export interface BagItem { slot: number; itemId: number; field0: number; field1: number }

// ---------------------------------------------------------------------------------------------------------------------
// Where: the NPCs and the lines of their menus (c2s/57, mã dòng) that open each shop or window.

/** Lái Buôn, Bà Tư Hạnh, Hương Lão and Pháp sư stand in Làng Thanh Khê; the server answers c2s/13 to them from anywhere on
 * that map, and "Không thể thực hiện" from another (B1). */
export const NPC_MAP = 'M1';
export const MERCHANT = 106;
export const TAILOR = 103;
export const ELDER = 102;
export const SMITH = 161;

/** The 14 shops (15-shops.md#mở-cửa-hàng): `kind` is the first byte of their s2c/1190, `path` the lines to pick from
 * the NPC's first menu, `money` 0 Xu, 1 Xu khóa, 2 Lượng (-1: both, the Dược phẩm). */
export const SHOPS = [
  { kind: 0, npcId: MERCHANT, path: [0, 0], name: 'Vũ khí', money: 0 },
  { kind: 7, npcId: MERCHANT, path: [0, 1], name: 'Vũ khí', money: 1 },
  { kind: 6, npcId: MERCHANT, path: [1], name: 'Dược phẩm', money: -1 },
  { kind: 8, npcId: MERCHANT, path: [2], name: 'Cửa hàng [Lượng]', money: 2 },
  { kind: 1, npcId: TAILOR, path: [0, 0], name: 'Nón Nam', money: 0 },
  { kind: 9, npcId: TAILOR, path: [0, 2], name: 'Nón Nam', money: 1 },
  { kind: 2, npcId: TAILOR, path: [0, 1], name: 'Nón Nữ', money: 0 },
  { kind: 10, npcId: TAILOR, path: [0, 3], name: 'Nón Nữ', money: 1 },
  { kind: 3, npcId: TAILOR, path: [1, 0], name: 'Giáp Nam', money: 0 },
  { kind: 11, npcId: TAILOR, path: [1, 2], name: 'Giáp Nam', money: 1 },
  { kind: 4, npcId: TAILOR, path: [1, 1], name: 'Giáp Nữ', money: 0 },
  { kind: 12, npcId: TAILOR, path: [1, 3], name: 'Giáp Nữ', money: 1 },
  { kind: 5, npcId: TAILOR, path: [2, 0], name: 'Nhẫn', money: 0 },
  { kind: 13, npcId: TAILOR, path: [2, 1], name: 'Nhẫn', money: 1 },
] as const;
export const shopOf = (kind: number) => SHOPS.find(s => s.kind === kind);

/** Pháp sư's windows (16-upgrade.md#cửa-sổ) and the lines of his menus that open them: s2c/96 for the first four,
 * s2c/99 for Luyện đá. */
export const WINDOWS = {
  upgrade: [0, 0],
  careful: [0, 1],
  transmute: [0, 2],
  separate: [2],
  mergeXuKhoa: [1, 0],
  mergeXu: [1, 1],
} as const;
export type WindowKind = keyof typeof WINDOWS;

/** Đổi lượng of Hương Lão (15-shops.md#đổi-lượng): line 1 of his menu, then 0 for 50.000 Xu or 1 for 55.000 Xu khóa, 50
 * Lượng each. The server exchanges at once, without asking again (J3). */
export const EXCHANGE = { path: [1], luong: 50, options: [{ option: 0, xu: 50_000, xuKhoa: 0 }, { option: 1, xu: 0, xuKhoa: 55_000 }] } as const;

// ---------------------------------------------------------------------------------------------------------------------
// The packets of Pháp sư's windows (16-upgrade.md#gói).

/** s2c/96: the window of Nâng cấp, Chuyển hoá ("TRANSMUTE") or Tách đá (no stone slots). */
export function serviceWindow(payload: Uint8Array) {
  const r = new Reader(payload);
  return finish(r, { name: r.string(), key: r.string(), prompt: r.string(), title: r.string(), slots: r.i32() }, 's2c/96');
}

/** s2c/99: the window of Luyện đá ("abcd1002" Xu khóa, "abcd1003" Xu, 24 stones), Chế tạo cánh, Chế Băng Kiếm. */
export function craftWindow(payload: Uint8Array) {
  const r = new Reader(payload);
  return finish(r, { key: r.string(), prompt: r.string(), title: r.string(), slots: r.i32() }, 's2c/99');
}

/** s2c/90, the answer to c2s/97 in an s2c/96 window: the item put (`gear` for the item slot), the price and odds once
 * enough is in (`text`, see quote), and whether Bắt đầu may be pressed. */
export function serviceSlot(payload: Uint8Array) {
  const r = new Reader(payload), name = r.string();
  r.u8();
  const gear = r.u8() === 1, slot = r.i32(), quantity = r.i32();
  r.i32(); r.i32();
  return finish(r, { name, gear, slot, quantity, text: r.string(), ready: r.u8() === 1 }, 's2c/90');
}

/** s2c/92, the answer to c2s/97 in Luyện đá: the stone put, then what it makes, the fee and the odds. */
export function stoneSlot(payload: Uint8Array) {
  const r = new Reader(payload), name = r.string();
  r.u8();
  const slot = r.i32();
  r.i32(); r.i32();
  return finish(r, { name, slot, text: r.string(), ready: r.u8() === 1 }, 's2c/92');
}

/** s2c/1258 after the gear of Nâng cấp is put, and after Bắt đầu: the item one level up, for the result slot. */
export function servicePreview(payload: Uint8Array) {
  const r = new Reader(payload);
  r.u8();
  return finish(r, { uuid: r.string(), level: r.i32(), item: itemRecord(r) }, 's2c/1258');
}

/** s2c/1260, the answer to c2s/97 in Chuyển hoá when the item put is a +0 one: it is the target. */
export function transmuteTarget(payload: Uint8Array) {
  const r = new Reader(payload);
  r.u8();
  return finish(r, { slot: r.i32(), text: r.string(), ready: r.u8() === 1 }, 's2c/1260');
}

/** s2c/91 after Bắt đầu in an s2c/96 window: success or not, the item after it (Nâng cấp; the +0 item of Tách đá; the +0
 * source of Chuyển hoá), the items received (the stones of Tách đá), and for Chuyển hoá the target at its new level. */
export function serviceResult(payload: Uint8Array) {
  const r = new Reader(payload), name = r.string(), ok = r.u8() === 1, item = itemRecord(r), received = [];
  for (let n = r.i32(); n > 0; n--) received.push(itemRecord(r));
  const target = r.offset < r.data.length ? itemRecord(r) : null;
  return finish(r, { name, ok, item, received, target }, 's2c/91');
}

/** s2c/93 after Bắt đầu in Luyện đá: success or not, and the stone made. */
export function stoneResult(payload: Uint8Array) {
  const r = new Reader(payload), name = r.string(), ok = r.u8() === 1, items = [];
  for (let n = r.i32(); n > 0; n--) items.push(itemRecord(r));
  return finish(r, { name, ok, items }, 's2c/93');
}

/** s2c/92 in Chế tạo trang bị: as stoneSlot, with the fee in Xu once both materials are in (O1: 2.400 for Bậc I, 26.500
 * Bậc II, 90.000 Bậc III; 0 before that, and 0 in Luyện đá, whose fee is in the text). */
export function craftSlot(payload: Uint8Array) {
  const r = new Reader(payload), name = r.string();
  r.u8();
  const slot = r.i32();
  r.i32();
  const fee = r.i32();
  return finish(r, { name, slot, fee, text: r.string(), ready: r.u8() === 1 }, 's2c/92');
}

/** The third field of c2s/97 (16-upgrade.md#gói): 0 for gear, stones and Chuyển hoá items; 1 for Bùa bảo vệ and the
 * materials of Chế tạo trang bị, which go in with the whole stack (O1). With 0 a charm is "Vật phẩm không phù hợp". */
export const PUT_ITEM = 0, PUT_STACK = 1;
/** c2s/97: puts the item of a bag slot in the open window. Free; the window answers. */
export const putRequest = (slot: number, quantity = 1, kind = PUT_ITEM) => new Writer().string('').u8(0).i32(kind).i32(slot).i32(quantity).build();
/** c2s/91: Bắt đầu, the same in every window. */
export const startRequest = () => new Writer().string('').build();

// ---------------------------------------------------------------------------------------------------------------------
// What the windows say: "Cần: 33 Xu khóa (không đủ sẽ sử dụng cả Xu)\nCần: 0 Lượng\nTỉ lệ thành công: 75%",
// "Luyện thành Đá cấp 6 Khóa\nCần: 410 Xu khóa …", "Nhận được: 2 Đá cấp 1, ".

export interface Quote {
  /** The fee and its money: Xu khóa (Xu when short), or Xu in Luyện đá [Xu] with unlocked stones. */
  fee: { amount: number; money: 'xu' | 'xuKhoa' } | null;
  /** Lượng of Nâng cấp [Cẩn thận]; 0 otherwise. */
  luong: number;
  /** Tỉ lệ thành công in %. */
  rate: number | null;
  /** The stone Luyện đá makes, and whether it will be trade-locked. */
  stone: { level: number; locked: boolean } | null;
  /** What Tách đá gives back. */
  gain: { quantity: number; name: string }[];
}

const amount = (s: string) => Number(s.replace(/\./g, ''));
export function quote(text: string): Quote {
  const q: Quote = { fee: null, luong: 0, rate: null, stone: null, gain: [] };
  for (const line of text.split('\n')) {
    let m: RegExpExecArray | null;
    if ((m = /^Cần: ([\d.]+) (Xu khóa|Xu|Lượng)/.exec(line))) {
      if (m[2] === 'Lượng') q.luong = amount(m[1]);
      else q.fee = { amount: amount(m[1]), money: m[2] === 'Xu' ? 'xu' : 'xuKhoa' };
    } else if ((m = /^Tỉ lệ thành công: (\d+)%/.exec(line))) q.rate = Number(m[1]);
    else if ((m = /^Luyện thành Đá cấp (\d+)( Khóa)?/.exec(line))) q.stone = { level: Number(m[1]), locked: !!m[2] };
    else if (line.startsWith('Nhận được: ')) {
      q.gain = line.slice('Nhận được: '.length).split(',').map(x => x.trim()).filter(Boolean).map(x => {
        const g = /^(\d+) (.+)$/.exec(x);
        return g ? { quantity: Number(g[1]), name: g[2] } : { quantity: 1, name: x };
      });
    }
  }
  return q;
}

// ---------------------------------------------------------------------------------------------------------------------
// Stones (16-upgrade.md#các-loại-đá): Đá cấp 1–12 are items 411–422; one of level k is worth 4^(k−1) of level 1.

export const STONE_ID = 410;
export const stoneLevel = (itemId: number) => (itemId > STONE_ID && itemId <= STONE_ID + 12 ? itemId - STONE_ID : 0);
export const stoneValue = (level: number) => 4 ** (level - 1);
/** The fee of Luyện đá for a stone of level `target`: ⌈0,4 × 4^(target−1)⌉ (measured for 2, 4, 5, 6, 7). */
export const mergeFee = (target: number) => Math.ceil((2 * stoneValue(target)) / 5);
/** Trần cường hoá of the Cẩm nang by wear level: tier 1 to +4, 21 to +8, 51 to +12, 101 and up to +16. */
export const upgradeCap = (wearLevel: number) => (wearLevel >= 101 ? 16 : wearLevel >= 51 ? 12 : wearLevel >= 21 ? 8 : 4);
/** Below +4 a failed Nâng cấp keeps the level (Cẩm nang); the app upgrades only that far until Bùa is measured. */
export const SAFE_LEVEL = 4;
/** Chuyển hoá trang bị sơ, trung, cao cấp and the level each moves up to. */
export const TRANSMUTE_ITEMS = [{ itemId: 616, upTo: 10 }, { itemId: 617, upTo: 13 }, { itemId: 618, upTo: 16 }] as const;

const locked = (i: BagItem) => i.field1 === 0;

/** One Luyện đá: four stones of one level and lock, made into one of the next level at 100%. */
export interface MergeSet { level: number; slots: number[]; locked: boolean; window: 'mergeXu' | 'mergeXuKhoa'; fee: number }

/** Gộp đá: the sets of 4 stones of a level that Luyện đá makes into one of the next at 100%, lowest level first. Unlocked
 * stones go together in Luyện đá [Xu], paid in Xu, so the stone made stays tradeable; locked ones in [Xu khóa]. A level's
 * 1–3 stones left over stay. `upTo` is the highest level made (12 at most); `unlocked` false leaves unlocked stones be.
 * The stones made are not in this plan: plan again on the new bag to go on up. */
export function mergePlan(bag: BagItem[], { upTo = 12, unlocked = true } = {}): MergeSet[] {
  const sets: MergeSet[] = [];
  for (let level = 1; level < Math.min(upTo, 12); level++) {
    for (const lock of [false, true]) {
      if (!lock && !unlocked) continue;
      const slots = bag.filter(i => stoneLevel(i.itemId) === level && locked(i) === lock).map(i => i.slot).sort((a, b) => a - b);
      for (let k = 0; k + 4 <= slots.length; k += 4) {
        sets.push({ level, slots: slots.slice(k, k + 4), locked: lock, window: lock ? 'mergeXuKhoa' : 'mergeXu', fee: mergeFee(level + 1) });
      }
    }
  }
  return sets;
}

/** What Gộp đá does in all, going on up with the stones it makes (mergePlan again after each): how many merges, the fees
 * in Xu and Xu khóa, the bag slots freed, and the stones made by level and lock. */
export function mergeForecast(bag: BagItem[], { upTo = 12, unlocked = true } = {}) {
  const top = Math.min(upTo, 12), count = new Map<string, number>(), made = new Map<string, number>();
  for (const i of bag) {
    const level = stoneLevel(i.itemId);
    if (level) count.set(`${level}:${locked(i)}`, (count.get(`${level}:${locked(i)}`) ?? 0) + 1);
  }
  let merges = 0, xu = 0, xuKhoa = 0;
  for (let level = 1; level < top; level++) {
    for (const lock of [false, true]) {
      if (!lock && !unlocked) continue;
      const sets = Math.floor((count.get(`${level}:${lock}`) ?? 0) / 4);
      if (!sets) continue;
      const key = `${level + 1}:${lock}`;
      count.set(key, (count.get(key) ?? 0) + sets);
      made.set(key, (made.get(key) ?? 0) + sets);
      merges += sets;
      if (lock) xuKhoa += sets * mergeFee(level + 1);
      else xu += sets * mergeFee(level + 1);
    }
  }
  return {
    merges, xu, xuKhoa, freed: merges * 3,
    made: [...made].map(([k, n]) => ({ level: Number(k.split(':')[0]), locked: k.endsWith('true'), count: n }))
      .filter(m => m.count > 0).sort((a, b) => a.level - b.level || Number(a.locked) - Number(b.locked)),
  };
}

/** The stones Nâng cấp may use, in the order to put them: lowest value first, and within a level the locked ones before
 * the unlocked ones, which stay tradeable longer. `unlocked` false leaves unlocked stones out. The server takes every
 * stone put in (J3), so the bot puts them one by one and stops as soon as the odds are reached. */
export function upgradeStones<T extends BagItem>(bag: T[], { unlocked = true } = {}) {
  return bag.filter(i => stoneLevel(i.itemId) && (unlocked || locked(i)))
    .sort((a, b) => stoneLevel(a.itemId) - stoneLevel(b.itemId) || Number(locked(b)) - Number(locked(a)) || a.slot - b.slot);
}

/** The bag items Chuyển hoá may move `source`'s level to (16-upgrade.md#chuyển-hoá): another item of the same type, at
 * +0, of a tier (wear level) at least the source's, and able to reach that level. `def` gives an item's type and level. */
export function transmuteTargets<T extends BagItem>(bag: T[], source: BagItem, def: (itemId: number) => { type: number; level: number } | undefined) {
  const from = def(source.itemId);
  if (!from || source.field0 < 1) return [];
  return bag.filter(i => {
    const to = def(i.itemId);
    return i.slot !== source.slot && i.field0 === 0 && !!to && to.type === from.type && to.level >= from.level && upgradeCap(to.level) >= source.field0;
  });
}

/** The cheapest Chuyển hoá item of the bag that moves a +`level` item, if any. */
export function transmuteItem<T extends BagItem>(bag: T[], level: number) {
  for (const t of TRANSMUTE_ITEMS) {
    if (t.upTo < level) continue;
    const item = bag.find(i => i.itemId === t.itemId);
    if (item) return item;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------------
// Bùa bảo vệ, Chế tạo trang bị and Đổi Băng Tâm (O1, 16-upgrade.md#thất-bại-và-bùa, #chế-tạo).

/** Bùa bảo vệ sơ, trung, cao, siêu cấp and the highest level of the upgrade each protects ("từ cấp 1 đến cấp 8 / 12 /
 * 14 / 16"). They stack, and go in with c2s/97 kind 1, quantity 1. */
export const CHARMS = [{ itemId: 35, upTo: 8 }, { itemId: 36, upTo: 12 }, { itemId: 37, upTo: 14 }, { itemId: 38, upTo: 16 }] as const;
/** The levels a failed Nâng cấp falls back to (Cẩm nang; +7 → +4 measured in O1). Below +4 it keeps its level. */
export const FALLBACK_LEVELS = [4, 8, 12, 14] as const;
/** The level of an item +`level` after a failed Nâng cấp without a charm. */
export function failLevel(level: number) {
  let to = level;
  for (const m of FALLBACK_LEVELS) if (m <= level) to = m;
  return to;
}
/** Whether a failed Nâng cấp from +`level` loses levels (+5 to +7, +9 to +11, +13, +15), so a charm is worth it. */
export const charmUseful = (level: number) => failLevel(level) < level;
/** The lowest charm of the bag that protects the upgrade from +`level` to the next. */
export function charmFor<T extends { itemId: number }>(bag: T[], level: number) {
  for (const c of CHARMS) {
    if (c.upTo < level + 1) continue;
    const item = bag.find(i => i.itemId === c.itemId);
    if (item) return item;
  }
  return undefined;
}
/** Trần cường hoá of an item from its it1 type and wear level: wings (type 4) go to +16 whatever their level. */
export const itemCap = (def: { type: number; level: number }) => (def.type === 4 ? 16 : upgradeCap(def.level));
/** Gear that Pháp sư upgrades: Nón, Áo, Vũ khí, Nhẫn, Cánh (it1 types 0–4). */
export const isGear = (def: { type: number } | undefined) => !!def && def.type >= 0 && def.type <= 4;

/** Chế tạo trang bị: Pháp sư → 3 Chế tạo → 1 Chế tạo trang bị → the kind (0 Nón, 1 Áo, 2 Vũ khí, 3 Nhẫn), whose s2c/57
 * gives the recipes; a tier line opens the window s2c/99 "abcd1001". */
export const CRAFT_KINDS = { non: 0, ao: 1, vukhi: 2, nhan: 3 } as const;
export const CRAFT_LABELS = ['Nón', 'Áo', 'Vũ khí', 'Nhẫn'] as const;
export interface Recipe { tier: number; option: number; level: number; materials: { name: string; count: number }[]; xu: number }
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };

/** The recipes of an item kind from its s2c/57: the text gives "Bậc I: Quặng Bậc 1 x24, Linh Thạch Bậc 1 x24, 2.400 Xu"
 * for each tier, the lines "Bậc II (Lv 51)" the character level each needs (O1). */
export function recipes(menu: { text: string; options: { option: number; label: string }[] }): Recipe[] {
  const out: Recipe[] = [];
  for (const line of menu.text.split('\n')) {
    const m = /^Bậc ([IV]+): (.+)$/.exec(line.trim());
    if (!m || !ROMAN[m[1]]) continue;
    const parts = m[2].split(',').map(p => p.trim()), price = /^([\d.]+) Xu$/.exec(parts.at(-1) ?? '');
    const materials = parts.slice(0, -1).map(p => /^(.+) x(\d+)$/.exec(p)).filter(x => !!x).map(x => ({ name: x[1], count: Number(x[2]) }));
    const tier = ROMAN[m[1]], label = menu.options.find(o => new RegExp(`^Bậc ${m[1]} \\(Lv (\\d+)\\)`).test(o.label));
    if (!price || !label || materials.length !== parts.length - 1) continue;
    out.push({ tier, option: label.option, level: Number(/Lv (\d+)/.exec(label.label)![1]), materials, xu: amount(price[1]) });
  }
  return out;
}

/** The bag slot to put for each material of a recipe: the largest stack of that item, which must hold the count (the
 * client puts one stack, the whole of it; the server takes the count). `idOf` maps a material name to its item id. */
export function craftMaterials<T extends { slot: number; itemId: number; quantity: number }>(bag: T[], recipe: Recipe, idOf: (name: string) => number | undefined) {
  const puts: { name: string; count: number; item: T }[] = [], missing: string[] = [];
  for (const m of recipe.materials) {
    const id = idOf(m.name), best = bag.filter(i => i.itemId === id).sort((a, b) => b.quantity - a.quantity)[0];
    if (best && best.quantity >= m.count) puts.push({ ...m, item: best });
    else missing.push(`${m.name} ${best?.quantity ?? 0}/${m.count}`);
  }
  return { puts, missing };
}

/** Đổi Băng Tâm lấy bình rỗng: Pháp sư → 3 Chế tạo → 3, then 0 one bottle, 1 five, 2 all. 8 Băng Tâm (item 21) make one
 * Bình Huyết Linh (Rỗng) (item 16). The server exchanges as soon as the line is picked, without asking again (O1). */
export const ICE = { perBottle: 8, iceId: 21, bottleId: 16, options: { 1: 0, 5: 1, all: 2 } } as const;
/** "Đổi 8 Băng Tâm lấy 1 Bình Huyết Linh (Rỗng). Bạn đang có 8 Băng Tâm." → 8. */
export const iceHeld = (text: string) => { const m = /Bạn đang có ([\d.]+) Băng Tâm/.exec(text); return m ? amount(m[1]) : undefined; };

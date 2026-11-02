import { Reader } from './protocol.ts';

// offline-a2/<n + 9>.fx: the frames and the motions of the sprite sheet offline-a2/<n>.dat, the image decodeAsset of
// items.ts turns into a PNG (docs/app/events/06-map-mobs.md#ảnh-quái). Big endian, as every file of the game:
//   u8 2; i32 n; u16 width; u16 height; u8 0; u16 frames; frames × (u16 x; u16 y; u16 w; u16 h)
//   u8 motions; motions × (u8 id; u16 width; u16 height; u8 a; u8 loop; u16 b; u8 steps;
//                          steps × (u8 parts; parts × (u16 frame; i16 dx; i16 dy)); u16 length; length × i16 step or −1)
// Motion 0 is the mob standing (its steps breathe 0, 1, 2, 1); 4 blinks one step and −1 (nothing drawn), as a mob dying.
// The sheet of a mob is most often 100000 + 10 × its type, the type of 06-map-mobs.md#mã-quái (Gà Điên 0 → 100000, Sơn
// Tặc 3 → 100030). The s2c/22 of a battle names the sheet itself (mobBlock), and the bosses use others: Hào Trưởng
// 100660, Tướng Thiết Kích 101050; Báo Đen 100600 (06-map-mobs.md#tấm-ảnh-của-quái).
export const mobSheet = (type: number) => 100000 + 10 * type;
/** The number n of sheet 100000 + 10 n, the name of its icon data/icons/mobs/<n>.webp (101050 → 105). */
export const sheetNumber = (sheet: number) => (sheet - 100000) / 10;

export interface Rect { x: number; y: number; w: number; h: number }
/** One frame of the sheet drawn at (dx, dy) of the motion's box. */
export interface Part { frame: number; dx: number; dy: number }
export interface Motion {
  id: number;
  width: number;
  height: number;
  /** 36 or 0 in the 86 sheets read [Chưa rõ]. */
  a: number;
  loop: boolean;
  /** 0 in every sheet read [Chưa rõ]. */
  b: number;
  steps: Part[][];
  /** The step drawn at each tick; −1 draws nothing. */
  sequence: number[];
}
export interface SpriteSheet { id: number; width: number; height: number; frames: Rect[]; motions: Motion[] }

export function spriteSheet(fx: Uint8Array): SpriteSheet {
  const r = new Reader(fx), u16 = () => r.take(2).readUInt16BE(), i16 = () => r.take(2).readInt16BE();
  const version = r.u8();
  if (version !== 2) throw new Error(`sprite table version ${version}, only 2 is known`);
  const id = r.i32(), width = u16(), height = u16();
  r.u8();
  const frames = Array.from({ length: u16() }, () => ({ x: u16(), y: u16(), w: u16(), h: u16() }));
  const motions = Array.from({ length: r.u8() }, (): Motion => {
    const id = r.u8(), width = u16(), height = u16(), a = r.u8(), loop = r.u8() === 1, b = u16();
    const steps = Array.from({ length: r.u8() }, () => Array.from({ length: r.u8() }, () => ({ frame: u16(), dx: i16(), dy: i16() })));
    const sequence = Array.from({ length: u16() }, () => i16());
    return { id, width, height, a, loop, b, steps, sequence };
  });
  if (r.offset !== r.data.length) throw new Error(`sprite table ${id}: ${r.data.length - r.offset} bytes left`);
  return { id, width, height, frames, motions };
}

/** The parts of the first step drawn by motion 0: the mob standing, the picture of its icon. */
export function standingParts(sheet: SpriteSheet): (Part & Rect)[] {
  const motion = sheet.motions.find(m => m.id === 0) ?? sheet.motions[0];
  if (!motion) return [];
  const step = motion.steps[motion.sequence.find(s => s >= 0) ?? 0] ?? [];
  return step.map(p => ({ ...p, ...sheet.frames[p.frame] }));
}

/** A mob of one map as data/maps.json has it: by zone, the ids of its mobs, or the one id of a boss; the sprite sheet
 * s2c/22 named, once the bots fought it (recordSprite of atlas.ts). */
export interface AtlasMob { name: string; ids: Record<string, string[] | string>; sprite?: number }
type Split = { type: number; base: number };

/** Every way to read the ids of one mob of one map. `mobId` = "mob" + (type + 1) + a serial, run together, so every
 * split of the digits is tried: the type + 1 has at most 3 digits (the types seen are 0–107), the serial no leading
 * zero; a boss of zone z is 100000 + 100 z + n (mob86100001, mob86100101); a mob of zone z, i-th of the zone's `count`,
 * is base + z × count + i with a base of whole hundreds. */
function splits({ ids }: AtlasMob): Split[] {
  const zones = Object.entries(ids).map(([zone, v]) => ({ zone: Number(zone), boss: !Array.isArray(v), list: ([] as string[]).concat(v).map(id => id.slice(3)) }));
  const first = zones[0]?.list[0];
  if (!first || zones.some(z => z.list.some(d => !/^\d+$/.test(d)))) return [];
  const found: Split[] = [];
  for (let k = 1; k < first.length && k <= 3; k++) {
    const head = first.slice(0, k), serial = (d: string) => d.startsWith(head) && /^(0|[1-9]\d*)$/.test(d.slice(k)) ? Number(d.slice(k)) : NaN;
    const boss = zones.every(z => z.boss && z.list.every(d => serial(d) - 100000 - 100 * z.zone >= 0 && serial(d) - 100000 - 100 * z.zone < 100));
    const base = serial(first) - zones[0].zone * zones[0].list.length;
    const mob = base >= 0 && base % 100 === 0 && zones.every(z => !z.boss && z.list.every((d, i) => serial(d) === base + z.zone * z.list.length + i));
    if (boss || mob) found.push({ type: Number(head) - 1, base: boss ? -1 : base });
  }
  return found;
}

/** The mobs of one map share one run of serials: from 0, each takes 100 × its count per zone, so the bases chain
 * (M4: Sơn Tặc 0, Chim Điên 500, Hỏa Hầu 1000, Cá Sấu 1500, Cóc Tía 2100, Huyết Lang 2600). Keeps, for each mob, the
 * splits of the chains that use every mob of the map; all of them when no chain does (a mob of the map not seen yet). */
function chained(mobs: { mob: AtlasMob; splits: Split[] }[]): Split[][] {
  const count = (m: AtlasMob) => Object.values(m.ids).find(Array.isArray)?.length ?? 0;
  const keep = mobs.map(() => new Set<Split>());
  const walk = (at: number, used: Split[]): void => {
    const left = mobs.map((_, i) => i).filter(i => !used[i]);
    if (!left.length) { used.forEach((s, i) => keep[i].add(s)); return; }
    for (const i of left) for (const s of mobs[i].splits) if (s.base === at) { used[i] = s; walk(at + 100 * count(mobs[i].mob), used); used[i] = undefined!; }
  };
  walk(0, []);
  return mobs.map((m, i) => (keep[i].size ? [...keep[i]] : m.splits));
}

/** The type of every mob name of the atlas (06-map-mobs.md#mã-quái): the splits of its ids that chain with the other mobs
 * of its map, the same in every map it is in; then a type some other name has for certain is struck off (Báo Đốm
 * mob45500 is not 3, Sơn Tặc's). A name still unsure is left out. */
export function mobTypes(maps: Record<string, { mobs?: AtlasMob[]; bosses?: AtlasMob[] }>): Record<string, number> {
  const byName = new Map<string, Set<number>>();
  const add = (name: string, types: number[]) => {
    const had = byName.get(name);
    byName.set(name, new Set(had ? [...had].filter(t => types.includes(t)) : types));
  };
  for (const m of Object.values(maps)) {
    const mobs = (m.mobs ?? []).map(mob => ({ mob, splits: splits(mob).filter(s => s.base >= 0) }));
    chained(mobs).forEach((s, i) => add(mobs[i].mob.name, s.map(x => x.type)));
    for (const boss of m.bosses ?? []) add(boss.name, splits(boss).filter(s => s.base < 0).map(s => s.type));
  }
  for (let changed = true; changed;) {
    changed = false;
    const sure = new Map([...byName].filter(([, t]) => t.size === 1).map(([name, t]) => [[...t][0], name]));
    for (const [name, types] of byName) if (types.size > 1) for (const t of types)
      if (sure.has(t) && sure.get(t) !== name) { types.delete(t); changed = true; }
  }
  return Object.fromEntries([...byName].filter(([, t]) => t.size === 1).map(([name, t]) => [name, [...t][0]] as const).sort(([, a], [, b]) => a - b));
}

/** The picture of every mob name of the atlas, as the n of its sheet 100000 + 10 n (06-map-mobs.md#tấm-ảnh-của-quái):
 * the sheet s2c/22 named (`sprite`), else for a mob the sheet of its type (mobTypes). A boss never seen in a battle is
 * left out: bosses use the sheets of other types (Hào Trưởng phía Bắc, type 88, is drawn with 100660). */
export function mobPictures(maps: Record<string, { mobs?: AtlasMob[]; bosses?: AtlasMob[] }>): Record<string, number> {
  const types = mobTypes(maps), out = new Map<string, number>();
  const kinds = Object.values(maps).flatMap(m => [...(m.mobs ?? []).map(k => ({ k, boss: false })), ...(m.bosses ?? []).map(k => ({ k, boss: true }))]);
  for (const { k } of kinds) if (k.sprite !== undefined) out.set(k.name, sheetNumber(k.sprite));
  for (const { k, boss } of kinds) if (!boss && !out.has(k.name) && types[k.name] !== undefined) out.set(k.name, types[k.name]);
  return Object.fromEntries([...out].sort(([, a], [, b]) => a - b));
}

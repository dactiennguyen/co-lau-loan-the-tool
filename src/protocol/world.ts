// World-state packets: map mobs, zones, world map, other players, chat, ground items, own movement, character stats,
// quests, ranking (docs/app/events/05-battle.md, 08-server-map-zone.md, 09-players-chat.md, 10-quests.md, 11-panels.md).
// Each layout reads every captured payload to its last byte, except where a comment says otherwise.
import { Reader, ProtocolError, mapPrefix, characterProfile } from './protocol.ts';

const u16 = (r: Reader) => r.take(2).readUInt16BE();
export const finish = <T>(r: Reader, value: T, what: string): T => {
  if (r.offset !== r.data.length) throw new ProtocolError('PAYLOAD_SCHEMA', `${what}: ${r.data.length - r.offset} unread bytes`, { offset: r.offset, length: r.data.length });
  return value;
};

/** A mob of s2c/43 and s2c/1177. A client that says protocol 0.0.7 (the game 1.1.0) gets 9 more bytes per mob (VG1,
 * 20/11): a u8 and an i32 that go up with the kind of mob (Gà Điên 0, 0 … Chỉ Huy Sơn Tặc 7, 86), then the tile column
 * and row the mob stands on. A client that says 0.0.2 gets the record without them. */
const mobRecord = (r: Reader, extended = false) => {
  const mob = { id: r.string(), name: r.string(), level: r.i32(), a: r.u8(), b: r.i32(), c: r.i32(), d: r.u8() };
  if (!extended) return mob;
  return { ...mob, e: r.u8(), f: r.i32(), tile: [r.take(2).readInt16BE(), r.take(2).readInt16BE()] as [number, number] };
};
type MobRecord = ReturnType<typeof mobRecord> & { e?: number; f?: number; tile?: [number, number] };

/** Reads with the layout of 0.0.7 first, then of 0.0.2: the one that reads the payload to its last byte. */
export function eitherLayout<T>(read: (extended: boolean) => T): T {
  try { return read(true); } catch { return read(false); }
}

/** The element of a mob from `a` of s2c/43 and s2c/1177, numbered as the character's (s2c/9) and the items' (1 Hỏa, 2 Lôi,
 * 4 Thủy): 0 is Hỏa. It matched the element of the mob block of s2c/22 for 25 kinds in about 1.800 battles
 * (06-map-mobs.md#hệ-của-quái); undefined for another value. Mob::element of app/core/src/world.rs is the same. */
export const mobElement = (a: number): number | undefined => ({ 0: 1, 2: 2, 4: 4 } as Record<number, number>)[a];
export type Mob = MobRecord;

/** s2c/43: the mobs of the current map and zone. No coordinates: the client places and moves mobs itself. */
export function mapEntities(payload: Uint8Array) {
  return eitherLayout(extended => {
    const r = new Reader(payload), mapId = r.string(), field = r.u8(), mobs: Mob[] = [];
    while (r.offset < r.data.length) mobs.push(mobRecord(r, extended));
    return finish(r, { mapId, field, mobs }, 's2c/43');
  });
}

/** s2c/11 flag 1, after the prefix of mapPrefix (protocol.ts): two more grids of the same size (decoration, collision), three
 * ints, then the places of the map: NPCs (type 2) and portals (type 0; c2s/13 with the portal id walks through it,
 * B5). x, y, w, h are server units. The three ints before and the 12 bytes after the places stay unnamed. */
export function mapData(payload: Uint8Array) {
  const pre = mapPrefix(payload), r = new Reader(payload); r.take(pre.prefixBytes);
  const layers = [r.bytes().length, r.bytes().length], head = [r.i32(), r.i32(), r.i32()], places = [];
  for (let n = r.i32(); n > 0; n--) places.push({ id: r.i32(), name: r.string(), type: r.u8(), x: r.i32(), y: r.i32(), w: r.i32(), h: r.i32(), flag: r.u8(), p: r.i32(), q: r.i32() });
  return finish(r, { ...pre, layers, head, places, tail: [r.i32(), r.i32(), r.i32()] }, 's2c/11');
}
export type Place = ReturnType<typeof mapData>['places'][number];

/** The three grids of s2c/11, `rows` × `cols` bytes each, row by row from the top, one byte per tile of 32 server units:
 * x / 32 and y / 32 of the character (mapPrefix) and of the places index them (M2: 35 × 90 tiles, 2880 × 1120 units, portals
 * at x 32 and 2848). Layer 1 is what is drawn (0: nothing), layer 3 marks platform runs (0, 2); see 06-map-mobs.md. */
export function mapGrid(payload: Uint8Array) {
  const pre = mapPrefix(payload), r = new Reader(payload); r.take(pre.prefixBytes - pre.tileBytes);
  const tiles = r.take(pre.tileBytes), decoration = r.bytes(), collision = r.bytes();
  return { rows: pre.dimension1, cols: pre.dimension2, tiles: [...tiles], decoration: [...decoration], collision: [...collision] };
}

/** s2c/13: the map the server moved the character to. After a zone change (c2s/1173): the map and the new zone. After a
 * portal (c2s/13 with the portal id, B5): the map, its index in the world map of c2s/11 "M99" (M1 0, M2 1, M25 24 in every
 * portal sample: B5, Q16, S1), then the bytes 0 and 0xff. The zone is then the area byte of the s2c/11 that follows. */
export function mapChange(payload: Uint8Array) {
  const r = new Reader(payload), mapId = r.string(), value = r.i32();
  if (r.offset === r.data.length) return finish(r, { mapId, zone: value }, 's2c/13');
  // The last byte is 0xff after a portal and the new zone after c2s/1173 (Z1: M2, 1, 0, 4); B2 had the short form above.
  const extra = [r.u8(), r.u8()];
  return finish(r, { mapId, mapIndex: value, extra, ...(extra[1] !== 0xff && { zone: extra[1] }) }, 's2c/13');
}

/** s2c/1177: a boss of the map. field 0 (after s2c/43, and when it moves): a mob record as in s2c/43, then u8 1 and the
 * tile column and row it stands on (M1 is 156 × 23 tiles of 32). field 1: only the mob id, the boss left its tile;
 * ~13 s later a field 0 brings the new tile (Q16: Hào Trưởng phía Bắc (38, 6) → (59, 7)). */
export function mapBoss(payload: Uint8Array) {
  return eitherLayout(extended => {
    const r = new Reader(payload), mapId = r.string(), field = r.u8();
    if (field === 1) return finish(r, { mapId, field, gone: r.string() }, 's2c/1177');
    // 0.0.7 (the bot, 20/11): the u8 and i32 of the mob come after the tile here, with no tile of their own.
    const mob: Mob = mobRecord(r), state = r.u8(), tile = [r.i32(), r.i32()] as [number, number];
    if (extended) Object.assign(mob, { e: r.u8(), f: r.i32() });
    return finish(r, { mapId, field, mob, state, tile }, 's2c/1177');
  });
}

/** s2c/1256: a notice line. After a lost battle "Thua trận, mất 16 kinh nghiệm" (Q6); after c2s/13 through a portal the
 * character may not enter "Bạn phải đạt cấp 40 mới vào được Lạc Cốc"; after c2s/11 for another map "Không thể chuyển khu vực". */
export function notice(payload: Uint8Array) {
  const r = new Reader(payload);
  return finish(r, { field: r.u8(), text: r.string() }, 's2c/1256');
}

/** s2c/10, sent together as kinds 2, 4, 8 on level up and on every stat point. Kind 2: level and ten stats (the first
 * grows by one per point). Kind 4 (also after a battle): HP, EXP, the level's EXP range, coins and six unnamed ints.
 * Kind 8: stat points left, three ints and two strings. Other kinds stay unread. */
export function characterStats(r: Reader) {
  const kind = r.i32(), name = r.string(), ints = (n: number) => Array.from({ length: n }, () => r.i32());
  if (kind === 2) return { kind, name, level: r.i32(), stats: ints(10) };
  if (kind === 4) return { kind, name, hp: r.i32(), maxHp: r.i32(), exp: r.i32(), levelExp: ints(2), coin: r.i32(), extra: ints(6) };
  if (kind === 8) return { kind, name, statPoints: r.i32(), fields: ints(3), labels: [r.string(), r.string()] };
  // After c2s/1191 (E1): the level of every skill of the character's tree.
  if (kind === 32) return { kind, name, skills: Array.from({ length: r.i32() }, () => ({ id: r.i32(), level: r.i32() })) };
  return { kind, name };
}

/** The four potential stats, by the c2s/10 index: the + buttons of the character panel row by row. `slot` is where the
 * value sits in `stats` of s2c/9 and s2c/10 kind 2, which list Thân Pháp before Nội Lực. Measured: Cường Lực 0 (L1),
 * Thân Pháp 2 into slot 1 (P1); Nội Lực 1 follows from the panel order, Thể Lực grows by one a level in slot 3. */
export const POTENTIALS = [
  { key: 'cuong', name: 'Cường Lực', slot: 0 },
  { key: 'noi', name: 'Nội Lực', slot: 2 },
  { key: 'than', name: 'Thân Pháp', slot: 1 },
  { key: 'the', name: 'Thể Lực', slot: 3 },
] as const;
/** The stat that raises attack for each element (field01 of s2c/9), from the in-game handbook: Hỏa Cường Lực, Lôi Thân
 * Pháp, Thủy Nội Lực. Lôi's 2 is the c2s/30 that answers its skill tree; no Lôi character has been read yet. */
export const MAIN_STAT: Record<number, number> = { 1: 0, 2: 2, 4: 1 };

/** c2s/1169, sent every ~110 ms while the character moves. */
export function moveRequest(payload: Uint8Array) {
  const r = new Reader(payload);
  const x = r.i32(), y = r.i32(), state = r.i32(), flags = [...r.take(5)];
  return finish(r, { x, y, state, flags }, 'c2s/1169');
}

/** s2c/1262: one record per player whose position changed in this 100 ms tick (own character included). */
export function positions(payload: Uint8Array) {
  const r = new Reader(payload), tickMs = u16(r), count = u16(r), players = [];
  for (let i = 0; i < count; i++) players.push({ id: r.i32(), x: r.i32(), y: r.i32(), state: r.u8(), flags: r.u8(), field14: u16(r) });
  return finish(r, { tickMs, players }, 's2c/1262');
}

/** Player record of s2c/1167 and of each s2c/1263 entry. The appearance block is read but left unnamed. */
export function playerRecord(r: Reader) {
  const kind = r.u8(), name = r.string(), id = r.i32(), displayName = r.string();
  const flag1 = r.u8(), flag2 = r.u8(), level = r.i32(), hp = r.i32(), maxHp = r.i32(), s1 = r.i32(), s1Max = r.i32();
  const field = u16(r), x = r.i32(), y = r.i32();
  const gear = Array.from({ length: 6 }, () => r.i32());
  // APK 1.1.0 (20/11) puts two bytes between the gear and the appearance block: 0 for everyone seen, then the element of
  // the weapon (gear[2]), 255 without one; the 0 is likely its "+" (apk-1.1.0.md). Records of 1.0.3 have neither.
  const at = r.offset;
  let weapon: { plus: number; element: number } | undefined, appearanceBytes: number;
  try { weapon = { plus: r.u8(), element: r.u8() }; appearanceBytes = appearance(r); }
  catch { r.offset = at; weapon = undefined; appearanceBytes = appearance(r); }
  const factionField = r.i32(), faction = r.string(), factionFlags = [r.u8(), r.u8()]; // faction ("sứ quân") name, empty when none
  return { kind, name, id, displayName, flag1, flag2, level, hp, maxHp, s1, s1Max, field, x, y, gear, weapon, appearanceBytes, factionField, faction, factionFlags };
}

/** The appearance block of a player record and of the s2c/9 tail, read but left unnamed; returns its length. */
function appearance(r: Reader) {
  const start = r.offset;
  r.i32(); r.i32(); r.i32();
  r.u8(); r.bytes(); r.i32(); r.bytes();      // palette layers (ARGB)
  r.i32(); r.u8();
  for (let i = 0; i < 10; i++) r.i32();       // two groups of five ints, same in every capture
  const marker = r.i32();
  if (marker !== 99000) throw new ProtocolError('PAYLOAD_SCHEMA', `Unobserved appearance marker ${marker}`, { offset: r.offset - 4 });
  for (let n = r.u8(); n > 0; n--) { r.i32(); r.bytes(); }
  return r.offset - start;
}

/** What follows the 8 gear slots of s2c/9: an int (1 for symap, 0 for manina), the appearance block, the timed
 * effects, then the faction ("sứ quân") as in a player record. An effect with rate 200000 is the "x2" star of the HUD:
 * double EXP, from the item Tăng Kinh Nghiệm (7), rate in 1/100000; remainingMs counts down even offline
 * (12-skills-items.md#x2-exp). */
export function characterTail(payload: Uint8Array) {
  const { gear: _gear, ...tail } = characterRest(payload);
  return tail;
}
/** Everything after the skill list of s2c/9, read to its last byte with the item layout that fits (itemLayouts). */
function characterRest(payload: Uint8Array) {
  return itemLayouts(() => {
    const r = new Reader(payload);
    r.take(characterProfile(payload).profileBytes);
    for (let n = r.i32(); n > 0; n--) r.take(13); // skills: i32 id; i32 level; i32 mana; u8 flag
    const gear = Array.from({ length: Math.max(0, r.i32()) }, () => r.data[r.offset] === 0xff ? (r.u8(), null) : itemRecord(r));
    const field = r.i32(), appearanceBytes = appearance(r), effects = [];
    for (let n = r.i32(); n > 0; n--) effects.push({ key: r.string(), rate: r.i32(), field: r.i32(), remainingMs: r.i32() });
    const factionField = r.i32(), faction = r.string(), factionFlags = [r.u8(), r.u8()];
    return finish(r, { gear, field, appearanceBytes, effects, factionField, faction, factionFlags }, 's2c/9');
  });
}

/** s2c/37 after c2s/1186 (equip or unequip): the 8 gear slots again, as at the end of s2c/9. */
export function gearUpdate(payload: Uint8Array) {
  return itemLayouts(() => {
    const r = new Reader(payload), field = r.i32(), flag = r.u8(), name = r.string();
    const gear = Array.from({ length: Math.max(0, r.i32()) }, () => r.data[r.offset] === 0xff ? (r.u8(), null) : itemRecord(r));
    return finish(r, { field, flag, name, gear }, 's2c/37');
  });
}

/** s2c/36 at the end of every battle, and after Đầu hàng: the durability of the 8 gear slots, in the order of s2c/9 and
 * s2c/37. Each slot is u8 0xff when empty, else u8 slot; i32 durability. B1 `00000008 00 00000031 ff×7` is the hat alone
 * at 49; G2 (24 bytes) the hat at 55, the armour at 60 and the broken weapon of slot 2 at 0 (05-battle.md#s2c-36). */
export function gearDurability(payload: Uint8Array) {
  const r = new Reader(payload);
  const slots = Array.from({ length: Math.max(0, r.i32()) }, () => r.data[r.offset] === 0xff ? (r.u8(), null) : { slot: r.u8(), durability: r.i32() });
  return finish(r, { slots }, 's2c/36');
}

/** s2c/51 after a pickup that goes to the bag (c2s/1188): the bag slot that now holds the item. The client does not get
 * s2c/1187 then (K3, 13-drops-items.md#k3). */
export function bagSlot(payload: Uint8Array) {
  return itemLayouts(() => {
    const r = new Reader(payload), a = r.i32(), b = r.i32(), flag = r.u8(), item = itemRecord(r);
    return finish(r, { a, b, flag, item }, 's2c/51');
  });
}

/** s2c/57 after c2s/13 to an NPC with a menu (Lái Buôn, P5): its name, its line, and the choices; c2s/57 picks one. */
export function npcMenu(payload: Uint8Array) {
  const r = new Reader(payload), n = r.i32(), npc = r.string(), text = r.string();
  const options = Array.from({ length: Math.max(0, n) }, () => ({ option: r.u8(), label: r.string() }));
  return finish(r, { npc, text, options }, 's2c/57');
}

/** s2c/1180 after Đồng ý (c2s/57) in a duel's dialog (N2, N3: "Tỷ thí với Võ Quan Đinh Mộc"): the NPC's map and id, the
 * mob the duel is fought against (mob880 "Võ Quan Đinh Mộc" cấp 20, a mob record as in s2c/43), then `u8 a; i32 b` (2 and
 * 1, 1, 0 in N2; 2 and 0 in N3). The game challenges that mob at once with c2s/1181 (N3). */
export function duelInvite(payload: Uint8Array) {
  return eitherLayout(extended => {
    const r = new Reader(payload), mapId = r.string(), npcId = r.i32(), mob: Mob = mobRecord(r, extended);
    return finish(r, { mapId, npcId, mob, a: r.u8(), b: r.i32() }, 's2c/1180');
  });
}

/** s2c/1190 after c2s/57 opens one of the 14 shops (`kind`, docs/app/events/15-shops.md). shopId is what c2s/1190 buys,
 * not the item id: the same item is sold for Xu (currency 0), Xu khóa (1) or Lượng (2) in lines of their own. `flag` is
 * the trade lock of the item bought (1 tradeable, 0 locked: the Xu khóa lines). A record is 33 bytes; gear has 16 more
 * per stat range: the main stat it rolls between `min` and `max` (J1: Nhẫn Trơn sức tấn công 5–9). */
export function shopList(payload: Uint8Array) {
  return eitherLayout(extended => shopLines(payload, extended));
}
/** One layout of s2c/1190: with protocol 0.0.7 each line has 2 more bytes after field4 (an i16, 1 in every line of
 * Vũ khí [Xu] on 20/11), as the item record has `field5` there. */
function shopLines(payload: Uint8Array, extended: boolean) {
  const r = new Reader(payload), kind = r.u8(), title = r.string(), items = [];
  for (let n = r.i32(); n > 0; n--) {
    const shopId = r.i32(), itemId = r.i32(), currency = r.u8(), price = r.i32(), durability = r.i32(), quantity = r.i32(), flag = r.u8(), element = r.u8();
    r.i32(); r.u8(); r.u8(); // field2, field3, field4 (the quality of gear) of the item record
    if (extended) r.take(2); // field5 of 0.0.7
    const ranges = [];
    for (let k = r.i32(); k > 0; k--) {
      ranges.push({ stat: r.i32(), min: r.i32(), max: r.i32() });
      r.take(4); // 01 01 01 01, or 01 01 02 01 on weapons of tier 51: not understood
    }
    items.push({ shopId, itemId, currency, price, durability, quantity, flag, element, ranges });
  }
  return finish(r, { kind, title, items }, 's2c/1190');
}

/** s2c/1212, also appended to every s2c/1263 entry. Mode 2 carries a list; the 11-byte form a single entry. */
export function playerStatus(r: Reader) {
  const id = r.i32(), mode = r.u8(), effects = [];
  if (mode === 2) {
    for (let n = r.u8(); n > 0; n--) effects.push({ a: r.u8(), effect: r.i32(), b: r.u8() });
    return { id, mode, effects, end: r.u8() };
  }
  effects.push({ a: r.u8(), effect: r.i32(), b: r.u8() });
  return { id, mode, effects };
}

/** s2c/1263: every other player of the zone, sent after c2s/43. */
export function playersSnapshot(payload: Uint8Array) {
  const r = new Reader(payload), count = u16(r), players = [];
  for (let i = 0; i < count; i++) players.push({ ...playerRecord(r), status: playerStatus(r) });
  return finish(r, { players }, 's2c/1263');
}

/** s2c/1174: a player of the zone says something, after c2s/1174 (the Chat box of the speech bubble button). The server
 * stars out the words it forbids; the game shows that text above the speaker for about 3 s (CH1,
 * 09-players-chat.md#c2s-1174). The own lines come back too, with the numericId of s2c/9; whether the others of the
 * zone get them is not measured. */
export function playerSay(payload: Uint8Array) {
  const r = new Reader(payload);
  return finish(r, { playerId: r.i32(), text: r.string() }, 's2c/1174');
}

/** s2c/1205: a line of the Thế giới channel, censored the same way. */
export function worldChat(payload: Uint8Array) {
  const r = new Reader(payload);
  return finish(r, { senderId: r.i32(), name: r.string(), text: r.string() }, 's2c/1205');
}

export interface Nearby { id: number; name: string; level: number }

/** The other players of the zone: s2c/1263 replaces the list (after c2s/43 and after a battle), s2c/1167 adds or
 * refreshes one, s2c/1170 removes one, s2c/1253 updates a level. The own character is never in the list; the zone
 * population of s2c/1172 is its size + 1. Returns true when the packet changed it. */
export class ZonePlayers {
  readonly players = new Map<number, Nearby>();
  on(opcode: number, payload: Uint8Array): boolean {
    const keep = ({ id, name, level }: Nearby) => this.players.set(id, { id, name, level });
    switch (opcode) {
      case 1263: {
        const all = playersSnapshot(payload).players; // parsed first: a bad packet leaves the list as it was
        this.players.clear();
        all.forEach(keep);
        return true;
      }
      case 1167: keep(playerRecord(new Reader(payload))); return true;
      case 1170: return this.players.delete(new Reader(payload).i32());
      case 1253: {
        const r = new Reader(payload), p = this.players.get(r.i32());
        if (p) p.level = r.i32();
        return !!p;
      }
      default: return false;
    }
  }
  /** Highest level first, then by lower-case name compared code point by code point (as Rust compares strings), then id. */
  list(): Nearby[] {
    const key = (p: Nearby) => [...p.name.toLowerCase()].map(ch => ch.codePointAt(0)!);
    const byName = (a: number[], b: number[]) => {
      for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
      return a.length - b.length;
    };
    return [...this.players.values()].sort((a, b) => b.level - a.level || byName(key(a), key(b)) || a.id - b.id);
  }
}

/** Item record shared by the bag (s2c/42, s2c/1187), the gear slots of s2c/9 and items on the ground (s2c/1182): slot
 * (0xfe on the ground), durability -1 for items without one, element of this item (1 Hỏa, 2 Lôi, 4 Thủy as the item
 * popup draws it; 0xff for plain items), field4 the quality of gear (1 Hiếm, 2 Quý, 3 Sử Thi; 0 for the rest,
 * 13-drops-items.md#phẩm-chất), stats as (code, value) with the templates of it0 (12-skills-items.md#túi-đồ). */
export function itemRecord(r: Reader) {
  const slot = r.u8(), itemId = r.i32(), uuid = r.string(), field0 = r.i32(), durability = r.i32(), quantity = r.i32();
  const field1 = r.u8(), element = r.u8(), field2 = r.i32(), field3 = r.u8(), field4 = r.u8();
  const field5 = itemField5 ? r.take(2).readInt16BE() : undefined, stats = [];
  for (let n = r.u8(); n > 0; n--) stats.push({ stat: r.i32(), value: r.i32() });
  return { slot, itemId, uuid, field0, durability, quantity, field1, element, field2, field3, field4, ...(field5 !== undefined && { field5 }), stats };
}

/** A client that says protocol 0.0.7 gets two more bytes in every item record, right before the stat count (`field5`,
 * an i16, 0 in the samples of 20/11). itemLayouts reads a packet with it first, then without: the one that reads to the end. */
let itemField5 = false;
export function itemLayouts<T>(read: () => T): T {
  const before = itemField5;
  try { itemField5 = true; return read(); } catch { itemField5 = false; return read(); } finally { itemField5 = before; }
}

/** s2c/1182: one item that fell in the map (an own drop at the end of a won battle, 13-drops-items.md). */
export function groundDrop(payload: Uint8Array) {
  return itemLayouts(() => {
    const r = new Reader(payload), mapId = r.string();
    return finish(r, { mapId, ...groundItem(r) }, 's2c/1182');
  });
}

/** Item record of s2c/1182 and s2c/1184: 88 bytes for plain items, 104 for gear with two stats. */
export function groundItem(r: Reader) {
  const { slot: flag, ...item } = itemRecord(r);
  const x = r.i32(), y = r.i32(), expiresAt = Number(r.take(8).readBigInt64BE());
  return { flag, ...item, x, y, expiresAt };
}

/** The 8 gear slots after the skill list of s2c/9: u8 0xff for an empty slot, else an item record whose slot byte is
 * the slot index. Seen: 0 the hat, 2 the weapon; slot = item type of it1 is a guess (12-skills-items.md#ô-trang-bị). */
export function characterGear(payload: Uint8Array) {
  return characterRest(payload).gear;
}

/** s2c/1184 right after s2c/43 on entering a map or zone: every item lying on the ground there. */
export function groundItems(payload: Uint8Array) {
  return itemLayouts(() => {
    const r = new Reader(payload), mapId = r.string(), items = [];
    for (let n = r.i32(); n > 0; n--) items.push(groundItem(r));
    return finish(r, { mapId, items }, 's2c/1184');
  });
}

/** The whole bag: s2c/1187 when it changes, and the tail of s2c/42 at login. kind is 1 in s2c/1187, 2 in s2c/42. */
export function bag(r: Reader) {
  const kind = r.u8();
  // Kind 4 (O1, Chế tạo trang bị at Pháp sư): one item record, the item just added; the rest of the bag is unchanged.
  if (kind === BAG_ADD) return { kind, capacity: -1, items: [itemRecord(r)] };
  const capacity = r.i32();
  return { kind, capacity, items: Array.from({ length: r.i32() }, () => itemRecord(r)) };
}
/** The first byte of s2c/1187 when it carries one item added to the bag, not the whole bag (12-skills-items.md#túi-đồ). */
export const BAG_ADD = 4;
/** The first byte of s2c/1187 when it carries what is left in one bag slot after Dùng (Đập Trứng Gà): `u8 slot; i32
 * quantity`, 0 for an empty slot. Only s2c/1187: the bag of s2c/42 starts with 2 too, and is the whole bag. */
export const BAG_LEFT = 2;
/** What is left in one bag slot (s2c/1187 kind 2, s2c/83). */
export interface SlotLeft { slot: number; quantity: number }
/** The bag after s2c/1187: kind 4 puts its one item in its slot, kind 2 sets what is left in one slot (none left empties
 * it), the other kinds are the whole bag. */
export function bagAfter<T extends { slot: number; quantity: number }>(bag: T[], update: { kind: number; items: T[]; left?: SlotLeft }): T[] {
  const { kind, items, left } = update;
  if (left) return slotLeft(bag, left);
  return kind === BAG_ADD ? [...bag.filter(i => i.slot !== items[0].slot), items[0]] : items;
}
/** The bag with `left.quantity` in `left.slot`, or without that slot's item when none is left (s2c/83, s2c/1187 kind 2). */
export function slotLeft<T extends { slot: number; quantity: number }>(bag: T[], left: SlotLeft): T[] {
  return left.quantity <= 0 ? bag.filter(i => i.slot !== left.slot) : bag.map(i => (i.slot === left.slot ? { ...i, quantity: left.quantity } : i));
}
/** s2c/1187, whenever the bag changes: the whole bag (kind 1), one item added (kind 4), or what is left in one slot
 * (kind 2: `left`, no items). */
export function inventory(payload: Uint8Array): ReturnType<typeof bag> & { left?: SlotLeft } {
  const r = new Reader(payload);
  if (payload[0] === BAG_LEFT) {
    const kind = r.u8(), left = { slot: r.u8(), quantity: r.i32() };
    return finish(r, { kind, capacity: -1, items: [], left }, 's2c/1187');
  }
  return itemLayouts(() => { const r = new Reader(payload); return finish(r, bag(r), 's2c/1187'); });
}

/** s2c/46 after s2c/9 and whenever money changes (quest rewards): the three currencies of the Bản thân panel, as i64.
 * E1 (31/10): 500, 7370, 0 while the panel read 500 Xu, 7.370 Xu khoá, 0 Lượng. Vàng, the gold bar that turns into Xu
 * khoá at 10.000, is `coin` of s2c/9 and s2c/10 kind 4 (04-push.md#s2c-46). */
export function currencies(payload: Uint8Array) {
  const r = new Reader(payload), label = r.string(), i64 = () => Number(r.take(8).readBigInt64BE());
  return finish(r, { label, xu: i64(), xuKhoa: i64(), luong: i64() }, 's2c/46');
}

/** s2c/42 answering c2s/42 at login: a label ("test dong 1"), two unknown ints (42, 3), then the bag. */
export function characterExtra(payload: Uint8Array) {
  return itemLayouts(() => {
    const r = new Reader(payload), label = r.string(), fields = [r.i32(), r.i32()];
    return finish(r, { label, fields, ...bag(r) }, 's2c/42');
  });
}

/** s2c/30 answering c2s/30 at login: the skill tree of the character's element. Every level gives the skill points it
 * costs, the character level it needs and the nội lực it uses (25 = one "thành"). */
export function skillTable(payload: Uint8Array) {
  const r = new Reader(payload), skills = [];
  for (let n = r.i32(); n > 0; n--) {
    const id = r.i32(), name = r.string(), prerequisite = r.i32(), levels = [];
    for (let k = r.i32(); k > 0; k--) levels.push({ level: r.i32(), description: r.string(), cost: r.i32(), requiredLevel: r.i32(), mana: r.i32() });
    skills.push({ id, name, prerequisite, levels });
  }
  return finish(r, { skills }, 's2c/30');
}
export type Skill = ReturnType<typeof skillTable>['skills'][number];

/** s2c/1172 after the empty c2s/1172: population of every zone of the current map. */
export function zoneList(payload: Uint8Array) {
  const r = new Reader(payload), zones = [];
  for (let n = r.u8(); n > 0; n--) zones.push({ zone: r.u8(), load: r.u8(), players: r.u8(), capacity: r.u8() });
  return finish(r, { zones }, 's2c/1172');
}

/** s2c/11 answering c2s/11 "M99": the world map, one entry per map plus the level table. */
export function worldMap(payload: Uint8Array) {
  const r = new Reader(payload), flag = r.u8(), mapId = r.string(), maps = [];
  for (let n = r.i32(); n > 0; n--) {
    const index = r.i32(), id = r.string(), head = r.take(17), locked = r.u8() === 1, tail = r.take(8);
    if (head.some(Boolean) || tail.some(Boolean)) throw new ProtocolError('PAYLOAD_SCHEMA', `Unobserved non-zero map fields for ${id}`, { offset: r.offset });
    maps.push({ index, mapId: id, locked, levelRequired: 0 });
  }
  for (let n = r.i32(); n > 0; n--) {
    const index = r.i32(), level = r.i32(), map = maps.find(m => m.index === index);
    if (map) map.levelRequired = level;
  }
  return finish(r, { flag, mapId, maps }, 's2c/11 M99');
}

export interface QuestStep { index: number; text: string; param: number; required: number; npcId: number; extra?: string }
export interface Quest { id: number; title: string; description: string; type: string; current: number; progress: number; steps: QuestStep[] }

/** s2c/39: the current quest. `param` is the level for "Đạt cấp độ", the NPC for talk steps, the mob kind for kill steps.
 * A client that says protocol 0.0.7 gets more bytes after every step (VG1 and the bot, 20/11), kept as hex in `extra`:
 * `u8 kind; i32 target; i16 n; n × i32`. Kind 0 (Đạt cấp độ, Nâng điểm tiềm năng, Sử dụng điểm kỹ năng) has target −1
 * and n 0; kind 1 (talk) the NPC and n 1 (value 0); kind 2 (Tiêu diệt) target −1 and n 1 (value 0). 0.0.2 gets the steps
 * without them. */
export function questData(payload: Uint8Array): Quest {
  return eitherLayout(extended => {
    const r = new Reader(payload);
    const id = r.i32(), title = r.string(), description = r.string(), type = r.string(), current = r.i32(), progress = r.i32(), steps: QuestStep[] = [];
    for (let n = r.i32(); n > 0; n--) {
      const step: QuestStep = { index: r.i32(), text: r.string(), param: r.i32(), required: r.i32(), npcId: r.i32() };
      if (extended) {
        const start = r.offset; r.u8(); r.i32();
        for (let k = r.take(2).readInt16BE(); k > 0; k--) r.i32();
        step.extra = r.data.subarray(start, r.offset).toString('hex');
      }
      steps.push(step);
    }
    const quest = { id, title, description, type, current, progress, steps };
    return extended ? finish(r, quest, 's2c/39') : quest;
  });
}
/** s2c/34: progress or NPC dialogue of a quest. */
export function questProgress(payload: Uint8Array) {
  const r = new Reader(payload);
  return { field: r.i32(), label: r.string(), questId: r.i32(), text: r.string() };
}
/** s2c/35: quest finished, with the reward lines shown to the player. */
export function questComplete(payload: Uint8Array) {
  const r = new Reader(payload), questId = r.i32(), title = r.string(), rewards = [];
  for (let n = r.i32(); n > 0; n--) rewards.push(r.string());
  return { questId, title, rewards, text: r.string() };
}

/** s2c/1254: ranking. Kind 0 lists the tabs; kind 1 is one tab: top entries, then the own rank (-1 when unranked). */
export function ranking(payload: Uint8Array) {
  const r = new Reader(payload), kind = r.u8();
  if (kind === 0) {
    const tabs = [];
    for (let n = r.u8(); n > 0; n--) tabs.push({ tab: r.u8(), title: r.string(), column: r.string() });
    r.u8();
    return finish(r, { kind, tabs }, 's2c/1254');
  }
  return eitherLayout(extended => {
    const r = new Reader(payload);
    r.u8();
    const tab = r.u8(), rows = [];
    for (let n = r.i32(); n > 0; n--) rows.push({ rank: r.i32(), id: r.i32(), name: r.string(), field: r.i32(), level: r.i32() });
    const own: { rank: number; field: number; level: number; reachedAt?: number } = { rank: r.i32(), field: r.i32(), level: r.i32() };
    // Protocol 0.0.7: an i64 (ms since 1970) per row after the own rank, then one for the own row (0 when unranked).
    if (extended) {
      for (const row of rows as { reachedAt?: number }[]) row.reachedAt = i64(r);
      own.reachedAt = i64(r);
    }
    return finish(r, { kind, tab, rows, own }, 's2c/1254');
  });
}
const i64 = (r: Reader) => Number(r.take(8).readBigInt64BE());

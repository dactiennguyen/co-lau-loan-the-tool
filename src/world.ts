// World-state packets: map mobs, zones, world map, other players, chat, ground items, own movement, character stats,
// quests, ranking (docs/app/events/05-battle.md, 08-server-map-zone.md, 09-players-chat.md, 10-quests.md, 11-panels.md).
// Each layout reads every captured payload to its last byte, except where a comment says otherwise.
import { Reader, ProtocolError, mapPrefix } from './protocol.ts';

const u16 = (r: Reader) => r.take(2).readUInt16BE();
const finish = <T>(r: Reader, value: T, what: string): T => {
  if (r.offset !== r.data.length) throw new ProtocolError('PAYLOAD_SCHEMA', `${what}: ${r.data.length - r.offset} unread bytes`, { offset: r.offset, length: r.data.length });
  return value;
};

const mobRecord = (r: Reader) => ({ id: r.string(), name: r.string(), level: r.i32(), a: r.u8(), b: r.i32(), c: r.i32(), d: r.u8() });
export type Mob = ReturnType<typeof mobRecord>;

/** s2c/43: the mobs of the current map and zone. No coordinates: the client places and moves mobs itself. */
export function mapEntities(payload: Uint8Array) {
  const r = new Reader(payload), mapId = r.string(), field = r.u8(), mobs = [];
  while (r.offset < r.data.length) mobs.push(mobRecord(r));
  return { mapId, field, mobs };
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

/** s2c/13: the map and zone the server moved the character to. A zone change (c2s/1173) sends just these; a portal
 * (c2s/13 with the portal id, B5) adds two bytes, 0 and 0xff. */
export function mapChange(payload: Uint8Array) {
  const r = new Reader(payload), mapId = r.string(), zone = r.i32();
  return finish(r, { mapId, zone, ...(r.offset < r.data.length ? { extra: [r.u8(), r.u8()] } : {}) }, 's2c/13');
}

/** s2c/1177: a boss of the map. field 0 (after s2c/43, and when it moves): a mob record as in s2c/43, then u8 1 and the
 * tile column and row it stands on (M1 is 156 × 23 tiles of 32). field 1: only the mob id, the boss left its tile;
 * ~13 s later a field 0 brings the new tile (Q16: Hào Trưởng phía Bắc (38, 6) → (59, 7)). */
export function mapBoss(payload: Uint8Array) {
  const r = new Reader(payload), mapId = r.string(), field = r.u8();
  if (field === 1) return finish(r, { mapId, field, gone: r.string() }, 's2c/1177');
  const mob = mobRecord(r);
  return finish(r, { mapId, field, mob, state: r.u8(), tile: [r.i32(), r.i32()] }, 's2c/1177');
}

/** s2c/10, sent together as kinds 2, 4, 8 on level up and on every stat point. Kind 2: level and ten stats (the first
 * grows by one per point). Kind 4 (also after a battle): HP, EXP, the level's EXP range, coins and six unnamed ints.
 * Kind 8: stat points left, three ints and two strings. Other kinds stay unread. */
export function characterStats(r: Reader) {
  const kind = r.i32(), name = r.string(), ints = (n: number) => Array.from({ length: n }, () => r.i32());
  if (kind === 2) return { kind, name, level: r.i32(), stats: ints(10) };
  if (kind === 4) return { kind, name, hp: r.i32(), maxHp: r.i32(), exp: r.i32(), levelExp: ints(2), coin: r.i32(), extra: ints(6) };
  if (kind === 8) return { kind, name, statPoints: r.i32(), fields: ints(3), labels: [r.string(), r.string()] };
  return { kind, name };
}

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
  const start = r.offset;
  r.i32(); r.i32(); r.i32();
  r.u8(); r.bytes(); r.i32(); r.bytes();      // palette layers (ARGB)
  r.i32(); r.u8();
  for (let i = 0; i < 10; i++) r.i32();       // two groups of five ints, same in every capture
  const marker = r.i32();
  if (marker !== 99000) throw new ProtocolError('PAYLOAD_SCHEMA', `Unobserved appearance marker ${marker}`, { offset: r.offset - 4 });
  for (let n = r.u8(); n > 0; n--) { r.i32(); r.bytes(); }
  const appearanceBytes = r.offset - start;
  const factionField = r.i32(), faction = r.string(), factionFlags = [r.u8(), r.u8()]; // faction ("sứ quân") name, empty when none
  return { kind, name, id, displayName, flag1, flag2, level, hp, maxHp, s1, s1Max, field, x, y, gear, appearanceBytes, factionField, faction, factionFlags };
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

/** Item record of s2c/1182 and s2c/1184: 88 bytes for plain items, 104 for gear with two stats. */
export function groundItem(r: Reader) {
  const flag = r.u8(), itemId = r.i32(), uuid = r.string(), field0 = r.i32(), durability = r.i32(), quantity = r.i32();
  const field1 = r.u8(), grade = r.u8(), field2 = r.i32(), field3 = r.u8(), field4 = r.u8(), stats = [];
  for (let n = r.u8(); n > 0; n--) stats.push({ stat: r.i32(), value: r.i32() });
  const x = r.i32(), y = r.i32(), expiresAt = Number(r.take(8).readBigInt64BE());
  return { flag, itemId, uuid, field0, durability, quantity, field1, grade, field2, field3, field4, stats, x, y, expiresAt };
}

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

export interface QuestStep { index: number; text: string; param: number; required: number; npcId: number }
export interface Quest { id: number; title: string; description: string; type: string; current: number; progress: number; steps: QuestStep[] }

/** s2c/39: the current quest. `param` is the level for "Đạt cấp độ", the NPC for talk steps, the mob kind for kill steps. */
export function questData(payload: Uint8Array): Quest {
  const r = new Reader(payload);
  const id = r.i32(), title = r.string(), description = r.string(), type = r.string(), current = r.i32(), progress = r.i32(), steps = [];
  for (let n = r.i32(); n > 0; n--) steps.push({ index: r.i32(), text: r.string(), param: r.i32(), required: r.i32(), npcId: r.i32() });
  return { id, title, description, type, current, progress, steps };
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
  const tab = r.u8(), rows = [];
  for (let n = r.i32(); n > 0; n--) rows.push({ rank: r.i32(), id: r.i32(), name: r.string(), field: r.i32(), level: r.i32() });
  return finish(r, { kind, tab, rows, own: { rank: r.i32(), field: r.i32(), level: r.i32() } }, 's2c/1254');
}

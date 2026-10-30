// World-state packets: zones, world map, other players, chat, ground items, own movement, quests, ranking
// (docs/app/events/08-server-map-zone.md, 09-players-chat.md, 10-quests.md). Each layout reads every captured payload to its last byte.
import { Reader, ProtocolError } from './protocol.ts';

const u16 = (r: Reader) => r.take(2).readUInt16BE();
const finish = <T>(r: Reader, value: T, what: string): T => {
  if (r.offset !== r.data.length) throw new ProtocolError('PAYLOAD_SCHEMA', `${what}: ${r.data.length - r.offset} unread bytes`, { offset: r.offset, length: r.data.length });
  return value;
};

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

import { Writer } from '../../src/protocol/protocol.ts';

/** s2c/11 flag 1 with empty grids and the given places (id, name, type). */
export const mapPacket = (mapId: string, name: string, places: [number, string, number][], zone = 0) => {
  const w = new Writer().u8(1).string(mapId).string(name).u8(zone).i32(64).i32(320).i32(0).i32(1).i32(1).i32(0).i32(0).i32(0).i32(1).i32(0).i32(0).i32(places.length);
  for (const [id, n, type] of places) w.i32(id).string(n).u8(type).i32(0).i32(0).i32(32).i32(32).u8(0).i32(0).i32(0);
  return w.i32(0).i32(0).i32(0).build();
};
/** s2c/43 with the given mobs (id, name, level). */
export const mobsPacket = (mapId: string, mobs: [string, string, number][]) => {
  const w = new Writer().string(mapId).u8(3);
  for (const [id, name, level] of mobs) w.string(id).string(name).i32(level).u8(0).i32(6).i32(1).u8(0);
  return w.build();
};
/** s2c/1256 notice line. */
export const noticePacket = (text: string) => new Writer().u8(1).string(text).build();

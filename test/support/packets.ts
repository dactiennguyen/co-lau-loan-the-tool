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

// The bag, the money and a scripted server for the step-by-step bots (smith, mail, daily).

export interface BagEntry { slot: number; itemId: number; uuid?: string; field0?: number; quantity?: number; field1?: number; element?: number; stats?: [number, number][] }
/** An item record as in s2c/42 and s2c/1187 (world.ts itemRecord). */
export function record(w: Writer, i: BagEntry) {
  w.u8(i.slot).i32(i.itemId).string(i.uuid ?? `uuid-${i.slot}-${i.itemId}`).i32(i.field0 ?? 0).i32(-1).i32(i.quantity ?? 1)
    .u8(i.field1 ?? 1).u8(i.element ?? 255).i32(0).u8(0).u8(0).u8(i.stats?.length ?? 0);
  for (const [stat, value] of i.stats ?? []) w.i32(stat).i32(value);
}
/** s2c/42 as at login and after c2s/42: label, two ints, then the bag (kind 2). */
export function bag42(bag: BagEntry[], capacity = 42) {
  const w = new Writer().string('test dong 1').i32(42).i32(3).u8(2).i32(capacity).i32(bag.length);
  for (const i of bag) record(w, i);
  return w.build();
}
/** s2c/46: Xu, Xu khóa, Lượng as i64. */
export const money46 = (xu: number, xuKhoa: number, luong: number) => new Writer().string('update Xu').i32(0).i32(xu).i32(0).i32(xuKhoa).i32(0).i32(luong).build();

/** A server that answers each packet the bot sends with the packets of the next step of `script`, and notes any packet
 * that is not the one expected. */
export type Reply = [op: number, payload: Buffer];
export interface Expect { op: number; hex?: string; reply: Reply[] }
export function scripted(script: Expect[], onPacket: (op: number, payload: Buffer) => void) {
  const errors: string[] = [], sent: string[] = [];
  const io = {
    send(op: number, payload: Uint8Array) {
      const h = Buffer.from(payload).toString('hex'), step = script.shift();
      sent.push(`c2s/${op} ${h}`);
      if (!step) return void errors.push(`unexpected c2s/${op} ${h}`);
      if (step.op !== op || (step.hex !== undefined && step.hex !== h)) errors.push(`expected c2s/${step.op} ${step.hex ?? ''}, got c2s/${op} ${h}`);
      setImmediate(() => { for (const [o, p] of step.reply) onPacket(o, p); });
    },
  };
  return { io, errors, sent, left: script };
}
/** s2c/57: an NPC's menu as npcMenu reads it. */
export function menuPacket(npc: string, text: string, options: [number, string][]) {
  const w = new Writer().i32(options.length).string(npc).string(text);
  for (const [option, label] of options) w.u8(option).string(label);
  return w.build();
}

// Phúc lợi: Điểm danh tháng, Quà thăng cấp, Quà online (PL1, 20/11/2026, game 1.1.0; docs/app/events/18-players-checkin.md).
// Every event has a key (CHECKIN_MONTHLY, LEVEL_UP, ONLINE_DAILY, …), a number (64, 65, 21) and milestones. c2s/1236 asks
// an event's definition, c2s/1239 its progress (both: string key). Điểm danh is c2s/1232 (i64 event; i64 milestone, 0 for
// the gift of the day); the other two take every milestone reached at once with c2s/1233 (i64 event). Gifts go straight
// into the bag and the purse, never by mail. All of it works from anywhere once in the world.
import { Reader, Writer } from './protocol.ts';
import { finish, itemLayouts, itemRecord } from './world.ts';

const i64 = (r: Reader) => Number(r.take(8).readBigInt64BE());
const writeI64 = (w: Writer, n: number) => w.i32(Math.floor(n / 2 ** 32)).i32(n % 2 ** 32);

export const CHECKIN = 'CHECKIN_MONTHLY';
export const LEVEL_UP = 'LEVEL_UP';
export const ONLINE_DAILY = 'ONLINE_DAILY';
/** The events the bot takes the gifts of. */
export const WELFARE_KEYS = [CHECKIN, ONLINE_DAILY, LEVEL_UP] as const;
export type WelfareKey = (typeof WELFARE_KEYS)[number];
const KNOWN = new Set<string>(WELFARE_KEYS);

/** A milestone's state in s2c/1239: not reached, reached and not taken, taken. */
export const MILESTONE = { locked: 0, ready: 1, taken: 2 } as const;

/** s2c/1279: one bit per tab of Phúc lợi with a gift to take (the red dot), in the order of the tabs: Online 0, Tri ân 1,
 * Mua chung 2, Điểm danh 3, Giftcode 4, Nạp đầu 5. akaito logged in with 9 (Online and Điểm danh), had 1 after Điểm danh
 * and 0 after the gifts of Online. */
export const WELFARE_TAB = { online: 0, thanks: 1, groupBuy: 2, checkin: 3, giftcode: 4, firstCharge: 5 } as const;
export const welfareDots = (payload: Uint8Array) => { const r = new Reader(payload); return finish(r, { mask: r.i32() }, 's2c/1279').mask; };
export const hasDot = (mask: number, tab: keyof typeof WELFARE_TAB) => ((mask >> WELFARE_TAB[tab]) & 1) === 1;

/** c2s/1236 and c2s/1239: the event's key. */
export const eventKeyRequest = (key: string) => new Writer().string(key).build();
/** c2s/1232: Điểm danh (milestone 0) or a milestone of the month. */
export const checkinRequest = (event: number, milestone = 0) => writeI64(writeI64(new Writer(), event), milestone).build();
/** c2s/1233: every milestone reached of the event. */
export const claimRequest = (event: number) => writeI64(new Writer(), event).build();

export type Gift = ReturnType<typeof itemRecord>;
const gifts = (r: Reader) => { const list: Gift[] = []; for (let n = r.i32(); n > 0; n--) list.push(itemRecord(r)); return list; };

/** s2c/1236: an event's definition. `u8 ok; i64 ? (server ms for some events); i64 event; string key; string title; i32 n; n × {i64 id;
 * i32 need (days, level, minutes); i32 k; k × item}`; CHECKIN_MONTHLY then has `i32 n; n × {item; i16 ?}` (`daily`), the gifts of
 * the day (one of them at random, its index in s2c/1232). Other events carry more after the milestones: kept unread in `rest`. */
export function eventDefinition(payload: Uint8Array) {
  return itemLayouts(() => {
    const r = new Reader(payload), ok = r.u8() === 1, stamp = i64(r), event = i64(r), key = r.string(), title = r.string();
    const milestones = [];
    for (let n = r.i32(); n > 0; n--) milestones.push({ id: i64(r), need: r.i32(), gifts: gifts(r) });
    // The gifts of the day carry two more bytes each (0 in PL1), maybe a weight for the draw.
    const daily: (Gift & { weight: number })[] = [];
    if (key === CHECKIN) for (let n = r.i32(); n > 0; n--) daily.push({ ...itemRecord(r), weight: r.take(2).readInt16BE() });
    const value = { ok, stamp, event, key, title, milestones, daily, rest: undefined as Buffer | undefined };
    if (KNOWN.has(key)) return finish(r, value, 's2c/1236');
    return { ...value, rest: r.take(payload.length - r.offset) };
  });
}
export type EventDefinition = ReturnType<typeof eventDefinition>;

/** s2c/1239: an event's progress. `u8 ok; i64 ? (server ms for some events); i64 event; string key; string period ("2026-11", "2026-11-20",
 * "-" for LEVEL_UP); i32 progress (days checked, minutes online, level); i64 0; i32 n; n × {i64 id; u8 state}`;
 * CHECKIN_MONTHLY then has `u8 checked today; u8 day; u8 days of the month; i32 days checked (bit day−1); i64 next reset
 * (ms)` (`checkin`). Other events: the rest unread. */
export function eventProgress(payload: Uint8Array) {
  const r = new Reader(payload), ok = r.u8() === 1, stamp = i64(r), event = i64(r), key = r.string(), period = r.string();
  const progress = r.i32(), field = i64(r), milestones = [];
  for (let n = r.i32(); n > 0; n--) milestones.push({ id: i64(r), state: r.u8() });
  const checkin = key !== CHECKIN ? undefined
    : { checkedToday: r.u8() === 1, day: r.u8(), daysInMonth: r.u8(), daysMask: r.i32() >>> 0, resetMs: i64(r) };
  const value = { ok, stamp, event, key, period, progress, field, milestones, checkin, rest: undefined as Buffer | undefined };
  if (KNOWN.has(key)) return finish(r, value, 's2c/1239');
  return { ...value, rest: r.take(payload.length - r.offset) };
}
export type EventProgress = ReturnType<typeof eventProgress>;
/** Milestones reached and not taken. */
export const ready = (p: EventProgress) => p.milestones.filter(m => m.state === MILESTONE.ready);

/** s2c/1232, the answer to c2s/1232: `i64 event; i64 milestone; u8 ok; string text; u8 ?; u8 index of the gift of the
 * day; i32 ?` ("Điểm danh ngày 20: nhận 1 Đá cấp 6", index 6). */
export function checkinResult(payload: Uint8Array) {
  const r = new Reader(payload), event = i64(r), milestone = i64(r), ok = r.u8() === 1, text = r.string();
  const field = r.u8(), index = r.u8(), tail = r.i32();
  return finish(r, { event, milestone, ok, text, field, index, tail }, 's2c/1232');
}

/** The notice after c2s/1233: "Đã nhận 5 phần thưởng". */
export const claimedGifts = (text: string) => { const m = /Đã nhận (\d+) phần thưởng/.exec(text); return m ? Number(m[1]) : undefined; };

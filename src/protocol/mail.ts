// Mã quà tặng, Hòm thư and Hương Lão's Nhiệm vụ hàng ngày (G1, 01/11/2026; docs/app/events/14-npc.md#mã-quà-tặng,
// #hòm-thư, #nhiệm-vụ-hàng-ngày). All of them work from anywhere once in the world, except the daily quest menu, which
// is Hương Lão's (M1).
import { Reader, Writer } from './protocol.ts';
import { finish, itemRecord, itemLayouts } from './world.ts';

const i64 = (r: Reader) => Number(r.take(8).readBigInt64BE());
const writeI64 = (w: Writer, n: number) => w.i32(Math.floor(n / 2 ** 32)).i32(n % 2 ** 32);

// ---------------------------------------------------------------------------------------------------------------------
// Mã quà tặng: c2s/1223 (string code) → s2c/1223 (u8 ok; string text); ok 1 then s2c/1222 (the gift's mail), s2c/1220;
// ok 0 then s2c/1256 with the same text.

/** The longest code the client's box takes (setMaxLength(32) in com.g.m.sqcc). */
export const CODE_MAX = 32;
/** The server's words for a code (G1), and its lock: 10 wrong codes in a row, then every code (a good one too) is
 * refused with `locked` for 5 minutes. Nothing says how many tries are left. */
export const GIFT = {
  ok: /^Nhập mã thành công/, used: /đã dùng mã rồi/, unknown: /Mã không tồn tại/, locked: /nhập mã quá nhanh/,
  wrongInARow: 10, lockMs: 5 * 60_000,
} as const;

/** A code as the client sends it: spaces cut at both ends, upper case (G1: "  denbu  " went out as "DENBU"). */
export function normalizeCode(code: string) {
  const c = code.trim().toUpperCase();
  if (!c) throw new Error('mã trống');
  if (c.length > CODE_MAX) throw new Error(`mã "${c}" dài hơn ${CODE_MAX} ký tự`);
  return c;
}
/** c2s/1223. */
export const giftCodeRequest = (code: string) => new Writer().string(normalizeCode(code)).build();
/** s2c/1223. */
export function giftCodeResult(payload: Uint8Array) {
  const r = new Reader(payload);
  return finish(r, { ok: r.u8() === 1, text: r.string() }, 's2c/1223');
}

// ---------------------------------------------------------------------------------------------------------------------
// Hòm thư: c2s/1215 list, c2s/1216 open, c2s/1217 Nhận, c2s/1218 Nhận hết, c2s/1219 Xóa. c2s/1221 (Xóa hết) deletes every
// mail, gifts not taken too: there is no builder for it here on purpose.

/** One mail of s2c/1215, and s2c/1222 (a new one). `kind` was 1 for every gift; `sentAt` is ms, server time. */
export function mailHeader(r: Reader) {
  const id = i64(r), kind = r.u8(), title = r.string(), sender = r.string();
  const read = r.u8() === 1, gift = r.u8() === 1, taken = r.u8() === 1, sentAt = i64(r), last = i64(r);
  return { id, kind, title, sender, read, gift, taken, sentAt, last };
}
export type MailHeader = ReturnType<typeof mailHeader>;
/** s2c/1215: the mailbox, after c2s/1215 and after Nhận hết. */
export function mailList(payload: Uint8Array) {
  const r = new Reader(payload), mails: MailHeader[] = [];
  for (let n = r.i32(); n > 0; n--) mails.push(mailHeader(r));
  return finish(r, { mails }, 's2c/1215');
}
/** s2c/1222: a mail just come, the gift of a code. */
export function newMail(payload: Uint8Array) { const r = new Reader(payload); return finish(r, mailHeader(r), 's2c/1222'); }
/** s2c/1216: a mail opened. Items as in the bag, slot 0xff; money is items too (MONEY_ITEMS), the sum in `quantity`. */
export function mailBody(payload: Uint8Array) {
  return itemLayouts(() => {
    const r = new Reader(payload), id = i64(r), title = r.string(), body = r.string(), sender = r.string(), taken = r.u8() === 1, items = [];
    for (let n = r.i32(); n > 0; n--) items.push(itemRecord(r));
    return finish(r, { id, title, body, sender, taken, items }, 's2c/1216');
  });
}
/** s2c/1217 (Nhận) and s2c/1219 (Xóa): the mail and whether it was done. */
export function mailAck(payload: Uint8Array, opcode: 1217 | 1219) {
  const r = new Reader(payload);
  return finish(r, { id: i64(r), ok: r.u8() === 1 }, `s2c/${opcode}`);
}
/** c2s/1216, c2s/1217, c2s/1219: i64 mail id. */
export const mailIdRequest = (id: number) => writeI64(new Writer(), id).build();
/** The items of a mail that are money: Xu #40, Xu khóa #41, Lượng #42. */
export const MONEY_ITEMS: Record<number, 'xu' | 'xuKhoa' | 'luong'> = { 40: 'xu', 41: 'xuKhoa', 42: 'luong' };
/** The notices of Nhận hết: "Đã nhận quà của 2 thư", "Đã nhận quà của 1 thư, rương đã đầy", "Không có quà nào để nhận". */
export const claimedCount = (text: string) => { const m = /Đã nhận quà của (\d+) thư/.exec(text); return m ? Number(m[1]) : 0; };

/** The bag slots a mail needs (G1): none for money; none for an item that stacks and is in the bag already with the same
 * lock (it joins that stack; two locks in one stack is untried); one for each other record (stones do not stack, and
 * three Đá cấp 5 came as three records). `stackOf` gives an item's stack size (it1). */
export function slotsNeeded(mailItems: { itemId: number; field1: number }[], bag: { itemId: number; field1: number }[], stackOf: (itemId: number) => number) {
  const joined = new Set<string>();
  let slots = 0;
  for (const i of mailItems) {
    if (MONEY_ITEMS[i.itemId]) continue;
    const key = `${i.itemId}:${i.field1}`, stacks = stackOf(i.itemId) > 1;
    if (stacks && (joined.has(key) || bag.some(b => b.itemId === i.itemId && b.field1 === i.field1))) continue;
    slots++;
    if (stacks) joined.add(key);
  }
  return slots;
}

// ---------------------------------------------------------------------------------------------------------------------
// Nhiệm vụ hàng ngày at Hương Lão (NPC 102 of M1): line 2 of his menu says "Hôm nay con đã nhận N/3 nhiệm vụ hàng ngày."
// with one line 0, Nhận nhiệm vụ, or Hủy nhiệm vụ hiện tại while one is held. Either is done at once, without asking.

export const DAILY = {
  path: 2, max: 3,
  accept: /^Nhận nhiệm vụ$/, cancel: /^Hủy nhiệm vụ/,
  /** The line of a finished quest (Cẩm nang: "Hoàn thành nhiệm vụ"): not measured yet, so the bot does not press it. */
  complete: /Hoàn thành/,
  accepted: /^Nhận nhiệm vụ hàng ngày thành công/, cancelled: /^Hủy nhiệm vụ thành công/,
} as const;
/** s2c/1195, the daily quest held. Kind 0: none; 1: the quest (at login, when taken; `template` has %d for the target);
 * 2: done, after Hoàn thành nhiệm vụ (string name; i32 n; n × string reward, "727 kinh nghiệm", "590 xu khóa"), with the
 * rewards already given by s2c/10 and s2c/46 before it; 3: its progress moved (i32 progress; i32 target), e.g. right
 * after a pickup of Xu khóa for Nhặt xu (NP1). */
export const DAILY_NONE = 0, DAILY_QUEST = 1, DAILY_DONE = 2, DAILY_PROGRESS = 3;
export function dailyQuest(payload: Uint8Array) {
  const r = new Reader(payload), kind = r.u8();
  if (kind === DAILY_PROGRESS) return finish(r, { kind: DAILY_PROGRESS as typeof DAILY_PROGRESS, quest: undefined, progress: r.i32(), target: r.i32() }, 's2c/1195');
  if (kind === DAILY_NONE) return finish(r, { kind: DAILY_NONE as typeof DAILY_NONE, quest: null }, 's2c/1195');
  if (kind === DAILY_DONE) {
    const name = r.string(), rewards: string[] = [];
    for (let n = r.i32(); n > 0; n--) rewards.push(r.string());
    return finish(r, { kind: DAILY_DONE as typeof DAILY_DONE, quest: null, done: { name, rewards } }, 's2c/1195');
  }
  if (kind !== DAILY_QUEST) throw new Error(`s2c/1195: kind ${kind} not seen yet`);
  return finish(r, { kind: DAILY_QUEST as typeof DAILY_QUEST, quest: { id: r.i32(), name: r.string(), template: r.string(), progress: r.i32(), target: r.i32() } }, 's2c/1195');
}
export type DailyQuest = NonNullable<Extract<ReturnType<typeof dailyQuest>, { kind: 1 }>['quest']>;
/** The quest held after a s2c/1195 (decoded by dailyQuest): the new one, none, or `held` with the progress of kind 3. */
export function dailyAfter(held: DailyQuest | null | undefined, d: ReturnType<typeof dailyQuest>): DailyQuest | null | undefined {
  if (d.kind !== DAILY_PROGRESS) return d.quest;
  return held ? { ...held, progress: d.progress, target: d.target } : held;
}
/** "Sử dụng 0/3 vật phẩm trong trận đấu", as the Phụ tab of the quest panel draws it. */
export const dailyText = (q: DailyQuest) => q.template.replace('%d', `${q.progress}/${q.target}`);
/** "Hôm nay con đã nhận 1/3 nhiệm vụ hàng ngày." → { taken: 1, max: 3 }. */
export function dailyTaken(text: string) {
  const m = /đã nhận (\d+)\/(\d+)/.exec(text);
  return m ? { taken: Number(m[1]), max: Number(m[2]) } : undefined;
}

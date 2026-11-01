// Mã quà tặng and Hòm thư from the TS bot (docs/integration/nodejs/mail.md, docs/app/events/14-npc.md#hòm-thư-bot). Both
// work from anywhere once in the world. The bot never sends c2s/1221 (Xóa hết): it deletes gifts not taken too.
import { buildRequest } from '../protocol/events.ts';
import type { Items } from '../protocol/items.ts';
import * as mail from '../protocol/mail.ts';
import { notice } from '../protocol/world.ts';
import { Holdings, Steps, Stop, serverText, sleep, type Io, type Log } from './steps.ts';

export type Outcome = 'done' | 'dry_run';
const DELETE_ALL = 1221;

export interface GiftOptions {
  /** The codes, as typed: they go out trimmed and upper-cased, each once. */
  codes: string[];
  /** Stop after this many codes refused in a row (default 5; the server blocks every code for 5 minutes at 10). */
  maxWrong?: number;
  /** Codes refused in a row before this run: the server counts them across logins, the CLI keeps them per nick. */
  wrongBefore?: number;
  /** Pause between two codes (default 10 s). 1,5 s after a good code the server said "Bạn nhập mã quá nhanh" (Log lỗi of
   * 02/11, manina3); codes 8 s apart and more went through (manina2 the same day, G1). */
  gapMs?: number;
  /** "Quá nhanh" short of the lock of 10 wrong codes: the same code goes once more after this (default 30 s). */
  retryMs?: number;
  waitMs?: number;
  /** After a code taken, how long s2c/1222 (its mail) gets (default 500 ms). */
  settleMs?: number;
  log?: Log;
}

/** Mã quà tặng: c2s/1223 for each code, s2c/1223 for the answer and s2c/1222 for the mail of a good one. */
export class GiftBot {
  readonly codes: string[];
  readonly results: { code: string; ok: boolean; text: string; mail?: { id: number; title: string } }[] = [];
  /** Codes refused in a row, this run's on top of wrongBefore; 0 again after a good code. */
  wrong: number;
  /** When the server said it blocks the codes (Date.now()). */
  lockedAt?: number;
  private readonly steps: Steps;
  private readonly maxWrong: number;
  private readonly gapMs: number;
  private readonly retryMs: number;
  private readonly settleMs: number;
  private readonly log: Log;
  private mails: mail.MailHeader[] = [];

  constructor(options: GiftOptions) {
    this.codes = [...new Set(options.codes.map(mail.normalizeCode))];
    this.maxWrong = options.maxWrong ?? 5;
    if (!(this.maxWrong >= 1 && this.maxWrong < mail.GIFT.wrongInARow)) throw new Error(`maxWrong phải từ 1 tới ${mail.GIFT.wrongInARow - 1}`);
    this.wrong = options.wrongBefore ?? 0;
    this.gapMs = options.gapMs ?? 10_000;
    this.retryMs = options.retryMs ?? 30_000;
    this.settleMs = options.settleMs ?? 500;
    this.log = options.log ?? (() => {});
    this.steps = new Steps(options.waitMs ?? 8000);
  }

  onPacket(op: number, payload: Buffer) {
    try {
      if (op === 1222) this.mails.push(mail.newMail(payload));
      else if (op === 0) this.log({ event: 'server_message', text: serverText(payload) });
    } catch (error) {
      this.log({ event: 'parse_error', opcode: op, reason: (error as Error).message, payloadHex: payload.toString('hex') });
    }
    this.steps.take(op, payload);
  }

  async run(io: Io): Promise<Outcome> {
    this.steps.io = io;
    if (this.wrong >= this.maxWrong) throw new Stop(`nick đã có ${this.wrong} mã bị từ chối liền nhau (--max-wrong=${this.maxWrong}): chưa gửi mã nào`);
    for (const [k, code] of this.codes.entries()) {
      if (k) await sleep(this.gapMs);
      let seen = this.mails.length;
      // A refused code gets s2c/1223 ok 0 and then the same words in a notice: the notice is no refusal of the step.
      const ask = async () => mail.giftCodeResult((await this.steps.ask(1223, mail.giftCodeRequest(code), [1223], `kết quả mã ${code}`, { refuse: false })).payload);
      let r = await ask();
      // "Quá nhanh" while fewer than 10 codes were refused in a row is no lock: the pause was too short. The same code goes
      // once more, not counted; said again, it is the lock.
      if (!r.ok && mail.GIFT.locked.test(r.text) && this.wrong < mail.GIFT.wrongInARow) {
        this.log({ event: 'too_fast', code, text: r.text, retryMs: this.retryMs });
        await sleep(this.retryMs);
        seen = this.mails.length;
        r = await ask();
      }
      if (r.ok) await sleep(this.settleMs);
      const got = this.mails.slice(seen)[0];
      this.wrong = r.ok ? 0 : this.wrong + 1;
      const result = { code, ok: r.ok, text: r.text, mail: got && { id: got.id, title: got.title } };
      this.results.push(result);
      this.log({ event: 'code', ...result, wrong: this.wrong });
      const left = this.codes.slice(k + 1);
      if (mail.GIFT.locked.test(r.text)) {
        this.lockedAt = Date.now();
        throw new Stop(`server đang chặn nhập mã 5 phút ("${r.text}"); chạy lại sau 5 phút${left.length ? `, chưa gửi: ${left.join(', ')}` : ''}`);
      }
      if (this.wrong >= this.maxWrong && left.length) {
        throw new Stop(`${this.wrong} mã bị từ chối liền nhau (--max-wrong=${this.maxWrong}): dừng trước khi bị chặn (10 lần liền thì chặn 5 phút); chưa gửi: ${left.join(', ')}`);
      }
    }
    return 'done';
  }
}

export type MailTask = { kind: 'list' } | { kind: 'open' } | { kind: 'claim'; id: number } | { kind: 'claim-all' } | { kind: 'delete-claimed' };
export interface MailOptions {
  items: Items;
  /** Nhận, Nhận hết, Xóa; without it the bot only reads. */
  confirm?: boolean;
  waitMs?: number;
  /** After the answer to Nhận, how long the packets with it get (default 400 ms). */
  settleMs?: number;
  log?: Log;
}

/** Hòm thư: c2s/1215 for the list, c2s/1216 to open a mail, c2s/1217 Nhận, c2s/1218 Nhận hết, c2s/1219 Xóa. */
export class MailBot {
  readonly holdings = new Holdings();
  mails: mail.MailHeader[] = [];
  /** s2c/1220: a mail not read yet. */
  unread?: boolean;
  private readonly steps: Steps;
  private readonly items: Items;
  private readonly confirm: boolean;
  private readonly settleMs: number;
  private readonly log: Log;
  private notices: string[] = [];

  constructor(options: MailOptions) {
    this.items = options.items;
    this.confirm = options.confirm ?? false;
    this.settleMs = options.settleMs ?? 400;
    this.log = options.log ?? (() => {});
    this.steps = new Steps(options.waitMs ?? 8000);
  }

  onPacket(op: number, payload: Buffer) {
    try {
      this.holdings.update(op, payload);
      if (op === 1215) this.mails = mail.mailList(payload).mails;
      else if (op === 1220) this.unread = payload[0] === 1;
      else if (op === 1256) { const text = notice(payload).text; this.notices.push(text); this.log({ event: 'notice', text }); }
      else if (op === 0) this.log({ event: 'server_message', text: serverText(payload) });
    } catch (error) {
      this.log({ event: 'parse_error', opcode: op, reason: (error as Error).message, payloadHex: payload.toString('hex') });
    }
    this.steps.take(op, payload);
  }

  async run(task: MailTask, io: Io): Promise<Outcome> {
    this.steps.io = {
      send(op, payload) {
        if (op === DELETE_ALL) throw new Error('c2s/1221 (Xóa hết) xoá cả thư còn quà chưa nhận: bot không gửi gói này');
        io.send(op, payload);
      },
    };
    await this.list();
    switch (task.kind) {
      case 'list': return 'done';
      case 'open': for (const m of this.unclaimed()) await this.open(m); return 'done';
      case 'claim': return this.claim(task.id);
      case 'claim-all': return this.claimAll();
      case 'delete-claimed': return this.deleteClaimed();
    }
  }

  /** Gift mails whose gift is not taken yet. */
  unclaimed() { return this.mails.filter(m => m.gift && !m.taken); }

  private async list() {
    await this.steps.ask(1215, buildRequest(1215), [1215], 'danh sách thư', { refuse: false });
    this.log({ event: 'mails', count: this.mails.length, unclaimed: this.unclaimed().length, free: this.holdings.free(), mails: this.mails.map(m => this.view(m)) });
  }

  /** c2s/1216: the items of a mail and the bag slots they need. Opening a mail marks it read (the dry run of Nhận too). */
  private async open(m: mail.MailHeader) {
    const body = mail.mailBody((await this.steps.ask(1216, mail.mailIdRequest(m.id), [1216], `thư ${m.id}`, { refuse: false })).payload);
    const money: Partial<Record<'xu' | 'xuKhoa' | 'luong', number>> = {};
    for (const i of body.items) { const k = mail.MONEY_ITEMS[i.itemId]; if (k) money[k] = (money[k] ?? 0) + i.quantity; }
    const slots = mail.slotsNeeded(body.items, this.holdings.bag, id => this.items.get(id)?.stack ?? 1);
    this.log({ event: 'mail', id: m.id, title: body.title, body: body.body, taken: body.taken, money, slots,
      items: body.items.filter(i => !mail.MONEY_ITEMS[i.itemId]).map(i => `${this.items.describe(i)}${i.field1 === 0 ? ', khoá' : ''}`) });
    return { body, slots };
  }

  private async claim(id: number): Promise<Outcome> {
    const m = this.mails.find(x => x.id === id);
    if (!m) throw new Stop(`hòm thư không có thư ${id}`);
    if (!m.gift || m.taken) throw new Stop(`thư ${id} "${m.title}" ${m.gift ? 'đã nhận quà rồi' : 'không có quà'}`);
    const { slots } = await this.open(m), free = this.holdings.free();
    this.log({ event: 'plan', task: 'Nhận', id, title: m.title, slots, free });
    if (slots > free) throw new Stop(`thư ${id} cần ${slots} ô trống, túi còn ${free}: dọn túi trước, hoặc dùng --claim-all (bỏ qua thư thiếu chỗ)`);
    if (!this.confirm) return this.dryRun();
    const moneyBefore = this.holdings.money && { ...this.holdings.money }, bagBefore = this.holdings.bag.length, seen = this.notices.length;
    const a = mail.mailAck((await this.steps.ask(1217, mail.mailIdRequest(id), [1217], `Nhận thư ${id}`, { refuse: false })).payload, 1217);
    await sleep(this.settleMs);
    const notices = this.notices.slice(seen);
    this.log({ event: 'result', task: 'Nhận', id, ok: a.ok, notices, moneyBefore, moneyAfter: this.holdings.money, bag: `${bagBefore} → ${this.holdings.bag.length} món` });
    if (!a.ok) throw new Stop(`server không cho nhận thư ${id}${notices.length ? `: "${notices.at(-1)}"` : ''}`);
    return 'done';
  }

  /** One c2s/1218. The mails are not opened first: that would mark them read, and the server takes those that fit and
   * says "Rương đã đầy" for the rest. */
  private async claimAll(): Promise<Outcome> {
    const gifts = this.unclaimed();
    if (!gifts.length) { this.log({ event: 'plan', task: 'Nhận hết', mails: 0, text: 'không có thư quà nào chưa nhận' }); return 'done'; }
    this.log({ event: 'plan', task: 'Nhận hết', mails: gifts.length, gifts: gifts.map(m => this.view(m)), free: this.holdings.free() });
    if (!this.confirm) return this.dryRun();
    const moneyBefore = this.holdings.money && { ...this.holdings.money }, bagBefore = this.holdings.bag.length, seen = this.notices.length;
    // Nhận hết always ends with the new list (s2c/1215), after the notice that says how many mails were taken.
    await this.steps.ask(1218, buildRequest(1218), [1215], 'Nhận hết', { refuse: false });
    const text = this.notices.slice(seen).find(t => /Đã nhận quà|Không có quà|Rương đã đầy/.test(t)) ?? '';
    this.log({ event: 'result', task: 'Nhận hết', text, claimed: mail.claimedCount(text), left: this.unclaimed().length,
      moneyBefore, moneyAfter: this.holdings.money, bag: `${bagBefore} → ${this.holdings.bag.length} món` });
    if (!mail.claimedCount(text) && !/Không có quà/.test(text)) throw new Stop(`không nhận được thư nào: "${text}"`);
    return 'done';
  }

  /** Xóa, one by one, only mails whose gift is taken or that had none. */
  private async deleteClaimed(): Promise<Outcome> {
    const done = this.mails.filter(m => m.taken || !m.gift);
    this.log({ event: 'plan', task: 'Xóa thư đã nhận', mails: done.map(m => this.view(m)), keep: this.unclaimed().length });
    if (!done.length) return 'done';
    if (!this.confirm) return this.dryRun();
    for (const m of done) {
      const a = mail.mailAck((await this.steps.ask(1219, mail.mailIdRequest(m.id), [1219], `Xóa thư ${m.id}`, { refuse: false })).payload, 1219);
      this.log({ event: 'result', task: 'Xóa', id: m.id, title: m.title, ok: a.ok });
      if (!a.ok) throw new Stop(`server không xoá thư ${m.id}`);
    }
    return 'done';
  }

  private dryRun(): Outcome {
    this.log({ event: 'dry_run', reason: 'chạy thử: thêm --confirm để làm' });
    return 'dry_run';
  }

  private view(m: mail.MailHeader) {
    return { id: m.id, title: m.title, sender: m.sender, read: m.read, gift: m.gift, taken: m.taken, sentAt: new Date(m.sentAt).toISOString() };
  }
}

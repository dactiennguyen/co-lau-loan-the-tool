// Phúc lợi from the TS bot (docs/integration/nodejs/welfare.md): Điểm danh, Quà online, Quà thăng
// cấp, from anywhere once in the world. Asks each event's definition and progress as the client does when the tab opens
// (c2s/1236 then c2s/1239), then takes what is due: c2s/1232 (event, 0) when today is not checked, c2s/1232 (event,
// milestone) for a milestone of the month reached, c2s/1233 (event) when Online or Thăng cấp has a milestone reached.
import type { Items } from '../protocol/items.ts';
import { slotsNeeded } from '../protocol/mail.ts';
import * as w from '../protocol/welfare.ts';
import { notice } from '../protocol/world.ts';
import { Holdings, Steps, sleep, serverText, type Io, type Log, type Packet } from './steps.ts';

export type Outcome = 'done' | 'dry_run' | 'nothing';
export interface WelfareOptions {
  items: Items;
  /** Send the claims; without it the bot only reads. */
  confirm?: boolean;
  /** Send c2s/1232 and c2s/1233 even when the progress says nothing is due, to see the server's refusal. */
  again?: boolean;
  waitMs?: number;
  /** After the answer to a claim, how long the packets with it get (default 600 ms). */
  settleMs?: number;
  log?: Log;
}
export interface Claim { key: w.WelfareKey; milestone?: number; ok: boolean; text?: string; gifts?: number; index?: number }

const keyOf = (p: Packet) => { try { return (p.op === 1236 ? w.eventDefinition(p.payload) : w.eventProgress(p.payload)).key; } catch { return undefined; } };

export class WelfareBot {
  readonly holdings = new Holdings();
  readonly definitions = new Map<string, w.EventDefinition>();
  readonly progress = new Map<string, w.EventProgress>();
  readonly claims: Claim[] = [];
  /** s2c/1279, the red dots of Phúc lợi (bit per tab); comes at login. */
  dots?: number;
  private readonly steps: Steps;
  private readonly items: Items;
  private readonly confirm: boolean;
  private readonly again: boolean;
  private readonly settleMs: number;
  private readonly log: Log;
  private notices: string[] = [];

  constructor(options: WelfareOptions) {
    this.items = options.items;
    this.confirm = options.confirm ?? false;
    this.again = options.again ?? false;
    this.settleMs = options.settleMs ?? 600;
    this.log = options.log ?? (() => {});
    this.steps = new Steps(options.waitMs ?? 8000);
  }

  onPacket(op: number, payload: Buffer) {
    try {
      this.holdings.update(op, payload);
      if (op === 1279) { this.dots = w.welfareDots(payload); this.log({ event: 'dots', mask: this.dots, online: w.hasDot(this.dots, 'online'), checkin: w.hasDot(this.dots, 'checkin') }); }
      else if (op === 1236) { const d = w.eventDefinition(payload); this.definitions.set(d.key, d); }
      else if (op === 1239) { const p = w.eventProgress(payload); this.progress.set(p.key, p); }
      else if (op === 1256) { const text = notice(payload).text; this.notices.push(text); this.log({ event: 'notice', text }); }
      else if (op === 0) this.log({ event: 'server_message', text: serverText(payload) });
    } catch (error) {
      this.log({ event: 'parse_error', opcode: op, reason: (error as Error).message, payloadHex: payload.toString('hex') });
    }
    this.steps.take(op, payload);
  }

  async run(io: Io): Promise<Outcome> {
    this.steps.io = io;
    for (const key of w.WELFARE_KEYS) await this.read(key);
    const checkin = this.need(w.CHECKIN), todo = [
      ...(!checkin.checkin?.checkedToday || this.again ? [{ key: w.CHECKIN, milestone: 0 }] : []),
      ...w.ready(checkin).map(m => ({ key: w.CHECKIN, milestone: m.id })),
      ...([w.ONLINE_DAILY, w.LEVEL_UP] as const).filter(k => w.ready(this.need(k)).length || this.again).map(key => ({ key, milestone: undefined })),
    ] as { key: w.WelfareKey; milestone?: number }[];
    this.log({ event: 'plan', todo: todo.map(t => this.label(t)), free: this.holdings.free(), confirm: this.confirm });
    if (!todo.length) return 'nothing';
    if (!this.confirm) return 'dry_run';
    for (const t of todo) await this.claim(t);
    return 'done';
  }

  /** The progress of an event, read at the start of the run. */
  need(key: w.WelfareKey) {
    const p = this.progress.get(key);
    if (!p) throw new Error(`chưa có tiến độ ${key}`);
    return p;
  }

  /** c2s/1236 then c2s/1239, as the client when the tab opens; the answers are matched by key. */
  private async read(key: w.WelfareKey) {
    const match = (p: Packet) => keyOf(p) === key;
    await this.steps.ask(1236, w.eventKeyRequest(key), [1236], `định nghĩa ${key}`, { refuse: false, match });
    await this.steps.ask(1239, w.eventKeyRequest(key), [1239], `tiến độ ${key}`, { refuse: false, match });
    const p = this.progress.get(key)!, d = this.definitions.get(key)!;
    const need = new Map(d.milestones.map(m => [m.id, m]));
    this.log({
      event: 'progress', key, title: d.title, period: p.period, progress: p.progress,
      ...(p.checkin && { checkedToday: p.checkin.checkedToday, day: p.checkin.day, days: dayList(p.checkin.daysMask) }),
      milestones: p.milestones.map(m => `${need.get(m.id)?.need ?? '?'}: ${['chưa đủ', 'nhận được', 'đã nhận'][m.state] ?? m.state} (${this.gifts(need.get(m.id)?.gifts ?? [])})`),
    });
  }

  /** One claim: its gifts must fit the bag (the gift of the day: the biggest of the ten). */
  private async claim(t: { key: w.WelfareKey; milestone?: number }) {
    const what = this.label(t), slots = this.slots(t), free = this.holdings.free();
    if (slots > free) {
      this.log({ event: 'skip', claim: what, reason: `cần ${slots} ô trống, túi còn ${free}` });
      this.claims.push({ key: t.key, milestone: t.milestone, ok: false, text: 'túi không đủ chỗ' });
      return;
    }
    const event = this.definitions.get(t.key)!.event, seen = this.notices.length, before = this.holdings.money && { ...this.holdings.money };
    let claim: Claim;
    try {
      claim = await this.send(t, event, what);
    } catch (error) {
      // No answer at all: logged, and the next claim still goes.
      claim = { key: t.key, milestone: t.milestone, ok: false, text: (error as Error).message };
    }
    await sleep(this.settleMs);
    this.claims.push(claim);
    const p = this.progress.get(t.key);
    this.log({ event: 'claim', claim: what, ...claim, notices: this.notices.slice(seen), moneyBefore: before, moneyAfter: this.holdings.money,
      progress: p && p.milestones.map(m => `${m.id}:${m.state}`).join(' '), ...(p?.checkin && { checkedToday: p.checkin.checkedToday }) });
  }

  private async send(t: { key: w.WelfareKey; milestone?: number }, event: number, what: string): Promise<Claim> {
    if (t.key === w.CHECKIN) {
      // Today checked already: s2c/1232 ok 0 "Hôm nay bạn đã điểm danh" (index 255), then a notice with the same words.
      const p = await this.steps.ask(1232, w.checkinRequest(event, t.milestone), [1232, 1256, 0], what, { refuse: false });
      if (p.op === 1232) { const r = w.checkinResult(p.payload); return { key: t.key, milestone: t.milestone, ok: r.ok, text: r.text, index: r.index }; }
      return { key: t.key, milestone: t.milestone, ok: false, text: p.op === 0 ? serverText(p.payload) : notice(p.payload).text };
    }
    // Taken: s2c/46, s2c/1187, s2c/1256 "Đã nhận N phần thưởng", s2c/1239. Nothing due: s2c/1256 "Không có phần thưởng nào
    // để nhận", s2c/1239 as it was.
    const p = await this.steps.ask(1233, w.claimRequest(event), [1256, 0, 1239], what, { refuse: false, match: x => x.op !== 1239 || keyOf(x) === t.key });
    const text = p.op === 1256 ? notice(p.payload).text : p.op === 0 ? serverText(p.payload) : undefined;
    const gifts = text ? w.claimedGifts(text) : undefined;
    return { key: t.key, ok: gifts !== undefined && gifts > 0, text, gifts };
  }

  private slots(t: { key: w.WelfareKey; milestone?: number }) {
    const d = this.definitions.get(t.key)!, stack = (id: number) => this.items.get(id)?.stack ?? 1;
    const need = (gifts: w.Gift[]) => slotsNeeded(gifts, this.holdings.bag, stack);
    if (t.key === w.CHECKIN && !t.milestone) return Math.max(0, ...d.daily.map(g => need([g])));
    if (t.key === w.CHECKIN) return need(d.milestones.find(m => m.id === t.milestone)?.gifts ?? []);
    const p = this.progress.get(t.key)!, due = new Set(w.ready(p).map(m => m.id));
    return need(d.milestones.filter(m => due.has(m.id)).flatMap(m => m.gifts));
  }

  private label(t: { key: w.WelfareKey; milestone?: number }) {
    if (t.key === w.CHECKIN) return t.milestone ? `Mốc tháng ${this.definitions.get(t.key)?.milestones.find(m => m.id === t.milestone)?.need ?? t.milestone} ngày` : 'Điểm danh';
    return t.key === w.ONLINE_DAILY ? 'Quà online' : 'Quà thăng cấp';
  }

  private gifts(list: w.Gift[]) { return list.map(g => this.items.describe(g)).join(', '); }
}

/** The days of the month whose bit is set (bit day−1). */
export const dayList = (mask: number) => Array.from({ length: 31 }, (_, k) => k + 1).filter(d => (mask >>> (d - 1)) & 1);

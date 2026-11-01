// The step-by-step bots (Pháp sư, Hương Lão, hòm thư, mã quà tặng): send one packet, wait for the answer it gets, and talk
// to an NPC down its menus as the game does (docs/app/events/14-npc.md#hộp-thoại).
import { buildRequest } from '../protocol/events.ts';
import { Reader } from '../protocol/protocol.ts';
import { bagAfter, characterExtra, currencies, inventory, itemRecord, notice, npcMenu } from '../protocol/world.ts';

/** Why a task ended before its end: the reason is for the user, in the words of the logs. */
export class Stop extends Error {}
export interface Packet { op: number; payload: Buffer }
export type Menu = ReturnType<typeof npcMenu>;
/** A line of an NPC menu to pick: its code, and the label it must have. */
export type Step = readonly [option: number, label: RegExp];
export interface Io { send(opcode: number, payload: Uint8Array): void }
export type Log = (event: Record<string, unknown>) => void;

export type ItemRecord = ReturnType<typeof itemRecord>;
export interface Money { xu: number; xuKhoa: number; luong: number }

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** s2c/0: i8 flag; string text. In the world it is the server's message box (14-npc.md#s2c-0). */
export const serverText = (payload: Uint8Array) => { const r = new Reader(payload); r.u8(); return r.string(); };
/** The words of a notice (s2c/1256) or of a message box (s2c/0). */
export const refusalText = (p: Packet) => (p.op === 0 ? serverText(p.payload) : notice(p.payload).text);

export class Steps {
  io?: Io;
  readonly waitMs: number;
  private waiters: { ops: number[]; resolve: (p: Packet) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  constructor(waitMs = 8000) { this.waitMs = waitMs; }

  /** Every packet of the session goes through here: the step waiting for its opcode gets it. */
  take(op: number, payload: Buffer) {
    const w = this.waiters.find(x => x.ops.includes(op));
    if (!w) return;
    this.waiters.splice(this.waiters.indexOf(w), 1);
    clearTimeout(w.timer);
    w.resolve({ op, payload });
  }

  /** Resolves with the first of `ops` that comes after the call; rejects with Stop after waitMs. Only for a packet that
   * comes without a request: a step that sends one uses ask, which drops the wait when the send fails. */
  next(ops: number[], what: string): Promise<Packet> { return this.wait(ops, what).promise; }

  /** Sends a packet and waits for one of `ops`, registered first: the answer may come in the same chunk as the packet
   * before it. With `refuse` (the default) a notice (s2c/1256) or a message box (s2c/0) that comes instead is a refusal;
   * without it `ops` may list them. */
  async ask(op: number, payload: Uint8Array, ops: number[], what: string, { refuse = true } = {}) {
    const answer = this.wait(refuse ? [...ops, 1256, 0] : ops, what);
    try { this.send(op, payload); } catch (error) { answer.cancel(); throw error; }
    const p = await answer.promise;
    if (!ops.includes(p.op)) throw new Stop(`${what}: server từ chối "${refusalText(p)}"`);
    return p;
  }

  private wait(ops: number[], what: string) {
    let cancel = () => {};
    const promise = new Promise<Packet>((resolve, reject) => {
      const waiter = { ops, resolve, timer: setTimeout(() => {
        this.waiters = this.waiters.filter(w => w !== waiter);
        reject(new Stop(`server không trả lời ${what} sau ${this.waitMs / 1000} s`));
      }, this.waitMs) };
      this.waiters.push(waiter);
      cancel = () => { clearTimeout(waiter.timer); this.waiters = this.waiters.filter(w => w !== waiter); };
    });
    return { promise, cancel };
  }

  send(op: number, payload: Uint8Array) {
    if (!this.io) throw new Error('no session to send on');
    this.io.send(op, payload);
  }
}

/** One NPC: c2s/13 for its first menu, then c2s/57 for lines of the menu just received only, each checked against the
 * label expected. The server keeps the last menu it sent and reads a c2s/57 against it, so a bot never sends one for a
 * menu that is not the last. */
export class Npc {
  private readonly steps: Steps;
  private readonly at: { mapId: string; npcId: number };
  private readonly who: string;
  private readonly log: Log;
  constructor(steps: Steps, at: { mapId: string; npcId: number }, who: string, log: Log) {
    this.steps = steps; this.at = at; this.who = who; this.log = log;
  }

  async talk() { return npcMenu((await this.steps.ask(13, buildRequest(13, this.at), [57], `menu của ${this.who}`)).payload); }

  async pick(menu: Menu, [option, label]: Step, ops: number[]) {
    const line = this.line(menu, [option, label]);
    this.log({ event: 'menu', option, label: line.label });
    return this.steps.ask(57, buildRequest(57, { option, ...this.at }), ops, `"${line.label}"`);
  }

  /** The line of a menu, after checking it has the label expected. */
  line(menu: Menu, [option, label]: Step) {
    const line = menu.options.find(o => o.option === option);
    if (!line || !label.test(line.label)) {
      throw new Stop(`menu "${menu.text}" không có dòng ${option} ${label} (có: ${menu.options.map(o => `${o.option} ${o.label}`).join(', ')})`);
    }
    return line;
  }

  /** c2s/13, then the lines of `path`; returns the answer to the last one. */
  async walk(path: Step[], ops: number[]) {
    let menu = await this.talk(), answer: Packet | undefined;
    for (const [k, step] of path.entries()) {
      const last = k === path.length - 1;
      answer = await this.pick(menu, step, last ? ops : [57]);
      if (!last) menu = npcMenu(answer.payload);
    }
    return answer!;
  }
}

/** The bag and the money as the server sent them last: s2c/42 (login, c2s/42), s2c/1187 (the whole bag, or kind 4: one
 * item added), s2c/46. */
export class Holdings {
  bag: ItemRecord[] = [];
  capacity = 0;
  money?: Money;
  /** Takes the packets that carry the bag or the money; true if this was one. */
  update(op: number, payload: Buffer) {
    if (op === 42) {
      const b = characterExtra(payload);
      this.bag = b.items; this.capacity = b.capacity;
    } else if (op === 1187) {
      const b = inventory(payload);
      this.bag = bagAfter(this.bag, b.kind, b.items);
      if (b.capacity >= 0) this.capacity = b.capacity;
    } else if (op === 46) {
      const m = currencies(payload);
      this.money = { xu: m.xu, xuKhoa: m.xuKhoa, luong: m.luong };
    } else return false;
    return true;
  }
  free() { return this.capacity - this.bag.length; }
}

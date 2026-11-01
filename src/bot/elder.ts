// Hương Lão Trần Bá (NPC 102 of M1) from the TS bot, besides gift codes (mail.ts) and daily quests (daily.ts)
// (docs/integration/nodejs/shop.md#hương-lão, docs/app/events/14-npc.md#hương-lão):
// - Điểm năng động: the points of the week and the exchange limit, read from its menu; Cách tính điểm (s2c/0) on demand.
//   Đổi Xu at 100 points is not measured and Đóng leaves the phone's client stuck: the bot sends neither.
// - Đổi lượng: 50 Lượng for 50.000 Xu or 55.000 Xu khóa. Its lines run at once on c2s/57, so whatever ends the task the
//   bot talks to him again, leaving his first menu as the last one (its line 0 only opens Mã quà tặng).
import { buildRequest } from '../protocol/events.ts';
import { ELDER, NPC_MAP } from '../protocol/npc.ts';
import { EXCHANGE, POINTS, pointsText } from '../protocol/shops.ts';
import { notice, npcMenu } from '../protocol/world.ts';
import { Holdings, Npc, Steps, Stop, refusalText, serverText, sleep, type Io, type Log } from './steps.ts';

export type Outcome = 'done' | 'dry_run';
export type ElderTask = { kind: 'points'; rules?: boolean } | { kind: 'exchange'; to: 'xu' | 'khoa'; times: number };
export interface ElderOptions {
  /** Đổi lượng; without it the bot only reads. */
  confirm?: boolean;
  waitMs?: number;
  /** After the notice of an exchange, how long the money gets (default 400 ms). */
  settleMs?: number;
  log?: Log;
}
const AT = { mapId: NPC_MAP, npcId: ELDER };

export class ElderBot {
  readonly holdings = new Holdings();
  private readonly steps: Steps;
  private readonly npc: Npc;
  private readonly confirm: boolean;
  private readonly settleMs: number;
  private readonly log: Log;

  constructor(options: ElderOptions = {}) {
    this.confirm = options.confirm ?? false;
    this.settleMs = options.settleMs ?? 400;
    this.log = options.log ?? (() => {});
    this.steps = new Steps(options.waitMs ?? 8000);
    this.npc = new Npc(this.steps, AT, 'Hương Lão', this.log);
  }

  onPacket(op: number, payload: Buffer) {
    try {
      this.holdings.update(op, payload);
      if (op === 1256) this.log({ event: 'notice', text: notice(payload).text });
    } catch (error) {
      this.log({ event: 'parse_error', opcode: op, reason: (error as Error).message, payloadHex: payload.toString('hex') });
    }
    this.steps.take(op, payload);
  }

  async run(task: ElderTask, io: Io, mapId: string | undefined): Promise<Outcome> {
    this.steps.io = io;
    if (mapId !== NPC_MAP) throw new Stop(`nhân vật đang ở ${mapId}; Hương Lão chỉ trả lời ở ${NPC_MAP} (Làng Thanh Khê)`);
    let opened = false;
    try {
      const root = await this.npc.talk();
      opened = true;
      return task.kind === 'points' ? await this.points(root, !!task.rules) : await this.exchange(root, task.to, task.times);
    } finally {
      if (opened) await this.npc.talk().catch(() => undefined);
    }
  }

  private async points(root: ReturnType<typeof npcMenu>, rules: boolean): Promise<Outcome> {
    const menu = npcMenu((await this.npc.pick(root, POINTS.path[0], [57])).payload);
    this.log({ event: 'points', ...pointsText(menu.text), text: menu.text, lines: menu.options.map(o => `${o.option} ${o.label}`) });
    if (rules) this.log({ event: 'rules', text: serverText((await this.npc.pick(menu, POINTS.rules, [0])).payload) });
    return 'done';
  }

  private async exchange(root: ReturnType<typeof npcMenu>, to: 'xu' | 'khoa', times: number): Promise<Outcome> {
    const step = EXCHANGE.lines[to], need = EXCHANGE.luong * times, have = this.holdings.money?.luong;
    let menu = npcMenu((await this.npc.pick(root, EXCHANGE.path[0], [57])).payload);
    const line = this.npc.line(menu, step);
    this.log({ event: 'plan', task: 'Đổi lượng', line: line.label, times, luong: need, gets: EXCHANGE.gets[to] * times, have, money: this.holdings.money });
    if (have === undefined || have < need) throw new Stop(`thiếu Lượng: cần ${need}, có ${have ?? 'chưa biết'}`);
    if (!this.confirm) {
      this.log({ event: 'dry_run', reason: 'chạy thử: thêm --confirm để đổi' });
      return 'dry_run';
    }
    for (let k = 1; k <= times; k++) {
      if (k > 1) { menu = npcMenu((await this.npc.walk([...EXCHANGE.path], [57])).payload); this.npc.line(menu, step); }
      const before = { ...this.holdings.money! };
      this.log({ event: 'menu', option: step[0], label: line.label });
      // s2c/46 twice (Lượng − 50, then the money), then the notice "Bạn vừa nhận được …"; a refusal is a notice alone.
      const text = refusalText(await this.steps.ask(57, buildRequest(57, { option: step[0], ...AT }), [1256, 0], 'Đổi lượng', { refuse: false }));
      await sleep(this.settleMs);
      if (!EXCHANGE.done.test(text)) throw new Stop(`server từ chối: "${text}"${k > 1 ? ` (đã đổi ${k - 1} lần)` : ''}`);
      this.log({ event: 'result', task: 'Đổi lượng', ok: true, time: k, text, moneyBefore: before, moneyAfter: this.holdings.money });
    }
    return 'done';
  }
}

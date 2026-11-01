// The 14 NPC shops of M1 from the TS bot (docs/integration/nodejs/shop.md, docs/app/events/15-shops.md): c2s/13 to Lái
// Buôn or Bà Tư Hạnh, c2s/57 down to the shop (each label checked), s2c/1190 its lines, and with `confirm` c2s/1190
// (0, shopId, quantity) for each stack. No shop menu runs anything at once, so the last menu is left as it is.
import { buildRequest } from '../protocol/events.ts';
import type { Items } from '../protocol/items.ts';
import { NPC_MAP } from '../protocol/npc.ts';
import { LAI_BUON, MONEY_KEYS, MONEY_NAMES, SHOPS, type ShopKey } from '../protocol/shops.ts';
import { notice, shopList } from '../protocol/world.ts';
import { Holdings, Npc, Steps, Stop, refusalText, serverText, sleep, type Io, type Log } from './steps.ts';

export type Outcome = 'done' | 'dry_run';
export type ShopTask =
  | { kind: 'list'; shop: ShopKey }
  | { kind: 'buy'; shop: ShopKey; itemId: number; quantity: number; /** 0 Xu, 1 Xu khóa, 2 Lượng; default the shop's (Xu khóa in Dược phẩm). */ currency?: number };
export interface ShopOptions {
  items: Items;
  /** c2s/1190; without it the bot only opens the shop and says what it would buy. */
  confirm?: boolean;
  waitMs?: number;
  /** After the notice of a purchase, how long the bag and the money get (default 400 ms; with Lượng a s2c/46 comes after). */
  settleMs?: number;
  log?: Log;
}
type Line = ReturnType<typeof shopList>['items'][number];

export class ShopBot {
  readonly holdings = new Holdings();
  private readonly steps: Steps;
  private readonly items: Items;
  private readonly confirm: boolean;
  private readonly settleMs: number;
  private readonly log: Log;

  constructor(options: ShopOptions) {
    this.items = options.items;
    this.confirm = options.confirm ?? false;
    this.settleMs = options.settleMs ?? 400;
    this.log = options.log ?? (() => {});
    this.steps = new Steps(options.waitMs ?? 8000);
  }

  onPacket(op: number, payload: Buffer) {
    try {
      this.holdings.update(op, payload);
      if (op === 1256) this.log({ event: 'notice', text: notice(payload).text });
      else if (op === 0) this.log({ event: 'server_message', text: serverText(payload) });
    } catch (error) {
      this.log({ event: 'parse_error', opcode: op, reason: (error as Error).message, payloadHex: payload.toString('hex') });
    }
    this.steps.take(op, payload);
  }

  /** `mapId` is where the character stands: the shops answer in M1 only ("Không thể thực hiện" elsewhere, B1). */
  async run(task: ShopTask, io: Io, mapId: string | undefined): Promise<Outcome> {
    this.steps.io = io;
    if (mapId !== NPC_MAP) throw new Stop(`nhân vật đang ở ${mapId}; cửa hàng chỉ mở ở ${NPC_MAP} (Làng Thanh Khê)`);
    const shop = SHOPS[task.shop];
    const npc = new Npc(this.steps, { mapId: NPC_MAP, npcId: shop.npcId }, shop.npcId === LAI_BUON ? 'Lái Buôn' : 'Bà Tư Hạnh', this.log);
    const list = shopList((await npc.walk([...shop.path], [1190])).payload);
    if (list.kind !== shop.code) throw new Stop(`server mở cửa hàng ${list.kind} "${list.title}", không phải ${shop.code}`);
    this.log({ event: 'shop', shop: task.shop, title: list.title, lines: list.items.length, money: this.holdings.money, free: this.holdings.free() });
    if (task.kind === 'list') {
      for (const line of list.items) this.log({ event: 'line', ...this.view(line) });
      return 'done';
    }
    return this.buy(list.items, task);
  }

  private async buy(lines: Line[], t: Extract<ShopTask, { kind: 'buy' }>): Promise<Outcome> {
    const name = this.items.name(t.itemId), sold = lines.filter(l => l.itemId === t.itemId);
    if (!sold.length) throw new Stop(`${name} không bán ở cửa hàng này`);
    const pick = t.currency !== undefined ? sold.find(l => l.currency === t.currency) : sold.find(l => l.currency === 1) ?? sold[0];
    if (!pick) throw new Stop(`${name} không bán bằng ${MONEY_NAMES[t.currency!]} ở đây (có: ${sold.map(l => MONEY_NAMES[l.currency]).join(', ')})`);
    const stack = Math.max(this.items.get(t.itemId)?.stack ?? 1, 1), cost = pick.price * t.quantity, money = MONEY_KEYS[pick.currency];
    const have = this.holdings.money?.[money], slots = this.slotsFor(pick, t.quantity, stack), free = this.holdings.free();
    this.log({ event: 'plan', task: 'Mua', ...this.view(pick), quantity: t.quantity, perBuy: Math.min(t.quantity, stack), cost, have, slots, free,
      warning: pick.flag === 0 ? 'mua bằng Xu khóa: món bị khoá giao dịch, không bán ở Chợ trời được' : undefined });
    if (have === undefined || have < cost) throw new Stop(`thiếu ${MONEY_NAMES[pick.currency]}: cần ${cost}, có ${have ?? 'chưa biết'}`);
    if (slots > free) throw new Stop(`cần ${slots} ô trống, túi còn ${free}`);
    if (!this.confirm) {
      this.log({ event: 'dry_run', reason: 'chạy thử: thêm --confirm để mua' });
      return 'dry_run';
    }
    const before = { ...this.holdings.money! };
    // A stack at a time: items that do not stack one by one ("Số lượng không chính xác!" to more, J3).
    for (let left = t.quantity; left > 0;) {
      const chunk = Math.min(left, stack);
      // Bought: "Bạn vừa mua thành công! …" with the bag and the money around it. Refused: a notice alone.
      const text = refusalText(await this.steps.ask(1190, buildRequest(1190, { shopId: pick.shopId, quantity: chunk }), [1256, 0], `mua ${chunk} ${name}`, { refuse: false }));
      await sleep(this.settleMs);
      if (!/thành công/i.test(text)) throw new Stop(`server từ chối: "${text}"`);
      left -= chunk;
      this.log({ event: 'bought', text, quantity: chunk, left, inBag: this.count(t.itemId) });
    }
    this.log({ event: 'result', task: 'Mua', ok: true, item: name, quantity: t.quantity, moneyBefore: before, moneyAfter: this.holdings.money, inBag: this.count(t.itemId) });
    return 'done';
  }

  /** Bag slots `quantity` more of a line need: stacks of the same item and lock fill first. */
  private slotsFor(line: Line, quantity: number, stack: number) {
    if (stack <= 1) return quantity;
    const room = this.holdings.bag.filter(i => i.itemId === line.itemId && i.field1 === line.flag).reduce((n, i) => n + Math.max(0, stack - i.quantity), 0);
    return Math.max(0, Math.ceil((quantity - room) / stack));
  }

  private count(itemId: number) { return this.holdings.bag.filter(i => i.itemId === itemId).reduce((n, i) => n + i.quantity, 0); }

  /** A line of s2c/1190 for the logs. */
  private view(l: Line) {
    const def = this.items.get(l.itemId);
    return { shopId: l.shopId, itemId: l.itemId, item: this.items.name(l.itemId), level: def?.level, price: l.price, money: MONEY_NAMES[l.currency] ?? `tiền ${l.currency}`,
      locked: l.flag === 0, stats: l.ranges.length ? l.ranges.map(r => `${this.items.stat(r.stat, r.min)}…${r.max}`) : undefined };
  }
}

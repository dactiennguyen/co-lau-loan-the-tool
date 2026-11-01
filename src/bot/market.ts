// Chợ trời from the TS bot (docs/integration/nodejs/market.md, docs/app/events/14-npc.md#ngọc-nga), as the window of the
// phone's toolbar button opens it, from anywhere once in the world: c2s/116 for the tabs, c2s/1192 for each page (read
// only), and with `confirm` c2s/115 Mua, c2s/112 Đăng bán, c2s/113 Thu hồi. Never Gia hạn nor the other kind of c2s/112:
// neither is measured.
import { buildRequest } from '../protocol/events.ts';
import type { Items } from '../protocol/items.ts';
import * as m from '../protocol/market.ts';
import { notice } from '../protocol/world.ts';
import { Holdings, Steps, Stop, serverText, sleep, type Io, type ItemRecord, type Log } from './steps.ts';

export type Outcome = 'done' | 'dry_run';
export type MarketTask =
  | { kind: 'tabs' }
  | { kind: 'list'; tab: number; page?: number }
  | { kind: 'scan'; tab?: number; name?: string; maxPrice?: number; top?: number }
  | { kind: 'mine' }
  | { kind: 'buy'; uuid: string; maxPrice: number; tab?: number; page?: number }
  | { kind: 'sell'; slot: number; price: number; quantity?: number }
  | { kind: 'withdraw'; uuid: string };

export interface MarketOptions {
  items: Items;
  /** Mua, Đăng bán, Thu hồi; without it the bot only reads. */
  confirm?: boolean;
  waitMs?: number;
  /** After the answer to Mua, Đăng bán or Thu hồi, how long the packets with it get (default 400 ms). */
  settleMs?: number;
  log?: Log;
}

/** A listing with where it was read. */
export type Listing = m.MarketListing & { tab: number; page: number };
/** The lowest price, as far as known: one of the two 1000 of s2c/116 is likely it, and no listing was cheaper (CT1). */
export const MIN_PRICE = 1000;

export class MarketBot {
  readonly holdings = new Holdings();
  tabs?: ReturnType<typeof m.marketTabs>;
  /** Every listing read in this run. */
  readonly listings: Listing[] = [];
  private readonly steps: Steps;
  private readonly items: Items;
  private readonly confirm: boolean;
  private readonly settleMs: number;
  private readonly log: Log;
  private readonly notices: string[] = [];

  constructor(options: MarketOptions) {
    this.items = options.items;
    this.confirm = options.confirm ?? false;
    this.settleMs = options.settleMs ?? 400;
    this.log = options.log ?? (() => {});
    this.steps = new Steps(options.waitMs ?? 8000);
  }

  onPacket(op: number, payload: Buffer) {
    try {
      this.holdings.update(op, payload);
      if (op === 1256) { const text = notice(payload).text; this.notices.push(text); this.log({ event: 'notice', text }); }
      else if (op === 0) this.log({ event: 'server_message', text: serverText(payload) });
    } catch (error) {
      this.log({ event: 'parse_error', opcode: op, reason: (error as Error).message, payloadHex: payload.toString('hex') });
    }
    this.steps.take(op, payload);
  }

  async run(task: MarketTask, io: Io): Promise<Outcome> {
    this.steps.io = io;
    await this.openWindow();
    switch (task.kind) {
      case 'tabs': return 'done';
      case 'list': return this.list(task.tab, task.page ?? 1);
      case 'scan': return this.scan(task);
      case 'mine': return this.mine();
      case 'buy': return this.buy(task);
      case 'sell': return this.sell(task);
      case 'withdraw': return this.withdraw(task.uuid);
    }
  }

  /** c2s/116: the tabs and their listing counts, the fee and the highest price, as the window asks when it opens. */
  private async openWindow() {
    this.tabs = m.marketTabs((await this.steps.ask(116, buildRequest(116), [116], 'mục Chợ trời (c2s/116)', { refuse: false })).payload);
    const t = this.tabs;
    this.log({ event: 'tabs', tabs: t.tabs.map(x => `${x.tab} ${x.name} (${x.listings})`), fee: t.fee, hours: t.hours, maxPrice: t.maxPrice,
      money: this.holdings.money, free: this.holdings.free() });
  }

  /** c2s/1192: one page of a tab (MARKET_MINE_TAB for Đang bán). */
  private async page(tab: number, n: number) {
    const p = await this.steps.ask(1192, m.marketPageRequest(tab, n), [1192], `mục ${tab} trang ${n}`, { refuse: false });
    const page = m.market(p.payload);
    if (page.kind === m.MARKET_HELP) throw new Stop(`mục ${tab} trang ${n}: server trả lời giải thích "${page.text}"`);
    const listings = page.listings.map(l => ({ ...l, tab, page: n }));
    this.listings.push(...listings);
    this.log({ event: 'page', tab, name: page.kind === m.MARKET_LIST ? page.tabName : 'Đang bán', page: n, pages: page.pages, listings: listings.length });
    return { pages: page.pages, listings };
  }

  /** Every page of a tab, from `from`. */
  private async readTab(tab: number, from = 1) {
    const all: Listing[] = [];
    for (let n = from, pages = from; n <= pages; n++) {
      const p = await this.page(tab, n);
      pages = p.pages;
      all.push(...p.listings);
    }
    return all;
  }

  private async list(tab: number, n: number): Promise<Outcome> {
    for (const l of (await this.page(tab, n)).listings) this.log({ event: 'listing', ...this.view(l) });
    return 'done';
  }

  private async scan(t: Extract<MarketTask, { kind: 'scan' }>): Promise<Outcome> {
    const tabs = t.tab === undefined ? this.tabs!.tabs.map(x => x.tab) : [t.tab];
    const read: Listing[] = [], seen = new Set<string>();
    for (const tab of tabs) read.push(...await this.readTab(tab));
    // A listing put up while the pages are read pushes the others one place on: the last of a page comes again first on
    // the next one.
    const all = read.filter(l => !seen.has(l.uuid) && !!seen.add(l.uuid));
    const name = t.name?.toLowerCase();
    const hits = all.filter(l => (!name || this.items.name(l.itemId).toLowerCase().includes(name)) && (t.maxPrice === undefined || l.price <= t.maxPrice))
      .toSorted((a, b) => a.price - b.price);
    for (const l of hits.slice(0, t.top ?? 10)) this.log({ event: 'cheap', ...this.view(l) });
    this.log({ event: 'scanned', listings: all.length, matching: hits.length });
    return 'done';
  }

  private async mine(): Promise<Outcome> {
    const all = await this.readTab(m.MARKET_MINE_TAB);
    for (const l of all) this.log({ event: 'listing', ...this.view(l) });
    if (!all.length) this.log({ event: 'listing', text: 'chưa ký gửi vật phẩm nào' });
    return 'done';
  }

  /** The listing `uuid`: on the page given first, then in its tab, then in every tab. */
  private async find(uuid: string, tab?: number, page?: number) {
    const hit = () => this.listings.find(l => l.uuid === uuid);
    if (tab !== undefined && page !== undefined) await this.page(tab, page);
    if (!hit() && tab !== undefined) await this.readTab(tab);
    if (!hit() && tab === undefined) for (const x of this.tabs!.tabs) { await this.readTab(x.tab); if (hit()) break; }
    const l = hit();
    if (!l) throw new Stop(`không thấy món ${uuid} trên chợ${tab === undefined ? '' : ` (mục ${tab})`}: đã bán, hết hạn hay bị thu hồi`);
    return l;
  }

  private async buy(t: Extract<MarketTask, { kind: 'buy' }>): Promise<Outcome> {
    const l = await this.find(t.uuid, t.tab, t.page), xu = this.holdings.money?.xu, free = this.holdings.free();
    this.log({ event: 'plan', task: 'Mua', ...this.view(l), xu, free });
    if (l.price > t.maxPrice) throw new Stop(`giá ${l.price} Xu cao hơn --max-price=${t.maxPrice}`);
    if (xu === undefined || xu < l.price) throw new Stop(`thiếu Xu: cần ${l.price}, có ${xu ?? 'chưa biết'}`);
    if (free < 1) throw new Stop('túi không còn ô trống: server sẽ trả "Rương đã đầy"');
    if (!this.confirm) return this.dryRun();
    const before = new Set(this.holdings.bag.map(i => i.uuid)), moneyBefore = { ...this.holdings.money! };
    // Bought: s2c/46, s2c/115 (the same uuid), s2c/1187 (the bag). Refused: a notice alone.
    await this.steps.ask(115, m.marketBuyRequest(l.uuid), [115], `Mua ${this.items.name(l.itemId)}`);
    await sleep(this.settleMs);
    const got = this.holdings.bag.filter(i => !before.has(i.uuid));
    this.log({ event: 'result', task: 'Mua', ok: true, item: this.items.name(l.itemId), price: l.price, moneyBefore, moneyAfter: this.holdings.money,
      slots: got.map(i => i.slot) });
    return 'done';
  }

  private async sell(t: Extract<MarketTask, { kind: 'sell' }>): Promise<Outcome> {
    const item = this.holdings.bag.find(i => i.slot === t.slot), quantity = t.quantity ?? 1, tabs = this.tabs!;
    if (!item) throw new Stop(`ô túi ${t.slot} trống`);
    const name = this.describe(item);
    if (item.field1 === 0) throw new Stop(`${name} ở ô ${t.slot} đã khoá: không rao bán được`);
    if (quantity < 1 || quantity > item.quantity) throw new Stop(`${name} chỉ có ${item.quantity}, không bán ${quantity} được`);
    if (t.price < MIN_PRICE || t.price > tabs.maxPrice) throw new Stop(`giá phải từ ${MIN_PRICE} tới ${tabs.maxPrice} Xu`);
    const xu = this.holdings.money?.xu, cut = Math.floor(t.price * 0.05);
    this.log({ event: 'plan', task: 'Đăng bán', item: name, slot: t.slot, quantity, price: t.price, fee: tabs.fee, cut, net: t.price - cut, hours: tabs.hours, xu });
    if (xu === undefined || xu < tabs.fee) throw new Stop(`thiếu Xu cho phí đăng bán: cần ${tabs.fee}, có ${xu ?? 'chưa biết'}`);
    if (!this.confirm) return this.dryRun();
    const moneyBefore = { ...this.holdings.money! }, seen = this.notices.length;
    // Listed: s2c/46 (the fee), s2c/112, then the notice "Rao bán vật phẩm thành công".
    const a = m.marketListed((await this.steps.ask(112, m.marketSellRequest(t.slot, quantity, t.price), [112], `Đăng bán ${name}`)).payload);
    await sleep(this.settleMs);
    this.log({ event: 'result', task: 'Đăng bán', ok: true, item: name, slot: a.slot, quantity: a.quantity, price: t.price, notices: this.notices.slice(seen),
      moneyBefore, moneyAfter: this.holdings.money });
    return 'done';
  }

  private async withdraw(uuid: string): Promise<Outcome> {
    const l = (await this.readTab(m.MARKET_MINE_TAB)).find(x => x.uuid === uuid);
    if (!l) throw new Stop(`Đang bán không có món ${uuid}: đã bán, hết hạn hay đã thu hồi`);
    this.log({ event: 'plan', task: 'Thu hồi', ...this.view(l), free: this.holdings.free() });
    if (!this.confirm) return this.dryRun();
    const before = new Set(this.holdings.bag.map(i => i.uuid)), seen = this.notices.length;
    // Taken back: s2c/1187 (the bag), s2c/113 (the same uuid), then the notice "Đã nhận lại vật phẩm …".
    await this.steps.ask(113, m.marketWithdrawRequest(l.uuid), [113], `Thu hồi ${this.items.name(l.itemId)}`);
    await sleep(this.settleMs);
    const back = this.holdings.bag.filter(i => !before.has(i.uuid));
    this.log({ event: 'result', task: 'Thu hồi', ok: true, item: this.items.name(l.itemId), slots: back.map(i => i.slot), notices: this.notices.slice(seen) });
    return 'done';
  }

  private dryRun(): Outcome {
    this.log({ event: 'dry_run', reason: 'chạy thử: thêm --confirm để làm' });
    return 'dry_run';
  }

  /** A listing for the logs: the item with its stats, quality, price, seller, time left, where, and its uuid. */
  view(l: Listing, now = Date.now()) {
    const left = Math.max(0, l.expiresAt - now), h = Math.floor(left / 3_600_000), min = Math.floor(left / 60_000) % 60;
    return { item: this.items.describe({ itemId: l.itemId, quantity: l.quantity, stats: l.stats }), quality: m.MARKET_QUALITY[l.quality],
      level: this.items.get(l.itemId)?.level, price: l.price, seller: l.seller, left: `${h}h${String(min).padStart(2, '0')}`, tab: l.tab, page: l.page, uuid: l.uuid };
  }

  private describe(i: ItemRecord) { return this.items.describe(i); }
}

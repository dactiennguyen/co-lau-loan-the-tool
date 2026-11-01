// Pháp sư (NPC 161 of M1) step by step as the game does (docs/integration/nodejs/smith.md, docs/app/events/16-upgrade.md):
// c2s/13 to the NPC, c2s/57 down its menus (only lines of the menu just received), the window (s2c/96, s2c/99), c2s/97 for
// each item put in and the price and odds of each answer, and Bắt đầu (c2s/91) only with `confirm`. Without it nothing
// is spent: putting items in is free and a window opened again is empty. The server sends no bag after Bắt đầu, so the
// bot asks for it (c2s/42) before the next step.
import { buildRequest } from '../protocol/events.ts';
import { ITEM_ELEMENTS, type Items } from '../protocol/items.ts';
import * as npc from '../protocol/npc.ts';
import { notice, npcMenu } from '../protocol/world.ts';
import { Holdings, Npc, Steps, Stop, refusalText, serverText, sleep, type Io, type Step } from './steps.ts';

type Item = npc.ItemRecord;

/** Why a Pháp sư task ended before its end: the reason is for the user, in the words of the logs. */
export class SmithStop extends Stop {}

export interface UpgradeTask {
  /** Bag slot of the item. */
  slot: number;
  /** The level to reach (default one more), never above the cap of the item's tier. */
  to?: number;
  careful?: boolean;
  /** Bắt đầu only at this rate or more (default 100). */
  rate?: number;
  /** auto: a charm on every upgrade a failure would lose levels on; never: none. */
  charm?: 'auto' | 'never';
  /** Bắt đầu at most this many times. Without it the first failure ends the task. */
  tries?: number;
  /** Only stones already trade-locked. */
  lockedStones?: boolean;
}
export type SmithTask =
  | { kind: 'bag' }
  | ({ kind: 'quote' } & UpgradeTask)
  | ({ kind: 'upgrade' } & UpgradeTask)
  | ({ kind: 'merge' } & npc.MergeOptions)
  | { kind: 'separate'; slot: number }
  | { kind: 'transmute'; source: number; target: number }
  | { kind: 'craft'; itemKind: number; tier: number }
  | { kind: 'ice'; bottles: 1 | 5 | 'all' };
export type Outcome = 'done' | 'dry_run';

export interface SmithOptions {
  items: Items;
  /** Press Bắt đầu (and pick the line of Đổi Băng Tâm); without it the bot stops right before. */
  confirm?: boolean;
  /** How long each answer may take (default 8 s; the server answers within about 40 ms). */
  waitMs?: number;
  /** After the answer to Bắt đầu, how long the packets that follow it get (s2c/1258, s2c/46, s2c/1187; default 400 ms). */
  settleMs?: number;
  log?: (event: Record<string, unknown>) => void;
}

/** What one Nâng cấp will put in and what the window said after the last stone. */
interface UpgradePlan { quote: npc.Quote; stones: Item[]; charm?: Item }

const AT = { mapId: npc.NPC_MAP, npcId: npc.SMITH };
/** The lines to pick from Pháp sư's first menu, with the label each must have (16-upgrade.md#cửa-sổ, O1). */
const PATHS = {
  upgrade: (careful: boolean): Step[] => [[0, /^Nâng cấp$/], careful ? [1, /^Nâng cấp \[Cẩn thận\]$/] : [0, /^Nâng cấp \[Thường\]$/]],
  transmute: [[0, /^Nâng cấp$/], [2, /^Chuyển hoá trang bị$/]] as Step[],
  separate: [[2, /^Tách đá$/]] as Step[],
  mergeXu: [[1, /^Luyện đá$/], [1, /^Luyện đá \[Xu\]$/]] as Step[],
  mergeXuKhoa: [[1, /^Luyện đá$/], [0, /^Luyện đá \[Xu khóa\]$/]] as Step[],
  craft: (kind: number): Step[] => [[3, /^Chế tạo$/], [1, /^Chế tạo trang bị$/], [kind, new RegExp(`^${npc.CRAFT_LABELS[kind]}$`)]],
  ice: [[3, /^Chế tạo$/], [3, /^Đổi Băng Tâm/]] as Step[],
};

export class SmithBot {
  /** The bag (s2c/42, s2c/1187) and the money (s2c/46) as they came last; the session hands every packet from the login on. */
  readonly holdings = new Holdings();
  get bag(): Item[] { return this.holdings.bag; }
  get money() { return this.holdings.money; }
  character = { name: '', level: 0 };
  private readonly steps: Steps;
  private readonly npc: Npc;
  private readonly items: Items;
  private readonly confirm: boolean;
  private readonly settleMs: number;
  private readonly log: (event: Record<string, unknown>) => void;
  private nameIds?: Map<string, number>;

  constructor(options: SmithOptions) {
    this.items = options.items;
    this.confirm = options.confirm ?? false;
    this.settleMs = options.settleMs ?? 400;
    this.log = options.log ?? (() => {});
    this.steps = new Steps(options.waitMs ?? 8000);
    this.npc = new Npc(this.steps, AT, 'Pháp sư', this.log);
  }

  onPacket(op: number, payload: Buffer) {
    try {
      if (this.holdings.update(op, payload)) { /* the bag or the money */ }
      else if (op === 1256) this.log({ event: 'notice', text: notice(payload).text });
      else if (op === 0) this.log({ event: 'server_message', text: serverText(payload) });
    } catch (error) {
      this.log({ event: 'parse_error', opcode: op, reason: (error as Error).message, payloadHex: payload.toString('hex') });
    }
    this.steps.take(op, payload);
  }

  /** Runs one task. Ends with 'done', or 'dry_run' when it stopped before Bắt đầu for want of `confirm`; throws SmithStop
   * with the reason otherwise. */
  async run(task: SmithTask, io: Io): Promise<Outcome> {
    this.steps.io = io;
    switch (task.kind) {
      case 'bag': return 'done';
      case 'quote': return this.upgrade(task, true);
      case 'upgrade': return this.upgrade(task, false);
      case 'merge': return this.merge(task);
      case 'separate': return this.separate(task.slot);
      case 'transmute': return this.transmute(task.source, task.target);
      case 'craft': return this.craft(task.itemKind, task.tier);
      case 'ice': return this.ice(task.bottles);
    }
  }

  /** The bag by kind, for the log: stones by level and lock, gear with its level, charms, materials. */
  summary() {
    const stones: Record<string, number> = {}, gear = [], charms = [], materials = [];
    for (const i of this.bag.toSorted((a, b) => a.slot - b.slot)) {
      const def = this.items.get(i.itemId), level = npc.stoneLevel(i.itemId);
      if (level) { const key = `Đá ${level}${i.field1 === 0 ? ' khoá' : ''}`; stones[key] = (stones[key] ?? 0) + 1; }
      else if (npc.isGear(def)) gear.push({ slot: i.slot, name: def!.name, plus: i.field0, locked: i.field1 === 0, tier: def!.level, cap: npc.itemCap(def!) });
      else if (npc.CHARMS.some(c => c.itemId === i.itemId)) charms.push({ slot: i.slot, name: def?.name, quantity: i.quantity });
      else if (def?.type === 22) materials.push({ slot: i.slot, name: def.name, quantity: i.quantity });
    }
    return { money: this.money, capacity: this.holdings.capacity, free: this.free(), stones, gear, charms, materials };
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Nâng cấp and Hỏi giá.

  private async upgrade(t: UpgradeTask, quoteOnly: boolean): Promise<Outcome> {
    let item = this.slot(t.slot);
    const def = this.items.get(item.itemId);
    if (!npc.isGear(def)) throw new SmithStop(`${this.describe(item)} ở ô ${t.slot} không phải trang bị`);
    const cap = npc.itemCap(def!), to = Math.min(t.to ?? item.field0 + 1, cap);
    if (item.field0 >= to) throw new SmithStop(`${this.describe(item)} đã +${item.field0}${item.field0 >= cap ? ` (trần của đồ bậc ${def!.level} là +${cap})` : ''}`);
    const rate = t.rate ?? 100, tries = t.tries ?? to - item.field0;
    let presses = 0;
    while (item.field0 < to) {
      if (presses >= tries) throw new SmithStop(`đã bấm ${presses} lần (--tries=${tries}), ${this.describe(item)}`);
      const plan = await this.prepare(item, t, rate, quoteOnly);
      if (quoteOnly) return 'done';
      if (!this.confirm) return this.dryRun();
      const from = item.field0, moneyBefore = this.money && { ...this.money };
      const r = npc.serviceResult((await this.start([91], 'kết quả Nâng cấp')).payload);
      presses++;
      await this.refresh();
      const now = this.bag.find(i => i.uuid === item.uuid);
      const charmLeft = plan.charm ? (r.received.find(i => i.itemId === plan.charm!.itemId)?.quantity ?? 0) : undefined;
      this.log({ event: 'result', task: 'Nâng cấp', ok: r.ok, item: this.items.name(item.itemId), from, to: now?.field0 ?? r.item.field0, charmLeft, moneyBefore, moneyAfter: this.money });
      if (!now) throw new SmithStop(`không thấy ${this.items.name(item.itemId)} trong túi sau khi nâng`);
      item = now;
      // Without --tries a failure ends the task: the next press would spend the fee, the stones and a charm again.
      if (!r.ok && t.tries === undefined) throw new SmithStop(`Nâng cấp thất bại, ${this.describe(item)}; thêm --tries=N để bấm tiếp sau khi thất bại`);
    }
    return 'done';
  }

  /** Opens Nâng cấp, puts the item, a charm when a failure would lose levels, and the stones one by one, cheapest first,
   * until the rate asked. The server takes every stone put in: when the rate stops short of it and some stones did not
   * raise it (the cap), the window is opened again with only the stones that did. Checks the money; logs the plan. */
  private async prepare(item: Item, t: UpgradeTask, rate: number, quoteOnly: boolean, only?: Item[]): Promise<UpgradePlan> {
    const level = item.field0;
    await this.window(PATHS.upgrade(!!t.careful), 96);
    const gear = npc.serviceSlot((await this.put(item, [90])).payload);
    this.log({ event: 'put', what: 'trang bị', slot: item.slot, item: this.describe(item), text: gear.text, ready: gear.ready });
    let charm: Item | undefined;
    if (npc.charmUseful(level) && t.charm !== 'never') {
      charm = npc.charmFor(this.bag, level);
      if (!charm) throw new SmithStop(`thất bại ở +${level} sẽ tụt về +${npc.failLevel(level)}: cần Bùa bảo vệ (sơ cấp tới +8, trung cấp tới +12, cao cấp tới +14, siêu cấp tới +16); thêm --charm=never để nâng không bùa`);
      const a = npc.serviceSlot((await this.put(charm, [90], { kind: npc.PUT_STACK })).payload);
      this.log({ event: 'put', what: 'bùa', slot: charm.slot, item: this.describe(charm), text: a.text, ready: a.ready });
    } else if (npc.charmUseful(level)) this.log({ event: 'warning', text: `không dùng bùa: thất bại sẽ tụt +${level} về +${npc.failLevel(level)}` });
    const stones = only ?? npc.upgradeStones(this.bag, { unlocked: !t.lockedStones }).slice(0, charm ? 17 : 18);
    if (!stones.length) throw new SmithStop(`túi không có đá nâng cấp${t.lockedStones ? ' đã khoá' : ''}`);
    const placed: Item[] = [], useful: Item[] = [];
    let q: npc.Quote | undefined;
    for (const stone of stones) {
      const a = npc.serviceSlot((await this.put(stone, [90])).payload), next = npc.quote(a.text);
      this.log({ event: 'put', what: 'đá', slot: stone.slot, item: this.describe(stone), rate: next.rate, fee: next.fee?.amount, luong: next.luong, ready: a.ready });
      if (only || (next.rate ?? 0) > (q?.rate ?? 0)) useful.push(stone);
      placed.push(stone);
      q = next;
      if (!only && (q.rate ?? 0) >= rate) break;
    }
    // Hỏi giá short of the rate asked (the cap, or out of stones): the stones that did not raise the whole-number rate
    // would be wasted, so the price is that of the others, with the window opened again. Nâng cấp stops below the rate
    // anyway, and once the rate is reached the loop ended on a stone that raised it.
    if (quoteOnly && !only && (q?.rate ?? 0) < rate && useful.length && useful.length < placed.length) {
      this.log({ event: 'reopen', text: `${placed.length - useful.length} viên không làm tỉ lệ tăng: mở lại cửa sổ với ${useful.length} viên` });
      const fewer = await this.prepare(item, t, rate, quoteOnly, useful);
      // A stone may add less than 1%: two of them raise the rate together and neither alone.
      if ((fewer.quote.rate ?? 0) < (q?.rate ?? 0)) this.log({ event: 'warning', text: `bỏ ${placed.length - useful.length} viên thì tỉ lệ còn ${fewer.quote.rate}% thay vì ${q?.rate}%: các viên đó cộng lại vẫn có ích` });
      return fewer;
    }
    const plan: UpgradePlan = { quote: q!, stones: placed, charm };
    this.log({ event: 'plan', task: quoteOnly ? 'Hỏi giá' : 'Nâng cấp', item: this.items.name(item.itemId), from: level, to: level + 1, mode: t.careful ? 'Cẩn thận' : 'Thường',
      rate: q!.rate, fee: q!.fee, luong: q!.luong, stones: plan.stones.map(s => this.describe(s)), charm: charm && this.describe(charm),
      onFail: charm || !npc.charmUseful(level) ? `giữ +${level}` : `tụt về +${npc.failLevel(level)}` });
    if (quoteOnly) return plan;
    if ((q!.rate ?? 0) < rate) throw new SmithStop(`tỉ lệ cao nhất ${q!.rate}% thấp hơn --rate=${rate}`);
    this.checkMoney(q!.fee, q!.luong);
    return plan;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Gộp đá, Tách đá, Chuyển hoá.

  /** Gộp đá: sets of 4 of a level, lowest first, again on the stones made; only `level` (one level up) and only `locked`
   * if given, at most `sets` merges. */
  private async merge(o: npc.MergeOptions): Promise<Outcome> {
    const options = { upTo: o.upTo ?? 12, unlocked: o.unlocked ?? true, level: o.level, locked: o.locked, sets: o.sets };
    const forecast = npc.mergeForecast(this.bag, options);
    this.log({ event: 'plan', task: 'Gộp đá', ...options, ...forecast });
    if (!forecast.merges) throw new SmithStop('không có bộ 4 viên cùng cấp, cùng loại khoá nào để luyện');
    for (let done = 0; ;) {
      const set = done < (options.sets ?? Infinity) ? npc.mergePlan(this.bag, options)[0] : undefined;
      if (!set) return 'done';
      await this.window(set.window === 'mergeXu' ? PATHS.mergeXu : PATHS.mergeXuKhoa, 99);
      let last: ReturnType<typeof npc.stoneSlot> | undefined;
      for (const slot of set.slots) {
        const stone = this.slot(slot);
        last = npc.stoneSlot((await this.put(stone, [92])).payload);
        this.log({ event: 'put', what: 'đá', slot, item: this.describe(stone), text: last.text, ready: last.ready });
      }
      const q = npc.quote(last!.text);
      if (q.rate !== 100 || q.stone?.level !== set.level + 1) throw new SmithStop(`Luyện đá báo "${last!.text}", không phải Đá cấp ${set.level + 1} với 100%`);
      this.checkMoney(q.fee);
      if (!this.confirm) return this.dryRun();
      const r = npc.stoneResult((await this.start([93], 'kết quả Luyện đá')).payload);
      await this.refresh();
      done++;
      this.log({ event: 'result', task: 'Gộp đá', ok: r.ok, made: r.items.map(i => this.describe(i)), fee: q.fee, done, moneyAfter: this.money });
      if (!r.ok) throw new SmithStop('Luyện đá thất bại dù báo 100%');
    }
  }

  private async separate(slot: number): Promise<Outcome> {
    const item = this.slot(slot);
    if (!npc.isGear(this.items.get(item.itemId)) || item.field0 < 1) throw new SmithStop(`${this.describe(item)} chưa nâng cấp, không tách được`);
    await this.window(PATHS.separate, 96);
    const a = npc.serviceSlot((await this.put(item, [90])).payload), gain = npc.quote(a.text).gain;
    this.log({ event: 'put', what: 'trang bị', slot, item: this.describe(item), text: a.text, ready: a.ready });
    if (!a.ready) throw new SmithStop(a.text);
    const need = gain.reduce((n, g) => n + g.quantity, 0);
    this.log({ event: 'plan', task: 'Tách đá', item: this.describe(item), gain, free: this.free() });
    if (this.free() < need) throw new SmithStop(`cần ${need} ô trống cho số đá nhận, túi còn ${this.free()}`);
    if (!this.confirm) return this.dryRun();
    const r = npc.serviceResult((await this.start([91], 'kết quả Tách đá')).payload);
    await this.refresh();
    this.log({ event: 'result', task: 'Tách đá', ok: r.ok, item: this.describe(r.item), received: r.received.map(i => this.describe(i)) });
    return 'done';
  }

  private async transmute(sourceSlot: number, targetSlot: number): Promise<Outcome> {
    const source = this.slot(sourceSlot), target = this.slot(targetSlot);
    const def = (id: number) => { const d = this.items.get(id); return d && { type: d.type, level: d.level }; };
    if (!npc.transmuteTargets(this.bag, source, def).some(i => i.slot === target.slot)) {
      throw new SmithStop(`${this.describe(target)} không nhận được cấp của ${this.describe(source)}: nguồn phải từ +1, đích +0 cùng loại, bậc bằng hoặc cao hơn và nâng được tới +${source.field0}`);
    }
    const tool = npc.transmuteItem(this.bag, source.field0);
    if (!tool) throw new SmithStop(`cần vật phẩm Chuyển hoá cho +${source.field0} (sơ cấp tới +10, trung cấp tới +13, cao cấp tới +16)`);
    await this.window(PATHS.transmute, 96);
    const a = npc.serviceSlot((await this.put(source, [90])).payload);
    this.log({ event: 'put', what: 'nguồn', slot: source.slot, item: this.describe(source), text: a.text });
    const b = npc.transmuteTarget((await this.put(target, [1260])).payload);
    this.log({ event: 'put', what: 'đích', slot: target.slot, item: this.describe(target), text: b.text });
    const c = npc.serviceSlot((await this.put(tool, [90])).payload);
    this.log({ event: 'put', what: 'vật phẩm', slot: tool.slot, item: this.describe(tool), text: c.text, ready: c.ready });
    if (!c.ready) throw new SmithStop(c.text);
    this.log({ event: 'plan', task: 'Chuyển hoá', source: this.describe(source), target: this.describe(target), tool: this.describe(tool) });
    if (!this.confirm) return this.dryRun();
    const r = npc.serviceResult((await this.start([91], 'kết quả Chuyển hoá')).payload);
    await this.refresh();
    this.log({ event: 'result', task: 'Chuyển hoá', ok: r.ok, source: this.describe(r.item), target: r.target && this.describe(r.target) });
    return 'done';
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Chế tạo trang bị and Đổi Băng Tâm (O1).

  private async craft(kind: number, tier: number): Promise<Outcome> {
    const menu = npcMenu((await this.npc.walk(PATHS.craft(kind), [57])).payload);
    this.log({ event: 'menu', text: menu.text });
    const recipe = npc.recipes(menu).find(r => r.tier === tier);
    if (!recipe) throw new SmithStop(`menu không có công thức Bậc ${tier}: "${menu.text}"`);
    const { puts, missing } = npc.craftMaterials(this.bag, recipe, name => this.idOf(name));
    this.log({ event: 'plan', task: 'Chế tạo', item: `${npc.CRAFT_LABELS[kind]} Bậc ${tier}`, level: recipe.level, xu: recipe.xu,
      materials: puts.map(p => `${p.name} ${p.count} (ô ${p.item.slot}, có ${p.item.quantity})`) });
    const problems = [
      ...(this.character.level < recipe.level ? [`cần cấp ${recipe.level}, nhân vật cấp ${this.character.level}`] : []),
      ...missing.map(m => `thiếu ${m}`),
      ...((this.money?.xu ?? 0) < recipe.xu ? [`thiếu Xu: cần ${recipe.xu}, có ${this.money?.xu ?? 0}`] : []),
      ...(this.free() < 1 ? ['túi không còn ô trống cho món mới'] : []),
    ];
    if (problems.length) throw new SmithStop(problems.join('; '));
    const w = npc.craftWindow((await this.npc.pick(menu, [recipe.option, /^Bậc [IV]+ \(Lv \d+\)$/], [99])).payload);
    this.log({ event: 'window', title: w.title, key: w.key, slots: w.slots, prompt: w.prompt });
    let last: ReturnType<typeof npc.craftSlot> | undefined;
    for (const p of puts) {
      last = npc.craftSlot((await this.put(p.item, [92], { quantity: p.item.quantity, kind: npc.PUT_STACK })).payload);
      this.log({ event: 'put', what: 'nguyên liệu', slot: p.item.slot, item: this.describe(p.item), fee: last.fee, ready: last.ready });
    }
    if (!last?.ready) throw new SmithStop(last?.text ?? 'chưa đặt được nguyên liệu');
    if (!this.confirm) return this.dryRun();
    const before = new Set(this.bag.map(i => i.uuid)), xu = this.money?.xu;
    const r = npc.stoneResult((await this.start([93], 'kết quả Chế tạo')).payload);
    await this.refresh();
    const made = this.bag.filter(i => !before.has(i.uuid));
    this.log({ event: 'result', task: 'Chế tạo', ok: r.ok, made: made.map(i => `${this.items.describe(i)}, hệ ${ITEM_ELEMENTS[i.element] ?? i.element}, ô ${i.slot}`),
      left: r.items.map(i => this.describe(i)), xuBefore: xu, xuAfter: this.money?.xu });
    return 'done';
  }

  private async ice(bottles: 1 | 5 | 'all'): Promise<Outcome> {
    let text: string;
    try {
      const menu = npcMenu((await this.npc.walk(PATHS.ice, [57])).payload);
      const held = npc.iceHeld(menu.text) ?? this.count(npc.ICE.iceId);
      const want = bottles === 'all' ? Math.floor(held / npc.ICE.perBottle) : bottles, need = Math.max(want, 1) * npc.ICE.perBottle;
      this.log({ event: 'plan', task: 'Đổi Băng Tâm', text: menu.text, held, bottles: want, ice: want * npc.ICE.perBottle });
      if (held < need) throw new SmithStop(`cần ${need} Băng Tâm, có ${held}`);
      if (!this.bag.some(i => i.itemId === npc.ICE.bottleId) && this.free() < 1) throw new SmithStop('túi không còn ô trống cho bình');
      if (!this.confirm) return this.dryRun();
      const option = npc.ICE.options[bottles], line = this.npc.line(menu, [option, /^Đổi /]);
      this.log({ event: 'menu', option, label: line.label });
      // The answer is a notice either way: "Đã đổi …" or why not.
      text = refusalText(await this.steps.ask(57, buildRequest(57, { option, ...AT }), [1256, 0], 'kết quả Đổi Băng Tâm', { refuse: false }));
      await sleep(this.settleMs);
      await this.refresh();
    } finally {
      // The server exchanges on a c2s/57 line 0 while this menu is its last, whatever ended the task: leave the first
      // menu as the last one.
      await this.npc.talk().catch(() => undefined);
    }
    if (!/^Đã đổi/.test(text)) throw new SmithStop(`server từ chối: "${text}"`);
    this.log({ event: 'result', task: 'Đổi Băng Tâm', ok: true, text, ice: this.count(npc.ICE.iceId), bottles: this.count(npc.ICE.bottleId) });
    return 'done';
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Steps.

  private async window(path: Step[], op: 96 | 99) {
    const p = await this.npc.walk(path, [op]), w = op === 96 ? npc.serviceWindow(p.payload) : npc.craftWindow(p.payload);
    this.log({ event: 'window', title: w.title, key: w.key, slots: w.slots });
    return w;
  }

  private put(item: Item, ops: number[], { quantity = 1, kind = npc.PUT_ITEM } = {}) {
    return this.steps.ask(97, npc.putRequest(item.slot, quantity, kind), ops, `đặt ${this.describe(item)} (ô ${item.slot})`);
  }

  /** Bắt đầu, then a moment for the packets after its answer. */
  private async start(ops: number[], what: string) {
    this.log({ event: 'start', what });
    const p = await this.steps.ask(91, npc.startRequest(), ops, what);
    await sleep(this.settleMs);
    return p;
  }

  /** c2s/42: the whole bag again (s2c/42), since Bắt đầu sends none. A notice that comes meanwhile (the "Bạn vừa nhận
   * được …" of Chế tạo) is no refusal here. */
  private async refresh() {
    await this.steps.ask(42, buildRequest(42, { characterName: this.character.name }), [42], 'túi (c2s/42)', { refuse: false });
  }

  private dryRun(): Outcome {
    this.log({ event: 'dry_run', reason: 'chạy thử: thêm --confirm để bấm' });
    return 'dry_run';
  }

  /** The fee may come from Xu khóa and then Xu ("không đủ sẽ sử dụng cả Xu"), or from Xu alone in Luyện đá [Xu]. */
  private checkMoney(fee: npc.Quote['fee'], luong = 0) {
    const m = this.money;
    if (!m) throw new SmithStop('chưa biết số tiền (chưa có s2c/46)');
    if (fee) {
      const have = fee.money === 'xu' ? m.xu : m.xuKhoa + m.xu;
      if (fee.amount > have) throw new SmithStop(`thiếu ${fee.money === 'xu' ? 'Xu' : 'Xu khóa'}: cần ${fee.amount}, có ${have}`);
    }
    if (luong > m.luong) throw new SmithStop(`thiếu Lượng: cần ${luong}, có ${m.luong}`);
  }

  private slot(slot: number) {
    const item = this.bag.find(i => i.slot === slot);
    if (!item) throw new SmithStop(`ô túi ${slot} trống`);
    return item;
  }
  private free() { return this.holdings.free(); }
  private count(itemId: number) { return this.bag.filter(i => i.itemId === itemId).reduce((n, i) => n + i.quantity, 0); }
  private describe(i: { itemId: number; field0: number; quantity: number; field1?: number }) {
    return `${this.items.name(i.itemId)}${i.field0 ? ` +${i.field0}` : ''}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`;
  }
  private idOf(name: string) {
    this.nameIds ??= new Map(this.items.book.items.filter(i => i.type === 22).map(i => [i.name, i.id]));
    return this.nameIds.get(name);
  }
}

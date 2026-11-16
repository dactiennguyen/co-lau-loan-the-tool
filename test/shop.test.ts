import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest } from '../src/protocol/events.ts';
import { Items } from '../src/protocol/items.ts';
import { EXCHANGE, SHOPS, pointsText } from '../src/protocol/shops.ts';
import { ShopBot, type ShopTask } from '../src/bot/shop.ts';
import { ElderBot, type ElderTask } from '../src/bot/elder.ts';
import { Stop } from '../src/bot/steps.ts';
import { npcPackets as N } from './fixtures-npc.ts';
import { g1Packets as G } from './fixtures-g1.ts';
import { bag42, menuPacket, money46, noticePacket, scripted, type BagEntry, type Expect } from './support/packets.ts';

const items = Items.load();
const hex = (s: string) => Buffer.from(s, 'hex');
const BA_TU = 'Bà Tư Hạnh', LAI = 'Lái Buôn';
const talk = (npcId: number, reply: Buffer): Expect => ({ op: 13, hex: buildRequest(13, { mapId: 'M1', npcId }).toString('hex'), reply: [[57, reply]] });
const pick = (npcId: number, option: number, reply: [number, Buffer][]): Expect => ({ op: 57, hex: buildRequest(57, { option, mapId: 'M1', npcId }).toString('hex'), reply });
const baTuRoot = menuPacket(BA_TU, 'Nếu con cần mua trang phục hãy tới tìm ta.', [[0, 'Nón'], [1, 'Giáp'], [2, 'Nhẫn']]);
const ringsMenu = menuPacket(BA_TU, 'Nếu con cần mua trang phục hãy tới tìm ta.', [[0, 'Nhẫn\n[Xu]'], [1, 'Nhẫn\n[Xu khóa]']]);
const laiRoot = menuPacket(LAI, 'Ở chỗ ta có rất nhiều món đồ tốt.', [[0, 'Vũ khí'], [1, 'Dược phẩm'], [2, 'Cửa hàng [Lượng]']]);
const openRings = (): Expect[] => [talk(103, baTuRoot), pick(103, 2, [[57, ringsMenu]]), pick(103, 0, [[1190, hex(N['s2c/1190 Nhẫn [Xu]'])]])];
const openLuong = (): Expect[] => [talk(106, laiRoot), pick(106, 2, [[1190, hex(N['s2c/1190 Cửa hàng [Lượng]'])]])];

async function shopBot(task: ShopTask, script: Expect[], { bag = [] as BagEntry[], capacity = 42, money = money46(13_755_900, 5_000_000, 16_638), confirm = false, mapId = 'M1' } = {}) {
  const logs: Record<string, any>[] = [];
  const bot = new ShopBot({ items, confirm, waitMs: 300, settleMs: 5, log: e => logs.push(e) });
  bot.onPacket(42, bag42(bag, capacity));
  bot.onPacket(46, money);
  const s = scripted(script, (op, p) => bot.onPacket(op, p));
  let outcome: string | undefined, stop: string | undefined;
  try { outcome = await bot.run(task, s.io, mapId); } catch (error) { if (!(error instanceof Stop)) throw error; stop = error.message; }
  return { ...s, outcome, stop, logs };
}

test('the 14 shops: codes 0–13 once each, two NPCs, every path checked label by label', () => {
  assert.deepEqual(Object.values(SHOPS).map(s => s.code).toSorted((a, b) => a - b), [...Array(14).keys()]);
  assert.ok(SHOPS['nhan-khoa'].path[1][1].test('Nhẫn\n[Xu khóa]') && !SHOPS['nhan-khoa'].path[1][1].test('Nhẫn\n[Xu]'));
});

test('a shop is opened down its menu, each label checked; the list is logged; outside M1 nothing is sent', async () => {
  const list = await shopBot({ kind: 'list', shop: 'nhan-xu' }, openRings());
  assert.deepEqual([list.errors, list.left.length, list.outcome], [[], 0, 'done']);
  assert.equal(list.logs.filter(e => e.event === 'line').length, 12);
  assert.deepEqual((({ shopId, item, price, money, locked }) => ({ shopId, item, price, money, locked }))(list.logs.find(e => e.event === 'line')!),
    { shopId: 391, item: 'Nhẫn Trơn', price: 300, money: 'Xu', locked: false });
  const wrong = await shopBot({ kind: 'list', shop: 'nhan-xu' }, [talk(103, baTuRoot), pick(103, 2, [[57, menuPacket(BA_TU, '', [[0, 'Nhẫn\n[Xu khóa]']])]])]);
  assert.match(wrong.stop!, /không có dòng 0/);
  const away = await shopBot({ kind: 'list', shop: 'nhan-xu' }, [], { mapId: 'M2' });
  assert.deepEqual([away.sent.length, /chỉ mở ở M1/.test(away.stop!)], [0, true]);
});

test('Mua: dry run stops before c2s/1190; --confirm sends (0, shopId, quantity) and waits for the notice', async () => {
  const dry = await shopBot({ kind: 'buy', shop: 'nhan-xu', itemId: 306, quantity: 1 }, openRings());
  assert.deepEqual([dry.errors, dry.left.length, dry.outcome], [[], 0, 'dry_run']);
  assert.deepEqual((({ cost, slots, money }) => ({ cost, slots, money }))(dry.logs.find(e => e.event === 'plan')!), { cost: 300, slots: 1, money: 'Xu' });
  const after = bag42([{ slot: 0, itemId: 306 }]);
  const buy = await shopBot({ kind: 'buy', shop: 'nhan-xu', itemId: 306, quantity: 1 }, [...openRings(),
    { op: 1190, hex: buildRequest(1190, { shopId: 391, quantity: 1 }).toString('hex'), reply: [[1256, noticePacket('Bạn vừa mua thành công! 1 Nhẫn Trơn')], [42, after], [46, money46(13_755_600, 5_000_000, 16_638)]] }],
  { confirm: true });
  assert.deepEqual([buy.errors, buy.left.length, buy.stop, buy.outcome], [[], 0, undefined, 'done']);
  const result = buy.logs.find(e => e.event === 'result')!;
  assert.deepEqual([result.moneyAfter.xu, result.inBag], [13_755_600, 1]);
});

test('items that do not stack go one c2s/1190 each; stackable ones need no slot when the stack in the bag has room', async () => {
  const plan = (x: { logs: Record<string, any>[] }) => (({ perBuy, slots }) => ({ perBuy, slots }))(x.logs.find(e => e.event === 'plan')!);
  // Bùa bảo vệ trung cấp stacks to 999: one request, one slot; so does Đá cấp 6 since table 29 (14/11; one slot each
  // under table 18). Nhẫn Trơn does not stack: one request and one slot each.
  assert.deepEqual(plan(await shopBot({ kind: 'buy', shop: 'luong', itemId: 36, quantity: 2 }, openLuong())), { perBuy: 2, slots: 1 });
  assert.deepEqual(plan(await shopBot({ kind: 'buy', shop: 'luong', itemId: 416, quantity: 2 }, openLuong())), { perBuy: 2, slots: 1 });
  assert.deepEqual(plan(await shopBot({ kind: 'buy', shop: 'nhan-xu', itemId: 306, quantity: 2 }, openRings())), { perBuy: 1, slots: 2 });
  assert.deepEqual(plan(await shopBot({ kind: 'buy', shop: 'luong', itemId: 35, quantity: 5 }, openLuong(), { bag: [{ slot: 4, itemId: 35, quantity: 3, field1: 1 }] })), { perBuy: 5, slots: 0 });
  const rings = await shopBot({ kind: 'buy', shop: 'nhan-xu', itemId: 306, quantity: 2 }, [...openRings(), ...[1, 2].map((): Expect => ({
    op: 1190, hex: buildRequest(1190, { shopId: 391, quantity: 1 }).toString('hex'),
    reply: [[46, money46(13_755_600, 0, 0)], [1256, noticePacket('Bạn vừa mua thành công! 1 Nhẫn Trơn')], [46, money46(13_755_600, 0, 0)]] }))], { confirm: true });
  assert.deepEqual([rings.errors, rings.left.length, rings.outcome, rings.logs.filter(e => e.event === 'bought').length], [[], 0, 'done', 2]);
});

test('Mua refuses before sending: short of money, no room, an item the shop does not sell; a refusal of the server ends it', async () => {
  const poor = await shopBot({ kind: 'buy', shop: 'nhan-xu', itemId: 333, quantity: 1 }, openRings(), { money: money46(1000, 0, 0), confirm: true });
  assert.match(poor.stop!, /thiếu Xu: cần 1900, có 1000/);
  const full = Array.from({ length: 42 }, (_, slot) => ({ slot, itemId: 411 }));
  const noRoom = await shopBot({ kind: 'buy', shop: 'nhan-xu', itemId: 306, quantity: 1 }, openRings(), { bag: full, confirm: true });
  assert.match(noRoom.stop!, /cần 1 ô trống, túi còn 0/);
  const elsewhere = await shopBot({ kind: 'buy', shop: 'nhan-xu', itemId: 2, quantity: 1 }, openRings(), { confirm: true });
  assert.match(elsewhere.stop!, /không bán ở cửa hàng này/);
  assert.ok(![poor, noRoom, elsewhere].some(x => x.sent.some(s => s.startsWith('c2s/1190'))));
  const refused = await shopBot({ kind: 'buy', shop: 'nhan-xu', itemId: 306, quantity: 1 }, [...openRings(), { op: 1190, reply: [[1256, hex(N['s2c/1256 túi đầy'])]] }], { confirm: true });
  assert.match(refused.stop!, /server từ chối: "Rương đồ không đủ ô trống"/);
});

// ---------------------------------------------------------------------------------------------------------------------
// Hương Lão: Điểm năng động and Đổi lượng.

const HL = hex(G['s2c/57 Hương Lão']), EXCH = hex(N['s2c/57 Đổi lượng']);
const POINTS_TEXT = 'Điểm năng động tuần này: 54/100\nHạn mức đổi (cấp 79): 7.000 Xu, cần 7.700 Xu khóa\nTuần này còn 500/500 suất. Hết tuần lúc 00:00 thứ Hai.';
const exchanged = (luong: number, xu: number, text: string): [number, Buffer][] => [[46, money46(xu - 50_000, 0, luong)], [46, money46(xu, 0, luong)], [1256, noticePacket(text)]];

async function elderBot(task: ElderTask, script: Expect[], { luong = 9950, confirm = false, mapId = 'M1' } = {}) {
  const logs: Record<string, any>[] = [];
  const bot = new ElderBot({ confirm, waitMs: 300, settleMs: 5, log: e => logs.push(e) });
  bot.onPacket(46, money46(5_000_000, 5_000_000, luong));
  const s = scripted(script, (op, p) => bot.onPacket(op, p));
  let outcome: string | undefined, stop: string | undefined;
  try { outcome = await bot.run(task, s.io, mapId); } catch (error) { if (!(error instanceof Stop)) throw error; stop = error.message; }
  return { ...s, outcome, stop, logs };
}

test('Điểm năng động: the points and the limit read from its menu, then Hương Lão\'s first menu again; Đóng never sent', async () => {
  assert.deepEqual(pointsText(POINTS_TEXT), { points: 54, need: 100, level: 79, xu: 7000, xuKhoa: 7700, slotsLeft: 500, slots: 500 });
  const pointsMenu = menuPacket('Hương Lão Trần Bá', POINTS_TEXT, [[0, 'Đổi Xu'], [1, 'Cách tính điểm'], [2, 'Đóng']]);
  const x = await elderBot({ kind: 'points' }, [talk(102, HL), pick(102, 3, [[57, pointsMenu]]), talk(102, HL)]);
  assert.deepEqual([x.errors, x.left.length, x.outcome], [[], 0, 'done']);
  assert.deepEqual((({ points, xu, xuKhoa }) => ({ points, xu, xuKhoa }))(x.logs.find(e => e.event === 'points')!), { points: 54, xu: 7000, xuKhoa: 7700 });
  assert.ok(!x.sent.some(s => s === `c2s/57 ${buildRequest(57, { option: 2, mapId: 'M1', npcId: 102 }).toString('hex')}`));
});

test('Đổi lượng: dry run picks nothing; --confirm --times=2 walks the menu again each time; the first menu is left last', async () => {
  const dry = await elderBot({ kind: 'exchange', to: 'xu', times: 1 }, [talk(102, HL), pick(102, 1, [[57, EXCH]]), talk(102, HL)]);
  assert.deepEqual([dry.errors, dry.left.length, dry.outcome], [[], 0, 'dry_run']);
  assert.deepEqual((({ luong, gets }) => ({ luong, gets }))(dry.logs.find(e => e.event === 'plan')!), { luong: 50, gets: 50_000 });
  const two = await elderBot({ kind: 'exchange', to: 'khoa', times: 2 }, [
    talk(102, HL), pick(102, 1, [[57, EXCH]]), pick(102, 1, exchanged(9900, 5_055_000, 'Bạn vừa nhận được 55.000 Xu khóa')),
    talk(102, HL), pick(102, 1, [[57, EXCH]]), pick(102, 1, exchanged(9850, 5_110_000, 'Bạn vừa nhận được 55.000 Xu khóa')),
    talk(102, HL),
  ], { confirm: true });
  assert.deepEqual([two.errors, two.left.length, two.stop, two.outcome], [[], 0, undefined, 'done']);
  assert.deepEqual(two.logs.filter(e => e.event === 'result').map(e => e.moneyAfter.luong), [9900, 9850]);
  assert.match(EXCHANGE.lines.khoa[1].source, /55/);
});

test('Đổi lượng stops short of Lượng before any pick, and on a refusal; the first menu is put back either way', async () => {
  const poor = await elderBot({ kind: 'exchange', to: 'xu', times: 3 }, [talk(102, HL), pick(102, 1, [[57, EXCH]]), talk(102, HL)], { luong: 120, confirm: true });
  assert.deepEqual([poor.errors, poor.left.length], [[], 0]);
  assert.match(poor.stop!, /thiếu Lượng: cần 150, có 120/);
  const refused = await elderBot({ kind: 'exchange', to: 'xu', times: 1 }, [talk(102, HL), pick(102, 1, [[57, EXCH]]), pick(102, 0, [[1256, noticePacket('Không đủ lượng')]]), talk(102, HL)], { confirm: true });
  assert.deepEqual([refused.errors, refused.left.length], [[], 0]);
  assert.match(refused.stop!, /server từ chối: "Không đủ lượng"/);
  const away = await elderBot({ kind: 'points' }, [], { mapId: 'M4' });
  assert.equal(away.sent.length, 0);
});

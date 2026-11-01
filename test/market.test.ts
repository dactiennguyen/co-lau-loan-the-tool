import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEvent } from '../src/protocol/events.ts';
import { Items } from '../src/protocol/items.ts';
import { MARKET, MARKET_MINE_TAB, MARKET_QUALITY, market, marketBuyRequest, marketDone, marketExtendRequest, marketListed, marketPageRequest, marketSellRequest, marketTabs, marketWithdrawRequest } from '../src/protocol/market.ts';
import { newMail } from '../src/protocol/mail.ts';
import { np1Packets as NP } from './fixtures-np1.ts';
import { currencies } from '../src/protocol/world.ts';
import { buildRequest } from '../src/protocol/events.ts';
import { notice } from '../src/protocol/world.ts';
import { ct1Packets as P } from './fixtures-ct1.ts';
import { bag42, money46, scripted, type Expect, type Reply } from './support/packets.ts';
import { MarketBot, type MarketTask } from '../src/bot/market.ts';
import { Stop } from '../src/bot/steps.ts';

const hex = (key: string) => Buffer.from(P[key], 'hex');
const items = Items.load();

test('s2c/1192 Chợ trời: a tab, its pages and 20 listings, read to the last byte', () => {
  const m = market(hex('s2c/1192 Chợ trời Vũ Khí trang 1'));
  if (m.kind !== 1) throw new Error(`kind ${m.kind}`);
  assert.deepEqual([m.tabs, m.tab, m.tabName, m.pages, m.page, m.listings.length], [9, 0, 'Vũ Khí', 9, 1, 20]);
  const [first] = m.listings;
  assert.deepEqual({ ...first, stats: undefined }, {
    itemId: 299, itemId2: 299, uuid: first.uuid, seller: 'Người bán 1', durability: 60, field0: 0, quality: 3,
    expiresAt: first.expiresAt, currency: 0, price: 3_333_333, field2: 0, quantity: 1, field1: 1, stats: undefined,
  });
  assert.equal(items.name(first.itemId), 'Liệt Hỏa Đao');
  assert.deepEqual(first.stats, [{ stat: 5, value: 44, value2: 44 }, { stat: 2, value: 23, value2: 23 }, { stat: 4, value: 20, value2: 20 }]);
  assert.match(new Date(first.expiresAt).toISOString(), /^2026-11-02T09:30/);
  // Every listing a weapon sold for Xu; durability 60 at level 21 and 51, 300 at level 101.
  assert.ok(m.listings.every(l => items.get(l.itemId)?.type === 2 && l.itemId === l.itemId2 && l.currency === 0 && l.quantity === 1));
  assert.deepEqual([...new Set(m.listings.map(l => `${items.get(l.itemId)?.level}:${l.durability}`))].sort(), ['101:300', '21:60', '51:60']);
});

test('s2c/1192 Bán vật phẩm is the rules; Đang bán with nothing on sale is one empty page', () => {
  assert.deepEqual(market(hex('s2c/1192 Bán vật phẩm')), { kind: 0, text: 'Phí đăng bán 1.000 Xu, bán trong 24 giờ, phí chợ 5% khi bán được. Tiền bán được và vật phẩm hết hạn gửi về hộp thư.' });
  assert.deepEqual(market(hex('s2c/1192 Đang bán')), { kind: 2, pages: 1, page: 1, listings: [] });
  assert.deepEqual([MARKET.fee, MARKET.hours, MARKET.cut], [1000, 24, 0.05]);
});

test('the catalog decodes s2c/1192 with the same reader', () => {
  const d = decodeEvent('s2c', 1192, hex('s2c/1192 Chợ trời Vũ Khí trang 1'));
  assert.equal(d?.opaqueBytes, 0);
  assert.equal((d?.fields as { listings: unknown[] }).listings.length, 20);
});

test('the window: c2s/116 → s2c/116 the nine tabs and the rules; c2s/1192 a page as the phone sends it', () => {
  const t = marketTabs(hex('s2c/116 chín mục'));
  assert.deepEqual(t.tabs.map(x => `${x.tab} ${x.name} ${x.listings}`), ['0 Vũ Khí 169', '1 Nón Nam 102', '2 Nón Nữ 9', '3 Giáp Nam 50', '4 Giáp Nữ 9', '5 Nhẫn 77', '6 Vật Phẩm Khác 139', '7 Đá Quý 16', '8 Vật Dụng 23']);
  assert.deepEqual([t.fee, t.a, t.hours, t.b, t.maxPrice], [1000, 1000, 24, 1000, 100_000_000]);
  assert.match(t.rules, /^Phí đăng bán 1\.000 Xu/);
  assert.equal(buildRequest(116).length, 0);
  assert.equal(marketPageRequest(1, 2).toString('hex'), P['c2s/1192 Nón Nam trang 2']);
  assert.equal(buildRequest(1192, { tab: MARKET_MINE_TAB }).toString('hex'), P['c2s/1192 Đang bán']);
  assert.deepEqual(decodeEvent('c2s', 1192, hex('c2s/1192 Đang bán'))?.fields, { mode: 0, tab: -1, page: 1 });
  assert.deepEqual(MARKET_QUALITY, { 1: 'Hiếm', 3: 'Sử Thi' });
});

test('Mua is c2s/115 with the uuid of the listing; a full bag refuses it with a notice', () => {
  const uuid = (decodeEvent('c2s', 115, hex('c2s/115 Mua'))?.fields as { uuid: string }).uuid;
  assert.equal(uuid, '34cb2dae-d9b6-48dd-8d42-6c56337c7d8e');
  assert.equal(marketBuyRequest(uuid).toString('hex'), P['c2s/115 Mua']);
  assert.equal(buildRequest(115, { uuid }).toString('hex'), P['c2s/115 Mua']);
  assert.equal(notice(hex('s2c/1256 rương đầy')).text, 'Rương đã đầy. Vui lòng bỏ bớt đồ ra hoặc mua thêm ngăn chứa');
});

test('Mua that goes through: s2c/46 the price taken, s2c/115 the same uuid', () => {
  assert.equal(currencies(hex('s2c/46 sau Mua')).xu, 5_052_600);
  assert.deepEqual(marketDone(hex('s2c/115 mua được'), 115), { uuid: '34cb2dae-d9b6-48dd-8d42-6c56337c7d8e' });
});

test('Đăng bán is c2s/112 (1, bag slot, quantity, i64 price); Đang bán lists it; Thu hồi is c2s/113 with the listing uuid', () => {
  assert.equal(marketSellRequest(2, 1, 1_000_000).toString('hex'), P['c2s/112 Đăng bán ô 2 giá 1.000.000']);
  assert.equal(buildRequest(112, { slot: 2, price: 1_000_000 }).toString('hex'), P['c2s/112 Đăng bán ô 2 giá 1.000.000']);
  assert.deepEqual(decodeEvent('c2s', 112, hex('c2s/112 Đăng bán ô 2 giá 1.000.000'))?.fields, { kind: 1, slot: 2, quantity: 1, price: 1_000_000 });
  assert.deepEqual(marketListed(hex('s2c/112')), { a: 1, slot: 2, quantity: 1 });
  assert.equal(notice(hex('s2c/1256 rao bán thành công')).text, 'Rao bán vật phẩm thành công');
  const mine = market(hex('s2c/1192 Đang bán một món'));
  if (mine.kind !== 2) throw new Error(`kind ${mine.kind}`);
  assert.deepEqual([mine.pages, mine.page, mine.listings.length], [1, 1, 1]);
  const [l] = mine.listings;
  assert.deepEqual([items.name(l.itemId), l.seller, l.price, l.durability, l.quality, l.quantity], ['Thú cưng Slime', 'manina', 1_000_000, -1, 0, 1]);
  assert.equal(marketWithdrawRequest(l.uuid).toString('hex'), P['c2s/113 Thu hồi']);
  assert.deepEqual(marketDone(hex('s2c/113'), 113), { uuid: l.uuid });
  assert.equal(notice(hex('s2c/1256 đã nhận lại')).text, 'Đã nhận lại vật phẩm Thú cưng Slime');
});

// ---------------------------------------------------------------------------------------------------------------------
// MarketBot, replaying CT1 (01/11, manina2).

const r = (op: number, key: string): Reply => [op, hex(key)];
const SLIME = '34cb2dae-d9b6-48dd-8d42-6c56337c7d8e';
const window = (): Expect => ({ op: 116, hex: '', reply: [r(116, 's2c/116 chín mục')] });
const page4 = (): Expect => ({ op: 1192, hex: marketPageRequest(6, 4).toString('hex'), reply: [r(1192, 's2c/1192 Vật Phẩm Khác trang 4')] });

async function marketBot(task: MarketTask, script: Expect[], { bag = 's2c/1187 sau Thu hồi' as string | Buffer, xu = 5_053_600, confirm = false } = {}) {
  const logs: Record<string, any>[] = [];
  const bot = new MarketBot({ items, confirm, waitMs: 300, settleMs: 5, log: e => logs.push(e) });
  if (typeof bag === 'string') bot.onPacket(1187, hex(bag)); else bot.onPacket(42, bag);
  bot.onPacket(46, money46(xu, 5_031_278, 9_950));
  const s = scripted(script, (op, p) => bot.onPacket(op, p));
  let outcome: string | undefined, stop: string | undefined;
  try { outcome = await bot.run(task, s.io); } catch (error) { if (!(error instanceof Stop)) throw error; stop = error.message; }
  return { ...s, outcome, stop, logs, bot };
}

test('MarketBot opens the window with c2s/116, then reads a page; --scan sorts every page by price', async () => {
  const list = await marketBot({ kind: 'list', tab: 6, page: 4 }, [window(), page4()]);
  assert.deepEqual([list.errors, list.left.length, list.outcome], [[], 0, 'done']);
  assert.deepEqual(list.logs.find(e => e.event === 'tabs')!.fee, 1000);
  assert.equal(list.logs.filter(e => e.event === 'listing').length, 20);
  const pages = Array.from({ length: 7 }, (_, k): Expect => ({ op: 1192, hex: marketPageRequest(6, k + 1).toString('hex'), reply: [r(1192, 's2c/1192 Vật Phẩm Khác trang 4')] }));
  const scan = await marketBot({ kind: 'scan', tab: 6, name: 'slime', top: 2 }, [window(), ...pages]);
  assert.deepEqual([scan.errors, scan.left.length, scan.outcome], [[], 0, 'done']);
  const cheap = scan.logs.filter(e => e.event === 'cheap');
  assert.deepEqual(cheap.map(e => [e.item, e.price, e.uuid]), [['Thú cưng Slime (+16 thể lực)', 1000, SLIME], ['Thú cưng Slime (+12 nội lực)', 5000, '4683a2f4-0e36-463c-8541-962c08c76f4b']]);
  // The same page seven times: each listing counts once.
  assert.equal(scan.logs.find(e => e.event === 'scanned')!.listings, 20);
});

test('Mua: dry run stops before c2s/115; with --confirm the uuid goes out and the item lands in the bag', async () => {
  const dry = await marketBot({ kind: 'buy', uuid: SLIME, maxPrice: 1000, tab: 6, page: 4 }, [window(), page4()]);
  assert.deepEqual([dry.errors, dry.left.length, dry.outcome], [[], 0, 'dry_run']);
  assert.ok(!dry.sent.some(x => x.startsWith('c2s/115')));
  const buy = await marketBot({ kind: 'buy', uuid: SLIME, maxPrice: 1000, tab: 6, page: 4 }, [window(), page4(),
    { op: 115, hex: P['c2s/115 Mua'], reply: [r(46, 's2c/46 sau Mua'), r(115, 's2c/115 mua được'), r(1187, 's2c/1187 sau Mua')] }], { confirm: true });
  assert.deepEqual([buy.errors, buy.left.length, buy.stop, buy.outcome], [[], 0, undefined, 'done']);
  const result = buy.logs.find(e => e.event === 'result')!;
  // The bag before is the one after Thu hồi: the same items, the Slime with another uuid.
  assert.deepEqual([result.moneyAfter.xu, result.slots], [5_052_600, [2]]);
});

test('Mua refuses before sending: price above --max-price, a full bag; a refusal of the server ends the task', async () => {
  const dear = await marketBot({ kind: 'buy', uuid: SLIME, maxPrice: 999, tab: 6, page: 4 }, [window(), page4()], { confirm: true });
  assert.match(dear.stop!, /cao hơn --max-price=999/);
  const full = Array.from({ length: 42 }, (_, slot) => ({ slot, itemId: 411 }));
  const noRoom = await marketBot({ kind: 'buy', uuid: SLIME, maxPrice: 1000, tab: 6, page: 4 }, [window(), page4()], { bag: bag42(full), confirm: true });
  assert.match(noRoom.stop!, /túi không còn ô trống/);
  assert.ok(![dear, noRoom].some(x => x.sent.some(s => s.startsWith('c2s/115'))));
  const refused = await marketBot({ kind: 'buy', uuid: SLIME, maxPrice: 1000, tab: 6, page: 4 }, [window(), page4(), { op: 115, reply: [r(1256, 's2c/1256 rương đầy')] }], { confirm: true });
  assert.deepEqual([refused.errors, refused.left.length], [[], 0]);
  assert.match(refused.stop!, /server từ chối "Rương đã đầy/);
  const gone = await marketBot({ kind: 'buy', uuid: '00000000-0000-0000-0000-000000000000', maxPrice: 1000, tab: 6, page: 4 },
    [window(), page4(), ...Array.from({ length: 7 }, (_, k): Expect => ({ op: 1192, hex: marketPageRequest(6, k + 1).toString('hex'), reply: [r(1192, 's2c/1192 Vật Phẩm Khác trang 4')] }))]);
  assert.match(gone.stop!, /không thấy món/);
});

test('Đăng bán: only an item not locked, a price in range; --confirm sends c2s/112 and the fee is taken', async () => {
  const locked = await marketBot({ kind: 'sell', slot: 0, price: 50_000 }, [window()], { bag: 's2c/1187 sau Mua', confirm: true });
  assert.match(locked.stop!, /Hoàn Linh Dược ×6 ở ô 0 đã khoá/);
  const cheap = await marketBot({ kind: 'sell', slot: 2, price: 999 }, [window()], { bag: 's2c/1187 sau Mua', confirm: true });
  assert.match(cheap.stop!, /giá phải từ 1000 tới 100000000/);
  const dry = await marketBot({ kind: 'sell', slot: 2, price: 1_000_000 }, [window()], { bag: 's2c/1187 sau Mua' });
  assert.deepEqual([dry.errors, dry.left.length, dry.outcome], [[], 0, 'dry_run']);
  assert.deepEqual((({ fee, cut, net }) => ({ fee, cut, net }))(dry.logs.find(e => e.event === 'plan')!), { fee: 1000, cut: 50_000, net: 950_000 });
  const sell = await marketBot({ kind: 'sell', slot: 2, price: 1_000_000 }, [window(),
    { op: 112, hex: P['c2s/112 Đăng bán ô 2 giá 1.000.000'], reply: [[46, money46(5_051_600, 5_031_278, 9_950)], r(112, 's2c/112'), r(1256, 's2c/1256 rao bán thành công')] }],
  { bag: 's2c/1187 sau Mua', xu: 5_052_600, confirm: true });
  assert.deepEqual([sell.errors, sell.left.length, sell.stop, sell.outcome], [[], 0, undefined, 'done']);
  const result = sell.logs.find(e => e.event === 'result')!;
  assert.deepEqual([result.slot, result.moneyAfter.xu, result.notices], [2, 5_051_600, ['Rao bán vật phẩm thành công']]);
});

test('Thu hồi: the uuid of Đang bán, c2s/113, and the item back in the bag', async () => {
  const mine = (): Expect => ({ op: 1192, hex: P['c2s/1192 Đang bán'], reply: [r(1192, 's2c/1192 Đang bán một món')] });
  const listed = market(hex('s2c/1192 Đang bán một món'));
  const uuid = listed.kind === 2 ? listed.listings[0].uuid : '';
  const back = await marketBot({ kind: 'withdraw', uuid }, [window(), mine(),
    { op: 113, hex: P['c2s/113 Thu hồi'], reply: [r(1187, 's2c/1187 sau Thu hồi'), r(113, 's2c/113'), r(1256, 's2c/1256 đã nhận lại')] }], { bag: 's2c/1187 sau Mua', confirm: true });
  assert.deepEqual([back.errors, back.left.length, back.stop, back.outcome], [[], 0, undefined, 'done']);
  assert.deepEqual(back.logs.find(e => e.event === 'result')!.slots, [2]);
  const unknown = await marketBot({ kind: 'withdraw', uuid: SLIME }, [window(), mine()], { confirm: true });
  assert.match(unknown.stop!, /Đang bán không có món/);
  assert.ok(!unknown.sent.some(s => s.startsWith('c2s/113')));
});

// ---------------------------------------------------------------------------------------------------------------------
// NP1: Gia hạn, and the mail of a listing sold.

const np = (key: string) => Buffer.from(NP[key], 'hex');
const nr = (op: number, key: string): Reply => [op, np(key)];
const RENEWED = 'da16557d-81a8-44af-bed6-37bfe108b331';

test('Gia hạn is c2s/112 (2, uuid of Đang bán): 1.000 Xu, and the listing ends 24 h later than it did', async () => {
  assert.equal(marketExtendRequest(RENEWED).toString('hex'), NP['c2s/112 Gia hạn']);
  assert.deepEqual(decodeEvent('c2s', 112, np('c2s/112 Gia hạn')).fields, { kind: 2, uuid: RENEWED });
  const [before, after] = ['trước', 'sau'].map(k => market(np(`s2c/1192 Đang bán ${k} Gia hạn`)));
  if (before.kind !== 2 || after.kind !== 2) throw new Error('Đang bán');
  assert.deepEqual([after.listings[0].uuid, after.listings[0].price, after.listings[0].seller], [RENEWED, 20_000, 'manina']);
  assert.equal(after.listings[0].expiresAt - before.listings[0].expiresAt, 24 * 3_600_000);
  assert.equal(notice(np('s2c/1256 gia hạn')).text, 'Gia hạn vật phẩm thành công');

  const mine = (): Expect => ({ op: 1192, hex: P['c2s/1192 Đang bán'], reply: [nr(1192, 's2c/1192 Đang bán trước Gia hạn')] });
  const dry = await marketBot({ kind: 'extend', uuid: RENEWED }, [window(), mine()], { xu: 5_050_600 });
  assert.deepEqual([dry.errors, dry.left.length, dry.outcome], [[], 0, 'dry_run']);
  assert.deepEqual((({ task, fee, hours }) => ({ task, fee, hours }))(dry.logs.find(e => e.event === 'plan')!), { task: 'Gia hạn', fee: 1000, hours: 24 });
  const done = await marketBot({ kind: 'extend', uuid: RENEWED }, [window(), mine(),
    { op: 112, hex: NP['c2s/112 Gia hạn'], reply: [nr(46, 's2c/46 sau Gia hạn'), nr(1192, 's2c/1192 Đang bán sau Gia hạn'), nr(1256, 's2c/1256 gia hạn')] }], { xu: 5_050_600, confirm: true });
  assert.deepEqual([done.errors, done.left.length, done.stop, done.outcome], [[], 0, undefined, 'done']);
  const result = done.logs.find(e => e.event === 'result')!;
  assert.deepEqual([result.ok, result.moneyAfter.xu, result.notices], [true, 5_049_600, ['Gia hạn vật phẩm thành công']]);
  assert.equal(Date.parse(result.expiresAfter) - Date.parse(result.expiresBefore), 24 * 3_600_000);
  // Short of the fee, or a uuid not in Đang bán: nothing goes out.
  const poor = await marketBot({ kind: 'extend', uuid: RENEWED }, [window(), mine()], { xu: 999, confirm: true });
  const gone = await marketBot({ kind: 'extend', uuid: SLIME }, [window(), mine()], { confirm: true });
  assert.deepEqual([/thiếu Xu/.test(poor.stop!), /Đang bán không có món/.test(gone.stop!)], [true, true]);
  assert.ok(![poor, gone].some(x => x.sent.some(s => s.startsWith('c2s/112'))));
});

test('a listing sold: the seller online gets only s2c/1222, a mail of Hệ Thống, and s2c/1220', () => {
  const mail = newMail(np('s2c/1222 thư bán được'));
  assert.deepEqual((({ title, sender, read, gift, taken }) => ({ title, sender, read, gift, taken }))(mail),
    { title: 'Chợ trời: đã bán vật phẩm', sender: 'Hệ Thống', read: false, gift: true, taken: false });
  assert.equal(NP['s2c/1220'], '01');
});

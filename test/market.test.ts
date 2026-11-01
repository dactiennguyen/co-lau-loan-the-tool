import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEvent } from '../src/protocol/events.ts';
import { Items } from '../src/protocol/items.ts';
import { MARKET, MARKET_MINE_TAB, MARKET_QUALITY, market, marketBuyRequest, marketDone, marketListed, marketPageRequest, marketSellRequest, marketTabs, marketWithdrawRequest } from '../src/protocol/market.ts';
import { currencies } from '../src/protocol/world.ts';
import { buildRequest } from '../src/protocol/events.ts';
import { notice } from '../src/protocol/world.ts';
import { ct1Packets as P } from './fixtures-ct1.ts';

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

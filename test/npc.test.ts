import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEvent, buildRequest } from '../src/protocol/events.ts';
import { Items } from '../src/protocol/items.ts';
import {
  quote, mergePlan, mergeForecast, mergeFee, upgradeStones, transmuteTargets, transmuteItem, upgradeCap, stoneLevel,
  SHOPS, WINDOWS, putRequest, startRequest,
} from '../src/protocol/npc.ts';
import { npcPackets as P, symapBag } from './fixtures-npc.ts';

const items = Items.load();
const decode = (op: number, key: string) => decodeEvent('s2c', op, Buffer.from(P[key], 'hex')).fields as any;

test('every captured packet of the Pháp sư windows and the shops reads to its last byte', () => {
  for (const key of Object.keys(P)) {
    const op = Number(key.split(' ')[0].split('/')[1]);
    assert.doesNotThrow(() => decodeEvent('s2c', op, Buffer.from(P[key], 'hex')), key);
  }
});

test('the windows: s2c/96 of Nâng cấp, Chuyển hoá and Tách đá, s2c/99 of Luyện đá and Chế tạo (J2)', () => {
  assert.deepEqual(decode(96, 's2c/96 Nâng cấp [thường]'), { name: 'symap', key: '', prompt: 'Cần chọn trang bị và đá (có thể thêm bùa bảo vệ)', title: 'Nâng cấp [thường]', slots: 18 });
  assert.equal(decode(96, 's2c/96 Nâng cấp [cẩn thận]').title, 'Nâng cấp [cẩn thận]');
  assert.deepEqual([decode(96, 's2c/96 Chuyển hoá').key, decode(96, 's2c/96 Tách đá').slots], ['TRANSMUTE', 0]);
  assert.deepEqual(['s2c/99 Luyện đá [Xu khóa]', 's2c/99 Luyện đá [Xu]', 's2c/99 Chế tạo cánh', 's2c/99 Chế Băng Kiếm'].map(k => [decode(99, k).key, decode(99, k).slots]),
    [['abcd1002', 24], ['abcd1003', 24], ['abcd1006', 3], ['abcd1007', 3]]);
});

test('s2c/90, s2c/92 and s2c/1260 answer each item put in; quote reads the price and the odds', () => {
  const gear = decode(90, 's2c/90 trang bị');
  assert.deepEqual([gear.gear, gear.slot, gear.quantity, gear.ready], [true, 45, 1, false]);
  const plain = decode(90, 's2c/90 thường 33 Xu khóa 75%');
  assert.deepEqual([plain.gear, plain.ready], [false, true]);
  assert.deepEqual(quote(plain.text), { fee: { amount: 33, money: 'xuKhoa' }, luong: 0, rate: 75, stone: null, gain: [] });
  assert.deepEqual(quote(decode(90, 's2c/90 cẩn thận 5 Lượng 100%').text).luong, 5);
  assert.deepEqual(quote(decode(90, 's2c/90 tách đá').text).gain, [{ quantity: 2, name: 'Đá cấp 1' }]);
  assert.equal(decode(90, 's2c/90 chuyển hoá sẵn sàng').ready, true);
  // Luyện đá.
  const one = decode(92, 's2c/92 một viên');
  assert.deepEqual([one.ready, quote(one.text)], [false, { fee: null, luong: 0, rate: null, stone: null, gain: [] }]);
  assert.deepEqual(quote(decode(92, 's2c/92 Đá cấp 6 Khóa 50%').text), { fee: { amount: 410, money: 'xuKhoa' }, luong: 0, rate: 50, stone: { level: 6, locked: true }, gain: [] });
  assert.deepEqual(quote(decode(92, 's2c/92 Đá cấp 7 Khóa 31%').text).fee, { amount: 1639, money: 'xuKhoa' });
  assert.deepEqual(quote(decode(92, 's2c/92 Đá cấp 2 Xu 50%').text), { fee: { amount: 2, money: 'xu' }, luong: 0, rate: 50, stone: { level: 2, locked: false }, gain: [] });
  assert.deepEqual(decode(1260, 's2c/1260 đích').slot, 50);
  assert.equal(decode(1258, 's2c/1258 giáp +2').item.field0, 2);
});

test('the results: s2c/91 of Nâng cấp (failed, then done), Tách đá and Chuyển hoá; s2c/93 of Luyện đá (J3)', () => {
  const failed = decode(91, 's2c/91 thất bại'), done = decode(91, 's2c/91 thành công');
  assert.deepEqual([failed.ok, failed.item.itemId, failed.item.field0, failed.received, failed.target], [false, 306, 0, [], null]);
  assert.deepEqual([done.ok, done.item.field0, done.item.field1], [true, 1, 0]);
  const split = decode(91, 's2c/91 tách đá');
  assert.deepEqual([split.item.itemId, split.item.field0, split.received.map((i: any) => [i.slot, i.itemId, i.field1])], [227, 0, [[26, 411, 0], [30, 411, 0]]]);
  const moved = decode(91, 's2c/91 chuyển hoá');
  assert.deepEqual([moved.item.itemId, moved.item.field0, moved.received, moved.target.itemId, moved.target.field0], [366, 0, [], 357, 1]);
  assert.deepEqual(decode(93, 's2c/93 Đá cấp 6 khoá').items.map((i: any) => [i.slot, i.itemId, i.field1]), [[20, 416, 0]]);
  assert.deepEqual(decode(93, 's2c/93 Đá cấp 2 chưa khoá').items.map((i: any) => [i.itemId, i.field1]), [[412, 1]]);
});

test('s2c/1190 reads the 49-byte gear records: the main stat each item rolls between min and max (J1)', () => {
  const rings = decode(1190, 's2c/1190 Nhẫn [Xu]');
  assert.deepEqual([rings.kind, rings.title, rings.items.length], [5, 'Nhẫn', 12]);
  assert.deepEqual(rings.items[0], { shopId: 391, itemId: 306, currency: 0, price: 300, durability: -1, quantity: 1, flag: 1, element: 1, ranges: [{ stat: 5, min: 5, max: 9 }] });
  const swords = decode(1190, 's2c/1190 Vũ khí [Xu khóa]');
  assert.deepEqual([swords.items.length, swords.items.every((i: any) => i.currency === 1 && i.flag === 0)], [26, true]);
  const luong = decode(1190, 's2c/1190 Cửa hàng [Lượng]');
  assert.deepEqual([luong.items.length, luong.items.find((i: any) => i.itemId === 416)], [19, { shopId: 404, itemId: 416, currency: 2, price: 2, durability: -1, quantity: 1, flag: 1, element: 255, ranges: [] }]);
  // Every shop is opened by its own path; the Lượng shop is line 2 of Lái Buôn.
  assert.deepEqual([SHOPS.length, new Set(SHOPS.map(s => s.kind)).size, SHOPS.find(s => s.kind === 8)?.path], [14, 14, [2]]);
  assert.deepEqual(decode(57, 's2c/57 Đổi lượng').options.map((o: any) => o.label), ['50 lượng nhận 50.000 Xu', '50 lượng nhận 55.000 Xu khóa']);
});

test('c2s/97 and c2s/91 are what the phone sent (J1): put bag slot 45, Bắt đầu', () => {
  assert.equal(buildRequest(97, { slot: 45 }).toString('hex'), '0000000000000000000000002d00000001');
  assert.equal(putRequest(45).toString('hex'), '0000000000000000000000002d00000001');
  assert.deepEqual([buildRequest(91).toString('hex'), startRequest().toString('hex')], ['00000000', '00000000']);
  assert.deepEqual(decodeEvent('c2s', 97, putRequest(15)).fields, { key: '', from: 0, kind: 0, slot: 15, quantity: 1 });
  assert.deepEqual([WINDOWS.upgrade, WINDOWS.careful, WINDOWS.separate, WINDOWS.mergeXu], [[0, 0], [0, 1], [2], [1, 1]]);
});

const BAG = symapBag;

test('Gộp đá: sets of 4 stones of a level and lock at 100%, and what going on up costs in all', () => {
  assert.deepEqual([stoneLevel(411), stoneLevel(422), stoneLevel(43), stoneLevel(2)], [1, 12, 0, 0]);
  assert.deepEqual([2, 4, 5, 6, 7, 12].map(mergeFee), [2, 26, 103, 410, 1639, 1677722]);
  const plan = mergePlan(BAG);
  assert.deepEqual(plan.map(s => [s.level, s.slots, s.window, s.fee]), [
    [5, [20, 24, 25, 26], 'mergeXuKhoa', 410], [5, [30, 31, 32, 33], 'mergeXuKhoa', 410], [5, [35, 36, 37, 39], 'mergeXuKhoa', 410],
    [5, [43, 44, 46, 47], 'mergeXuKhoa', 410], [5, [48, 49, 51, 52], 'mergeXuKhoa', 410]]);
  // 21 locked Đá cấp 5 make 5 Đá cấp 6; with the one in the bag that is 6, so one more merge makes a Đá cấp 7.
  assert.deepEqual(mergeForecast(BAG), { merges: 6, xu: 0, xuKhoa: 5 * 410 + 1639, freed: 18, made: [{ level: 6, locked: true, count: 5 }, { level: 7, locked: true, count: 1 }] });
  assert.deepEqual(mergeForecast(BAG, { upTo: 6 }), { merges: 5, xu: 0, xuKhoa: 2050, freed: 15, made: [{ level: 6, locked: true, count: 5 }] });
  // Four unlocked Đá cấp 1 go to Luyện đá [Xu] and are paid in Xu; the stone made stays unlocked.
  const four = [...BAG, { slot: 60, itemId: 411, field0: 0, field1: 1 }, { slot: 61, itemId: 411, field0: 0, field1: 1 }];
  assert.deepEqual(mergePlan(four, { upTo: 2 }), [{ level: 1, slots: [16, 17, 60, 61], locked: false, window: 'mergeXu', fee: 2 }]);
  assert.deepEqual(mergePlan(four, { upTo: 2, unlocked: false }), []);
});

test('Gộp đá of one row: only the stones of a level and lock, one level up, at most `sets` merges', () => {
  // One set of the 21 locked Đá cấp 5: one Đá cấp 6, nothing further up.
  assert.deepEqual(mergeForecast(BAG, { level: 5, locked: true, sets: 1 }), { merges: 1, xu: 0, xuKhoa: 410, freed: 3, made: [{ level: 6, locked: true, count: 1 }] });
  // Every set of the level, but the Đá cấp 6 made stay: no Đá cấp 7 as without `level`.
  assert.deepEqual(mergeForecast(BAG, { level: 5 }), { merges: 5, xu: 0, xuKhoa: 2050, freed: 15, made: [{ level: 6, locked: true, count: 5 }] });
  assert.deepEqual(mergeForecast(BAG, { sets: 2 }).merges, 2);
  assert.equal(mergePlan(BAG, { level: 5 }).length, 5);
  assert.deepEqual(mergePlan(BAG, { level: 5, locked: false }), []);
  assert.deepEqual([mergePlan(BAG, { level: 12 }), mergePlan(BAG, { level: 0 })], [[], []]);
  // The unlocked row: Luyện đá [Xu]; `unlocked` false leaves it out even when asked.
  const four = [...BAG, { slot: 60, itemId: 411, field0: 0, field1: 1 }, { slot: 61, itemId: 411, field0: 0, field1: 1 }];
  assert.deepEqual(mergePlan(four, { level: 1, locked: false }), [{ level: 1, slots: [16, 17, 60, 61], locked: false, window: 'mergeXu', fee: 2 }]);
  assert.deepEqual(mergePlan(four, { level: 1, locked: false, unlocked: false }), []);
});

test('Nâng cấp takes the cheapest stones first, locked before unlocked; Chuyển hoá finds the targets and the item', () => {
  assert.deepEqual(upgradeStones(BAG).slice(0, 7).map(i => i.slot), [16, 17, 29, 34, 41, 19, 20]);
  assert.deepEqual(upgradeStones(BAG, { unlocked: false }).slice(0, 3).map(i => i.slot), [34, 41, 20]);
  const def = (id: number) => items.get(id);
  const ring = { slot: 42, itemId: 366, field0: 1, field1: 0 };
  const bag = BAG.map(i => (i.slot === 42 ? ring : i));
  assert.deepEqual(transmuteTargets(bag, ring, def).map(i => i.slot), [50]);
  assert.deepEqual(transmuteTargets(BAG, BAG.find(i => i.slot === 42)!, def), [], 'a +0 item is no source');
  assert.equal(transmuteItem([...bag, { slot: 26, itemId: 616, field0: 0, field1: 1 }], 1)?.slot, 26);
  assert.equal(transmuteItem([...bag, { slot: 26, itemId: 616, field0: 0, field1: 1 }], 11), undefined);
  assert.deepEqual([1, 21, 51, 101, 201].map(upgradeCap), [4, 8, 12, 16, 16]);
});

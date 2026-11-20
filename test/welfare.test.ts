import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, decodeEvent } from '../src/protocol/events.ts';
import { Items } from '../src/protocol/items.ts';
import * as w from '../src/protocol/welfare.ts';
import { WelfareBot, dayList } from '../src/bot/welfare.ts';
import { pl1Packets as P } from './fixtures-pl1.ts';
import { bag42, money46, scripted, type BagEntry, type Expect, type Reply } from './support/packets.ts';

const items = Items.load();
const hex = (key: string) => Buffer.from(P[key], 'hex');
const r = (op: number, key: string): Reply => [op, hex(key)];

test('the PL1 packets read to their last byte; the bot sends the bytes the phone sent', () => {
  for (const key of Object.keys(P)) {
    const [direction, op] = key.split(' ')[0].split('/');
    assert.equal(decodeEvent(direction as 'c2s' | 's2c', Number(op), hex(key)).opaqueBytes, 0, key);
  }
  for (const key of w.WELFARE_KEYS) {
    assert.equal(w.eventKeyRequest(key).toString('hex'), P[`c2s/1236 ${key}`]);
    assert.equal(buildRequest(1239, { key }).toString('hex'), P[`c2s/1236 ${key}`]);
  }
  assert.equal(w.checkinRequest(64).toString('hex'), P['c2s/1232 Điểm danh']);
  assert.equal(buildRequest(1232, { event: 64 }).toString('hex'), P['c2s/1232 Điểm danh']);
  assert.equal(w.claimRequest(65).toString('hex'), P['c2s/1233 LEVEL_UP']);
  assert.equal(buildRequest(1233, { event: 21 }).toString('hex'), P['c2s/1233 ONLINE_DAILY']);
});

test('the definitions: milestones, their gifts, the ten gifts of the day', () => {
  const checkin = w.eventDefinition(hex('s2c/1236 CHECKIN_MONTHLY'));
  assert.deepEqual([checkin.event, checkin.key, checkin.title], [64, 'CHECKIN_MONTHLY', 'Điểm danh tháng']);
  assert.deepEqual(checkin.milestones.map(m => [m.id, m.need, m.gifts.map(g => [g.itemId, g.quantity])]),
    [[299, 7, [[39, 1]]], [300, 14, [[417, 1]]], [301, 21, [[35, 1]]], [302, 28, [[7, 1], [39, 1]]]]);
  assert.deepEqual(checkin.daily.map(g => [items.name(g.itemId), g.quantity]), [
    ['Xu khóa', 1500], ['Xu khóa', 3000], ['Hoàn Linh Dược', 5], ['Kim Đan Dược', 5], ['Búa Sửa Chữa', 5],
    ['Đá cấp 5', 2], ['Đá cấp 6', 1], ['Đá cấp 7', 1], ['Vé may mắn', 1], ['Tăng Kinh Nghiệm', 1]]);
  const level = w.eventDefinition(hex('s2c/1236 LEVEL_UP'));
  assert.deepEqual([level.event, level.title, level.daily], [65, 'Quà thăng cấp', []]);
  assert.deepEqual(level.milestones.map(m => [m.id, m.need, m.gifts.map(g => `${items.name(g.itemId)} ×${g.quantity}`).join(', ')]), [
    [303, 10, 'Xu khóa ×25000'], [304, 21, 'Tăng Kinh Nghiệm ×1'], [305, 30, 'Hoàn Linh Dược ×10, Kim Đan Dược ×10'],
    [306, 40, 'Tăng Kinh Nghiệm ×1'], [307, 51, 'Chuyển hoá trang bị trung cấp ×1'], [308, 75, 'Đá cấp 9 ×3'], [309, 101, 'Bùa bảo vệ trung cấp ×1']]);
  const online = w.eventDefinition(hex('s2c/1236 ONLINE_DAILY'));
  assert.deepEqual([online.event, online.title], [21, 'Online mỗi ngày']);
  assert.deepEqual(online.milestones.map(m => [m.id, m.need, m.gifts.map(g => [g.itemId, g.quantity])]),
    [[47, 30, [[41, 5000]]], [48, 60, [[415, 1]]], [49, 120, [[41, 10000]]], [50, 180, [[416, 1]]]]);
});

test('the progress: states 0, 1, 2; the days checked; the red dots', () => {
  const before = w.eventProgress(hex('s2c/1239 CHECKIN_MONTHLY chưa điểm danh')), after = w.eventProgress(hex('s2c/1239 CHECKIN_MONTHLY đã điểm danh'));
  assert.deepEqual([before.period, before.progress, before.checkin?.checkedToday, before.checkin?.day, before.checkin?.daysInMonth, dayList(before.checkin!.daysMask)], ['2026-11', 0, false, 20, 30, []]);
  assert.deepEqual([after.progress, after.checkin?.checkedToday, after.checkin?.daysMask, dayList(after.checkin!.daysMask)], [1, true, 0x80000, [20]]);
  assert.equal(new Date(after.checkin!.resetMs).toISOString(), '2026-11-20T17:00:00.000Z');
  const level = w.eventProgress(hex('s2c/1239 LEVEL_UP 5 mốc nhận được'));
  assert.deepEqual([level.period, level.progress, level.checkin, w.ready(level).map(m => m.id)], ['-', 54, undefined, [303, 304, 305, 306, 307]]);
  assert.deepEqual(w.eventProgress(hex('s2c/1239 LEVEL_UP đã nhận')).milestones.map(m => m.state), [2, 2, 2, 2, 2, 0, 0]);
  const online = w.eventProgress(hex('s2c/1239 ONLINE_DAILY 484 phút'));
  assert.deepEqual([online.period, online.progress, w.ready(online).length], ['2026-11-20', 484, 4]);
  assert.deepEqual(w.ready(w.eventProgress(hex('s2c/1239 ONLINE_DAILY đã nhận'))), []);
  const result = w.checkinResult(hex('s2c/1232 Điểm danh ngày 20'));
  assert.deepEqual([result.event, result.milestone, result.ok, result.text, result.index], [64, 0, true, 'Điểm danh ngày 20: nhận 1 Đá cấp 6', 6]);
  const dots = ['s2c/1279 lúc vào game', 's2c/1279 sau Điểm danh', 's2c/1279 sau quà online'].map(k => w.welfareDots(hex(k)));
  assert.deepEqual(dots, [9, 1, 0]);
  assert.deepEqual([w.hasDot(9, 'online'), w.hasDot(9, 'checkin'), w.hasDot(1, 'checkin'), w.hasDot(0, 'online')], [true, true, false, false]);
  assert.equal(w.claimedGifts('Đã nhận 5 phần thưởng'), 5);
});

const reads = (state: 'due' | 'taken'): Expect[] => [
  { op: 1236, hex: P['c2s/1236 CHECKIN_MONTHLY'], reply: [r(1236, 's2c/1236 CHECKIN_MONTHLY')] },
  { op: 1239, hex: P['c2s/1236 CHECKIN_MONTHLY'], reply: [r(1239, state === 'due' ? 's2c/1239 CHECKIN_MONTHLY chưa điểm danh' : 's2c/1239 CHECKIN_MONTHLY đã điểm danh')] },
  { op: 1236, hex: P['c2s/1236 ONLINE_DAILY'], reply: [r(1236, 's2c/1236 ONLINE_DAILY')] },
  { op: 1239, hex: P['c2s/1236 ONLINE_DAILY'], reply: [r(1239, state === 'due' ? 's2c/1239 ONLINE_DAILY 484 phút' : 's2c/1239 ONLINE_DAILY đã nhận')] },
  { op: 1236, hex: P['c2s/1236 LEVEL_UP'], reply: [r(1236, 's2c/1236 LEVEL_UP')] },
  { op: 1239, hex: P['c2s/1236 LEVEL_UP'], reply: [r(1239, state === 'due' ? 's2c/1239 LEVEL_UP 5 mốc nhận được' : 's2c/1239 LEVEL_UP đã nhận')] },
];
const claims: Expect[] = [
  { op: 1232, hex: P['c2s/1232 Điểm danh'], reply: [r(1232, 's2c/1232 Điểm danh ngày 20'), r(1239, 's2c/1239 CHECKIN_MONTHLY đã điểm danh'), r(1279, 's2c/1279 lúc vào game')] },
  { op: 1233, hex: P['c2s/1233 ONLINE_DAILY'], reply: [r(46, 's2c/46 sau quà online'), r(1256, 's2c/1256 Đã nhận 4 phần thưởng'), r(1239, 's2c/1239 ONLINE_DAILY đã nhận'), r(1279, 's2c/1279 sau quà online')] },
  { op: 1233, hex: P['c2s/1233 LEVEL_UP'], reply: [r(46, 's2c/46 sau quà thăng cấp'), r(1256, 's2c/1256 Đã nhận 5 phần thưởng'), r(1239, 's2c/1239 LEVEL_UP đã nhận')] },
];

async function welfare(script: Expect[], { confirm = false, again = false, bag = [] as BagEntry[], capacity = 42 } = {}) {
  const logs: Record<string, any>[] = [];
  const bot = new WelfareBot({ items, confirm, again, waitMs: 300, settleMs: 5, log: e => logs.push(e) });
  bot.onPacket(42, bag42(bag, capacity));
  bot.onPacket(46, money46(4_400, 408_262, 0));
  bot.onPacket(1279, hex('s2c/1279 lúc vào game'));
  const s = scripted(script, (op, p) => bot.onPacket(op, p));
  const outcome = await bot.run(s.io);
  return { ...s, outcome, logs, bot };
}

test('Tự nhận Phúc lợi: reads the three events as the client, then Điểm danh, Quà online and Quà thăng cấp, as on the phone', async () => {
  const dry = await welfare(reads('due'));
  assert.deepEqual([dry.errors, dry.left.length, dry.outcome], [[], 0, 'dry_run']);
  assert.deepEqual(dry.logs.find(e => e.event === 'plan')!.todo, ['Điểm danh', 'Quà online', 'Quà thăng cấp']);
  assert.equal(dry.bot.dots, 9);

  const done = await welfare([...reads('due'), ...claims], { confirm: true });
  assert.deepEqual([done.errors, done.left.length, done.outcome], [[], 0, 'done']);
  assert.deepEqual(done.bot.claims.map(c => [c.key, c.ok, c.text, c.gifts ?? c.index]), [
    ['CHECKIN_MONTHLY', true, 'Điểm danh ngày 20: nhận 1 Đá cấp 6', 6],
    ['ONLINE_DAILY', true, 'Đã nhận 4 phần thưởng', 4],
    ['LEVEL_UP', true, 'Đã nhận 5 phần thưởng', 5]]);
  assert.deepEqual(done.bot.holdings.money, { xu: 4_400, xuKhoa: 433_262, luong: 0 });
  assert.equal(done.bot.dots, 0);
  assert.deepEqual(done.logs.filter(e => e.event === 'claim').map(e => e.progress), ['299:0 300:0 301:0 302:0', '47:2 48:2 49:2 50:2', '303:2 304:2 305:2 306:2 307:2 308:0 309:0']);
});

test('nothing due: no claim sent; --again sends them all the same and the server refuses each, as it did (PL1)', async () => {
  const none = await welfare(reads('taken'), { confirm: true });
  assert.deepEqual([none.errors, none.left.length, none.outcome, none.bot.claims], [[], 0, 'nothing', []]);
  const again = await welfare([...reads('taken'),
    { op: 1232, hex: P['c2s/1232 Điểm danh'], reply: [r(1232, 's2c/1232 hôm nay đã điểm danh'), r(1256, 's2c/1256 hôm nay đã điểm danh')] },
    { op: 1233, hex: P['c2s/1233 ONLINE_DAILY'], reply: [r(1256, 's2c/1256 không có phần thưởng'), r(1239, 's2c/1239 ONLINE_DAILY 498 phút đã nhận')] },
    { op: 1233, hex: P['c2s/1233 LEVEL_UP'], reply: [r(1256, 's2c/1256 không có phần thưởng'), r(1239, 's2c/1239 LEVEL_UP đã nhận')] },
  ], { confirm: true, again: true });
  assert.deepEqual([again.errors, again.left.length, again.outcome], [[], 0, 'done']);
  assert.deepEqual(again.bot.claims.map(c => [c.key, c.ok, c.text]), [
    ['CHECKIN_MONTHLY', false, 'Hôm nay bạn đã điểm danh'], ['ONLINE_DAILY', false, 'Không có phần thưởng nào để nhận'], ['LEVEL_UP', false, 'Không có phần thưởng nào để nhận']]);
  const refused = w.checkinResult(hex('s2c/1232 hôm nay đã điểm danh'));
  assert.deepEqual([refused.ok, refused.field, refused.index], [false, 255, 255]);
  // A server that says nothing: the claim ends on the wait, not the run.
  const silent = await welfare([...reads('taken'), { op: 1232, reply: [] }, { op: 1233, reply: [] }, { op: 1233, reply: [] }], { confirm: true, again: true });
  assert.deepEqual([silent.errors, silent.left.length, silent.outcome], [[], 0, 'done']);
  assert.match(silent.bot.claims[0].text!, /server không trả lời/);
});

test('a full bag: each claim whose gifts need room is skipped, none sent', async () => {
  const full = Array.from({ length: 42 }, (_, slot) => ({ slot, itemId: 411 }));
  const x = await welfare(reads('due'), { confirm: true, bag: full });
  assert.deepEqual([x.errors, x.left.length, x.outcome], [[], 0, 'done']);
  assert.deepEqual(x.logs.filter(e => e.event === 'skip').map(e => [e.claim, e.reason]), [
    ['Điểm danh', 'cần 1 ô trống, túi còn 0'], ['Quà online', 'cần 2 ô trống, túi còn 0'], ['Quà thăng cấp', 'cần 4 ô trống, túi còn 0']]);
});

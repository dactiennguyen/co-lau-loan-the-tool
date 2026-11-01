import test from 'node:test';
import assert from 'node:assert/strict';
import { mobSheet, mobTypes, spriteSheet, standingParts, type AtlasMob } from '../src/protocol/sprite.ts';

// offline-a2/100009.fx off the phone (01/11/2026): the table of Gà Điên's sheet 100000.dat (06-map-mobs.md#ảnh-quái).
const GA_DIEN_FX = '02000186a0020001a0000007012a0118008a0086009e008e008a008a009e0000008c008c0000011a00d60086012a008e0084008800000000009c0092012c0000007e008c050000ea008e2401000003010000005400080100010054000401000200520002001c00000000000000000000000000000001000100010001000100010001000200020002000200020002000200010001000100010001000100010100ea008e240100000201000300000008010004004e00060008000000000000000000010001000100010200ea008e24010000010100050032fffc000100000300ea008e2401000001010006004800020008000000000000000000000000000000000400ea008e240000000101000600480002000c0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff';

test('sprite table .fx: the frames and motions of Gà Điên, read to the last byte; its icon is motion 0, step 0', () => {
  const sheet = spriteSheet(Buffer.from(GA_DIEN_FX, 'hex'));
  assert.deepEqual([sheet.id, sheet.width, sheet.height, sheet.frames.length], [100000, 512, 416, 7]);
  assert.deepEqual(sheet.frames[0], { x: 298, y: 280, w: 138, h: 134 });
  assert.deepEqual(sheet.motions.map(m => [m.id, m.width, m.height, m.loop, m.steps.length, m.sequence.length]),
    [[0, 234, 142, true, 3, 28], [1, 234, 142, true, 2, 8], [2, 234, 142, true, 1, 1], [3, 234, 142, true, 1, 8], [4, 234, 142, false, 1, 12]]);
  // Standing breathes 0, 1, 2, 1, seven ticks each; the last motion blinks (−1 draws nothing).
  assert.deepEqual(sheet.motions[0].sequence, [0, 1, 2, 1].flatMap(s => Array(7).fill(s)));
  assert.deepEqual(sheet.motions[4].sequence, Array.from({ length: 12 }, (_, i) => (i % 2 ? -1 : 0)));
  assert.deepEqual(standingParts(sheet), [{ frame: 0, dx: 84, dy: 8, x: 298, y: 280, w: 138, h: 134 }]);
  assert.equal(mobSheet(0), sheet.id);
  assert.throws(() => spriteSheet(Buffer.from(GA_DIEN_FX + '00', 'hex')), /1 bytes left/);
});

const mob = (name: string, prefix: string, base: number, count: number, zones = 1): AtlasMob => ({
  name, ids: Object.fromEntries(Array.from({ length: zones }, (_, z) => [String(z), Array.from({ length: count }, (_, i) => `mob${prefix}${base + z * count + i}`)])),
});

test('mobTypes: the bases of one map chain, so every split of a run-together mobId is settled (06-map-mobs.md#mã-quái)', () => {
  // M4 and M5 of the scan S2, M1 with two zones, as data/maps.json has them.
  const m4 = [mob('Sơn Tặc', '4', 0, 5), mob('Chim Điên', '9', 500, 5), mob('Hỏa Hầu', '10', 1000, 5), mob('Cá Sấu', '11', 1500, 6),
    mob('Cóc Tía', '12', 2100, 5), mob('Huyết Lang', '13', 2600, 5)];
  const m5 = [mob('Báo Đốm', '45', 500, 6), mob('Heo Tím', '17', 2100, 5), mob('Hổ Vằn', '57', 0, 5), mob('Voi Mập', '18', 1100, 5), mob('Tiểu Yêu Dê', '41', 1600, 5)];
  const m1 = [mob('Gà Điên', '1', 0, 8, 2), mob('Heo Mọi', '2', 800, 6, 2), mob('Kẻ Gây Rối', '3', 1400, 6, 2), mob('Sơn Tặc', '4', 2000, 6, 2), mob('Chỉ Huy Sơn Tặc', '87', 2600, 7)];
  const boss = { name: 'Thủ Lĩnh Sơn Tặc', ids: { 0: 'mob86100001', 1: 'mob86100101' } };
  assert.deepEqual(mobTypes({ M1: { mobs: m1, bosses: [boss] }, M4: { mobs: m4 }, M5: { mobs: m5 } }), {
    'Gà Điên': 0, 'Heo Mọi': 1, 'Kẻ Gây Rối': 2, 'Sơn Tặc': 3, 'Chim Điên': 8, 'Hỏa Hầu': 9, 'Cá Sấu': 10, 'Cóc Tía': 11,
    'Huyết Lang': 12, 'Heo Tím': 16, 'Voi Mập': 17, 'Tiểu Yêu Dê': 40, 'Báo Đốm': 44, 'Hổ Vằn': 56, 'Thủ Lĩnh Sơn Tặc': 85, 'Chỉ Huy Sơn Tặc': 86,
  });
});

test('mobTypes: without the rest of its map a mob may be read two ways and is left out, unless another name has one of them', () => {
  // mob122100: Cóc Tía 11 from 2100, or type 121 from 100 (or Gà Điên 0 from 22100); alone, nothing settles it.
  assert.deepEqual(mobTypes({ M4: { mobs: [mob('Cóc Tía', '12', 2100, 5)] } }), {});
  // mob45500: type 44 from 500 or Sơn Tặc's 3 from 5500. Hổ Vằn mob570 is 56, never Sói Xám (4) from 70.
  assert.deepEqual(mobTypes({ M1: { mobs: [mob('Sơn Tặc', '4', 0, 5)] }, M5: { mobs: [mob('Báo Đốm', '45', 500, 6)] }, M9: { mobs: [mob('Hổ Vằn', '57', 0, 5), mob('Báo Đốm', '45', 500, 6)] } }),
    { 'Sơn Tặc': 3, 'Báo Đốm': 44, 'Hổ Vằn': 56 });
});

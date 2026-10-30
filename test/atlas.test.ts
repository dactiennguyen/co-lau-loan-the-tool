import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtures } from './fixtures.ts';
import { Reader, Writer } from '../src/protocol.ts';
import { mapData, mapEntities } from '../src/world.ts';
import { emptyAtlas, loadAtlas, saveAtlas, recordMap, recordMobs, recordBoss, recordPortal, recordRefusal, portalRefusal, destination, route } from '../src/atlas.ts';
import { MapScanner } from '../src/map-scan.ts';
import { mapPacket, mobsPacket, noticePacket } from './support/packets.ts';

const mp: Record<string, string> = fixtures['map-packets'];
const boss = { id: 'mob89100002', name: 'Hào Trưởng phía Bắc', level: 21, a: 0, b: 9, c: 1, d: 1 };

test('atlas: places of s2c/11, mob ids of s2c/43 by zone, bosses of s2c/1177; saved with one line per place', () => {
  const atlas = emptyAtlas();
  recordMap(atlas, mapData(Buffer.from(mp['s2c/11 M2'], 'hex')));
  recordMobs(atlas, 'M2', 0, mapEntities(mobsPacket('M2', [['mob80', 'Kẻ Quấy Phá', 20], ['mob81', 'Kẻ Quấy Phá', 20], ['mob51500', 'Sói Xám', 11]])).mobs);
  recordMobs(atlas, 'M2', 1, mapEntities(mobsPacket('M2', [['mob85', 'Kẻ Quấy Phá', 20], ['mob86', 'Kẻ Quấy Phá', 20], ['mob51506', 'Sói Xám', 11]])).mobs);
  recordBoss(atlas, 'M2', 1, { ...boss, id: 'mob89100102' }, [57, 12]);
  const m = atlas.maps.M2;
  assert.equal(m.name, 'Trại Vân Sơn');
  assert.deepEqual(m.places.filter(p => p.type === 2).map(p => p.id), [127, 141, 142]);
  assert.deepEqual(m.mobs, [{ name: 'Kẻ Quấy Phá', level: 20, ids: { 0: ['mob80', 'mob81'], 1: ['mob85', 'mob86'] } }, { name: 'Sói Xám', level: 11, ids: { 0: ['mob51500'], 1: ['mob51506'] } }]);
  assert.deepEqual(m.bosses, [{ name: 'Hào Trưởng phía Bắc', level: 21, ids: { 1: 'mob89100102' }, tile: { zone: 1, at: [57, 12] } }]);
  const path = join(mkdtempSync(join(tmpdir(), 'atlas-')), 'maps.json');
  saveAtlas(path, atlas);
  assert.deepEqual(loadAtlas(path), atlas);
  assert.match(readFileSync(path, 'utf8'), /\n {4}\{ "id": 127, "name": "Trại Chủ Phạm Hùng", "type": 2, "x": \d+, "y": \d+, "w": \d+, "h": \d+ \},?\n/);
});

test('atlas: portal refusals (level, quest), where a portal leads, and the shortest known way', () => {
  assert.deepEqual(portalRefusal('Bạn phải đạt cấp 40 mới vào được Lạc Cốc'), { level: 40, name: 'Lạc Cốc' });
  assert.equal(portalRefusal('Bạn cần hoàn thành nhiệm vụ trước khi tới đây'), undefined);
  const atlas = emptyAtlas();
  recordMap(atlas, mapData(mapPacket('M1', 'Làng Thanh Khê', [[1013, 'Lạc Cốc', 0], [1015, 'Vân Sơn', 0]])));
  recordMap(atlas, mapData(mapPacket('M2', 'Trại Vân Sơn', [[1013, 'Lạc Cốc', 0], [1014, 'Làng Thanh Khê', 0], [1024, 'Rìa Hồng Giang', 0]])));
  recordMap(atlas, mapData(mapPacket('M25', 'Rìa Hồng Giang', [[1016, 'Hồng Giang', 0], [1015, 'Vân Sơn', 0], [162, 'Tướng Quân Lê Viễn', 2]])));
  assert.equal(destination(atlas, { id: 1015, name: 'Vân Sơn' }, 'M1'), 'M2');
  assert.equal(destination(atlas, { id: 1016, name: 'Hồng Giang' }, 'M25'), undefined); // not M25 "Rìa Hồng Giang" itself
  assert.equal(recordRefusal(atlas, { id: 1013, name: 'Lạc Cốc' }, 'Bạn phải đạt cấp 40 mới vào được Lạc Cốc'), 40);
  recordRefusal(atlas, { id: 1016, name: 'Hồng Giang' }, 'Bạn cần hoàn thành nhiệm vụ trước khi tới đây');
  assert.deepEqual(atlas.portals, { 1013: { name: 'Lạc Cốc', level: 40 }, 1016: { name: 'Hồng Giang', refused: 'Bạn cần hoàn thành nhiệm vụ trước khi tới đây' } });
  recordPortal(atlas, 1016, { name: 'Hồng Giang', mapId: 'M4' });
  assert.deepEqual(atlas.portals[1016], { name: 'Hồng Giang', mapId: 'M4' });
  const npc162 = (m: { places: { id: number }[] }) => m.places.some(p => p.id === 162);
  assert.deepEqual(route(atlas, 'M1', npc162, 19), { id: 1015, name: 'Vân Sơn', type: 0, x: 0, y: 0, w: 32, h: 32 }); // M1 → M2 → M25
  assert.equal(route(atlas, 'M1', m => m.mapId === 'M2', 19, new Set([1015])), undefined);
});

/** Three maps of the live scan S1: M2 ↔ M1, M2 ↔ M25, and the three kinds of answer to c2s/13. */
const WORLD: Record<string, { name: string; index: number; places: [number, string, number][]; mobs: [string, string, number][] }> = {
  M2: { name: 'Trại Vân Sơn', index: 1, places: [[1, 'Bản đồ', 0], [1013, 'Lạc Cốc', 0], [1014, 'Làng Thanh Khê', 0], [1024, 'Rìa Hồng Giang', 0], [127, 'Trại Chủ Phạm Hùng', 2]], mobs: [['mob80', 'Kẻ Quấy Phá', 20]] },
  M1: { name: 'Làng Thanh Khê', index: 0, places: [[0, 'Bản đồ', 0], [1010, 'Cổ Phong', 0], [1013, 'Lạc Cốc', 0], [1015, 'Vân Sơn', 0], [129, 'Thành Chủ Nguyễn Khang', 2]], mobs: [['mob18', 'Gà Điên', 1]] },
  M25: { name: 'Rìa Hồng Giang', index: 24, places: [[1016, 'Hồng Giang', 0], [1015, 'Vân Sơn', 0], [162, 'Tướng Quân Lê Viễn', 2]], mobs: [] },
};
const PORTALS: Record<number, string> = { 1014: 'M1', 1015: 'M2', 1024: 'M25', 1013: 'Bạn phải đạt cấp 40 mới vào được Lạc Cốc',
  1010: 'Bạn phải đạt cấp 130 mới vào được Cổ Phong', 1016: 'Bạn cần hoàn thành nhiệm vụ trước khi tới đây' };

test('map scanner: visits every map it may enter, records refusals, walks back to the start, sends only c2s/11, 13, 43', async () => {
  const atlas = emptyAtlas(), sent: string[] = [];
  const scanner = new MapScanner({ atlas, log: () => {}, settleMs: 0, answerMs: 100 });
  let here = 'M2';
  const reply = (opcode: number, payload: Buffer) => scanner.onPacket(opcode, payload);
  const world = new Writer().u8(0).string('M99').i32(1).i32(0).string('M1');
  for (let i = 0; i < 26; i++) world.u8(0);
  const send = (opcode: number, payload: Uint8Array) => {
    const r = new Reader(payload), mapId = r.string();
    sent.push(opcode === 13 ? `13 ${r.i32()}` : `${opcode} ${mapId}`);
    if (opcode === 11) reply(11, mapId === 'M99' ? world.i32(0).build() : mapId === here ? mapPacket(here, WORLD[here].name, WORLD[here].places) : noticePacket('Không thể chuyển khu vực'));
    if (opcode === 43) reply(43, mobsPacket(here, WORLD[here].mobs));
    if (opcode === 13) {
      const to = PORTALS[Number(sent.at(-1)!.slice(3))];
      if (!WORLD[to]) return reply(1256, noticePacket(to));
      here = to; reply(13, new Writer().string(to).i32(WORLD[to].index).u8(0).u8(255).build());
    }
  };
  reply(11, mapPacket('M2', WORLD.M2.name, WORLD.M2.places));
  reply(43, mobsPacket('M2', WORLD.M2.mobs));
  scanner.onReady({ send, close: () => {}, user: { account: 'test', character: { level: 19 } as any } });
  await scanner.finished;
  assert.deepEqual([[...scanner.visited], here], [['M2', 'M1', 'M25'], 'M2']);
  assert.deepEqual(sent, ['11 M99', '13 1013', '13 1014', '11 M1', '43 M1', '13 1010', '13 1015', '11 M2', '43 M2', '13 1024', '11 M25', '43 M25', '13 1016', '13 1015', '11 M2', '43 M2']);
  assert.deepEqual(atlas.portals, { 1010: { name: 'Cổ Phong', level: 130 }, 1013: { name: 'Lạc Cốc', level: 40 }, 1014: { name: 'Làng Thanh Khê', mapId: 'M1' },
    1015: { name: 'Vân Sơn', mapId: 'M2' }, 1016: { name: 'Hồng Giang', refused: 'Bạn cần hoàn thành nhiệm vụ trước khi tới đây' }, 1024: { name: 'Rìa Hồng Giang', mapId: 'M25' } });
  assert.deepEqual(atlas.maps.M1.mobs, [{ name: 'Gà Điên', level: 1, ids: { 0: ['mob18'] } }]);
  assert.deepEqual(atlas.world, [{ mapId: 'M1', level: 0, locked: false }]);
});

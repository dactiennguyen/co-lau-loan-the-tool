import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './fixtures.ts';
import { buildRequest, decodeEvent } from '../src/events.ts';

const w: Record<string, { opcode: number; at: number; hex: string }> = fixtures.world;
const decode = (key: string) => {
  const d = decodeEvent(key.startsWith('c2s') ? 'c2s' : 's2c', w[key].opcode, Buffer.from(w[key].hex, 'hex'));
  assert.equal(d.opaqueBytes, 0, `${key}: every byte read`);
  return d.fields as any;
};

test('world map (c2s/11 "M99" → s2c/11 flag 0): 25 maps with lock flag and the level labels shown on screen', () => {
  assert.deepEqual(decode('c2s/11 M99'), { mapId: 'M99', area: 0, field: -1 }); // area is ff for a real map
  const { maps } = decode('s2c/11 M99');
  assert.equal(maps.length, 25);
  assert.deepEqual(maps[0], { index: 0, mapId: 'M1', locked: false, levelRequired: 0 });
  assert.deepEqual(maps.slice(1, 4).map((m: any) => [m.mapId, m.locked, m.levelRequired]), [['M2', true, 10], ['M3', true, 130], ['M4', true, 20]]);
  assert.equal(maps[24].mapId, 'M25');
});

test('zone list (c2s/1172 → s2c/1172): 100 zones of 20; zone 0 matches the "Dân số 19/20" cell', () => {
  assert.equal(buildRequest(1172).length, 0);
  const { zones } = decode('s2c/1172');
  assert.equal(zones.length, 100);
  assert.ok(zones.every((z: any, i: number) => z.zone === i && z.capacity === 20));
  assert.deepEqual(zones[0], { zone: 0, load: 2, players: 19, capacity: 20 });
  assert.equal(zones.reduce((n: number, z: any) => n + z.players, 0), 33);
});

test('players snapshot s2c/1263: 18 others in zone 0, each with the s2c/1212 status appended', () => {
  const { players } = decode('s2c/1263');
  assert.equal(players.length, 18); // + own character = 19 in s2c/1172
  const kappa = players.find((p: any) => p.name === 'Kappa');
  assert.deepEqual([kappa.id, kappa.level, kappa.status.effects[0].effect], [896, 17, 9301]);
});

test('player enter/leave/gear/hp pushes share the player id', () => {
  const p = decode('s2c/1167');
  assert.deepEqual([p.name, p.id, p.level, p.hp, p.maxHp, p.x, p.y], ['boy2Nghin', 1332, 21, 165, 482, 566, 416]);
  assert.deepEqual(p.gear, [91100, 71300, 80000, -1, 0, 0]);
  assert.deepEqual(decode('s2c/1170'), { id: 1332 });
  assert.deepEqual(decode('s2c/1166'), { id: 1332, gear: [91100, 71300, 0, -1, 0, 0] });
  assert.deepEqual(decode('s2c/1253'), { id: 1332, level: 21, hp: 165, maxHp: 482, field: 0 });
  assert.deepEqual(decode('s2c/1212 list').effects, [{ a: 1, effect: 9302, b: 1 }]);
  assert.deepEqual(decode('s2c/1212 single'), { id: 458, mode: 0, effects: [{ a: 1, effect: 9301, b: 1 }] });
});

test('own move c2s/1169 comes back in s2c/1262 with the same x/y/state and flags as a bitmask', () => {
  const move = decode('c2s/1169'), tick = decode('s2c/1262 own');
  assert.equal(tick.tickMs, 100);
  const me = tick.players.find((p: any) => p.id === 155);
  assert.deepEqual([me.x, me.y, me.state], [move.x, move.y, move.state]);
  assert.equal(me.flags, move.flags[0] | move.flags[1] << 1 | move.flags[2] << 2 | move.flags[3] << 3);
});

test('world chat s2c/1205: sender id, name, text (server masks banned words)', () => {
  assert.deepEqual(decode('s2c/1205 a'), { senderId: 1129, name: 'NongDan', text: 'Thủ lĩnh sơn tặc ở đâu vậy mn' });
  assert.match(decode('s2c/1205 b').text, /^Nhận\*+$/);
  assert.deepEqual(decode('s2c/1205 c'), { senderId: 212, name: 'Luffy', text: 'S' });
});

test('ground items: 1182 adds (plain 88 B, gear 104 B), 1184 lists, 1183 removes by uuid; items expire after 600 s', () => {
  const gold = decode('s2c/1182 gold'), gear = decode('s2c/1182 gear');
  assert.deepEqual([gold.itemId, gold.quantity, gold.durability, gold.stats.length], [41, 123, -1, 0]);
  assert.deepEqual([gear.itemId, gear.durability, gear.grade, gear.stats], [312, 60, 2, [{ stat: 5, value: 6 }, { stat: 1, value: 10 }]]);
  assert.equal(Math.round((gold.expiresAt - w['s2c/1182 gold'].at) / 1000), 601);
  assert.equal(gear.x - gold.x, 64); // one drop, spread 32 units apart
  const { items } = decode('s2c/1184');
  assert.deepEqual(items.map((i: any) => i.itemId), [261, 412, 312, 41]);
  assert.match(decode('s2c/1183').uuid, /^[0-9a-f-]{36}$/);
  assert.match(decode('s2c/45').text, /^BOSS .+ đang ở Làng Thanh Khê: khu 0, 1/);
});

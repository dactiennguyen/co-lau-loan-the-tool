import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './fixtures.ts';
import { buildRequest, decodeEvent } from '../src/protocol/events.ts';
import { mapGrid, mapData, gearDurability, ZonePlayers, mapEntities, mapBoss, questData, characterExtra, inventory, groundItems, groundDrop, characterTail, shopList, ranking, gearUpdate, itemUsed } from '../src/protocol/world.ts';
import { market } from '../src/protocol/market.ts';
import { v007Packets } from './fixtures-v007.ts';
import { mapPrefix, Writer } from '../src/protocol/protocol.ts';

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

test('ZonePlayers: s2c/1263 sets the others of the zone, 1170 removes, 1167 adds back, 1253 updates the level', () => {
  const zone = new ZonePlayers(), on = (key: string) => zone.on(w[key].opcode, Buffer.from(w[key].hex, 'hex'));
  assert.equal(on('s2c/1263'), true);
  assert.equal(zone.players.size, 18);
  assert.equal(zone.list()[0].level, Math.max(...[...zone.players.values()].map(p => p.level)));
  assert.equal(on('s2c/1170'), true);
  assert.equal(zone.players.has(1332), false);
  assert.equal(on('s2c/1170'), false); // already gone
  on('s2c/1167');
  assert.deepEqual(zone.players.get(1332), { id: 1332, name: 'boy2Nghin', level: 21 });
  assert.equal(on('s2c/1253'), true);
  assert.equal(zone.players.size, 18);
  assert.equal(zone.on(1262, Buffer.alloc(0)), false);
  // A packet that does not parse leaves the list as it was.
  const cut = Buffer.from(w['s2c/1263'].hex, 'hex').subarray(0, 100);
  assert.throws(() => zone.on(1263, cut));
  assert.equal(zone.players.size, 18);
});

test('ZonePlayers.list orders names by code point, as Rust does (not by UTF-16 unit)', () => {
  const zone = new ZonePlayers();
  for (const [id, name] of [[1, '\u{1F600}x'], [2, '\uFF21y'], [3, 'b'], [4, 'A']] as const) zone.players.set(id, { id, name, level: 5 });
  zone.players.set(5, { id: 5, name: 'z', level: 9 });
  assert.deepEqual(zone.list().map(p => p.id), [5, 4, 3, 2, 1]);
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
  assert.deepEqual([gear.itemId, gear.durability, gear.element, gear.stats], [312, 60, 2, [{ stat: 5, value: 6 }, { stat: 1, value: 10 }]]);
  assert.equal(Math.round((gold.expiresAt - w['s2c/1182 gold'].at) / 1000), 601);
  assert.equal(gear.x - gold.x, 64); // one drop, spread 32 units apart
  const { items } = decode('s2c/1184');
  assert.deepEqual(items.map((i: any) => i.itemId), [261, 412, 312, 41]);
  assert.match(decode('s2c/1183').uuid, /^[0-9a-f-]{36}$/);
  assert.match(decode('s2c/45').text, /^BOSS .+ đang ở Làng Thanh Khê: khu 0, 1/);
});

const mp: Record<string, string> = fixtures['map-packets'];
const decodeMap = (key: string) => {
  const d = decodeEvent(key.startsWith('c2s') ? 'c2s' : 's2c', Number(key.split(/[/ ]/)[1]), Buffer.from(mp[key], 'hex'));
  assert.equal(d.opaqueBytes, 0, `${key}: every byte read`);
  return d.fields as any;
};

test('s2c/11 of M2 is read to its last byte: grids, then the NPCs and portals of the map (B5)', () => {
  const m = decodeMap('s2c/11 M2');
  assert.deepEqual([m.mapId, m.name, m.dimension1, m.dimension2, m.layers], ['M2', 'Trại Vân Sơn', 35, 90, [3150, 3150]]);
  assert.deepEqual(m.places.map((p: any) => [p.id, p.name, p.type]), [[1, 'Bản đồ', 0], [1013, 'Lạc Cốc', 0], [1014, 'Làng Thanh Khê', 0],
    [1017, 'Tân Trạch', 0], [1024, 'Rìa Hồng Giang', 0], [127, 'Trại Chủ Phạm Hùng', 2], [141, 'Võ Quan Đinh Mộc', 2], [142, 'Dân Phu Vân Sơn', 2]]);
  assert.deepEqual(m.places[5], { id: 127, name: 'Trại Chủ Phạm Hùng', type: 2, x: 1600, y: 800, w: 32, h: 32, flag: 0, p: 110180, q: 110181 });
});

test('s2c/11 grids of M2: 35 rows × 90 columns of 32 units; places and the character inside them, ground drawn in the last rows', () => {
  const p = Buffer.from(mp['s2c/11 M2'], 'hex'), g = mapGrid(p), m = mapData(p), at = mapPrefix(p);
  assert.deepEqual([g.rows, g.cols, g.tiles.length, g.decoration.length, g.collision.length], [35, 90, 3150, 3150, 3150]);
  assert.ok(m.places.every(pl => pl.x >= 0 && pl.x + pl.w <= g.cols * 32 && pl.y >= 0 && pl.y + pl.h <= g.rows * 32));
  assert.deepEqual([Math.min(...m.places.filter(pl => pl.type === 0 && pl.id > 1000).map(pl => pl.x)), Math.max(...m.places.map(pl => pl.x + pl.w))], [32, 2880]);
  assert.ok(at.x < g.cols * 32 && at.y < g.rows * 32);
  assert.ok(g.tiles.slice(31 * 90).every(Boolean)); // rows 31–34: ground, drawn on every column
  const count = (v: number) => g.collision.filter(x => x === v).length;
  assert.deepEqual([count(0), count(1), count(2)], [182, 2937, 31]);
  assert.ok(g.tiles.slice(30 * 90 + 4, 30 * 90 + 18).every(Boolean) && g.collision.slice(30 * 90 + 4, 30 * 90 + 18).every(v => v !== 1)); // a platform run of row 30
});

test('portal and boss requests: c2s/13 with a portal id, s2c/13 with the new map, c2s/1178 for a boss (B4, B5)', () => {
  assert.deepEqual(decodeMap('c2s/13 portal 1015'), { mapId: 'M1', npcId: 1015 });
  assert.equal(buildRequest(13, { mapId: 'M1', npcId: 1015 }).toString('hex'), mp['c2s/13 portal 1015']);
  assert.deepEqual(decodeMap('s2c/13 portal'), { mapId: 'M2', mapIndex: 1, extra: [0, 255] }); // M2 is entry 1 of the world map
  assert.deepEqual(decodeMap('c2s/1178'), { mobId: 'mob86100201', flag: 0 });
  assert.equal(buildRequest(1178, { mobId: 'mob86100201' }).toString('hex'), mp['c2s/1178']);
  assert.deepEqual(decodeMap('s2c/1201 boss damage'), { progress: 363 });
});

test('s2c/36 is the durability of the 8 gear slots: ff for an empty slot, else the slot byte and an i32 (B1, Đầu hàng, Q2, G2)', () => {
  const read = (hex: string) => gearDurability(Buffer.from(hex.replace(/ /g, ''), 'hex')).slots;
  // B1 after the win over Gà Điên, and after an Đầu hàng (07-auto-battle): the hat alone, 49 then 47.
  assert.deepEqual(read('00000008 00000000 31 ffffffffffffff'), [{ slot: 0, durability: 49 }, null, null, null, null, null, null, null]);
  assert.equal(read('00000008 00000000 2f ffffffffffffff')[0]?.durability, 47);
  // G2 (6 battles of manina at level 22, all the same): the slot byte is the slot; the weapon is broken.
  assert.deepEqual(read('00000008 00 00000037 01 0000003c 02 00000000 ffffffffff'), [{ slot: 0, durability: 55 }, { slot: 1, durability: 60 }, { slot: 2, durability: 0 }, null, null, null, null, null]);
  // Q2 measured 20 bytes with byte 8 at 39 and the i32 at offset 11 at 50: the hat, and the weapon of slot 2.
  const q2 = read('00000008 00 00000027 ff 02 00000032 ffffffffff');
  assert.deepEqual(q2.map(s => s?.durability ?? null), [39, null, 50, null, null, null, null, null]);
  const d = decodeEvent('s2c', 36, Buffer.from('0000000800000000' + '31ffffffffffffff', 'hex'));
  assert.equal(d.opaqueBytes, 0);
  assert.throws(() => read('00000008 00000000 31 ffffffffff'), /length/);
});

/** A player record in the layout of APK 1.1.0 (20/11): two bytes (0, weapon element) between the gear and the appearance. */
function record110(name: string, element: number, withWeaponBytes = true) {
  const w = new Writer().u8(element).string(name).i32(22).string(name).u8(element).u8(0);
  [5, 207, 214, 2, 100].forEach(v => w.i32(v));
  w.u8(0).u8(0).i32(1407).i32(640);
  [90200, 70100, 82500, 0, 0, 0].forEach(v => w.i32(v));
  if (withWeaponBytes) w.u8(0).u8(element);
  w.i32(3).i32(50400).i32(0).u8(8).bytes(Buffer.alloc(36)).i32(0).bytes(Buffer.alloc(0)).i32(0).u8(0);
  for (let i = 0; i < 10; i++) w.i32(0);
  w.i32(99000).u8(0).i32(0).string('').u8(0).u8(0);
  return w.i32(22).u8(1).u8(0).i32(0).u8(0).build(); // + the s2c/1212 status
}

test('s2c/1263 of APK 1.1.0: the two bytes before the appearance are read, records of 1.0.3 still read', () => {
  const both = Buffer.concat([Buffer.from([0, 2]), record110('Moi', 4), record110('Cu', 1, false)]);
  const { players } = decodeEvent('s2c', 1263, both).fields as any;
  assert.deepEqual(players.map((p: any) => [p.name, p.level, p.x, p.weapon]), [['Moi', 5, 1407, { plus: 0, element: 4 }], ['Cu', 5, 1407, undefined]]);
  assert.equal(decodeEvent('s2c', 1263, both).opaqueBytes, 0);
});

/** A mob of s2c/43 as the server sends it to a client of protocol 0.0.2, or of 0.0.7 with its 9 more bytes (VG1, 20/11). */
const mob = (w: Writer, id: string, extended: boolean) => {
  w.string(id).string('Heo Mọi').i32(7).u8(2).i32(3).i32(1).u8(0);
  return extended ? w.u8(1).i32(1).u8(0).u8(42).u8(0).u8(20) : w;
};

test('s2c/43, s2c/1177 and s2c/39 read the layout of protocol 0.0.7 (VG1) and of 0.0.2', () => {
  for (const extended of [false, true]) {
    const w = new Writer().string('M1').u8(3); mob(w, 'mob2814', extended); mob(w, 'mob2914', extended);
    const e = mapEntities(w.build());
    assert.deepEqual(e.mobs.map(m => [m.id, m.level, m.tile]), [['mob2814', 7, extended ? [42, 20] : undefined], ['mob2914', 7, extended ? [42, 20] : undefined]]);
    const b = new Writer().string('M1').u8(0); mob(b, 'mob1', false); b.u8(1).i32(38).i32(6); if (extended) b.u8(7).i32(85);
    const boss = mapBoss(b.build()) as { mob?: { id: string }; tile?: [number, number] };
    assert.deepEqual([boss.mob?.id, boss.tile], ['mob1', [38, 6]]);
    const q = new Writer().i32(2).string('Trở Về Thanh Khê').string('').string('main').i32(0).i32(0).i32(2);
    // A kind 0 step (7 bytes) and a talk (11 bytes), as quest 3 of the bot's 0.0.7 login (20/11).
    const extras = ['00ffffffff0000', '0100000066000100000000'];
    for (const [i, npc] of [[0, -1], [1, 102]]) { q.i32(i).string('Bước').i32(npc).i32(1).i32(npc); if (extended) q.chunks.push(Buffer.from(extras[i], 'hex')); }
    const quest = questData(q.build());
    assert.deepEqual(quest.steps.map(s => [s.npcId, s.extra]), [[-1, extended ? extras[0] : undefined], [102, extended ? extras[1] : undefined]]);
  }
});

test('c2s/1284 and s2c/1284: the chat block list asked for before c2s/9 (VG1)', () => {
  assert.equal(buildRequest(1284, {}).toString('hex'), '00');
  assert.deepEqual(decodeEvent('s2c', 1284, Buffer.alloc(8)).fields, { a: 0, b: 0, message: '', players: [] });
  const list = new Writer().u8(0).u8(0).string('').u8(0).u8(1).i32(77).string('akaito').build();
  assert.deepEqual(decodeEvent('s2c', 1284, list).fields, { a: 0, b: 0, message: '', players: [{ id: 77, name: 'akaito' }] });
});

test('the bot declaring protocol 0.0.7 (20/11): every item has two more bytes before its stat count, mobs their tile', () => {
  const v = (k: string) => Buffer.from(v007Packets[k], 'hex');
  const sword = characterExtra(v('s2c/42 bag')).items[0];
  assert.deepEqual([sword.itemId, sword.field5, sword.stats], [246, 0, [{ stat: 5, value: 8 }, { stat: 8, value: 2 }]]);
  assert.ok(inventory(v('s2c/1187 bag')).items.every(i => i.field5 === 0));
  assert.equal(groundItems(v('s2c/1184 ground')).items.length, 5);
  assert.equal(groundDrop(v('s2c/1182 drop')).itemId, 41);
  assert.equal(characterTail(v('s2c/9')).faction, '');
  assert.deepEqual(mapEntities(v('s2c/43 M1')).mobs[0].tile, [5, 10]);
  assert.deepEqual(questData(v('s2c/39 quest3')).steps.map(s => s.extra!.slice(0, 2)), ['00', '01', '00', '00', '02', '01']);
  const boss = mapBoss(v('s2c/1177 boss')) as { mob: { name: string; e?: number; f?: number }; tile: [number, number] };
  assert.deepEqual([boss.mob.name, boss.mob.e, boss.mob.f, boss.tile], ['Thủ Lĩnh Sơn Tặc', 7, 85, [89, 13]]);
});

test('protocol 0.0.7: Chợ trời has the element in each listing, the shop 2 more bytes a line, BXH a time per row', () => {
  const v = (k: string) => Buffer.from(v007Packets[k], 'hex');
  const weapons = market(v('s2c/1192 Vũ Khí'));
  assert.ok(weapons.kind === 1);
  const [lamDu] = weapons.listings;
  assert.deepEqual([lamDu.itemId, lamDu.element, lamDu.durability, lamDu.quality, lamDu.price, lamDu.stats.length], [270, 2, 60, 1, 1000, 2]);
  const stones = market(v('s2c/1192 Đá Quý'));
  assert.ok(stones.kind === 1);
  assert.deepEqual(stones.listings.map(l => [l.itemId, l.element, l.quantity]), [[415, 255, 4], [416, 255, 1], [413, 255, 1]]);
  const shop = shopList(v('s2c/1190 Vũ khí Xu'));
  assert.equal(shop.items.length, 26);
  assert.deepEqual(shop.items[0], { shopId: 263, itemId: 246, currency: 0, price: 310, durability: -1, quantity: 1, flag: 1, element: 1, ranges: [{ stat: 5, min: 7, max: 11 }] });
  assert.deepEqual(ranking(v('s2c/1254 Sứ quân trống')), { kind: 1, tab: 1, rows: [], own: { rank: -1, field: 0, level: 0, reachedAt: 0 } });
  const worn = gearUpdate(v('s2c/37 mặc Nón Lá')).gear;
  assert.deepEqual([worn.length, worn[0]?.itemId, worn[0]?.field5], [10, 48, 0]);
  assert.ok(gearUpdate(v('s2c/37 cởi Nón Lá')).gear.every(g => g === null));
});

test('s2c/84: Tăng Kinh Nghiệm used, the slot left empty and x2 EXP for 24 hours (U2)', () => {
  const p = Buffer.from(v007Packets['s2c/84 dùng Tăng Kinh Nghiệm'], 'hex');
  assert.deepEqual(itemUsed(p), { slot: 16, left: 0, field: 256, name: 'akaito', effects: [{ key: 'ef7', rate: 200000, field: 0, remainingMs: 86_400_000 }] });
  assert.equal(decodeEvent('s2c', 84, p).opaqueBytes, 0);
});

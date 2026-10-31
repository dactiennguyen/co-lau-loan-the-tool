import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fixtures } from './fixtures.ts';
import { Writer } from '../src/protocol.ts';
import { characterExtra, characterGear, characterTail, currencies, gearUpdate, groundItems } from '../src/world.ts';
import { QuestBot } from '../src/quest.ts';
import { decodeAsset, Items, parseItemTable, parseStatTable, RETIRED } from '../src/items.ts';
import { MapScanner } from '../src/map-scan.ts';
import { buildRequest, decodeEvent } from '../src/events.ts';
import { emptyAtlas } from '../src/atlas.ts';

const items = Items.load();

test('it1 and it0 layouts: every field in order, and no byte left over', () => {
  const it1 = new Writer().i32(1).i32(54).string('Nón Âu Lạc').string('').u8(0).i32(48).i32(90400).i32(0x01000000)
    .u8(1).u8(0).i32(1).u8(1).i32(60).i32(1).build();
  assert.deepEqual(parseItemTable(it1), [{ id: 54, name: 'Nón Âu Lạc', desc: '', type: 0, icon: 48, graphic: 90400, elementBits: 1,
    level: 1, gender: 0, stack: 1, e: 1, durability: 60, g: 1 }]);
  assert.throws(() => parseItemTable(Buffer.concat([it1, Buffer.from([0])])), /after the last item/);
  assert.deepEqual(parseStatTable(new Writer().i32(2).i32(6).string('# phòng thủ').i32(8).string('#% chí mạng').build()), { 6: '# phòng thủ', 8: '#% chí mạng' });
});

test('data/items.json: 646 items with id = index, names seen on the phone, 17 stat templates', () => {
  const { book } = items;
  assert.equal(book.items.length, 646);
  assert.ok(book.items.every((item, i) => item.id === i));
  assert.equal(book.items.filter(i => i.name !== RETIRED).length, 239);
  // Popups and quest rewards on the phone (E1, E2, s2c/35), and the ground-item ids of 13-drops-items.md.
  for (const [id, name] of [[0, 'Hoàn Linh Dược'], [1, 'Kim Đan Dược'], [2, 'Búa Sửa Chữa'], [3, 'Trứng Gà'], [41, 'Xu khóa'], [48, 'Nón Lá'],
    [54, 'Nón Âu Lạc'], [147, 'Áo Hào Kiệt'], [261, 'Rìu Âu Lạc'], [306, 'Nhẫn Trơn'], [412, 'Đá cấp 2'], [415, 'Đá cấp 5']] as const) assert.equal(items.name(id), name);
  assert.equal(Object.keys(book.stats).length, 17);
  assert.equal(items.name(9999), '#9999');
});

test('s2c/46 holds Xu, Xu khoá and Lượng as i64 (E1: 500, 7370, 0 like the Bản thân panel)', () => {
  assert.deepEqual(currencies(Buffer.from(fixtures.currencies['s2c/46 E1'], 'hex')), { label: 'update Xu', xu: 500, xuKhoa: 7370, luong: 0 });
  const a2 = fixtures.scenario.stages.flatMap((st: any) => st.responses ?? []).find((r: any) => r.opcode === 46)?.hex;
  if (a2) assert.equal(currencies(Buffer.from(a2, 'hex')).xuKhoa, 1260);
});

test('bag at login (s2c/42, E1) reads as the bag on the phone', () => {
  const bag = characterExtra(Buffer.from(fixtures['skills-items']['s2c/42 login'], 'hex'));
  assert.deepEqual(bag.items.map(i => items.describe(i)), ['Hoàn Linh Dược ×4', 'Đá cấp 2', 'Áo Hào Kiệt (+7 phòng thủ, +5 thân pháp)',
    'Nón Lá (+5 phòng thủ, +66 sinh lực)', 'Nhẫn Trơn (+9 sức tấn công, +1% chí mạng)', 'Đá cấp 5', 'Búa Sửa Chữa', 'Kim Đan Dược']);
});

test('gear slots of s2c/9: hat in slot 0 and weapon in slot 2 for manina (Lôi and Hỏa as their popups show), all 8 empty for the new character', () => {
  const gear = characterGear(Buffer.from(fixtures.profile['s2c/9 level 21'], 'hex'));
  assert.equal(gear.length, 8);
  assert.deepEqual(gear.map(g => g && `${g.slot} ${items.describe(g)} ${g.durability}`), ['0 Nón Âu Lạc (+4 phòng thủ, +58 sinh lực) 0', null,
    '2 Rìu Âu Lạc (+8 sức tấn công, +10 nội lực) 0', null, null, null, null, null]);
  assert.deepEqual(characterGear(Buffer.from(fixtures.profile['s2c/9 field01 4'], 'hex')), Array(8).fill(null));
  const events: Record<string, any>[] = [];
  new QuestBot({ maxFights: 1, items, log: e => events.push(e) }).onPacket(9, Buffer.from(fixtures.profile['s2c/9 level 21'], 'hex'));
  assert.deepEqual(events.find(e => e.event === 'gear')?.gear, ['0: Nón Âu Lạc (+4 phòng thủ, +58 sinh lực), hệ Lôi, độ bền 0/60', '2: Rìu Âu Lạc (+8 sức tấn công, +10 nội lực), hệ Hỏa, độ bền 0/60']);
});

test('offline assets: reverse the first 63 bytes, then AES-128-ECB; the real i0.dat starts with a 96 × 96 PNG', () => {
  // First 64 bytes of offline-a2/i0.dat (Hoàn Linh Dược) as pulled from the phone (31/10/2026).
  const head = Buffer.from('a22df3fe4403246b209d4fe48f511da87124735fd78433673d8850c95c0ed73dd60bb942dfb4ea0cbd2c57fb99aeb606a64a5c961c0c05831dd6db62da985676', 'hex');
  const png = decodeAsset(head, { padding: false });
  assert.equal(png.subarray(0, 16).toString('hex'), '89504e470d0a1a0a0000000d49484452');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [96, 96]);
  // Round trip with padding, through the same key: encrypt then reverse is what the game stores.
  const plain = Buffer.from('any asset body, not a multiple of sixteen bytes long');
  const key = Buffer.from([-88, 76, -38, -24, -40, 117, 124, 91, 41, -31, 88, -51, -50, -9, 14, -3].map(b => b & 255));
  const c = createCipheriv('aes-128-ecb', key, null), stored = Buffer.concat([c.update(plain), c.final()]);
  stored.subarray(0, 63).reverse();
  assert.deepEqual(decodeAsset(stored), plain);
});

test('data/icons holds a WebP icon for every item in use', () => {
  const missing = [...new Set(items.book.items.filter(i => i.name !== RETIRED).map(i => i.icon))]
    .filter(n => { const p = `data/icons/i${n}.webp`; return !existsSync(p) || readFileSync(p).subarray(8, 12).toString() !== 'WEBP'; });
  assert.deepEqual(missing, []);
});

test('map scanner names the items on the ground of each map (s2c/1184)', () => {
  const groundItem = (w: Writer, id: number, uuid: string, quantity: number, x: number, stats: [number, number][]) => {
    w.u8(0xfe).i32(id).string(uuid).i32(0).i32(stats.length ? 60 : -1).i32(quantity).u8(0).u8(stats.length ? 1 : 0xff).i32(0).u8(0).u8(stats.length ? 1 : 0).u8(stats.length);
    for (const [s, v] of stats) w.i32(s).i32(v);
    w.i32(x).i32(640).i32(0x1a1).i32(0);
  };
  const w = new Writer().string('M2').i32(2);
  groundItem(w, 41, 'f573bf90', 123, 1391, []); groundItem(w, 312, 'fdcdeddb', 1, 1455, [[5, 6], [1, 10]]);
  const payload = w.build(), events: Record<string, any>[] = [];
  assert.equal(groundItems(payload).items.length, 2);
  new MapScanner({ atlas: emptyAtlas(), log: e => events.push(e), items }).onPacket(1184, payload);
  assert.deepEqual(events.find(e => e.event === 'ground_items')?.items, ['Xu khóa ×123 @1391,640', 'Nhẫn Hào Kiệt (+6 sức tấn công, +10 cường lực) @1455,640']);
});

test('pickup on the phone (P3, Tiheo1 at M10): c2s/1188 carries the uuid of the chest, the server answers with money, a notice and the removal', () => {
  const uuid = 'cd89eb9a-24f3-4cfd-a3e2-66046f4b11f5', sent = '00000024' + Buffer.from(uuid).toString('hex');
  assert.equal(buildRequest(1188, { uuid }).toString('hex'), sent);
  assert.deepEqual(decodeEvent('c2s', 1188, Buffer.from(sent, 'hex')).fields, { uuid });
  // 52, 54 and 56 ms after it: s2c/46 (Xu, Xu khóa, Lượng), s2c/1256, s2c/1183 for the whole map.
  assert.deepEqual(decodeEvent('s2c', 1256, Buffer.from('000000002842e1baa16e2076e1bbab61206e68e1baad6e20c491c6b0e1bba36320343734205875206b68c3b361', 'hex')).fields?.text, 'Bạn vừa nhận được 474 Xu khóa');
  assert.deepEqual(decodeEvent('s2c', 1183, Buffer.from('000000034d3130' + sent, 'hex')).fields, { mapId: 'M10', uuid });
});

test('item actions on the phone (P4): equip and unequip c2s/1186, use c2s/84, repair c2s/48; the new gear in s2c/37', () => {
  assert.deepEqual([buildRequest(1186, { action: 1, slot: 5 }), buildRequest(1186, { action: 0, slot: 39 }), buildRequest(84, { slot: 3 }), buildRequest(48, { slot: 2 })]
    .map(b => b.toString('hex')), ['0100000005', '0000000027', '00000003', '0000000002']);
  assert.deepEqual(decodeEvent('c2s', 1186, Buffer.from('0100000005', 'hex')).fields, { action: 1, slot: 5 });
  const gear = (k: string) => gearUpdate(Buffer.from(fixtures.equip[k], 'hex')).gear.map(g => g && `${g.slot} ${items.describe(g)} +${g.field0}`);
  assert.deepEqual(gear('s2c/37 unequip pet'), ['0 Nón Hào Kiệt (+51 phòng thủ, +49 cường lực) +8', '1 Áo Thuật Sĩ (+52 phòng thủ, +547 sinh lực) +8',
    '2 Chiến Đao (+67 sức tấn công, +46 cường lực) +8', '3 Nhẫn Đại Hiệp (+56 sức tấn công, +57 cường lực) +8', null, null, null, null]);
  assert.equal(gear('s2c/37 equip pet')[5], '5 Thú cưng Chồn nhỏ (+19 cường lực) +0');
  assert.deepEqual(decodeEvent('s2c', 1186, Buffer.from('00000001', 'hex')).fields, { action: 1 });
});

test('K3 (bot TS, Tiheo2 at M1): far pickup to the bag (s2c/51), refusals, and Vứt bỏ = c2s/1186 action 2 (s2c/83)', () => {
  // s2c/51 after picking a Đá cấp 2 another player dropped 17 s before: the bag slot that now holds it.
  const slot51 = 'ffffffff0000000001060000019c0000002434336363626635352d356439372d346434312d393838342d32656263663039396366356300000000ffffffff0000000100ff00000000000000';
  const f = decodeEvent('s2c', 51, Buffer.from(slot51, 'hex')).fields as any;
  assert.deepEqual([f.a, f.b, f.flag, f.item.slot, items.describe(f.item), f.item.uuid], [-1, 0, 1, 6, 'Đá cấp 2', '43ccbf55-5d97-4d41-9884-2ebcf099cf5c']);
  // The same uuid again, and a drop of another player younger than ~16 s: s2c/1256 with field 1.
  const refusal = (text: string) => { const b = Buffer.from(text); return Buffer.concat([Buffer.from([1]), Buffer.from([0, 0, 0, b.length]), b]); };
  assert.deepEqual(decodeEvent('s2c', 1256, refusal('Không thể nhặt vật phẩm của người khác')).fields, { field: 1, text: 'Không thể nhặt vật phẩm của người khác' });
  // Vứt bỏ: com.g.c.sqbz.run1 calls sqlq.b45(2, slot); the server answers s2c/83 (slot, 0) and the item is gone.
  assert.equal(buildRequest(1186, { action: 2, slot: 4 }).toString('hex'), '0200000004');
  assert.deepEqual(decodeEvent('s2c', 83, Buffer.from('0000000400000000', 'hex')).fields, { slot: 4, value: 0 });
});

test('tail of s2c/9: the x2 EXP star (item 7, rate 200000, time left) and the faction; none for manina', () => {
  assert.deepEqual(characterTail(Buffer.from(fixtures.equip['s2c/9 symap'], 'hex')), { field: 1, appearanceBytes: 203,
    effects: [{ key: 'ef7', rate: 200000, field: 0, remainingMs: 13257567 }], factionField: 2, faction: 'Thiên Tôn', factionFlags: [1, 0] });
  assert.deepEqual(characterTail(Buffer.from(fixtures.profile['s2c/9 level 21'], 'hex')).effects, []);
  assert.match(items.get(7)!.desc, /^Tăng x2 kinh nghiệm trong 24 giờ/);
});

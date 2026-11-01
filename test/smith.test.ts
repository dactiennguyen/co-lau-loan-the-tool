import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, decodeEvent } from '../src/protocol/events.ts';
import { Items } from '../src/protocol/items.ts';
import { inventory } from '../src/protocol/world.ts';
import {
  putRequest, PUT_STACK, craftSlot, failLevel, charmUseful, charmFor, recipes, craftMaterials, iceHeld, serviceResult, itemCap,
} from '../src/protocol/npc.ts';
import { npcMenu } from '../src/protocol/world.ts';
import { SmithBot, type SmithTask } from '../src/bot/smith.ts';
import { Stop } from '../src/bot/steps.ts';
import { o1Packets as P } from './fixtures-o1.ts';

const items = Items.load();
const hex = (key: string) => Buffer.from(P[key], 'hex');

test('the O1 packets read to their last byte; c2s/97 has the kind the phone sends for charms and materials', () => {
  for (const key of Object.keys(P)) {
    const [direction, op] = key.split(' ')[0].split('/');
    const d = decodeEvent(direction as 'c2s' | 's2c', Number(op), hex(key));
    assert.equal(d.opaqueBytes, 0, key);
  }
  // The phone (O1): materials with kind 1 and the whole stack, the charm with kind 1, the ring with kind 0.
  assert.equal(putRequest(33, 86, PUT_STACK).toString('hex'), P['c2s/97 Quặng']);
  assert.equal(putRequest(37, 43, PUT_STACK).toString('hex'), P['c2s/97 Linh Thạch']);
  assert.equal(putRequest(20, 1, PUT_STACK).toString('hex'), P['c2s/97 bùa']);
  assert.equal(putRequest(19).toString('hex'), P['c2s/97 nhẫn']);
  assert.equal(buildRequest(97, { slot: 33, quantity: 86, kind: 1 }).toString('hex'), P['c2s/97 Quặng']);
  assert.deepEqual(decodeEvent('c2s', 97, hex('c2s/97 bùa')).fields, { key: '', from: 0, kind: 1, slot: 20, quantity: 1 });
});

test('s2c/92 of Chế tạo carries the Xu fee; s2c/1187 kind 4 is the one item added; s2c/91 with a charm has the charms left', () => {
  assert.deepEqual([craftSlot(hex('s2c/92 Quặng')).fee, craftSlot(hex('s2c/92 Quặng')).ready], [0, false]);
  assert.deepEqual([craftSlot(hex('s2c/92 Linh Thạch sẵn sàng')).fee, craftSlot(hex('s2c/92 Linh Thạch sẵn sàng')).ready], [2400, true]);
  const added = inventory(hex('s2c/1187 loại 4'));
  assert.deepEqual([added.kind, added.items.length, added.items[0].slot, items.name(added.items[0].itemId), added.items[0].field0], [4, 1, 19, 'Nhẫn Thái Cực', 0]);
  const won = serviceResult(hex('s2c/91 bùa thành công +5→+6')), lost = serviceResult(hex('s2c/91 bùa thất bại +7'));
  assert.deepEqual([won.ok, won.item.field0, won.received.map(i => [i.itemId, i.quantity])], [true, 6, [[35, 3]]]);
  assert.deepEqual([lost.ok, lost.item.field0, lost.received.map(i => [i.itemId, i.quantity])], [false, 7, [[35, 1]]]);
});

test('a failure falls back to +4, +8, +12, +14; a charm only where that loses levels, the lowest that covers the upgrade', () => {
  assert.deepEqual([0, 3, 4, 5, 7, 8, 9, 11, 12, 13, 14, 15].map(failLevel), [0, 3, 4, 4, 4, 8, 8, 8, 12, 12, 14, 14]);
  assert.deepEqual([3, 4, 5, 7, 8, 9, 12, 13, 14, 15].map(charmUseful), [false, false, true, true, false, true, false, true, false, true]);
  const bag = [{ slot: 1, itemId: 36 }, { slot: 2, itemId: 35 }];
  assert.equal(charmFor(bag, 7)?.slot, 2);                 // +7→+8: sơ cấp
  assert.equal(charmFor(bag, 8)?.slot, 1);                 // +8→+9: sơ cấp no longer covers it
  assert.equal(charmFor([{ slot: 1, itemId: 36 }], 5)?.slot, 1);
  assert.equal(charmFor(bag, 13), undefined);              // +13→+14 needs cao cấp
  assert.deepEqual([itemCap({ type: 3, level: 21 }), itemCap({ type: 0, level: 1 }), itemCap({ type: 4, level: 1 })], [8, 4, 16]);
});

test('the recipes come from the menu of the item kind; the materials from the largest stack', () => {
  const menu = npcMenu(hex('s2c/57 Nhẫn')), rs = recipes(menu);
  assert.deepEqual(rs.map(r => [r.tier, r.option, r.level, r.xu, r.materials.map(m => `${m.name} ${m.count}`).join(', ')]), [
    [1, 0, 21, 2400, 'Quặng Bậc 1 24, Linh Thạch Bậc 1 24'], [2, 1, 51, 26500, 'Quặng Bậc 2 24, Linh Thạch Bậc 2 24'], [3, 2, 101, 90000, 'Quặng Bậc 3 24, Linh Thạch Bậc 3 24']]);
  const ids: Record<string, number> = { 'Quặng Bậc 1': 598, 'Linh Thạch Bậc 1': 610 };
  const bag = [{ slot: 33, itemId: 598, quantity: 86 }, { slot: 34, itemId: 598, quantity: 10 }, { slot: 37, itemId: 610, quantity: 20 }];
  const { puts, missing } = craftMaterials(bag, rs[0], n => ids[n]);
  assert.deepEqual([puts.map(p => p.item.slot), missing], [[33], ['Linh Thạch Bậc 1 20/24']]);
  assert.equal(iceHeld(npcMenu(hex('s2c/57 Đổi Băng Tâm có 8')).text), 8);
});

// ---------------------------------------------------------------------------------------------------------------------
// The bot against a server that answers each packet with what O1 got.

import { bag42, money46, type BagEntry, type Expect, type Reply } from './support/packets.ts';

const AT = { mapId: 'M1', npcId: 161 };
const talk = (menu = 's2c/57 Pháp sư'): Expect => ({ op: 13, hex: buildRequest(13, AT).toString('hex'), reply: [[57, hex(menu)]] });
const choose = (option: number, ...reply: Reply[]): Expect => ({ op: 57, hex: buildRequest(57, { option, ...AT }).toString('hex'), reply });
const askBag = (bag: BagEntry[]): Expect => ({ op: 42, hex: buildRequest(42, { characterName: 'Ttuananh' }).toString('hex'), reply: [[42, bag42(bag)]] });

async function play(task: SmithTask, script: Expect[], { bag, money = money46(15_101_200, 15_996_432, 29_786), confirm = false, level = 31 }: { bag: BagEntry[]; money?: Buffer; confirm?: boolean; level?: number }) {
  const logs: Record<string, any>[] = [], errors: string[] = [], sent: string[] = [];
  const bot = new SmithBot({ items, confirm, waitMs: 300, settleMs: 5, log: e => logs.push(e) });
  bot.character = { name: 'Ttuananh', level };
  bot.onPacket(42, bag42(bag));
  bot.onPacket(46, money);
  const io = {
    send(op: number, payload: Uint8Array) {
      const h = Buffer.from(payload).toString('hex'), step = script.shift();
      sent.push(`c2s/${op} ${h}`);
      if (!step) return void errors.push(`unexpected c2s/${op} ${h}`);
      if (step.op !== op || (step.hex !== undefined && step.hex !== h)) errors.push(`expected c2s/${step.op} ${step.hex ?? ''}, got c2s/${op} ${h}`);
      setImmediate(() => { for (const [o, p] of step.reply) bot.onPacket(o, p); });
    },
  };
  let outcome: string | undefined, stop: string | undefined;
  try { outcome = await bot.run(task, io); } catch (error) { if (!(error instanceof Stop)) throw error; stop = error.message; }
  return { outcome, stop, logs, errors, sent, left: script, bot };
}

const RING = { slot: 19, itemId: 333, uuid: 'ring', field0: 5, field1: 0, element: 2 };
const STONES = [{ slot: 22, itemId: 416 }, { slot: 23, itemId: 416 }];
const openCareful = (): Expect[] => [talk(), choose(0, [57, hex('s2c/57 Nâng cấp')]), choose(1, [96, hex('s2c/96 Nâng cấp [cẩn thận] Ttuananh')])];
const putRing = (): Expect => ({ op: 97, hex: P['c2s/97 nhẫn'], reply: [[90, hex('s2c/90 nhẫn +5')], [1258, hex('s2c/1258 nhẫn +5')]] });
const putCharm = (): Expect => ({ op: 97, hex: P['c2s/97 bùa'], reply: [[90, hex('s2c/90 bùa +5→+6')]] });
const putStone = (slot: number, key: string): Expect => ({ op: 97, hex: putRequest(slot).toString('hex'), reply: [[90, hex(key)]] });

test('Nâng cấp [Cẩn thận] +5→+6 with a charm, as O1: the charm with kind 1, Bắt đầu, then the bag asked for again', async () => {
  const bag = [RING, { slot: 20, itemId: 35, quantity: 4 }, ...STONES];
  const after = [{ ...RING, field0: 6 }, { slot: 20, itemId: 35, quantity: 3 }, STONES[1]];
  const r = await play({ kind: 'upgrade', slot: 19, careful: true, rate: 80 }, [
    ...openCareful(), putRing(), putCharm(), putStone(22, 's2c/90 đá +5→+6 lần 1'),
    { op: 91, hex: '00000000', reply: [[46, hex('s2c/46 Lượng trước')], [91, hex('s2c/91 bùa thành công +5→+6')], [1258, hex('s2c/1258 nhẫn +6')], [46, hex('s2c/46 Xu khóa sau')]] },
    askBag(after),
  ], { bag, confirm: true });
  assert.deepEqual([r.errors, r.left.length, r.stop, r.outcome], [[], 0, undefined, 'done']);
  const plan = r.logs.find(e => e.event === 'plan')!;
  assert.deepEqual([plan.rate, plan.fee, plan.luong, plan.charm, plan.onFail, plan.stones], [82, { amount: 2910, money: 'xuKhoa' }, 10, 'Bùa bảo vệ sơ cấp ×4', 'giữ +5', ['Đá cấp 6']]);
  const result = r.logs.find(e => e.event === 'result')!;
  assert.deepEqual([result.ok, result.from, result.to, result.charmLeft, result.moneyAfter.xuKhoa], [true, 5, 6, 3, 15_990_612]);
  assert.equal(r.bot.bag.find(i => i.slot === 19)?.field0, 6);
});

test('a failed Bắt đầu ends the task without --tries: no second press, whatever --to asks', async () => {
  const bag = [RING, { slot: 20, itemId: 35, quantity: 4 }, ...STONES];
  const r = await play({ kind: 'upgrade', slot: 19, careful: true, rate: 80, to: 7 }, [
    ...openCareful(), putRing(), putCharm(), putStone(22, 's2c/90 đá +5→+6 lần 1'),
    { op: 91, hex: '00000000', reply: [[91, hex('s2c/91 bùa thất bại +7')]] },
    askBag([RING, { slot: 20, itemId: 35, quantity: 3 }, STONES[1]]),
  ], { bag, confirm: true });
  assert.deepEqual([r.errors, r.left.length], [[], 0]);
  assert.equal(r.logs.find(e => e.event === 'result')!.ok, false);
  assert.match(r.stop!, /^Nâng cấp thất bại, .* \+5; thêm --tries=N/);
  assert.equal(r.sent.filter(s => s.startsWith('c2s/91')).length, 1);
});

test('without --confirm the same upgrade stops right before Bắt đầu: nothing is spent', async () => {
  const r = await play({ kind: 'upgrade', slot: 19, careful: true, rate: 80 }, [...openCareful(), putRing(), putCharm(), putStone(22, 's2c/90 đá +5→+6 lần 1')],
    { bag: [RING, { slot: 20, itemId: 35, quantity: 4 }, ...STONES] });
  assert.deepEqual([r.errors, r.left.length, r.outcome], [[], 0, 'dry_run']);
  assert.ok(!r.sent.some(s => s.startsWith('c2s/91')));
});

test('Nâng cấp short of the rate stops at once; Hỏi giá opens the window again without the stone that did not raise it', async () => {
  const stones = (): Expect[] => [putStone(22, 's2c/90 đá +5→+6 lần 1'), putStone(23, 's2c/90 đá +5→+6 lần 2')];
  const bag = [RING, { slot: 20, itemId: 35, quantity: 4 }, ...STONES];
  const r = await play({ kind: 'upgrade', slot: 19, careful: true }, [...openCareful(), putRing(), putCharm(), ...stones()], { bag, confirm: true });
  assert.deepEqual([r.errors, r.left.length], [[], 0]);
  assert.ok(!r.logs.some(e => e.event === 'reopen'));
  assert.equal(r.stop, 'tỉ lệ cao nhất 82% thấp hơn --rate=100');
  assert.ok(!r.sent.some(s => s.startsWith('c2s/91')));
  const q = await play({ kind: 'quote', slot: 19, careful: true }, [
    ...openCareful(), putRing(), putCharm(), ...stones(),
    ...openCareful(), putRing(), putCharm(), putStone(22, 's2c/90 đá +5→+6 lần 1'),
  ], { bag });
  assert.deepEqual([q.errors, q.left.length, q.stop, q.outcome], [[], 0, undefined, 'done']);
  assert.ok(q.logs.some(e => e.event === 'reopen'));
  assert.deepEqual(q.logs.filter(e => e.event === 'plan').map(e => e.stones.length), [1]);
});

test('an upgrade a failure would lose levels on needs a charm: none in the bag stops before any stone', async () => {
  const r = await play({ kind: 'upgrade', slot: 19, careful: true }, [...openCareful(), putRing()], { bag: [RING, ...STONES], confirm: true });
  assert.deepEqual([r.errors, r.left.length], [[], 0]);
  assert.match(r.stop!, /tụt về \+4: cần Bùa bảo vệ.*--charm=never/);
});

const MATERIALS = [{ slot: 33, itemId: 598, quantity: 86, field1: 0 }, { slot: 37, itemId: 610, quantity: 43, field1: 0 }];
const openRings = (): Expect[] => [talk(), choose(3, [57, hex('s2c/57 Chế tạo')]), choose(1, [57, hex('s2c/57 Chế tạo trang bị')]), choose(3, [57, hex('s2c/57 Nhẫn')])];

test('Chế tạo trang bị, Nhẫn Bậc I as on the phone: each material with kind 1 and its whole stack, the ring in s2c/1187 kind 4', async () => {
  const made = inventory(hex('s2c/1187 loại 4')).items[0];
  const after = [{ slot: 19, itemId: 333, uuid: made.uuid, element: 2, stats: [[5, 12], [4, 20]] as [number, number][] }, { ...MATERIALS[0], quantity: 62 }, { ...MATERIALS[1], quantity: 19 }];
  const r = await play({ kind: 'craft', itemKind: 3, tier: 1 }, [
    ...openRings(), choose(0, [99, hex('s2c/99 Chế tạo trang bị')]),
    { op: 97, hex: P['c2s/97 Quặng'], reply: [[92, hex('s2c/92 Quặng')]] },
    { op: 97, hex: P['c2s/97 Linh Thạch'], reply: [[92, hex('s2c/92 Linh Thạch sẵn sàng')]] },
    { op: 91, hex: '00000000', reply: [[93, hex('s2c/93 Chế tạo')], [46, money46(15_098_800, 15_996_432, 29_786)], [1187, hex('s2c/1187 loại 4')], [1256, hex('s2c/1256 nhận Nhẫn')]] },
    askBag(after),
  ], { bag: MATERIALS, confirm: true });
  assert.deepEqual([r.errors, r.left.length, r.stop, r.outcome], [[], 0, undefined, 'done']);
  const result = r.logs.find(e => e.event === 'result')!;
  assert.deepEqual([result.ok, result.made, result.left, result.xuBefore - result.xuAfter],
    [true, ['Nhẫn Thái Cực (+12 sức tấn công, +20 thể lực), hệ Lôi, ô 19'], ['Quặng Bậc 1 ×62', 'Linh Thạch Bậc 1 ×19'], 2400]);
});

test('Chế tạo checks the level of the tier before opening its window; a message box (s2c/0) is a refusal', async () => {
  const low = await play({ kind: 'craft', itemKind: 3, tier: 2 }, openRings(), { bag: MATERIALS, confirm: true });
  assert.deepEqual([low.errors, low.left.length], [[], 0]);
  assert.match(low.stop!, /cần cấp 51, nhân vật cấp 31/);
  const refused = await play({ kind: 'craft', itemKind: 3, tier: 1 }, [
    ...openRings(), choose(0, [99, hex('s2c/99 Chế tạo trang bị')]), { op: 97, reply: [[0, hex('s2c/0 thiếu nguyên liệu')]] },
  ], { bag: MATERIALS, confirm: true });
  assert.match(refused.stop!, /server từ chối "Cần chọn đủ 2 loại nguyên liệu và Xu/);
  assert.ok(refused.logs.some(e => e.event === 'server_message'));
});

const ICE_BAG = [{ slot: 5, itemId: 21, quantity: 8 }];
const openIce = (): Expect[] => [talk(), choose(3, [57, hex('s2c/57 Chế tạo')]), choose(3, [57, hex('s2c/57 Đổi Băng Tâm có 8')])];

test('Đổi Băng Tâm: a dry run reads the count and leaves the first menu as the last one; --confirm picks the line', async () => {
  const dry = await play({ kind: 'ice', bottles: 1 }, [...openIce(), talk()], { bag: ICE_BAG });
  assert.deepEqual([dry.errors, dry.left.length, dry.outcome], [[], 0, 'dry_run']);
  assert.deepEqual(dry.logs.find(e => e.event === 'plan')!.held, 8);
  const done = await play({ kind: 'ice', bottles: 1 }, [
    ...openIce(), choose(0, [1256, hex('s2c/1256 Đã đổi')]), askBag([{ slot: 0, itemId: 16, quantity: 1, field1: 0 }]), talk(),
  ], { bag: ICE_BAG, confirm: true });
  assert.deepEqual([done.errors, done.left.length, done.outcome], [[], 0, 'done']);
  assert.deepEqual(done.logs.find(e => e.event === 'result'), { event: 'result', task: 'Đổi Băng Tâm', ok: true, text: 'Đã đổi 8 Băng Tâm lấy 1 Bình Huyết Linh (Rỗng)', ice: 0, bottles: 1 });
  const short = await play({ kind: 'ice', bottles: 5 }, [...openIce(), talk()], { bag: ICE_BAG, confirm: true });
  assert.deepEqual([short.errors, short.left.length, short.stop], [[], 0, 'cần 40 Băng Tâm, có 8']);
});

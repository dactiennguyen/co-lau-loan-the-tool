import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './fixtures.ts';
import { Writer } from '../src/protocol.ts';
import { decodeEvent } from '../src/events.ts';
import { QuestBot, stepAction } from '../src/quest.ts';
import { mapPacket, mobsPacket, noticePacket } from './support/packets.ts';

const q: Record<string, string> = fixtures.quest;
const mp: Record<string, string> = fixtures['map-packets'];
const bossPacket = (field: 0 | 1) => field === 1 ? new Writer().string('M1').u8(1).string('mob86100001').build()
  : new Writer().string('M1').u8(0).string('mob86100001').string('Thủ Lĩnh Sơn Tặc').i32(11).u8(0).i32(9).i32(1).u8(1).u8(1).i32(85).i32(5).build();
const quest7 = () => new Writer().i32(7).string('Quét Sạch Sơn Trại').string('').string('main').i32(1).i32(0).i32(2)
  .i32(0).string('Đánh bại Chỉ Huy Sơn Tặc').i32(87).i32(1).i32(-1)
  .i32(1).string('Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc').i32(0).i32(500).i32(-1).build();
const recorder = (sent: { opcode: number; hex: string }[]) => ({ send: (opcode: number, payload: Uint8Array) => sent.push({ opcode, hex: Buffer.from(payload).toString('hex') }), close: () => {}, user: { account: 'test' } });
const decode = (opcode: number, key: string) => {
  const d = decodeEvent('s2c', opcode, Buffer.from(q[key], 'hex'));
  assert.equal(d.opaqueBytes, 0, `${key}: every byte read`);
  return d.fields as any;
};

test('quest packets: s2c/39 steps with NPC ids and kill counts, s2c/34 dialogue, s2c/35 rewards', () => {
  const q3 = decode(39, 's2c/39 quest3'), q4 = decode(39, 's2c/39 quest4');
  assert.deepEqual([q3.id, q3.title, q3.type, q3.current], [3, 'Những Việc Đầu Tiên', 'main', 5]);
  assert.deepEqual(q3.steps[1], { index: 1, text: 'Nói chuyện với Hương Lão Trần Bá', param: 102, required: 1, npcId: 102 });
  assert.deepEqual(q4.steps.map((s: any) => [s.text, s.required, s.npcId]),
    [['Đạt cấp độ 4', 1, -1], ['Nói chuyện với Bà Tư Hạnh', 1, 103], ['Tiêu diệt Heo Mọi', 10, -1], ['Báo cáo với Bà Tư Hạnh', 1, 103]]);
  assert.equal(decode(34, 's2c/34 dialogue').questId, 4);
  assert.deepEqual(decode(35, 's2c/35').rewards, ['127 kinh nghiệm', '660 Xu khóa', '1 Áo Hào Kiệt', '1 Nón Lá']);
});

test('ranking s2c/1254: tab list, top 100 with the own rank, faction tab', () => {
  assert.deepEqual(decode(1254, 's2c/1254 tabs').tabs.map((t: any) => t.title), ['Cao thủ', 'Sứ quân']);
  const top = decode(1254, 's2c/1254 tab0');
  assert.deepEqual([top.rows.length, top.rows[0].name, top.rows[0].level, top.own.rank, top.own.level], [100, 'thuytoc', 118, 1094, 4]);
  const factions = decode(1254, 's2c/1254 tab1');
  assert.deepEqual([factions.rows.map((r: any) => r.name), factions.own.rank], [['Thiên Tôn', 'WATER7', 'CỜ LAU', 'ALIBABA'], -1]);
});

test('stepAction: every step text of quests 3–8', () => {
  const steps: [string, number, unknown][] = [
    ['Tiêu diệt Heo Mọi', -1, { kind: 'kill', mob: 'Heo Mọi' }],
    ['Tiêu diệt 1 Sói Xám', -1, { kind: 'kill', mob: 'Sói Xám' }],
    ['Đánh bại Kẻ Gây Rối', -1, { kind: 'kill', mob: 'Kẻ Gây Rối' }],
    ['Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc', -1, { kind: 'damage', mob: 'Thủ Lĩnh Sơn Tặc', amount: 500 }],
    ['Đạt cấp độ 8', -1, { kind: 'level', level: 8 }],
    ['Nâng điểm tiềm năng', -1, { kind: 'stat' }],
    ['Báo cáo với Bà Tư Hạnh', 103, { kind: 'talk', npcId: 103 }],
    ['Thu thập 5 Da Heo', -1, { kind: 'unknown' }],
  ];
  for (const [text, npcId, action] of steps) assert.deepEqual(stepAction({ text, npcId }), action, text);
});

test('quest bot: a damage step challenges the boss of s2c/1177 with c2s/1178, not c2s/15', () => {
  const sent: { opcode: number; hex: string }[] = [];
  const bot = new QuestBot({ maxFights: 1, log: () => {} });
  bot.onPacket(29, new Writer().string('manina').string('M1').i32(0).build());
  bot.onPacket(43, new Writer().string('M1').u8(3).string('mob872600').string('Chỉ Huy Sơn Tặc').i32(10).u8(2).i32(6).i32(1).u8(2).build());
  bot.onPacket(1177, bossPacket(0));
  bot.onPacket(39, quest7());
  bot.onReady(recorder(sent));
  assert.deepEqual(sent.at(-1), { opcode: 1178, hex: new Writer().string('mob86100001').i32(0).build().toString('hex') });
  (bot as any).stop('test done');
});

test('quest bot: a boss between s2c/1177 field 1 and field 0 is waited for, not searched in another map', () => {
  const sent: { opcode: number; hex: string }[] = [], events: string[] = [];
  const bot = new QuestBot({ maxFights: 1, log: e => events.push(String(e.event)) });
  bot.onPacket(11, mapPacket('M1', 'Làng Thanh Khê', [[1015, 'Vân Sơn', 0]]));
  bot.onPacket(43, new Writer().string('M1').u8(3).build());
  bot.onPacket(1177, bossPacket(0));
  bot.onPacket(1177, bossPacket(1));
  bot.onPacket(39, quest7());
  bot.onReady(recorder(sent));
  assert.deepEqual([sent.length, events.at(-1)], [0, 'waiting_for_mob']);
  bot.onPacket(1177, bossPacket(0));
  bot.next();
  assert.equal(sent.at(-1)?.opcode, 1178);
  (bot as any).stop('test done');
});

test('quest bot: an NPC in another map is reached through the portal the quest names (c2s/13 portal → s2c/13 → c2s/11 → c2s/43)', () => {
  const sent: { opcode: number; hex: string }[] = [];
  const bot = new QuestBot({ maxFights: 1, log: () => {} });
  const quest = new Writer().i32(8).string('Tìm Đến Vân Sơn').string('').string('main').i32(1).i32(0).i32(2)
    .i32(1).string('Nói chuyện với Thành Chủ Nguyễn Khang').i32(129).i32(1).i32(129)
    .i32(2).string('Gặp Trại Chủ Phạm Hùng').i32(127).i32(1).i32(127);
  bot.onPacket(29, new Writer().string('manina').string('M1').i32(0).build());
  bot.onPacket(11, mapPacket('M1', 'Làng Thanh Khê', [[1015, 'Vân Sơn', 0], [129, 'Thành Chủ Nguyễn Khang', 2]]));
  bot.onPacket(43, new Writer().string('M1').u8(3).build());
  bot.onPacket(39, quest.build());
  bot.onReady(recorder(sent));
  assert.deepEqual(sent.at(-1), { opcode: 13, hex: mp['c2s/13 portal 1015'] });
  bot.onPacket(13, Buffer.from(mp['s2c/13 portal'], 'hex'));
  assert.deepEqual(sent.at(-1), { opcode: 11, hex: new Writer().string('M2').u8(-1).i32(-1).build().toString('hex') });
  bot.onPacket(11, Buffer.from(mp['s2c/11 M2'], 'hex'));
  assert.deepEqual(sent.at(-1), { opcode: 43, hex: new Writer().string('M2').build().toString('hex') });
  bot.onPacket(43, new Writer().string('M2').u8(3).build());
  bot.next();
  assert.deepEqual(sent.at(-1), { opcode: 13, hex: new Writer().string('M2').i32(127).build().toString('hex') });
  (bot as any).stop('test done');
});

test('quest bot: talk step sends c2s/13, the NPC reply advances to the kill step, which challenges a matching mob', () => {
  const sent: { opcode: number; hex: string }[] = [];
  const bot = new QuestBot({ maxFights: 1, log: () => {} });
  const mobs = new Writer().string('M1').u8(3);
  for (const [id, name] of [['mob10', 'Gà Điên'], ['mob2806', 'Heo Mọi']]) mobs.string(id).string(name).i32(7).u8(0).i32(0).i32(0).u8(0);
  bot.onPacket(29, new Writer().string('manina').string('M1').i32(0).build());
  bot.onPacket(43, mobs.build());
  bot.onPacket(39, Buffer.from(q['s2c/39 quest4'], 'hex')); // current step 1: "Nói chuyện với Bà Tư Hạnh"
  bot.onReady({ send: (opcode, payload) => sent.push({ opcode, hex: Buffer.from(payload).toString('hex') }), close: () => {}, user: { account: 'test' } });
  assert.deepEqual(sent.at(-1), { opcode: 13, hex: new Writer().string('M1').i32(103).build().toString('hex') });
  bot.onPacket(34, Buffer.from(q['s2c/34 dialogue'], 'hex'));
  assert.equal(bot.quest!.current, 2);
  bot.next();
  assert.deepEqual(sent.at(-1), { opcode: 15, hex: new Writer().string('mob2806').u8(0).build().toString('hex') });
  bot.options.maxFights = 0; // stop timers
  (bot as any).stop('test done');
});

test('quest bot: --once plays the talk step and stops at the NPC reply instead of challenging for the kill step', () => {
  const sent: { opcode: number; hex: string }[] = [], events: Record<string, unknown>[] = [];
  const bot = new QuestBot({ maxFights: 5, once: true, log: e => events.push(e) });
  bot.onPacket(29, new Writer().string('manina').string('M1').i32(0).build());
  bot.onPacket(43, new Writer().string('M1').u8(3).string('mob2806').string('Heo Mọi').i32(7).u8(0).i32(0).i32(0).u8(0).build());
  bot.onPacket(39, Buffer.from(q['s2c/39 quest4'], 'hex')); // current step 1: "Nói chuyện với Bà Tư Hạnh"
  bot.onReady(recorder(sent));
  assert.deepEqual(sent.map(s => s.opcode), [13]);
  bot.onPacket(34, Buffer.from(q['s2c/34 dialogue'], 'hex'));
  clearTimeout((bot as any).wait);
  bot.next();
  assert.deepEqual(sent.map(s => s.opcode), [13]);
  assert.deepEqual([events.at(-1)?.event, events.at(-1)?.reason, events.at(-1)?.step], ['stop', 'step done', 'Nói chuyện với Bà Tư Hạnh']);
});

test('quest bot: --once on a kill step whose count is reached stops there rather than going on to the report', () => {
  const sent: { opcode: number; hex: string }[] = [], events: Record<string, unknown>[] = [];
  const bot = new QuestBot({ maxFights: 5, once: true, log: e => events.push(e) });
  bot.onPacket(29, new Writer().string('manina').string('M2').i32(0).build());
  bot.quest = { id: 9, title: 'Thử Sức Tân Binh', description: '', type: 'main', current: 0, progress: 15,
    steps: [{ index: 0, text: 'Tiêu diệt Cóc Xanh', param: 5, required: 15, npcId: -1 }, { index: 1, text: 'Báo cáo với Võ Quan Đinh Mộc', param: 141, required: 1, npcId: 141 }] };
  bot.onReady(recorder(sent));
  assert.deepEqual([sent.length, bot.quest.current, events.at(-1)?.event, events.at(-1)?.step], [0, 1, 'stop', 'Tiêu diệt Cóc Xanh']);
});

test('quest bot: a portal the server refuses (s2c/1256) goes to the atlas with its level and the next portal is tried', () => {
  const sent: { opcode: number; hex: string }[] = [], events: Record<string, unknown>[] = [];
  const bot = new QuestBot({ maxFights: 1, log: e => events.push(e) });
  const quest = new Writer().i32(10).string('Tìm Tướng Quân').string('').string('main').i32(0).i32(0).i32(1)
    .i32(0).string('Gặp Tướng Quân Lê Viễn').i32(162).i32(1).i32(162);
  bot.onPacket(11, mapPacket('M2', 'Trại Vân Sơn', [[1, 'Bản đồ', 0], [1013, 'Lạc Cốc', 0], [1024, 'Rìa Hồng Giang', 0], [141, 'Võ Quan Đinh Mộc', 2]]));
  bot.onPacket(39, quest.build());
  bot.onReady(recorder(sent));
  assert.deepEqual(sent.at(-1), { opcode: 13, hex: new Writer().string('M2').i32(1013).build().toString('hex') });
  bot.onPacket(1256, noticePacket('Bạn phải đạt cấp 40 mới vào được Lạc Cốc'));
  assert.deepEqual(bot.atlas.portals[1013], { name: 'Lạc Cốc', level: 40 });
  assert.equal(events.at(-1)?.event, 'portal_refused');
  clearTimeout((bot as any).wait);
  bot.next();
  assert.deepEqual(sent.at(-1), { opcode: 13, hex: new Writer().string('M2').i32(1024).build().toString('hex') });
  (bot as any).stop('test done');
});

test('quest bot: --farm challenges a boss with c2s/1178, waits while it changes tiles, and goes on after losing to it', () => {
  const sent: { opcode: number; hex: string }[] = [], events: string[] = [];
  const bot = new QuestBot({ maxFights: 5, maxLosses: 1, restMs: 60000, farm: 'Thủ Lĩnh Sơn Tặc', log: e => events.push(String(e.event)) });
  bot.onPacket(29, new Writer().string('manina').string('M1').i32(0).build());
  bot.onPacket(43, new Writer().string('M1').u8(3).build());
  bot.onPacket(1177, bossPacket(0));
  bot.onReady(recorder(sent));
  assert.deepEqual(sent.at(-1), { opcode: 1178, hex: new Writer().string('mob86100001').i32(0).build().toString('hex') });
  (bot as any).onBattleEnd({ won: false, actor: 'mob86100001', exp: 0, coin: 0, myTurns: 12, hp: 0, mobId: 'mob86100001', damage: 140 });
  assert.deepEqual([events.includes('stop'), events.at(-1)], [false, 'boss_loss']);
  bot.onPacket(1177, bossPacket(1));
  bot.next();
  assert.deepEqual([sent.length, events.at(-1)], [1, 'waiting_for_mob']);
  (bot as any).stop('test done');
});

test('quest bot: --max-losses lets a kill step go on after a lost battle, and stops at the limit', () => {
  const events: string[] = [];
  const bot = new QuestBot({ maxFights: 10, maxLosses: 2, restMs: 60000, log: e => events.push(String(e.event)) });
  bot.onPacket(29, new Writer().string('manina').string('M2').i32(0).build());
  bot.onPacket(43, new Writer().string('M2').u8(3).string('mob61000').string('Cóc Xanh').i32(13).u8(0).i32(6).i32(1).u8(0).build());
  bot.quest = { id: 9, title: 'Thử Sức Tân Binh', description: '', type: 'main', current: 0, progress: 2, steps: [{ index: 0, text: 'Tiêu diệt Cóc Xanh', param: 5, required: 15, npcId: -1 }] };
  const loss = { won: false, actor: 'mob61000', exp: 0, coin: 0, myTurns: 27, hp: 0, mobId: 'mob61000', damage: 214 };
  (bot as any).onBattleEnd(loss);
  assert.deepEqual([events.includes('stop'), events.includes('kill_counted'), bot.quest.progress], [false, false, 2]); // a loss kills nothing
  (bot as any).onBattleEnd(loss);
  assert.equal(events.at(-1), 'stop');
});

/** s2c/22 against Cóc Xanh (mob61000) in the layout of battle.ts, with a captured board (as src/export-rust.ts builds it);
 * battleSetup reads the uuid from a tail of fixed length, so it has the 36 characters of a real one. */
const UUID = '3f1c2a9e-6b1d-4c55-9a27-0d3e4b5c6d7e';
const cocXanhSetup = () => {
  const setup = new Writer().u8(1).u8(0).string('manina').string('manina').u8(0).u8(0).u8(0).i32(21).i32(0).u8(0).i32(150).i32(180)
    .string('mob61000').string('Cóc Xanh').i32(13).i32(249).i32(249).string(UUID).i32(64).bytes(Buffer.alloc(0)).build();
  return Buffer.concat([setup.subarray(0, setup.length - 4), Buffer.from(fixtures.battles[0].board as number[]), Buffer.from([30, 0])]);
};
const bp: Record<string, string> = fixtures['battle-packets'];
/** A QuestBot in M2 with --surrender-after=1, in a Cóc Xanh battle where its first swap has just gone out. */
const surrendering = () => {
  const sent: { opcode: number; hex: string }[] = [], events: Record<string, unknown>[] = [];
  const bot = new QuestBot({ maxFights: 5, surrenderAfter: 1, log: e => events.push(e) });
  bot.api = recorder(sent);
  bot.onPacket(29, new Writer().string('manina').string('M2').i32(0).build());
  bot.onPacket(43, mobsPacket('M2', [['mob61000', 'Cóc Xanh', 13]]));
  bot.onPacket(22, cocXanhSetup());
  bot.onPacket(18, Buffer.from(bp['s2c/18'], 'hex'));
  bot.onPacket(24, Buffer.from(bp['s2c/24 own turn'], 'hex'));
  return { bot, sent, events };
};

test('quest bot: --surrender-after leaves with c2s/11 then c2s/40, moves no more, reloads the map, and stops on s2c/1214', () => {
  const { bot, sent, events } = surrendering();
  assert.deepEqual(sent.map(s => s.opcode), [18, 14, 19, 11, 40]);
  assert.deepEqual(sent.slice(-2).map(s => s.hex), [new Writer().string('M2').u8(-1).i32(-1).build().toString('hex'), new Writer().string(UUID).build().toString('hex')]);
  bot.onPacket(24, Buffer.from(bp['s2c/24 mob turn'], 'hex'));
  assert.equal(sent.length, 5, 'no step request while leaving');
  // The order of the game's Đầu hàng (06-map-mobs): s2c/11, then c2s/43; s2c/10; s2c/1214.
  bot.onPacket(11, mapPacket('M2', 'Trại Vân Sơn', []));
  assert.deepEqual(sent.at(-1), { opcode: 43, hex: new Writer().string('M2').build().toString('hex') });
  assert.ok(bot.battle?.leaving, 's2c/11 answers our c2s/11, it does not end the battle');
  bot.onPacket(1214, Buffer.alloc(0));
  assert.equal(bot.battle, undefined);
  assert.deepEqual(events.filter(e => ['surrender', 'battle_left', 'stop'].includes(String(e.event))).map(e => [e.event, e.by ?? e.reason ?? '']),
    [['surrender', ''], ['battle_left', 's2c/1214'], ['stop', 'surrendered']]);
});

test('quest bot: a surrender not taken in 8 s plays the turn passed over meanwhile, and a late s2c/1214 still ends the battle', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { bot, sent, events } = surrendering();
  bot.onPacket(24, Buffer.from(bp['s2c/24 mob turn'], 'hex'));
  assert.equal(sent.length, 5);
  t.mock.timers.tick(8000);
  assert.ok(events.some(e => e.event === 'surrender_no_answer'));
  assert.deepEqual([sent.at(-1)!.opcode, decodeEvent('c2s', 14, Buffer.from(sent.at(-1)!.hex, 'hex')).fields], [14, { battleUuid: UUID, seq: 4 }]);
  assert.equal(bot.battle?.leaving, false);
  bot.onPacket(1214, Buffer.alloc(0));
  assert.equal(bot.battle, undefined);
  assert.deepEqual(events.filter(e => e.event === 'battle_left' || e.event === 'stop').map(e => e.by ?? e.reason), ['s2c/1214', 'surrendered']);
});

test('quest bot: --surrender-after stops after the battle even when it ends before the surrender is taken', () => {
  const { bot, events } = surrendering();
  const end = new Writer().i32(2).i32(0).i32(0).i32(2).i32(2).i32(2).i32(3).i32(1).bytes(Buffer.alloc(0)).u8(0).u8(0).u8(0).u8(0)
    .u8(1).string('mob61000').i32(29).u8(0).i32(0).i32(-1).i32(-1).u8(0).u8(0).u8(0).u8(1).string('manina').u8(1).u8(1).i32(8).i32(4).build();
  bot.onPacket(19, end);
  assert.deepEqual([bot.battle, events.at(-1)?.event, events.at(-1)?.reason], [undefined, 'stop', 'battle over without the surrender']);
});

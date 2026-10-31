import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './fixtures.ts';
import { Reader, Writer, characterSkills } from '../src/protocol/protocol.ts';
import { buildRequest, decodeEvent } from '../src/protocol/events.ts';
import { skillTable, inventory, characterExtra, questData, characterStats, POTENTIALS } from '../src/protocol/world.ts';
import { QuestBot, stepAction, statPlan } from '../src/bot/quest.ts';
import { Items } from '../src/protocol/items.ts';
import { mapPacket, mobsPacket, noticePacket } from './support/packets.ts';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

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
    ['Sử dụng điểm kỹ năng', -1, { kind: 'skill' }],
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

/** s2c/22 against Cóc Xanh (mob61000) in the layout of battle.ts, with a captured board (as src/cli/export-rust.ts builds it);
 * battleSetup reads the uuid from a tail of fixed length, so it has the 36 characters of a real one. */
const UUID = '3f1c2a9e-6b1d-4c55-9a27-0d3e4b5c6d7e';
const cocXanhSetup = () => {
  const setup = new Writer().u8(1).u8(0).string('manina').string('manina').u8(0).u8(0).u8(0).i32(21).i32(0).u8(0).i32(150).i32(180)
    .string('mob61000').string('Cóc Xanh').u8(1).u8(0).u8(4).i32(13).i32(100000).u8(0).i32(249).i32(249).string(UUID).i32(64).bytes(Buffer.alloc(0)).build();
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
  const end = new Writer().i32(2).i32(0).i32(0).i32(2).i32(2).i32(2).i32(3).i32(1).bytes(Buffer.alloc(0))
    .u8(1).string('mob61000').i32(29).u8(0).i32(0).i32(-1).i32(-1).u8(0).u8(0).u8(0).u8(1).string('manina').u8(1).u8(1).i32(8).i32(4).build();
  bot.onPacket(19, end);
  assert.deepEqual([bot.battle, events.at(-1)?.event, events.at(-1)?.reason], [undefined, 'stop', 'battle over without the surrender']);
});

test('quest bot: with record, a battle becomes one file: header with both elements, its packets, a turn note, the end', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dir = mkdtempSync(join(tmpdir(), 'cllt-quest-record-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sent: { opcode: number; hex: string }[] = [], events: Record<string, unknown>[] = [];
  const bot = new QuestBot({ maxFights: 1, record: { dir, tags: { bot: 'test' } }, log: e => events.push(e) });
  bot.api = recorder(sent);
  bot.onPacket(9, hex(fixtures.profile['s2c/9 level 21'])); // manina, Hỏa
  bot.onPacket(29, new Writer().string('manina').string('M2').i32(0).build());
  bot.onPacket(43, mobsPacket('M2', [['mob61000', 'Cóc Xanh', 13]]));
  bot.onPacket(1263, Buffer.alloc(0)); // outside the battle: not kept
  bot.onPacket(22, cocXanhSetup());
  bot.onPacket(18, Buffer.from(bp['s2c/18'], 'hex'));
  bot.onPacket(24, Buffer.from(bp['s2c/24 own turn'], 'hex'));
  const end = new Writer().i32(2).i32(0).i32(0).i32(2).i32(2).i32(2).i32(3).i32(1).bytes(Buffer.alloc(0))
    .u8(1).string('mob61000').i32(29).u8(0).i32(0).i32(-1).i32(-1).u8(0).u8(0).u8(0).u8(1).string('manina').u8(1).u8(1).i32(8).i32(4).build();
  bot.onPacket(19, end);
  bot.onPacket(36, Buffer.from('00000008' + 'ff'.repeat(8), 'hex')); // durability: 8 empty slots
  bot.onPacket(1214, Buffer.alloc(0));
  const saved = events.filter(e => e.event === 'battle_recorded');
  assert.equal(saved.length, 1, JSON.stringify(events.filter(e => String(e.event).startsWith('battle_record'))));
  const lines: any[] = gunzipSync(readFileSync(String(saved[0].file))).toString('utf8').trimEnd().split('\n').map(l => JSON.parse(l));
  const h = lines[0];
  assert.deepEqual([h.kind, h.bot, h.character, h.element, h.elementName, h.level, h.mob.name, h.mob.element, h.mob.elementName, h.mob.level, h.mob.maxHp, h.map],
    ['header', 'test', 'manina', 1, 'Hỏa', 21, 'Cóc Xanh', 4, 'Thủy', 13, 249, 'M2']);
  assert.equal(h.combat.length, 5);
  assert.deepEqual(lines.slice(1).map(l => Array.isArray(l) ? l[1] : l.note ?? l.kind),
    ['s2c/22', 'c2s/18', 's2c/18', 'c2s/14', 's2c/24', 'turn', 'c2s/19', 's2c/19', 'estimates', 'end', 's2c/36', 's2c/1214']);
  assert.equal(lines.find(l => Array.isArray(l) && l[1] === 'c2s/19')[2], sent.find(s => s.opcode === 19)!.hex, 'the swap as sent');
  assert.deepEqual([lines.at(-3).kind, lines.at(-3).won], ['end', true]);
});

const si: Record<string, string> = fixtures['skills-items'];
const hex = (h: string) => Buffer.from(h, 'hex');
const a2Response = (opcode: number) => fixtures.scenario.stages.flatMap((st: any) => st.responses ?? []).find((r: any) => r.opcode === opcode).hex as string;
/** Quest 3 of the L1 capture with "Sử dụng điểm kỹ năng" as the current step. */
const quest3AtSkill = () => ({ ...questData(hex(q['s2c/39 quest3'])), current: 3 });
const quest3Reply = () => new Writer().i32(0).string('subtask 1').i32(3).string('').build();

test('skill and item packets: s2c/30 tree, s2c/9 skill list, s2c/10 kind 32, s2c/1191, the bag of s2c/42 and s2c/1187, c2s/48 (E1, E2)', () => {
  const tree = skillTable(hex(a2Response(30))).skills;
  assert.deepEqual(tree.map(k => [k.id, k.prerequisite, k.levels.length]), [[1000, -1, 20], [1001, 1000, 20], [1002, 1001, 20], [1003, 1000, 20], [1004, 1003, 20], [1005, 1004, 20], [1006, 1000, 20], [1007, 1006, 20], [1008, 1007, 20]]);
  assert.equal(tree[3].name, 'Liệt Hỏa Chi Kiếm');
  assert.deepEqual(tree[3].levels[0], { level: 1, description: tree[3].levels[0].description, cost: 2, requiredLevel: 10, mana: 50 });
  assert.deepEqual(tree[0].levels.slice(0, 5).map(l => l.requiredLevel), [2, 7, 12, 17, 22]);
  assert.deepEqual(decodeEvent('s2c', 30, hex(a2Response(30))).opaqueBytes, 0);
  assert.deepEqual(characterSkills(hex(fixtures.profile['s2c/9 level 21'])).slice(0, 2), [{ id: 1000, level: 1, mana: 25, flag: 255 }, { id: 1001, level: 0, mana: 0, flag: 255 }]);
  assert.deepEqual(characterSkills(hex(fixtures.profile['s2c/9 field01 4'])).map(k => k.id), [4000, 4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008]);
  const k32 = decodeEvent('s2c', 10, hex(si['s2c/10 kind 32']));
  assert.equal(k32.opaqueBytes, 0);
  assert.deepEqual((k32.fields as any).skills.slice(0, 2), [{ id: 1000, level: 2 }, { id: 1001, level: 0 }]);
  assert.deepEqual(decodeEvent('s2c', 1191, hex(si['s2c/1191'])).fields, { statPoints: 68, skillPoints: 18 });
  const login = characterExtra(hex(si['s2c/42 login'])), after = inventory(hex(si['s2c/1187 after repair']));
  assert.deepEqual([login.label, login.capacity, login.items.map(i => i.itemId)], ['test dong 1', 42, [0, 412, 147, 48, 306, 415, 2, 1]]);
  // The repair used the only Búa sửa chữa (item 2, slot 6); the rest of the bag is unchanged.
  assert.deepEqual([after.kind, after.capacity, after.items.map(i => i.itemId)], [1, 42, [0, 412, 147, 48, 306, 415, 1]]);
  assert.deepEqual([after.items[0].quantity, after.items[0].durability, after.items[2].durability, after.items[2].stats], [4, -1, 60, [{ stat: 6, value: 7 }, { stat: 3, value: 5 }]]);
  assert.equal(decodeEvent('s2c', 42, hex(a2Response(42))).opaqueBytes, 0);
  assert.deepEqual(decodeEvent('c2s', 48, hex(si['c2s/48 repair hat'])).fields, { where: 0, slot: 0 });
  assert.equal(buildRequest(48, { slot: 0 }).toString('hex'), si['c2s/48 repair hat']);
  assert.equal(buildRequest(1191, { skillId: 1000, amount: 1 }).toString('hex'), '000003e800000001');
});

test('quest bot logs the bag by item name when it changes (s2c/1187 after the repair, E2)', () => {
  const events: Record<string, any>[] = [];
  new QuestBot({ maxFights: 1, items: Items.load(), log: e => events.push(e) }).onPacket(1187, hex(si['s2c/1187 after repair']));
  assert.deepEqual(events.find(e => e.event === 'inventory')?.items, ['Hoàn Linh Dược ×4', 'Đá cấp 2', 'Áo Hào Kiệt (+7 phòng thủ, +5 thân pháp)',
    'Nón Lá (+5 phòng thủ, +66 sinh lực)', 'Nhẫn Trơn (+9 sức tấn công, +1% chí mạng)', 'Đá cấp 5', 'Kim Đan Dược']);
});

test('quest bot: "Sử dụng điểm kỹ năng" sends c2s/1191 for the first skill that can take a level, and --once stops at the reply', () => {
  const sent: { opcode: number; hex: string }[] = [], events: Record<string, unknown>[] = [];
  const bot = new QuestBot({ maxFights: 5, once: true, log: e => events.push(e) });
  bot.onPacket(9, hex(fixtures.profile['s2c/9 level 21'])); // level 21, Hỏa Cầu Thuật 1, 19 skill points
  bot.onPacket(30, hex(a2Response(30)));
  bot.onPacket(29, new Writer().string('manina').string('M1').i32(0).build());
  bot.quest = quest3AtSkill();
  bot.onReady(recorder(sent));
  assert.deepEqual(sent, [{ opcode: 1191, hex: '000003e800000001' }]);
  assert.deepEqual(bot.upgradable().map(k => k.id), [1000, 1001, 1003, 1006]);
  bot.onPacket(10, hex(si['s2c/10 kind 32']));
  bot.onPacket(1191, hex(si['s2c/1191']));
  assert.deepEqual([bot.skillLevels.get(1000), bot.skillPoints], [2, 18]);
  bot.onPacket(34, quest3Reply());
  clearTimeout((bot as any).wait);
  bot.next();
  assert.deepEqual(sent.map(s => s.opcode), [1191]);
  assert.deepEqual([events.at(-1)?.event, events.at(-1)?.reason, events.at(-1)?.step], ['stop', 'step done', 'Sử dụng điểm kỹ năng']);
});

test('quest bot: no skill that can take a level stops without sending; a point used without a quest reply stops too', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sent: { opcode: number; hex: string }[] = [], events: Record<string, unknown>[] = [];
  // A2: level 3 with Hỏa Cầu Thuật 1 and 1 point; its level 2 needs level 7, the other roots level 10.
  const stuck = new QuestBot({ maxFights: 5, log: e => events.push(e) });
  stuck.onPacket(9, hex(a2Response(9)));
  stuck.onPacket(30, hex(a2Response(30)));
  stuck.quest = quest3AtSkill();
  stuck.onReady(recorder(sent));
  assert.deepEqual([sent.length, events.at(-1)?.event, events.at(-1)?.reason], [0, 'stop', 'no skill can take a level now']);
  const bot = new QuestBot({ maxFights: 5, log: e => events.push(e) });
  bot.onPacket(9, hex(fixtures.profile['s2c/9 level 21']));
  bot.onPacket(30, hex(a2Response(30)));
  bot.quest = quest3AtSkill();
  bot.onReady(recorder(sent));
  bot.onPacket(1191, hex(si['s2c/1191']));
  t.mock.timers.tick(8000);
  assert.deepEqual([sent.map(s => s.opcode), events.at(-1)?.reason], [[1191], 'skill point used but the server did not advance the step']);
  t.mock.timers.tick(1000);
});

const sp: Record<string, string> = fixtures['stat-points'];
/** s2c/10 kind 8 as P1 got it, with `left` potential points. */
const pointsLeft = (left: number) => new Writer().i32(8).string('manina').i32(left).i32(16).i32(0).i32(21).string('421').string('125').build();
const statSends = (sent: { opcode: number; hex: string }[]) => sent.filter(s => s.opcode === 10).map(s => POTENTIALS[new Reader(hex(s.hex)).i32()].key);

test('potential points (P1): c2s/10 takes the + button row by row, s2c/10 kind 2 lists Thân Pháp before Nội Lực; --stats', () => {
  assert.equal(buildRequest(10, { stat: 2, amount: 1 }).toString('hex'), sp['c2s/10 than phap']);
  const k2 = characterStats(new Reader(hex(sp['s2c/10 kind 2']))), k4 = characterStats(new Reader(hex(sp['s2c/10 kind 4']))), k8 = characterStats(new Reader(hex(sp['s2c/10 kind 8'])));
  // Thân Pháp 10 → 11 sits in slot 1; the repaired hat counts from here: max HP 180 → 238.
  assert.deepEqual([k2.level, k2.stats!.slice(0, 4), POTENTIALS[2].slot], [21, [32, 11, 10, 30], 1]);
  assert.deepEqual([k4.hp, k4.maxHp, k4.extra!.slice(1, 6), k8.statPoints], [180, 238, [32, 9, 33, 22, 6], 67]);
  assert.deepEqual([statPlan('auto'), statPlan('than'), statPlan('cuong:3,than:1'), statPlan('noi,noi:2')], ['auto', [0, 0, 1, 0], [3, 0, 1, 0], [0, 3, 0, 0]]);
  assert.throws(() => statPlan('suc'), /--stats: "suc"/);
  assert.throws(() => statPlan('than:0'), /--stats/);
});

test('quest bot: --stats spends the points one c2s/10 at a time by weight, each after s2c/10 kind 8, then plays the step', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sent: { opcode: number; hex: string }[] = [], events: Record<string, unknown>[] = [];
  const bot = new QuestBot({ maxFights: 5, stats: [1, 0, 1, 0], log: e => events.push(e) });
  bot.onPacket(9, hex(fixtures.profile['s2c/9 level 21']));
  bot.onPacket(29, new Writer().string('manina').string('M1').i32(0).build());
  bot.quest = { ...questData(hex(q['s2c/39 quest3'])), current: 5 }; // the report: no "Nâng điểm tiềm năng" ahead
  bot.statPoints = 3;
  bot.onReady(recorder(sent));
  bot.next(); // a timer firing meanwhile sends nothing more
  assert.deepEqual(statSends(sent), ['cuong']);
  for (const left of [2, 1, 0]) { bot.onPacket(10, pointsLeft(left)); t.mock.timers.tick(250); }
  assert.deepEqual([statSends(sent), sent.at(-1)!.opcode], [['cuong', 'than', 'cuong'], 13]);
  assert.deepEqual(events.find(e => e.event === 'stat_points_spent')?.spent, 3);
  t.mock.timers.tick(8000);
});

test('quest bot: --stats=auto raises the main stat of the element and keeps a point for the "Nâng điểm tiềm năng" step ahead', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sent: { opcode: number; hex: string }[] = [], events: Record<string, unknown>[] = [];
  const bot = new QuestBot({ maxFights: 5, stats: 'auto', log: e => events.push(e) });
  bot.onPacket(9, hex(fixtures.profile['s2c/9 field01 4'])); // hệ Thủy, level 2, 4 points
  bot.onPacket(29, new Writer().string('nickthu2').string('M1').i32(0).build());
  bot.quest = { ...questData(hex(q['s2c/39 quest3'])), current: 1 };
  bot.onReady(recorder(sent));
  for (const left of [3, 2, 1]) { bot.onPacket(10, pointsLeft(left)); t.mock.timers.tick(250); }
  assert.deepEqual([statSends(sent), sent.at(-1)!.opcode], [['noi', 'noi', 'noi'], 13]);
  bot.onPacket(34, quest3Reply()); // the NPC answers: on to "Nâng điểm tiềm năng", which takes the kept point
  t.mock.timers.tick(1500);
  assert.deepEqual(statSends(sent), ['noi', 'noi', 'noi', 'noi']);
  assert.equal(events.findLast(e => e.event === 'stat_point')?.stat, 'Nội Lực');
  // An element of no known main stat spends nothing and says so once.
  const lost = new QuestBot({ maxFights: 5, stats: 'auto', log: e => events.push(e) }), none: typeof sent = [];
  lost.onPacket(9, hex(fixtures.profile['s2c/9 field01 4']));
  lost.element = 3; // no element has 3 (1 Hỏa, 2 Lôi, 4 Thủy)
  lost.quest = { ...questData(hex(q['s2c/39 quest3'])), current: 1 };
  lost.onReady(recorder(none));
  assert.deepEqual([statSends(none), none[0]?.opcode, events.filter(e => e.event === 'stat_plan_unknown_element').length], [[], 13, 1]);
  t.mock.timers.tick(10000);
});

test('quest bot logs Xu, Xu khóa and Lượng of s2c/46 (P3, after a pickup)', () => {
  const events: Record<string, any>[] = [];
  new QuestBot({ maxFights: 1, log: e => events.push(e) }).onPacket(46, Buffer.from('0000000975706461746520587500000000004ab2a80000000000539fdc0000000000002185', 'hex'));
  const currency = events.find(e => e.event === 'currency');
  assert.deepEqual(currency, { kind: 'quest', event: 'currency', at: currency?.at, xu: 4895400, xuKhoa: 5480412, luong: 8581 });
});

test('quest bot logs the x2 EXP star and the faction at login (s2c/9 tail, P4)', () => {
  const events: Record<string, any>[] = [];
  new QuestBot({ maxFights: 1, log: e => events.push(e) }).onPacket(9, Buffer.from(fixtures.equip['s2c/9 symap'], 'hex'));
  const effects = events.find(e => e.event === 'effects');
  assert.deepEqual(effects, { kind: 'quest', event: 'effects', at: effects?.at, effects: ['ef7 x2, còn 3h40'], faction: 'Thiên Tôn' });
});

test('quest bot: picks up the own drops of a won battle with c2s/1188, one every 200 ms, not older items nor after a loss', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const sent: { opcode: number; hex: string }[] = [], events: Record<string, unknown>[] = [];
  const bot = new QuestBot({ maxFights: 9, maxLosses: 9, restMs: 60000, items: Items.load(), log: e => events.push(e) });
  bot.api = recorder(sent);
  const w: Record<string, { hex: string }> = fixtures.world, gold = Buffer.from(w['s2c/1182 gold'].hex, 'hex'), gear = Buffer.from(w['s2c/1182 gear'].hex, 'hex');
  const GOLD = 'f573bf90-942b-48d1-b466-4552dfa4f7cb', GEAR = 'fdcdeddb-5213-4b53-b67b-8a82ed08815d';
  const pickup = (uuid: string) => ({ opcode: 1188, hex: buildRequest(1188, { uuid }).toString('hex') });
  const won = { won: true, actor: 'manina', exp: 30, coin: 20, myTurns: 9, hp: 100, mobId: 'mob61000', damage: 249 };
  bot.onPacket(1182, gear); // a stranger's item, 5 s before the battle end
  t.mock.timers.tick(5000);
  bot.onPacket(1182, gold);
  (bot as any).onBattleEnd(won);
  assert.deepEqual(sent, [pickup(GOLD)]);
  bot.onPacket(1182, gear); // 100 ms after the end: still the battle's
  t.mock.timers.tick(100);
  assert.equal(sent.length, 1);
  t.mock.timers.tick(100);
  assert.deepEqual(sent, [pickup(GOLD), pickup(GEAR)]);
  // The answer may come once the next step went for a portal: that portal was not refused.
  bot.travelling = { id: 1024, name: 'Trại Vân Sơn' };
  bot.onPacket(1256, noticePacket('Bạn vừa nhận được 123 Xu khóa'));
  assert.deepEqual([bot.travelling?.id, bot.refused.size], [1024, 0]);
  bot.travelling = undefined;
  bot.onPacket(1183, new Writer().string('M1').string(GOLD).build());
  bot.onPacket(1256, noticePacket('Không thể nhặt vật phẩm của người khác'));
  t.mock.timers.tick(10000);
  bot.onPacket(1183, new Writer().string('M1').string(GEAR).build()); // its owner took it 10 s later
  assert.deepEqual(events.filter(e => /^pick/.test(String(e.event))).map(e => [e.event, e.item ?? e.text]),
    [['pickup', 'Xu khóa ×123'], ['pickup', 'Nhẫn Hào Kiệt (+6 sức tấn công, +10 cường lực)'], ['pickup_notice', 'Bạn vừa nhận được 123 Xu khóa'], ['picked', 'Xu khóa ×123'],
      ['pickup_notice', 'Không thể nhặt vật phẩm của người khác']]);
  assert.equal(bot.picked, 1);
  t.mock.timers.tick(5000);
  bot.onPacket(1182, gold);
  (bot as any).onBattleEnd({ ...won, won: false, actor: 'mob61000', hp: 0 });
  t.mock.timers.tick(1000);
  assert.equal(sent.length, 2); // nothing falls for the loser
  (bot as any).stop('test done');
});

/** s2c/22 of a duel with Võ Quan Đinh Mộc as cocXanhSetup builds it, the NPC's block under `id` (mob880 in N3). */
const duelSetup = (id: string) => {
  const setup = new Writer().u8(1).u8(0).string('wangpt').string('wangpt').u8(0).u8(0).u8(2).i32(25).i32(0).u8(0).i32(184).i32(184)
    .string(id).string('Võ Quan Đinh Mộc').u8(1).u8(0).u8(1).i32(25).i32(100000).u8(0).i32(400).i32(400).string(UUID).i32(64).bytes(Buffer.alloc(0)).build();
  return Buffer.concat([setup.subarray(0, setup.length - 4), Buffer.from(fixtures.battles[0].board as number[]), Buffer.from([30, 0])]);
};
/** A QuestBot on M2 at step 3 of quest 12, "Tỷ thí với Võ Quan Đinh Mộc" (87, 1, NPC 141), as wangpt was at N1. */
const duelBot = () => {
  const sent: { opcode: number; hex: string }[] = [], events: Record<string, unknown>[] = [];
  const bot = new QuestBot({ maxFights: 10, restMs: 60000, log: e => events.push(e) });
  bot.onPacket(29, new Writer().string('wangpt').string('M2').i32(0).build());
  bot.onPacket(43, mobsPacket('M2', [['mob80', 'Kẻ Quấy Phá', 20]]));
  bot.onPacket(39, Buffer.from(q['s2c/39 quest12'], 'hex'));
  return { bot, sent, events };
};

test('quest 12 (N1): s2c/39 has the duel step as a talk step, s2c/57 is its dialog, c2s/57 answers it', () => {
  const quest = questData(Buffer.from(q['s2c/39 quest12'], 'hex'));
  assert.deepEqual([quest.id, quest.type, quest.current, quest.steps[2]], [12, 'main', 2, { index: 2, text: 'Tỷ thí với Võ Quan Đinh Mộc', param: 87, required: 1, npcId: 141 }]);
  assert.deepEqual(stepAction(quest.steps[2]), { kind: 'talk', npcId: 141 });
  assert.deepEqual(decode(57, 's2c/57 duel'), { npc: 'Võ Quan Đinh Mộc', text: 'Cậu đã sẵn sàng chiến đấu chưa.', options: [{ option: 0, label: 'Đồng ý' }, { option: 1, label: 'Từ chối' }] });
  assert.equal(buildRequest(57, { option: 1, mapId: 'M2', npcId: 141 }).toString('hex'), q['c2s/57 decline']);
  // After Đồng ý (N2, N3): the duel's mob, then the game's challenge of it.
  assert.deepEqual(decode(1180, 's2c/1180 duel'), { mapId: 'M2', npcId: 141, mob: { id: 'mob880', name: 'Võ Quan Đinh Mộc', level: 20, a: 0, b: 6, c: 1, d: 0 }, a: 2, b: 0 });
  assert.equal(buildRequest(1181, { mobId: 'mob880', npcId: 141 }).toString('hex'), q['c2s/1181 duel']);
});

test('quest bot: a talk step answered by a dialog says Đồng ý (c2s/57), challenges the mob of s2c/1180 with c2s/1181, plays the duel, and moves on at s2c/34', () => {
  const { bot, sent, events } = duelBot();
  bot.onReady(recorder(sent));
  assert.deepEqual(sent.at(-1), { opcode: 13, hex: new Writer().string('M2').i32(141).build().toString('hex') });
  bot.onPacket(57, Buffer.from(q['s2c/57 duel'], 'hex'));
  assert.deepEqual(sent.at(-1), { opcode: 57, hex: buildRequest(57, { option: 0, mapId: 'M2', npcId: 141 }).toString('hex') });
  assert.deepEqual([bot.fights, bot.duels, bot.awaitingReply], [0, 1, true]);
  bot.onPacket(1180, Buffer.from(q['s2c/1180 duel'], 'hex'));
  assert.deepEqual(sent.at(-1), { opcode: 1181, hex: q['c2s/1181 duel'] });
  assert.deepEqual([bot.fights, bot.target?.id], [1, 'mob880']);
  bot.onPacket(22, duelSetup('mob880'));
  const setup = events.find(e => e.event === 'battle_setup')!;
  assert.deepEqual([setup.mobId, setup.mob, !!bot.battle], ['mob880', 'Võ Quan Đinh Mộc 400/400', true]);
  (bot as any).onBattleEnd({ won: true, actor: 'wangpt', exp: 0, coin: 0, myTurns: 20, hp: 90, mobId: 'mob880', damage: 400 });
  assert.equal(bot.quest!.current, 2); // the server's s2c/34 moves the step, not the battle
  bot.onPacket(34, new Writer().i32(0).string('subtask 1').i32(12).string('Khá lắm!').build());
  assert.deepEqual([bot.quest!.current, bot.duels, bot.awaitingReply], [3, 0, false]);
  clearTimeout((bot as any).wait);
  bot.next();
  assert.deepEqual(sent.at(-1), { opcode: 13, hex: new Writer().string('M2').i32(127).build().toString('hex') });
  (bot as any).stop('test done');
});

test('quest bot: a dialog without Đồng ý stops without answering; so does a fourth duel for the same step', () => {
  const asked = duelBot();
  asked.bot.onReady(recorder(asked.sent));
  asked.bot.onPacket(57, new Writer().i32(1).string('Võ Quan Đinh Mộc').string('Ngươi muốn gì?').u8(0).string('Rời đi').build());
  assert.deepEqual(asked.sent.map(s => s.opcode), [13]);
  assert.deepEqual([asked.events.at(-1)?.event, asked.events.at(-1)?.reason], ['stop', 'npc asked something the bot cannot answer']);
  const again = duelBot();
  again.bot.onReady(recorder(again.sent));
  again.bot.duels = 3;
  again.bot.onPacket(57, Buffer.from(q['s2c/57 duel'], 'hex'));
  assert.deepEqual(again.sent.map(s => s.opcode), [13]);
  assert.deepEqual([again.events.at(-1)?.event, again.events.at(-1)?.reason], ['stop', '3 duels and the step did not move']);
});

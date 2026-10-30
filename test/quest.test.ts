import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './fixtures.ts';
import { Writer } from '../src/protocol.ts';
import { decodeEvent } from '../src/events.ts';
import { QuestBot, stepAction } from '../src/quest.ts';

const q: Record<string, string> = fixtures.quest;
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

test('stepAction: every step text of quests 3–7', () => {
  const steps: [string, number, unknown][] = [
    ['Tiêu diệt Heo Mọi', -1, { kind: 'kill', mob: 'Heo Mọi' }],
    ['Đánh bại Kẻ Gây Rối', -1, { kind: 'kill', mob: 'Kẻ Gây Rối' }],
    ['Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc', -1, { kind: 'damage', mob: 'Thủ Lĩnh Sơn Tặc', amount: 500 }],
    ['Đạt cấp độ 8', -1, { kind: 'level', level: 8 }],
    ['Nâng điểm tiềm năng', -1, { kind: 'stat' }],
    ['Báo cáo với Bà Tư Hạnh', 103, { kind: 'talk', npcId: 103 }],
    ['Thu thập 5 Da Heo', -1, { kind: 'unknown' }],
  ];
  for (const [text, npcId, action] of steps) assert.deepEqual(stepAction({ text, npcId }), action, text);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './fixtures.ts';
import { Writer } from '../src/protocol.ts';
import { decodeEvent } from '../src/events.ts';
import { QuestBot, battleResult } from '../src/quest.ts';

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

test('battle result with a reshuffled board (u8 1; i32 64; 64 pieces) is read to the end', () => {
  // Synthetic payload in the observed layout; the captured one (quest run 1) was cut at 128 bytes by the trace.
  const board = Array.from({ length: 64 }, (_, i) => [1, 2, 3, 4, 5][(i + Math.floor(i / 8)) % 5]);
  const w = new Writer().i32(30).i32(0).i32(0x4bbc7371).i32(2).i32(8).i32(3).i32(8).i32(1).bytes(Buffer.from([3, 1, 3]))
    .u8(1).bytes(Buffer.from(board)).u8(0).u8(0).u8(0)
    .u8(1).string('mob2800').i32(-1).u8(0).i32(42).i32(-1).i32(-1).u8(0).u8(0).u8(0).u8(0).string('mob2800').u8(0);
  const x = battleResult(w.build(), 19);
  assert.deepEqual(x.move, { from: [0, 6], to: [1, 6] });
  assert.deepEqual([x.refill, x.newBoard, x.units[0].hp, x.actor, x.end], [[3, 1, 3], board, 42, 'mob2800', false]);
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

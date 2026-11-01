import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatBot, SAY_MAX, sayText, type ChatTask } from '../src/bot/chat.ts';
import { Stop } from '../src/bot/steps.ts';
import { Writer } from '../src/protocol/protocol.ts';
import { playerSay, worldChat } from '../src/protocol/world.ts';
import { fixtures } from './fixtures.ts';
import { noticePacket, scripted, type Expect } from './support/packets.ts';

// The two packets of CH1 (manina, numericId 155): "chao moi nguoi" goes out, the server sends it back masked.
const SENT = '0000000e6368616f206d6f69206e67756f69', SHOWN = '0000009b0000000e6368616f206d6f2a2a2a2a756f69';
const SELF = 155;
const hex = (s: string) => Buffer.from(s, 'hex');
const say = (id: number, text: string) => new Writer().i32(id).string(text).build();
/** s2c/1167 of the world fixtures: player 1332 enters the zone. */
const ENTER = hex(fixtures.world['s2c/1167'].hex);

async function chatBot(task: ChatTask, script: Expect[], { confirm = true, selfId = SELF as number | null } = {}) {
  const logs: Record<string, any>[] = [];
  const bot = new ChatBot({ confirm, waitMs: 300, log: e => logs.push(e) });
  const s = scripted(script, (op, p) => bot.onPacket(op, p));
  let outcome: string | undefined, stop: string | undefined;
  try { outcome = await bot.run(task, s.io, selfId ?? undefined); } catch (error) { if (!(error instanceof Stop)) throw error; stop = error.message; }
  return { ...s, bot, outcome, stop, logs };
}

test('s2c/1174 and s2c/1205 read to their last byte', () => {
  assert.deepEqual(playerSay(hex(SHOWN)), { playerId: 155, text: 'chao mo****uoi' });
  assert.deepEqual(worldChat(new Writer().i32(7).string('Ai đó').string('xin chào').build()), { senderId: 7, name: 'Ai đó', text: 'xin chào' });
  assert.throws(() => playerSay(Buffer.concat([hex(SHOWN), Buffer.from([0])])), /1 unread bytes/);
});

test('say: c2s/1174 with the text as typed; the own s2c/1174 is the answer, masked words noted', async () => {
  const x = await chatBot({ say: '  chao moi nguoi ' }, [{ op: 1174, hex: SENT, reply: [[1174, hex(SHOWN)]] }]);
  assert.deepEqual([x.errors, x.left.length, x.outcome, x.bot.shown], [[], 0, 'done', 'chao mo****uoi']);
  const said = x.logs.find(e => e.event === 'said')!;
  assert.deepEqual([said.text, said.shown, said.censored], ['chao moi nguoi', 'chao mo****uoi', true]);
});

test('say: a line of another player that comes first is heard, not taken for the answer', async () => {
  const other = say(42, 'ai do');
  const x = await chatBot({ say: 'chao moi nguoi' }, [{ op: 1174, hex: SENT, reply: [[1174, other], [1174, hex(SHOWN)]] }]);
  assert.deepEqual([x.errors, x.outcome, x.bot.shown], [[], 'done', 'chao mo****uoi']);
  assert.deepEqual(x.bot.heard, [{ playerId: 42, name: undefined, text: 'ai do' }]);
});

test('say: without --confirm nothing is sent; a notice instead of the answer is a refusal', async () => {
  const dry = await chatBot({ say: 'chao' }, [], { confirm: false });
  assert.deepEqual([dry.sent, dry.outcome], [[], 'dry_run']);
  const fast = await chatBot({ say: 'chao' }, [{ op: 1174, reply: [[1256, noticePacket('Bạn chat quá nhanh')]] }]);
  assert.match(fast.stop!, /server từ chối "Bạn chat quá nhanh"/);
  const silent = await chatBot({ say: 'chao' }, [{ op: 1174, reply: [[1174, say(42, 'ai do')]] }]);
  assert.match(silent.stop!, /không trả lời nói trong khu/);
  const noId = await chatBot({ say: 'chao' }, [], { selfId: null });
  assert.deepEqual([noId.sent, /chưa biết id/.test(noId.stop!)], [[], true]);
});

test('the text is checked before anything is sent: empty, two lines, longer than SAY_MAX', () => {
  assert.equal(sayText(' chào mọi người '), 'chào mọi người');
  assert.throws(() => sayText('   '), /chưa nhập nội dung chat/);
  assert.throws(() => sayText('a\nb'), /một dòng/);
  assert.equal(sayText('ạ'.repeat(SAY_MAX)).length, SAY_MAX);
  assert.throws(() => sayText('a'.repeat(SAY_MAX + 1)), /tối đa 100/);
});

test('listen: lines of the zone and of Thế giới are logged with the name when the zone list knows it', async () => {
  const x = await chatBot({ listenMs: 20 }, []);
  x.bot.onPacket(1174, say(42, 'ai do'));
  x.bot.onPacket(1167, ENTER);
  x.bot.onPacket(1174, say(1332, 'hello'));
  x.bot.onPacket(1205, new Writer().i32(7).string('Ai đó').string('xin chào').build());
  x.bot.onPacket(1174, hex(SHOWN)); // the own line: said, not heard
  assert.deepEqual(x.logs.filter(e => e.event === 'heard' || e.event === 'world_chat').map(e => [e.event, e.text]), [['heard', 'ai do'], ['heard', 'hello'], ['world_chat', 'xin chào']]);
  assert.deepEqual(x.bot.heard.map(h => h.name), [undefined, 'boy2Nghin']);
  assert.deepEqual([x.sent, x.outcome], [[], 'done']);
});

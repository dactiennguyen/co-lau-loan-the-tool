import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './fixtures.ts';
import { Writer } from '../src/protocol/protocol.ts';
import { buildRequest, decodeEvent } from '../src/protocol/events.ts';
import { MapLoads } from '../src/protocol/world.ts';
import { QuestBot } from '../src/bot/quest.ts';
import { BattleRunner } from '../src/battle/battle-runner.ts';
import { HUMAN, ZERO_PACE, heartbeatDelay, humanPace, seeded, type Human } from '../src/net/human.ts';
import { runClient } from '../src/net/client.ts';
import { startSimulator } from './support/game-server.ts';
import { mapPacket, mobsPacket } from './support/packets.ts';

const recorder = (sent: { opcode: number; hex: string }[]) => ({ send: (opcode: number, payload: Uint8Array) => sent.push({ opcode, hex: Buffer.from(payload).toString('hex') }), close: () => {}, user: { account: 'test' } });
const map11 = (hex: string) => decodeEvent('c2s', 11, Buffer.from(hex, 'hex')).fields;
const location = (mapId: string, index: number) => new Writer().string('manina').string(mapId).i32(index).build();
/** s2c/13 after a portal: the map, its index, 0, 0xff (B5). */
const portal = (mapId: string, index: number) => new Writer().string(mapId).i32(index).u8(0).u8(0xff).build();

test('human pace: every wait within its range, the same numbers for the same seed, none with ZERO_PACE', () => {
  const h = humanPace(seeded(7));
  for (const range of [HUMAN.reloadAfterBattle, HUMAN.entitiesAfterMap, HUMAN.npcReply, HUMAN.joinAfterSetup, HUMAN.stepAfterTimeout]) {
    const waits = Array.from({ length: 200 }, () => h.ms(range));
    assert.ok(waits.every(ms => ms >= range[0] && ms <= range[1]), `${range}`);
    assert.ok(Math.max(...waits) - Math.min(...waits) > (range[1] - range[0]) / 2, 'spread over the range');
    assert.equal(ZERO_PACE.ms(range), 0);
  }
  const a = humanPace(seeded(3)), b = humanPace(seeded(3));
  assert.deepEqual([a.ms(HUMAN.npcReply), a.ms(HUMAN.npcReply)], [b.ms(HUMAN.npcReply), b.ms(HUMAN.npcReply)]);
});

test('heartbeat: every 2 s until s2c/4, then the first 25 s after it and every 30 s in the world', () => {
  assert.equal(heartbeatDelay(false, true), 2000);
  assert.equal(heartbeatDelay(false, false), 2000);
  assert.equal(heartbeatDelay(true, true), 25_000);
  assert.equal(heartbeatDelay(true, false), 30_000);
});

test('client: c2s/1 on the login schedule until s2c/4, the world one after it, and the login gaps of the game', async () => {
  const events: Record<string, any>[] = [];
  const server = await startSimulator();
  // A fixed 30 ms for every gap, so each shows in the times; the world beat 300 ms after s2c/4, then every 200 ms.
  const gaps: Human = { on: true, ms: () => 30 };
  try {
    let api: { close(): void } | undefined;
    const result = await runClient({ host: '127.0.0.1', port: server.port, mode: 'world', username: 'probe_user', password: 'abc', settleMs: 0, heartbeatMs: 10,
      worldHeartbeatMs: [300, 200], human: gaps, responseTimeoutMs: 500, snapshotWaitMs: 40, log: e => events.push(e),
      session: { onReady(a) { api = a; setTimeout(() => api?.close(), 650); }, onPacket() {} } });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostic));
  } finally { await server.close(); }
  const at = (event: string) => events.find(e => e.event === event)!.elapsedMs as number;
  const auth = at('s2c/4'), beats = events.filter(e => e.event === 'c2s/1').map(e => e.elapsedMs as number);
  const before = beats.filter(t => t <= auth), after = beats.filter(t => t > auth);
  assert.ok(before.length >= 3, `login beats every 10 ms: ${before}`);
  assert.ok(after.length >= 1 && after.length <= 3, `world beats: ${after}`);
  assert.ok(after[0] - auth >= 290, `first world beat ${after[0] - auth} ms after s2c/4`);
  for (let i = 1; i < after.length; i++) assert.ok(after[i] - after[i - 1] >= 190, 'then every 200 ms');
  // The gaps of the login (02-login.md#nhịp-như-người-chơi), each at least the 30 ms the pace gave.
  for (const [from, to] of [['s2c/1209', 'c2s/5'], ['c2s/5', 'c2s/2'], ['s2c/30', 'c2s/42'], ['s2c/29', 'c2s/11'], ['s2c/11', 'c2s/43']])
    assert.ok(at(to) - at(from) >= 28, `${from} → ${to}: ${at(to) - at(from)} ms`);
});

test('c2s/11: (0xff, -1) on the first load of a map, its index once loaded, the zone after a zone change; "M99" (0, -1)', () => {
  const maps = new MapLoads();
  maps.on(29, location('M15', 14));
  // Login: the first load of the map.
  assert.deepEqual(map11(buildRequest(11, maps.request('M15')).toString('hex')), { mapId: 'M15', area: 255, field: -1 });
  maps.on(11, mapPacket('M15', 'Rừng', []));
  // Through a portal to a map not loaded yet, then back to M15: "M15" ff 0000000e as the game 1.1.1.
  maps.on(13, portal('M24', 23));
  assert.deepEqual(map11(buildRequest(11, maps.request('M24')).toString('hex')), { mapId: 'M24', area: 255, field: -1 });
  maps.on(11, mapPacket('M24', 'Hang', []));
  maps.on(13, portal('M15', 14));
  assert.equal(buildRequest(11, maps.request('M15')).toString('hex'), new Writer().string('M15').u8(0xff).i32(14).build().toString('hex'));
  // A zone change of the map stood in: the new zone and its index ("M11" 01 0000000a).
  const z = new MapLoads();
  z.on(29, location('M11', 10)); z.on(11, mapPacket('M11', 'Bãi', []));
  z.on(13, new Writer().string('M11').i32(1).build());
  assert.equal(buildRequest(11, z.request('M11', 1)).toString('hex'), '000000034d3131010000000a');
  // Bản đồ thế giới as the game and the Rust app send it.
  assert.equal(buildRequest(11, { mapId: 'M99' }).toString('hex'), new Writer().string('M99').u8(0).i32(-1).build().toString('hex'));
  assert.equal(buildRequest(11, { mapId: 'M99', zone: 3, mapIndex: 98 }).toString('hex'), new Writer().string('M99').u8(0).i32(-1).build().toString('hex'));
});

test('c2s/15: flag 1 for every challenge, as the attack button of the game 1.1.1', () => {
  const sent: { opcode: number; hex: string }[] = [];
  const bot = new QuestBot({ maxFights: 1, farm: 'Cóc Xanh', log: () => {} });
  bot.onPacket(29, location('M2', 1));
  bot.onPacket(43, mobsPacket('M2', [['mob61000', 'Cóc Xanh', 13]]));
  bot.onReady(recorder(sent));
  assert.deepEqual(sent.at(-1), { opcode: 15, hex: new Writer().string('mob61000').u8(1).build().toString('hex') });
  (bot as any).stop('test done');
});

const UUID = '3f1c2a9e-6b1d-4c55-9a27-0d3e4b5c6d7e';
/** A QuestBot farming Cóc Xanh in M12 khu 0 (loaded since the login), with the pace of the game minus the waits. */
const farmer = (human: Human) => {
  const sent: { opcode: number; hex: string }[] = [], events: Record<string, unknown>[] = [];
  const bot = new QuestBot({ maxFights: 9, farm: 'Cóc Xanh', restMs: 3000, log: e => events.push(e), human });
  bot.onPacket(29, location('M12', 11));
  bot.onPacket(11, mapPacket('M12', 'Tam Khê', []));
  bot.onPacket(43, mobsPacket('M12', [['mob61000', 'Cóc Xanh', 13]]));
  bot.onReady(recorder(sent));
  return { bot, sent, events };
};
const won = { won: true, actor: 'manina', exp: 30, coin: 20, myTurns: 9, hp: 100, mobId: 'mob61000', damage: 249 };

test('after a battle: c2s/11 (map, zone, index) 2.4–4.7 s after its end, c2s/43 after s2c/11, then the drops, then the next challenge', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { bot, sent } = farmer(humanPace(seeded(11)));
  assert.notEqual(sent.at(-1)?.opcode, 15, 'the walk to the mob first (challengeAfterEntities)');
  t.mock.timers.tick(4000);
  assert.equal(sent.at(-1)!.opcode, 15);
  const w: Record<string, { hex: string }> = fixtures.world, GOLD = 'f573bf90-942b-48d1-b466-4552dfa4f7cb';
  bot.onPacket(1182, Buffer.from(w['s2c/1182 gold'].hex, 'hex'));
  (bot as any).onBattleEnd(won);
  const from = sent.length;
  t.mock.timers.tick(2399);
  assert.equal(sent.length, from, 'nothing before 2.4 s: no pickup, no c2s/11');
  t.mock.timers.tick(2301);
  assert.deepEqual(sent.slice(from).map(s => s.opcode), [11]);
  assert.deepEqual(map11(sent.at(-1)!.hex), { mapId: 'M12', area: 0, field: 11 });
  // The s2c/11 of the reload clears nothing the pickup needs.
  bot.onPacket(11, mapPacket('M12', 'Tam Khê', []));
  t.mock.timers.tick(299);
  assert.equal(sent.length, from + 1, 'c2s/43 not within 0.3 s of s2c/11');
  t.mock.timers.tick(501);
  assert.deepEqual(sent.slice(from).map(s => s.opcode), [11, 43, 1188]);
  assert.deepEqual(sent.at(-1), { opcode: 1188, hex: buildRequest(1188, { uuid: GOLD }).toString('hex') });
  bot.onPacket(43, mobsPacket('M12', [['mob61000', 'Cóc Xanh', 13]]));
  t.mock.timers.tick(1499);
  assert.deepEqual(sent.slice(from).map(s => s.opcode), [11, 43, 1188], 'the walk to the mob: not within 1.5 s of s2c/43');
  t.mock.timers.tick(2501);
  assert.deepEqual(sent.slice(from).map(s => s.opcode), [11, 43, 1188, 15], 'the next challenge after the pickup and the walk');
  (bot as any).stop('test done');
});

test('after a lost battle the map is reloaded too; with ZERO_PACE the same order without the waits; OFF keeps the old 3 s rest', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const lost = { ...won, won: false, actor: 'mob61000', hp: 0 };
  const zero = farmer(ZERO_PACE);
  zero.bot.options.maxLosses = 9;
  const from = zero.sent.length;
  (zero.bot as any).onBattleEnd(lost);
  assert.deepEqual(zero.sent.slice(from).map(s => s.opcode), [11]);
  zero.bot.onPacket(11, mapPacket('M12', 'Tam Khê', []));
  assert.deepEqual(zero.sent.slice(from).map(s => s.opcode), [11, 43]);
  t.mock.timers.tick(3000);
  assert.deepEqual(zero.sent.slice(from).map(s => s.opcode), [11, 43, 15], 'the next challenge 3 s after the end');
  (zero.bot as any).stop('test done');
  const old = farmer({ on: false, ms: () => 0 });
  old.bot.options.maxLosses = 9;
  const before = old.sent.length;
  (old.bot as any).onBattleEnd(lost);
  t.mock.timers.tick(3000);
  assert.deepEqual(old.sent.slice(before).map(s => s.opcode), [15]);
  (old.bot as any).stop('test done');
});

test('Đầu hàng with the human pace: c2s/11 (zone, index) and c2s/40 at once, c2s/43 ~0.6 s after s2c/1214, not on s2c/11', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { bot, sent } = farmer(humanPace(seeded(5)));
  const setup = new Writer().u8(1).u8(0).string('manina').string('manina').u8(0).u8(0).u8(0).i32(21).i32(0).u8(0).i32(150).i32(180)
    .string('mob61000').string('Cóc Xanh').u8(1).u8(0).u8(4).i32(13).i32(100000).u8(0).i32(249).i32(249).string(UUID).i32(64).bytes(Buffer.alloc(0)).build();
  const s22 = Buffer.concat([setup.subarray(0, setup.length - 4), Buffer.from(fixtures.battles[0].board as number[]), Buffer.from([30, 0])]);
  bot.onPacket(22, s22);
  const from = sent.length;
  t.mock.timers.tick(1600);
  assert.deepEqual(sent.slice(from).map(s => s.opcode), [18], 'c2s/18 1.1–1.6 s after s2c/22');
  bot.surrender();
  assert.deepEqual(sent.slice(from).map(s => s.opcode), [18, 11, 40]);
  assert.deepEqual(map11(sent.at(-2)!.hex), { mapId: 'M12', area: 0, field: 11 });
  bot.onPacket(11, mapPacket('M12', 'Tam Khê', []));
  t.mock.timers.tick(2000);
  assert.deepEqual(sent.slice(from).map(s => s.opcode), [18, 11, 40], 'no c2s/43 for the s2c/11');
  bot.onPacket(1214, Buffer.alloc(0));
  t.mock.timers.tick(499);
  assert.equal(sent.at(-1)!.opcode, 40);
  t.mock.timers.tick(201);
  assert.deepEqual(sent.at(-1), { opcode: 43, hex: buildRequest(43, { mapId: 'M12' }).toString('hex') });
});

test('turn battle with the human pace: c2s/18 1.1–1.6 s after s2c/22, the mob\'s c2s/14 10–40 ms without a cascade, an own move after 1.2 s', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const bp: Record<string, string> = fixtures['battle-packets'], sent: number[] = [];
  const runner = new BattleRunner({ me: 'manina', level: 3, hp: 130, maxHp: 130, uuid: 'u', board: (fixtures.battles[0].board as number[]).slice(), turnSeconds: 30, knownBytes: 0 }, 'mob872604',
    { send: op => sent.push(op), log: () => {}, onEnd: () => {}, human: humanPace(seeded(2)) });
  runner.start();
  t.mock.timers.tick(1099);
  assert.deepEqual(sent, []);
  t.mock.timers.tick(501);
  assert.deepEqual(sent, [18]);
  runner.onPacket(18, Buffer.from(bp['s2c/18'], 'hex'));
  t.mock.timers.tick(9);
  assert.deepEqual(sent, [18]);
  t.mock.timers.tick(31);
  assert.deepEqual(sent, [18, 14]);
  runner.onPacket(24, Buffer.from(bp['s2c/24 own turn'], 'hex'));
  t.mock.timers.tick(1199);
  assert.deepEqual(sent, [18, 14]);
  t.mock.timers.tick(1401);
  assert.deepEqual(sent, [18, 14, 19], 'an own move 1.2–2.6 s after its turn');
});

test('a battle opened with timed 1 (c2s/15 flag 1, game 1.1.1): the first own move after 1.2–2.6 s; its first s2c/24 makes it a turn battle', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const bp: Record<string, string> = fixtures['battle-packets'], sent: number[] = [], events: string[] = [];
  const runner = new BattleRunner({ me: 'manina', level: 3, hp: 130, maxHp: 130, uuid: 'u', board: (fixtures.battles[0].board as number[]).slice(), turnSeconds: 30, knownBytes: 0 }, 'mob872604',
    { send: op => sent.push(op), log: e => events.push(e), onEnd: () => {}, human: humanPace(seeded(3)) });
  runner.start();
  t.mock.timers.tick(1600);
  assert.deepEqual(sent, [18]);
  // s2c/18 `i32 0; u8 timed 1; u8 0`: the player moves first.
  runner.onPacket(18, Buffer.from('000000000100', 'hex'));
  t.mock.timers.tick(1199);
  assert.deepEqual(sent, [18], 'the player looks at the board first');
  t.mock.timers.tick(1401);
  assert.deepEqual(sent, [18, 19]);
  assert.equal(runner.timed, true);
  runner.onPacket(24, Buffer.from(bp['s2c/24 own turn'], 'hex'));
  assert.equal(runner.timed, false, 'turns: a turn battle from here');
  assert.ok(events.includes('turn_battle'));
  t.mock.timers.tick(1199);
  assert.deepEqual(sent, [18, 19], 'an own turn of a turn battle: not within 1.2 s');
  t.mock.timers.tick(1401);
  assert.deepEqual(sent, [18, 19, 19]);
});

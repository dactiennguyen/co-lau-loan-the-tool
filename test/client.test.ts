import test from 'node:test';
import assert from 'node:assert/strict';
import { runClient } from '../src/net/client.ts';
import { startSimulator } from './support/game-server.ts';
import type { SimFault } from './support/game-server.ts';

async function run(fault: SimFault = 'none') {
  const events: Record<string, any>[] = [], serverEvents: Record<string, any>[] = [];
  const server = await startSimulator({ fault, log: e => serverEvents.push(e) });
  try {
    const result = await runClient({ host: '127.0.0.1', port: server.port, mode: 'world', username: 'probe_user', password: 'abc', settleMs: 30, heartbeatMs: 20, responseTimeoutMs: 120, snapshotWaitMs: 40, log: e => events.push(e) });
    return { result, events, serverEvents };
  } finally { await server.close(); }
}

test('same app state machine completes real TCP replay of full captured responses', async () => {
  const { result, events, serverEvents } = await run();
  assert.equal(result.ok, true, JSON.stringify(events));
  assert.deepEqual(events.filter(e => e.kind === 'send' && e.opcode !== 1).map(e => e.opcode), [-1, 1206, 5, 2, 3, 4, 1284, 9, 30, 42, 29, 11, 43]);
  assert.ok(events.some(e => e.event === 's2c/1'));
  const character = events.find(e => e.event === 's2c/9')!;
  assert.equal(character.fields.hp, 120); assert.equal(character.fields.maxHp, 130);
  assert.equal(character.labelSource, 'analyst'); assert.equal(character.protocolEventName, null);
  assert.equal(events.find(e => e.event === 's2c/11')!.fields.tileBytes, 3588);
  assert.equal(events.find(e => e.event === 's2c/30')!.payloadBytes, 23442);
  assert.ok(events.some(e => e.event === 's2c/1182'));
  assert.ok(events.some(e => e.event === 'world_initialization_received' && e.playersSnapshotReceived));
  assert.ok(!events.some(e => e.event === 'schema_warning'));
  const credential = events.find(e => e.event === 'c2s/4')!;
  assert.equal(credential.redacted, true); assert.equal(credential.payloadHex, undefined);
  assert.ok(!JSON.stringify(events).includes('707372'));
  assert.ok(!serverEvents.some(e => e.event === 'sim_error'));
  assert.equal(result.user.account, 'probe_user');
  assert.equal(result.user.character?.name, 'manina');
  assert.equal(result.user.location?.mapId, 'M1');
  assert.equal(result.user.map?.name, 'Làng Thanh Khê');
});

for (const [fault, code, state] of [
  ['bad-key', 'KEY_LAYOUT', 'key'], ['bad-frame', 'FRAME_LENGTH', 'version'],
  ['bad-map', 'PAYLOAD_SCHEMA', 'map'], ['stall-map', 'RESPONSE_TIMEOUT', 'map'],
  ['already-online', 'SERVER_MESSAGE', 'authenticating'],
] as const) {
  test(`diagnose ${fault} at the correct layer and stage`, async () => {
    const { result, events } = await run(fault);
    assert.equal(result.ok, false); assert.equal(result.diagnostic?.code, code); assert.equal(result.state, state);
    if (fault === 'bad-map') assert.equal(result.diagnostic?.offset, 5);
    if (fault === 'stall-map') assert.deepEqual(result.diagnostic?.expectedReceiveOpcodes, [11]);
    if (fault === 'stall-map') assert.ok(events.filter(e => e.event === 's2c/1').length >= 2);
    if (fault === 'already-online') assert.equal(result.diagnostic?.reason, 'Tài khoản hiện đang đăng nhập ở một nơi khác');
  });
}

test('a zone with no other player sends no s2c/1263: the client enters the world after s2c/43 anyway', async () => {
  const { result, events } = await run('alone-in-zone');
  assert.equal(result.ok, true, JSON.stringify(events.filter(e => e.kind === 'lifecycle')));
  assert.ok(!events.some(e => e.event === 's2c/1263'));
  assert.ok(events.some(e => e.event === 'players_snapshot_absent'));
  assert.ok(events.some(e => e.event === 'world_initialization_received' && e.playersSnapshotReceived === false));
});

test('new opcode is reported and consumed without losing XOR stream position', async () => {
  const { result, events } = await run('new-opcode');
  assert.equal(result.ok, true); assert.ok(events.some(e => e.event === 'unknown_opcode' && e.encodedOpcode === 123456789));
});

test('in the world s2c/0 is a message box: logged as server_message and handed to the session, which goes on', async () => {
  const events: Record<string, any>[] = [], seen: number[] = [];
  const server = await startSimulator({ fault: 'message-in-world' });
  try {
    let api: { close(): void } | undefined;
    const result = await runClient({ host: '127.0.0.1', port: server.port, mode: 'world', username: 'probe_user', password: 'abc', settleMs: 30, heartbeatMs: 20, responseTimeoutMs: 120, snapshotWaitMs: 40, log: e => events.push(e),
      session: { onReady(a) { api = a; }, onPacket(op) { seen.push(op); if (op === 0) setTimeout(() => api?.close(), 50); } } });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostic));
    assert.ok(seen.includes(0));
    assert.match(events.find(e => e.event === 'server_message')?.text, /^Cần chọn đủ 2 loại nguyên liệu/);
  } finally { await server.close(); }
});

test('in the world "logged in elsewhere" still ends the session at once: it was taken over', async () => {
  const server = await startSimulator({ fault: 'kicked-in-world' });
  try {
    const result = await runClient({ host: '127.0.0.1', port: server.port, mode: 'world', username: 'probe_user', password: 'abc', settleMs: 30, heartbeatMs: 20, responseTimeoutMs: 120, snapshotWaitMs: 40,
      session: { onReady() {}, onPacket() {} } });
    assert.equal(result.ok, false);
    assert.deepEqual([result.diagnostic?.code, result.diagnostic?.reason], ['SERVER_MESSAGE', 'Tài khoản hiện đang đăng nhập ở một nơi khác']);
  } finally { await server.close(); }
});

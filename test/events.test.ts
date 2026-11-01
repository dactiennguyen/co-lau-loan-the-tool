import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './fixtures.ts';
import { EVENTS, buildRequest, decodeEvent } from '../src/protocol/events.ts';
import { scenario } from './support/game-server.ts';
import { checkCapture, normalizeCapture } from '../src/cli/check-capture.ts';

const scenarioText = JSON.stringify(fixtures.scenario);

test('every recorded outgoing request has a concrete builder matching app bytes', () => {
  for (const stage of scenario.stages) {
    if (stage.requestOpcode === 4) continue;
    assert.equal(buildRequest(stage.requestOpcode, { username: 'Manina2', password: 'abc', serverId: 24, characterName: 'manina', mapId: 'M1' }).toString('hex'), stage.observedRequestHex);
  }
});

test('catalog covers all recorded opcodes; complete bodies are preserved before cleanup', () => {
  const seen = new Set<string>();
  for (const stage of scenario.stages) {
    seen.add(`c2s/${stage.requestOpcode}`);
    for (const r of stage.responses) {
      assert.equal(r.hex.length / 2, r.bytes); assert.equal(r.complete, true);
      assert.equal(decodeEvent('s2c', r.opcode, Buffer.from(r.hex, 'hex')).known, true);
      seen.add(`s2c/${r.opcode}`);
    }
  }
  for (const r of scenario.extraPushExamples) {
    assert.equal(r.hex.length / 2, r.bytes);
    assert.equal(decodeEvent('s2c', r.opcode, Buffer.from(r.hex, 'hex')).known, true);
    seen.add(`s2c/${r.opcode}`);
  }
  assert.equal(new Set(EVENTS.map(e => `${e.direction}/${e.opcode}`)).size, EVENTS.length);
  for (const key of seen) assert.ok(EVENTS.some(e => `${e.direction}/${e.opcode}` === key), key);
});

test('capture checker accepts baseline and locates an updated client version', () => {
  assert.equal(checkCapture(scenarioText).ok, true);
  const rows = normalizeCapture(scenarioText);
  const info = rows.find(x => x.kind === 'send' && x.op === 1206)!;
  info.hex = info.hex.replace('302e302e32', '302e302e33');
  const result = checkCapture(JSON.stringify(rows));
  assert.equal(result.ok, false);
  assert.ok(result.findings.some(f => f.code === 'CLIENT_INFO_CHANGED' && f.opcode === 1206));
});

test('capture checker separates capture truncation from a schema change and incomplete flow', () => {
  const rows = normalizeCapture(scenarioText), map = rows.find(x => x.kind === 'receive' && x.op === 11)!;
  map.hex = map.hex.slice(0, 10);
  let result = checkCapture(JSON.stringify(rows));
  assert.ok(result.findings.some(f => f.code === 'CAPTURE_TRUNCATED' && f.opcode === 11));
  assert.ok(!result.findings.some(f => f.code === 'SCHEMA_CHANGED' && f.opcode === 11));
  map.len = map.hex.length / 2;
  result = checkCapture(JSON.stringify(rows));
  assert.ok(result.findings.some(f => f.code === 'SCHEMA_CHANGED' && f.opcode === 11));
  result = checkCapture(JSON.stringify(rows.slice(0, 5)));
  assert.equal(result.ok, false); assert.ok(result.findings.some(f => f.code === 'MISSING_RESPONSE'));
});

test('Frida missing hooks and new opcodes produce explicit findings', () => {
  const rows = normalizeCapture(scenarioText);
  rows.push({ kind: 'missing', part: 'packet_reader' });
  rows.push({ kind: 'receive', op: 2000, len: 2, hex: '0001' });
  const input = rows.map(x => JSON.stringify({ type: 'send', payload: x })).join('\n');
  const result = checkCapture(input);
  assert.ok(result.findings.some(f => f.code === 'NATIVE_HOOK_MISSING'));
  assert.ok(result.findings.some(f => f.code === 'OPCODE_NEW' && f.opcode === 2000));
});

test('a final world snapshot cannot hide a missing intermediate response in the capture', () => {
  const rows = normalizeCapture(scenarioText).filter(x => !(x.kind === 'receive' && x.op === 3));
  const result = checkCapture(JSON.stringify(rows));
  assert.equal(result.completed, true);
  assert.equal(result.ok, false);
  assert.ok(result.findings.some(f => f.code === 'PREVIOUS_RESPONSE_MISSING' && f.opcode === 4));
});

test('say (CH1): c2s/1174 is the text of the Chat box, s2c/1174 the bubble with the id and the text the server masked', () => {
  // The two packets of CH1 (manina, numericId 155): "chao moi nguoi" goes out, the server sends it back masked.
  const sent = '0000000e6368616f206d6f69206e67756f69', shown = '0000009b0000000e6368616f206d6f2a2a2a2a756f69';
  assert.equal(buildRequest(1174, { text: 'chao moi nguoi' }).toString('hex'), sent);
  assert.deepEqual(decodeEvent('c2s', 1174, Buffer.from(sent, 'hex')).fields, { text: 'chao moi nguoi' });
  const bubble = decodeEvent('s2c', 1174, Buffer.from(shown, 'hex'));
  assert.deepEqual([bubble.name, bubble.fields, bubble.opaqueBytes], ['player_say', { playerId: 155, text: 'chao mo****uoi' }, 0]);
});

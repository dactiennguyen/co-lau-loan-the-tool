import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './fixtures.ts';
import { decodeEvent } from '../src/events.ts';
import { Protocol, Reader, Writer, handshake, sessionKey, passwordProof, loginPayload,
  characterPrefix, characterProfile, mapPrefix, usernameHash } from '../src/protocol.ts';

const fixture = (name: string) => fixtures[name];
const boot = fixture('prelogin');

test('seed response matches bytes captured from APK 1.0.3', () => {
  assert.equal(handshake(Buffer.from(boot.seed, 'hex').readInt32BE()).toString('hex'), boot.handshake);
  assert.equal(handshake(-1).subarray(17).toString('hex'), '00000079');
  assert.equal(handshake(0x7fffffff).subarray(17).toString('hex'), '00000079');
});

test('all captured server frames decode identically under TCP fragmentation and coalescing', () => {
  const wire = Buffer.from(boot.received_chunks.join(''), 'hex');
  for (const step of [1, 2, 7, 13, 17, 97, wire.length]) {
    const p = new Protocol(), actual = [];
    for (let i = 0; i < wire.length; i += step) {
      for (const packet of p.receive(wire.subarray(i, i + step))) {
        actual.push({ op: packet.opcode, hex: packet.payload.toString('hex') });
        if (packet.opcode === -1) {
          const key = sessionKey(packet.payload); assert.equal(key.toString('hex'), boot.key); p.enableKey(key);
        }
      }
    }
    assert.deepEqual(actual, boot.decoded_receive.map((x: { op: number; hex: string }) => ({ op: x.op, hex: x.hex })));
    assert.equal(p.pending.length, 0);
  }
});

test('every client frame in the captured boot, including heartbeat counter wraps, matches exactly', () => {
  const p = new Protocol();
  for (let i = 0; i < boot.decoded_send.length; i++) {
    const packet = boot.decoded_send[i];
    if (packet.op === 1206) p.enableKey(Buffer.from(boot.key, 'hex'));
    assert.equal(p.encode(packet.op, Buffer.from(packet.hex, 'hex')).toString('hex'), boot.sent_frames[i]);
  }
});

test('password transform matches all native vectors, including offset, padding and UTF-8', () => {
  for (const v of fixture('password-vectors').vectors) {
    assert.equal(passwordProof(Buffer.from(v.challenge, 'hex'), v.password).toString('hex'), v.out, JSON.stringify(v));
  }
});

test('login serialization matches the isolated native builder, without sending credentials', () => {
  for (const v of fixture('login-vectors').vectors) {
    assert.equal(loginPayload(v.input.username, Buffer.from(v.input.proof), v.input.serverId).toString('hex'), v.data);
  }
  assert.equal(usernameHash('probe_user'), -967112245);
  const unicode = new Writer().string('Việt😀').build();
  assert.equal(unicode.readInt32BE(), 10); assert.equal(new Reader(unicode).string(), 'Việt😀');
});

test('profile and map parser follow the native getter offsets', () => {
  const fields = fixture('fields');
  const profile = characterPrefix(Buffer.from(fields.examples.find((x: { op: number }) => x.op === 9).hex, 'hex'));
  assert.deepEqual(profile, { status: 1, count: 1, name: 'manina', numericId: 155, displayName: 'manina', flag1: 1, flag2: 0, level: 3, hp: 120, maxHp: 130, prefixBytes: 40 });
  const map = mapPrefix(Buffer.from(fields.examples.find((x: { op: number }) => x.op === 11).hex, 'hex'));
  assert.deepEqual(map, { flag: 1, mapId: 'M1', name: 'Làng Thanh Khê', area: 5, x: 932, y: 544, field36: 0, dimension1: 23, dimension2: 156, tileBytes: 3588, prefixBytes: 3640 });
});

test('s2c/9 tail: the numbers of s2c/10 kinds 2, 4, 8 and the x, y of the next s2c/11 (A2 level 3, 30/10 level 21)', () => {
  const a2hex = fixture('scenario').stages.flatMap((s: any) => s.responses ?? []).find((r: any) => r.opcode === 9).hex;
  const a2 = characterProfile(Buffer.from(a2hex, 'hex')), now = characterProfile(Buffer.from(fixture('profile')['s2c/9 level 21'], 'hex'));
  const pick = (p: typeof a2) => [p.level, p.hp, p.maxHp, p.s1, p.s1Max, p.stats, p.combat, p.exp, p.coin, p.field, p.statPoints, p.skillPoints, p.levelExp, p.labels, p.x, p.y];
  assert.deepEqual(pick(a2), [3, 120, 130, 0, 100, [22, 10, 10, 12, 0, 0, 0, 0, 0, 0], [22, 9, 30, 20, 6], 176, 0, 10000, 6, 1, [150, 300], ['780', '125'], 932, 544]);
  assert.deepEqual(pick(now), [21, 180, 180, 0, 100, [32, 10, 10, 30, 0, 0, 0, 0, 0, 0], [32, 5, 30, 20, 6], 14238, 2664, 10000, 68, 19, [13841, 15882], ['355', '125'], 2784, 864]);
  for (const p of [a2, now]) {
    assert.ok(p.exp >= p.levelExp[0] && p.exp < p.levelExp[1]);
    assert.equal(p.skillPoints, p.level - 2);
    assert.deepEqual(p.gap, [0, 0, 0, 0, 0, 0]);
  }
  // A2 x, y = its s2c/11 (mapPrefix test above); stat points: 6 at level 3, +4 per level, 10 spent on stats[0] in L1.
  assert.equal(now.statPoints, a2.statPoints + 4 * (now.level - a2.level) - (now.stats[0] - a2.stats[0]));
});

test('decodeEvent keeps the s2c/9 prefix when the tail does not fit the two captured layouts', () => {
  const prefixOnly = Buffer.from(fixture('fields').examples.find((x: { op: number }) => x.op === 9).hex, 'hex');
  assert.throws(() => characterProfile(prefixOnly));
  const d = decodeEvent('s2c', 9, prefixOnly);
  assert.deepEqual([d.fields.name, d.fields.level, d.fields.hp, d.parsedBytes], ['manina', 3, 120, 40]);
});

test('reject malformed lengths and unsupported key sizes before allocating message bodies', () => {
  for (const size of [-1, 13, 16 * 1024 * 1024 + 1]) {
    const header = Buffer.alloc(14); header.writeInt32BE(size, 2);
    assert.throws(() => [...new Protocol().receive(header)], /Invalid server frame size/);
  }
  assert.throws(() => new Reader(Buffer.from('ffffffff', 'hex')).string(), /Invalid field length/);
  assert.throws(() => new Reader(Buffer.from('00000010', 'hex')).bytes(), /Invalid field length/);
  assert.throws(() => sessionKey(Buffer.from([1, 2])), /Unexpected key-exchange/);
  assert.throws(() => new Protocol().enableKey(Buffer.alloc(8)), /16-byte/);
});

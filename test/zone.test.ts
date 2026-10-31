import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, decodeEvent } from '../src/protocol/events.ts';
import { mapChange } from '../src/protocol/world.ts';

test('zone change as the phone did it (B2, khu 20 of M1): c2s/1173, s2c/13 with the zone, then c2s/11 of that zone', () => {
  assert.equal(buildRequest(1173, { zone: 20 }).toString('hex'), '14');
  assert.deepEqual(mapChange(Buffer.from('000000024d3100000014', 'hex')), { mapId: 'M1', zone: 20 });
  // Z1 (bot TS, manina to khu 4 of M2, 31/10): the long form of a portal, with the zone in place of its 0xff.
  assert.deepEqual(mapChange(Buffer.from('000000024d32000000010004', 'hex')), { mapId: 'M2', mapIndex: 1, extra: [0, 4], zone: 4 });
  assert.deepEqual(mapChange(Buffer.from('000000024d320000000100ff', 'hex')), { mapId: 'M2', mapIndex: 1, extra: [0, 255] });
  // The map of the new zone is asked with (zone, 0); at login and after a portal with (-1, -1).
  assert.equal(buildRequest(11, { mapId: 'M1', zone: 20 }).toString('hex'), '000000024d311400000000');
  assert.equal(buildRequest(11, { mapId: 'M1' }).toString('hex'), '000000024d31ffffffffff');
  assert.deepEqual(decodeEvent('c2s', 11, buildRequest(11, { mapId: 'M1', zone: 20 })).fields, { mapId: 'M1', area: 20, field: 0 });
});

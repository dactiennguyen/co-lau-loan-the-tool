import test from 'node:test';
import assert from 'node:assert/strict';
import { base45, decodeQr, encodeQr, QR_MAX, QR_PREFIX, tabOwner, unbase45 } from '../app/desktop/src/utils/qrPayload.ts';

test('base45: the examples of RFC 9285, and every byte value back', () => {
  const enc = (s: string) => base45(new TextEncoder().encode(s));
  assert.equal(enc('AB'), 'BB8');
  assert.equal(enc('Hello!!'), '%69 VD92EX0');
  assert.equal(enc('base-45'), 'UJCLQE7W581');
  assert.equal(new TextDecoder().decode(unbase45('QED8WEX0')), 'ietf!');
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.deepEqual(unbase45(base45(all)), all);
  assert.deepEqual(unbase45(base45(all.subarray(1))), all.subarray(1), 'an odd length');
  assert.throws(() => unbase45('GGW'), /không hợp lệ/);
  assert.throws(() => unbase45('a'), /Ký tự lạ/);
});

/** Xuất JSON of `n` accounts as backup.rs writes it, the fight settings of an account of 24/11. */
function exported(n: number) {
  const fight = { repair: true, pickup: true, pickupOtherGender: true, pickupOthers: true, pickupOwnElement: false, pickupCommon: true, pickupRare: true,
    pickupPrecious: true, pickupEpic: true, hpPotion: true, hpPotionMax: 1, hpPotionKeep: 30, mpPotion: false, mpPotionMax: 2, mpPotionKeep: 30, autoMerge: false,
    mergeUpTo: 12, mergeEvery: 5, mobDelay: true, mobDelaySecs: 1, turnDelay: false, turnDelaySecs: 1, stepDelay: true, stepDelaySecs: 1, restBreak: false,
    breakEvery: 30, breakMinutes: 2, delayRandom: true, humanPace: false, fightCount: 2000, fightLosses: 1000 };
  const accounts = Array.from({ length: n }, (_, i) => ({ label: '', username: `nick${i}abc`, password: `pw${i}x9k2`, serverId: 24, stats: 'auto', fight,
    fightTargets: { M6: 'Mầm Yêu', M12: 'Hổ Nanh Kiếm' }, proxy: null }));
  return JSON.stringify({ app: 'Co Lau Tool', format: 1, exportedAt: '2026-11-24T22:00:00+07:00', accounts, settings: { server: { host: 'plays1.colauloanthe.vn', port: 1688 } } }, null, 2);
}

test('QR nick: the JSON and the tabs come back; the text keeps to the alphanumeric characters; 25 accounts fit', () => {
  const json = exported(3), tabs = { [tabOwner('nick0abc', 24)]: 'fight', [tabOwner('nick2abc', 24)]: 'quest' };
  const text = encodeQr({ json, tabs });
  assert.ok(text.startsWith(QR_PREFIX));
  assert.match(text, /^[0-9A-Z $%*+\-./:]+$/, 'the alphanumeric mode of QR');
  const back = decodeQr(text);
  assert.deepEqual(JSON.parse(back.json), JSON.parse(json), 'what Nhập reads, without the tabs');
  assert.deepEqual(back.tabs, tabs);
  assert.deepEqual(decodeQr(encodeQr({ json, tabs: {} })).tabs, {});
  assert.ok(encodeQr({ json: exported(25), tabs }).length <= QR_MAX, `25 accounts: ${encodeQr({ json: exported(25), tabs }).length} characters`);
});

test('QR nick: a QR of something else, or cut, says so', () => {
  assert.throws(() => decodeQr('https://example.com'), /không phải QR nick/);
  const text = encodeQr({ json: exported(1), tabs: {} });
  assert.throws(() => decodeQr(text.slice(0, -10)), /Không đọc được QR/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapBoss, mapEntities, mobElement } from '../src/protocol/world.ts';
import { b8Packets } from './fixtures-b8.ts';
import { s3Packets } from './fixtures-s3.ts';

const hex = (h: string) => Buffer.from(h, 'hex');

test('mobElement: a of s2c/43 is the element, 0 Hỏa, 2 Lôi, 4 Thủy (06-map-mobs.md#hệ-của-quái)', () => {
  // M1 of S3: each kind with the element of its s2c/22 block in the battles of the app (Sơn Tặc, Kẻ Gây Rối Hỏa).
  const kinds = new Map(mapEntities(hex(s3Packets['s2c/43 M1'])).mobs.map(m => [m.name, mobElement(m.a)]));
  assert.deepEqual(Object.fromEntries(kinds), { 'Gà Điên': 4, 'Heo Mọi': 2, 'Kẻ Gây Rối': 1, 'Sơn Tặc': 1, 'Chỉ Huy Sơn Tặc': 2 });
  // The boss of s2c/1177 has the same byte: Tướng Thiết Kích is Lôi (B8).
  const boss = mapBoss(hex(b8Packets['s2c/1177 Tướng Thiết Kích']));
  assert.ok('mob' in boss);
  assert.equal(mobElement(boss.mob.a), 2);
  assert.equal(mobElement(1), undefined);
});

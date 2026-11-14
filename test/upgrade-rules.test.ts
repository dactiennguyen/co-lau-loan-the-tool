// The rules of Nâng cấp are written twice in TypeScript: src/protocol/npc.ts (the prototype, which app/core is checked
// against through vectors.json) and app/desktop/src/game/upgrade.ts (what the Tiện ích modal shows before the bot runs a
// task). A change to one without the other would have the modal promise what the bot does not do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as proto from '../src/protocol/npc.ts';
import { dailyText as protoDaily } from '../src/protocol/mail.ts';
import * as ui from '../app/desktop/src/game/upgrade.ts';
import { dailyText as uiDaily } from '../app/desktop/src/game/daily.ts';
import type { Item } from '../app/desktop/src/api/types.ts';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const item = (kind: number | undefined, level: number) => ({ kind, level }) as Item;

test('upgrade rules: stone levels, caps, fall-back levels and charms agree', () => {
  for (const id of range(0, 700)) assert.equal(ui.stoneLevel(id), proto.stoneLevel(id), `stoneLevel(${id})`);
  for (const level of range(0, 200)) assert.equal(ui.upgradeCap(level), proto.upgradeCap(level), `upgradeCap(${level})`);
  for (const level of range(0, 20)) {
    assert.equal(ui.failLevel(level), proto.failLevel(level), `failLevel(${level})`);
    assert.equal(ui.charmUseful(level), proto.charmUseful(level), `charmUseful(${level})`);
  }
  assert.equal(ui.SAFE_LEVEL, proto.SAFE_LEVEL);
  assert.deepEqual(ui.CHARMS.map(({ id, upTo }) => ({ itemId: id, upTo })), proto.CHARMS);
  assert.deepEqual(ui.TRANSMUTE_ITEMS.map(({ id, upTo }) => ({ itemId: id, upTo })), proto.TRANSMUTE_ITEMS);
});

test('upgrade rules: which items are gear and how far each goes', () => {
  for (const kind of range(0, 10)) {
    assert.equal(ui.isGear(item(kind, 1)), proto.isGear({ type: kind }), `isGear(kind ${kind})`);
    for (const level of [1, 20, 21, 50, 51, 100, 101, 150]) {
      assert.equal(ui.itemCap(item(kind, level)), proto.itemCap({ type: kind, level }), `itemCap(kind ${kind}, level ${level})`);
    }
  }
  assert.equal(ui.isGear(item(undefined, 1)), proto.isGear(undefined));
});

test('daily quests: the progress line agrees', () => {
  const q = { template: 'Thu thập %d xu khóa từ đánh quái', progress: 218, target: 2100 };
  assert.equal(uiDaily(q as never), protoDaily(q as never));
  assert.equal(uiDaily(q as never), 'Thu thập 218/2100 xu khóa từ đánh quái');
});

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

test('upgrade rules: Luyện tự chọn quotes and suggests alike', () => {
  const sets = [[], [1], [1, 1], [1, 1, 1], [4, 4], [4, 5], [5, 5, 5, 5], [5, 5, 5, 5, 5], [2, 3], [12, 12], [7, ...Array(11).fill(5)], Array(25).fill(1)];
  for (const s of sets) {
    assert.deepEqual(ui.fuseQuote(s), proto.fuseQuote(s), `fuseQuote(${s})`);
    assert.equal(ui.fuseWhy(ui.fuseQuote(s)), proto.fuseWhy(proto.fuseQuote(s)), `fuseWhy(${s})`);
  }
  const helds = [[0, 0, 0, 0, 0, 40, 0, 3], [0, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99], [0, 3], [], [0, 2, 1, 0, 4, 45, 0, 1], [0, 0, 0, 0, 3, 5]];
  for (const held of helds) for (const target of range(1, 13)) for (const rate of [30, 41, 42, 50, 75, 100]) {
    assert.deepEqual(ui.fuseSuggest(held, target, rate), proto.fuseSuggest(held, target, rate), `fuseSuggest(${held}, ${target}, ${rate})`);
  }
});

test('Luyện liên tục: how many presses the stones held last for', () => {
  // 3 Đá cấp 6, 23 Đá cấp 5: 2 Đá 6 → Đá 7 at 50% once (one Đá 6 left), then Gợi ý takes Đá 6 + 5s, then 5s alone.
  const held = [0, 0, 0, 0, 0, 23, 3, 0, 0, 0, 0, 0, 0];
  const target = (left: number[]) => ui.fuseSuggest(left, 7, 42);
  const rounds = ui.fuseRounds(held, target);
  assert.ok(rounds >= 2, `rounds ${rounds}`);
  // Each press as Gợi ý would pick on what is left; none needs more than is held.
  const left = [...held];
  for (let i = 0; i < rounds; i++) {
    const take = target(left)!;
    take.forEach((k, l) => (left[l] -= k));
    assert.ok(left.every((k) => k >= 0));
  }
  assert.equal(target(left), null, 'nothing left for one more');
  // Công thức cố định: 2 Đá 6 + 6 Đá 5 fits once in 3 Đá 6 and 23 Đá 5; "at most" caps it.
  const fixed = ui.fixedPick([0, 0, 0, 0, 0, 6, 2, 0, 0, 0, 0, 0, 0]);
  assert.equal(ui.fuseRounds(held, fixed), 1);
  assert.equal(ui.fuseRounds([0, 0, 0, 0, 0, 30, 9, 0, 0, 0, 0, 0, 0], fixed), 4);
  assert.equal(ui.fuseRounds([0, 0, 0, 0, 0, 30, 9, 0, 0, 0, 0, 0, 0], fixed, 2), 2);
  assert.equal(ui.fuseRounds(held, () => null), 0);
});

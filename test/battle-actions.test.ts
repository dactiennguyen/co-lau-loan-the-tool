import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixtures } from './fixtures.ts';
import { N, UNKNOWN, fighter, STRATEGIES, answerValue } from '../src/battle.ts';
import { skillEffect, learntSkills, destroyPatterns, bestAction, skillWorth, swordPrior, type SkillEffect } from '../src/battle-actions.ts';
import { BattleRunner } from '../src/battle-runner.ts';
import { decodeEvent } from '../src/events.ts';

const trees = JSON.parse(readFileSync(new URL('../data/skills.json', import.meta.url), 'utf8')).trees as Record<string, { id: number; name: string; levels: { level: number; description: string; mana: number }[] }[]>;
const skill = (id: number, level: number) => {
  const k = Object.values(trees).flat().find(x => x.id === id)!, l = k.levels[level - 1];
  return skillEffect(id, level, l.description, l.mana, k.name);
};
const packets: Record<string, string> = fixtures['battle-packets'];

test('skillEffect reads every level of the three trees (540 descriptions of 14 kinds)', () => {
  let n = 0;
  for (const tree of Object.values(trees)) for (const k of tree) for (const l of k.levels) {
    const e = skillEffect(k.id, l.level, l.description, l.mana);
    assert.notEqual(e.kind, 'unknown', `${k.id} ${l.level}: ${l.description}`);
    n++;
  }
  assert.equal(n, 540);
  const pick = (e: SkillEffect, ...keys: (keyof SkillEffect)[]) => Object.fromEntries(keys.map(k => [k, e[k]]));
  assert.deepEqual(pick(skill(4000, 2), 'kind', 'damage', 'areas', 'cost'), { kind: 'damage', damage: 19, areas: { min: 1, max: 2, h: 2, w: 2 }, cost: 25 });
  assert.deepEqual(pick(skill(4001, 1), 'kind', 'heal', 'cost'), { kind: 'heal', heal: 0.11, cost: 50 });
  assert.deepEqual(pick(skill(1001, 1), 'kind', 'fire', 'keepTurn'), { kind: 'fire', fire: { min: 5, max: 7 }, keepTurn: 0.51 });
  assert.deepEqual(pick(skill(1002, 1), 'kind', 'buff', 'keepTurn'), { kind: 'buff', buff: { stat: 'attack', amount: 7, turns: 5 }, keepTurn: 1 });
  assert.deepEqual(pick(skill(2001, 1), 'buff'), { buff: { stat: 'defense', amount: 10, turns: 6 } });
  assert.deepEqual(pick(skill(2002, 1), 'buff'), { buff: { stat: 'dodge', amount: 15, turns: 6 } });
  assert.deepEqual(pick(skill(2000, 1), 'damage', 'random'), { damage: 11, random: { min: 1, max: 3 } });
  assert.deepEqual(pick(skill(2004, 1), 'damage', 'weaken'), { damage: 73, weaken: { chance: 0.35, amount: 35, turns: 6 } });
  assert.deepEqual(pick(skill(2005, 1), 'damage', 'drain'), { damage: 45, drain: { chance: 0.1, hp: 70 } });
  assert.deepEqual(pick(skill(2006, 1), 'damage', 'rows'), { damage: 57, rows: 1 });
  assert.deepEqual(pick(skill(1008, 1), 'damage', 'cols'), { damage: 45, cols: 2 });
  assert.deepEqual(pick(skill(4006, 1), 'damage', 'areas'), { damage: 57, areas: { min: 1, max: 1, h: 3, w: 3 } });
  assert.deepEqual(pick(skill(4002, 1), 'kind', 'sap'), { kind: 'sap', sap: 0.23 });
  assert.deepEqual(pick(skill(4003, 1), 'kind', 'damage', 'areas'), { kind: 'damage', damage: 45, areas: undefined });
});

test('learntSkills: only skills with a level, each at its own level, costing its nội lực', () => {
  const thuy = trees['4'].map(k => ({ ...k }));
  const got = learntSkills(thuy, new Map([[4000, 2], [4001, 1], [4002, 0]]));
  assert.deepEqual(got.map(e => [e.id, e.level, e.kind, e.cost, e.damage ?? e.heal]), [[4000, 2, 'damage', 25, 19], [4001, 1, 'heal', 50, 0.11]]);
});

test('destroyPatterns: 1–2 areas of 2×2, one row, 1–3 random cells, nothing for a heal', () => {
  let x = 7; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
  for (const cells of destroyPatterns(skill(4000, 1), rnd, 50)) assert.ok(cells.length >= 4 && cells.length <= 8 && cells.every(i => i >= 0 && i < N * N));
  for (const cells of destroyPatterns(skill(2006, 1), rnd, 20)) { assert.equal(cells.length, N); assert.equal(new Set(cells.map(i => Math.floor(i / N))).size, 1); }
  for (const cells of destroyPatterns(skill(2000, 1), rnd, 20)) assert.ok(cells.length >= 1 && cells.length <= 3);
  assert.deepEqual(destroyPatterns(skill(4001, 1), rnd, 20), [[]]);
});

test('skillWorth and swordPrior: what a yin-yang is worth comes from the best damage skill; W from Tấn công and level', () => {
  assert.deepEqual(skillWorth(8, [skill(4001, 1)]), { skillDamage: 0, skillCost: 0 });
  assert.deepEqual(skillWorth(8, [skill(4001, 1), skill(4000, 2)]), { skillDamage: 32 + 19 * 6 / 7, skillCost: 25 });
  assert.equal(swordPrior(32, 21), 12);              // manina: 36 for 3 swords
  assert.equal(swordPrior(23, 16), 25 / 3);          // Tiheo2: 24 measured
});

// Two moves on a board of unknown cells: three drops at the top and three swords lower down.
const twoMoves = () => {
  const b = Array<number>(N * N).fill(UNKNOWN), at = (r: number, c: number, v: number) => { b[r * N + c] = v; };
  at(0, 0, 4); at(0, 1, 4); at(0, 2, 2); at(1, 2, 4);
  at(5, 0, 0); at(5, 1, 0); at(5, 2, 1); at(6, 2, 0);
  return b;
};
const tiheo2 = (hp: number, s1: number) => ({ ...fighter(hp, 150, { s1, sword: 8, heart: 3.33, yinyang: 2.3, peach: 5 }), ...skillWorth(8, [skill(4000, 2)]) });
const chiHuy = (hp: number) => fighter(hp, 202, { s1: 30, sword: 3.33, skillCost: 25, skillDamage: 43 });
const skills = [skill(4000, 2), skill(4001, 1)];

test('bestAction: heals when the mob\'s skill would end the battle and the heal lifts HP over it', () => {
  const { best, all } = bestAction(twoMoves(), tiheo2(40, 50), chiHuy(200), STRATEGIES.win, { skills });
  assert.deepEqual(best!.action, { kind: 'skill', id: 4001 });
  assert.deepEqual(all.map(a => a.label).sort(), ['skill 4000', 'skill 4001', 'swap']);
  // At 60 HP the mob's skill (43) does not kill. The nội lực is charged at its worth (SPEND): the damage skill would deal
  // as much next turn, so the swap now; at 80 nội lực the next yin-yang would be lost, so nothing is charged and it casts.
  const at60 = (s1: number) => bestAction(twoMoves(), tiheo2(60, s1), chiHuy(200), STRATEGIES.win, { skills }).best!.label;
  assert.deepEqual([at60(50), at60(80)], ['swap', 'skill 4000']);
  assert.equal(bestAction(twoMoves(), tiheo2(60, 50), chiHuy(200), STRATEGIES.win, { skills, spend: 0 }).best!.label, 'skill 4000', 'nothing charged: cast now');
});

test('bestAction: the damage skill when it likely kills, though three swords do not; no skill without the nội lực', () => {
  const kill = bestAction(twoMoves(), tiheo2(150, 25), chiHuy(30), STRATEGIES.win, { skills });
  assert.deepEqual(kill.best!.action, { kind: 'skill', id: 4000 });
  assert.ok(kill.best!.score > 0.85e4 && kill.best!.score < 1e4, 'K is lost one cast in seven');
  assert.deepEqual(bestAction(twoMoves(), tiheo2(150, 24), chiHuy(30), STRATEGIES.win, { skills }).all.map(a => a.label), ['swap']);
});

test('bestAction: a potion only at its cost; worth it when the mob could end the battle', () => {
  const potions = [{ slot: 8, itemId: 0, quantity: 1 }], me = tiheo2(40, 0);
  assert.equal(bestAction(twoMoves(), me, chiHuy(200), STRATEGIES.win, { skills, potions }).best!.label, 'swap', 'no potionCost: never');
  const used = bestAction(twoMoves(), me, chiHuy(200), STRATEGIES.win, { skills, potions, potionCost: 300 }).best!;
  assert.deepEqual(used.action, { kind: 'item', slot: 8, itemId: 0 });
  const after = { ...me, hp: 40 + 37 };
  assert.ok(Math.abs(used.score - (37 - 300 - answerValue(twoMoves(), chiHuy(200), after, STRATEGIES.win))) < 1e-9, '⌊25% of 150⌋ = 37 HP');
  assert.equal(bestAction(twoMoves(), tiheo2(100, 0), chiHuy(200), STRATEGIES.win, { skills, potions, potionCost: 300 }).best!.label, 'swap', 'no threat: keep it');
  assert.equal(bestAction(twoMoves(), me, chiHuy(200), STRATEGIES.win, { skills, potions: [{ ...potions[0], quantity: 0 }], potionCost: 300 }).best!.label, 'swap');
});

test('bestAction: a buff that keeps the turn is not cast again while it lasts', () => {
  const b = twoMoves(), me = { ...tiheo2(150, 75), sword: 12 }, buff = [skill(1002, 1)];
  assert.equal(bestAction(b, me, chiHuy(200), STRATEGIES.win, { skills: buff }).best!.label, 'skill 1002');
  assert.equal(bestAction(b, me, chiHuy(200), STRATEGIES.win, { skills: buff, buffs: { attack: 2 } }).best!.label, 'swap');
});

test('battle runner with the learnt skills: casts the heal (c2s/20 4001) when low, logs the choice', () => {
  const sent: [number, Buffer][] = [], logs: [string, any][] = [];
  const runner = new BattleRunner({ me: 'Ttuananh', level: 16, hp: 40, maxHp: 150, uuid: 'u', board: twoMoves(), turnSeconds: 30, knownBytes: 0 }, 'mob872600',
    { send: (op, p) => sent.push([op, Buffer.from(p)]), log: (e, f) => logs.push([e, f]), onEnd: () => {}, strategy: STRATEGIES.win, skills, stats: { attack: 23, level: 16 },
      mob: { name: 'Chỉ Huy Sơn Tặc', hp: 202, maxHp: 202 } });
  assert.equal(runner.me.sword, 25 / 3);
  runner.me.s1 = 50; runner.mob.s1 = 30; runner.mob.skillDamage = 43;
  runner.onPacket(24, Buffer.from(packets['s2c/24 own turn'], 'hex'));
  assert.deepEqual([sent.at(-1)![0], (decodeEvent('c2s', 20, sent.at(-1)![1]).fields as any).skill], [20, 4001]);
  const choice = logs.find(([e]) => e === 'choice')![1];
  assert.equal(choice.pick, 'skill 4001');
  assert.deepEqual(choice.scores.map((s: [string, number]) => s[0]).sort(), ['skill 4000', 'skill 4001', 'swap']);
});

test('bestAction: every skill is charged its nội lực until the bar is too full for the cheapest one (the heal is not free at 60)', () => {
  const heal = (s1: number) => bestAction(twoMoves(), tiheo2(100, s1), chiHuy(200), STRATEGIES.win, { skills }).all.find(a => a.label === 'skill 4001')!.score;
  // 50 nội lực at what Băng Tiễn makes of it (32 + 19 × 6/7 per 25) is ~97 HP: charged at 60, free at 80 (80 + 25 > 100).
  assert.ok(heal(60) < heal(80) - 90, `${heal(60)} vs ${heal(80)}`);
  const timed = { ...STRATEGIES.win, reply: 0, extraTurn: 0, lookahead: 0 };
  assert.equal(Math.round(bestAction(twoMoves(), tiheo2(100, 60), chiHuy(200), timed, { skills }).all.find(a => a.label === 'skill 4001')!.score), 16, 'timed: nothing charged, nothing answered');
});

test('battle runner: a potion the server does not answer is not tried again; own damage per sword is kept per kind of mob', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sent: number[] = [], setup = () => ({ me: 'Ttuananh', level: 16, hp: 40, maxHp: 150, uuid: 'u', board: twoMoves(), turnSeconds: 30, knownBytes: 0 });
  const memory = new Map<string, [number, number]>();
  const io = { send: (op: number) => sent.push(op), log: () => {}, onEnd: () => {}, strategy: STRATEGIES.win, skills, potions: [{ slot: 8, itemId: 0, quantity: 1 }], potionCost: 300,
    stats: { attack: 23, level: 16 }, memory, mob: { name: 'Chỉ Huy Sơn Tặc', hp: 202, maxHp: 202 } };
  const runner = new BattleRunner(setup(), 'mob872600', io);
  runner.mob.s1 = 30; runner.mob.skillDamage = 43;
  runner.onPacket(24, Buffer.from(packets['s2c/24 own turn'], 'hex'));
  assert.equal(sent.at(-1), 44, 'no nội lực for the heal: the potion');
  t.mock.timers.tick(3000);
  assert.equal(sent.at(-1), 19, 'no answer: the swap');
  runner.onPacket(24, Buffer.from(packets['s2c/24 own turn'], 'hex'));
  assert.equal(sent.at(-1), 19, 'the slot is taken as empty');
  (runner as any).learnFrom(runner.me, { name: 'Ttuananh', damage: 22, b: 0, hp: -1, s1: -1, s2: -1 }, { cleared: { 0: 3 }, waves: 1, extraTurn: false, refillUsed: 0 }, false);
  assert.deepEqual([...memory.keys()], ['me>Chỉ Huy Sơn Tặc.sword']);
  assert.equal(new BattleRunner(setup(), 'mob872601', io).me.sword, (25 / 3 * 6 + 22) / 9, 'the same kind: what was learnt');
  assert.equal(new BattleRunner(setup(), 'mob42000', { ...io, mob: { name: 'Sơn Tặc', hp: 248, maxHp: 248 } }).me.sword, 25 / 3, 'another kind: the prior from Tấn công');
});

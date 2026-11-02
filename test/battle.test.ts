import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './fixtures.ts';
import { N, EMPTY, UNKNOWN, swap, settle, findRuns, legalMoves, bestMove, moveValue, fighter, unknownMob, STRATEGIES, MOB_AI, mobMoveOdds, answerValue, castSkill, mobBlock, applyResult, battleResult, FIRE, type Move } from '../src/battle/battle.ts';
import { Reader, Writer } from '../src/protocol/protocol.ts';
import { fireCasts } from './fixtures-fire.ts';
import { buildRequest, decodeEvent } from '../src/protocol/events.ts';
import { BattleRunner, type BattleEnd } from '../src/battle/battle-runner.ts';

const battles: { source: string; board: number[]; steps: { seq: number; move?: number[]; cells?: number[][]; refill: number[]; actor: string; extraTurn: boolean }[] }[] = fixtures.battles;
const toMove = (m: number[]): Move => ({ from: [m[0], m[1]], to: [m[2], m[3]] });

test('captured battles replay exactly: every server move matches, every refill piece is used, extra turns agree', () => {
  for (const battle of battles) {
    const b = battle.board.slice();
    assert.equal(findRuns(b).cells.size, 0, `${battle.source}: initial board has no run`);
    for (const step of battle.steps) {
      const where = `${battle.source} seq ${step.seq}`;
      if (step.move) { swap(b, toMove(step.move)); assert.ok(findRuns(b).cells.size, `${where}: move makes a run`); }
      const o = settle(b, step.refill, (step.cells ?? []).map(([r, c]) => r * N + c));
      assert.equal(o.refillUsed, step.refill.length, `${where}: refill count`);
      assert.ok(!b.includes(EMPTY) && !b.includes(UNKNOWN), `${where}: board full`);
      if (step.move) assert.equal(o.extraTurn, step.extraTurn, `${where}: extra turn`);
    }
  }
});

test('a special piece (code 10) clears its 3×3 neighbourhood when matched', () => {
  const b = Array.from({ length: N * N }, (_, i) => [1, 2, 3, 4, 5][(i + Math.floor(i / N)) % 5]);
  b[2 * N + 3] = 10; b[3 * N + 3] = 0; b[4 * N + 3] = 0;
  const { cells } = findRuns(b);
  for (let r = 1; r <= 3; r++) for (let c = 2; c <= 4; c++) assert.ok(cells.has(r * N + c), `r${r}c${c} blasted`);
  assert.ok(cells.has(4 * N + 3));
});

test('two crossing runs of three grant an extra turn, a lone run of three does not (in-game guide)', () => {
  const base = () => Array.from({ length: N * N }, (_, i) => [1, 2, 3, 4, 5][(i + Math.floor(i / N)) % 5]);
  const cross = base(); for (const [r, c] of [[2, 3], [2, 4], [2, 5], [3, 3], [4, 3]]) cross[r * N + c] = 0;
  assert.equal(settle(cross, null).extraTurn, true);
  const line = base(); for (const [r, c] of [[2, 3], [2, 4], [2, 5]]) line[r * N + c] = 0;
  assert.equal(settle(line, null).extraTurn, false);
});

test('bestMove picks a legal move on every captured position', () => {
  for (const battle of battles) {
    const b = battle.board.slice();
    for (const step of battle.steps) {
      const pick = bestMove(b);
      const legal = legalMoves(b).map(m => String([m.from, m.to]));
      if (pick) assert.ok(legal.includes(String([pick.move.from, pick.move.to])));
      if (step.move) swap(b, toMove(step.move));
      settle(b, step.refill, (step.cells ?? []).map(([r, c]) => r * N + c));
    }
  }
});

test('moveValue: hearts are worth nothing at full HP, swords double at full power, a killing move wins outright', () => {
  const k = STRATEGIES.kill, o = (cleared: Record<number, number>) => ({ cleared, waves: 1, extraTurn: false, refillUsed: 0 });
  const mob = fighter(249, 249, { sword: 10.9 });
  assert.equal(moveValue(o({ 1: 3 }), fighter(174, 174), mob, k), 0);
  assert.equal(moveValue(o({ 1: 3 }), fighter(170, 174), mob, k), 4); // only the 4 HP missing
  assert.equal(moveValue(o({ 0: 3 }), fighter(174, 174, { s2: 100 }), mob, k), 60);
  assert.equal(moveValue(o({ 0: 3 }), fighter(174, 174), fighter(30, 249), k), 1e4);
  assert.equal(moveValue(o({ 2: 3 }), fighter(174, 174, { skillCost: 0 }), mob, k), 0); // no skill, no use for nội lực
  assert.equal(moveValue(o({ 1: 3 }), unknownMob(), fighter(174, 174), k), 0); // a mob not hit yet is at full HP
});

test('bestMove: a killing move first; otherwise four hearts that keep the turn over three swords the mob would heal back', () => {
  const b = Array<number>(N * N).fill(UNKNOWN), at = (r: number, c: number, v: number) => { b[r * N + c] = v; };
  at(0, 0, 0); at(0, 1, 0); at(0, 2, 1); at(1, 2, 0);                // (0,2)↔(1,2): three swords in row 0
  at(2, 0, 1); at(2, 1, 1); at(2, 2, 2); at(3, 2, 1); at(2, 3, 1);   // (2,2)↔(3,2): four hearts in row 2, extra turn
  const swords = { from: [0, 2], to: [1, 2] }, hearts = { from: [2, 2], to: [3, 2] };
  const pick = (me: number, mob: number) => { const p = bestMove(b, fighter(me, 174), fighter(mob, 249))!; return [p.move, p.score]; };
  // Swords: 30 damage, then the mob answers with the four hearts: 22 HP back plus an extra turn (10), so 30 − 32.
  assert.deepEqual(pick(174, 249), [hearts, 10]);           // full HP: only the extra turn, but no answer for the mob
  assert.deepEqual(pick(60, 249), [hearts, 4 * 5.5 + 10]);   // low HP: 22 HP healed plus the extra turn
  assert.deepEqual(pick(60, 25), [swords, 1e4]);
});

test('battle runner learns what a piece does for the mob: damage per sword, and its skill cost and damage', () => {
  const runner = new BattleRunner({ me: 'manina', level: 19, hp: 174, maxHp: 174, uuid: 'u', board: battles[0].board.slice(), turnSeconds: 30, knownBytes: 0 }, 'mob61000',
    { send: () => {}, log: () => {}, onEnd: () => {} });
  const learn = (runner as any).learnFrom.bind(runner), unit = (damage: number) => ({ name: 'mob61000', damage, b: 0, hp: -1, s1: -1, s2: -1 });
  learn(runner.mob, unit(33), { cleared: { 0: 3 }, waves: 1, extraTurn: false, refillUsed: 0 }, false);
  assert.equal(runner.mob.sword, (8 * 6 + 33) / 9); // prior 8 as six pieces, then three swords for 33
  runner.mob.s1 = 30;
  learn(runner.mob, unit(59), { cleared: {}, waves: 0, extraTurn: false, refillUsed: 0 }, true);
  // Prior: 4 swords of the unknown mob + 11; the cost stays at the 25 every side paid.
  assert.deepEqual([runner.mob.skillDamage, runner.mob.skillCost], [(43 + 59) / 2, 25]);
});

test('battle runner: the mob\'s HP from s2c/22, and what one battle learnt is where the next one starts', () => {
  const setup = { me: 'manina', level: 21, hp: 238, maxHp: 238, uuid: 'u', board: battles[0].board.slice(), turnSeconds: 30, knownBytes: 0 };
  const memory = new Map<string, [number, number]>(), io = { send: () => {}, log: () => {}, onEnd: () => {}, memory, mob: { name: 'Cóc Xanh', hp: 249, maxHp: 249 } };
  const first = new BattleRunner(setup, 'mob61000', io);
  assert.deepEqual([first.mob.hp, first.mob.maxHp, first.me.yinyang], [249, 249, 2]);
  (first as any).learnFrom(first.mob, { name: 'mob61000', damage: 33, b: 0, hp: -1, s1: -1, s2: -1 }, { cleared: { 0: 3 }, waves: 1, extraTurn: false, refillUsed: 0 }, false);
  const next = new BattleRunner(setup, 'mob61001', io);
  assert.deepEqual([next.mob.sword, [...memory.keys()]], [(8 * 6 + 33) / 9, ['Cóc Xanh.sword']]);
  assert.equal(new BattleRunner(setup, 'mob42100', { ...io, mob: { name: 'Sói Xám', hp: 220, maxHp: 220 } }).mob.sword, 8, 'another kind of mob starts from the prior');
});

test('mobBlock: the mob part of s2c/22 found by its id (layout of 07-auto-battle.md#s2c22-641-byte)', () => {
  const p = new Writer().u8(1).u8(0).string('manina').string('manina').u8(0).u8(0).u8(1).i32(21).i32(0).u8(0).i32(150).i32(238)
    .i32(0).i32(100).i32(0).i32(100).string('mob61000x').string('mob61000').string('Cóc Xanh').u8(1).u8(0).u8(4).i32(13).i32(100050).u8(0).i32(249).i32(249).build();
  assert.deepEqual(mobBlock(p, 'mob61000'), { name: 'Cóc Xanh', element: 4, level: 13, sprite: 100050, hp: 249, maxHp: 249 });
  assert.equal(mobBlock(p, 'mob42100'), undefined);
});

const packets: Record<string, string> = fixtures['battle-packets'];
const decode = (key: string) => {
  const d = decodeEvent('s2c', Number(key.split(/[/ ]/)[1]), Buffer.from(packets[key], 'hex'));
  return { ...(d.fields as any), opaqueBytes: d.opaqueBytes };
};

test('battle packets from the Q2/Q4 runs: turn, join ack, swap result, reshuffled board, two skills, stats', () => {
  assert.deepEqual(decode('s2c/24 own turn'), { seq: 1, field: 0, playerTurn: 1, field9: 0, opaqueBytes: 0 });
  assert.equal(decode('s2c/24 mob turn').playerTurn, 0);
  assert.equal(decode('s2c/18').opaqueBytes, 0);
  const extra = decode('s2c/19 extra turn');
  assert.deepEqual([extra.move, extra.refill, extra.extraTurn, extra.actor, extra.opaqueBytes], [{ from: [6, 3], to: [7, 3] }, [1, 3, 2, 0], true, 'manina', 0]);
  const shuffled = decode('s2c/19 reshuffled');
  assert.equal(shuffled.newBoard.length, N * N); assert.equal(shuffled.opaqueBytes, 0);
  assert.equal(findRuns(shuffled.newBoard).cells.size, 0, 'a reshuffled board has no ready run');
  const skill = decode('s2c/20');
  assert.deepEqual([skill.skill, skill.targets, skill.cells, skill.units.map((u: any) => [u.name, u.hp]), skill.opaqueBytes], [2000, [], [60], [['mob2806', 29], ['manina', 96]], 0]);
  const blast = decode('s2c/20 skill 1000'); // two targets, each destroying the 2×2 block below-right of it
  const block = (i: number) => [i, i + 1, i + N, i + N + 1];
  assert.deepEqual([blast.skill, blast.targets, blast.cells, blast.opaqueBytes], [1000, [21, 2], [...block(21), ...block(2)], 0]);
  assert.deepEqual(decode('s2c/10 kind 4'), { kind: 4, name: 'manina', hp: 98, maxHp: 136, exp: 471, levelExp: [300, 500], coin: 28, extra: [10000, 40, 9, 30, 20, 6], opaqueBytes: 0 });
});

test('a special piece destroyed by a skill blasts its 3×3 neighbourhood too (Q5 seq 41: 4 cells hit, 9 refilled)', () => {
  const b: number[] = fixtures['board before skill on a special'].slice();
  const x = decode('s2c/20 skill on a special');
  assert.equal(b[x.cells[3]], 10);
  const o = settle(b, x.refill, x.cells);
  assert.deepEqual([x.cells.length, x.refill.length, o.refillUsed], [4, 9, 9]);
  assert.ok(!b.includes(EMPTY) && !b.includes(UNKNOWN) && !findRuns(b).cells.size);
  const c: number[] = fixtures['board before skill on a special'].slice(), oc = applyResult(c, x);
  assert.deepEqual([oc.fire, oc.desync, c], [false, false, b], 'a skill of the mob: destroyed, not turned');
});

test('Hỏa Kiếm Thuật (1001, symap 02/11): its s2c/20 turns its cells into Kiếm lửa, a run they make falls at once, and the next results fall on that board', () => {
  const read = (hex: string, op: 19 | 20) => battleResult(new Reader(Buffer.from(hex, 'hex')), op);
  for (const f of fireCasts) {
    const x = read(f.cast, 20);
    assert.deepEqual([x.skill, x.targets, x.newBoard, x.actor], [1001, [], undefined, 'symap'], f.source);
    assert.ok(x.cells.length >= 7 && x.cells.length <= 10, `${f.source}: 7–10 pieces`);
    assert.ok(applyResult(f.board.slice(), x, false).desync, `${f.source}: destroying the cells does not fit`);
    for (const fire of [true, undefined]) {
      const b = f.board.slice(), o = applyResult(b, x, fire);
      assert.deepEqual([o.fire, o.desync, o.refillUsed, o.waves > 0], [true, false, x.refill.length, x.refill.length > 0], `${f.source}, effect ${fire ?? 'unknown'}`);
      if (!x.refill.length) assert.ok(x.cells.every(c => b[c] === FIRE), `${f.source}: the cells are Kiếm lửa`);
      for (const [i, hex] of f.next.entries()) assert.equal(applyResult(b, read(hex, 19)).desync, false, `${f.source}: result ${i + 1} after the cast`);
    }
  }
  assert.deepEqual(fireCasts.map(f => read(f.cast, 20).refill.length), [0, 0, 15]);
});

test('timed battles (Q6–Q9 Sơn Tặc): s2c/18 flag, s2c/21 hit, s2c/1256 notice', () => {
  assert.equal(decode('s2c/18 player first').timed, 1);
  const hit = decode('s2c/21');
  assert.deepEqual([hit.units.map((u: any) => [u.name, u.damage, u.hp]), hit.actor, hit.end, hit.opaqueBytes], [[['mob42007', 46, -1], ['manina', -1, 64]], 'mob42007', false, 0]);
  assert.deepEqual(decode('s2c/1256'), { field: 0, text: 'Thua trận, mất 16 kinh nghiệm', opaqueBytes: 0 });
  const sent: number[] = [];
  const runner = new BattleRunner({ me: 'manina', level: 11, hp: 110, maxHp: 120, uuid: 'u', board: battles[0].board.slice(), turnSeconds: 30, knownBytes: 0 }, 'mob42007',
    { send: op => sent.push(op), log: () => {}, onEnd: () => {} });
  runner.onPacket(18, Buffer.from(packets['s2c/18 player first'], 'hex'));
  assert.deepEqual(sent, [19], 'the player opens with a swap, not a step request');
  clearTimeout((runner as any).turnWait);
  runner.onPacket(21, Buffer.from(packets['s2c/21'], 'hex'));
  assert.equal(runner.me.hp, 64);
});

test('battle and quest requests: builders match the captured layouts and decode back', () => {
  const uuid = 'c451ecac-ea99-42b8-a22a-c5c72e898659', move: Move = { from: [5, 6], to: [4, 6] };
  assert.equal(buildRequest(15, { mobId: 'mob872604' }).toString('hex'), '000000096d6f6238373236303400');
  assert.equal(buildRequest(1173, { zone: 20 }).toString('hex'), '14');
  assert.deepEqual(buildRequest(19, { battleUuid: uuid, seq: 13, move }), new Writer().string(uuid).i32(13).i32(7).i32(8).i32(6).i32(8).build());
  for (const [opcode, ctx] of [[13, { mapId: 'M1', npcId: 103 }], [15, { mobId: 'mob10' }], [18, { battleUuid: uuid }], [40, { battleUuid: uuid }],
    [14, { battleUuid: uuid, seq: 4 }], [19, { battleUuid: uuid, seq: 13, move }], [1173, { zone: 20 }], [10, { stat: 0, amount: 1 }]] as const) {
    const d = decodeEvent('c2s', opcode, buildRequest(opcode, ctx));
    assert.equal(d.known, true); assert.equal(d.opaqueBytes, 0, `c2s/${opcode}`);
  }
  assert.deepEqual(decodeEvent('c2s', 19, buildRequest(19, { battleUuid: uuid, seq: 13, move })).fields, { battleUuid: uuid, seq: 13, ...move });
});

test('battle runner: leave() sends c2s/11 then c2s/40 like the game\'s Đầu hàng, no move after it, and resume() plays the turn passed over', () => {
  const sent: [number, Buffer][] = [];
  const runner = new BattleRunner({ me: 'manina', level: 3, hp: 130, maxHp: 130, uuid: 'u', board: battles[0].board.slice(), turnSeconds: 30, knownBytes: 0 }, 'mob872604',
    { send: (op, p) => sent.push([op, Buffer.from(p)]), log: () => {}, onEnd: () => {} });
  runner.start();
  runner.onPacket(18, Buffer.from(packets['s2c/18'], 'hex'));
  runner.leave('M1');
  assert.deepEqual(sent.slice(-2).map(([op, p]) => [op, decodeEvent('c2s', op, p).fields]),
    [[11, { mapId: 'M1', area: 255, field: -1 }], [40, { battleUuid: 'u' }]]);
  const before = sent.length;
  assert.equal(runner.onPacket(24, Buffer.from(packets['s2c/24 own turn'], 'hex')), true);
  assert.equal(runner.onPacket(24, Buffer.from(packets['s2c/24 mob turn'], 'hex')), true);
  assert.equal(sent.length, before, 'no swap or step while leaving');
  runner.resume();
  assert.deepEqual(decodeEvent('c2s', 14, sent.at(-1)![1]).fields, { battleUuid: 'u', seq: 4 }, 'the mob turn passed over last');
  runner.onPacket(24, Buffer.from(packets['s2c/24 own turn'], 'hex'));
  assert.equal(sent.at(-1)![0], 19, 'plays on once the leave is given up');
});

test('battle runner: joins, steps for the mob, plays a legal move on its own turn, ends on end=1', () => {
  const sent: [number, Buffer][] = [], ends: BattleEnd[] = [];
  const board = battles[0].board.slice();
  const runner = new BattleRunner({ me: 'manina', level: 3, hp: 130, maxHp: 130, uuid: 'u', board, turnSeconds: 30, knownBytes: 0 }, 'mob872604',
    { send: (op, p) => sent.push([op, Buffer.from(p)]), log: () => {}, onEnd: e => ends.push(e) });
  runner.start(); assert.equal(sent.at(-1)![0], 18);
  runner.onPacket(18, Buffer.from(packets['s2c/18'], 'hex'));
  assert.deepEqual(decodeEvent('c2s', 14, sent.at(-1)![1]).fields, { battleUuid: 'u', seq: 0 });
  runner.onPacket(24, Buffer.from(packets['s2c/24 mob turn'], 'hex'));
  assert.deepEqual(decodeEvent('c2s', 14, sent.at(-1)![1]).fields, { battleUuid: 'u', seq: 4 });
  runner.onPacket(24, Buffer.from(packets['s2c/24 own turn'], 'hex'));
  const swapSent = decodeEvent('c2s', 19, sent.at(-1)![1]).fields as any;
  assert.ok(legalMoves(board).some(m => String([m.from, m.to]) === String([swapSent.from, swapSent.to])));
  const end = new Writer().i32(2).i32(0).i32(0).i32(2).i32(2).i32(2).i32(3).i32(1).bytes(Buffer.alloc(0))
    .u8(1).string('mob872604').i32(29).u8(0).i32(0).i32(-1).i32(-1).u8(0).u8(0).u8(0).u8(1).string('manina').u8(1).u8(1).i32(8).i32(4).build();
  assert.equal(runner.onPacket(19, end), true);
  assert.deepEqual(ends, [{ won: true, actor: 'manina', exp: 8, coin: 4, myTurns: 1, hp: 130, mobId: 'mob872604', damage: 0 }]);
  assert.equal(runner.onPacket(1262, Buffer.alloc(0)), false);
});

// Two moves on a board of unknown cells: three drops at the top (found first) and three swords lower down.
const twoMoves = () => {
  const b = Array<number>(N * N).fill(UNKNOWN), at = (r: number, c: number, v: number) => { b[r * N + c] = v; };
  at(0, 0, 4); at(0, 1, 4); at(0, 2, 2); at(1, 2, 4);   // (0,2)↔(1,2): three drops in row 0
  at(5, 0, 0); at(5, 1, 0); at(5, 2, 1); at(6, 2, 0);   // (5,2)↔(6,2): three swords in row 5
  return b;
};

test('mobMoveOdds: the mob plays swords over drops, though the drops are the first move it finds', () => {
  const [drops, swords] = mobMoveOdds(twoMoves());
  assert.deepEqual([drops.move, swords.move], [{ from: [0, 2], to: [1, 2] }, { from: [5, 2], to: [6, 2] }]);
  assert.deepEqual([drops.outcome.cleared, swords.outcome.cleared], [{ 4: 3 }, { 0: 3 }]);
  const odds = Math.exp(3 * MOB_AI.piece[0] - (MOB_AI.firstFound + 3 * MOB_AI.piece[4]));
  assert.ok(Math.abs(swords.p / drops.p - odds) < 1e-9 && Math.abs(drops.p + swords.p - 1) < 1e-9);
});

test('answerValue: the best answer (Q20) or the average one, with the skill half the time once the mob has the nội lực', () => {
  const b = twoMoves(), me = fighter(174, 174), mob = fighter(249, 249, { sword: 12 });
  const [, swords] = mobMoveOdds(b);
  assert.equal(answerValue(b, mob, me, STRATEGIES.kill), 36);
  assert.ok(Math.abs(answerValue(b, mob, me, STRATEGIES.win) - swords.p * 36) < 1e-9);
  const ready = { ...mob, s1: 25, skillCost: 25, skillDamage: 59 };
  assert.ok(Math.abs(answerValue(b, ready, me, STRATEGIES.win) - (MOB_AI.cast * 59 + (1 - MOB_AI.cast) * swords.p * 36)) < 1e-9);
});

test('bestMove win: four hearts at full HP are worth the three swords the extra turn then plays; kill sees only 10 for it', () => {
  const b = Array<number>(N * N).fill(UNKNOWN), at = (r: number, c: number, v: number) => { b[r * N + c] = v; };
  at(0, 0, 1); at(0, 1, 1); at(0, 2, 2); at(1, 2, 1); at(0, 3, 1);   // (0,2)↔(1,2): four hearts in row 0, extra turn
  at(5, 0, 0); at(5, 1, 0); at(5, 2, 1); at(6, 2, 0);                // (5,2)↔(6,2): three swords in row 5
  const hearts = { from: [0, 2], to: [1, 2] }, swords = { from: [5, 2], to: [6, 2] };
  const pick = (s: typeof STRATEGIES.kill) => { const p = bestMove(b, fighter(174, 174), fighter(249, 249), s)!; return [p.move, p.score]; };
  // Swords: 30 damage; the fall drops the hearts a row, where the mob's only answer is three hearts, 16.5 HP back.
  assert.deepEqual(pick(STRATEGIES.kill), [swords, 30 - 16.5]);
  assert.deepEqual(pick(STRATEGIES.win), [hearts, 30]);
});

test('castSkill: never short of nội lực; always when its least damage kills or nội lực doubles the cost; else against the swap', () => {
  const b = twoMoves(), mob = fighter(249, 249), me = (s1: number, s2 = 0) => fighter(174, 174, { s1, s2, sword: 12, skillCost: 25, skillDamage: 59 });
  assert.equal(castSkill(b, me(24), fighter(1, 249), STRATEGIES.win, 0), false);
  assert.equal(castSkill(b, me(25), fighter(36, 249), STRATEGIES.win, 1e4), true);   // 3 swords × 12 kill: cast
  assert.equal(castSkill(b, me(50), mob, STRATEGIES.win, 80), true);
  const answer = answerValue(b, { ...mob, hp: 249 - 59 }, me(25), STRATEGIES.win);
  assert.equal(castSkill(b, me(25), mob, STRATEGIES.win, 59 - answer), true);
  assert.equal(castSkill(b, me(25), mob, STRATEGIES.win, 59 - answer + 0.1), false);
  assert.equal(castSkill(b, me(25, 100), mob, STRATEGIES.win, 59 - answer + 0.1), true, 'a full power bar doubles the skill');
  assert.equal(castSkill(b, me(25), mob, STRATEGIES.win, null), true, 'no swap left');
});

test('battle runner: a test plan uses a bag item on its turn (c2s/44), and the s2c/44 of P5 sets the HP', () => {
  const sent: [number, Buffer][] = [];
  const runner = new BattleRunner({ me: 'Ttuananh', level: 15, hp: 31, maxHp: 145, uuid: 'f88a4c00-bcb7-49bf-8a30-93e3dbbff9ca', board: battles[0].board.slice(), turnSeconds: 30, knownBytes: 0 }, 'mob42017',
    { send: (op, p) => sent.push([op, Buffer.from(p)]), log: () => {}, onEnd: () => {}, choose: (r) => r.me.hp < 50 ? { item: 4 } : undefined });
  runner.onPacket(24, Buffer.from(packets['s2c/24 own turn'], 'hex'));
  assert.deepEqual([sent.at(-1)![0], decodeEvent('c2s', 44, sent.at(-1)![1]).fields], [44, { battleUuid: 'f88a4c00-bcb7-49bf-8a30-93e3dbbff9ca', a: 0, slot: 4 }]);
  runner.onPacket(44, Buffer.from('0000000100000000fafab599000000000000000400000000000000000100000008547475616e616e68ffffffff0000000043ffffffffffffffff0000000100000008547475616e616e6800', 'hex'));
  assert.equal(runner.me.hp, 67);
  runner.onPacket(24, Buffer.from(packets['s2c/24 own turn'], 'hex'));
  assert.equal(sent.at(-1)![0], 19, 'HP is back over 50: a swap');
});

test('s2c/20 of a skill that destroys nothing (Hàn Lưu Thánh Thủy 4001, A1): no refill, no reshuffle byte; HP 19 → 34', () => {
  const heal = decodeEvent('s2c', 20, Buffer.from('0000000700000000c85e76ba00000fa100000000000000000000000000000000000000000100000008547475616e616e68ffffffff000000002200000000ffffffff0000000100000008547475616e616e6800', 'hex'));
  const f = heal.fields as any;
  assert.deepEqual([f.skill, f.cells, f.refill, f.units.map((u: any) => [u.name, u.hp, u.s1]), f.actor, f.end, heal.opaqueBytes], [4001, [], [], [['Ttuananh', 34, 0]], 'Ttuananh', false, 0]);
});

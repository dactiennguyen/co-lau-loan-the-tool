import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './fixtures.ts';
import { N, EMPTY, UNKNOWN, swap, settle, findRuns, legalMoves, bestMove, type Move } from '../src/battle.ts';

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

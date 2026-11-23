import test from 'node:test';
import assert from 'node:assert/strict';
import { groundRow, platform, planFall, planWalk, moveBytes, type Grid, WALK, STAND, RUN, FALL } from '../src/protocol/walk.ts';

// A slice of M1 around where tiheo1 ran in MV1 (23/11): rows 11–13, columns 15–21 of s2c/11 layer 1, with the rows above
// empty; the platform 35 36 39 at row 13, columns 17–19; the next row of tiles under it.
function m1(): Grid {
  const rows = 16, cols = 24, tiles = new Array(rows * cols).fill(0);
  const put = (r: number, c: number, v: number) => (tiles[r * cols + c] = v);
  // Column 16 is a cliff drawn from row 6 down to row 13 (46 47 48 7 31 26 119 27 in M1): one stands on its top only.
  [46, 47, 48, 7, 31, 26, 119, 27].forEach((v, i) => put(6 + i, 16, v));
  put(13, 17, 35); put(13, 18, 36); put(13, 19, 39);
  for (let c = 0; c < cols; c++) put(15, c, 7);
  return { rows, cols, tiles };
}
const fixed = (seq: number[]) => { let i = 0; return (lo: number, hi: number) => Math.min(hi, Math.max(lo, seq[i++ % seq.length])); };

test('the ground under the spawn of s2c/11 and the platform there, as MV1 (593, 5) fell to (593, 416)', () => {
  const g = m1();
  assert.equal(groundRow(g, 593, 5), 13);
  assert.deepEqual(platform(g, 13, 600), { from: 544 + WALK.margin, to: 640 - WALK.margin });
  assert.equal(platform(g, 15, 600) != null, true, 'the floor below is one long platform');
  // The cliff's column: its top, row 6; the platform at row 13 stops before it (drawn above).
  assert.equal(groundRow(g, 16 * 32 + 5, 5), 6);
});

test('the fall after a map load ends standing on the ground; none when on it already', () => {
  const g = m1(), steps = planFall(g, 593, 5, true, fixed([120]));
  assert.deepEqual(steps[0], { at: 0, x: 593, y: 5, state: FALL, flags: [0, 0, 0, 0, 0] });
  const last = steps.at(-1)!;
  assert.deepEqual([last.y, last.state, last.flags], [416, STAND, [0, 0, 0, 1, 0]]);
  assert.ok(steps.slice(1, -1).every(s => s.state === FALL && s.y < 416));
  const gaps = steps.slice(1).map((s, i) => s.y - steps[i].y);
  assert.ok(gaps.every(d => d > 0 && d <= 48), `${gaps}`);
  assert.deepEqual(planFall(g, 593, 416, true, fixed([120])), []);
});

test('a walk stays on the platform, runs at the game speed and ends with two packets of standing', () => {
  const g = m1();
  // Only right has room from 560 (556 is the left end): the distance 60, then gaps of 120 ms.
  let calls = 0;
  const steps = planWalk(g, 560, 416, (lo, hi) => Math.min(hi, Math.max(lo, calls++ === 0 ? 60 : 120)));
  const end = steps.at(-1)!;
  assert.equal(end.x, 620);
  assert.deepEqual(steps.slice(-2).map(s => s.state), [STAND, STAND]);
  assert.ok(steps.slice(0, -2).every(s => s.state === RUN && s.flags[3] === 1));
  const p = platform(g, 13, 560)!;
  assert.ok(steps.every(s => s.x >= p.from && s.x <= p.to && s.y === 416));
  const per = steps.slice(1, -2).map((s, i) => s.x - steps[i].x);
  assert.ok(per.every(d => d === Math.round(WALK.speed * 0.12)), `${per}`);
  // Not on the ground (mid-air, or a slope's y) or a platform too narrow: no walk.
  assert.deepEqual(planWalk(g, 560, 400, fixed([1])), []);
  assert.deepEqual(moveBytes(steps[0]).toString('hex'), '00000230000001a0000000010000000100');
});

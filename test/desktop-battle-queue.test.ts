// The queue of the desktop battle window (app/desktop/src/battle/queue.ts, used by battle/useBattle.ts): while the window
// is minimized it cannot draw, and the queue must stay short without changing what the window shows once it is back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compact, LONG } from '../app/desktop/src/battle/queue.ts';

type Kind = 'open' | 'turn' | 'move' | 'end' | 'picked';
interface Entry {
  msg: { kind: Kind; rev: number };
  at: number;
}

let rev = 0;
const entry = (kind: Kind, at: number): Entry => ({ msg: { kind, rev: ++rev }, at });
const kinds = (q: Entry[]) => q.map((e) => e.msg.kind).join(' ');

/** What useBattle's step leaves on screen for messages drawn at once (pace 0): an open draws all anew, a turn says whose
 * turn, a move puts its board, gauges and turn, an end and a picked their own parts. Revs stand for the contents. */
function drawn(q: Entry[]) {
  let v = { open: 0, turn: 0, board: 0, end: 0, picked: 0 };
  for (const { msg: m } of q) {
    if (m.kind === 'open') v = { open: m.rev, turn: 0, board: 0, end: 0, picked: 0 };
    else if (m.kind === 'turn') v = { ...v, turn: m.rev };
    else if (m.kind === 'move') v = { ...v, board: m.rev };
    else if (m.kind === 'end') v = { ...v, end: m.rev, turn: 0 };
    else v = { ...v, picked: m.rev };
  }
  return v;
}

test('of the stale messages, a run of turns and moves keeps its last turn and last move, in order', () => {
  const q = ['open', 'turn', 'move', 'turn', 'move', 'turn', 'end', 'picked'].map((k, i) => entry(k as Kind, i));
  const out = compact(q, 100);
  assert.equal(kinds(out), 'open move turn end picked');
  assert.deepEqual(drawn(out), drawn(q));
});

test('what comes before the last stale open is dropped: the open draws the view anew', () => {
  const q = ['open', 'turn', 'move', 'end', 'picked', 'open', 'turn', 'move'].map((k, i) => entry(k as Kind, i));
  const out = compact(q, 100);
  assert.equal(kinds(out), 'open turn move');
  assert.equal(out[0], q[5]);
  assert.deepEqual(drawn(out), drawn(q));
});

test('messages after `stale` stay, and the last stale move is kept for the fresh one to start from', () => {
  const q = [entry('open', 0), entry('turn', 1), entry('move', 2), entry('turn', 3), entry('move', 4), entry('turn', 50), entry('move', 51), entry('move', 52)];
  const out = compact(q, 10);
  assert.equal(kinds(out), 'open turn move turn move move');
  assert.deepEqual(out.slice(1, 3), [q[3], q[4]]);
  assert.deepEqual(out.slice(3), q.slice(5));
});

test('a queue with nothing to drop is returned as it is', () => {
  const q = [entry('open', 0), entry('turn', 1), entry('move', 2), entry('end', 3), entry('picked', 4)];
  assert.equal(compact(q, 100), q);
  const fresh = [entry('turn', 50), entry('move', 51), entry('turn', 52), entry('move', 53)];
  assert.equal(compact(fresh, 10), fresh);
});

test('hours of battles while minimized: the queue stays short and draws the same as all of it', () => {
  // One message a second, as the bot plays; the window draws nothing; useBattle compacts past LONG with LATE = 4 s.
  const all: Entry[] = [];
  let queue: Entry[] = [];
  let longest = 0;
  let t = 0;
  const push = (kind: Kind) => {
    const e = entry(kind, (t += 1000));
    all.push(e);
    queue.push(e);
    if (queue.length > LONG) queue = compact(queue, t - 4000);
    longest = Math.max(longest, queue.length);
  };
  for (let battle = 0; battle < 600; battle++) {
    push('open');
    for (let move = 0; move < 5 + (battle % 30); move++) {
      push('turn');
      push('move');
    }
    push('end');
    if (battle % 3) push('picked');
  }
  assert.ok(all.length > 20_000);
  assert.ok(longest <= LONG + 1, `longest ${longest}`);
  assert.deepEqual(drawn(queue), drawn(all));
});

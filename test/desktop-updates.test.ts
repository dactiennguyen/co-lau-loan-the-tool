// The desktop UI's updates (app/desktop/src/updates.ts): the race of an "accounts" event and the `state` reply, the
// merge by revision, and the log lines by number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { append, listenThenLoad, merge } from '../app/desktop/src/updates.ts';

const acc = (id: number, status: number) => ({ id, status }) as any;
const state = (rev: number, accounts: any[]) => ({ rev, accounts, accountsError: null });
const tick = () => new Promise((r) => setTimeout(r, 0));

test('an update that comes before the state reply is not undone by the older reply', async () => {
  let handler: (u: any) => void = () => {};
  let reply: (s: any) => void = () => {};
  let shown: any;
  listenThenLoad(
    async (h) => { handler = h; return () => {}; },
    () => new Promise((r) => (reply = r)),
    (s: any, early: any[]) => (shown = early.reduce(merge, s)),
    (u: any) => (shown = merge(shown, u)),
  );
  await tick();
  handler({ rev: 5, accounts: [acc(0, 2)], ids: null }); // the session went online
  reply(state(4, [acc(0, 1), acc(1, 0)])); // the reply, read before that, says connecting
  await tick();
  assert.deepEqual(shown.accounts.map((a: any) => a.status), [2, 0]);
  handler({ rev: 3, accounts: [acc(1, 4)], ids: null }); // older than what is shown: dropped
  assert.equal(shown.accounts[1].status, 0);
  handler({ rev: 6, accounts: [acc(1, 1)], ids: null });
  assert.deepEqual(shown.accounts.map((a: any) => a.status), [2, 1]);
});

test('merge keeps the accounts it does not carry and follows ids', () => {
  const a = acc(0, 2), b = acc(1, 0);
  const next = merge(state(1, [a, b]), { rev: 2, accounts: [acc(1, 1)], ids: null } as any);
  assert.equal(next.accounts[0], a);
  const removed = merge(next, { rev: 3, accounts: [], ids: [1] } as any);
  assert.deepEqual(removed.accounts.map((x: any) => x.id), [1]);
});

test('append drops the lines it has', () => {
  const l = (seq: number) => ({ seq, time: '', text: String(seq), tone: 0 }) as any;
  assert.deepEqual(append([l(1), l(2)], [l(2), l(3)]).map((x) => x.seq), [1, 2, 3]);
});

test('a cleanup before the listener is in unlistens it and loads nothing', async () => {
  let unlistened = false, loaded = false;
  const stop = listenThenLoad(async () => () => (unlistened = true), async () => { loaded = true; }, () => {}, () => {});
  stop();
  await tick();
  assert.ok(unlistened && !loaded);
});

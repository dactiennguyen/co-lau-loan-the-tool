// The desktop UI's updates (app/desktop/src/store/sync.ts, kept in the zustand store of store/index.ts): the race of an
// "accounts" event and the `state` reply, the merge by revision, the log lines by number, and the messages to a battle
// window by number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountsOf, append, listenThenLoad, merge, unseen, type Accounts } from '../app/desktop/src/store/sync.ts';

const acc = (id: number, status: number) => ({ id, status }) as any;
const state = (rev: number, accounts: any[]) => ({ rev, accounts, accountsError: null });
const statuses = (s: Accounts) => s.order.map((id) => s.byId[id].status);
const tick = () => new Promise((r) => setTimeout(r, 0));

test('an update that comes before the state reply is not undone by the older reply', async () => {
  let handler: (u: any) => void = () => {};
  let reply: (s: any) => void = () => {};
  let shown!: Accounts;
  listenThenLoad(
    async (h) => { handler = h; return () => {}; },
    () => new Promise((r) => (reply = r)),
    (s: any, early: any[]) => (shown = early.reduce(merge, accountsOf(s))),
    (u: any) => (shown = merge(shown, u)),
  );
  await tick();
  handler({ rev: 5, accounts: [acc(0, 2)], ids: null }); // the session went online
  reply(state(4, [acc(0, 1), acc(1, 0)])); // the reply, read before that, says connecting
  await tick();
  assert.deepEqual(statuses(shown), [2, 0]);
  handler({ rev: 3, accounts: [acc(1, 4)], ids: null }); // older than what is shown: dropped
  assert.equal(shown.byId[1].status, 0);
  handler({ rev: 6, accounts: [acc(1, 1)], ids: null });
  assert.deepEqual(statuses(shown), [2, 1]);
});

test('merge keeps the accounts and the order it does not change, and follows ids', () => {
  const a = acc(0, 2), b = acc(1, 0);
  const s = accountsOf(state(1, [a, b]));
  const next = merge(s, { rev: 2, accounts: [acc(1, 1)], ids: null });
  assert.equal(next.byId[0], a);
  assert.equal(next.order, s.order);
  assert.equal(merge(next, { rev: 2, accounts: [acc(0, 4)], ids: null }), next); // not newer: the same object
  const removed = merge(next, { rev: 3, accounts: [], ids: [1] });
  assert.deepEqual(removed.order, [1]);
  assert.equal(removed.byId[0], undefined);
});

test('append drops the lines it has', () => {
  const l = (seq: number) => ({ seq, time: '', text: String(seq), tone: 0 }) as any;
  assert.deepEqual(append([l(1), l(2)], [l(2), l(3)]).map((x) => x.seq), [1, 2, 3]);
});

test('a battle window opened in the middle draws once what its load holds, whether it comes before or after the reply', async () => {
  // The app changed the state with messages 4 and 5 before the window read it at 5, then sent them: 4 came while it
  // loaded, 5 just after the reply; 6 is new.
  let handler: (m: any) => void = () => {};
  let reply: (s: any) => void = () => {};
  const drawn: number[] = [];
  let fresh = unseen(0);
  const push = (m: { rev: number }) => fresh(m) && drawn.push(m.rev);
  listenThenLoad(
    async (h) => { handler = h; return () => {}; },
    () => new Promise((r) => (reply = r)),
    (s: any, early: any[]) => { fresh = unseen(s?.rev ?? 0); early.forEach(push); },
    push,
  );
  await tick();
  handler({ rev: 4 });
  reply({ rev: 5 });
  await tick();
  handler({ rev: 5 });
  handler({ rev: 6 });
  handler({ rev: 6 }); // never sent twice, dropped all the same
  assert.deepEqual(drawn, [6]);
});

test('a battle window with nothing loaded takes every message', () => {
  const fresh = unseen(0);
  assert.deepEqual([1, 2, 3].map((rev) => fresh({ rev })), [true, true, true]);
});

test('a cleanup before the listener is in unlistens it and loads nothing', async () => {
  let unlistened = false, loaded = false;
  const stop = listenThenLoad(async () => () => (unlistened = true), async () => { loaded = true; }, () => {}, () => {});
  stop();
  await tick();
  assert.ok(unlistened && !loaded);
});

// Đăng xuất tất cả of the desktop sidebar asks first (app/desktop/src/store/sessions.ts): how many accounts leave the
// game, and whose Tự đánh, quest run or battle it cuts short.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logoutAllText, sessions } from '../app/desktop/src/store/sessions.ts';

const account = (status: number, character: Record<string, unknown> | null = null) => ({ status, character }) as any;
const job = (done: string | null) => ({ job: { done }, questRun: null, battle: null });
const quest = (done: string | null) => ({ job: null, questRun: { done }, battle: null });

test('the sessions count the accounts in the game and what they run', () => {
  const s = sessions([
    account(0),
    account(1),
    account(2, { job: null, questRun: null, battle: null }),
    account(3, { ...job(null), battle: {} }),
    account(3, quest(null)),
    account(2, job('Đủ 10 trận')), // a job that ended is not cut short
    account(4),
  ]);
  assert.deepEqual(s, { connecting: 1, inGame: 4, battles: 1, jobs: 1, quests: 1 });
});

test('no session: nothing to ask', () => {
  assert.equal(logoutAllText(sessions([account(0), account(4)])), null);
  assert.equal(logoutAllText(sessions([])), null);
});

test('the question says how many leave and what stops', () => {
  assert.equal(
    logoutAllText({ connecting: 0, inGame: 3, battles: 0, jobs: 0, quests: 0 }),
    'Đăng xuất mọi nick? 3 nick đang trong game sẽ thoát.',
  );
  assert.equal(
    logoutAllText({ connecting: 1, inGame: 5, battles: 2, jobs: 2, quests: 1 }),
    'Đăng xuất mọi nick? 5 nick đang trong game sẽ thoát và 1 nick đang kết nối sẽ dừng. ' +
      '2 nick đang tự đánh quái và 1 nick đang tự làm nhiệm vụ sẽ dừng giữa chừng, trận đang đánh bị bỏ dở.',
  );
  assert.equal(
    logoutAllText({ connecting: 0, inGame: 2, battles: 1, jobs: 0, quests: 0 }),
    'Đăng xuất mọi nick? 2 nick đang trong game sẽ thoát. 1 nick đang trong trận: trận bị bỏ dở.',
  );
  assert.equal(
    logoutAllText({ connecting: 2, inGame: 0, battles: 0, jobs: 0, quests: 0 }),
    'Đăng xuất mọi nick? 2 nick đang kết nối sẽ dừng.',
  );
});

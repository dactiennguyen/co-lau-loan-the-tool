import { GiftBot } from '../bot/mail.ts';
import { connectionFor } from '../net/accounts.ts';
import { GIFT } from '../protocol/mail.ts';
import { GIFT_STATE, loadGiftState, saveGiftState } from './gift-state.ts';
import { flags, runSession, show, showCharacter } from './run-session.ts';

// Mã quà tặng from the TS bot (docs/integration/nodejs/mail.md#nhập-mã-quà-tặng): c2s/1223 for each code, straight from
// the world, no NPC. The gift goes to the mailbox (npm run mail -- --claim-all --confirm).
//   npm run gift -- [--account=tiheo2] --code=ALPHATEST1,DENBU [--max-wrong=5] [--gap-ms=10000] [--retry-ms=30000] [--reset-wrong]
//   [--confirm]
// Without --confirm it only says the codes it would send, and does not log in. It stops after --max-wrong codes refused in
// a row (the server blocks every code for 5 minutes at 10), and at once when the server says it blocks. The server counts
// across logins, so the count is kept per nick in .cache/gift-codes.json (local only); --reset-wrong forgets it, after a
// good code typed on the phone for instance.
const { arg, has, usage, int } = flags('gift_run_result');
const codes = (arg('code') ?? '').split(',').filter(c => c.trim());
if (!codes.length) usage('cần --code=MÃ1,MÃ2');

let user: string | undefined;
try { user = connectionFor(arg('account')).username; } catch { /* the dry run needs no login */ }
const before = user && !has('reset-wrong') ? loadGiftState(user) : undefined;
const lockedFor = before?.lockedUntil ? before.lockedUntil - Date.now() : 0;

let bot: GiftBot;
try {
  bot = new GiftBot({ codes, wrongBefore: before?.wrong, maxWrong: has('max-wrong') ? int('max-wrong', { min: 1, max: 9 }) : undefined,
    gapMs: has('gap-ms') ? int('gap-ms', { min: 0, max: 60000 }) : undefined,
    retryMs: has('retry-ms') ? int('retry-ms', { min: 0, max: 300000 }) : undefined, log: show });
} catch (error) { usage((error as Error).message); }

const kept = { wrongBefore: before?.wrong ?? 0, ...(before && { since: before.at, file: GIFT_STATE }) };
if (!has('confirm')) {
  show({ event: 'plan', task: 'Nhập mã', codes: bot!.codes, ...kept });
  show({ event: 'dry_run', reason: 'chạy thử: thêm --confirm để gửi mã (không đăng nhập)' });
  show({ kind: 'summary', event: 'gift_run_result', ok: true, outcome: 'dry_run', codes: bot!.codes });
} else if (lockedFor > 0) {
  usage(`server chặn nhập mã tới ${new Date(before!.lockedUntil!).toLocaleTimeString('vi-VN')} (còn ${Math.ceil(lockedFor / 1000)} s)`);
} else {
  await runSession({
    event: 'gift_run_result', account: arg('account'),
    onPacket: (opcode, payload) => bot.onPacket(opcode, payload),
    async run(api) {
      showCharacter(api, { codes: bot.codes, ...kept });
      try { return await bot.run(api); } finally {
        if (user) saveGiftState(user, { wrong: bot.lockedAt ? 0 : bot.wrong, at: new Date().toISOString(), ...(bot.lockedAt && { lockedUntil: bot.lockedAt + GIFT.lockMs }) });
      }
    },
    summary: () => ({ results: bot.results, wrong: bot.wrong }),
  });
}

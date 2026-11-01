import { Items } from '../protocol/items.ts';
import { MailBot, type MailTask } from '../bot/mail.ts';
import { flags, runSession, show, showCharacter } from './run-session.ts';

// Hòm thư from the TS bot (docs/integration/nodejs/mail.md#hòm-thư), from anywhere once in the world.
//   npm run mail -- [--account=tiheo2]                       the list
//   npm run mail -- --open                                   the gifts of the mails not taken
//   npm run mail -- --claim=6273 | --claim-all | --delete-claimed   [--confirm]
// Without --confirm it only reads. Never c2s/1221 (Xóa hết): it deletes gifts not taken too.
const { arg, has, usage, int } = flags('mail_run_result');
function parseTask(): MailTask {
  if (has('claim')) return { kind: 'claim', id: int('claim', { min: 1, max: 2 ** 52 }) };
  if (has('claim-all')) return { kind: 'claim-all' };
  if (has('delete-claimed')) return { kind: 'delete-claimed' };
  if (has('open')) return { kind: 'open' };
  if (has('delete-all')) usage('không có Xóa hết: nó xoá cả thư còn quà chưa nhận; dùng --delete-claimed');
  return { kind: 'list' };
}
const task = parseTask();
const bot = new MailBot({ items: Items.load(), confirm: has('confirm'), log: show });

await runSession({
  event: 'mail_run_result', account: arg('account'),
  onPacket: (opcode, payload) => bot.onPacket(opcode, payload),
  async run(api) {
    showCharacter(api, { task: task.kind, confirm: has('confirm'), money: bot.holdings.money, free: bot.holdings.free() });
    return bot.run(task, api);
  },
  summary: () => ({ task: task.kind, mails: bot.mails.length, unclaimed: bot.unclaimed().length, money: bot.holdings.money }),
});

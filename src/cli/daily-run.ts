import { DailyBot, dailyView, type DailyTask } from '../bot/daily.ts';
import { flags, mapOf, runSession, show, showCharacter } from './run-session.ts';

// Nhiệm vụ hàng ngày from the TS bot (docs/integration/nodejs/mail.md#nhiệm-vụ-ngày): the quest held and its progress
// (s2c/1195 at login), and at Hương Lão (M1) how many of the 3 were taken today; Nhận or Hủy with --confirm.
//   npm run daily -- [--account=tiheo2] [--accept | --cancel] [--confirm]
// Hoàn thành nhiệm vụ is not measured yet: the bot stops when the menu offers it (TODO).
const { arg, has, usage } = flags('daily_run_result');
if (has('accept') && has('cancel')) usage('chọn một trong --accept và --cancel');
const task: DailyTask = has('accept') ? 'accept' : has('cancel') ? 'cancel' : 'show';
const bot = new DailyBot({ confirm: has('confirm'), log: show });

await runSession({
  event: 'daily_run_result', account: arg('account'),
  onPacket: (opcode, payload) => bot.onPacket(opcode, payload),
  async run(api) {
    showCharacter(api, { task, confirm: has('confirm'), quest: dailyView(bot.quest) });
    return bot.run(task, api, mapOf(api));
  },
  summary: () => ({ task, quest: dailyView(bot.quest) }),
});

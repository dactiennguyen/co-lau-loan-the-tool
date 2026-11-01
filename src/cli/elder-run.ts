import { ElderBot, type ElderTask } from '../bot/elder.ts';
import { flags, mapOf, runSession, show, showCharacter } from './run-session.ts';

// Hương Lão (NPC 102 of M1) from the TS bot (docs/integration/nodejs/shop.md#hương-lão): Điểm năng động and Đổi lượng.
// Gift codes are npm run gift, daily quests npm run daily.
//   npm run elder -- [--account=tiheo2] [--rules]                          the points of the week and the exchange limit
//   npm run elder -- --exchange=xu|khoa [--times=1] [--confirm]            50 Lượng → 50.000 Xu or 55.000 Xu khóa, each time
// Without --confirm it only reads. Whatever happens it leaves Hương Lão's first menu as the last one: the lines of Đổi
// lượng run at once on c2s/57.
const { arg, has, usage, int } = flags('elder_run_result');
function parseTask(): ElderTask {
  if (has('exchange')) {
    const to = arg('exchange');
    if (to !== 'xu' && to !== 'khoa') usage('--exchange phải là xu (50.000 Xu) hoặc khoa (55.000 Xu khóa)');
    return { kind: 'exchange', to: to as 'xu' | 'khoa', times: has('times') ? int('times', { min: 1, max: 20 }) : 1 };
  }
  if (has('swap-points')) usage('Đổi Xu ở Điểm năng động chưa đo nên bot không làm');
  return { kind: 'points', rules: has('rules') };
}
const task = parseTask();
const bot = new ElderBot({ confirm: has('confirm'), log: show });

await runSession({
  event: 'elder_run_result', account: arg('account'),
  onPacket: (opcode, payload) => bot.onPacket(opcode, payload),
  async run(api) {
    showCharacter(api, { task: task.kind, confirm: has('confirm'), money: bot.holdings.money });
    return bot.run(task, api, mapOf(api));
  },
  summary: () => ({ task: task.kind, money: bot.holdings.money }),
});

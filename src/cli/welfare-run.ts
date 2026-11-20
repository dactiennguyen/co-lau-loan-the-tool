import { Items } from '../protocol/items.ts';
import { WelfareBot } from '../bot/welfare.ts';
import { flags, runSession, show, showCharacter } from './run-session.ts';

// Phúc lợi from the TS bot (docs/integration/nodejs/welfare.md): Điểm danh, Quà online, Quà thăng cấp,
// from anywhere once in the world.
//   npm run welfare -- [--account=tiheo2]            what is due (reads only)
//   npm run welfare -- --confirm                     takes it
//   npm run welfare -- --confirm --again             sends the claims even when nothing is due (the server's refusal)
const { arg, has } = flags('welfare_run_result');
const bot = new WelfareBot({ items: Items.load(), confirm: has('confirm'), again: has('again'), log: show });

await runSession({
  event: 'welfare_run_result', account: arg('account'),
  onPacket: (opcode, payload) => bot.onPacket(opcode, payload),
  async run(api) {
    showCharacter(api, { confirm: has('confirm'), again: has('again'), dots: bot.dots, money: bot.holdings.money, free: bot.holdings.free() });
    return bot.run(api);
  },
  summary: () => ({ dots: bot.dots, claims: bot.claims, money: bot.holdings.money }),
});

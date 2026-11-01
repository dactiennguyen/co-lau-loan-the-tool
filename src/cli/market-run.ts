import { Items } from '../protocol/items.ts';
import { MarketBot, type MarketTask } from '../bot/market.ts';
import { flags, runSession, show, showCharacter } from './run-session.ts';

// Chợ trời from the TS bot (docs/integration/nodejs/market.md), from anywhere once in the world, as the toolbar button.
//   npm run market -- [--account=manina2]                                  the tabs and how many listings each has
//   npm run market -- --tab=6 [--page=4]                                   one page of a tab
//   npm run market -- --scan [--tab=6] [--name=Slime] [--max-price=5000] [--top=10]   every page, cheapest first
//   npm run market -- --mine                                               Đang bán
//   npm run market -- --buy=<uuid> --max-price=N [--tab=6 --page=4] [--confirm]
//   npm run market -- --sell=<bag slot> --price=N [--qty=1] [--confirm]   fee 1.000 Xu
//   npm run market -- --withdraw=<uuid of Đang bán> [--confirm]
//   npm run market -- --extend=<uuid of Đang bán> [--confirm]           Gia hạn: 24 h more, fee 1.000 Xu
// Without --confirm it only reads and says what it would do.
const { arg, has, usage, int } = flags('market_run_result');
const PRICE = { min: 1, max: 100_000_000 };
const uuid = (name: string) => {
  const v = arg(name) ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) usage(`--${name} cần uuid của món (từ --scan, --tab hay --mine)`);
  return v;
};
const opt = (name: string, range: { min: number; max: number }) => (has(name) ? int(name, range) : undefined);
const TAB = { min: 0, max: 8 }, PAGE = { min: 1, max: 1000 };

function parseTask(): MarketTask {
  if (has('buy')) {
    if (!has('max-price')) usage('--buy cần --max-price=N: giá cao nhất chịu trả');
    return { kind: 'buy', uuid: uuid('buy'), maxPrice: int('max-price', PRICE), tab: opt('tab', TAB), page: opt('page', PAGE) };
  }
  if (has('sell')) return { kind: 'sell', slot: int('sell'), price: int('price', PRICE), quantity: opt('qty', { min: 1, max: 9999 }) };
  if (has('withdraw')) return { kind: 'withdraw', uuid: uuid('withdraw') };
  if (has('extend')) return { kind: 'extend', uuid: uuid('extend') };
  if (has('mine')) return { kind: 'mine' };
  if (has('scan')) return { kind: 'scan', tab: opt('tab', TAB), name: arg('name') || undefined, maxPrice: opt('max-price', PRICE), top: opt('top', { min: 1, max: 1000 }) };
  if (has('tab')) return { kind: 'list', tab: int('tab', TAB), page: opt('page', PAGE) };
  return { kind: 'tabs' };
}
const task = parseTask();
const bot = new MarketBot({ items: Items.load(), confirm: has('confirm'), log: show });

await runSession({
  event: 'market_run_result', account: arg('account'),
  onPacket: (opcode, payload) => bot.onPacket(opcode, payload),
  async run(api) {
    showCharacter(api, { task: task.kind, confirm: has('confirm'), money: bot.holdings.money, free: bot.holdings.free() });
    return bot.run(task, api);
  },
  summary: () => ({ task: task.kind, listings: bot.listings.length, money: bot.holdings.money, free: bot.holdings.free() }),
});

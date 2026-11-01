import { Items } from '../protocol/items.ts';
import { SHOPS, type ShopKey } from '../protocol/shops.ts';
import { ShopBot, type ShopTask } from '../bot/shop.ts';
import { flags, mapOf, runSession, show, showCharacter } from './run-session.ts';

// The 14 NPC shops of M1 from the TS bot (docs/integration/nodejs/shop.md, 15-shops.md), from wherever the character
// stands in M1: c2s/13 to Lái Buôn or Bà Tư Hạnh, c2s/57 down to the shop, s2c/1190 its lines, c2s/1190 to buy.
//   npm run buy -- [--account=tiheo2] [--shop=duoc]                                   the lines of a shop
//   npm run buy -- --shop=luong --item=35 [--qty=2] [--pay=xu|khoa|luong] [--confirm]  buy
// --shop: vukhi-xu, vukhi-khoa, duoc (the default), luong, non-nam-xu, non-nu-xu, non-nam-khoa, non-nu-khoa, giap-nam-xu,
// giap-nu-xu, giap-nam-khoa, giap-nu-khoa, nhan-xu, nhan-khoa. --item is the item id (2 Búa Sửa Chữa, 0 Hoàn Linh Dược,
// 1 Kim Đan Dược, 21 Băng Tâm; in luong 35 Bùa bảo vệ sơ cấp, 416–421 Đá cấp 6–11, 616 Chuyển hoá sơ cấp); --pay picks
// the line when the shop sells the item for two monies (Dược phẩm: Xu khóa by default). Items that do not stack are
// bought one at a time. Without --confirm (or the older --buy) it only opens the shop and says what it would buy.
const { arg, has, usage, int } = flags('buy_run_result');
const shop = (arg('shop') ?? 'duoc') as ShopKey;
if (!(shop in SHOPS)) usage(`--shop phải là một trong: ${Object.keys(SHOPS).join(', ')}`);
const PAY = { xu: 0, khoa: 1, luong: 2 } as const;
const pay = arg('pay');
if (pay !== undefined && !(pay in PAY)) usage('--pay phải là xu, khoa hoặc luong');
const task: ShopTask = has('item')
  ? { kind: 'buy', shop, itemId: int('item', { min: 0, max: 100_000 }), quantity: has('qty') ? int('qty', { min: 1, max: 999 }) : 1, currency: pay === undefined ? undefined : PAY[pay as keyof typeof PAY] }
  : { kind: 'list', shop };
const bot = new ShopBot({ items: Items.load(), confirm: has('confirm') || has('buy'), log: show });

await runSession({
  event: 'buy_run_result', account: arg('account'),
  onPacket: (opcode, payload) => bot.onPacket(opcode, payload),
  async run(api) {
    showCharacter(api, { task: task.kind, shop, confirm: has('confirm') || has('buy'), money: bot.holdings.money, free: bot.holdings.free() });
    return bot.run(task, api, mapOf(api));
  },
  summary: () => ({ task: task.kind, shop, money: bot.holdings.money, free: bot.holdings.free() }),
});

import { runClient, type SessionApi } from '../net/client.ts';
import { envConnection } from '../net/env.ts';
import { buildRequest } from '../protocol/events.ts';
import { Items } from '../protocol/items.ts';
import { characterExtra, currencies, inventory, notice, npcMenu, shopList } from '../protocol/world.ts';

// Buys at Lái Buôn (NPC 106 of M1, 12-skills-items.md#c2s-1190) as the game's Dược phẩm shop does, from wherever the
// character stands: c2s/13 (M1, 106) → s2c/57 menu → c2s/57 (Dược phẩm) → s2c/1190 list → c2s/1190 (shop slot, count)
// → s2c/1256, s2c/42 (bag), s2c/46 (money). Logs in with CLLT_USERNAME/CLLT_PASSWORD of .env and logs out.
//   npm run buy [-- --item=2] [--pay=khoa|xu] [--qty=1] [--buy]
// --item is the item id (2 Búa Sửa Chữa, 0 Hoàn Linh Dược, 1 Kim Đan Dược), --pay the money (khoa: Xu khóa, the
// default; xu: Xu). Without --buy it only opens the shop and says what it would buy: nothing is spent.
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const itemId = Number(arg('item') ?? 2), quantity = Number(arg('qty') ?? 1);
const currency = (arg('pay') ?? 'khoa') === 'xu' ? 0 : 1;
const buy = process.argv.includes('--buy');
const SELLER = { mapId: 'M1', npcId: 106 }, MENU = 'Dược phẩm';
const MONEY = ['Xu', 'Xu khóa'];

const items = Items.load();
const show = (e: Record<string, unknown>) => console.log(JSON.stringify(e));
let api: SessionApi | undefined, timer: ReturnType<typeof setTimeout> | undefined, sentAt = 0;
let phase: 'login' | 'talk' | 'menu' | 'buy' | 'after' | 'done' = 'login';
let money: { xu: number; xuKhoa: number } | undefined, bagCount: number | undefined, moneyAfter = false, bagAfter = false;
const have = () => (money ? [money.xu, money.xuKhoa][currency] : undefined);
const countIn = (list: { itemId: number; quantity: number }[]) => list.filter(i => i.itemId === itemId).reduce((n, i) => n + i.quantity, 0);

function stop(reason?: string) {
  clearTimeout(timer);
  if (reason) show({ event: 'stop', reason });
  phase = 'done';
  api?.close();
}
function expect(what: string, ms = 8000) {
  clearTimeout(timer);
  timer = setTimeout(() => stop(`no ${what} in ${ms / 1000} s`), ms);
}
function after() {
  if (!moneyAfter || !bagAfter) return;
  show({ event: 'after', money, [items.name(itemId)]: bagCount });
  stop();
}

if (!Number.isInteger(itemId) || !Number.isInteger(quantity) || quantity < 1) throw new Error('--item and --qty take whole numbers, --qty at least 1');

const result = await runClient({
  ...envConnection(), mode: 'world',
  log: e => { if (e.event === 'failed') show({ ...e, payloadHex: undefined }); },
  session: {
    onPacket(opcode, payload) {
      // The money and the bag of the login come before onReady; both come again after a purchase.
      if (opcode === 46) {
        money = currencies(payload);
        if (phase === 'after') { moneyAfter = true; after(); }
        return;
      }
      if (opcode === 42 || opcode === 1187) {
        bagCount = countIn(opcode === 42 ? characterExtra(payload).items : inventory(payload).items);
        if (phase === 'after') { bagAfter = true; after(); }
        return;
      }
      if (!api || phase === 'done') return;
      if (opcode === 1256) {
        const { text } = notice(payload);
        show({ event: 'notice', text, ms: Date.now() - sentAt });
        if (phase === 'buy') {
          if (!/thành công/i.test(text)) return stop(`server refused: ${text}`);
          phase = 'after';
          expect('s2c/42 and s2c/46 after the purchase', 3000);
        }
        return;
      }
      if (opcode === 57 && phase === 'talk') {
        const menu = npcMenu(payload);
        show({ event: 'menu', ...menu, ms: Date.now() - sentAt });
        const choice = menu.options.find(o => o.label === MENU);
        if (!choice) return stop(`no "${MENU}" in the menu of ${menu.npc}`);
        phase = 'menu'; sentAt = Date.now();
        api.send(57, buildRequest(57, { option: choice.option, ...SELLER }));
        return expect('s2c/1190');
      }
      if (opcode === 1190 && phase === 'menu') {
        const shop = shopList(payload);
        show({ event: 'shop', title: shop.title, ms: Date.now() - sentAt,
          items: shop.items.map(i => `ô ${i.shopId}: ${items.name(i.itemId)} ${i.price} ${MONEY[i.currency] ?? `tiền ${i.currency}`}`) });
        const pick = shop.items.find(i => i.itemId === itemId && i.currency === currency);
        if (!pick) return stop(`${items.name(itemId)} is not sold for ${MONEY[currency]} here`);
        const cost = pick.price * quantity, wallet = have();
        const plan = { event: 'plan', item: items.name(itemId), shopId: pick.shopId, quantity, cost: `${cost} ${MONEY[currency]}`, have: wallet };
        show(plan);
        if (wallet !== undefined && cost > wallet) return stop(`not enough ${MONEY[currency]}: ${cost} > ${wallet}`);
        if (!buy) return stop('dry run: add --buy to buy');
        phase = 'buy'; sentAt = Date.now();
        api.send(1190, buildRequest(1190, { shopId: pick.shopId, quantity }));
        return expect('s2c/1256');
      }
    },
    onReady(a) {
      api = a;
      const c = a.user.character, m = a.user.map;
      show({ event: 'character', name: c?.name, level: c?.level, mapId: m?.mapId, map: m?.name, zone: m?.area, money, [items.name(itemId)]: bagCount });
      phase = 'talk'; sentAt = Date.now();
      a.send(13, buildRequest(13, SELLER));
      expect('s2c/57');
    },
  },
});
show({ kind: 'summary', event: 'buy_run_result', ok: result.ok, state: result.state, diagnostic: result.diagnostic });
if (!result.ok) process.exitCode = 1;

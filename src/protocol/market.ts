// Chợ trời of Ngọc Nga (NPC 104 of M1; docs/app/events/14-npc.md#ngọc-nga). Her three lines all answer s2c/1192, whose
// first byte says which: the list of a tab (Chợ trời), the rules (Bán vật phẩm), the character's own listings (Đang bán).
// The window of the phone asks for the tabs (c2s/116 → s2c/116) and for each page (c2s/1192), also from the toolbar's
// Chợ trời button without the NPC. Mua is c2s/115 (uuid), Đăng bán c2s/112 (bag slot, quantity, price), Thu hồi c2s/113
// (uuid of the listing). J1 and CT1 (01/11/2026): one purchase refused for a full bag, then one bought, listed and
// taken back (a 1.000 Xu Slime).
import { Reader, Writer } from './protocol.ts';
import { finish } from './world.ts';

export const MARKET = {
  mapId: 'M1', npcId: 104,
  /** Ngọc Nga's first menu (labels as the server sends them, "Bán\nvật phẩm" with a line break). */
  lines: { list: 0, sell: 1, mine: 2 },
  /** From the rules of Bán vật phẩm: 1.000 Xu to list, 24 hours on sale, 5% taken when it sells. */
  fee: 1000, hours: 24, cut: 0.05,
} as const;
export const MARKET_HELP = 0, MARKET_LIST = 1, MARKET_MINE = 2;
/** The tab of c2s/1192 that is Đang bán: the character's own listings. */
export const MARKET_MINE_TAB = -1;
/** The quality of gear in a listing, as the item popup of the phone names it (0 for everything that is not gear). */
export const MARKET_QUALITY: Record<number, string> = { 1: 'Hiếm', 3: 'Sử Thi' };

const i64 = (r: Reader) => Number(r.take(8).readBigInt64BE());
const writeI64 = (w: Writer, n: number) => w.i32(Math.floor(n / 2 ** 32)).i32(n % 2 ** 32);

/** One item on sale. The item fields are those of the bag's item record (world.ts itemRecord) in another order, and each
 * stat with a second value (equal to the first in every listing seen). Durability -1 for items without one; quality 1–3
 * for gear (MARKET_QUALITY), 0 for the rest. */
export function marketListing(r: Reader) {
  const itemId = r.i32(), itemId2 = r.i32(), uuid = r.string(), seller = r.string();
  const durability = r.i32(), field0 = r.i32(), quality = r.i32(), expiresAt = i64(r);
  const currency = r.u8(), price = r.i32(), field2 = r.i32(), quantity = r.i32(), field1 = r.u8(), stats = [];
  for (let n = r.i32(); n > 0; n--) stats.push({ stat: r.i32(), value: r.i32(), value2: r.i32() });
  return { itemId, itemId2, uuid, seller, durability, field0, quality, expiresAt, currency, price, field2, quantity, field1, stats };
}
export type MarketListing = ReturnType<typeof marketListing>;

const page = (r: Reader) => {
  const pages = r.i32(), page = r.i32(), listings: MarketListing[] = [];
  for (let n = r.i32(); n > 0; n--) listings.push(marketListing(r));
  return { pages, page, listings };
};

/** s2c/1192. Kind 1: u8 tabs; u8 tab; string tab name; i32 pages; i32 page; i32 n; n listings. Kind 0: string rules.
 * Kind 2 (Đang bán): i32 pages; i32 page; i32 n, n listings like kind 1 (only n = 0 seen). */
export function market(payload: Uint8Array) {
  const r = new Reader(payload), kind = r.u8();
  if (kind === MARKET_HELP) return finish(r, { kind: MARKET_HELP as typeof MARKET_HELP, text: r.string() }, 's2c/1192');
  if (kind === MARKET_LIST) {
    const tabs = r.u8(), tab = r.u8(), tabName = r.string();
    return finish(r, { kind: MARKET_LIST as typeof MARKET_LIST, tabs, tab, tabName, ...page(r) }, 's2c/1192');
  }
  if (kind === MARKET_MINE) return finish(r, { kind: MARKET_MINE as typeof MARKET_MINE, ...page(r) }, 's2c/1192');
  throw new Error(`s2c/1192: kind ${kind} not seen yet`);
}

/** c2s/1192: one page of a tab (0–8 of s2c/116, MARKET_MINE_TAB for Đang bán), pages from 1. Read only; Làm mới sends it
 * again. */
export const marketPageRequest = (tab: number, page = 1) => new Writer().u8(0).i32(tab).i32(page).build();
/** c2s/115: Mua, after the game's "Mua … với giá … Xu?" OK. Bought: s2c/46 (the money), s2c/115 (the same uuid), s2c/1187
 * (the whole bag; the item gets a new uuid). Refused: a notice (s2c/1256), e.g. "Rương đã đầy…". */
export const marketBuyRequest = (uuid: string) => new Writer().string(uuid).build();
/** c2s/112 kind 1: Đăng bán the item of a bag slot, after "Đăng bán … với giá … Xu? Phí đăng bán 1.000 Xu." OK. Listed:
 * s2c/46 (the fee taken), s2c/112, s2c/1256 "Rao bán vật phẩm thành công". Only items not trade-locked: the window refuses
 * the others itself ("Vật phẩm không thể rao bán!"). */
export const MARKET_SELL = 1;
export function marketSellRequest(slot: number, quantity: number, price: number) {
  return writeI64(new Writer().u8(MARKET_SELL).i32(slot).i32(quantity), price).build();
}
/** c2s/113: Thu hồi a listing of Đang bán (its uuid in s2c/1192 kind 2, not the bag's), after "Thu hồi … về hành trang?"
 * OK. Answer: s2c/1187 (the whole bag, the item back with a new uuid), s2c/113 (the same uuid), s2c/1256 "Đã nhận lại vật
 * phẩm …". */
export const marketWithdrawRequest = (uuid: string) => new Writer().string(uuid).build();

/** s2c/112, after a listing went up: i32 a (1); i32 bag slot; i32 quantity. */
export function marketListed(payload: Uint8Array) {
  const r = new Reader(payload);
  return finish(r, { a: r.i32(), slot: r.i32(), quantity: r.i32() }, 's2c/112');
}
/** s2c/113 (Thu hồi) and s2c/115 (Mua): the uuid of the request, back when it went through. */
export function marketDone(payload: Uint8Array, opcode: 113 | 115) {
  const r = new Reader(payload);
  return finish(r, { uuid: r.string() }, `s2c/${opcode}`);
}

/** s2c/116, the answer to c2s/116 (empty) that the window sends when it opens: the tabs with how many listings each has,
 * the rules, then five numbers: the fee (1000), a (1000), the hours on sale (24), b (1000) and the highest price
 * (100.000.000). One of a, b is likely the lowest price: the cheapest of 592 listings was 1000. */
export function marketTabs(payload: Uint8Array) {
  const r = new Reader(payload), tabs = [];
  for (let n = r.i32(); n > 0; n--) tabs.push({ tab: r.i32(), name: r.string(), listings: r.i32() });
  const rules = r.string(), fee = r.i32(), a = r.i32(), hours = r.i32(), b = r.i32(), maxPrice = r.i32();
  return finish(r, { tabs, rules, fee, a, hours, b, maxPrice }, 's2c/116');
}

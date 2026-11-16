import { createDecipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ProtocolError, Reader } from './protocol.ts';

/** One record of the game's item table `it1` (files/dyncache on the phone; docs/app/events/13-drops-items.md#bảng-vật-phẩm).
 * `icon` names the asset offline-a2/i<icon>.dat, `graphic` the sprite worn on the character (-1 none). `elementBits` is
 * the high byte of a field (1, 2, 4, 7; 0 for plain items) that is not the element of an item: Nón Âu Lạc (54) has 1
 * here, yet the one manina wears is Lôi, which its item record carries. `elementBits`, `e` and `g` are not understood. */
export interface ItemDef {
  id: number; name: string; desc: string; type: number; icon: number; graphic: number; elementBits: number;
  level: number; gender: number; stack: number; e: number; durability: number; g: number;
}

/** data/items.json: the item table, the stat templates of `it0` ("#" is the value) and the version byte `itv`. */
export interface ItemBook { source: string; version: number; types: Record<string, string>; elements: Record<string, string>; stats: Record<string, string>; items: ItemDef[] }

/** Item types named from the items of each type (13-drops-items.md). */
export const ITEM_TYPES: Record<number, string> = {
  0: 'Nón', 1: 'Áo', 2: 'Vũ khí', 3: 'Nhẫn', 4: 'Cánh', 5: 'Huyết Châu, thú cưng', 7: 'Danh hiệu', 8: 'Giày',
  9: 'Dây chuyền', 10: 'Đá nâng cấp', 20: 'Bình', 21: 'Búa', 22: 'Nguyên liệu, vật phẩm khác', 23: 'Tăng Kinh Nghiệm',
  24: 'Tẩy điểm', 29: 'Trứng, bảo rương',
};
/** Element byte of an item record (world.ts itemRecord): 1 Hỏa and 2 Lôi as the item popup draws them (31/10); 4 Thủy
 * follows the character element of s2c/9 (1 Hỏa, 4 Thủy). */
export const ITEM_ELEMENTS: Record<number, string> = { 1: 'Hỏa', 2: 'Lôi', 4: 'Thủy' };
/** Name of the 407 records the game no longer uses. */
export const RETIRED = 'Ngừng dùng';

/** `it1`: i32 n; n × {i32 id; string name; string desc; u8 type; i32 icon; i32 graphic; i32 elementBits << 24; u8 level;
 * u8 gender; i32 stack; u8 e; i32 durability; i32 g}, big-endian like the packets. */
export function parseItemTable(it1: Uint8Array): ItemDef[] {
  const r = new Reader(it1), items: ItemDef[] = [];
  for (let n = r.i32(); n > 0; n--) {
    const id = r.i32(), name = r.string(), desc = r.string(), type = r.u8(), icon = r.i32(), graphic = r.i32(), elementBits = r.i32() >>> 24;
    const level = r.u8(), gender = r.u8(), stack = r.i32(), e = r.u8(), durability = r.i32(), g = r.i32();
    items.push({ id, name, desc, type, icon, graphic, elementBits, level, gender, stack, e, durability, g });
  }
  if (r.offset !== r.data.length) throw new ProtocolError('PAYLOAD_SCHEMA', `it1 has ${r.data.length - r.offset} bytes after the last item`);
  return items;
}

/** `it0`: i32 n; n × {i32 code; string template}, e.g. 6 → "# phòng thủ". */
export function parseStatTable(it0: Uint8Array): Record<string, string> {
  const r = new Reader(it0), stats: Record<string, string> = {};
  for (let n = r.i32(); n > 0; n--) { const code = r.i32(); stats[code] = r.string(); }
  if (r.offset !== r.data.length) throw new ProtocolError('PAYLOAD_SCHEMA', `it0 has ${r.data.length - r.offset} bytes after the last stat`);
  return stats;
}

export function loadItemBook(path = 'data/items.json'): ItemBook { return JSON.parse(readFileSync(path, 'utf8')); }

/** Name lookup by item id, with the stat templates for item records (bag, gear, ground). */
export class Items {
  readonly book: ItemBook;
  private byId: Map<number, ItemDef>;
  constructor(book: ItemBook) { this.book = book; this.byId = new Map(book.items.map(i => [i.id, i])); }
  static load(path?: string) { return new Items(loadItemBook(path)); }
  get(id: number) { return this.byId.get(id); }
  name(id: number) { return this.byId.get(id)?.name ?? `#${id}`; }
  stat(code: number, value: number) { const t = this.book.stats[code]; return t ? `+${t.replace('#', String(value))}` : `${code}: ${value}`; }
  /** "Hoàn Linh Dược ×4", "Nón Âu Lạc (+4 phòng thủ, +58 sinh lực)" for an item record of world.ts. */
  describe(item: { itemId: number; quantity: number; stats?: { stat: number; value: number }[] }) {
    const stats = (item.stats ?? []).map(s => this.stat(s.stat, s.value));
    return `${this.name(item.itemId)}${item.quantity > 1 ? ` ×${item.quantity}` : ''}${stats.length ? ` (${stats.join(', ')})` : ''}`;
  }
}

// Assets of files/dyncache/offline-a2 (item icons i<n>.dat, worn sprites, effects). The loader
// com.tlgdx.twelvelord.sqo.b6 reads the file, reverses its first 63 bytes (sqo.a(byte[], 63)), then decrypts with
// com.e.sqa: AES/ECB/PKCS5Padding under a 16-byte key that its static initialiser stores byte by byte (13-drops-items.md).
const ASSET_KEY = Buffer.from([-88, 76, -38, -24, -40, 117, 124, 91, 41, -31, 88, -51, -50, -9, 14, -3].map(b => b & 255));
const ASSET_REVERSED = 63;

/** Decodes one offline asset; icons come out as PNG. `padding: false` decodes a block-aligned prefix of a file. */
export function decodeAsset(data: Uint8Array, { padding = true } = {}): Buffer {
  const b = Buffer.from(data);
  b.subarray(0, ASSET_REVERSED).reverse();
  const d = createDecipheriv('aes-128-ecb', ASSET_KEY, null); d.setAutoPadding(padding);
  return Buffer.concat([d.update(b), d.final()]);
}

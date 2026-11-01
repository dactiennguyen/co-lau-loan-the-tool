// Packets of a Log lỗi of CLLT Tool 0.9.0 (02/11/2026 05:22:37, manina3, Nhiệm vụ 9): Dùng of Trứng Gà ×3 in bag slot 32
// (docs/app/events/12-skills-items.md#túi-đồ). The server answers in the same millisecond: the fee, s2c/1187 kind 2 (slot
// 32 holds 2 now), what came out of the egg (s2c/1256, then s2c/51 puts it in a free slot) and the notice of the egg.
// Golden inputs for test/items.test.ts, and through src/cli/export-rust.ts for the inventory Rust vectors.
export const eggPackets: Record<string, string> = {
  'c2s/84 Dùng ô 32': '00000020',
  's2c/46 sau trứng': '0000000975706461746520587500000000000001f40000000000005dec0000000000000000',
  's2c/1187 loại 2': '022000000002',
  's2c/1256 nhận Huyết Thạch': '000000002d42e1baa16e2076e1bbab61206e68e1baad6e20c491c6b0e1bba363203120487579e1babf74205468e1baa16368',
  's2c/51 Huyết Thạch': 'ffffffff0000000001270000000a0000002462643264663437362d636237342d346462302d393161382d39353937666235353364363600000000ffffffff0000000101ff00000000000000',
  's2c/1256 đập trứng': '0100000033c490e1baad70205472e1bba96e672047c3a0207468c3a06e682063c3b46e672c207472e1bbab20353030205875206b68c3b361',
};

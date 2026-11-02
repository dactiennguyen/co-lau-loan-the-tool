// The mob blocks of s2c/22 (`string id; string name; u8; u8; u8 element; i32 level; i32 sprite; u8; i32 hp; i32 maxHp`)
// of battles the app and the TS bot recorded on 01–02/11/2026 (docs/app/events/06-map-mobs.md#tấm-ảnh-của-quái): only
// these bytes of each packet, all of them the server's about the mob; the player block is left out.
export const spriteBlocks: Record<string, { id: string; hex: string }> = {
  // Gà Điên of M1: sheet 100000, as its type 0.
  'Gà Điên': { id: 'mob10', hex: '000000056d6f6231300000000a47c3a020c49069c3aa6e01000400000001000186a0000000003200000032' },
  // Báo Đen of M8 (symap): sheet 100600, while its ids give type 59.
  'Báo Đen': { id: 'mob60604', hex: '000000086d6f6236303630340000000942c3a16f20c490656e0100020000003e000188f8000000067500000675' },
  // Hào Trưởng phía Bắc of M2, type 88: sheet 100660, with the HP others had left it (19.282 of 20.000).
  'Hào Trưởng phía Bắc': { id: 'mob89100002', hex: '0000000b6d6f6238393130303030320000001a48c3a06f205472c6b0e1bb9f6e67207068c3ad612042e1baaf6301000100000015000189340000004b5200004e20' },
  // Tướng Thiết Kích of M8 (B8), type 100: sheet 101050, the general, not 101000, the fox.
  'Tướng Thiết Kích': { id: 'mob101100007', hex: '0000000c6d6f623130313130303030370000001654c6b0e1bb9b6e6720546869e1babf74204bc3ad63680100020000004100018aba000001388000013880' },
};

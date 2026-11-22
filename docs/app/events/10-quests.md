# Nhiệm vụ và bot làm nhiệm vụ bằng TypeScript

Mốc: APK 1.0.3, ngày 30/10/2026, nhân vật `manina`. Nguồn ([các phiên bắt gói](../investigation.md#nguồn-dữ-liệu)):
- **L1**: người chơi tự trả nhiệm vụ 3 và nhận nhiệm vụ 4 trên điện thoại.
- **Q1–Q20**: bot Node [src/bot/quest.ts](../../../src/bot/quest.ts) tự đăng nhập không cần điện thoại và làm nhiệm vụ. Q1 dừng sau 33 s vì gặp gói chưa biết; Q2 làm xong nhiệm vụ 4; Q3–Q9 nhiệm vụ 5, 6 và một phần nhiệm vụ 7; Q10, Q13 thử boss; Q11, Q12 đo tốc độ; Q14–Q17 nhiệm vụ 7 (báo cáo), 8 và 9; Q18–Q20 Cóc Xanh của nhiệm vụ 9, đo hồi máu và thử cách chấm nước mới.
- **B3–B5**: app trên điện thoại với hook Frida, chỉ để bắt gói bot chưa biết: B3 đi tìm boss (không thấy), B4 gói đánh boss, B5 gói qua cổng.
- **S1**: bot Node thử từng cổng và quét mọi map vào được (`npm run scan`, [06-map-mobs](06-map-mobs.md#atlas)).
- **N1–N4**: bước "Tỷ thí với Võ Quan Đinh Mộc" (nhiệm vụ 12) với nick `wangpt` cấp 25, ngày 31/10: hộp thoại trên điện thoại có hook Frida (N1), lời mời `s2c/1180` bắt bằng bot TS (N2), gói thách đấu `c2s/1181` trên điện thoại (N3), bot TS tự đánh và thắng (N4). [Bước Tỷ thí](#tỷ-thí).
- **N5**: bước "Trinh sát Thành Hồng Giang" (nhiệm vụ 14) với `wangpt` cấp 26, ngày 31/10: bot TS qua cổng Hồng Giang (1016) từ M25, rồi báo cáo với Tướng Quân Lê Viễn. [Bước Trinh sát](#trinh-sát).

Bộ giải mã: [src/protocol/world.ts](../../../src/protocol/world.ts), [src/battle/battle.ts](../../../src/battle/battle.ts). Test: [test/quest.test.ts](../../../test/quest.test.ts). Nhãn **[Đo]**, **[Suy luận]**, **[Chưa rõ]** như các file khác.

## Trả lời nhanh

| Câu hỏi | Trả lời |
|---|---|
| Lấy danh sách nhiệm vụ thế nào? | Server chỉ gửi **nhiệm vụ chính đang làm** (`s2c/39`), lúc đăng nhập và mỗi khi nhận nhiệm vụ mới. Mở bảng Nhiệm vụ không gửi gói nào. Tab "Phụ", nhiệm vụ Bảo Điển và "Nhiệm vụ hằng ngày" hiện đều trống. [Đo] |
| Làm một bước nhiệm vụ bằng gói gì? | Nói chuyện / báo cáo: `c2s/13 (mapId, npcId)`. Diệt quái: đánh trận như [07-auto-battle](07-auto-battle.md), mỗi trận thắng tính 1 con. Server trả `s2c/34` (lời thoại, tiến độ) và `s2c/35` (hoàn thành, phần thưởng). [Đo] |
| Code TS mô phỏng làm nhiệm vụ chạy được chưa? | **Được, không cần điện thoại.** Bot TS làm xong nhiệm vụ 4, 5, 6, 8 và bước báo cáo của 7, tự đi qua cổng sang M2 và đang làm nhiệm vụ 9. Điện thoại chỉ dùng để bắt gói khi điều tra (B4: gói đánh boss, B5: gói qua cổng). [Đo] |
| Đánh quái nhanh nhất thế nào? | Trận tính giờ (Sơn Tặc), 0,5 s/nước, dùng Hỏa Cầu Thuật: ~15 s/trận, **~500 EXP/phút**, gấp ~3 lần đánh theo lượt. EXP = 2 × (2 × sao + giọt nước) + phần cộng theo quái; xu = 2 × vàng. Xem [Đánh nhanh hay ăn sao](#đánh-nhanh-hay-ăn-sao). [Đo] |
| Bước boss làm sao? | Boss đánh bằng `c2s/1178 (mobId, 0)`, không phải `c2s/15`, cả ở bước "Đánh bại <boss>" ([B8](#đánh-bại-boss)). HP boss dùng chung giữa các trận; thua boss không mất EXP; tiến độ là tổng sát thương (`s2c/1201`). Xem [Bước boss](#boss). [Đo] |
| Sang map khác thế nào? | `c2s/13 (mapId hiện tại, id cổng)`, cùng opcode với nói chuyện NPC. Id cổng lấy ở cuối `s2c/11`. Cổng chưa mở thì server trả `s2c/1256` "Bạn phải đạt cấp N mới vào được X" hoặc "Bạn cần hoàn thành nhiệm vụ trước khi tới đây". Ở cấp 19 chỉ vào được M1, M2, M25. Xem [Đi qua cổng](#cổng) và [Bản đồ đã quét](06-map-mobs.md#atlas). [Đo] |
| Bước "Tỷ thí với X" làm sao? | Vẫn là `c2s/13 (mapId, npcId)` như nói chuyện, nhưng server không trả `s2c/34` mà trả hộp thoại **`s2c/57`** "Cậu đã sẵn sàng chiến đấu chưa." (0 "Đồng ý", 1 "Từ chối"). Đồng ý là `c2s/57 (0, mapId, npcId)`; server trả **`s2c/1180`** với quái riêng của trận (`mob880`, Võ Quan cấp 20), client thách đấu nó bằng **`c2s/1181 (mobId, 0, npcId)`**, rồi server mở trận. Thắng thì `s2c/34` đưa nhiệm vụ sang bước sau. Bot TS và app Rust làm đủ chuỗi này; bot TS đã thắng Võ Quan ở N4. Xem [Bước Tỷ thí](#tỷ-thí). [Đo N1–N4] |
| Bước "Trinh sát Thành X" hay "Đến X" làm sao? | Chỉ cần **vào map X**. Bước này không có NPC (`npcId` -1); `thamSố` là thứ tự map trong bản đồ thế giới (3 là M4 "Hồng Giang"). Qua cổng Hồng Giang (1016) từ M25 thì ngay khi vào map server gửi `s2c/34` "Quan sát doanh trại địch…" và nhiệm vụ sang bước sau. Bot TS (N5) và app Rust (manina2) đã làm thật bước này. "Đến Cửu Phong" của nhiệm vụ 19 có `thamSố` 9, và M10 là Cửu Phong: bot coi là cùng loại, kiểm tên map trước khi đi. Xem [Bước Trinh sát](#trinh-sát). [Đo N5; "Đến X" là Suy luận, chưa chạy thật] |
| Bot còn thiếu gì? | Bước "Sử dụng điểm kỹ năng" bot TS đã làm được (`c2s/1191`, K1); app Rust cũng đã port ([App Rust](../../integration/rust/features.md#kỹ-năng)). Sửa đồ là `c2s/48` và tốn 1 Búa sửa chữa; manina đã dùng chiếc búa duy nhất cho chiếc nón, vũ khí vẫn hỏng. Hồi máu bằng Hoàn Linh Dược (30% sinh lực) chỉ được trong trận, bằng `c2s/44` (+36 HP ở P5, [12](12-skills-items.md#c2s-44)); ngoài trận server từ chối `c2s/84`. Bình và Búa sửa chữa mua ở Lái Buôn bằng Xu hoặc Xu khóa ([12](12-skills-items.md#c2s-1190)). manina còn 67 điểm tiềm năng và 16 điểm kỹ năng chưa dùng; bot TS cộng điểm tiềm năng bằng `--stats` (chưa chạy thật). Bot chưa nhặt đồ rơi. Gói nhặt `c2s/1188 (uuid)` đã bắt được trên máy (P3), nhưng bot chưa gửi thử ([13-drops-items](13-drops-items.md#c2s-1188)). Xem [12-skills-items](12-skills-items.md). [Đo] |
| Nhiệm vụ hàng ngày? | Nhận ở Hương Lão Trần Bá (M1) → Nhiệm vụ hàng ngày → Nhận nhiệm vụ, tối đa 3 lượt mỗi ngày (hủy vẫn tính lượt). Nhiệm vụ đang làm đến trong **`s2c/1195`** (mã, tên, mẫu "Sử dụng %d vật phẩm trong trận đấu", tiến độ, mục tiêu) và hiện ở tab Phụ. Hoàn thành và phần thưởng chưa đo. Xem [14-npc](14-npc.md#nhiệm-vụ-hàng-ngày). [Đo G1] |
| Còn event nào chưa ghi? | Đã ghi 169 gói theo cặp hướng/opcode ([danh sách](README.md#danh-sách-gói)). Bảng mã của app có 201 opcode, trong đó **76 opcode chưa từng thấy trên dây** ([opcode-map](../opcode-map.md#unseen)). [Đo] |

## Gói nhiệm vụ

<a id="s2c-39"></a>

### s2c/39: nhiệm vụ đang làm

| Thuộc tính | Điều tra được |
|---|---|
| Xuất hiện khi | Sau `s2c/9` lúc đăng nhập; ngay sau `s2c/35` khi trả xong một nhiệm vụ và nhận nhiệm vụ mới |
| Bố cục | `i32 questId; string tên; string môTả; string loại ("main"); i32 bướcHiệnTại; i32 tiếnĐộ; i32 n; n × {i32 stt; string nộiDung; i32 thamSố; i32 cần; i32 npcId}` |
| Độ chắc chắn | Đọc hết byte 3 mẫu (nhiệm vụ 3 hai lần, nhiệm vụ 4); bot đọc được nhiệm vụ 5 trong Q2. `bướcHiệnTại` khớp bước tô xanh trên bảng Nhiệm vụ. [Đo] |

`thamSố` đổi nghĩa theo loại bước [Đo]:

| Loại bước | thamSố | cần | npcId | Bot làm gì |
|---|---|---|---|---|
| "Đạt cấp độ N" | N | 1 | -1 | Không làm gì; server bỏ qua bước này nếu đã đủ cấp (nhận nhiệm vụ 4, 5 thì `bướcHiệnTại` đã là 1) |
| "Nói chuyện với X", "Báo cáo với X" | id NPC | 1 | id NPC | `c2s/13 (mapId, npcId)` |
| "Tiêu diệt X", "Đánh bại X" | loại quái (Gà Điên 0, Heo Mọi 1) | số con (1, 10, 10) | -1 | Đánh trận với quái tên X, đếm số trận thắng |
| "Gây N sát thương lên X" (nhiệm vụ 7) | | N (500) | -1 | Thách đấu boss X của `s2c/1177`, cộng dồn sát thương. Server chưa nhận ([bước boss](#boss)) |
| "Nâng điểm tiềm năng" | 0 | 1 | -1 | Bot gửi `c2s/10 (0, 1)` (Cường Lực), hoặc chỉ số mà `--stats` chọn ([12-skills-items](12-skills-items.md#điểm-tiềm-năng)). Chưa gặp bước này khi chạy thật |
| "Đánh bại X" với `npcId` ≥ 0 (nhiệm vụ 17) | 90 | 1 | id NPC | Như Tỷ thí: X là NPC, không phải quái của `s2c/43`. Bot đi đường NPC: hộp thoại, Đồng ý, rồi trận ([Q17](#đánh-bại-npc)) |
| "Tỷ thí với X" (nhiệm vụ 12) | 87 | 1 | id NPC | `c2s/13` → hộp thoại `s2c/57` → `c2s/57 (0, mapId, npcId)` "Đồng ý" → `s2c/1180` (quái của trận) → `c2s/1181 (mobId, 0, npcId)` → trận → `s2c/34` sang bước sau ([Bước Tỷ thí](#tỷ-thí)) |
| "Trinh sát Thành X" (nhiệm vụ 14) | thứ tự map (3 = M4) | 1 | -1 | Đi tới map `M{thamSố + 1}` qua cổng tên X, hoặc qua cổng từng dẫn tới map đó; `s2c/34` lúc vào map đưa bước sang ([Bước Trinh sát](#trinh-sát)) |
| "Đến X", "Đến vùng đất X" (nhiệm vụ 19, 23) | thứ tự map (9 = M10 Cửu Phong) | 1 | -1 | Như Trinh sát; map đã biết mà tên khác X thì bot dừng, không đi ([Bước Trinh sát](#trinh-sát)) [Suy luận] |
| "Sử dụng điểm kỹ năng" | 0 | 1 | -1 | `c2s/1191 (mãKỹNăng, 1)` cho kỹ năng đầu tiên của cây `s2c/30` lên được một cấp. Server trả `s2c/10` kiểu 32, `s2c/1191`, `s2c/34` ([12-skills-items](12-skills-items.md#c2s-1191)) [Đo K1: nick thứ hai học Băng Tiễn Thuật 4000]. Nếu đã học một kỹ năng từ trước (bấm Nâng cấp tay hay Tự cộng kỹ năng), server tính là xong, tự sang bước sau và gửi lời NPC của bước đó. Không kỹ năng nào lên được thêm cấp (ví dụ cấp 3, Hỏa Cầu Thuật 1, còn 1 điểm) thì bot không gửi gì mà làm tiếp bước sau. Trước 20/11 bot dừng ở đây với "Không kỹ năng nào lên cấp được lúc này" [Đo 20/11: tiheo1, manina3, wangpt trong app] |

```text
00000004 0000001b "Ruộng Dưa Bị Tàn Phá" 000000a0 "Mùa màng là nguồn sống…" 00000004 "main"
00000001 00000000 00000004                                  bước 1, tiến độ 0, 4 bước
00000000 00000014 "Đạt cấp độ 4"            00000004 00000001 ffffffff
00000001 00000022 "Nói chuyện với Bà Tư Hạnh" 00000067 00000001 00000067
00000002 00000016 "Tiêu diệt Heo Mọi"       00000001 0000000a ffffffff
00000003 0000001e "Báo cáo với Bà Tư Hạnh"  00000067 00000001 00000067
```

Server **không gửi lại** `s2c/39` sau từng con quái hay sau lời thoại NPC, nên trong một phiên client phải tự đếm và tự tăng bước. Bot làm như vậy, và thấy khớp với server: sau trận thứ 10, `s2c/34` báo "Tiếp theo hãy quay về gặp Bà Tư Hạnh". Server **có lưu** tiến độ: đăng nhập lại sau 1 con Kẻ Gây Rối thì `s2c/39` có `bướcHiệnTại = 2, tiếnĐộ = 1` (Q4). Các mẫu cũ có `tiếnĐộ = 0` vì đều chụp lúc bước chưa diệt con nào. [Đo]

<a id="c2s-13"></a>

### c2s/13 → s2c/34, s2c/35

| Gói | Bố cục | Ghi chú |
|---|---|---|
| `c2s/13` | `string mapId; i32 npcId` (10 byte với "M1") | Không cần đứng gần NPC: bot Node gửi từ chỗ đăng nhập, server vẫn nhận. [Đo, Q2: 103 và 111] |
| `s2c/34` | `i32 0; string "subtask 1"; i32 questId; string lờiThoại` | Sau nói chuyện, sau con quái cuối của bước diệt, và khi nhận nhiệm vụ mới (lời thoại rỗng). [Đo] |
| `s2c/35` | `i32 questId; string tên; i32 n; n × string phầnThưởng; string lờiNhắn` | Trả nhiệm vụ. [Đo 2 lần] |
| `s2c/57` | `i32 n; string tênNPC; string lời; n × {u8 mãDòng; string nhãn}` | Thay cho `s2c/34` khi NPC hỏi trước: bước Tỷ thí ([N1](#tỷ-thí)), Lái Buôn ([12](12-skills-items.md#c2s-1190)). Trả lời bằng `c2s/57 (mãDòng, mapId, npcId)`. [Đo] |

Khi trả nhiệm vụ 4 (Q2), các gói đến trong 2 ms: `s2c/1187` (vật phẩm vào túi), `s2c/46` (Xu), `s2c/35`, `s2c/1200`, `s2c/34` (nhiệm vụ 5, lời thoại rỗng), `s2c/39` (nhiệm vụ 5).

### Chuỗi nhiệm vụ đã thấy

| Nhiệm vụ | NPC | Các bước | Phần thưởng (s2c/35) |
|---|---|---|---|
| 3 "Những Việc Đầu Tiên" | 102 Hương Lão Trần Bá | Đạt cấp 2 → nói chuyện với Hương Lão → nâng điểm tiềm năng → dùng điểm kỹ năng → diệt 1 Gà Điên → báo cáo | 127 kinh nghiệm, 660 Xu khoá, 1 Áo Hào Kiệt, 1 Nón Lá |
| 4 "Ruộng Dưa Bị Tàn Phá" | 103 Bà Tư Hạnh | Đạt cấp 4 → nói chuyện với Bà Tư Hạnh → diệt 10 Heo Mọi → báo cáo | 216 kinh nghiệm, 710 Xu khoá, 1 Nhẫn Trơn |
| 5 "Bóng Đen Trong Làng" | 111 Vệ Binh Lê Dũng | Đạt cấp 6 → nói chuyện với Vệ Binh → đánh bại 10 Kẻ Gây Rối → báo cáo | 314 kinh nghiệm, 770 Xu khoá (Q6) |
| 6 "Dấu Chân Hắc Nham" | 129 Thành Chủ Nguyễn Khang | Đạt cấp 8 → nói chuyện với Thành Chủ → đánh bại 10 Sơn Tặc (trận tính giờ) → báo cáo | 419 kinh nghiệm, 820 Xu khoá (Q9) |
| 7 "Quét Sạch Sơn Trại" | 129 Thành Chủ Nguyễn Khang | Đạt cấp 9 → bàn bạc với Thành Chủ → đánh bại 4 Chỉ Huy Sơn Tặc → **gây 500 sát thương lên Thủ Lĩnh Sơn Tặc** (boss của map, `c2s/1178`) → báo cáo | 1190 kinh nghiệm, 2130 Xu khoá (B4 + Q14) |
| 8 "Tìm Đến Vân Sơn" | 129 Thành Chủ (M1), 127 Trại Chủ Phạm Hùng (M2) | Đạt cấp 10 → nói chuyện với Thành Chủ → **gặp Trại Chủ ở M2** (qua cổng Vân Sơn) → diệt 1 Sói Xám → báo cáo | 808 kinh nghiệm, 880 Xu khoá (Q16) |
| 9 "Thử Sức Tân Binh" | 141 Võ Quan Đinh Mộc (M2) | Đạt cấp 11 → nói chuyện với Võ Quan → diệt 15 Sói Xám (cấp 11) → diệt 15 Cóc Xanh (cấp 13) → báo cáo | 797 kinh nghiệm, 910 Xu khoá (R3: bot báo cáo ngày 31/10) |
| 10 "Nguy Cơ Bên Bờ Suối" | 142 Dân Phu Vân Sơn (M2) | Đạt cấp 14 → hỏi thăm Dân Phu → diệt Cua Càng → nói chuyện với Dân Phu | manina đang ở bước "Hỏi thăm Dân Phu Vân Sơn" (R3) |
| 11 "Truy Quét Đại Ác Bá" | 141 Võ Quan Đinh Mộc (M2) | … → đánh bại 20 Kẻ Quấy Phá (cấp 20) → báo cáo với Võ Quan | 1050 kinh nghiệm, 1050 Xu khoá (wangpt, app Rust ngày 31/10; hai bước đầu không có trong log) |
| 12 "Kiếm Thử Anh Hùng" | 127 Trại Chủ Phạm Hùng, 141 Võ Quan Đinh Mộc (M2) | Đạt cấp 18 → gặp Trại Chủ → **tỷ thí với Võ Quan** (hộp thoại rồi trận, [Bước Tỷ thí](#tỷ-thí)) → báo cáo với Trại Chủ | wangpt (cấp 25): bot TS thắng Võ Quan ở N4, nhiệm vụ sang bước báo cáo |
| 13 "Loạn Động Vân Sơn" | 127 Trại Chủ Phạm Hùng (M2) | … → gây 600 sát thương lên Hào Trưởng phía Bắc → gây 600 sát thương lên Hào Trưởng phía Nam → báo cáo với Trại Chủ | 3190 kinh nghiệm, 2900 Xu khóa (wangpt, manina2, app Rust ngày 31/10; các bước đầu không có trong log) |
| 14 "Trinh Sát Hồng Giang" | 162 Tướng Quân Lê Viễn (M25) | Gặp Tướng Quân (đường đi: Vân Sơn - Rìa Hồng Giang) → **trinh sát Thành Hồng Giang** (vào M4, [Bước Trinh sát](#trinh-sát)) → báo cáo với Tướng Quân | 1200 kinh nghiệm, 1220 Xu khóa (wangpt bằng bot TS ở N5; manina2 bằng app Rust) |
| 15 "Giao Tranh Bìa Rừng" | 162 Tướng Quân Lê Viễn (M25) | Đạt cấp 24 → diệt 10 Chim Điên → diệt Hỏa Hầu → báo cáo với Tướng Quân | Chim Điên cấp 25 ở M4 Hồng Giang. wangpt và manina2 đang ở bước này (app Rust, 31/10) |
| 17 "Giao Tranh Đầu Tiên" | 143 Tiên phong Hồng Giang (M4), 162 Tướng Quân Lê Viễn (M25) | Đạt cấp 28 → diệt 5 Huyết Lang → **đánh bại Tiên phong Hồng Giang** (NPC, hộp thoại rồi trận, [Q17](#đánh-bại-npc)) → báo cáo với Tướng Quân Lê Viễn | wangpt (cấp 37): bot TS thắng Tiên phong ở Q17, nhiệm vụ sang bước báo cáo |
| 23 "Đột Kích Lạc Cốc" | 162 Tướng Quân Lê Viễn (M25) | Đến vùng đất Lạc Cốc → đạt cấp 43 → diệt Heo Tím → diệt Báo Đốm → báo cáo với Tướng Quân Lê Viễn | symap (Tiheo1, cấp 42) đang ở bước "Đạt cấp độ 43" (R3) |
| 28 "Chặt Gãy Mũi Giáo" | 162 Tướng Quân Lê Viễn (M25), 109 Tiên phong Bạch Nham (M8) | Đạt cấp 60 → diệt 10 Gà Trống Yêu Tinh → **đánh bại Tiên phong Bạch Nham** (NPC, [Q17](#đánh-bại-npc)) → **đánh bại Tướng Thiết Kích** (boss của M8, `c2s/1178`, [B8](#đánh-bại-boss)) → báo cáo với Tướng Quân Lê Viễn | symap (Tiheo1) kẹt ở bước "Đánh bại Tướng Thiết Kích" ngày 02/11 vì app 0.9.0 gửi `c2s/15` |

Mọi NPC của nhiệm vụ 3–7 đều ở M1 và `c2s/13` với mapId `"M1"` luôn được nhận. Từ nhiệm vụ 8, NPC và quái ở M2 "Trại Vân Sơn": phải [đi qua cổng](#cổng). Bước "Bàn bạc với X" làm như "Nói chuyện với X". Bước "Gây N sát thương lên X" nhắm vào boss của map; boss đến qua `s2c/1177` ngay sau `s2c/43`, mã đổi theo khu (`mob86100001` ở khu 0, `mob86100101` ở khu 1).

Nội dung nhiệm vụ nằm ở server: `.so` không có tên hay lời thoại nhiệm vụ nào, chỉ có chữ của giao diện. [Đo]

<a id="tỷ-thí"></a>

### Bước Tỷ thí: hộp thoại `s2c/57`, rồi trận với NPC

Bước 3 của nhiệm vụ 12 "Kiếm Thử Anh Hùng" là "Tỷ thí với Võ Quan Đinh Mộc". Trong `s2c/39` bước này là `stt 2; thamSố 87; cần 1; npcId 141`. `thamSố` và `cần` giống bước diệt quái (87 có lẽ là loại quái của Võ Quan), còn `npcId` giống bước nói chuyện. `s2c/43` của M2 không có con quái nào tên Võ Quan, nên trận chỉ mở được qua NPC. [Đo N1; nghĩa của 87 là Suy luận]

**Trên điện thoại (N1)**, wangpt ở M2 khu 0, đứng cạnh Võ Quan (tầng trên, gần Trại Chủ):

| Thao tác | Gói | Ghi chú |
|---|---|---|
| Chạm biểu tượng trên đầu Võ Quan | `c2s/13` = `000000024d32 0000008d` ("M2", 141) | Đúng gói bot vẫn gửi. Nút hành động (thanh kiếm) chỉ gửi `c2s/1169` (toạ độ 1677, 800), không mở hộp thoại |
| Server trả lời sau 34 ms | `s2c/57`, 107 byte, đọc hết: `n = 2`; "Võ Quan Đinh Mộc"; "Cậu đã sẵn sàng chiến đấu chưa."; `00` "Đồng ý"; `01` "Từ chối" | Cùng bố cục với hộp thoại Lái Buôn ([12](12-skills-items.md#c2s-1190)) |
| Bấm Từ chối | `c2s/57` = `01 000000024d32 0000008d` (1, "M2", 141), hàm dựng `sqlq.a103` | Server trả `s2c/1111` rỗng sau 31 ms, hộp thoại đóng |
| Bấm Đồng ý | `c2s/57` = `00 000000024d32 0000008d` (0, "M2", 141) | Server không mở trận ngay mà gửi `s2c/1180`; xem [Đồng ý → `s2c/1180` → `c2s/1181`](#s2c-1180) (N3) |

**Vì sao app báo "NPC không trả lời".** Bot coi mọi bước có `npcId` là bước nói chuyện: gửi `c2s/13` rồi chỉ chờ `s2c/34`. Server có trả lời, nhưng bằng `s2c/57`, nên 8 s sau bot dừng. Nhật ký của wangpt ngày 31/10 (19:10–19:25) có 5 lần như vậy, không lần nào có trận hay dòng "Thua trận". [Đo]

<a id="s2c-1180"></a>

**Đồng ý → `s2c/1180` → `c2s/1181` → trận.** Đồng ý không mở trận ngay. Lần đầu app chạy thật bước này (31/10, 20:25), app gửi `c2s/57 (0, "M2", 141)` ba lần, không lần nào có `s2c/22` hay lời server, rồi dừng vì đã tỷ thí 3 lần. Bắt gói bằng bot TS (N2) rồi trên điện thoại (N3) thì thấy:

| Bước | Gói | Ghi chú |
|---|---|---|
| Đồng ý | `c2s/57` = `00 000000024d32 0000008d` | |
| Server, sau 24–27 ms | **`s2c/1180`**, 63 byte, đọc hết (khối dưới) | Lời mời tỷ thí: một "con quái" riêng, `mob880` cấp 20 mang tên Võ Quan |
| Client, sau 8 ms | **`c2s/1181`** = `000000066d6f62383830 00000000 0000008d` ("mob880", 0, 141) | Client tự gửi, người chơi không chạm gì: nhận `s2c/1180` là game gọi hàm chạm `sqhz.a17`, hàm này dựng gói bằng `sqlq.a122(mobId, npcId, false)` (N3) |
| Server, sau 2,1–2,7 s | `s2c/22` mở trận, 729 byte | Khối quái: `mob880` "Võ Quan Đinh Mộc", hệ Hỏa (1), cấp 20, HP 526/526; 30 s mỗi lượt |

```text
000000024d32 0000008d                      "M2", NPC 141
000000066d6f62383830                       "mob880"
0000001456c3b5205175616e20c490696e68204de1bb9963   "Võ Quan Đinh Mộc"
00000014 00 00000006 00000001 00           cấp 20; u8 0; i32 6; i32 1; u8 0 (như bản ghi quái của s2c/43)
02 00000001                                u8 2; i32 1 (N2 lần 1 và 2), 0 (N2 lần 3, N3)
```

**Ở protocol `0.0.7`** (D7, 20/11, 5 gói từ Log lỗi của app với 4 nick): `s2c/1180` dài 64 byte, vẫn y như trên nhưng có thêm **`u8 c` = `69` (105)** ở cuối. Bản ghi quái ở đây vẫn theo bố cục `0.0.2`, không thêm 9 byte như `s2c/43` của `0.0.7`. Trước khi sửa, app báo "Không đọc được s2c/1180: … 1 unread bytes", rồi dừng với "Server không gửi trận tỷ thí sau Đồng ý". Chưa rõ nghĩa của `c`. [Đo D7]

**Trận (N4).** Bot TS tự đánh, wangpt cấp 25 vào trận với 110/184 HP. Bot thắng sau 13 lượt của mình trong 31 s, gây 624 sát thương, dùng 2 lần kỹ năng, còn 68 HP; được +168 EXP, +18 xu. Cùng một mili giây lúc trận kết thúc, server gửi `s2c/1200` (rỗng), `s2c/34` (nhiệm vụ 12, "Khá lắm!\nRất ít người mới có thể ép ta tới mức này."), `s2c/10` (EXP 24 234 → 24 402), `s2c/36` (độ bền) và `s2c/1214`. Không có `s2c/1201` hay `s2c/39`. `s2c/34` đưa nhiệm vụ sang bước "Báo cáo với Trại Chủ Phạm Hùng", như ở bước nói chuyện. [Đo N4]

Trên điện thoại (N3) không ai đánh: quái đi 10 nước trong 5 phút mà HP vẫn 147/184. Tắt game giữa trận (`am force-stop`) thì ở lần đăng nhập sau EXP vẫn là 24 234, tức không mất EXP, còn HP là 110/184. [Đo N3, N4]

**Bot làm bước này thế nào** (bot TS: `QuestBot.dialog` và `QuestBot.invite` trong [src/bot/quest.ts](../../../src/bot/quest.ts); app Rust: `npc_dialog` và `duel` trong `app/core/src/bot/quest.rs`):

1. Gửi `c2s/13 (mapId, npcId)` như mọi bước nói chuyện.
2. Nếu `s2c/57` đến lúc đang chờ lời NPC, bot tìm dòng có nhãn "Đồng ý" rồi gửi `c2s/57 (mãDòng, mapId, npcId)`. Hộp thoại không có dòng "Đồng ý" thì bot dừng, ghi lại câu hỏi cùng các dòng (app: "Võ Quan Đinh Mộc hỏi "…" (…): bot chưa biết chọn dòng nào"). 8 s không có `s2c/1180` thì bot dừng ("Server không gửi trận tỷ thí sau Đồng ý").
3. Khi `s2c/1180` đến cho NPC của bước, bot gửi ngay `c2s/1181 (mobId, 0, npcId)` như game, rồi chờ trận 8 s như một lần thách đấu. `mob880` không có trong `s2c/43`, nên bản ghi trận lấy tên và cấp từ `s2c/1180`.
4. Trận tính vào lần chạy nhiệm vụ như mọi trận khác; thua thì tính vào số trận thua cho phép. Bước chỉ sang khi có `s2c/34`, không phải khi bot thắng. Nếu trận không mở trong 8 s, bot nói chuyện lại; sau 3 lần tỷ thí mà bước vẫn chưa sang, bot dừng.

Nhật ký của app có thêm hai dòng: "Võ Quan Đinh Mộc: Cậu đã sẵn sàng chiến đấu chưa. → Đồng ý" (Nhiệm vụ) và "Trận 1: tỷ thí với Võ Quan Đinh Mộc cấp 20 (mob880)" (Trận). Log của bot TS có `npc_menu`, `duel`, `duel_invite`, rồi `challenge` với `opcode: 1181`.

**Còn chưa rõ:** thua Võ Quan có mất EXP không (N4 thắng); nghĩa của hai trường cuối của `s2c/1180`; app Rust chưa chạy thật bước này (bot TS đã chạy ở N4).

<a id="đánh-bại-npc"></a>

### Bước "Đánh bại" một NPC (Q17)

Ngày 01/11, app Rust của wangpt dừng ở bước 3 của nhiệm vụ 17 với "Không thấy quái của bước này ở khu này". Nguyên nhân: bot xếp bước theo chữ, mà "Đánh bại X" luôn bị coi là diệt quái tên X. Bot TS đăng nhập wangpt (người dùng đồng ý) và đọc được [Đo Q17]:

- `s2c/39`: bước `stt 2` "Đánh bại Tiên phong Hồng Giang", `thamSố 90; cần 1; npcId 143`. Giống bước Tỷ thí (`thamSố 87; npcId 141`); các bước diệt quái đều có `npcId -1`. `s2c/43` của M4 không có quái tên này.
- `c2s/13 ("M4", 143)` → `s2c/57` "Tiên phong Hồng Giang": "Tới đây chiến đấu với ta." với 0 Đồng ý, 1 Từ chối.
- Đồng ý → `s2c/1180`: quái riêng `mob910` "Tiên phong Hồng Giang" cấp 28. Bot gửi `c2s/1181 ("mob910", 0, 143)`, trận mở sau 2,7 s; Tiên phong có 556 HP.
- wangpt cấp 37, 384 HP: thắng sau 6 lượt của mình trong 16 s, 3 lần Xích Lôi Công, còn 331 HP; +232 EXP, +2 xu, rơi 2 Gỗ Bậc 1. Cùng lúc server gửi `s2c/34` "Hồng Giang sẽ nghiền nát các ngươi." và bước sang "Báo cáo với Tướng Quân Lê Viễn" (NPC 162 ở M25).

`thamSố` 90 có lẽ là loại quái của Tiên phong, như 87 của Võ Quan [Suy luận].

**Bot xếp loại bước theo `s2c/39` trước, chữ sau** (`stepAction` trong [src/bot/quest.ts](../../../src/bot/quest.ts), `step_action` trong `app/core/src/quest.rs`):

1. `npcId` ≥ 0: bước NPC, dù chữ là "Nói chuyện", "Báo cáo", "Gặp", "Tỷ thí" hay "Đánh bại". Bot gửi `c2s/13` rồi làm theo gói server trả: `s2c/34` là xong; `s2c/57` có "Đồng ý" thì chọn dòng đó, rồi `s2c/1180` là trận đấu ([Bước Tỷ thí](#tỷ-thí)). Menu có "Nói chuyện" mà không có "Đồng ý" thì bot chọn "Nói chuyện" một lần cho mỗi lần `c2s/13`, như lối vào hộp thoại của bước: Tướng phe Thiết Hổ (NPC 145, bước 2 "Đánh bại Tướng phe Thiết Hổ" của nhiệm vụ 22) trả `c2s/13` bằng "Ngươi cần gì ở châu này?" với hai dòng Thông tin châu, Nói chuyện (manina2, manina3, tiheo2, 20/11; bản 2.0.1 dừng ở đây). Server trả gì sau Nói chuyện thì **chưa đo** [Suy luận: hộp thoại tỷ thí có Đồng ý]. Hộp thoại khác không có "Đồng ý", hay lại menu ấy sau Nói chuyện, thì bot dừng, không chọn gì.
2. `npcId` = -1: đọc chữ:
   - "Tiêu diệt/Đánh bại X" là quái tên X. Nếu X là boss của map thì vẫn thách đấu bằng `c2s/1178` ([B8](#đánh-bại-boss)).
   - "Gây N sát thương lên X" là boss.
   - "Đạt cấp độ N", "Nâng điểm tiềm năng", "Sử dụng điểm kỹ năng", "Trinh sát Thành X", "Đến X" hay "Đến vùng đất X".

   Từ 1.000 trở lên, số có dấu chấm ngăn hàng nghìn: "Gây 1.000 sát thương lên Tướng Thiết Hổ" (thamSố 95, cần 1000) của wangpt, 02/11. App 0.9.0 không đọc được số này và dừng ở "Bot chưa biết làm bước". Nay hai bot đọc "1.000" thành 1000. [Đo]
3. Còn lại: bot dừng và ghi chữ cùng ba số của bước (app: "Bot chưa biết làm bước "…" (thamSố …, cần …, npcId …)"), để thêm loại mới chỉ từ nhật ký.

Bot vẫn tìm quái theo tên, không theo `thamSố`. `mobId` ghép mã loại với số thứ tự không có dấu ngăn: `mob132600` của Huyết Lang (mã 13) cũng bắt đầu bằng `mob1` của Gà Điên. Vì vậy mã loại không tách được chắc chắn.

Test chung TS và Rust: `npm run export:rust` đưa vào `stepActions` mọi bước của mọi `s2c/39` đã bắt (nhiệm vụ 3, 4, 12, 14, 17, 28), một lần phát lại trận đấu của nhiệm vụ 17 và bước boss của nhiệm vụ 28 (`questReplays`, [test/fixtures-q17.ts](../../../test/fixtures-q17.ts), [test/fixtures-b8.ts](../../../test/fixtures-b8.ts)). `app/core/tests/parity.rs` kiểm app Rust làm giống hệt.

<a id="trinh-sát"></a>

### Bước Trinh sát: vào map là xong

Bước 2 của nhiệm vụ 14 "Trinh Sát Hồng Giang" là "Trinh sát Thành Hồng Giang". Trong `s2c/39` bước này là `stt 1; thamSố 3; cần 1; npcId -1`. Bước không có NPC, và 3 không phải loại quái: nó trùng với thứ tự của M4 "Hồng Giang" mà `s2c/13` gửi khi vào map (M1 0, M2 1, M4 3, M25 24, [06-map-mobs](06-map-mobs.md#atlas)). [Đo N5; `thamSố` là thứ tự map là Suy luận từ một bước]

**Vì sao app báo "Bot chưa biết làm bước".** App đọc loại bước từ chữ của bước. Trước bản này app chỉ biết bước đạt cấp, nói chuyện, diệt quái, gây sát thương lên boss, cộng điểm tiềm năng, dùng điểm kỹ năng và Tỷ thí. Một bước không có NPC mà chữ không khớp loại nào thì app dừng ngay. Ngày 31/10, wangpt (20:56) và manina2 (20:57) đều dừng ở đây, ngay sau khi gặp Tướng Quân. [Đo]

**Chuỗi gói (N5).** wangpt cấp 26 đứng ở M25 sau bước "Gặp Tướng Quân Lê Viễn":

| Bước | Gói | Ghi chú |
|---|---|---|
| Qua cổng Hồng Giang | `c2s/13` = `000000034d3235 000003f8` ("M25", 1016) | Ở S1 cổng này trả "Bạn cần hoàn thành nhiệm vụ trước khi tới đây". Lần này server nhận |
| Server chuyển map, sau 26 ms | `s2c/13` = `000000024d34 00000003 00ff` ("M4", thứ tự 3) | |
| Xin map, xin quái | `c2s/11` "M4", `c2s/43` "M4" | `s2c/11` "Hồng Giang": NPC 143 Tiên phong Hồng Giang, 131 Lính Hồng Giang (hai NPC), 121 Tướng Xích Vũ, 144 Phó Tướng Hồng Giang; cổng 1020 Cửu Phong, 1024 Rìa Hồng Giang, 1017 Tân Trạch, 1018 Nguyệt Đàm. `s2c/43` có 32 quái; boss Tướng Xích Vũ cấp 35 (`mob93100004`) |
| Server, 31 ms sau `c2s/43` | `s2c/1177` (boss), `s2c/1184` (đồ trên đất), `s2c/1200` (rỗng), rồi **`s2c/34`** (nhiệm vụ 14): "Quan sát doanh trại địch.\nGhi nhớ vị trí canh gác, kho lương và đường tiếp tế.\nĐừng để bị phát hiện." | Không có `s2c/39`. `s2c/34` đưa bước sang "Báo cáo với Tướng Quân Lê Viễn", như sau lời NPC |
| Báo cáo | Bot về M25 qua cổng 1024, rồi `c2s/13 ("M25", 162)` | `s2c/35`: 1200 kinh nghiệm, 1220 Xu khóa; sau đó là `s2c/34` và `s2c/39` của nhiệm vụ 15 |

Chưa rõ server gửi `s2c/34` khi nhận `c2s/11` hay khi nhận `c2s/43`, vì bot gửi cả hai như client. [Đo N5]

**Bước "Đến X" (nhiệm vụ 19, wangpt 01/11).** Nhiệm vụ 19 "Thế Lực Tranh Hùng", bước 2/3 là "Đến Cửu Phong" với `thamSố 9; cần 1; npcId -1`. Theo cùng quy tắc, 9 là M10, và M10 đúng là "Cửu Phong" trong bản đồ đã quét. Vậy đây là bước đi tới map như Trinh sát, chỉ khác chữ. Trước bản sửa, wangpt (cấp 38, đứng ở M25) dừng với "Bot chưa biết làm bước "Đến Cửu Phong" (thamSố 9, cần 1, npcId -1)". Bước "Đến vùng đất Lạc Cốc" của nhiệm vụ 23 cũng được coi là cùng loại. [Đo: chữ và ba số của bước; Suy luận: loại bước. Chưa chạy thật]

Đường đi từ M25: không có cổng nào tên Cửu Phong, nên bot qua cổng Hồng Giang (1016) sang M4, rồi qua cổng Cửu Phong (1020) của M4 sang M10. Kịch bản phát lại `Đến step (Q19)` của `questReplays` kiểm đúng chuỗi này ở cả TS và Rust. Bước 1 và 3 của nhiệm vụ trong kịch bản là dựng theo bố cục.

**Bot làm thế nào.** Bot TS dùng `visit()` trong [src/bot/quest.ts](../../../src/bot/quest.ts); app Rust dùng `visit()` trong [app/core/src/bot/quest.rs](../../../app/core/src/bot/quest.rs).
1. Bước có chữ "Trinh sát X", "Trinh sát Thành X", "Đến X" hay "Đến vùng đất X" và không có NPC là bước đi tới map `M{thamSố + 1}` (M4 cho Trinh sát Thành Hồng Giang, M10 cho Đến Cửu Phong). Quy tắc này mới suy ra từ hai bước, nên nếu bản đồ đã biết map đó mà tên khác X thì bot dừng, không đi: "Bước "Đến Cửu Phong": thamSố chỉ tới M2 (Trại Vân Sơn), không phải Cửu Phong; bot không tự đi".
2. Nếu map đang đứng có cổng tên X, hay có cổng từng dẫn tới map đó, bot qua cổng ấy và chờ server trả lời như ở bước nói chuyện. Nếu không, bot đi theo đường đã biết trong bản đồ tới một map có cổng như vậy. Từ M2, bot qua cổng Rìa Hồng Giang trước.
3. `s2c/34` đưa bước sang. Có ba trường hợp bot dừng:
   - Tới map rồi mà 2 s sau bước vẫn chưa sang: "Đã ở Hồng Giang mà server chưa sang bước "Trinh sát Thành Hồng Giang"".
   - Cổng từ chối (`s2c/1256`): "Không vào được Hồng Giang: cổng Hồng Giang (1016) từ chối".
   - Không biết đường: "Không biết đường tới Hồng Giang".

Lời từ chối cũ của cổng 1016 trong `data/maps.json` (S1) không chặn bot. Bot chỉ bỏ qua cổng đòi cấp cao hơn cấp mình, hoặc cổng đã từ chối trong lần chạy này.

**Còn chưa rõ:**
- `thamSố` có luôn là thứ tự map ở mọi bước Trinh sát hay "Đến" không (mới thấy hai bước: 3 = M4, 9 = M10).
- Bước "Đến Cửu Phong" có xong ngay khi vào M10 như Trinh sát không: bot coi là có, chưa chạy thật.
- Bước "Đến vùng đất Lạc Cốc" của nhiệm vụ 23 có `thamSố` 4 (M5 Lạc Cốc) không. Bot nhận chữ này; nếu số chỉ tới map khác tên thì bot dừng.
- Nếu đã đứng sẵn trong map của bước thì có phải ra rồi vào lại không.

**App Rust chạy thật (31/10, 21:23, manina2).** manina2 đứng ở M2 khi app mở. App qua cổng Rìa Hồng Giang sang M25, rồi qua cổng Hồng Giang sang M4. Vào M4 thì có `s2c/34` "Quan sát doanh trại địch…", và bước sang báo cáo. App về M25 báo cáo với Tướng Quân; nhiệm vụ 14 xong 8 s sau khi bắt đầu (1200 kinh nghiệm, 1220 Xu khóa). Sau đó app tự sang bước "Tiêu diệt Chim Điên" của nhiệm vụ 15 ở M4. [Đo]

## Bot làm nhiệm vụ bằng TypeScript

Cách chạy, tham số và luồng code: [Bot làm nhiệm vụ](../../integration/nodejs/quest-bot.md). Bot đánh trận thật với server, nên EXP, tiền, vật phẩm và tiến độ nhiệm vụ đều được ghi vào tài khoản.

### Kết quả Q2

| Trận | Quái | HP lúc vào | Nước của bot | HP lúc hết | EXP | Xu |
|---:|---|---|---:|---:|---:|---:|
| 1 | mob2806 | 136/136 | 20 | 98 | 160 | 24 |
| 2 | mob2807 | 136/136 | 10 | 136 | 64 | 16 |
| 3 | mob2808 | 142/142 | 10 | 142 | 68 | 0 |
| 4 | mob2809 | 142/142 | 7 | 133 | 72 | 8 |
| 5 | mob2810 | 142/142 | 4 | 142 | 60 | 14 |
| 6 | mob2811 | 142/142 | 11 | 142 | 68 | 22 |
| 7 | mob2806 | 148/148 | 16 | 142 | 108 | 36 |
| 8 | mob2807 | 148/148 | 8 | 148 | 68 | 14 |
| 9 | mob2808 | 148/148 | 12 | 139 | 76 | 6 |
| 10 | mob2809 | 154/154 | 14 | 154 | 48 | 14 |

- Thắng 10/10, không lệch bàn lần nào. Từ `c2s/15` tới `s2c/22` mất 2,5–3,0 s. [Đo]
- Heo Mọi (cấp 7) có khoảng 146 HP và tự hồi máu bằng tim; mỗi lần `manina` ăn 3 kiếm gây 35 sát thương, Heo Mọi ăn kiếm gây 9. [Đo]
- HP tối đa tăng 136 → 142 → 148 → 154: lên 3 cấp. HP đầy lại trước trận sau; nguyên nhân (hồi theo thời gian hay do lên cấp) [Chưa rõ].
- Mã quái là `mob2806`…`mob2811`, tức khu 1 theo công thức của [06-map-mobs](06-map-mobs.md#quái-của-m1). Lúc đó khu 0 đang 20/20 nên server xếp client Node vào khu 1. [Suy luận]
- Sau mỗi trận thắng, server gửi `s2c/10`, `s2c/36` (20 byte) và `s2c/1214`. Trong `s2c/36`, byte thứ 9 giảm 39 → 34 và `i32` ở offset 11 giảm 50, 45, 40, 36, 33, 28, 24, 20, 17, 12 qua 10 trận. Các lượt sau cho thấy đó là độ bền của hai món trang bị ([Q3–Q6](#kết-quả-q3-q4)). [Đo]

### Hai điều Q1 phát hiện

- **Bàn bị xếp lại.** Sau một nước, khi bàn hết nước đi, server gửi bàn mới ngay trong `s2c/19`. Phần sau danh sách viên rơi, trước đây ghi là `i32 zero2`, thực ra là `u8 xếpLại; [i32 64; u8[64] bànMới nếu xếpLại = 1]; 3 byte`. 52 bước cũ đều có `xếpLại = 0` nên không thấy khác biệt. Q2 gặp 2 lần xếp lại và bot vẫn đúng bàn. [Đo]
- Một lỗi giải mã trong bot từng làm client đóng kết nối. Giờ `QuestBot.onPacket` bắt lỗi và ghi đủ hex (`parse_error`), và client chỉ còn ghi `schema_warning` cho lỗi giải mã sau khi đã vào thế giới.

<a id="kết-quả-q3-q4"></a>

### Kết quả Q3–Q6: HP, lên cấp, tiến độ, các lỗi đã gặp

- **HP vào trận luôn đầy.** HP trên bản đồ là HP cuối trận trước và không tự hồi theo thời gian: sau Q3 còn 60/160, đăng nhập lại sau vài phút vẫn 60/160 (`s2c/9`). Nhưng `s2c/22` của trận sau báo 160/160, và trận Q2 số 2 (vào với 98 HP trên bản đồ, không bị đánh trúng) kết thúc với 136/136. Vì vậy bot không cần chờ hồi máu; ngưỡng `--min-hp` mặc định 0. [Đo] **Đính chính (Q16):** đánh liên tiếp, cách nhau 1 s, thì HP vào trận đúng bằng HP cuối trận trước (151 → 151, 54 → 54, 41 → 41), và trận thứ 10 thua ở cấp 18, mất 34 EXP. Các lần "đầy máu" trước đây đều sau khi đăng nhập lại hoặc nghỉ lâu. Bot giờ nghỉ khi HP dưới 40% (`--heal-below`).
- **Lên cấp** (Q3, cấp 7 → 8 sau trận Kẻ Gây Rối đầu tiên): cùng một mili giây có `s2c/10` kiểu 2 (cấp 8, `stats = [32, 10, 10, 17, …]`), kiểu 4 (HP 60/160, EXP 1463 trong khoảng 1400–1800), kiểu 8 (`statPoints = 16`), một gói mới `s2c/1201` (`00000001`), rồi kiểu 4 lần nữa với tiền tăng thêm 24 (phần thưởng trận). [Đo]
- **Quái không mất sau khi bị giết.** Q3 và Q4 đều thách đấu `mob31400` và thắng cả hai; Q6 đánh lại `mob31406` sau 6 trận. [Đo]
- **Mất kết nối giữa trận** (dừng Q4 ở seq 20): đăng nhập lại không có `s2c/22` nào để tiếp tục trận, trận dở không được tính vào tiến độ (`tiếnĐộ` = 3 = số trận đã thắng), và HP trên bản đồ là HP lúc rời trận (70/160). [Đo]
- **Hai lỗi bot đã sửa trong lúc chạy.** Q4: kỹ năng 1000 của Kẻ Gây Rối có bố cục `s2c/20` khác kỹ năng 2000, bot đọc lỗi rồi lệch bàn. Q5: Kiếm lửa bị kỹ năng phá cũng nổ 3×3, mô hình cũ không tính. Cả hai ghi ở [05-battle](05-battle.md#s2c-20); test hồi quy dùng đúng gói thật. [Đo]
- **Trang bị mòn và hỏng** (`s2c/36` là độ bền). Gói `s2c/36` đến sau mỗi trận, một byte giảm dần: B1 49 → Q2 39…34 → Q3 27 → Q4 26, 25 → Q6 13, 8, 6, 4, **0**. Đúng trận nó về 0 (Q6 trận 5), HP tối đa tụt 166 → 114 dù vừa lên cấp, và `extra[2]` của `s2c/10` tụt 9 → 5. Một ô `i32` khác trong `s2c/36` đã giảm 50 → 0 từ Q2 tới Q4, cùng quãng `extra[1]` tụt 40 → 32 và sát thương 3 kiếm giảm 35 → 30. Trận dài làm độ bền giảm nhanh hơn (Q5 kéo dài: 25 → 13). Vậy trang bị hỏng ở độ bền 0 và mất chỉ số; muốn đánh tiếp hiệu quả phải sửa đồ (chưa tìm gói sửa; có thể tốn Xu). [Đo giá trị; vai trò "độ bền" là Suy luận]
- **Thua trận** (Q6, Sơn Tặc cấp 9): `s2c/18` lần này là `00000000 01 00`, nghĩa là **người chơi đi trước**. Bot cũ vẫn gửi `c2s/14` xin nước của quái nên server im lặng. Cứ hết 30 s của lượt, server gửi `s2c/21`: quái đánh 46 mà không cần đổi viên. Sau 3 lần, HP 110 → 64 → 18 → 0, trận kết thúc bằng `s2c/21` có `end = 1`, rồi `s2c/1256` "Thua trận, mất 16 kinh nghiệm" và `s2c/10` với EXP giảm đúng 16. HP sau trận thua được hồi đầy (120/120). [Đo]
- **Không phải trận nào cũng hồi máu lúc vào.** Trận Sơn Tặc vào với 110/120 (bằng HP trên bản đồ). Các trận trước đều vào với HP đầy, nhưng lúc đó HP trên bản đồ cũng thường gần đầy hoặc vừa lên cấp, nên quy tắc hồi máu chưa rõ. [Chưa rõ]
- **Nhiệm vụ 5 xong ở Q6**: 7 trận thắng liền, báo cáo với NPC 111, nhận 314 EXP + 770 Xu khoá, lên cấp 11; server gửi ngay nhiệm vụ 6 (`s2c/39`, bước 1 vì đã đủ cấp 8), bot nói chuyện với NPC 129 và chuyển sang "Đánh bại Sơn Tặc". [Đo]

| Lượt | Quái | Trận | Thắng | Nước của bot (tb) | Thời gian trận (tb) | EXP tb | Ghi chú |
|---|---|---:|---:|---:|---:|---:|---|
| Q3 | Kẻ Gây Rối (cấp 7) | 1 | 1 | 26 | 49 s | 144 | Dừng vì ngưỡng HP cũ |
| Q4 | Kẻ Gây Rối | 2 (+1 dở) | 2 | 12 | 22 s | 70 | Dừng để sửa `s2c/20` |
| Q5 | Kẻ Gây Rối | 0 (+1 dở) | 0 | | | | Dừng để sửa luật nổ |
| Q6 | Kẻ Gây Rối | 7 | 7 | 27 | 49 s | 137 | Xong nhiệm vụ 5; trọng số cũ |

<a id="đánh-nhanh-hay-ăn-sao"></a>

### Đánh nhanh hay ăn sao

Mỗi trận gồm: ~2,5 s từ `c2s/15` tới `s2c/22`, các nước (khoảng 1,9 s cho một cặp nước của mình và của quái, phần lớn là thời gian server chờ hiệu ứng), và 3 s bot nghỉ trước trận sau. Sát thương chỉ đến từ kiếm (30 cho 3 kiếm, 41 cho 4 kiếm ở cấp 8–11; gấp đôi khi thanh sức mạnh đầy), còn EXP đến từ sao và giọt nước ([công thức](07-auto-battle.md#tác-dụng-của-các-viên)). Bot có hai bộ trọng số (`--goal=kill`, `--goal=exp`) để đo trực tiếp:

| Cách đánh | Quái | Trận | Nước của bot tb | Thời gian tb (cả chờ) | EXP tb | EXP/phút | Trận/phút | HP mất |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Theo lượt, trọng số cũ (Q6) | Kẻ Gây Rối cấp 7 | 7 | 27 | 55 s | 137 | 150 | 1,09 | 5–84 mỗi trận |
| Tính giờ, 1 nước/giây, nghỉ 3 s, Hỏa Cầu Thuật khi đủ nội lực (Q9) | Sơn Tặc cấp 9 | 10 | 21 | 28 s | 152 | 326 | 2,15 | 0 |
| Như trên nhưng 0,5 s/nước, nghỉ 1 s, `--goal=kill` (Q11) | Sơn Tặc | 10 | 25 | 18 s | 153 | 504 | 3,29 | 0 |
| Như Q11 nhưng `--goal=exp` (Q12) | Sơn Tặc | 10 | 24 | 17 s | 153 | 536 | 3,51 | 0 |

Thời gian và tốc độ tính từ lần thách đấu đầu tới lúc trận cuối kết thúc, gồm cả lúc chờ `s2c/22` (~2,5 s) và lúc nghỉ.

- **Trận tính giờ nhanh gấp đôi**: trận theo lượt mất ~1 s chờ `s2c/24` sau mỗi nước của cả hai bên, cộng thời gian quái đi; trận tính giờ chỉ giới hạn bởi tốc độ bot gửi nước (đang để 1 nước/giây, server trả lời trong ~30 ms). [Đo]
- **Hỏa Cầu Thuật** (62 sát thương, gấp đôi 3 kiếm) rút ngắn trận; Q9 dùng 0–2 lần mỗi trận. [Đo]
- **Phần cộng EXP** theo quái và cấp mình: Kẻ Gây Rối 26–30 (manina cấp 9–11), Sơn Tặc 46–54 (cấp 11–13) rồi 36–48 (cấp 15–16). Quái càng cao hơn mình thì phần cộng càng lớn. Xu luôn đúng 2 × vàng (26/26 trận Q9, Q11, Q12). [Đo]
- **Trong trận tính giờ, bộ trọng số gần như không quan trọng** (Q11, Q12, trước khi đổi cách chấm nước ở Q20): `exp` và `kill` cho cùng 153 EXP/trận; `exp` nhỉnh hơn về xu (~39 so với 35/trận). Yếu tố quyết định là nhịp gửi nước: từ 1 s xuống 0,5 s/nước (cộng nghỉ 3 s → 1 s) thì EXP/phút tăng ~60%. Chưa thử nhanh hơn 0,5 s vì không rõ server có chặn hành vi bất thường không. [Đo]

**Cách đánh nhanh nhất đã đo được** (nhân vật cấp 11–16, trang bị đã hỏng 2 món):
1. Chọn quái mở **trận tính giờ** (`s2c/18` byte 4 = 1; ở M1 là Sơn Tặc), cấp càng cao hơn mình càng tốt nếu vẫn thắng. Theo lượt (Gà Điên, Heo Mọi, Kẻ Gây Rối, Chỉ Huy) chậm hơn nhiều vì mỗi lượt chờ nhịp 1 s của server.
2. Trong trận tính giờ, gửi nước liên tục (0,5 s/nước); quái chỉ đánh mỗi ~25–31 s nên trận 10–22 s xong trước đòn đầu.
3. Dùng Hỏa Cầu Thuật (`c2s/20`, 62 sát thương) mỗi khi nội lực ≥ 25; ăn Trái đào (mã 3) để có đòn gấp đôi.
4. Nghỉ ngắn giữa các trận (1 s đủ; server luôn trả `s2c/22` sau ~2,5 s).

<a id="cổng"></a>

### Đi qua cổng sang map khác (B5, Q15, Q16, S1)

| Bước | Gói | Mẫu (M1 → M2) |
|---|---|---|
| Bấm "Vào" ở cổng | **`c2s/13`** `string mapId; i32 idCổng` | `"M1", 1015` (cổng "Vân Sơn") |
| Server chuyển map | `s2c/13` `string mapId; i32 thứTựMap; u8 0; u8 0xff` | `"M2", 1` (M2 là mục 1 của bản đồ thế giới) |
| Xin map | `c2s/11` `string mapId; u8 -1; i32 -1` | `"M2"` |
| Map | `s2c/11` | 9940 byte, cuối gói có 8 NPC/cổng của M2 |
| Xin quái | `c2s/43` | `"M2"` → `s2c/43` (33 quái) và hai `s2c/1177` (Hào Trưởng phía Bắc, phía Nam) |

- Cổng là một bản ghi loại 0 trong danh sách cuối `s2c/11`, cùng chỗ với NPC (loại 2). Bố cục đã đọc hết byte: `i32 id; string tên; u8 loại; i32 x, y, w, h; u8; i32 p, q` ([03-world](03-world.md#s2c-11)). Tên cổng là tên map đích: "Vân Sơn" → "Trại Vân Sơn". [Đo]
- Cách tìm ra (B5): bot Node đi bộ tới cổng (4960, 656), server không tự chuyển map. Mở app thì nhân vật đứng ở cổng, app hiện nút **"Vào"**; bấm thì client gửi `sqlq.b65` → `c2s/13`. [Đo]
- Bot TS (Q15, Q16) gửi `c2s/13` với id NPC trong M2 thì được nhận. [Đo]
- Cổng chưa mở: server trả `s2c/1256`. Cổng "Lạc Cốc" (1013) ở Q15 có trả "Bạn phải đạt cấp 40 mới vào được Lạc Cốc", nhưng bot lúc đó chưa đọc gói này nên ghi là "không trả lời". Cổng "Hồng Giang" (1016, từ M25) trả "Bạn cần hoàn thành nhiệm vụ trước khi tới đây" (S1). Cổng này mở muộn nhất là khi nhiệm vụ 14 tới bước "Trinh sát Thành Hồng Giang" (N5). Bot nay ghi lời từ chối vào [data/maps.json](../../../data/maps.json) và chọn cổng khác. [Đo]
- Vị trí và map được server lưu: lần đăng nhập sau vào thẳng M2. [Đo]


### Kết quả Q14–Q17: nhiệm vụ 7, 8, 9 bằng bot TS

- Q14: báo cáo nhiệm vụ 7, nhận nhiệm vụ 8, nói chuyện với Thành Chủ; dừng ở "Gặp Trại Chủ Phạm Hùng" vì NPC ở M2 (bot lúc đó chưa biết đi qua cổng). [Đo]
- Q15: lỗi đọc bước "Tiêu diệt 1 Sói Xám" thành tên quái "1 Sói Xám", nên bot đi tìm cổng (đã sửa trong `stepAction`). [Đo]
- Q16–Q17 (ở M2, cấp 18 → 19): làm xong nhiệm vụ 8, nhiệm vụ 9 tới Cóc Xanh 1/15. 17 trận Sói Xám thắng 17, 2 trận Cóc Xanh thắng 1. Thua 2 lần, mỗi lần vào trận với HP thấp: 61/168 trước Sói Xám (mất 34 EXP), 108/174 trước Cóc Xanh cấp 13 (mất 36 EXP). Mức trừ khi thua tăng theo cấp: 16 ở cấp ~9, 34 ở cấp 18, 36 ở cấp 19. Một trận Sói Xám mất 28–73 s, cho 80–276 EXP. [Đo]

<a id="kết-quả-q18-q20"></a>

### Kết quả Q18–Q20: Cóc Xanh, HP không hồi, cách chấm nước mới

| Lượt | Cách chấm nước | Trận Cóc Xanh | Thắng | Nước của bot mỗi trận thắng (tb) |
|---|---|---:|---:|---:|
| Q17–Q19 | Trọng số cũ | 11 | 4 (36%) | 24 |
| Q20 | Theo HP ([07-auto-battle](07-auto-battle.md#thuật-toán-của-bot)) | 15 | 10 (67%) | 22,7 |

- **HP không tự hồi khi đứng yên.** Q19 cho bot nghỉ 3 × 60 s khi HP dưới 70%: hai lần, HP trước khi nghỉ (91/174, 76/174) đúng bằng HP trong `s2c/22` của trận sau. Bot đã bỏ phần nghỉ. HP chỉ hồi đầy sau một trận thua (cùng lúc mất 36 EXP ở cấp 19). [Đo]
- **Thua trận vẫn có lời khi làm bước diệt quái**: mỗi trận thắng Cóc Xanh cho 88–196 EXP, thua mất 36. Bot cho phép thua `--max-losses` trận rồi mới dừng; trận thua không được tính vào số con đã diệt. [Đo]
- **Vì sao Cóc Xanh khó:** 249 HP, mỗi viên kiếm của nó gây 10,9 (bằng manina), và nó gom nội lực nhanh gấp gần 3 lần. Kỹ năng của nó gây 47–83, nhiều trận thua có 2–3 lần kỹ năng. [Đo]
- Tỉ lệ thắng của Q20 (67%) khớp mô phỏng (64,7% với quái giống thật). **Ba trong năm trận thua** của Q20 không do chọn nước sai: một trận vào với 35 HP (sau một trận thắng sát nút); một trận quái ăn chuỗi 3 lần liền ở nước đầu (5 âm dương, thêm lượt) rồi dùng kỹ năng 83 và 60; một trận bàn cờ không có nước kiếm nào trong cả 10 lượt của bot (phát lại từ trace, chấm điểm mọi nước). Hai trận còn lại (6 và 17 nước) chưa phát lại. [Đo]
- Q20 dừng ở trận thua thứ 5 (`--max-losses=5`), Cóc Xanh 14/15; manina lên cấp 21 (EXP 14341). [Đo]

<a id="boss"></a>

### Bước boss: `c2s/1178` (Q10, Q13, B4)

**Kết luận: boss của map đánh bằng `c2s/1178 (string mobId; i32 0)`, không phải `c2s/15`.** Bot cũ kẹt vì gửi `c2s/15` như với quái thường. ([05-battle](05-battle.md#c2s-1178)) [Đo]

Đã loại trước khi tìm ra:
- `c2s/15` với boss, cờ 0 (Q10 năm lần, Q13 hai lần) và cờ 1 (thử từ Node): server im lặng. [Đo]
- Đứng ngay ô của boss: bot Node đi bộ bằng `c2s/1169` tới ô (2, 10) của `mob86100201` (khu 2), `s2c/1262` dội lại đúng từng vị trí, rồi gửi `c2s/15`: vẫn im lặng. [Đo]
- Phân tích tĩnh: chuỗi về boss trong `.so` ("Chưa có ai gây sát thương", "KILL_BOSS") không có chỗ tham chiếu đọc được. [Đo]

Cách tìm ra (B4): agent Frida thay `sqhz.a17` để đi xuyên quái thường (không vào trận), hook cả 169 hàm dựng gói `sqlq`, rồi mở app. Vị trí lưu trên server là ô boss mà bot Node vừa đi tới, nên vừa vào map nhân vật đã chạm boss: `sqhz.a18(boss, false)` → `sqhz.a17` → **`sqlq.b121(mobId, false)`** → `c2s/1178`. Quái thường đi `sqlq.a67(mobId, false)` → `c2s/15`. Sau `c2s/1178`, `s2c/22` đến sau 2,8 s và trận chạy như thường (theo lượt, quái đi trước). [Đo]

Trận boss (B4, Thủ Lĩnh Sơn Tặc cấp 11, manina cấp 17 với 2 món đồ đã hỏng):

| | Trận 1 | Trận 2 |
|---|---|---|
| HP boss lúc vào → lúc thua | 5000 → 4637 | 4637 → 4453 |
| Sát thương gây ra | 363 | 184 |
| `s2c/1201` (tiến độ bước) | 363 | (bước xong, có `s2c/34`) |

- **HP boss dùng chung giữa các trận**: trận 2 bắt đầu từ 4637. Boss là boss thế giới, có cùng tên ở mọi khu 0–9 (`s2c/45`). [Đo]
- Mỗi 3 kiếm gây 29, đòn kỹ năng của boss gây 65. Thua cả hai trận, nhưng **thua boss không bị trừ EXP**: `s2c/10` sau trận giữ nguyên EXP và không có `s2c/1256`. HP được hồi đầy sau trận. [Đo]
- Đủ 500 thì server gửi `s2c/34` với lời boss: "Các ngươi nghĩ giết ta là kết thúc sao? Ngoài kia còn nhiều thế lực lớn hơn rất nhiều". Báo cáo Thành Chủ (Q14, bot TS) nhận 1190 kinh nghiệm, 2130 Xu khoá. [Đo]
- Khi nhân vật còn đứng đè lên boss, app tự gửi lại `c2s/1178` ngay sau mỗi trận, nên trận 3 bắt đầu dù đã xong bước. Tắt app giữa trận không bị trừ EXP (như Q4); để app tự rời trận thì bị trừ. [Đo]
- Bot TS: bước "Gây N sát thương" gửi `c2s/1178`, đánh tiếp sau khi thua boss, và lấy tiến độ từ `s2c/1201`. Đã có test với gói thật. B6 (bot TS, symap cấp 79) đánh boss thật hai trận: `c2s/1178` từ xa vẫn được nhận, không cần đi tới boss; HP boss dùng chung với người chơi khác; hạ boss thì 13 s sau boss hiện lại đầy HP ([đánh boss](06-map-mobs.md#đánh-boss)).
<a id="đánh-bại-boss"></a>
- **Bước "Đánh bại <boss>" (B8, 02/11).** Nhiệm vụ 28 "Chặt Gãy Mũi Giáo" có bước "Đánh bại Tướng Thiết Kích". Đây là bước diệt quái (`npcId` −1, như "Đánh bại Kẻ Gây Rối"), nhưng con quái ấy là boss của M8 Bạch Nham (cấp 65, 80.000 HP, `mob101100007` ở khu 0).
  - App 0.9.0 coi mọi bước diệt quái là quái thường, nên với symap (Tiheo1) nó gửi `c2s/15` sáu lần. Lần nào server cũng im lặng, và nhật ký ghi "Server không mở trận với Tướng Thiết Kích sau 8 s". Gói tin nằm trong báo lỗi của app (`faults`, 05:36). [Đo]
  - Bot TS đã sửa (gửi `c2s/1178`), chạy với symap cấp 86: server mở trận ngay. symap thắng 6/6 trận, mỗi trận gây khoảng 81.000 sát thương trong 49–80 s, hạ boss. Mỗi trận được 0 EXP, 0 Xu. [Đo]
  - **Bước xong chỉ báo bằng `s2c/34`.** Hạ boss lần đầu, server gửi `s2c/34` ("subtask 1", nhiệm vụ 28, không có lời), không có `s2c/1201`. Năm lần hạ sau không có `s2c/34` nào. `s2c/34` này giống hệt gói đến lúc xong bước "Tiêu diệt Gà Trống Yêu Tinh" và bước Tỷ thí ngay trước. Vì vậy bước xong ở lần hạ đầu. [Đo; bước 5 có hiện ở `s2c/39` lần đăng nhập sau không thì chưa xem]
  - Bản cũ của bot TS chỉ coi `s2c/34` là lời đáp của bước nói chuyện. Nó không thấy bước đã xong nên đánh thêm 5 trận. Mất độ bền đồ, không mất gì khác. [Đo]
  - **Đã sửa ở bot TS và app Rust:**
    - Bước diệt quái thách đấu bằng `c2s/1178` khi con quái là boss của map: có trong `s2c/1177`, hoặc atlas ghi nó là boss của map này.
    - `s2c/34` của nhiệm vụ đang làm, ở bước diệt quái hay gây sát thương, đặt tiến độ thành đủ, nên bước sang bước sau đúng một lần, dù `s2c/1201` có đến hay không.

    Test chạy bằng ba gói thật ở `test/fixtures-b8.ts`.
- Thao tác bàn cờ trên app qua ADB: vuốt chậm 400 ms, sau khi lượt bắt đầu 3 s. Chạm hai lần hay vuốt nhanh thường bị bỏ qua. [Đo]

**Thử trước đó (B3, Q13).**
- Chạm vào bước "Gây 500 sát thương…" trên bảng nhiệm vụ **không gửi gói nào**. Bản đồ thế giới chỉ là danh sách thành, không đánh dấu boss. [Đo]
- Đi bộ vào một con quái thường gửi `c2s/15` với id của nó, đúng như bot ([B1](05-battle.md)). [Đo]

**Trận bị client tự bỏ (B3, mất 29 EXP).** Script ADB chạm ngay khi lượt vừa bắt đầu nên app bỏ qua (cách thao tác đúng ở mục trên), 12 lượt liền hết 30 s mà không đi. Đến giây thứ 432 của trận, giữa một lượt, client tự gửi `c2s/11 "M1"` rồi `c2s/40`. Server trả `s2c/1256` "Rời trận, mất 29 kinh nghiệm", khác với thua trận (mất 16). Bot Node không bị chuyện này vì gửi nước trực tiếp. Lý do client tự bỏ (giới hạn thời gian trận hay số lượt bỏ) [Chưa rõ].

## Chưa rõ

- Hạ boss ở cấp gần mình được gì (B6 hơn boss 68 cấp nên 0 EXP, 0 Xu).
- Cổng Hồng Giang (1016) mở từ nhiệm vụ nào. Ở S1 (nhiệm vụ 9) cổng từ chối; ở N5 (nhiệm vụ 14, bước 2) cổng cho vào.
- Phần cộng cố định của công thức EXP phụ thuộc gì. Hồi máu ngoài thua trận: dùng Hoàn Linh Dược trong trận bằng `c2s/44` ([12](12-skills-items.md#c2s-44)).
- Món nào ứng với từng ô của `s2c/36`; có giới hạn số trận mỗi ngày không. Gói sửa đồ đã biết (`c2s/48`); Búa sửa chữa mua ở Lái Buôn ([12](12-skills-items.md#c2s-1190)).
- Gói nhận và trả nhiệm vụ hằng ngày. Cẩm nang nói nhận ở Hương Lão Trần Bá (NPC 102), tối đa 3 lần một ngày ([12](12-skills-items.md#cẩm-nang-luật-liên-quan-tới-bot)). Nhiệm vụ Bảo Điển khi có mùa.

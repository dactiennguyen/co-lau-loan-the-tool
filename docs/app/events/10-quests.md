# Nhiệm vụ và bot làm nhiệm vụ bằng TypeScript

Mốc: APK 1.0.3, ngày 30/10/2026, nhân vật `manina`. Nguồn ([các phiên bắt gói](../investigation.md#nguồn-dữ-liệu)):
- **L1**: người chơi tự trả nhiệm vụ 3 và nhận nhiệm vụ 4 trên điện thoại.
- **Q1–Q12**: bot Node [src/quest.ts](../../../src/quest.ts) tự đăng nhập không cần điện thoại và làm nhiệm vụ. Q1 dừng sau 33 s vì gặp gói chưa biết; Q2 làm xong nhiệm vụ 4; Q3–Q9 nhiệm vụ 5, 6 và một phần nhiệm vụ 7; Q10 thử boss; Q11, Q12 đo tốc độ.

Bộ giải mã: [src/world.ts](../../../src/world.ts), [src/battle.ts](../../../src/battle.ts). Test: [test/quest.test.ts](../../../test/quest.test.ts). Nhãn **[Đo]**, **[Suy luận]**, **[Chưa rõ]** như các file khác.

## Trả lời nhanh

| Câu hỏi | Trả lời |
|---|---|
| Lấy danh sách nhiệm vụ thế nào? | Server chỉ gửi **nhiệm vụ chính đang làm** (`s2c/39`), lúc đăng nhập và mỗi khi nhận nhiệm vụ mới. Mở bảng Nhiệm vụ không gửi gói nào. Tab "Phụ", nhiệm vụ Bảo Điển và "Nhiệm vụ hằng ngày" hiện đều trống. [Đo] |
| Làm một bước nhiệm vụ bằng gói gì? | Nói chuyện / báo cáo: `c2s/13 (mapId, npcId)`. Diệt quái: đánh trận như [07-auto-battle](07-auto-battle.md), mỗi trận thắng tính 1 con. Server trả `s2c/34` (lời thoại, tiến độ) và `s2c/35` (hoàn thành, phần thưởng). [Đo] |
| Code TS mô phỏng làm nhiệm vụ chạy được chưa? | **Được.** Q2 làm xong nhiệm vụ 4; Q3–Q9 làm xong nhiệm vụ 5 và 6, tới bước boss của nhiệm vụ 7. Q3–Q12: 44 trận thắng, 3 trận thua (trước khi hiểu trận tính giờ). Nhân vật từ cấp 7 lên 16. [Đo] |
| Đánh quái nhanh nhất thế nào? | Trận tính giờ (Sơn Tặc), 0,5 s/nước, dùng Hỏa Cầu Thuật: ~15 s/trận, **~500 EXP/phút**, gấp ~3 lần đánh theo lượt. EXP = 2 × (2 × sao + giọt nước) + phần cộng theo quái; xu = 2 × vàng. Xem [Đánh nhanh hay ăn sao](#đánh-nhanh-hay-ăn-sao). [Đo] |
| Bot còn kẹt ở đâu? | Bước boss "Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc": server không nhận `c2s/15` với boss. Trang bị hỏng cần "búa sửa chữa". [Đo] |
| Còn event nào chưa ghi? | Đã ghi 90 gói theo cặp hướng/opcode ([danh sách](README.md#danh-sách-gói)). Bảng mã của app có 188 opcode, trong đó **122 opcode chưa từng thấy trên dây** ([opcode-map](../opcode-map.md#unseen)). [Đo] |

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
| "Gây N sát thương lên X" (nhiệm vụ 7) | | N (500) | -1 | Thách đấu boss X của `s2c/1177`, cộng dồn sát thương. Server chưa nhận ([bước boss](#bước-boss-chưa-làm-được-q10)) |
| "Nâng điểm tiềm năng", "Sử dụng điểm kỹ năng" | 0 | 1 | -1 | Bot gửi `c2s/10 (0, 1)` ([09](09-players-chat.md#gói-khác-thấy-trong-l1-người-chơi-tự-bấm-trên-máy)), chưa gặp bước này khi chạy thật; gói dùng điểm kỹ năng [Chưa rõ] |

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

Khi trả nhiệm vụ 4 (Q2), các gói đến trong 2 ms: `s2c/1187` (vật phẩm vào túi), `s2c/46` (Xu), `s2c/35`, `s2c/1200`, `s2c/34` (nhiệm vụ 5, lời thoại rỗng), `s2c/39` (nhiệm vụ 5).

### Chuỗi nhiệm vụ đã thấy

| Nhiệm vụ | NPC | Các bước | Phần thưởng (s2c/35) |
|---|---|---|---|
| 3 "Những Việc Đầu Tiên" | 102 Hương Lão Trần Bá | Đạt cấp 2 → nói chuyện với Hương Lão → nâng điểm tiềm năng → dùng điểm kỹ năng → diệt 1 Gà Điên → báo cáo | 127 kinh nghiệm, 660 Xu khoá, 1 Áo Hào Kiệt, 1 Nón Lá |
| 4 "Ruộng Dưa Bị Tàn Phá" | 103 Bà Tư Hạnh | Đạt cấp 4 → nói chuyện với Bà Tư Hạnh → diệt 10 Heo Mọi → báo cáo | 216 kinh nghiệm, 710 Xu khoá, 1 Nhẫn Trơn |
| 5 "Bóng Đen Trong Làng" | 111 Vệ Binh Lê Dũng | Đạt cấp 6 → nói chuyện với Vệ Binh → đánh bại 10 Kẻ Gây Rối → báo cáo | 314 kinh nghiệm, 770 Xu khoá (Q6) |
| 6 "Dấu Chân Hắc Nham" | 129 Thành Chủ Nguyễn Khang | Đạt cấp 8 → nói chuyện với Thành Chủ → đánh bại 10 Sơn Tặc (trận tính giờ) → báo cáo | 419 kinh nghiệm, 820 Xu khoá (Q9) |
| 7 "Quét Sạch Sơn Trại" | 129 Thành Chủ Nguyễn Khang | Đạt cấp 9 → bàn bạc với Thành Chủ → đánh bại 4 Chỉ Huy Sơn Tặc → **gây 500 sát thương lên Thủ Lĩnh Sơn Tặc** (boss của map, `s2c/1177`) → báo cáo | Kẹt ở bước boss (Q10) |

Mọi NPC của nhiệm vụ 3–7 đều ở M1 và `c2s/13` với mapId `"M1"` luôn được nhận. Bước "Bàn bạc với X" làm như "Nói chuyện với X". Bước "Gây N sát thương lên X" nhắm vào boss của map; boss đến qua `s2c/1177` ngay sau `s2c/43`, mã đổi theo khu (`mob86100001` ở khu 0, `mob86100101` ở khu 1).

Nội dung nhiệm vụ nằm ở server: `.so` không có tên hay lời thoại nhiệm vụ nào, chỉ có chữ của giao diện. [Đo]

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

- **HP vào trận luôn đầy.** HP trên bản đồ là HP cuối trận trước và không tự hồi theo thời gian: sau Q3 còn 60/160, đăng nhập lại sau vài phút vẫn 60/160 (`s2c/9`). Nhưng `s2c/22` của trận sau báo 160/160, và trận Q2 số 2 (vào với 98 HP trên bản đồ, không bị đánh trúng) kết thúc với 136/136. Vì vậy bot không cần chờ hồi máu; ngưỡng `--min-hp` mặc định 0. [Đo]
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
- **Bộ trọng số gần như không quan trọng**: `exp` và `kill` cho cùng 153 EXP/trận; `exp` nhỉnh hơn về xu (~39 so với 35/trận). Yếu tố quyết định là nhịp gửi nước: từ 1 s xuống 0,5 s/nước (cộng nghỉ 3 s → 1 s) thì EXP/phút tăng ~60%. Chưa thử nhanh hơn 0,5 s vì không rõ server có chặn hành vi bất thường không. [Đo]

**Cách đánh nhanh nhất đã đo được** (nhân vật cấp 11–16, trang bị đã hỏng 2 món):
1. Chọn quái mở **trận tính giờ** (`s2c/18` byte 4 = 1; ở M1 là Sơn Tặc), cấp càng cao hơn mình càng tốt nếu vẫn thắng. Theo lượt (Gà Điên, Heo Mọi, Kẻ Gây Rối, Chỉ Huy) chậm hơn nhiều vì mỗi lượt chờ nhịp 1 s của server.
2. Trong trận tính giờ, gửi nước liên tục (0,5 s/nước); quái chỉ đánh mỗi ~25–31 s nên trận 10–22 s xong trước đòn đầu.
3. Dùng Hỏa Cầu Thuật (`c2s/20`, 62 sát thương) mỗi khi nội lực ≥ 25; ăn Trái đào (mã 3) để có đòn gấp đôi.
4. Nghỉ ngắn giữa các trận (1 s đủ; server luôn trả `s2c/22` sau ~2,5 s).

### Bước boss: chưa làm được (Q10)

Bot gửi `c2s/15 "mob86100001"` (boss khu 0, lấy từ `s2c/1177`) năm lần, cách nhau 8 s. Server **không trả lời gì**: không `s2c/22`, không `s2c/0`, không thông báo. Quái thường thì `c2s/15` được nhận từ bất kỳ đâu. [Đo]

Hai khả năng, chưa kiểm:
- Boss cần đứng gần. Ba trường cuối của `s2c/1177` (`1, 135, 19`) có thể là trạng thái và toạ độ ô của boss. Bot đang đứng ở chỗ đăng nhập, và muốn tới gần thì phải mô phỏng đi bộ bằng `c2s/1169`. [Suy luận]
- Boss dùng gói thách đấu khác. Trong các hàm dựng gói `sqlq` có tham số chuỗi giống `a67` (`c2s/15`): `f71(String)` → 49, `p113(String)` → 58, `m109/o111/n110(String)` → 91/95/96 (96 là mở cửa sổ nâng cấp theo chuỗi debug). Không gửi thử vì opcode chưa rõ có thể làm việc khác (bán, vứt đồ). Chuỗi mẫu trong `.so` "ai đi boss … thiếu một người đỡ đòn" gợi ý boss đánh theo nhóm. [Suy luận]

Cách chắc chắn: bắt gói trên điện thoại khi người chơi tự đánh boss, giống U1.

## Chưa rõ

- Cách đánh boss (bước "Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc"); gói sửa trang bị (cần "búa sửa chữa" theo chuỗi `.so`).
- Phần cộng cố định của công thức EXP phụ thuộc gì; quy tắc hồi máu lúc vào trận.
- Món nào ứng với từng ô của `s2c/36`, gói sửa đồ, và có giới hạn số trận mỗi ngày không.
- Gói dùng điểm kỹ năng, nhiệm vụ phụ, nhiệm vụ hằng ngày, nhiệm vụ Bảo Điển khi có mùa.

# Nhiệm vụ, các bảng chức năng và bot làm nhiệm vụ bằng TypeScript

Mốc: APK 1.0.3, ngày 30/10/2026, nhân vật `manina`. Nguồn:
- **L1**: phiên đăng nhập của [08-server-map-zone](08-server-map-zone.md), trong đó người chơi tự trả nhiệm vụ 3 và nhận nhiệm vụ 4.
- **U1**: mở lần lượt các bảng chức năng trên điện thoại trong lúc bắt gói. Chỉ mở rồi đóng, không mua bán.
- **Q1, Q2**: bot Node [src/quest.ts](../../../src/quest.ts) tự đăng nhập không cần điện thoại và làm nhiệm vụ. Q1 dừng sau 33 s vì gặp gói chưa biết; Q2 làm xong nhiệm vụ 4.

Bộ giải mã: [src/world.ts](../../../src/world.ts). Test: [test/quest.test.ts](../../../test/quest.test.ts). Nhãn **[Đo]**, **[Suy luận]**, **[Chưa rõ]** như các file khác.

## Trả lời nhanh

| Câu hỏi | Trả lời |
|---|---|
| Lấy danh sách nhiệm vụ thế nào? | Server chỉ gửi **nhiệm vụ chính đang làm** (`s2c/39`), lúc đăng nhập và mỗi khi nhận nhiệm vụ mới. Mở bảng Nhiệm vụ không gửi gói nào. Tab "Phụ", nhiệm vụ Bảo Điển và "Nhiệm vụ hằng ngày" hiện đều trống. [Đo] |
| Làm một bước nhiệm vụ bằng gói gì? | Nói chuyện / báo cáo: `c2s/13 (mapId, npcId)`. Diệt quái: đánh trận như [07-auto-battle](07-auto-battle.md), mỗi trận thắng tính 1 con. Server trả `s2c/34` (lời thoại, tiến độ) và `s2c/35` (hoàn thành, phần thưởng). [Đo] |
| Code TS mô phỏng làm nhiệm vụ chạy được chưa? | **Được.** Q2 tự đăng nhập, thắng 10/10 trận Heo Mọi, báo cáo với Bà Tư Hạnh, nhận thưởng nhiệm vụ 4, nhận nhiệm vụ 5 và làm luôn bước nói chuyện đầu. Toàn bộ trong 272 s. [Đo] |
| Còn event nào chưa ghi? | Đã ghi 86 cặp hướng/opcode. Bảng mã của app có 188 opcode, trong đó **126 opcode chưa từng thấy trên dây** (danh sách cuối file). [Đo] |

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
| "Nâng điểm tiềm năng", "Sử dụng điểm kỹ năng" | 0 | 1 | -1 | Chưa làm. Cộng tiềm năng là `c2s/10` ([09](09-players-chat.md#gói-khác-thấy-trong-l1-người-chơi-tự-bấm-trên-máy)); gói dùng điểm kỹ năng [Chưa rõ] |

```text
00000004 0000001b "Ruộng Dưa Bị Tàn Phá" 000000a0 "Mùa màng là nguồn sống…" 00000004 "main"
00000001 00000000 00000004                                  bước 1, tiến độ 0, 4 bước
00000000 00000014 "Đạt cấp độ 4"            00000004 00000001 ffffffff
00000001 00000022 "Nói chuyện với Bà Tư Hạnh" 00000067 00000001 00000067
00000002 00000016 "Tiêu diệt Heo Mọi"       00000001 0000000a ffffffff
00000003 0000001e "Báo cáo với Bà Tư Hạnh"  00000067 00000001 00000067
```

`tiếnĐộ` bằng 0 ở mọi mẫu. Server **không gửi lại** `s2c/39` sau từng con quái hay sau lời thoại NPC, nên client phải tự đếm và tự tăng bước. Bot làm như vậy, và thấy khớp với server: sau trận thứ 10, `s2c/34` báo "Tiếp theo hãy quay về gặp Bà Tư Hạnh". [Đo]

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
| 5 "Bóng Đen Trong Làng" | 111 Vệ Binh Lê Dũng | Đạt cấp 6 → nói chuyện với Vệ Binh → đánh bại 10 Kẻ Gây Rối → báo cáo | Chưa làm tới |

Nội dung nhiệm vụ nằm ở server: `.so` không có tên hay lời thoại nhiệm vụ nào, chỉ có chữ của giao diện. [Đo]

## Bot làm nhiệm vụ bằng TypeScript

```bash
npm run quest -- --fights=12 --min-hp=0.4
```

- Cần `CLLT_USERNAME` và `CLLT_PASSWORD` trong `.env`. Tài khoản **không được online ở máy khác**: khi đó server trả `s2c/0` và từ chối đăng nhập. Đặt `CLLT_TRACE=<file>` để ghi mọi gói ra JSONL.
- Bot đánh trận thật với server, nên EXP, tiền, vật phẩm và tiến độ nhiệm vụ đều được ghi vào tài khoản.
- Luồng: `runClient` (đăng nhập, vào thế giới) giữ kết nối và chuyển mọi gói cho `QuestBot` ([src/client.ts](../../../src/client.ts), tuỳ chọn `session`). Bot đọc bước hiện tại rồi:
  - bước nói chuyện: gửi `c2s/13`;
  - bước diệt quái: gửi `c2s/15` lần lượt từng con cùng tên trong `s2c/43`, rồi đánh theo luồng không giao diện (`18`, `14`, `19`), chọn nước bằng [src/battle.ts](../../../src/battle.ts);
  - tự dừng khi thua một trận, khi HP dưới `--min-hp`, khi đủ `--fights`, hoặc gặp bước chưa biết làm.

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
- Sau mỗi trận thắng, server gửi `s2c/10`, `s2c/36` (20 byte) và `s2c/1214`. Trong `s2c/36`, byte thứ 9 giảm 39 → 34 và `i32` ở offset 11 giảm 50, 45, 40, 36, 33, 28, 24, 20, 17, 12 qua 10 trận. Có thể là thể lực hoặc giới hạn số trận được thưởng. [Chưa rõ]

### Hai điều Q1 phát hiện

- **Bàn bị xếp lại.** Sau một nước, khi bàn hết nước đi, server gửi bàn mới ngay trong `s2c/19`. Phần sau danh sách viên rơi, trước đây ghi là `i32 zero2`, thực ra là `u8 xếpLại; [i32 64; u8[64] bànMới nếu xếpLại = 1]; 3 byte`. 52 bước cũ đều có `xếpLại = 0` nên không thấy khác biệt. Q2 gặp 2 lần xếp lại và bot vẫn đúng bàn. [Đo]
- Một lỗi giải mã trong bot từng làm client đóng kết nối. Giờ `QuestBot.onPacket` bắt lỗi và ghi đủ hex (`parse_error`).

## Các bảng chức năng (U1)

Mở từ menu "Chức năng" và các biểu tượng góc phải. Bảng nào chỉ dùng dữ liệu đã nhận lúc đăng nhập thì không gửi gói.

| Bảng | Gói | Nội dung |
|---|---|---|
| Nhiệm vụ (tab Chính, Phụ) | không | Chính: dữ liệu `s2c/39`. Phụ: "Chưa có thông tin nhiệm vụ." |
| Bản thân (trang bị, chỉ số, kỹ năng) | không | Túi 4 món; 0 Xu, 2.060 Xu khoá, 0 Lượng |
| Hòm thư | `c2s/1215` (rỗng) → `s2c/1215` `i32 0` | Không có thư |
| Bạn bè | `c2s/1196` (rỗng) → `s2c/1196` `i32 0` | Chưa có bạn |
| Bảng xếp hạng | `c2s/1254 00` → `s2c/1254` tab, rồi danh sách; đổi tab: `c2s/1254 01 01` | Xem dưới |
| Bảo Điển (tab Bảo Điển, Nhiệm vụ) | `c2s/1240` → `s2c/1240` `00`; `c2s/1241` → `s2c/1241` `00` | "Hiện chưa có mùa Bảo Điển nào" |
| Sứ quân | `c2s/1265 00` → 16 byte 0 (chưa vào sứ quân); `c2s/1265 01 000000000000` → danh sách | Thiên Tôn 11/20, WATER7 20/20, CỜ LAU 16/20, ALIBABA 3/20 |
| Tin nhắn (Thế giới, Sứ quân) | không | Lịch sử là các tin `s2c/1205` từ lúc đăng nhập; ô nhập "Nhập để chat (5 lượng)" |
| Cẩm nang | không | Luật trận đấu, xem [05-battle](05-battle.md#bàn-chơi) |
| Cộng đồng | không | Link Fanpage, nhóm Facebook, Zalo từ `s2c/1271` |
| Tích lũy, Chợ trời, Sự kiện, Lôi đài, Nạp đầu, Tài khoản | chưa kiểm | Game tắt giữa lượt U1 (dưới); Lôi đài, Nạp đầu, Tài khoản cố ý bỏ qua |

Gói `s2c/1265` lúc đăng nhập (30 byte, byte đầu `0x64` = 100) trước đây ghi là "config_1265". Nó cùng opcode với gói sứ quân, byte đầu là lệnh con. Chữ `"WATER7"` trong bản ghi người chơi ([09](09-players-chat.md#player-record)) là **tên sứ quân**. [Đo]

<a id="s2c-1254"></a>

### s2c/1254: bảng xếp hạng

```text
kiểu 0: 00 02 {00 "Cao thủ" "Cấp độ"} {01 "Sứ quân" "Cấp"} 00
kiểu 1: 01 00 00000064 {00000001 00000014 "thuytoc" 00000000 00000076} … ×100
        00000446 00000000 00000004                          hạng của mình 1094, cấp 4
        01 01 00000004 {00000001 000000a5 "Thiên Tôn" 0 1} … ffffffff 00000000 00000000   (chưa có sứ quân)
```

`u8 kiểu; kiểu 0: u8 n; n × {u8 tab; string tên; string cột}; u8. Kiểu 1: u8 tab; i32 n; n × {i32 hạng; i32 id; string tên; i32 0; i32 cấp}; i32 hạngCủaMình; i32 0; i32 cấpCủaMình`. Đọc hết byte cả 3 mẫu. Hạng 1094 nghĩa là server có ít nhất 1094 nhân vật. [Đo]

### Game tắt giữa U1

Lượt bắt U1 hết hạn 20 phút và script Frida tự gỡ ra lúc 06:48:08. Khoảng 5 s sau, cửa sổ game đóng và tiến trình biến mất. Logcat không có crash hay tombstone, nên nguyên nhân [Chưa rõ]. Hai lần gỡ script trước đó game vẫn chạy bình thường.

<a id="unseen"></a>

## Opcode chưa thấy trên dây

Bảng mã của app ([opcode-map](../opcode-map.md)) có 188 opcode. Gộp mọi capture (L1, W1, U1, A1, B2, run1–4, Q1, Q2), 126 opcode chưa từng xuất hiện ở cả hai chiều:

```text
6 7 8 16 17 21 23 25 27 31 32 33 37 41 44 47 48 49 51 52 55 56 57 58 59
83 84 86 90 91 92 93 95 96 97 98 99 100 101 112 113 115 116 125 126 128 129 130 131 132 133
1111 1112 1168 1171 1174 1175 1176 1178 1179 1180 1181 1185 1186 1188 1189 1190 1191 1192 1193 1194
1197 1198 1199 1201 1202 1203 1204 1208 1210 1211 1213 1216 1217 1218 1219 1221 1222 1223 1224 1225
1226 1227 1228 1229 1230 1231 1232 1233 1234 1235 1236 1237 1238 1239 1242 1243 1244 1245 1246 1247
1248 1249 1250 1251 1252 1255 1256 1257 1258 1260 1266 1267 1268 1270
```

- `s2c/0` cũng không có trong capture Frida. Nó chỉ thấy khi client Node đăng nhập trong lúc tài khoản đang online, xem [02-login](02-login.md#s2c-0).
- Chỉ một opcode có gợi ý nghĩa trong `.so`: chuỗi debug "F6: xin mở cửa sổ nâng cấp (gói 96)", tức 96 là xin mở cửa sổ nâng cấp trang bị. [Suy luận]
- Các tính năng có trong game nhưng chưa bắt được gói, nhiều khả năng nằm trong dải trên: gửi chat, chat riêng, giao dịch, kết bạn, thách đấu người chơi, Lôi đài, Chợ trời, nâng cấp trang bị, dùng vật phẩm và kỹ năng trong trận, thú cưng. [Suy luận từ giao diện và chuỗi .so]
- Muốn gán nghĩa thì làm như U1: bật capture rồi dùng tính năng đó trên máy. Agent ghi mọi opcode mới kèm payload.

## Chưa rõ

- `tiếnĐộ` của `s2c/39` có khi nào khác 0; có gói nào báo số quái đã diệt không.
- Ý nghĩa các trường giảm dần trong `s2c/36`, và có giới hạn số trận mỗi ngày không.
- Gói dùng điểm kỹ năng, nhiệm vụ phụ, nhiệm vụ hằng ngày, nhiệm vụ Bảo Điển khi có mùa.
- Từng trường của danh sách sứ quân trong `s2c/1265`.
- Nguyên nhân game tắt sau khi gỡ script Frida.

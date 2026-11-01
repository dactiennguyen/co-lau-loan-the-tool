# Di chuyển, người chơi khác, chat và vật phẩm rơi

Mốc, nguồn **L1/W1/A1/B2** và nhãn như [08-server-map-zone](08-server-map-zone.md). Bộ giải mã: [src/protocol/world.ts](../../../src/protocol/world.ts). Test với mẫu thật: [test/world.test.ts](../../../test/world.test.ts).

Mọi bố cục dưới đây đã được kiểm bằng cách đọc hết byte của mọi payload đã bắt:

| Gói | Số payload |
|---|---:|
| `c2s/1169` | 712 |
| `s2c/1262` | 14.470 |
| `s2c/1167` | 79 |
| `s2c/1263` | 2 |
| `s2c/1170` | 140 |
| `s2c/1166` | 94 |
| `s2c/1253` | 588 |
| `s2c/1212` | 27 |
| `s2c/1182` | 142 |
| `s2c/1183` | 139 |
| `s2c/1184` | 5 |
| `s2c/1205` | 3 |

Không payload nào thiếu hoặc thừa byte.

## Trả lời nhanh

| Câu hỏi | Trả lời |
|---|---|
| Mình di chuyển gửi gì? | `c2s/1169` (x, y, trạng thái, 5 cờ), khoảng 113 ms một gói khi đang chạy/nhảy/rơi; đứng yên thì không gửi. [Đo] |
| Người khác di chuyển nhận gì? | `s2c/1262` mỗi 100 ms, chỉ gồm những người vừa đổi vị trí. Bản ghi của chính mình cũng có trong đó. [Đo] |
| Có ai vào/ra khu? | Vào: `s2c/1167` (đủ thông tin nhân vật). Ra: `s2c/1170` (id). Lúc vào khu nhận cả danh sách: `s2c/1263`. [Đo] |
| Người khác đổi đồ, mất máu, lên cấp? | `s2c/1166` (trang bị), `s2c/1253` (cấp, HP), `s2c/1212` (hiệu ứng). [Đo] |
| Chat? | Nhận chat Thế giới: `s2c/1205` (id, tên, nội dung). Gói **gửi** chat chưa bắt, vì gửi là đăng công khai và chat Thế giới tốn 5 lượng. |
| Vật phẩm rơi? | `s2c/1182` (thêm), `s2c/1183` (xoá), `s2c/1184` (danh sách lúc vào map). [Đo bố cục; vai trò là Suy luận mạnh] |

<a id="own-move"></a>

## Di chuyển của mình: c2s/1169

Bổ sung cho [05-battle](05-battle.md#c2s-1169). Đo bằng cách vuốt joystick qua adb trong lúc bắt gói (W1).

| Thuộc tính | Điều tra được |
|---|---|
| Bố cục | `i32 x; i32 y; i32 trạngThái; u8 cờ[5]`, 17 byte |
| Nhịp | Trung vị 113 ms (p10 77, p90 141) giữa hai gói [Đo] |
| Tốc độ chạy | 12 đơn vị mỗi gói, khoảng 101 đơn vị/s. Nhảy lên cao khoảng 54 đơn vị (y 661 → 607) [Đo] |
| Toạ độ | Đơn vị server; client vẽ ×1,5. y tăng là đi xuống. Xem [06-map-mobs](06-map-mobs.md#toạ-độ-và-di-chuyển) |
| Server có kiểm không | Server phát lại đúng x/y trong `1262` sau trung vị 71 ms (p90 115 ms). Không kiểm quãng đường: một gói nhảy thẳng từ (698, 512) tới (1984, 96) vẫn được nhận và phát lại (B6, [đánh boss](06-map-mobs.md#đánh-boss)). Toạ độ ngoài map hay giữa khối đá thì [Chưa rõ] |

| Trạng thái | Nghĩa | Căn cứ |
|---:|---|---|
| 0 | Đứng / vừa dừng | Gói cuối mỗi lần thả joystick [Đo] |
| 1 | Chạy | Vuốt ngang, x đổi 12 mỗi gói, y không đổi [Đo] |
| 5 | Bay lên khi nhảy | y giảm dần [Đo] |
| 6 | Rơi | y tăng dần, sau đỉnh nhảy hoặc khi chạy ra khỏi mép [Đo] |
| 7 | Chạm đất | Một gói ngay trước `0` khi rơi từ trên cao xuống; không phải lần nào cũng có [Đo] |
| 2, 3, 4, 8 | Chỉ thấy ở người khác trong `1262` | Có thể là leo thang hoặc đánh [Chưa rõ] |

| Cờ | Thấy | Nghĩa |
|---|---|---|
| `cờ[2]` | `1` khi vuốt trái, giữ nguyên lúc đứng sau khi chạy trái | Hướng trái [Đo] |
| `cờ[3]` | `1` khi vuốt phải | Hướng phải [Đo] |
| `cờ[0]` | `1` ở pha rơi của cú nhảy và khi nhảy chéo | [Chưa rõ] |
| `cờ[1]`, `cờ[4]` | Luôn 0 ở mình. Bit tương ứng của `cờ[1]` có xuất hiện ở người khác trong `1262` | [Chưa rõ] |

Ví dụ vuốt joystick sang phải 2,5 s (W1, thời gian tính từ lúc bắt đầu vuốt). Cú chạm đầu làm nhân vật nhảy trước, rồi mới chạy:

```text
 +414 ms  000004af 00000295 00000005 00 00 00 01 00   x=1199 y=661 bay lên, hướng phải
 +770 ms  000004d3 0000025f 00000005 00 00 00 01 00   x=1235 y=607 đỉnh nhảy
 +888 ms  000004db 00000261 00000006 00 00 00 01 00   x=1243 y=609 rơi
+1207 ms  000004e7 00000280 00000000 00 00 00 01 00   x=1255 y=640 chạm đất
+1208 ms  000004f3 00000280 00000001 00 00 00 01 00   x=1267 chạy
+1304 ms  000004fb 00000280 00000001 00 00 00 01 00   x=1275
  …       mỗi gói +12 (đôi khi +8)
+2528 ms  00000577 00000280 00000001 00 00 00 01 00   x=1399
+2600 ms  0000057b 00000280 00000000 00 00 00 01 00   x=1403 dừng (thả joystick)
```

<a id="s2c-1262"></a>

## Vị trí người chơi: s2c/1262

| Thuộc tính | Điều tra được |
|---|---|
| Xuất hiện khi | Mỗi 100 ms, nếu có ít nhất một người trong khu đổi vị trí hoặc trạng thái |
| Bố cục | `u16 tickMs=100; u16 n; n × {i32 id; i32 x; i32 y; u8 trạngThái; u8 cờ; u16 field14}` |
| Số bản ghi | 1–8 mỗi gói (L1: 1 bản ghi 1955 lần, 2 bản ghi 1801 lần, 3: 1109, 4: 470, 5: 143, 6: 39, 7: 9, 8: 2), dù khu có 19 người. Người đứng yên không được gửi lại. [Đo] |
| Bản ghi của mình | id 155 (`numericId` của `manina` trong `s2c/9`). x/y trùng một gói `1169` đã gửi ở cả 112/112 bản ghi; trạng thái và cờ cũng trùng, trừ vài lần nhiều gói có cùng x/y (lúc đứng, lúc chạm đất). [Đo] |
| `cờ` | Bitmask của `c2s/1169`: `cờ[0] | cờ[1]<<1 | cờ[2]<<2 | cờ[3]<<3`. Mình chạy phải thì `8`, trái thì `4`, nhảy phải thì `9`. [Đo cho bit 0, 2, 3] |
| `field14` | 0–318, giảm dần 10–20 mỗi gói rồi quay vòng quanh 100. [Chưa rõ] |

```text
0064 0004                                          tick 100 ms, 4 bản ghi
00000504 00000694 00000260 06 04 0062              id 1284  x=1684 y=608  rơi, trái
00000539 00000672 000002a0 00 04 0061              id 1337  x=1650 y=672  đứng, trái
00000539 00000672 000002a0 00 04 0061              (lặp lại nguyên bản ghi)
0000009b 000004af 00000295 05 08 0028              id 155 (mình) x=1199 y=661 bay lên, phải
                                                   ← c2s/1169: 000004af 00000295 00000005 00 00 00 01 00
```

Một gói có thể chứa cùng một bản ghi hai lần (id 1337 ở trên). [Đo]

## Người chơi khác vào, ra, đổi trạng thái

<a id="s2c-1263"></a>

### s2c/1263: danh sách lúc vào khu

| Thuộc tính | Điều tra được |
|---|---|
| Xuất hiện khi | Ngay sau `s2c/43` khi vào map, đổi khu, hoặc sau trận |
| Bố cục | `u16 n; n × {bản ghi người chơi; trạng thái như s2c/1212}` |
| Độ chắc chắn | L1: 4904 byte, 18 người, đọc hết. Mẫu cũ trong `test/fixtures.ts`: 19 người, cũng đọc hết. [Đo] |

Một vài người trong L1:

| Tên | id | Cấp | x, y | Hiệu ứng |
|---|---:|---:|---|---|
| Xuonq | 1286 | 11 | 1760, 672 | |
| Kappa | 896 | 17 | 1605, 672 | 9301 |
| boy2Nghin | 1332 | 21 | 566, 416 | 9302 |
| … 15 người nữa | | | | |

<a id="player-record"></a>

### Bản ghi người chơi (s2c/1167 và từng mục của 1263)

Ví dụ `s2c/1167` của boy2Nghin, 300 byte:

| Offset | Byte | Trường | Giá trị |
|---:|---|---|---|
| 0 | `04` | `u8 loại` | 4. Thấy 1, 2, 4; luôn bằng `cờ1` [Chưa rõ, có thể là hệ phái] |
| 1 | `00000009 626f79…` | `string tên` | `boy2Nghin` |
| 14 | `00000534` | `i32 id` | 1332, cùng id trong `1262`/`1170`/`1166`/`1253`/`1212` |
| 18 | `00000009 626f79…` | `string tênHiểnThị` | `boy2Nghin` |
| 31 | `04 00` | `u8 cờ1; u8 cờ2` | 4, 0. Cùng chỗ với `flag1, flag2` của `s2c/9` |
| 33 | `00000015` | `i32 cấp` | 21 |
| 37 | `000000a5 000001e2` | `i32 hp; i32 hpMax` | 165/482 |
| 45 | `00000000 00000064` | `i32 s1; i32 s1Max` | 0/100. Giống cặp `0, 100` trong s2c/22 [Chưa rõ, có thể là nội lực] |
| 53 | `0000` | `u16` | 0; thấy 256 ở 2 mẫu [Chưa rõ] |
| 55 | `00000236 000001a0` | `i32 x; i32 y` | 566, 416 |
| 63 | `000163dc 00011684 00013880 ffffffff 00000000 00000000` | `i32 trangBị[6]` | 91100, 71300, 80000, -1, 0, 0. Cùng 6 số với `s2c/1166` |
| 87 | … 203 byte | khối ngoại hình | 3 `i32`; hai lớp bảng màu ARGB `{slot; i32 độDài; byte}`; `i32` mã (60300); `u8`; 2 nhóm 5 `i32`; `i32 99000`; `u8 m; m × {i32 slot; i32 độDài; byte}`. Đọc được ranh giới, chưa đặt tên [Đo cấu trúc] |
| 290 | `00000000 00000000 00 00` | `i32; string sứQuân; u8; u8` | 0, "", 0, 0 khi chưa vào sứ quân. Hai người có `4, "WATER7"`: WATER7 là một sứ quân trong bảng Sứ quân ([10](11-panels.md)) [Đo] |

<a id="s2c-1167"></a>

### s2c/1167 và s2c/1170: vào và ra

| Gói | Bố cục | Khi nào |
|---|---|---|
| `s2c/1167` | Một bản ghi người chơi như trên | Người chơi vào khu, hoặc xuất hiện lại [Đo] |
| `s2c/1170` | `i32 id` | Người chơi rời khu [Đo] |

- `1170` rồi `1167` cùng id trong vòng 50 ms là **làm mới** người chơi đó: L1 20 lần, W1 8 lần, A1 14 lần, B2 2 lần. Toạ độ trong `1167` khi thì `y = 32` (mép trên bản đồ, rơi xuống), khi thì đúng chỗ đang đứng (`y` 288…672). Nguyên nhân có thể là vừa xong trận, dịch chuyển, hoặc đổi ngoại hình. [Đo cặp gói; nguyên nhân là Suy luận]
- `1170` đứng một mình: người đó đổi khu, thoát game, hoặc vào trận. Ở cả 4 capture, sau `1170` id đó không còn xuất hiện trong `1262` cho tới khi có `1167` mới. [Đo]

```text
1170: 00000534                       id 1332 rời khu
1167: 04 00000009 "boy2Nghin" 00000534 …      vào lại cùng mili giây
```

<a id="đếm-người-xung-quanh"></a>

### Đếm người xung quanh

Không có gói nào trả thẳng "số người trong khu". Muốn đếm thì giữ một danh sách theo id:

| Gói | Việc với danh sách |
|---|---|
| `s2c/1263` | Thay cả danh sách. Gói này đến sau `c2s/43` khi vào map hoặc đổi khu, và sau mỗi trận |
| `s2c/1167` | Thêm hoặc làm mới một người |
| `s2c/1170` | Xoá một người. Nếu cặp `1170` + `1167` cùng id đến sát nhau thì người đó vẫn còn trong danh sách |
| `s2c/1253` | Cập nhật cấp, HP của một người có trong danh sách |

- **Nhân vật của mình không có trong `1263`.** L1 có 18 người, cộng mình là 19, khớp "Dân số 19/20" của khu 0 trong `s2c/1172`. Lần đăng nhập ngày 30/10/2026 (M2, khu 0) có 8 người, id 155 của manina không có trong đó. [Đo]
- `1262` (vị trí) chỉ gửi người vừa di chuyển, nên không dùng để đếm được. [Đo]

TypeScript: `ZonePlayers` trong [src/protocol/world.ts](../../../src/protocol/world.ts). Bot nhiệm vụ ghi sự kiện `players` mỗi khi nhận `1263`. App Rust hiện số người và danh sách tên kèm cấp ([integration/rust](../../integration/rust/README.md)).

<a id="s2c-1166"></a>

### s2c/1166: trang bị và s2c/1253: cấp/HP

| Gói | Bố cục | Căn cứ |
|---|---|---|
| `s2c/1166` | `i32 id; i32 trangBị[6]` (28 byte) | 6 số trùng `trangBị` của bản ghi người chơi [Đo] |
| `s2c/1253` | `i32 id; i32 cấp; i32 hp; i32 hpMax; u8` (17 byte) | Xem chuỗi dưới [Đo] |

boy2Nghin tháo đồ từng món một. Mỗi lần server gửi `1166` rồi `1253` cách 2–3 ms:

```text
1166  00000534 000163dc 00011684 00000000 ffffffff 0…   91100, 71300, 0, -1   → 1253 cấp 21, hp 165/482
1166  … 000163dc 00011684 00000000 00000000 …          91100, 71300, 0, 0    → 1253 165/482
1166  … 000163dc 00000000 00000000 00000000 …          91100, 0, 0, 0        → 1253 165/300
1166  … 00000000 00000000 00000000 00000000 …          tháo hết              → 1253 150/150
```

Người chơi NhinCaiGi lên cấp: `1253` đổi từ `(cấp 11, 216/216)` thành `(12, 209/221)`. [Đo]

<a id="s2c-1212"></a>

### s2c/1212: hiệu ứng

| Thuộc tính | Điều tra được |
|---|---|
| Xuất hiện khi | Thường ngay sau `1167` của một người, và nối vào cuối mỗi mục của `1263` |
| Bố cục | `i32 id; u8 kiểu`. Kiểu 2: `u8 n; n × {u8; i32 hiệuỨng; u8}; u8`. Kiểu khác (0): `{u8; i32 hiệuỨng; u8}` |
| Giá trị | `hiệuỨng` chỉ thấy 9300, 9301, 9302 [Chưa rõ, có thể là danh hiệu hoặc hào quang] |

```text
00000534 02 01 {01 00002456 01} 00     13 byte: id 1332, 1 mục, hiệu ứng 9302
000001ca 00 {01 00002455 01}           11 byte: id 458, hiệu ứng 9301
00000506 02 00 00                      7 byte trong 1263: không có hiệu ứng
```

<a id="chat"></a>

## Chat

### s2c/1205: chat Thế giới

| Thuộc tính | Điều tra được |
|---|---|
| Bố cục | `i32 idNgườiGửi; string tên; string nộiDung` |
| Tần suất | 3 tin trong 36 phút của A1 (2 tin) và B2 (1 tin); không có tin nào trong 20 phút của W1 và L1 |
| Kiểm duyệt | Server che từ cấm bằng `*` trước khi gửi: `"Nhận******************"` [Đo] |

```text
00000469 00000007 "NongDan"   00000029 "Thủ lĩnh sơn tặc ở đâu vậy mn"
000000c2 00000009 "Wolverine" 00000018 "Nhận******************"
000000d4 00000005 "Luffy"     00000001 "S"
```

### Giao diện chat (chuỗi trong .so)

| Loại | Chuỗi |
|---|---|
| Nút bong bóng góc phải | Mở hộp "Chat" (một ô nhập, OK / Đóng). Mở và đóng hộp **không gửi gói** nào. [Đo] |
| Thế giới | "Thế giới", "Nhập để chat (5 lượng)", "Chọn để ẩn/hiện chat thế giới". Mỗi tin tốn 5 lượng. |
| Riêng | "Tin nhắn riêng @", "Chat với ", "Tin nhắn", "Chưa có tin nhắn nào." |
| Khác | "Chat nhanh", " để chat ở Sảnh", "Nhập để chat sứ quân", "player_chat" |
| Giới hạn | "Bạn chat quá nhanh", "Chưa nhập nội dung chat." |

**Gửi chat chưa được bắt.** Bấm OK sẽ đăng tin công khai cho người chơi khác, chat Thế giới còn trừ 5 lượng, nên tôi không tự gửi. Muốn có gói gửi: chạy capture rồi tự gửi một tin. Agent sẽ ghi gói `c2s` mới, có chứa nội dung tin.

<a id="ground-items"></a>

## Vật phẩm rơi trên đất

| Gói | Bố cục |
|---|---|
| `s2c/1182` | `string mapId; bản ghi vật phẩm` |
| `s2c/1183` | `string mapId; string uuid` (46 byte) |
| `s2c/1184` | `string mapId; i32 n; n × bản ghi vật phẩm` (lúc vào map) |

Bản ghi vật phẩm:

```text
u8 0xfe; i32 mãĐồ; string uuid; i32 0; i32 độBền; i32 sốLượng;
u8 0; u8 hệ; i32 0; u8 0; u8; u8 n; n × {i32 chỉSố; i32 giáTrị};
i32 x; i32 y; i64 hếtHạn (ms, epoch)
```

```text
88 byte, mã 41:   … fe 00000029 00000024 "f573bf90-…" 00000000 ffffffff 0000007b 00 ff 00000000 00 00 00
                  0000056f 00000280 000001a189f49227          số lượng 123, x=1391 y=640
104 byte, mã 312: … fe 00000138 00000024 "fdcdeddb-…" 00000000 0000003c 00000001 00 02 00000000 00 01 02
                  00000005 00000006 00000001 0000000a 000005af 00000280 000001a189f49227
                                                              độ bền 60, hệ 2, chỉ số (5:6) (1:10), x=1455
```

Vì sao là vật phẩm rơi:
- `hếtHạn` luôn bằng lúc nhận cộng khoảng 600 s (110/110 lần, lệch dưới 1 s). [Đo]
- Mã `41` luôn có số lượng 122–146; mã `411`, `412`, `413` số lượng 1; các mã 104 byte (48…318) có `độBền 60` và 2 chỉ số giống trang bị. [Đo]
- Rơi theo nhóm cùng lúc, cách nhau đúng 32 đơn vị, ví dụ mã 41 + 412 + 312 ở x = 1391, 1423, 1455. [Đo]
- Thường bị xoá bằng `1183` sau 7–20 s; vài cái nằm tới 212 s. [Đo]
- `.so` có chuỗi "Nhặt". Bản ghi cùng khuôn với vật phẩm trong túi ở `s2c/1187`. [Đo]
- Byte `hệ`: 1 Hỏa, 2 Lôi, 4 Thủy, 0xff ở vật phẩm thường ([12](12-skills-items.md#bản-ghi-vật-phẩm)). [Đo 1, 2]
- Tên theo bảng vật phẩm của game ([13-drops-items](13-drops-items.md#bảng-vật-phẩm)): mã `41` là Xu khóa, `411`–`413` là Đá cấp 1–3, các mã 104 byte là trang bị cấp 1. [Đo]

## Gói khác thấy trong L1 (người chơi tự bấm trên máy)

Trong L1, ai đó dùng chính điện thoại để trả nhiệm vụ, nhận nhiệm vụ mới và cộng điểm tiềm năng. Gói bắt được như sau. Mỗi loại mới thấy 1–10 lần, nên chỉ ghi bố cục đọc được.

| Gói | Payload mẫu | Đọc được |
|---|---|---|
| `c2s/13` | `00000002 4d31 00000066` | `string mapId; i32 npcId`. Nói chuyện với NPC 102 rồi 103 trên `M1` (trả và nhận nhiệm vụ). Bot Node đã dùng gói này, xem [10-quests](10-quests.md#c2s-13) [Đo] |
| `s2c/35` | `00000003 "Những Việc Đầu Tiên" 00000004 "127 kinh nghiệm" "660 Xu khóa" "1 Áo Hào Kiệt" "1 Nón Lá" …` | Hoàn thành nhiệm vụ: tên và danh sách phần thưởng [Đo chuỗi] |
| `s2c/1187` | `01 0000002a 00000003 … uuid … 00000003 00 ff …` | Cả túi đồ sau khi nhận thưởng: sức chứa 42, 3 món (lúc ghi L1 từng đọc nhầm `0000002a` là "mã 42"). Bố cục đầy đủ ở [12-skills-items](12-skills-items.md#túi-đồ) [Đo E2] |
| `s2c/39`, `s2c/34`, `s2c/1200`, `s2c/46` | | Nhiệm vụ mới "Ruộng Dưa Bị Tàn Phá", tiến độ, cập nhật Xu (như [04-push](04-push.md#s2c-39), [07](07-auto-battle.md#các-gói-mới-thấy-trong-bot)) |
| `c2s/10` | `00000000 00000001` | Cộng 1 điểm tiềm năng vào chỉ số 0, bấm 10 lần [Suy luận] |
| `s2c/10` kiểu 2 | `00000002 "manina" 00000004 00000016 0000000a 0000000a 0000000d 0…` | Cấp 4 và các chỉ số; chỉ số đầu tăng 22 → 32 sau 10 lần cộng [Đo] |
| `s2c/10` kiểu 8 | `00000008 "manina" 0000000a 00000002 00000000 00000004 "1137" "125"` | Điểm tiềm năng còn lại: 10 → 0 [Đo]. `00000002` (cấp − 2) là điểm kỹ năng, cũng có trong đuôi `s2c/9` ([user-data](../user-data.md#đuôi-s2c9)) [Suy luận] |

`s2c/10` mở đầu bằng `i32 kiểu`. Kiểu 4 là HP/EXP/tiền, đã ghi ở [05-battle](05-battle.md#c2s-40). Lên cấp 4 thì server gửi cả 3 kiểu. [Đo]

## Chưa rõ

- Server có kiểm tốc độ hoặc toạ độ của `c2s/1169` không.
- `field14` của `1262`; trạng thái 2, 3, 4, 8; `cờ[0]`, `cờ[1]`, `cờ[4]`.
- Ý nghĩa của khối ngoại hình, `loại`, hiệu ứng 9300–9302, `i32` trước tên sứ quân.
- Gói gửi chat Thế giới và chat riêng.
- Ai được nhặt và trong bao lâu. Gói nhặt `c2s/1188 (uuid)` đã bắt trên máy (P3), nhưng chưa thử với món người khác làm rơi ([13-drops-items](13-drops-items.md#p3)).

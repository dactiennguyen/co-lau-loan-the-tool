# Bản đồ, khu vực và quái: liệt kê, di chuyển, va chạm

Mốc: APK 1.0.3, bản đồ M1 "Làng Thanh Khê". Nguồn:
- Phiên **B1** (spawn, khu 0).
- Phiên **B2** (29/10/2026, attach vào cùng tiến trình, khu 20): hook packet như [05-battle](05-battle.md), cộng hook tại các hàm dựng gói trong `com.mh.sqlq`, và đọc object quái trong bộ nhớ bằng reflection qua JNI.
- Phiên **S1** (30/10/2026, bot Node, không cần điện thoại): thử xin dữ liệu map khác, thử từng cổng, rồi quét mọi map vào được bằng `npm run scan` ([Bản đồ đã quét](#atlas)).

Nhãn: **[Đo]**, **[Suy luận]**, **[Chưa rõ]** như các file khác.

## Tóm tắt

| Câu hỏi | Trả lời |
|---|---|
| Map có những quái nào? | `c2s/43 (mapId)` → `s2c/43`: danh sách đủ `mobId`, tên, cấp của **khu hiện tại**. M1 có 5 loại, 33 con mỗi khu; M2 có 6 loại, 31 con; M25 không có quái ([Bản đồ đã quét](#atlas)). [Đo] |
| Xem được map chưa vào không? | **Không.** Server chỉ trả map đang đứng: `c2s/11` với map khác bị từ chối ("Không thể chuyển khu vực"), `c2s/43` với map khác vẫn trả quái của map đang đứng. Muốn biết NPC, cổng, quái của map nào thì phải vào map đó qua cổng. [Đo S1] |
| Vị trí quái? | Server **không gửi** cho quái thường. Client tự đặt và cho quái đi lại. Muốn có toạ độ phải đọc trong bộ nhớ: `sqhz.J.e` chứa mọi entity. Boss thì có ô đứng trong `s2c/1177`; NPC và cổng có toạ độ trong `s2c/11`. [Đo] |
| Di chuyển? | Client tự di chuyển trên lưới va chạm của `s2c/11` và báo vị trí bằng `c2s/1169` (x, y, trạng thái). Server nhận cả vị trí do bot Node tự gửi và lưu lại. Sang bản đồ khác: đứng ở cổng, bấm "Vào" → `c2s/13 (mapId, id cổng)` ([10-quests](10-quests.md#cổng)). [Đo] |
| Đổi khu cùng map? | `c2s/1173 (u8 khu)` → `s2c/13 (mapId, khu)` → `c2s/11 (mapId, khu)` → `s2c/11` → `c2s/43` → `s2c/43`. [Đo] |
| Code nào chạy khi va chạm quái? | `com.mh.sqhz.a18(mob, bool)` → `sqhz.a17(mob, bool, int)` → `sqlq.a67(mobId, false)` → `c2s/15`. [Đo] |

## Quái của M1

Mỗi khu có cùng 5 loại và cùng số lượng; chỉ `mobId` đổi theo khu. [Đo khu 0 và khu 20]

| Loại | Cấp | Số con/khu | mobId khu 0 | mobId khu 20 | Hitbox (đơn vị server) |
|---|---:|---:|---|---|---|
| Gà Điên | 1 | 8 | `mob10`…`mob17` | `mob1160`…`mob1167` | 24×20 |
| Heo Mọi | 7 | 6 | `mob2800`…`mob2805` | `mob2920`…`mob2925` | 25×20 |
| Kẻ Gây Rối | 7 | 6 | `mob31400`…`mob31405` | `mob31520`…`mob31525` | 29×20 |
| Sơn Tặc | 9 | 6 | `mob42000`…`mob42005` | `mob42120`…`mob42125` | 29×20 |
| Chỉ Huy Sơn Tặc | 10 | 7 | `mob872600`…`mob872606` | `mob872740`…`mob872746` | 25×20 |

Các khu đã thấy (0, 1, 20) đều khớp quy luật `"mob" + mãLoại + (gốc + khu × sốCon + i)`, ghép chuỗi: Gà Điên `1|0+20·8`, Heo Mọi `2|800+20·6`, Kẻ Gây Rối `3|1400+20·6`, Sơn Tặc `4|2000+20·6`, Chỉ Huy `87|2600+20·7`. Gà Điên khu 1 là `mob18`, `mob19`, `mob110`…`mob115` (mã loại `1`, số 8…15). `mãLoại` = loại quái trong bước nhiệm vụ + 1 ([mã quái](#mã-quái)). [Suy luận]

Boss Thủ Lĩnh Sơn Tặc (`mob86100001`) không có trong 43; nó đến riêng qua s2c/1177.

### Ảnh chụp vị trí, khu 20

Toạ độ đổi về đơn vị server (= bộ nhớ ÷ 1,5). Đây là một thời điểm duy nhất lúc 17:25:03; quái luôn đi lại, nên không dùng làm toạ độ cố định. [Đo]

| mobId | Tên | Cấp | x | y | hitbox x,y,w,h |
|---|---|---:|---:|---:|---|
| `mob1160` | Gà Điên | 1 | 3296 | 588 | 3304,620,24,20 |
| `mob1161` | Gà Điên | 1 | 1470 | 620 | 1478,652,24,20 |
| `mob1162` | Gà Điên | 1 | 4020 | 620 | 4023,652,24,20 |
| `mob1163` | Gà Điên | 1 | 4056 | 364 | 4066,396,24,20 |
| `mob1164` | Gà Điên | 1 | 2793 | 140 | 2797,172,24,20 |
| `mob1165` | Gà Điên | 1 | 4350 | 236 | 4358,268,24,20 |
| `mob1166` | Gà Điên | 1 | 591 | 620 | 599,652,24,20 |
| `mob1167` | Gà Điên | 1 | 3247 | 172 | 3255,204,24,20 |
| `mob2920` | Heo Mọi | 7 | 2819 | 667 | 2827,684,25,20 |
| `mob2921` | Heo Mọi | 7 | 4845 | 635 | 4853,652,25,20 |
| `mob2922` | Heo Mọi | 7 | 2817 | 667 | 2821,684,25,20 |
| `mob2923` | Heo Mọi | 7 | 2373 | 91 | 2381,108,25,20 |
| `mob2924` | Heo Mọi | 7 | 1901 | 603 | 1905,620,25,20 |
| `mob2925` | Heo Mọi | 7 | 3741 | 251 | 3750,268,25,20 |
| `mob31520` | Kẻ Gây Rối | 7 | 4623 | 361 | 4631,396,29,20 |
| `mob31521` | Kẻ Gây Rối | 7 | 1091 | 425 | 1101,460,29,20 |
| `mob31522` | Kẻ Gây Rối | 7 | 1107 | 233 | 1109,268,29,20 |
| `mob31523` | Kẻ Gây Rối | 7 | 724 | 137 | 727,172,29,20 |
| `mob31524` | Kẻ Gây Rối | 7 | 1213 | 425 | 1217,460,29,20 |
| `mob31525` | Kẻ Gây Rối | 7 | 1759 | 649 | 1762,684,29,20 |
| `mob42120` | Sơn Tặc | 9 | 2809 | 393 | 2817,428,29,20 |
| `mob42121` | Sơn Tặc | 9 | 4507 | 617 | 4517,652,29,20 |
| `mob42122` | Sơn Tặc | 9 | 203 | 297 | 213,332,29,20 |
| `mob42123` | Sơn Tặc | 9 | 1891 | 73 | 1901,108,29,20 |
| `mob42124` | Sơn Tặc | 9 | 1324 | 617 | 1330,652,29,20 |
| `mob42125` | Sơn Tặc | 9 | 2159 | 201 | 2161,236,29,20 |
| `mob872740` | Chỉ Huy Sơn Tặc | 10 | 4165 | 603 | 4169,620,25,20 |
| `mob872741` | Chỉ Huy Sơn Tặc | 10 | 2095 | 219 | 2103,236,25,20 |
| `mob872742` | Chỉ Huy Sơn Tặc | 10 | 2135 | 603 | 2143,620,25,20 |
| `mob872743` | Chỉ Huy Sơn Tặc | 10 | 3635 | 603 | 3645,620,25,20 |
| `mob872744` | Chỉ Huy Sơn Tặc | 10 | 1072 | 251 | 1081,268,25,20 |
| `mob872745` | Chỉ Huy Sơn Tặc | 10 | 1871 | 283 | 1879,300,25,20 |
| `mob872746` | Chỉ Huy Sơn Tặc | 10 | 640 | 635 | 643,652,25,20 |

<a id="atlas"></a>

## Bản đồ đã quét (S1)

**Kết luận: ở cấp 19 chỉ vào được 3 map: M1, M2, M25.** Mọi cổng khác bị server từ chối: hoặc vì cấp, hoặc vì chưa xong nhiệm vụ. Server cũng không trả dữ liệu của map mình chưa đứng trong đó, nên chưa lấy được NPC, cổng, quái của 22 map còn lại. [Đo S1]

Cách quét: `npm run scan` ([quest-bot](../../integration/nodejs/quest-bot.md#quét-map)) đăng nhập, xin bản đồ thế giới `c2s/11 "M99"`, rồi đi lần lượt qua từng cổng vào được. Ở mỗi map nó xin `c2s/11` (map, NPC, cổng) và `c2s/43` (quái), nhận `s2c/1177` (boss), rồi quay về map ban đầu. Kết quả ghi vào [data/maps.json](../../../data/maps.json); bot nhiệm vụ đọc file này để biết đường đi qua các lần chạy ([src/atlas.ts](../../../src/atlas.ts)). Lệnh chỉ gửi `c2s/11`, `c2s/13`, `c2s/43`: không đánh, không chat, không mua bán.

| Thử | Server trả | Kết luận |
|---|---|---|
| `c2s/11 "M1"` khi đang ở M2 | `s2c/1256` "Không thể chuyển khu vực", không có `s2c/11` | Chỉ xin được map đang đứng. Vị trí lưu vẫn là M2. [Đo] |
| `c2s/43 "M1"` khi đang ở M2 | `s2c/43` của M2 | Server bỏ qua mapId. [Đo] |
| `c2s/13` cổng chưa đủ cấp | `s2c/1256` "Bạn phải đạt cấp 40 mới vào được Lạc Cốc" | Khoá theo cấp. Trước đây bot ghi nhầm là "cổng không trả lời" vì chưa đọc gói này (Q15). [Đo] |
| `c2s/13` cổng Hồng Giang từ M25 | `s2c/1256` "Bạn cần hoàn thành nhiệm vụ trước khi tới đây" | Khoá theo nhiệm vụ, nhiệm vụ nào thì [Chưa rõ]. [Đo] |
| `c2s/13` cổng vào được | `s2c/13 (mapId, thứ tự map, 0, 0xff)` | Số sau mapId là thứ tự map trong bản đồ thế giới (M1 0, M2 1, M25 24), không phải khu. Khu là byte `area` của `s2c/11` sau đó, khớp với mã quái. [Đo] |
| Gửi `c2s/13` từ xa cổng | Được nhận | Không cần đứng ở cổng: bot gửi từ chỗ đăng nhập. [Đo] |

Id cổng là id của **map đích**, giống nhau ở mọi map: 1013 là Lạc Cốc ở cả M1 và M2, 1015 là Vân Sơn ở cả M1 và M25. [Đo]

| Cổng | Tên | Kết quả ở cấp 19 |
|---:|---|---|
| 1010 | Cổ Phong | Cần cấp 130 |
| 1013 | Lạc Cốc | Cần cấp 40 |
| 1014 | Làng Thanh Khê | → M1 |
| 1015 | Vân Sơn | → M2 |
| 1016 | Hồng Giang | Cần xong nhiệm vụ |
| 1017 | Tân Trạch | Cần cấp 110 |
| 1024 | Rìa Hồng Giang | → M25 (bản đồ thế giới ghi cấp 20, nhưng cấp 19 vẫn vào được) |

### NPC và cổng

Toạ độ là góc trên-trái của ô, đơn vị server (ô 32). Cổng "Bản đồ" (id 0 ở M1, 1 ở M2) là nút mở bản đồ thế giới, không phải cổng thật. [Đo]

| Map | NPC (id, x, y) | Cổng (id, x, y) |
|---|---|---|
| M1 Làng Thanh Khê | 102 Hương Lão Trần Bá (336, 576); 103 Bà Tư Hạnh (700, 608); 104 Ngọc Nga (915, 544); 106 Lái Buôn (576, 416); 111 Vệ Binh Lê Dũng (1167, 672); 129 Thành Chủ Nguyễn Khang (1472, 416); 161 Pháp sư (712, 512) | 1010 Cổ Phong (34, 336); 1013 Lạc Cốc (4960, 336); 1015 Vân Sơn (4960, 656) |
| M2 Trại Vân Sơn | 127 Trại Chủ Phạm Hùng (1600, 800); 141 Võ Quan Đinh Mộc (1730, 800); 142 Dân Phu Vân Sơn (1830, 736) | 1013 Lạc Cốc (32, 624); 1014 Làng Thanh Khê (32, 464); 1017 Tân Trạch (2848, 304); 1024 Rìa Hồng Giang (2848, 880) |
| M25 Rìa Hồng Giang | 162 Tướng Quân Lê Viễn (960, 352) | 1015 Vân Sơn (32, 400); 1016 Hồng Giang (1504, 624) |

### Quái và boss của M2

Quái của M1 ở [bảng trên](#quái-của-m1). M25 không có quái và không có boss. [Đo]

| Loại | Cấp | Số con/khu | mobId khu 0 | mobId khu 1 |
|---|---:|---:|---|---|
| Kẻ Quấy Phá | 20 | 5 | `mob80`…`mob84` | `mob85`…`mob89` |
| Cua Càng | 15 | 5 | `mob7500`…`mob7504` | `mob7505`…`mob7509` |
| Cóc Xanh | 13 | 5 | `mob61000`…`mob61004` | `mob61005`…`mob61009` |
| Sói Xám | 11 | 6 | `mob51500`…`mob51505` | `mob51506`…`mob51511` |
| Sơn Tặc | 9 | 5 | `mob42100`…`mob42104` | `mob42105`…`mob42109` |
| Heo Mọi | 7 | 5 | `mob22600`…`mob22604` | `mob22605`…`mob22609` |

| Boss | Map | Cấp | mobId khu 0 | mobId khu 1 | Ô đứng lần cuối thấy (cột, hàng) |
|---|---|---:|---|---|---|
| Thủ Lĩnh Sơn Tặc | M1 | 11 | `mob86100001` | `mob86100101` | (115, 8) ở khu 1 |
| Hào Trưởng phía Bắc | M2 | 21 | `mob89100002` | `mob89100102` | (51, 14) ở khu 0 |
| Hào Trưởng phía Nam | M2 | 21 | `mob90100003` | `mob90100103` | (14, 30) ở khu 0 |

Boss đổi ô sau mỗi lần rời đi (`s2c/1177` field 1 rồi field 0 với ô mới, [04-push](04-push.md#s2c-1177)), nên ô chỉ đúng tại lúc quét. [Đo]

<a id="mã-quái"></a>

### Mã quái

`mobId` = `"mob"` + (loại quái + 1) + số thứ tự, ghép chuỗi. "Loại quái" là `thamSố` của bước diệt quái trong `s2c/39` ([10-quests](10-quests.md#s2c-39)). Số thứ tự của quái thường là `gốc + khu × sốCon + i`; của boss là `100000 + khu × 100 + n`. [Suy luận: 8/8 loại đã có trong nhiệm vụ khớp]

| Quái | Loại trong nhiệm vụ | Đầu mã | Ví dụ |
|---|---:|---|---|
| Gà Điên | 0 | `mob1` | `mob10` = 1 + "0" |
| Heo Mọi | 1 | `mob2` | `mob2800` (M1), `mob22600` (M2) |
| Kẻ Gây Rối | 2 | `mob3` | `mob31400` |
| Sơn Tặc | 3 | `mob4` | `mob42000` (M1), `mob42100` (M2) |
| Sói Xám | 4 | `mob5` | `mob51500` |
| Cóc Xanh | 5 | `mob6` | `mob61000` |
| Thủ Lĩnh Sơn Tặc (boss) | 85 | `mob86` | `mob86100001` |
| Chỉ Huy Sơn Tặc | 86 | `mob87` | `mob872600` |
| Cua Càng, Kẻ Quấy Phá, Hào Trưởng phía Bắc, phía Nam | chưa gặp trong nhiệm vụ | `mob7`, `mob8`, `mob89`, `mob90` | loại 6, 7, 88, 89 theo quy luật [Suy luận] |

Vì ghép chuỗi nên mã có thể nhập nhằng (`mob110` là Gà Điên số 10, không phải loại 10). Bot so tên quái, không tách mã.

## Cách liệt kê toàn bộ bot của map

### 1. Qua gói tin

Gửi `c2s/43` với `string mapId`, nhận `s2c/43`. Bố cục ở [05-battle](05-battle.md#s2c-43-mobs):

```text
string mapId; u8 field
lặp tới hết payload: string mobId; string tên; i32 cấp; u8 a; i32 b; i32 c; u8 d
```

Client gửi 43 sau mỗi lần nhận map: lúc vào game, sau khi đổi khu, sau mỗi trận. Danh sách là của **khu đang đứng**. Khu 20 cho đúng 33 id, cùng thứ tự với danh sách trong bộ nhớ. [Đo]

Gói không có toạ độ. Theo luồng đã đo, `c2s/15` chỉ chứa `mobId`, và client chỉ gửi gói này khi hitbox chạm nhau. Server **không** kiểm tra khoảng cách: bot gửi 15 cho `mob10` khi nhân vật đứng xa, server vẫn mở trận, 3/3 lần. [Đo, xem [07-auto-battle](07-auto-battle.md)]

### 2. Qua bộ nhớ client

Đọc được bằng hook tại `sqhz.a17`, object `self` là `com.mh.sqhz`. [Đo]

| Đường dẫn | Kiểu | Nội dung |
|---|---|---|
| `sqhz.J` | `com.mh.sqil` | Quản lý entity |
| `sqhz.J.e.a` | `Object[]` (sức chứa 40) | Mọi entity của khu: phần tử 0 là nhân vật mình, sau đó 33 quái theo thứ tự `s2c/43` |
| `sqhz.J.j.a` | `Object[]` (10) | Entity đang trong khung camera |
| `sqhz.H.o` (phần tử 1) | — | Thông số lưới: ô `48×48` (đơn vị client), `23` hàng × `156` cột, rộng `7488`, cao `1104` |

Object quái là `com.mh.sqiz`, kế thừa `com.mh.sqfb`:

| Field | Ý nghĩa |
|---|---|
| `sqfb.A`, `sqfb.B` | x, y góc trên-trái sprite (đơn vị client) [Đo] |
| `sqfb.C`, `sqfb.D` | Kích thước sprite: Gà Điên 54×78, Heo Mọi/Chỉ Huy 56×56, Sơn Tặc/Kẻ Gây Rối 62×83 [Đo] |
| `sqfb.F` | `true` khi đang trong khung camera, khớp đúng các phần tử của `J.j` [Đo] |
| `sqiz.g` (`com.mh.sqlu`) | **Hitbox** `a,b,c,d` = x, y, w, h, nằm ở chân sprite [Đo] |
| `sqiz.h` (`com.mh.sqjb`) | Bản ghi s2c/43: `a`=mobId, `b`=tên, `d`=cấp, `c/e/f/g`=các trường còn lại của 43 [Đo] |
| `sqiz.t` (`com.mh.sqqk`) | `a,b` gần bằng x, y; `c=62028` [Chưa rõ] |
| `sqiz.o` (`com.mh.sqes`) | `o` đổi theo từng con (0–8), có thể là trạng thái AI hoặc hướng đi [Chưa rõ] |
| `sqiz.j` | `1` ở con đang bị thách đấu, `0` ở các con khác [Đo 1 lần] |

## Toạ độ và di chuyển

- **Hai hệ đơn vị.** Gói tin và map data dùng đơn vị server: ô 32, map 4992×736. Client vẽ bằng ô 48, nên toạ độ trong bộ nhớ = server × **1,5**. Ví dụ c2s/1169 cuối cùng là x=1315, y=640, còn trong bộ nhớ nhân vật có A=1973 (= 1315×1,5). [Đo]
- **c2s/1169** chỉ được gửi khi đang chạy, nhảy hoặc rơi (~100–130 ms/gói): `i32 x; i32 y; i32 state; 5 byte cờ`. State thấy được: 0 đứng, 1 chạy, 5 lên, 6 rơi. [Đo] Server không trả lời gói nào. Vị trí của người chơi khác đến qua s2c/1262.
- **Lưới s2c/11.** Sau prefix là 3 lớp, mỗi lớp gồm `i32 n` và `n` byte. Số byte là `dimension1 × dimension2` (M1: 23 × 156 = 3588; M2: 35 × 90 = 3150).
  - `dimension1` là số hàng, `dimension2` là số cột. Lưới lưu theo từng hàng, từ hàng trên cùng xuống, mỗi byte là một ô 32 đơn vị server.
  - Vì vậy `x / 32` và `y / 32` của nhân vật (`s2c/11`), NPC và cổng chỉ thẳng vào ô của lưới. Ở M2 (2880 × 1120 đơn vị), cổng nằm ở x = 32 và x = 2848, đúng mép trái và mép phải. [Đo, `mapGrid` trong [world.ts](../../../src/world.ts)]

  | Lớp | Giá trị | Ý nghĩa |
  |---|---|---|
  | 1 | Nhiều mã (M2: 126 mã), 0 là ô trống | Hình vẽ của ô. Ở M2, bốn hàng cuối (31–34) có hình ở mọi cột: đó là mặt đất. [Đo] |
  | 2 | M1: 15/27/47/89/…; M2: 6 mã | Trang trí [Chưa rõ] |
  | 3 | M1: `1` 3391 ô, `0` 164 ô, `2` 33 ô. M2: `1` 2937, `0` 182, `2` 31 | Ô `0`/`2` nằm thành từng đoạn ngang trùng với các bục vẽ ở lớp 1 (M2 hàng 30, cột 4–17), mỗi đoạn có một ô `2` (có thể là thang). Mặt đất ở hàng 31–34 lại có giá trị `1`, nên `1` không phải "ô trống" như từng suy luận. Nghĩa đúng của `1`/`0`/`2` [Chưa rõ] |

  App Rust vẽ bản đồ thu nhỏ từ lớp 1 (ô có hình) và lớp 3 (bục), rồi đặt nhân vật, NPC, cổng và boss vào theo cách quy đổi trên ([App Rust](../../integration/rust/README.md#giao-diện)).

- **NPC và cổng.** Cuối s2c/11 có danh sách `i32 n; n × {i32 id; string tên; u8 loại; i32 x; i32 y; i32 w; i32 h; u8; i32 p; i32 q}`, đơn vị server, rồi 12 byte chưa rõ. Đọc hết byte M1 và M2 (`mapData` trong [world.ts](../../../src/world.ts)). [Đo]

  | Loại | Tên (id) | x, y |
  |---|---|---|
  | 0 (cổng) | Cổ Phong (1010) | 34, 336 (mép trái) |
  | 0 | Lạc Cốc (1013) | 4960, 336 (mép phải) |
  | 0 | Vân Sơn (1015) | 4960, 656 (mép phải) |
  | 0 | Bản đồ (0) | 0, 656, w=64 [Chưa rõ] |
  | 2 (NPC) | Hương Lão Trần Bá 102, Vệ Binh Lê Dũng 111, Thành Chủ Nguyễn Khang 129, Bà Tư Hạnh 103, Lái Buôn 106, Pháp sư 161, Ngọc Nga 104 | 336,576 · 1167,672 · 1472,416 · 700,608 · 576,416 · 712,512 · 915,544 |

  Loại 0 là cổng: đứng ở cổng thì app hiện nút "Vào", bấm thì gửi `c2s/13 (mapId, id cổng)` và server chuyển sang map đích (B5: cổng Vân Sơn 1015 → M2). Xem [10-quests](10-quests.md#cổng). [Đo]

- **Đi tới một con quái** = di chuyển đến khi hitbox nhân vật (trong bộ nhớ là field `Y`, `com.mh.sqlu`, 25×81 đơn vị client) chồng lên `sqiz.g` của quái. Không cần bấm gì. [Đo]

## Đổi khu vực trong cùng map

Mở "Khu vực" (góc trên phải) ra danh sách khu kèm "Dân số N/20", trong đó thấy tới khu 25 trở lên. Mở hộp này **không** sinh gói. Nguồn số dân [Chưa rõ]; trong `.so` có log `[ZONE]: id|color|num|max`.

| Bước | Gói | Payload mẫu (khu 20) |
|---|---|---|
| Chọn khu | **c2s/1173** | `14` (`u8 khu`) |
| Server nhận | **s2c/13** | `00000002 4d31 00000014` (`string mapId; i32 khu`) |
| Xin map | c2s/11 | `00000002 4d31 14 00000000` (`string mapId; u8 khu; i32 0`); lúc login là `ff, -1` |
| Map | s2c/11 | 11379 byte, byte `area` = 20 |
| Xin quái | c2s/43 | `00000002 4d31` |
| Quái | s2c/43 | 33 id của khu 20 |

Toàn bộ chuỗi mất ~3,6 s. Hàm dựng gói (tìm qua hằng số): `sqlq.b119` → 1173, `sqlq.a63` → 11, `sqlq.e66` → 43. [Đo gói; hàm là Suy luận tĩnh]

## Code khi va chạm quái

Hook trực tiếp hàm dựng gói (`Interceptor` + `Backtracer.FUZZY`) cho chuỗi gọi sau. B2 có 5 lần va chạm (`mob2921`, `mob1165`, `mob1160`, `mob1161`, `mob42124`): `a17` có ở cả 5, `a18` bắt được ở 4. [Đo]

```text
com.mh.sqhz.a18(Object mob, boolean)          kiểm tra va chạm của quái
  └ com.mh.sqhz.a17(Object mob, boolean, int)   bắt đầu đánh quái
      └ com.mh.sqlq.a67(String mobId, boolean)   dựng gói, mobId lấy từ mob.h.a
          └ c2s/15 (mobId, 0) → hàng đợi gửi → sqlq.ab8 → sqfa.a6 → writer
```

| Hàm/class | Địa chỉ trong `libgdx-flashds.so` (arm64) | Ghi chú |
|---|---|---|
| `com.mh.sqhz.a18` | `0xd19670` | `(Object, boolean)` |
| `com.mh.sqhz.a17` | `0xd12b5c` | `(Object, boolean, int)` |
| `com.mh.sqlq.a67` | `0x134173c` | `(String, boolean)` → c2s/15 |
| `com.mh.sqhz` | — | Màn bản đồ: string `fightingMonster`, `[Map] Loi update monster` |

- Stack chỉ bắt được tới `a18`. Hàm gọi `a18` (vòng update mỗi frame) chưa xác định vì unwind FUZZY không đi qua được frame ART. [Chưa rõ]
- Writer luôn có stack `sqlq.ab8 → sqfa.a6` cho mọi gói, vì gói được xếp hàng rồi gửi từ một luồng riêng. Muốn biết nơi tạo gói thì phải hook hàm dựng gói, không phải writer.
- Sau khi về bản đồ (thua hoặc đầu hàng), nếu nhân vật đứng đúng đường quái đi thì va chạm lại sau ~2,3 s kể từ s2c/43. Trong B2 việc này lặp liền 3 lần với Gà Điên.

## Đầu hàng

Nút "Đầu hàng" → "Bạn muốn thoát khỏi trận đấu" → OK. Client gửi **c2s/11** (map) rồi **c2s/40** (`string battleUuid`), nhận s2c/11, s2c/10, s2c/1214, sau đó gửi c2s/43. Không có opcode đầu hàng riêng. [Đo 4 lần]

c2s/40 được dựng trong `sqlq.s77`, gọi từ luồng `com.mh.sqln.run1`, do nút OK của `com.g.c.sqaj.a5` kích hoạt.

## Thông báo boss (s2c/45)

Không phải quái thường, ghi lại để tham khảo. s2c/45 là `string text`. Lúc 16:54:57 server đẩy 15 gói cùng lúc, mỗi gói `"BOSS <tên> đang ở <map>: khu 0, 1, …, 9"`: [Đo]

Thủ Lĩnh Sơn Tặc (Làng Thanh Khê), Hào Trưởng phía Bắc và Hào Trưởng phía Nam (Trại Vân Sơn), Tướng Xích Vũ (Hồng Giang), Tướng Thiết Hổ (Cửu Phong), Tướng Hùng Liệt (Lạc Cốc), Tướng Thiết Kích (Bạch Nham), Tướng Trấn Vũ (Phong Nguyên), Tướng Vũ Kình (Tiên Cốc), Tướng Nham Hổ (Tam Khê), Đàm Xuyên (Huyền Hồ), Thạch Khôi (Nguyệt Đàm), Lôi Tướng (Tân Trạch), Nguyễn Bá Dực (Lam Lĩnh), Vệ Xích (Cổ Phong).

## Thu lại

Giống [05-battle](05-battle.md#thu-lại), thêm hai hook:

1. `Interceptor.attach` vào các export `com_mh_sqlq_*__ngen_native_{a67,b119,a63,e66,s77}E`, lấy `Thread.backtrace(ctx, Backtracer.FUZZY)` và `DebugSymbol.fromAddress`. Tham số String đọc bằng `GetStringUTFChars` (JNI 169).
2. Tại `sqhz.a17`, đọc field bằng reflection qua JNI thô:
   - `Class.getDeclaredFields`, `Field.getName/getType/getModifiers`, rồi `GetFieldID/Get*Field`;
   - `PushLocalFrame/PopLocalFrame` để không tràn local ref;
   - `NewGlobalRef` cho object cần giữ qua nhiều frame.

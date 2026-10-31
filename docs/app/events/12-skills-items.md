# Kỹ năng, điểm tiềm năng, túi đồ và sửa đồ

Mốc: APK 1.0.3, ngày 31/10/2026, nhân vật `manina` cấp 21 ở M2. Nguồn ([các phiên](../investigation.md#nguồn-dữ-liệu)):
- **E1, E2**: điện thoại, Frida hook writer/reader và 114 hàm dựng gói `com.mh.sqlq` (bỏ các gói đăng nhập `c2s/1…8`), ADB chạm màn hình. E1 có lỗi trong agent nên chỉ ghi được gói nhận và tham số của hàm dựng; E2 ghi đủ hai chiều.
- **C1**: Cẩm nang trong game (Chức năng → Cẩm nang), chụp từng trang.
- **T1**: phân tích tĩnh hàm dựng gói ([bảng 125 hàm](../c2s-builders.md)).
- **P1**: điện thoại, Frida hook writer/reader cho `c2s/10`, `s2c/10`, `s2c/1191` và hàm dựng `d50`, `e52`; ADB bấm "Cộng +1" một lần cho Thân Pháp của manina.
- **K1**: bot TS ([quest-bot](../../integration/nodejs/quest-bot.md)) đăng nhập nick thứ hai (hệ Thủy, cấp 3, nhiệm vụ 3 ở bước "Sử dụng điểm kỹ năng"): hai lần chỉ đọc, một lần thử `c2s/30` với hệ 4, rồi `--once` làm bước kỹ năng.

Nhãn **[Đo]**, **[Suy luận]**, **[Chưa rõ]** như các file khác.

## Trả lời nhanh

| Câu hỏi | Trả lời |
|---|---|
| Bước "Sử dụng điểm kỹ năng" làm bằng gói gì? | **`c2s/1191 (i32 mãKỹNăng; i32 1)`**. Server trả `s2c/10` kiểu 32 (cấp của mọi kỹ năng), `s2c/1191` (điểm tiềm năng, điểm kỹ năng còn lại) và `s2c/34` (bước sau). Bot TS đã làm được bước này với server thật (K1). Xem [Nâng cấp kỹ năng](#c2s-1191). [Đo] |
| Cộng điểm tiềm năng thế nào? | `c2s/10 (i32 chỉSố; i32 số)`. Số chỉ số theo nút "+" trên bảng: 0 Cường Lực, 1 Nội Lực, 2 Thân Pháp, 3 Thể Lực. Nhưng `stats` của `s2c/9` xếp Thân Pháp trước Nội Lực. manina còn **67 điểm**. Bot TS cộng hết bằng `--stats`. Xem [Điểm tiềm năng](#điểm-tiềm-năng). [Đo P1] |
| Học được kỹ năng nào, tốn gì? | `s2c/30` là bảng 9 kỹ năng của **hệ mà `c2s/30` xin** (1 Hỏa, 4 Thủy; app gửi hệ của nhân vật). Mỗi cấp ghi số điểm kỹ năng, cấp nhân vật và nội lực cần có. Xem [Bảng kỹ năng](#bảng-kỹ-năng). [Đo] |
| Lấy danh sách đồ thế nào? | Không có gói xin riêng. Lúc đăng nhập: `s2c/42` (trả `c2s/42`) chứa túi đồ, đuôi `s2c/9` chứa 8 ô trang bị. Mỗi khi túi đổi, server gửi lại cả túi bằng `s2c/1187`. Xem [Túi đồ và trang bị](#túi-đồ). [Đo] |
| Sửa đồ bằng gói gì? | **`c2s/48 (u8; i32)`**: sửa chiếc nón đang đội là `00 00000000`. Mỗi lần sửa tốn 1 Búa sửa chữa (mã 2), không tốn Xu. Server trả `s2c/1187` (túi đã mất búa) rồi `s2c/48`. Xem [Sửa đồ](#c2s-48). [Đo] |
| Hồi máu thế nào? | Hoàn Linh Dược (mã 0, manina có 4 bình) hồi 30% sinh lực tối đa, dùng trong trận bằng nút Túi đồ hoặc ngoài trận bằng nút Sử dụng. Gói dùng bình [Chưa rõ]. Từ cấp 11, máu mang sang trận sau; thua vì hết máu thì được hồi đầy (C1, khớp Q16, Q19). |
| Nhiệm vụ hằng ngày lấy ở đâu? | Gặp Hương Lão Trần Bá (NPC 102, M1) → "Nhiệm vụ hằng ngày" → "Nhận nhiệm vụ". Tối đa 3 nhiệm vụ một ngày, làm từng cái một (C1). Gói chưa bắt. |

<a id="c2s-1191"></a>

## Nâng cấp kỹ năng: `c2s/1191` → `s2c/10` kiểu 32, `s2c/1191`

Trên máy: Bản thân → tab Kỹ năng → chạm một kỹ năng → bấm "Nâng cấp". Không có hộp hỏi lại.

| Gói | Bố cục | Mẫu (E1) |
|---|---|---|
| `c2s/1191` | `i32 mãKỹNăng; i32 số` | K1: `00000fa0 00000001` (Băng Tiễn Thuật 4000). E1: hàm dựng `sqlq.e52(1000, 1)`, gọi từ `com.g.c.sqgu.a4` ← `sqbr.w35` |
| `s2c/10` kiểu 32 | `i32 32; string tên; i32 n; n × {i32 mãKỹNăng; i32 cấp}` | `00000020 "manina" 00000009 000003e8 00000002 000003e9 00000000 … 000003f0 00000000` |
| `s2c/1191` | `i32 điểmTiềmNăng; i32 điểmKỹNăng` | `00000044 00000012`: 68 và 18 (E1); `00000007 00000001` (K1) |
| `s2c/34` | Như [10-quests](10-quests.md#c2s-13) | Chỉ khi đang ở bước "Sử dụng điểm kỹ năng". K1: lời thoại bước sau "Lũ Gà Điên đang phá nát những luống lúa mới gieo…" |

- `s2c/10` và `s2c/1191` đến 28–35 ms sau `c2s/1191`; ở bước nhiệm vụ, `s2c/34` đến ngay sau đó. [Đo 4 lần]
- **Bố cục `c2s/1191`** đo trên dây ở K1. Trước đó đã suy ra từ hàm dựng: `e52` gọi `sqi.c(I)` hai lần, như `sqlq.d50` dựng `c2s/10` ([c2s-builders](../c2s-builders.md#cách-đọc-ra)). [Đo]
- **E1 có 3 lần nâng cấp, nhưng chỉ 1 lần do script.** Script ADB chạm nút "Nâng cấp" đúng một lần (lời gọi hàm dựng lúc 887,8 s). Hai lời gọi kia (882,7 s và 895,2 s) xảy ra khi script không chạm màn hình, nhiều khả năng do người cầm máy. Kết quả: Hỏa Cầu Thuật cấp 1 → 4, điểm kỹ năng 19 → 18 → 17 → 16. [Đo]
- Hỏa Cầu Thuật cấp 5 cần nhân vật cấp 22 ([bảng](#bảng-kỹ-năng)), nên cấp 4 là mức cao nhất manina nâng được ở cấp 21.

**Bot TS** ([quest-bot](../../integration/nodejs/quest-bot.md)) làm bước "Sử dụng điểm kỹ năng" như sau:
- Chọn kỹ năng đầu tiên trong cây `s2c/30` lên được một cấp ngay: đã học kỹ năng đứng trước, đủ cấp nhân vật, đủ điểm. Với nhân vật mới đó là kỹ năng gốc (Hỏa Cầu Thuật 1000, Băng Tiễn Thuật 4000).
- Gửi `c2s/1191 (mã, 1)` rồi đợi `s2c/34` hoặc `s2c/39` như bước nói chuyện.
- Có `s2c/1191` mà 8 s không có lời nhiệm vụ thì dừng, để không tiêu thêm điểm.

K1 (nick thứ hai, cấp 3, 2 điểm): bot gửi `c2s/1191 (4000, 1)`, Băng Tiễn Thuật lên cấp 1, còn 1 điểm. Nhiệm vụ 3 sang bước "Tiêu diệt Gà Điên" và `--once` dừng với `step done`. [Đo]

<a id="bảng-kỹ-năng"></a>

## Bảng kỹ năng: `s2c/30`

`s2c/30` trả `c2s/30 (u8 hệ)` lúc đăng nhập. Hệ là `field01` của `s2c/9`: 1 Hỏa, 4 Thủy. App gửi `sqlq.e49(1)` cho manina. Client TS từng luôn gửi 1, nên nick thứ hai (hệ 4) nhận nhầm cây Hỏa. K1 gửi 4 thì nhận cây Thủy. Mã kỹ năng là 1000 × hệ + 0…8, khớp danh sách kỹ năng trong `s2c/9`. [Đo]

Bố cục là bảng định nghĩa kỹ năng của hệ:

```text
i32 n; n × {
  i32 mãKỹNăng; string tên; i32 họcTrước (-1: không cần); i32 cấpTốiĐa;
  cấpTốiĐa × { i32 cấp; string môTả; i32 điểmKỹNăng; i32 cấpNhânVật; i32 nộiLực }
}
```

Đọc hết 23442/23442 byte của mẫu A2 (gói `30` trong `fixtures.scenario` của [test/fixtures.ts](../../../test/fixtures.ts)). Điều kiện của từng cấp khớp chi tiết kỹ năng trên máy: Liệt Hỏa Chi Kiếm cấp 1 cần cấp 10, phải học Hỏa Cầu Thuật, tốn 2 điểm và 2 thành nội lực. [Đo]

| Mã | Kỹ năng | Học trước | Cấp 1: điểm, cấp nhân vật, nội lực | Cấp 20 | Cấp 1 làm gì (chi tiết trên máy) |
|---:|---|---|---|---|---|
| 1000 | Hỏa Cầu Thuật | | 1, 2, 25 | 2, 97, 25 | 11 sát thương, phá 1–2 vùng 2×2 |
| 1001 | Hỏa Kiếm Thuật | 1000 | 2, 10, 50 | 3, 105, 50 | Biến 5–7 quân thành kiếm lửa, 51% được đi tiếp |
| 1002 | Đại Lực Công | 1001 | 3, 32, 75 | 4, 127, 75 | +7 lực tấn công trong 5 lượt, được đi tiếp |
| 1003 | Liệt Hỏa Chi Kiếm | 1000 | 2, 10, 50 | 3, 105, 50 | 45 sát thương |
| 1004 | Phích Lịch Hỏa Sư | 1003 | 3, 32, 75 | 4, 127, 75 | 73 sát thương |
| 1005 | Hỏa Long Chưởng | 1004 | 4, 60, 100 | 5, 155, 100 | 45 sát thương, 10% hút 70 sinh lực |
| 1006 | Thiên Hỏa Kích | 1000 | 2, 10, 50 | 3, 105, 50 | 57 sát thương, phá 1 vùng 3×3 |
| 1007 | Dung Nham Địa Ngục | 1006 | 3, 32, 75 | 4, 127, 75 | 55 sát thương, phá 1–2 vùng 4×4 |
| 1008 | Hỏa Phụng Liêu Nguyên | 1007 | 4, 60, 100 | 5, 155, 100 | 45 sát thương, phá 2 hàng dọc |

- **Cấp nhân vật cần** tăng 5 mỗi cấp kỹ năng. Ví dụ Hỏa Cầu Thuật cần cấp 2, 7, 12, 17, 22… [Đo]
- **Nội lực**: 25 = 1 "thành". Cẩm nang ghi 1 thành là 1/4 thanh nội lực. Điều này khớp việc bot dùng Hỏa Cầu Thuật khi nội lực ≥ 25 ([05-battle](05-battle.md#c2s-20)). [Đo]
- **Sát thương Hỏa Cầu Thuật** theo chi tiết trên máy: cấp 1 là 11, cấp 2 là 19, cấp 3 là 27, cấp 4 là 35 (+8 mỗi cấp). Trận Q9 đo 62 sát thương ở cấp 1, nên con số trong mô tả chưa tính tấn công của nhân vật. [Đo hai nguồn; công thức Chưa rõ]
- Mã kỹ năng này cũng là `skillId` của `c2s/20` khi dùng kỹ năng trong trận. [Đo]
- Cây kỹ năng chia 3 nhánh từ Hỏa Cầu Thuật: 1001 → 1002, 1003 → 1004 → 1005, 1006 → 1007 → 1008. [Đo]
- **Cây hệ Thủy** (K1, `c2s/30 (4)`): 4000 Băng Tiễn Thuật, 4001 Hàn Lưu Thánh Thủy, 4002 Độc Thủy Ám Thuật, 4003 Băng Đao Kích, 4004 Nghịch Thủy Hàn Kiếm, 4005 Băng Long Chưởng, 4006 Tuyết Sơn Áp Đỉnh, 4007 Bách Băng Chi Kiếm, 4008 Mưa Sao Băng. Mỗi kỹ năng tối đa 20 cấp; 4000 cấp 1 tốn 1 điểm. [Đo]
- Hệ Lôi có lẽ là một trong hai giá trị `field01` 2 và 3. Chưa có nhân vật để đối chiếu. [Chưa rõ]
- **Gợi ý cho bot**: Liệt Hỏa Chi Kiếm (1003) gây 45 sát thương, gấp 4 lần Hỏa Cầu Thuật cấp 1, với giá 2 thành nội lực. Nó học được từ cấp 10 bằng 2 điểm. [Suy luận]

<a id="điểm-tiềm-năng"></a>

## Điểm tiềm năng: `c2s/10` → `s2c/10` kiểu 2, 4, 8

Trên máy: Bản thân → tab Chỉ số → bấm "+" cạnh một tiềm năng. Bấm "+" chưa gửi gì: game mở hộp "Điểm tiềm năng: 68, Chỉ số: Thân Pháp, Hiện tại: 10" kèm một câu gợi ý và hai nút **"Cộng +1"**, **"Cộng nhiều"**. "Cộng +1" mới gửi gói.

| Gói | Bố cục | Mẫu (P1, manina cấp 21) |
|---|---|---|
| `c2s/10` | `i32 chỉSố; i32 số` | `00000002 00000001`: cộng 1 Thân Pháp. Hàm dựng `sqlq.d50(2, 1)`, gọi từ `com.g.c.sqa.h13` ← `sqa.c12` (nút "Cộng +1") |
| `s2c/10` kiểu 2 | `i32 2; string tên; i32 cấp; i32 stats[10]` | `… 00000015 00000020 0000000b 0000000a 0000001e 0…`: cấp 21; Cường Lực 32, Thân Pháp **11**, Nội Lực 10, Thể Lực 30 |
| `s2c/10` kiểu 4 | Như sau trận ([05-battle](05-battle.md#c2s-40)) | HP 180/**238**; Tấn Công 32, P.Thủ **9**, Chính Xác **33**, Né Tránh **22**, Chí Mạng 6 |
| `s2c/10` kiểu 8 | `i32 8; string tên; i32 điểmTiềmNăng; i32 điểmKỹNăng; i32; i32; string; string` | 67 điểm tiềm năng, 16 điểm kỹ năng, rồi 0, 21 (bằng cấp, chưa rõ), "421", "125" |

- Ba gói `s2c/10` đến 26–33 ms sau `c2s/10`, kiểu 8 sau cùng. Bảng Chỉ số hiện đúng các số đó: Thân Pháp 11, còn 67 điểm. [Đo]
- **Hai thứ tự khác nhau.** `c2s/10` đánh số theo nút "+" trên bảng, đọc theo hàng: 0 Cường Lực, 1 Nội Lực, 2 Thân Pháp, 3 Thể Lực. Còn `stats` của `s2c/9` và `s2c/10` kiểu 2 xếp Cường Lực, Thân Pháp, Nội Lực, Thể Lực. Cộng Thân Pháp là `c2s/10 (2, 1)` nhưng số đổi là `stats[1]`. Đã đo: Cường Lực (L1) và Thân Pháp (P1). Nội Lực là số còn lại ở cả hai phía [Suy luận mạnh]. Thể Lực là `stats[3]`, bằng 10 + cấp − 1 ở cả ba mẫu `s2c/9` [Suy luận mạnh]. Bảng đầy đủ ở [user-data](../user-data.md#đuôi-s2c9).
- **Chỉ số của đồ vừa sửa được tính từ lần cập nhật này**: chiếc nón sửa ở E2 (+4 phòng thủ, +58 sinh lực) giờ mới đưa HP tối đa 180 → 238 và P.Thủ 5 → 9. Một điểm Thân Pháp cho +3 Chính Xác, +2 Né Tránh. [Đo]
- Câu gợi ý trong hộp tuỳ hệ: với manina (hệ Hỏa) Nội Lực ghi "Không cần tăng nội lực"; Thân Pháp ghi "Thân pháp = Phòng thủ, chính xác, né tránh, chí mạng". [Đo]
- "Cộng nhiều" chưa bấm. Có lẽ nó gửi `c2s/10 (chỉSố, n)` một lần, nhưng chưa đo. [Chưa rõ]
- P1 tốn 1 điểm, manina còn 67.

Cẩm nang (C1):
- Mỗi lần lên cấp nhận 4 điểm tiềm năng, 1 điểm kỹ năng và tự cộng 1 Thể Lực.
- Chỉ số chính tăng Tấn Công: hệ Hỏa là Cường Lực, hệ Lôi là Thân Pháp, hệ Thủy là Nội Lực. Nick thứ hai (hệ Thủy) lại khởi đầu với Thân Pháp 20 (`stats` `[10, 20, 10, 11]`), nên chỉ số khởi đầu không phải chỉ số chính. [Đo]
- Thân Pháp tăng P.Thủ, Chính Xác, Né Tránh và Chí Mạng. Thể Lực tăng Sinh Lực và lượng máu Tim hồi. Cường Lực và Nội Lực giúp Đào và Âm dương nạp nhiều hơn.
- Tẩy Tủy Đan trả lại toàn bộ điểm tiềm năng đã cộng; Tẩy Kinh Đan trả lại toàn bộ điểm kỹ năng.

**Bot TS**: không có `--stats` thì bot chỉ cộng 1 điểm vào Cường Lực ở bước "Nâng điểm tiềm năng". Có `--stats` thì bot cộng hết điểm theo lựa chọn ([quest-bot](../../integration/nodejs/quest-bot.md#chạy)):
- `--stats=auto` cộng vào chỉ số chính của hệ: Cường Lực cho Hỏa (`field01` 1), Nội Lực cho Thủy (4). Với hệ chưa biết, bot không cộng điểm nào.
- `--stats=than` hoặc `--stats=cuong:3,than:1` chia theo tỉ lệ.
- Bot gửi từng `c2s/10 (chỉSố, 1)` như nút "Cộng +1". Gói sau chỉ đi khi `s2c/10` kiểu 8 của gói trước đã về.
- Bot cộng lúc vào game và giữa các trận (sau mỗi lần lên cấp), không cộng giữa trận.
- Bot chừa đủ điểm cho các bước "Nâng điểm tiềm năng" còn lại của nhiệm vụ đang làm. Ở các bước đó, điểm cũng đi theo lựa chọn.

67 điểm chưa cộng là lý do lớn khiến Cóc Xanh khó ([10-quests](10-quests.md#kết-quả-q18-q20)). Bot chưa chạy `--stats` với server thật. [Suy luận]

<a id="túi-đồ"></a>

## Túi đồ và trang bị

<a id="bản-ghi-vật-phẩm"></a>

### Bản ghi vật phẩm

Túi đồ, ô trang bị và vật phẩm rơi trên đất ([09-players-chat](09-players-chat.md#ground-items)) dùng chung một bản ghi:

```text
u8 ô (0xfe: trên đất); i32 mãVậtPhẩm; string uuid; i32 field0; i32 độBền (-1: không có độ bền); i32 sốLượng;
u8 field1; u8 phẩm (0xff ở vật phẩm thường); i32 field2; u8 field3; u8 field4; u8 n; n × {i32 chỉSố; i32 giáTrị}
```

Vật phẩm trên đất có thêm `i32 x; i32 y; i64 hếtHạn` ở cuối. `field0`, `field2`, `field3` bằng 0 ở mọi mẫu, có thể là cấp cường hoá. `field4` bằng 1 ở mọi trang bị. [Đo giá trị; vai trò Chưa rõ]

| Gói | Khi nào | Bố cục | Mẫu |
|---|---|---|---|
| `s2c/42` | Trả `c2s/42 (string tênNhânVật)` lúc đăng nhập | `string "test dong 1"; i32 42; i32 3; u8 2; i32 sứcChứa; i32 n; n × bản ghi` | 608/608 byte, 8 món, sức chứa 42 |
| `s2c/1187` | Mỗi khi túi đổi: sửa đồ (E2), trả nhiệm vụ (L1, Q2) | `u8 1; i32 sứcChứa; i32 n; n × bản ghi` (cả túi) | 519/519 byte, 7 món sau khi sửa |
| Đuôi `s2c/9` | Lúc đăng nhập | `i32 8; 8 × (u8 0xff: ô trống \| bản ghi)` | Ô 0 nón, ô 2 vũ khí, 6 ô trống |

- Sức chứa 42 khớp túi 50 ô trên máy có 8 ô khoá. Trước đây [09](09-players-chat.md#gói-khác-thấy-trong-l1-người-chơi-tự-bấm-trên-máy) đọc `0000002a` của `s2c/1187` là "mã 42", nhưng đó là sức chứa. [Đo]
- `i32 42; i32 3` sau chuỗi "test dong 1" của `s2c/42` chưa rõ nghĩa. [Chưa rõ]

### Đồ của manina (E1, E2)

| Ô | Mã | Món | Số lượng | Độ bền | Phẩm | Chỉ số | Căn cứ |
|---|---:|---|---:|---:|---:|---|---|
| Túi 0 | 0 | Hoàn Linh Dược | 4 | | | | Popup: "Bơm 30% sinh lực" [Đo] |
| Túi 1 | 412 | | 1 | | | | [Chưa rõ] |
| Túi 2 | 147 | Áo (Hào Kiệt?) | 1 | 60 | 1 | 6: 7; 3: 5 | Biểu tượng áo, thưởng nhiệm vụ 3 [Suy luận] |
| Túi 3 | 48 | Nón (Lá?) | 1 | 60 | 1 | 6: 5; 9: 66 | Biểu tượng nón, thưởng nhiệm vụ 3 [Suy luận] |
| Túi 4 | 306 | Nhẫn (Trơn?) | 1 | 60 | 1 | 5: 9; 8: 1 | Biểu tượng nhẫn, thưởng nhiệm vụ 4 [Suy luận] |
| Túi 5 | 415 | Viên màu cam | 1 | | | | [Chưa rõ] |
| Túi 6 | 2 | Búa sửa chữa | 1 | | | | Mất khỏi túi sau khi sửa [Đo] |
| Túi 7 | 1 | Bình xanh (Kim Đan Dược?) | 1 | | | | [Suy luận] |
| Trang bị 0 | 54 | Nón Âu Lạc (hệ Lôi, Hiếm) | 1 | 0 → đã sửa | 2 | 6: 4; 9: 58 | Popup: "Độ bền 0/60, +4 phòng thủ, +58 sinh lực" [Đo] |
| Trang bị 2 | 261 | Vũ khí | 1 | 0 | 1 | 5: 8; 2: 10 | Vẫn hỏng [Đo] |

- **Mã chỉ số**: 6 là phòng thủ, 9 là sinh lực (popup Nón Âu Lạc). [Đo] Mã 2, 3, 5, 8 [Chưa rõ]. Vũ khí có 2 và 5, nên có thể là Tấn công và Chính xác.
- **Phẩm**: 2 là "Hiếm" (popup), 1 có lẽ là "Thường". [Suy luận]
- Hai trang bị hỏng từ Q6 ([10-quests](10-quests.md#kết-quả-q3-q4)) chính là chiếc nón (mã 54) và vũ khí (mã 261), cả hai độ bền 0 trong `s2c/9`. [Đo]

Cẩm nang về trang bị (C1):
- Nón, Áo, Vũ khí, Nhẫn chia bậc theo cấp mặc (1, 21, 51, 101, 151, 201). Cường hoá ở NPC Pháp Sư: bậc 1 tới +4, bậc 21 tới +8.
- Độ bền giảm khi đánh và bị đánh (trừ đấu với người chơi). Hết độ bền thì món mất tác dụng, cần Sửa chữa.
- Đúng hệ nhân vật thì chỉ số của món được +5%. Đủ 4 món cùng hệ thì được thêm +8% tấn công và +8% sinh lực.

<a id="c2s-48"></a>

## Sửa đồ: `c2s/48` → `s2c/1187`, `s2c/48`

Trên máy: Bản thân → chạm món hỏng → "Sửa chữa" → hộp "Bạn có chắc là muốn sửa chữa Nón Âu Lạc này không? Cần 1 búa." → OK.

| Gói | Bố cục | Mẫu (E2) |
|---|---|---|
| `c2s/48` | `u8 a; i32 b` | `00 00000000`: sửa Nón Âu Lạc ở ô trang bị 0. Hàm dựng `sqlq.c47(0, 0)`, gọi từ `com.g.f.sqh.run1` ← `com.g.c.sqaj.a5` (nút OK) |
| `s2c/1187` | Cả túi ([bản ghi](#bản-ghi-vật-phẩm)) | 40 ms sau; 7 món, Búa sửa chữa (túi 6) đã mất |
| `s2c/48` | `u8; i32` | `00 00000000`, giống hệt gói gửi đi |

- `c47` ghi `sqi.b(I)` (1 byte) rồi `sqi.c(I)` (i32), khớp 5 byte trên dây. [Đo]
- Vì `a` và `b` đều bằng 0 nên chưa tách được nghĩa. Có thể `a` là nơi chứa (0 = đang mặc, như `u8` đầu của gói túi đồ) và `b` là ô. [Suy luận]
- `sqlq.a46(int, int, int)` cũng dựng `c2s/48` với `u8; i32; i32`, có lẽ là sửa món trong túi. [Chưa rõ]
- **Sau khi sửa, chỉ số không đổi ngay**: không có `s2c/10` hay `s2c/36`, và bảng Chỉ số vẫn hiện Sinh Lực 180, P.Thủ 5. Chúng đổi ở lần `s2c/10` sau: lần cộng điểm P1 đưa HP tối đa lên 238 và P.Thủ lên 9 ([Điểm tiềm năng](#điểm-tiềm-năng)). [Đo]
- Búa sửa chữa lấy ở đâu (mua ở NPC hay rơi từ quái) [Chưa rõ]. manina đã dùng chiếc búa duy nhất, vũ khí vẫn hỏng.

## Bình máu và nội lực

Cẩm nang (C1):
- Hoàn Linh Dược hồi 30% sinh lực tối đa; Kim Đan Dược hồi 25% nội lực (1 thành).
- Trong trận, bấm nút Túi đồ ở cột trái bàn cờ. Mỗi lượt dùng được 1 món, kể cả khi đấu với người chơi. Bình mua ở NPC Lái Buôn.
- Ngoài trận, chạm bình trong túi sẽ có nút "Sử dụng" và "Vứt bỏ". E1 chỉ mở popup, chưa dùng bình nào.

Gói dùng bình [Chưa rõ]. Trong [bảng hàm dựng](../c2s-builders.md#bảng) có vài gói `u8; i32` chưa thấy trên dây, như `c2s/1186` và `c2s/1189`, có thể là dùng vật phẩm theo ô. Chưa kiểm. [Suy luận yếu]

## Cẩm nang: luật liên quan tới bot

Đọc từ Chức năng → Cẩm nang (C1). Đây là chữ của game, không phải đo bằng gói.

| Chủ đề | Luật | Liên quan |
|---|---|---|
| Tân thủ | Tới cấp 10: mỗi trận đánh quái bắt đầu đầy máu, thua không bị trừ EXP | Khớp Q3–Q6 |
| Từ cấp 11 | Máu còn lại mang sang trận sau. Thua vì hết máu thì được hồi đầy. Thua hoặc rời trận mất một ít EXP, không tụt cấp | Khớp Q16, Q19 |
| Quái quá thấp | Thấp hơn mình 20 cấp thì không có EXP, vàng, đồ rơi | Bot cày cấp nên tránh |
| Boss | Không có Thưởng, chỉ có Điểm Thu Thập. Đầu hàng trận boss của nhiệm vụ chính không bị trừ EXP | Khớp B4 |
| Vàng | Thỏi vàng ăn trong trận. Đủ 10.000 thì tự đổi thành 10.000 Xu khoá | Thanh "2664/10000" trên bảng Bản thân là Vàng ([user-data](../user-data.md)) |
| Tăng Kinh Nghiệm | Nhân đôi EXP thắng trận trong 24 giờ, kể cả lúc offline | |
| Đồ rơi | Hòm đồ có thể rơi sau trận. Đứng lên hòm rồi bấm Nhặt | `s2c/1182`; gói nhặt chưa biết |
| Nhiệm vụ hằng ngày | Nhận ở Hương Lão Trần Bá, tối đa 3 một ngày, làm từng cái một, trả cũng ở đó, huỷ được. Thưởng EXP, Xu khoá hoặc vật phẩm | Tab "Phụ" hiện "Chưa có nhiệm vụ" |
| Quà cấp | Đạt cấp 20, 40, 60… tới 200 thì nhận quà qua Hòm thư | manina cấp 21 |
| Bản đồ thế giới | Chạm một thành rồi "Vào thành" để đi nhanh. Ổ khoá nghĩa là phải làm tiếp nhiệm vụ chính | Cổng Hồng Giang ([10-quests](10-quests.md#cổng)) |
| Bạch Hổ | Boss thế giới ở Hang Bạch Hổ (Luyện Ngục), 9:00–9:59 mỗi ngày. Không có EXP, thua không bị trừ. Top 5 sát thương nhận quà qua thư | |
| Lôi đài | Đấu tự do với người chơi. Sát thương chỉ còn 60%, bỏ lỡ 3 lượt là thua, tối đa 8 phút hoặc 40 hành động mỗi bên | |
| Tiền | Xu (Chợ trời, góp quân lương), Xu khoá (cửa hàng NPC, cường hoá), Lượng (tiền nạp) | Bảng Bản thân: 500 Xu, 7.370 Xu khoá, 0 Lượng = `s2c/46` |

## Chưa rõ

- Nghĩa hai trường của `c2s/48`, và biến thể `a46` (`u8; i32; i32`).
- Gói dùng bình, nhặt đồ, nhận và trả nhiệm vụ hằng ngày, mua ở NPC.
- `c2s/10` của Nội Lực (1) và Thể Lực (3) chưa đo trực tiếp; nút "Cộng nhiều"; mã chỉ số 2, 3, 5, 8 của trang bị.
- Tên vật phẩm mã 1, 412, 415, 261.
- Sau sửa đồ, chỉ số có đổi trước lần `s2c/10` sau (sau trận, đăng nhập lại) không.
- Cây kỹ năng và giá trị `field01` của hệ Lôi.

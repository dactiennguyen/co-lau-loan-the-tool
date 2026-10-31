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
| Lấy kỹ năng và giao diện tab Kỹ năng thế nào? | Không có gói xin riêng: `s2c/30` (cây của hệ) và đuôi `s2c/9` (cấp từng kỹ năng, điểm) đến lúc đăng nhập. `npm run skills` in cả cây. Icon nằm ở `offline-a2/skill<hệ>.dat`, ảnh nền cây ở APK; repo có bản WebP ở `data/icons/skills/`. Xem [Tab Kỹ năng](#tab-kỹ-năng). [Đo] |
| Lấy danh sách đồ thế nào? | Không có gói xin riêng. Lúc đăng nhập: `s2c/42` (trả `c2s/42`) chứa túi đồ, đuôi `s2c/9` chứa 8 ô trang bị. Mỗi khi túi đổi, server gửi lại cả túi bằng `s2c/1187`. Mở túi trong game không gửi gói nào. `npm run bag` đăng nhập và in cả hai. Xem [Túi đồ và trang bị](#túi-đồ) và [Cách lấy](#cách-lấy-túi-đồ). [Đo] |
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
- **Cây Lôi và cây Thủy**: `c2s/30 (2)` và `c2s/30 (4)` (Tiheo1, 31/10; `npm run skills -- --trees`). Server trả cây được xin, dù nhân vật thuộc hệ nào. Cả ba cây có cùng quan hệ học trước (1, 3, 6 cần 0; 2 cần 1; 4 cần 3; 5 cần 4; 7 cần 6; 8 cần 7), cùng điểm, cấp và nội lực từng cấp; chỉ khác hiệu ứng. Bản đủ 20 cấp ở [data/skills.json](../../../data/skills.json). [Đo]

Cây Lôi:

| Mã | Kỹ năng | Học trước | Cấp 1: điểm, cấp nhân vật, nội lực | Cấp 1 | Cấp 20 |
|---:|---|---|---|---|---|
| 2000 | Xích Lôi Công |  | 1, 2, 25 | Tấn công và gây 11 sát thương cho đối phương, đồng thời phá hủy ngẫu nhiên từ 1 đến 3 quân cờ. | Tấn công và gây 168 sát thương cho đối phương, đồng thời phá hủy ngẫu nhiên từ 12 đến 14 quân cờ. |
| 2001 | Kim Cang Hộ Thể | 2000 | 2, 10, 50 | Tăng 10 lực phòng thủ cho nhân vật trong 6 lượt. | Tăng 167 lực phòng thủ cho nhân vật trong 6 lượt. |
| 2002 | Lôi Thần Nhập Thể | 2001 | 3, 32, 75 | Tăng 15 né tránh cho nhân vật trong 6 lượt. | Tăng 248 né tránh cho nhân vật trong 6 lượt. |
| 2003 | Lôi Tiễn Công | 2000 | 2, 10, 50 | Tấn công và gây 45 sát thương cho đối phương. | Tấn công và gây 335 sát thương cho đối phương. |
| 2004 | Chấn Lôi Ma Công | 2003 | 3, 32, 75 | Tấn công và gây 73 sát thương cho đối phương, đồng thời có 35% cơ hội làm đối phương bị giảm 35 lực phòng thủ trong 6 lượt. | Tấn công và gây 363 sát thương cho đối phương, đồng thời có 54% cơ hội làm đối phương bị giảm 135 lực phòng thủ trong 6 lượt. |
| 2005 | Huyết Lôi Loạn Trảm | 2004 | 4, 60, 100 | Tấn công và gây 45 sát thương cho đối phương, đồng thời có 10% cơ hội hấp thu 70 sinh lực bị mất của đối phương để phục hồi sinh lực cho bản thân. | Tấn công và gây 202 sát thương cho đối phương, đồng thời có 25% cơ hội hấp thu 227 sinh lực bị mất của đối phương để phục hồi sinh lực cho bản thân. |
| 2006 | Bách Lôi Uy Vũ | 2000 | 2, 10, 50 | Tấn công và gây 57 sát thương cho đối phương, đồng thời phá hủy 1 hàng ngang các quân cờ. | Tấn công và gây 119 sát thương cho đối phương, đồng thời phá hủy 4 hàng ngang các quân cờ. |
| 2007 | Thiên Lôi Oanh Kích | 2006 | 3, 32, 75 | Tấn công và gây 55 sát thương cho đối phương, đồng thời phá hủy từ 1 đến 2 vùng 3x4 các quân cờ. | Tấn công và gây 193 sát thương cho đối phương, đồng thời phá hủy từ 2 đến 3 vùng 3x4 các quân cờ. |
| 2008 | Liên Hoàn Lôi Cầu | 2007 | 4, 60, 100 | Tấn công và gây 45 sát thương cho đối phương, đồng thời phá hủy ngẫu nhiên từ 8 đến 16 quân cờ. | Tấn công và gây 202 sát thương cho đối phương, đồng thời phá hủy ngẫu nhiên từ 33 đến 41 quân cờ. |

Cây Thủy:

| Mã | Kỹ năng | Học trước | Cấp 1: điểm, cấp nhân vật, nội lực | Cấp 1 | Cấp 20 |
|---:|---|---|---|---|---|
| 4000 | Băng Tiễn Thuật |  | 1, 2, 25 | Tấn công và gây 11 sát thương cho đối phương, đồng thời phá hủy từ 1 đến 2 vùng 2x2 các quân cờ. | Tấn công và gây 168 sát thương cho đối phương, đồng thời phá hủy từ 2 đến 3 vùng 2x2 các quân cờ. |
| 4001 | Hàn Lưu Thánh Thủy | 4000 | 2, 10, 50 | Phục hồi 11% sinh lực cho bản thân. | Phục hồi 30% sinh lực cho bản thân. |
| 4002 | Độc Thủy Ám Thuật | 4001 | 3, 32, 75 | Triệt tiêu 23% năng lượng của kẻ thù. | Triệt tiêu 75% năng lượng của kẻ thù. |
| 4003 | Băng Đao Kích | 4000 | 2, 10, 50 | Tấn công và gây 45 sát thương cho đối phương. | Tấn công và gây 335 sát thương cho đối phương. |
| 4004 | Nghịch Thủy Hàn Kiếm | 4003 | 3, 32, 75 | Tấn công và gây 73 sát thương cho đối phương. | Tấn công và gây 363 sát thương cho đối phương. |
| 4005 | Băng Long Chưởng | 4004 | 4, 60, 100 | Tấn công và gây 45 sát thương cho đối phương, đồng thời có 10% cơ hội hấp thu 70 sinh lực bị mất của đối phương để phục hồi sinh lực cho bản thân. | Tấn công và gây 202 sát thương cho đối phương, đồng thời có 25% cơ hội hấp thu 227 sinh lực bị mất của đối phương để phục hồi sinh lực cho bản thân. |
| 4006 | Tuyết Sơn Áp Đỉnh | 4000 | 2, 10, 50 | Tấn công và gây 57 sát thương cho đối phương, đồng thời phá hủy 1 vùng 3x3 các quân cờ. | Tấn công và gây 119 sát thương cho đối phương, đồng thời phá hủy 4 vùng 3x3 các quân cờ. |
| 4007 | Bách Băng Chi Kiếm | 4006 | 3, 32, 75 | Tấn công và gây 55 sát thương cho đối phương, đồng thời phá hủy từ 1 đến 2 vùng 4x4 các quân cờ. | Tấn công và gây 193 sát thương cho đối phương, đồng thời phá hủy từ 1 đến 2 vùng 4x4 các quân cờ. |
| 4008 | Mưa Sao Băng | 4007 | 4, 60, 100 | Tấn công và gây 45 sát thương cho đối phương, đồng thời phá hủy từ 2 đến 4 vùng 2x2 các quân cờ. | Tấn công và gây 202 sát thương cho đối phương, đồng thời phá hủy từ 11 đến 13 vùng 2x2 các quân cờ. |

- Kỹ năng gốc của cả ba hệ đều gây 11 sát thương ở cấp 1 và 168 ở cấp 20, chỉ khác cách phá quân: Hỏa và Thủy phá vùng 2×2, Lôi phá ngẫu nhiên vài quân. Đúng như đã thấy khi quái dùng 2000 và 4000 trong trận ([05-battle](05-battle.md#s2c-20)). [Đo]
- Hiệu ứng khác hẳn nhau: Lôi có tăng phòng thủ (2001), tăng né tránh (2002), giảm phòng thủ địch (2004), phá hàng ngang (2006). Thủy có hồi 11–30% sinh lực (4001), triệt tiêu năng lượng địch (4002). Hỏa có biến quân thành kiếm lửa (1001), tăng tấn công (1002). [Đo]
- **Hệ Lôi là 2.** Game có ba tấm icon kỹ năng `skill1`, `skill2`, `skill4`: tấm 2 toàn tia sét, tấm 1 lửa, tấm 4 băng ([Tab Kỹ năng](#tab-kỹ-năng)). Byte hệ của vật phẩm cũng đánh số như vậy (2 Lôi). Quái hệ Lôi (Sói Xám, Chỉ Huy Sơn Tặc) mang kỹ năng 2000–2008 trong `s2c/22` và dùng 2000 trong trận ([05-battle](05-battle.md#kỹ-năng-trong-trận)). `c2s/30 (2)` trả cây Lôi: 2000 Xích Lôi Công … 2008 Liên Hoàn Lôi Cầu (bảng dưới). [Đo]
- **Gợi ý cho bot**: Liệt Hỏa Chi Kiếm (1003) gây 45 sát thương, gấp 4 lần Hỏa Cầu Thuật cấp 1, với giá 2 thành nội lực. Nó học được từ cấp 10 bằng 2 điểm. [Suy luận]

<a id="tab-kỹ-năng"></a>

## Tab Kỹ năng: cách lấy và cách vẽ

Mở trên máy: Bản thân → Kỹ năng. Ảnh chụp ở E1 (manina cấp 21, Hỏa Cầu Thuật cấp 1, 19 điểm):

| Phần | Lấy từ |
|---|---|
| Cây 9 ô (giữa màn) | Ảnh nền `tree-skill` cộng icon của từng kỹ năng, xem [Vị trí các ô](#vị-trí-các-ô) |
| Icon màu hay xám | Màu khi cấp > 0, xám khi chưa học. Cấp lấy ở danh sách kỹ năng của đuôi `s2c/9`, sau đó là `s2c/10` kiểu 32 |
| Khung góc màu cam | Ô đang chọn. Có lẽ là ảnh `assets/info/skilltree.dat` trong APK (82 × 200, các đoạn khung cam) [Suy luận] |
| "Điểm kỹ năng: 19" | `điểmKỹNăng` của `s2c/9`, sau đó là `s2c/1191` |
| Bảng chi tiết bên phải | Tên, mô tả, điều kiện của từng cấp lấy từ `s2c/30`. Xem [Bảng chi tiết](#bảng-chi-tiết-kỹ-năng) |
| Nút "Nâng cấp" | Gửi `c2s/1191 (mã, 1)`, xem [Nâng cấp kỹ năng](#c2s-1191) |

Giống túi đồ, không có gói nào để hỏi kỹ năng. `s2c/30` (cây của hệ) và `s2c/9` (cấp từng kỹ năng, điểm) đến lúc đăng nhập. Mở tab không gửi gì. [Đo]

Trong trận, `s2c/22` mở trận ghi 9 ô kỹ năng của mỗi bên (`-1` là ô chưa học), và nhân vật dùng kỹ năng bằng `c2s/20`. Xem [Kỹ năng trong trận](05-battle.md#kỹ-năng-trong-trận) và [c2s/20](05-battle.md#c2s-20).

<a id="vị-trí-các-ô"></a>

### Vị trí các ô

Ảnh nền `assets/x1/skill/tree-skill.dat` trong APK (288 × 347) vẽ sẵn 9 khung 60 × 60 và các mũi tên. Kỹ năng `1000 × hệ + i` nằm ở khung `i`:

```text
                [0] gốc
       ┌─────────┼─────────┐
      [3]        │        [6]
       │        [1]        │
      [4]        │        [7]
       │        [2]        │
      [5]                 [8]
```

| `i` | Nhánh | Góc trên trái (x, y) | Hỏa | Thủy |
|---:|---|---|---|---|
| 0 | gốc | 114, 0 | Hỏa Cầu Thuật | Băng Tiễn Thuật |
| 1, 2 | giữa | 114, 155; 114, 243 | Hỏa Kiếm Thuật → Đại Lực Công | Hàn Lưu Thánh Thủy → Độc Thủy Ám Thuật |
| 3, 4, 5 | trái | 0, 111; 0, 199; 0, 287 | Liệt Hỏa Chi Kiếm → Phích Lịch Hỏa Sư → Hỏa Long Chưởng | Băng Đao Kích → Nghịch Thủy Hàn Kiếm → Băng Long Chưởng |
| 6, 7, 8 | phải | 227, 111; 227, 199; 227, 287 | Thiên Hỏa Kích → Dung Nham Địa Ngục → Hỏa Phụng Liêu Nguyên | Tuyết Sơn Áp Đỉnh → Bách Băng Chi Kiếm → Mưa Sao Băng |

- Vị trí đo từ khung xanh trong ảnh nền. Chỗ của từng kỹ năng khớp ảnh chụp E1. Ghép icon theo bảng này ra đúng cây như trên máy. [Đo]
- Mũi tên trong ảnh nền nối mỗi ô với ô `họcTrước` của nó trong `s2c/30`: 1001 cần 1000, 1002 cần 1001, 1004 cần 1003… [Đo]
- Cây Lôi và Thủy có cùng quan hệ học trước như cây Hỏa ([bảng](#bảng-kỹ-năng)), nên mũi tên của ảnh nền cũng khớp, và các kỹ năng của hai cây này xếp theo `i` như cột Thủy. Hai cây này chưa chụp trên máy. [Đo cấu trúc; ảnh Chưa chụp]

**Icon** nằm trong `files/dyncache/offline-a2/` trên máy, mã hoá như icon vật phẩm ([giải mã asset](13-drops-items.md#giải-mã-asset)):
- `skill<hệ>.dat` là một hàng 9 icon 84 × 84 (ảnh 756 × 84). Ô thứ `i` là icon của kỹ năng `1000 × hệ + i`. Có `skill1` (Hỏa), `skill2` (Lôi), `skill4` (Thủy). [Đo]
- `skill<hệ>grey.dat` là cùng các icon đó, màu xám, cho kỹ năng chưa học. [Đo]
- APK có bản nhỏ 42 × 42 ở `assets/x1/skill/`. Icon nút kỹ năng trong trận là `battle_skill.dat` và `battle_skill_disabled.dat` (104 × 104). [Đo]

Repo có các icon đã tách ra từng file: [data/icons/skills/](../../../data/icons/skills/), gồm `<mã>.webp`, `<mã>-grey.webp` và `tree.webp` (ảnh nền). Tổng 55 file, 232 KB.

<a id="bảng-chi-tiết-kỹ-năng"></a>

### Bảng chi tiết

Chạm một ô thì bảng bên phải ghi từng dòng như sau. Phần trong ngoặc nhọn lấy từ `s2c/30`:

```text
{tên}
Cấp tối đa: {cấpTốiĐa}
Cấp hiện tại: {cấp}                       ← đã học: mô tả và nội lực của cấp đang có
{môTả}
- Tiêu hao nội lực: {nộiLực / 25} thành nội lực
Cấp kế tiếp: {cấp + 1}                    ← "Chưa học" nếu cấp 0, rồi mô tả của cấp 1
{môTả}
- Tiêu hao nội lực: {nộiLực / 25} thành nội lực
Điều kiện để học
+ Nhân vật đạt cấp: {cấpNhânVật}
+ Phải học: {tên kỹ năng họcTrước}        ← chỉ khi có họcTrước
+ Tiêu hao: {điểmKỹNăng} điểm kỹ năng
```

- Đối chiếu từng chữ với ảnh E1: Hỏa Cầu Thuật (đã học, cấp 1), Phích Lịch Hỏa Sư và Hỏa Kiếm Thuật (chưa học). Dòng tên và dòng "Chưa học" màu đỏ khi chưa học. Dòng "Cấp hiện tại" màu xanh. "Cấp kế tiếp" và các dòng điều kiện màu đỏ, kể cả điều kiện đã đủ. [Đo]
- Ảnh của Hỏa Cầu Thuật bị cắt sau dòng "Điều kiện để học". Hai dòng cuối của kỹ năng đã học suy theo kỹ năng chưa học. Kỹ năng đã tối đa thì có lẽ không có phần "Cấp kế tiếp". [Suy luận]

<a id="cách-lấy-kỹ-năng"></a>

### Cách lấy

**1. Bot TS:** `npm run skills` đăng nhập, in cây rồi ngắt. Ngoài các gói đăng nhập, nó không gửi gì. Phải thoát game trên điện thoại trước, như với [`npm run bag`](#cách-lấy-túi-đồ). Chạy thật ngày 31/10:

```text
{"event":"character","name":"manina","level":21,"element":"Hỏa","skillPoints":16}
{"event":"skills","skills":["1000 Hỏa Cầu Thuật 4/20 (gốc): cần cấp 22","1001 Hỏa Kiếm Thuật 0/20 (giữa 1): học được, 2 điểm",
  "1002 Đại Lực Công 0/20 (giữa 2): cần cấp 32, phải học Hỏa Kiếm Thuật", …]}
```

`--panel` in thêm bảng chi tiết của mọi kỹ năng, `--panel=1004` chỉ in một kỹ năng:

```text
{"event":"skill_panel","id":1004,"icon":"data/icons/skills/1004-grey.webp","lines":["Phích Lịch Hỏa Sư","Cấp tối đa: 20","Chưa học",
  "Tấn công và gây 73 sát thương cho đối phương.","- Tiêu hao nội lực: 3 thành nội lực","Điều kiện để học","+ Nhân vật đạt cấp: 32",
  "+ Phải học: Liệt Hỏa Chi Kiếm","+ Tiêu hao: 3 điểm kỹ năng"]}
```

`--trees` xin thêm `c2s/30` cho cả ba hệ (1, 2, 4) rồi ghi [data/skills.json](../../../data/skills.json): 27 kỹ năng, mỗi kỹ năng 20 cấp (mô tả, điểm, cấp nhân vật, nội lực), một kỹ năng một dòng. Gói `c2s/30` này giống gói app gửi lúc đăng nhập, chỉ khác byte hệ.

Code: [src/skills.ts](../../../src/skills.ts) (`SKILL_TREE` vị trí ô, `skillTree` trạng thái từng ô, `skillPanel` bảng chi tiết) và [src/skills-run.ts](../../../src/skills-run.ts). Bot làm nhiệm vụ cũng dùng `skillTree` để chọn kỹ năng nâng cấp.

**2. Trên Android, bắt gói:** như [túi đồ](#cách-lấy-túi-đồ). Gắn Frida khi game đang ở màn đăng nhập, rồi bấm đăng nhập để ghi `s2c/9` và `s2c/30`. Đọc bằng `characterSkills` ([src/protocol.ts](../../../src/protocol.ts)) và `skillTable` ([src/world.ts](../../../src/world.ts)).

**3. Icon và ảnh nền, từ file của game:**

```bash
npm run items -- --adb=192.168.2.3:5555 --apk=colauloanthe.1.0.3.apk
```

Lệnh này chép `skill*.dat` từ máy đã root (không cần mở game), cắt từng icon, đổi sang WebP trong `data/icons/skills/`. Với `--apk`, nó lấy thêm ảnh nền cây từ APK ([cách lấy lại dữ liệu](13-drops-items.md#cách-lấy-lại-dữ-liệu)).

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
u8 field1; u8 hệ (1 Hỏa, 2 Lôi, 4 Thủy; 0xff ở vật phẩm thường); i32 field2; u8 field3; u8 field4; u8 n; n × {i32 chỉSố; i32 giáTrị}
```

Vật phẩm trên đất có thêm `i32 x; i32 y; i64 hếtHạn` ở cuối. Byte `hệ` trước đây ghi là "phẩm". Popup trên máy (31/10) vẽ biểu tượng hệ theo byte này: Rìu Âu Lạc và Áo Hào Kiệt (1) có ngọn lửa, Nón Âu Lạc (2) có tia sét. Cả ba đều ghi "Phẩm chất: Hiếm". 4 là Thủy theo cách đánh số hệ nhân vật của `s2c/9` (1 Hỏa, 4 Thủy). [Đo 1, 2; Suy luận 4] `field0`, `field2`, `field3` bằng 0 ở mọi mẫu, có thể là cấp cường hoá. `field4` bằng 1 ở mọi trang bị. [Đo giá trị; vai trò Chưa rõ]

| Gói | Khi nào | Bố cục | Mẫu |
|---|---|---|---|
| `s2c/42` | Trả `c2s/42 (string tênNhânVật)` lúc đăng nhập | `string "test dong 1"; i32 42; i32 3; u8 2; i32 sứcChứa; i32 n; n × bản ghi` | 608/608 byte, 8 món, sức chứa 42 |
| `s2c/1187` | Mỗi khi túi đổi: sửa đồ (E2), trả nhiệm vụ (L1, Q2) | `u8 1; i32 sứcChứa; i32 n; n × bản ghi` (cả túi) | 519/519 byte, 7 món sau khi sửa |
| Đuôi `s2c/9` | Lúc đăng nhập | Sau danh sách kỹ năng: `i32 8; 8 × (u8 0xff: ô trống \| bản ghi)`, byte `ô` của bản ghi bằng số ô | Ô 0 nón, ô 2 vũ khí, 6 ô trống ([Ô trang bị](#ô-trang-bị)) |

- Sức chứa 42 khớp túi 50 ô trên máy có 8 ô khoá. Trước đây [09](09-players-chat.md#gói-khác-thấy-trong-l1-người-chơi-tự-bấm-trên-máy) đọc `0000002a` của `s2c/1187` là "mã 42", nhưng đó là sức chứa. [Đo]
- `i32 42; i32 3` sau chuỗi "test dong 1" của `s2c/42` chưa rõ nghĩa. [Chưa rõ]

### Đồ của manina (E1, E2; popup ngày 31/10)

| Ô | Mã | Món | Số lượng | Độ bền | Hệ | Chỉ số | Căn cứ |
|---|---:|---|---:|---:|---:|---|---|
| Túi 0 | 0 | Hoàn Linh Dược | 4 | | | | Popup: "Bơm 30% sinh lực" [Đo] |
| Túi 1 | 412 | Đá cấp 2 | 1 | | | | [bảng vật phẩm](13-drops-items.md#bảng-vật-phẩm) [Đo] |
| Túi 2 | 147 | Áo Hào Kiệt | 1 | 60 | 1 Hỏa | 6: 7; 3: 5 | Thưởng nhiệm vụ 3. Popup: ngọn lửa, Hiếm, "Độ bền 60/60, +7 phòng thủ, +5 thân pháp", nút Trang bị và Vứt bỏ [Đo] |
| Túi 3 | 48 | Nón Lá | 1 | 60 | 1 Hỏa | 6: 5; 9: 66 | Thưởng nhiệm vụ 3; bảng vật phẩm [Đo] |
| Túi 4 | 306 | Nhẫn Trơn | 1 | 60 | 1 Hỏa | 5: 9; 8: 1 | Thưởng nhiệm vụ 4; bảng vật phẩm [Đo] |
| Túi 5 | 415 | Đá cấp 5 | 1 | | | | Viên màu cam; [bảng vật phẩm](13-drops-items.md#bảng-vật-phẩm) [Đo] |
| Túi 6 | 2 | Búa sửa chữa | 1 | | | | Mất khỏi túi sau khi sửa [Đo] |
| Túi 7 | 1 | Kim Đan Dược | 1 | | | | Bình xanh; [bảng vật phẩm](13-drops-items.md#bảng-vật-phẩm) [Đo] |
| Trang bị 0 | 54 | Nón Âu Lạc | 1 | 0 → 60 (sửa ở E2) → 55 | 2 Lôi | 6: 4; 9: 58 | Popup: tia sét, Hiếm, "Độ bền 55/60, +4 phòng thủ, +58 sinh lực", "Bộ cùng hệ (0/4)", nút Cởi ra và Sửa chữa [Đo] |
| Trang bị 2 | 261 | Rìu Âu Lạc | 1 | 0 | 1 Hỏa | 5: 8; 2: 10 | Popup: ngọn lửa, Hiếm, "Độ bền 0/60", "Cần 1 búa để sửa chữa". Vẫn hỏng, nên chỉ số không tính [Đo] |

- **Mã chỉ số** theo bảng `it0` của game ([mã chỉ số](13-drops-items.md#mã-chỉ-số)): 2 nội lực, 3 thân pháp, 5 sức tấn công, 6 phòng thủ, 8 % chí mạng, 9 sinh lực. Mã 6 và 9 khớp popup Nón Âu Lạc. [Đo]
- **Phẩm chất**: mọi trang bị đã mở popup đều là "Hiếm", dù byte hệ là 1 hay 2. Tên phẩm trong `.so`: Thường, Hiếm, Quý, Sử Thi. Phẩm chất nằm ở trường nào thì chưa rõ, có thể là `field4` (bằng 1 ở mọi trang bị). [Chưa rõ]
- **Đang mặc** (bảng Bản thân, 31/10): ô 0 Nón Âu Lạc (đang bật "Ẩn Nón" nên nón không hiện trên người), ô 2 Rìu Âu Lạc (hỏng). Áo Hào Kiệt, Nón Lá, Nhẫn Trơn còn trong túi, chưa mặc. Dưới bảng: Xu 500, Xu khóa 7.370, Lượng 0; thanh Vàng 2708/10000. Mỗi món trong túi có hình ổ khoá nhỏ (món đã khoá). [Đo]
- Hai trang bị hỏng từ Q6 ([10-quests](10-quests.md#kết-quả-q3-q4)) chính là chiếc nón (mã 54) và vũ khí (mã 261), cả hai độ bền 0 trong `s2c/9`. [Đo]

<a id="ô-trang-bị"></a>

### Ô trang bị

Bảng **Bản thân → Trang bị** (31/10) có 8 ô quanh nhân vật:

| Cột trái, từ trên | Cột phải, từ trên |
|---|---|
| Nón (ô 0, đang có Nón Âu Lạc) | Vũ khí (ô 2, đang có Rìu Âu Lạc) |
| Áo (hình bộ giáp) | Nhẫn (hình chiếc nhẫn) |
| Hình đầu người | Cánh (hình đôi cánh) |
| Huy hiệu ngôi sao (danh hiệu?) | Thú cưng (hình con vật) |

- Số ô = `loại` của bảng vật phẩm. manina có ô 0 (nón) và 2 (vũ khí). symap (Tiheo1, R3) có ô 0 Nón Hào Kiệt, 1 Áo Thuật Sĩ, 2 Chiến Đao, 3 Nhẫn Đại Hiệp, 5 Thú cưng Chồn nhỏ (+19 cường lực). Ô 4 có lẽ là cánh, 7 là danh hiệu. Ô 6 (hình đầu người) không có loại nào trong `it1`. [Đo ô 0, 1, 2, 3, 5; còn lại Suy luận]
- Ô "Ẩn Nón" dưới nhân vật chỉ ẩn nón khi vẽ, món vẫn mặc. [Đo]

<a id="hiển-thị-vật-phẩm"></a>

### Hiển thị một món

Theo popup trên máy, một món gồm:

| Phần | Lấy từ |
|---|---|
| Icon | `data/icons/i<icon>.webp`, `icon` theo `mãVậtPhẩm` trong [bảng vật phẩm](13-drops-items.md#bảng-vật-phẩm). Khung màu nằm sẵn trong ảnh |
| Số lượng ở góc icon | `sốLượng` của bản ghi. Máy vẽ số cho món xếp chồng được (`xếpChồng` > 1), kể cả khi chỉ có 1 (Kim Đan Dược "1"). Trang bị không có số |
| Biểu tượng hệ, tên | Byte `hệ` (ngọn lửa 1, tia sét 2), `tên` trong bảng |
| Phẩm chất | Chưa rõ trường (mọi trang bị đã xem: Hiếm) |
| Yêu cầu cấp | `cấpMặc` trong bảng |
| Độ bền | `độBền` của bản ghi / `độBềnTốiĐa` trong bảng, ví dụ 55/60. Màu đỏ khi bằng 0 |
| Chỉ số | Từng `{chỉSố; giáTrị}` theo mẫu `it0`, ví dụ `+ 4 phòng thủ` |
| Bộ cùng hệ (n/4) | Số món cùng hệ đang mặc. Cẩm nang: đủ 4 món cùng hệ thì +8% tấn công và +8% sinh lực |
| Nút | Món đang mặc: Cởi ra, Sửa chữa. Món trong túi: Trang bị, Vứt bỏ |

Bot TS ghi dạng chữ ([src/items.ts](../../../src/items.ts)):
- Túi đồ: `"Hoàn Linh Dược ×4"`, `"Nón Lá (+5 phòng thủ, +66 sinh lực)"`, trong sự kiện `inventory`. Bản chữ chỉ ghi ×n khi số lượng lớn hơn 1.
- Trang bị đang mặc: `"0: Nón Âu Lạc (+4 phòng thủ, +58 sinh lực), hệ Lôi, độ bền 55/60"`, trong sự kiện `gear` lúc đăng nhập.

Cẩm nang về trang bị (C1):
- Nón, Áo, Vũ khí, Nhẫn chia bậc theo cấp mặc (1, 21, 51, 101, 151, 201). Cường hoá ở NPC Pháp Sư: bậc 1 tới +4, bậc 21 tới +8.
- Độ bền giảm khi đánh và bị đánh (trừ đấu với người chơi). Hết độ bền thì món mất tác dụng, cần Sửa chữa.
- Đúng hệ nhân vật thì chỉ số của món được +5%. Đủ 4 món cùng hệ thì được thêm +8% tấn công và +8% sinh lực.

<a id="cách-lấy-túi-đồ"></a>

### Cách lấy túi đồ và trang bị

Không có gói nào để hỏi túi đồ. Server tự gửi, và chỉ gửi vào hai lúc:
- **Lúc đăng nhập**: đuôi `s2c/9` có 8 ô trang bị, `s2c/42` có cả túi.
- **Khi túi đổi** (nhận thưởng, sửa đồ, nhặt đồ): `s2c/1187` gửi lại cả túi.

Mở túi hay bảng Bản thân trong game không gửi gói nào, vì máy chỉ vẽ lại dữ liệu đã có. [Đo E1, E2]

Muốn đọc túi đồ thì phải có mặt lúc đăng nhập, hoặc đợi túi đổi. Có ba cách:

**1. Bot TS, không cần điện thoại.** Lệnh này đăng nhập, in đồ rồi ngắt. Ngoài các gói đăng nhập, nó không gửi gì.

```bash
npm run bag
```

```text
{"event":"character","name":"manina","level":21}
{"event":"gear","gear":["0: Nón Âu Lạc (+4 phòng thủ, +58 sinh lực), hệ Lôi, độ bền 55/60","1: trống","2: Rìu Âu Lạc (+8 sức tấn công, +10 nội lực), hệ Hỏa, độ bền 0/60","3: trống",…]}
{"event":"bag","capacity":42,"items":["0: Hoàn Linh Dược ×4","1: Đá cấp 2","2: Áo Hào Kiệt (+7 phòng thủ, +5 thân pháp), hệ Hỏa, độ bền 60/60",…]}
```

- Tài khoản lấy từ `CLLT_USERNAME` và `CLLT_PASSWORD` trong `.env`.
- **Phải thoát game trên điện thoại trước.** Nếu nick đang online ở máy khác, server trả `s2c/0` và từ chối đăng nhập.
- Code: [src/bag-run.ts](../../../src/bag-run.ts).
- `npm run quest` cũng ghi các sự kiện `gear` và `inventory` khi chạy ([quest-bot](../../integration/nodejs/quest-bot.md)).
- Chạy thật ngày 31/10 sau khi tắt game trên máy: ra đúng đồ trên máy. Búa sửa chữa đã hết, nên ô 6 của túi trống. [Đo]

**2. Trên Android, bắt gói lúc game đăng nhập.** Cách này dùng khi muốn xem chính gói của app, như phiên E1:
1. Mở game, dừng ở màn đăng nhập.
2. Frida attach vào `com.lotasoft.colauloanthe`, hook native reader (cách hook ở [Điều tra lại](../reinvestigation.md#3-thu-lại-từ-boot-tới-thế-giới)).
3. Bấm đăng nhập. Ghi payload của `s2c/9` và `s2c/42`, sau đó là mọi `s2c/1187`.
4. Đọc payload bằng `characterGear` (đuôi `s2c/9`), `characterExtra` (`s2c/42`) và `inventory` (`s2c/1187`) trong [src/world.ts](../../../src/world.ts). Đổi mã ra tên bằng `Items` trong [src/items.ts](../../../src/items.ts).

Nếu attach khi đã vào game thì đã lỡ `s2c/9` và `s2c/42`. Lúc đó chỉ còn bắt được `s2c/1187` khi túi đổi. [Đo]

**3. Xem tay trên điện thoại.** Mở Bản thân → Trang bị để xem 8 ô, rồi chạm từng món để mở popup (tên, hệ, độ bền, chỉ số). Chỉ chạm vào món để xem, đừng bấm nút trong popup. Nút Sửa chữa gửi `c2s/48` và tốn búa. Các nút Trang bị, Cởi ra, Vứt bỏ hẳn cũng gửi gói và làm đổi đồ, nhưng chưa đo.

**Tên đồ và icon** cũng lấy từ Android, từ file của game trên máy đã root (không cần mở game):

```bash
npm run items -- --adb=192.168.2.3:5555
```

Lệnh này ghi lại `data/items.json` và `data/icons/` ([13-drops-items](13-drops-items.md#cách-lấy-lại-dữ-liệu)).

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
| Đồ rơi | Hòm đồ có thể rơi sau trận. Đứng lên hòm rồi bấm Nhặt | `s2c/1182`; nút Nhặt gửi `c2s/1188 (uuid)`, đọc tĩnh, chưa gửi thử ([13](13-drops-items.md#c2s-1188)) |
| Nhiệm vụ hằng ngày | Nhận ở Hương Lão Trần Bá, tối đa 3 một ngày, làm từng cái một, trả cũng ở đó, huỷ được. Thưởng EXP, Xu khoá hoặc vật phẩm | Tab "Phụ" hiện "Chưa có nhiệm vụ" |
| Quà cấp | Đạt cấp 20, 40, 60… tới 200 thì nhận quà qua Hòm thư | manina cấp 21 |
| Bản đồ thế giới | Chạm một thành rồi "Vào thành" để đi nhanh. Ổ khoá nghĩa là phải làm tiếp nhiệm vụ chính | Cổng Hồng Giang ([10-quests](10-quests.md#cổng)) |
| Bạch Hổ | Boss thế giới ở Hang Bạch Hổ (Luyện Ngục), 9:00–9:59 mỗi ngày. Không có EXP, thua không bị trừ. Top 5 sát thương nhận quà qua thư | |
| Lôi đài | Đấu tự do với người chơi. Sát thương chỉ còn 60%, bỏ lỡ 3 lượt là thua, tối đa 8 phút hoặc 40 hành động mỗi bên | |
| Tiền | Xu (Chợ trời, góp quân lương), Xu khoá (cửa hàng NPC, cường hoá), Lượng (tiền nạp) | Bảng Bản thân: 500 Xu, 7.370 Xu khoá, 0 Lượng = `s2c/46` |

## Chưa rõ

- Nghĩa hai trường của `c2s/48`, và biến thể `a46` (`u8; i32; i32`).
- Gói dùng bình, nhận và trả nhiệm vụ hằng ngày, mua ở NPC. Gói nhặt đồ `c2s/1188` đã bắt trên máy (P3), bot chưa gửi thử ([13](13-drops-items.md#p3)).
- `c2s/10` của Nội Lực (1) và Thể Lực (3) chưa đo trực tiếp; nút "Cộng nhiều".
- Sau sửa đồ, chỉ số có đổi trước lần `s2c/10` sau (sau trận, đăng nhập lại) không.
- Cây kỹ năng và giá trị `field01` của hệ Lôi.

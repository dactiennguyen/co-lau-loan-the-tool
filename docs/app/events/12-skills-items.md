# Kỹ năng, điểm tiềm năng, túi đồ, mặc, sửa và dùng đồ

Mốc: APK 1.0.3, ngày 31/10/2026, nhân vật `manina` cấp 21 ở M2; từ P4 thêm `symap` (Tiheo1) cấp 42 ở M10. Nguồn ([các phiên](../investigation.md#nguồn-dữ-liệu)):
- **E1, E2**: điện thoại, Frida hook writer/reader và 114 hàm dựng gói `com.mh.sqlq` (bỏ các gói đăng nhập `c2s/1…8`), ADB chạm màn hình. E1 có lỗi trong agent nên chỉ ghi được gói nhận và tham số của hàm dựng; E2 ghi đủ hai chiều.
- **C1**: Cẩm nang trong game (Chức năng → Cẩm nang), chụp từng trang.
- **T1**: phân tích tĩnh hàm dựng gói ([bảng 125 hàm](../c2s-builders.md)).
- **P1**: điện thoại, Frida hook writer/reader cho `c2s/10`, `s2c/10`, `s2c/1191` và hàm dựng `d50`, `e52`; ADB bấm "Cộng +1" một lần cho Thân Pháp của manina.
- **K1**: bot TS ([quest-bot](../../integration/nodejs/quest-bot.md)) đăng nhập nick thứ hai (hệ Thủy, cấp 3, nhiệm vụ 3 ở bước "Sử dụng điểm kỹ năng"): hai lần chỉ đọc, một lần thử `c2s/30` với hệ 4, rồi `--once` làm bước kỹ năng.
- **T4, R2**: ảnh nền cây và icon kỹ năng trong APK và `offline-a2`, đối chiếu ảnh chụp tab Kỹ năng; `npm run skills` ([Tab Kỹ năng](#tab-kỹ-năng)).
- **R1**: `npm run bag` đọc túi và trang bị bằng bot TS ([Cách lấy](#cách-lấy-túi-đồ)).
- **P4**: điện thoại với Tiheo1, Frida gắn trước khi đăng nhập; cởi và mặc lại thú cưng, sửa Chiến Đao, bấm Sử dụng ở bình máu; đọc đuôi `s2c/9` của 3 nick ([Mặc và cởi đồ](#c2s-1186), [x2 EXP](#x2-exp)).
- **K3**: bot TS với Tiheo2 (nhân vật Ttuananh, hệ Thủy cấp 15, M1): vứt viên Đá cấp 2 nhặt được từ đất ([Vứt bỏ](#vứt-bỏ)); phần nhặt đồ ở [13](13-drops-items.md#k3).
- **P5**: điện thoại với Tiheo2, Frida ghi mọi gói: tới Lái Buôn (M1, đổi sang khu 2 vì khu 0 đông người che NPC), mở Dược phẩm, mua 1 Hoàn Linh Dược bằng Xu khóa, rồi dùng nó trong trận với Sơn Tặc ([Mua ở Lái Buôn](#c2s-1190), [Dùng trong trận](#c2s-44)).
- **B1**: bot TS với manina (cấp 21, ngày 31/10), `npm run buy`: mở cửa hàng Lái Buôn từ M2 rồi từ M1, mua 1 Búa Sửa Chữa bằng 80 Xu khóa ([Mua bằng bot TS](#mua-bằng-bot)).
- **I1** (31/10): điện thoại với Tiheo2 (Ttuananh cấp 18, M1), Frida ghi mọi gói (scratchpad `live/capture.py` với `agent-v3.js`), ADB chạm: mở Bản thân → Trang bị, bấm **Sắp xếp**, chạm Đá cấp 2 và Nhẫn Trơn để xem popup, bấm Vứt bỏ rồi **Hủy** ([Sắp xếp](#sắp-xếp)).

Bộ giải mã: [src/protocol/world.ts](../../../src/protocol/world.ts) (`skillTable`, `characterTail`, `gearUpdate`), [src/protocol/skills.ts](../../../src/protocol/skills.ts), [src/protocol/items.ts](../../../src/protocol/items.ts); hàm dựng gói ở [src/protocol/events.ts](../../../src/protocol/events.ts). Test: [test/skills.test.ts](../../../test/skills.test.ts), [test/items.test.ts](../../../test/items.test.ts), [test/quest.test.ts](../../../test/quest.test.ts).

Nhãn **[Đo]**, **[Suy luận]**, **[Chưa rõ]** như các file khác.

## Trả lời nhanh

| Câu hỏi | Trả lời |
|---|---|
| Bước "Sử dụng điểm kỹ năng" làm bằng gói gì? | **`c2s/1191 (i32 mãKỹNăng; i32 1)`**. Server trả `s2c/10` kiểu 32 (cấp của mọi kỹ năng), `s2c/1191` (điểm tiềm năng, điểm kỹ năng còn lại) và `s2c/34` (bước sau). Bot TS đã làm được bước này với server thật (K1). Xem [Nâng cấp kỹ năng](#c2s-1191). [Đo] |
| Cộng điểm tiềm năng thế nào? | `c2s/10 (i32 chỉSố; i32 số)`. Số chỉ số theo nút "+" trên bảng: 0 Cường Lực, 1 Nội Lực, 2 Thân Pháp, 3 Thể Lực. Nhưng `stats` của `s2c/9` xếp Thân Pháp trước Nội Lực. manina còn **67 điểm**. Bot TS cộng hết bằng `--stats`. Xem [Điểm tiềm năng](#điểm-tiềm-năng). [Đo P1] |
| Học được kỹ năng nào, tốn gì? | `s2c/30` là bảng 9 kỹ năng của **hệ mà `c2s/30` xin** (1 Hỏa, 2 Lôi, 4 Thủy; app gửi hệ của nhân vật). Mỗi cấp ghi số điểm kỹ năng, cấp nhân vật và nội lực cần có. Xem [Bảng kỹ năng](#bảng-kỹ-năng). [Đo] |
| Lấy kỹ năng và giao diện tab Kỹ năng thế nào? | Không có gói xin riêng: `s2c/30` (cây của hệ) và đuôi `s2c/9` (cấp từng kỹ năng, điểm) đến lúc đăng nhập. `npm run skills` in cả cây. Icon nằm ở `offline-a2/skill<hệ>.dat`, ảnh nền cây ở APK; repo có bản WebP ở `data/icons/skills/`. Xem [Tab Kỹ năng](#tab-kỹ-năng). [Đo] |
| Lấy danh sách đồ thế nào? | Không có gói xin riêng. Lúc đăng nhập: `s2c/42` (trả `c2s/42`) chứa túi đồ, đuôi `s2c/9` chứa 8 ô trang bị. Mỗi khi túi đổi, server gửi lại cả túi bằng `s2c/1187`. Mở túi trong game không gửi gói nào. `npm run bag` đăng nhập và in cả hai. Xem [Túi đồ và trang bị](#túi-đồ) và [Cách lấy](#cách-lấy-túi-đồ). [Đo] |
| Mặc, cởi, vứt đồ bằng gói gì? | **`c2s/1186 (u8 action; i32 ô)`**: 0 mặc món ở ô túi, 1 cởi món ở ô trang bị, 2 vứt bỏ món ở ô túi. Mặc, cởi: server trả `s2c/10` kiểu 4 (chỉ số mới), `s2c/37` (8 ô trang bị), `s2c/42` (cả túi) và `s2c/1186` (P4, 2 lần). Vứt: `s2c/83 (ô; 0)`, món bị huỷ (K3). Xem [Mặc và cởi đồ](#c2s-1186), [Vứt bỏ](#vứt-bỏ). [Đo] |
| Có nút sắp xếp túi không? | **Có**: nút "Sắp xếp" dưới túi (Bản thân → Trang bị). Nút gửi **`c2s/1257`** không có nội dung. Server dồn các món lên lấp ô trống, giữ nguyên thứ tự, rồi gửi lại cả túi bằng `s2c/1187` và một `s2c/1111` rỗng, sau 45 ms. Xem [Sắp xếp](#sắp-xếp). [Đo I1] |
| Có nút mặc đồ tốt nhất không? | **Không.** Màn Trang bị chỉ có Sắp xếp; popup từng món chỉ có Trang bị và Vứt bỏ (đồ mặc được) hoặc Sử dụng và Vứt bỏ. Thư viện game cũng không có chuỗi nào cho việc này. Muốn có thì bot hay app tự chọn món rồi gửi `c2s/1186 (0, ô túi)` cho từng món. Món phải đúng giới tính (`gender` của [bảng vật phẩm](13-drops-items.md#bảng-vật-phẩm)): server lặng lẽ bỏ qua món sai giới tính ([Mặc và cởi đồ](#mặc-cởi)). [Đo I1] |
| Ngôi sao xanh "x2" ở góc trái là gì? | Nhân đôi EXP thắng trận của vật phẩm **Tăng Kinh Nghiệm (mã 7)**, 24 giờ, trôi cả lúc offline. Không phải mặc định: server gửi nó trong đuôi `s2c/9` (`"ef7"`, tỉ lệ 200000, ms còn lại), chỉ nick đã dùng món mới có. Xem [x2 EXP](#x2-exp). [Đo] |
| Sửa đồ bằng gói gì? | **`c2s/48 (u8; i32)`**: sửa chiếc nón đang đội là `00 00000000`. Mỗi lần sửa tốn 1 Búa sửa chữa (mã 2), không tốn Xu. Server trả `s2c/1187` (túi đã mất búa) rồi `s2c/48`. Xem [Sửa đồ](#c2s-48). [Đo] |
| Hồi máu thế nào? | Hoàn Linh Dược (mã 0, manina có 4 bình) hồi 30% sinh lực tối đa, chỉ dùng được **trong trận**: nút Túi đồ → chạm bình gửi **`c2s/44 (uuidTrận; 0; ô túi)`**, P5 đo hồi +36 (31 → 67 trên 145) ([Dùng trong trận](#c2s-44)). Ngoài trận nút Sử dụng gửi `c2s/84 (i32 ô túi)` nhưng server từ chối bình: "Vật phẩm không thể sử dụng!" ([Dùng vật phẩm](#c2s-84), P4). Từ cấp 11, máu mang sang trận sau; thua vì hết máu thì được hồi đầy (C1, khớp Q16, Q19). |
| Mua đồ ở NPC thế nào? | Lái Buôn (NPC 106, M1): `c2s/13 (M1, 106)` → `s2c/57` (hộp thoại 3 dòng) → `c2s/57 (1, M1, 106)` chọn Dược phẩm → `s2c/1190` (8 món, mỗi món có mã ô cửa hàng, giá và loại tiền) → **`c2s/1190 (0; ô cửa hàng; số lượng)`**. Server trả câu báo `s2c/1256`, rồi cả túi (`s2c/42`, món mới ở ô trống đầu tiên) và tiền (`s2c/46`). Bình máu bán hai giá: 109 Xu (ô 0) hoặc 120 Xu khóa (ô 4); Búa Sửa Chữa 73 Xu hoặc 80 Xu khóa. Bot gửi thẳng được, không cần đứng gần NPC, nhưng **phải đang ở M1**: từ map khác server trả "Không thể thực hiện". Xem [Mua ở Lái Buôn](#c2s-1190). Vũ khí, Cửa hàng [Lượng] và đồ của Bà Tư Hạnh mua bằng cùng gói, chỉ khác ô ([14 cửa hàng](15-shops.md)). [Đo P5, B1, J1] |
| Nhiệm vụ hằng ngày lấy ở đâu? | Gặp Hương Lão Trần Bá (NPC 102, M1) → "Nhiệm vụ hằng ngày" → "Nhận nhiệm vụ". Tối đa 3 nhiệm vụ một ngày, làm từng cái một (C1). Hộp thoại đã đo ("Hôm nay con đã nhận 0/3 nhiệm vụ hàng ngày.", [Hương Lão](14-npc.md#hương-lão)); gói nhận nhiệm vụ chưa bắt. |

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

`s2c/30` trả `c2s/30 (u8 hệ)` lúc đăng nhập. Hệ là `field01` của `s2c/9`: 1 Hỏa, 4 Thủy, và theo icon thì 2 Lôi. App gửi `sqlq.e49(1)` cho manina. Client TS từng luôn gửi 1, nên nick thứ hai (hệ 4) nhận nhầm cây Hỏa. K1 gửi 4 thì nhận cây Thủy. Mã kỹ năng là 1000 × hệ + 0…8, khớp danh sách kỹ năng trong `s2c/9`. [Đo]

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
- **Gợi ý cho bot** (mô phỏng A2, [07-auto-battle](07-auto-battle.md#chọn-hành-động)): nâng kỹ năng gốc trước. Nó cho nhiều sát thương nhất trên mỗi điểm nội lực: Hỏa Cầu Thuật cấp 4 của manina gây khoảng 78 cho 25 nội lực, trong khi Liệt Hỏa Chi Kiếm (1003, 45 sát thương, 50 nội lực) chỉ khoảng 75 cho 50. Bot dùng kỹ năng gốc ngay khi có lợi, nên kỹ năng 50 nội lực hiếm khi đến lượt. Với Tiheo2: Băng Tiễn Thuật cấp 4 cho thêm khoảng 13% trận thắng mỗi giờ; Hàn Lưu Thánh Thủy cấp 2, Băng Đao Kích, Tuyết Sơn Áp Đỉnh gần như không đổi gì. [Mô phỏng]
- Bot đọc hiệu ứng của mọi cấp (540 mô tả, 14 dạng câu) bằng `skillEffect` trong [src/battle/battle-actions.ts](../../../src/battle/battle-actions.ts) để chọn kỹ năng trong trận. [Đo: test đọc hết data/skills.json]

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

Code: [src/protocol/skills.ts](../../../src/protocol/skills.ts) (`SKILL_TREE` vị trí ô, `skillTree` trạng thái từng ô, `skillPanel` bảng chi tiết) và [src/cli/skills-run.ts](../../../src/cli/skills-run.ts). Bot làm nhiệm vụ cũng dùng `skillTree` để chọn kỹ năng nâng cấp.

**2. Trên Android, bắt gói:** như [túi đồ](#cách-lấy-túi-đồ). Gắn Frida khi game đang ở màn đăng nhập, rồi bấm đăng nhập để ghi `s2c/9` và `s2c/30`. Đọc bằng `characterSkills` ([src/protocol/protocol.ts](../../../src/protocol/protocol.ts)) và `skillTable` ([src/protocol/world.ts](../../../src/protocol/world.ts)).

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
- Đo được (31/10): **HP gốc = 6 × Thể Lực**. manina Thể Lực 30 → 180, cấp 22 (Thể Lực 31) → 186; Tiheo2 Thể Lực 25 → 150. Nón Âu Lạc cộng thêm 58. **Tấn Công = Cường Lực** ở manina (hệ Hỏa): cả hai bằng 32 từ cấp 8 tới 22. Mô phỏng các cách cộng 71 điểm của manina ở [07-auto-battle](07-auto-battle.md#cộng-điểm). [Đo]
- Tẩy Tủy Đan trả lại toàn bộ điểm tiềm năng đã cộng; Tẩy Kinh Đan trả lại toàn bộ điểm kỹ năng.

**Bot TS**: không có `--stats` thì bot chỉ cộng 1 điểm vào Cường Lực ở bước "Nâng điểm tiềm năng". Có `--stats` thì bot cộng hết điểm theo lựa chọn ([quest-bot](../../integration/nodejs/quest-bot.md#chạy)):
- `--stats=auto` cộng vào chỉ số chính của hệ: Cường Lực cho Hỏa (`field01` 1), Thân Pháp cho Lôi (2), Nội Lực cho Thủy (4). Số 2 của Lôi là số `c2s/30` trả cây Lôi, chưa đọc từ nhân vật Lôi nào. Với số hệ khác, bot không cộng điểm nào.
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

Vật phẩm trên đất có thêm `i32 x; i32 y; i64 hếtHạn` ở cuối. Byte `hệ` trước đây ghi là "phẩm". Popup trên máy (31/10) vẽ biểu tượng hệ theo byte này: Rìu Âu Lạc và Áo Hào Kiệt (1) có ngọn lửa, Nón Âu Lạc (2) có tia sét. Cả ba đều ghi "Phẩm chất: Hiếm". 4 là Thủy theo cách đánh số hệ nhân vật của `s2c/9` (1 Hỏa, 4 Thủy). [Đo 1, 2; Suy luận 4] `field0` là cấp cường hoá: 8 ở đồ "+8" của symap, 0 ở đồ của manina ([x2 EXP](#x2-exp)). `field1` là cờ khoá giao dịch: 1 chưa khoá, 0 đã khoá: mua bằng Xu khóa, vừa nâng cấp thành công [Đo J2, J3], hay đã mặc lần đầu [Cẩm nang] ([15-shops](15-shops.md#khoá)). `field2`, `field3` bằng 0 ở mọi mẫu. `field4` bằng 1 ở mọi trang bị, 0 ở thú cưng; có lẽ là phẩm chất. [Đo giá trị; field4 Suy luận]

| Gói | Khi nào | Bố cục | Mẫu |
|---|---|---|---|
| `s2c/42` | Trả `c2s/42 (string tênNhânVật)` lúc đăng nhập | `string "test dong 1"; i32 42; i32 3; u8 2; i32 sứcChứa; i32 n; n × bản ghi` | 608/608 byte, 8 món, sức chứa 42 |
| `s2c/1187` | Mỗi khi túi đổi: sửa đồ (E2), trả nhiệm vụ (L1, Q2) | `u8 1; i32 sứcChứa; i32 n; n × bản ghi` (cả túi) | 519/519 byte, 7 món sau khi sửa |
| `s2c/1187` byte đầu 4 | Chế tạo trang bị ở Pháp sư (O1) | `u8 4; bản ghi` (chỉ món mới thêm vào túi) | 83/83 byte: Nhẫn Thái Cực ở ô 19 ([16-upgrade](16-upgrade.md#chế-tạo)). `inventory()` trả `kind` 4 với một món; bot ghép món đó vào túi đang có, không thay cả túi |
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
- **Phẩm chất**: mọi trang bị đã mở popup đều là "Hiếm", dù byte hệ là 1 hay 2. Tên phẩm trong `.so`: Thường, Hiếm, Quý, Sử Thi. Có lẽ phẩm chất là `field4` của bản ghi: 1 ở mọi trang bị, 0 ở thú cưng, mà popup thú cưng không có dòng phẩm chất (P4, [Cường hoá và phẩm chất](#cường-hoá)). Cần một món không phải Hiếm để chắc. [Suy luận]
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
| Cường hoá (+8 cạnh tên) | `field0` của bản ghi (P4: 8 ở cả 4 món +8 của symap, 0 ở đồ manina) |
| Phẩm chất | Có lẽ `field4` (1 ở trang bị, 0 ở thú cưng); mọi trang bị đã xem đều Hiếm [Suy luận] |
| Yêu cầu cấp | `cấpMặc` trong bảng |
| Độ bền | `độBền` của bản ghi / `độBềnTốiĐa` trong bảng, ví dụ 55/60. Màu đỏ khi bằng 0 |
| Chỉ số | Từng `{chỉSố; giáTrị}` theo mẫu `it0`, ví dụ `+ 4 phòng thủ` |
| Bộ cùng hệ (n/4) | Số món cùng hệ đang mặc. Cẩm nang: đủ 4 món cùng hệ thì +8% tấn công và +8% sinh lực |
| Nút | Món đang mặc: Cởi ra, Sửa chữa. Món trong túi: Trang bị, Vứt bỏ |

Bot TS ghi dạng chữ ([src/protocol/items.ts](../../../src/protocol/items.ts)):
- Túi đồ: `"Hoàn Linh Dược ×4"`, `"Nón Lá (+5 phòng thủ, +66 sinh lực)"`, trong sự kiện `inventory`. Bản chữ chỉ ghi ×n khi số lượng lớn hơn 1.
- Trang bị đang mặc: `"0: Nón Âu Lạc (+4 phòng thủ, +58 sinh lực), hệ Lôi, độ bền 55/60"`, trong sự kiện `gear` lúc đăng nhập.

Cẩm nang về trang bị (C1):
- Nón, Áo, Vũ khí, Nhẫn chia bậc theo cấp mặc (1, 21, 51, 101, 151, 201). Cường hoá ở NPC Pháp Sư: bậc 1 tới +4, bậc 21 tới +8, bậc 51 tới +12, từ bậc 101 và cánh tới +16 (đọc lại `cam-nang.json` ở J2). Gói của cửa sổ Nâng cấp ở [14-npc](16-upgrade.md#nâng-cấp).
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
- Code: [src/cli/bag-run.ts](../../../src/cli/bag-run.ts).
- `npm run quest` cũng ghi các sự kiện `gear` và `inventory` khi chạy ([quest-bot](../../integration/nodejs/quest-bot.md)).
- Chạy thật ngày 31/10 sau khi tắt game trên máy: ra đúng đồ trên máy. Búa sửa chữa đã hết, nên ô 6 của túi trống. [Đo]

**2. Trên Android, bắt gói lúc game đăng nhập.** Cách này dùng khi muốn xem chính gói của app, như phiên E1:
1. Mở game, dừng ở màn đăng nhập.
2. Frida attach vào `com.lotasoft.colauloanthe`, hook native reader (cách hook ở [Điều tra lại](../reinvestigation.md#3-thu-lại-từ-boot-tới-thế-giới)).
3. Bấm đăng nhập. Ghi payload của `s2c/9` và `s2c/42`, sau đó là mọi `s2c/1187`.
4. Đọc payload bằng `characterGear` (đuôi `s2c/9`), `characterExtra` (`s2c/42`) và `inventory` (`s2c/1187`) trong [src/protocol/world.ts](../../../src/protocol/world.ts). Đổi mã ra tên bằng `Items` trong [src/protocol/items.ts](../../../src/protocol/items.ts).

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
| `c2s/48` | `u8 nơi (0: đang mặc); i32 ô` | `00 00000000`: sửa Nón Âu Lạc ở ô trang bị 0. Hàm dựng `sqlq.c47(0, 0)`, gọi từ `com.g.f.sqh.run1` ← `com.g.c.sqaj.a5` (nút OK). P4: `00 00000002`, Chiến Đao của symap ở ô 2 |
| `s2c/1187` | Cả túi ([bản ghi](#bản-ghi-vật-phẩm)) | 40 ms sau; 7 món, Búa sửa chữa (túi 6) đã mất |
| `s2c/48` | `u8; i32` | `00 00000000`, giống hệt gói gửi đi |

- `c47` ghi `sqi.b(I)` (1 byte) rồi `sqi.c(I)` (i32), khớp 5 byte trên dây. [Đo]
- Trường sau là số ô trang bị: sửa nón gửi 0, sửa vũ khí gửi 2 (P4). Trường đầu bằng 0 với đồ đang mặc. [Đo]
- P4: Chiến Đao +8 của symap từ 0/60 lên 60/60, Búa Sửa Chữa 5 → 4. "Bộ cùng hệ" lên 3/4 → 4/4, vì món hỏng không tính vào bộ. [Đo]
- `sqlq.a46(int, int, int)` cũng dựng `c2s/48` với `u8; i32; i32`, có lẽ là sửa món trong túi. [Chưa rõ]
- **Sau khi sửa, chỉ số không đổi ngay**: không có `s2c/10` hay `s2c/36`, và bảng Chỉ số vẫn hiện Sinh Lực 180, P.Thủ 5. Chúng đổi ở lần `s2c/10` sau: lần cộng điểm P1 đưa HP tối đa lên 238 và P.Thủ lên 9 ([Điểm tiềm năng](#điểm-tiềm-năng)). [Đo]
- Búa sửa chữa mua ở Lái Buôn: 73 Xu (ô 2) hoặc 80 Xu khóa (ô 6) ([Mua ở Lái Buôn](#c2s-1190)). [Đo P5] manina đã dùng chiếc búa duy nhất, vũ khí vẫn hỏng.

<a id="c2s-1186"></a>

<a id="mặc-cởi"></a>

## Mặc và cởi đồ: `c2s/1186` → `s2c/37`, `s2c/42`, `s2c/1186`

Đo trên máy (P4, Tiheo1/symap, 31/10): Frida ghi gói, ADB chạm các nút của popup vật phẩm. Món đang mặc có nút **Cởi ra** (và **Sửa chữa** nếu có độ bền). Món trong túi có **Trang bị** và **Vứt bỏ**, hoặc **Sử dụng** và **Vứt bỏ**.

| Thao tác | Hàm dựng (gọi từ) | `c2s/1186` |
|---|---|---|
| Cởi thú cưng (ô trang bị 5) | `sqlq.b45(1, 5)` (`com.g.f.sqe.a2` ← `com.g.c.sqce.g1`) | `01 00000005` |
| Mặc lại nó (ô túi 39) | `sqlq.b45(0, 39)` (`com.g.f.sqf.run1` ← `sqe.a2`) | `00 00000027` |

```text
c2s/1186 = u8 action (0: mặc món ở ô túi, 1: cởi món ở ô trang bị, 2: vứt bỏ món ở ô túi); i32 ô
```

Server trả ngay, theo thứ tự [Đo 2 lần]:
- `s2c/10` kiểu 4: chỉ số mới. Tấn công 361 → 342 khi cởi Chồn nhỏ (+19 cường lực), rồi lại 361 khi mặc.
- `s2c/37`: 8 ô trang bị mới, `i32 0; u8 0x40; string tên; i32 8; 8 × (u8 0xff | bản ghi vật phẩm)`. Đọc hết byte (350 và 423 byte).
- `s2c/42`: cả túi, giống lúc đăng nhập ([Túi đồ](#túi-đồ)).
- `s2c/1186`: `i32` lặp lại action (1 khi cởi, 0 khi mặc).
- `s2c/1166` (trang bị của người chơi, gửi cả khu) và `s2c/1212`. `s2c/1212` cho biết thú cưng: `000001d3 0000` khi cởi, `000001d3 0001 00002454 01` khi mặc. 0x2454 = 9300 là `hìnhẢnh` của Chồn nhỏ (`pet_9300`). [Đo]

**Món sai giới tính không mặc được.** Bảng vật phẩm có hai bản của nhiều món, khác nhau ở `gender` (0, 1; 2 là cả hai): Áo Hào Kiệt 147 (`gender` 0) và 217 (1), Áo Âu Lạc 502 và 509. manina mặc đồ `gender` 0 (Nón Âu Lạc 54). `cllt item --equip=9` với Áo Hào Kiệt 217 nhặt được ở H1 không đổi gì: đăng nhập lại, áo vẫn nằm ở ô túi 9 và áo cũ vẫn được mặc. Đồ nhặt từ đất có thể là bản của giới tính kia. [Đo 31/10]

Đọc tĩnh hàm xử lý nút `com.g.c.sqbr.g31` (đồ thị JNI của T2), theo mã lệnh của nút [Đo tĩnh]:

| Mã lệnh | Gói |
|---|---|
| 0xf44b | `c2s/84` (Sử dụng) |
| 0xf454, 0xf455 | `c2s/1186` |
| 0xb20b | `c2s/48` (Sửa chữa) |
| 0xb20e | Hỏi "Bạn có chắc là muốn vứt bỏ … này không?"; đồng ý thì `com.g.c.sqbz.run1` cũng gửi `c2s/1186` |

<a id="vứt-bỏ"></a>

### Vứt bỏ: `c2s/1186` action 2 → `s2c/83`

Đọc tĩnh `com.g.c.sqbz.run1` (chạy khi đồng ý ở hộp hỏi vứt bỏ): lấy ô túi bằng `sqbr.g()`, rồi gọi `sqlq.b45` với `mov w3, #2` ngay trước `CallVoidMethod`. Vậy vứt bỏ là `c2s/1186` với action 2. [Đo tĩnh]

K3 (bot TS, Tiheo2, 31/10): vứt viên Đá cấp 2 ở ô túi 4 (viên nhặt được từ đất ngay trước đó, [13](13-drops-items.md#k3)) [Đo 1 lần]:

| ms | Gói | Byte | Nghĩa |
|---:|---|---|---|
| 0 | `c2s/1186` | `02 00000004` | Vứt món ở ô túi 4 |
| 30 | `s2c/83` | `00000004 00000000` | Ô 4, số 0 (có lẽ số còn lại trong ô) |

- Không có `s2c/1187` hay `s2c/42`: client tự xoá ô theo `s2c/83`. Đăng nhập lại thì ô 4 trống, các ô khác giữ nguyên số ô. [Đo]
- Món bị huỷ, không rơi xuống đất: không có `s2c/1182` nào cho viên đá. [Đo]
- `s2c/83` là opcode trước đó chưa từng thấy ([opcode-map](../opcode-map.md#unseen)). Vứt một phần của chồng nhiều món thì số thứ hai có khác 0 không: chưa thử. [Chưa rõ]
- Trên máy (I1): bấm Vứt bỏ thì game hỏi "Bạn có chắc là muốn vứt bỏ Đá cấp 2 này không?" với hai nút OK và Hủy. Mở popup, mở hộp hỏi và bấm Hủy đều không gửi gói nào. [Đo]
- App desktop có Vứt bỏ (hỏi lại như game) và Sắp xếp ở thẻ Túi đồ ([InventoryCard.tsx](../../../app/desktop/src/views/InventoryCard.tsx), [Túi đồ và trang bị](../../integration/rust/features.md#túi-đồ-và-trang-bị)); bot đọc `s2c/83` để cập nhật ô túi. Chưa bấm thử từ app với server thật.

<a id="sắp-xếp"></a>

### Sắp xếp túi: `c2s/1257` → `s2c/1187`, `s2c/1111`

Trên máy: Bản thân → tab Trang bị, nút **Sắp xếp** ở góc dưới bên phải túi. Không có hộp hỏi. Hàm dựng là `sqlq.l53()`, không tham số ([bảng hàm dựng](../c2s-builders.md#bảng)).

I1 (Tiheo2, 31/10). Ô túi 4 trống từ lần vứt đá ở K3:

| ms | Gói | Byte | Nghĩa |
|---:|---|---|---|
| 0 | `c2s/1257` | (rỗng) | Bấm Sắp xếp |
| 45 | `s2c/1187` | 633 byte, 8 món | Cả túi sau khi xếp |
| 50 | `s2c/1111` | (rỗng) | Có lẽ báo xếp xong [Suy luận] |

| | Ô túi |
|---|---|
| Lúc đăng nhập (`s2c/42`) | 0 Cành Gai, 1 Áo Lụa, 2 Khăn Vòng, 3 Nhẫn Trơn, 4 trống, 5 Áo Chiến, 6 Đá cấp 2, 7 Rìu Âu Lạc, 8 Hoàn Linh Dược |
| Sau Sắp xếp (`s2c/1187`) | 0 Cành Gai, 1 Áo Lụa, 2 Khăn Vòng, 3 Nhẫn Trơn, 4 Áo Chiến, 5 Đá cấp 2, 6 Rìu Âu Lạc, 7 Hoàn Linh Dược |

- Server dồn các món về đầu túi và đánh số lại ô, thứ tự cũ giữ nguyên. Ảnh chụp sau khi bấm khớp: ô trống biến mất. [Đo]
- Đổi số ô thì mọi lệnh theo ô túi (`c2s/1186`, `c2s/84`, `c2s/44`) phải dùng số ô của `s2c/1187` mới. [Suy luận]
- Chưa rõ: Sắp xếp có gộp các chồng cùng loại, hay xếp theo loại món khi túi lộn xộn hơn không. Lần này 8 món khác loại nên chỉ thấy dồn ô. [Chưa rõ]

Popup trên máy (I1): Đá cấp 2 có "Yêu cầu cấp: 1", "Nguyên liệu nâng cấp vật phẩm", nút Sử dụng và Vứt bỏ. Nhẫn Trơn (hệ Thủy) ghi Phẩm chất Hiếm, Yêu cầu cấp 1, Độ bền 60/60, +5 sức tấn công, +10 thể lực, **"Bộ cùng hệ (0/4)"** (có lẽ thưởng khi mặc 4 món cùng hệ, [Suy luận]) và "Cần 1 búa để sửa chữa", nút Trang bị và Vứt bỏ. [Đo]

Trong lúc thử, một người chơi mời giao dịch ("… mời bạn giao dịch. Bạn có muốn giao dịch không?", OK và Hủy). Bấm Hủy gửi `c2s/55` = `01; string uuid; 00` (36 ký tự uuid của lời mời); server trả `s2c/1256` "Lời mời giao dịch đã hết hạn" vì bấm muộn. [Đo 1 lần; nghĩa từng trường là Suy luận]

<a id="c2s-84"></a>

## Dùng vật phẩm: `c2s/84`

```text
c2s/84 = i32 ô túi      (sqlq.i79, gọi từ com.g.f.sqe.a2 ← com.g.c.sqce.g1)
```

P4: bấm **Sử dụng** ở Hoàn Linh Dược (ô túi 3, popup ghi "Bơm 30% sinh lực") gửi `00000003`. Server trả `s2c/1256` "**Vật phẩm không thể sử dụng!**", số bình không đổi. Vậy ngoài trận không dùng được bình máu, dù popup vẫn có nút. Món nào dùng được ngoài trận (Tăng Kinh Nghiệm, trứng, rương) thì chưa thử. [Đo 1 lần] Trong trận, bình dùng gói khác: `c2s/44` ([dưới](#c2s-44)).

<a id="c2s-1190"></a>

## Mua ở Lái Buôn: `c2s/57` → `s2c/1190` → `c2s/1190`

P5 (Tiheo2, M1, 31/10), Frida ghi mọi gói hai chiều và tham số hàm dựng. Mua thử 2 lần: ô giá Xu (thiếu Xu, không mua được) và ô giá Xu khóa (mua được 1 Hoàn Linh Dược).

<a id="cách-mua"></a>

### Mua trên máy

1. Đi tới Lái Buôn (NPC 106, M1, (576, 416)). NPC đứng trên một bục cao: giữ cần điều khiển chéo lên khi chạm mép bục để nhảy lên.
2. Chạm NPC để chọn (tên hiện ở góc trên trái), rồi bấm nút hành động (thanh kiếm). Chạm biểu tượng trên đầu NPC không mở gì. Nếu khu đông người đứng che NPC thì chạm không trúng: đổi sang khu vắng (P5 sang khu 2, 0/20 người).
3. Hộp thoại "Ở chỗ ta có rất nhiều món đồ tốt." có ba nút: Vũ khí, **Dược phẩm**, Cửa hàng [Lượng]. Chọn Dược phẩm.
4. Bảng "Vật Phẩm" hiện 8 món. Chạm một món để xem tên, yêu cầu cấp, công dụng và giá; icon cạnh giá cho biết loại tiền (đồng xu xám là Xu, đồng có khoá là Xu khóa). Dưới bảng là số Xu, Xu khóa, Lượng đang có.
5. Bấm **Mua**: hộp "Mua Hoàn Linh Dược" cho chỉnh số lượng (− / +) và hiện tổng tiền. Bấm Mua lần nữa để gửi.
6. Kết quả hiện thành dòng chữ giữa bảng: "Bạn vừa mua thành công! 1 Hoàn Linh Dược", hoặc "Không đủ Xu để thực hiện". Số tiền dưới bảng đổi ngay.

<a id="luồng-gói-mua"></a>

### Luồng gói

```text
C→S 13    "M1", 106                 nói chuyện với Lái Buôn (như NPC nhiệm vụ)
S→C 57    hộp thoại, 3 dòng          +30 ms
C→S 57    1, "M1", 106              chọn dòng 1: Dược phẩm
S→C 1190  bảng "Vật Phẩm", 8 món     +34 ms
C→S 1190  0, ô 4, số lượng 1        Mua (ô 4 = Hoàn Linh Dược giá Xu khóa)
S→C 1256  1, "Bạn vừa mua thành công! 1 Hoàn Linh Dược"     +28 ms
S→C 42    cả túi, bình ở ô 4                                 +46 ms
S→C 46    Xu 0, Xu khóa 3424, Lượng 0                        +52 ms
```

Không có gói nào khi mở hay đóng bảng, chạm một món, hay chỉnh số lượng: chỉ ba gói gửi đi ở trên. [Đo]

<a id="bố-cục-gói-mua"></a>

### Bố cục từng gói

**`c2s/13`** = `string mapId; i32 npcId`. Cùng gói nói chuyện với NPC của bước nhiệm vụ ([10-quests](10-quests.md#c2s-13)). P5: `000000024d31 0000006a` ("M1", 106).

**`s2c/57`** (hộp thoại NPC, 129 byte, đọc hết):

| Trường | Kiểu | P5 |
|---|---|---|
| n | i32 | 3 |
| Tên NPC | string | "Lái Buôn" |
| Lời NPC | string | "Ở chỗ ta có rất nhiều món đồ tốt." |
| n × {mã dòng; nhãn} | u8; string | 0 "Vũ khí", 1 "Dược phẩm", 2 "Cửa hàng [Lượng]" |

**`c2s/57`** = `u8 mãDòng; string mapId; i32 npcId`, hàm dựng `sqlq.a103(option, mapId, npcId)`. P5: `01 000000024d31 0000006a`.

Hộp thoại của bước "Tỷ thí với Võ Quan Đinh Mộc" cũng là `s2c/57` ("Cậu đã sẵn sàng chiến đấu chưa.", 0 Đồng ý, 1 Từ chối), trả lời bằng cùng `c2s/57`; Từ chối được `s2c/1111` rỗng ([Bước Tỷ thí](10-quests.md#tỷ-thí), N1).

**`s2c/1190`** (bảng cửa hàng, 285 byte, đọc hết) = `u8 6; string "Vật Phẩm"; i32 8;` rồi 8 món, mỗi món 33 byte:

| Trường | Kiểu | Ô 4 ở P5 | Ghi chú |
|---|---|---|---|
| Ô cửa hàng | i32 | 4 | Số gửi lên trong `c2s/1190`. **Không phải mã vật phẩm** |
| Mã vật phẩm | i32 | 0 (Hoàn Linh Dược) | Tên, mô tả, icon tra ở [bảng vật phẩm](13-drops-items.md#bảng-vật-phẩm) |
| Loại tiền | u8 | 1 | 0 Xu, 1 Xu khóa |
| Giá một món | i32 | 120 | |
| Độ bền | i32 | -1 | -1 = không có |
| Số lượng | i32 | 1 | |
| (cờ) | u8 | 0 | 1 ở mọi món giá Xu và Lượng, 0 ở món giá Xu khóa. Món mua về có `field1` bằng cờ này: đó là cờ khoá giao dịch ([15-shops](15-shops.md#khoá)) [Đo J2] |
| Hệ | u8 | 0xff | Không có hệ |
| | 10 byte | 0 | `i32 0; u8 0; u8 0; i32 0`: field2, field3, field4 và số dòng chỉ số. Trang bị có thêm dòng chỉ số, bản ghi dài 49 byte ([15-shops](15-shops.md#bản-ghi)) |

**`c2s/1190`** = `u8 0; i32 ôCửaHàng; i32 sốLượng`, hàm dựng `sqlq.h87(ô, sốLượng)`. P5: `00 00000004 00000001` (mua được), `00 00000000 00000001` (ô 0, thiếu Xu). Byte đầu luôn 0 ở hai lần đo. [Đo; nghĩa byte đầu Chưa rõ]

<a id="sau-khi-mua"></a>

### Cập nhật sau khi mua

| Gói | Cập nhật gì | Chi tiết |
|---|---|---|
| `s2c/1256` | Dòng chữ giữa màn hình | `u8 1; string`. "Bạn vừa mua thành công! 1 Hoàn Linh Dược"; thiếu tiền thì "Không đủ Xu để thực hiện" |
| `s2c/42` | **Cả túi đồ** | Cùng gói lúc đăng nhập (`string "test dong 1"; i32 42; i32 3;` rồi cả túi, [Túi đồ](#túi-đồ)). Món mới vào **ô trống đầu tiên**: ở P5 là ô 4, ô vừa trống sau khi vứt viên Đá ở K3. Không có `s2c/1187` hay `s2c/51` |
| `s2c/46` | **Cả ba loại tiền** | `"update Xu"; i64 Xu; i64 Xu khóa; i64 Lượng` = 0, 3424, 0. Xu khóa giảm đúng 120 × 1 |

- Mua không được (thiếu tiền) thì chỉ có `s2c/1256`: túi và tiền không đổi, không có `s2c/42`, `s2c/46`. [Đo]
- Số tiền dưới bảng và túi đổi sau khi `s2c/42`, `s2c/46` đến, nên có lẽ client chờ server rồi vẽ lại chứ không tự trừ. Vậy app chỉ cần xử lý hai gói này như lúc đăng nhập. [Suy luận]
- App Rust đã đọc `s2c/42`, `s2c/1187` và `s2c/46` giữa phiên ([App Rust](../../integration/rust/features.md#túi-đồ-và-trang-bị)), nên tab Túi đồ và số tiền tự đổi sau khi mua. Bot TS đọc `s2c/46` và `s2c/1187` giữa phiên nhưng chưa đọc lại `s2c/42`, cũng chưa đọc `s2c/51` (nhặt vào túi) và `s2c/83` (số còn lại trong ô). [Đo trong code]

<a id="mua-bằng-bot"></a>

### Mua bằng bot TS

Các hàm dựng đã có trong [src/protocol/events.ts](../../../src/protocol/events.ts):

```ts
buildRequest(13, { mapId: 'M1', npcId: 106 })                 // nói chuyện với Lái Buôn
buildRequest(57, { option: 1, mapId: 'M1', npcId: 106 })      // chọn Dược phẩm
buildRequest(1190, { shopId: 4, quantity: 1 })                // mua 1 Hoàn Linh Dược giá Xu khóa
```

- Chọn ô theo `s2c/1190`, không theo mã vật phẩm: tìm món có `itemId` cần mua và `currency` muốn trả, rồi gửi `shopId` của nó. Bộ giải mã: `npcMenu`, `shopList` trong [src/protocol/world.ts](../../../src/protocol/world.ts).
- Kiểm tiền trước khi gửi: `giá × số lượng` phải ≤ Xu hoặc Xu khóa của `s2c/46` gần nhất.
- Lệnh [src/cli/buy-run.ts](../../../src/cli/buy-run.ts): `npm run buy [-- --account=tiheo2] [--shop=duoc|luong] [--item=2] [--pay=khoa|xu] [--qty=1] [--buy]`. Lệnh đăng nhập, mở Dược phẩm (hay Cửa hàng [Lượng] với `--shop=luong`), in bảng, chọn ô có `itemId` và loại tiền muốn trả, kiểm tiền, rồi chỉ gửi `c2s/1190` khi có `--buy`. Món không chồng được (đá) thì gửi từng cái một cho đủ `--qty` ([mua bằng Lượng](15-shops.md#lượng)). Không có `--buy` thì chỉ mở cửa hàng, không tốn gì.
- **B1** (31/10, manina cấp 21, 500 Xu, 8.517 Xu khóa, không có búa):
  - Đứng ở **M2**: `c2s/13 ("M1", 106)` → `s2c/1256` "Không thể thực hiện" sau 27 ms, không có `s2c/57`. **Phải đang ở M1** mới mở được Lái Buôn. [Đo]
  - Sang M1 (`cllt goto --map=M1`, server xếp khu 1), đứng ở chỗ đăng nhập, xa NPC: `s2c/57` sau 26 ms, `s2c/1190` sau 26 ms, đủ 8 món đúng giá và đúng ô như P5. Khoảng cách tới NPC không quan trọng. [Đo]
  - `c2s/1190` gửi thẳng từ bot TS: `00 00000006 00000001` → `s2c/1256` "Bạn vừa mua thành công! 1 Búa Sửa Chữa" sau 26 ms, rồi `s2c/42` (túi có Búa Sửa Chữa ×1) và `s2c/46` (Xu khóa 8.517 → 8.437). Byte đầu 0 như P5. [Đo]
  - App Rust (`cllt buy --account=manina2 --confirm`) mua thêm 1 búa: "Bạn vừa mua thành công! 1 Búa Sửa Chữa", Xu khóa 8.437 → 8.357. Búa mới **cộng dồn vào ô đã có búa** (ô túi 3: Búa Sửa Chữa ×2), không sang ô trống. [Đo]

<a id="bảng-giá-lái-buôn"></a>

### Bảng giá Dược phẩm (P5)

| Ô | Món | Giá |
|---:|---|---|
| 0 | Hoàn Linh Dược | 109 Xu |
| 1 | Kim Đan Dược | 109 Xu |
| 2 | Búa Sửa Chữa | 73 Xu |
| 4 | Hoàn Linh Dược | 120 Xu khóa |
| 5 | Kim Đan Dược | 120 Xu khóa |
| 6 | Búa Sửa Chữa | 80 Xu khóa |
| 415 | Bình Huyết Linh (Rỗng) | 4000 Xu |
| 487 | Băng Tâm | 500 Xu |

- Cùng một món bán hai lần: ô giá Xu và ô giá Xu khóa (đắt hơn ~10%). Trên máy, ô giá Xu khóa có icon kèm hình khoá. Ô 3 không có trong danh sách. [Đo]
- Hai dòng Vũ khí và Cửa hàng [Lượng] bán gì, byte đầu `u8 0` của `c2s/1190` nghĩa là gì, mua nhiều hơn 1 món một lần: chưa thử. [Chưa rõ]

<a id="c2s-44"></a>

## Dùng vật phẩm trong trận: `c2s/44` → `s2c/83`, `s2c/44`

P5, trận tính giờ với Sơn Tặc cấp 9. Trận bắt đầu khi nhân vật chạm Sơn Tặc trên bản đồ: app tự gửi `c2s/15 ("mob42017", 0)`. Bàn cờ không nhận lệnh chạm từ ADB, nhưng nút Túi đồ ở cột trái thì nhận. Túi đồ trong trận chỉ hiện món dùng được (Hoàn Linh Dược "Bơm 30% sinh lực"); chạm món là dùng luôn, không có nút xác nhận. [Đo]

| ms | Gói | Byte | Nghĩa |
|---:|---|---|---|
| 0 | `c2s/44` | `string uuidTrận; i32 0; i32 4` | Dùng món ở ô túi 4. Hàm dựng `sqlq.g76(ô, 0)` ghi số 0 trước, như `c2s/20` ghi `seq` trước mã kỹ năng |
| 28 | `s2c/83` | `00000004 00000000` | Ô 4 còn 0 món (cùng gói với Vứt bỏ) |
| 31 | `s2c/44` | 75 byte: `seq 1; 0; seed; i32 0; i32 4; i32 0; i32 0 quân rơi; u8 1 bên; "Ttuananh" sát thương -1, HP 67; cờ; "Ttuananh"; end 0` | Kết quả trong trận. Như `s2c/19` nhưng không có byte xếp lại bàn và 3 byte trước danh sách. Bộ giải mã: `battleItemResult` trong [src/battle/battle.ts](../../../src/battle/battle.ts) |

- **HP 31 → 67, tức +36.** Mô tả ghi "Bơm 30% sinh lực", mà 30% của 145 là 43,5; +36 chỉ bằng 24,8%. Có thể tính theo HP gốc chứ không theo HP tối đa, hoặc mô tả làm tròn. Mới đo 1 lần. [Đo; lý do Chưa rõ]
- **A1 (31/10), trận theo lượt, bot gửi `c2s/44` qua cầu nối trong game:**
  - Hoàn Linh Dược lại cho +36 ở HP tối đa 145 (24 → 60), tức khoảng 25%.
  - Kim Đan Dược cho nội lực +25 mỗi viên (0 → 25 → 50), 4 lần.
  - Dùng bình là **mất lượt**: sau `s2c/44` là nước của quái.

  Xem [07-auto-battle](07-auto-battle.md#đo-trên-máy-a1). [Đo]
- Trước đó Sơn Tặc đánh 3 lần theo đồng hồ (`s2c/21` mỗi ~31 s), mỗi lần 38: 145 → 107 → 69 → 31. Thoát trận bằng Đầu hàng (`c2s/11` rồi `c2s/40`): `s2c/1256` "Rời trận, mất 25 kinh nghiệm". [Đo]
- `c2s/47` (đoán trước đây) không phải gói dùng món: nó do bộ xử lý chạm bàn cờ gửi ([Chưa rõ](#chưa-rõ)). [Đo tĩnh]

<a id="x2-exp"></a>

## Ngôi sao "x2" ở góc trái: nhân đôi kinh nghiệm

Dưới avatar của symap có ngôi sao xanh ghi "x2" và giờ còn lại ("4h" lúc 10:47, "3h" lúc 11:12). manina và Tiheo2 không có. [Đo]

Server gửi nó trong **đuôi `s2c/9`** lúc đăng nhập, ngay sau khối ngoại hình (`characterTail` trong [src/protocol/world.ts](../../../src/protocol/world.ts)):

```text
… 8 ô trang bị; i32 (symap 1, manina 0); khối ngoại hình (như bản ghi người chơi);
i32 n; n × {string khoá; i32 tỉLệ; i32; i32 msCònLại};
i32; string tên sứ quân; u8; u8
```

| Nick | Hiệu ứng | Sứ quân |
|---|---|---|
| symap | `"ef7"`, tỉ lệ 200000, còn 13.257.567 ms (3 giờ 41 phút) | `2`, "Thiên Tôn" (chữ hiện trên đầu nhân vật), `01 00` |
| manina, Tiheo2 | không có | không có |

- Tỉ lệ tính theo 1/100000: 200000 là ×2. Quái trong `s2c/22` cũng có một số 100000 ở chỗ tương ứng. [Suy luận]
- Hiệu ứng đến từ vật phẩm **Tăng Kinh Nghiệm (mã 7)**. Mô tả trong bảng vật phẩm: "Tăng x2 kinh nghiệm trong 24 giờ kể từ lúc dùng, tính cả khi không đăng nhập. Dùng thêm khi còn hiệu lực thì cộng dồn thời gian." Khoá `ef7` có lẽ là "hiệu ứng của món 7". [Suy luận mạnh]
- Vậy không phải mặc định cho mọi nick: chỉ nick đã dùng món này mới có, và giờ vẫn trôi khi thoát game. [Đo 3 nick; giờ trôi theo mô tả]
- App desktop đọc đuôi này bằng `items::character_tail` (port của `characterTail`) và hiện huy hiệu "x2 EXP" có giờ còn lại ở thẻ nhân vật ([x2 EXP](../../integration/rust/features.md#x2-exp)). Chưa biết gói báo hiệu ứng khi dùng Tăng Kinh Nghiệm giữa phiên. [Chưa rõ]
- Bảng VIP (`com.g.m.sqfo`) có quyền lợi `EXP_BONUS_PERCENT` ("EXP + x%") và `GOLD_BONUS_PERCENT` ("Vàng + x%"). Đó là cộng EXP theo cấp VIP, khác ngôi sao này. [Đo tĩnh]

<a id="cường-hoá"></a>

**Cường hoá và phẩm chất** cũng thấy trong bản ghi vật phẩm của symap [Đo]:
- `field0` = 8 ở cả 4 món "+8" (Nón Hào Kiệt, Áo Thuật Sĩ, Chiến Đao, Nhẫn Đại Hiệp). Đồ chưa cường hoá của manina có 0. Vậy `field0` là cấp cường hoá.
- `field4` = 1 ở mọi trang bị (popup ghi "Phẩm chất: Hiếm"), = 0 ở thú cưng (popup không có dòng phẩm chất). Có lẽ đó là phẩm chất. [Suy luận]

## Bình máu và nội lực

Cẩm nang (C1):
- Hoàn Linh Dược hồi 30% sinh lực tối đa; Kim Đan Dược hồi 25% nội lực (1 thành). Đo ở A1: Kim Đan đúng +25; Hoàn Linh Dược chỉ +36 trên 145 (khoảng 25%).
- Trong trận, bấm nút Túi đồ ở cột trái bàn cờ. Mỗi lượt dùng được 1 món, kể cả khi đấu với người chơi. Bình mua ở NPC Lái Buôn.
- Ngoài trận, chạm bình trong túi sẽ có nút "Sử dụng" và "Vứt bỏ".

P4 bấm Sử dụng ở Hoàn Linh Dược: app gửi `c2s/84 (i32 ô túi)`, server trả "Vật phẩm không thể sử dụng!" và số bình không đổi ([Dùng vật phẩm](#c2s-84)). Vậy dù Cẩm nang nói vậy, ngoài trận không hồi máu bằng bình được. [Đo] `c2s/1186` từng được đoán là dùng vật phẩm, nhưng đó là mặc và cởi đồ ([Mặc và cởi đồ](#c2s-1186)). Trong trận là gói khác: `c2s/44 (uuidTrận; 0; ô túi)`, hồi +36 ở P5 ([Dùng trong trận](#c2s-44)). [Đo]

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
| Đồ rơi | Hòm đồ có thể rơi sau trận. Đứng lên hòm rồi bấm Nhặt | `s2c/1182`; nút Nhặt gửi `c2s/1188 (uuid)`, đã bắt trên máy ([13](13-drops-items.md#p3)) |
| Nhiệm vụ hằng ngày | Nhận ở Hương Lão Trần Bá, tối đa 3 một ngày, làm từng cái một, trả cũng ở đó, huỷ được. Thưởng EXP, Xu khoá hoặc vật phẩm | Tab "Phụ" hiện "Chưa có nhiệm vụ" |
| Quà cấp | Đạt cấp 20, 40, 60… tới 200 thì nhận quà qua Hòm thư | manina cấp 21 |
| Bản đồ thế giới | Chạm một thành rồi "Vào thành" để đi nhanh. Ổ khoá nghĩa là phải làm tiếp nhiệm vụ chính | Cổng Hồng Giang ([10-quests](10-quests.md#cổng)) |
| Bạch Hổ | Boss thế giới ở Hang Bạch Hổ (Luyện Ngục), 9:00–9:59 mỗi ngày. Không có EXP, thua không bị trừ. Top 5 sát thương nhận quà qua thư | |
| Lôi đài | Đấu tự do với người chơi. Sát thương chỉ còn 60%, bỏ lỡ 3 lượt là thua, tối đa 8 phút hoặc 40 hành động mỗi bên | |
| Tiền | Xu (Chợ trời, góp quân lương), Xu khoá (cửa hàng NPC, cường hoá), Lượng (tiền nạp) | Bảng Bản thân: 500 Xu, 7.370 Xu khoá, 0 Lượng = `s2c/46` |

## Chưa rõ

- Biến thể `a46` của `c2s/48` (`u8; i32; i32`), có lẽ sửa món trong túi.
- `c2s/47`: chỉ do `sqlm.g28(a, b)` gửi, ghi `string uuidTrận; i32 sqlm.o; i32 a; i32 b` (`b78` ghi tham số 3 trước, như `c2s/20` ghi `seq` trước), và `g28` được gọi từ bộ xử lý chạm bàn cờ `sqij` qua `sqlm.f(II)`. Có lẽ là một thao tác lên ô bàn cờ; không phải dùng món, vì dùng món là `c2s/44` (P5). [Đo tĩnh; nghĩa Suy luận]
- Hoàn Linh Dược hồi +36 thay vì 30% của 145; Kim Đan Dược hồi bao nhiêu nội lực trong trận.
- Món nào dùng được ngoài trận bằng `c2s/84`; nhận và trả nhiệm vụ hằng ngày; dòng Vũ khí và Cửa hàng [Lượng] của Lái Buôn. Gói nhặt đồ `c2s/1188` đã bắt trên máy (P3), bot chưa gửi thử ([13](13-drops-items.md#p3)).
- `c2s/10` của Nội Lực (1) và Thể Lực (3) chưa đo trực tiếp; nút "Cộng nhiều".
- Sau sửa đồ, chỉ số có đổi trước lần `s2c/10` sau (sau trận, đăng nhập lại) không.
- `field01` của một nhân vật hệ Lôi (đoán là 2). Cây kỹ năng Lôi đã có ([Bảng kỹ năng](#bảng-kỹ-năng)).

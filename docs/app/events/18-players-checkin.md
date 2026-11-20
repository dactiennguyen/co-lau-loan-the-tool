# Người chơi với nhau, Điểm danh

Phiên **PL1** (20/11, game 1.1.0): tiheo1 trên điện thoại (Frida ghi gói gửi và nhận), tiheo2 (akaito) đứng bằng bot TS ở Rìa Hồng Giang (`M25`) khu 0 và ghi mọi gói nhận được; sau đó điện thoại đăng nhập tiheo2 để điểm danh. Gói ở `captures/pl1-2026-11-20/` (`3-frida-tiheo1.jsonl` là cả hai nick trên điện thoại, `2-watch-tiheo2.jsonl` là phía akaito).

## Chạm vào người chơi khác

- Chạm vào nhân vật chỉ **chọn** họ (mũi tên đỏ trên đầu, ô mục tiêu ở giữa phía trên có avatar, cấp, HP). Chạm vào **avatar trong ô mục tiêu** mới mở menu. Cả hai không gửi gói nào. [Đo PL1]
- Menu có 5 nút: **Khiêu chiến** (xám ở Rìa Hồng Giang), **Kết bạn**, **Xem thông tin**, **Báo cáo**, **Chặn chat**. Không có Giao dịch. [Đo PL1]

| Nút | Gửi | Server trả | Người kia nhận |
|---|---|---|---|
| Xem thông tin | `c2s/9` = `string tên; u8 0x6b; i32 -1` | `s2c/9` 865 byte (chỉ số, trang bị; byte đầu `0x6b` như gói gửi), bảng "Thông tin" | không gì |
| Kết bạn | `c2s/1197` = `i32 idNgườiChơi` (akaito 254) | `s2c/1256` "Đã thêm akaito vào danh sách bạn bè." | không gì: kết bạn một chiều, không hỏi |
| Khiêu chiến, Báo cáo, Chặn chat | chưa bấm | | |

## Bạn bè và chat riêng

- Menu ≡ → Xã hội → **Bạn bè**: `c2s/1196` rỗng → `s2c/1196` = `i32 n; n × {i32 id; string tên; i32 cấp; u8 online}` (`00000001 000000fe "akaito" 00000036 01`). [Đo PL1]
- Bấm vào một bạn: **Chat**, **Xóa bạn**. Chat mở hộp "Chat với akaito" (ô chữ, OK, Đóng). [Đo PL1]
- Chat riêng: `c2s/1199` = `i32 idNgườiNhận; string chữ`. Người nhận được `s2c/1199` = `i32 idNgườiGửi; string tênNgườiGửi; string chữ` (tiheo1 id 513). [Đo PL1]

## Chuyển đồ: Gửi thư

Không có giao dịch trực tiếp trong menu. Đồ chuyển qua **Hòm thư → tab Gửi thư**: Tên người nhận (tên nhân vật), Chủ đề, Nội dung (không bắt buộc), **6 ô đính kèm** chọn từ túi đồ bên phải, **Phí gửi thư: 1.000 Xu**. Tab **Thư đã gửi** giữ thư đã gửi. Món khoá có dấu ổ khoá trong túi, có lẽ không gửi được [Suy luận]. Chưa bấm Gửi thư nên chưa có gói. [Đo PL1, màn hình]

## Điểm danh

Nút **Phúc lợi** (thanh trên, có chấm đỏ khi còn quà) mở thẳng tab **Điểm Danh**; các tab khác: Online, Tri ân, Mua chung, Giftcode, Nạp đầu.

- Mở bảng: mỗi khoá một cặp `c2s/1236` (định nghĩa) và `c2s/1239` (tiến độ), `string khoá`: `RECHARGE_TOTAL`, `SPEND_TOTAL`, `FIRST_CHARGE`, `CHECKIN_MONTHLY`; thêm `c2s/1278` (`u8 0`). [Đo PL1]
- `s2c/1236` của `CHECKIN_MONTHLY`: `u8 1; i64 ?; i64 64 (mã sự kiện); string khoá; string "Điểm danh tháng"; i32 4 mốc; mỗi mốc {i64 mã; i32 số ngày cần; i32 n; n × bản ghi vật phẩm}`, rồi `i32 10` quà ngày, mỗi món `{bản ghi vật phẩm (ô `0xff`); i16 ?}` (2 byte thêm, 0 ở PL1, có lẽ là trọng số bốc thăm). [Đo PL1]
  - Mốc tháng: 299 = 7 ngày → 1 Vé may mắn; 300 = 14 ngày → 1 Đá cấp 7; 301 = 21 ngày → 1 Bùa bảo vệ sơ cấp; 302 = 28 ngày → 1 Tăng Kinh Nghiệm + 1 Vé may mắn.
  - Quà ngày (thứ tự là chỉ số): 0 Xu khóa ×1.500, 1 Xu khóa ×3.000, 2 Hoàn Linh Dược ×5, 3 Kim Đan Dược ×5, 4 Búa Sửa Chữa ×5, 5 Đá cấp 5 ×2, 6 Đá cấp 6 ×1, 7 Đá cấp 7 ×1, 8 Vé may mắn ×1, 9 Tăng Kinh Nghiệm ×1. Đều khoá.
- `s2c/1239` của `CHECKIN_MONTHLY`: `u8 1; i64 ?; i64 64; string khoá; string kỳ "2026-11"; i32 sốNgàyĐãĐiểmDanh; i64 0; i32 4; 4 × {i64 mãMốc; u8 trạngThái (0 chưa đủ, 1 nhận được, 2 đã nhận; xem Quà Online)}; u8 hômNayĐãĐiểmDanh; u8 ngày (20); u8 sốNgàyCủaTháng (30); i32 mặtNạNgàyĐãĐiểmDanh (bit ngày−1: ngày 20 = `0x00080000`); i64 giờ reset (ms, 21/11 00:00)`. akaito trước khi bấm: 0 ngày, cờ 0, mặt nạ 0; sau: 1 ngày, cờ 1, mặt nạ `0x00080000`. [Đo PL1]
- **Bấm Điểm danh**: `c2s/1232` = `i64 64 (mã sự kiện); i64 0 (mốc; 0 = quà ngày)`. Server trả trong 110 ms [Đo PL1, akaito]:
  1. `s2c/1187` loại 1: **cả túi** (quà vào **thẳng túi**, không qua thư);
  2. `s2c/1232` = `i64 64; i64 0; u8 1 (thành công); string "Điểm danh ngày 20: nhận 1 Đá cấp 6"; u8 0; u8 6 (chỉ số quà ngày); i32 0`;
  3. `s2c/1239` tiến độ mới;
  4. `s2c/1279` = `i32 1`: Phúc lợi còn quà chưa nhận (chấm đỏ). Ở đây là quà Online; nhận xong quà Online thì server gửi `i32 0`.
- **Mỗi ngày nhận ngẫu nhiên một** trong 10 món (akaito ngày 20 được Đá cấp 6, chỉ số 6, ô đó được đóng khung trên bảng). [Đo 1 lần]
- **Bấm lại khi đã điểm danh** (bot TS, `--again`): `s2c/1232` = `i64 64; i64 0; u8 0; string "Hôm nay bạn đã điểm danh"; u8 0xff; u8 0xff; i32 0`, rồi `s2c/1256` cùng lời. Không có `s2c/1187` hay `s2c/1239`. [Đo PL1, akaito]
- Nhận quà mốc tháng: có lẽ cũng `c2s/1232 (64, mãMốc)` khi đủ ngày [Suy luận, chưa đo]. `c2s/1237`, `c2s/1238` (rỗng) chưa thấy dùng.

## Quà Online

Tab **Online** của Phúc lợi (bảng "Quà Online") có hai phần, mỗi phần một nút **Nhận quà** nhận **mọi mốc đủ điều kiện một lần**. [Đo PL1, akaito cấp 54]

- Mở tab: `c2s/1239` với khoá `LEVEL_UP` và `ONLINE_DAILY`. Định nghĩa (`s2c/1236`) lấy từ lúc mở Phúc lợi; bố cục giống `CHECKIN_MONTHLY`: `i32 mốc; mỗi mốc {i64 mã; i32 điều kiện; i32 n; n × bản ghi vật phẩm}`.
- Bản ghi vật phẩm: `u8 0xff; i32 mãMón; string uuid; i32 0; i32 -1; i32 sốLượng; u8 ?; …`. Byte sau số lượng là 0 ở 25.000 Xu khóa (ô có ổ khoá) và 1 ở 5.000/10.000 Xu khóa (ô không có ổ khoá), nhưng cả ba đều vào Xu khóa.
- Tiến độ (`s2c/1239`): `… string khoá; string kỳ; i32 tiếnĐộ; i64 0; i32 n; n × {i64 mãMốc; u8 trạngThái}`. **Trạng thái mốc: 0 chưa đủ, 1 nhận được, 2 đã nhận.**
- **Bấm Nhận quà: `c2s/1233` = `i64 mãSựKiện`** (65 hoặc 21), không có mã mốc. Server trả `s2c/46` "update Xu" (Xu, Xu khóa, Lượng mới), `s2c/1187` (cả túi), `s2c/1256` "Đã nhận N phần thưởng", `s2c/1239` (mốc đã nhận chuyển 1 → 2). Quà vào **thẳng túi và ví**, không qua thư.
- **Không còn gì để nhận** (bot TS, `--again`): `s2c/1256` "Không có phần thưởng nào để nhận" rồi `s2c/1239` y như cũ; không có `s2c/46` hay `s2c/1187`. [Đo PL1, akaito]

**Quà thăng cấp** (`LEVEL_UP`, sự kiện 65, kỳ `"-"`, một lần mỗi nhân vật, tiến độ = cấp):

| Mốc | Cấp | Quà |
|---|---|---|
| 303 | 10 | 25.000 Xu khóa |
| 304 | 21 | 1 Tăng Kinh Nghiệm |
| 305 | 30 | 10 Hoàn Linh Dược, 10 Kim Đan Dược |
| 306 | 40 | 1 Tăng Kinh Nghiệm |
| 307 | 51 | 1 Chuyển hoá trang bị trung cấp |
| 308 | 75 | 3 Đá cấp 9 |
| 309 | 101 | 1 Bùa bảo vệ trung cấp |

akaito (cấp 54) bấm một lần nhận 5 mốc 303–307: Xu khóa 408.262 → 433.262 (+25.000); túi thêm 10 Hoàn Linh Dược, 10 Kim Đan Dược, 2 Tăng Kinh Nghiệm, 1 Chuyển hoá trang bị trung cấp. [Đo PL1]

**Quà online** (`ONLINE_DAILY`, sự kiện 21, "Online mỗi ngày", kỳ là ngày `"2026-11-20"`, tiến độ = số phút online hôm nay; "Hôm nay đã online 484 phút"):

| Mốc | Phút | Quà |
|---|---|---|
| 47 | 30 | 5.000 Xu khóa |
| 48 | 60 | 1 Đá cấp 5 |
| 49 | 120 | 10.000 Xu khóa |
| 50 | 180 | 1 Đá cấp 6 |

akaito bấm một lần nhận cả 4: Xu khóa 433.262 → 448.262 (+15.000), túi thêm 1 Đá cấp 5 và 1 Đá cấp 6; sau đó `s2c/1279` = `i32 0`. [Đo PL1]

Bot TS làm được cả ba việc này: `npm run welfare` ([Phúc lợi bằng Node.js](../../integration/nodejs/welfare.md)). Lúc vào game, `s2c/1279` cho biết còn gì để nhận: akaito vào bằng điện thoại khi chưa điểm danh và chưa nhận quà online thì được 9 (bit 0 Online, bit 3 Điểm danh); vào lại bằng bot sau khi đã nhận hết thì được 0. [Đo PL1]

Phút online có lẽ tính cả thời gian bot đứng trong game (akaito đã có 484 phút, phần lớn là bot TS đứng ở Rìa Hồng Giang) [Suy luận]. Nếu đúng vậy, bot có thể tự nhận `c2s/1233 (21)` và `c2s/1233 (65)` khi `s2c/1279` = 1.

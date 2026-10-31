# Dữ liệu nhân vật nằm trong gói nào?

**Gói `s2c/9` mang dữ liệu nhân vật sau đăng nhập.** Gói `s2c/29` cho map ID; `s2c/11` cho tên bản đồ, khu vực và các trường vị trí. Đây là opcode trên TCP, chưa xác minh được HTTP endpoint `/user` hay tên event string gốc.

Nguồn chính là packet và getter native của phiên app A2, đối chiếu với UI. Cách thu ở [phương pháp điều tra](investigation.md); body và trace getter chi tiết ở [event thế giới](events/03-world.md). Tên field dưới đây là nhãn phân tích; offset tính từ đầu payload sau giải XOR, không tính header/opcode.

## Luồng để nhận dữ liệu

| Bước | Client gửi | Server trả | Điều quan sát được |
|---:|---|---|---|
| 1 | Handshake, `-1`, `1206`, `5` | Seed, `-1`, `1207`, `1209`, `5` | Khoá phiên, thông tin server và thông báo |
| 2 | `2`, rồi `3` | `2`, rồi `3` | Gate và challenge |
| 3 | `4`: account/proof/thông tin client | `4` rỗng | ACK của nhánh thành công đã đo; chưa chứa profile |
| 4 | `9`: account viết thường, byte 2, int32 -1 | `9` | Prefix nhân vật và phần chưa giải |
| 5 | `30`: byte 1; rồi `42`: tên nhân vật | `30`, rồi `42` | Kỹ năng và dữ liệu bổ sung, mới hiểu prefix |
| 6 | `29`: tên nhân vật | `29` | Map ID của nhân vật |
| 7 | `11`: map ID, byte -1, int32 -1 | `11` | Bản đồ, khu vực, các trường vị trí và tile bytes |
| 8 | `43`: map ID | `43` và push `1263` | Thực thể/người chơi quanh khu vực theo suy luận |

Các bước dùng cùng socket đã có từ boot. Request `9` dùng **account**; request `29/42` dùng **tên nhân vật lấy từ response `9`**. Trong mẫu, hai chuỗi lần lượt là `manina2` và `manina`.

## Nhân vật — gói 9

Request payload đã bắt từ app:

```text
00000007 6d616e696e6132 02 ffffffff
string("manina2")      byte(2) int32(-1)
```

Encoded opcode trước XOR: `bdcf91b5`. Đây là payload trên phiên đã xác thực, không phải toàn bộ frame có thể gửi lên socket mới.

Response mẫu dài **551 byte**. Prefix 40 byte đã đối chiếu getter native:

| Offset mẫu | Kiểu | Nhãn phân tích | Giá trị A2 | Bằng chứng / giới hạn |
|---:|---|---|---|---|
| 0 | byte | status | 1 | Giá trị của nhánh đã đo |
| 1 | byte | field01 | 1 | Không phải số nhân vật: nick thứ hai (31/10) có 4, bố cục phía sau vẫn y hệt. Bằng `flag1` ở cả ba mẫu. Là **hệ nhân vật**: 1 Hỏa, 4 Thủy. Gửi `c2s/30` với số này thì nhận cây kỹ năng của hệ đó, và mã kỹ năng trong đuôi `s2c/9` là 1000 × hệ + 0…8 ([12-skills-items](events/12-skills-items.md#bảng-kỹ-năng)) [Đo K1]. Parser từng chỉ nhận 1 nên nick này báo lỗi lúc đăng nhập |
| 2 | string | name | manina | Tên dùng cho các request sau |
| 12 | int32 | numericId | 155 | ID số trong packet; chưa khẳng định ID account/database |
| 16 | string | displayName | manina | Khớp tên trên UI |
| 26, 27 | byte, byte | flag1, flag2 | 1, 0 | Chưa rõ nghĩa. Nick thứ hai: 4, 1 |
| 28 | int32 | level | 3 | Khớp cấp trên UI |
| 32 | int32 | hp | 120 | Khớp HP trên UI lúc A2 |
| 36 | int32 | maxHp | 130 | Khớp HP tối đa trên UI |

```text
01 01 000000066d616e696e61 0000009b 000000066d616e696e61
01 00 00000003 00000078 00000082
```

Offset từ 12 trở đi chỉ đúng với độ dài tên trong mẫu. Phải đọc length-prefix của string để tìm field tiếp theo.

<a id="đuôi-s2c9"></a>

### Đuôi s2c/9: EXP, chỉ số, toạ độ

Sau `maxHp` là đúng những số mà `s2c/10` gửi lại sau mỗi trận hoặc khi lên cấp, rồi tới toạ độ nhân vật. Nhờ vậy app hiện được EXP, xu và chỉ số **ngay khi đăng nhập**, không phải đợi trận đầu.

Đã so ba mẫu:
- **A2:** capture app, cấp 3.
- **30/10:** bot TS đăng nhập chỉ đọc ngày 30/10/2026. manina cấp 21 ở M2, không đánh trận nào. Mẫu lưu ở `fixtures['profile']`.
- **31/10, nick thứ hai:** đăng nhập chỉ đọc tới `s2c/9` rồi ngắt, cấp 2, `field01` = 4. Mẫu lưu ở `fixtures['profile']` với tên nhân vật thay bằng `nickthu2` cùng độ dài. Chưa có `s2c/11` đi kèm để đối chiếu x/y.

Bộ giải mã là `characterProfile` trong [src/protocol.ts](../../src/protocol.ts). Test ở [test/protocol.test.ts](../../test/protocol.test.ts).

Offset trong bảng tính từ ngay sau `maxHp`, vì tên nhân vật dài ngắn khác nhau:

| Sau maxHp | Kiểu | Nhãn | A2 (cấp 3) | 30/10 (cấp 21) | Nick thứ hai (cấp 2) | Căn cứ |
|---:|---|---|---|---|---|---|
| 0 | i32, i32 | `s1`, `s1Max` | 0, 100 | 0, 100 | 0, 100 | Cùng cặp với `s1/s1Max` trong bản ghi người chơi ([09](events/09-players-chat.md#player-record)) [Chưa rõ, có thể là nội lực] |
| 8 | i32 × 10 | `stats` | 22, 10, 10, 12, 0… | 32, 10, 10, 30, 0… | 10, 20, 10, 11, 0… | Cùng 10 số của `s2c/10` kiểu 2. Bốn ô đầu là Cường Lực, **Thân Pháp**, **Nội Lực**, Thể Lực: `stats[0]` tăng 1 mỗi lần cộng Cường Lực (22 → 32 sau 10 lần ở L1), `stats[1]` tăng 10 → 11 khi cộng Thân Pháp (P1). Thứ tự này khác thứ tự nút của `c2s/10`, xem bảng dưới [Đo] |
| 48 | i32 × 5 | `combat` | 22, 9, 30, 20, 6 | 32, 5, 30, 20, 6 | 13, 10, 40, 60, 7 | Bằng `extra[1..5]` của `s2c/10` kiểu 4. Xem bảng dưới |
| 68 | i32 | `exp` | 176 | 14238 | 88 | Nằm trong `levelExp` ở cả ba mẫu. A2 bằng đúng EXP của `s2c/10` trước trận B1 [Đo] |
| 72 | i32 | `coin` | 0 | 2664 | 0 | **Vàng** (thỏi vàng ăn trong trận), không phải Xu khoá. Bảng Bản thân ngày 31/10 hiện thanh vàng "2664/10000", trong khi Xu khoá là 7.370 (khớp `s2c/46`). Cùng vai trò với `coin` của `s2c/10` kiểu 4, tức vàng thưởng trận ([12-skills-items](events/12-skills-items.md#cẩm-nang-luật-liên-quan-tới-bot)) [Đo] |
| 76 | i32 | `field` | 10000 | 10000 | 10000 | Bằng `extra[0]` của `s2c/10` kiểu 4. Là mốc đổi vàng: Cẩm nang ghi "đủ 10.000 tự đổi thành 10.000 Xu khóa", và bảng Bản thân hiện "2664/10000" [Suy luận mạnh] |
| 80 | i32 | `statPoints` | 6 | 68 | 4 | Điểm tiềm năng còn lại: mỗi cấp +4. 6 + 4 × 18 − 10 điểm đã cộng = 68, đúng số trên bảng Chỉ số (E2); P1 cộng 1 thì `s2c/10` kiểu 8 và bảng cùng hiện 67. `s2c/10` kiểu 8 cho 10 ở cấp 4 (6 + 4) [Đo] |
| 84 | i32 | `skillPoints` | 1 | 19 | 1 | Bằng `fields[0]` của `s2c/10` kiểu 8 (2 ở cấp 4). Bằng cấp − 1 − số điểm đã dùng: hai mẫu của manina đã học Hỏa Cầu Thuật cấp 1 (1 điểm), nick thứ hai chưa học kỹ năng nào; khớp "mỗi cấp 1 điểm kỹ năng" của Cẩm nang. Sau E1 manina còn 16 (Hỏa Cầu Thuật lên cấp 4, [12](events/12-skills-items.md#c2s-1191)) [Đo ba mẫu] |
| 88 | i32 × 2 | `levelExp` | 150, 300 | 13841, 15882 | 50, 150 | Mốc EXP của cấp. Cặp cấp 3 là cặp đầu của bảng mốc trong `s2c/19` [Đo] |
| 96 | string × 2 | `labels` | "780", "125" | "355", "125" | "1662", "1510" | Như `labels` của `s2c/10` kiểu 8 [Chưa rõ] |
| sau đó | 6 byte | `gap` | 0 | 0 | 0 | [Chưa rõ] |
| sau đó | i32, i32 | `x`, `y` | 932, 544 | 2784, 864 | 90, 640 | Trùng x/y của `s2c/11` nhận ngay sau ở hai mẫu đầu [Đo] |
| sau đó | | | | | | `i32 n` (9) rồi danh sách kỹ năng `{i32 mã; i32 cấp; i32; u8}`, bắt đầu bằng 1000 Hỏa Cầu Thuật ([bảng kỹ năng](events/12-skills-items.md#bảng-kỹ-năng)) |
| sau đó | | | | | | 8 ô trang bị: `i32 8; 8 × (u8 0xff: ô trống \| bản ghi vật phẩm)`. Mẫu 30/10 (nhận lại ngày 31/10, E1): ô 0 Nón Âu Lạc (mã 54), ô 2 vũ khí (mã 261), cả hai độ bền 0 ([12-skills-items](events/12-skills-items.md#túi-đồ)) [Đo] |
| sau đó | | | | | | Phần còn lại (khoảng 170 byte, có bảng màu ARGB) chưa đặt tên |

`combat` là các chỉ số chiến đấu:

| Ô | Nhãn trong app | A2 → 30/10 | Căn cứ |
|---:|---|---|---|
| 0 | Tấn công | 22 → 32 | Bằng `stats[0]` (Cường lực) khi không có vũ khí cộng thêm. Tụt 40 → 32 đúng lúc vũ khí hỏng ([10-quests](events/10-quests.md#kết-quả-q3q6-hp-lên-cấp-tiến-độ-các-lỗi-đã-gặp)) [Đo giá trị; nhãn từ chuỗi "Cường lực = Tấn công"] |
| 1 | Phòng thủ | 9 → 5 | Tụt 9 → 5 cùng lúc áo hỏng và HP tối đa tụt. P1: 5 → 9 khi chiếc nón đã sửa (+4 phòng thủ) được tính, khớp P.Thủ trên bảng [Đo] |
| 2, 3, 4 | Chính xác, Né tránh, Chí mạng | 30, 20, 6 | Không đổi từ cấp 3 tới cấp 21. P1: +1 Thân Pháp cho 33, 22, 6, đúng các số Chính Xác, Né Tránh, Chí Mạng trên bảng Chỉ số [Đo] |

Các nhãn lấy từ chuỗi giao diện trong `lib/*/libgdx-flashds.so` của APK 1.0.3 (phần Java của game được biên dịch sang native):
- **Bảng Nhân vật:** "Tấn Công", "P.Thủ", "Chính xác", "Né Tránh", "Chí Mạng", "Sinh lực", "D.Vọng".
- **Hộp cộng điểm:** "Cường Lực", "Thân Pháp", "Nội Lực", "Thể Lực", với gợi ý "Cường lực = Tấn công", "Thân pháp = Phòng thủ, chính xác, né tránh, chí mạng", "Nội lực = Tấn công", "Thể lực = HP".

Thứ tự 4 tiềm năng (P1, [12-skills-items](events/12-skills-items.md#điểm-tiềm-năng)):

| Tiềm năng | Ô trong `stats` (`s2c/9`, `s2c/10` kiểu 2) | Số của `c2s/10` (nút + trên bảng, theo hàng) | Căn cứ |
|---|---:|---:|---|
| Cường Lực | 0 | 0 | L1 [Đo] |
| Thân Pháp | 1 | 2 | P1: `c2s/10 (2, 1)`, rồi `stats[1]` 10 → 11 và bảng hiện Thân Pháp 11 [Đo] |
| Nội Lực | 2 | 1 | Ô còn lại ở cả hai phía [Suy luận mạnh] |
| Thể Lực | 3 | 3 | `stats[3]` = 10 + cấp − 1 ở cả ba mẫu, khớp "tự cộng 1 Thể Lực mỗi cấp" [Suy luận mạnh] |

Nick thứ hai (hệ Thủy) có `stats` = `[10, 20, 10, 11]`, tức Thân Pháp khởi đầu 20, và `combat` có Chính xác 40, Né tránh 60 ở cấp 2, trong khi manina ở cấp 3 có 30, 20. Hộp cộng điểm của manina (hệ Hỏa) ghi dưới Nội Lực "Không cần tăng nội lực".

Chưa kiểm đoạn mã đọc các ô này.

## Map ID — gói 29

Request là một string tên nhân vật. Response mẫu:

```text
00000006 6d616e696e61 00000002 4d31 00000000
string("manina")      string("M1")   int32(0)
```

Đã đọc đủ 20 byte: tên nhân vật, map ID `M1`, một int32 giá trị 0 chưa rõ nghĩa. Map ID này được dùng trong request `11` và `43`.

## Bản đồ/vị trí — gói 11

Request: `string("M1") + byte(-1) + int32(-1)`. Response mẫu dài **11379 byte**:

| Offset mẫu | Kiểu | Nhãn phân tích | Giá trị A2 | Điều biết được |
|---:|---|---|---|---|
| 0 | byte | flag | 1 | Nhánh đã đo |
| 1 | string | mapId | M1 | Trùng map ID ở gói 29 |
| 7 | string | name | Làng Thanh Khê | Khớp tên bản đồ trên UI |
| 27 | byte | area | 5 | Giá trị khu vực trong phiên đã đo |
| 28, 32 | int32, int32 | x, y | 932, 544 | Vai trò toạ độ suy luận từ packet/trạng thái map |
| 36 | int32 | field36 | 0 | Chưa rõ nghĩa |
| 40, 44 | int32, int32 | dimension1, dimension2 | 23, 156 | Hai chiều lưới là suy luận |
| 48 | int32 | độ dài bytearray | 3588 | `23 × 156 = 3588` hỗ trợ suy luận lưới |
| 52 | raw bytes | tile bytes | 3588 byte | Getter đã xác minh bytearray; chưa giải nghĩa mọi giá trị ô |

Prefix kết thúc tại byte 3640; còn **7739 byte chưa giải nghĩa**. Offset thay đổi nếu string thay đổi độ dài. HP, khu vực, toạ độ, số lượng thực thể và độ dài các push là dữ liệu của phiên, không phải hằng của game.

## Chưa xác minh

Chưa xác minh được packet lấy email, số điện thoại, ID account gốc hay tổng tiền. Gói `42` chứa túi đồ ([12-skills-items](events/12-skills-items.md#túi-đồ)); `46` là ba loại tiền: Xu, Xu khoá, Lượng ([04-push](events/04-push.md#s2c-46)). Vàng là `coin` ở trên. `1263` là danh sách người chơi khác trong khu ([09](events/09-players-chat.md#đếm-người-xung-quanh)). Các gói này chưa đủ để gọi là profile account đầy đủ.

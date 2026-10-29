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
| 1 | byte | field01 | 1 | Chưa chốt có phải số nhân vật hay không |
| 2 | string | name | manina | Tên dùng cho các request sau |
| 12 | int32 | numericId | 155 | ID số trong packet; chưa khẳng định ID account/database |
| 16 | string | displayName | manina | Khớp tên trên UI |
| 26, 27 | byte, byte | flag1, flag2 | 1, 0 | Chưa rõ nghĩa |
| 28 | int32 | level | 3 | Khớp cấp trên UI |
| 32 | int32 | hp | 120 | Khớp HP trên UI lúc A2 |
| 36 | int32 | maxHp | 130 | Khớp HP tối đa trên UI |

```text
01 01 000000066d616e696e61 0000009b 000000066d616e696e61
01 00 00000003 00000078 00000082
```

Offset từ 12 trở đi chỉ đúng với độ dài tên trong mẫu. Phải đọc length-prefix của string để tìm field tiếp theo. Getter trace còn đọc được các số/string sau byte 40, nhưng chưa xác minh nghĩa và cấu trúc đầy đủ; **511 byte còn lại chưa được giải nghĩa thành profile**. Không tự gán các số đó thành tiền, kinh nghiệm hay chỉ số nạp.

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

Chưa xác minh được packet lấy email, số điện thoại, ID account gốc, tổng tiền hay mọi chỉ số profile. Gói `42` mới đọc prefix; `46` chứa chuỗi `update Xu` nhưng chưa giải giá trị tiền; `1263` được suy là snapshot người chơi quanh khu vực. Các gói này chưa đủ để gọi là profile account đầy đủ.

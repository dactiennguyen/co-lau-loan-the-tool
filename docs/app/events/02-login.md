# Xác thực đăng nhập

[Mục lục event](README.md). Nhãn mô tả/tên field bên dưới là nhãn phân tích, không phải tên string gốc của giao thức. Nguồn A1/A2/V1 và cách thu được giải thích trong [phương pháp điều tra](../investigation.md).

Challenge của gói 3 khác key XOR của gói -1. Xem [cách xác minh proof/hash/serializer](../investigation.md) trước khi gán vai trò cho các khối byte.

<a id="s2c-0"></a>

## s2c/0

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | server_message |
| Xuất hiện khi | Server gửi hộp thông báo: lúc đăng nhập khi account online nơi khác; trong game là lời nhắc thường (Hương Lão → Cách tính điểm, Chế tạo thiếu nguyên liệu) |
| Sau đó | Lúc đăng nhập: đọc text và dừng phiên đang chờ, không coi là sai mật khẩu. Trong game: client ghi server_message, giao gói cho phiên và chạy tiếp |
| Bố cục payload | i8 flag; string text |
| Độ chắc chắn | Đã nhận trực tiếp từ server thật bằng kết nối kiểm chứng độc lập: flag=-1, thông báo account đang đăng nhập nơi khác. Trong game cũng flag=-1 (J1, G1, O1) |
| Độ dài payload mẫu | 65 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
ff0000003c54c3a069206b686fe1baa36e206869e1bb876e20c491616e6720c491c4836e67206e68e1baad7020e1bb9f206de1bb9974206ec6a169206b68c3a163
```

Nguồn: V1: response trực tiếp từ server trong phiên kiểm chứng độc lập, không phải capture từ APK.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "flag": -1,
    "text": "Tài khoản hiện đang đăng nhập ở một nơi khác"
  },
  "bytesInterpreted": 65,
  "bytesUnknown": 0
}
```

Một text khác cũng đến qua `s2c/0` ở cùng bước: **"Vui lòng chờ 0 giây"**, khi client Node đăng nhập vài giây sau lúc app trên điện thoại vừa bị tắt (Q13). Thử lại sau 10 s thì vào được. Server giữ phiên cũ một lúc ngắn sau khi nó đóng. Với bot TS cũng vậy (R3, 31/10): chạy hai lệnh liền nhau với cùng một nick thì lần sau nhận "Vui lòng chờ 9 giây", rồi "Vui lòng chờ 8 giây". Chờ 12 s giữa hai lần đăng nhập thì không bị chặn. [Đo 3 lần]

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="c2s-2"></a>

## c2s/2

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | login_begin |
| Xuất hiện khi | Người dùng bấm Đăng nhập |
| Sau đó | s2c/2 |
| Bố cục payload | Rỗng |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 0 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
(rỗng)
```

Nguồn: A2: packet gửi của app, thu ở native writer.

Điểm quan sát: Quan sát tại com.mh.sqje.a(sqi), trước khi ghi DataOutputStream. Đọc opcode a, buffer b và độ dài d của sqi.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {},
  "bytesInterpreted": 0,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-2"></a>

## s2c/2

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | login_gate |
| Xuất hiện khi | Trả login_begin |
| Sau đó | String rỗng: c2s/3; khác: nhánh chưa quan sát |
| Bố cục payload | string gate |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 4 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
00000000
```

Nguồn: A2: packet đọc từ native reader, record 81.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "gate": ""
  },
  "bytesInterpreted": 4,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="c2s-3"></a>

## c2s/3

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | challenge_request |
| Xuất hiện khi | Login gate rỗng |
| Sau đó | s2c/3 |
| Bố cục payload | Rỗng |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 0 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
(rỗng)
```

Nguồn: A2: packet gửi của app, thu ở native writer.

Điểm quan sát: Quan sát tại com.mh.sqje.a(sqi), trước khi ghi DataOutputStream. Đọc opcode a, buffer b và độ dài d của sqi.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {},
  "bytesInterpreted": 0,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-3"></a>

## s2c/3

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | password_challenge |
| Xuất hiện khi | Trả challenge_request |
| Sau đó | Tạo proof từ challenge và password; c2s/4 |
| Bố cục payload | bytes challenge (i32 length + raw) |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 8 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
00000004100c0001
```

Nguồn: A2: packet đọc từ native reader, record 85.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "challenge": "100c0001"
  },
  "bytesInterpreted": 8,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="c2s-4"></a>

## c2s/4

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | credentials |
| Xuất hiện khi | Đã có password_challenge |
| Sau đó | Push cấu hình và s2c/4 |
| Bố cục payload | string usernameLower; bytes proof; string platform; string version; i32 serverId; i32 usernameHash |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 69 byte |

**Mẫu minh hoạ giả** probe_user/abc dài 66 byte. Packet credential thật chỉ giữ kích thước 69 byte; không dùng mẫu giả để khẳng định mật khẩu thật.

```text
0000000a70726f62655f7573657200000014030c00011111111111111111111111111170737200000007616e64726f696400000005302e302e3200000018c65b09cb
```

Nguồn: Vector giả đã đối chiếu hàm proof và builder native; không lưu credential thật.

Điểm quan sát: Builder credential com.mh.sqlq.a(String,byte[],byte[]) và các writer của sqi, chặn packet trước hàng đợi mạng. Mẫu giả xác minh byte/thứ tự serialize; không phải một lượt gửi credential giả lên server.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "username": "probe_user",
    "proofBytes": 20,
    "platform": "android",
    "protocolVersion": "0.0.2",
    "serverId": 24,
    "usernameHash": -967112245
  },
  "bytesInterpreted": 66,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-4"></a>

## s2c/4

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | authentication_ack |
| Xuất hiện khi | Server chấp nhận credential trong phiên đã đo |
| Sau đó | Body rỗng: c2s/9; khác: nhánh chưa quan sát |
| Bố cục payload | Rỗng trong nhánh thành công đã đo |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 0 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
(rỗng)
```

Nguồn: A2: packet đọc từ native reader, record 94.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {},
  "bytesInterpreted": 0,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-8"></a>

## s2c/8

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | character_create_options |
| Xuất hiện khi | Trả c2s/9 khi nick chưa có nhân vật (Open Beta 20/11 xoá nhân vật Alpha) |
| Sau đó | Game hiện màn tạo nhân vật; bot dừng với NO_CHARACTER |
| Bố cục payload | Chưa giải; 4.008 byte, có tên lựa chọn ngoại hình ("Khôi Ngô", "Ngố") và bảng màu ARGB |
| Độ chắc chắn | Đo 1 lần (tiheo2, 20/11 12:02) |
| Độ dài payload mẫu | 4.008 byte |

**128 byte đầu sau giải XOR** (đầy đủ chưa lưu):

```text
00000012000000c3b4000000054e67e1bb91000000006400000024ff525252ffbfbfbfffffffffffa8a8a8ffbdc3ffff3a3b59ff262640ff56566cff77778d00000004c490656e0000000f0000006400
```

Ở chỗ của `s2c/9`, server gửi gói này khi tài khoản chưa có nhân vật. Game thật lúc đó mở màn tạo nhân vật (Khuôn Mặt, Kiểu Tóc, Màu Tóc, Màu Da, ô "Nhập tên nhân vật"). Bot TS dừng với mã `NO_CHARACTER` ("Nick chưa có nhân vật: vào game tạo nhân vật trước"), app Rust báo cùng câu đó. Gói tạo nhân vật mà client gửi đi thì chưa bắt được. Xem [APK 1.1.0](../apk-1.1.0.md#đo-thật-sau-open-beta-1202-ngày-2011). [Đo]

<a id="vg1"></a>

## Client vào game: mọi gói gửi lên (VG1)

Đo ngày 20/11/2026 với game bản 1.1.0 trên điện thoại, nick `tiheo2` (nhân vật akaito, M1), máy chủ Thanh Khê `plays1.colauloanthe.vn:1688`. Frida gắn vào tiến trình ngay khi game mở, trước gói đầu tiên; agent `captures/vg1-2026-11-20/agent.js` ghi hàm gửi `com.mh.sqkj.a(sqi)` và hàm đọc `com.mh.sqpq.e()`, kèm đủ byte của mọi gói. Ở `c2s/4`, proof (mật khẩu XOR challenge) được che. Người dùng không bấm gì ngoài đóng thông báo và bấm Đăng nhập. [Đo]

Trong 60 giây đầu, client gửi **33 gói thuộc 15 loại**: 19 heartbeat `c2s/1` (khoảng 2 giây một lần; 18 lần lúc chờ ở màn đăng nhập, lần thứ 19 ở giây 60,4) và 14 gói khác. Thời điểm tính từ gói đầu tiên:

| Lúc (s) | Gói | Byte | Thân gói của game | Bot TS và app gửi |
|---:|---|---:|---|---|
| 0,000 | `c2s/-1` | 0 | rỗng (xin key) | giống |
| 0,035 | `c2s/1206` | 24 | `string "android"; string "0.0.7"; i32 0` | **khác:** `"0.0.2"` |
| 0,584 | `c2s/5` | 9 | `00000018 ffffffff 01`: i32 24 (máy chủ); i32 −1; u8 1 | giống |
| 1,3–33,8 | `c2s/1` ×18 | 0 | heartbeat trong lúc chờ ở màn đăng nhập | bot không chờ ở bước này |
| 34,894 | `c2s/2` | 0 | rỗng (người dùng bấm Đăng nhập) | giống |
| 34,919 | `c2s/3` | 0 | rỗng (xin challenge) | giống |
| 34,944 | `c2s/4` | 65 | `string "tiheo2"; bytes proof (23); string "android"; string "0.0.7"; i32 24; i32 0x4f348aa6` (hash của tên) | **khác:** `"0.0.2"`; các trường khác giống từng byte |
| 35,355 | `c2s/1282` | 3 | `01 00 00`: gỡ lỗi USB bật; chế độ nhà phát triển tắt; 0 dịch vụ trợ năng ([APK 1.1.0](../apk-1.1.0.md#c2s1282-trạng-thái-máy-chống-bot)) | **không gửi** (cố ý) |
| 35,356 | `c2s/1284` | 1 | `00`: lệnh 0, lấy danh sách chặn chat ([09-players-chat](09-players-chat.md#chặn-chat-và-báo-cáo)) | lúc đo chưa gửi; từ 20/11 bot TS và app gửi như game, ngay trước `c2s/9` |
| 35,357 | `c2s/9` | 15 | `string "tiheo2"; u8 2; i32 −1` | giống |
| 35,399 | `c2s/30` | 1 | `01` | giống |
| 35,687 | `c2s/42` | 10 | `string "akaito"` | giống |
| 35,714 | `c2s/29` | 10 | `string "akaito"` | giống |
| 36,096 | `c2s/11` | 11 | `string "M1"; u8 0xff; i32 −1` | giống |
| 37,407 | `c2s/43` | 6 | `string "M1"` | giống |

So với lần bot TS vào game của `tiheo2` lúc 12:10 cùng ngày: thứ tự các gói giống nhau, và 10 loại gói còn lại giống từng byte. Chỉ khác ba chỗ: chuỗi phiên bản trong `c2s/1206` và `c2s/4`, và hai gói `c2s/1282`, `c2s/1284` mà bot lúc đó không gửi. Sau đó bot gửi thêm `c2s/1284`; `c2s/1282` thì cố ý không gửi. Ba gói `c2s/1282`, `c2s/1284`, `c2s/9` đi liền nhau trong 2 ms, ngay khi nhận `s2c/4`. [Đo]

Server trả theo thứ tự: `s2c/-1` → `s2c/1207` → `s2c/1209` → `s2c/5`; sau `c2s/4`: `s2c/1259` → `s2c/1274` (884 byte, chưa giải) → `s2c/1265` → `s2c/1269` → `s2c/1271` → `s2c/1272` → `s2c/4`; rồi `s2c/1284` (trả `c2s/1284`) → `s2c/9` → `s2c/46` → `s2c/39` → `s2c/1195` → `s2c/1220` → `s2c/1279` → `s2c/1284` (lần hai) → `s2c/30` → `s2c/42` → `s2c/29` → `s2c/11` → `s2c/43` → `s2c/1263`, sau đó là các gói đẩy `s2c/1262`, `s2c/1167`, `s2c/1170`, `s2c/1253`, `s2c/1166`, `s2c/1182`, `s2c/1183`. Mọi gói đều có trong catalog. [Đo]

**Server trả hai gói theo phiên bản client khai báo.** Đọc hết byte của các gói trên bằng catalog thì chỉ hai gói không khớp. Cả hai dài hơn bản bot nhận được (bot khai `0.0.2`):

| Gói | Bot (`0.0.2`) | Game (`0.0.7`) |
|---|---|---|
| `s2c/43` quái của map | mỗi quái 14 byte sau tên: `i32 cấp; u8; i32; i32; u8` | thêm 9 byte: `u8; i32; i16 cột; i16 hàng`. Hai số cuối là ô đứng của quái (M1: cột 5–149, hàng 3–21, map 156 × 23 ô). u8 và i32 cùng tăng theo loại quái (Gà Điên 0, 0; Heo Mọi 1, 1; Kẻ Gây Rối 2, 2; Sơn Tặc 3, 3; Chỉ Huy Sơn Tặc 7, 86). 33 quái, đọc hết 1714 byte |
| `s2c/39` nhiệm vụ | mỗi bước: `i32 số thứ tự; string; i32; i32; i32 NPC` | thêm sau mỗi bước `u8 loại; i32 đích; i16 n; n × i32`: loại 1 (nói chuyện) là NPC và n = 1, ví dụ `01 00000066 0001 00000000` (11 byte). Nhiệm vụ 2 có 6 bước nói chuyện: 6 × 11 = 66 byte, đúng bằng 654 − 588 |

Bot khai `0.0.2` vì vậy nhận đúng bố cục cũ mà bộ đọc vẫn đọc. Các gói khác khi khai `0.0.7` ở mục dưới. [Đo]

<a id="v007"></a>

## Khai phiên bản 0.0.7 (bot TS, 20/11)

Đo bằng bot TS với `CLLT_PROTOCOL_VERSION=0.0.7`, nick `tiheo2` (akaito, cấp 2–4, M1), hai lượt cùng ngày: lượt đầu dừng ở hộp thoại Hương Lão, lượt hai làm nhiệm vụ 3 (cộng điểm, kỹ năng, Tiêu diệt Gà Điên, báo cáo) và nhiệm vụ 4 (Tiêu diệt Heo Mọi), thắng 3 trận, nhặt 1 món. 681 gói ở lượt hai, 73 loại, đều đọc hết byte bằng catalog (sau khi sửa các bộ đọc dưới đây). Server nhận phiên bản này và không ngắt kết nối. [Đo]

| Gói | Khác gì so với khi khai `0.0.2` |
|---|---|
| `s2c/43` quái của map | thêm 9 byte mỗi quái sau `d`: `u8 e; i32 f; i16 cột; i16 hàng` ([bảng trên](#vg1)) |
| `s2c/1177` boss | thêm `u8 e; i32 f` sau ô đứng của boss, không có ô thứ hai (Thủ Lĩnh Sơn Tặc 7, 85 ở ô 89, 13) |
| `s2c/39` nhiệm vụ | sau mỗi bước `u8 loại; i32 đích; i16 n; n × i32`. Loại 0 (Đạt cấp độ, Nâng điểm tiềm năng, Sử dụng điểm kỹ năng): `00 ffffffff 0000`, 7 byte. Loại 1 (nói chuyện): NPC, `n` 1. Loại 2 (Tiêu diệt): `02 ffffffff 0001 00000000` |
| Mọi bản ghi vật phẩm | thêm 2 byte (i16, 0 ở mọi mẫu) ngay trước số chỉ số: `s2c/42` và `s2c/1187` (túi), `s2c/1182` và `s2c/1184` (đồ trên đất), trang bị trong `s2c/9`, `s2c/37`, `s2c/51`, thư `s2c/1216`, Pháp sư `s2c/1258`, `s2c/91`, `s2c/93`. Mẫu: Đao Đại Hiệp (246), độ bền 60, hai chỉ số (5: +8, 8: +2) |
| `s2c/1166` trang bị người chơi khác | 30 byte thay vì 28: thêm `u8` (0) và hệ của vũ khí, như hai byte mới của bản ghi người chơi |
| `s2c/1192` Chợ trời | mỗi món thêm `u8 hệ` trước giờ hết hạn ([14-npc](14-npc.md#bố-cục-chợ-trời)) |
| `s2c/1190` cửa hàng NPC | mỗi dòng thêm `i16` sau `field4`, giá trị 1 ở Vũ khí [Xu] ([15-shops](15-shops.md#bản-ghi)) |
| `s2c/1254` bảng xếp hạng | 7 tab; danh sách thêm `n × i64` và `i64` của mình sau hạng của mình ([11-panels](11-panels.md#s2c-1254)) |
| `s2c/1180` tỷ thí | thêm `u8` ở cuối (105); bản ghi quái vẫn như `0.0.2` ([10-quests](10-quests.md#s2c-1180)) |

Không khác (ngoài bản ghi vật phẩm): `s2c/9` (trừ trang bị), `s2c/30`, `s2c/11`, `s2c/1263`, `s2c/37` mặc/cởi đồ (10 ô), `s2c/116` mục Chợ trời, `s2c/1215` hòm thư trống, `s2c/1258` báo giá Pháp sư, hộp thoại Hương Lão (Điểm năng động, nhiệm vụ ngày), các gói trận `s2c/22` (khối quái đọc được: Gà Điên hệ 4 cấp 1, Heo Mọi hệ 2 cấp 7), `s2c/19`, `s2c/20`, `s2c/24`, `s2c/34`, `s2c/35`, `s2c/1191`, `s2c/10`. Gói `s2c/19` cuối trận dài khoảng 2.130 byte vì có bảng EXP từng cấp sau phần thưởng; bảng này có từ trước, không phải của `0.0.7`. [Đo]

**Mặc định khai `0.0.7` (20/11, chưa commit):** bot TS và app Rust khai `0.0.7` như game 1.1.0 (`protocolVersion` trong `src/protocol/config.ts`, `PROTOCOL_VERSION` của `app/core/src/opcodes.rs`). Bộ đọc vẫn đọc được cả hai bố cục (thử `0.0.7` trước, không khớp tới byte cuối thì đọc bố cục cũ), nên các gói đã ghi từ trước vẫn đọc được. Có test bằng gói thật (`test/fixtures-v007.ts`) và vector đối chiếu TS↔Rust. `CLLT_PROTOCOL_VERSION` vẫn ghi đè được (bot TS; app Rust chỉ ở bản debug). `c2s/1282` vẫn cố ý không gửi ([bảng trên](#vg1)).

Chạy thật với mặc định mới (tiheo2, 20/11): bot TS làm nhiệm vụ 4, thắng 4/4 trận, 1.022 gói, đọc hết byte. App Rust (`cllt quest`, 8 phút) thắng 17/17 trận, xong nhiệm vụ 4 và 5, sang nhiệm vụ 6, lên cấp 11, nhặt đồ, tự cộng điểm, không có lỗi đọc gói. [Đo]

**Chưa đo ở `0.0.7`:** Bạch Hổ, thư có vật phẩm (`s2c/1216`; hòm thư đang trống), mua/đăng bán/thu hồi ở Chợ trời (`s2c/112`, `113`, `115`: không có bản ghi vật phẩm), kết quả Pháp sư (`s2c/91`, `93`: tốn tiền), dùng bình trong trận, tab 2–6 của bảng xếp hạng. Nghĩa của `e`, `f`, `field5` và các số mới của `s2c/39` cũng chưa rõ. [Chưa rõ]

# Mở app và bắt tay

[Mục lục event](README.md). Nhãn mô tả/tên field bên dưới là nhãn phân tích, không phải tên string gốc của giao thức. Nguồn A1/A2/V1 và cách thu được giải thích trong [phương pháp điều tra](../investigation.md).

Trước opcode: AndroidLauncher.onCreate() → libGDX MyGame2D.create() → mở socket TCP → nhận seed 4 byte → gửi handshake 21 byte. Xem [khung nhị phân](../protocol.md).

<a id="c2s-minus1"></a>

## c2s/-1

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | key_request |
| Xuất hiện khi | Sau handshake seed 21 byte |
| Sau đó | s2c/-1 |
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

<a id="s2c-minus1"></a>

## s2c/-1

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | key_exchange |
| Xuất hiện khi | Server trả key_request |
| Sau đó | Khôi phục key; reset RX/TX; c2s/1206 |
| Bố cục payload | u8 length=16; maskedKey[16] |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 17 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
104ee8ea2da5376f8bd119db1e881bac04
```

Nguồn: A2: packet đọc từ native reader, record 8.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "keyBytes": 16
  },
  "bytesInterpreted": 17,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="c2s-1206"></a>

## c2s/1206

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | client_info |
| Xuất hiện khi | Đã bật XOR |
| Sau đó | s2c/1207 và s2c/1209 |
| Bố cục payload | string platform; string protocolVersion; i32 field0 |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 24 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
00000007616e64726f696400000005302e302e3200000000
```

Nguồn: A2: packet gửi của app, thu ở native writer.

Điểm quan sát: Quan sát tại com.mh.sqje.a(sqi), trước khi ghi DataOutputStream. Đọc opcode a, buffer b và độ dài d của sqi.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "platform": "android",
    "protocolVersion": "0.0.2",
    "field0": 0
  },
  "bytesInterpreted": 24,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1207"></a>

## s2c/1207

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | server_list |
| Xuất hiện khi | Sau client_info |
| Sau đó | Đợi thêm 1209 rồi c2s/5 |
| Bố cục payload | string serverList |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 42 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000000265468616e68204b68c3aa3a706c61792e636f6c61756c6f616e7468652e766e3a313638383a31
```

Nguồn: A2: packet đọc từ native reader, record 14.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "serverList": "Thanh Khê:play.colauloanthe.vn:1688:1"
  },
  "bytesInterpreted": 42,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1209"></a>

## s2c/1209

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | server_flag |
| Xuất hiện khi | Sau client_info |
| Sau đó | Đợi thêm 1207 rồi c2s/5 |
| Bố cục payload | u8 flag; từ APK 1.1.0 thêm, mỗi phần chỉ khi còn byte: i32 sqj (com.mh.d.sqj); u8 sqh (com.mh.a.sqh); i32 tA, i16 tB, u8 tC (com.mh.t.sqa); u8 z (com.mh.z.sqa) |
| Độ chắc chắn | Đo: 1.0.3 một byte (18); 1.1.0 (20/11) 14 byte 20 00000005 01 000003e8 0014 01 00. Bố cục đọc từ sqpq.aq (native): byte đầu vào static field, 13 byte sau do bốn hàm static a(sqi) đọc; ý nghĩa chưa rõ |
| Độ dài payload mẫu | 1 byte (1.0.3); 14 byte (1.1.0) |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
12
```

Nguồn: A2: packet đọc từ native reader, record 19.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "flag": 18
  },
  "bytesInterpreted": 1,
  "bytesUnknown": 0
}
```

**APK 1.1.0 (đo 20/11, nick tiheo2):** 14 byte `20 00000005 01 000003e8 0014 01 00`. Hàm xử lý `sqpq.aq(sqi)` đọc byte đầu (32) vào một static field, rồi chuyển gói cho bốn hàm static `a(sqi)`. Mỗi hàm chỉ đọc khi gói còn byte, nên gói 1 byte của bản cũ vẫn đọc được:

| Lớp | Đọc | Mẫu |
|---|---|---|
| `com.mh.d.sqj` | i32 (qua `Math.max`) | 5 |
| `com.mh.a.sqh` | u8 | 1 |
| `com.mh.t.sqa` | i32, i16, rồi u8 nếu còn (bool) | 1000, 20, 1 |
| `com.mh.z.sqa` | u8 (bool) | 0 |

Ý nghĩa từng giá trị chưa rõ: các lớp này không dùng chữ nào để đoán. Bot TS đọc đủ 14 byte (`events.ts` `serverFlag`). App Rust chỉ cần biết đã nhận gói. [Đo]

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="c2s-5"></a>

## c2s/5

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | notice_request |
| Xuất hiện khi | Đã nhận danh sách server và flag |
| Sau đó | s2c/5 |
| Bố cục payload | i32 serverId; i32 field=-1; u8 flag=1 |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 9 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
00000018ffffffff01
```

Nguồn: A2: packet gửi của app, thu ở native writer.

Điểm quan sát: Quan sát tại com.mh.sqje.a(sqi), trước khi ghi DataOutputStream. Đọc opcode a, buffer b và độ dài d của sqi.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "serverId": 24,
    "field": -1,
    "flag": 1
  },
  "bytesInterpreted": 9,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-5"></a>

## s2c/5

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | notification |
| Xuất hiện khi | Thông báo boot, hoặc thông báo trong giai đoạn khác |
| Sau đó | Boot: chờ bấm login; nhánh khác: dừng và đọc thông báo |
| Bố cục payload | u8 kind; i32 field0..3; string text |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 54 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
0000000000ffffffff00000000ffffffff000000215468c3b46e672042c3a16f0a43e1bb9d204c6175204c6fe1baa16e205468e1babf
```

Nguồn: A2: packet đọc từ native reader, record 25.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "kind": 0,
    "fields": [
      0,
      -1,
      0,
      -1
    ],
    "text": "Thông Báo\nCờ Lau Loạn Thế"
  },
  "bytesInterpreted": 54,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="c2s-1"></a>

## c2s/1

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | heartbeat_request |
| Xuất hiện khi | Timer khoảng 2 giây tại login |
| Sau đó | s2c/1 |
| Bố cục payload | Rỗng |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 0 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
(rỗng)
```

Nguồn: A1/A2: heartbeat rỗng.

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

<a id="s2c-1"></a>

## s2c/1

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | heartbeat_response |
| Xuất hiện khi | Trả heartbeat |
| Sau đó | Không gửi ACK riêng |
| Bố cục payload | Rỗng |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 0 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
(rỗng)
```

Nguồn: A1/A2: heartbeat rỗng.

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

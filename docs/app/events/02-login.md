# Xác thực đăng nhập

[Mục lục event](README.md). Nhãn mô tả/tên field bên dưới là nhãn phân tích, không phải tên string gốc của giao thức. Nguồn A1/A2/V1 và cách thu được giải thích trong [phương pháp điều tra](../investigation.md).

Challenge của gói 3 khác key XOR của gói -1. Xem [cách xác minh proof/hash/serializer](../investigation.md) trước khi gán vai trò cho các khối byte.

<a id="s2c-0"></a>

## s2c/0

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | server_message |
| Xuất hiện khi | Server gửi thông báo; đã quan sát khi account online nơi khác |
| Sau đó | Đọc text và dừng phiên đang chờ; không coi là sai mật khẩu |
| Bố cục payload | i8 flag; string text |
| Độ chắc chắn | Đã nhận trực tiếp từ server thật bằng kết nối kiểm chứng độc lập: flag=-1, thông báo account đang đăng nhập nơi khác |
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
